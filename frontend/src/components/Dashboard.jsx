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

function Dashboard({ empresaId }) {
  const [estadisticas, setEstadisticas] = useState(null);
  const [topMotivos, setTopMotivos] = useState([]);
  const [topAreas, setTopAreas] = useState([]);
  const [consultasPorMes, setConsultasPorMes] = useState([]);
  const [pacientesPorArea, setPacientesPorArea] = useState([]);
  const [cargando, setCargando] = useState(true);

  const API_URL = 'https://bo-synergy-backend.onrender.com/api';

  useEffect(() => {
    if (!empresaId) return;
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const cargarDatos = async () => {
    try {
      const params = { empresa_id: empresaId };
      const [statsRes, motivosRes, areasRes, mesRes, pacientesAreaRes] = await Promise.all([
        axios.get(`${API_URL}/estadisticas`, { params }),
        axios.get(`${API_URL}/top-motivos`, { params }),
        axios.get(`${API_URL}/top-areas`, { params }),
        axios.get(`${API_URL}/consultas-por-mes`, { params }),
        axios.get(`${API_URL}/pacientes-por-area`, { params }),
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
        <h2>Cargando estadísticas...</h2>
      </div>
    );
  }

  const colores = ['#2F6844', '#D9663D', '#C9922E', '#5B7C99', '#8B6F9E', '#6E8B5E', '#B08C5A', '#4A6C7A'];

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
        label: 'Pacientes por área',
        data: pacientesPorArea.map(item => item.count),
        backgroundColor: colores.slice(0, pacientesPorArea.length),
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
        borderColor: '#2F6844',
        backgroundColor: 'rgba(47, 104, 68, 0.08)',
        tension: 0.4,
        fill: true,
      },
    ],
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Dashboard de estadísticas</h2>

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div>
            <h3 style={styles.statNumber}>{estadisticas?.totalPacientes || 0}</h3>
            <p style={styles.statLabel}>Pacientes</p>
          </div>
        </div>
        <div style={styles.statCard}>
          <div>
            <h3 style={styles.statNumber}>{estadisticas?.totalConsultas || 0}</h3>
            <p style={styles.statLabel}>Consultas</p>
          </div>
        </div>
        <div style={styles.statCard}>
          <div>
            <h3 style={styles.statNumber}>{(estadisticas?.totalEMI || 0) + (estadisticas?.totalEMP || 0) + (estadisticas?.totalEMR || 0)}</h3>
            <p style={styles.statLabel}>Exámenes</p>
          </div>
        </div>
        <div style={styles.statCard}>
          <div>
            <h3 style={styles.statNumber}>{estadisticas?.totalVulnerabilidad || 0}</h3>
            <p style={styles.statLabel}>Vulnerabilidades</p>
          </div>
        </div>
      </div>

      <div style={styles.chartsGrid}>
        <div style={styles.chartCard}>
          <h4 style={styles.chartTitle}>Top 5 motivos de consulta</h4>
          {topMotivos.length > 0 ? (
            <Bar data={motivosData} options={styles.chartOptions} />
          ) : (
            <p style={styles.noData}>No hay datos disponibles</p>
          )}
        </div>

        <div style={styles.chartCard}>
          <h4 style={styles.chartTitle}>Top 5 áreas consultantes</h4>
          {topAreas.length > 0 ? (
            <Bar data={areasData} options={styles.chartOptions} />
          ) : (
            <p style={styles.noData}>No hay datos disponibles</p>
          )}
        </div>

        <div style={styles.chartCard}>
          <h4 style={styles.chartTitle}>Consultas por mes</h4>
          {consultasPorMes.length > 0 ? (
            <Line data={mesData} options={{ ...styles.chartOptions, responsive: true }} />
          ) : (
            <p style={styles.noData}>No hay datos disponibles</p>
          )}
        </div>

        <div style={styles.chartCard}>
          <h4 style={styles.chartTitle}>Pacientes por área</h4>
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
    fontFamily: "'Work Sans', -apple-system, sans-serif",
  },
  title: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontWeight: '500',
    color: '#1A1A18',
    marginBottom: '24px',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '200px',
    fontSize: '18px',
    color: '#8A8A85',
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
    borderRadius: '4px',
    border: '1px solid #EEEEEE',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  statNumber: {
    margin: 0,
    fontSize: '28px',
    fontWeight: '500',
    color: '#2F6844',
  },
  statLabel: {
    margin: 0,
    fontSize: '13px',
    color: '#8A8A85',
  },
  chartsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
    gap: '20px',
  },
  chartCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '4px',
    border: '1px solid #EEEEEE',
  },
  chartTitle: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontWeight: '500',
    color: '#1A1A18',
    marginTop: 0,
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
    color: '#B3B3AD',
    padding: '40px 0',
  },
};

export default Dashboard;
