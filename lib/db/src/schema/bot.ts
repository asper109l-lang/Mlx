import { pgTable, text, serial, bigint, boolean, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adminsTable = pgTable("bot_admins", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  fullName: text("full_name"),
  addedBy: bigint("added_by", { mode: "number" }).notNull(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

export const scheduledMessagesTable = pgTable("scheduled_messages", {
  id: serial("id").primaryKey(),
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  messageData: jsonb("message_data").notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  sentAt: timestamp("sent_at"),
  isSent: boolean("is_sent").default(false).notNull(),
  isCancelled: boolean("is_cancelled").default(false).notNull(),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const broadcastsTable = pgTable("bot_broadcasts", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(),
  mediaType: text("media_type"),
  mediaFileId: text("media_file_id"),
  buttonData: jsonb("button_data"),
  sentTo: integer("sent_to").default(0).notNull(),
  failedCount: integer("failed_count").default(0).notNull(),
  status: text("status").default("pending").notNull(),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const logsTable = pgTable("bot_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  performedBy: bigint("performed_by", { mode: "number" }),
  targetChat: bigint("target_chat", { mode: "number" }),
  details: text("details"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const knownChatsTable = pgTable("bot_known_chats", {
  id: serial("id").primaryKey(),
  chatId: bigint("chat_id", { mode: "number" }).notNull().unique(),
  chatType: text("chat_type").notNull(),
  title: text("title"),
  username: text("username"),
  isActive: boolean("is_active").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const warningsTable = pgTable("bot_warnings", {
  id: serial("id").primaryKey(),
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  reason: text("reason"),
  issuedBy: bigint("issued_by", { mode: "number" }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mutesTable = pgTable("bot_mutes", {
  id: serial("id").primaryKey(),
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  reason: text("reason"),
  mutedUntil: timestamp("muted_until"),
  isActive: boolean("is_active").default(true).notNull(),
  mutedBy: bigint("muted_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bansTable = pgTable("bot_bans", {
  id: serial("id").primaryKey(),
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  reason: text("reason"),
  bannedBy: bigint("banned_by", { mode: "number" }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAdminSchema = createInsertSchema(adminsTable).omit({ id: true, addedAt: true });
export const insertLogSchema = createInsertSchema(logsTable).omit({ id: true, createdAt: true });
export const insertScheduledSchema = createInsertSchema(scheduledMessagesTable).omit({ id: true, createdAt: true, sentAt: true });
export const insertBroadcastSchema = createInsertSchema(broadcastsTable).omit({ id: true, createdAt: true, completedAt: true });

export type Admin = typeof adminsTable.$inferSelect;
export type Log = typeof logsTable.$inferSelect;
export type ScheduledMessage = typeof scheduledMessagesTable.$inferSelect;
export type Broadcast = typeof broadcastsTable.$inferSelect;
export type KnownChat = typeof knownChatsTable.$inferSelect;
export type Warning = typeof warningsTable.$inferSelect;
export type Mute = typeof mutesTable.$inferSelect;
export type Ban = typeof bansTable.$inferSelect;

export const chatSettingsTable = pgTable("chat_settings", {
  chatId: bigint("chat_id", { mode: "number" }).primaryKey(),
  welcomeText: text("welcome_text"),
  rulesText: text("rules_text"),
  farewellText: text("farewell_text"),
  antispamEnabled: boolean("antispam_enabled").default(false).notNull(),
  antispamMaxMsgs: integer("antispam_max_msgs").default(5).notNull(),
  antispamPeriodSec: integer("antispam_period_sec").default(5).notNull(),
  linksFilter: boolean("links_filter").default(false).notNull(),
  wordsFilter: boolean("words_filter").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const wordFiltersTable = pgTable("word_filters", {
  id: serial("id").primaryKey(),
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  word: text("word").notNull(),
  addedBy: bigint("added_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatModeratorsTable = pgTable("chat_moderators", {
  id: serial("id").primaryKey(),
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  rank: integer("rank").default(1).notNull(),
  username: text("username"),
  fullName: text("full_name"),
  assignedBy: bigint("assigned_by", { mode: "number" }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const triggersTable = pgTable("chat_triggers", {
  id: serial("id").primaryKey(),
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  triggerText: text("trigger_text").notNull(),
  responseText: text("response_text"),
  responseType: text("response_type").default("text").notNull(),
  isExact: boolean("is_exact").default(false).notNull(),
  isDelete: boolean("is_delete").default(false).notNull(),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ChatSettings = typeof chatSettingsTable.$inferSelect;
export type WordFilter = typeof wordFiltersTable.$inferSelect;
export type ChatModerator = typeof chatModeratorsTable.$inferSelect;
export type Trigger = typeof triggersTable.$inferSelect;
