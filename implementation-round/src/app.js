// src/app.js
import { fileURLToPath } from 'node:url';
import express from 'express';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { conversationsRouter } from './routes/conversations.js';
import { healthRouter } from './routes/health.js';
import { loginRouter } from './routes/login.js';
import { usersRouter } from './routes/users.js';

export const app = express();

app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
app.use(express.json());
app.use('/health', healthRouter);
app.use('/login', loginRouter);
app.use('/users', usersRouter);
app.use('/users/:userId/conversations', conversationsRouter);
app.use(notFound);
app.use(errorHandler);
