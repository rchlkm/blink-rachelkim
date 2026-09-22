// src/token.js
import jwt from 'jsonwebtoken';
import { config } from './config.js';

const { secret, algorithm, expiresIn } = config.jwt;

if (!secret) throw new Error('JWT_SECRET is required');

export const signToken = (user) =>
  jwt.sign({}, secret, { subject: String(user.id), algorithm, expiresIn });

export const verifyToken = (token) => jwt.verify(token, secret, { algorithms: [algorithm] });
