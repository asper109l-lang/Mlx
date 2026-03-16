import type { Bot, Context } from "grammy";
import { InlineKeyboard, Keyboard } from "grammy";
import { db } from "@workspace/db";
import { adminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin, isAdmin, isOwner } from "../utils/auth.js";

// ──────────────── КОНФИГ БОТА ────────────────
const BOT_DISPLAY_NAME = process.env.BOT_DISPLAY_NAME ?? "Бот | Менеджер";
const SUPPORT_CHAT_URL = process.env.SUPPORT_CHAT_URL ?? "";
const NEWS_CHANNEL_URL = process.env.NEWS_CHANNEL_URL ?? "";
const COMMANDS_URL = process.env.COMMANDS_URL ?? "";

// ──────────────── REPLY-КЛАВИАТУРА ────────────────
function mainKeyboard(): Keyboard {
  return new Keyboard()
    .text("📋 Команды").text("🛡 Модерация")
    .row()
    .text("📨 Отправка").text("📢 Рассылка")
    .row()
    .text("📅 Планировщик").text("👥 Мои чаты")
    .row()
    .text("👮 Администраторы").text("ℹ️ О боте")
    .resized();
}

function removeKeyboard() {
  return { remove_keyboard: true as const };
}

// ──────────────── ПРИВЕТСТВИЕ ────────────────
async function sendWelcome(ctx: Context) {
  const userId = ctx.from?.id;
  const admin = userId ? await isAdmin(userId) : false;
  const isOwnerUser = userId ? isOwner(userId) : false;

  // Получаем список бот-админов
  const admins = await db
    .select()
    .from(adminsTable)
    .where(eq(adminsTable.isActive, true));

  const ownerLine = `👑 ${isOwnerUser ? "Вы — владелец бота" : `Владелец: <code>${process.env.BOT_OWNER_ID}</code>`}`;

  let adminLines = "";
  if (admins.length > 0) {
    adminLines = `\n👨‍💻 <b>Администраторы бота:</b>\n`;
    for (const a of admins) {
      adminLines += `· ${a.fullName ?? `ID ${a.telegramId}`}\n`;
    }
  }

  let text = `👨‍💻 <b>${BOT_DISPLAY_NAME} приветствует Вас!</b>\n`;

  if (admin) {
    text +=
      `\nЯ могу предложить следующие темы:\n\n` +
      `1). <b>команды</b> — полный список команд бота;\n` +
      `2). <b>отправка</b> — отправка текста и медиа в любой чат;\n` +
      `3). <b>модерация</b> — бан, мут, предупреждения;\n` +
      `4). <b>рассылка</b> — массовая рассылка по чатам;\n` +
      `5). <b>планировщик</b> — отложенные сообщения.\n` +
      `\n${ownerLine}` +
      adminLines +
      `\n🗂 <a href="tg://resolve?domain=">Список всех команд</a>\n` +
      (SUPPORT_CHAT_URL ? `👥 <a href="${SUPPORT_CHAT_URL}">Чат поддержки</a>\n` : "") +
      (NEWS_CHANNEL_URL ? `📢 <a href="${NEWS_CHANNEL_URL}">Канал новостей</a>\n` : "") +
      `\n🔈 Для вызова клавиатуры с основными темами введите <b>начать</b> или <b>помощь</b>.`;

    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: mainKeyboard(),
      link_preview_options: { is_disabled: true },
    });
  } else {
    await ctx.reply(
      `👨‍💻 <b>${BOT_DISPLAY_NAME}</b>\n\nЭтот бот предназначен только для авторизованных администраторов.`,
      { parse_mode: "HTML", reply_markup: removeKeyboard() }
    );
  }
}

