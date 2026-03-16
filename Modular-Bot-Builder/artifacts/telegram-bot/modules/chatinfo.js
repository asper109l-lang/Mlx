export async function setup(bot) {
  bot.command("chatinfo", async (ctx) => {
    if (ctx.chat.type === "private") {
      await ctx.reply("Эта команда работает только в группах.");
      return;
    }

    const chat = ctx.chat;
    const memberCount = await ctx.telegram.getChatMemberCount(chat.id).catch(() => "?");

    let text = `💬 <b>Информация о чате</b>\n\n`;
    text += `📛 Название: <b>${escapeHtml(chat.title)}</b>\n`;
    text += `🆔 Chat ID: <code>${chat.id}</code>\n`;
    text += `📁 Тип: ${chatTypeLabel(chat.type)}\n`;
    text += `👥 Участников: <b>${memberCount}</b>\n`;
    if (chat.username) text += `🔗 Username: @${chat.username}\n`;
    if (chat.description) text += `📝 Описание: ${escapeHtml(chat.description)}\n`;

    await ctx.reply(text, { parse_mode: "HTML" });
  });
}

function chatTypeLabel(type) {
  return { group: "Группа", supergroup: "Супергруппа", channel: "Канал", private: "Личный" }[type] ?? type;
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
