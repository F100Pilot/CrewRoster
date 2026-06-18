import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'crewroster',
  user: process.env.DB_USER || 'crewroster',
  password: process.env.DB_PASSWORD || 'crewroster',
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export default pool;