// ──────────────── СЕКЦИИ ────────────────
async function sendSection(ctx: Context, section: string) {
  const sections: Record<string, { emoji: string; title: string; text: string }> = {
    команды: {
      emoji: "📋",
      title: "Список команд",
      text:
        `<b>📨 Отправка:</b>\n` +
        `/send &lt;chat_id&gt;\nТекст\n---\nКнопки\n\n` +
        `/sendphoto — ответьте на фото\n` +
        `/sendvideo — ответьте на видео/GIF\n` +
        `/forward &lt;to&gt; &lt;from&gt; &lt;id&gt;\n\n` +
        `<b>✏️ Редактирование:</b>\n` +
        `/edit &lt;chat_id&gt; &lt;msg_id&gt;\nТекст\n` +
        `/delete &lt;chat_id&gt; &lt;msg_id&gt;\n` +
        `/pin &lt;chat_id&gt; &lt;msg_id&gt; [silent]\n` +
        `/react &lt;chat_id&gt; &lt;msg_id&gt; &lt;emoji&gt;\n\n` +
        `<b>🛡 Модерация:</b>\n` +
        `/ban [причина] — в группе: ответьте на сообщение\n` +
        `/kick, /unban\n` +
        `/mute [10m|2h|1d] [причина]\n` +
        `/unmute\n` +
        `/warn, /unwarn, /warns, /clearwarns\n\n` +
        `<b>📢 Рассылка:</b>\n` +
        `/broadcast\nТекст\n---\nКнопки\n` +
        `/addchat, /removechat, /chats\n\n` +
        `<b>📅 Планировщик:</b>\n` +
        `/schedule &lt;chat&gt; &lt;YYYY-MM-DD HH:MM&gt;\nТекст\n` +
        `/scheduled, /cancelschedule &lt;id&gt;\n\n` +
        `<b>👑 Только владелец:</b>\n` +
        `/addadmin, /removeadmin, /admins`,
    },
    модерация: {
      emoji: "🛡",
      title: "Модерация",
      text:
        `<b>В группе</b> — ответьте на сообщение пользователя:\n\n` +
        `<b>🚫 Бан:</b>\n` +
        `/ban [причина] — заблокировать навсегда\n` +
        `/unban — разблокировать\n` +
        `/kick [причина] — исключить без блока\n\n` +
        `<b>🔇 Мут:</b>\n` +
        `/mute [время] [причина]\n` +
        `Время: <code>10m</code>, <code>2h</code>, <code>1d</code>\n` +
        `/unmute — размутить\n\n` +
        `<b>⚠️ Предупреждения:</b>\n` +
        `/warn [причина] — выдать варн\n` +
        `3 варна = автоматический бан\n` +
        `/unwarn — снять последний варн\n` +
        `/warns — список варнов\n` +
        `/clearwarns — сбросить все варны\n\n` +
        `<b>Из ЛС</b> — укажите &lt;chat_id&gt; &lt;user_id&gt;`,
    },
    отправка: {
      emoji: "📨",
      title: "Отправка сообщений",
      text:
        `Отправить текст с кнопками:\n` +
        `<code>/send -100123456789\nТекст сообщения\n---\nСсылка - https://example.com | Кнопка :: callback</code>\n\n` +
        `Отправить фото (ответьте на фото):\n` +
        `<code>/sendphoto -100123456789\nПодпись</code>\n\n` +
        `Отправить видео/GIF (ответьте на видео):\n` +
        `<code>/sendvideo -100123456789</code>\n\n` +
        `Переслать сообщение:\n` +
        `<code>/forward &lt;to&gt; &lt;from&gt; &lt;msg_id&gt;</code>\n\n` +
        `<b>Формат кнопок:</b>\n` +
        `<code>Кнопка1 - https://url | Кнопка2 :: callback_data\nСледующая строка - https://url</code>`,
    },
    рассылка: {
      emoji: "📢",
      title: "Массовая рассылка",
      text:
        `Рассылка по всем добавленным чатам:\n` +
        `<code>/broadcast\nТекст рассылки\n---\nКнопка - https://example.com</code>\n\n` +
        `Добавить чат в список рассылки:\n` +
        `<code>/addchat -100123456789 Мой чат</code>\n\n` +
        `Убрать чат из списка:\n` +
        `<code>/removechat -100123456789</code>\n\n` +
        `/chats — просмотреть все чаты\n\n` +
        `💡 Бот автоматически добавляет чаты, в которые его добавляют.`,
    },
    планировщик: {
      emoji: "📅",
      title: "Планировщик",
      text:
        `Запланировать отправку сообщения:\n` +
        `<code>/schedule -100123456789 2025-12-31 23:59\nС Новым Годом! 🎉</code>\n\n` +
        `Список запланированных:\n` +
        `/scheduled\n\n` +
        `Отменить запланированное:\n` +
        `<code>/cancelschedule &lt;id&gt;</code>\n\n` +
        `⏰ Бот проверяет очередь каждые 30 секунд.`,
    },
    "мои чаты": {
      emoji: "👥",
      title: "Мои чаты",
      text: `Загружаю список чатов...`,
    },
    администраторы: {
      emoji: "👮",
      title: "Администраторы",
      text: `Загружаю список...`,
    },
    "о боте": {
      emoji: "ℹ️",
      title: "О боте",
      text:
        `<b>${BOT_DISPLAY_NAME}</b>\n\n` +
        `Профессиональный бот для управления чатами.\n\n` +
        `<b>Возможности:</b>\n` +
        `· Отправка текста, фото, видео, GIF, документов\n` +
        `· Inline и reply кнопки в сообщениях\n` +
        `· Закрепление и открепление сообщений\n` +
        `· Реакции на сообщения\n` +
        `· Бан, мут, предупреждения\n` +
        `· Массовая рассылка\n` +
        `· Отложенная отправка\n` +
        `· Полное логирование действий\n\n` +
        `👑 Разные права: владелец, бот-админы, владельцы групп`,
    },
  };

  const key = section.toLowerCase();
  const found = sections[key];

  // Динамические секции
  if (key === "мои чаты") {
    const { knownChatsTable } = await import("@workspace/db");
    const chats = await db
      .select()
      .from(knownChatsTable)
      .where(eq(knownChatsTable.isActive, true));
    const chatList =
      chats.length > 0
        ? chats.map((c, i) => `${i + 1}. ${c.title ?? "—"} — <code>${c.chatId}</code>`).join("\n")
        : "Нет добавленных чатов. Используйте /addchat";
    await ctx.reply(
      `👥 <b>Мои чаты (${chats.length}):</b>\n\n${chatList}`,
      { parse_mode: "HTML", reply_markup: mainKeyboard() }
    );
    return;
  }

  if (key === "администраторы") {
    const admins = await db
      .select()
      .from(adminsTable)
      .where(eq(adminsTable.isActive, true));
    let text = `👮 <b>Администраторы бота:</b>\n\n`;
    text += `👑 Владелец: <code>${process.env.BOT_OWNER_ID}</code>\n\n`;
    if (admins.length > 0) {
      text += admins
        .map((a, i) => `${i + 1}. ${a.fullName ?? "—"} — <code>${a.telegramId}</code>`)
        .join("\n");
    } else {
      text += "Нет назначенных администраторов.";
    }
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: mainKeyboard() });
    return;
  }

  if (!found) return;

  await ctx.reply(
    `${found.emoji} <b>${found.title}</b>\n\n${found.text}`,
    { parse_mode: "HTML", reply_markup: mainKeyboard() }
  );
}

