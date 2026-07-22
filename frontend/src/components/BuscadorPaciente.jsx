import { useState, useRef, useEffect } from 'react';
import axios from 'axios';

const ink = '#1A1A18';
const muted = '#8A8A85';
const border = '#E4E4E1';
const borderLight = '#EEEEEE';
const accent = '#2F6844';
const accentLight = '#EAF1E7';
const fontBody = "'Work Sans', -apple-system, sans-serif";

// Buscador de paciente reutilizable: campo con lupa que busca por nombre,
// al elegir uno muestra su área/puesto de solo lectura. Usado por los
// formularios de Seguimiento, Restricciones, Accidente, Alto Riesgo y
// Bitácora, que todos piden "nombre (lupa) que me lleva área y puesto".
function BuscadorPaciente({ apiUrl, empresaId, pacienteSeleccionado, onSeleccionar, label = 'Paciente' }) {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const contenedorRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    const manejarClicFuera = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', manejarClicFuera);
    return () => document.removeEventListener('mousedown', manejarClicFuera);
  }, []);

  useEffect(() => {
    if (!abierto || !busqueda.trim()) {
      setResultados([]);
      return;
    }
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setBuscando(true);
      axios.get(`${apiUrl}/pacientes`, { params: { search: busqueda, empresa_id: empresaId, limit: 10 } })
        .then((res) => setResultados(res.data?.pacientes || []))
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(timeoutRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, abierto]);

  const elegir = (paciente) => {
    onSeleccionar(paciente);
    setBusqueda('');
    setResultados([]);
    setAbierto(false);
  };

  const limpiar = () => {
    onSeleccionar(null);
    setBusqueda('');
    setAbierto(true);
  };

  return (
    <div ref={contenedorRef} style={{ position: 'relative', margin: '8px 0' }}>
      {label && (
        <label style={{ display: 'block', fontSize: '13px', color: muted, marginBottom: '4px', fontFamily: fontBody }}>
          {label}
        </label>
      )}

      {pacienteSeleccionado ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          border: `1px solid ${border}`,
          borderRadius: '4px',
          backgroundColor: accentLight,
          fontFamily: fontBody,
        }}>
          <div>
            <div style={{ fontSize: '15px', color: ink, fontWeight: 500 }}>{pacienteSeleccionado.nombre}</div>
            <div style={{ fontSize: '13px', color: muted, marginTop: '2px' }}>
              Área: {pacienteSeleccionado.area || '—'} · Puesto: {pacienteSeleccionado.puesto || '—'}
            </div>
          </div>
          <button
            type="button"
            onClick={limpiar}
            style={{ background: 'none', border: 'none', color: accent, cursor: 'pointer', fontSize: '13px', fontFamily: fontBody, fontWeight: 500 }}
          >
            Cambiar
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={busqueda}
            onFocus={() => setAbierto(true)}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar paciente por nombre..."
            style={{
              display: 'block',
              width: '100%',
              padding: '12px 14px',
              border: `1px solid ${border}`,
              borderRadius: '4px',
              fontSize: '15px',
              boxSizing: 'border-box',
              outline: 'none',
              backgroundColor: '#fff',
              fontFamily: fontBody,
              color: ink,
            }}
          />
          {abierto && busqueda.trim() && (
            <div style={{
              position: 'absolute',
              zIndex: 20,
              top: '100%',
              left: 0,
              right: 0,
              maxHeight: '220px',
              overflowY: 'auto',
              background: '#fff',
              border: `1px solid ${border}`,
              borderRadius: '4px',
              marginTop: '4px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
            }}>
              {buscando && (
                <div style={{ padding: '10px 14px', fontSize: '14px', color: muted, fontFamily: fontBody }}>Buscando...</div>
              )}
              {!buscando && resultados.length === 0 && (
                <div style={{ padding: '10px 14px', fontSize: '14px', color: muted, fontFamily: fontBody }}>Sin resultados</div>
              )}
              {!buscando && resultados.map((p) => (
                <div
                  key={p.id}
                  onClick={() => elegir(p)}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontFamily: fontBody,
                    color: ink,
                    borderBottom: `1px solid ${borderLight}`,
                  }}
                >
                  <strong>{p.nombre}</strong>
                  <div style={{ fontSize: '12px', color: muted }}>{p.area || '—'} · {p.puesto || '—'}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default BuscadorPaciente;
