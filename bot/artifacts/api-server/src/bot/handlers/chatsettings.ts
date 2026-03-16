import type { Bot } from "grammy";
import type { BotContext } from "../index.js";
import { requireAdmin } from "../utils/auth.js";
import { db } from "@workspace/db";
import {
  chatSettingsTable,
  wordFiltersTable,
} from "@workspace/db/schema/bot.js";
import { eq, and } from "drizzle-orm";

async function getSettings(chatId: number) {
  const [row] = await db
    .select()
    .from(chatSettingsTable)
    .where(eq(chatSettingsTable.chatId, chatId))
    .limit(1);
  return row ?? null;
}

async function upsertSettings(
  chatId: number,
  data: Partial<typeof chatSettingsTable.$inferInsert>,
) {
  await db
    .insert(chatSettingsTable)
    .values({ chatId, ...data })
    .onConflictDoUpdate({
      target: chatSettingsTable.chatId,
      set: { ...data, updatedAt: new Date() },
    });
}

function substituteVars(
  template: string,
  user: { first_name: string; last_name?: string; username?: string; id: number },
  chatTitle: string,
): string {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return template
    .replace(/\{имя\}/gi, user.first_name)
    .replace(/\{фамилия\}/gi, user.last_name ?? "")
    .replace(/\{полное_имя\}/gi, fullName)
    .replace(/\{username\}/gi, user.username ? `@${user.username}` : fullName)
    .replace(/\{чат\}/gi, chatTitle)
    .replace(/\{id\}/gi, String(user.id));
}

