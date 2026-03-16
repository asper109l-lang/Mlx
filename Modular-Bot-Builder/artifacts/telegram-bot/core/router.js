const UPDATE_TYPES = [
  "message",
  "edited_message",
  "channel_post",
  "edited_channel_post",
  "callback_query",
  "inline_query",
  "chosen_inline_result",
  "shipping_query",
  "pre_checkout_query",
  "poll",
  "poll_answer",
  "chat_member",
  "my_chat_member",
  "chat_join_request",
  "message_reaction",
  "message_reaction_count",
  "chat_boost",
  "removed_chat_boost",
  "business_connection",
  "business_message",
  "edited_business_message",
  "deleted_business_messages",
  "purchased_paid_media",
];

const MESSAGE_SUBTYPES = [
  "text",
  "photo",
  "video",
  "voice",
  "audio",
  "sticker",
  "animation",
  "document",
  "location",
  "contact",
  "dice",
  "new_chat_members",
  "left_chat_member",
  "pinned_message",
  "forum_topic_created",
  "forum_topic_closed",
  "forum_topic_reopened",
  "forum_topic_edited",
  "video_note",
  "venue",
  "game",
  "invoice",
  "successful_payment",
  "migrate_to_chat_id",
  "migrate_from_chat_id",
  "group_chat_created",
  "supergroup_chat_created",
  "channel_chat_created",
  "delete_chat_photo",
  "new_chat_title",
  "new_chat_photo",
  "web_app_data",
];

export function setupRouter(bot) {
  for (const updateType of UPDATE_TYPES) {
    bot.on(updateType, async (ctx, next) => {
      console.log(`[router] Update: ${updateType} from ${ctx.from?.id ?? "unknown"}`);
      return next();
    });
  }

  for (const subtype of MESSAGE_SUBTYPES) {
    bot.on(subtype, async (ctx, next) => {
      console.log(`[router] Message: ${subtype} from ${ctx.from?.id ?? "unknown"}`);
      return next();
    });
  }

  const total = UPDATE_TYPES.length + MESSAGE_SUBTYPES.length;
  console.log(
    `[router] Registered ${UPDATE_TYPES.length} update-type handlers + ${MESSAGE_SUBTYPES.length} message-subtype handlers (${total} total)`
  );
}

export { UPDATE_TYPES, MESSAGE_SUBTYPES };
