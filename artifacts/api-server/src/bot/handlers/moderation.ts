import type { Bot, Context } from "grammy";
import { db } from "@workspace/db";
import { warningsTable, mutesTable, bansTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { requireAdmin } from "../utils/auth.js";
import { logAction } from "../utils/logger.js";

// ──────────────── УТИЛИТЫ ────────────────

function parseDuration(str: string): number | null {
  const match = str.match(/^(\d+)(m|h|d)$/i);
  if (!match) return null;
  const num = parseInt(match[1]!);
  const unit = match[2]!.toLowerCase();
  if (unit === "m") return num * 60;
  if (unit === "h") return num * 3600;
  if (unit === "d") return num * 86400;
  return null;
}

function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} мин.`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} ч.`;
  return `${Math.round(seconds / 86400)} дн.`;
}

async function resolveTarget(ctx: Context): Promise<{ userId: number; name: string } | null> {
  const replied = ctx.message?.reply_to_message;
  if (replied?.from) {
    const user = replied.from;
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
    return { userId: user.id, name };
  }
  const arg = String(ctx.match ?? "").trim().split(" ")[0];
  const id = Number(arg);
  if (arg && !isNaN(id)) {
    return { userId: id, name: `User ${id}` };
  }
  return null;
}

function getGroupOnly(ctx: Context): boolean {
  if (ctx.chat?.type === "private") {
    ctx.reply(
      "Эта команда работает только в группах и супергруппах.\n\n" +
        "Для применения к конкретному чату используйте:\n" +
        "<code>/ban <chat_id> <user_id> [причина]</code>",
      { parse_mode: "HTML" }
    );
    return false;
  }
  return true;
}

const MAX_WARNS = 3;

// ──────────────── БАН ────────────────

