import { isAdminInChat, canTargetUser } from "../core/permissions.js";
import { getUser, saveUser } from "../core/storage.js";

const MAX_WARNS = 3;

export async function setup(bot) {
  bot.command("warn", async (ctx) => {
    if (!await isAdminInChat(ctx)) {
      await ctx.reply("❌ Только администраторы могут выдавать предупреждения.");
      return;
    }

    const reply = ctx.message.reply_to_message;
    if (!reply?.from) {
      await ctx.reply("ℹ️ Ответьте на сообщение пользователя которого хотите предупредить.");
      return;
    }

    const target = reply.from;
    if (!await canTargetUser(ctx, target.id)) {
      await ctx.reply("❌ Нельзя предупредить этого пользователя.");
      return;
    }

    const chatId = ctx.chat.id;
    const reason = ctx.message.text.split(" ").slice(1).join(" ") || "Нарушение правил";

    const userData = getUser(chatId, target.id);
    userData.warns = (userData.warns ?? 0) + 1;
    saveUser(chatId, target.id, userData);

    const name = escapeHtml([target.first_name, target.last_name].filter(Boolean).join(" "));

    if (userData.warns >= MAX_WARNS) {
      try {
        await ctx.telegram.banChatMember(chatId, target.id);
        userData.warns = 0;
        saveUser(chatId, target.id, userData);
        await ctx.reply(
          `⛔ <b>${name}</b> получил ${MAX_WARNS}/${MAX_WARNS} предупреждений и был заблокирован.\n📌 Причина: ${escapeHtml(reason)}`,
          { parse_mode: "HTML" }
        );
      } catch (e) {
        await ctx.reply(`⚠️ <b>${name}</b> достиг лимита предупреждений (${MAX_WARNS}), но автобан не удался: ${e.message}`, { parse_mode: "HTML" });
      }
    } else {
      await ctx.reply(
        `⚠️ <b>${name}</b> получил предупреждение ${userData.warns}/${MAX_WARNS}\n📌 Причина: ${escapeHtml(reason)}`,
        { parse_mode: "HTML" }
      );
    }
  });

  bot.command("unwarn", async (ctx) => {
    if (!await isAdminInChat(ctx)) {
      await ctx.reply("❌ Только администраторы могут снимать предупреждения.");
      return;
    }

    const reply = ctx.message.reply_to_message;
    if (!reply?.from) {
      await ctx.reply("ℹ️ Ответьте на сообщение пользователя.");
      return;
    }

    const target = reply.from;
    const chatId = ctx.chat.id;
    const userData = getUser(chatId, target.id);
    userData.warns = Math.max(0, (userData.warns ?? 0) - 1);
    saveUser(chatId, target.id, userData);

    const name = escapeHtml([target.first_name, target.last_name].filter(Boolean).join(" "));
    await ctx.reply(
      `✅ Предупреждение снято с <b>${name}</b>. Сейчас: ${userData.warns}/${MAX_WARNS}`,
      { parse_mode: "HTML" }
    );
  });

  bot.command("warns", async (ctx) => {
    const target = ctx.message.reply_to_message?.from ?? ctx.from;
    const userData = getUser(ctx.chat.id, target.id);
    const warns = userData.warns ?? 0;
    const name = escapeHtml([target.first_name, target.last_name].filter(Boolean).join(" "));
    await ctx.reply(
      `📋 <b>${name}</b>: ${warns}/${MAX_WARNS} предупреждений`,
      { parse_mode: "HTML" }
    );
  });
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
