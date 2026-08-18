import { useEffect, useMemo, useState } from 'react';
import { normalizar } from '../lib/texto.js';

/**
 * Busca de cidade — por nome (autocomplete, mesmo padrão da busca de modelo
 * de veículo) ou direto pelo código IBGE de 7 dígitos. Resolve cidade+UF+
 * código IBGE juntos numa seleção só, pra nunca ficar uma combinação
 * incoerente digitada à mão — o RPS/DPS depende do código bater certo com
 * a cidade (ver src/lib/fiscal.js).
 *
 * Lista embutida no bundle (src/lib/municipiosIbge.json, ~5.571 municípios,
 * gerada a partir da API pública do IBGE) — sem tabela nem ida ao banco. Vem
 * por import() (não estático): ~300kB que só quem abre uma destas 3 telas
 * precisa baixar, não todo mundo que abre o Pátio no dia a dia.
 */
export default function CidadeBusca({ valor, onSelecionar, placeholder, disabled }) {
  const [busca, setBusca] = useState(valor || '');
  const [mostrar, setMostrar] = useState(false);
  const [municipios, setMunicipios] = useState(null);

  useEffect(() => {
    import('../lib/municipiosIbge.json').then((m) => setMunicipios(m.default));
  }, []);

  const sugestoes = useMemo(() => {
    const alvo = busca.trim();
    if (!municipios || alvo.length < 2) return [];
    if (/^\d+$/.test(alvo)) {
      return municipios.filter((m) => m.codigo.startsWith(alvo)).slice(0, 8);
    }
    const norm = normalizar(alvo);
    return municipios.filter((m) => normalizar(m.nome).includes(norm)).slice(0, 8);
  }, [busca, municipios]);

  function selecionar(m) {
    setBusca(`${m.nome} - ${m.uf}`);
    setMostrar(false);
    onSelecionar(m);
  }

  return (
    <div className="campo campo-busca">
      <input value={busca} disabled={disabled}
        onChange={(e) => setBusca(e.target.value)}
        onFocus={() => setMostrar(true)}
        onBlur={() => setTimeout(() => setMostrar(false), 150)}
        placeholder={placeholder || 'Cidade ou código IBGE…'} style={{ width: '100%' }} />
      {!disabled && mostrar && sugestoes.length > 0 && (
        <ul className="sugestoes-lista">
          {sugestoes.map((m) => (
            <li key={m.codigo} className="sugestao-item"
              onMouseDown={(e) => { e.preventDefault(); selecionar(m); }}>
              {m.nome} - {m.uf} <span className="suave mono" style={{ fontSize: 11 }}>{m.codigo}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
