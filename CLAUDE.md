# BO Synergy (WH Management)

Plataforma SaaS de Medicina Laboral, Salud Ocupacional y Seguridad e Higiene
para empresas mexicanas de cualquier tamaño. No es un simple sistema de
historias clínicas: es un ERP de Salud Ocupacional que soporta múltiples
empresas, sedes y especialistas, con aislamiento de datos entre empresas, y
que eventualmente se venderá comercialmente como SaaS.

**Este proyecto ya tiene avance real en código — no lo reinicies desde
cero.** Antes de proponer o construir algo nuevo, lee este documento
completo y, si hace falta más detalle, revisa `backend/server.js`,
`backend/migrations/` y `frontend/src/App.jsx` directamente. No rediseñes
nada que ya funcione sin que te lo pidan explícitamente.

## Estado actual (2026-08-05)

### Arquitectura

- **Frontend**: React + Vite, desplegado en Vercel. Casi toda la app vive en
  un solo archivo, `frontend/src/App.jsx` (~4800 líneas), con estilos
  inline y sin librería de routing (la URL se lee a mano con
  `window.location.pathname.match(...)` para los casos `/login/:slug` y
  `/reset-password/:token`). Componentes reutilizables aparte:
  `Dashboard.jsx`, `BuscadorPaciente.jsx`, `SelectorCIE10.jsx`.
- **Backend**: Express, desplegado en Render. Todo en `backend/server.js`
  (~1600 líneas). Dos pools de Postgres en `backend/database.js`: `pool`
  (rol `postgres`, con `BYPASSRLS`, expuesto como `query`/`queryOne`/
  `queryRun`) usado solo por las 5 rutas públicas, y `poolApp` (rol
  restringido `app_backend`, sin `BYPASSRLS`) usado por todas las rutas
  autenticadas vía `req.db.query`/`req.db.queryOne`/`req.db.queryRun` —
  ver "Aislamiento a nivel de base de datos" abajo. Sin ORM.
- **Base de datos**: Postgres en Supabase. Las migraciones viven en
  `backend/migrations/` como archivos `.sql` numerados (`001` a `013`), y
  se aplican a mano contra producción con un script `node -e` de una sola
  vez — no hay un runner de migraciones. Antes de la convención numerada
  ya existían las tablas base (`pacientes`, `consultas`, `usuarios`)
  creadas directamente en el dashboard de Supabase.
- **Correo**: `backend/emailService.js` (nodemailer/Gmail), usado para
  constancias/recetas/incapacidades en PDF y para el flujo de
  restablecimiento de contraseña.

### Autenticación y aislamiento multiempresa

Hasta hace poco el backend no tenía ninguna autenticación: cualquier ruta
confiaba en el `empresa_id` que mandara el cliente. Esto se corrigió por
completo:

- `POST /api/login` verifica la contraseña con `bcrypt.compare` y emite un
  JWT (`id`, `empresa_id`, `rol`, `es_superadmin`, expira en 12h) firmado
  con `JWT_SECRET` (variable de entorno — debe existir tanto en
  `backend/.env` local como en las variables de entorno de Render; si
  falta, el servidor rehúsa arrancar).
- Casi todas las rutas de datos exigen `requireAuth` y derivan
  `empresa_id`/`rol` **del token**, nunca de lo que mande el cliente
  (`scopeEmpresaId`). El superadmin es la única excepción explícita: puede
  pasar un `empresa_id` distinto al suyo para funciones de soporte (p. ej.
  "Ver detalles" en Gestión de Empresas).
- Las rutas identificadas por `paciente_id` en vez de `empresa_id`
  (consultas, EMI/EMP/EMR, vulnerabilidad, bitácora, incapacidades,
  seguimientos, restricciones, accidentes, alto riesgo) verifican con
  `requirePacienteDeMiEmpresa`/`requireConsultaDeMiEmpresa` que ese
  paciente pertenezca a la empresa del usuario antes de dejar pasar la
  lectura o escritura.
- Mi Agenda fuerza `usuario_id` desde el token (`scopeUsuarioId`): nadie
  puede ver ni editar la agenda de otra persona.
- Rutas públicas (sin `requireAuth`, y así debe seguir): `GET
  /api/empresas/by-slug/:slug`, `POST /api/empresas/solicitar-registro`,
  `POST /api/login`, `POST /api/forgot-password`, `POST
  /api/reset-password`.
