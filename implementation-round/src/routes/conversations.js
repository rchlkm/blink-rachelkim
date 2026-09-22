// src/routes/conversations.js
import { Router } from 'express';
import { config } from '../config.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { authenticate, requireSelf } from '../middleware/authenticate.js';
import { parseId } from '../validation.js';

export const conversationsRouter = Router({ mergeParams: true });

conversationsRouter.use(authenticate, requireSelf);

const LIST_CONVERSATIONS = `
  SELECT c.id, c.type,
    (SELECT json_agg(json_build_object('id', u.id, 'name', u.name) ORDER BY u.id)
       FROM conversation_members cm2
       JOIN users u ON u.id = cm2.user_id
      WHERE cm2.conversation_id = c.id) AS members,
    to_jsonb(last) AS last_message
  FROM conversation_members cm
  JOIN conversations c ON c.id = cm.conversation_id
  LEFT JOIN LATERAL (
    SELECT id, sender_id, content, created_at
      FROM messages
     WHERE convo_id = c.id
     ORDER BY created_at DESC, id DESC
     LIMIT 1
  ) last ON true
  WHERE cm.user_id = $1
  ORDER BY last.created_at DESC NULLS LAST, c.id DESC`;

const FIND_CONVERSATION_BY_MEMBERS = `
  SELECT conversation_id AS id
    FROM conversation_members
   WHERE conversation_id IN (SELECT conversation_id FROM conversation_members WHERE user_id = $2)
   GROUP BY conversation_id
  HAVING array_agg(user_id ORDER BY user_id) = $1::bigint[]
   LIMIT 1`;

const CREATE_GROUP = `
  WITH convo AS (
    INSERT INTO conversations (type) VALUES ($1) RETURNING id, type
  ), added AS (
    INSERT INTO conversation_members (conversation_id, user_id)
    SELECT convo.id, unnest($2::bigint[]) FROM convo
  )
  SELECT id, type FROM convo`;

const LIST_MESSAGES = `
  SELECT id, convo_id, sender_id, content, created_at FROM (
    SELECT id, convo_id, sender_id, content, created_at
      FROM messages
     WHERE convo_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2
  ) recent
  ORDER BY created_at, id`;

const CREATE_MESSAGE = `
  INSERT INTO messages (convo_id, sender_id, content)
  VALUES ($1, $2, $3)
  RETURNING id, convo_id, sender_id, content, created_at`;

async function requireMember(req, res, next) {
  const conversationId = parseId(req.params.id, 'conversation id');
  const { rowCount } = await pool.query(
    'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, req.user.id],
  );
  if (!rowCount) throw new HttpError(403, 'Not a member of this conversation');

  req.conversationId = conversationId;
  next();
}

conversationsRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(LIST_CONVERSATIONS, [req.user.id]);
  res.json(rows);
});

conversationsRouter.post('/', async (req, res) => {
  const { member_ids: memberIds } = req.body ?? {};
  if (!Array.isArray(memberIds)) throw new HttpError(400, 'member_ids must be an array');

  const ids = [...new Set([req.user.id, ...memberIds.map((id) => parseId(id, 'member_ids'))])].sort(
    (a, b) => a - b,
  );
  if (ids.length < config.limits.minGroupMembers) {
    throw new HttpError(400, `A group needs at least ${config.limits.minGroupMembers} distinct members`);
  }

  const { rows: members } = await pool.query(
    'SELECT id, name FROM users WHERE id = ANY($1) ORDER BY id',
    [ids],
  );
  if (members.length !== ids.length) throw new HttpError(400, 'member_ids contains unknown users');

  const { rows: existing } = await pool.query(FIND_CONVERSATION_BY_MEMBERS, [ids, req.user.id]);
  if (existing.length) {
    throw new HttpError(409, 'Conversation already exists', { conversation_id: existing[0].id });
  }

  const { rows } = await pool.query(CREATE_GROUP, [config.conversationTypes.group, ids]);
  res.status(201).json({ ...rows[0], members });
});

conversationsRouter.get('/:id/messages', requireMember, async (req, res) => {
  const { limits } = config;
  const limit =
    req.query.limit === undefined
      ? limits.messagesDefault
      : Math.min(parseId(req.query.limit, 'limit'), limits.messagesMax);

  const { rows } = await pool.query(LIST_MESSAGES, [req.conversationId, limit]);
  res.json(rows);
});

conversationsRouter.post('/:id/messages', requireMember, async (req, res) => {
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (!content) throw new HttpError(400, 'content is required');
  if (content.length > config.limits.messageLength) {
    throw new HttpError(400, `content must be at most ${config.limits.messageLength} characters`);
  }

  const { rows } = await pool.query(CREATE_MESSAGE, [req.conversationId, req.user.id, content]);
  res.status(201).json(rows[0]);
});
