import type { Bot, Context } from "grammy";
import { db } from "@workspace/db";
import { adminsTable, logsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireOwner, requireAdmin } from "../utils/auth.js";
import { logAction } from "../utils/logger.js";

export function registerAdminHandlers(bot: Bot<Context>) {
  bot.command("addadmin", async (ctx) => {
    if (!(await requireOwner(ctx))) return;
    const args = ctx.match?.trim();
    if (!args) {
      await ctx.reply(
        "Использование: /addadmin <user_id> [имя]\n\nПример: /addadmin 123456789 Иван"
      );
      return;
    }
    const parts = args.split(" ");
    const targetId = Number(parts[0]);
    const name = parts.slice(1).join(" ") || "Без имени";
    if (isNaN(targetId)) {
      await ctx.reply("Неверный ID пользователя.");
      return;
    }
    const existing = await db
      .select()
      .from(adminsTable)
      .where(eq(adminsTable.telegramId, targetId))
      .limit(1);
    if (existing.length > 0) {
      await db
        .update(adminsTable)
        .set({ isActive: true, fullName: name })
        .where(eq(adminsTable.telegramId, targetId));
      await ctx.reply(`Администратор ${name} (${targetId}) активирован.`);
    } else {
      await db.insert(adminsTable).values({
        telegramId: targetId,
        fullName: name,
        addedBy: ctx.from!.id,
        isActive: true,
      });
      await ctx.reply(`Пользователь ${name} (${targetId}) добавлен как администратор.`);
    }
    await logAction({
      action: "add_admin",
      performedBy: ctx.from!.id,
      details: `Added admin: ${targetId} (${name})`,
    });
  });

  bot.command("removeadmin", async (ctx) => {
    if (!(await requireOwner(ctx))) return;
    const targetId = Number(ctx.match?.trim());
    if (isNaN(targetId)) {
      await ctx.reply("Использование: /removeadmin <user_id>");
      return;
    }
    await db
      .update(adminsTable)
      .set({ isActive: false })
      .where(eq(adminsTable.telegramId, targetId));
    await ctx.reply(`Пользователь ${targetId} удалён из администраторов.`);
    await logAction({
      action: "remove_admin",
      performedBy: ctx.from!.id,
      details: `Removed admin: ${targetId}`,
    });
  });

  bot.command("admins", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const admins = await db
      .select()
      .from(adminsTable)
      .where(eq(adminsTable.isActive, true));
    const ownerId = process.env.BOT_OWNER_ID;
    let text = `<b>Список администраторов бота:</b>\n\n`;
    text += `👑 Владелец: <code>${ownerId}</code>\n\n`;
    if (admins.length === 0) {
      text += "Нет назначенных администраторов.";
    } else {
      admins.forEach((a, i) => {
        text += `${i + 1}. ${a.fullName || "Без имени"} — <code>${a.telegramId}</code>\n`;
      });
    }
    await ctx.reply(text, { parse_mode: "HTML" });
  });

  bot.command("logs", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const logs = await db
      .select()
      .from(logsTable)
      .orderBy(desc(logsTable.createdAt))
      .limit(20);
    if (logs.length === 0) {
      await ctx.reply("Логов пока нет.");
      return;
    }
    let text = "<b>Последние 20 действий:</b>\n\n";
    for (const log of logs) {
      const date = new Date(log.createdAt).toLocaleString("ru-RU");
      text += `[${date}] <b>${log.action}</b>`;
      if (log.performedBy) text += ` | by: <code>${log.performedBy}</code>`;
      if (log.details) text += `\n  ${log.details}`;
      text += "\n\n";
    }
    await ctx.reply(text, { parse_mode: "HTML" });
  });
}
