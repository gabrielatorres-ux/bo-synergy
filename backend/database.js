const { Pool } = require('pg');
require('dotenv').config();

// ==================== CONEXIÓN A SUPABASE (POSTGRES) ====================
// Todas las credenciales salen de variables de entorno (.env en local,
// "Environment Variables" en Render). NUNCA se escriben aquí directamente.
//
// Variables requeridas (ver .env.example):
//   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 6543,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de Postgres:', err.message);
});

// Prueba de conexión al arrancar (no tumba el servidor si falla)
(async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Conexión exitosa a Supabase/Postgres');
    console.log('📅 Hora del servidor:', result.rows[0].now);
  } catch (error) {
    console.error('❌ Error de conexión a la base de datos:', error.message);
    console.error('   Revisa las variables de entorno DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD');
  }
})();

// ==================== POOL RESTRINGIDO (RLS) ====================
// Usa el rol app_backend, que NO tiene BYPASSRLS: es la conexión real que
// aplica el aislamiento multiempresa a nivel de base de datos. Todas las
// rutas autenticadas deben usar este pool (vía el middleware
// withDbClient en server.js), nunca el pool de arriba, que sigue siendo
// necesario solo para las rutas públicas (login, forgot-password,
// reset-password, registro público, marca por slug).
if (!process.env.APP_DB_USER || !process.env.APP_DB_PASSWORD) {
  throw new Error('Faltan configurar APP_DB_USER y APP_DB_PASSWORD en las variables de entorno');
}
const poolApp = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 6543,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.APP_DB_USER,
  password: process.env.APP_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

poolApp.on('error', (err) => {
  console.error('❌ Error inesperado en el pool restringido (app_backend):', err.message);
});

// ==================== HELPERS DE CONSULTA ====================

// Para SELECTs que devuelven varias filas
const query = async (text, params = []) => {
  return pool.query(text, params);
};

// Para SELECTs que devuelven una sola fila (o null si no hay resultados)
const queryOne = async (text, params = []) => {
  const result = await pool.query(text, params);
  return result.rows[0] || null;
};

// Para INSERT/UPDATE/DELETE
const queryRun = async (text, params = []) => {
  return pool.query(text, params);
};

// Cliente opcional de Supabase (por si se usa la API de Supabase además de SQL directo)
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
}

module.exports = { query, queryOne, queryRun, supabase, pool, poolApp };