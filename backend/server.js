const express = require('express');
const cors = require('cors');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// ==================== RUTAS DE PACIENTES ====================

app.get('/api/pacientes', (req, res) => {
  db.all('SELECT * FROM pacientes', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/pacientes', (req, res) => {
  const { num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor } = req.body;
  const sql = `
    INSERT INTO pacientes (num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  db.run(sql, [num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID, message: 'Paciente agregado correctamente' });
  });
});

app.put('/api/pacientes/:id', (req, res) => {
  const { id } = req.params;
  const { num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor } = req.body;
  const sql = `
    UPDATE pacientes 
    SET num_empleado = ?, nombre = ?, fecha_nac = ?, nss = ?, contacto_emergencia = ?, puesto = ?, area = ?, supervisor = ?
    WHERE id = ?
  `;
  db.run(sql, [num_empleado, nombre, fecha_nac, nss, contacto_emergencia, puesto, area, supervisor, id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'Paciente no encontrado' });
      return;
    }
    res.json({ message: 'Paciente actualizado correctamente' });
  });
});

app.delete('/api/pacientes/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM consultas WHERE paciente_id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    db.run('DELETE FROM pacientes WHERE id = ?', [id], function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Paciente no encontrado' });
        return;
      }
      res.json({ message: 'Paciente eliminado correctamente' });
    });
  });
});

// ==================== RUTAS DE CONSULTAS ====================

app.get('/api/consultas/:pacienteId', (req, res) => {
  const { pacienteId } = req.params;
  db.all('SELECT * FROM consultas WHERE paciente_id = ? ORDER BY fecha DESC', [pacienteId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/consultas', (req, res) => {
  const { 
    paciente_id, fecha, motivo, alergias, cabeza, cuello, torax, abdomen, espalda,
    extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
    impresion_diagnostica, medicamentos, receta, cie10 
  } = req.body;

  const sql = `
    INSERT INTO consultas (
      paciente_id, fecha, motivo, alergias, cabeza, cuello, torax, abdomen, espalda,
      extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
      impresion_diagnostica, medicamentos, receta, cie10
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [
    paciente_id, fecha, motivo, alergias, cabeza, cuello, torax, abdomen, espalda,
    extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
    impresion_diagnostica, medicamentos, receta, cie10
  ], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID, message: 'Consulta registrada correctamente' });
  });
});

app.put('/api/consultas/:id', (req, res) => {
  const { id } = req.params;
  const { 
    fecha, motivo, alergias, cabeza, cuello, torax, abdomen, espalda,
    extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
    impresion_diagnostica, medicamentos, receta, cie10 
  } = req.body;

  const sql = `
    UPDATE consultas 
    SET fecha = ?, motivo = ?, alergias = ?, cabeza = ?, cuello = ?, torax = ?, abdomen = ?, 
        espalda = ?, extremidades_superiores = ?, extremidades_inferiores = ?, 
        ojos_oidos_garganta = ?, causa = ?, impresion_diagnostica = ?, 
        medicamentos = ?, receta = ?, cie10 = ?
    WHERE id = ?
  `;

  db.run(sql, [
    fecha, motivo, alergias, cabeza, cuello, torax, abdomen, espalda,
    extremidades_superiores, extremidades_inferiores, ojos_oidos_garganta, causa,
    impresion_diagnostica, medicamentos, receta, cie10, id
  ], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'Consulta no encontrada' });
      return;
    }
    res.json({ message: 'Consulta actualizada correctamente' });
  });
});

app.delete('/api/consultas/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM consultas WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'Consulta no encontrada' });
      return;
    }
    res.json({ message: 'Consulta eliminada correctamente' });
  });
});

// ==================== RUTAS DE EXÁMENES ====================

