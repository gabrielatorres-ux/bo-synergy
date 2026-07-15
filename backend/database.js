const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'bo-synergy.db'));

// Crear tablas
db.exec(`
  CREATE TABLE IF NOT EXISTS pacientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    num_empleado TEXT UNIQUE,
    nombre TEXT,
    fecha_nac TEXT,
    nss TEXT,
    contacto_emergencia TEXT,
    puesto TEXT,
    area TEXT,
    supervisor TEXT
  );

  CREATE TABLE IF NOT EXISTS consultas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER,
    fecha TEXT,
    motivo TEXT,
    alergias TEXT,
    cabeza TEXT,
    cuello TEXT,
    torax TEXT,
    abdomen TEXT,
    espalda TEXT,
    extremidades_superiores TEXT,
    extremidades_inferiores TEXT,
    ojos_oidos_garganta TEXT,
    causa TEXT,
    impresion_diagnostica TEXT,
    medicamentos TEXT,
    receta TEXT,
    cie10 TEXT,
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
  );

  CREATE TABLE IF NOT EXISTS emi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER,
    fecha TEXT,
    exposicion_riesgos TEXT,
    trabajos_previos TEXT,
    riesgos_laborales TEXT,
    accidentes_previos TEXT,
    enfermedades_laborales TEXT,
    antecedentes_familiares TEXT,
    antecedentes_personales_no_patologicos TEXT,
    antecedentes_personales_patologicos TEXT,
    interrogatorio_aparatos TEXT,
    impresion_diagnostica TEXT,
    constancia_aptitud TEXT,
    cie10 TEXT,
    exploracion_fisica TEXT,
    signos_vitales TEXT,
    agudeza_visual TEXT,
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
  );

  CREATE TABLE IF NOT EXISTS emp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER,
    fecha TEXT,
    exposicion_auditiva TEXT,
    exposicion_respiratoria TEXT,
    exposicion_movimientos_repetitivos TEXT,
    exposicion_postural TEXT,
    exposicion_cargas_manuales TEXT,
    exposicion_visual TEXT,
    exposicion_psicosocial TEXT,
    exposicion_trabajos_alto_riesgo TEXT,
    interrogatorio_aparatos TEXT,
    impresion_diagnostica TEXT,
    solicitud_reubicacion TEXT,
    cie10 TEXT,
    exploracion_fisica TEXT,
    signos_vitales TEXT,
    agudeza_visual TEXT,
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
  );

  CREATE TABLE IF NOT EXISTS emr (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER,
    fecha TEXT,
    secuelas_auditiva TEXT,
    secuelas_respiratoria TEXT,
    secuelas_motriz TEXT,
    secuelas_pensamiento TEXT,
    secuelas_fuerza TEXT,
    secuelas_neurologica TEXT,
    secuelas_psicosocial TEXT,
    secuelas_visual TEXT,
    interrogatorio_aparatos TEXT,
    impresion_diagnostica TEXT,
    recomendaciones_reingreso TEXT,
    cie10 TEXT,
    exploracion_fisica TEXT,
    signos_vitales TEXT,
    agudeza_visual TEXT,
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
  );

  CREATE TABLE IF NOT EXISTS vulnerabilidad (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER,
    fecha TEXT,
    tipo_vulnerabilidad TEXT,
    embarazo TEXT,
    cronico_degenerativa TEXT,
    hepato_renal TEXT,
    cardiologica TEXT,
    dermatologica TEXT,
    hematologica TEXT,
    impresion_diagnostica TEXT,
    cie10 TEXT,
    exploracion_fisica TEXT,
    signos_vitales TEXT,
    agudeza_visual TEXT,
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    num_empleado TEXT UNIQUE,
    nombre TEXT,
    rol TEXT,
    password TEXT,
    fecha_registro TEXT
  );
`);

// Insertar usuarios de prueba
const usuarios = [
  ['ADMIN001', 'Administrador BO Synergy', 'admin', 'admin123'],
  ['MED001', 'Dr. Juan Pérez', 'medico', 'medico123'],
  ['ENF001', 'Lic. María Gómez', 'enfermera', 'enfermera123']
];

const insertUsuario = db.prepare(`
  INSERT OR IGNORE INTO usuarios (num_empleado, nombre, rol, password, fecha_registro)
  VALUES (?, ?, ?, ?, datetime('now'))
`);

for (const user of usuarios) {
  insertUsuario.run(...user);
}

console.log('✅ Base de datos BO Synergy creada correctamente');
console.log('📝 Usuarios de prueba:');
console.log('   Admin: ADMIN001 / admin123');
console.log('   Médico: MED001 / medico123');
console.log('   Enfermera: ENF001 / enfermera123');

// Funciones helper para mantener compatibilidad con la API existente
const dbAll = (sql, params = []) => {
  const stmt = db.prepare(sql);
  return stmt.all(...params);
};

const dbGet = (sql, params = []) => {
  const stmt = db.prepare(sql);
  return stmt.get(...params);
};

const dbRun = (sql, params = []) => {
  const stmt = db.prepare(sql);
  const result = stmt.run(...params);
  return { lastID: result.lastInsertRowid, changes: result.changes };
};

module.exports = { db, dbAll, dbGet, dbRun };