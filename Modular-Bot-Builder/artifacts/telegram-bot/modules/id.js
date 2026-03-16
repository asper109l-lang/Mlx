export async function setup(bot) {
  bot.command("id", async (ctx) => {
    const reply = ctx.message.reply_to_message;

    if (reply) {
      const target = reply.from;
      await ctx.reply(
        `👤 <b>${escapeHtml(target.first_name)}</b>\n` +
        `🆔 User ID: <code>${target.id}</code>\n` +
        `💬 Chat ID: <code>${ctx.chat.id}</code>`,
        { parse_mode: "HTML" }
      );
    } else {
      await ctx.reply(
        `👤 <b>${escapeHtml(ctx.from.first_name)}</b>\n` +
        `🆔 Your ID: <code>${ctx.from.id}</code>\n` +
        `💬 Chat ID: <code>${ctx.chat.id}</code>`,
        { parse_mode: "HTML" }
      );
    }
  });
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
