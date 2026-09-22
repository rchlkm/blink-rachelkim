// src/validation.js
import { HttpError } from './errors.js';

export function parseId(value, name) {
  const id = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, `${name} must be a positive integer`);
  }
  return id;
}
