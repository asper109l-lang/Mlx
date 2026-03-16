/**
 * Natural language commands
 * Supports prefixes: !, /, . and without prefix (when replying)
 * Commands: бан, мут, кик, варн, снять, ид, инфо
 */
import type { Bot } from "grammy";
import type { BotContext } from "../index.js";
import { requireAdmin, isAdmin } from "../utils/auth.js";
import { db } from "@workspace/db";
import {
  bansTable,
  mutesTable,
  warningsTable,
} from "@workspace/db/schema/bot.js";
import { eq, and } from "drizzle-orm";
import { logAction } from "../utils/logger.js";

const MAX_WARNS = 3;

type TargetUser = {
  id: number;
  name: string;
  username?: string;
};

function parseTarget(ctx: BotContext, text: string): TargetUser | null {
  const reply = ctx.message?.reply_to_message;
  if (reply?.from) {
    const u = reply.from;
    return {
      id: u.id,
      name: [u.first_name, u.last_name].filter(Boolean).join(" "),
      username: u.username,
    };
  }
  const entities = ctx.message?.entities ?? [];
  for (const ent of entities) {
    if (ent.type === "mention") {
      const username = text.slice(ent.offset + 1, ent.offset + ent.length);
      return { id: 0, name: `@${username}`, username };
    }
    if (ent.type === "text_mention" && ent.user) {
      const u = ent.user;
      return {
        id: u.id,
        name: [u.first_name, u.last_name].filter(Boolean).join(" "),
        username: u.username,
      };
    }
  }
  return null;
}

function parseDuration(str: string): number | null {
  const match = str.match(/(\d+)\s*([мhдсmdhw])/i);
  if (!match) return null;
  const n = parseInt(match[1]!);
  const unit = match[2]!.toLowerCase();
  if (unit === "м" || unit === "m") return n * 60;
  if (unit === "ч" || unit === "h") return n * 3600;
  if (unit === "д" || unit === "d") return n * 86400;
  if (unit === "н" || unit === "w") return n * 604800;
  return null;
}

function userDisplay(target: TargetUser): string {
  return target.username
    ? `@${target.username}`
    : target.name;
}

