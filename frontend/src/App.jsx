import { useState, useEffect } from 'react';
import axios from 'axios';
import jsPDF from 'jspdf';
import Dashboard from './components/Dashboard';
import * as XLSX from 'xlsx';
import toast, { Toaster } from 'react-hot-toast';
import './App.css';

// ===== FUNCIÓN SEGURA PARA MEDICAMENTOS =====
const obtenerMedicamentosArray = (medicamentos) => {
  if (!medicamentos) return ['No se recetaron medicamentos'];
  if (Array.isArray(medicamentos)) return medicamentos;
  if (typeof medicamentos === 'string') {
    return medicamentos.split(',').map(m => m.trim()).filter(m => m);
  }
  return ['No se recetaron medicamentos'];
};

function App() {
  const [usuario, setUsuario] = useState(null);
  const [numEmpleado, setNumEmpleado] = useState('');
  const [password, setPassword] = useState('');
  const [errorLogin, setErrorLogin] = useState('');
  const [mostrarLogin, setMostrarLogin] = useState(true);
  const [pacientes, setPacientes] = useState([]);
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
  const [nuevoUsuario, setNuevoUsuario] = useState({
    num_empleado: '',
    nombre: '',
    rol: 'medico',
    password: ''
  });
  const [mensajeUsuario, setMensajeUsuario] = useState('');
  
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

  // ===== LOGIN =====
  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorLogin('');
    try {
      const response = await axios.post(`${API_URL}/login`, {
        num_empleado: numEmpleado,
        password: password
      });
      if (response.data.success) {
        setUsuario(response.data.user);
        setMostrarLogin(false);
        setNumEmpleado('');
        setPassword('');
        cargarPacientes();
        if (response.data.user.rol === 'admin') {
          cargarUsuarios();
        }
      }
    } catch (error) {
      if (error.response) {
        setErrorLogin(error.response.data.error || 'Error al iniciar sesión');
      } else {
        setErrorLogin('Error de conexión con el servidor');
      }
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

  // ===== PACIENTES =====
  const cargarPacientes = async () => {
    try {
      const response = await axios.get(`${API_URL}/pacientes`);
      setPacientes(response.data);
    } catch (error) {
      console.error('Error al cargar pacientes:', error);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/pacientes`, formData);
      toast.success('✅ Paciente agregado');
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
      cargarPacientes();
    } catch (error) {
      toast.error('❌ Error al agregar paciente');
      console.error(error);
    }
  };

  const handleEliminarPaciente = async (id, nombre) => {
    if (!confirm(`¿Eliminar a ${nombre}?`)) return;
    try {
      await axios.delete(`${API_URL}/pacientes/${id}`);
      toast.success('✅ Paciente eliminado');
      cargarPacientes();
    } catch (error) {
      toast.error('❌ Error al eliminar paciente');
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
      await axios.put(`${API_URL}/pacientes/${pacienteEditando.id}`, formData);
      toast.success('✅ Paciente actualizado');
      setMostrarModalEditar(false);
      setPacienteEditando(null);
      cargarPacientes();
    } catch (error) {
      toast.error('❌ Error al actualizar paciente');
    }
  };

  // ===== USUARIOS =====
  const cargarUsuarios = async () => {
    try {
      const response = await axios.get(`${API_URL}/usuarios`);
      setUsuarios(response.data);
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
    }
  };

  const handleCrearUsuario = async (e) => {
    e.preventDefault();
    setMensajeUsuario('');
    try {
      const response = await axios.post(`${API_URL}/usuarios`, nuevoUsuario);
      toast.success(`✅ Usuario ${nuevoUsuario.nombre} creado`);
      setNuevoUsuario({
        num_empleado: '',
        nombre: '',
        rol: 'medico',
        password: ''
      });
      cargarUsuarios();
    } catch (error) {
      toast.error('❌ Error al crear usuario');
      if (error.response) {
        setMensajeUsuario(`❌ ${error.response.data.error}`);
      } else {
        setMensajeUsuario('❌ Error al crear usuario');
      }
    }
  };

  const handleEliminarUsuario = async (id, numEmpleado) => {
    if (numEmpleado === 'ADMIN001') {
      toast.error('❌ No se puede eliminar al admin principal');
      return;
    }
    if (!confirm(`¿Eliminar al usuario ${numEmpleado}?`)) return;
    try {
      await axios.delete(`${API_URL}/usuarios/${id}`);
      setMensajeUsuario('✅ Usuario eliminado');
      cargarUsuarios();
    } catch (error) {
      if (error.response) {
        setMensajeUsuario(`❌ ${error.response.data.error}`);
      } else {
        setMensajeUsuario('❌ Error al eliminar usuario');
      }
    }
  };

  const handleCambioUsuario = (e) => {
    setNuevoUsuario({
      ...nuevoUsuario,
      [e.target.name]: e.target.value
    });
  };

  // ===== CONSULTAS =====
  const handleAbrirConsulta = async (paciente) => {
    setPacienteSeleccionado(paciente);
    setMostrarConsulta(true);
    setMensajeConsulta('');
    try {
      const response = await axios.get(`${API_URL}/consultas/${paciente.id}`);
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
      await axios.post(`${API_URL}/consultas`, {
        ...consultaForm,
        paciente_id: pacienteSeleccionado.id
      });
      setMensajeConsulta('✅ Consulta registrada');
      const response = await axios.get(`${API_URL}/consultas/${pacienteSeleccionado.id}`);
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
      setMensajeConsulta('❌ Error al registrar consulta');
      console.error(error);
    }
  };

  const handleEliminarConsulta = async (id) => {
    if (!confirm('¿Eliminar esta consulta?')) return;
    try {
      await axios.delete(`${API_URL}/consultas/${id}`);
      toast.success('✅ Consulta eliminada');
      const response = await axios.get(`${API_URL}/consultas/${pacienteSeleccionado.id}`);
      setConsultasPaciente(response.data);
    } catch (error) {
      toast.error('❌ Error al eliminar consulta');
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
      await axios.put(`${API_URL}/consultas/${consultaEditando.id}`, {
        ...consultaForm,
        paciente_id: pacienteSeleccionado.id
      });
      toast.success('✅ Consulta actualizada');
      setMostrarModalEditarConsulta(false);
      setConsultaEditando(null);
      const response = await axios.get(`${API_URL}/consultas/${pacienteSeleccionado.id}`);
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
      toast.error('❌ Error al actualizar consulta');
    }
  };

  // ===== EXÁMENES =====
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
      const response = await axios.get(`${API_URL}/${tipo}/${paciente.id}`);
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
      await axios.post(`${API_URL}/${tipoExamen}`, {
        ...examenForm,
        paciente_id: pacienteSeleccionado.id
      });
      setMensajeExamen(`✅ ${tipoExamen.toUpperCase()} registrado`);
      const response = await axios.get(`${API_URL}/${tipoExamen}/${pacienteSeleccionado.id}`);
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
      setMensajeExamen(`❌ Error al registrar ${tipoExamen.toUpperCase()}`);
      console.error(error);
    }
  };

  // ===== PDFs =====
  const generarConstanciaPDF = (consulta, paciente) => {
    const doc = new jsPDF();
    const fecha = new Date().toLocaleDateString('es-MX');
    
    doc.setFontSize(18);
    doc.text('🏥 BO Synergy', 105, 20, { align: 'center' });
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
    doc.text('Este documento es una constancia de la consulta realizada en BO Synergy.', 20, yPos + 85);
    doc.text('Atentamente,', 20, yPos + 95);
    doc.text('_________________________', 20, yPos + 105);
    doc.text('Médico Responsable', 20, yPos + 115);
    
    doc.save(`Constancia_${paciente.nombre}_${consulta.fecha}.pdf`);
  };

  const generarRecetaPDF = (consulta, paciente) => {
    const doc = new jsPDF();
    const fecha = new Date().toLocaleDateString('es-MX');
    
    doc.setFontSize(20);
    doc.text('🏥 BO Synergy', 105, 20, { align: 'center' });
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
    
    // ===== CORRECCIÓN: Usar función helper =====
    const medicamentos = obtenerMedicamentosArray(consulta.medicamentos);
    
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
    doc.text('🏥 BO Synergy', 105, 20, { align: 'center' });
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

  // ===== EXPORTAR EXCEL =====
  const exportarPacientesExcel = () => {
    if (pacientes.length === 0) {
      toast.error('❌ No hay pacientes para exportar');
      return;
    }
    const datos = pacientes.map(p => ({
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
    const colWidths = [{ wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];
    ws['!cols'] = colWidths;
    XLSX.writeFile(wb, `Pacientes_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(`✅ ${pacientes.length} pacientes exportados`);
  };

  const exportarConsultasExcel = () => {
    if (consultasPaciente.length === 0) {
      toast.error('❌ No hay consultas para exportar');
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
    XLSX.writeFile(wb, `Consultas_${pacienteSeleccionado?.nombre || 'paciente'}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(`✅ ${consultasPaciente.length} consultas exportadas`);
  };

  const exportarEstadisticasExcel = async () => {
    try {
      const [statsRes, motivosRes, areasRes, pacientesAreaRes] = await Promise.all([
        axios.get(`${API_URL}/estadisticas`),
        axios.get(`${API_URL}/top-motivos`),
        axios.get(`${API_URL}/top-areas`),
        axios.get(`${API_URL}/pacientes-por-area`),
      ]);
      const stats = statsRes.data;
      const motivos = motivosRes.data;
      const areas = areasRes.data;
      const pacientesArea = pacientesAreaRes.data;
      const wb = XLSX.utils.book_new();
      const resumenData = [
        ['📊 RESUMEN DE ESTADÍSTICAS'],
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
        const motivosData = [['🏆 TOP 5 MOTIVOS DE CONSULTA'], [''], ['Motivo', 'Cantidad']];
        motivos.forEach(m => motivosData.push([m.motivo, m.count]));
        const ws2 = XLSX.utils.aoa_to_sheet(motivosData);
        XLSX.utils.book_append_sheet(wb, ws2, 'Top Motivos');
      }
      XLSX.writeFile(wb, `Estadisticas_BO_Synergy_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('✅ Estadísticas exportadas');
    } catch (error) {
      toast.error('❌ Error al exportar estadísticas');
    }
  };

  const exportarUsuariosExcel = () => {
    if (usuarios.length === 0) {
      toast.error('❌ No hay usuarios para exportar');
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
    XLSX.writeFile(wb, `Usuarios_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(`✅ ${usuarios.length} usuarios exportados`);
  };

  // ===== ENVIAR CORREOS =====
  const enviarCorreoPDF = async (consulta, paciente, tipo) => {
    const destinatario = prompt('📧 Ingresa el correo electrónico:');
    if (!destinatario) return;
    if (!destinatario.includes('@') || !destinatario.includes('.')) {
      toast.error('❌ Correo inválido');
      return;
    }
    try {
      const doc = new jsPDF();
      const fecha = new Date().toLocaleDateString('es-MX');
      doc.setFontSize(18);
      doc.text('🏥 BO Synergy', 105, 20, { align: 'center' });
      doc.setFontSize(14);
      if (tipo === 'constancia') doc.text('CONSTANCIA DE CONSULTA', 105, 30, { align: 'center' });
      else if (tipo === 'receta') doc.text('R E C E T A   M É D I C A', 105, 30, { align: 'center' });
      else if (tipo === 'incapacidad') doc.text('REPORTE DE INCAPACIDAD', 105, 30, { align: 'center' });
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
        const sintomas = [consulta.cabeza && `Cabeza: ${consulta.cabeza}`, consulta.cuello && `Cuello: ${consulta.cuello}`, consulta.torax && `Tórax: ${consulta.torax}`, consulta.abdomen && `Abdomen: ${consulta.abdomen}`, consulta.espalda && `Espalda: ${consulta.espalda}`, consulta.extremidades_superiores && `Extremidades Superiores: ${consulta.extremidades_superiores}`, consulta.extremidades_inferiores && `Extremidades Inferiores: ${consulta.extremidades_inferiores}`, consulta.ojos_oidos_garganta && `Ojos/Oídos/Garganta: ${consulta.ojos_oidos_garganta}`].filter(Boolean);
        let yPos = 125;
        sintomas.forEach(s => { doc.text(`• ${s}`, 25, yPos); yPos += 8; });
        if (consulta.causa) { doc.text(`Causa probable: ${consulta.causa}`, 20, yPos + 5); yPos += 12; }
        doc.text('---', 20, yPos + 5);
        doc.setFontSize(14);
        doc.text('Diagnóstico y Tratamiento', 20, yPos + 18);
        doc.setFontSize(12);
        doc.text(`Impresión Diagnóstica: ${consulta.impresion_diagnostica || 'Pendiente'}`, 20, yPos + 30);
        if (consulta.cie10) doc.text(`CIE-10: ${consulta.cie10}`, 20, yPos + 40);
        if (consulta.medicamentos) doc.text(`Medicamentos: ${consulta.medicamentos}`, 20, yPos + 50);
        if (consulta.receta) doc.text(`Receta: ${consulta.receta}`, 20, yPos + 60);
      } else if (tipo === 'receta') {
        doc.text('Medicamentos Recetados:', 20, 125);
        // ===== CORRECCIÓN: Usar función helper =====
        const medicamentos = obtenerMedicamentosArray(consulta.medicamentos);
        let yPos = 135;
        medicamentos.forEach((med, i) => {
          doc.text(`${i + 1}. ${med}`, 25, yPos);
          yPos += 10;
        });
        if (consulta.receta) doc.text(`Número de Receta: ${consulta.receta}`, 20, yPos + 10);
        doc.text(`Diagnóstico: ${consulta.impresion_diagnostica || 'No especificado'}`, 20, yPos + 30);
        if (consulta.cie10) doc.text(`CIE-10: ${consulta.cie10}`, 20, yPos + 40);
      } else if (tipo === 'incapacidad') {
        doc.text(`Diagnóstico: ${consulta.impresion_diagnostica || 'Pendiente'}`, 20, 125);
        if (consulta.cie10) doc.text(`CIE-10: ${consulta.cie10}`, 20, 135);
        doc.text('---', 20, 148);
        doc.setFontSize(10);
        doc.text('El paciente presenta incapacidad para realizar sus actividades laborales.', 20, 160);
        doc.text('Se recomienda reposo y seguimiento médico.', 20, 170);
        doc.text('_________________________', 20, 185);
        doc.text('Médico Responsable', 20, 195);
      }
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      const response = await axios.post(`${API_URL}/enviar-${tipo}`, {
        destinatario, paciente, consulta, pdfBase64
      });
      if (response.data.success) {
        toast.success(`✅ ${tipo.charAt(0).toUpperCase() + tipo.slice(1)} enviada a ${destinatario}`);
      }
    } catch (error) {
      console.error('Error al enviar correo:', error);
      toast.error('❌ Error al enviar el correo');
    }
  };

  // ===== PANTALLA DE LOGIN =====
  if (mostrarLogin) {
    return (
      <>
        <Toaster position="top-right" />
        <div style={styles.loginContainer}>
          <div style={styles.loginBox}>
            <h1 style={styles.title}>🏥 BO Synergy</h1>
            <h2 style={styles.subtitle}>Salud Ocupacional</h2>
            <p style={styles.welcomeText}>Inicia sesión para continuar</p>
            {errorLogin && <div style={styles.errorBox}>❌ {errorLogin}</div>}
            <form onSubmit={handleLogin}>
              <input type="text" placeholder="Número de empleado" value={numEmpleado} onChange={(e) => setNumEmpleado(e.target.value)} style={styles.input} required />
              <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} style={styles.input} required />
              <button type="submit" style={styles.loginButton}>Iniciar Sesión</button>
            </form>
            <div style={styles.testCredentials}>
              <p>👨‍💻 Usuarios de prueba:</p>
              <p><strong>Admin:</strong> ADMIN001 / admin123</p>
              <p><strong>Médico:</strong> MED001 / medico123</p>
              <p><strong>Enfermera:</strong> ENF001 / enfermera123</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ===== PANTALLA PRINCIPAL (SIMPLIFICADA) =====
  return (
    <div style={styles.appContainer}>
      <Toaster position="top-right" />
      
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerTitle}>🏥 BO Synergy</span>
          <span style={styles.headerRole}>👤 {usuario.nombre}</span>
          <span style={{
            ...styles.headerBadge,
            background: usuario.rol === 'admin' ? '#dc3545' : usuario.rol === 'medico' ? '#28a745' : '#ffc107',
            color: usuario.rol === 'enfermera' ? '#333' : 'white'
          }}>
            {usuario.rol === 'admin' ? '👑 Admin' : usuario.rol === 'medico' ? '🩺 Médico' : '💉 Enfermera'}
          </span>
        </div>
        <button onClick={handleLogout} style={styles.logoutButton}>Cerrar Sesión</button>
      </div>

      <div style={styles.content}>
        <div style={styles.welcomeSection}>
          {usuario.rol === 'admin' && <p style={styles.welcomeText}>👑 Bienvenido Administrador.</p>}
          {usuario.rol === 'medico' && <p style={styles.welcomeText}>🩺 Bienvenido Médico.</p>}
          {usuario.rol === 'enfermera' && <p style={styles.welcomeText}>💉 Bienvenida Enfermera.</p>}
        </div>

        <div style={styles.mainGrid}>
          <div style={styles.formCard}>
            <h2>📝 Registrar Paciente</h2>
            <form onSubmit={handleSubmit}>
              <input name="num_empleado" placeholder="Número de empleado" value={formData.num_empleado} onChange={handleChange} required />
              <input name="nombre" placeholder="Nombre completo" value={formData.nombre} onChange={handleChange} required />
              <input name="fecha_nac" placeholder="Fecha nacimiento (YYYY-MM-DD)" value={formData.fecha_nac} onChange={handleChange} />
              <input name="nss" placeholder="NSS" value={formData.nss} onChange={handleChange} />
              <input name="contacto_emergencia" placeholder="Contacto de emergencia" value={formData.contacto_emergencia} onChange={handleChange} />
              <input name="puesto" placeholder="Puesto" value={formData.puesto} onChange={handleChange} />
              <input name="area" placeholder="Área" value={formData.area} onChange={handleChange} />
              <input name="supervisor" placeholder="Supervisor" value={formData.supervisor} onChange={handleChange} />
              <button type="submit" style={styles.saveButton}>Guardar Paciente</button>
            </form>
          </div>

          <div style={styles.listCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0 }}>📋 Pacientes Registrados</h2>
              <button onClick={exportarPacientesExcel} style={styles.exportButton}>📊 Exportar Excel</button>
            </div>
            {pacientes.length === 0 ? (
              <p style={styles.emptyText}>No hay pacientes aún</p>
            ) : (
              <ul style={styles.patientList}>
                {pacientes.map(p => (
                  <li key={p.id} style={styles.patientItem}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <strong>{p.nombre}</strong>
                        <span style={styles.patientInfo}>Empleado: {p.num_empleado} - Área: {p.area}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        <button onClick={() => handleAbrirConsulta(p)} style={styles.consultaButton}>📋 Consulta</button>
                        {(usuario.rol === 'admin' || usuario.rol === 'medico') && (
                          <>
                            <button onClick={() => handleAbrirExamen('emi', p)} style={styles.emiButton}>EMI</button>
                            <button onClick={() => handleAbrirExamen('emp', p)} style={styles.empButton}>EMP</button>
                            <button onClick={() => handleAbrirExamen('emr', p)} style={styles.emrButton}>EMR</button>
                            <button onClick={() => handleAbrirExamen('vulnerabilidad', p)} style={styles.vulnerabilidadButton}>Vuln</button>
                          </>
                        )}
                        <button onClick={() => handleEditarPaciente(p)} style={styles.editButton}>✏️</button>
                        <button onClick={() => handleEliminarPaciente(p.id, p.nombre)} style={styles.deleteButton}>🗑️</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {usuario && usuario.rol === 'admin' && (
          <div style={styles.adminSection}>
            <h2 style={styles.sectionTitle}>👥 Gestión de Usuarios</h2>
            {mensajeUsuario && (
              <div style={{
                ...styles.mensajeBox,
                background: mensajeUsuario.includes('✅') ? '#d4edda' : '#f8d7da',
                color: mensajeUsuario.includes('✅') ? '#155724' : '#721c24'
              }}>
                {mensajeUsuario}
              </div>
            )}
            <div style={styles.adminGrid}>
              <div style={styles.formCard}>
                <h3>➕ Crear Nuevo Usuario</h3>
                <form onSubmit={handleCrearUsuario}>
                  <input name="num_empleado" placeholder="Número de empleado *" value={nuevoUsuario.num_empleado} onChange={handleCambioUsuario} required />
                  <input name="nombre" placeholder="Nombre completo *" value={nuevoUsuario.nombre} onChange={handleCambioUsuario} required />
                  <select name="rol" value={nuevoUsuario.rol} onChange={handleCambioUsuario} style={styles.select} required>
                    <option value="admin">Administrador</option>
                    <option value="medico">Médico</option>
                    <option value="enfermera">Enfermera</option>
                  </select>
                  <input name="password" type="password" placeholder="Contraseña *" value={nuevoUsuario.password} onChange={handleCambioUsuario} required />
                  <button type="submit" style={styles.createButton}>Crear Usuario</button>
                </form>
              </div>
              <div style={styles.listCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0 }}>📋 Lista de Usuarios</h3>
                  <button onClick={exportarUsuariosExcel} style={styles.exportButton}>📊 Exportar Excel</button>
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
                            background: u.rol === 'admin' ? '#dc3545' : u.rol === 'medico' ? '#28a745' : '#ffc107',
                            color: u.rol === 'enfermera' ? '#333' : 'white'
                          }}>
                            {u.rol === 'admin' ? '👑 Admin' : u.rol === 'medico' ? '🩺 Médico' : '💉 Enfermera'}
                          </span>
                          <span style={styles.userDate}>📅 {new Date(u.fecha_registro).toLocaleDateString('es-MX')}</span>
                        </div>
                        <button onClick={() => handleEliminarUsuario(u.id, u.num_empleado)} style={styles.deleteButton} disabled={u.num_empleado === 'ADMIN001'}>🗑️</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {(usuario.rol === 'admin' || usuario.rol === 'medico') && (
          <div style={styles.dashboardSection}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: '#1a5bbf' }}>📊 Dashboard de Estadísticas</h2>
              <button onClick={exportarEstadisticasExcel} style={styles.exportButton}>📊 Exportar</button>
            </div>
            <Dashboard />
          </div>
        )}

        {/* MODALES */}
        {mostrarModalEditar && pacienteEditando && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
              <div style={styles.modalHeader}>
                <h2>✏️ Editar Paciente</h2>
                <button onClick={() => setMostrarModalEditar(false)} style={styles.closeButton}>✕</button>
              </div>
              <form onSubmit={handleActualizarPaciente}>
                <input name="num_empleado" placeholder="Número de empleado" value={formData.num_empleado} onChange={handleChange} required />
                <input name="nombre" placeholder="Nombre completo" value={formData.nombre} onChange={handleChange} required />
                <input name="fecha_nac" placeholder="Fecha nacimiento (YYYY-MM-DD)" value={formData.fecha_nac} onChange={handleChange} />
                <input name="nss" placeholder="NSS" value={formData.nss} onChange={handleChange} />
                <input name="contacto_emergencia" placeholder="Contacto de emergencia" value={formData.contacto_emergencia} onChange={handleChange} />
                <input name="puesto" placeholder="Puesto" value={formData.puesto} onChange={handleChange} />
                <input name="area" placeholder="Área" value={formData.area} onChange={handleChange} />
                <input name="supervisor" placeholder="Supervisor" value={formData.supervisor} onChange={handleChange} />
                <div style={styles.buttonRow}>
                  <button type="button" onClick={() => setMostrarModalEditar(false)} style={styles.cancelButton}>Cancelar</button>
                  <button type="submit" style={styles.saveButton}>Actualizar Paciente</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {mostrarConsulta && pacienteSeleccionado && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
              <div style={styles.modalHeader}>
                <div>
                  <h2>📋 Consulta Diaria</h2>
                  <h3>Paciente: {pacienteSeleccionado.nombre}</h3>
                </div>
                <button onClick={handleCerrarConsulta} style={styles.closeButton}>✕</button>
              </div>
              {mensajeConsulta && (
                <div style={{
                  ...styles.mensajeBox,
                  background: mensajeConsulta.includes('✅') ? '#d4edda' : '#f8d7da',
                  color: mensajeConsulta.includes('✅') ? '#155724' : '#721c24'
                }}>
                  {mensajeConsulta}
                </div>
              )}
              <form onSubmit={handleGuardarConsulta} style={styles.consultaForm}>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>📅 Fecha</label>
                    <input type="date" name="fecha" value={consultaForm.fecha} onChange={handleChangeConsulta} required />
                  </div>
                  <div style={styles.formGroup}>
                    <label>🤧 ¿Tiene alergias?</label>
                    <select name="alergias" value={consultaForm.alergias} onChange={handleChangeConsulta}>
                      <option value="no">No</option>
                      <option value="si">Sí</option>
                    </select>
                  </div>
                </div>
                <div style={styles.formGroup}>
                  <label>📝 Motivo de consulta</label>
                  <textarea name="motivo" value={consultaForm.motivo} onChange={handleChangeConsulta} rows="2" placeholder="Describa el motivo..." required />
                </div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>👤 Cabeza</label>
                    <input name="cabeza" value={consultaForm.cabeza} onChange={handleChangeConsulta} placeholder="Síntomas en cabeza" />
                  </div>
                  <div style={styles.formGroup}>
                    <label>🦴 Cuello</label>
                    <input name="cuello" value={consultaForm.cuello} onChange={handleChangeConsulta} placeholder="Síntomas en cuello" />
                  </div>
                </div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>🫁 Tórax</label>
                    <input name="torax" value={consultaForm.torax} onChange={handleChangeConsulta} placeholder="Síntomas en tórax" />
                  </div>
                  <div style={styles.formGroup}>
                    <label>🦵 Extremidades superiores</label>
                    <input name="extremidades_superiores" value={consultaForm.extremidades_superiores} onChange={handleChangeConsulta} placeholder="Brazo, hombro, mano" />
                  </div>
                </div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>🦶 Extremidades inferiores</label>
                    <input name="extremidades_inferiores" value={consultaForm.extremidades_inferiores} onChange={handleChangeConsulta} placeholder="Pierna, pie" />
                  </div>
                  <div style={styles.formGroup}>
                    <label>💪 Abdomen</label>
                    <input name="abdomen" value={consultaForm.abdomen} onChange={handleChangeConsulta} placeholder="Síntomas en abdomen" />
                  </div>
                </div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>🔙 Espalda</label>
                    <input name="espalda" value={consultaForm.espalda} onChange={handleChangeConsulta} placeholder="Síntomas en espalda" />
                  </div>
                  <div style={styles.formGroup}>
                    <label>👀 Ojos, Oídos o Garganta</label>
                    <input name="ojos_oidos_garganta" value={consultaForm.ojos_oidos_garganta} onChange={handleChangeConsulta} placeholder="Síntomas en ojos, oídos o garganta" />
                  </div>
                </div>
                <div style={styles.formGroup}>
                  <label>🔍 Describa cuál cree es la causa</label>
                  <textarea name="causa" value={consultaForm.causa} onChange={handleChangeConsulta} rows="2" placeholder="¿Qué cree que está causando los síntomas?" />
                </div>
                <div style={styles.formDivider}>--- Sección Médica ---</div>
                <div style={styles.formGroup}>
                  <label>🩺 Impresión Diagnóstica</label>
                  <textarea name="impresion_diagnostica" value={consultaForm.impresion_diagnostica} onChange={handleChangeConsulta} rows="2" placeholder="Diagnóstico del médico" />
                </div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>💊 Medicamentos</label>
                    <input name="medicamentos" value={consultaForm.medicamentos} onChange={handleChangeConsulta} placeholder="Medicamentos recetados" />
                  </div>
                  <div style={styles.formGroup}>
                    <label>📄 Receta</label>
                    <input name="receta" value={consultaForm.receta} onChange={handleChangeConsulta} placeholder="Número de receta o detalles" />
                  </div>
                </div>
                <div style={styles.formGroup}>
                  <label>📋 CIE-10</label>
                  <input name="cie10" value={consultaForm.cie10} onChange={handleChangeConsulta} placeholder="Código CIE-10" />
                </div>
                <div style={styles.buttonRow}>
                  <button type="button" onClick={handleCerrarConsulta} style={styles.cancelButton}>Cancelar</button>
                  <button type="submit" style={styles.saveButton}>Guardar Consulta</button>
                </div>
              </form>
              {consultasPaciente.length > 0 && (
                <div style={styles.historialContainer}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0 }}>📜 Historial de Consultas</h4>
                    <button onClick={exportarConsultasExcel} style={styles.exportButtonSmall}>📊 Exportar Excel</button>
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
                              <button onClick={() => handleEditarConsulta(c)} style={styles.editButtonSmall}>✏️</button>
                              <button onClick={() => handleEliminarConsulta(c.id)} style={styles.deleteButtonSmall}>🗑️</button>
                            </div>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              <button onClick={() => generarConstanciaPDF(c, pacienteSeleccionado)} style={styles.pdfButtonGreen}>📄 Constancia</button>
                              <button onClick={() => generarRecetaPDF(c, pacienteSeleccionado)} style={styles.pdfButtonBlue}>💊 Receta</button>
                              <button onClick={() => generarIncapacidadPDF(c, pacienteSeleccionado)} style={styles.pdfButtonOrange}>🏥 Incapacidad</button>
                            </div>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                              <button onClick={() => enviarCorreoPDF(c, pacienteSeleccionado, 'constancia')} style={styles.emailButtonGreen}>✉️ Enviar Constancia</button>
                              <button onClick={() => enviarCorreoPDF(c, pacienteSeleccionado, 'receta')} style={styles.emailButtonBlue}>✉️ Enviar Receta</button>
                              <button onClick={() => enviarCorreoPDF(c, pacienteSeleccionado, 'incapacidad')} style={styles.emailButtonOrange}>✉️ Enviar Incapacidad</button>
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

        {mostrarModalEditarConsulta && consultaEditando && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
              <div style={styles.modalHeader}>
                <h2>✏️ Editar Consulta</h2>
                <button onClick={() => setMostrarModalEditarConsulta(false)} style={styles.closeButton}>✕</button>
              </div>
              <form onSubmit={handleActualizarConsulta} style={styles.consultaForm}>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>📅 Fecha</label>
                    <input type="date" name="fecha" value={consultaForm.fecha} onChange={handleChangeConsulta} required />
                  </div>
                  <div style={styles.formGroup}>
                    <label>🤧 ¿Tiene alergias?</label>
                    <select name="alergias" value={consultaForm.alergias} onChange={handleChangeConsulta}>
                      <option value="no">No</option>
                      <option value="si">Sí</option>
                    </select>
                  </div>
                </div>
                <div style={styles.formGroup}>
                  <label>📝 Motivo de consulta</label>
                  <textarea name="motivo" value={consultaForm.motivo} onChange={handleChangeConsulta} rows="2" placeholder="Describa el motivo..." required />
                </div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>👤 Cabeza</label>
                    <input name="cabeza" value={consultaForm.cabeza} onChange={handleChangeConsulta} placeholder="Síntomas en cabeza" />
                  </div>
                  <div style={styles.formGroup}>
                    <label>🦴 Cuello</label>
                    <input name="cuello" value={consultaForm.cuello} onChange={handleChangeConsulta} placeholder="Síntomas en cuello" />
                  </div>
                </div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>🫁 Tórax</label>
                    <input name="torax" value={consultaForm.torax} onChange={handleChangeConsulta} placeholder="Síntomas en tórax" />
                  </div>
                  <div style={styles.formGroup}>
                    <label>🦵 Extremidades superiores</label>
                    <input name="extremidades_superiores" value={consultaForm.extremidades_superiores} onChange={handleChangeConsulta} placeholder="Brazo, hombro, mano" />
                  </div>
                </div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>🦶 Extremidades inferiores</label>
                    <input name="extremidades_inferiores" value={consultaForm.extremidades_inferiores} onChange={handleChangeConsulta} placeholder="Pierna, pie" />
                  </div>
                  <div style={styles.formGroup}>
                    <label>💪 Abdomen</label>
                    <input name="abdomen" value={consultaForm.abdomen} onChange={handleChangeConsulta} placeholder="Síntomas en abdomen" />
                  </div>
                </div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>🔙 Espalda</label>
                    <input name="espalda" value={consultaForm.espalda} onChange={handleChangeConsulta} placeholder="Síntomas en espalda" />
                  </div>
                  <div style={styles.formGroup}>
                    <label>👀 Ojos, Oídos o Garganta</label>
                    <input name="ojos_oidos_garganta" value={consultaForm.ojos_oidos_garganta} onChange={handleChangeConsulta} placeholder="Síntomas en ojos, oídos o garganta" />
                  </div>
                </div>
                <div style={styles.formGroup}>
                  <label>🔍 Describa cuál cree es la causa</label>
                  <textarea name="causa" value={consultaForm.causa} onChange={handleChangeConsulta} rows="2" placeholder="¿Qué cree que está causando los síntomas?" />
                </div>
                <div style={styles.formDivider}>--- Sección Médica ---</div>
                <div style={styles.formGroup}>
                  <label>🩺 Impresión Diagnóstica</label>
                  <textarea name="impresion_diagnostica" value={consultaForm.impresion_diagnostica} onChange={handleChangeConsulta} rows="2" placeholder="Diagnóstico del médico" />
                </div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>💊 Medicamentos</label>
                    <input name="medicamentos" value={consultaForm.medicamentos} onChange={handleChangeConsulta} placeholder="Medicamentos recetados" />
                  </div>
                  <div style={styles.formGroup}>
                    <label>📄 Receta</label>
                    <input name="receta" value={consultaForm.receta} onChange={handleChangeConsulta} placeholder="Número de receta o detalles" />
                  </div>
                </div>
                <div style={styles.formGroup}>
                  <label>📋 CIE-10</label>
                  <input name="cie10" value={consultaForm.cie10} onChange={handleChangeConsulta} placeholder="Código CIE-10" />
                </div>
                <div style={styles.buttonRow}>
                  <button type="button" onClick={() => setMostrarModalEditarConsulta(false)} style={styles.cancelButton}>Cancelar</button>
                  <button type="submit" style={styles.saveButton}>Actualizar Consulta</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {mostrarExamen && pacienteSeleccionado && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
              <div style={styles.modalHeader}>
                <div>
                  <h2>📋 {tipoExamen.toUpperCase()} - Examen Especial</h2>
                  <h3>Paciente: {pacienteSeleccionado.nombre}</h3>
                </div>
                <button onClick={handleCerrarExamen} style={styles.closeButton}>✕</button>
              </div>
              {mensajeExamen && (
                <div style={{
                  ...styles.mensajeBox,
                  background: mensajeExamen.includes('✅') ? '#d4edda' : '#f8d7da',
                  color: mensajeExamen.includes('✅') ? '#155724' : '#721c24'
                }}>
                  {mensajeExamen}
                </div>
              )}
              <form onSubmit={handleGuardarExamen} style={styles.consultaForm}>
                <div style={styles.formGroup}>
                  <label>📅 Fecha</label>
                  <input type="date" name="fecha" value={examenForm.fecha || ''} onChange={handleChangeExamen} required />
                </div>
                <div style={styles.formDivider}>--- Diagnóstico y Exploración ---</div>
                <div style={styles.formGroup}>
                  <label>🩺 Impresión Diagnóstica</label>
                  <textarea name="impresion_diagnostica" value={examenForm.impresion_diagnostica || ''} onChange={handleChangeExamen} rows="2" placeholder="Diagnóstico del médico" />
                </div>
                <div style={styles.formGroup}>
                  <label>📋 CIE-10</label>
                  <input name="cie10" value={examenForm.cie10 || ''} onChange={handleChangeExamen} placeholder="Código CIE-10" />
                </div>
                <div style={styles.formGroup}>
                  <label>🩺 Exploración Física</label>
                  <textarea name="exploracion_fisica" value={examenForm.exploracion_fisica || ''} onChange={handleChangeExamen} rows="2" placeholder="Resultados de la exploración física" />
                </div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label>📊 Signos Vitales</label>
                    <input name="signos_vitales" value={examenForm.signos_vitales || ''} onChange={handleChangeExamen} placeholder="TA, FC, FR, Temp" />
                  </div>
                  <div style={styles.formGroup}>
                    <label>👁️ Agudeza Visual</label>
                    <input name="agudeza_visual" value={examenForm.agudeza_visual || ''} onChange={handleChangeExamen} placeholder="Resultado de agudeza visual" />
                  </div>
                </div>
                <div style={styles.buttonRow}>
                  <button type="button" onClick={handleCerrarExamen} style={styles.cancelButton}>Cancelar</button>
                  <button type="submit" style={styles.saveButton}>Guardar Examen</button>
                </div>
              </form>
              {examenesPaciente.length > 0 && (
                <div style={styles.historialContainer}>
                  <h4>📜 Historial de {tipoExamen.toUpperCase()}</h4>
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
const styles = {
  loginContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1a5bbf 0%, #2c7be5 100%)',
    fontFamily: 'Arial, sans-serif',
    padding: '20px'
  },
  loginBox: {
    background: 'white',
    padding: '40px',
    borderRadius: '16px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
    width: '100%',
    maxWidth: '400px',
    textAlign: 'center'
  },
  title: { fontSize: '32px', color: '#1a5bbf', margin: 0 },
  subtitle: { fontSize: '18px', color: '#666', margin: '8px 0 24px 0' },
  welcomeText: { color: '#666', marginBottom: '20px' },
  errorBox: { background: '#fee', color: '#c00', padding: '10px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' },
  input: { display: 'block', width: '100%', padding: '12px', margin: '8px 0', border: '1px solid #ddd', borderRadius: '8px', fontSize: '16px', boxSizing: 'border-box' },
  loginButton: { width: '100%', padding: '14px', background: '#2c7be5', color: 'white', border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', marginTop: '12px' },
  testCredentials: { marginTop: '24px', padding: '16px', background: '#f8f9fa', borderRadius: '8px', fontSize: '13px', textAlign: 'left' },
  appContainer: { fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: '#f0f2f5' },
  header: { background: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '20px' },
  headerTitle: { fontSize: '20px', fontWeight: 'bold', color: '#1a5bbf' },
  headerRole: { fontSize: '16px', color: '#333' },
  headerBadge: { padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' },
  logoutButton: { background: '#dc3545', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' },
  content: { padding: '24px', maxWidth: '1200px', margin: '0 auto' },
  welcomeSection: { background: '#e8f4fd', padding: '12px 20px', borderRadius: '8px', marginBottom: '20px', borderLeft: '4px solid #2c7be5' },
  welcomeText: { margin: 0, fontSize: '16px', color: '#1a5bbf' },
  mainGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' },
  formCard: { background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  listCard: { background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  emptyText: { color: '#999', textAlign: 'center', padding: '20px 0' },
  patientList: { listStyle: 'none', padding: 0 },
  patientItem: { borderBottom: '1px solid #eee', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: '4px' },
  patientInfo: { color: '#666', fontSize: '14px' },
  saveButton: { background: '#28a745', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '6px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', marginTop: '8px', width: '100%' },
  adminSection: { marginTop: '40px', paddingTop: '40px', borderTop: '2px solid #e0e0e0' },
  sectionTitle: { fontSize: '24px', color: '#333', marginBottom: '20px' },
  adminGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' },
  select: { display: 'block', width: '100%', padding: '10px', margin: '6px 0', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', background: 'white' },
  mensajeBox: { padding: '12px', borderRadius: '8px', marginBottom: '16px', fontWeight: 'bold' },
  createButton: { background: '#28a745', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '6px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', marginTop: '8px', width: '100%' },
  userItem: { borderBottom: '1px solid #eee', padding: '12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  userInfo: { display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 },
  userDetail: { color: '#666', fontSize: '14px' },
  roleBadge: { display: 'inline-block', padding: '2px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', width: 'fit-content' },
  userDate: { color: '#999', fontSize: '12px' },
  deleteButton: { background: '#dc3545', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' },
  editButton: { background: '#ffc107', color: '#333', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' },
  consultaButton: { background: '#17a2b8', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap' },
  emiButton: { background: '#6f42c1', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' },
  empButton: { background: '#e83e8c', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' },
  emrButton: { background: '#fd7e14', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' },
  vulnerabilidadButton: { background: '#dc3545', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' },
  dashboardSection: { marginTop: '40px', paddingTop: '40px', borderTop: '2px solid #e0e0e0' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' },
  modalContent: { background: 'white', borderRadius: '16px', padding: '30px', maxWidth: '800px', width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #eee', paddingBottom: '15px' },
  closeButton: { background: '#dc3545', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' },
  consultaForm: { display: 'flex', flexDirection: 'column', gap: '12px' },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
  formDivider: { borderTop: '2px solid #eee', margin: '8px 0', textAlign: 'center', color: '#999', paddingTop: '8px' },
  buttonRow: { display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' },
  cancelButton: { background: '#6c757d', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' },
  historialContainer: { marginTop: '20px', borderTop: '2px solid #eee', paddingTop: '16px' },
  historialList: { maxHeight: '200px', overflowY: 'auto', marginTop: '8px' },
  historialItem: { background: '#f8f9fa', padding: '10px', borderRadius: '6px', marginBottom: '8px' },
  editButtonSmall: { background: '#ffc107', color: '#333', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
  deleteButtonSmall: { background: '#dc3545', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
  pdfButtonGreen: { background: '#28a745', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' },
  pdfButtonBlue: { background: '#007bff', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' },
  pdfButtonOrange: { background: '#fd7e14', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' },
  exportButton: { background: '#28a745', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' },
  exportButtonSmall: { background: '#28a745', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' },
  emailButtonGreen: { background: '#28a745', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' },
  emailButtonBlue: { background: '#007bff', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' },
  emailButtonOrange: { background: '#fd7e14', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }
};

export default App;