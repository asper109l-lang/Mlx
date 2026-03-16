import { Telegraf } from "telegraf";
import config from "./core/config.js";
import { setupRouter } from "./core/router.js";
import { loadModules } from "./core/loader.js";

const bot = new Telegraf(config.BOT_TOKEN);

await loadModules(bot);

setupRouter(bot);

await bot.launch();
console.log("[bot] Bot started in polling mode");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
