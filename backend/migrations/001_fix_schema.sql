-- Corrige el esquema del proyecto de Supabase "Bo Synergy 1": solo tenía
-- pacientes, consultas y usuarios. Faltaban las tablas de exámenes
-- (emi, emp, emr, vulnerabilidad) que server.js ya usa, y consultas.fecha
-- estaba como TEXT en vez de DATE (rompía TO_CHAR en /api/consultas-por-mes).

ALTER TABLE consultas ALTER COLUMN fecha TYPE DATE USING fecha::date;
ALTER TABLE consultas ADD COLUMN IF NOT EXISTS alergias_detalle TEXT;

CREATE TABLE IF NOT EXISTS emi (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  fecha DATE,
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
  agudeza_visual TEXT
);

CREATE TABLE IF NOT EXISTS emp (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  fecha DATE,
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
  agudeza_visual TEXT
);

CREATE TABLE IF NOT EXISTS emr (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  fecha DATE,
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
  agudeza_visual TEXT
);

CREATE TABLE IF NOT EXISTS vulnerabilidad (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  fecha DATE,
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
  agudeza_visual TEXT
);
