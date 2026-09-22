// src/routes/users.js
import { Router } from 'express';
import { pool } from '../db.js';

export const usersRouter = Router();

usersRouter.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT id, name FROM users ORDER BY id');
  res.json(rows);
});
