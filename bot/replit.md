# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Express API server + Telegram Bot (grammY).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Telegram Bot**: grammY framework

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   └── api-server/         # Express API server + Telegram Bot
│       └── src/bot/        # Bot logic
│           ├── handlers/   # Command handlers (send, admin, broadcast, schedule, info)
│           ├── utils/      # Auth, logger, keyboard helpers
│           └── index.ts    # Bot entry point
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
│       └── src/schema/
│           └── bot.ts      # Bot DB tables (admins, logs, broadcasts, scheduled, chats)
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Bot Features

### Commands (Admin/Owner only)

**Sending:**
- `/send <chat_id>\nText\n---\nButtons` — send text/media with optional inline buttons
- `/sendphoto <chat_id>` — send photo (reply to photo)
- `/sendvideo <chat_id>` — send video/GIF (reply to video/GIF)
- `/forward <to> <from> <msg_id>` — forward message

**Editing:**
- `/edit <chat_id> <msg_id>\nNew text` — edit message
- `/delete <chat_id> <msg_id>` — delete message

**Pinning:**
- `/pin <chat_id> <msg_id> [silent]` — pin message
- `/unpin <chat_id> [msg_id]` — unpin message

**Reactions:**
- `/react <chat_id> <msg_id> <emoji>` — set reaction

**Scheduler:**
- `/schedule <chat_id> <YYYY-MM-DD HH:MM>\nText` — schedule message
- `/scheduled` — list pending
- `/cancelschedule <id>` — cancel

**Broadcast:**
- `/broadcast\nText\n---\nButtons` — broadcast to all known chats
- `/addchat <chat_id> [title]` — add chat to broadcast list
- `/removechat <chat_id>` — remove chat
- `/chats` — list chats

**Info:**
- `/chatinfo [chat_id]` — chat info
- `/myid` — user/chat ID
- `/getfileid` — get file_id from media
- `/logs` — action logs

**Owner only:**
- `/addadmin <user_id> [name]` — add admin
- `/removeadmin <user_id>` — remove admin
- `/admins` — list admins

## Button Format

```
Button Text - https://example.com | Button2 :: callback_data
Next Row Button - https://example.com
```

## DB Tables

- `bot_admins` — admin list
- `bot_logs` — action log
- `scheduled_messages` — scheduled messages
- `bot_broadcasts` — broadcast history
- `bot_known_chats` — chat list for broadcasts

## Secrets Required

- `TELEGRAM_BOT_TOKEN` — bot token from @BotFather
- `BOT_OWNER_ID` — owner's Telegram user ID