app.post('/api/emi', (req, res) => {
  const { paciente_id, fecha, exposicion_riesgos, trabajos_previos, riesgos_laborales, 
    accidentes_previos, enfermedades_laborales, antecedentes_familiares, 
    antecedentes_personales_no_patologicos, antecedentes_personales_patologicos, 
    interrogatorio_aparatos, impresion_diagnostica, constancia_aptitud, cie10, 
    exploracion_fisica, signos_vitales, agudeza_visual } = req.body;

  const sql = `
    INSERT INTO emi (
      paciente_id, fecha, exposicion_riesgos, trabajos_previos, riesgos_laborales,
      accidentes_previos, enfermedades_laborales, antecedentes_familiares,
      antecedentes_personales_no_patologicos, antecedentes_personales_patologicos,
      interrogatorio_aparatos, impresion_diagnostica, constancia_aptitud, cie10,
      exploracion_fisica, signos_vitales, agudeza_visual
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [
    paciente_id, fecha, exposicion_riesgos, trabajos_previos, riesgos_laborales,
    accidentes_previos, enfermedades_laborales, antecedentes_familiares,
    antecedentes_personales_no_patologicos, antecedentes_personales_patologicos,
    interrogatorio_aparatos, impresion_diagnostica, constancia_aptitud, cie10,
    exploracion_fisica, signos_vitales, agudeza_visual
  ], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID, message: 'EMI registrado correctamente' });
  });
});

app.get('/api/emi/:pacienteId', (req, res) => {
  const { pacienteId } = req.params;
  db.all('SELECT * FROM emi WHERE paciente_id = ? ORDER BY fecha DESC', [pacienteId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/emp', (req, res) => {
  const { paciente_id, fecha, exposicion_auditiva, exposicion_respiratoria,
    exposicion_movimientos_repetitivos, exposicion_postural, exposicion_cargas_manuales,
    exposicion_visual, exposicion_psicosocial, exposicion_trabajos_alto_riesgo,
    interrogatorio_aparatos, impresion_diagnostica, solicitud_reubicacion, cie10,
    exploracion_fisica, signos_vitales, agudeza_visual } = req.body;

  const sql = `
    INSERT INTO emp (
      paciente_id, fecha, exposicion_auditiva, exposicion_respiratoria,
      exposicion_movimientos_repetitivos, exposicion_postural, exposicion_cargas_manuales,
      exposicion_visual, exposicion_psicosocial, exposicion_trabajos_alto_riesgo,
      interrogatorio_aparatos, impresion_diagnostica, solicitud_reubicacion, cie10,
      exploracion_fisica, signos_vitales, agudeza_visual
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [
    paciente_id, fecha, exposicion_auditiva, exposicion_respiratoria,
    exposicion_movimientos_repetitivos, exposicion_postural, exposicion_cargas_manuales,
    exposicion_visual, exposicion_psicosocial, exposicion_trabajos_alto_riesgo,
    interrogatorio_aparatos, impresion_diagnostica, solicitud_reubicacion, cie10,
    exploracion_fisica, signos_vitales, agudeza_visual
  ], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID, message: 'EMP registrado correctamente' });
  });
});

app.get('/api/emp/:pacienteId', (req, res) => {
  const { pacienteId } = req.params;
  db.all('SELECT * FROM emp WHERE paciente_id = ? ORDER BY fecha DESC', [pacienteId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/emr', (req, res) => {
  const { paciente_id, fecha, secuelas_auditiva, secuelas_respiratoria, secuelas_motriz,
    secuelas_pensamiento, secuelas_fuerza, secuelas_neurologica, secuelas_psicosocial,
    secuelas_visual, interrogatorio_aparatos, impresion_diagnostica,
    recomendaciones_reingreso, cie10, exploracion_fisica, signos_vitales, agudeza_visual } = req.body;

  const sql = `
    INSERT INTO emr (
      paciente_id, fecha, secuelas_auditiva, secuelas_respiratoria, secuelas_motriz,
      secuelas_pensamiento, secuelas_fuerza, secuelas_neurologica, secuelas_psicosocial,
      secuelas_visual, interrogatorio_aparatos, impresion_diagnostica,
      recomendaciones_reingreso, cie10, exploracion_fisica, signos_vitales, agudeza_visual
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [
    paciente_id, fecha, secuelas_auditiva, secuelas_respiratoria, secuelas_motriz,
    secuelas_pensamiento, secuelas_fuerza, secuelas_neurologica, secuelas_psicosocial,
    secuelas_visual, interrogatorio_aparatos, impresion_diagnostica,
    recomendaciones_reingreso, cie10, exploracion_fisica, signos_vitales, agudeza_visual
  ], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID, message: 'EMR registrado correctamente' });
  });
});

app.get('/api/emr/:pacienteId', (req, res) => {
  const { pacienteId } = req.params;
  db.all('SELECT * FROM emr WHERE paciente_id = ? ORDER BY fecha DESC', [pacienteId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/vulnerabilidad', (req, res) => {
  const { paciente_id, fecha, tipo_vulnerabilidad, embarazo, cronico_degenerativa,
    hepato_renal, cardiologica, dermatologica, hematologica, impresion_diagnostica,
    cie10, exploracion_fisica, signos_vitales, agudeza_visual } = req.body;

  const sql = `
    INSERT INTO vulnerabilidad (
      paciente_id, fecha, tipo_vulnerabilidad, embarazo, cronico_degenerativa,
      hepato_renal, cardiologica, dermatologica, hematologica, impresion_diagnostica,
      cie10, exploracion_fisica, signos_vitales, agudeza_visual
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [
    paciente_id, fecha, tipo_vulnerabilidad, embarazo, cronico_degenerativa,
    hepato_renal, cardiologica, dermatologica, hematologica, impresion_diagnostica,
    cie10, exploracion_fisica, signos_vitales, agudeza_visual
  ], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID, message: 'Valoración de vulnerabilidad registrada correctamente' });
  });
});

