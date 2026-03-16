import type { NextFunction } from "grammy";
import type { BotContext } from "../index.js";
import { db } from "@workspace/db";
import { chatSettingsTable, wordFiltersTable } from "@workspace/db/schema/bot.js";
import { eq } from "drizzle-orm";

const settingsCache = new Map<number, {
  linksFilter: boolean;
  wordsFilter: boolean;
  expiry: number;
}>();

const wordsCache = new Map<number, { words: string[]; expiry: number }>();

const URL_RE =
  /(?:https?:\/\/|www\.)[^\s]+|t\.me\/[^\s]+|@[a-zA-Z0-9_]{5,}/gi;

export function invalidateFiltersCache(chatId: number) {
  settingsCache.delete(chatId);
  wordsCache.delete(chatId);
}

async function getFilterSettings(chatId: number) {
  const cached = settingsCache.get(chatId);
  if (cached && cached.expiry > Date.now()) return cached;

  const [row] = await db
    .select({
      linksFilter: chatSettingsTable.linksFilter,
      wordsFilter: chatSettingsTable.wordsFilter,
    })
    .from(chatSettingsTable)
    .where(eq(chatSettingsTable.chatId, chatId))
    .limit(1);

  if (!row) {
    const result = { linksFilter: false, wordsFilter: false, expiry: Date.now() + 30000 };
    settingsCache.set(chatId, result);
    return result;
  }

  const result = { ...row, expiry: Date.now() + 30000 };
  settingsCache.set(chatId, result);
  return result;
}

async function getFilterWords(chatId: number): Promise<string[]> {
  const cached = wordsCache.get(chatId);
  if (cached && cached.expiry > Date.now()) return cached.words;

  const rows = await db
    .select({ word: wordFiltersTable.word })
    .from(wordFiltersTable)
    .where(eq(wordFiltersTable.chatId, chatId));

  const words = rows.map((r) => r.word.toLowerCase());
  wordsCache.set(chatId, { words, expiry: Date.now() + 60000 });
  return words;
}

export async function filtersMiddleware(
  ctx: BotContext,
  next: NextFunction,
): Promise<void> {
  if (
    !ctx.chat ||
    ctx.chat.type === "private" ||
    !ctx.message ||
    !ctx.from
  ) {
    return next();
  }

  const settings = await getFilterSettings(ctx.chat.id);
  if (!settings.linksFilter && !settings.wordsFilter) return next();

  const text =
    ctx.message.text ?? ctx.message.caption ?? "";
  const textLower = text.toLowerCase();

  // Links filter
  if (settings.linksFilter && URL_RE.test(text)) {
    URL_RE.lastIndex = 0;
    try {
      await ctx.deleteMessage();
      const name = [ctx.from.first_name, ctx.from.last_name]
        .filter(Boolean)
        .join(" ");
      const msg = await ctx.reply(
        `🔗 <b>${name}</b>, ссылки запрещены в этом чате.`,
        { parse_mode: "HTML" },
      );
      setTimeout(async () => {
        try {
          await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id);
        } catch {}
      }, 5000);
    } catch {}
    return;
  }
  URL_RE.lastIndex = 0;

  // Word filter
  if (settings.wordsFilter) {
    const words = await getFilterWords(ctx.chat.id);
    const found = words.find((w) => textLower.includes(w));
    if (found) {
      try {
        await ctx.deleteMessage();
        const name = [ctx.from.first_name, ctx.from.last_name]
          .filter(Boolean)
          .join(" ");
        const msg = await ctx.reply(
          `🚫 <b>${name}</b>, сообщение удалено (запрещённое слово).`,
          { parse_mode: "HTML" },
        );
        setTimeout(async () => {
          try {
            await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id);
          } catch {}
        }, 5000);
      } catch {}
      return;
    }
  }

  return next();
}
