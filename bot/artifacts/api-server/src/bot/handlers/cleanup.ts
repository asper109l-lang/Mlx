import type { Bot } from "grammy";
import type { BotContext } from "../index.js";
import { requireAdmin } from "../utils/auth.js";
import { logAction } from "../utils/logger.js";

const PURGE_LIMIT = 100;

export function registerCleanupHandlers(bot: Bot<BotContext>) {
  // /purge N or чистка N — delete last N messages
  const purgeHandler = async (ctx: BotContext) => {
    if (!ctx.chat || ctx.chat.type === "private") {
      return ctx.reply("⛔ Команда доступна только в группах.");
    }
    if (!(await requireAdmin(ctx))) return;

    const text = ctx.message?.text ?? "";
    const match = text.match(/(\d+)/);
    const count = match ? Math.min(parseInt(match[1]!), PURGE_LIMIT) : 10;

    const fromId = ctx.message?.message_id;
    if (!fromId) return;

    const deleted: number[] = [];
    for (let i = 0; i < count; i++) {
      const msgId = fromId - i;
      if (msgId <= 0) break;
      try {
        await ctx.api.deleteMessage(ctx.chat.id, msgId);
        deleted.push(msgId);
      } catch {
        // message may not exist or be too old
      }
    }

    const notify = await ctx.reply(
      `🗑 Удалено ${deleted.length} сообщений.`,
    );
    setTimeout(async () => {
      try {
        await ctx.api.deleteMessage(ctx.chat!.id, notify.message_id);
      } catch {}
    }, 3000);

    await logAction(ctx.chat.id, ctx.from?.id ?? 0, "purge", {
      count: deleted.length,
    });
  };

  bot.command("purge", purgeHandler);
  bot.command("clean", purgeHandler);
  bot.hears(/^[!/.]?чистка(?:\s+(\d+))?$/i, purgeHandler);

  // /del or дель — delete replied message
  const delHandler = async (ctx: BotContext) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;

    const reply = ctx.message?.reply_to_message;
    if (!reply) {
      return ctx.reply("↩️ Ответьте на сообщение, которое нужно удалить.");
    }
    try {
      await ctx.api.deleteMessage(ctx.chat.id, reply.message_id);
    } catch {
      return ctx.reply("❌ Не удалось удалить сообщение.");
    }
    try {
      await ctx.deleteMessage();
    } catch {}
    await logAction(ctx.chat.id, ctx.from?.id ?? 0, "delete_message", {
      message_id: reply.message_id,
    });
  };

  bot.command("del", delHandler);
  bot.command("delete", delHandler);
  bot.hears(/^[!/.]?(?:дель|удалить)$/i, delHandler);

  // /clearchat N — delete last N messages (admin only)
  bot.command("clearchat", async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;

    const args = ctx.match?.trim();
    const count = Math.min(parseInt(args || "50") || 50, PURGE_LIMIT);
    const fromId = ctx.message?.message_id ?? 0;

    let deleted = 0;
    for (let i = 0; i < count; i++) {
      try {
        await ctx.api.deleteMessage(ctx.chat.id, fromId - i);
        deleted++;
      } catch {}
    }

    const notify = await ctx.reply(`🗑 Очищено ${deleted} сообщений.`);
    setTimeout(async () => {
      try {
        await ctx.api.deleteMessage(ctx.chat!.id, notify.message_id);
      } catch {}
    }, 4000);
  });
}
