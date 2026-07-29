-- Módulo NOM-035 (identificación, análisis y prevención de factores de
-- riesgo psicosocial). IMPORTANTE: nom035_preguntas y nom035_rangos_riesgo
-- se cargan con contenido de EJEMPLO (ver seed más abajo), no el texto
-- oficial de la Guía de Referencia de la STPS. Son datos, no código, para
-- poder reemplazarlos por el cuestionario oficial sin tocar el backend.
-- No usar en producción para acreditar cumplimiento real de la norma
-- hasta sustituir ese contenido y validarlo con el área legal/de
-- cumplimiento.

-- Catálogo global de preguntas (no es dato de una empresa, es el banco de
-- reactivos que se le asigna a cualquier campaña según la guía aplicable).
CREATE TABLE IF NOT EXISTS nom035_preguntas (
  id SERIAL PRIMARY KEY,
  guia TEXT NOT NULL CHECK (guia IN ('I', 'II', 'III')),
  dominio TEXT NOT NULL,
  texto TEXT NOT NULL,
  es_inverso BOOLEAN DEFAULT false,
  es_oficial BOOLEAN DEFAULT false,
  orden INTEGER NOT NULL DEFAULT 0
);

-- Puntos de corte por categoría de riesgo, configurables sin tocar código.
CREATE TABLE IF NOT EXISTS nom035_rangos_riesgo (
  id SERIAL PRIMARY KEY,
  guia TEXT NOT NULL CHECK (guia IN ('I', 'II', 'III')),
  dominio TEXT NOT NULL,
  categoria_riesgo TEXT NOT NULL CHECK (categoria_riesgo IN ('nulo', 'bajo', 'medio', 'alto', 'muy_alto')),
  puntaje_min INTEGER NOT NULL,
  puntaje_max INTEGER NOT NULL,
  UNIQUE (guia, dominio, categoria_riesgo)
);

