import dotenv from 'dotenv';
dotenv.config();

import { initDatabase } from './init';
import pool from './pool';

async function migrate() {
  console.log('Running database migration...');
  await initDatabase();
  console.log('Migration completed successfully.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
