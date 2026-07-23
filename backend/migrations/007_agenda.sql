-- Mi Agenda: actividades personales del usuario (reunión, consulta,
-- seguimiento o informe) con fecha y hora, mostradas en un calendario.

CREATE TABLE IF NOT EXISTS agenda_actividades (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  descripcion TEXT,
  fecha DATE NOT NULL,
  hora TIME,
  created_at TIMESTAMP DEFAULT NOW()
);
