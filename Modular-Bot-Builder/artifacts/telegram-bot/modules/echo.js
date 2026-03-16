export async function setup(bot) {
  bot.on("text", (ctx, next) => {
    if (ctx.message.text.startsWith("/")) return next();
    ctx.reply(ctx.message.text);
  });
}
