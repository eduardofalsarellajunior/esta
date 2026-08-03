import { useEffect, useRef, useState } from 'react';

/**
 * Menu de ações (⋮) no canto de um card — pensado pra crescer: cada tela só
 * passa a lista de ações, sem precisar reimplementar o dropdown.
 * `acoes`: [{ label, onClick }].
 */
export default function CardAcoes({ acoes }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    function onClickFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    }
    document.addEventListener('mousedown', onClickFora);
    return () => document.removeEventListener('mousedown', onClickFora);
  }, [aberto]);

  return (
    <div className="card-acoes" ref={ref}>
      <button type="button" className="card-acoes-btn" onClick={() => setAberto((a) => !a)} aria-label="Mais ações">⋮</button>
      {aberto && (
        <ul className="card-acoes-menu">
          {acoes.map((a) => (
            <li key={a.label}>
              <button type="button" onClick={() => { setAberto(false); a.onClick(); }}>{a.label}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
