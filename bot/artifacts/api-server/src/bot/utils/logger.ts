import { db } from "@workspace/db";
import { logsTable } from "@workspace/db";

export async function logAction(params: {
  action: string;
  performedBy?: number;
  targetChat?: number;
  details?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(logsTable).values({
      action: params.action,
      performedBy: params.performedBy ?? null,
      targetChat: params.targetChat ?? null,
      details: params.details ?? null,
      metadata: params.metadata ?? null,
    });
  } catch (e) {
    console.error("[Logger] Failed to write log:", e);
  }
}
