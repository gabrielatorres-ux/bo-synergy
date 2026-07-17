const { createClient } = require('@supabase/supabase-js');

// Credenciales de Supabase desde variables de entorno
const supabaseUrl = process.env.SUPABASE_URL || 'https://gbdanalmsrsuellsaany.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_HS3De2l_VwTKAF9otZSVXA_nGHmXRyU';

// Crear cliente de Supabase
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
});

// Función para ejecutar consultas usando la API REST de Supabase
const query = async (table, select = '*', filters = {}) => {
  try {
    let queryBuilder = supabase.from(table).select(select);
    Object.keys(filters).forEach(key => {
      queryBuilder = queryBuilder.eq(key, filters[key]);
    });
    const { data, error } = await queryBuilder;
    if (error) throw error;
    return { rows: data || [] };
  } catch (error) {
    console.error('❌ Error en query:', error);
    throw error;
  }
};

const queryOne = async (table, select = '*', filters = {}) => {
  const result = await query(table, select, filters);
  return result.rows[0] || null;
};

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

const testConnection = async () => {
  try {
    const { data, error } = await supabase.from('pacientes').select('count(*)', { count: 'exact', head: true });
    if (error) throw error;
    console.log('✅ Conexión a Supabase establecida correctamente');
    console.log('🔑 Usando clave:', supabaseKey ? '✅ Configurada' : '❌ No configurada');
    return true;
  } catch (error) {
    console.error('❌ Error al conectar a Supabase:', error.message);
    return false;
  }
};

testConnection();

module.exports = { query, queryOne, queryRun, supabase };