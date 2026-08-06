const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, queryOne, queryRun, supabase, poolApp } = require('./database');
const { enviarCorreo, enviarCorreoSimple } = require('./emailService');

const app = express();
const PORT = process.env.PORT || 10000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

if (!process.env.JWT_SECRET) {
  throw new Error('Falta configurar JWT_SECRET en las variables de entorno');
}
const JWT_SECRET = process.env.JWT_SECRET;

app.use(cors());
app.use(express.json());

// ==================== AUTENTICACIÓN Y AISLAMIENTO MULTIEMPRESA ====================
// Toda ruta que toque datos de una empresa debe pasar por requireAuth, que
// verifica el token emitido en /api/login y expone en req.auth quién es el
// usuario, su empresa y su rol. Nunca se debe confiar en el empresa_id o
// rol que mande el cliente: siempre se usa req.auth.

const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.auth.rol !== 'admin' && !req.auth.es_superadmin) {
    return res.status(403).json({ error: 'No tienes permiso para esta acción' });
  }
  next();
};

const requireSuperadmin = (req, res, next) => {
  if (!req.auth.es_superadmin) {
    return res.status(403).json({ error: 'No tienes permiso para esta acción' });
  }
  next();
};

// Resuelve qué empresa_id debe usarse en la consulta: la del token, salvo
// que el usuario sea superadmin (que sí puede operar sobre otra empresa
// explícita, por ejemplo desde "Ver detalles" en Gestión de Empresas). El
// valor resuelto se inyecta en query y body para que el resto de cada ruta
// pueda seguir leyendo empresa_id como ya lo hacía, sin más cambios.
const scopeEmpresaId = (req, res, next) => {
  const empresaCliente = req.body?.empresa_id || req.query?.empresa_id;
  const empresaId = req.auth.es_superadmin && empresaCliente ? empresaCliente : req.auth.empresa_id;
  req.query.empresa_id = empresaId;
  if (req.body && typeof req.body === 'object') {
    req.body.empresa_id = empresaId;
  }
  next();
};

// Mi Agenda es personal: nadie debe poder leer o modificar la agenda de
// otro usuario, así que usuario_id siempre se toma del token, nunca del
// cliente.
const scopeUsuarioId = (req, res, next) => {
  req.query.usuario_id = req.auth.id;
  if (req.body && typeof req.body === 'object') {
    req.body.usuario_id = req.auth.id;
  }
  next();
};

