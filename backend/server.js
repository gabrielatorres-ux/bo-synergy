const express = require('express');
const cors = require('cors');
const { query, queryOne, queryRun, supabase } = require('./database');
const { enviarCorreo, enviarCorreoSimple } = require('./emailService');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// ==================== RUTAS DE PACIENTES ====================

app.get('/api/pacientes', async (req, res) => {
  try {
    const result = await query('SELECT * FROM pacientes ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/pacientes', async (req, res) => {
  const { num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor } = req.body;
  try {
    const result = await queryRun(
      `INSERT INTO pacientes (num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor]
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
  const { num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor } = req.body;
  try {
    await queryRun(
      `UPDATE pacientes 
       SET num_empleado = $1, nombre = $2, fecha_nac = $3, nss = $4, contacto_emergencia = $5, puesto = $6, area = $7, supervisor = $8
       WHERE id = $9`,
      [num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor, id]
    );
    res.json({ message: 'Paciente actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/pacientes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await queryRun('DELETE FROM consultas WHERE paciente_id = $1', [id]);
    await queryRun('DELETE FROM pacientes WHERE id = $1', [id]);
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
    paciente_id, fecha, motivo, alergias, cabeza, cuello, torax, abdomen, espalda,
    extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
    impresion_diagnostica, medicamentos, receta, cie10 
  } = req.body;

  try {
    const result = await queryRun(
      `INSERT INTO consultas (
        paciente_id, fecha, motivo, alergias, cabeza, cuello, torax, abdomen, espalda,
        extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
        impresion_diagnostica, medicamentos, receta, cie10
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
      [paciente_id, fecha, motivo, alergias, cabeza, cuello, torax, abdomen, espalda,
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
    fecha, motivo, alergias, cabeza, cuello, torax, abdomen, espalda,
    extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
    impresion_diagnostica, medicamentos, receta, cie10 
  } = req.body;

  try {
    await queryRun(
      `UPDATE consultas 
       SET fecha = $1, motivo = $2, alergias = $3, cabeza = $4, cuello = $5, torax = $6, abdomen = $7, 
           espalda = $8, extremidades_superiores = $9, extremidades_inferiores = $10, 
           ojos_oidos_garganta = $11, causa = $12, impresion_diagnostica = $13, 
           medicamentos = $14, receta = $15, cie10 = $16
       WHERE id = $17`,
      [fecha, motivo, alergias, cabeza, cuello, torax, abdomen, espalda,
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
    const result = await queryOne('SELECT * FROM usuarios WHERE num_empleado = $1 AND password = $2', [num_empleado, password]);
    if (!result) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    const { password: _, ...userWithoutPassword } = result;
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
    const result = await query('SELECT id, num_empleado, nombre, rol, fecha_registro FROM usuarios');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/usuarios', async (req, res) => {
  const { num_empleado, nombre, rol, password } = req.body;
  
  if (!num_empleado || !nombre || !rol || !password) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }

  try {
    const result = await queryRun(
      `INSERT INTO usuarios (num_empleado, nombre, rol, password, fecha_registro)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
      [num_empleado, nombre, rol, password]
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
  
  try {
    const user = await queryOne('SELECT num_empleado FROM usuarios WHERE id = $1', [id]);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (user.num_empleado === 'ADMIN001') {
      return res.status(403).json({ error: 'No se puede eliminar al administrador principal' });
    }
    await queryRun('DELETE FROM usuarios WHERE id = $1', [id]);
    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE ESTADÍSTICAS ====================

app.get('/api/estadisticas', async (req, res) => {
  try {
    const totalPacientes = await queryOne('SELECT COUNT(*) as total FROM pacientes');
    const totalConsultas = await queryOne('SELECT COUNT(*) as total FROM consultas');
    const totalEMI = await queryOne('SELECT COUNT(*) as total FROM emi');
    const totalEMP = await queryOne('SELECT COUNT(*) as total FROM emp');
    const totalEMR = await queryOne('SELECT COUNT(*) as total FROM emr');
    const totalVulnerabilidad = await queryOne('SELECT COUNT(*) as total FROM vulnerabilidad');

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
    const result = await query(`
      SELECT motivo, COUNT(*) as count 
      FROM consultas 
      WHERE motivo IS NOT NULL AND motivo != ''
      GROUP BY motivo 
      ORDER BY count DESC 
      LIMIT 5
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/top-areas', async (req, res) => {
  try {
    const result = await query(`
      SELECT p.area, COUNT(c.id) as count 
      FROM consultas c
      JOIN pacientes p ON c.paciente_id = p.id
      WHERE p.area IS NOT NULL AND p.area != ''
      GROUP BY p.area 
      ORDER BY count DESC 
      LIMIT 5
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/consultas-por-mes', async (req, res) => {
  try {
    const result = await query(`
      SELECT TO_CHAR(fecha, 'YYYY-MM') as mes, COUNT(*) as count
      FROM consultas
      GROUP BY mes
      ORDER BY mes DESC
      LIMIT 12
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/pacientes-por-area', async (req, res) => {
  try {
    const result = await query(`
      SELECT area, COUNT(*) as count 
      FROM pacientes 
      WHERE area IS NOT NULL AND area != ''
      GROUP BY area 
      ORDER BY count DESC
    `);
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== INICIAR SERVIDOR ====================

app.listen(PORT, () => {
  console.log(`🚀 Servidor BO Synergy corriendo en http://localhost:${PORT}`);
});