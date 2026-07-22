const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { query, queryOne, queryRun, supabase } = require('./database');
const { enviarCorreo, enviarCorreoSimple } = require('./emailService');

const app = express();
const PORT = process.env.PORT || 10000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

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

app.get('/api/empresas', async (req, res) => {
  try {
    const result = await query('SELECT * FROM empresas ORDER BY id');
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
      'SELECT nombre, logo_url FROM empresas WHERE slug = $1 AND activo = true',
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
const crearEmpresaConAdmin = async ({ nombre, correo, celular, file, adminNumEmpleado, adminNombre, adminPassword, activo }) => {
  const logoUrl = file ? await subirLogo(file) : null;
  const slug = await generarSlugUnico(nombre);
  const result = await queryRun(
    'INSERT INTO empresas (nombre, logo_url, slug, activo, correo, celular) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [nombre, logoUrl, slug, activo, correo || null, celular || null]
  );
  const empresaId = result.rows[0].id;
  await queryRun(
    `INSERT INTO usuarios (num_empleado, nombre, rol, password, empresa_id, fecha_registro)
     VALUES ($1, $2, 'admin', $3, $4, NOW())`,
    [adminNumEmpleado, adminNombre, adminPassword, empresaId]
  );
  return { empresaId, slug };
};

app.post('/api/empresas', upload.single('logo'), async (req, res) => {
  const { nombre, correo, celular, admin_num_empleado, admin_nombre, admin_password } = req.body;
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
      activo: true
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
  const { nombre, correo, celular, admin_num_empleado, admin_nombre, admin_password } = req.body;
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

app.patch('/api/empresas/:id/aprobar', async (req, res) => {
  try {
    await queryRun('UPDATE empresas SET activo = true WHERE id = $1', [req.params.id]);
    res.json({ message: 'Empresa aprobada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/empresas/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pacientesCount = await queryOne('SELECT COUNT(*) as total FROM pacientes WHERE empresa_id = $1', [id]);
    if (parseInt(pacientesCount.total) > 0) {
      return res.status(400).json({ error: 'No se puede eliminar una empresa con pacientes registrados' });
    }
    await queryRun('DELETE FROM usuarios WHERE empresa_id = $1', [id]);
    await queryRun('DELETE FROM empresas WHERE id = $1', [id]);
    res.json({ message: 'Empresa eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/empresas/:id', upload.single('logo'), async (req, res) => {
  const { id } = req.params;
  const { nombre } = req.body;
  try {
    if (req.file) {
      const logoUrl = await subirLogo(req.file);
      await queryRun('UPDATE empresas SET nombre = $1, logo_url = $2 WHERE id = $3', [nombre, logoUrl, id]);
    } else {
      await queryRun('UPDATE empresas SET nombre = $1 WHERE id = $2', [nombre, id]);
    }
    res.json({ message: 'Empresa actualizada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE PACIENTES ====================

app.get('/api/pacientes', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20, empresa_id } = req.query;
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const limitNum = Math.max(parseInt(limit) || 20, 1);
    const offset = (pageNum - 1) * limitNum;
    const searchTerm = `%${search}%`;

    const result = await query(
      `SELECT * FROM pacientes
       WHERE empresa_id = $1 AND (nombre ILIKE $2 OR num_empleado ILIKE $2 OR area ILIKE $2)
       ORDER BY id
       LIMIT $3 OFFSET $4`,
      [empresa_id, searchTerm, limitNum, offset]
    );
    const totalResult = await queryOne(
      `SELECT COUNT(*) as total FROM pacientes
       WHERE empresa_id = $1 AND (nombre ILIKE $2 OR num_empleado ILIKE $2 OR area ILIKE $2)`,
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

app.post('/api/pacientes', async (req, res) => {
  const { num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor, empresa_id } = req.body;
  try {
    const result = await queryRun(
      `INSERT INTO pacientes (num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor, empresa_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor, empresa_id]
    );
    res.json({ id: result.rows[0]?.id || result.insertId, message: 'Paciente agregado correctamente' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El número de empleado ya existe' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/pacientes/:id', async (req, res) => {
  const { id } = req.params;
  const { num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor, empresa_id } = req.body;
  try {
    await queryRun(
      `UPDATE pacientes
       SET num_empleado = $1, nombre = $2, fecha_nac = $3, nss = $4, contacto_emergencia = $5, puesto = $6, area = $7, supervisor = $8
       WHERE id = $9 AND empresa_id = $10`,
      [num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor, id, empresa_id]
    );
    res.json({ message: 'Paciente actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/pacientes/:id', async (req, res) => {
  const { id } = req.params;
  const { empresa_id } = req.query;
  try {
    await queryRun('DELETE FROM consultas WHERE paciente_id = $1', [id]);
    await queryRun('DELETE FROM pacientes WHERE id = $1 AND empresa_id = $2', [id, empresa_id]);
    res.json({ message: 'Paciente eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE CONSULTAS ====================

app.get('/api/consultas/:pacienteId', async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const result = await query('SELECT * FROM consultas WHERE paciente_id = $1 ORDER BY fecha DESC', [pacienteId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/consultas', async (req, res) => {
  const { 
    paciente_id, fecha, motivo, alergias, alergias_detalle, cabeza, cuello, torax, abdomen, espalda,
    extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
    impresion_diagnostica, medicamentos, receta, cie10 
  } = req.body;

  try {
    const result = await queryRun(
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

app.put('/api/consultas/:id', async (req, res) => {
  const { id } = req.params;
  const { 
    fecha, motivo, alergias, alergias_detalle, cabeza, cuello, torax, abdomen, espalda,
    extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
    impresion_diagnostica, medicamentos, receta, cie10 
  } = req.body;

  try {
    await queryRun(
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

app.delete('/api/consultas/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await queryRun('DELETE FROM consultas WHERE id = $1', [id]);
    res.json({ message: 'Consulta eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE EXÁMENES ====================

app.post('/api/emi', async (req, res) => {
  const { paciente_id, fecha, exposicion_riesgos, trabajos_previos, riesgos_laborales, 
    accidentes_previos, enfermedades_laborales, antecedentes_familiares, 
    antecedentes_personales_no_patologicos, antecedentes_personales_patologicos, 
    interrogatorio_aparatos, impresion_diagnostica, constancia_aptitud, cie10, 
    exploracion_fisica, signos_vitales, agudeza_visual } = req.body;

  try {
    const result = await queryRun(
      `INSERT INTO emi (
        paciente_id, fecha, exposicion_riesgos, trabajos_previos, riesgos_laborales,
        accidentes_previos, enfermedades_laborales, antecedentes_familiares,
        antecedentes_personales_no_patologicos, antecedentes_personales_patologicos,
        interrogatorio_aparatos, impresion_diagnostica, constancia_aptitud, cie10,
        exploracion_fisica, signos_vitales, agudeza_visual
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
      [paciente_id, fecha, exposicion_riesgos, trabajos_previos, riesgos_laborales,
        accidentes_previos, enfermedades_laborales, antecedentes_familiares,
        antecedentes_personales_no_patologicos, antecedentes_personales_patologicos,
        interrogatorio_aparatos, impresion_diagnostica, constancia_aptitud, cie10,
        exploracion_fisica, signos_vitales, agudeza_visual]
    );
    res.json({ id: result.rows[0]?.id, message: 'EMI registrado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/emi/:pacienteId', async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const result = await query('SELECT * FROM emi WHERE paciente_id = $1 ORDER BY fecha DESC', [pacienteId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/emp', async (req, res) => {
  const { paciente_id, fecha, exposicion_auditiva, exposicion_respiratoria,
    exposicion_movimientos_repetitivos, exposicion_postural, exposicion_cargas_manuales,
    exposicion_visual, exposicion_psicosocial, exposicion_trabajos_alto_riesgo,
    interrogatorio_aparatos, impresion_diagnostica, solicitud_reubicacion, cie10,
    exploracion_fisica, signos_vitales, agudeza_visual } = req.body;

  try {
    const result = await queryRun(
      `INSERT INTO emp (
        paciente_id, fecha, exposicion_auditiva, exposicion_respiratoria,
        exposicion_movimientos_repetitivos, exposicion_postural, exposicion_cargas_manuales,
        exposicion_visual, exposicion_psicosocial, exposicion_trabajos_alto_riesgo,
        interrogatorio_aparatos, impresion_diagnostica, solicitud_reubicacion, cie10,
        exploracion_fisica, signos_vitales, agudeza_visual
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
      [paciente_id, fecha, exposicion_auditiva, exposicion_respiratoria,
        exposicion_movimientos_repetitivos, exposicion_postural, exposicion_cargas_manuales,
        exposicion_visual, exposicion_psicosocial, exposicion_trabajos_alto_riesgo,
        interrogatorio_aparatos, impresion_diagnostica, solicitud_reubicacion, cie10,
        exploracion_fisica, signos_vitales, agudeza_visual]
    );
    res.json({ id: result.rows[0]?.id, message: 'EMP registrado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/emp/:pacienteId', async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const result = await query('SELECT * FROM emp WHERE paciente_id = $1 ORDER BY fecha DESC', [pacienteId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/emr', async (req, res) => {
  const { paciente_id, fecha, secuelas_auditiva, secuelas_respiratoria, secuelas_motriz,
    secuelas_pensamiento, secuelas_fuerza, secuelas_neurologica, secuelas_psicosocial,
    secuelas_visual, interrogatorio_aparatos, impresion_diagnostica,
    recomendaciones_reingreso, cie10, exploracion_fisica, signos_vitales, agudeza_visual } = req.body;

  try {
    const result = await queryRun(
      `INSERT INTO emr (
        paciente_id, fecha, secuelas_auditiva, secuelas_respiratoria, secuelas_motriz,
        secuelas_pensamiento, secuelas_fuerza, secuelas_neurologica, secuelas_psicosocial,
        secuelas_visual, interrogatorio_aparatos, impresion_diagnostica,
        recomendaciones_reingreso, cie10, exploracion_fisica, signos_vitales, agudeza_visual
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
      [paciente_id, fecha, secuelas_auditiva, secuelas_respiratoria, secuelas_motriz,
        secuelas_pensamiento, secuelas_fuerza, secuelas_neurologica, secuelas_psicosocial,
        secuelas_visual, interrogatorio_aparatos, impresion_diagnostica,
        recomendaciones_reingreso, cie10, exploracion_fisica, signos_vitales, agudeza_visual]
    );
    res.json({ id: result.rows[0]?.id, message: 'EMR registrado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/emr/:pacienteId', async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const result = await query('SELECT * FROM emr WHERE paciente_id = $1 ORDER BY fecha DESC', [pacienteId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vulnerabilidad', async (req, res) => {
  const { paciente_id, fecha, tipo_vulnerabilidad, embarazo, cronico_degenerativa,
    hepato_renal, cardiologica, dermatologica, hematologica, impresion_diagnostica,
    cie10, exploracion_fisica, signos_vitales, agudeza_visual } = req.body;

  try {
    const result = await queryRun(
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

app.get('/api/vulnerabilidad/:pacienteId', async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const result = await query('SELECT * FROM vulnerabilidad WHERE paciente_id = $1 ORDER BY fecha DESC', [pacienteId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE AUTENTICACIÓN ====================

app.post('/api/login', async (req, res) => {
  const { num_empleado, password } = req.body;

  if (!num_empleado || !password) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  try {
    const result = await queryOne(
      `SELECT u.*, e.nombre as empresa_nombre, e.logo_url as empresa_logo_url, e.slug as empresa_slug, e.activo as empresa_activa
       FROM usuarios u
       JOIN empresas e ON u.empresa_id = e.id
       WHERE u.num_empleado = $1 AND u.password = $2`,
      [num_empleado, password]
    );
    if (!result) {
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
    res.json({
      success: true,
      user: userWithoutPassword,
      message: `Bienvenido ${result.nombre}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE USUARIOS ====================

app.get('/api/usuarios', async (req, res) => {
  try {
    const { empresa_id } = req.query;
    const result = await query(
      'SELECT id, num_empleado, nombre, rol, fecha_registro FROM usuarios WHERE empresa_id = $1',
      [empresa_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/asistencias', async (req, res) => {
  try {
    const { empresa_id } = req.query;
    const result = await query(
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

app.post('/api/usuarios', async (req, res) => {
  const { num_empleado, nombre, rol, password, empresa_id } = req.body;

  if (!num_empleado || !nombre || !rol || !password) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }

  try {
    const result = await queryRun(
      `INSERT INTO usuarios (num_empleado, nombre, rol, password, empresa_id, fecha_registro)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
      [num_empleado, nombre, rol, password, empresa_id]
    );
    res.json({ id: result.rows[0]?.id, message: 'Usuario creado correctamente' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El número de empleado ya existe' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  const { empresa_id } = req.query;

  try {
    const user = await queryOne('SELECT num_empleado FROM usuarios WHERE id = $1', [id]);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (user.num_empleado === 'ADMIN001') {
      return res.status(403).json({ error: 'No se puede eliminar al administrador principal' });
    }
    await queryRun('DELETE FROM usuarios WHERE id = $1 AND empresa_id = $2', [id, empresa_id]);
    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/usuarios/:id/resetear-password', async (req, res) => {
  const { id } = req.params;
  const { nueva_password, empresa_id } = req.body;

  if (!nueva_password) {
    return res.status(400).json({ error: 'La nueva contraseña es requerida' });
  }

  try {
    await queryRun('UPDATE usuarios SET password = $1 WHERE id = $2 AND empresa_id = $3', [nueva_password, id, empresa_id]);
    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Herramienta de soporte del superadmin: resetea la contraseña de
// cualquier usuario de cualquier empresa (por num_empleado, sin filtrar
// por empresa_id). Cubre el caso de que el único admin de una empresa
// olvide su contraseña y no haya nadie más ahí que pueda ayudarlo.
app.patch('/api/usuarios/resetear-password-admin', async (req, res) => {
  const { num_empleado, nueva_password } = req.body;

  if (!num_empleado || !nueva_password) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }

  try {
    const result = await queryRun('UPDATE usuarios SET password = $1 WHERE num_empleado = $2 RETURNING id', [nueva_password, num_empleado]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'No existe un usuario con ese número de empleado' });
    }
    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE ESTADÍSTICAS ====================

app.get('/api/estadisticas', async (req, res) => {
  try {
    const { empresa_id } = req.query;
    const totalPacientes = await queryOne('SELECT COUNT(*) as total FROM pacientes WHERE empresa_id = $1', [empresa_id]);
    const totalConsultas = await queryOne(
      'SELECT COUNT(*) as total FROM consultas c JOIN pacientes p ON c.paciente_id = p.id WHERE p.empresa_id = $1',
      [empresa_id]
    );
    const totalEMI = await queryOne(
      'SELECT COUNT(*) as total FROM emi e JOIN pacientes p ON e.paciente_id = p.id WHERE p.empresa_id = $1',
      [empresa_id]
    );
    const totalEMP = await queryOne(
      'SELECT COUNT(*) as total FROM emp e JOIN pacientes p ON e.paciente_id = p.id WHERE p.empresa_id = $1',
      [empresa_id]
    );
    const totalEMR = await queryOne(
      'SELECT COUNT(*) as total FROM emr e JOIN pacientes p ON e.paciente_id = p.id WHERE p.empresa_id = $1',
      [empresa_id]
    );
    const totalVulnerabilidad = await queryOne(
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

app.get('/api/top-motivos', async (req, res) => {
  try {
    const { empresa_id } = req.query;
    const result = await query(`
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

app.get('/api/top-areas', async (req, res) => {
  try {
    const { empresa_id } = req.query;
    const result = await query(`
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

app.get('/api/consultas-por-mes', async (req, res) => {
  try {
    const { empresa_id } = req.query;
    const result = await query(`
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

app.get('/api/pacientes-por-area', async (req, res) => {
  try {
    const { empresa_id } = req.query;
    const result = await query(`
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

app.post('/api/enviar-constancia', async (req, res) => {
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

app.post('/api/enviar-receta', async (req, res) => {
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

app.post('/api/enviar-incapacidad', async (req, res) => {
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

// ==================== INICIAR SERVIDOR ====================

app.listen(PORT, () => {
  console.log(`🚀 Servidor WH Management corriendo en http://localhost:${PORT}`);
});