import { isAdminInChat, canTargetUser } from "../core/permissions.js";

export async function setup(bot) {
  bot.command("ban", async (ctx) => {
    if (!await isAdminInChat(ctx)) {
      await ctx.reply("❌ Только администраторы могут банить.");
      return;
    }

    const target = await resolveTarget(ctx);
    if (!target) {
      await ctx.reply("ℹ️ Ответьте на сообщение пользователя или укажите ID: /ban <id>");
      return;
    }

    if (!await canTargetUser(ctx, target.id)) {
      await ctx.reply("❌ Нельзя забанить этого пользователя.");
      return;
    }

    try {
      await ctx.telegram.banChatMember(ctx.chat.id, target.id);
      await ctx.reply(`✅ Пользователь <b>${escapeHtml(target.name)}</b> (<code>${target.id}</code>) заблокирован.`, { parse_mode: "HTML" });
    } catch (e) {
      await ctx.reply(`❌ Не удалось забанить: ${e.message}`);
    }
  });

  bot.command("unban", async (ctx) => {
    if (!await isAdminInChat(ctx)) {
      await ctx.reply("❌ Только администраторы могут разбанивать.");
      return;
    }

    const target = await resolveTarget(ctx);
    if (!target) {
      await ctx.reply("ℹ️ Укажите ID: /unban <id>");
      return;
    }

    try {
      await ctx.telegram.unbanChatMember(ctx.chat.id, target.id, { only_if_banned: true });
      await ctx.reply(`✅ Пользователь <code>${target.id}</code> разблокирован.`, { parse_mode: "HTML" });
    } catch (e) {
      await ctx.reply(`❌ Не удалось разбанить: ${e.message}`);
    }
  });

  bot.command("kick", async (ctx) => {
    if (!await isAdminInChat(ctx)) {
      await ctx.reply("❌ Только администраторы могут кикать.");
      return;
    }

    const target = await resolveTarget(ctx);
    if (!target) {
      await ctx.reply("ℹ️ Ответьте на сообщение пользователя или укажите ID: /kick <id>");
      return;
    }

    if (!await canTargetUser(ctx, target.id)) {
      await ctx.reply("❌ Нельзя кикнуть этого пользователя.");
      return;
    }

    try {
      await ctx.telegram.banChatMember(ctx.chat.id, target.id);
      await ctx.telegram.unbanChatMember(ctx.chat.id, target.id, { only_if_banned: true });
      await ctx.reply(`✅ Пользователь <b>${escapeHtml(target.name)}</b> исключён из группы.`, { parse_mode: "HTML" });
    } catch (e) {
      await ctx.reply(`❌ Не удалось кикнуть: ${e.message}`);
    }
  });
}

async function resolveTarget(ctx) {
  const reply = ctx.message.reply_to_message;
  if (reply?.from) {
    const u = reply.from;
    return { id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(" ") };
  }

  const parts = ctx.message.text.split(" ");
  if (parts[1]) {
    const id = parseInt(parts[1], 10);
    if (!isNaN(id)) {
      return { id, name: String(id) };
    }
  }

  return null;
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