export function registerNaturalHandlers(bot: Bot<BotContext>) {
  // ── !ид / !id — get user ID ──────────────────────────────────
  bot.hears(/^[!/.]?(?:ид|id)(?:\s+@\S+)?$/i, async (ctx) => {
    const reply = ctx.message?.reply_to_message;
    if (reply?.from) {
      const u = reply.from;
      const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
      return ctx.reply(
        `👤 <b>${name}</b>\n🆔 ID: <code>${u.id}</code>${u.username ? `\n🔗 @${u.username}` : ""}`,
        { parse_mode: "HTML" },
      );
    }
    if (ctx.from) {
      const u = ctx.from;
      const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
      return ctx.reply(
        `👤 <b>${name}</b>\n🆔 Ваш ID: <code>${u.id}</code>${u.username ? `\n🔗 @${u.username}` : ""}`,
        { parse_mode: "HTML" },
      );
    }
  });

  bot.command("id", async (ctx) => {
    const reply = ctx.message?.reply_to_message;
    if (reply?.from) {
      const u = reply.from;
      return ctx.reply(`🆔 ID: <code>${u.id}</code>`, { parse_mode: "HTML" });
    }
    return ctx.reply(`🆔 Ваш ID: <code>${ctx.from?.id}</code>`, {
      parse_mode: "HTML",
    });
  });

  // ── !инфо / !info — user info ────────────────────────────────
  bot.hears(/^[!/.]?(?:инфо|info)(?:\s+@\S+)?$/i, async (ctx) => {
    const reply = ctx.message?.reply_to_message;
    const u = reply?.from ?? ctx.from;
    if (!u) return;

    const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
    const chatId = ctx.chat?.id ?? 0;

    const [warns] = await db
      .select()
      .from(warningsTable)
      .where(
        and(eq(warningsTable.userId, u.id), eq(warningsTable.chatId, chatId)),
      )
      .limit(1);

    const [mute] = await db
      .select()
      .from(mutesTable)
      .where(
        and(
          eq(mutesTable.userId, u.id),
          eq(mutesTable.chatId, chatId),
          eq(mutesTable.isActive, true),
        ),
      )
      .limit(1);

    const [ban] = await db
      .select()
      .from(bansTable)
      .where(
        and(
          eq(bansTable.userId, u.id),
          eq(bansTable.chatId, chatId),
          eq(bansTable.isActive, true),
        ),
      )
      .limit(1);

    const lines = [
      `👤 <b>Профиль пользователя</b>`,
      ``,
      `Имя: <b>${name}</b>`,
      `ID: <code>${u.id}</code>`,
      u.username ? `Username: @${u.username}` : null,
      u.is_bot ? `Тип: 🤖 Бот` : null,
      ``,
      `⚠️ Предупреждений: ${warns?.count ?? 0} / ${MAX_WARNS}`,
      mute ? `🔇 Мут: до ${mute.expiresAt ? new Date(mute.expiresAt).toLocaleString("ru") : "бессрочно"}` : null,
      ban ? `🔨 Бан: активен` : null,
    ].filter(Boolean);

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command("info", async (ctx) => {
    const reply = ctx.message?.reply_to_message;
    const u = reply?.from ?? ctx.from;
    if (!u) return;
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
    await ctx.reply(
      `👤 <b>${name}</b>\n🆔 <code>${u.id}</code>${u.username ? `\n@${u.username}` : ""}`,
      { parse_mode: "HTML" },
    );
  });

  // ── Natural ban ──────────────────────────────────────────────
  // Works as: "бан [причина]" (reply) OR "!бан @user [причина]"
  bot.hears(/^[!/.]?бан(?:\s+([\s\S]*))?$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;

    const text = ctx.message?.text ?? "";
    const target = parseTarget(ctx, text);
    if (!target)
      return ctx.reply("Ответьте на сообщение пользователя или укажите @упоминание.");
    if (target.id === 0)
      return ctx.reply("⚠️ Не удалось получить ID. Используйте реплай.");

    const rawArgs = String(ctx.match[1] ?? "").replace(/@\S+/, "").trim();
    const reason = rawArgs || "Нарушение правил";

    try {
      await ctx.api.banChatMember(ctx.chat.id, target.id);
    } catch (e: any) {
      return ctx.reply(`❌ Не удалось забанить: ${e.message}`);
    }

    await db
      .insert(bansTable)
      .values({
        chatId: ctx.chat.id,
        userId: target.id,
        username: target.username,
        fullName: target.name,
        reason,
        bannedBy: ctx.from?.id ?? 0,
        isActive: true,
      })
      .onConflictDoNothing();

    await ctx.reply(
      `🔨 <b>${userDisplay(target)}</b> забанен.\n📝 Причина: ${reason}`,
      { parse_mode: "HTML" },
    );
    await logAction(ctx.chat.id, ctx.from?.id ?? 0, "ban", {
      target_id: target.id,
      reason,
    });
  });

  // ── Natural mute ─────────────────────────────────────────────
  // "мут [10м] [причина]" (reply) OR "!мут @user 10м [причина]"
  bot.hears(/^[!/.]?мут(?:\s+([\s\S]*))?$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;

    const text = ctx.message?.text ?? "";
    const target = parseTarget(ctx, text);
    if (!target)
      return ctx.reply("Ответьте на сообщение пользователя.");
    if (target.id === 0)
      return ctx.reply("⚠️ Не удалось получить ID. Используйте реплай.");

    let rawArgs = String(ctx.match[1] ?? "").replace(/@\S+/, "").trim();
    const durSec = parseDuration(rawArgs) ?? 600;
    const reason = rawArgs.replace(/\d+\s*[мhдсmdhw]/i, "").trim() || "Нарушение правил";
    const until = Math.floor(Date.now() / 1000) + durSec;

    try {
      await ctx.api.restrictChatMember(
        ctx.chat.id,
        target.id,
        {
          can_send_messages: false,
          can_send_audios: false,
          can_send_documents: false,
          can_send_photos: false,
          can_send_videos: false,
          can_send_video_notes: false,
          can_send_voice_notes: false,
          can_send_polls: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false,
          can_change_info: false,
          can_invite_users: false,
          can_pin_messages: false,
        },
        until,
      );
    } catch (e: any) {
      return ctx.reply(`❌ Не удалось замутить: ${e.message}`);
    }

    const expiresAt = new Date(Date.now() + durSec * 1000);
    await db
      .insert(mutesTable)
      .values({
        chatId: ctx.chat.id,
        userId: target.id,
        username: target.username,
        fullName: target.name,
        reason,
        mutedBy: ctx.from?.id ?? 0,
        expiresAt,
        isActive: true,
      })
      .onConflictDoNothing();

    const durText =
      durSec < 3600
        ? `${Math.round(durSec / 60)} мин`
        : durSec < 86400
          ? `${Math.round(durSec / 3600)} ч`
          : `${Math.round(durSec / 86400)} д`;

    await ctx.reply(
      `🔇 <b>${userDisplay(target)}</b> замучен на ${durText}.\n📝 Причина: ${reason}`,
      { parse_mode: "HTML" },
    );
    await logAction(ctx.chat.id, ctx.from?.id ?? 0, "mute", {
      target_id: target.id,
      duration: durSec,
      reason,
    });
  });

  // ── Natural unmute ───────────────────────────────────────────
  bot.hears(/^[!/.]?(?:анмут|размут|unmute)(?:\s+@\S+)?$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;

    const text = ctx.message?.text ?? "";
    const target = parseTarget(ctx, text);
    if (!target || target.id === 0)
      return ctx.reply("Укажите пользователя реплаем.");

    try {
      await ctx.api.restrictChatMember(ctx.chat.id, target.id, {
        can_send_messages: true,
        can_send_audios: true,
        can_send_documents: true,
        can_send_photos: true,
        can_send_videos: true,
        can_send_video_notes: true,
        can_send_voice_notes: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
      });
    } catch {}

    await db
      .update(mutesTable)
      .set({ isActive: false })
      .where(
        and(
          eq(mutesTable.chatId, ctx.chat.id),
          eq(mutesTable.userId, target.id),
        ),
      );

    await ctx.reply(
      `🔊 <b>${userDisplay(target)}</b> размучен.`,
      { parse_mode: "HTML" },
    );
  });

  // ── Natural kick ─────────────────────────────────────────────
  bot.hears(/^[!/.]?кик(?:\s+([\s\S]*))?$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;

    const text = ctx.message?.text ?? "";
    const target = parseTarget(ctx, text);
    if (!target || target.id === 0)
      return ctx.reply("Укажите пользователя реплаем.");

    const rawArgs = String(ctx.match[1] ?? "").replace(/@\S+/, "").trim();
    const reason = rawArgs || "Нарушение правил";

    try {
      await ctx.api.banChatMember(ctx.chat.id, target.id);
      await ctx.api.unbanChatMember(ctx.chat.id, target.id);
    } catch (e: any) {
      return ctx.reply(`❌ Не удалось кикнуть: ${e.message}`);
    }

    await ctx.reply(
      `👢 <b>${userDisplay(target)}</b> выгнан из чата.\n📝 Причина: ${reason}`,
      { parse_mode: "HTML" },
    );
    await logAction(ctx.chat.id, ctx.from?.id ?? 0, "kick", {
      target_id: target.id,
      reason,
    });
  });

  // ── Natural warn ─────────────────────────────────────────────
  bot.hears(/^[!/.]?варн(?:\s+([\s\S]*))?$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;

    const text = ctx.message?.text ?? "";
    const target = parseTarget(ctx, text);
    if (!target || target.id === 0)
      return ctx.reply("Укажите пользователя реплаем.");

    const rawArgs = String(ctx.match[1] ?? "").replace(/@\S+/, "").trim();
    const reason = rawArgs || "Нарушение правил";

    const [existing] = await db
      .select()
      .from(warningsTable)
      .where(
        and(
          eq(warningsTable.userId, target.id),
          eq(warningsTable.chatId, ctx.chat.id),
        ),
      )
      .limit(1);

    const newCount = (existing?.count ?? 0) + 1;

    if (existing) {
      await db
        .update(warningsTable)
        .set({ count: newCount, reason, updatedAt: new Date() })
        .where(eq(warningsTable.id, existing.id));
    } else {
      await db.insert(warningsTable).values({
        chatId: ctx.chat.id,
        userId: target.id,
        username: target.username,
        fullName: target.name,
        count: 1,
        reason,
        warnedBy: ctx.from?.id ?? 0,
      });
    }

    if (newCount >= MAX_WARNS) {
      try {
        await ctx.api.banChatMember(ctx.chat.id, target.id);
        await db
          .insert(bansTable)
          .values({
            chatId: ctx.chat.id,
            userId: target.id,
            username: target.username,
            fullName: target.name,
            reason: "Авто-бан: превышено количество предупреждений",
            bannedBy: ctx.from?.id ?? 0,
            isActive: true,
          })
          .onConflictDoNothing();
      } catch {}
      return ctx.reply(
        `⚠️ <b>${userDisplay(target)}</b> получил предупреждение ${newCount}/${MAX_WARNS}.\n🔨 Автобан: превышен лимит предупреждений.`,
        { parse_mode: "HTML" },
      );
    }

    await ctx.reply(
      `⚠️ <b>${userDisplay(target)}</b> получил предупреждение ${newCount}/${MAX_WARNS}.\n📝 Причина: ${reason}`,
      { parse_mode: "HTML" },
    );
  });

  // ── Natural unban ────────────────────────────────────────────
  bot.hears(/^[!/.]?(?:разбан|unban)(?:\s+@\S+)?$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;

    const text = ctx.message?.text ?? "";
    const target = parseTarget(ctx, text);
    if (!target || target.id === 0)
      return ctx.reply("Укажите пользователя реплаем.");

    try {
      await ctx.api.unbanChatMember(ctx.chat.id, target.id);
    } catch {}

    await db
      .update(bansTable)
      .set({ isActive: false })
      .where(
        and(
          eq(bansTable.chatId, ctx.chat.id),
          eq(bansTable.userId, target.id),
        ),
      );

    await ctx.reply(
      `✅ <b>${userDisplay(target)}</b> разбанен.`,
      { parse_mode: "HTML" },
    );
  });

  // ── созвать модеров ──────────────────────────────────────────
  bot.hears(/^[!/.]?(?:созвать\s+модеров|позвать\s+админов|созвать\s+админов|позвать\s+модеров)$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await isAdmin(ctx))) return;

    try {
      const admins = await ctx.getChatAdministrators();
      const mentions = admins
        .filter((a) => !a.user.is_bot && a.user.username)
        .slice(0, 20)
        .map((a) => `@${a.user.username}`)
        .join(" ");
      if (!mentions) return ctx.reply("Нет администраторов с username.");
      await ctx.reply(`📢 Созыв модерации:\n${mentions}`);
    } catch (e: any) {
      await ctx.reply(`❌ Ошибка: ${e.message}`);
    }
  });
}