- Contraseñas siempre hasheadas con `bcryptjs` en cada punto de escritura
  (alta de usuario, importación Excel, alta de empresa, los 3 flujos de
  reset). Nunca guardar ni comparar contraseñas en texto plano.
- El selector de empresa en el login genérico se probó y se **quitó**
  después: exponía la lista completa de clientes a cualquier visitante.
  El login genérico solo pide Usuario/Contraseña (el `num_empleado` es
  único globalmente, así que no hace falta pedir la empresa para que
  funcione). Los links `/login/:slug` conservan su branding implícito.

### Aislamiento a nivel de base de datos (Row-Level Security)

El aislamiento multiempresa ya no depende solo del código de la
aplicación: Postgres lo aplica también. Esto importaba porque el rol
`postgres` (usado antes para todo) tiene `rolbypassrls: true` — activar
RLS con ese rol no habría protegido nada.

- Rol `app_backend` (sin `BYPASSRLS`, sin ser dueño de las tablas), con
  permisos acotados a las 16 tablas con datos de empresa. Sus
  credenciales viven en `APP_DB_USER`/`APP_DB_PASSWORD` (mismo patrón que
  `DB_USER`/`DB_PASSWORD`, pero con el rol restringido; el usuario tiene
  el formato `app_backend.<project_ref>` por el pooler de Supabase).
  Deben existir tanto en `backend/.env` local como en Render.
- Las 16 tablas (`empresas`, `usuarios`, `asistencias`, `pacientes`,
  `consultas`, `emi`, `emp`, `emr`, `vulnerabilidad`,
  `bitacora_registros`, `incapacidades`, `seguimientos`,
  `restricciones`, `accidentes`, `trabajos_alto_riesgo`,
  `agenda_actividades`) tienen RLS activo (migración
  `010_rls.sql`) con una política `FOR ALL` que compara `empresa_id` (o,
  para las tablas que solo tienen `paciente_id` — consultas, EMI/EMP/EMR,
  vulnerabilidad —, el `empresa_id` del paciente dueño vía subconsulta)
  contra variables de sesión de Postgres, nunca contra lo que mande el
  cliente. `agenda_actividades` además exige que coincida el usuario.
- El middleware `withDbClient` en `server.js` toma una conexión de
  `poolApp` por request, fija ahí `app.current_empresa_id`,
  `app.is_superadmin` y `app.current_usuario_id` a partir del token ya
  verificado, y expone `req.db` para que el handler la use. El
  superadmin bypasea las políticas (`app.is_superadmin = 'true'`), igual
  que a nivel de aplicación.
- Esta capa es un respaldo si algún handler tuviera un bug de filtrado,
  no el mecanismo principal — la autenticación por token sigue siendo la
  primera línea de defensa (ver arriba).

### Módulos construidos (funcionando en producción)

- **Multiempresa**: alta de empresas (por superadmin o autorregistro con
  aprobación), branding por logo/slug, "Mi Empresa", "Ver detalles" por
  empresa (correo, celular, usuarios) para el superadmin.
- **Usuarios y roles**: admin, medico, enfermera, ergonomista,
  nutriologo, psicoterapeuta, más el flag `es_superadmin`. Asistencias
  (reloj checador, se registra en cada login exitoso).
- **Login y recuperación de contraseña**: branding por empresa vía
  `/login/:slug`, "¿Olvidaste tu contraseña?" con token de un solo uso por
  correo (válido 1 hora), reset por admin/superadmin también disponibles.
- **Pacientes/Trabajadores**: alta individual o por Excel; campos incluyen
  NSS, CURP y RFC (buscables); alergias con detalle.
- **Consulta Diaria**: menú EMI / EMP / EMR / Vulnerabilidad, con catálogo
  CIE-10 estático y selector reutilizable (`SelectorCIE10.jsx`).
- **Bitácora, Incapacidades, Seguimiento, Restricciones, Accidentes,
  Trabajo de Alto Riesgo**: cada uno con su formulario, listado con
  filtro por paciente/área/fecha, y adjuntos donde aplica (bucket de
  Supabase Storage vía `POST /api/adjuntos`).
- **Mi Agenda**: calendario mensual con actividades personales
  (reunión/consulta/seguimiento/informe) ligadas al usuario autenticado.
