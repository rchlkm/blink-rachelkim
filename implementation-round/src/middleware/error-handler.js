// src/middleware/error-handler.js
import { HttpError } from '../errors.js';

export function notFound(req, res, next) {
  next(new HttpError(404, 'Not found'));
}

export function errorHandler(err, req, res, next) {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json(
    status >= 500 ? { error: 'Internal server error' } : { error: err.message, ...err.details },
  );
}
