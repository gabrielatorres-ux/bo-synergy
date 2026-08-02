-- Módulo NOM-036-1 (factores de riesgo ergonómico — manejo manual de
-- cargas). IMPORTANTE: los criterios de calificación (qué tanto puntúa
-- cada peso/frecuencia/distancia/postura) viven como código de EJEMPLO en
-- server.js (función calcularRiesgoNom036, claramente marcada), y los
-- rangos de riesgo en nom036_rangos_riesgo también son de ejemplo — no
-- las tablas ni los límites de peso exactos de los anexos de la STPS. No
-- usar en producción para acreditar cumplimiento real hasta sustituir
-- esos criterios y validarlos con el área legal/de cumplimiento.

CREATE TABLE IF NOT EXISTS nom036_evaluaciones (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  puesto TEXT,
  peso_carga_kg NUMERIC NOT NULL,
  frecuencia_por_hora NUMERIC NOT NULL,
  distancia_transporte_m NUMERIC NOT NULL,
  postura TEXT NOT NULL CHECK (postura IN ('neutra', 'ligeramente_flexionada', 'flexionada', 'muy_flexionada_o_girada')),
  duracion_jornada_horas NUMERIC NOT NULL,
  trabajador_vulnerable BOOLEAN DEFAULT false,
  observaciones TEXT,
  puntaje INTEGER NOT NULL,
  categoria_riesgo TEXT NOT NULL CHECK (categoria_riesgo IN ('bajo', 'medio', 'alto', 'muy_alto')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Puntos de corte por categoría de riesgo (sobre el puntaje calculado en
-- server.js), configurables sin tocar código.
CREATE TABLE IF NOT EXISTS nom036_rangos_riesgo (
  id SERIAL PRIMARY KEY,
  categoria_riesgo TEXT NOT NULL CHECK (categoria_riesgo IN ('bajo', 'medio', 'alto', 'muy_alto')),
  puntaje_min INTEGER NOT NULL,
  puntaje_max INTEGER NOT NULL,
  UNIQUE (categoria_riesgo)
);

INSERT INTO nom036_rangos_riesgo (categoria_riesgo, puntaje_min, puntaje_max)
SELECT * FROM (VALUES
  ('bajo', 0, 4),
  ('medio', 5, 9),
  ('alto', 10, 13),
  ('muy_alto', 14, 17)
) AS datos(categoria_riesgo, puntaje_min, puntaje_max)
WHERE NOT EXISTS (SELECT 1 FROM nom036_rangos_riesgo);

CREATE TABLE IF NOT EXISTS nom036_plan_accion (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  evaluacion_id INTEGER REFERENCES nom036_evaluaciones(id) ON DELETE SET NULL,
  accion TEXT NOT NULL,
  responsable TEXT,
  fecha_compromiso DATE,
  estatus TEXT NOT NULL DEFAULT 'pendiente' CHECK (estatus IN ('pendiente', 'en_proceso', 'completado')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ==================== RLS ====================

ALTER TABLE nom036_evaluaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON nom036_evaluaciones;
CREATE POLICY tenant_isolation ON nom036_evaluaciones FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

ALTER TABLE nom036_plan_accion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON nom036_plan_accion;
CREATE POLICY tenant_isolation ON nom036_plan_accion FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

-- nom036_rangos_riesgo es un catálogo global (no es dato de una empresa),
-- no lleva RLS — se protege a nivel de aplicación (solo superadmin puede
-- escribirlo).
