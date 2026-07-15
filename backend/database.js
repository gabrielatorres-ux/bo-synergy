const { Pool } = require('pg');
const dns = require('dns');

// Forzar resolución de DNS a IPv4
dns.setDefaultResultOrder('ipv4first');

// Usar la IP de Supabase directamente (IPv4)
const pool = new Pool({
  host: '104.18.38.10',  // IP de Supabase (IPv4)
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'BoSynergy2024!',
  ssl: {
    rejectUnauthorized: false
  },
  // Forzar IPv4
  family: 4,
  connectionTimeoutMillis: 10000,
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

const testConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Conexión a Supabase establecida correctamente');
    console.log('📅 Hora del servidor:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ Error al conectar a Supabase:', error.message);
    return false;
  }
};

testConnection();

module.exports = { query, queryOne, queryRun, pool };