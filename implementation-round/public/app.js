// public/app.js
import { createApi, listUsers, login } from './api.js';

const POLL_INTERVAL_MS = 2000;
const ERROR_VISIBLE_MS = 4000;
const STICK_TO_BOTTOM_PX = 80;

const $ = (selector) => document.querySelector(selector);

const state = { me: null, users: [], conversations: [], selectedId: null, messages: [] };
let api;
let refreshing = false;
let errorTimer;

function el(tag, { className, text, ...attrs } = {}, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

const hasChanged = (previous, next) => JSON.stringify(previous) !== JSON.stringify(next);

function formatTime(iso) {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function showError(err) {
  const banner = $('#error');
  banner.textContent = err.message;
  banner.hidden = false;
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => (banner.hidden = true), ERROR_VISIBLE_MS);
}

function others(conversation) {
  return conversation.members.filter((member) => member.id !== state.me.id);
}

function conversationTitle(conversation) {
  return others(conversation).map((member) => member.name).join(', ');
}

function selectedConversation() {
  return state.conversations.find((conversation) => conversation.id === state.selectedId);
}

function renderConversations() {
  const list = $('#conversation-list');
  if (!state.conversations.length) {
    list.replaceChildren(el('li', { className: 'empty', text: 'No conversations yet' }));
    return;
  }

  list.replaceChildren(
    ...state.conversations.map((conversation) => {
      const last = conversation.last_message;
      const preview = last
        ? `${last.sender_id === state.me.id ? 'You: ' : ''}${last.content}`
        : 'No messages yet';
      const item = el(
        'button',
        { className: 'conversation-item', type: 'button' },
        el(
          'span',
          { className: 'title' },
          el('span', { text: conversationTitle(conversation) }),
          el('span', { className: 'time', text: last ? formatTime(last.created_at) : '' }),
        ),
        el('span', { className: 'preview', text: preview }),
      );
      item.classList.toggle('selected', conversation.id === state.selectedId);
      item.addEventListener('click', () => selectConversation(conversation.id));
      return el('li', {}, item);
    }),
  );
}

function renderThreadHeader() {
  const header = $('#thread-header');
  const conversation = selectedConversation();
  header.hidden = !conversation;
  $('#composer').hidden = !conversation;
  if (!conversation) return;

  const subtitle = conversation.members.map((member) => member.name).join(', ');
  header.replaceChildren(
    el('strong', { text: conversationTitle(conversation) }),
    el('span', { className: 'subtitle', text: subtitle }),
  );
}

function messageItem(message) {
  const conversation = selectedConversation();
  const mine = message.sender_id === state.me.id;
  const sender = conversation.members.find((member) => member.id === message.sender_id);
  const showSender = !mine && conversation.members.length > 2;

  return el(
    'li',
    { className: mine ? 'message mine' : 'message' },
    ...(showSender ? [el('div', { className: 'sender', text: sender?.name ?? 'Unknown' })] : []),
    el('div', { text: message.content }),
    el('div', { className: 'time', text: formatTime(message.created_at) }),
  );
}

function renderMessages({ forceScroll = false } = {}) {
  const list = $('#messages');
  if (!selectedConversation()) {
    list.replaceChildren(el('li', { className: 'empty', text: 'Select a conversation' }));
    return;
  }

  const stick =
    forceScroll || list.scrollHeight - list.scrollTop - list.clientHeight < STICK_TO_BOTTOM_PX;
  list.replaceChildren(
    ...(state.messages.length
      ? state.messages.map(messageItem)
      : [el('li', { className: 'empty', text: 'No messages yet' })]),
  );
  if (stick) list.scrollTop = list.scrollHeight;
}

async function selectConversation(conversationId) {
  state.selectedId = conversationId;
  state.messages = [];
  renderConversations();
  renderThreadHeader();
  renderMessages();

  try {
    state.messages = await api.listMessages(conversationId);
    if (state.selectedId === conversationId) renderMessages({ forceScroll: true });
  } catch (err) {
    showError(err);
  }
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  const selectedId = state.selectedId;

  try {
    const [conversations, messages] = await Promise.all([
      api.listConversations(),
      selectedId ? api.listMessages(selectedId) : state.messages,
    ]);

    if (hasChanged(state.conversations, conversations)) {
      state.conversations = conversations;
      renderConversations();
      renderThreadHeader();
    }
    if (state.selectedId === selectedId && hasChanged(state.messages, messages)) {
      state.messages = messages;
      renderMessages();
    }
  } catch (err) {
    showError(err);
  } finally {
    refreshing = false;
  }
}

async function sendMessage(event) {
  event.preventDefault();
  const input = $('#message-input');
  const content = input.value.trim();
  if (!content || !state.selectedId) return;

  try {
    const message = await api.sendMessage(state.selectedId, content);
    input.value = '';
    state.messages = [...state.messages, message];
    renderMessages({ forceScroll: true });
    await refresh();
  } catch (err) {
    showError(err);
  }
}

function openGroupDialog() {
  $('#group-members').replaceChildren(
    ...state.users
      .filter((user) => user.id !== state.me.id)
      .map((user) =>
        el(
          'li',
          {},
          el(
            'label',
            {},
            el('input', { type: 'checkbox', value: user.id }),
            el('span', { text: user.name }),
          ),
        ),
      ),
  );
  $('#group-dialog').showModal();
}

async function createGroup(event) {
  event.preventDefault();
  const memberIds = [...$('#group-members').querySelectorAll('input:checked')].map((input) =>
    Number(input.value),
  );

  try {
    const conversation = await api.createGroup(memberIds);
    $('#group-dialog').close();
    await refresh();
    await selectConversation(conversation.id);
  } catch (err) {
    if (err.status === 409) return openExistingConversation(err);
    showError(err);
  }
}

async function openExistingConversation(err) {
  $('#group-dialog').close();
  await refresh();
  await selectConversation(err.body.conversation_id);
  alert(err.message);
}

function showLogin(users) {
  $('#login-users').replaceChildren(
    ...users.map((user) => el('li', {}, el('a', { href: `/?user=${user.id}`, text: user.name }))),
  );
  $('#login').hidden = false;
}

async function main() {
  const users = await listUsers();
  const userId = new URLSearchParams(location.search).get('user');
  const me = users.find((user) => String(user.id) === userId);
  if (!me) return showLogin(users);

  const { token } = await login(me.id);
  Object.assign(state, { me, users });
  api = createApi({ token, userId: me.id });
  document.title = `${me.name} · Blink Messaging`;
  $('#me-name').textContent = me.name;
  $('#app').hidden = false;

  $('#new-group').addEventListener('click', openGroupDialog);
  $('#group-cancel').addEventListener('click', () => $('#group-dialog').close());
  $('#group-form').addEventListener('submit', createGroup);
  $('#composer').addEventListener('submit', sendMessage);

  renderMessages();
  await refresh();
  setInterval(refresh, POLL_INTERVAL_MS);
}

main().catch(showError);
