-- Aislamiento multiempresa a nivel de base de datos (Row-Level Security).
--
-- El backend ya exige un token verificado y deriva empresa_id/rol de ahí
-- (nunca del cliente) para cada ruta autenticada — ver requireAuth y
-- scopeEmpresaId en server.js. Esto agrega una segunda capa: el propio
-- Postgres rechaza cualquier fila que no corresponda a la empresa de la
-- sesión, sin importar qué consulta arme el código de la aplicación.
--
-- Esto solo protege de verdad si las rutas autenticadas se conectan con
-- un rol SIN BYPASSRLS (ver migración de creación del rol app_backend en
-- el script aparte que acompaña esta migración — no se puede expresar
-- CREATE ROLE de forma idempotente en una migración .sql normal porque
-- requiere una contraseña que no debe quedar en el repo).
--
-- Variables de sesión que debe fijar el backend antes de cada consulta
-- autenticada (ver middleware withDbClient):
--   app.current_empresa_id  -> empresa_id del usuario autenticado
--   app.is_superadmin       -> 'true' si el usuario es superadmin
--   app.current_usuario_id  -> id del usuario autenticado (para Mi Agenda)

-- ==================== Tablas con empresa_id directo ====================

ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON pacientes;
CREATE POLICY tenant_isolation ON pacientes FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON usuarios;
CREATE POLICY tenant_isolation ON usuarios FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

ALTER TABLE asistencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON asistencias;
CREATE POLICY tenant_isolation ON asistencias FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

ALTER TABLE bitacora_registros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON bitacora_registros;
CREATE POLICY tenant_isolation ON bitacora_registros FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

ALTER TABLE incapacidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON incapacidades;
CREATE POLICY tenant_isolation ON incapacidades FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

ALTER TABLE seguimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON seguimientos;
CREATE POLICY tenant_isolation ON seguimientos FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

ALTER TABLE restricciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON restricciones;
CREATE POLICY tenant_isolation ON restricciones FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

ALTER TABLE accidentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON accidentes;
CREATE POLICY tenant_isolation ON accidentes FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

ALTER TABLE trabajos_alto_riesgo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON trabajos_alto_riesgo;
CREATE POLICY tenant_isolation ON trabajos_alto_riesgo FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR empresa_id = current_setting('app.current_empresa_id', true)::int);

-- empresas se identifica por su propio id, no por una columna empresa_id.
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON empresas;
CREATE POLICY tenant_isolation ON empresas FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR id = current_setting('app.current_empresa_id', true)::int)
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR id = current_setting('app.current_empresa_id', true)::int);

-- Mi Agenda es personal: además de la empresa, exige que sea el propio usuario.
ALTER TABLE agenda_actividades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON agenda_actividades;
CREATE POLICY tenant_isolation ON agenda_actividades FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR (empresa_id = current_setting('app.current_empresa_id', true)::int
        AND usuario_id = current_setting('app.current_usuario_id', true)::int)
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR (empresa_id = current_setting('app.current_empresa_id', true)::int
        AND usuario_id = current_setting('app.current_usuario_id', true)::int)
  );

-- ==================== Tablas que solo tienen paciente_id ====================
-- (EMI/EMP/EMR/vulnerabilidad y consultas no guardan empresa_id directo;
-- se resuelve por el paciente dueño del registro).

ALTER TABLE consultas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON consultas;
CREATE POLICY tenant_isolation ON consultas FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (SELECT 1 FROM pacientes p WHERE p.id = consultas.paciente_id AND p.empresa_id = current_setting('app.current_empresa_id', true)::int)
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (SELECT 1 FROM pacientes p WHERE p.id = consultas.paciente_id AND p.empresa_id = current_setting('app.current_empresa_id', true)::int)
  );

ALTER TABLE emi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON emi;
CREATE POLICY tenant_isolation ON emi FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (SELECT 1 FROM pacientes p WHERE p.id = emi.paciente_id AND p.empresa_id = current_setting('app.current_empresa_id', true)::int)
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (SELECT 1 FROM pacientes p WHERE p.id = emi.paciente_id AND p.empresa_id = current_setting('app.current_empresa_id', true)::int)
  );

ALTER TABLE emp ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON emp;
CREATE POLICY tenant_isolation ON emp FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (SELECT 1 FROM pacientes p WHERE p.id = emp.paciente_id AND p.empresa_id = current_setting('app.current_empresa_id', true)::int)
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (SELECT 1 FROM pacientes p WHERE p.id = emp.paciente_id AND p.empresa_id = current_setting('app.current_empresa_id', true)::int)
  );

ALTER TABLE emr ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON emr;
CREATE POLICY tenant_isolation ON emr FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (SELECT 1 FROM pacientes p WHERE p.id = emr.paciente_id AND p.empresa_id = current_setting('app.current_empresa_id', true)::int)
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (SELECT 1 FROM pacientes p WHERE p.id = emr.paciente_id AND p.empresa_id = current_setting('app.current_empresa_id', true)::int)
  );

ALTER TABLE vulnerabilidad ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON vulnerabilidad;
CREATE POLICY tenant_isolation ON vulnerabilidad FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (SELECT 1 FROM pacientes p WHERE p.id = vulnerabilidad.paciente_id AND p.empresa_id = current_setting('app.current_empresa_id', true)::int)
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR EXISTS (SELECT 1 FROM pacientes p WHERE p.id = vulnerabilidad.paciente_id AND p.empresa_id = current_setting('app.current_empresa_id', true)::int)
  );
