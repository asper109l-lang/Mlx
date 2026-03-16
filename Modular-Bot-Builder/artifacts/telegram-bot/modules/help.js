export async function setup(bot) {
  bot.command("help", (ctx) => {
    const commands = [
      "/ping — проверка работы бота",
      "/help — список доступных команд",
    ];

    ctx.reply(`Доступные команды:\n\n${commands.join("\n")}`);
  });
}
