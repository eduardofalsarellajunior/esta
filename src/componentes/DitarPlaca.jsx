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
 *
 * `continuous`/`interimResults` são o pulo do gato aqui: sem eles (como na
 * primeira versão), o reconhecimento PARA sozinho na primeira pausa entre
 * letras e descarta o resto — só pegava o começo da placa. Com eles ligados,
 * continua ouvindo e vai acumulando cada trecho reconhecido, até o operador
 * apertar "Parar" (ou uma pausa bem longa encerrar sozinho).
 */
export default function DitarPlaca({ onConfirmar, rotulo }) {
  const [aberto, setAberto] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [parcial, setParcial] = useState(''); // trecho ainda não confirmado pelo reconhecimento, só pra feedback
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const recRef = useRef(null);
  const brutoRef = useRef(''); // transcrição acumulada (antes de virar letras/números)

  function ouvir() {
    setErro(''); setTexto(''); setParcial('');
    brutoRef.current = '';
    const rec = new SpeechRecognitionAPI();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let finalNovo = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const trecho = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalNovo += `${trecho} `;
        else interim += trecho;
      }
      if (finalNovo) {
        brutoRef.current += finalNovo;
        setTexto(normalizarDitadoPlaca(brutoRef.current));
      }
      setParcial(interim);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech') return; // pausa normal — deixa continuar ouvindo
      setErro('Não deu pra usar o microfone — confira a permissão do navegador e tenta de novo.');
      setOuvindo(false);
    };
    rec.onend = () => { setOuvindo(false); setParcial(''); };
    recRef.current = rec;
    setOuvindo(true);
    rec.start();
  }

  function parar() {
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
                    ? <>Ouvindo… fale a placa letra por letra, sem pressa (ex.: "erre", "pê", "pê", "um", "um", "um", "um").</>
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
