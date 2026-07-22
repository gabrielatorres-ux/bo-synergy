-- Módulo clínico ampliado: 6 tablas nuevas para los formularios de la
-- pestaña Consultas (Bitácora, Incapacidades, Seguimientos, Restricciones,
-- Accidentes, Trabajos de Alto Riesgo) + columnas alergia/embarazada en
-- emi/emp/emr para "Consulta Diaria".

CREATE TABLE IF NOT EXISTS bitacora_registros (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  empresa_id INTEGER REFERENCES empresas(id),
  fecha DATE,
  hora TIME,
  alergias BOOLEAN,
  embarazo BOOLEAN,
  cie10 TEXT,
  tratamiento TEXT,
  firma TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS incapacidades (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  empresa_id INTEGER REFERENCES empresas(id),
  fecha DATE,
  hora TIME,
  tipo TEXT,
  descripcion TEXT,
  dias INTEGER,
  manejo TEXT,
  adjunto_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seguimientos (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  empresa_id INTEGER REFERENCES empresas(id),
  fecha DATE,
  hora TIME,
  tipo TEXT,
  observacion TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS restricciones (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  empresa_id INTEGER REFERENCES empresas(id),
  fecha DATE,
  hora TIME,
  tipo TEXT,
  dias INTEGER,
  descripcion TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accidentes (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  empresa_id INTEGER REFERENCES empresas(id),
  fecha DATE,
  hora TIME,
  hechos TEXT,
  exploracion_fisica TEXT,
  diagnostico TEXT,
  plan_accion TEXT,
  alcoholimetria TEXT,
  antidoping TEXT,
  adjunto_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trabajos_alto_riesgo (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  empresa_id INTEGER REFERENCES empresas(id),
  fecha DATE,
  hora TIME,
  tipo_riesgo TEXT,
  agudeza_visual TEXT,
  tension_arterial TEXT,
  frecuencia_cardiaca TEXT,
  glucosa TEXT,
  prueba_equilibrio TEXT,
  alcoholimetria TEXT,
  antidoping TEXT,
  autorizada BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE emi ADD COLUMN IF NOT EXISTS alergia BOOLEAN;
ALTER TABLE emi ADD COLUMN IF NOT EXISTS embarazada BOOLEAN;

ALTER TABLE emp ADD COLUMN IF NOT EXISTS alergia BOOLEAN;
ALTER TABLE emp ADD COLUMN IF NOT EXISTS embarazada BOOLEAN;

ALTER TABLE emr ADD COLUMN IF NOT EXISTS alergia BOOLEAN;
ALTER TABLE emr ADD COLUMN IF NOT EXISTS embarazada BOOLEAN;
