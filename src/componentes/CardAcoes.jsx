import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Menu de ações (⋮) no canto de um card — pensado pra crescer: cada tela só
 * passa a lista de ações, sem precisar reimplementar o dropdown.
 * `acoes`: [{ label, onClick }].
 */
export default function CardAcoes({ acoes, rotulo = '⋮', className = 'card-acoes-btn' }) {
  const [aberto, setAberto] = useState(false);
  const [deslocamento, setDeslocamento] = useState(0);
  const ref = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    function onClickFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    }
    document.addEventListener('mousedown', onClickFora);
    return () => document.removeEventListener('mousedown', onClickFora);
  }, [aberto]);

  // O menu nasce alinhado à direita do botão (ver CSS) — numa tela estreita
  // (celular), se o botão estiver mais pra esquerda, isso empurra o menu pra
  // fora pela borda esquerda. Mede depois de aberto e empurra de volta pra
  // dentro da tela, se precisar.
  useLayoutEffect(() => {
    if (!aberto || !menuRef.current) { setDeslocamento(0); return; }
    const rect = menuRef.current.getBoundingClientRect();
    const margem = 8;
    if (rect.left < margem) setDeslocamento(margem - rect.left);
    else if (rect.right > window.innerWidth - margem) setDeslocamento((window.innerWidth - margem) - rect.right);
    else setDeslocamento(0);
  }, [aberto]);

  return (
    <div className="card-acoes" ref={ref}>
      <button type="button" className={className} onClick={() => setAberto((a) => !a)} aria-label="Mais ações">{rotulo}</button>
      {aberto && (
        <ul className="card-acoes-menu" ref={menuRef} style={deslocamento ? { transform: `translateX(${deslocamento}px)` } : undefined}>
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
