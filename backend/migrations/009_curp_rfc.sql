-- CURP y RFC del trabajador, para cumplir con lo que exige la
-- identificación de personas físicas ante STPS/IMSS y poder buscarlos
-- por esos datos además de nombre/número de empleado.

ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS curp TEXT;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS rfc TEXT;
