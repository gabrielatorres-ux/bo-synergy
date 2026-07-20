-- Multi-tenant: varias empresas comparten la misma app, cada una con su
-- propio logo/nombre y sus propios pacientes/usuarios. BO Synergy no es un
-- caso especial en el código: es simplemente la primera fila de `empresas`.

CREATE TABLE IF NOT EXISTS empresas (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  logo_url TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO empresas (nombre)
SELECT 'BO Synergy'
WHERE NOT EXISTS (SELECT 1 FROM empresas WHERE nombre = 'BO Synergy');

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS es_superadmin BOOLEAN DEFAULT false;

UPDATE usuarios SET empresa_id = (SELECT id FROM empresas WHERE nombre = 'BO Synergy')
WHERE empresa_id IS NULL;

UPDATE usuarios SET es_superadmin = true WHERE num_empleado = 'ADMIN001';

ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id);
