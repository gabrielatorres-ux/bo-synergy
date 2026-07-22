-- Ajustes solicitados tras revisar el módulo de Consultas:
-- 1) Detalle de alergias en Consulta General (columna alergias_detalle ya
--    existía desde 001_fix_schema.sql; no requiere cambios aquí).
-- 2) Seguimiento: separar CIE-10 y tratamiento en columnas propias, igual
--    que Bitácora, en vez de un solo campo de observación combinado.

ALTER TABLE seguimientos ADD COLUMN IF NOT EXISTS cie10 TEXT;
ALTER TABLE seguimientos ADD COLUMN IF NOT EXISTS tratamiento TEXT;

-- 3) Alergias como dato fijo del expediente del paciente (se muestra en la
--    lista de Pacientes Registrados en vez del número de empleado).
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS alergias BOOLEAN DEFAULT false;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS alergias_detalle TEXT;
