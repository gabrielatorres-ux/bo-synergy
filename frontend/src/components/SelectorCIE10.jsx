import { useState, useRef, useEffect } from 'react';
import { CIE10, OTROS_CIE10 } from '../cie10';

const ink = '#1A1A18';
const muted = '#8A8A85';
const border = '#E4E4E1';
const borderLight = '#EEEEEE';
const accent = '#2F6844';
const accentLight = '#EAF1E7';
const fontBody = "'Work Sans', -apple-system, sans-serif";

// Selector de diagnóstico CIE-10 reutilizable: campo de búsqueda + lista
// filtrada de los códigos más frecuentes, con opción "Otros" que revela un
// campo de texto libre. Controlado por el padre vía value/textoOtro.
function SelectorCIE10({ value, textoOtro, onChangeValue, onChangeTextoOtro, label = 'Diagnóstico (CIE-10)' }) {
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);

  useEffect(() => {
    const manejarClicFuera = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', manejarClicFuera);
    return () => document.removeEventListener('mousedown', manejarClicFuera);
  }, []);

  const seleccionado = value === OTROS_CIE10
    ? { codigo: OTROS_CIE10, descripcion: 'Otros' }
    : CIE10.find((c) => c.codigo === value);

  const filtrados = busqueda.trim()
    ? CIE10.filter((c) =>
        c.codigo.toLowerCase().includes(busqueda.toLowerCase()) ||
        c.descripcion.toLowerCase().includes(busqueda.toLowerCase())
      ).slice(0, 50)
    : CIE10.slice(0, 50);

  const elegir = (codigo) => {
    onChangeValue(codigo);
    setBusqueda('');
    setAbierto(false);
  };

  return (
    <div ref={contenedorRef} style={{ position: 'relative', margin: '8px 0' }}>
      {label && (
        <label style={{ display: 'block', fontSize: '13px', color: muted, marginBottom: '4px', fontFamily: fontBody }}>
          {label}
        </label>
      )}
      <input
        type="text"
        value={abierto ? busqueda : (seleccionado ? `${seleccionado.codigo} - ${seleccionado.descripcion}` : '')}
        onFocus={() => { setAbierto(true); setBusqueda(''); }}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por código o nombre..."
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
      {abierto && (
        <div style={{
          position: 'absolute',
          zIndex: 20,
          top: '100%',
          left: 0,
          right: 0,
          maxHeight: '240px',
          overflowY: 'auto',
          background: '#fff',
          border: `1px solid ${border}`,
          borderRadius: '4px',
          marginTop: '4px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
        }}>
          <div
            onClick={() => elegir(OTROS_CIE10)}
            style={{
              padding: '10px 14px',
              cursor: 'pointer',
              fontSize: '14px',
              fontFamily: fontBody,
              color: accent,
              fontWeight: 500,
              borderBottom: `1px solid ${borderLight}`,
              background: value === OTROS_CIE10 ? accentLight : 'transparent',
            }}
          >
            Otros (especificar)
          </div>
          {filtrados.map((c) => (
            <div
              key={c.codigo}
              onClick={() => elegir(c.codigo)}
              style={{
                padding: '10px 14px',
                cursor: 'pointer',
                fontSize: '14px',
                fontFamily: fontBody,
                color: ink,
                borderBottom: `1px solid ${borderLight}`,
                background: value === c.codigo ? accentLight : 'transparent',
              }}
            >
              <strong>{c.codigo}</strong> - {c.descripcion}
            </div>
          ))}
          {filtrados.length === 0 && (
            <div style={{ padding: '10px 14px', fontSize: '14px', color: muted, fontFamily: fontBody }}>
              Sin resultados. Usa "Otros" para escribirlo directamente.
            </div>
          )}
        </div>
      )}
      {value === OTROS_CIE10 && (
        <input
          type="text"
          value={textoOtro || ''}
          onChange={(e) => onChangeTextoOtro(e.target.value)}
          placeholder="Especifica el diagnóstico"
          style={{
            display: 'block',
            width: '100%',
            padding: '12px 14px',
            margin: '8px 0 0',
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
      )}
    </div>
  );
}

export default SelectorCIE10;
