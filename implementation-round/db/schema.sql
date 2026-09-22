-- db/schema.sql
CREATE TABLE IF NOT EXISTS users (
  id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('direct', 'group'))
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id BIGINT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  UNIQUE (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  convo_id   BIGINT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  sender_id  BIGINT NOT NULL REFERENCES users (id),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_convo_id_created_at_idx
  ON messages (convo_id, created_at);

CREATE INDEX IF NOT EXISTS conversation_members_user_id_idx
  ON conversation_members (user_id);
