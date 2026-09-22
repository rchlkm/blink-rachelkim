// scripts/run-sql.js
import { readFile } from 'node:fs/promises';
import { pool } from '../src/db.js';

const [file] = process.argv.slice(2);

try {
  await pool.query(await readFile(file, 'utf8'));
  console.log(`Ran ${file}`);
} finally {
  await pool.end();
}
