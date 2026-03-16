import { setOwner, getOwner } from "../core/storage.js";

export async function setup(bot) {
  bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const chatType = ctx.chat.type;

    if (chatType !== "private") {
      const current = getOwner(chatId);
      if (current === null) {
        setOwner(chatId, userId);
        await ctx.reply(
          `Бот запущен! Владелец группы установлен: ${ctx.from.first_name}\n\nИспользуйте /help для списка команд.`
        );
        return;
      }
    }

    await ctx.reply(
      `Привет, ${ctx.from.first_name}! 👋\n\nЯ бот с модульной архитектурой.\nИспользуйте /help для просмотра всех команд.`
    );
  });
}
