import { getUser } from "../core/storage.js";

export async function setup(bot) {
  bot.command("info", async (ctx) => {
    const target = ctx.message.reply_to_message?.from ?? ctx.from;
    const chatId = ctx.chat.id;
    const userData = getUser(chatId, target.id);

    const name = [target.first_name, target.last_name].filter(Boolean).join(" ");
    const username = target.username ? `@${target.username}` : "—";
    const warns = userData.warns ?? 0;

    let text = `👤 <b>Информация о пользователе</b>\n\n`;
    text += `📛 Имя: <b>${escapeHtml(name)}</b>\n`;
    text += `🔗 Username: ${username}\n`;
    text += `🆔 ID: <code>${target.id}</code>\n`;
    if (target.is_bot) text += `🤖 Это бот\n`;
    if (ctx.chat.type !== "private") {
      text += `⚠️ Предупреждений: <b>${warns}</b>`;
    }

    await ctx.reply(text, { parse_mode: "HTML" });
  });
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