// ──────────────── РЕГИСТРАЦИЯ ────────────────
export function registerInfoHandlers(bot: Bot<Context>) {

  // /start
  bot.command("start", async (ctx) => {
    await sendWelcome(ctx);
  });

  // /help
  bot.command("help", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await sendSection(ctx, "команды");
  });

  // Текстовые триггеры: "начать", "помощь" → показывают приветствие
  bot.hears(/^(начать|помощь|старт|меню)$/i, async (ctx) => {
    const userId = ctx.from?.id;
    const admin = userId ? await isAdmin(userId) : false;
    if (!admin) return;
    await sendWelcome(ctx);
  });

  // Кнопки reply-клавиатуры
  bot.hears("📋 Команды", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await sendSection(ctx, "команды");
  });

  bot.hears("🛡 Модерация", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await sendSection(ctx, "модерация");
  });

  bot.hears("📨 Отправка", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await sendSection(ctx, "отправка");
  });

  bot.hears("📢 Рассылка", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await sendSection(ctx, "рассылка");
  });

  bot.hears("📅 Планировщик", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await sendSection(ctx, "планировщик");
  });

  bot.hears("👥 Мои чаты", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await sendSection(ctx, "мои чаты");
  });

  bot.hears("👮 Администраторы", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await sendSection(ctx, "администраторы");
  });

  bot.hears("ℹ️ О боте", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await sendSection(ctx, "о боте");
  });

  // Inline-callback кнопки (из групп)
  bot.callbackQuery(/^help:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const section = ctx.match[1];
    if (!section) return;
    const userId = ctx.from?.id;
    const admin = userId ? await isAdmin(userId) : false;
    if (!admin) return;

    if (section === "index") {
      await sendWelcome(ctx);
      return;
    }

    const sectionNames: Record<string, string> = {
      send: "отправка",
      mod: "модерация",
      broadcast: "рассылка",
      schedule: "планировщик",
      edit: "команды",
      pin: "команды",
      misc: "о боте",
      owner: "администраторы",
      logs_quick: "команды",
      chats_quick: "мои чаты",
    };

    await sendSection(ctx, sectionNames[section] ?? "о боте");
  });

  // /myid
  bot.command("myid", async (ctx) => {
    await ctx.reply(
      `Ваш Telegram ID: <code>${ctx.from?.id}</code>\nЧат ID: <code>${ctx.chat.id}</code>`,
      { parse_mode: "HTML" }
    );
  });

  // /chatinfo
  bot.command("chatinfo", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const targetId = (ctx.match ?? "").trim() || String(ctx.chat.id);
    try {
      const chat = await ctx.api.getChat(targetId);
      let text = `<b>Информация о чате:</b>\n\n`;
      text += `ID: <code>${chat.id}</code>\n`;
      text += `Тип: ${chat.type}\n`;
      if ("title" in chat && chat.title) text += `Название: ${chat.title}\n`;
      if ("username" in chat && chat.username) text += `Username: @${chat.username}\n`;
      if ("description" in chat && (chat as any).description) {
        text += `Описание: ${(chat as any).description}\n`;
      }
      if (chat.type !== "private") {
        try {
          const count = await ctx.api.getChatMemberCount(chat.id);
          text += `Участников: ${count}\n`;
        } catch {
          // ignore
        }
      }
      await ctx.reply(text, { parse_mode: "HTML" });
    } catch (e: any) {
      await ctx.reply(`Ошибка: ${e.message}`);
    }
  });

  // /getfileid
  bot.command("getfileid", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const replied = ctx.message?.reply_to_message;
    if (!replied) {
      await ctx.reply("Ответьте на сообщение с медиа чтобы получить file_id");
      return;
    }
    let fileId = "";
    let type = "";
    if (replied.photo) { fileId = replied.photo[replied.photo.length - 1].file_id; type = "photo"; }
    else if (replied.video) { fileId = replied.video.file_id; type = "video"; }
    else if (replied.animation) { fileId = replied.animation.file_id; type = "animation (GIF)"; }
    else if (replied.document) { fileId = replied.document.file_id; type = "document"; }
    else if (replied.sticker) { fileId = replied.sticker.file_id; type = "sticker"; }
    else if (replied.voice) { fileId = replied.voice.file_id; type = "voice"; }
    else if (replied.audio) { fileId = replied.audio.file_id; type = "audio"; }

    if (fileId) {
      await ctx.reply(
        `Тип: <b>${type}</b>\nFile ID:\n<code>${fileId}</code>`,
        { parse_mode: "HTML" }
      );
    } else {
      await ctx.reply("Файл не найден в сообщении.");
    }
  });
}
