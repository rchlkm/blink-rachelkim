// test/api.test.js
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { app } from '../src/app.js';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import { signToken } from '../src/token.js';

const UNKNOWN_USER_ID = 2147483647;

let server;
let baseUrl;
let users;
let alice;
let bob;
let carol;
let group;
let alicesChatWithCarol;

const conversationsPath = (userId, suffix = '') => `/users/${userId}/conversations${suffix}`;

async function api(path, { as, method = 'GET', body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (as) headers.authorization = `Bearer ${signToken(as)}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

// Requests a user's own conversation resources with that user's token.
const asSelf = (user, suffix, options) =>
  api(conversationsPath(user.id, suffix), { as: user, ...options });

before(async () => {
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const { rows } = await pool.query(
    "INSERT INTO users (name) VALUES ('Test Alice'), ('Test Bob'), ('Test Carol') RETURNING id, name",
  );
  users = rows;
  [alice, bob, carol] = users;

  const created = await asSelf(alice, '', { method: 'POST', body: { member_ids: [bob.id] } });
  assert.equal(created.status, 201);
  group = created.body;

  const chat = await asSelf(alice, '', { method: 'POST', body: { member_ids: [carol.id] } });
  assert.equal(chat.status, 201);
  alicesChatWithCarol = chat.body;

  const note = await asSelf(alice, `/${alicesChatWithCarol.id}/messages`, {
    method: 'POST',
    body: { content: 'private note' },
  });
  assert.equal(note.status, 201);
});

after(async () => {
  const ids = users.map((user) => user.id);
  await pool.query(
    `DELETE FROM conversations
      WHERE id IN (SELECT conversation_id FROM conversation_members WHERE user_id = ANY($1))`,
    [ids],
  );
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  await pool.end();
  server.close();
});

describe('static UI', () => {
  it('serves the app shell', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<title>Blink Messaging<\/title>/);
  });
});

describe('GET /users', () => {
  it('lists users', async () => {
    const { status, body } = await api('/users');
    assert.equal(status, 200);
    for (const user of users) {
      assert.deepEqual(body.find((row) => row.id === user.id), user);
    }
  });
});

describe('POST /login', () => {
  it('issues a token that authorizes the user', async () => {
    const login = await api('/login', { method: 'POST', body: { user_id: alice.id } });
    assert.equal(login.status, 200);
    assert.deepEqual(login.body.user, alice);

    const res = await fetch(`${baseUrl}${conversationsPath(alice.id)}`, {
      headers: { authorization: `Bearer ${login.body.token}` },
    });
    assert.equal(res.status, 200);
  });

  it('rejects an unknown user', async () => {
    const { status } = await api('/login', { method: 'POST', body: { user_id: UNKNOWN_USER_ID } });
    assert.equal(status, 404);
  });

  it('rejects a malformed user id', async () => {
    const { status } = await api('/login', { method: 'POST', body: { user_id: 'abc' } });
    assert.equal(status, 400);
  });
});

describe('authentication', () => {
  it('rejects a missing token', async () => {
    const { status } = await api(conversationsPath(alice.id));
    assert.equal(status, 401);
  });

  it('rejects a malformed token', async () => {
    const res = await fetch(`${baseUrl}${conversationsPath(alice.id)}`, {
      headers: { authorization: 'Bearer not-a-token' },
    });
    assert.equal(res.status, 401);
  });

  it('rejects a token for an unknown user', async () => {
    const { status } = await api(conversationsPath(UNKNOWN_USER_ID), {
      as: { id: UNKNOWN_USER_ID },
    });
    assert.equal(status, 401);
  });

  it('rejects a malformed user id in the path', async () => {
    const { status } = await api(conversationsPath('abc'), { as: alice });
    assert.equal(status, 400);
  });
});

describe('access control', () => {
  const alicesChatMessages = () => `/${alicesChatWithCarol.id}/messages`;

  it("forbids Bob from listing Alice's conversations", async () => {
    const { status } = await api(conversationsPath(alice.id), { as: bob });
    assert.equal(status, 403);
  });

  it("forbids Bob from reading Alice's messages as Alice", async () => {
    const { status } = await api(conversationsPath(alice.id, alicesChatMessages()), { as: bob });
    assert.equal(status, 403);
  });

  it("forbids Bob from sending in Alice's conversation as Alice", async () => {
    const { status } = await api(conversationsPath(alice.id, alicesChatMessages()), {
      as: bob,
      method: 'POST',
      body: { content: 'impersonation' },
    });
    assert.equal(status, 403);
  });

  it("forbids Bob from reading Alice's messages as himself", async () => {
    const { status } = await asSelf(bob, alicesChatMessages());
    assert.equal(status, 403);
  });

  it("forbids Bob from sending in Alice's conversation as himself", async () => {
    const { status } = await asSelf(bob, alicesChatMessages(), {
      method: 'POST',
      body: { content: 'intruder' },
    });
    assert.equal(status, 403);
  });

  it("does not list Alice's private conversation for Bob", async () => {
    const { body } = await asSelf(bob);
    assert.equal(
      body.some((conversation) => conversation.id === alicesChatWithCarol.id),
      false,
    );
  });

  it('leaves the conversation untouched by rejected requests', async () => {
    const { body } = await asSelf(alice, alicesChatMessages());
    assert.deepEqual(
      body.map((message) => message.content),
      ['private note'],
    );
  });

  it('still lets a member read and send', async () => {
    const read = await asSelf(carol, alicesChatMessages());
    assert.equal(read.status, 200);

    const send = await asSelf(carol, alicesChatMessages(), {
      method: 'POST',
      body: { content: 'reply' },
    });
    assert.equal(send.status, 201);
  });
});

describe('POST /users/:userId/conversations', () => {
  it('creates a group containing the user and the given members', async () => {
    assert.equal(group.type, config.conversationTypes.group);
    assert.deepEqual(group.members, [alice, bob]);
  });

  it('rejects a group whose members already share a conversation', async () => {
    const { status, body } = await asSelf(alice, '', {
      method: 'POST',
      body: { member_ids: [bob.id] },
    });
    assert.equal(status, 409);
    assert.equal(body.conversation_id, group.id);
  });

  it('detects the existing conversation regardless of who creates it', async () => {
    const { status, body } = await asSelf(bob, '', {
      method: 'POST',
      body: { member_ids: [alice.id] },
    });
    assert.equal(status, 409);
    assert.equal(body.conversation_id, group.id);
  });

  it('allows a group that only overlaps an existing conversation', async () => {
    const { status, body } = await asSelf(alice, '', {
      method: 'POST',
      body: { member_ids: [bob.id, carol.id] },
    });
    assert.equal(status, 201);
    assert.notEqual(body.id, group.id);
  });

  it('rejects member_ids that is not an array', async () => {
    const { status } = await asSelf(alice, '', { method: 'POST', body: { member_ids: 'x' } });
    assert.equal(status, 400);
  });

  it('rejects a group with fewer than two distinct members', async () => {
    const { status } = await asSelf(alice, '', {
      method: 'POST',
      body: { member_ids: [alice.id] },
    });
    assert.equal(status, 400);
  });

  it('rejects unknown member ids', async () => {
    const { status } = await asSelf(alice, '', {
      method: 'POST',
      body: { member_ids: [UNKNOWN_USER_ID] },
    });
    assert.equal(status, 400);
  });
});

describe('messages', () => {
  const messages = (user, options) => asSelf(user, `/${group.id}/messages`, options);

  it('returns an empty list before any message is sent', async () => {
    const { status, body } = await messages(alice);
    assert.equal(status, 200);
    assert.deepEqual(body, []);
  });

  it('sends a trimmed message as the authenticated user', async () => {
    const { status, body } = await messages(alice, { method: 'POST', body: { content: '  first  ' } });
    assert.equal(status, 201);
    assert.equal(body.convo_id, group.id);
    assert.equal(body.sender_id, alice.id);
    assert.equal(body.content, 'first');
  });

  it('lists messages oldest first and honours limit', async () => {
    await messages(bob, { method: 'POST', body: { content: 'second' } });

    const all = await messages(bob);
    assert.deepEqual(
      all.body.map((message) => message.content),
      ['first', 'second'],
    );

    const latest = await asSelf(bob, `/${group.id}/messages?limit=1`);
    assert.deepEqual(
      latest.body.map((message) => message.content),
      ['second'],
    );
  });

  it('rejects empty content', async () => {
    const { status } = await messages(alice, { method: 'POST', body: { content: '   ' } });
    assert.equal(status, 400);
  });

  it('rejects content over the length limit', async () => {
    const { status } = await messages(alice, {
      method: 'POST',
      body: { content: 'x'.repeat(config.limits.messageLength + 1) },
    });
    assert.equal(status, 400);
  });

  it('rejects an invalid limit', async () => {
    const { status } = await asSelf(alice, `/${group.id}/messages?limit=0`);
    assert.equal(status, 400);
  });

  it('forbids non-members from reading or sending', async () => {
    const read = await messages(carol);
    assert.equal(read.status, 403);

    const send = await messages(carol, { method: 'POST', body: { content: 'intruder' } });
    assert.equal(send.status, 403);
  });

  it('rejects a non-numeric conversation id', async () => {
    const { status } = await asSelf(alice, '/abc/messages');
    assert.equal(status, 400);
  });
});

describe('GET /users/:userId/conversations', () => {
  it("lists the user's conversations with members and last message", async () => {
    const { status, body } = await asSelf(bob);
    assert.equal(status, 200);

    const listed = body.find((conversation) => conversation.id === group.id);
    assert.deepEqual(listed.members, group.members);
    assert.equal(listed.last_message.content, 'second');
    assert.equal(listed.last_message.sender_id, bob.id);
  });

  it('excludes conversations the user is not in', async () => {
    const { body } = await asSelf(carol);
    assert.equal(body.some((conversation) => conversation.id === group.id), false);
  });
});
