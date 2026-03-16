import { getSetting, setSetting } from "../core/storage.js";
import { isAdminInChat } from "../core/permissions.js";

export async function setup(bot) {
  bot.on("new_chat_members", async (ctx) => {
    const chatId = ctx.chat.id;
    const welcomeEnabled = getSetting(chatId, "welcome_enabled", true);
    if (!welcomeEnabled) return;

    const customMsg = getSetting(chatId, "welcome_message", null);

    for (const member of ctx.message.new_chat_members) {
      if (member.is_bot) continue;

      const name = escapeHtml(
        [member.first_name, member.last_name].filter(Boolean).join(" ")
      );

      const text = customMsg
        ? customMsg
            .replace("{name}", `<b>${name}</b>`)
            .replace("{chat}", escapeHtml(ctx.chat.title))
        : `👋 Добро пожаловать, <b>${name}</b>!\n\nРады видеть вас в <b>${escapeHtml(ctx.chat.title)}</b>!\nИспользуйте /help для списка команд.`;

      await ctx.reply(text, { parse_mode: "HTML" });
    }
  });

  bot.command("setwelcome", async (ctx) => {
    if (!await isAdminInChat(ctx)) {
      await ctx.reply("❌ Только администраторы могут менять приветствие.");
      return;
    }

    const args = ctx.message.text.split("\n").slice(1).join("\n").trim() ||
                 ctx.message.text.slice(ctx.message.text.indexOf(" ") + 1).trim();

    if (!args || args === "/setwelcome") {
      await ctx.reply(
        "Укажите текст приветствия после команды.\n\nПеременные:\n{name} — имя пользователя\n{chat} — название чата\n\nПример:\n/setwelcome Привет, {name}! Добро пожаловать в {chat}!"
      );
      return;
    }

    setSetting(ctx.chat.id, "welcome_message", args);
    await ctx.reply("✅ Приветствие установлено!");
  });

  bot.command("welcome", async (ctx) => {
    if (!await isAdminInChat(ctx)) {
      await ctx.reply("❌ Только администраторы могут управлять приветствием.");
      return;
    }

    const args = ctx.message.text.split(" ")[1]?.toLowerCase();
    const chatId = ctx.chat.id;

    if (args === "off") {
      setSetting(chatId, "welcome_enabled", false);
      await ctx.reply("🔕 Приветствие отключено.");
    } else if (args === "on") {
      setSetting(chatId, "welcome_enabled", true);
      await ctx.reply("🔔 Приветствие включено.");
    } else {
      const enabled = getSetting(chatId, "welcome_enabled", true);
      await ctx.reply(`Приветствие: ${enabled ? "включено ✅" : "выключено ❌"}\n\n/welcome on — включить\n/welcome off — выключить\n/setwelcome <текст> — установить текст`);
    }
  });
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
