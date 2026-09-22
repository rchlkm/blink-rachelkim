// src/routes/health.js
import { Router } from 'express';
import { pool } from '../db.js';

export const healthRouter = Router();

healthRouter.get('/', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
});