- **Indicadores**: dashboard de estadísticas (`Dashboard.jsx`) — total de
  pacientes/consultas/exámenes, top motivos, top áreas, consultas por
  mes, pacientes por área.
- **NOM-035 (riesgo psicosocial)**: campañas de evaluación por empresa
  (guía I/II/III según tamaño), cuestionario por trabajador agrupado por
  dominio, motor de calificación automático (con reversión de reactivos
  inversos) que categoriza el riesgo por dominio y general, resultado
  agregado (conteos, nunca identificado por nombre) y resultado
  individual para seguimiento clínico, registro de acontecimientos
  traumáticos severos con estado de seguimiento, y plan de acción
  correctivo. **Importante**: el banco de preguntas y las tablas de
  rangos de riesgo (`nom035_preguntas`, `nom035_rangos_riesgo`,
  sembradas en `011_nom035.sql`) son **contenido de ejemplo**, no el
  texto oficial de la Guía de Referencia de la STPS ni sus puntos de
  corte reales (`nom035_preguntas.es_oficial` está en `false`) — son
  datos, no código, precisamente para poder reemplazarlas sin tocar el
  backend.
  No usar este módulo para acreditar cumplimiento real de NOM-035 hasta
  sustituir ese contenido y validarlo con el área legal/de cumplimiento.
- **NOM-036 (riesgo ergonómico — manejo manual de cargas)**: evaluación
  por trabajador (peso de la carga, frecuencia, distancia de transporte,
  postura al levantar, duración de la jornada, y bandera de trabajador en
  condición de vulnerabilidad), motor de calificación automático
  (`calcularPuntajeNom036` en `server.js`) que suma puntos por rango en
  cada factor y categoriza el riesgo (bajo/medio/alto/muy alto), historial
  de evaluaciones por trabajador, y plan de acción correctivo ligado
  opcionalmente a una evaluación específica. **Importante**: tanto los
  puntos de corte por factor en `calcularPuntajeNom036` como las bandas de
  `nom036_rangos_riesgo` (sembradas en `012_nom036.sql`) son **contenido
  de ejemplo**, no las tablas ni límites exactos de los anexos de la STPS
  (NOM-036-1-STPS-2018). No usar este módulo para acreditar cumplimiento
  real de NOM-036 hasta sustituir esos criterios y validarlos con el área
  legal/de cumplimiento.
- **NOM-019 (comisión de seguridad e higiene)**: constitución de la
  comisión mixta (fecha, vigencia, periodicidad de reuniones como texto
  libre), alta de integrantes con representación (trabajador/patronal) y
  cargo (presidente/secretario/vocal) opcionalmente vinculados a un
  expediente de trabajador, registro de reuniones (ordinarias/
  extraordinarias) con acta de asistentes y temas, acuerdos por reunión
  con seguimiento de estatus, y recorridos de verificación por área con
  hallazgos. **Importante**: la periodicidad de reuniones y el
  quórum/composición formal exigidos por la NOM-019-STPS-2011 varían
  según tamaño y nivel de riesgo de la empresa — el sistema no fuerza
  ninguna regla al respecto (son campos libres/configurables). Confirmar
  con el área legal/de cumplimiento antes de tratarlos como obligatorios.

### Lo que NO existe todavía (gaps reales, no inventar que sí)

- **Documentos formales de producto**: nunca se escribió una Fase 1
  (visión, segmentos, métricas de éxito) ni una Fase 2 (arquitectura
  documentada, ERD) como entregables — el sistema se construyó módulo por
  módulo directamente en código.
- **Módulos normativos dedicados**: NOM-030 (servicios de salud en el
  trabajo), NOM-017 (EPP), campañas preventivas, investigación formal de
  accidentes (hoy solo hay un registro/log, no un flujo de
  investigación), vigilancia epidemiológica, y dictámenes de aptitud
  como documento formal (hoy es solo un campo de texto
  `constancia_aptitud` dentro de una consulta). NOM-035, NOM-036 y
  NOM-019 ya tienen infraestructura construida (ver arriba); NOM-035 y
  NOM-036 con contenido/criterios de ejemplo pendientes de sustituir,
  NOM-019 con periodicidad/quórum como campos libres pendientes de
  confirmar — ninguno listo para acreditar cumplimiento real todavía.
- **Copiloto de IA**: no hay ninguna dependencia de IA en `package.json`
  ni código relacionado. Cero funcionalidad de IA implementada.
