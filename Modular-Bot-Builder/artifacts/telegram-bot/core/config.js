const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN is not set. Please set the BOT_TOKEN environment variable.");
}

export default {
  BOT_TOKEN,
};
