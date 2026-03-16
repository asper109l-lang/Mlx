import { InlineKeyboard, Keyboard } from "grammy";

export type ButtonConfig = {
  text: string;
  type: "callback" | "url" | "reply";
  data?: string;
  url?: string;
};

export type KeyboardRow = ButtonConfig[];

export function buildInlineKeyboard(rows: KeyboardRow[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const row of rows) {
    for (const btn of row) {
      if (btn.type === "callback") {
        kb.text(btn.text, btn.data ?? btn.text);
      } else if (btn.type === "url") {
        kb.url(btn.text, btn.url ?? "https://t.me");
      }
    }
    kb.row();
  }
  return kb;
}

export function buildReplyKeyboard(rows: string[][]): Keyboard {
  const kb = new Keyboard();
  for (const row of rows) {
    kb.row(...row);
  }
  return kb.resized();
}

export function parseInlineButtons(text: string): InlineKeyboard | undefined {
  const lines = text.trim().split("\n");
  if (lines.length === 0) return undefined;
  const kb = new InlineKeyboard();
  for (const line of lines) {
    const parts = line.split("|").map((s) => s.trim());
    for (const part of parts) {
      const urlMatch = part.match(/^(.+?)\s*-\s*(https?:\/\/.+)$/);
      const cbMatch = part.match(/^(.+?)\s*::\s*(.+)$/);
      if (urlMatch) {
        kb.url(urlMatch[1], urlMatch[2]);
      } else if (cbMatch) {
        kb.text(cbMatch[1], cbMatch[2]);
      } else {
        kb.text(part, part);
      }
    }
    kb.row();
  }
  return kb;
}
