// src/config.js
export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL,
  jwt: { secret: process.env.JWT_SECRET, algorithm: 'HS256', expiresIn: '8h' },
  conversationTypes: { direct: 'direct', group: 'group' },
  limits: {
    minGroupMembers: 2,
    messageLength: 4000,
    messagesDefault: 50,
    messagesMax: 100,
  },
};
