-- db/seed.sql
TRUNCATE users, conversations, conversation_members, messages RESTART IDENTITY CASCADE;

INSERT INTO users (name) VALUES
  ('Alice'),
  ('Bob'),
  ('Carol'),
  ('Dave'),
  ('Erin');

INSERT INTO conversations (type) VALUES
  ('direct'),
  ('direct'),
  ('group');

INSERT INTO conversation_members (conversation_id, user_id) VALUES
  (1, 1), (1, 2),
  (2, 1), (2, 3),
  (3, 1), (3, 2), (3, 4), (3, 5);

INSERT INTO messages (convo_id, sender_id, content, created_at) VALUES
  (1, 1, 'Hey Bob, are you free tomorrow?',       now() - interval '3 hours'),
  (1, 2, 'Yep, what time works for you?',         now() - interval '2 hours 50 minutes'),
  (1, 1, 'How about 10am?',                       now() - interval '2 hours 45 minutes'),
  (2, 3, 'Did you get a chance to review my PR?', now() - interval '1 day'),
  (2, 1, 'Looking at it now.',                    now() - interval '23 hours'),
  (3, 4, 'Welcome to the team channel!',          now() - interval '2 days'),
  (3, 5, 'Thanks Dave, glad to be here.',         now() - interval '2 days' + interval '5 minutes'),
  (3, 2, 'Standup is at 9:30 each morning.',      now() - interval '1 day 20 hours'),
  (3, 1, 'Sounds good, see everyone there.',      now() - interval '1 day 19 hours');