- **Firma electrónica con trazabilidad**: el único campo "firma" que
  existe es texto libre dentro de Bitácora, no un estándar de firma
  electrónica.
- **Aviso de privacidad / consentimiento / retención (LFPDPPP)**: no
  existe como funcionalidad, solo como intención documentada.
- **Interoperabilidad** (HL7, laboratorios, equipos médicos): no existe.

## Cómo trabajar en este proyecto

- **Workflow de prueba establecido**: para probar cambios de backend
  contra datos reales, apunta temporalmente `API_URL` (en `App.jsx` y en
  `Dashboard.jsx`) a `http://localhost:3000/api`, corre `node server.js`
  en local contra la MISMA base de Supabase de producción (usa las
  credenciales de `backend/.env`), verifica con los datos reales o con
  usuarios/pacientes de prueba que limpies tú mismo al terminar, y
  revierte `API_URL` antes de hacer commit.
- **Migraciones**: crea el archivo numerado en `backend/migrations/`,
  luego aplícalo a mano contra producción con un script `node -e` (no hay
  runner). Confirma con una consulta a `information_schema.columns` (o
  similar) que quedó aplicado antes de seguir.
- **Cambios que afectan autenticación o el esquema de `usuarios`**:
  cualquier cambio en cómo se validan credenciales o tokens puede romper
  el login en producción si el código nuevo se despliega antes/después de
  una migración de datos correspondiente. Encadena migración → commit →
  push lo más rápido posible para minimizar la ventana de inconsistencia,
  y avisa al usuario antes de tocar datos reales de contraseñas/tokens.
- **Variables de entorno nuevas** (como `JWT_SECRET` o
  `APP_DB_USER`/`APP_DB_PASSWORD`) no se pueden configurar solas en
  Render — hay que pedirle al usuario que las agregue en el dashboard de
  Render antes de que el código que las requiere se despliegue, o el
  backend se cae.
- **No renombrar ni quitar campos existentes** sin confirmar: varios
  campos que parecen redundantes (como el `correo`/`celular` de empresa
  vs. el `correo` de cada usuario) son intencionales y ya tienen consumo
  en producción.

## Filosofía de producto (no negociable si se construye algo nuevo)

- **Simplicidad**: debe aprenderse en menos de una hora sin capacitación,
  nivel WhatsApp/Notion/Apple Health. Progressive disclosure, formularios
  tipo wizard en pasos cortos, acciones de un clic para tareas frecuentes,
  máximo 3 clics para cualquier acción importante, selección sobre
  escritura (autocompletado, desplegables, chips), diseño limpio con
  mucho espacio en blanco y rojo reservado solo para alertas.
- **Cumplimiento normativo mexicano**: cada obligación (NOM-019, NOM-030,
  NOM-035, NOM-036, NOM-017, NOM-024, exámenes de ingreso/periódicos/
  cambio de puesto/reingreso/egreso, dictámenes de aptitud, restricciones,
  vigilancia epidemiológica, investigación de accidentes, campañas
  preventivas) debe traducirse en una funcionalidad concreta, no quedar
  como referencia. Si el detalle exacto de una norma es relevante para
  algo crítico, señala explícitamente que es una interpretación que debe
  validarse con el área legal antes de construirse.
- **Datos sensibles y multiempresa**: CURP, RFC, NSS, diagnósticos y
  expedientes son datos sensibles bajo la LFPDPPP. El aislamiento entre
  empresas ya es estructural (autenticación por token + RLS en Postgres,
  ver arriba), no solo una convención de código. Documentos con valor
  legal (dictámenes, incapacidades, recetas) deberían tener firma
  electrónica y trazabilidad cuando se construya esa pieza.
- **Si algún día se construye el copiloto de IA**: toda sugerencia debe
  quedar visualmente marcada como sugerencia (nunca como hecho clínico
  validado), quedar registrada en una bitácora auditable de qué sugirió la
  IA y qué aceptó/modificó/rechazó el profesional, y nada generado por IA
  se guarda en el expediente sin confirmación explícita del profesional.

## Referencia de inspiración (no copiar)

Orpheus, Cority, Intelex, VelocityEHS, Medtra, iSISMA, Notion, Monday,
ClickUp, Linear — el objetivo es un producto más simple e intuitivo que
todos ellos.
