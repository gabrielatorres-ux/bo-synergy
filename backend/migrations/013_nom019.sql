-- Módulo NOM-019-STPS-2011 (comisión de seguridad e higiene). La
-- periodicidad exacta de reuniones y el quórum/composición formal exigidos
-- varían según tamaño y nivel de riesgo de la empresa y deben confirmarse
-- con el área legal/de cumplimiento antes de tratarse como obligatorios —
-- aquí quedan como campos libres/configurables, no como reglas forzadas
-- por el sistema.

CREATE TABLE IF NOT EXISTS nom019_comisiones (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  fecha_constitucion DATE NOT NULL,
  vigencia_hasta DATE,
  periodicidad_reuniones TEXT,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'vencida', 'disuelta')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nom019_integrantes (
  id SERIAL PRIMARY KEY,
  comision_id INTEGER NOT NULL REFERENCES nom019_comisiones(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  paciente_id INTEGER REFERENCES pacientes(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  representacion TEXT NOT NULL CHECK (representacion IN ('trabajador', 'patronal')),
  cargo TEXT NOT NULL CHECK (cargo IN ('presidente', 'secretario', 'vocal')),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nom019_reuniones (
  id SERIAL PRIMARY KEY,
  comision_id INTEGER NOT NULL REFERENCES nom019_comisiones(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'ordinaria' CHECK (tipo IN ('ordinaria', 'extraordinaria')),
  lugar TEXT,
  asistentes TEXT,
  temas TEXT,
  creada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nom019_acuerdos (
  id SERIAL PRIMARY KEY,
  reunion_id INTEGER NOT NULL REFERENCES nom019_reuniones(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  responsable TEXT,
  fecha_compromiso DATE,
  estatus TEXT NOT NULL DEFAULT 'pendiente' CHECK (estatus IN ('pendiente', 'en_proceso', 'completado')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nom019_recorridos (
  id SERIAL PRIMARY KEY,
  comision_id INTEGER NOT NULL REFERENCES nom019_comisiones(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  area TEXT NOT NULL,
  hallazgos TEXT,
  responsable TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ==================== RLS ====================

ALTER TABLE nom019_comisiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON nom019_comisiones;
CREATE POLICY tenant_isolation ON nom019_comisiones FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

ALTER TABLE nom019_integrantes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON nom019_integrantes;
CREATE POLICY tenant_isolation ON nom019_integrantes FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

ALTER TABLE nom019_reuniones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON nom019_reuniones;
CREATE POLICY tenant_isolation ON nom019_reuniones FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

ALTER TABLE nom019_acuerdos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON nom019_acuerdos;
CREATE POLICY tenant_isolation ON nom019_acuerdos FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

ALTER TABLE nom019_recorridos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON nom019_recorridos;
CREATE POLICY tenant_isolation ON nom019_recorridos FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);