app.get('/api/vulnerabilidad/:pacienteId', (req, res) => {
  const { pacienteId } = req.params;
  db.all('SELECT * FROM vulnerabilidad WHERE paciente_id = ? ORDER BY fecha DESC', [pacienteId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// ==================== RUTAS DE AUTENTICACIÓN ====================

app.post('/api/login', (req, res) => {
  const { num_empleado, password } = req.body;

  if (!num_empleado || !password) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  const sql = 'SELECT * FROM usuarios WHERE num_empleado = ? AND password = ?';
  db.get(sql, [num_empleado, password], (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!user) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    const { password, ...userWithoutPassword } = user;
    res.json({ 
      success: true, 
      user: userWithoutPassword,
      message: `Bienvenido ${user.nombre}`
    });
  });
});

// ==================== RUTAS DE USUARIOS ====================

app.get('/api/usuarios', (req, res) => {
  db.all('SELECT id, num_empleado, nombre, rol, fecha_registro FROM usuarios', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/usuarios', (req, res) => {
  const { num_empleado, nombre, rol, password } = req.body;
  
  if (!num_empleado || !nombre || !rol || !password) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }

  const sql = `
    INSERT INTO usuarios (num_empleado, nombre, rol, password, fecha_registro)
    VALUES (?, ?, ?, ?, datetime('now'))
  `;
  db.run(sql, [num_empleado, nombre, rol, password], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'El número de empleado ya existe' });
      }
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, message: 'Usuario creado correctamente' });
  });
});

app.delete('/api/usuarios/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT num_empleado FROM usuarios WHERE id = ?', [id], (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (user.num_empleado === 'ADMIN001') {
      return res.status(403).json({ error: 'No se puede eliminar al administrador principal' });
    }

    db.run('DELETE FROM usuarios WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Usuario eliminado correctamente' });
    });
  });
});

// ==================== RUTAS DE ESTADÍSTICAS ====================

app.get('/api/estadisticas', (req, res) => {
  const stats = {};

  db.get('SELECT COUNT(*) as total FROM pacientes', (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    stats.totalPacientes = row.total;

    db.get('SELECT COUNT(*) as total FROM consultas', (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      stats.totalConsultas = row.total;

      db.get('SELECT COUNT(*) as total FROM emi', (err, row) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        stats.totalEMI = row.total || 0;

        db.get('SELECT COUNT(*) as total FROM emp', (err, row) => {
          if (err) {
            res.status(500).json({ error: err.message });
            return;
          }
          stats.totalEMP = row.total || 0;

          db.get('SELECT COUNT(*) as total FROM emr', (err, row) => {
            if (err) {
              res.status(500).json({ error: err.message });
              return;
            }
            stats.totalEMR = row.total || 0;

            db.get('SELECT COUNT(*) as total FROM vulnerabilidad', (err, row) => {
              if (err) {
                res.status(500).json({ error: err.message });
                return;
              }
              stats.totalVulnerabilidad = row.total || 0;
              res.json(stats);
            });
          });
        });
      });
    });
  });
});

app.get('/api/top-motivos', (req, res) => {
  db.all(`
    SELECT motivo, COUNT(*) as count 
    FROM consultas 
    WHERE motivo IS NOT NULL AND motivo != ''
    GROUP BY motivo 
    ORDER BY count DESC 
    LIMIT 5
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/top-areas', (req, res) => {
  db.all(`
    SELECT p.area, COUNT(c.id) as count 
    FROM consultas c
    JOIN pacientes p ON c.paciente_id = p.id
    WHERE p.area IS NOT NULL AND p.area != ''
    GROUP BY p.area 
    ORDER BY count DESC 
    LIMIT 5
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/consultas-por-mes', (req, res) => {
  db.all(`
    SELECT strftime('%Y-%m', fecha) as mes, COUNT(*) as count
    FROM consultas
    GROUP BY mes
    ORDER BY mes DESC
    LIMIT 12
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/pacientes-por-area', (req, res) => {
  db.all(`
    SELECT area, COUNT(*) as count 
    FROM pacientes 
    WHERE area IS NOT NULL AND area != ''
    GROUP BY area 
    ORDER BY count DESC
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// ==================== RUTAS DE ENVÍO DE CORREOS ====================

const { enviarCorreo } = require('./emailService');

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

// ==================== INICIAR SERVIDOR ====================

app.listen(PORT, () => {
  console.log(`🚀 Servidor BO Synergy corriendo en http://localhost:${PORT}`);
});