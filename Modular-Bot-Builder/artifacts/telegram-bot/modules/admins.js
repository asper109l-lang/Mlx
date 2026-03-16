import { isAdminInChat, isOwnerInChat } from "../core/permissions.js";
import { addAdmin, removeAdmin, getAdmins, getOwner } from "../core/storage.js";

export async function setup(bot) {
  bot.command("admins", async (ctx) => {
    if (ctx.chat.type === "private") {
      await ctx.reply("Эта команда работает только в группах.");
      return;
    }

    const tgAdmins = await ctx.telegram.getChatAdministrators(ctx.chat.id).catch(() => []);
    if (!tgAdmins.length) {
      await ctx.reply("Не удалось получить список администраторов.");
      return;
    }

    const lines = tgAdmins.map((a) => {
      const user = a.user;
      if (user.is_bot) return null;
      const name = escapeHtml([user.first_name, user.last_name].filter(Boolean).join(" "));
      const role = a.status === "creator" ? "👑 Создатель" : "⚙️ Администратор";
      const username = user.username ? ` (@${user.username})` : "";
      return `${role}: <b>${name}</b>${username}`;
    }).filter(Boolean);

    await ctx.reply(`👮 <b>Администраторы чата:</b>\n\n${lines.join("\n")}`, { parse_mode: "HTML" });
  });

  bot.command("promote", async (ctx) => {
    if (!await isOwnerInChat(ctx)) {
      await ctx.reply("❌ Только владелец может назначать администраторов.");
      return;
    }

    const reply = ctx.message.reply_to_message;
    if (!reply?.from) {
      await ctx.reply("ℹ️ Ответьте на сообщение пользователя которого хотите повысить.");
      return;
    }

    const target = reply.from;
    addAdmin(ctx.chat.id, target.id);
    const name = escapeHtml([target.first_name, target.last_name].filter(Boolean).join(" "));
    await ctx.reply(`✅ <b>${name}</b> назначен администратором бота.`, { parse_mode: "HTML" });
  });

  bot.command("demote", async (ctx) => {
    if (!await isOwnerInChat(ctx)) {
      await ctx.reply("❌ Только владелец может снимать администраторов.");
      return;
    }

    const reply = ctx.message.reply_to_message;
    if (!reply?.from) {
      await ctx.reply("ℹ️ Ответьте на сообщение пользователя которого хотите понизить.");
      return;
    }

    const target = reply.from;
    removeAdmin(ctx.chat.id, target.id);
    const name = escapeHtml([target.first_name, target.last_name].filter(Boolean).join(" "));
    await ctx.reply(`✅ <b>${name}</b> снят с должности администратора бота.`, { parse_mode: "HTML" });
  });
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
