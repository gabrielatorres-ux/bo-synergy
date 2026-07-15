const { createClient } = require('@supabase/supabase-js');

// Credenciales de Supabase
const supabaseUrl = 'https://gbdanalmsrsuellsaany.supabase.co';
const supabaseKey = 'sb_publishable_HS3De2l_VwTKAF9otZSVXA_nGHmXRyU';

// Crear cliente de Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Función para ejecutar consultas (adaptador para mantener compatibilidad)
const query = async (text, params = []) => {
  try {
    console.log('📝 Ejecutando consulta:', text);
    const { data, error } = await supabase.rpc('exec_sql', { sql: text, params: params });
    if (error) {
      console.error('❌ Error en Supabase RPC:', error);
      throw error;
    }
    return { rows: data || [] };
  } catch (error) {
    console.error('❌ Error en query:', error);
    throw error;
  }
};

const queryOne = async (text, params = []) => {
  const result = await query(text, params);
  return result.rows[0] || null;
};

const queryRun = async (text, params = []) => {
  const result = await query(text, params);
  return result;
};

// Función de prueba de conexión
const testConnection = async () => {
  try {
    console.log('🔍 Probando conexión a Supabase...');
    const { data, error } = await supabase.from('pacientes').select('count(*)', { count: 'exact', head: true });
    if (error) {
      console.error('❌ Error en testConnection:', error);
      return false;
    }
    console.log('✅ Conexión a Supabase establecida correctamente');
    return true;
  } catch (error) {
    console.error('❌ Error al conectar a Supabase:', error.message);
    console.error('Detalles del error:', error);
    return false;
  }
};

testConnection();

module.exports = { query, queryOne, queryRun, supabase };