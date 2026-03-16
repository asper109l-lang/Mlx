import type { Bot, Context } from "grammy";
import { db } from "@workspace/db";
import { knownChatsTable } from "@workspace/db";

export function registerChatTracker(bot: Bot<Context>) {
  bot.on("my_chat_member", async (ctx) => {
    const update = ctx.myChatMember;
    const chat = update.chat;
    const newStatus = update.new_chat_member.status;

    if (newStatus === "member" || newStatus === "administrator") {
      await db
        .insert(knownChatsTable)
        .values({
          chatId: chat.id,
          chatType: chat.type,
          title: "title" in chat ? chat.title : undefined,
          username: "username" in chat ? chat.username : undefined,
          isActive: true,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: knownChatsTable.chatId,
          set: {
            isActive: true,
            title: "title" in chat ? chat.title : undefined,
            updatedAt: new Date(),
          },
        });
      console.log(`[ChatTracker] Bot added to chat: ${chat.id} (${("title" in chat ? chat.title : chat.id)})`);
    } else if (newStatus === "left" || newStatus === "kicked") {
      await db
        .update(knownChatsTable)
        .set({ isActive: false })
        .where(
          (await import("drizzle-orm")).eq(knownChatsTable.chatId, chat.id)
        );
      console.log(`[ChatTracker] Bot removed from chat: ${chat.id}`);
    }
  });
}
