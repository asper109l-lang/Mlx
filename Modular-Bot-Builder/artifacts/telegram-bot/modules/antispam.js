import { getSetting } from "../core/storage.js";

const FLOOD_LIMIT = 5;
const FLOOD_WINDOW_MS = 5000;
const MUTE_DURATION_SECONDS = 60;

const floodMap = new Map();

export async function setup(bot) {
  bot.on("text", async (ctx, next) => {
    if (ctx.message.text.startsWith("/")) return next();

    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const chatType = ctx.chat.type;

    if (chatType === "private") return next();

    const antispamEnabled = getSetting(chatId, "antispam_enabled", true);
    if (!antispamEnabled) return next();

    const key = `${chatId}:${userId}`;
    const now = Date.now();

    if (!floodMap.has(key)) {
      floodMap.set(key, []);
    }

    const timestamps = floodMap.get(key).filter((t) => now - t < FLOOD_WINDOW_MS);
    timestamps.push(now);
    floodMap.set(key, timestamps);

    if (timestamps.length >= FLOOD_LIMIT) {
      floodMap.delete(key);

      const isTgAdmin = await ctx.telegram
        .getChatMember(chatId, userId)
        .then((m) => ["administrator", "creator"].includes(m.status))
        .catch(() => false);

      if (isTgAdmin) return next();

      try {
        await ctx.deleteMessage();
      } catch {}

      try {
        await ctx.telegram.restrictChatMember(chatId, userId, {
          permissions: {
            can_send_messages: false,
            can_send_audios: false,
            can_send_documents: false,
            can_send_photos: false,
            can_send_videos: false,
            can_send_video_notes: false,
            can_send_voice_notes: false,
            can_send_polls: false,
            can_send_other_messages: false,
          },
          until_date: Math.floor(Date.now() / 1000) + MUTE_DURATION_SECONDS,
        });

        const name = escapeHtml(
          [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ")
        );
        const msg = await ctx.reply(
          `🚫 <b>${name}</b> замучен на 1 минуту за флуд.`,
          { parse_mode: "HTML" }
        );

        setTimeout(() => {
          ctx.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
        }, 10000);
      } catch {}

      return;
    }

    return next();
  });

  bot.command("antispam", async (ctx) => {
    const isTgAdmin = await ctx.telegram
      .getChatMember(ctx.chat.id, ctx.from.id)
      .then((m) => ["administrator", "creator"].includes(m.status))
      .catch(() => false);

    if (!isTgAdmin) {
      await ctx.reply("❌ Только администраторы могут управлять антиспамом.");
      return;
    }

    const arg = ctx.message.text.split(" ")[1]?.toLowerCase();
    const chatId = ctx.chat.id;

    if (arg === "on") {
      const { setSetting } = await import("../core/storage.js");
      setSetting(chatId, "antispam_enabled", true);
      await ctx.reply("✅ Антиспам включён.");
    } else if (arg === "off") {
      const { setSetting } = await import("../core/storage.js");
      setSetting(chatId, "antispam_enabled", false);
      await ctx.reply("🔕 Антиспам отключён.");
    } else {
      const enabled = getSetting(chatId, "antispam_enabled", true);
      await ctx.reply(
        `🛡 Антиспам: ${enabled ? "включён ✅" : "выключен ❌"}\n\n/antispam on — включить\n/antispam off — выключить\n\nЛимит: ${FLOOD_LIMIT} сообщений за ${FLOOD_WINDOW_MS / 1000} секунды → мут на 1 минуту`
      );
    }
  });
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
