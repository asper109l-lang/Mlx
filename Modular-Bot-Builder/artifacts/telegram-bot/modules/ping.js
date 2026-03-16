export async function setup(bot) {
  bot.command("ping", (ctx) => {
    ctx.reply("Pong");
  });
}
