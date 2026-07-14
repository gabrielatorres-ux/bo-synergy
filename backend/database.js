const { Pool } = require('pg');

// Leer variables de entorno directamente
const pool = new Pool({
  host: process.env.PGHOST || 'db.gbdanalmsrsuellsaany.supabase.co',
  port: parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE || 'postgres',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'BoSynergy2024!',
  ssl: {
    rejectUnauthorized: false
  }
});

const query = (text, params) => pool.query(text, params);
const queryOne = async (text, params) => {
  const result = await pool.query(text, params);
  return result.rows[0] || null;
};
const queryRun = async (text, params) => {
  const result = await pool.query(text, params);
  return result;
};

module.exports = { query, queryOne, queryRun, pool };