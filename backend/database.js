const { Pool } = require('pg');

// Usar DATABASE_URL para la conexión
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  // Timeout de conexión
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
