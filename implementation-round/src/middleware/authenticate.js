// src/middleware/authenticate.js
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { verifyToken } from '../token.js';
import { parseId } from '../validation.js';

export async function authenticate(req, res, next) {
  const [scheme, token] = (req.get('authorization') ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Bearer token required');

  let claims;
  try {
    claims = verifyToken(token);
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }

  const { rows } = await pool.query('SELECT id, name FROM users WHERE id = $1', [Number(claims.sub)]);
  if (!rows.length) throw new HttpError(401, 'Unknown user');

  req.user = rows[0];
  next();
}

export function requireSelf(req, res, next) {
  if (parseId(req.params.userId, 'user id') !== req.user.id) {
    throw new HttpError(403, "Cannot access another user's resources");
  }
  next();
}
