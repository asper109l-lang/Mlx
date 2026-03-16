import type { Bot } from "grammy";
import type { BotContext } from "../index.js";
import { requireAdmin, isAdmin } from "../utils/auth.js";
import { db } from "@workspace/db";
import { chatModeratorsTable } from "@workspace/db/schema/bot.js";
import { eq, and } from "drizzle-orm";

const RANK_NAMES: Record<number, string> = {
  1: "Младший модератор",
  2: "Старший модератор",
  3: "Младший администратор",
  4: "Старший администратор",
  5: "Создатель",
};

async function getTargetFromCtx(
  ctx: BotContext,
): Promise<{ id: number; name: string; username?: string } | null> {
  const reply = ctx.message?.reply_to_message;
  if (reply?.from) {
    const u = reply.from;
    return {
      id: u.id,
      name: [u.first_name, u.last_name].filter(Boolean).join(" "),
      username: u.username,
    };
  }
  // Try to find mention entity
  const entities = ctx.message?.entities ?? [];
  const text = ctx.message?.text ?? "";
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

export function registerModRanksHandlers(bot: Bot<BotContext>) {
  // +модер [@user] [rank]
  const addModHandler = async (ctx: BotContext, rank: number) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;

    const target = await getTargetFromCtx(ctx);
    if (!target) {
      return ctx.reply(
        "Укажите пользователя: ответьте на его сообщение или используйте @упоминание.",
      );
    }

    if (target.id === 0) {
      return ctx.reply(
        "⚠️ Не удалось получить ID пользователя. Ответьте реплаем на его сообщение.",
      );
    }

    await db
      .insert(chatModeratorsTable)
      .values({
        chatId: ctx.chat.id,
        userId: target.id,
        rank,
        username: target.username,
        fullName: target.name,
        assignedBy: ctx.from?.id ?? 0,
        isActive: true,
      })
      .onConflictDoNothing();

    // Update if already exists
    await db
      .update(chatModeratorsTable)
      .set({
        rank,
        username: target.username,
        fullName: target.name,
        assignedBy: ctx.from?.id ?? 0,
        isActive: true,
      })
      .where(
        and(
          eq(chatModeratorsTable.chatId, ctx.chat.id),
          eq(chatModeratorsTable.userId, target.id),
        ),
      );

    await ctx.reply(
      `✅ <b>${target.name}</b> назначен <b>${RANK_NAMES[rank]}</b> (ранг ${rank}) в этом чате.`,
      { parse_mode: "HTML" },
    );
  };

  // +модер [rank] @user or reply
  bot.hears(
    /^[!/.]?\+(?:модер|модератор|moder|admin|админ)(?:\s+(\d))?\s*(@\S+)?$/i,
    async (ctx) => {
      const rank = parseInt(ctx.match[1] ?? "1") || 1;
      await addModHandler(ctx, Math.min(Math.max(rank, 1), 4));
    },
  );

  // повысить @user or reply
  bot.hears(/^[!/.]?повысить(?:\s+(\d))?\s*(@\S+)?$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;
    const target = await getTargetFromCtx(ctx);
    if (!target || target.id === 0)
      return ctx.reply("Укажите пользователя реплаем или @упоминанием.");

    const [existing] = await db
      .select()
      .from(chatModeratorsTable)
      .where(
        and(
          eq(chatModeratorsTable.chatId, ctx.chat.id),
          eq(chatModeratorsTable.userId, target.id),
        ),
      )
      .limit(1);

    const newRank = Math.min((existing?.rank ?? 0) + 1, 4);
    await db
      .insert(chatModeratorsTable)
      .values({
        chatId: ctx.chat.id,
        userId: target.id,
        rank: newRank,
        username: target.username,
        fullName: target.name,
        assignedBy: ctx.from?.id ?? 0,
        isActive: true,
      })
      .onConflictDoNothing();

    await db
      .update(chatModeratorsTable)
      .set({ rank: newRank, isActive: true })
      .where(
        and(
          eq(chatModeratorsTable.chatId, ctx.chat.id),
          eq(chatModeratorsTable.userId, target.id),
        ),
      );

    await ctx.reply(
      `⬆️ <b>${target.name}</b> повышен до ранга ${newRank} — <b>${RANK_NAMES[newRank]}</b>.`,
      { parse_mode: "HTML" },
    );
  });

  // понизить @user
  bot.hears(/^[!/.]?понизить\s*(@\S+)?$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;
    const target = await getTargetFromCtx(ctx);
    if (!target || target.id === 0)
      return ctx.reply("Укажите пользователя.");

    const [existing] = await db
      .select()
      .from(chatModeratorsTable)
      .where(
        and(
          eq(chatModeratorsTable.chatId, ctx.chat.id),
          eq(chatModeratorsTable.userId, target.id),
        ),
      )
      .limit(1);

    if (!existing || !existing.isActive) {
      return ctx.reply(`${target.name} не является модератором.`);
    }

    const newRank = existing.rank - 1;
    if (newRank <= 0) {
      await db
        .update(chatModeratorsTable)
        .set({ isActive: false })
        .where(eq(chatModeratorsTable.id, existing.id));
      return ctx.reply(
        `⬇️ <b>${target.name}</b> разжалован.`,
        { parse_mode: "HTML" },
      );
    }

    await db
      .update(chatModeratorsTable)
      .set({ rank: newRank })
      .where(eq(chatModeratorsTable.id, existing.id));

    await ctx.reply(
      `⬇️ <b>${target.name}</b> понижен до ранга ${newRank} — <b>${RANK_NAMES[newRank]}</b>.`,
      { parse_mode: "HTML" },
    );
  });

  // снять / разжаловать @user
  bot.hears(/^[!/.]?(?:снять|разжаловать)\s*(@\S+)?$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;
    const target = await getTargetFromCtx(ctx);
    if (!target || target.id === 0)
      return ctx.reply("Укажите пользователя реплаем или @упоминанием.");

    await db
      .update(chatModeratorsTable)
      .set({ isActive: false })
      .where(
        and(
          eq(chatModeratorsTable.chatId, ctx.chat.id),
          eq(chatModeratorsTable.userId, target.id),
        ),
      );

    await ctx.reply(
      `✅ <b>${target.name}</b> снят с должности модератора.`,
      { parse_mode: "HTML" },
    );
  });

  // кто админ / !staff / кто здесь власть
  const showAdminsHandler = async (ctx: BotContext) => {
    if (!ctx.chat || ctx.chat.type === "private") return;

    const lines: string[] = [`👮 <b>Состав модерации</b>\n`];

    // Telegram admins
    try {
      const tgAdmins = await ctx.getChatAdministrators();
      lines.push("📌 <b>Администраторы Telegram:</b>");
      for (const a of tgAdmins) {
        const u = a.user;
        const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
        const role =
          a.status === "creator"
            ? "👑 Создатель"
            : a.custom_title || "⚙️ Администратор";
        lines.push(`  ${role} — ${name}${u.username ? ` (@${u.username})` : ""}`);
      }
    } catch {}

    // Bot moderators from DB
    const mods = await db
      .select()
      .from(chatModeratorsTable)
      .where(
        and(
          eq(chatModeratorsTable.chatId, ctx.chat.id),
          eq(chatModeratorsTable.isActive, true),
        ),
      );

    if (mods.length > 0) {
      lines.push("\n🤖 <b>Модераторы бота:</b>");
      const sorted = mods.sort((a, b) => b.rank - a.rank);
      for (const m of sorted) {
        const rankName = RANK_NAMES[m.rank] ?? `Ранг ${m.rank}`;
        const mention = m.username ? ` (@${m.username})` : "";
        lines.push(`  [${m.rank}] ${rankName} — ${m.fullName ?? "?"}${mention}`);
      }
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  };

  bot.hears(
    /^[!/.]?(?:кто\s+админ|кто\s+здесь\s+власть|а\s+судьи\s+кто|staff|управляющие|админы)$/i,
    showAdminsHandler,
  );
  bot.command("staff", showAdminsHandler);
  bot.command("admins", showAdminsHandler);
  bot.command("moders", showAdminsHandler);
}
