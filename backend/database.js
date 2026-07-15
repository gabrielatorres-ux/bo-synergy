const { createClient } = require('@supabase/supabase-js');

// Credenciales de Supabase
const supabaseUrl = 'https://gbdanalmsrsuellsaany.supabase.co';
const supabaseKey = 'sb_publishable_HS3De2l_VwTKAF9otZSVXA_nGHmXRyU';

// Crear cliente de Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Función para ejecutar consultas usando la API REST de Supabase
const query = async (table, select = '*', filters = {}) => {
  try {
    let query = supabase.from(table).select(select);
    Object.keys(filters).forEach(key => {
      query = query.eq(key, filters[key]);
    });
    const { data, error } = await query;
    if (error) throw error;
    return { rows: data || [] };
  } catch (error) {
    console.error('❌ Error en query:', error);
    throw error;
  }
};

// Función para obtener un solo resultado
const queryOne = async (table, select = '*', filters = {}) => {
  const result = await query(table, select, filters);
  return result.rows[0] || null;
};

// Función para ejecutar INSERT, UPDATE, DELETE
const queryRun = async (table, data, operation = 'insert') => {
  try {
    let result;
    if (operation === 'insert') {
      result = await supabase.from(table).insert(data);
    } else if (operation === 'update') {
      result = await supabase.from(table).update(data);
    } else if (operation === 'delete') {
      result = await supabase.from(table).delete();
    }
    if (result.error) throw result.error;
    return result;
  } catch (error) {
    console.error('❌ Error en queryRun:', error);
    throw error;
  }
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