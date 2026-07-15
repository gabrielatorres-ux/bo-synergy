const express = require('express');
const cors = require('cors');
const { dbAll, dbGet, dbRun } = require('./database');
const { enviarCorreo } = require('./emailService');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// ==================== RUTAS DE PACIENTES ====================

app.get('/api/pacientes', (req, res) => {
  try {
    const rows = dbAll('SELECT * FROM pacientes');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/pacientes', (req, res) => {
  const { num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor } = req.body;
  try {
    const result = dbRun(
      `INSERT INTO pacientes (num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor]
    );
    res.json({ id: result.lastID, message: 'Paciente agregado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/pacientes/:id', (req, res) => {
  const { id } = req.params;
  const { num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor } = req.body;
  try {
    const result = dbRun(
      `UPDATE pacientes 
       SET num_empleado = ?, nombre = ?, fecha_nac = ?, nss = ?, contacto_emergencia = ?, puesto = ?, area = ?, supervisor = ?
       WHERE id = ?`,
      [num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor, id]
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }
    res.json({ message: 'Paciente actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/pacientes/:id', (req, res) => {
  const { id } = req.params;
  try {
    dbRun('DELETE FROM consultas WHERE paciente_id = ?', [id]);
    dbRun('DELETE FROM pacientes WHERE id = ?', [id]);
    res.json({ message: 'Paciente eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE CONSULTAS ====================

app.get('/api/consultas/:pacienteId', (req, res) => {
  const { pacienteId } = req.params;
  try {
    const rows = dbAll('SELECT * FROM consultas WHERE paciente_id = ? ORDER BY fecha DESC', [pacienteId]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/consultas', (req, res) => {
  const { 
    paciente_id, fecha, motivo, alergias, cabeza, cuello, torax, abdomen, espalda,
    extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
    impresion_diagnostica, medicamentos, receta, cie10 
  } = req.body;

  try {
    const result = dbRun(
      `INSERT INTO consultas (
        paciente_id, fecha, motivo, alergias, cabeza, cuello, torax, abdomen, espalda,
        extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
        impresion_diagnostica, medicamentos, receta, cie10
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [paciente_id, fecha, motivo, alergias, cabeza, cuello, torax, abdomen, espalda,
        extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
        impresion_diagnostica, medicamentos, receta, cie10]
    );
    res.json({ id: result.lastID, message: 'Consulta registrada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/consultas/:id', (req, res) => {
  const { id } = req.params;
  const { 
    fecha, motivo, alergias, cabeza, cuello, torax, abdomen, espalda,
    extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
    impresion_diagnostica, medicamentos, receta, cie10 
  } = req.body;

  try {
    const result = dbRun(
      `UPDATE consultas 
       SET fecha = ?, motivo = ?, alergias = ?, cabeza = ?, cuello = ?, torax = ?, abdomen = ?, 
           espalda = ?, extremidades_superiores = ?, extremidades_inferiores = ?, 
           ojos_oidos_garganta = ?, causa = ?, impresion_diagnostica = ?, 
           medicamentos = ?, receta = ?, cie10 = ?
       WHERE id = ?`,
      [fecha, motivo, alergias, cabeza, cuello, torax, abdomen, espalda,
        extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
        impresion_diagnostica, medicamentos, receta, cie10, id]
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Consulta no encontrada' });
    }
    res.json({ message: 'Consulta actualizada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/consultas/:id', (req, res) => {
  const { id } = req.params;
  try {
    dbRun('DELETE FROM consultas WHERE id = ?', [id]);
    res.json({ message: 'Consulta eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE EXÁMENES ====================

app.post('/api/emi', (req, res) => {
  const { paciente_id, fecha, exposicion_riesgos, trabajos_previos, riesgos_laborales, 
    accidentes_previos, enfermedades_laborales, antecedentes_familiares, 
    antecedentes_personales_no_patologicos, antecedentes_personales_patologicos, 
    interrogatorio_aparatos, impresion_diagnostica, constancia_aptitud, cie10, 
    exploracion_fisica, signos_vitales, agudeza_visual } = req.body;

  try {
    const result = dbRun(
      `INSERT INTO emi (
        paciente_id, fecha, exposicion_riesgos, trabajos_previos, riesgos_laborales,
        accidentes_previos, enfermedades_laborales, antecedentes_familiares,
        antecedentes_personales_no_patologicos, antecedentes_personales_patologicos,
        interrogatorio_aparatos, impresion_diagnostica, constancia_aptitud, cie10,
        exploracion_fisica, signos_vitales, agudeza_visual
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [paciente_id, fecha, exposicion_riesgos, trabajos_previos, riesgos_laborales,
        accidentes_previos, enfermedades_laborales, antecedentes_familiares,
        antecedentes_personales_no_patologicos, antecedentes_personales_patologicos,
        interrogatorio_aparatos, impresion_diagnostica, constancia_aptitud, cie10,
        exploracion_fisica, signos_vitales, agudeza_visual]
    );
    res.json({ id: result.lastID, message: 'EMI registrado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/emi/:pacienteId', (req, res) => {
  const { pacienteId } = req.params;
  try {
    const rows = dbAll('SELECT * FROM emi WHERE paciente_id = ? ORDER BY fecha DESC', [pacienteId]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/emp', (req, res) => {
  const { paciente_id, fecha, exposicion_auditiva, exposicion_respiratoria,
    exposicion_movimientos_repetitivos, exposicion_postural, exposicion_cargas_manuales,
    exposicion_visual, exposicion_psicosocial, exposicion_trabajos_alto_riesgo,
    interrogatorio_aparatos, impresion_diagnostica, solicitud_reubicacion, cie10,
    exploracion_fisica, signos_vitales, agudeza_visual } = req.body;

  try {
    const result = dbRun(
      `INSERT INTO emp (
        paciente_id, fecha, exposicion_auditiva, exposicion_respiratoria,
        exposicion_movimientos_repetitivos, exposicion_postural, exposicion_cargas_manuales,
        exposicion_visual, exposicion_psicosocial, exposicion_trabajos_alto_riesgo,
        interrogatorio_aparatos, impresion_diagnostica, solicitud_reubicacion, cie10,
        exploracion_fisica, signos_vitales, agudeza_visual
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [paciente_id, fecha, exposicion_auditiva, exposicion_respiratoria,
        exposicion_movimientos_repetitivos, exposicion_postural, exposicion_cargas_manuales,
        exposicion_visual, exposicion_psicosocial, exposicion_trabajos_alto_riesgo,
        interrogatorio_aparatos, impresion_diagnostica, solicitud_reubicacion, cie10,
        exploracion_fisica, signos_vitales, agudeza_visual]
    );
    res.json({ id: result.lastID, message: 'EMP registrado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/emp/:pacienteId', (req, res) => {
  const { pacienteId } = req.params;
  try {
    const rows = dbAll('SELECT * FROM emp WHERE paciente_id = ? ORDER BY fecha DESC', [pacienteId]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/emr', (req, res) => {
  const { paciente_id, fecha, secuelas_auditiva, secuelas_respiratoria, secuelas_motriz,
    secuelas_pensamiento, secuelas_fuerza, secuelas_neurologica, secuelas_psicosocial,
    secuelas_visual, interrogatorio_aparatos, impresion_diagnostica,
    recomendaciones_reingreso, cie10, exploracion_fisica, signos_vitales, agudeza_visual } = req.body;

  try {
    const result = dbRun(
      `INSERT INTO emr (
        paciente_id, fecha, secuelas_auditiva, secuelas_respiratoria, secuelas_motriz,
        secuelas_pensamiento, secuelas_fuerza, secuelas_neurologica, secuelas_psicosocial,
        secuelas_visual, interrogatorio_aparatos, impresion_diagnostica,
        recomendaciones_reingreso, cie10, exploracion_fisica, signos_vitales, agudeza_visual
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [paciente_id, fecha, secuelas_auditiva, secuelas_respiratoria, secuelas_motriz,
        secuelas_pensamiento, secuelas_fuerza, secuelas_neurologica, secuelas_psicosocial,
        secuelas_visual, interrogatorio_aparatos, impresion_diagnostica,
        recomendaciones_reingreso, cie10, exploracion_fisica, signos_vitales, agudeza_visual]
    );
    res.json({ id: result.lastID, message: 'EMR registrado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/emr/:pacienteId', (req, res) => {
  const { pacienteId } = req.params;
  try {
    const rows = dbAll('SELECT * FROM emr WHERE paciente_id = ? ORDER BY fecha DESC', [pacienteId]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vulnerabilidad', (req, res) => {
  const { paciente_id, fecha, tipo_vulnerabilidad, embarazo, cronico_degenerativa,
    hepato_renal, cardiologica, dermatologica, hematologica, impresion_diagnostica,
    cie10, exploracion_fisica, signos_vitales, agudeza_visual } = req.body;

  try {
    const result = dbRun(
      `INSERT INTO vulnerabilidad (
        paciente_id, fecha, tipo_vulnerabilidad, embarazo, cronico_degenerativa,
        hepato_renal, cardiologica, dermatologica, hematologica, impresion_diagnostica,
        cie10, exploracion_fisica, signos_vitales, agudeza_visual
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [paciente_id, fecha, tipo_vulnerabilidad, embarazo, cronico_degenerativa,
        hepato_renal, cardiologica, dermatologica, hematologica, impresion_diagnostica,
        cie10, exploracion_fisica, signos_vitales, agudeza_visual]
    );
    res.json({ id: result.lastID, message: 'Valoración de vulnerabilidad registrada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/vulnerabilidad/:pacienteId', (req, res) => {
  const { pacienteId } = req.params;
  try {
    const rows = dbAll('SELECT * FROM vulnerabilidad WHERE paciente_id = ? ORDER BY fecha DESC', [pacienteId]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE AUTENTICACIÓN ====================

app.post('/api/login', (req, res) => {
  const { num_empleado, password } = req.body;

  if (!num_empleado || !password) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  try {
    const user = dbGet('SELECT * FROM usuarios WHERE num_empleado = ? AND password = ?', [num_empleado, password]);
    if (!user) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    const { password: _, ...userWithoutPassword } = user;
    res.json({ 
      success: true, 
      user: userWithoutPassword,
      message: `Bienvenido ${user.nombre}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE USUARIOS ====================

app.get('/api/usuarios', (req, res) => {
  try {
    const rows = dbAll('SELECT id, num_empleado, nombre, rol, fecha_registro FROM usuarios');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/usuarios', (req, res) => {
  const { num_empleado, nombre, rol, password } = req.body;
  
  if (!num_empleado || !nombre || !rol || !password) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }

  try {
    const result = dbRun(
      `INSERT INTO usuarios (num_empleado, nombre, rol, password, fecha_registro)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [num_empleado, nombre, rol, password]
    );
    res.json({ id: result.lastID, message: 'Usuario creado correctamente' });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'El número de empleado ya existe' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/usuarios/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    const user = dbGet('SELECT num_empleado FROM usuarios WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (user.num_empleado === 'ADMIN001') {
      return res.status(403).json({ error: 'No se puede eliminar al administrador principal' });
    }
    dbRun('DELETE FROM usuarios WHERE id = ?', [id]);
    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE ESTADÍSTICAS ====================

app.get('/api/estadisticas', (req, res) => {
  try {
    const totalPacientes = dbGet('SELECT COUNT(*) as total FROM pacientes');
    const totalConsultas = dbGet('SELECT COUNT(*) as total FROM consultas');
    const totalEMI = dbGet('SELECT COUNT(*) as total FROM emi');
    const totalEMP = dbGet('SELECT COUNT(*) as total FROM emp');
    const totalEMR = dbGet('SELECT COUNT(*) as total FROM emr');
    const totalVulnerabilidad = dbGet('SELECT COUNT(*) as total FROM vulnerabilidad');

    res.json({
      totalPacientes: totalPacientes.total || 0,
      totalConsultas: totalConsultas.total || 0,
      totalEMI: totalEMI.total || 0,
      totalEMP: totalEMP.total || 0,
      totalEMR: totalEMR.total || 0,
      totalVulnerabilidad: totalVulnerabilidad.total || 0,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/top-motivos', (req, res) => {
  try {
    const rows = dbAll(`
      SELECT motivo, COUNT(*) as count 
      FROM consultas 
      WHERE motivo IS NOT NULL AND motivo != ''
      GROUP BY motivo 
      ORDER BY count DESC 
      LIMIT 5
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/top-areas', (req, res) => {
  try {
    const rows = dbAll(`
      SELECT p.area, COUNT(c.id) as count 
      FROM consultas c
      JOIN pacientes p ON c.paciente_id = p.id
      WHERE p.area IS NOT NULL AND p.area != ''
      GROUP BY p.area 
      ORDER BY count DESC 
      LIMIT 5
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/consultas-por-mes', (req, res) => {
  try {
    const rows = dbAll(`
      SELECT strftime('%Y-%m', fecha) as mes, COUNT(*) as count
      FROM consultas
      GROUP BY mes
      ORDER BY mes DESC
      LIMIT 12
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/pacientes-por-area', (req, res) => {
  try {
    const rows = dbAll(`
      SELECT area, COUNT(*) as count 
      FROM pacientes 
      WHERE area IS NOT NULL AND area != ''
      GROUP BY area 
      ORDER BY count DESC
    `);
    res.json(rows);
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

  const pdfBuffer = Buffer.from(pdfBase64, 'base64');
  const nombrePDF = `Constancia_${paciente.nombre}_${consulta.fecha}.pdf`;

  const asunto = `📄 Constancia de Consulta - BO Synergy`;
  const mensaje = `
    Estimado(a) ${paciente.nombre},

    Adjunto encontrarás la constancia de tu consulta médica realizada en BO Synergy.

    Detalles de la consulta:
    - Fecha: ${new Date(consulta.fecha).toLocaleDateString('es-MX')}
    - Motivo: ${consulta.motivo || 'No especificado'}
    - Diagnóstico: ${consulta.impresion_diagnostica || 'Pendiente'}

    Saludos cordiales,
    BO Synergy - Salud Ocupacional
  `;

  const resultado = await enviarCorreo(destinatario, asunto, mensaje, pdfBuffer, nombrePDF);
  
  if (resultado.success) {
    res.json({ success: true, message: 'Constancia enviada por correo' });
  } else {
    res.status(500).json({ error: resultado.error });
  }
});

app.post('/api/enviar-receta', async (req, res) => {
  const { destinatario, paciente, consulta, pdfBase64 } = req.body;
  
  if (!destinatario || !paciente || !consulta || !pdfBase64) {
    return res.status(400).json({ error: 'Faltan datos para enviar el correo' });
  }

  const pdfBuffer = Buffer.from(pdfBase64, 'base64');
  const nombrePDF = `Receta_${paciente.nombre}_${consulta.fecha}.pdf`;

  const asunto = `💊 Receta Médica - BO Synergy`;
  const mensaje = `
    Estimado(a) ${paciente.nombre},

    Adjunto encontrarás tu receta médica emitida por BO Synergy.

    Detalles de la receta:
    - Fecha: ${new Date(consulta.fecha).toLocaleDateString('es-MX')}
    - Diagnóstico: ${consulta.impresion_diagnostica || 'Pendiente'}
    - Medicamentos: ${consulta.medicamentos || 'No especificados'}

    Saludos cordiales,
    BO Synergy - Salud Ocupacional
  `;

  const resultado = await enviarCorreo(destinatario, asunto, mensaje, pdfBuffer, nombrePDF);
  
  if (resultado.success) {
    res.json({ success: true, message: 'Receta enviada por correo' });
  } else {
    res.status(500).json({ error: resultado.error });
  }
});

app.post('/api/enviar-incapacidad', async (req, res) => {
  const { destinatario, paciente, consulta, pdfBase64 } = req.body;
  
  if (!destinatario || !paciente || !consulta || !pdfBase64) {
    return res.status(400).json({ error: 'Faltan datos para enviar el correo' });
  }

  const pdfBuffer = Buffer.from(pdfBase64, 'base64');
  const nombrePDF = `Incapacidad_${paciente.nombre}_${consulta.fecha}.pdf`;

  const asunto = `🏥 Reporte de Incapacidad - BO Synergy`;
  const mensaje = `
    Estimado(a) ${paciente.nombre},

    Adjunto encontrarás el reporte de incapacidad emitido por BO Synergy.

    Detalles de la incapacidad:
    - Fecha de emisión: ${new Date(consulta.fecha).toLocaleDateString('es-MX')}
    - Motivo: ${consulta.motivo || 'No especificado'}
    - Diagnóstico: ${consulta.impresion_diagnostica || 'Pendiente'}

    Saludos cordiales,
    BO Synergy - Salud Ocupacional
  `;

  const resultado = await enviarCorreo(destinatario, asunto, mensaje, pdfBuffer, nombrePDF);
  
  if (resultado.success) {
    res.json({ success: true, message: 'Reporte de incapacidad enviado por correo' });
  } else {
    res.status(500).json({ error: resultado.error });
  }
});

// ==================== RUTAS DE ESTADÍSTICAS ====================

app.get('/api/estadisticas', (req, res) => {
  try {
    const totalPacientes = dbGet('SELECT COUNT(*) as total FROM pacientes');
    const totalConsultas = dbGet('SELECT COUNT(*) as total FROM consultas');
    const totalEMI = dbGet('SELECT COUNT(*) as total FROM emi');
    const totalEMP = dbGet('SELECT COUNT(*) as total FROM emp');
    const totalEMR = dbGet('SELECT COUNT(*) as total FROM emr');
    const totalVulnerabilidad = dbGet('SELECT COUNT(*) as total FROM vulnerabilidad');

    res.json({
      totalPacientes: totalPacientes.total || 0,
      totalConsultas: totalConsultas.total || 0,
      totalEMI: totalEMI.total || 0,
      totalEMP: totalEMP.total || 0,
      totalEMR: totalEMR.total || 0,
      totalVulnerabilidad: totalVulnerabilidad.total || 0,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/top-motivos', (req, res) => {
  try {
    const rows = dbAll(`
      SELECT motivo, COUNT(*) as count 
      FROM consultas 
      WHERE motivo IS NOT NULL AND motivo != ''
      GROUP BY motivo 
      ORDER BY count DESC 
      LIMIT 5
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/top-areas', (req, res) => {
  try {
    const rows = dbAll(`
      SELECT p.area, COUNT(c.id) as count 
      FROM consultas c
      JOIN pacientes p ON c.paciente_id = p.id
      WHERE p.area IS NOT NULL AND p.area != ''
      GROUP BY p.area 
      ORDER BY count DESC 
      LIMIT 5
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/consultas-por-mes', (req, res) => {
  try {
    const rows = dbAll(`
      SELECT strftime('%Y-%m', fecha) as mes, COUNT(*) as count
      FROM consultas
      GROUP BY mes
      ORDER BY mes DESC
      LIMIT 12
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/pacientes-por-area', (req, res) => {
  try {
    const rows = dbAll(`
      SELECT area, COUNT(*) as count 
      FROM pacientes 
      WHERE area IS NOT NULL AND area != ''
      GROUP BY area 
      ORDER BY count DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== INICIAR SERVIDOR ====================

app.listen(PORT, () => {
  console.log(`🚀 Servidor BO Synergy corriendo en http://localhost:${PORT}`);
});