export function registerModerationHandlers(bot: Bot<Context>) {
  // /ban — ответ на сообщение или /ban <chat_id> <user_id> [причина]
  bot.command("ban", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    let chatId: number;
    let userId: number;
    let name: string;
    let reason: string;

    const isGroup = ctx.chat.type !== "private";

    if (isGroup) {
      const target = await resolveTarget(ctx);
      if (!target) {
        await ctx.reply(
          "Ответьте на сообщение пользователя или укажите:\n<code>/ban <user_id> [причина]</code>",
          { parse_mode: "HTML" }
        );
        return;
      }
      chatId = ctx.chat.id;
      userId = target.userId;
      name = target.name;
      const args = (ctx.match ?? "").trim().split(" ");
      const firstIsId = !isNaN(Number(args[0]));
      reason = (firstIsId ? args.slice(1) : args).join(" ") || "Без причины";
    } else {
      // ЛС: /ban <chat_id> <user_id> [причина]
      const args = (ctx.match ?? "").trim().split(" ");
      chatId = Number(args[0]);
      userId = Number(args[1]);
      reason = args.slice(2).join(" ") || "Без причины";
      name = `User ${userId}`;
      if (!chatId || !userId || isNaN(chatId) || isNaN(userId)) {
        await ctx.reply(
          "Использование:\n<code>/ban &lt;chat_id&gt; &lt;user_id&gt; [причина]</code>",
          { parse_mode: "HTML" }
        );
        return;
      }
    }

    try {
      await ctx.api.banChatMember(chatId, userId);
      await db.insert(bansTable).values({
        chatId,
        userId,
        reason,
        bannedBy: ctx.from!.id,
        isActive: true,
      });
      await ctx.reply(
        `🚫 <b>Пользователь заблокирован</b>\n\n` +
          `👤 ${name} (<code>${userId}</code>)\n` +
          `📝 Причина: ${reason}`,
        { parse_mode: "HTML" }
      );
      await logAction({
        action: "ban",
        performedBy: ctx.from!.id,
        targetChat: chatId,
        details: `Banned ${userId} in ${chatId}: ${reason}`,
      });
    } catch (e: any) {
      await ctx.reply(`Ошибка: ${e.message}`);
    }
  });

  // /unban
  bot.command("unban", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    let chatId: number;
    let userId: number;

    const isGroup = ctx.chat.type !== "private";
    if (isGroup) {
      const target = await resolveTarget(ctx);
      if (!target) {
        await ctx.reply(
          "Ответьте на сообщение или укажите:\n<code>/unban <user_id></code>",
          { parse_mode: "HTML" }
        );
        return;
      }
      chatId = ctx.chat.id;
      userId = target.userId;
    } else {
      const args = (ctx.match ?? "").trim().split(" ");
      chatId = Number(args[0]);
      userId = Number(args[1]);
      if (!chatId || !userId || isNaN(chatId) || isNaN(userId)) {
        await ctx.reply(
          "Использование:\n<code>/unban &lt;chat_id&gt; &lt;user_id&gt;</code>",
          { parse_mode: "HTML" }
        );
        return;
      }
    }

    try {
      await ctx.api.unbanChatMember(chatId, userId);
      await db
        .update(bansTable)
        .set({ isActive: false })
        .where(and(eq(bansTable.chatId, chatId), eq(bansTable.userId, userId)));
      await ctx.reply(`✅ Пользователь <code>${userId}</code> разблокирован.`, {
        parse_mode: "HTML",
      });
      await logAction({
        action: "unban",
        performedBy: ctx.from!.id,
        targetChat: chatId,
        details: `Unbanned ${userId} in ${chatId}`,
      });
    } catch (e: any) {
      await ctx.reply(`Ошибка: ${e.message}`);
    }
  });

  // /kick
  bot.command("kick", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    if (!getGroupOnly(ctx)) return;

    const target = await resolveTarget(ctx);
    if (!target) {
      await ctx.reply(
        "Ответьте на сообщение или укажите:\n<code>/kick <user_id> [причина]</code>",
        { parse_mode: "HTML" }
      );
      return;
    }

    const args = (ctx.match ?? "").trim().split(" ");
    const firstIsId = !isNaN(Number(args[0]));
    const reason = (firstIsId ? args.slice(1) : args).join(" ") || "Без причины";

    try {
      await ctx.api.banChatMember(ctx.chat.id, target.userId);
      await ctx.api.unbanChatMember(ctx.chat.id, target.userId);
      await ctx.reply(
        `👢 <b>Пользователь исключён</b>\n\n` +
          `👤 ${target.name} (<code>${target.userId}</code>)\n` +
          `📝 Причина: ${reason}`,
        { parse_mode: "HTML" }
      );
      await logAction({
        action: "kick",
        performedBy: ctx.from!.id,
        targetChat: ctx.chat.id,
        details: `Kicked ${target.userId}: ${reason}`,
      });
    } catch (e: any) {
      await ctx.reply(`Ошибка: ${e.message}`);
    }
  });

  // ──────────────── МУТ ────────────────

  bot.command("mute", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    let chatId: number;
    let userId: number;
    let name: string;
    let durationSec: number | null = null;
    let reason: string;

    const isGroup = ctx.chat.type !== "private";
    const args = (ctx.match ?? "").trim().split(" ");

    if (isGroup) {
      const target = await resolveTarget(ctx);
      if (!target) {
        await ctx.reply(
          "Ответьте на сообщение или укажите:\n<code>/mute [время] [причина]</code>\n\nВремя: <code>10m</code>, <code>2h</code>, <code>1d</code>",
          { parse_mode: "HTML" }
        );
        return;
      }
      chatId = ctx.chat.id;
      userId = target.userId;
      name = target.name;
      const firstIsId = !isNaN(Number(args[0]));
      const remaining = firstIsId ? args.slice(1) : args;
      if (remaining[0]) {
        durationSec = parseDuration(remaining[0]);
        reason = (durationSec !== null ? remaining.slice(1) : remaining).join(" ") || "Без причины";
      } else {
        reason = "Без причины";
      }
    } else {
      chatId = Number(args[0]);
      userId = Number(args[1]);
      name = `User ${userId}`;
      if (!chatId || !userId || isNaN(chatId) || isNaN(userId)) {
        await ctx.reply(
          "Использование:\n<code>/mute &lt;chat_id&gt; &lt;user_id&gt; [время] [причина]</code>",
          { parse_mode: "HTML" }
        );
        return;
      }
      const remaining = args.slice(2);
      if (remaining[0]) {
        durationSec = parseDuration(remaining[0]);
        reason = (durationSec !== null ? remaining.slice(1) : remaining).join(" ") || "Без причины";
      } else {
        reason = "Без причины";
      }
    }

    const mutedUntil = durationSec ? new Date(Date.now() + durationSec * 1000) : null;

    try {
      await ctx.api.restrictChatMember(
        chatId,
        userId,
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
        },
        { until_date: mutedUntil ? Math.floor(mutedUntil.getTime() / 1000) : undefined }
      );

      await db.insert(mutesTable).values({
        chatId,
        userId,
        reason,
        mutedUntil,
        isActive: true,
        mutedBy: ctx.from!.id,
      });

      const durationText = durationSec ? ` на ${formatDuration(durationSec)}` : " навсегда";
      await ctx.reply(
        `🔇 <b>Пользователь замучен${durationText}</b>\n\n` +
          `👤 ${name} (<code>${userId}</code>)\n` +
          `📝 Причина: ${reason}` +
          (mutedUntil ? `\n⏰ До: ${mutedUntil.toLocaleString("ru-RU")}` : ""),
        { parse_mode: "HTML" }
      );
      await logAction({
        action: "mute",
        performedBy: ctx.from!.id,
        targetChat: chatId,
        details: `Muted ${userId} in ${chatId}${durationSec ? ` for ${durationSec}s` : ""}: ${reason}`,
      });
    } catch (e: any) {
      await ctx.reply(`Ошибка: ${e.message}`);
    }
  });

  bot.command("unmute", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    let chatId: number;
    let userId: number;

    const isGroup = ctx.chat.type !== "private";
    if (isGroup) {
      const target = await resolveTarget(ctx);
      if (!target) {
        await ctx.reply(
          "Ответьте на сообщение или укажите:\n<code>/unmute <user_id></code>",
          { parse_mode: "HTML" }
        );
        return;
      }
      chatId = ctx.chat.id;
      userId = target.userId;
    } else {
      const args = (ctx.match ?? "").trim().split(" ");
      chatId = Number(args[0]);
      userId = Number(args[1]);
      if (!chatId || !userId || isNaN(chatId) || isNaN(userId)) {
        await ctx.reply(
          "Использование:\n<code>/unmute &lt;chat_id&gt; &lt;user_id&gt;</code>",
          { parse_mode: "HTML" }
        );
        return;
      }
    }

    try {
      await ctx.api.restrictChatMember(chatId, userId, {
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
      await db
        .update(mutesTable)
        .set({ isActive: false })
        .where(and(eq(mutesTable.chatId, chatId), eq(mutesTable.userId, userId)));
      await ctx.reply(`🔊 Пользователь <code>${userId}</code> размучен.`, {
        parse_mode: "HTML",
      });
      await logAction({
        action: "unmute",
        performedBy: ctx.from!.id,
        targetChat: chatId,
        details: `Unmuted ${userId} in ${chatId}`,
      });
    } catch (e: any) {
      await ctx.reply(`Ошибка: ${e.message}`);
    }
  });

  // ──────────────── ВАРНЫ ────────────────

  bot.command("warn", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    let chatId: number;
    let userId: number;
    let name: string;
    let reason: string;

    const isGroup = ctx.chat.type !== "private";
    const args = (ctx.match ?? "").trim().split(" ");

    if (isGroup) {
      const target = await resolveTarget(ctx);
      if (!target) {
        await ctx.reply(
          "Ответьте на сообщение или укажите:\n<code>/warn <user_id> [причина]</code>",
          { parse_mode: "HTML" }
        );
        return;
      }
      chatId = ctx.chat.id;
      userId = target.userId;
      name = target.name;
      const firstIsId = !isNaN(Number(args[0]));
      reason = (firstIsId ? args.slice(1) : args).join(" ") || "Без причины";
    } else {
      chatId = Number(args[0]);
      userId = Number(args[1]);
      reason = args.slice(2).join(" ") || "Без причины";
      name = `User ${userId}`;
      if (!chatId || !userId || isNaN(chatId) || isNaN(userId)) {
        await ctx.reply(
          "Использование:\n<code>/warn &lt;chat_id&gt; &lt;user_id&gt; [причина]</code>",
          { parse_mode: "HTML" }
        );
        return;
      }
    }

    await db.insert(warningsTable).values({
      chatId,
      userId,
      reason,
      issuedBy: ctx.from!.id,
      isActive: true,
    });

    const [{ value: warnCount }] = await db
      .select({ value: count() })
      .from(warningsTable)
      .where(
        and(
          eq(warningsTable.chatId, chatId),
          eq(warningsTable.userId, userId),
          eq(warningsTable.isActive, true)
        )
      );

    const current = Number(warnCount);

    if (current >= MAX_WARNS) {
      // Автобан
      try {
        await ctx.api.banChatMember(chatId, userId);
        await db.insert(bansTable).values({
          chatId,
          userId,
          reason: `Автобан: ${MAX_WARNS} предупреждения`,
          bannedBy: ctx.from!.id,
          isActive: true,
        });
        await ctx.reply(
          `⚠️ <b>${name}</b> получил ${current}/${MAX_WARNS} предупреждений и был <b>автоматически заблокирован</b>!\n` +
            `📝 Причина последнего: ${reason}`,
          { parse_mode: "HTML" }
        );
      } catch {
        await ctx.reply(
          `⚠️ <b>${name}</b> получил ${current}/${MAX_WARNS} предупреждений! (Автобан не применился — нет прав)`,
          { parse_mode: "HTML" }
        );
      }
    } else {
      await ctx.reply(
        `⚠️ <b>Предупреждение выдано</b>\n\n` +
          `👤 ${name} (<code>${userId}</code>)\n` +
          `📝 Причина: ${reason}\n` +
          `🔢 Варны: ${current}/${MAX_WARNS}`,
        { parse_mode: "HTML" }
      );
    }

    await logAction({
      action: "warn",
      performedBy: ctx.from!.id,
      targetChat: chatId,
      details: `Warned ${userId} in ${chatId} (${current}/${MAX_WARNS}): ${reason}`,
    });
  });

  bot.command("unwarn", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    let chatId: number;
    let userId: number;

    const isGroup = ctx.chat.type !== "private";
    if (isGroup) {
      const target = await resolveTarget(ctx);
      if (!target) {
        await ctx.reply(
          "Ответьте на сообщение или укажите:\n<code>/unwarn <user_id></code>",
          { parse_mode: "HTML" }
        );
        return;
      }
      chatId = ctx.chat.id;
      userId = target.userId;
    } else {
      const args = (ctx.match ?? "").trim().split(" ");
      chatId = Number(args[0]);
      userId = Number(args[1]);
      if (!chatId || !userId || isNaN(chatId) || isNaN(userId)) {
        await ctx.reply(
          "Использование:\n<code>/unwarn &lt;chat_id&gt; &lt;user_id&gt;</code>",
          { parse_mode: "HTML" }
        );
        return;
      }
    }

    // Снять последний активный варн
    const warns = await db
      .select()
      .from(warningsTable)
      .where(
        and(
          eq(warningsTable.chatId, chatId),
          eq(warningsTable.userId, userId),
          eq(warningsTable.isActive, true)
        )
      );

    if (warns.length === 0) {
      await ctx.reply("У пользователя нет активных предупреждений.");
      return;
    }

    const last = warns[warns.length - 1]!;
    await db
      .update(warningsTable)
      .set({ isActive: false })
      .where(eq(warningsTable.id, last.id));

    await ctx.reply(
      `✅ Последнее предупреждение снято.\nОсталось: ${warns.length - 1}/${MAX_WARNS}`,
      { parse_mode: "HTML" }
    );
    await logAction({
      action: "unwarn",
      performedBy: ctx.from!.id,
      targetChat: chatId,
      details: `Unwarned ${userId} in ${chatId}`,
    });
  });

  bot.command("warns", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    let chatId: number;
    let userId: number;

    const isGroup = ctx.chat.type !== "private";
    if (isGroup) {
      const target = await resolveTarget(ctx);
      if (!target) {
        await ctx.reply(
          "Ответьте на сообщение или укажите:\n<code>/warns <user_id></code>",
          { parse_mode: "HTML" }
        );
        return;
      }
      chatId = ctx.chat.id;
      userId = target.userId;
    } else {
      const args = (ctx.match ?? "").trim().split(" ");
      chatId = Number(args[0]);
      userId = Number(args[1]);
      if (!chatId || !userId || isNaN(chatId) || isNaN(userId)) {
        await ctx.reply(
          "Использование:\n<code>/warns &lt;chat_id&gt; &lt;user_id&gt;</code>",
          { parse_mode: "HTML" }
        );
        return;
      }
    }

    const warns = await db
      .select()
      .from(warningsTable)
      .where(
        and(
          eq(warningsTable.chatId, chatId),
          eq(warningsTable.userId, userId),
          eq(warningsTable.isActive, true)
        )
      );

    if (warns.length === 0) {
      await ctx.reply(`Пользователь <code>${userId}</code> не имеет предупреждений.`, {
        parse_mode: "HTML",
      });
      return;
    }

    let text = `<b>Предупреждения пользователя <code>${userId}</code>:</b>\n`;
    text += `Всего: ${warns.length}/${MAX_WARNS}\n\n`;
    warns.forEach((w, i) => {
      const date = new Date(w.createdAt).toLocaleString("ru-RU");
      text += `${i + 1}. ${date} — ${w.reason ?? "Без причины"}\n`;
    });
    await ctx.reply(text, { parse_mode: "HTML" });
  });

  bot.command("clearwarns", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    let chatId: number;
    let userId: number;

    const isGroup = ctx.chat.type !== "private";
    if (isGroup) {
      const target = await resolveTarget(ctx);
      if (!target) {
        await ctx.reply(
          "Ответьте на сообщение или укажите:\n<code>/clearwarns <user_id></code>",
          { parse_mode: "HTML" }
        );
        return;
      }
      chatId = ctx.chat.id;
      userId = target.userId;
    } else {
      const args = (ctx.match ?? "").trim().split(" ");
      chatId = Number(args[0]);
      userId = Number(args[1]);
      if (!chatId || !userId || isNaN(chatId) || isNaN(userId)) {
        await ctx.reply(
          "Использование:\n<code>/clearwarns &lt;chat_id&gt; &lt;user_id&gt;</code>",
          { parse_mode: "HTML" }
        );
        return;
      }
    }

    await db
      .update(warningsTable)
      .set({ isActive: false })
      .where(
        and(
          eq(warningsTable.chatId, chatId),
          eq(warningsTable.userId, userId),
          eq(warningsTable.isActive, true)
        )
      );

    await ctx.reply(
      `✅ Все предупреждения пользователя <code>${userId}</code> сброшены.`,
      { parse_mode: "HTML" }
    );
    await logAction({
      action: "clearwarns",
      performedBy: ctx.from!.id,
      targetChat: chatId,
      details: `Cleared warns of ${userId} in ${chatId}`,
    });
  });

  // ──────────────── Авто-снятие мута по таймеру ────────────────
  setInterval(async () => {
    try {
      const { lte } = await import("drizzle-orm");
      const now = new Date();
      const expired = await db
        .select()
        .from(mutesTable)
        .where(and(eq(mutesTable.isActive, true), lte(mutesTable.mutedUntil, now)));

      for (const mute of expired) {
        try {
          await bot.api.restrictChatMember(mute.chatId, mute.userId, {
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
          await db
            .update(mutesTable)
            .set({ isActive: false })
            .where(eq(mutesTable.id, mute.id));
          console.log(`[Mute] Auto-unmuted ${mute.userId} in ${mute.chatId}`);
        } catch {
          // chat may be unavailable
        }
      }
    } catch (e) {
      console.error("[Mute] Auto-unmute error:", e);
    }
  }, 60_000);
}
