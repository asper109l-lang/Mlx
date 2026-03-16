import type { Bot, Context } from "grammy";
import { db } from "@workspace/db";
import { broadcastsTable, knownChatsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../utils/auth.js";
import { logAction } from "../utils/logger.js";
import { parseInlineButtons } from "../utils/keyboard.js";

export function registerBroadcastHandlers(bot: Bot<Context>) {
  bot.command("broadcast", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const args = (ctx.match ?? "").trim();
    if (!args) {
      await ctx.reply(
        "Использование:\n/broadcast\nТекст сообщения\n---\nКнопки (опционально)\n\nСообщение будет разослано всем известным чатам."
      );
      return;
    }
    const lines = args.split("\n");
    const sep = lines.findIndex((l) => l.trim() === "---");
    const text = sep >= 0 ? lines.slice(0, sep).join("\n") : args;
    const buttonBlock = sep >= 0 ? lines.slice(sep + 1).join("\n") : undefined;
    const keyboard = buttonBlock ? parseInlineButtons(buttonBlock) : undefined;

    const chats = await db
      .select()
      .from(knownChatsTable)
      .where(eq(knownChatsTable.isActive, true));

    if (chats.length === 0) {
      await ctx.reply(
        "Нет известных чатов для рассылки. Добавьте чаты командой /addchat."
      );
      return;
    }

    const [broadcast] = await db
      .insert(broadcastsTable)
      .values({
        message: text,
        status: "running",
        createdBy: ctx.from!.id,
      })
      .returning();

    await ctx.reply(
      `Начинаю рассылку в ${chats.length} чатов... (ID рассылки: ${broadcast.id})`
    );

    let sent = 0;
    let failed = 0;
    for (const chat of chats) {
      try {
        if (ctx.message?.reply_to_message?.photo) {
          const fileId =
            ctx.message.reply_to_message.photo[
              ctx.message.reply_to_message.photo.length - 1
            ].file_id;
          await ctx.api.sendPhoto(chat.chatId, fileId, {
            caption: text,
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
        } else {
          await ctx.api.sendMessage(chat.chatId, text, {
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
        }
        sent++;
      } catch {
        failed++;
        await db
          .update(knownChatsTable)
          .set({ isActive: false })
          .where(eq(knownChatsTable.chatId, chat.chatId));
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    await db
      .update(broadcastsTable)
      .set({
        status: "completed",
        sentTo: sent,
        failedCount: failed,
        completedAt: new Date(),
      })
      .where(eq(broadcastsTable.id, broadcast.id));

    await ctx.reply(
      `Рассылка завершена!\nОтправлено: ${sent}\nОшибок: ${failed}`
    );
    await logAction({
      action: "broadcast",
      performedBy: ctx.from!.id,
      details: `Broadcast #${broadcast.id}: sent=${sent}, failed=${failed}`,
    });
  });

  bot.command("addchat", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const args = (ctx.match ?? "").trim().split(" ");
    const chatId = Number(args[0]);
    const title = args.slice(1).join(" ") || `Chat ${chatId}`;
    if (!chatId || isNaN(chatId)) {
      await ctx.reply(
        "Использование: /addchat <chat_id> [название]\n\nДобавляет чат в список рассылки."
      );
      return;
    }
    await db
      .insert(knownChatsTable)
      .values({
        chatId,
        chatType: "group",
        title,
        isActive: true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: knownChatsTable.chatId,
        set: { isActive: true, title, updatedAt: new Date() },
      });
    await ctx.reply(`Чат ${title} (${chatId}) добавлен в список рассылки.`);
    await logAction({
      action: "add_chat",
      performedBy: ctx.from!.id,
      targetChat: chatId,
    });
  });

  bot.command("removechat", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const chatId = Number((ctx.match ?? "").trim());
    if (!chatId || isNaN(chatId)) {
      await ctx.reply("Использование: /removechat <chat_id>");
      return;
    }
    await db
      .update(knownChatsTable)
      .set({ isActive: false })
      .where(eq(knownChatsTable.chatId, chatId));
    await ctx.reply(`Чат ${chatId} убран из списка рассылки.`);
  });

  bot.command("chats", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const chats = await db
      .select()
      .from(knownChatsTable)
      .where(eq(knownChatsTable.isActive, true));
    if (chats.length === 0) {
      await ctx.reply("Нет активных чатов. Добавьте командой /addchat");
      return;
    }
    let text = "<b>Активные чаты для рассылки:</b>\n\n";
    chats.forEach((c, i) => {
      text += `${i + 1}. ${c.title || "Без названия"} — <code>${c.chatId}</code>\n`;
    });
    await ctx.reply(text, { parse_mode: "HTML" });
  });
}
