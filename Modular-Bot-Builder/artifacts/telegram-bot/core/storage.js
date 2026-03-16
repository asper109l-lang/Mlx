import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_DIR = join(__dirname, "..", "data", "chats");

function getChatPath(chatId) {
  return join(BASE_DIR, `${chatId}.json`);
}

function loadChat(chatId) {
  const path = getChatPath(chatId);
  mkdirSync(BASE_DIR, { recursive: true });
  if (!existsSync(path)) {
    const def = { owner: null, admins: [], users: {}, modules: {}, settings: {} };
    writeFileSync(path, JSON.stringify(def, null, 2), "utf-8");
    return def;
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { owner: null, admins: [], users: {}, modules: {}, settings: {} };
  }
}

function saveChat(chatId, data) {
  mkdirSync(BASE_DIR, { recursive: true });
  writeFileSync(getChatPath(chatId), JSON.stringify(data, null, 2), "utf-8");
}

export function getOwner(chatId) {
  return loadChat(chatId).owner;
}

export function setOwner(chatId, userId) {
  const data = loadChat(chatId);
  if (data.owner === null) {
    data.owner = userId;
    saveChat(chatId, data);
  }
  return data.owner;
}

export function isOwner(chatId, userId) {
  return loadChat(chatId).owner === userId;
}

export function getAdmins(chatId) {
  return loadChat(chatId).admins ?? [];
}

export function addAdmin(chatId, userId) {
  const data = loadChat(chatId);
  if (!data.admins.includes(userId) && data.owner !== userId) {
    data.admins.push(userId);
    saveChat(chatId, data);
  }
}

export function removeAdmin(chatId, userId) {
  const data = loadChat(chatId);
  data.admins = data.admins.filter((id) => id !== userId);
  saveChat(chatId, data);
}

export function isBotAdmin(chatId, userId) {
  const data = loadChat(chatId);
  return data.owner === userId || (data.admins ?? []).includes(userId);
}

export function getUser(chatId, userId) {
  return loadChat(chatId).users?.[String(userId)] ?? {};
}

export function saveUser(chatId, userId, userData) {
  const data = loadChat(chatId);
  data.users ??= {};
  data.users[String(userId)] = userData;
  saveChat(chatId, data);
}

export function getSetting(chatId, key, defaultValue = null) {
  return loadChat(chatId).settings?.[key] ?? defaultValue;
}

export function setSetting(chatId, key, value) {
  const data = loadChat(chatId);
  data.settings ??= {};
  data.settings[key] = value;
  saveChat(chatId, data);
}

export function isModuleEnabled(chatId, module, defaultEnabled = true) {
  const data = loadChat(chatId);
  if (!(module in (data.modules ?? {}))) return defaultEnabled;
  return data.modules[module];
}

export function setModule(chatId, module, enabled) {
  const data = loadChat(chatId);
  data.modules ??= {};
  data.modules[module] = enabled;
  saveChat(chatId, data);
}
