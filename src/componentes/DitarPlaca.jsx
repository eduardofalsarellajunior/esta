import { useRef, useState } from 'react';
import { normalizarDitadoPlaca, acumularDitado } from '../lib/ditadoPlaca.js';

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
 *
 * Reconhecimento em CICLOS curtos (não `continuous: true`) — cada ciclo
 * escuta só uma fala e reinicia sozinho assim que termina, dando a sensação
 * de "vai ouvindo direto" sem usar o modo contínuo de verdade do navegador.
 *
 * O "ttltltl…" que aparecia no lugar de "TLI" NÃO era o barulho do pátio, como
 * se pensou primeiro: era `event.results` ser cumulativo (traz de novo, a cada
 * evento, os trechos já finais) enquanto o código concatenava a lista inteira
 * toda vez. A mesma letra entrava várias vezes e enchia os 7 caracteres da
 * placa antes de chegar aos números — o "trava no 8". Corrigido em
 * `acumularDitado` (ditadoPlaca.js), com teste.
 */
export default function DitarPlaca({ onConfirmar, rotulo }) {
  const [aberto, setAberto] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [parcial, setParcial] = useState(''); // trecho ainda não confirmado pelo reconhecimento, só pra feedback
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const recRef = useRef(null);
  const continuarRef = useRef(false); // false = "Parar" foi apertado, não reinicia mais ciclos
  const brutoRef = useRef(''); // transcrição acumulada (antes de virar letras/números)

  function novoCiclo() {
    const rec = new SpeechRecognitionAPI();
    rec.lang = 'pt-BR';
    rec.continuous = false; // um ciclo = uma fala só — ver comentário do componente
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    // Quantos trechos desta sessão já foram aproveitados: `e.results` vem
    // cumulativo a cada evento, e sem isso a mesma letra entrava várias vezes
    // (ver acumularDitado em ditadoPlaca.js).
    let consumidos = 0;
    rec.onresult = (e) => {
      const lista = Array.from(e.results, (r) => ({ transcript: r[0].transcript, isFinal: r.isFinal }));
      const saida = acumularDitado(lista, consumidos);
      consumidos = saida.consumidos;
      if (saida.finais) {
        brutoRef.current += saida.finais;
        setTexto(normalizarDitadoPlaca(brutoRef.current));
      }
      setParcial(saida.interim);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return; // silêncio normal entre letras — o onend cuida de reiniciar
      setErro('Não deu pra usar o microfone — confira a permissão do navegador e tenta de novo.');
      continuarRef.current = false;
      setOuvindo(false);
    };
    rec.onend = () => {
      setParcial('');
      if (continuarRef.current) novoCiclo();
      else setOuvindo(false);
    };
    recRef.current = rec;
    rec.start();
  }

  function ouvir() {
    setErro(''); setTexto(''); setParcial('');
    brutoRef.current = '';
    continuarRef.current = true;
    setOuvindo(true);
    novoCiclo();
  }

  function parar() {
    continuarRef.current = false;
    recRef.current?.stop();
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
    continuarRef.current = false;
    recRef.current?.stop();
    setAberto(false); setOuvindo(false); setTexto(''); setParcial(''); setErro('');
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
                  {ouvindo
                    ? <>Ouvindo… fale uma letra ou número de cada vez, com uma pausa entre eles (ex.: "erre", "pausa", "pê", "pausa", "um").</>
                    : 'Confira e corrija se precisar antes de usar.'}
                  {ouvindo && parcial && <><br />Reconhecendo: <em>{parcial}</em></>}
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
                ? (ouvindo
                  ? <button type="button" className="btn-primary" onClick={parar}>Parar</button>
                  : <button type="button" className="btn-ghost" onClick={ouvir}>Falar de novo</button>)
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
