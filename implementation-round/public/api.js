// public/api.js
async function request(path, { token, method, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) {
    throw Object.assign(new Error(payload.error ?? res.statusText), {
      status: res.status,
      body: payload,
    });
  }
  return payload;
}

export const listUsers = () => request('/users');

export const login = (userId) => request('/login', { method: 'POST', body: { user_id: userId } });

export function createApi({ token, userId }) {
  const conversations = `/users/${userId}/conversations`;

  return {
    listConversations: () => request(conversations, { token }),
    createGroup: (memberIds) =>
      request(conversations, { token, method: 'POST', body: { member_ids: memberIds } }),
    listMessages: (conversationId) =>
      request(`${conversations}/${conversationId}/messages`, { token }),
    sendMessage: (conversationId, content) =>
      request(`${conversations}/${conversationId}/messages`, {
        token,
        method: 'POST',
        body: { content },
      }),
  };
}