export function registerChatSettingsHandlers(bot: Bot<BotContext>) {
  // ── Welcome message ──────────────────────────────────────────
  bot.on("chat_member", async (ctx) => {
    const update = ctx.chatMember;
    if (!update) return;
    const { new_chat_member } = update;
    if (
      new_chat_member.status !== "member" &&
      new_chat_member.status !== "restricted"
    )
      return;

    const settings = await getSettings(ctx.chat.id);
    if (!settings?.welcomeText) return;

    const user = new_chat_member.user;
    const text = substituteVars(settings.welcomeText, user, ctx.chat.title ?? "");
    try {
      await ctx.reply(text, { parse_mode: "HTML" });
    } catch {}
  });

  // +приветствие text
  bot.hears(/^[!/.]?\+приветствие\s+([\s\S]+)$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;
    const text = ctx.match[1]?.trim();
    if (!text) return ctx.reply("Укажите текст приветствия.");
    await upsertSettings(ctx.chat.id, { welcomeText: text });
    await ctx.reply(
      `✅ Приветствие установлено.\n\nДоступные переменные: {имя}, {фамилия}, {полное_имя}, {username}, {чат}, {id}`,
    );
  });

  bot.hears(/^[!/.]?\-приветствие$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;
    await upsertSettings(ctx.chat.id, { welcomeText: null });
    await ctx.reply("✅ Приветствие отключено.");
  });

  bot.hears(/^[!/.]?приветствие$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    const settings = await getSettings(ctx.chat.id);
    if (!settings?.welcomeText) {
      return ctx.reply("Приветствие не настроено. Используйте +приветствие текст");
    }
    await ctx.reply(
      `📝 <b>Текущее приветствие:</b>\n\n${settings.welcomeText}`,
      { parse_mode: "HTML" },
    );
  });

  // /setwelcome command alias
  bot.command("setwelcome", async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;
    const text = String(ctx.match ?? "").trim();
    if (!text) return ctx.reply("Использование: /setwelcome текст\n\nПеременные: {имя}, {username}, {чат}");
    await upsertSettings(ctx.chat.id, { welcomeText: text });
    await ctx.reply("✅ Приветствие установлено.");
  });

  bot.command("welcome", async (ctx) => {
    if (!ctx.chat) return;
    const settings = await getSettings(ctx.chat.id);
    if (!settings?.welcomeText) {
      return ctx.reply("Приветствие не настроено. /setwelcome текст");
    }
    await ctx.reply(`📝 <b>Приветствие:</b>\n\n${settings.welcomeText}`, {
      parse_mode: "HTML",
    });
  });

  // ── Rules ───────────────────────────────────────────────────
  bot.hears(/^[!/.]?\+правила\s+([\s\S]+)$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;
    const text = ctx.match[1]?.trim();
    if (!text) return ctx.reply("Укажите текст правил.");
    await upsertSettings(ctx.chat.id, { rulesText: text });
    await ctx.reply("✅ Правила сохранены.");
  });

  bot.hears(/^[!/.]?\-правила$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;
    await upsertSettings(ctx.chat.id, { rulesText: null });
    await ctx.reply("✅ Правила удалены.");
  });

  bot.hears(/^[!/.]?правила$/i, async (ctx) => {
    if (!ctx.chat) return;
    const settings = await getSettings(ctx.chat.id);
    if (!settings?.rulesText) {
      return ctx.reply("Правила не установлены. Используйте +правила текст");
    }
    await ctx.reply(
      `📋 <b>Правила чата:</b>\n\n${settings.rulesText}`,
      { parse_mode: "HTML" },
    );
  });

  bot.command("rules", async (ctx) => {
    if (!ctx.chat) return;
    const settings = await getSettings(ctx.chat.id);
    if (!settings?.rulesText) {
      return ctx.reply("Правила не установлены. /setrules текст");
    }
    await ctx.reply(`📋 <b>Правила чата:</b>\n\n${settings.rulesText}`, {
      parse_mode: "HTML",
    });
  });

  bot.command("setrules", async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;
    const text = String(ctx.match ?? "").trim();
    if (!text) return ctx.reply("Использование: /setrules текст");
    await upsertSettings(ctx.chat.id, { rulesText: text });
    await ctx.reply("✅ Правила сохранены.");
  });

  // ── Word filters ────────────────────────────────────────────
  bot.hears(/^[!/.]?\+фильтр\s+(.+)$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;
    const word = ctx.match[1]?.trim().toLowerCase();
    if (!word) return ctx.reply("Укажите слово для фильтра.");
    await db.insert(wordFiltersTable).values({
      chatId: ctx.chat.id,
      word,
      addedBy: ctx.from?.id ?? 0,
    });
    await upsertSettings(ctx.chat.id, { wordsFilter: true });
    await ctx.reply(`✅ Слово <code>${word}</code> добавлено в фильтр.`, {
      parse_mode: "HTML",
    });
  });

  bot.command("addfilter", async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;
    const word = String(ctx.match ?? "").trim().toLowerCase();
    if (!word) return ctx.reply("Использование: /addfilter слово");
    await db.insert(wordFiltersTable).values({
      chatId: ctx.chat.id,
      word,
      addedBy: ctx.from?.id ?? 0,
    });
    await upsertSettings(ctx.chat.id, { wordsFilter: true });
    await ctx.reply(`✅ Слово <code>${word}</code> добавлено в фильтр.`, {
      parse_mode: "HTML",
    });
  });

  bot.hears(/^[!/.]?\-фильтр\s+(.+)$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;
    const word = ctx.match[1]?.trim().toLowerCase();
    if (!word) return ctx.reply("Укажите слово.");
    await db
      .delete(wordFiltersTable)
      .where(
        and(
          eq(wordFiltersTable.chatId, ctx.chat.id),
          eq(wordFiltersTable.word, word),
        ),
      );
    await ctx.reply(`✅ Слово <code>${word}</code> удалено из фильтра.`, {
      parse_mode: "HTML",
    });
  });

  bot.command("removefilter", async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;
    const word = String(ctx.match ?? "").trim().toLowerCase();
    if (!word) return ctx.reply("Использование: /removefilter слово");
    await db
      .delete(wordFiltersTable)
      .where(
        and(
          eq(wordFiltersTable.chatId, ctx.chat.id),
          eq(wordFiltersTable.word, word),
        ),
      );
    await ctx.reply(`✅ Слово <code>${word}</code> удалено.`, {
      parse_mode: "HTML",
    });
  });

  bot.hears(/^[!/.]?фильтры$/i, async (ctx) => {
    if (!ctx.chat) return;
    const words = await db
      .select()
      .from(wordFiltersTable)
      .where(eq(wordFiltersTable.chatId, ctx.chat.id));
    if (!words.length) return ctx.reply("Список фильтров пуст.");
    const list = words.map((w) => `• <code>${w.word}</code>`).join("\n");
    await ctx.reply(`🚫 <b>Слова-фильтры:</b>\n${list}`, {
      parse_mode: "HTML",
    });
  });

  bot.command("filters", async (ctx) => {
    if (!ctx.chat) return;
    const words = await db
      .select()
      .from(wordFiltersTable)
      .where(eq(wordFiltersTable.chatId, ctx.chat.id));
    if (!words.length) return ctx.reply("Список фильтров пуст.");
    const list = words.map((w) => `• <code>${w.word}</code>`).join("\n");
    await ctx.reply(`🚫 <b>Слова-фильтры:</b>\n${list}`, {
      parse_mode: "HTML",
    });
  });

  // ── Links filter toggle ──────────────────────────────────────
  bot.hears(/^[!/.]?\+ссылки$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;
    await upsertSettings(ctx.chat.id, { linksFilter: true });
    await ctx.reply("✅ Фильтр ссылок включён. Все сообщения со ссылками будут удаляться.");
  });

  bot.hears(/^[!/.]?\-ссылки$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;
    await upsertSettings(ctx.chat.id, { linksFilter: false });
    await ctx.reply("✅ Фильтр ссылок отключён.");
  });

  bot.command("linksfilter", async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;
    const arg = String(ctx.match ?? "").trim().toLowerCase();
    if (arg === "on" || arg === "вкл") {
      await upsertSettings(ctx.chat.id, { linksFilter: true });
      await ctx.reply("✅ Фильтр ссылок включён.");
    } else if (arg === "off" || arg === "выкл") {
      await upsertSettings(ctx.chat.id, { linksFilter: false });
      await ctx.reply("✅ Фильтр ссылок отключён.");
    } else {
      const settings = await getSettings(ctx.chat.id);
      const status = settings?.linksFilter ? "включён ✅" : "выключен ❌";
      await ctx.reply(
        `🔗 Фильтр ссылок: ${status}\n\nВключить: /linksfilter on\nВыключить: /linksfilter off`,
      );
    }
  });

  // ── Anti-spam settings ───────────────────────────────────────
  bot.hears(/^[!/.]?\+антиспам(?:\s+(\d+)(?:[\s/](\d+))?)?$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;
    const maxMsgs = parseInt(ctx.match[1] ?? "5") || 5;
    const periodSec = parseInt(ctx.match[2] ?? "5") || 5;
    await upsertSettings(ctx.chat.id, {
      antispamEnabled: true,
      antispamMaxMsgs: maxMsgs,
      antispamPeriodSec: periodSec,
    });
    await ctx.reply(
      `✅ Антиспам включён: не более ${maxMsgs} сообщений за ${periodSec} секунд.`,
    );
  });

  bot.hears(/^[!/.]?\-антиспам$/i, async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;
    await upsertSettings(ctx.chat.id, { antispamEnabled: false });
    await ctx.reply("✅ Антиспам отключён.");
  });

  bot.command("antispam", async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return;
    if (!(await requireAdmin(ctx))) return;
    const args = String(ctx.match ?? "").trim().split(/\s+/);
    if (args[0] === "on" || args[0] === "вкл") {
      const maxMsgs = parseInt(args[1] ?? "5") || 5;
      const periodSec = parseInt(args[2] ?? "5") || 5;
      await upsertSettings(ctx.chat.id, {
        antispamEnabled: true,
        antispamMaxMsgs: maxMsgs,
        antispamPeriodSec: periodSec,
      });
      await ctx.reply(`✅ Антиспам включён: ${maxMsgs} сообщений за ${periodSec}с.`);
    } else if (args[0] === "off" || args[0] === "выкл") {
      await upsertSettings(ctx.chat.id, { antispamEnabled: false });
      await ctx.reply("✅ Антиспам отключён.");
    } else {
      const settings = await getSettings(ctx.chat.id);
      const status = settings?.antispamEnabled ? "включён ✅" : "выключен ❌";
      await ctx.reply(
        `🛡 Антиспам: ${status}\n\nВключить: /antispam on [макс_сообщ] [период_сек]\nВыключить: /antispam off`,
      );
    }
  });

  // ── Chat info ────────────────────────────────────────────────
  bot.command("chatinfo", async (ctx) => {
    if (!ctx.chat) return;
    const settings = await getSettings(ctx.chat.id);
    const lines = [
      `ℹ️ <b>Настройки чата</b>`,
      ``,
      `🆔 ID: <code>${ctx.chat.id}</code>`,
      `📝 Название: ${ctx.chat.title ?? "—"}`,
      `👋 Приветствие: ${settings?.welcomeText ? "✅" : "❌"}`,
      `📋 Правила: ${settings?.rulesText ? "✅" : "❌"}`,
      `🛡 Антиспам: ${settings?.antispamEnabled ? `✅ (${settings.antispamMaxMsgs} сообщ/${settings.antispamPeriodSec}с)` : "❌"}`,
      `🔗 Фильтр ссылок: ${settings?.linksFilter ? "✅" : "❌"}`,
      `🚫 Фильтр слов: ${settings?.wordsFilter ? "✅" : "❌"}`,
    ];
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });
}