// Segunda capa de aislamiento, esta vez en la propia base de datos: toma
// una conexión dedicada del pool restringido (rol app_backend, sin
// BYPASSRLS) y fija ahí las variables de sesión que leen las políticas
// RLS (ver migración 010_rls.sql), siempre a partir del token ya
// verificado — igual que scopeEmpresaId, nunca de lo que mande el
// cliente. req.db reemplaza a query/queryOne/queryRun dentro de cada
// ruta autenticada. La conexión se libera al terminar la respuesta.
const withDbClient = async (req, res, next) => {
  let liberado = false;
  const liberar = (client) => {
    if (liberado) return;
    liberado = true;
    client.release();
  };
  try {
    const client = await poolApp.connect();
    await client.query(
      `SELECT set_config('app.current_empresa_id', $1, false),
              set_config('app.is_superadmin', $2, false),
              set_config('app.current_usuario_id', $3, false)`,
      [String(req.auth.empresa_id), req.auth.es_superadmin ? 'true' : 'false', String(req.auth.id)]
    );
    req.db = {
      query: (text, params) => client.query(text, params),
      queryOne: async (text, params) => {
        const result = await client.query(text, params);
        return result.rows[0] || null;
      },
      queryRun: (text, params) => client.query(text, params),
    };
    res.on('finish', () => liberar(client));
    res.on('close', () => liberar(client));
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Para rutas identificadas por paciente_id (no por empresa_id directo):
// confirma que ese paciente pertenece a la empresa del usuario autenticado
// antes de dejar pasar la lectura/escritura. Los superadmin no tienen
// restricción (necesitan poder dar soporte a cualquier empresa).
const requirePacienteDeMiEmpresa = (obtenerPacienteId) => async (req, res, next) => {
  if (req.auth.es_superadmin) return next();
  try {
    const pacienteId = obtenerPacienteId(req);
    const paciente = await queryOne('SELECT empresa_id FROM pacientes WHERE id = $1', [pacienteId]);
    if (!paciente || paciente.empresa_id !== req.auth.empresa_id) {
      return res.status(403).json({ error: 'No tienes acceso a este paciente' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Igual que la anterior, pero para recursos identificados por su propio id
// (consultas), que hay que resolver primero al paciente dueño.
const requireConsultaDeMiEmpresa = async (req, res, next) => {
  if (req.auth.es_superadmin) return next();
  try {
    const fila = await queryOne(
      'SELECT p.empresa_id FROM consultas c JOIN pacientes p ON c.paciente_id = p.id WHERE c.id = $1',
      [req.params.id]
    );
    if (!fila || fila.empresa_id !== req.auth.empresa_id) {
      return res.status(403).json({ error: 'No tienes acceso a esta consulta' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==================== RUTAS DE EMPRESAS ====================

const subirLogo = async (file) => {
  const nombreArchivo = `${Date.now()}-${Math.random().toString(36).slice(2)}.${file.originalname.split('.').pop()}`;
  const { error } = await supabase.storage.from('logos').upload(nombreArchivo, file.buffer, {
    contentType: file.mimetype,
    upsert: true
  });
  if (error) throw error;
  const { data } = supabase.storage.from('logos').getPublicUrl(nombreArchivo);
  return data.publicUrl;
};

const subirAdjunto = async (file) => {
  const nombreArchivo = `${Date.now()}-${Math.random().toString(36).slice(2)}.${file.originalname.split('.').pop()}`;
  const { error } = await supabase.storage.from('adjuntos').upload(nombreArchivo, file.buffer, {
    contentType: file.mimetype,
    upsert: true
  });
  if (error) throw error;
  const { data } = supabase.storage.from('adjuntos').getPublicUrl(nombreArchivo);
  return data.publicUrl;
};

const generarSlug = (texto) => texto
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const generarSlugUnico = async (nombre) => {
  const base = generarSlug(nombre) || 'empresa';
  let slug = base;
  let i = 2;
  while (await queryOne('SELECT id FROM empresas WHERE slug = $1', [slug])) {
    slug = `${base}-${i}`;
    i++;
  }
  return slug;
};

app.get('/api/empresas', requireAuth, withDbClient, requireSuperadmin, async (req, res) => {
  try {
    const result = await req.db.query('SELECT * FROM empresas ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pública (sin empresa_id): la usa la pantalla de login para mostrar el
// logo/nombre correcto antes de que el usuario se autentique.
app.get('/api/empresas/by-slug/:slug', async (req, res) => {
  try {
    const empresa = await queryOne(
      'SELECT id, nombre, logo_url FROM empresas WHERE slug = $1 AND activo = true',
      [req.params.slug]
    );
    if (!empresa) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    res.json(empresa);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crea la empresa junto con su primer usuario admin (sin esto no habría
// forma de entrar a una empresa nueva: nadie de ahí existiría todavía
// para crear a los demás usuarios). `activo=false` se usa para el
// auto-registro público, que queda pendiente de aprobación.
// queryRunFn: el registro público (sin token) usa el queryRun global; el
// alta hecha por un superadmin autenticado usa req.db.queryRun (RLS), que
// para un superadmin permite insertar en cualquier empresa.
const crearEmpresaConAdmin = async ({ nombre, correo, celular, file, adminNumEmpleado, adminNombre, adminPassword, adminCorreo, activo, queryRunFn = queryRun }) => {
  const logoUrl = file ? await subirLogo(file) : null;
  const slug = await generarSlugUnico(nombre);
  const result = await queryRunFn(
    'INSERT INTO empresas (nombre, logo_url, slug, activo, correo, celular) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [nombre, logoUrl, slug, activo, correo || null, celular || null]
  );
  const empresaId = result.rows[0].id;
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
  await queryRunFn(
    `INSERT INTO usuarios (num_empleado, nombre, rol, password, empresa_id, correo, fecha_registro)
     VALUES ($1, $2, 'admin', $3, $4, $5, NOW())`,
    [adminNumEmpleado, adminNombre, adminPasswordHash, empresaId, adminCorreo || null]
  );
  return { empresaId, slug };
};

app.post('/api/empresas', requireAuth, withDbClient, requireSuperadmin, upload.single('logo'), async (req, res) => {
  const { nombre, correo, celular, admin_num_empleado, admin_nombre, admin_password, admin_correo } = req.body;
  if (!nombre) {
    return res.status(400).json({ error: 'El nombre es requerido' });
  }
  if (!admin_num_empleado || !admin_nombre || !admin_password) {
    return res.status(400).json({ error: 'Los datos del administrador de la empresa son requeridos' });
  }
  try {
    const { empresaId, slug } = await crearEmpresaConAdmin({
      nombre,
      correo,
      celular,
      file: req.file,
      adminNumEmpleado: admin_num_empleado,
      adminNombre: admin_nombre,
      adminPassword: admin_password,
      adminCorreo: admin_correo,
      activo: true,
      queryRunFn: req.db.queryRun
    });
    res.json({ id: empresaId, slug, message: 'Empresa creada correctamente' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El número de empleado del administrador ya existe' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Pública: una empresa se auto-registra pero queda inactiva hasta que el
// superadmin la apruebe desde "Gestión de Empresas".
app.post('/api/empresas/solicitar-registro', upload.single('logo'), async (req, res) => {
  const { nombre, correo, celular, admin_num_empleado, admin_nombre, admin_password, admin_correo } = req.body;
  if (!nombre || !correo || !celular || !admin_num_empleado || !admin_nombre || !admin_password) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }
  try {
    await crearEmpresaConAdmin({
      nombre,
      correo,
      celular,
      file: req.file,
      adminNumEmpleado: admin_num_empleado,
      adminNombre: admin_nombre,
      adminPassword: admin_password,
      adminCorreo: admin_correo,
      activo: false
    });
    res.json({ message: 'Tu solicitud fue enviada. Te avisaremos cuando tu cuenta esté aprobada.' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El número de empleado ya existe' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/empresas/:id/aprobar', requireAuth, withDbClient, requireSuperadmin, async (req, res) => {
  try {
    await req.db.queryRun('UPDATE empresas SET activo = true WHERE id = $1', [req.params.id]);
    res.json({ message: 'Empresa aprobada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/empresas/:id', requireAuth, withDbClient, requireSuperadmin, async (req, res) => {
  const { id } = req.params;
  try {
    const pacientesCount = await req.db.queryOne('SELECT COUNT(*) as total FROM pacientes WHERE empresa_id = $1', [id]);
    if (parseInt(pacientesCount.total) > 0) {
      return res.status(400).json({ error: 'No se puede eliminar una empresa con pacientes registrados' });
    }
    await req.db.queryRun('DELETE FROM usuarios WHERE empresa_id = $1', [id]);
    await req.db.queryRun('DELETE FROM empresas WHERE id = $1', [id]);
    res.json({ message: 'Empresa eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/empresas/:id', requireAuth, withDbClient, requireAdmin, upload.single('logo'), async (req, res) => {
  const { id } = req.params;
  const { nombre } = req.body;
  if (!req.auth.es_superadmin && Number(id) !== req.auth.empresa_id) {
    return res.status(403).json({ error: 'No tienes permiso para editar esta empresa' });
  }
  try {
    if (req.file) {
      const logoUrl = await subirLogo(req.file);
      await req.db.queryRun('UPDATE empresas SET nombre = $1, logo_url = $2 WHERE id = $3', [nombre, logoUrl, id]);
    } else {
      await req.db.queryRun('UPDATE empresas SET nombre = $1 WHERE id = $2', [nombre, id]);
    }
    res.json({ message: 'Empresa actualizada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTA GENÉRICA DE ADJUNTOS ====================
// Usada por Registro de Incapacidad y Registro de Accidente para subir
// un archivo (imagen o PDF) y guardar solo la URL pública resultante.

app.post('/api/adjuntos', requireAuth, upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }
    const url = await subirAdjunto(req.file);
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE PACIENTES ====================

app.get('/api/pacientes', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20, empresa_id } = req.query;
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const limitNum = Math.max(parseInt(limit) || 20, 1);
    const offset = (pageNum - 1) * limitNum;
    const searchTerm = `%${search}%`;

    const result = await req.db.query(
      `SELECT * FROM pacientes
       WHERE empresa_id = $1 AND (nombre ILIKE $2 OR num_empleado ILIKE $2 OR area ILIKE $2 OR curp ILIKE $2 OR rfc ILIKE $2)
       ORDER BY id
       LIMIT $3 OFFSET $4`,
      [empresa_id, searchTerm, limitNum, offset]
    );
    const totalResult = await req.db.queryOne(
      `SELECT COUNT(*) as total FROM pacientes
       WHERE empresa_id = $1 AND (nombre ILIKE $2 OR num_empleado ILIKE $2 OR area ILIKE $2 OR curp ILIKE $2 OR rfc ILIKE $2)`,
      [empresa_id, searchTerm]
    );
    const total = parseInt(totalResult.total);

    res.json({
      pacientes: result.rows,
      total,
      page: pageNum,
      totalPages: Math.max(Math.ceil(total / limitNum), 1)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/pacientes', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor, empresa_id, alergias, alergias_detalle, curp, rfc } = req.body;
  try {
    const result = await req.db.queryRun(
      `INSERT INTO pacientes (num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor, empresa_id, alergias, alergias_detalle, curp, rfc)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor, empresa_id, alergias, alergias_detalle, curp || null, rfc || null]
    );
    res.json({ id: result.rows[0]?.id || result.insertId, message: 'Paciente agregado correctamente' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El número de empleado ya existe' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Alta masiva de pacientes desde un Excel (nombre, área, puesto, etc.) para
// que una empresa no tenga que registrar empleados uno por uno.
app.post('/api/pacientes/importar', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { empresa_id, pacientes } = req.body;
  if (!empresa_id || !Array.isArray(pacientes) || pacientes.length === 0) {
    return res.status(400).json({ error: 'Se requiere una lista de pacientes' });
  }

  let insertados = 0;
  const errores = [];
  for (let i = 0; i < pacientes.length; i++) {
    const p = pacientes[i];
    if (!p.nombre) {
      errores.push({ fila: i + 2, motivo: 'Falta el nombre' });
      continue;
    }
    try {
      await req.db.queryRun(
        `INSERT INTO pacientes (num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor, empresa_id, alergias, alergias_detalle, curp, rfc)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [p.num_empleado || null, p.nombre, p.fecha_nac || null, p.nss || null, p.contacto_emergencia || null,
          p.puesto || null, p.area || null, p.supervisor || null, empresa_id, p.alergias || false, p.alergias_detalle || null,
          p.curp || null, p.rfc || null]
      );
      insertados++;
    } catch (error) {
      errores.push({ fila: i + 2, motivo: error.code === '23505' ? 'Número de empleado duplicado' : error.message });
    }
  }
  res.json({ insertados, errores });
});

app.put('/api/pacientes/:id', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { id } = req.params;
  const { num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor, empresa_id, alergias, alergias_detalle, curp, rfc } = req.body;
  try {
    await req.db.queryRun(
      `UPDATE pacientes
       SET num_empleado = $1, nombre = $2, fecha_nac = $3, nss = $4, contacto_emergencia = $5, puesto = $6, area = $7, supervisor = $8, alergias = $9, alergias_detalle = $10, curp = $11, rfc = $12
       WHERE id = $13 AND empresa_id = $14`,
      [num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor, alergias, alergias_detalle, curp || null, rfc || null, id, empresa_id]
    );
    res.json({ message: 'Paciente actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/pacientes/:id', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { id } = req.params;
  const { empresa_id } = req.query;
  try {
    const paciente = await req.db.queryOne('SELECT id FROM pacientes WHERE id = $1 AND empresa_id = $2', [id, empresa_id]);
    if (!paciente) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }
    await req.db.queryRun('DELETE FROM consultas WHERE paciente_id = $1', [id]);
    await req.db.queryRun('DELETE FROM pacientes WHERE id = $1 AND empresa_id = $2', [id, empresa_id]);
    res.json({ message: 'Paciente eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE CONSULTAS ====================

app.get('/api/consultas/:pacienteId', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.params.pacienteId), async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const result = await req.db.query('SELECT * FROM consultas WHERE paciente_id = $1 ORDER BY fecha DESC', [pacienteId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/consultas', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.body.paciente_id), async (req, res) => {
  const {
    paciente_id, fecha, motivo, alergias, alergias_detalle, cabeza, cuello, torax, abdomen, espalda,
    extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
    impresion_diagnostica, medicamentos, receta, cie10
  } = req.body;

  try {
    const result = await req.db.queryRun(
      `INSERT INTO consultas (
        paciente_id, fecha, motivo, alergias, alergias_detalle, cabeza, cuello, torax, abdomen, espalda,
        extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
        impresion_diagnostica, medicamentos, receta, cie10
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
      [paciente_id, fecha, motivo, alergias, alergias_detalle || null, cabeza, cuello, torax, abdomen, espalda,
        extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
        impresion_diagnostica, medicamentos, receta, cie10]
    );
    res.json({ id: result.rows[0]?.id, message: 'Consulta registrada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/consultas/:id', requireAuth, withDbClient, requireConsultaDeMiEmpresa, async (req, res) => {
  const { id } = req.params;
  const {
    fecha, motivo, alergias, alergias_detalle, cabeza, cuello, torax, abdomen, espalda,
    extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
    impresion_diagnostica, medicamentos, receta, cie10
  } = req.body;

  try {
    await req.db.queryRun(
      `UPDATE consultas 
       SET fecha = $1, motivo = $2, alergias = $3, alergias_detalle = $4, cabeza = $5, cuello = $6, torax = $7, 
           abdomen = $8, espalda = $9, extremidades_superiores = $10, extremidades_inferiores = $11, 
           ojos_oidos_garganta = $12, causa = $13, impresion_diagnostica = $14, 
           medicamentos = $15, receta = $16, cie10 = $17
       WHERE id = $18`,
      [fecha, motivo, alergias, alergias_detalle || null, cabeza, cuello, torax, abdomen, espalda,
        extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
        impresion_diagnostica, medicamentos, receta, cie10, id]
    );
    res.json({ message: 'Consulta actualizada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/consultas/:id', requireAuth, withDbClient, requireConsultaDeMiEmpresa, async (req, res) => {
  const { id } = req.params;
  try {
    await req.db.queryRun('DELETE FROM consultas WHERE id = $1', [id]);
    res.json({ message: 'Consulta eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE EXÁMENES ====================

app.post('/api/emi', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.body.paciente_id), async (req, res) => {
  const { paciente_id, fecha, exposicion_riesgos, trabajos_previos, riesgos_laborales,
    accidentes_previos, enfermedades_laborales, antecedentes_familiares,
    antecedentes_personales_no_patologicos, antecedentes_personales_patologicos,
    interrogatorio_aparatos, impresion_diagnostica, constancia_aptitud, cie10,
    exploracion_fisica, signos_vitales, agudeza_visual, alergia, embarazada } = req.body;

  try {
    const result = await req.db.queryRun(
      `INSERT INTO emi (
        paciente_id, fecha, exposicion_riesgos, trabajos_previos, riesgos_laborales,
        accidentes_previos, enfermedades_laborales, antecedentes_familiares,
        antecedentes_personales_no_patologicos, antecedentes_personales_patologicos,
        interrogatorio_aparatos, impresion_diagnostica, constancia_aptitud, cie10,
        exploracion_fisica, signos_vitales, agudeza_visual, alergia, embarazada
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING id`,
      [paciente_id, fecha, exposicion_riesgos, trabajos_previos, riesgos_laborales,
        accidentes_previos, enfermedades_laborales, antecedentes_familiares,
        antecedentes_personales_no_patologicos, antecedentes_personales_patologicos,
        interrogatorio_aparatos, impresion_diagnostica, constancia_aptitud, cie10,
        exploracion_fisica, signos_vitales, agudeza_visual, alergia, embarazada]
    );
    res.json({ id: result.rows[0]?.id, message: 'EMI registrado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/emi/:pacienteId', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.params.pacienteId), async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const result = await req.db.query('SELECT * FROM emi WHERE paciente_id = $1 ORDER BY fecha DESC', [pacienteId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/emi', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { search = '', empresa_id } = req.query;
  try {
    const searchTerm = `%${search}%`;
    const result = await req.db.query(
      `SELECT e.*, p.nombre AS paciente_nombre, p.area AS paciente_area, p.puesto AS paciente_puesto
       FROM emi e
       JOIN pacientes p ON p.id = e.paciente_id
       WHERE p.empresa_id = $1
         AND (p.nombre ILIKE $2 OR p.area ILIKE $2 OR e.fecha::text ILIKE $2)
       ORDER BY e.fecha DESC`,
      [empresa_id, searchTerm]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/emp', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.body.paciente_id), async (req, res) => {
  const { paciente_id, fecha, exposicion_auditiva, exposicion_respiratoria,
    exposicion_movimientos_repetitivos, exposicion_postural, exposicion_cargas_manuales,
    exposicion_visual, exposicion_psicosocial, exposicion_trabajos_alto_riesgo,
    interrogatorio_aparatos, impresion_diagnostica, solicitud_reubicacion, cie10,
    exploracion_fisica, signos_vitales, agudeza_visual, alergia, embarazada } = req.body;

  try {
    const result = await req.db.queryRun(
      `INSERT INTO emp (
        paciente_id, fecha, exposicion_auditiva, exposicion_respiratoria,
        exposicion_movimientos_repetitivos, exposicion_postural, exposicion_cargas_manuales,
        exposicion_visual, exposicion_psicosocial, exposicion_trabajos_alto_riesgo,
        interrogatorio_aparatos, impresion_diagnostica, solicitud_reubicacion, cie10,
        exploracion_fisica, signos_vitales, agudeza_visual, alergia, embarazada
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING id`,
      [paciente_id, fecha, exposicion_auditiva, exposicion_respiratoria,
        exposicion_movimientos_repetitivos, exposicion_postural, exposicion_cargas_manuales,
        exposicion_visual, exposicion_psicosocial, exposicion_trabajos_alto_riesgo,
        interrogatorio_aparatos, impresion_diagnostica, solicitud_reubicacion, cie10,
        exploracion_fisica, signos_vitales, agudeza_visual, alergia, embarazada]
    );
    res.json({ id: result.rows[0]?.id, message: 'EMP registrado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/emp/:pacienteId', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.params.pacienteId), async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const result = await req.db.query('SELECT * FROM emp WHERE paciente_id = $1 ORDER BY fecha DESC', [pacienteId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/emp', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { search = '', empresa_id } = req.query;
  try {
    const searchTerm = `%${search}%`;
    const result = await req.db.query(
      `SELECT e.*, p.nombre AS paciente_nombre, p.area AS paciente_area, p.puesto AS paciente_puesto
       FROM emp e
       JOIN pacientes p ON p.id = e.paciente_id
       WHERE p.empresa_id = $1
         AND (p.nombre ILIKE $2 OR p.area ILIKE $2 OR e.fecha::text ILIKE $2)
       ORDER BY e.fecha DESC`,
      [empresa_id, searchTerm]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/emr', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.body.paciente_id), async (req, res) => {
  const { paciente_id, fecha, secuelas_auditiva, secuelas_respiratoria, secuelas_motriz,
    secuelas_pensamiento, secuelas_fuerza, secuelas_neurologica, secuelas_psicosocial,
    secuelas_visual, interrogatorio_aparatos, impresion_diagnostica,
    recomendaciones_reingreso, cie10, exploracion_fisica, signos_vitales, agudeza_visual,
    alergia, embarazada } = req.body;

  try {
    const result = await req.db.queryRun(
      `INSERT INTO emr (
        paciente_id, fecha, secuelas_auditiva, secuelas_respiratoria, secuelas_motriz,
        secuelas_pensamiento, secuelas_fuerza, secuelas_neurologica, secuelas_psicosocial,
        secuelas_visual, interrogatorio_aparatos, impresion_diagnostica,
        recomendaciones_reingreso, cie10, exploracion_fisica, signos_vitales, agudeza_visual,
        alergia, embarazada
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING id`,
      [paciente_id, fecha, secuelas_auditiva, secuelas_respiratoria, secuelas_motriz,
        secuelas_pensamiento, secuelas_fuerza, secuelas_neurologica, secuelas_psicosocial,
        secuelas_visual, interrogatorio_aparatos, impresion_diagnostica,
        recomendaciones_reingreso, cie10, exploracion_fisica, signos_vitales, agudeza_visual,
        alergia, embarazada]
    );
    res.json({ id: result.rows[0]?.id, message: 'EMR registrado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/emr/:pacienteId', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.params.pacienteId), async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const result = await req.db.query('SELECT * FROM emr WHERE paciente_id = $1 ORDER BY fecha DESC', [pacienteId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/emr', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { search = '', empresa_id } = req.query;
  try {
    const searchTerm = `%${search}%`;
    const result = await req.db.query(
      `SELECT e.*, p.nombre AS paciente_nombre, p.area AS paciente_area, p.puesto AS paciente_puesto
       FROM emr e
       JOIN pacientes p ON p.id = e.paciente_id
       WHERE p.empresa_id = $1
         AND (p.nombre ILIKE $2 OR p.area ILIKE $2 OR e.fecha::text ILIKE $2)
       ORDER BY e.fecha DESC`,
      [empresa_id, searchTerm]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vulnerabilidad', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.body.paciente_id), async (req, res) => {
  const { paciente_id, fecha, tipo_vulnerabilidad, embarazo, cronico_degenerativa,
    hepato_renal, cardiologica, dermatologica, hematologica, impresion_diagnostica,
    cie10, exploracion_fisica, signos_vitales, agudeza_visual } = req.body;

  try {
    const result = await req.db.queryRun(
      `INSERT INTO vulnerabilidad (
        paciente_id, fecha, tipo_vulnerabilidad, embarazo, cronico_degenerativa,
        hepato_renal, cardiologica, dermatologica, hematologica, impresion_diagnostica,
        cie10, exploracion_fisica, signos_vitales, agudeza_visual
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [paciente_id, fecha, tipo_vulnerabilidad, embarazo, cronico_degenerativa,
        hepato_renal, cardiologica, dermatologica, hematologica, impresion_diagnostica,
        cie10, exploracion_fisica, signos_vitales, agudeza_visual]
    );
    res.json({ id: result.rows[0]?.id, message: 'Valoración de vulnerabilidad registrada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/vulnerabilidad/:pacienteId', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.params.pacienteId), async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const result = await req.db.query('SELECT * FROM vulnerabilidad WHERE paciente_id = $1 ORDER BY fecha DESC', [pacienteId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/vulnerabilidad', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { search = '', empresa_id } = req.query;
  try {
    const searchTerm = `%${search}%`;
    const result = await req.db.query(
      `SELECT v.*, p.nombre AS paciente_nombre, p.area AS paciente_area, p.puesto AS paciente_puesto
       FROM vulnerabilidad v
       JOIN pacientes p ON p.id = v.paciente_id
       WHERE p.empresa_id = $1
         AND (p.nombre ILIKE $2 OR p.area ILIKE $2 OR v.fecha::text ILIKE $2)
       ORDER BY v.fecha DESC`,
      [empresa_id, searchTerm]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE BITÁCORA ====================

app.post('/api/bitacora_registros', requireAuth, withDbClient, scopeEmpresaId, requirePacienteDeMiEmpresa((req) => req.body.paciente_id), async (req, res) => {
  const { paciente_id, empresa_id, fecha, hora, alergias, embarazo, cie10, tratamiento, firma } = req.body;
  try {
    const result = await req.db.queryRun(
      `INSERT INTO bitacora_registros (paciente_id, empresa_id, fecha, hora, alergias, embarazo, cie10, tratamiento, firma)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [paciente_id, empresa_id, fecha, hora, alergias, embarazo, cie10, tratamiento, firma]
    );
    res.json({ id: result.rows[0]?.id, message: 'Registro de bitácora guardado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bitacora_registros/:pacienteId', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.params.pacienteId), async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const result = await req.db.query(
      'SELECT * FROM bitacora_registros WHERE paciente_id = $1 ORDER BY fecha DESC, hora DESC',
      [pacienteId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Log general de bitácora con filtro por fecha/hora/nombre/área, para la
// vista de búsqueda (distinta de "listar por paciente" de arriba).
app.get('/api/bitacora_registros', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { search = '', empresa_id } = req.query;
  try {
    const searchTerm = `%${search}%`;
    const result = await req.db.query(
      `SELECT b.*, p.nombre AS paciente_nombre, p.area AS paciente_area, p.puesto AS paciente_puesto
       FROM bitacora_registros b
       JOIN pacientes p ON p.id = b.paciente_id
       WHERE b.empresa_id = $1
         AND (p.nombre ILIKE $2 OR p.area ILIKE $2 OR b.fecha::text ILIKE $2)
       ORDER BY b.fecha DESC, b.hora DESC`,
      [empresa_id, searchTerm]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE INCAPACIDADES ====================

app.post('/api/incapacidades', requireAuth, withDbClient, scopeEmpresaId, requirePacienteDeMiEmpresa((req) => req.body.paciente_id), async (req, res) => {
  const { paciente_id, empresa_id, fecha, hora, tipo, descripcion, dias, manejo, adjunto_url } = req.body;
  try {
    const result = await req.db.queryRun(
      `INSERT INTO incapacidades (paciente_id, empresa_id, fecha, hora, tipo, descripcion, dias, manejo, adjunto_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [paciente_id, empresa_id, fecha, hora, tipo, descripcion, dias, manejo, adjunto_url]
    );
    res.json({ id: result.rows[0]?.id, message: 'Incapacidad registrada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/incapacidades/:pacienteId', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.params.pacienteId), async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const result = await req.db.query(
      'SELECT * FROM incapacidades WHERE paciente_id = $1 ORDER BY fecha DESC, hora DESC',
      [pacienteId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/incapacidades', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { search = '', empresa_id } = req.query;
  try {
    const searchTerm = `%${search}%`;
    const result = await req.db.query(
      `SELECT i.*, p.nombre AS paciente_nombre, p.area AS paciente_area, p.puesto AS paciente_puesto
       FROM incapacidades i
       JOIN pacientes p ON p.id = i.paciente_id
       WHERE i.empresa_id = $1
         AND (p.nombre ILIKE $2 OR p.area ILIKE $2 OR i.fecha::text ILIKE $2)
       ORDER BY i.fecha DESC, i.hora DESC`,
      [empresa_id, searchTerm]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE SEGUIMIENTOS ====================

app.post('/api/seguimientos', requireAuth, withDbClient, scopeEmpresaId, requirePacienteDeMiEmpresa((req) => req.body.paciente_id), async (req, res) => {
  const { paciente_id, empresa_id, fecha, hora, tipo, observacion, cie10, tratamiento } = req.body;
  try {
    const result = await req.db.queryRun(
      `INSERT INTO seguimientos (paciente_id, empresa_id, fecha, hora, tipo, observacion, cie10, tratamiento)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [paciente_id, empresa_id, fecha, hora, tipo, observacion, cie10, tratamiento]
    );
    res.json({ id: result.rows[0]?.id, message: 'Seguimiento registrado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/seguimientos/:pacienteId', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.params.pacienteId), async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const result = await req.db.query(
      'SELECT * FROM seguimientos WHERE paciente_id = $1 ORDER BY fecha DESC, hora DESC',
      [pacienteId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/seguimientos', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { search = '', empresa_id } = req.query;
  try {
    const searchTerm = `%${search}%`;
    const result = await req.db.query(
      `SELECT s.*, p.nombre AS paciente_nombre, p.area AS paciente_area, p.puesto AS paciente_puesto
       FROM seguimientos s
       JOIN pacientes p ON p.id = s.paciente_id
       WHERE s.empresa_id = $1
         AND (p.nombre ILIKE $2 OR p.area ILIKE $2 OR s.fecha::text ILIKE $2)
       ORDER BY s.fecha DESC, s.hora DESC`,
      [empresa_id, searchTerm]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE RESTRICCIONES ====================

app.post('/api/restricciones', requireAuth, withDbClient, scopeEmpresaId, requirePacienteDeMiEmpresa((req) => req.body.paciente_id), async (req, res) => {
  const { paciente_id, empresa_id, fecha, hora, tipo, dias, descripcion } = req.body;
  try {
    const result = await req.db.queryRun(
      `INSERT INTO restricciones (paciente_id, empresa_id, fecha, hora, tipo, dias, descripcion)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [paciente_id, empresa_id, fecha, hora, tipo, dias, descripcion]
    );
    res.json({ id: result.rows[0]?.id, message: 'Restricción registrada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/restricciones/:pacienteId', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.params.pacienteId), async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const result = await req.db.query(
      'SELECT * FROM restricciones WHERE paciente_id = $1 ORDER BY fecha DESC, hora DESC',
      [pacienteId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/restricciones', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { search = '', empresa_id } = req.query;
  try {
    const searchTerm = `%${search}%`;
    const result = await req.db.query(
      `SELECT r.*, p.nombre AS paciente_nombre, p.area AS paciente_area, p.puesto AS paciente_puesto
       FROM restricciones r
       JOIN pacientes p ON p.id = r.paciente_id
       WHERE r.empresa_id = $1
         AND (p.nombre ILIKE $2 OR p.area ILIKE $2 OR r.fecha::text ILIKE $2)
       ORDER BY r.fecha DESC, r.hora DESC`,
      [empresa_id, searchTerm]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE ACCIDENTES ====================

app.post('/api/accidentes', requireAuth, withDbClient, scopeEmpresaId, requirePacienteDeMiEmpresa((req) => req.body.paciente_id), async (req, res) => {
  const { paciente_id, empresa_id, fecha, hora, hechos, exploracion_fisica, diagnostico,
    plan_accion, alcoholimetria, antidoping, adjunto_url } = req.body;
  try {
    const result = await req.db.queryRun(
      `INSERT INTO accidentes (
        paciente_id, empresa_id, fecha, hora, hechos, exploracion_fisica, diagnostico,
        plan_accion, alcoholimetria, antidoping, adjunto_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [paciente_id, empresa_id, fecha, hora, hechos, exploracion_fisica, diagnostico,
        plan_accion, alcoholimetria, antidoping, adjunto_url]
    );
    res.json({ id: result.rows[0]?.id, message: 'Accidente registrado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/accidentes/:pacienteId', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.params.pacienteId), async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const result = await req.db.query(
      'SELECT * FROM accidentes WHERE paciente_id = $1 ORDER BY fecha DESC, hora DESC',
      [pacienteId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/accidentes', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { search = '', empresa_id } = req.query;
  try {
    const searchTerm = `%${search}%`;
    const result = await req.db.query(
      `SELECT a.*, p.nombre AS paciente_nombre, p.area AS paciente_area, p.puesto AS paciente_puesto
       FROM accidentes a
       JOIN pacientes p ON p.id = a.paciente_id
       WHERE a.empresa_id = $1
         AND (p.nombre ILIKE $2 OR p.area ILIKE $2 OR a.fecha::text ILIKE $2)
       ORDER BY a.fecha DESC, a.hora DESC`,
      [empresa_id, searchTerm]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE TRABAJOS DE ALTO RIESGO ====================

app.post('/api/trabajos_alto_riesgo', requireAuth, withDbClient, scopeEmpresaId, requirePacienteDeMiEmpresa((req) => req.body.paciente_id), async (req, res) => {
  const { paciente_id, empresa_id, fecha, hora, tipo_riesgo, agudeza_visual, tension_arterial,
    frecuencia_cardiaca, glucosa, prueba_equilibrio, alcoholimetria, antidoping, autorizada } = req.body;
  try {
    const result = await req.db.queryRun(
      `INSERT INTO trabajos_alto_riesgo (
        paciente_id, empresa_id, fecha, hora, tipo_riesgo, agudeza_visual, tension_arterial,
        frecuencia_cardiaca, glucosa, prueba_equilibrio, alcoholimetria, antidoping, autorizada
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [paciente_id, empresa_id, fecha, hora, tipo_riesgo, agudeza_visual, tension_arterial,
        frecuencia_cardiaca, glucosa, prueba_equilibrio, alcoholimetria, antidoping, autorizada]
    );
    res.json({ id: result.rows[0]?.id, message: 'Trabajo de alto riesgo registrado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trabajos_alto_riesgo/:pacienteId', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.params.pacienteId), async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const result = await req.db.query(
      'SELECT * FROM trabajos_alto_riesgo WHERE paciente_id = $1 ORDER BY fecha DESC, hora DESC',
      [pacienteId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trabajos_alto_riesgo', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { search = '', empresa_id } = req.query;
  try {
    const searchTerm = `%${search}%`;
    const result = await req.db.query(
      `SELECT t.*, p.nombre AS paciente_nombre, p.area AS paciente_area, p.puesto AS paciente_puesto
       FROM trabajos_alto_riesgo t
       JOIN pacientes p ON p.id = t.paciente_id
       WHERE t.empresa_id = $1
         AND (p.nombre ILIKE $2 OR p.area ILIKE $2 OR t.fecha::text ILIKE $2)
       ORDER BY t.fecha DESC, t.hora DESC`,
      [empresa_id, searchTerm]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE AUTENTICACIÓN ====================

app.post('/api/login', async (req, res) => {
  const { num_empleado, password, empresa_id } = req.body;

  if (!num_empleado || !password) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  try {
    const params = [num_empleado];
    let whereEmpresa = '';
    if (empresa_id) {
      params.push(empresa_id);
      whereEmpresa = ' AND u.empresa_id = $2';
    }
    const result = await queryOne(
      `SELECT u.*, e.nombre as empresa_nombre, e.logo_url as empresa_logo_url, e.slug as empresa_slug, e.activo as empresa_activa
       FROM usuarios u
       JOIN empresas e ON u.empresa_id = e.id
       WHERE u.num_empleado = $1${whereEmpresa}`,
      params
    );
    if (!result || !(await bcrypt.compare(password, result.password))) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    if (!result.empresa_activa) {
      return res.status(403).json({ error: 'Tu empresa está pendiente de aprobación. Te avisaremos cuando esté activa.' });
    }
    // Reloj checador: cada login exitoso queda registrado como checada de
    // entrada. Un fallo aquí no debe tumbar el login.
    try {
      await queryRun('INSERT INTO asistencias (usuario_id, empresa_id) VALUES ($1, $2)', [result.id, result.empresa_id]);
    } catch (asistenciaError) {
      console.error('Error al registrar asistencia:', asistenciaError.message);
    }
    const { password: _, empresa_activa: __, ...userWithoutPassword } = result;
    const token = jwt.sign(
      { id: result.id, empresa_id: result.empresa_id, rol: result.rol, es_superadmin: result.es_superadmin },
      JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({
      success: true,
      user: userWithoutPassword,
      token,
      message: `Bienvenido ${result.nombre}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Solicita el restablecimiento de contraseña por correo. Responde siempre
// el mismo mensaje genérico exista o no la cuenta, para no filtrar qué
// usuarios existen en el sistema.
app.post('/api/forgot-password', async (req, res) => {
  const { empresa_id, num_empleado } = req.body;
  const mensajeGenerico = 'Si el usuario existe, se envió un correo con instrucciones';
  if (!num_empleado) {
    return res.status(400).json({ error: 'Faltan datos' });
  }
  try {
    const params = [num_empleado];
    let whereEmpresa = '';
    if (empresa_id) {
      params.push(empresa_id);
      whereEmpresa = ' AND empresa_id = $2';
    }
    const usuario = await queryOne(
      `SELECT id, nombre, correo FROM usuarios WHERE num_empleado = $1${whereEmpresa}`,
      params
    );
    if (usuario && usuario.correo) {
      const token = crypto.randomBytes(32).toString('hex');
      await queryRun(
        `UPDATE usuarios SET reset_token = $1, reset_token_expira = NOW() + interval '1 hour' WHERE id = $2`,
        [token, usuario.id]
      );
      const frontendUrl = process.env.FRONTEND_URL || 'https://bo-synergy.vercel.app';
      const link = `${frontendUrl}/reset-password/${token}`;
      enviarCorreoSimple(
        usuario.correo,
        'Restablecer contraseña',
        `Hola ${usuario.nombre}, para restablecer tu contraseña entra a este enlace (válido por 1 hora): ${link}`
      ).catch((error) => console.error('Error al enviar correo de restablecimiento:', error.message));
    }
    res.json({ message: mensajeGenerico });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reset-password', async (req, res) => {
  const { token, nueva_password } = req.body;
  if (!token || !nueva_password) {
    return res.status(400).json({ error: 'Faltan datos' });
  }
  try {
    const usuario = await queryOne(
      'SELECT id FROM usuarios WHERE reset_token = $1 AND reset_token_expira > NOW()',
      [token]
    );
    if (!usuario) {
      return res.status(400).json({ error: 'El enlace no es válido o ya expiró.' });
    }
    const passwordHash = await bcrypt.hash(nueva_password, 10);
    await queryRun(
      'UPDATE usuarios SET password = $1, reset_token = NULL, reset_token_expira = NULL WHERE id = $2',
      [passwordHash, usuario.id]
    );
    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE USUARIOS ====================

app.get('/api/usuarios', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  try {
    const { empresa_id } = req.query;
    const result = await req.db.query(
      'SELECT id, num_empleado, nombre, rol, fecha_registro FROM usuarios WHERE empresa_id = $1',
      [empresa_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/asistencias', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  try {
    const { empresa_id } = req.query;
    const result = await req.db.query(
      `SELECT a.id, a.fecha_hora, u.nombre, u.num_empleado, u.rol
       FROM asistencias a
       JOIN usuarios u ON a.usuario_id = u.id
       WHERE a.empresa_id = $1
       ORDER BY a.fecha_hora DESC
       LIMIT 200`,
      [empresa_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/usuarios', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  const { num_empleado, nombre, rol, password, empresa_id, correo } = req.body;

  if (!num_empleado || !nombre || !rol || !password) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await req.db.queryRun(
      `INSERT INTO usuarios (num_empleado, nombre, rol, password, empresa_id, correo, fecha_registro)
       VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id`,
      [num_empleado, nombre, rol, passwordHash, empresa_id, correo || null]
    );
    res.json({ id: result.rows[0]?.id, message: 'Usuario creado correctamente' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El número de empleado ya existe' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Alta masiva de usuarios desde un Excel (número de empleado, nombre, rol,
// contraseña), para no tener que crear cuentas una por una.
app.post('/api/usuarios/importar', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  const { empresa_id, usuarios: listaUsuarios } = req.body;
  if (!empresa_id || !Array.isArray(listaUsuarios) || listaUsuarios.length === 0) {
    return res.status(400).json({ error: 'Se requiere una lista de usuarios' });
  }

  let insertados = 0;
  const errores = [];
  for (let i = 0; i < listaUsuarios.length; i++) {
    const u = listaUsuarios[i];
    if (!u.num_empleado || !u.nombre || !u.rol || !u.password) {
      errores.push({ fila: i + 2, motivo: 'Faltan campos requeridos (número de empleado, nombre, rol o contraseña)' });
      continue;
    }
    try {
      const passwordHash = await bcrypt.hash(u.password, 10);
      await req.db.queryRun(
        `INSERT INTO usuarios (num_empleado, nombre, rol, password, empresa_id, fecha_registro)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [u.num_empleado, u.nombre, u.rol, passwordHash, empresa_id]
      );
      insertados++;
    } catch (error) {
      errores.push({ fila: i + 2, motivo: error.code === '23505' ? 'Número de empleado duplicado' : error.message });
    }
  }
  res.json({ insertados, errores });
});

app.delete('/api/usuarios/:id', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  const { id } = req.params;
  const { empresa_id } = req.query;

  try {
    const user = await req.db.queryOne('SELECT num_empleado FROM usuarios WHERE id = $1 AND empresa_id = $2', [id, empresa_id]);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (user.num_empleado === 'ADMIN001') {
      return res.status(403).json({ error: 'No se puede eliminar al administrador principal' });
    }
    await req.db.queryRun('DELETE FROM usuarios WHERE id = $1 AND empresa_id = $2', [id, empresa_id]);
    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/usuarios/:id/resetear-password', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  const { id } = req.params;
  const { nueva_password, empresa_id } = req.body;

  if (!nueva_password) {
    return res.status(400).json({ error: 'La nueva contraseña es requerida' });
  }

  try {
    const passwordHash = await bcrypt.hash(nueva_password, 10);
    await req.db.queryRun('UPDATE usuarios SET password = $1 WHERE id = $2 AND empresa_id = $3', [passwordHash, id, empresa_id]);
    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Herramienta de soporte del superadmin: resetea la contraseña de
// cualquier usuario de cualquier empresa (por num_empleado, sin filtrar
// por empresa_id). Cubre el caso de que el único admin de una empresa
// olvide su contraseña y no haya nadie más ahí que pueda ayudarlo.
app.patch('/api/usuarios/resetear-password-admin', requireAuth, withDbClient, requireSuperadmin, async (req, res) => {
  const { num_empleado, nueva_password } = req.body;

  if (!num_empleado || !nueva_password) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }

  try {
    const passwordHash = await bcrypt.hash(nueva_password, 10);
    const result = await req.db.queryRun('UPDATE usuarios SET password = $1 WHERE num_empleado = $2 RETURNING id', [passwordHash, num_empleado]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'No existe un usuario con ese número de empleado' });
    }
    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE ESTADÍSTICAS ====================

app.get('/api/estadisticas', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  try {
    const { empresa_id } = req.query;
    const totalPacientes = await req.db.queryOne('SELECT COUNT(*) as total FROM pacientes WHERE empresa_id = $1', [empresa_id]);
    const totalConsultas = await req.db.queryOne(
      'SELECT COUNT(*) as total FROM consultas c JOIN pacientes p ON c.paciente_id = p.id WHERE p.empresa_id = $1',
      [empresa_id]
    );
    const totalEMI = await req.db.queryOne(
      'SELECT COUNT(*) as total FROM emi e JOIN pacientes p ON e.paciente_id = p.id WHERE p.empresa_id = $1',
      [empresa_id]
    );
    const totalEMP = await req.db.queryOne(
      'SELECT COUNT(*) as total FROM emp e JOIN pacientes p ON e.paciente_id = p.id WHERE p.empresa_id = $1',
      [empresa_id]
    );
    const totalEMR = await req.db.queryOne(
      'SELECT COUNT(*) as total FROM emr e JOIN pacientes p ON e.paciente_id = p.id WHERE p.empresa_id = $1',
      [empresa_id]
    );
    const totalVulnerabilidad = await req.db.queryOne(
      'SELECT COUNT(*) as total FROM vulnerabilidad v JOIN pacientes p ON v.paciente_id = p.id WHERE p.empresa_id = $1',
      [empresa_id]
    );

    res.json({
      totalPacientes: parseInt(totalPacientes.total) || 0,
      totalConsultas: parseInt(totalConsultas.total) || 0,
      totalEMI: parseInt(totalEMI.total) || 0,
      totalEMP: parseInt(totalEMP.total) || 0,
      totalEMR: parseInt(totalEMR.total) || 0,
      totalVulnerabilidad: parseInt(totalVulnerabilidad.total) || 0,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/top-motivos', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  try {
    const { empresa_id } = req.query;
    const result = await req.db.query(`
      SELECT motivo, COUNT(*) as count
      FROM consultas c
      JOIN pacientes p ON c.paciente_id = p.id
      WHERE p.empresa_id = $1 AND motivo IS NOT NULL AND motivo != ''
      GROUP BY motivo
      ORDER BY count DESC
      LIMIT 5
    `, [empresa_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/top-areas', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  try {
    const { empresa_id } = req.query;
    const result = await req.db.query(`
      SELECT p.area, COUNT(c.id) as count
      FROM consultas c
      JOIN pacientes p ON c.paciente_id = p.id
      WHERE p.empresa_id = $1 AND p.area IS NOT NULL AND p.area != ''
      GROUP BY p.area
      ORDER BY count DESC
      LIMIT 5
    `, [empresa_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/consultas-por-mes', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  try {
    const { empresa_id } = req.query;
    const result = await req.db.query(`
      SELECT TO_CHAR(c.fecha, 'YYYY-MM') as mes, COUNT(*) as count
      FROM consultas c
      JOIN pacientes p ON c.paciente_id = p.id
      WHERE p.empresa_id = $1
      GROUP BY mes
      ORDER BY mes DESC
      LIMIT 12
    `, [empresa_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/pacientes-por-area', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  try {
    const { empresa_id } = req.query;
    const result = await req.db.query(`
      SELECT area, COUNT(*) as count
      FROM pacientes
      WHERE empresa_id = $1 AND area IS NOT NULL AND area != ''
      GROUP BY area
      ORDER BY count DESC
    `, [empresa_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE ENVÍO DE CORREOS ====================

app.post('/api/enviar-constancia', requireAuth, async (req, res) => {
  const { destinatario, paciente, consulta, pdfBase64 } = req.body;
  
  if (!destinatario || !paciente || !consulta || !pdfBase64) {
    return res.status(400).json({ error: 'Faltan datos para enviar el correo' });
  }

  try {
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const nombrePDF = `Constancia_${paciente.nombre}_${consulta.fecha}.pdf`;

    const asunto = `📄 Constancia de Consulta - WH Management`;
    const mensaje = `
      Estimado(a) ${paciente.nombre},
      Adjunto encontrarás la constancia de tu consulta médica realizada en WH Management.
      Detalles de la consulta:
      - Fecha: ${new Date(consulta.fecha).toLocaleDateString('es-MX')}
      - Motivo: ${consulta.motivo || 'No especificado'}
      - Diagnóstico: ${consulta.impresion_diagnostica || 'Pendiente'}
      Saludos cordiales,
      WH Management - Salud Ocupacional
    `;

    const resultado = await enviarCorreo(destinatario, asunto, mensaje, pdfBuffer, nombrePDF);
    
    if (resultado.success) {
      res.json({ success: true, message: 'Constancia enviada por correo' });
    } else {
      res.status(500).json({ error: resultado.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/enviar-receta', requireAuth, async (req, res) => {
  const { destinatario, paciente, consulta, pdfBase64 } = req.body;
  
  if (!destinatario || !paciente || !consulta || !pdfBase64) {
    return res.status(400).json({ error: 'Faltan datos para enviar el correo' });
  }

  try {
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const nombrePDF = `Receta_${paciente.nombre}_${consulta.fecha}.pdf`;

    const asunto = `💊 Receta Médica - WH Management`;
    const mensaje = `
      Estimado(a) ${paciente.nombre},
      Adjunto encontrarás tu receta médica emitida por WH Management.
      Detalles de la receta:
      - Fecha: ${new Date(consulta.fecha).toLocaleDateString('es-MX')}
      - Diagnóstico: ${consulta.impresion_diagnostica || 'Pendiente'}
      - Medicamentos: ${consulta.medicamentos || 'No especificados'}
      Saludos cordiales,
      WH Management - Salud Ocupacional
    `;

    const resultado = await enviarCorreo(destinatario, asunto, mensaje, pdfBuffer, nombrePDF);
    
    if (resultado.success) {
      res.json({ success: true, message: 'Receta enviada por correo' });
    } else {
      res.status(500).json({ error: resultado.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/enviar-incapacidad', requireAuth, async (req, res) => {
  const { destinatario, paciente, consulta, pdfBase64 } = req.body;
  
  if (!destinatario || !paciente || !consulta || !pdfBase64) {
    return res.status(400).json({ error: 'Faltan datos para enviar el correo' });
  }

  try {
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const nombrePDF = `Incapacidad_${paciente.nombre}_${consulta.fecha}.pdf`;

    const asunto = `🏥 Reporte de Incapacidad - WH Management`;
    const mensaje = `
      Estimado(a) ${paciente.nombre},
      Adjunto encontrarás el reporte de incapacidad emitido por WH Management.
      Detalles de la incapacidad:
      - Fecha de emisión: ${new Date(consulta.fecha).toLocaleDateString('es-MX')}
      - Motivo: ${consulta.motivo || 'No especificado'}
      - Diagnóstico: ${consulta.impresion_diagnostica || 'Pendiente'}
      Saludos cordiales,
      WH Management - Salud Ocupacional
    `;

    const resultado = await enviarCorreo(destinatario, asunto, mensaje, pdfBuffer, nombrePDF);
    
    if (resultado.success) {
      res.json({ success: true, message: 'Reporte de incapacidad enviado por correo' });
    } else {
      res.status(500).json({ error: resultado.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE AGENDA ====================
// Actividades personales del usuario (reunión, consulta, seguimiento,
// informe) para el calendario de Mi Agenda.

app.post('/api/agenda', requireAuth, withDbClient, scopeEmpresaId, scopeUsuarioId, async (req, res) => {
  const { usuario_id, empresa_id, tipo, descripcion, fecha, hora } = req.body;
  if (!usuario_id || !empresa_id || !tipo || !fecha) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  try {
    const result = await req.db.queryRun(
      `INSERT INTO agenda_actividades (usuario_id, empresa_id, tipo, descripcion, fecha, hora)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [usuario_id, empresa_id, tipo, descripcion, fecha, hora || null]
    );
    res.json({ id: result.rows[0]?.id, message: 'Actividad registrada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/agenda', requireAuth, withDbClient, scopeEmpresaId, scopeUsuarioId, async (req, res) => {
  const { usuario_id, empresa_id, mes, anio } = req.query;
  if (!usuario_id || !empresa_id) {
    return res.status(400).json({ error: 'Se requiere usuario_id y empresa_id' });
  }
  try {
    let sql = 'SELECT * FROM agenda_actividades WHERE usuario_id = $1 AND empresa_id = $2';
    const params = [usuario_id, empresa_id];
    if (mes && anio) {
      params.push(mes, anio);
      sql += ` AND EXTRACT(MONTH FROM fecha) = $${params.length - 1} AND EXTRACT(YEAR FROM fecha) = $${params.length}`;
    }
    sql += ' ORDER BY fecha, hora';
    const result = await req.db.query(sql, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/agenda/:id', requireAuth, withDbClient, scopeUsuarioId, async (req, res) => {
  const { id } = req.params;
  const { usuario_id, tipo, descripcion, fecha, hora } = req.body;
  try {
    await req.db.queryRun(
      `UPDATE agenda_actividades SET tipo = $1, descripcion = $2, fecha = $3, hora = $4
       WHERE id = $5 AND usuario_id = $6`,
      [tipo, descripcion, fecha, hora || null, id, usuario_id]
    );
    res.json({ message: 'Actividad actualizada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/agenda/:id', requireAuth, withDbClient, scopeUsuarioId, async (req, res) => {
  const { id } = req.params;
  const { usuario_id } = req.query;
  try {
    await req.db.queryRun('DELETE FROM agenda_actividades WHERE id = $1 AND usuario_id = $2', [id, usuario_id]);
    res.json({ message: 'Actividad eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== NOM-035 (RIESGO PSICOSOCIAL) ====================
// IMPORTANTE: nom035_preguntas y nom035_rangos_riesgo contienen contenido
// de EJEMPLO (ver migración 011_nom035.sql), no el texto oficial de la
// Guía de Referencia de la STPS. No usar para acreditar cumplimiento real
// hasta sustituir ese contenido.

// Catálogo de preguntas (no es dato de empresa, cualquier usuario
// autenticado puede leerlo).
app.get('/api/nom035/preguntas', requireAuth, withDbClient, async (req, res) => {
  try {
    const { guia } = req.query;
    if (!guia) {
      return res.status(400).json({ error: 'Se requiere la guía (I, II o III)' });
    }
    const result = await req.db.query(
      'SELECT id, guia, dominio, texto, orden FROM nom035_preguntas WHERE guia = $1 ORDER BY dominio, orden',
      [guia]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/nom035/campanas', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  try {
    const { empresa_id } = req.query;
    const result = await req.db.query(
      'SELECT * FROM nom035_campanas WHERE empresa_id = $1 ORDER BY fecha_inicio DESC',
      [empresa_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/nom035/campanas', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  const { empresa_id, nombre, guia, fecha_inicio } = req.body;
  if (!nombre || !guia || !fecha_inicio) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  try {
    const result = await req.db.queryRun(
      `INSERT INTO nom035_campanas (empresa_id, nombre, guia, fecha_inicio, creada_por)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [empresa_id, nombre, guia, fecha_inicio, req.auth.id]
    );
    res.json({ id: result.rows[0]?.id, message: 'Campaña creada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/nom035/campanas/:id', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  const { id } = req.params;
  const { empresa_id, estado, fecha_fin } = req.body;
  try {
    await req.db.queryRun(
      'UPDATE nom035_campanas SET estado = COALESCE($1, estado), fecha_fin = COALESCE($2, fecha_fin) WHERE id = $3 AND empresa_id = $4',
      [estado || null, fecha_fin || null, id, empresa_id]
    );
    res.json({ message: 'Campaña actualizada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Calcula y guarda los resultados por dominio (y GENERAL) de un
// trabajador dentro de una campaña, a partir de sus respuestas ya
// guardadas. Se llama después de cada envío de respuestas.
const calcularResultadosNom035 = async (db, campanaId, pacienteId) => {
  const campana = await db.queryOne('SELECT guia, empresa_id FROM nom035_campanas WHERE id = $1', [campanaId]);
  if (!campana) return;

  const respuestas = await db.query(
    `SELECT r.valor, p.dominio, p.es_inverso
     FROM nom035_respuestas r
     JOIN nom035_preguntas p ON p.id = r.pregunta_id
     WHERE r.campana_id = $1 AND r.paciente_id = $2`,
    [campanaId, pacienteId]
  );

  const puntajePorDominio = {};
  let puntajeGeneral = 0;
  for (const fila of respuestas.rows) {
    const valorEfectivo = fila.es_inverso ? (4 - fila.valor) : fila.valor;
    puntajePorDominio[fila.dominio] = (puntajePorDominio[fila.dominio] || 0) + valorEfectivo;
    puntajeGeneral += valorEfectivo;
  }
  puntajePorDominio['GENERAL'] = puntajeGeneral;

  for (const [dominio, puntaje] of Object.entries(puntajePorDominio)) {
    const rango = await db.queryOne(
      'SELECT categoria_riesgo FROM nom035_rangos_riesgo WHERE guia = $1 AND dominio = $2 AND $3 BETWEEN puntaje_min AND puntaje_max',
      [campana.guia, dominio, puntaje]
    );
    const categoria = rango ? rango.categoria_riesgo : 'muy_alto';
    await db.queryRun(
      `INSERT INTO nom035_resultados (campana_id, paciente_id, empresa_id, dominio, puntaje, categoria_riesgo)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (campana_id, paciente_id, dominio)
       DO UPDATE SET puntaje = $5, categoria_riesgo = $6, calculado_en = NOW()`,
      [campanaId, pacienteId, campana.empresa_id, dominio, puntaje, categoria]
    );
  }
};

// Guarda (o actualiza) las respuestas de un trabajador a una campaña y
// recalcula sus resultados. Body: { campana_id, paciente_id, respuestas: [{ pregunta_id, valor }] }
app.post('/api/nom035/respuestas', requireAuth, withDbClient, scopeEmpresaId, requirePacienteDeMiEmpresa((req) => req.body.paciente_id), async (req, res) => {
  const { campana_id, paciente_id, empresa_id, respuestas } = req.body;
  if (!campana_id || !paciente_id || !Array.isArray(respuestas) || respuestas.length === 0) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  try {
    for (const r of respuestas) {
      await req.db.queryRun(
        `INSERT INTO nom035_respuestas (campana_id, paciente_id, empresa_id, pregunta_id, valor)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (campana_id, paciente_id, pregunta_id)
         DO UPDATE SET valor = $5, fecha_respuesta = NOW()`,
        [campana_id, paciente_id, empresa_id, r.pregunta_id, r.valor]
      );
    }
    await calcularResultadosNom035(req.db, campana_id, paciente_id);
    res.json({ message: 'Respuestas guardadas correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/nom035/respuestas/:campanaId/:pacienteId', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.params.pacienteId), async (req, res) => {
  const { campanaId, pacienteId } = req.params;
  try {
    const result = await req.db.query(
      'SELECT pregunta_id, valor FROM nom035_respuestas WHERE campana_id = $1 AND paciente_id = $2',
      [campanaId, pacienteId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resultado individual de un trabajador (para dar seguimiento clínico).
app.get('/api/nom035/resultados/:campanaId/:pacienteId', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.params.pacienteId), async (req, res) => {
  const { campanaId, pacienteId } = req.params;
  try {
    const result = await req.db.query(
      'SELECT dominio, puntaje, categoria_riesgo FROM nom035_resultados WHERE campana_id = $1 AND paciente_id = $2',
      [campanaId, pacienteId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resultado agregado de toda la campaña (conteo de trabajadores por
// categoría de riesgo y dominio, nunca identificados por nombre — la
// norma pide confidencialidad en el reporte agregado).
app.get('/api/nom035/resultados', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { campana_id, empresa_id } = req.query;
  if (!campana_id) {
    return res.status(400).json({ error: 'Se requiere campana_id' });
  }
  try {
    const result = await req.db.query(
      `SELECT dominio, categoria_riesgo, COUNT(*) as total
       FROM nom035_resultados
       WHERE campana_id = $1 AND empresa_id = $2
       GROUP BY dominio, categoria_riesgo
       ORDER BY dominio, categoria_riesgo`,
      [campana_id, empresa_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== NOM-035: EVENTOS TRAUMÁTICOS ====================

app.post('/api/nom035/eventos-traumaticos', requireAuth, withDbClient, scopeEmpresaId, requirePacienteDeMiEmpresa((req) => req.body.paciente_id), async (req, res) => {
  const { paciente_id, empresa_id, fecha, tipo_evento, descripcion, atencion_brindada } = req.body;
  if (!paciente_id || !fecha || !tipo_evento) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  try {
    const result = await req.db.queryRun(
      `INSERT INTO nom035_eventos_traumaticos (paciente_id, empresa_id, fecha, tipo_evento, descripcion, atencion_brindada)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [paciente_id, empresa_id, fecha, tipo_evento, descripcion || null, atencion_brindada || null]
    );
    res.json({ id: result.rows[0]?.id, message: 'Evento registrado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/nom035/eventos-traumaticos/:pacienteId', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.params.pacienteId), async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const result = await req.db.query(
      'SELECT * FROM nom035_eventos_traumaticos WHERE paciente_id = $1 ORDER BY fecha DESC',
      [pacienteId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/nom035/eventos-traumaticos', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { empresa_id } = req.query;
  try {
    const result = await req.db.query(
      `SELECT e.*, p.nombre AS paciente_nombre, p.area AS paciente_area
       FROM nom035_eventos_traumaticos e
       JOIN pacientes p ON p.id = e.paciente_id
       WHERE e.empresa_id = $1
       ORDER BY e.fecha DESC`,
      [empresa_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/nom035/eventos-traumaticos/:id', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { id } = req.params;
  const { empresa_id, estado, atencion_brindada } = req.body;
  try {
    await req.db.queryRun(
      'UPDATE nom035_eventos_traumaticos SET estado = COALESCE($1, estado), atencion_brindada = COALESCE($2, atencion_brindada) WHERE id = $3 AND empresa_id = $4',
      [estado || null, atencion_brindada || null, id, empresa_id]
    );
    res.json({ message: 'Evento actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== NOM-035: PLAN DE ACCIÓN ====================

app.post('/api/nom035/plan-accion', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  const { empresa_id, campana_id, dominio, accion, responsable, fecha_compromiso } = req.body;
  if (!dominio || !accion) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  try {
    const result = await req.db.queryRun(
      `INSERT INTO nom035_plan_accion (empresa_id, campana_id, dominio, accion, responsable, fecha_compromiso)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [empresa_id, campana_id || null, dominio, accion, responsable || null, fecha_compromiso || null]
    );
    res.json({ id: result.rows[0]?.id, message: 'Acción registrada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/nom035/plan-accion', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { empresa_id, campana_id } = req.query;
  try {
    const params = [empresa_id];
    let sql = 'SELECT * FROM nom035_plan_accion WHERE empresa_id = $1';
    if (campana_id) {
      params.push(campana_id);
      sql += ` AND campana_id = $${params.length}`;
    }
    sql += ' ORDER BY fecha_compromiso NULLS LAST, id DESC';
    const result = await req.db.query(sql, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/nom035/plan-accion/:id', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  const { id } = req.params;
  const { empresa_id, estatus } = req.body;
  try {
    await req.db.queryRun(
      'UPDATE nom035_plan_accion SET estatus = COALESCE($1, estatus) WHERE id = $2 AND empresa_id = $3',
      [estatus || null, id, empresa_id]
    );
    res.json({ message: 'Plan de acción actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== NOM-036 (RIESGO ERGONÓMICO — MANEJO MANUAL DE CARGAS) ====================
// IMPORTANTE: los criterios de calificación en calcularPuntajeNom036 y los
// rangos en nom036_rangos_riesgo son de EJEMPLO (ver migración
// 012_nom036.sql), no las tablas ni límites exactos de los anexos de la
// STPS (NOM-036-1-STPS-2018). No usar para acreditar cumplimiento real
// hasta sustituir esos criterios y validarlos con el área legal/de
// cumplimiento.

const calcularPuntajeNom036 = ({ peso_carga_kg, frecuencia_por_hora, distancia_transporte_m, postura, duracion_jornada_horas, trabajador_vulnerable }) => {
  let puntaje = 0;

  if (peso_carga_kg > 25) puntaje += 3;
  else if (peso_carga_kg > 10) puntaje += 2;
  else if (peso_carga_kg > 3) puntaje += 1;

  if (frecuencia_por_hora > 30) puntaje += 3;
  else if (frecuencia_por_hora > 12) puntaje += 2;
  else if (frecuencia_por_hora > 5) puntaje += 1;

  if (distancia_transporte_m > 10) puntaje += 3;
  else if (distancia_transporte_m > 5) puntaje += 2;
  else if (distancia_transporte_m > 1) puntaje += 1;

  const puntosPostura = { neutra: 0, ligeramente_flexionada: 1, flexionada: 2, muy_flexionada_o_girada: 3 };
  puntaje += puntosPostura[postura] ?? 0;

  if (duracion_jornada_horas > 8) puntaje += 3;
  else if (duracion_jornada_horas > 6) puntaje += 2;
  else if (duracion_jornada_horas > 4) puntaje += 1;

  if (trabajador_vulnerable) puntaje += 2;

  return puntaje;
};

app.post('/api/nom036/evaluaciones', requireAuth, withDbClient, scopeEmpresaId, requirePacienteDeMiEmpresa((req) => req.body.paciente_id), async (req, res) => {
  const { empresa_id, paciente_id, fecha, puesto, peso_carga_kg, frecuencia_por_hora, distancia_transporte_m, postura, duracion_jornada_horas, trabajador_vulnerable, observaciones } = req.body;
  if (!paciente_id || !fecha || peso_carga_kg == null || frecuencia_por_hora == null || distancia_transporte_m == null || !postura || duracion_jornada_horas == null) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  try {
    const puntaje = calcularPuntajeNom036({ peso_carga_kg, frecuencia_por_hora, distancia_transporte_m, postura, duracion_jornada_horas, trabajador_vulnerable });
    const rango = await req.db.queryOne(
      'SELECT categoria_riesgo FROM nom036_rangos_riesgo WHERE $1 BETWEEN puntaje_min AND puntaje_max',
      [puntaje]
    );
    const categoria_riesgo = rango ? rango.categoria_riesgo : 'muy_alto';
    const result = await req.db.queryRun(
      `INSERT INTO nom036_evaluaciones (empresa_id, paciente_id, fecha, puesto, peso_carga_kg, frecuencia_por_hora, distancia_transporte_m, postura, duracion_jornada_horas, trabajador_vulnerable, observaciones, puntaje, categoria_riesgo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [empresa_id, paciente_id, fecha, puesto || null, peso_carga_kg, frecuencia_por_hora, distancia_transporte_m, postura, duracion_jornada_horas, !!trabajador_vulnerable, observaciones || null, puntaje, categoria_riesgo]
    );
    res.json({ id: result.rows[0]?.id, puntaje, categoria_riesgo, message: 'Evaluación registrada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/nom036/evaluaciones/:pacienteId', requireAuth, withDbClient, requirePacienteDeMiEmpresa((req) => req.params.pacienteId), async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const result = await req.db.query(
      'SELECT * FROM nom036_evaluaciones WHERE paciente_id = $1 ORDER BY fecha DESC',
      [pacienteId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/nom036/evaluaciones', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { empresa_id, categoria_riesgo } = req.query;
  try {
    const params = [empresa_id];
    let sql = `SELECT e.*, p.nombre AS paciente_nombre, p.area AS paciente_area
               FROM nom036_evaluaciones e
               JOIN pacientes p ON p.id = e.paciente_id
               WHERE e.empresa_id = $1`;
    if (categoria_riesgo) {
      params.push(categoria_riesgo);
      sql += ` AND e.categoria_riesgo = $${params.length}`;
    }
    sql += ' ORDER BY e.fecha DESC';
    const result = await req.db.query(sql, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== NOM-036: PLAN DE ACCIÓN ====================

app.post('/api/nom036/plan-accion', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  const { empresa_id, evaluacion_id, accion, responsable, fecha_compromiso } = req.body;
  if (!accion) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  try {
    const result = await req.db.queryRun(
      `INSERT INTO nom036_plan_accion (empresa_id, evaluacion_id, accion, responsable, fecha_compromiso)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [empresa_id, evaluacion_id || null, accion, responsable || null, fecha_compromiso || null]
    );
    res.json({ id: result.rows[0]?.id, message: 'Acción registrada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/nom036/plan-accion', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { empresa_id } = req.query;
  try {
    const result = await req.db.query(
      'SELECT * FROM nom036_plan_accion WHERE empresa_id = $1 ORDER BY fecha_compromiso NULLS LAST, id DESC',
      [empresa_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/nom036/plan-accion/:id', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  const { id } = req.params;
  const { empresa_id, estatus } = req.body;
  try {
    await req.db.queryRun(
      'UPDATE nom036_plan_accion SET estatus = COALESCE($1, estatus) WHERE id = $2 AND empresa_id = $3',
      [estatus || null, id, empresa_id]
    );
    res.json({ message: 'Plan de acción actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== NOM-019 (COMISIÓN DE SEGURIDAD E HIGIENE) ====================
// IMPORTANTE: la periodicidad de reuniones y el quórum/composición
// formalmente exigidos por la NOM-019-STPS-2011 varían según tamaño y
// nivel de riesgo de la empresa. Aquí quedan como campos libres
// (periodicidad_reuniones es texto, no una regla forzada) — deben
// confirmarse con el área legal/de cumplimiento antes de tratarse como
// obligatorios.

app.get('/api/nom019/comisiones', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  try {
    const { empresa_id } = req.query;
    const result = await req.db.query(
      'SELECT * FROM nom019_comisiones WHERE empresa_id = $1 ORDER BY fecha_constitucion DESC',
      [empresa_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/nom019/comisiones', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  const { empresa_id, fecha_constitucion, vigencia_hasta, periodicidad_reuniones } = req.body;
  if (!fecha_constitucion) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  try {
    const result = await req.db.queryRun(
      `INSERT INTO nom019_comisiones (empresa_id, fecha_constitucion, vigencia_hasta, periodicidad_reuniones)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [empresa_id, fecha_constitucion, vigencia_hasta || null, periodicidad_reuniones || null]
    );
    res.json({ id: result.rows[0]?.id, message: 'Comisión registrada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/nom019/comisiones/:id', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  const { id } = req.params;
  const { empresa_id, estado, vigencia_hasta } = req.body;
  try {
    await req.db.queryRun(
      'UPDATE nom019_comisiones SET estado = COALESCE($1, estado), vigencia_hasta = COALESCE($2, vigencia_hasta) WHERE id = $3 AND empresa_id = $4',
      [estado || null, vigencia_hasta || null, id, empresa_id]
    );
    res.json({ message: 'Comisión actualizada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/nom019/integrantes', requireAuth, withDbClient, async (req, res) => {
  const { comision_id } = req.query;
  if (!comision_id) {
    return res.status(400).json({ error: 'Se requiere comision_id' });
  }
  try {
    const result = await req.db.query(
      'SELECT * FROM nom019_integrantes WHERE comision_id = $1 ORDER BY representacion, cargo',
      [comision_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/nom019/integrantes', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  const { empresa_id, comision_id, paciente_id, nombre, representacion, cargo } = req.body;
  if (!comision_id || !nombre || !representacion || !cargo) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  try {
    const result = await req.db.queryRun(
      `INSERT INTO nom019_integrantes (comision_id, empresa_id, paciente_id, nombre, representacion, cargo)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [comision_id, empresa_id, paciente_id || null, nombre, representacion, cargo]
    );
    res.json({ id: result.rows[0]?.id, message: 'Integrante agregado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/nom019/integrantes/:id', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  const { id } = req.params;
  const { empresa_id, activo } = req.body;
  try {
    await req.db.queryRun(
      'UPDATE nom019_integrantes SET activo = COALESCE($1, activo) WHERE id = $2 AND empresa_id = $3',
      [activo === undefined ? null : activo, id, empresa_id]
    );
    res.json({ message: 'Integrante actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== NOM-019: REUNIONES Y ACUERDOS ====================

app.get('/api/nom019/reuniones', requireAuth, withDbClient, async (req, res) => {
  const { comision_id } = req.query;
  if (!comision_id) {
    return res.status(400).json({ error: 'Se requiere comision_id' });
  }
  try {
    const result = await req.db.query(
      'SELECT * FROM nom019_reuniones WHERE comision_id = $1 ORDER BY fecha DESC',
      [comision_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/nom019/reuniones', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  const { empresa_id, comision_id, fecha, tipo, lugar, asistentes, temas } = req.body;
  if (!comision_id || !fecha) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  try {
    const result = await req.db.queryRun(
      `INSERT INTO nom019_reuniones (comision_id, empresa_id, fecha, tipo, lugar, asistentes, temas, creada_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [comision_id, empresa_id, fecha, tipo || 'ordinaria', lugar || null, asistentes || null, temas || null, req.auth.id]
    );
    res.json({ id: result.rows[0]?.id, message: 'Reunión registrada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/nom019/acuerdos', requireAuth, withDbClient, scopeEmpresaId, async (req, res) => {
  const { empresa_id, reunion_id } = req.query;
  try {
    const params = [empresa_id];
    let sql = `SELECT a.*, r.fecha AS reunion_fecha
               FROM nom019_acuerdos a
               JOIN nom019_reuniones r ON r.id = a.reunion_id
               WHERE a.empresa_id = $1`;
    if (reunion_id) {
      params.push(reunion_id);
      sql += ` AND a.reunion_id = $${params.length}`;
    }
    sql += ' ORDER BY a.fecha_compromiso NULLS LAST, a.id DESC';
    const result = await req.db.query(sql, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/nom019/acuerdos', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  const { empresa_id, reunion_id, descripcion, responsable, fecha_compromiso } = req.body;
  if (!reunion_id || !descripcion) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  try {
    const result = await req.db.queryRun(
      `INSERT INTO nom019_acuerdos (reunion_id, empresa_id, descripcion, responsable, fecha_compromiso)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [reunion_id, empresa_id, descripcion, responsable || null, fecha_compromiso || null]
    );
    res.json({ id: result.rows[0]?.id, message: 'Acuerdo registrado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/nom019/acuerdos/:id', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  const { id } = req.params;
  const { empresa_id, estatus } = req.body;
  try {
    await req.db.queryRun(
      'UPDATE nom019_acuerdos SET estatus = COALESCE($1, estatus) WHERE id = $2 AND empresa_id = $3',
      [estatus || null, id, empresa_id]
    );
    res.json({ message: 'Acuerdo actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== NOM-019: RECORRIDOS DE VERIFICACIÓN ====================

app.get('/api/nom019/recorridos', requireAuth, withDbClient, async (req, res) => {
  const { comision_id } = req.query;
  if (!comision_id) {
    return res.status(400).json({ error: 'Se requiere comision_id' });
  }
  try {
    const result = await req.db.query(
      'SELECT * FROM nom019_recorridos WHERE comision_id = $1 ORDER BY fecha DESC',
      [comision_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/nom019/recorridos', requireAuth, withDbClient, requireAdmin, scopeEmpresaId, async (req, res) => {
  const { empresa_id, comision_id, fecha, area, hallazgos, responsable } = req.body;
  if (!comision_id || !fecha || !area) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  try {
    const result = await req.db.queryRun(
      `INSERT INTO nom019_recorridos (comision_id, empresa_id, fecha, area, hallazgos, responsable)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [comision_id, empresa_id, fecha, area, hallazgos || null, responsable || null]
    );
    res.json({ id: result.rows[0]?.id, message: 'Recorrido registrado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== INICIAR SERVIDOR ====================

app.listen(PORT, () => {
  console.log(`🚀 Servidor WH Management corriendo en http://localhost:${PORT}`);
});