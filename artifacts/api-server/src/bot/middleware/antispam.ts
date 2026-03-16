import type { NextFunction } from "grammy";
import type { BotContext } from "../index.js";
import { db } from "@workspace/db";
import { chatSettingsTable } from "@workspace/db/schema/bot.js";
import { eq } from "drizzle-orm";

// In-memory tracker: key = `${chatId}:${userId}`, value = timestamps[]
const tracker = new Map<string, number[]>();
const warned = new Map<string, number>(); // last warn timestamp

// Cache settings to avoid DB hit on every message
const settingsCache = new Map<number, {
  antispamEnabled: boolean;
  antispamMaxMsgs: number;
  antispamPeriodSec: number;
  expiry: number;
}>();

async function getAntispamSettings(chatId: number) {
  const cached = settingsCache.get(chatId);
  if (cached && cached.expiry > Date.now()) return cached;

  const [row] = await db
    .select({
      antispamEnabled: chatSettingsTable.antispamEnabled,
      antispamMaxMsgs: chatSettingsTable.antispamMaxMsgs,
      antispamPeriodSec: chatSettingsTable.antispamPeriodSec,
    })
    .from(chatSettingsTable)
    .where(eq(chatSettingsTable.chatId, chatId))
    .limit(1);

  if (!row) {
    settingsCache.set(chatId, {
      antispamEnabled: false,
      antispamMaxMsgs: 5,
      antispamPeriodSec: 5,
      expiry: Date.now() + 30000,
    });
    return null;
  }

  const result = { ...row, expiry: Date.now() + 30000 };
  settingsCache.set(chatId, result);
  return result;
}

// Invalidate cache when settings change
export function invalidateAntispamCache(chatId: number) {
  settingsCache.delete(chatId);
}

export async function antispamMiddleware(
  ctx: BotContext,
  next: NextFunction,
): Promise<void> {
  // Only in groups, only for regular messages
  if (
    !ctx.chat ||
    ctx.chat.type === "private" ||
    !ctx.message ||
    !ctx.from
  ) {
    return next();
  }

  const settings = await getAntispamSettings(ctx.chat.id);
  if (!settings?.antispamEnabled) return next();

  const key = `${ctx.chat.id}:${ctx.from.id}`;
  const now = Date.now();
  const windowMs = settings.antispamPeriodSec * 1000;

  const times = (tracker.get(key) ?? []).filter((t) => now - t < windowMs);
  times.push(now);
  tracker.set(key, times);

  if (times.length > settings.antispamMaxMsgs) {
    // Flood detected — delete message, warn user once per 10s
    try {
      await ctx.deleteMessage();
    } catch {}

    const lastWarn = warned.get(key) ?? 0;
    if (now - lastWarn > 10000) {
      warned.set(key, now);
      try {
        const name = [ctx.from.first_name, ctx.from.last_name]
          .filter(Boolean)
          .join(" ");
        const msg = await ctx.reply(
          `⚠️ <b>${name}</b>, не флудите! Медленнее.`,
          { parse_mode: "HTML" },
        );
        setTimeout(async () => {
          try {
            await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id);
          } catch {}
        }, 5000);
      } catch {}
    }
    return;
  }

  return next();
}
