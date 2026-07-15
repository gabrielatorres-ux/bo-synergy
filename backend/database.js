cat > database.js << 'EOF'
const { createClient } = require('@supabase/supabase-js');

// Credenciales de Supabase
const supabaseUrl = 'https://gbdanalmsrsuellsaany.supabase.co';
const supabaseKey = 'sb_publishable_HS3De2l_VwTKAF9otZSVXA_nGHmXRyU'; // Anon key

// Crear cliente de Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Función para ejecutar consultas (adaptador para mantener compatibilidad)
const query = async (text, params = []) => {
  // Convertir SQL a formato Supabase
  // Nota: Esto es un adaptador simple. Para consultas complejas, necesitarás ajustarlo.
  const { data, error } = await supabase.rpc('exec_sql', { sql: text, params: params });
  if (error) throw error;
  return { rows: data || [] };
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
    const { data, error } = await supabase.from('pacientes').select('count(*)', { count: 'exact', head: true });
    if (error) throw error;
    console.log('✅ Conexión a Supabase establecida correctamente');
    return true;
  } catch (error) {
    console.error('❌ Error al conectar a Supabase:', error.message);
    return false;
  }
};

testConnection();

module.exports = { query, queryOne, queryRun, supabase };
EOF