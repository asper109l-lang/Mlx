import type { Bot, Context } from "grammy";
import { db } from "@workspace/db";
import { scheduledMessagesTable } from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import { requireAdmin } from "../utils/auth.js";
import { logAction } from "../utils/logger.js";

let botInstance: Bot<Context> | null = null;

export function registerScheduleHandlers(bot: Bot<Context>) {
  botInstance = bot;

  bot.command("schedule", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const args = (ctx.match ?? "").trim();
    if (!args) {
      await ctx.reply(
        "Использование:\n/schedule <chat_id> <дата_время>\nТекст сообщения\n\n" +
          "Дата/время в формате: 2025-12-31 15:30\n\n" +
          "Пример:\n/schedule -100123456789 2025-12-31 23:59\nС Новым Годом! 🎉"
      );
      return;
    }
    const lines = args.split("\n");
    const firstLineParts = (lines[0] ?? "").split(" ");
    const chatId = Number(firstLineParts[0]);
    const dateStr = `${firstLineParts[1] ?? ""} ${firstLineParts[2] ?? ""}`.trim();
    const text = lines.slice(1).join("\n");

    if (!chatId || !dateStr || !text) {
      await ctx.reply("Неверный формат. Пример:\n/schedule -100123456789 2025-12-31 23:59\nТекст");
      return;
    }

    const scheduledAt = new Date(dateStr.replace(" ", "T"));
    if (isNaN(scheduledAt.getTime())) {
      await ctx.reply("Неверный формат даты. Используйте: YYYY-MM-DD HH:MM");
      return;
    }
    if (scheduledAt <= new Date()) {
      await ctx.reply("Дата должна быть в будущем.");
      return;
    }

    const [msg] = await db
      .insert(scheduledMessagesTable)
      .values({
        chatId,
        scheduledAt,
        messageData: { text, type: "text" },
        createdBy: ctx.from!.id,
        isSent: false,
        isCancelled: false,
      })
      .returning();

    await ctx.reply(
      `Сообщение запланировано!\nID: ${msg.id}\nЧат: ${chatId}\nВремя: ${scheduledAt.toLocaleString("ru-RU")}`
    );
    await logAction({
      action: "schedule_message",
      performedBy: ctx.from!.id,
      targetChat: chatId,
      details: `Scheduled msg #${msg.id} at ${scheduledAt.toISOString()}`,
    });
  });

  bot.command("scheduled", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const messages = await db
      .select()
      .from(scheduledMessagesTable)
      .where(
        and(
          eq(scheduledMessagesTable.isSent, false),
          eq(scheduledMessagesTable.isCancelled, false)
        )
      );
    if (messages.length === 0) {
      await ctx.reply("Нет запланированных сообщений.");
      return;
    }
    let text = "<b>Запланированные сообщения:</b>\n\n";
    for (const m of messages) {
      const data = m.messageData as { text?: string };
      const date = new Date(m.scheduledAt).toLocaleString("ru-RU");
      text += `#${m.id} | Чат: <code>${m.chatId}</code> | Время: ${date}\n`;
      text += `Текст: ${(data.text ?? "").slice(0, 50)}...\n\n`;
    }
    await ctx.reply(text, { parse_mode: "HTML" });
  });

  bot.command("cancelschedule", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const id = Number((ctx.match ?? "").trim());
    if (!id || isNaN(id)) {
      await ctx.reply("Использование: /cancelschedule <id>");
      return;
    }
    await db
      .update(scheduledMessagesTable)
      .set({ isCancelled: true })
      .where(eq(scheduledMessagesTable.id, id));
    await ctx.reply(`Запланированное сообщение #${id} отменено.`);
  });
}

export async function processScheduledMessages() {
  if (!botInstance) return;
  try {
    const now = new Date();
    const pending = await db
      .select()
      .from(scheduledMessagesTable)
      .where(
        and(
          eq(scheduledMessagesTable.isSent, false),
          eq(scheduledMessagesTable.isCancelled, false),
          lte(scheduledMessagesTable.scheduledAt, now)
        )
      );

    for (const msg of pending) {
      try {
        const data = msg.messageData as { text?: string; type?: string };
        await botInstance.api.sendMessage(msg.chatId, data.text ?? ".", {
          parse_mode: "HTML",
        });
        await db
          .update(scheduledMessagesTable)
          .set({ isSent: true, sentAt: new Date() })
          .where(eq(scheduledMessagesTable.id, msg.id));
        console.log(`[Scheduler] Sent scheduled message #${msg.id}`);
      } catch (e) {
        console.error(`[Scheduler] Failed to send #${msg.id}:`, e);
        await db
          .update(scheduledMessagesTable)
          .set({ isCancelled: true })
          .where(eq(scheduledMessagesTable.id, msg.id));
      }
    }
  } catch (e) {
    console.error("[Scheduler] Error processing:", e);
  }
}
