const { Pool } = require('pg');

// Usar la IP de Supabase
const pool = new Pool({
  host: '104.18.38.10',  // IP de Supabase
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'BoSynergy2024!',
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
});

const query = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error('❌ Error en query:', error);
    throw error;
  }
};

const queryOne = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    return result.rows[0] || null;
  } catch (error) {
    console.error('❌ Error en queryOne:', error);
    throw error;
  }
};

const queryRun = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error('❌ Error en queryRun:', error);
    throw error;
  }
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