-- Una campaña = una ronda de evaluación para una empresa (la norma exige
-- repetirla al menos una vez al año, o ante eventos que lo ameriten).
CREATE TABLE IF NOT EXISTS nom035_campanas (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  guia TEXT NOT NULL CHECK (guia IN ('I', 'II', 'III')),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  creada_por INTEGER REFERENCES usuarios(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Respuesta individual de un trabajador a una pregunta dentro de una
-- campaña. empresa_id queda denormalizado (igual que en bitacora_registros
-- y similares) para que las políticas RLS no dependan de un JOIN extra.
CREATE TABLE IF NOT EXISTS nom035_respuestas (
  id SERIAL PRIMARY KEY,
  campana_id INTEGER NOT NULL REFERENCES nom035_campanas(id) ON DELETE CASCADE,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  pregunta_id INTEGER NOT NULL REFERENCES nom035_preguntas(id),
  valor INTEGER NOT NULL CHECK (valor BETWEEN 0 AND 4),
  fecha_respuesta TIMESTAMP DEFAULT NOW(),
  UNIQUE (campana_id, paciente_id, pregunta_id)
);

-- Resultado calculado por dominio (y una fila con dominio='GENERAL' para
-- el resultado global). Se guarda para trazabilidad/auditoría, no solo se
-- calcula al vuelo.
CREATE TABLE IF NOT EXISTS nom035_resultados (
  id SERIAL PRIMARY KEY,
  campana_id INTEGER NOT NULL REFERENCES nom035_campanas(id) ON DELETE CASCADE,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  dominio TEXT NOT NULL,
  puntaje INTEGER NOT NULL,
  categoria_riesgo TEXT NOT NULL CHECK (categoria_riesgo IN ('nulo', 'bajo', 'medio', 'alto', 'muy_alto')),
  calculado_en TIMESTAMP DEFAULT NOW(),
  UNIQUE (campana_id, paciente_id, dominio)
);

-- Identificación de trabajadores expuestos a acontecimientos traumáticos
-- severos (accidentes graves, violencia, asaltos, desastres), que la norma
-- exige atender sin importar el resultado del cuestionario general.
CREATE TABLE IF NOT EXISTS nom035_eventos_traumaticos (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  tipo_evento TEXT NOT NULL,
  descripcion TEXT,
  atencion_brindada TEXT,
  estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'en_seguimiento', 'cerrado')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Plan de acción correctivo/preventivo derivado de los resultados.
CREATE TABLE IF NOT EXISTS nom035_plan_accion (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  campana_id INTEGER REFERENCES nom035_campanas(id) ON DELETE SET NULL,
  dominio TEXT NOT NULL,
  accion TEXT NOT NULL,
  responsable TEXT,
  fecha_compromiso DATE,
  estatus TEXT NOT NULL DEFAULT 'pendiente' CHECK (estatus IN ('pendiente', 'en_proceso', 'completado')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ==================== RLS ====================
-- Mismo modelo que el resto del sistema: el rol app_backend (sin
-- BYPASSRLS) solo ve/edita filas de su propia empresa, salvo superadmin.

ALTER TABLE nom035_campanas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON nom035_campanas;
CREATE POLICY tenant_isolation ON nom035_campanas FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

ALTER TABLE nom035_respuestas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON nom035_respuestas;
CREATE POLICY tenant_isolation ON nom035_respuestas FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

ALTER TABLE nom035_resultados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON nom035_resultados;
CREATE POLICY tenant_isolation ON nom035_resultados FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

ALTER TABLE nom035_eventos_traumaticos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON nom035_eventos_traumaticos;
CREATE POLICY tenant_isolation ON nom035_eventos_traumaticos FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

ALTER TABLE nom035_plan_accion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON nom035_plan_accion;
CREATE POLICY tenant_isolation ON nom035_plan_accion FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

-- nom035_preguntas y nom035_rangos_riesgo son catálogos globales (no son
-- datos de una empresa), no llevan RLS — se protegen a nivel de aplicación
-- (solo superadmin puede escribirlas, cualquier usuario autenticado puede
-- leerlas).

-- ==================== CONTENIDO DE EJEMPLO (NO OFICIAL) ====================
-- 5 dominios, con 4/3/2 reactivos según la guía (III/II/I respectivamente).
-- es_oficial = false en todas: hay que sustituir este banco por el texto
-- exacto de la Guía de Referencia de la STPS antes de usarse para acreditar
-- cumplimiento real. Los rangos de riesgo son bandas genéricas de 20% del
-- puntaje máximo posible, no los puntos de corte oficiales.

INSERT INTO nom035_preguntas (guia, dominio, texto, es_inverso, orden)
SELECT * FROM (VALUES
  -- Guía III (empresas de más de 50 trabajadores) — 4 reactivos por dominio
  ('III', 'Ambiente de trabajo', 'Mi trabajo me exige hacer mucho esfuerzo físico', false, 1),
  ('III', 'Ambiente de trabajo', 'Me preocupa sufrir un accidente en mi trabajo', false, 2),
  ('III', 'Ambiente de trabajo', 'Las condiciones ambientales de mi trabajo (ruido, iluminación, temperatura) son adecuadas', true, 3),
  ('III', 'Ambiente de trabajo', 'Cuento con el equipo de protección necesario para mi trabajo', true, 4),
  ('III', 'Carga de trabajo', 'Mi trabajo me exige hacer las cosas muy rápido', false, 1),
  ('III', 'Carga de trabajo', 'Tengo que atender varios asuntos al mismo tiempo en mi trabajo', false, 2),
  ('III', 'Carga de trabajo', 'Puedo tomar pausas durante mi jornada cuando las necesito', true, 3),
  ('III', 'Carga de trabajo', 'La cantidad de trabajo que tengo es mayor a la que puedo realizar en mi jornada', false, 4),
  ('III', 'Organización del tiempo de trabajo', 'Mi trabajo me exige laborar horas extra la mayoría de los días', false, 1),
  ('III', 'Organización del tiempo de trabajo', 'Puedo decidir cuándo tomar mis días de descanso', true, 2),
  ('III', 'Organización del tiempo de trabajo', 'Trabajo en un horario que me impide convivir con mi familia', false, 3),
  ('III', 'Organización del tiempo de trabajo', 'Me avisan con anticipación si voy a tener que cambiar mi horario', true, 4),
  ('III', 'Liderazgo y relaciones en el trabajo', 'Mi jefe inmediato ayuda a organizar mejor el trabajo', true, 1),
  ('III', 'Liderazgo y relaciones en el trabajo', 'Puedo confiar en mis compañeros de trabajo', true, 2),
  ('III', 'Liderazgo y relaciones en el trabajo', 'Mi jefe inmediato toma en cuenta mis puntos de vista', true, 3),
  ('III', 'Liderazgo y relaciones en el trabajo', 'Recibo comentarios negativos o burlas de mis compañeros', false, 4),
  ('III', 'Violencia laboral', 'He recibido de mis superiores gritos o regaños en presencia de otras personas', false, 1),
  ('III', 'Violencia laboral', 'He recibido amenazas de que me van a correr o cambiar de puesto', false, 2),
  ('III', 'Violencia laboral', 'He recibido burlas, calumnias o críticas acerca de mí, con la intención de humillarme', false, 3),
  ('III', 'Violencia laboral', 'He recibido acoso o presión de tipo sexual', false, 4),

  -- Guía II (empresas de 16 a 50 trabajadores) — 3 reactivos por dominio
  ('II', 'Ambiente de trabajo', 'Mi trabajo me exige hacer mucho esfuerzo físico', false, 1),
  ('II', 'Ambiente de trabajo', 'Me preocupa sufrir un accidente en mi trabajo', false, 2),
  ('II', 'Ambiente de trabajo', 'Cuento con el equipo de protección necesario para mi trabajo', true, 3),
  ('II', 'Carga de trabajo', 'Mi trabajo me exige hacer las cosas muy rápido', false, 1),
  ('II', 'Carga de trabajo', 'La cantidad de trabajo que tengo es mayor a la que puedo realizar en mi jornada', false, 2),
  ('II', 'Carga de trabajo', 'Puedo tomar pausas durante mi jornada cuando las necesito', true, 3),
  ('II', 'Organización del tiempo de trabajo', 'Mi trabajo me exige laborar horas extra la mayoría de los días', false, 1),
  ('II', 'Organización del tiempo de trabajo', 'Puedo decidir cuándo tomar mis días de descanso', true, 2),
  ('II', 'Organización del tiempo de trabajo', 'Trabajo en un horario que me impide convivir con mi familia', false, 3),
  ('II', 'Liderazgo y relaciones en el trabajo', 'Mi jefe inmediato ayuda a organizar mejor el trabajo', true, 1),
  ('II', 'Liderazgo y relaciones en el trabajo', 'Puedo confiar en mis compañeros de trabajo', true, 2),
  ('II', 'Liderazgo y relaciones en el trabajo', 'Recibo comentarios negativos o burlas de mis compañeros', false, 3),
  ('II', 'Violencia laboral', 'He recibido de mis superiores gritos o regaños en presencia de otras personas', false, 1),
  ('II', 'Violencia laboral', 'He recibido amenazas de que me van a correr o cambiar de puesto', false, 2),
  ('II', 'Violencia laboral', 'He recibido acoso o presión de tipo sexual', false, 3),

  -- Guía I (empresas de hasta 15 trabajadores) — 2 reactivos por dominio
  ('I', 'Ambiente de trabajo', 'Mi trabajo me exige hacer mucho esfuerzo físico', false, 1),
  ('I', 'Ambiente de trabajo', 'Cuento con el equipo de protección necesario para mi trabajo', true, 2),
  ('I', 'Carga de trabajo', 'Mi trabajo me exige hacer las cosas muy rápido', false, 1),
  ('I', 'Carga de trabajo', 'La cantidad de trabajo que tengo es mayor a la que puedo realizar en mi jornada', false, 2),
  ('I', 'Organización del tiempo de trabajo', 'Mi trabajo me exige laborar horas extra la mayoría de los días', false, 1),
  ('I', 'Organización del tiempo de trabajo', 'Trabajo en un horario que me impide convivir con mi familia', false, 2),
  ('I', 'Liderazgo y relaciones en el trabajo', 'Mi jefe inmediato ayuda a organizar mejor el trabajo', true, 1),
  ('I', 'Liderazgo y relaciones en el trabajo', 'Recibo comentarios negativos o burlas de mis compañeros', false, 2),
  ('I', 'Violencia laboral', 'He recibido de mis superiores gritos o regaños en presencia de otras personas', false, 1),
  ('I', 'Violencia laboral', 'He recibido acoso o presión de tipo sexual', false, 2)
) AS datos(guia, dominio, texto, es_inverso, orden)
WHERE NOT EXISTS (SELECT 1 FROM nom035_preguntas);

-- Rangos de riesgo: bandas de 20% del puntaje máximo posible por dominio
-- (4 reactivos x valor 0-4 = máx 16 en guía III, etc.) y para el resultado
-- GENERAL (suma de los 5 dominios).
INSERT INTO nom035_rangos_riesgo (guia, dominio, categoria_riesgo, puntaje_min, puntaje_max)
SELECT * FROM (VALUES
  -- Guía III: máx 16 por dominio, máx 80 general
  ('III', 'Ambiente de trabajo', 'nulo', 0, 3), ('III', 'Ambiente de trabajo', 'bajo', 4, 6), ('III', 'Ambiente de trabajo', 'medio', 7, 9), ('III', 'Ambiente de trabajo', 'alto', 10, 12), ('III', 'Ambiente de trabajo', 'muy_alto', 13, 16),
  ('III', 'Carga de trabajo', 'nulo', 0, 3), ('III', 'Carga de trabajo', 'bajo', 4, 6), ('III', 'Carga de trabajo', 'medio', 7, 9), ('III', 'Carga de trabajo', 'alto', 10, 12), ('III', 'Carga de trabajo', 'muy_alto', 13, 16),
  ('III', 'Organización del tiempo de trabajo', 'nulo', 0, 3), ('III', 'Organización del tiempo de trabajo', 'bajo', 4, 6), ('III', 'Organización del tiempo de trabajo', 'medio', 7, 9), ('III', 'Organización del tiempo de trabajo', 'alto', 10, 12), ('III', 'Organización del tiempo de trabajo', 'muy_alto', 13, 16),
  ('III', 'Liderazgo y relaciones en el trabajo', 'nulo', 0, 3), ('III', 'Liderazgo y relaciones en el trabajo', 'bajo', 4, 6), ('III', 'Liderazgo y relaciones en el trabajo', 'medio', 7, 9), ('III', 'Liderazgo y relaciones en el trabajo', 'alto', 10, 12), ('III', 'Liderazgo y relaciones en el trabajo', 'muy_alto', 13, 16),
  ('III', 'Violencia laboral', 'nulo', 0, 3), ('III', 'Violencia laboral', 'bajo', 4, 6), ('III', 'Violencia laboral', 'medio', 7, 9), ('III', 'Violencia laboral', 'alto', 10, 12), ('III', 'Violencia laboral', 'muy_alto', 13, 16),
  ('III', 'GENERAL', 'nulo', 0, 16), ('III', 'GENERAL', 'bajo', 17, 32), ('III', 'GENERAL', 'medio', 33, 48), ('III', 'GENERAL', 'alto', 49, 64), ('III', 'GENERAL', 'muy_alto', 65, 80),

  -- Guía II: máx 12 por dominio, máx 60 general
  ('II', 'Ambiente de trabajo', 'nulo', 0, 2), ('II', 'Ambiente de trabajo', 'bajo', 3, 4), ('II', 'Ambiente de trabajo', 'medio', 5, 7), ('II', 'Ambiente de trabajo', 'alto', 8, 9), ('II', 'Ambiente de trabajo', 'muy_alto', 10, 12),
  ('II', 'Carga de trabajo', 'nulo', 0, 2), ('II', 'Carga de trabajo', 'bajo', 3, 4), ('II', 'Carga de trabajo', 'medio', 5, 7), ('II', 'Carga de trabajo', 'alto', 8, 9), ('II', 'Carga de trabajo', 'muy_alto', 10, 12),
  ('II', 'Organización del tiempo de trabajo', 'nulo', 0, 2), ('II', 'Organización del tiempo de trabajo', 'bajo', 3, 4), ('II', 'Organización del tiempo de trabajo', 'medio', 5, 7), ('II', 'Organización del tiempo de trabajo', 'alto', 8, 9), ('II', 'Organización del tiempo de trabajo', 'muy_alto', 10, 12),
  ('II', 'Liderazgo y relaciones en el trabajo', 'nulo', 0, 2), ('II', 'Liderazgo y relaciones en el trabajo', 'bajo', 3, 4), ('II', 'Liderazgo y relaciones en el trabajo', 'medio', 5, 7), ('II', 'Liderazgo y relaciones en el trabajo', 'alto', 8, 9), ('II', 'Liderazgo y relaciones en el trabajo', 'muy_alto', 10, 12),
  ('II', 'Violencia laboral', 'nulo', 0, 2), ('II', 'Violencia laboral', 'bajo', 3, 4), ('II', 'Violencia laboral', 'medio', 5, 7), ('II', 'Violencia laboral', 'alto', 8, 9), ('II', 'Violencia laboral', 'muy_alto', 10, 12),
  ('II', 'GENERAL', 'nulo', 0, 12), ('II', 'GENERAL', 'bajo', 13, 24), ('II', 'GENERAL', 'medio', 25, 36), ('II', 'GENERAL', 'alto', 37, 48), ('II', 'GENERAL', 'muy_alto', 49, 60),

  -- Guía I: máx 8 por dominio, máx 40 general
  ('I', 'Ambiente de trabajo', 'nulo', 0, 1), ('I', 'Ambiente de trabajo', 'bajo', 2, 3), ('I', 'Ambiente de trabajo', 'medio', 4, 4), ('I', 'Ambiente de trabajo', 'alto', 5, 6), ('I', 'Ambiente de trabajo', 'muy_alto', 7, 8),
  ('I', 'Carga de trabajo', 'nulo', 0, 1), ('I', 'Carga de trabajo', 'bajo', 2, 3), ('I', 'Carga de trabajo', 'medio', 4, 4), ('I', 'Carga de trabajo', 'alto', 5, 6), ('I', 'Carga de trabajo', 'muy_alto', 7, 8),
  ('I', 'Organización del tiempo de trabajo', 'nulo', 0, 1), ('I', 'Organización del tiempo de trabajo', 'bajo', 2, 3), ('I', 'Organización del tiempo de trabajo', 'medio', 4, 4), ('I', 'Organización del tiempo de trabajo', 'alto', 5, 6), ('I', 'Organización del tiempo de trabajo', 'muy_alto', 7, 8),
  ('I', 'Liderazgo y relaciones en el trabajo', 'nulo', 0, 1), ('I', 'Liderazgo y relaciones en el trabajo', 'bajo', 2, 3), ('I', 'Liderazgo y relaciones en el trabajo', 'medio', 4, 4), ('I', 'Liderazgo y relaciones en el trabajo', 'alto', 5, 6), ('I', 'Liderazgo y relaciones en el trabajo', 'muy_alto', 7, 8),
  ('I', 'Violencia laboral', 'nulo', 0, 1), ('I', 'Violencia laboral', 'bajo', 2, 3), ('I', 'Violencia laboral', 'medio', 4, 4), ('I', 'Violencia laboral', 'alto', 5, 6), ('I', 'Violencia laboral', 'muy_alto', 7, 8),
  ('I', 'GENERAL', 'nulo', 0, 8), ('I', 'GENERAL', 'bajo', 9, 16), ('I', 'GENERAL', 'medio', 17, 24), ('I', 'GENERAL', 'alto', 25, 32), ('I', 'GENERAL', 'muy_alto', 33, 40)
) AS datos(guia, dominio, categoria_riesgo, puntaje_min, puntaje_max)
WHERE NOT EXISTS (SELECT 1 FROM nom035_rangos_riesgo);
