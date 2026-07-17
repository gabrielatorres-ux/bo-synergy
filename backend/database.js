const { Pool } = require('pg');

// Configuración de Supabase con IP para evitar problemas de IPv6
const pool = new Pool({
  host: '104.18.38.10',  // IP de Supabase
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'BoSynergy2024!',
  ssl: {
    rejectUnauthorized: false
  },
  // Forzar IPv4
  family: 4,
  // Timeout de conexión
  connectionTimeoutMillis: 10000,
  // Máximo de clientes en el pool
  max: 10,
  // Tiempo de inactividad antes de cerrar
  idleTimeoutMillis: 30000,
});

// Función para ejecutar consultas
const query = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error('❌ Error en query:', error);
    throw error;
  }
};

// Función para obtener un solo resultado
const queryOne = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    return result.rows[0] || null;
  } catch (error) {
    console.error('❌ Error en queryOne:', error);
    throw error;
  }
};

// Función para ejecutar consultas sin retorno (INSERT, UPDATE, DELETE)
const queryRun = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error('❌ Error en queryRun:', error);
    throw error;
  }
};

// Función para verificar la conexión
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

// Probar conexión al iniciar
testConnection();

module.exports = { query, queryOne, queryRun, pool };