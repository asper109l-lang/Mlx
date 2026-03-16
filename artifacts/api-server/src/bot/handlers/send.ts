import type { Bot, Context } from "grammy";
import { requireAdmin } from "../utils/auth.js";
import { logAction } from "../utils/logger.js";
import { parseInlineButtons } from "../utils/keyboard.js";

export function registerSendHandlers(bot: Bot<Context>) {
  bot.command("send", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const args = ctx.match?.trim() ?? "";
    const lines = args.split("\n");
    const firstLine = lines[0] ?? "";
    const parts = firstLine.split(" ");
    const chatId = parts[0];
    const textLines = lines.slice(1);

    if (!chatId) {
      await ctx.reply(
        "Использование:\n/send <chat_id>\nТекст сообщения\n---\nКнопка - https://example.com | Кнопка2 :: callback"
      );
      return;
    }

    const buttonSeparator = textLines.findIndex((l) => l.trim() === "---");
    let messageText: string;
    let buttonBlock: string | undefined;
    if (buttonSeparator >= 0) {
      messageText = textLines.slice(0, buttonSeparator).join("\n");
      buttonBlock = textLines.slice(buttonSeparator + 1).join("\n");
    } else {
      messageText = textLines.join("\n");
    }

    const keyboard = buttonBlock ? parseInlineButtons(buttonBlock) : undefined;

    try {
      if (ctx.message?.reply_to_message) {
        const replied = ctx.message.reply_to_message;
        if (replied.photo) {
          const fileId = replied.photo[replied.photo.length - 1].file_id;
          await ctx.api.sendPhoto(chatId, fileId, {
            caption: messageText,
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
        } else if (replied.video) {
          await ctx.api.sendVideo(chatId, replied.video.file_id, {
            caption: messageText,
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
        } else if (replied.animation) {
          await ctx.api.sendAnimation(chatId, replied.animation.file_id, {
            caption: messageText,
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
        } else if (replied.document) {
          await ctx.api.sendDocument(chatId, replied.document.file_id, {
            caption: messageText,
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
        } else if (replied.sticker) {
          await ctx.api.sendSticker(chatId, replied.sticker.file_id);
        } else if (replied.voice) {
          await ctx.api.sendVoice(chatId, replied.voice.file_id, {
            caption: messageText,
            parse_mode: "HTML",
          });
        } else {
          await ctx.api.sendMessage(chatId, messageText || ".", {
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
        }
      } else {
        await ctx.api.sendMessage(chatId, messageText || ".", {
          parse_mode: "HTML",
          reply_markup: keyboard,
        });
      }
      await ctx.reply("Сообщение отправлено!");
      await logAction({
        action: "send_message",
        performedBy: ctx.from!.id,
        targetChat: Number(chatId),
        details: `Message sent to ${chatId}`,
      });
    } catch (e: any) {
      await ctx.reply(`Ошибка: ${e.message}`);
    }
  });

  bot.command("sendphoto", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const replied = ctx.message?.reply_to_message;
    if (!replied?.photo) {
      await ctx.reply("Ответьте на фото и укажите /sendphoto <chat_id> [подпись]");
      return;
    }
    const parts = (ctx.match ?? "").split("\n");
    const chatId = parts[0]?.trim();
    const caption = parts.slice(1).join("\n");
    if (!chatId) {
      await ctx.reply("Укажите chat_id");
      return;
    }
    const fileId = replied.photo[replied.photo.length - 1].file_id;
    try {
      await ctx.api.sendPhoto(chatId, fileId, {
        caption,
        parse_mode: "HTML",
      });
      await ctx.reply("Фото отправлено!");
    } catch (e: any) {
      await ctx.reply(`Ошибка: ${e.message}`);
    }
  });

  bot.command("sendvideo", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const replied = ctx.message?.reply_to_message;
    if (!replied?.video && !replied?.animation) {
      await ctx.reply("Ответьте на видео/GIF и укажите /sendvideo <chat_id> [подпись]");
      return;
    }
    const parts = (ctx.match ?? "").split("\n");
    const chatId = parts[0]?.trim();
    const caption = parts.slice(1).join("\n");
    if (!chatId) {
      await ctx.reply("Укажите chat_id");
      return;
    }
    const fileId = replied.video?.file_id ?? replied.animation!.file_id;
    try {
      if (replied.animation) {
        await ctx.api.sendAnimation(chatId, fileId, { caption, parse_mode: "HTML" });
      } else {
        await ctx.api.sendVideo(chatId, fileId, { caption, parse_mode: "HTML" });
      }
      await ctx.reply("Видео отправлено!");
    } catch (e: any) {
      await ctx.reply(`Ошибка: ${e.message}`);
    }
  });

  bot.command("edit", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const args = (ctx.match ?? "").trim().split("\n");
    const firstParts = (args[0] ?? "").split(" ");
    const chatId = firstParts[0];
    const messageId = Number(firstParts[1]);
    const newText = args.slice(1).join("\n");
    if (!chatId || !messageId || !newText) {
      await ctx.reply("Использование:\n/edit <chat_id> <message_id>\nНовый текст");
      return;
    }
    try {
      await ctx.api.editMessageText(chatId, messageId, newText, { parse_mode: "HTML" });
      await ctx.reply("Сообщение изменено!");
    } catch (e: any) {
      await ctx.reply(`Ошибка: ${e.message}`);
    }
  });

  bot.command("delete", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const args = (ctx.match ?? "").trim().split(" ");
    const chatId = args[0];
    const messageId = Number(args[1]);
    if (!chatId || !messageId) {
      await ctx.reply("Использование: /delete <chat_id> <message_id>");
      return;
    }
    try {
      await ctx.api.deleteMessage(chatId, messageId);
      await ctx.reply("Сообщение удалено!");
    } catch (e: any) {
      await ctx.reply(`Ошибка: ${e.message}`);
    }
  });

  bot.command("pin", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const args = (ctx.match ?? "").trim().split(" ");
    const chatId = args[0];
    const messageId = Number(args[1]);
    const silent = args[2] === "silent";
    if (!chatId || !messageId) {
      await ctx.reply("Использование: /pin <chat_id> <message_id> [silent]");
      return;
    }
    try {
      await ctx.api.pinChatMessage(chatId, messageId, {
        disable_notification: silent,
      });
      await ctx.reply("Сообщение закреплено!");
    } catch (e: any) {
      await ctx.reply(`Ошибка: ${e.message}`);
    }
  });

  bot.command("unpin", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const args = (ctx.match ?? "").trim().split(" ");
    const chatId = args[0];
    const messageId = Number(args[1]);
    if (!chatId) {
      await ctx.reply("Использование: /unpin <chat_id> [message_id]");
      return;
    }
    try {
      if (messageId) {
        await ctx.api.unpinChatMessage(chatId, messageId);
      } else {
        await ctx.api.unpinAllChatMessages(chatId);
      }
      await ctx.reply("Сообщение откреплено!");
    } catch (e: any) {
      await ctx.reply(`Ошибка: ${e.message}`);
    }
  });

  bot.command("react", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const args = (ctx.match ?? "").trim().split(" ");
    const chatId = args[0];
    const messageId = Number(args[1]);
    const emoji = args[2] ?? "👍";
    if (!chatId || !messageId) {
      await ctx.reply("Использование: /react <chat_id> <message_id> <emoji>");
      return;
    }
    try {
      await ctx.api.setMessageReaction(chatId, messageId, [
        { type: "emoji", emoji: emoji as any },
      ]);
      await ctx.reply(`Реакция ${emoji} поставлена!`);
    } catch (e: any) {
      await ctx.reply(`Ошибка: ${e.message}`);
    }
  });

  bot.command("forward", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const args = (ctx.match ?? "").trim().split(" ");
    const toChatId = args[0];
    const fromChatId = args[1];
    const messageId = Number(args[2]);
    if (!toChatId || !fromChatId || !messageId) {
      await ctx.reply("Использование: /forward <to_chat_id> <from_chat_id> <message_id>");
      return;
    }
    try {
      await ctx.api.forwardMessage(toChatId, fromChatId, messageId);
      await ctx.reply("Сообщение переслано!");
    } catch (e: any) {
      await ctx.reply(`Ошибка: ${e.message}`);
    }
  });
}
