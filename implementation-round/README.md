# 2026-09-21 AI Implementation Round

Please refer to [.\chat-history.md](.\chat-history.md)

Thank you!

---

# Messaging

A minimal messaging backend: users, direct and group conversations, and messages. Node, Express, and Postgres.

## Structure

- `src/` — Express app (`app.js`), entrypoint (`server.js`), config, shared Postgres pool (`db.js`), JWT helpers (`token.js`), and error types
- `src/routes/` — one router per resource (`users`, `conversations`, `health`)
- `src/middleware/` — JWT authentication and error handling
- `public/` — browser UI served statically: `index.html`, `styles.css`, `api.js` (API client), `app.js` (UI logic)
- `test/` — API integration tests
- `db/schema.sql` — table and index definitions (idempotent)
- `db/seed.sql` — dummy data; truncates all tables first, so it is safe to re-run
- `scripts/run-sql.js` — runs a SQL file against `DATABASE_URL`

## Data model

- `users` — `id`, `name`
- `conversations` — `id`, `type` (`direct` or `group`)
- `conversation_members` — `conversation_id`, `user_id`; each pair is unique
- `messages` — `id`, `convo_id`, `sender_id`, `content`, `created_at`; indexed on `(convo_id, created_at)`

## Setup

Requires Node 20+ and a running Postgres with a `blink` database.

```sh
npm install
cp .env.example .env
npm run db:schema
npm run db:seed
```

## Run

```sh
npm run dev     # nodemon, restarts on changes in src/
npm start
```

`GET /health` returns `{"status":"ok"}` when the database is reachable.

## UI

Open `http://localhost:3000/` and pick a user, or go straight to `http://localhost:3000/?user=1`. The page logs in as that user and keeps the token in memory. Each browser window or tab is its own signed-in user, so open two with different `user` values to demo two people messaging. The UI polls for new messages.

A signed-in user can:

- see their conversations, most recent first
- open a conversation and read its messages
- send a message
- create a group

## API

Clients authenticate with a JWT sent as `Authorization: Bearer <token>`. `POST /login` is a mock login: it issues a token for any existing user id, with no credentials. Errors return `{"error": "..."}`.

| Endpoint                                         | Description                                                                                                                                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /login`                                    | Body: `{"user_id": 1}`; returns `{token, user}`                                                                                                                                                                                             |
| `GET /users`                                     | List all users                                                                                                                                                                                                                              |
| `GET /users/:userId/conversations`               | List the user's conversations with members and last message, most recent first                                                                                                                                                              |
| `POST /users/:userId/conversations`              | Create a group. Body: `{"member_ids": [2, 3]}`; the user is added automatically and at least 2 distinct members are required; returns `409` with the existing `conversation_id` if a conversation with exactly those members already exists |
| `GET /users/:userId/conversations/:id/messages`  | List messages oldest first; `limit` (default 50, max 100) returns the most recent N                                                                                                                                                         |
| `POST /users/:userId/conversations/:id/messages` | Send a message as the user. Body: `{"content": "..."}`                                                                                                                                                                                      |

Everything under `/users/:userId/conversations` requires a valid token (`401` otherwise), and `:userId` must be the token's user (`403` otherwise). Only a conversation's members can read or send messages; anyone else receives `403`. Groups are immutable once created.

```sh
TOKEN=$(curl -s -H 'content-type: application/json' -d '{"user_id": 1}' localhost:3000/login | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -H "authorization: Bearer $TOKEN" localhost:3000/users/1/conversations
```

## Test

Tests run against the `DATABASE_URL` database and remove the rows they create.

```sh
npm test
```
