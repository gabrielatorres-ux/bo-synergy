import { useState, useEffect } from 'react';
import axios from 'axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Dashboard from './components/Dashboard';
import * as XLSX from 'xlsx';
import toast, { Toaster } from 'react-hot-toast';
import './App.css';

const api = axios.create();

function App() {
  const [usuario, setUsuario] = useState(null);
  const [numEmpleado, setNumEmpleado] = useState('');
  const [password, setPassword] = useState('');
  const [errorLogin, setErrorLogin] = useState('');
  const [mostrarLogin, setMostrarLogin] = useState(true);
  const [empresaLogin, setEmpresaLogin] = useState(null);
  const [mostrarRegistro, setMostrarRegistro] = useState(false);
  const [registroEnviado, setRegistroEnviado] = useState(false);
  const [registroForm, setRegistroForm] = useState({ nombre: '', correo: '', celular: '', admin_num_empleado: '', admin_nombre: '', admin_password: '' });
  const [registroLogo, setRegistroLogo] = useState(null);
  const [tasasCambio, setTasasCambio] = useState(null);
  const [pacientes, setPacientes] = useState([]);
  const [busquedaPaciente, setBusquedaPaciente] = useState('');
  const [paginaPacientes, setPaginaPacientes] = useState(1);
  const [totalPaginasPacientes, setTotalPaginasPacientes] = useState(1);
  const [formData, setFormData] = useState({
    num_empleado: '',
    nombre: '',
    fecha_nac: '',
    nss: '',
    contacto_emergencia: '',
    puesto: '',
    area: '',
    supervisor: ''
  });
  const [usuarios, setUsuarios] = useState([]);
  const [asistencias, setAsistencias] = useState([]);
  const [nuevoUsuario, setNuevoUsuario] = useState({
    num_empleado: '',
    nombre: '',
    rol: 'medico',
    password: ''
  });
  const [mensajeUsuario, setMensajeUsuario] = useState('');

  const [empresas, setEmpresas] = useState([]);
  const [nuevaEmpresaNombre, setNuevaEmpresaNombre] = useState('');
  const [nuevaEmpresaLogo, setNuevaEmpresaLogo] = useState(null);
  const [nuevaEmpresaAdmin, setNuevaEmpresaAdmin] = useState({ num_empleado: '', nombre: '', password: '' });
  const [soporteReset, setSoporteReset] = useState({ num_empleado: '', password: '' });
  const [miEmpresaNombre, setMiEmpresaNombre] = useState('');
  const [miEmpresaLogo, setMiEmpresaLogo] = useState(null);

  const [mostrarConsulta, setMostrarConsulta] = useState(false);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
  const [consultaForm, setConsultaForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    motivo: '',
    alergias: 'no',
    cabeza: '',
    cuello: '',
    torax: '',
    abdomen: '',
    espalda: '',
    extremidades_superiores: '',
    extremidades_inferiores: '',
    ojos_oidos_garganta: '',
    causa: '',
    impresion_diagnostica: '',
    medicamentos: '',
    receta: '',
    cie10: ''
  });
  const [mensajeConsulta, setMensajeConsulta] = useState('');
  const [consultasPaciente, setConsultasPaciente] = useState([]);
  const [pacienteEditando, setPacienteEditando] = useState(null);
  const [mostrarModalEditar, setMostrarModalEditar] = useState(false);
  const [consultaEditando, setConsultaEditando] = useState(null);
  const [mostrarModalEditarConsulta, setMostrarModalEditarConsulta] = useState(false);

  const [mostrarExamen, setMostrarExamen] = useState(false);
  const [tipoExamen, setTipoExamen] = useState('');
  const [examenForm, setExamenForm] = useState({});
  const [examenesPaciente, setExamenesPaciente] = useState([]);
  const [mensajeExamen, setMensajeExamen] = useState('');

  const API_URL = 'https://bo-synergy-backend.onrender.com/api';

  // Si la URL es /login/:slug, muestra el logo/nombre de esa empresa en
  // la pantalla de login (antes de autenticar, cuando aún no sabemos
  // quién es el usuario).
  useEffect(() => {
    const match = window.location.pathname.match(/^\/login\/([a-z0-9-]+)$/i);
    if (!match) return;
    axios.get(`${API_URL}/empresas/by-slug/${match[1]}`)
      .then((response) => setEmpresaLogin(response.data))
      .catch(() => setEmpresaLogin(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tipo de cambio en vivo para mostrar los planes en COP/USD además de
  // MXN. Si la API externa falla, se usa un aproximado como respaldo.
  useEffect(() => {
    if (!mostrarRegistro || tasasCambio) return;
    axios.get('https://open.er-api.com/v6/latest/MXN')
      .then((response) => {
        const rates = response.data?.rates;
        if (rates?.USD && rates?.COP) {
          setTasasCambio({ usd: rates.USD, cop: rates.COP });
        } else {
          setTasasCambio({ usd: 0.055, cop: 220 });
        }
      })
      .catch(() => setTasasCambio({ usd: 0.055, cop: 220 }));
  }, [mostrarRegistro, tasasCambio]);

  // Agrega automáticamente el empresa_id del usuario logueado a cada
  // petición, para que el backend filtre los datos de esa empresa.
  useEffect(() => {
    const interceptorId = api.interceptors.request.use((config) => {
      const empresaId = usuario?.empresa_id;
      if (!empresaId) return config;
      if (config.data instanceof FormData) {
        config.data.append('empresa_id', empresaId);
      } else if (config.method === 'get' || config.method === 'delete') {
        config.params = { ...config.params, empresa_id: empresaId };
      } else {
        config.data = { ...(config.data || {}), empresa_id: empresaId };
      }
      return config;
    });
    return () => api.interceptors.request.eject(interceptorId);
  }, [usuario]);

  // Carga los datos iniciales una vez que el interceptor de arriba ya
  // conoce el empresa_id del usuario logueado (por eso va en un efecto
  // aparte en vez de llamarse directo dentro de handleLogin).
  useEffect(() => {
    if (!usuario) return;
    cargarPacientes(1, '');
    if (usuario.rol === 'admin') {
      cargarUsuarios();
      cargarAsistencias();
    }
    if (usuario.es_superadmin) {
      cargarEmpresas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id]);

  // ===== FUNCIONES DE LOGIN =====
  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorLogin('');
    try {
      const response = await api.post(`${API_URL}/login`, {
        num_empleado: numEmpleado,
        password: password
      });
      if (response.data.success) {
        setUsuario(response.data.user);
        setMostrarLogin(false);
        setNumEmpleado('');
        setPassword('');
      }
    } catch (error) {
      if (error.response) {
        setErrorLogin(error.response.data.error || 'Error al iniciar sesión');
      } else {
        setErrorLogin('Error de conexión con el servidor');
      }
    }
  };

  const handleSolicitarRegistro = async (e) => {
    e.preventDefault();
    try {
      const data = new FormData();
      data.append('nombre', registroForm.nombre);
      data.append('correo', registroForm.correo);
      data.append('celular', registroForm.celular);
      data.append('admin_num_empleado', registroForm.admin_num_empleado);
      data.append('admin_nombre', registroForm.admin_nombre);
      data.append('admin_password', registroForm.admin_password);
      if (registroLogo) data.append('logo', registroLogo);
      await axios.post(`${API_URL}/empresas/solicitar-registro`, data);
      setRegistroEnviado(true);
    } catch (error) {
      toast.error(`${error.response?.data?.error || 'Error al enviar la solicitud'}`);
    }
  };

  const handleLogout = () => {
    setUsuario(null);
    setMostrarLogin(true);
    setPacientes([]);
    setUsuarios([]);
    setConsultasPaciente([]);
    setExamenesPaciente([]);
  };

  // ===== FUNCIONES DE PACIENTES =====
  const cargarPacientes = async (page = 1, search = busquedaPaciente) => {
    try {
      const response = await api.get(`${API_URL}/pacientes`, {
        params: { page, limit: 20, search }
      });
      setPacientes(response.data.pacientes);
      setPaginaPacientes(response.data.page);
      setTotalPaginasPacientes(response.data.totalPages);
    } catch (error) {
      console.error('Error al cargar pacientes:', error);
    }
  };

  useEffect(() => {
    if (!usuario) return;
    const timeoutId = setTimeout(() => {
      cargarPacientes(1, busquedaPaciente);
    }, 400);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaPaciente]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`${API_URL}/pacientes`, formData);
      toast.success('Paciente agregado');
      setFormData({
        num_empleado: '',
        nombre: '',
        fecha_nac: '',
        nss: '',
        contacto_emergencia: '',
        puesto: '',
        area: '',
        supervisor: ''
      });
      cargarPacientes(paginaPacientes);
    } catch (error) {
      toast.error('Error al agregar paciente');
      console.error(error);
    }
  };

  const handleEliminarPaciente = async (id, nombre) => {
    if (!confirm(`¿Estás seguro de eliminar al paciente ${nombre}?`)) return;
    try {
      await api.delete(`${API_URL}/pacientes/${id}`);
      toast.success('Paciente eliminado correctamente');
      cargarPacientes(paginaPacientes);
    } catch (error) {
      toast.error('Error al eliminar paciente');
    }
  };

  const handleEditarPaciente = (paciente) => {
    setPacienteEditando(paciente);
    setFormData({
      num_empleado: paciente.num_empleado,
      nombre: paciente.nombre,
      fecha_nac: paciente.fecha_nac || '',
      nss: paciente.nss || '',
      contacto_emergencia: paciente.contacto_emergencia || '',
      puesto: paciente.puesto || '',
      area: paciente.area || '',
      supervisor: paciente.supervisor || ''
    });
    setMostrarModalEditar(true);
  };

  const handleActualizarPaciente = async (e) => {
    e.preventDefault();
    try {
      await api.put(`${API_URL}/pacientes/${pacienteEditando.id}`, formData);
      toast.success('Paciente actualizado correctamente');
      setMostrarModalEditar(false);
      setPacienteEditando(null);
      setFormData({
        num_empleado: '',
        nombre: '',
        fecha_nac: '',
        nss: '',
        contacto_emergencia: '',
        puesto: '',
        area: '',
        supervisor: ''
      });
      cargarPacientes(paginaPacientes);
    } catch (error) {
      toast.error('Error al actualizar paciente');
    }
  };

  // ===== FUNCIONES DE USUARIOS =====
  const cargarUsuarios = async () => {
    try {
      const response = await api.get(`${API_URL}/usuarios`);
      setUsuarios(response.data);
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
    }
  };

  const cargarAsistencias = async () => {
    try {
      const response = await api.get(`${API_URL}/asistencias`);
      setAsistencias(response.data);
    } catch (error) {
      console.error('Error al cargar asistencias:', error);
    }
  };

  const handleCrearUsuario = async (e) => {
    e.preventDefault();
    setMensajeUsuario('');
    try {
      const response = await api.post(`${API_URL}/usuarios`, nuevoUsuario);
      toast.success(`Usuario ${nuevoUsuario.nombre} creado correctamente`);
      setMensajeUsuario(`${response.data.message}`);
      setNuevoUsuario({
        num_empleado: '',
        nombre: '',
        rol: 'medico',
        password: ''
      });
      cargarUsuarios();
    } catch (error) {
      toast.error('Error al crear usuario');
      if (error.response) {
        setMensajeUsuario(`${error.response.data.error}`);
      } else {
        setMensajeUsuario('Error al crear usuario');
      }
    }
  };

  const handleEliminarUsuario = async (id, numEmpleado) => {
    if (numEmpleado === 'ADMIN001') {
      toast.error('No se puede eliminar al administrador principal');
      return;
    }
    if (!confirm(`¿Eliminar al usuario ${numEmpleado}?`)) return;
    try {
      await api.delete(`${API_URL}/usuarios/${id}`);
      setMensajeUsuario('Usuario eliminado correctamente');
      cargarUsuarios();
    } catch (error) {
      if (error.response) {
        setMensajeUsuario(`${error.response.data.error}`);
      } else {
        setMensajeUsuario('Error al eliminar usuario');
      }
    }
  };

  const handleResetearPassword = async (id, numEmpleado) => {
    const nuevaPassword = prompt(`Nueva contraseña para ${numEmpleado}:`);
    if (!nuevaPassword) return;
    try {
      await api.patch(`${API_URL}/usuarios/${id}/resetear-password`, { nueva_password: nuevaPassword });
      toast.success(`Contraseña de ${numEmpleado} actualizada`);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al restablecer la contraseña');
    }
  };

  const handleCambioUsuario = (e) => {
    setNuevoUsuario({
      ...nuevoUsuario,
      [e.target.name]: e.target.value
    });
  };

  // ===== FUNCIONES DE EMPRESAS =====
  const cargarEmpresas = async () => {
    try {
      const response = await api.get(`${API_URL}/empresas`);
      setEmpresas(response.data);
    } catch (error) {
      console.error('Error al cargar empresas:', error);
    }
  };

  const handleCrearEmpresa = async (e) => {
    e.preventDefault();
    try {
      const data = new FormData();
      data.append('nombre', nuevaEmpresaNombre);
      data.append('admin_num_empleado', nuevaEmpresaAdmin.num_empleado);
      data.append('admin_nombre', nuevaEmpresaAdmin.nombre);
      data.append('admin_password', nuevaEmpresaAdmin.password);
      if (nuevaEmpresaLogo) data.append('logo', nuevaEmpresaLogo);
      await api.post(`${API_URL}/empresas`, data);
      toast.success('Empresa y administrador creados correctamente');
      setNuevaEmpresaNombre('');
      setNuevaEmpresaLogo(null);
      setNuevaEmpresaAdmin({ num_empleado: '', nombre: '', password: '' });
      cargarEmpresas();
    } catch (error) {
      toast.error(`${error.response?.data?.error || 'Error al crear empresa'}`);
    }
  };

  const handleAprobarEmpresa = async (id) => {
    try {
      await api.patch(`${API_URL}/empresas/${id}/aprobar`);
      toast.success('Empresa aprobada correctamente');
      cargarEmpresas();
    } catch (error) {
      toast.error('Error al aprobar empresa');
    }
  };

  const handleEliminarEmpresa = async (id, nombre) => {
    if (!confirm(`¿Estás seguro de eliminar la empresa ${nombre}? Esto también elimina a sus usuarios.`)) return;
    try {
      await api.delete(`${API_URL}/empresas/${id}`);
      toast.success('Empresa eliminada correctamente');
      cargarEmpresas();
    } catch (error) {
      toast.error(`${error.response?.data?.error || 'Error al eliminar empresa'}`);
    }
  };

  const handleResetearPasswordSoporte = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`${API_URL}/usuarios/resetear-password-admin`, {
        num_empleado: soporteReset.num_empleado,
        nueva_password: soporteReset.password
      });
      toast.success(`Contraseña de ${soporteReset.num_empleado} actualizada`);
      setSoporteReset({ num_empleado: '', password: '' });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al restablecer la contraseña');
    }
  };

  const handleActualizarMiEmpresa = async (e) => {
    e.preventDefault();
    try {
      const data = new FormData();
      data.append('nombre', miEmpresaNombre || usuario.empresa_nombre);
      if (miEmpresaLogo) data.append('logo', miEmpresaLogo);
      await api.put(`${API_URL}/empresas/${usuario.empresa_id}`, data);
      toast.success('Empresa actualizada. Cierra sesión y vuelve a entrar para ver los cambios reflejados.');
      setMiEmpresaLogo(null);
    } catch (error) {
      toast.error('Error al actualizar tu empresa');
    }
  };

  // ===== FUNCIONES DE CONSULTAS =====
  const handleAbrirConsulta = async (paciente) => {
    setPacienteSeleccionado(paciente);
    setMostrarConsulta(true);
    setMensajeConsulta('');
    try {
      const response = await api.get(`${API_URL}/consultas/${paciente.id}`);
      setConsultasPaciente(response.data);
    } catch (error) {
      console.error('Error al cargar consultas:', error);
    }
  };

  const handleCerrarConsulta = () => {
    setMostrarConsulta(false);
    setPacienteSeleccionado(null);
    setConsultaForm({
      fecha: new Date().toISOString().split('T')[0],
      motivo: '',
      alergias: 'no',
      cabeza: '',
      cuello: '',
      torax: '',
      abdomen: '',
      espalda: '',
      extremidades_superiores: '',
      extremidades_inferiores: '',
      ojos_oidos_garganta: '',
      causa: '',
      impresion_diagnostica: '',
      medicamentos: '',
      receta: '',
      cie10: ''
    });
    setConsultasPaciente([]);
  };

  const handleChangeConsulta = (e) => {
    setConsultaForm({
      ...consultaForm,
      [e.target.name]: e.target.value
    });
  };

  const handleGuardarConsulta = async (e) => {
    e.preventDefault();
    try {
      await api.post(`${API_URL}/consultas`, {
        ...consultaForm,
        paciente_id: pacienteSeleccionado.id
      });
      setMensajeConsulta('Consulta registrada correctamente');
      const response = await api.get(`${API_URL}/consultas/${pacienteSeleccionado.id}`);
      setConsultasPaciente(response.data);
      setConsultaForm({
        fecha: new Date().toISOString().split('T')[0],
        motivo: '',
        alergias: 'no',
        cabeza: '',
        cuello: '',
        torax: '',
        abdomen: '',
        espalda: '',
        extremidades_superiores: '',
        extremidades_inferiores: '',
        ojos_oidos_garganta: '',
        causa: '',
        impresion_diagnostica: '',
        medicamentos: '',
        receta: '',
        cie10: ''
      });
    } catch (error) {
      setMensajeConsulta('Error al registrar consulta');
      console.error(error);
    }
  };

  const handleEliminarConsulta = async (id) => {
    if (!confirm(`¿Eliminar esta consulta?`)) return;
    try {
      await api.delete(`${API_URL}/consultas/${id}`);
      toast.success('Consulta eliminada correctamente');
      const response = await api.get(`${API_URL}/consultas/${pacienteSeleccionado.id}`);
      setConsultasPaciente(response.data);
    } catch (error) {
      toast.error('Error al eliminar consulta');
    }
  };

  const handleEditarConsulta = (consulta) => {
    setConsultaEditando(consulta);
    setConsultaForm({
      fecha: consulta.fecha || new Date().toISOString().split('T')[0],
      motivo: consulta.motivo || '',
      alergias: consulta.alergias || 'no',
      cabeza: consulta.cabeza || '',
      cuello: consulta.cuello || '',
      torax: consulta.torax || '',
      abdomen: consulta.abdomen || '',
      espalda: consulta.espalda || '',
      extremidades_superiores: consulta.extremidades_superiores || '',
      extremidades_inferiores: consulta.extremidades_inferiores || '',
      ojos_oidos_garganta: consulta.ojos_oidos_garganta || '',
      causa: consulta.causa || '',
      impresion_diagnostica: consulta.impresion_diagnostica || '',
      medicamentos: consulta.medicamentos || '',
      receta: consulta.receta || '',
      cie10: consulta.cie10 || ''
    });
    setMostrarModalEditarConsulta(true);
  };

  const handleActualizarConsulta = async (e) => {
    e.preventDefault();
    try {
      await api.put(`${API_URL}/consultas/${consultaEditando.id}`, {
        ...consultaForm,
        paciente_id: pacienteSeleccionado.id
      });
      toast.success('Consulta actualizada correctamente');
      setMostrarModalEditarConsulta(false);
      setConsultaEditando(null);
      const response = await api.get(`${API_URL}/consultas/${pacienteSeleccionado.id}`);
      setConsultasPaciente(response.data);
      setConsultaForm({
        fecha: new Date().toISOString().split('T')[0],
        motivo: '',
        alergias: 'no',
        cabeza: '',
        cuello: '',
        torax: '',
        abdomen: '',
        espalda: '',
        extremidades_superiores: '',
        extremidades_inferiores: '',
        ojos_oidos_garganta: '',
        causa: '',
        impresion_diagnostica: '',
        medicamentos: '',
        receta: '',
        cie10: ''
      });
    } catch (error) {
      toast.error('Error al actualizar consulta');
    }
  };

  // ===== FUNCIONES DE EXÁMENES =====
  const handleAbrirExamen = async (tipo, paciente) => {
    setPacienteSeleccionado(paciente);
    setTipoExamen(tipo);
    setMostrarExamen(true);
    setMensajeExamen('');
    
    const baseForm = {
      fecha: new Date().toISOString().split('T')[0],
      impresion_diagnostica: '',
      cie10: '',
      exploracion_fisica: '',
      signos_vitales: '',
      agudeza_visual: ''
    };

    let formFields = {};
    switch(tipo) {
      case 'emi':
        formFields = {
          ...baseForm,
          exposicion_riesgos: '',
          trabajos_previos: '',
          riesgos_laborales: '',
          accidentes_previos: '',
          enfermedades_laborales: '',
          antecedentes_familiares: '',
          antecedentes_personales_no_patologicos: '',
          antecedentes_personales_patologicos: '',
          interrogatorio_aparatos: '',
          constancia_aptitud: ''
        };
        break;
      case 'emp':
        formFields = {
          ...baseForm,
          exposicion_auditiva: '',
          exposicion_respiratoria: '',
          exposicion_movimientos_repetitivos: '',
          exposicion_postural: '',
          exposicion_cargas_manuales: '',
          exposicion_visual: '',
          exposicion_psicosocial: '',
          exposicion_trabajos_alto_riesgo: '',
          interrogatorio_aparatos: '',
          solicitud_reubicacion: ''
        };
        break;
      case 'emr':
        formFields = {
          ...baseForm,
          secuelas_auditiva: '',
          secuelas_respiratoria: '',
          secuelas_motriz: '',
          secuelas_pensamiento: '',
          secuelas_fuerza: '',
          secuelas_neurologica: '',
          secuelas_psicosocial: '',
          secuelas_visual: '',
          interrogatorio_aparatos: '',
          recomendaciones_reingreso: ''
        };
        break;
      case 'vulnerabilidad':
        formFields = {
          ...baseForm,
          tipo_vulnerabilidad: '',
          embarazo: '',
          cronico_degenerativa: '',
          hepato_renal: '',
          cardiologica: '',
          dermatologica: '',
          hematologica: ''
        };
        break;
      default:
        formFields = baseForm;
    }
    setExamenForm(formFields);

    try {
      const response = await api.get(`${API_URL}/${tipo}/${paciente.id}`);
      setExamenesPaciente(response.data);
    } catch (error) {
      console.error(`Error al cargar ${tipo}:`, error);
    }
  };

  const handleCerrarExamen = () => {
    setMostrarExamen(false);
    setPacienteSeleccionado(null);
    setTipoExamen('');
    setExamenForm({});
    setExamenesPaciente([]);
  };

  const handleChangeExamen = (e) => {
    setExamenForm({
      ...examenForm,
      [e.target.name]: e.target.value
    });
  };

  const handleGuardarExamen = async (e) => {
    e.preventDefault();
    try {
      await api.post(`${API_URL}/${tipoExamen}`, {
        ...examenForm,
        paciente_id: pacienteSeleccionado.id
      });
      setMensajeExamen(`${tipoExamen.toUpperCase()} registrado correctamente`);
      const response = await api.get(`${API_URL}/${tipoExamen}/${pacienteSeleccionado.id}`);
      setExamenesPaciente(response.data);
      setExamenForm({
        fecha: new Date().toISOString().split('T')[0],
        impresion_diagnostica: '',
        cie10: '',
        exploracion_fisica: '',
        signos_vitales: '',
        agudeza_visual: ''
      });
    } catch (error) {
      setMensajeExamen(`Error al registrar ${tipoExamen.toUpperCase()}`);
      console.error(error);
    }
  };

  // ===== FUNCIONES DE PDFs =====
  const generarConstanciaPDF = (consulta, paciente) => {
    const doc = new jsPDF();
    const fecha = new Date().toLocaleDateString('es-MX');
    
    doc.setFontSize(18);
    doc.text(`${usuario?.empresa_nombre || 'WH Management'}`, 105, 20, { align: 'center' });
    doc.setFontSize(14);
    doc.text('CONSTANCIA DE CONSULTA', 105, 30, { align: 'center' });
    doc.line(20, 35, 190, 35);
    
    doc.setFontSize(12);
    doc.text(`Fecha: ${fecha}`, 20, 45);
    doc.text(`Paciente: ${paciente.nombre}`, 20, 55);
    doc.text(`Número de Empleado: ${paciente.num_empleado}`, 20, 65);
    doc.text(`Área: ${paciente.area || 'No especificada'}`, 20, 75);
    doc.text(`Puesto: ${paciente.puesto || 'No especificado'}`, 20, 85);
    
    doc.text('---', 20, 95);
    doc.setFontSize(14);
    doc.text('Detalles de la Consulta', 20, 105);
    doc.setFontSize(12);
    doc.text(`Motivo: ${consulta.motivo || 'No especificado'}`, 20, 115);
    
    const sintomas = [
      consulta.cabeza && `Cabeza: ${consulta.cabeza}`,
      consulta.cuello && `Cuello: ${consulta.cuello}`,
      consulta.torax && `Tórax: ${consulta.torax}`,
      consulta.abdomen && `Abdomen: ${consulta.abdomen}`,
      consulta.espalda && `Espalda: ${consulta.espalda}`,
      consulta.extremidades_superiores && `Extremidades Superiores: ${consulta.extremidades_superiores}`,
      consulta.extremidades_inferiores && `Extremidades Inferiores: ${consulta.extremidades_inferiores}`,
      consulta.ojos_oidos_garganta && `Ojos/Oídos/Garganta: ${consulta.ojos_oidos_garganta}`
    ].filter(Boolean);
    
    let yPos = 125;
    sintomas.forEach(s => {
      doc.text(`• ${s}`, 25, yPos);
      yPos += 8;
    });
    
    if (consulta.causa) {
      doc.text(`Causa probable: ${consulta.causa}`, 20, yPos + 5);
      yPos += 12;
    }
    
    doc.text('---', 20, yPos + 5);
    doc.setFontSize(14);
    doc.text('Diagnóstico y Tratamiento', 20, yPos + 18);
    doc.setFontSize(12);
    doc.text(`Impresión Diagnóstica: ${consulta.impresion_diagnostica || 'Pendiente'}`, 20, yPos + 30);
    if (consulta.cie10) {
      doc.text(`CIE-10: ${consulta.cie10}`, 20, yPos + 40);
    }
    if (consulta.medicamentos) {
      doc.text(`Medicamentos: ${consulta.medicamentos}`, 20, yPos + 50);
    }
    if (consulta.receta) {
      doc.text(`Receta: ${consulta.receta}`, 20, yPos + 60);
    }
    
    doc.text('---', 20, yPos + 72);
    doc.setFontSize(10);
    doc.text(`Este documento es una constancia de la consulta realizada en ${usuario?.empresa_nombre || 'WH Management'}.`, 20, yPos + 85);
    doc.text('Atentamente,', 20, yPos + 95);
    doc.text('_________________________', 20, yPos + 105);
    doc.text('Médico Responsable', 20, yPos + 115);
    
    doc.save(`Constancia_${paciente.nombre}_${consulta.fecha}.pdf`);
  };

  const generarRecetaPDF = (consulta, paciente) => {
    const doc = new jsPDF();
    const fecha = new Date().toLocaleDateString('es-MX');

    doc.setFontSize(20);
    doc.text(`${usuario?.empresa_nombre || 'WH Management'}`, 105, 20, { align: 'center' });
    doc.setFontSize(16);
    doc.text('R E C E T A   M É D I C A', 105, 30, { align: 'center' });
    doc.line(20, 35, 190, 35);

    doc.setFontSize(12);
    doc.text(`Fecha: ${fecha}`, 20, 45);
    doc.text(`Paciente: ${paciente.nombre}`, 20, 55);
    doc.text(`Número de Empleado: ${paciente.num_empleado}`, 20, 65);
    doc.text(`Área: ${paciente.area || 'No especificada'}`, 20, 75);

    doc.text('---', 20, 88);
    doc.setFontSize(14);
    doc.text('Medicamentos Recetados:', 20, 100);
    doc.setFontSize(12);

    const medicamentos = (consulta.medicamentos && typeof consulta.medicamentos === 'string')
  ? consulta.medicamentos.split(',').map(m => m.trim())
  : ['No se recetaron medicamentos'];

    let yPos = 110;
    medicamentos.forEach((med, i) => {
      doc.text(`${i + 1}. ${med}`, 25, yPos);
      yPos += 10;
    });
    
    if (consulta.receta) {
      doc.text(`Número de Receta: ${consulta.receta}`, 20, yPos + 10);
    }
    
    doc.text('---', 20, yPos + 25);
    doc.text(`Diagnóstico: ${consulta.impresion_diagnostica || 'No especificado'}`, 20, yPos + 38);
    if (consulta.cie10) {
      doc.text(`CIE-10: ${consulta.cie10}`, 20, yPos + 48);
    }
    
    doc.text('---', 20, yPos + 60);
    doc.setFontSize(10);
    doc.text('Válido por 30 días a partir de la fecha de emisión.', 20, yPos + 72);
    doc.text('_________________________', 20, yPos + 85);
    doc.text('Firma del Médico', 20, yPos + 95);
    
    doc.save(`Receta_${paciente.nombre}_${consulta.fecha}.pdf`);
  };

  const generarIncapacidadPDF = (consulta, paciente) => {
    const doc = new jsPDF();
    const fecha = new Date().toLocaleDateString('es-MX');
    
    doc.setFontSize(18);
    doc.text(`${usuario?.empresa_nombre || 'WH Management'}`, 105, 20, { align: 'center' });
    doc.setFontSize(14);
    doc.text('REPORTE DE INCAPACIDAD', 105, 30, { align: 'center' });
    doc.line(20, 35, 190, 35);
    
    doc.setFontSize(12);
    doc.text(`Fecha de Emisión: ${fecha}`, 20, 45);
    doc.text(`Paciente: ${paciente.nombre}`, 20, 55);
    doc.text(`Número de Empleado: ${paciente.num_empleado}`, 20, 65);
    doc.text(`Área: ${paciente.area || 'No especificada'}`, 20, 75);
    doc.text(`Puesto: ${paciente.puesto || 'No especificado'}`, 20, 85);
    
    doc.text('---', 20, 95);
    doc.setFontSize(14);
    doc.text('Detalles de la Incapacidad', 20, 105);
    doc.setFontSize(12);
    doc.text(`Motivo: ${consulta.motivo || 'No especificado'}`, 20, 115);
    doc.text(`Diagnóstico: ${consulta.impresion_diagnostica || 'Pendiente'}`, 20, 125);
    if (consulta.cie10) {
      doc.text(`CIE-10: ${consulta.cie10}`, 20, 135);
    }
    
    doc.text('---', 20, 148);
    doc.setFontSize(10);
    doc.text('El paciente presenta incapacidad para realizar sus actividades laborales.', 20, 160);
    doc.text('Se recomienda reposo y seguimiento médico.', 20, 170);
    doc.text('_________________________', 20, 185);
    doc.text('Médico Responsable', 20, 195);
    
    doc.save(`Incapacidad_${paciente.nombre}_${consulta.fecha}.pdf`);
  };

  // ===== FUNCIONES DE EXPORTACIÓN A EXCEL =====
  const exportarPacientesExcel = async () => {
    let pacientesAExportar;
    try {
      const response = await api.get(`${API_URL}/pacientes`, {
        params: { page: 1, limit: 100000, search: busquedaPaciente }
      });
      pacientesAExportar = response.data.pacientes;
    } catch (error) {
      toast.error('Error al obtener pacientes para exportar');
      return;
    }

    if (pacientesAExportar.length === 0) {
      toast.error('No hay pacientes para exportar');
      return;
    }

    const datos = pacientesAExportar.map(p => ({
      'N° Empleado': p.num_empleado,
      'Nombre': p.nombre,
      'Fecha Nacimiento': p.fecha_nac || '',
      'NSS': p.nss || '',
      'Contacto Emergencia': p.contacto_emergencia || '',
      'Puesto': p.puesto || '',
      'Área': p.area || '',
      'Supervisor': p.supervisor || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(datos);
    XLSX.utils.book_append_sheet(wb, ws, 'Pacientes');
    
    const colWidths = [
      { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 15 },
      { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 20 }
    ];
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `Pacientes_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(`${pacientesAExportar.length} pacientes exportados correctamente`);
  };

  const exportarConsultasExcel = () => {
    if (consultasPaciente.length === 0) {
      toast.error('No hay consultas para exportar');
      return;
    }

    const datos = consultasPaciente.map(c => ({
      'Fecha': c.fecha || '',
      'Motivo': c.motivo || '',
      'Alergias': c.alergias || 'No',
      'Cabeza': c.cabeza || '',
      'Cuello': c.cuello || '',
      'Tórax': c.torax || '',
      'Abdomen': c.abdomen || '',
      'Espalda': c.espalda || '',
      'Extremidades Superiores': c.extremidades_superiores || '',
      'Extremidades Inferiores': c.extremidades_inferiores || '',
      'Ojos/Oídos/Garganta': c.ojos_oidos_garganta || '',
      'Causa': c.causa || '',
      'Diagnóstico': c.impresion_diagnostica || '',
      'Medicamentos': c.medicamentos || '',
      'Receta': c.receta || '',
      'CIE-10': c.cie10 || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(datos);
    XLSX.utils.book_append_sheet(wb, ws, 'Consultas');
    
    const colWidths = [
      { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 20 }, { wch: 20 },
      { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 25 },
      { wch: 25 }, { wch: 30 }, { wch: 30 }, { wch: 25 }, { wch: 20 }, { wch: 15 }
    ];
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `Consultas_${pacienteSeleccionado?.nombre || 'paciente'}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(`${consultasPaciente.length} consultas exportadas correctamente`);
  };

  const exportarEstadisticasExcel = async () => {
    try {
      const [statsRes, motivosRes, areasRes, pacientesAreaRes] = await Promise.all([
        api.get(`${API_URL}/estadisticas`),
        api.get(`${API_URL}/top-motivos`),
        api.get(`${API_URL}/top-areas`),
        api.get(`${API_URL}/pacientes-por-area`),
      ]);

      const stats = statsRes.data;
      const motivos = motivosRes.data;
      const areas = areasRes.data;
      const pacientesArea = pacientesAreaRes.data;

      const wb = XLSX.utils.book_new();

      const resumenData = [
        ['RESUMEN DE ESTADÍSTICAS'],
        [''],
        ['Métrica', 'Valor'],
        ['Total Pacientes', stats.totalPacientes || 0],
        ['Total Consultas', stats.totalConsultas || 0],
        ['Total EMI', stats.totalEMI || 0],
        ['Total EMP', stats.totalEMP || 0],
        ['Total EMR', stats.totalEMR || 0],
        ['Total Vulnerabilidades', stats.totalVulnerabilidad || 0],
        ['Total Exámenes', (stats.totalEMI || 0) + (stats.totalEMP || 0) + (stats.totalEMR || 0)],
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(resumenData);
      XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');

      if (motivos.length > 0) {
        const motivosData = [
          ['TOP 5 MOTIVOS DE CONSULTA'],
          [''],
          ['Motivo', 'Cantidad']
        ];
        motivos.forEach(m => {
          motivosData.push([m.motivo, m.count]);
        });
        const ws2 = XLSX.utils.aoa_to_sheet(motivosData);
        XLSX.utils.book_append_sheet(wb, ws2, 'Top Motivos');
      }

      if (areas.length > 0) {
        const areasData = [
          ['TOP 5 ÁREAS CONSULTANTES'],
          [''],
          ['Área', 'Cantidad']
        ];
        areas.forEach(a => {
          areasData.push([a.area, a.count]);
        });
        const ws3 = XLSX.utils.aoa_to_sheet(areasData);
        XLSX.utils.book_append_sheet(wb, ws3, 'Top Áreas');
      }

      if (pacientesArea.length > 0) {
        const pacientesAreaData = [
          ['PACIENTES POR ÁREA'],
          [''],
          ['Área', 'Cantidad']
        ];
        pacientesArea.forEach(a => {
          pacientesAreaData.push([a.area, a.count]);
        });
        const ws4 = XLSX.utils.aoa_to_sheet(pacientesAreaData);
        XLSX.utils.book_append_sheet(wb, ws4, 'Pacientes por Área');
      }

      XLSX.writeFile(wb, `Estadisticas_BO_Synergy_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Estadísticas exportadas correctamente');
    } catch (error) {
      console.error('Error al exportar estadísticas:', error);
      toast.error('Error al exportar estadísticas');
    }
  };

  const exportarUsuariosExcel = () => {
    if (usuarios.length === 0) {
      toast.error('No hay usuarios para exportar');
      return;
    }

    const datos = usuarios.map(u => ({
      'N° Empleado': u.num_empleado,
      'Nombre': u.nombre,
      'Rol': u.rol === 'admin' ? 'Administrador' : u.rol === 'medico' ? 'Médico' : 'Enfermera',
      'Fecha Registro': new Date(u.fecha_registro).toLocaleDateString('es-MX')
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(datos);
    XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
    
    const colWidths = [
      { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 20 }
    ];
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `Usuarios_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(`${usuarios.length} usuarios exportados correctamente`);
  };

    // ===== FUNCIONES DE ENVÍO DE CORREOS =====
    const enviarCorreoPDF = async (consulta, paciente, tipo) => {
    const destinatario = prompt('Ingresa el correo electrónico del destinatario:');
    if (!destinatario) return;
    
    if (!destinatario.includes('@') || !destinatario.includes('.')) {
      toast.error('Correo electrónico inválido');
      return;
    }

    try {
      const doc = new jsPDF();
      const fecha = new Date().toLocaleDateString('es-MX');
      
      doc.setFontSize(18);
      doc.text(`${usuario?.empresa_nombre || 'WH Management'}`, 105, 20, { align: 'center' });
      doc.setFontSize(14);

      if (tipo === 'constancia') {
        doc.text('CONSTANCIA DE CONSULTA', 105, 30, { align: 'center' });
      } else if (tipo === 'receta') {
        doc.text('R E C E T A   M É D I C A', 105, 30, { align: 'center' });
      } else if (tipo === 'incapacidad') {
        doc.text('REPORTE DE INCAPACIDAD', 105, 30, { align: 'center' });
      }
      
      doc.line(20, 35, 190, 35);
      
      doc.setFontSize(12);
      doc.text(`Fecha: ${fecha}`, 20, 45);
      doc.text(`Paciente: ${paciente.nombre}`, 20, 55);
      doc.text(`Número de Empleado: ${paciente.num_empleado}`, 20, 65);
      doc.text(`Área: ${paciente.area || 'No especificada'}`, 20, 75);
      doc.text(`Puesto: ${paciente.puesto || 'No especificado'}`, 20, 85);
      
      doc.text('---', 20, 95);
      doc.setFontSize(14);
      doc.text('Detalles', 20, 105);
      doc.setFontSize(12);
      doc.text(`Motivo: ${consulta.motivo || 'No especificado'}`, 20, 115);
      
      if (tipo === 'constancia') {
        const sintomas = [
          consulta.cabeza && `Cabeza: ${consulta.cabeza}`,
          consulta.cuello && `Cuello: ${consulta.cuello}`,
          consulta.torax && `Tórax: ${consulta.torax}`,
          consulta.abdomen && `Abdomen: ${consulta.abdomen}`,
          consulta.espalda && `Espalda: ${consulta.espalda}`,
          consulta.extremidades_superiores && `Extremidades Superiores: ${consulta.extremidades_superiores}`,
          consulta.extremidades_inferiores && `Extremidades Inferiores: ${consulta.extremidades_inferiores}`,
          consulta.ojos_oidos_garganta && `Ojos/Oídos/Garganta: ${consulta.ojos_oidos_garganta}`
        ].filter(Boolean);
        
        let yPos = 125;
        sintomas.forEach(s => {
          doc.text(`• ${s}`, 25, yPos);
          yPos += 8;
        });
        
        if (consulta.causa) {
          doc.text(`Causa probable: ${consulta.causa}`, 20, yPos + 5);
          yPos += 12;
        }
        
        doc.text('---', 20, yPos + 5);
        doc.setFontSize(14);
        doc.text('Diagnóstico y Tratamiento', 20, yPos + 18);
        doc.setFontSize(12);
        doc.text(`Impresión Diagnóstica: ${consulta.impresion_diagnostica || 'Pendiente'}`, 20, yPos + 30);
        if (consulta.cie10) {
          doc.text(`CIE-10: ${consulta.cie10}`, 20, yPos + 40);
        }
        if (consulta.medicamentos) {
          doc.text(`Medicamentos: ${consulta.medicamentos}`, 20, yPos + 50);
        }
        if (consulta.receta) {
          doc.text(`Receta: ${consulta.receta}`, 20, yPos + 60);
        }
      } else if (tipo === 'receta') {
        doc.text('Medicamentos Recetados:', 20, 125);
        const medicamentos = (consulta.medicamentos && typeof consulta.medicamentos === 'string') 
        ? consulta.medicamentos.split(',').map(m => m.trim()) 
        : ['No se recetaron medicamentos'];
        let yPos = 135;
        medicamentos.forEach((med, i) => {
          doc.text(`${i + 1}. ${med}`, 25, yPos);
          yPos += 10;
        });
        if (consulta.receta) {
          doc.text(`Número de Receta: ${consulta.receta}`, 20, yPos + 10);
        }
        doc.text(`Diagnóstico: ${consulta.impresion_diagnostica || 'No especificado'}`, 20, yPos + 30);
        if (consulta.cie10) {
          doc.text(`CIE-10: ${consulta.cie10}`, 20, yPos + 40);
        }
      } else if (tipo === 'incapacidad') {
        doc.text(`Diagnóstico: ${consulta.impresion_diagnostica || 'Pendiente'}`, 20, 125);
        if (consulta.cie10) {
          doc.text(`CIE-10: ${consulta.cie10}`, 20, 135);
        }
        doc.text('---', 20, 148);
        doc.setFontSize(10);
        doc.text('El paciente presenta incapacidad para realizar sus actividades laborales.', 20, 160);
        doc.text('Se recomienda reposo y seguimiento médico.', 20, 170);
        doc.text('_________________________', 20, 185);
        doc.text('Médico Responsable', 20, 195);
      }
      
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      
      const response = await api.post(`${API_URL}/enviar-${tipo}`, {
        destinatario: destinatario,
        paciente: paciente,
        consulta: consulta,
        pdfBase64: pdfBase64
      });
      
      if (response.data.success) {
        toast.success(`${tipo.charAt(0).toUpperCase() + tipo.slice(1)} enviada por correo a ${destinatario}`);
      }
    } catch (error) {
      console.error('Error al enviar correo:', error);
      toast.error('Error al enviar el correo. Verifica tu conexión.');
    }
  };

  // ===== PANTALLA DE LOGIN =====
  if (mostrarLogin) {
    return (
      <>
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#fff',
              color: '#1A1A18',
              padding: '14px 16px',
              borderRadius: '4px',
              border: '1px solid #EEEEEE',
              fontFamily: "'Work Sans', sans-serif",
              fontSize: '14px'
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#2F6844',
                secondary: '#fff',
              },
              style: {
                borderLeft: '4px solid #2F6844',
              },
            },
            error: {
              duration: 4000,
              iconTheme: {
                primary: '#B3261E',
                secondary: '#fff',
              },
              style: {
                borderLeft: '4px solid #B3261E',
              },
            },
            loading: {
              duration: 2000,
              iconTheme: {
                primary: '#C9922E',
                secondary: '#fff',
              },
              style: {
                borderLeft: '4px solid #C9922E',
              },
            },
          }}
        />
        <div style={styles.loginContainer}>
          <div style={mostrarRegistro && !registroEnviado ? styles.registroBox : styles.loginBox}>
            <h1 style={styles.title}>WH Management</h1>
            {empresaLogin?.logo_url ? (
              <img src={empresaLogin.logo_url} alt={empresaLogin.nombre} style={styles.loginLogo} />
            ) : empresaLogin?.nombre ? (
              <h2 style={styles.subtitle}>{empresaLogin.nombre}</h2>
            ) : null}

            {!mostrarRegistro ? (
              <>
                <p style={styles.welcomeText}>Inicia sesión para continuar</p>
                {errorLogin && (
                  <div style={styles.errorBox}>{errorLogin}</div>
                )}
                <form onSubmit={handleLogin}>
                  <input type="text" placeholder="Número de empleado" value={numEmpleado} onChange={(e) => setNumEmpleado(e.target.value)} style={styles.input} required />
                  <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} style={styles.input} required />
                  <button type="submit" style={styles.loginButton}>Iniciar Sesión</button>
                </form>
                <div style={styles.testCredentials}>
                  <p>‍Usuarios de prueba:</p>
                  <p><strong>Admin:</strong> ADMIN001 / admin123</p>
                  <p><strong>Médico:</strong> MED001 / medico123</p>
                  <p><strong>Enfermera:</strong> ENF001 / enfermera123</p>
                </div>
                <p style={styles.welcomeText}>
                  ¿Eres una empresa nueva?{' '}
                  <a href="#" onClick={(e) => { e.preventDefault(); setMostrarRegistro(true); setRegistroEnviado(false); }}>
                    Regístrate aquí
                  </a>
                </p>
              </>
            ) : registroEnviado ? (
              <div style={styles.mensajeBox}>
                Tu solicitud fue enviada. Te avisaremos cuando tu cuenta esté aprobada.
                <p>
                  <a href="#" onClick={(e) => { e.preventDefault(); setMostrarRegistro(false); }}>
                    ← Volver al login
                  </a>
                </p>
              </div>
            ) : (
              <>
                <div style={styles.videoPlaceholder}>
                  Video próximamente: cómo funciona, cuánto tiempo toma y precio
                </div>

                <div style={styles.pricingGrid}>
                  {[
                    { nombre: 'Core', detalle: '20 registros/mes', mxn: 150 },
                    { nombre: 'Plus', detalle: '100 registros/mes', mxn: 1500 },
                    { nombre: 'Unlimited', detalle: 'Registros ilimitados', mxn: 5000 },
                  ].map((plan) => (
                    <div key={plan.nombre} style={styles.pricingCard}>
                      <h4 style={styles.pricingName}>{plan.nombre}</h4>
                      <p style={styles.pricingDetail}>{plan.detalle}</p>
                      <p style={styles.pricingPrice}>${plan.mxn.toLocaleString('es-MX')} MXN</p>
                      <p style={styles.pricingConverted}>
                        {tasasCambio
                          ? `≈ $${(plan.mxn * tasasCambio.usd).toFixed(2)} USD · $${Math.round(plan.mxn * tasasCambio.cop).toLocaleString('es-MX')} COP`
                          : 'Calculando tipo de cambio…'}
                      </p>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleSolicitarRegistro}>
                  <input
                    placeholder="Nombre de tu empresa *"
                    value={registroForm.nombre}
                    onChange={(e) => setRegistroForm({ ...registroForm, nombre: e.target.value })}
                    style={styles.input}
                    required
                  />
                  <label style={styles.fileLabel}>
                    {registroLogo ? registroLogo.name : 'Logo'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setRegistroLogo(e.target.files[0])}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <input
                    type="email"
                    placeholder="Correo *"
                    value={registroForm.correo}
                    onChange={(e) => setRegistroForm({ ...registroForm, correo: e.target.value })}
                    style={styles.input}
                    required
                  />
                  <input
                    type="tel"
                    placeholder="Celular *"
                    value={registroForm.celular}
                    onChange={(e) => setRegistroForm({ ...registroForm, celular: e.target.value })}
                    style={styles.input}
                    required
                  />
                  <input
                    placeholder="Tu nombre completo *"
                    value={registroForm.admin_nombre}
                    onChange={(e) => setRegistroForm({ ...registroForm, admin_nombre: e.target.value })}
                    style={styles.input}
                    required
                  />
                  <input
                    placeholder="Usuario *"
                    value={registroForm.admin_num_empleado}
                    onChange={(e) => setRegistroForm({ ...registroForm, admin_num_empleado: e.target.value })}
                    style={styles.input}
                    required
                  />
                  <input
                    type="password"
                    placeholder="Contraseña *"
                    value={registroForm.admin_password}
                    onChange={(e) => setRegistroForm({ ...registroForm, admin_password: e.target.value })}
                    style={styles.input}
                    required
                  />
                  <button type="submit" style={styles.loginButton}>Solicitar Registro</button>
                  <p style={styles.welcomeText}>
                    <a href="#" onClick={(e) => { e.preventDefault(); setMostrarRegistro(false); }}>
                      ← Ya tengo cuenta, quiero iniciar sesión
                    </a>
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </>
    );
  }

  // ===== PANTALLA PRINCIPAL =====
  return (
    <div style={styles.appContainer}>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#fff',
            color: '#1A1A18',
            padding: '14px 16px',
            borderRadius: '4px',
            border: '1px solid #EEEEEE',
            fontFamily: "'Work Sans', sans-serif",
            fontSize: '14px'
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#2F6844',
              secondary: '#fff',
            },
            style: {
              borderLeft: '4px solid #2F6844',
            },
          },
          error: {
            duration: 4000,
            iconTheme: {
              primary: '#B3261E',
              secondary: '#fff',
            },
            style: {
              borderLeft: '4px solid #B3261E',
            },
          },
          loading: {
            duration: 2000,
            style: {
              borderLeft: '4px solid #C9922E',
            },
          },
        }}
      />
      
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          {usuario.empresa_logo_url ? (
            <img src={usuario.empresa_logo_url} alt={usuario.empresa_nombre} style={styles.headerLogo} />
          ) : (
            <span style={styles.headerTitle}>{usuario.empresa_nombre || 'WH Management'}</span>
          )}
          <span style={styles.headerRole}>{usuario.nombre}</span>
          <span style={{
            ...styles.headerBadge,
            background: 'rgba(255,255,255,0.16)',
            color: '#fff'
          }}>
            {usuario.rol === 'admin' ? 'Admin' : usuario.rol === 'medico' ? 'Médico' : 'Enfermera'}
          </span>
        </div>
        <button onClick={handleLogout} style={styles.logoutButton}>Cerrar Sesión</button>
      </div>

      {/* Contenido principal */}
      <div style={styles.content}>
        {/* Mensaje de bienvenida */}
        <div style={styles.welcomeSection}>
          {usuario.rol === 'admin' && (
            <p style={styles.welcomeText}>Bienvenido Administrador. Tienes acceso completo al sistema.</p>
          )}
          {usuario.rol === 'medico' && (
            <p style={styles.welcomeText}>Bienvenido Médico. Puedes gestionar pacientes, consultas y exámenes.</p>
          )}
          {usuario.rol === 'enfermera' && (
            <p style={styles.welcomeText}>Bienvenida Enfermera. Puedes gestionar pacientes y consultas.</p>
          )}
        </div>

        {/* Grid principal */}
        <div style={styles.mainGrid}>
          {/* Formulario de Pacientes */}
          <div style={styles.formCard}>
            <div style={styles.cardHeader}>
              <h3 style={styles.cardTitle}>Registrar Paciente</h3>
            </div>
            <form onSubmit={handleSubmit} style={styles.cardForm}>
              <input name="num_empleado" placeholder="Número de empleado" value={formData.num_empleado} onChange={handleChange} style={styles.cardInput} required />
              <input name="nombre" placeholder="Nombre completo" value={formData.nombre} onChange={handleChange} style={styles.cardInput} required />
              <input name="fecha_nac" placeholder="Fecha nacimiento (YYYY-MM-DD)" value={formData.fecha_nac} onChange={handleChange} style={styles.cardInput} />
              <input name="nss" placeholder="NSS" value={formData.nss} onChange={handleChange} style={styles.cardInput} />
              <input name="contacto_emergencia" placeholder="Contacto de emergencia" value={formData.contacto_emergencia} onChange={handleChange} style={styles.cardInput} />
              <input name="puesto" placeholder="Puesto" value={formData.puesto} onChange={handleChange} style={styles.cardInput} />
              <input name="area" placeholder="Área" value={formData.area} onChange={handleChange} style={styles.cardInput} />
              <input name="supervisor" placeholder="Supervisor" value={formData.supervisor} onChange={handleChange} style={styles.cardInput} />
              <button type="submit" style={styles.saveButton}>Guardar Paciente</button>
            </form>
          </div>

          {/* Lista de Pacientes */}
          <div style={styles.listCard}>
            <div style={styles.cardHeader}>
              <h3 style={styles.cardTitle}>Pacientes Registrados</h3>
              <button onClick={exportarPacientesExcel} style={styles.exportButton}>
                Exportar Excel
              </button>
            </div>
            <input
              type="text"
              placeholder="Buscar por nombre, número de empleado o área..."
              value={busquedaPaciente}
              onChange={(e) => setBusquedaPaciente(e.target.value)}
              style={styles.cardInput}
            />
            {pacientes.length === 0 ? (
              <p style={styles.emptyText}>
                {busquedaPaciente ? 'No hay pacientes que coincidan con la búsqueda' : 'No hay pacientes aún'}
              </p>
            ) : (
              <ul style={styles.patientList}>
                {pacientes.map(p => (
                  <li key={p.id} style={styles.patientItem}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <strong>{p.nombre}</strong>
                        <span style={styles.patientInfo}>
                          Empleado: {p.num_empleado} - Área: {p.area}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        <button onClick={() => handleAbrirConsulta(p)} style={styles.consultaButton}>Consulta</button>
                        {(usuario.rol === 'admin' || usuario.rol === 'medico') && (
                          <>
                            <button onClick={() => handleAbrirExamen('emi', p)} style={styles.emiButton}>EMI</button>
                            <button onClick={() => handleAbrirExamen('emp', p)} style={styles.empButton}>EMP</button>
                            <button onClick={() => handleAbrirExamen('emr', p)} style={styles.emrButton}>EMR</button>
                            <button onClick={() => handleAbrirExamen('vulnerabilidad', p)} style={styles.vulnerabilidadButton}>Vuln</button>
                          </>
                        )}
                        <button onClick={() => handleEditarPaciente(p)} style={styles.editButton}>Editar</button>
                        <button onClick={() => handleEliminarPaciente(p.id, p.nombre)} style={styles.deleteButton}>Eliminar</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {totalPaginasPacientes > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                <button
                  onClick={() => cargarPacientes(paginaPacientes - 1)}
                  disabled={paginaPacientes <= 1}
                  style={styles.editButton}
                >
                  ← Anterior
                </button>
                <span>Página {paginaPacientes} de {totalPaginasPacientes}</span>
                <button
                  onClick={() => cargarPacientes(paginaPacientes + 1)}
                  disabled={paginaPacientes >= totalPaginasPacientes}
                  style={styles.editButton}
                >
                  Siguiente →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Gestión de Usuarios - Solo Admin */}
        {usuario && usuario.rol === 'admin' && (
          <div style={styles.adminSection}>
            <h2 style={styles.sectionTitle}>Gestión de Usuarios</h2>
            {mensajeUsuario && (
              <div style={{
                ...styles.mensajeBox,
                background: mensajeUsuario.includes('correctamente') ? accentLight : dangerLight,
                color: mensajeUsuario.includes('correctamente') ? accentDark : danger
              }}>
                {mensajeUsuario}
              </div>
            )}
            <div style={styles.adminGrid}>
              <div style={styles.formCard}>
                <div style={styles.cardHeader}>
                  <h3 style={styles.cardTitle}>Crear Nuevo Usuario</h3>
                </div>
                <form onSubmit={handleCrearUsuario} style={styles.cardForm}>
                  <input name="num_empleado" placeholder="Número de empleado *" value={nuevoUsuario.num_empleado} onChange={handleCambioUsuario} style={styles.cardInput} required />
                  <input name="nombre" placeholder="Nombre completo *" value={nuevoUsuario.nombre} onChange={handleCambioUsuario} style={styles.cardInput} required />
                  <select name="rol" value={nuevoUsuario.rol} onChange={handleCambioUsuario} style={styles.select} required>
                    <option value="admin">Administrador</option>
                    <option value="medico">Médico</option>
                    <option value="enfermera">Enfermera</option>
                  </select>
                  <input name="password" type="password" placeholder="Contraseña *" value={nuevoUsuario.password} onChange={handleCambioUsuario} style={styles.cardInput} required />
                  <button type="submit" style={styles.createButton}>Crear Usuario</button>
                </form>
              </div>
              <div style={styles.listCard}>
                <div style={styles.cardHeader}>
                  <h3 style={styles.cardTitle}>Lista de Usuarios</h3>
                  <button onClick={exportarUsuariosExcel} style={styles.exportButton}>
                    Exportar Excel
                  </button>
                </div>
                {usuarios.length === 0 ? (
                  <p style={styles.emptyText}>No hay usuarios registrados</p>
                ) : (
                  <ul style={styles.patientList}>
                    {usuarios.map(u => (
                      <li key={u.id} style={styles.userItem}>
                        <div style={styles.userInfo}>
                          <strong>{u.nombre}</strong>
                          <span style={styles.userDetail}>Empleado: {u.num_empleado}</span>
                          <span style={{
                            ...styles.roleBadge,
                            background: u.rol === 'admin' ? '#2F6844' : u.rol === 'medico' ? '#D9663D' : '#C9922E',
                            color: '#fff'
                          }}>
                            {u.rol === 'admin' ? 'Admin' : u.rol === 'medico' ? 'Médico' : 'Enfermera'}
                          </span>
                          <span style={styles.userDate}>{new Date(u.fecha_registro).toLocaleDateString('es-MX')}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => handleResetearPassword(u.id, u.num_empleado)} style={styles.resetPasswordButton}>Restablecer contraseña</button>
                          <button onClick={() => handleEliminarUsuario(u.id, u.num_empleado)} style={styles.deleteButton} disabled={u.num_empleado === 'ADMIN001'}>Eliminar</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Asistencias - reloj checador, cada login queda registrado */}
        {usuario.rol === 'admin' && (
          <div style={styles.adminSection}>
            <h2 style={styles.sectionTitle}>Asistencias</h2>
            <div style={styles.listCard}>
              <div style={styles.cardHeader}>
                <h3 style={styles.cardTitle}>Últimas checadas de entrada</h3>
              </div>
              {asistencias.length === 0 ? (
                <p style={styles.emptyText}>Aún no hay checadas registradas</p>
              ) : (
                <ul style={styles.patientList}>
                  {asistencias.map(a => (
                    <li key={a.id} style={styles.userItem}>
                      <div style={styles.userInfo}>
                        <strong>{a.nombre}</strong>
                        <span style={styles.userDetail}>Empleado: {a.num_empleado}</span>
                      </div>
                      <span style={styles.userDate}>{new Date(a.fecha_hora).toLocaleString('es-MX')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Mi Empresa - cualquier admin edita el nombre/logo de su propia empresa */}
        {usuario.rol === 'admin' && (
          <div style={styles.adminSection}>
            <h2 style={styles.sectionTitle}>Mi Empresa</h2>
            <div style={styles.formCard}>
              <form onSubmit={handleActualizarMiEmpresa} style={styles.cardForm}>
                <input
                  placeholder="Nombre de la empresa"
                  defaultValue={usuario.empresa_nombre}
                  onChange={(e) => setMiEmpresaNombre(e.target.value)}
                  style={styles.cardInput}
                  required
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setMiEmpresaLogo(e.target.files[0])}
                  style={styles.cardInput}
                />
                {usuario.empresa_logo_url && (
                  <img src={usuario.empresa_logo_url} alt="Logo actual" style={{ height: '48px', objectFit: 'contain' }} />
                )}
                <button type="submit" style={styles.saveButton}>Guardar Empresa</button>
              </form>
              {usuario.empresa_slug && (
                <p style={styles.patientInfo}>
                  Link de acceso para tu equipo: <strong>{window.location.origin}/login/{usuario.empresa_slug}</strong>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Gestión de Empresas - Solo Superadmin */}
        {usuario.es_superadmin && (
          <div style={styles.adminSection}>
            <h2 style={styles.sectionTitle}>Gestión de Empresas</h2>
            <div style={styles.adminGrid}>
              <div style={styles.formCard}>
                <div style={styles.cardHeader}>
                  <h3 style={styles.cardTitle}>Dar de Alta Empresa</h3>
                </div>
                <form onSubmit={handleCrearEmpresa} style={styles.cardForm}>
                  <input
                    placeholder="Nombre de la empresa *"
                    value={nuevaEmpresaNombre}
                    onChange={(e) => setNuevaEmpresaNombre(e.target.value)}
                    style={styles.cardInput}
                    required
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setNuevaEmpresaLogo(e.target.files[0])}
                    style={styles.cardInput}
                  />
                  <p style={styles.patientInfo}>Primer administrador de la empresa:</p>
                  <input
                    placeholder="Número de empleado *"
                    value={nuevaEmpresaAdmin.num_empleado}
                    onChange={(e) => setNuevaEmpresaAdmin({ ...nuevaEmpresaAdmin, num_empleado: e.target.value })}
                    style={styles.cardInput}
                    required
                  />
                  <input
                    placeholder="Nombre completo *"
                    value={nuevaEmpresaAdmin.nombre}
                    onChange={(e) => setNuevaEmpresaAdmin({ ...nuevaEmpresaAdmin, nombre: e.target.value })}
                    style={styles.cardInput}
                    required
                  />
                  <input
                    type="password"
                    placeholder="Contraseña *"
                    value={nuevaEmpresaAdmin.password}
                    onChange={(e) => setNuevaEmpresaAdmin({ ...nuevaEmpresaAdmin, password: e.target.value })}
                    style={styles.cardInput}
                    required
                  />
                  <button type="submit" style={styles.createButton}>Crear Empresa</button>
                </form>
              </div>
              <div style={styles.listCard}>
                <div style={styles.cardHeader}>
                  <h3 style={styles.cardTitle}>Empresas Registradas</h3>
                </div>
                {empresas.length === 0 ? (
                  <p style={styles.emptyText}>No hay empresas aún</p>
                ) : (
                  <ul style={styles.patientList}>
                    {empresas.map(emp => (
                      <li key={emp.id} style={styles.userItem}>
                        <div style={styles.userInfo}>
                          {emp.logo_url && (
                            <img src={emp.logo_url} alt={emp.nombre} style={{ height: '32px', objectFit: 'contain' }} />
                          )}
                          <strong>{emp.nombre}</strong>
                          {!emp.activo && (
                            <span style={{ ...styles.roleBadge, background: '#C9922E', color: '#fff' }}>Pendiente</span>
                          )}
                          <span style={styles.userDetail}>{window.location.origin}/login/{emp.slug}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {!emp.activo && (
                            <button onClick={() => handleAprobarEmpresa(emp.id)} style={styles.createButton}>Aprobar</button>
                          )}
                          <button onClick={() => handleEliminarEmpresa(emp.id, emp.nombre)} style={styles.deleteButton}>Eliminar</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div style={styles.formCard}>
              <div style={styles.cardHeader}>
                <h3 style={styles.cardTitle}>Restablecer contraseña de cualquier usuario</h3>
              </div>
              <p style={styles.userDetail}>
                Para cuando el único admin de una empresa olvida su contraseña y no hay nadie más ahí que se la pueda restablecer.
              </p>
              <form onSubmit={handleResetearPasswordSoporte} style={styles.cardForm}>
                <input
                  placeholder="Número de empleado *"
                  value={soporteReset.num_empleado}
                  onChange={(e) => setSoporteReset({ ...soporteReset, num_empleado: e.target.value })}
                  style={styles.cardInput}
                  required
                />
                <input
                  type="password"
                  placeholder="Nueva contraseña *"
                  value={soporteReset.password}
                  onChange={(e) => setSoporteReset({ ...soporteReset, password: e.target.value })}
                  style={styles.cardInput}
                  required
                />
                <button type="submit" style={styles.createButton}>Restablecer</button>
              </form>
            </div>
          </div>
        )}

        {/* Dashboard - Admin y Médico */}
        {(usuario.rol === 'admin' || usuario.rol === 'medico') && (
          <div style={styles.dashboardSection}>
            <div style={styles.cardHeader}>
              <h3 style={styles.cardTitle}>Dashboard de Estadísticas</h3>
              <button onClick={exportarEstadisticasExcel} style={styles.exportButton}>
                Exportar
              </button>
            </div>
            <Dashboard empresaId={usuario.empresa_id} />
          </div>
        )}

        {/* MODALES */}
        {/* Modal de Editar Paciente */}
        {mostrarModalEditar && pacienteEditando && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
              <div style={styles.modalHeader}>
                <h2>Editar Paciente</h2>
                <button onClick={() => setMostrarModalEditar(false)} style={styles.closeButton}>✕</button>
              </div>
              <form onSubmit={handleActualizarPaciente} style={styles.cardForm}>
                <input name="num_empleado" placeholder="Número de empleado" value={formData.num_empleado} onChange={handleChange} style={styles.cardInput} required />
                <input name="nombre" placeholder="Nombre completo" value={formData.nombre} onChange={handleChange} style={styles.cardInput} required />
                <input name="fecha_nac" placeholder="Fecha nacimiento (YYYY-MM-DD)" value={formData.fecha_nac} onChange={handleChange} style={styles.cardInput} />
                <input name="nss" placeholder="NSS" value={formData.nss} onChange={handleChange} style={styles.cardInput} />
                <input name="contacto_emergencia" placeholder="Contacto de emergencia" value={formData.contacto_emergencia} onChange={handleChange} style={styles.cardInput} />
                <input name="puesto" placeholder="Puesto" value={formData.puesto} onChange={handleChange} style={styles.cardInput} />
                <input name="area" placeholder="Área" value={formData.area} onChange={handleChange} style={styles.cardInput} />
                <input name="supervisor" placeholder="Supervisor" value={formData.supervisor} onChange={handleChange} style={styles.cardInput} />
                <div style={styles.buttonRow}>
                  <button type="button" onClick={() => setMostrarModalEditar(false)} style={styles.cancelButton}>Cancelar</button>
                  <button type="submit" style={styles.saveButton}>Actualizar Paciente</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Consulta */}
        {mostrarConsulta && pacienteSeleccionado && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
              <div style={styles.modalHeader}>
                <div>
                  <h2>Consulta Diaria</h2>
                  <h3>Paciente: {pacienteSeleccionado.nombre}</h3>
                </div>
                <button onClick={handleCerrarConsulta} style={styles.closeButton}>✕</button>
              </div>

              {mensajeConsulta && (
                <div style={{
                  ...styles.mensajeBox,
                  background: mensajeConsulta.includes('correctamente') ? accentLight : dangerLight,
                  color: mensajeConsulta.includes('correctamente') ? accentDark : danger
                }}>
                  {mensajeConsulta}
                </div>
              )}

              <form onSubmit={handleGuardarConsulta} style={styles.consultaForm}>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>Fecha</label>
                    <input type="date" name="fecha" value={consultaForm.fecha} onChange={handleChangeConsulta} style={styles.cardInput} required />
                  </div>
                  <div style={styles.formGroup}>
                    <label>¿Tiene alergias?</label>
                    <select name="alergias" value={consultaForm.alergias} onChange={handleChangeConsulta} style={styles.select}>
                      <option value="no">No</option>
                      <option value="si">Sí</option>
                    </select>
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label>Motivo de consulta</label>
                  <textarea name="motivo" value={consultaForm.motivo} onChange={handleChangeConsulta} rows="2" placeholder="Describa el motivo..." style={styles.cardInput} required />
                </div>

                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>Cabeza</label>
                    <input name="cabeza" value={consultaForm.cabeza} onChange={handleChangeConsulta} placeholder="Síntomas en cabeza" style={styles.cardInput} />
                  </div>
                  <div style={styles.formGroup}>
                    <label>Cuello</label>
                    <input name="cuello" value={consultaForm.cuello} onChange={handleChangeConsulta} placeholder="Síntomas en cuello" style={styles.cardInput} />
                  </div>
                </div>

                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>Tórax</label>
                    <input name="torax" value={consultaForm.torax} onChange={handleChangeConsulta} placeholder="Síntomas en tórax" style={styles.cardInput} />
                  </div>
                  <div style={styles.formGroup}>
                    <label>Extremidades superiores</label>
                    <input name="extremidades_superiores" value={consultaForm.extremidades_superiores} onChange={handleChangeConsulta} placeholder="Brazo, hombro, mano" style={styles.cardInput} />
                  </div>
                </div>

                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>Extremidades inferiores</label>
                    <input name="extremidades_inferiores" value={consultaForm.extremidades_inferiores} onChange={handleChangeConsulta} placeholder="Pierna, pie" style={styles.cardInput} />
                  </div>
                  <div style={styles.formGroup}>
                    <label>Abdomen</label>
                    <input name="abdomen" value={consultaForm.abdomen} onChange={handleChangeConsulta} placeholder="Síntomas en abdomen" style={styles.cardInput} />
                  </div>
                </div>

                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>Espalda</label>
                    <input name="espalda" value={consultaForm.espalda} onChange={handleChangeConsulta} placeholder="Síntomas en espalda" style={styles.cardInput} />
                  </div>
                  <div style={styles.formGroup}>
                    <label>Ojos, Oídos o Garganta</label>
                    <input name="ojos_oidos_garganta" value={consultaForm.ojos_oidos_garganta} onChange={handleChangeConsulta} placeholder="Síntomas en ojos, oídos o garganta" style={styles.cardInput} />
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label>Describa cuál cree es la causa</label>
                  <textarea name="causa" value={consultaForm.causa} onChange={handleChangeConsulta} rows="2" placeholder="¿Qué cree que está causando los síntomas?" style={styles.cardInput} />
                </div>

                <div style={styles.formDivider}>--- Sección Médica ---</div>

                <div style={styles.formGroup}>
                  <label>Impresión Diagnóstica</label>
                  <textarea name="impresion_diagnostica" value={consultaForm.impresion_diagnostica} onChange={handleChangeConsulta} rows="2" placeholder="Diagnóstico del médico" style={styles.cardInput} />
                </div>

                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>Medicamentos</label>
                    <input name="medicamentos" value={consultaForm.medicamentos} onChange={handleChangeConsulta} placeholder="Medicamentos recetados" style={styles.cardInput} />
                  </div>
                  <div style={styles.formGroup}>
                    <label>Receta</label>
                    <input name="receta" value={consultaForm.receta} onChange={handleChangeConsulta} placeholder="Número de receta o detalles" style={styles.cardInput} />
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label>CIE-10</label>
                  <input name="cie10" value={consultaForm.cie10} onChange={handleChangeConsulta} placeholder="Código CIE-10" style={styles.cardInput} />
                </div>

                <div style={styles.buttonRow}>
                  <button type="button" onClick={handleCerrarConsulta} style={styles.cancelButton}>Cancelar</button>
                  <button type="submit" style={styles.saveButton}>Guardar Consulta</button>
                </div>
              </form>

              {consultasPaciente.length > 0 && (
                <div style={styles.historialContainer}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0 }}>Historial de Consultas</h4>
                    <button onClick={exportarConsultasExcel} style={styles.exportButtonSmall}>
                      Exportar Excel
                    </button>
                  </div>
                  <div style={styles.historialList}>
                    {consultasPaciente.map(c => (
                      <div key={c.id} style={styles.historialItem}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1 }}>
                            <strong>{new Date(c.fecha).toLocaleDateString('es-MX')}</strong>
                            <p><strong>Motivo:</strong> {c.motivo}</p>
                            <p><strong>Diagnóstico:</strong> {c.impresion_diagnostica || 'Pendiente'}</p>
                            {c.cie10 && <p><strong>CIE-10:</strong> {c.cie10}</p>}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button onClick={() => handleEditarConsulta(c)} style={styles.editButtonSmall}>Editar</button>
                              <button onClick={() => handleEliminarConsulta(c.id)} style={styles.deleteButtonSmall}>Eliminar</button>
                            </div>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              <button onClick={() => generarConstanciaPDF(c, pacienteSeleccionado)} style={styles.pdfButtonGreen}>Constancia</button>
                              <button onClick={() => generarRecetaPDF(c, pacienteSeleccionado)} style={styles.pdfButtonBlue}>Receta</button>
                              <button onClick={() => generarIncapacidadPDF(c, pacienteSeleccionado)} style={styles.pdfButtonOrange}>Incapacidad</button>
                            </div>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                              <button onClick={() => enviarCorreoPDF(c, pacienteSeleccionado, 'constancia')} style={styles.emailButtonGreen}>Enviar Constancia</button>
                              <button onClick={() => enviarCorreoPDF(c, pacienteSeleccionado, 'receta')} style={styles.emailButtonBlue}>Enviar Receta</button>
                              <button onClick={() => enviarCorreoPDF(c, pacienteSeleccionado, 'incapacidad')} style={styles.emailButtonOrange}>Enviar Incapacidad</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal de Editar Consulta */}
        {mostrarModalEditarConsulta && consultaEditando && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
              <div style={styles.modalHeader}>
                <h2>Editar Consulta</h2>
                <button onClick={() => setMostrarModalEditarConsulta(false)} style={styles.closeButton}>✕</button>
              </div>
              <form onSubmit={handleActualizarConsulta} style={styles.consultaForm}>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>Fecha</label>
                    <input type="date" name="fecha" value={consultaForm.fecha} onChange={handleChangeConsulta} style={styles.cardInput} required />
                  </div>
                  <div style={styles.formGroup}>
                    <label>¿Tiene alergias?</label>
                    <select name="alergias" value={consultaForm.alergias} onChange={handleChangeConsulta} style={styles.select}>
                      <option value="no">No</option>
                      <option value="si">Sí</option>
                    </select>
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label>Motivo de consulta</label>
                  <textarea name="motivo" value={consultaForm.motivo} onChange={handleChangeConsulta} rows="2" placeholder="Describa el motivo..." style={styles.cardInput} required />
                </div>

                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>Cabeza</label>
                    <input name="cabeza" value={consultaForm.cabeza} onChange={handleChangeConsulta} placeholder="Síntomas en cabeza" style={styles.cardInput} />
                  </div>
                  <div style={styles.formGroup}>
                    <label>Cuello</label>
                    <input name="cuello" value={consultaForm.cuello} onChange={handleChangeConsulta} placeholder="Síntomas en cuello" style={styles.cardInput} />
                  </div>
                </div>

                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>Tórax</label>
                    <input name="torax" value={consultaForm.torax} onChange={handleChangeConsulta} placeholder="Síntomas en tórax" style={styles.cardInput} />
                  </div>
                  <div style={styles.formGroup}>
                    <label>Extremidades superiores</label>
                    <input name="extremidades_superiores" value={consultaForm.extremidades_superiores} onChange={handleChangeConsulta} placeholder="Brazo, hombro, mano" style={styles.cardInput} />
                  </div>
                </div>

                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>Extremidades inferiores</label>
                    <input name="extremidades_inferiores" value={consultaForm.extremidades_inferiores} onChange={handleChangeConsulta} placeholder="Pierna, pie" style={styles.cardInput} />
                  </div>
                  <div style={styles.formGroup}>
                    <label>Abdomen</label>
                    <input name="abdomen" value={consultaForm.abdomen} onChange={handleChangeConsulta} placeholder="Síntomas en abdomen" style={styles.cardInput} />
                  </div>
                </div>

                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>Espalda</label>
                    <input name="espalda" value={consultaForm.espalda} onChange={handleChangeConsulta} placeholder="Síntomas en espalda" style={styles.cardInput} />
                  </div>
                  <div style={styles.formGroup}>
                    <label>Ojos, Oídos o Garganta</label>
                    <input name="ojos_oidos_garganta" value={consultaForm.ojos_oidos_garganta} onChange={handleChangeConsulta} placeholder="Síntomas en ojos, oídos o garganta" style={styles.cardInput} />
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label>Describa cuál cree es la causa</label>
                  <textarea name="causa" value={consultaForm.causa} onChange={handleChangeConsulta} rows="2" placeholder="¿Qué cree que está causando los síntomas?" style={styles.cardInput} />
                </div>

                <div style={styles.formDivider}>--- Sección Médica ---</div>

                <div style={styles.formGroup}>
                  <label>Impresión Diagnóstica</label>
                  <textarea name="impresion_diagnostica" value={consultaForm.impresion_diagnostica} onChange={handleChangeConsulta} rows="2" placeholder="Diagnóstico del médico" style={styles.cardInput} />
                </div>

                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>Medicamentos</label>
                    <input name="medicamentos" value={consultaForm.medicamentos} onChange={handleChangeConsulta} placeholder="Medicamentos recetados" style={styles.cardInput} />
                  </div>
                  <div style={styles.formGroup}>
                    <label>Receta</label>
                    <input name="receta" value={consultaForm.receta} onChange={handleChangeConsulta} placeholder="Número de receta o detalles" style={styles.cardInput} />
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label>CIE-10</label>
                  <input name="cie10" value={consultaForm.cie10} onChange={handleChangeConsulta} placeholder="Código CIE-10" style={styles.cardInput} />
                </div>

                <div style={styles.buttonRow}>
                  <button type="button" onClick={() => setMostrarModalEditarConsulta(false)} style={styles.cancelButton}>Cancelar</button>
                  <button type="submit" style={styles.saveButton}>Actualizar Consulta</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Exámenes */}
        {mostrarExamen && pacienteSeleccionado && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
              <div style={styles.modalHeader}>
                <div>
                  <h2>{tipoExamen.toUpperCase()} - Examen Especial</h2>
                  <h3>Paciente: {pacienteSeleccionado.nombre}</h3>
                </div>
                <button onClick={handleCerrarExamen} style={styles.closeButton}>✕</button>
              </div>

              {mensajeExamen && (
                <div style={{
                  ...styles.mensajeBox,
                  background: mensajeExamen.includes('correctamente') ? accentLight : dangerLight,
                  color: mensajeExamen.includes('correctamente') ? accentDark : danger
                }}>
                  {mensajeExamen}
                </div>
              )}

              <form onSubmit={handleGuardarExamen} style={styles.consultaForm}>
                <div style={styles.formGroup}>
                  <label>Fecha</label>
                  <input type="date" name="fecha" value={examenForm.fecha || ''} onChange={handleChangeExamen} style={styles.cardInput} required />
                </div>

                {/* Campos específicos - resumidos para no alargar */}
                <div style={styles.formDivider}>--- Diagnóstico y Exploración ---</div>

                <div style={styles.formGroup}>
                  <label>Impresión Diagnóstica</label>
                  <textarea name="impresion_diagnostica" value={examenForm.impresion_diagnostica || ''} onChange={handleChangeExamen} rows="2" placeholder="Diagnóstico del médico" style={styles.cardInput} />
                </div>

                <div style={styles.formGroup}>
                  <label>CIE-10</label>
                  <input name="cie10" value={examenForm.cie10 || ''} onChange={handleChangeExamen} placeholder="Código CIE-10" style={styles.cardInput} />
                </div>

                <div style={styles.formGroup}>
                  <label>Exploración Física</label>
                  <textarea name="exploracion_fisica" value={examenForm.exploracion_fisica || ''} onChange={handleChangeExamen} rows="2" placeholder="Resultados de la exploración física" style={styles.cardInput} />
                </div>

                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>Signos Vitales</label>
                    <input name="signos_vitales" value={examenForm.signos_vitales || ''} onChange={handleChangeExamen} placeholder="TA, FC, FR, Temp" style={styles.cardInput} />
                  </div>
                  <div style={styles.formGroup}>
                    <label>Agudeza Visual</label>
                    <input name="agudeza_visual" value={examenForm.agudeza_visual || ''} onChange={handleChangeExamen} placeholder="Resultado de agudeza visual" style={styles.cardInput} />
                  </div>
                </div>

                <div style={styles.buttonRow}>
                  <button type="button" onClick={handleCerrarExamen} style={styles.cancelButton}>Cancelar</button>
                  <button type="submit" style={styles.saveButton}>Guardar Examen</button>
                </div>
              </form>

              {examenesPaciente.length > 0 && (
                <div style={styles.historialContainer}>
                  <h4>Historial de {tipoExamen.toUpperCase()}</h4>
                  <div style={styles.historialList}>
                    {examenesPaciente.map(e => (
                      <div key={e.id} style={styles.historialItem}>
                        <strong>{new Date(e.fecha).toLocaleDateString('es-MX')}</strong>
                        <p><strong>Diagnóstico:</strong> {e.impresion_diagnostica || 'Pendiente'}</p>
                        {e.cie10 && <p><strong>CIE-10:</strong> {e.cie10}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// ===== ESTILOS =====
// ==================== TOKENS DE DISEÑO ====================
const ink = '#1A1A18';
const muted = '#8A8A85';
const mutedLight = '#B3B3AD';
const border = '#E4E4E1';
const borderLight = '#EEEEEE';
const accent = '#2F6844';
const accentLight = '#EAF1E7';
const accentDark = '#234E33';
const danger = '#B3261E';
const dangerLight = '#F8E4E2';
const amber = '#C9922E';
const pageBg = '#F5F8F6';
const pastelMint = '#EDF5EF';
const pastelPeach = '#FBF1E9';
const pastelAmber = '#FBF3E3';
const pastelRose = '#FBEAEA';
const fontDisplay = "'Fraunces', Georgia, serif";
const fontBody = "'Work Sans', -apple-system, sans-serif";

const ghostButton = {
  background: '#fff',
  color: ink,
  border: `1px solid ${border}`,
  padding: '8px 16px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: '500',
  whiteSpace: 'nowrap',
  transition: 'border-color 0.2s, background 0.2s',
  fontFamily: fontBody,
};

const pastelButton = (bg, text) => ({
  background: bg,
  color: text,
  border: 'none',
  padding: '8px 16px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: '500',
  whiteSpace: 'nowrap',
  transition: 'opacity 0.2s',
  fontFamily: fontBody,
});

const pastelBlue = { bg: '#E1EDFB', text: '#1E4E8C' };
const pastelPurple = { bg: '#EFE7F9', text: '#5C3E85' };
const pastelPink = { bg: '#FBE5F0', text: '#9C3D6E' };
const pastelYellow = { bg: '#FCF3CE', text: '#8A6D14' };
const pastelTeal = { bg: '#DFF3F0', text: '#1B6E63' };
const pastelOrange = { bg: '#FCE7D2', text: '#9C5A16' };
const pastelRed = { bg: dangerLight, text: danger };

const styles = {
  loginContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: pageBg,
    fontFamily: fontBody,
    padding: '20px',
    position: 'relative',
  },
  loginBox: {
    background: '#fff',
    padding: '48px 44px',
    borderRadius: '4px',
    width: '100%',
    maxWidth: '400px',
    textAlign: 'center',
  },
  registroBox: {
    background: '#fff',
    padding: '48px 44px',
    borderRadius: '4px',
    width: '100%',
    maxWidth: '820px',
    textAlign: 'center',
  },
  videoPlaceholder: {
    background: '#FAFAF8',
    border: `1px dashed ${border}`,
    borderRadius: '4px',
    aspectRatio: '16 / 9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: muted,
    fontSize: '14px',
    padding: '20px',
    margin: '8px 0 24px',
  },
  pricingGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
    margin: '0 0 28px',
  },
  pricingCard: {
    border: `1px solid ${borderLight}`,
    borderRadius: '4px',
    padding: '20px 16px',
  },
  pricingName: {
    fontFamily: fontDisplay,
    fontSize: '17px',
    fontWeight: '500',
    color: ink,
    margin: '0 0 4px',
  },
  pricingDetail: {
    fontSize: '12px',
    color: muted,
    margin: '0 0 12px',
  },
  pricingPrice: {
    fontSize: '20px',
    fontWeight: '600',
    color: accent,
    margin: '0 0 4px',
  },
  pricingConverted: {
    fontSize: '11px',
    color: mutedLight,
    margin: 0,
  },
  title: {
    fontFamily: fontDisplay,
    fontSize: '26px',
    fontWeight: '500',
    color: ink,
    margin: '0',
    letterSpacing: '0.08em',
  },
  subtitle: {
    fontFamily: fontDisplay,
    fontStyle: 'italic',
    fontSize: '15px',
    color: accent,
    margin: '16px 0 28px 0',
    fontWeight: '400',
  },
  welcomeText: {
    color: muted,
    marginBottom: '18px',
    fontSize: '13px',
  },
  errorBox: {
    background: dangerLight,
    color: danger,
    padding: '12px 16px',
    borderRadius: '4px',
    marginBottom: '16px',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  input: {
    display: 'block',
    width: '100%',
    padding: '12px 14px',
    margin: '8px 0',
    border: `1px solid ${border}`,
    borderRadius: '4px',
    fontSize: '15px',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
    outline: 'none',
    backgroundColor: '#fff',
    fontFamily: fontBody,
  },
  fileLabel: {
    display: 'block',
    width: '100%',
    padding: '12px 14px',
    margin: '8px 0',
    border: `1px solid ${border}`,
    borderRadius: '4px',
    fontSize: '15px',
    boxSizing: 'border-box',
    backgroundColor: '#fff',
    fontFamily: fontBody,
    color: muted,
    textAlign: 'left',
    cursor: 'pointer',
  },
  loginButton: {
    width: '100%',
    padding: '13px',
    background: accent,
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '15px',
    fontWeight: '500',
    cursor: 'pointer',
    marginTop: '10px',
    transition: 'background 0.2s',
    fontFamily: fontBody,
    letterSpacing: '0.02em',
  },
  testCredentials: {
    marginTop: '24px',
    padding: '16px',
    background: pastelMint,
    borderRadius: '4px',
    fontSize: '13px',
    textAlign: 'left',
    color: muted,
  },
  appContainer: {
    fontFamily: fontBody,
    minHeight: '100vh',
    background: pageBg,
    color: ink,
  },
  header: {
    background: accent,
    padding: '16px 32px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    flexWrap: 'wrap',
    gap: '12px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    flexWrap: 'wrap',
  },
  headerTitle: {
    fontFamily: fontDisplay,
    fontSize: '19px',
    fontWeight: '500',
    color: '#fff',
    letterSpacing: '0.06em',
  },
  headerLogo: {
    height: '32px',
    maxWidth: '180px',
    objectFit: 'contain',
  },
  loginLogo: {
    maxHeight: '64px',
    maxWidth: '260px',
    objectFit: 'contain',
    marginTop: '20px',
    marginBottom: '12px',
  },
  headerRole: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '400',
  },
  headerBadge: {
    padding: '3px 12px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '500',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    display: 'inline-block',
  },
  logoutButton: {
    background: 'transparent',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.4)',
    padding: '8px 18px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    transition: 'background 0.2s',
    fontFamily: fontBody,
  },
  content: {
    padding: '32px 24px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  welcomeSection: {
    background: accentLight,
    padding: '14px 20px',
    borderRadius: '4px',
    marginBottom: '28px',
    color: accentDark,
    fontSize: '14px',
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
    marginBottom: '24px',
    alignItems: 'start',
  },
  formCard: {
    background: 'white',
    padding: '24px',
    borderRadius: '4px',
    border: `1px solid ${borderLight}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  listCard: {
    background: 'white',
    padding: '24px',
    borderRadius: '4px',
    border: `1px solid ${borderLight}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
    flexWrap: 'wrap',
    gap: '8px',
  },
  cardTitle: {
    fontFamily: fontDisplay,
    fontSize: '18px',
    fontWeight: '500',
    color: ink,
    margin: 0,
  },
  cardForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: '100%',
  },
  cardInput: {
    padding: '11px 14px',
    border: `1px solid ${border}`,
    borderRadius: '4px',
    fontSize: '14px',
    transition: 'border-color 0.2s',
    outline: 'none',
    fontFamily: fontBody,
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: '#fff',
  },
  adminGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
    alignItems: 'start',
  },
  saveButton: {
    background: accent,
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    marginTop: '4px',
    width: '100%',
    transition: 'background 0.2s',
    fontFamily: fontBody,
    boxSizing: 'border-box',
  },
  createButton: {
    background: accent,
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    marginTop: '4px',
    width: '100%',
    transition: 'background 0.2s',
    fontFamily: fontBody,
    boxSizing: 'border-box',
  },
  exportButton: {
    ...pastelButton(pastelOrange.bg, pastelOrange.text),
    alignSelf: 'center',
  },
  sectionTitle: {
    fontFamily: fontDisplay,
    fontSize: '21px',
    fontWeight: '500',
    color: ink,
    marginBottom: '16px',
  },
  adminSection: {
    marginTop: '40px',
    paddingTop: '40px',
    borderTop: `1px solid ${borderLight}`,
  },
  select: {
    display: 'block',
    width: '100%',
    padding: '11px 14px',
    margin: '6px 0',
    border: `1px solid ${border}`,
    borderRadius: '4px',
    fontSize: '14px',
    boxSizing: 'border-box',
    background: 'white',
    fontFamily: fontBody,
  },
  mensajeBox: {
    padding: '12px 16px',
    borderRadius: '4px',
    marginBottom: '16px',
    fontWeight: '500',
    fontSize: '14px',
  },
  userItem: {
    borderBottom: `1px solid ${borderLight}`,
    padding: '14px 0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
  },
  userDetail: {
    color: muted,
    fontSize: '13px',
  },
  roleBadge: {
    display: 'inline-block',
    padding: '3px 11px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: '500',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    width: 'fit-content',
  },
  userDate: {
    color: mutedLight,
    fontSize: '12px',
  },
  deleteButton: {
    ...pastelButton(pastelRed.bg, pastelRed.text),
    padding: '6px 12px',
  },
  editButton: {
    ...pastelButton(pastelTeal.bg, pastelTeal.text),
    padding: '6px 12px',
  },
  resetPasswordButton: {
    ...pastelButton(pastelBlue.bg, pastelBlue.text),
    padding: '6px 12px',
  },
  consultaButton: {
    background: accent,
    color: 'white',
    border: 'none',
    padding: '6px 14px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    whiteSpace: 'nowrap',
    transition: 'background 0.2s',
  },
  emiButton: {
    ...pastelButton(pastelBlue.bg, pastelBlue.text),
    padding: '6px 10px',
    fontSize: '11px',
  },
  empButton: {
    ...pastelButton(pastelPurple.bg, pastelPurple.text),
    padding: '6px 10px',
    fontSize: '11px',
  },
  emrButton: {
    ...pastelButton(pastelPink.bg, pastelPink.text),
    padding: '6px 10px',
    fontSize: '11px',
  },
  vulnerabilidadButton: {
    ...pastelButton(pastelYellow.bg, pastelYellow.text),
    padding: '6px 10px',
    fontSize: '11px',
  },
  dashboardSection: {
    marginTop: '40px',
    paddingTop: '40px',
    borderTop: `1px solid ${borderLight}`,
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(26,26,24,0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modalContent: {
    background: 'white',
    borderRadius: '4px',
    padding: '30px',
    maxWidth: '800px',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    position: 'relative',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: `1px solid ${borderLight}`,
    paddingBottom: '15px',
  },
  closeButton: {
    background: 'transparent',
    color: muted,
    border: `1px solid ${border}`,
    padding: '6px 14px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'border-color 0.2s',
  },
  consultaForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  formDivider: {
    borderTop: `1px solid ${borderLight}`,
    margin: '8px 0',
    textAlign: 'center',
    color: mutedLight,
    paddingTop: '8px',
    fontWeight: '500',
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '12px',
  },
  cancelButton: {
    background: 'transparent',
    color: muted,
    border: `1px solid ${border}`,
    padding: '10px 24px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'border-color 0.2s',
    fontFamily: fontBody,
  },
  historialContainer: {
    marginTop: '20px',
    borderTop: `1px solid ${borderLight}`,
    paddingTop: '16px',
  },
  historialList: {
    maxHeight: '200px',
    overflowY: 'auto',
    marginTop: '8px',
  },
  historialItem: {
    background: '#FAFAF8',
    padding: '12px 16px',
    borderRadius: '4px',
    marginBottom: '8px',
    border: `1px solid ${borderLight}`,
  },
  editButtonSmall: {
    ...pastelButton(pastelTeal.bg, pastelTeal.text),
    padding: '4px 10px',
    fontSize: '12px',
  },
  deleteButtonSmall: {
    ...pastelButton(pastelRed.bg, pastelRed.text),
    padding: '4px 10px',
    fontSize: '12px',
  },
  pdfButtonGreen: {
    ...ghostButton,
    padding: '4px 10px',
    fontSize: '11px',
  },
  pdfButtonBlue: {
    ...ghostButton,
    padding: '4px 10px',
    fontSize: '11px',
  },
  pdfButtonOrange: {
    ...ghostButton,
    padding: '4px 10px',
    fontSize: '11px',
  },
  exportButtonSmall: {
    ...pastelButton(pastelOrange.bg, pastelOrange.text),
    padding: '4px 12px',
    fontSize: '12px',
  },
  emailButtonGreen: {
    ...ghostButton,
    padding: '4px 10px',
    fontSize: '10px',
  },
  emailButtonBlue: {
    ...ghostButton,
    padding: '4px 10px',
    fontSize: '10px',
  },
  emailButtonOrange: {
    ...ghostButton,
    padding: '4px 10px',
    fontSize: '10px',
  },
};

export default App;
