import { db } from "@workspace/db";
import { adminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Context } from "grammy";

const OWNER_ID = Number(process.env.BOT_OWNER_ID);

export function getOwnerId(): number {
  return OWNER_ID;
}

export function isOwner(userId: number): boolean {
  return userId === OWNER_ID;
}

export async function isAdmin(userId: number): Promise<boolean> {
  if (isOwner(userId)) return true;
  const admin = await db
    .select()
    .from(adminsTable)
    .where(eq(adminsTable.telegramId, userId))
    .limit(1);
  return admin.length > 0 && admin[0]!.isActive;
}

async function isGroupCreator(ctx: Context, userId: number): Promise<boolean> {
  const chatType = ctx.chat?.type;
  if (chatType !== "group" && chatType !== "supergroup") return false;
  try {
    const member = await ctx.api.getChatMember(ctx.chat!.id, userId);
    return member.status === "creator";
  } catch {
    return false;
  }
}

export async function requireAdmin(ctx: Context): Promise<boolean> {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply("Невозможно определить пользователя.");
    return false;
  }

  const botAdmin = await isAdmin(userId);
  if (botAdmin) return true;

  // Владелец (creator) самой группы тоже имеет права
  const creator = await isGroupCreator(ctx, userId);
  if (creator) return true;

  await ctx.reply("У вас нет прав для использования этой команды.");
  return false;
}

export async function requireOwner(ctx: Context): Promise<boolean> {
  const userId = ctx.from?.id;
  if (!userId || !isOwner(userId)) {
    await ctx.reply("Только владелец бота может выполнить эту команду.");
    return false;
  }
  return true;
}
