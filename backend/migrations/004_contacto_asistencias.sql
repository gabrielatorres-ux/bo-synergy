-- Datos de contacto de la empresa (para el registro de nuevos clientes)
-- y tabla de asistencias: cada login queda registrado como "checada" de
-- entrada (reloj checador).

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS correo TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS celular TEXT;

CREATE TABLE IF NOT EXISTS asistencias (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  fecha_hora TIMESTAMP DEFAULT NOW()
);
