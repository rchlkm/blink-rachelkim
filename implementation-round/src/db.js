// src/db.js
import pg from 'pg';
import { config } from './config.js';

// BIGINT ids and counts arrive as JS numbers instead of strings.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

export const pool = new pg.Pool({ connectionString: config.databaseUrl });
