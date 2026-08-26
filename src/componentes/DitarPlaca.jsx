import { useRef, useState } from 'react';
import { normalizarDitadoPlaca } from '../lib/ditadoPlaca.js';

const SpeechRecognitionAPI = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

/**
 * Botão de microfone pra ditar a placa por voz — sem custo/servidor (usa o
 * reconhecimento de voz do próprio navegador, só funciona no Chrome/Android;
 * Safari/iPhone não tem). Ditado letra por letra nunca é 100% confiável (P/T,
 * M/N confundem fácil), então NUNCA preenche direto: mostra o texto já
 * convertido pra letras/números, num campo editável — o operador confirma ou
 * corrige antes de usar (mesmo princípio da leitura de placa por foto, ver
 * CapturaPlaca.jsx).
 */
export default function DitarPlaca({ onConfirmar, rotulo }) {
  const [aberto, setAberto] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const recRef = useRef(null);

  function ouvir() {
    setErro(''); setTexto('');
    const rec = new SpeechRecognitionAPI();
    rec.lang = 'pt-BR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const falado = e.results[0][0].transcript;
      setTexto(normalizarDitadoPlaca(falado));
    };
    rec.onerror = () => { setErro('Não deu pra entender — tenta de novo, falando letra por letra (ex.: "a", "be", "ce", "um").'); setOuvindo(false); };
    rec.onend = () => setOuvindo(false);
    recRef.current = rec;
    setOuvindo(true);
    rec.start();
  }

  function abrir() {
    if (!SpeechRecognitionAPI) {
      setErro('Este navegador não tem reconhecimento de voz — funciona no Chrome (Android incluso).');
      setAberto(true);
      return;
    }
    setAberto(true);
    ouvir();
  }

  function fechar() {
    recRef.current?.stop();
    setAberto(false); setOuvindo(false); setTexto(''); setErro('');
  }

  function confirmar() {
    if (!texto.trim()) return;
    onConfirmar(texto.trim().toUpperCase());
    fechar();
  }

  return (
    <>
      <button type="button" className="btn-ghost" onClick={abrir} title="Ditar placa por voz">
        🎤{rotulo ? ` ${rotulo}` : ''}
      </button>

      {aberto && (
        <div className="modal-bg" onClick={fechar}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 340 }}>
            <h2>Ditar placa</h2>
            {erro && <p className="aviso">{erro}</p>}
            {SpeechRecognitionAPI && (
              <>
                <p className="suave">
                  {ouvindo ? 'Ouvindo… fale a placa letra por letra.' : 'Confira e corrija se precisar antes de usar.'}
                </p>
                <div className="campo" style={{ marginBottom: 10 }}>
                  <label>Placa reconhecida</label>
                  <input className="mono" style={{ textTransform: 'uppercase', fontSize: 20 }}
                    value={texto} onChange={(e) => setTexto(e.target.value.toUpperCase())} autoFocus />
                </div>
              </>
            )}
            <div className="linha-form" style={{ justifyContent: 'space-between', marginTop: 12 }}>
              {SpeechRecognitionAPI
                ? <button type="button" className="btn-ghost" onClick={ouvir} disabled={ouvindo}>{ouvindo ? 'Ouvindo…' : 'Falar de novo'}</button>
                : <span />}
              <div className="linha-form" style={{ gap: 8 }}>
                <button type="button" className="btn-ghost" onClick={fechar}>Cancelar</button>
                {SpeechRecognitionAPI && (
                  <button type="button" className="btn-primary" onClick={confirmar} disabled={!texto.trim()}>Usar</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
