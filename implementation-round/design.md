slack web messaging web chat direct messaging between users

- individual + group chats
- text messages, no media

- frontend ux

- send message
- get converstaions
- get group messages
- create group
- add/.remove group members
- list users convos

system assumptions:

- groups are immutable

tables

- users
  - id, name
- conversations
  - id
  - type: direct, group

- conversation_members: 2 user ids min
  - conversation_id
  - user_id

- messages
  - id
  - convo_id
  - sender_id
  - content
  - created_at

interface/client -> api -> postgres

---

stretch goal
typing inidicators: websocket event + server

express api to make calls

GET /users
GET /conversations
GET /conversations/:id/messages

POST /conversations -- create a "group"
POST /conversations/:id/messages -- send message

Things to revisit
Deleting a conversation deletes its members and messages. Deleting a user deletes their memberships but is blocked while they still have messages.

given a user,

- see my convo list
- messages for the selected convo
- send message
- create convo

overall context for this chat moving forward, use the existing seeded postgres data,
keep implementation minimal
dont add auth, websocket

create mvp interface: build simple messaging ui using api and db
interface for a single logged in user

-

the goal of this exercise is to create a demo of two diff users messaging each other.
create multiple instances of different logged in users

for auth use JWT token to allow client to auth the user. include it with each api request
return 403 if a user cannot access a convo
