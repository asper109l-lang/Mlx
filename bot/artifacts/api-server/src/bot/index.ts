import { Bot } from "grammy";
import type { Context } from "grammy";
import { registerAdminHandlers } from "./handlers/admin.js";
import { registerSendHandlers } from "./handlers/send.js";
import { registerBroadcastHandlers } from "./handlers/broadcast.js";
import { registerScheduleHandlers, processScheduledMessages } from "./handlers/schedule.js";
import { registerInfoHandlers } from "./handlers/info.js";
import { registerChatTracker } from "./handlers/chat_tracker.js";
import { registerModerationHandlers } from "./handlers/moderation.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

export const bot = new Bot<Context>(token);

bot.catch((err) => {
  console.error("[Bot] Unhandled error:", err.message);
});

registerInfoHandlers(bot);
registerAdminHandlers(bot);
registerSendHandlers(bot);
registerBroadcastHandlers(bot);
registerScheduleHandlers(bot);
registerModerationHandlers(bot);
registerChatTracker(bot);

export async function startBot() {
  console.log("[Bot] Starting...");

  setInterval(async () => {
    await processScheduledMessages();
  }, 30_000);

  await bot.start({
    onStart: (info) => {
      console.log(`[Bot] Running as @${info.username} (${info.id})`);
    },
  });
}
