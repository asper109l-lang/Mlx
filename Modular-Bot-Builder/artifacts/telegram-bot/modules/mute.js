import { isAdminInChat, canTargetUser } from "../core/permissions.js";

const MUTE_DURATIONS = {
  "1m": 60,
  "5m": 300,
  "10m": 600,
  "30m": 1800,
  "1h": 3600,
  "6h": 21600,
  "12h": 43200,
  "1d": 86400,
  "7d": 604800,
};

export async function setup(bot) {
  bot.command("mute", async (ctx) => {
    if (!await isAdminInChat(ctx)) {
      await ctx.reply("❌ Только администраторы могут мутить.");
      return;
    }

    const target = await resolveTarget(ctx);
    if (!target) {
      await ctx.reply("ℹ️ Ответьте на сообщение или укажите ID: /mute <id> [длительность]\n\nДлительность: 1m, 5m, 30m, 1h, 6h, 12h, 1d, 7d");
      return;
    }

    if (!await canTargetUser(ctx, target.id)) {
      await ctx.reply("❌ Нельзя замутить этого пользователя.");
      return;
    }

    const durationArg = target.durationArg;
    const seconds = MUTE_DURATIONS[durationArg] ?? null;
    const untilDate = seconds ? Math.floor(Date.now() / 1000) + seconds : 0;

    try {
      await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
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
        until_date: untilDate,
      });

      const duration = durationArg ? ` на ${durationArg}` : " навсегда";
      await ctx.reply(
        `🔇 Пользователь <b>${escapeHtml(target.name)}</b> замучен${duration}.`,
        { parse_mode: "HTML" }
      );
    } catch (e) {
      await ctx.reply(`❌ Не удалось замутить: ${e.message}`);
    }
  });

  bot.command("unmute", async (ctx) => {
    if (!await isAdminInChat(ctx)) {
      await ctx.reply("❌ Только администраторы могут размучивать.");
      return;
    }

    const target = await resolveTarget(ctx);
    if (!target) {
      await ctx.reply("ℹ️ Ответьте на сообщение или укажите ID: /unmute <id>");
      return;
    }

    try {
      await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
        permissions: {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_change_info: false,
          can_invite_users: true,
          can_pin_messages: false,
        },
      });

      await ctx.reply(
        `🔊 Пользователь <b>${escapeHtml(target.name)}</b> размучен.`,
        { parse_mode: "HTML" }
      );
    } catch (e) {
      await ctx.reply(`❌ Не удалось размутить: ${e.message}`);
    }
  });
}

async function resolveTarget(ctx) {
  const reply = ctx.message.reply_to_message;
  const parts = ctx.message.text.split(" ");

  let id, name, durationArg;

  if (reply?.from) {
    id = reply.from.id;
    name = [reply.from.first_name, reply.from.last_name].filter(Boolean).join(" ");
    durationArg = parts[1] ?? null;
  } else if (parts[1]) {
    const parsed = parseInt(parts[1], 10);
    if (isNaN(parsed)) return null;
    id = parsed;
    name = String(id);
    durationArg = parts[2] ?? null;
  } else {
    return null;
  }

  return { id, name, durationArg };
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
