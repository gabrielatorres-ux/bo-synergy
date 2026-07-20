import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
} from 'chart.js';
import { Bar, Pie, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

function Dashboard() {
  const [estadisticas, setEstadisticas] = useState(null);
  const [topMotivos, setTopMotivos] = useState([]);
  const [topAreas, setTopAreas] = useState([]);
  const [consultasPorMes, setConsultasPorMes] = useState([]);
  const [pacientesPorArea, setPacientesPorArea] = useState([]);
  const [cargando, setCargando] = useState(true);

  const API_URL = 'https://bo-synergy-backend.onrender.com/api';

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const [statsRes, motivosRes, areasRes, mesRes, pacientesAreaRes] = await Promise.all([
        axios.get(`${API_URL}/estadisticas`),
        axios.get(`${API_URL}/top-motivos`),
        axios.get(`${API_URL}/top-areas`),
        axios.get(`${API_URL}/consultas-por-mes`),
        axios.get(`${API_URL}/pacientes-por-area`),
      ]);

      setEstadisticas(statsRes.data);
      setTopMotivos(motivosRes.data);
      setTopAreas(areasRes.data);
      setConsultasPorMes(mesRes.data);
      setPacientesPorArea(pacientesAreaRes.data);
      setCargando(false);
    } catch (error) {
      console.error('Error al cargar estadísticas:', error);
      setCargando(false);
    }
  };

  if (cargando) {
    return (
      <div style={styles.loading}>
        <h2>📊 Cargando estadísticas...</h2>
      </div>
    );
  }

  const colores = ['#2c7be5', '#28a745', '#dc3545', '#ffc107', '#17a2b8', '#6f42c1', '#e83e8c', '#fd7e14'];

  const motivosData = {
    labels: topMotivos.map(item => item.motivo.length > 20 ? item.motivo.substring(0, 20) + '...' : item.motivo),
    datasets: [
      {
        label: 'Número de consultas',
        data: topMotivos.map(item => item.count),
        backgroundColor: colores.slice(0, topMotivos.length),
        borderColor: colores.slice(0, topMotivos.length).map(c => c),
        borderWidth: 1,
      },
    ],
  };

  const areasData = {
    labels: topAreas.map(item => item.area),
    datasets: [
      {
        label: 'Número de consultas',
        data: topAreas.map(item => item.count),
        backgroundColor: colores.slice(0, topAreas.length),
        borderColor: colores.slice(0, topAreas.length).map(c => c),
        borderWidth: 1,
      },
    ],
  };

  const pacientesAreaData = {
    labels: pacientesPorArea.map(item => item.area),
    datasets: [
      {
        label: 'Pacientes por Área',
        data: pacientesPorArea.map(item => item.count),
        backgroundColor: ['#2c7be5', '#28a745', '#dc3545', '#ffc107', '#17a2b8', '#6f42c1'],
        borderColor: '#fff',
        borderWidth: 2,
      },
    ],
  };

  const mesData = {
    labels: consultasPorMes.map(item => item.mes).reverse(),
    datasets: [
      {
        label: 'Consultas por mes',
        data: consultasPorMes.map(item => item.count).reverse(),
        borderColor: '#2c7be5',
        backgroundColor: 'rgba(44, 123, 229, 0.1)',
        tension: 0.4,
        fill: true,
      },
    ],
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>📊 Dashboard de Estadísticas</h2>

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <span style={styles.statIcon}>👤</span>
          <div>
            <h3 style={styles.statNumber}>{estadisticas?.totalPacientes || 0}</h3>
            <p style={styles.statLabel}>Pacientes</p>
          </div>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statIcon}>📋</span>
          <div>
            <h3 style={styles.statNumber}>{estadisticas?.totalConsultas || 0}</h3>
            <p style={styles.statLabel}>Consultas</p>
          </div>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statIcon}>🩺</span>
          <div>
            <h3 style={styles.statNumber}>{(estadisticas?.totalEMI || 0) + (estadisticas?.totalEMP || 0) + (estadisticas?.totalEMR || 0)}</h3>
            <p style={styles.statLabel}>Exámenes</p>
          </div>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statIcon}>⚠️</span>
          <div>
            <h3 style={styles.statNumber}>{estadisticas?.totalVulnerabilidad || 0}</h3>
            <p style={styles.statLabel}>Vulnerabilidades</p>
          </div>
        </div>
      </div>

      <div style={styles.chartsGrid}>
        <div style={styles.chartCard}>
          <h4>🏆 Top 5 Motivos de Consulta</h4>
          {topMotivos.length > 0 ? (
            <Bar data={motivosData} options={styles.chartOptions} />
          ) : (
            <p style={styles.noData}>No hay datos disponibles</p>
          )}
        </div>

        <div style={styles.chartCard}>
          <h4>🏢 Top 5 Áreas Consultantes</h4>
          {topAreas.length > 0 ? (
            <Bar data={areasData} options={styles.chartOptions} />
          ) : (
            <p style={styles.noData}>No hay datos disponibles</p>
          )}
        </div>

        <div style={styles.chartCard}>
          <h4>📈 Consultas por Mes</h4>
          {consultasPorMes.length > 0 ? (
            <Line data={mesData} options={{ ...styles.chartOptions, responsive: true }} />
          ) : (
            <p style={styles.noData}>No hay datos disponibles</p>
          )}
        </div>

        <div style={styles.chartCard}>
          <h4>👥 Pacientes por Área</h4>
          {pacientesPorArea.length > 0 ? (
            <Pie data={pacientesAreaData} options={{ responsive: true }} />
          ) : (
            <p style={styles.noData}>No hay datos disponibles</p>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
  },
  title: {
    color: '#1a5bbf',
    marginBottom: '24px',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '200px',
    fontSize: '18px',
    color: '#666',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  statCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  statIcon: {
    fontSize: '32px',
  },
  statNumber: {
    margin: 0,
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#1a5bbf',
  },
  statLabel: {
    margin: 0,
    fontSize: '14px',
    color: '#666',
  },
  chartsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
    gap: '20px',
  },
  chartCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  chartOptions: {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
    },
  },
  noData: {
    textAlign: 'center',
    color: '#999',
    padding: '40px 0',
  },
};

export default Dashboard;
