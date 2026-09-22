// src/routes/login.js
import { Router } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { signToken } from '../token.js';
import { parseId } from '../validation.js';

export const loginRouter = Router();

// Mock login: issues a token for any existing user id, without credentials.
loginRouter.post('/', async (req, res) => {
  const userId = parseId(req.body?.user_id, 'user_id');

  const { rows } = await pool.query('SELECT id, name FROM users WHERE id = $1', [userId]);
  if (!rows.length) throw new HttpError(404, 'User not found');

  res.json({ token: signToken(rows[0]), user: rows[0] });
});
