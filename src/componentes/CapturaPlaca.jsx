import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';

// Botão de câmera para ler a placa por foto (Plate Recognizer, via a Edge
// Function `ler-placa` — a chave da API fica só no servidor, nunca no
// navegador). Câmera ao vivo com fallback automático para escolher um
// arquivo/foto (sem câmera, permissão negada, ou navegador sem suporte).
//
// Leitura com confiança alta (>=LIMITE_CONFIANCA_AUTO) e sem ambiguidade (só
// uma placa detectada na foto) preenche direto, sem parar na lista de
// confirmação — abaixo disso, ou com mais de uma placa na foto, o operador
// sempre escolhe/confirma antes de usar.
const LIMITE_CONFIANCA_AUTO = 0.95;

export default function CapturaPlaca({ onConfirmar, rotulo }) {
  const [aberto, setAberto] = useState(false);
  const [modoArquivo, setModoArquivo] = useState(false);
  const [foto, setFoto] = useState(null); // dataURL da foto capturada/escolhida
  const [processando, setProcessando] = useState(false);
  const [resultados, setResultados] = useState(null); // [{placa, confianca, candidatos}]
  const [erro, setErro] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => () => pararCamera(), []); // garante que a câmera não fica ligada se sair da tela

  function pararCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function reset() {
    setFoto(null); setResultados(null); setErro(''); setProcessando(false);
  }

  function fechar() {
    pararCamera();
    setAberto(false);
    reset();
  }

  async function abrir() {
    setAberto(true);
    reset();
    setModoArquivo(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
    } catch {
      setModoArquivo(true); // sem câmera/permissão: cai pro seletor de arquivo
    }
  }

  // Captura/escolha já dispara a leitura sozinha (sem esperar clique em "Ler
  // placa") — passa o dataURL direto pra enviar() em vez de depender do
  // state `foto`, que só atualiza no próximo render (mesmo raciocínio do
  // bug de state desatualizado já corrigido em outros lugares do app).
  function capturar() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const dataUrl = redimensionarDeElemento(video, video.videoWidth, video.videoHeight);
    setFoto(dataUrl);
    pararCamera();
    enviar(dataUrl);
  }

  function onArquivoEscolhido(e) {
    const arq = e.target.files?.[0];
    if (!arq) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      const img = new Image();
      img.onload = () => {
        const dataUrl = redimensionarDeElemento(img, img.width, img.height);
        setFoto(dataUrl);
        enviar(dataUrl);
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arq);
  }

  async function enviar(fotoParaEnviar) {
    setProcessando(true); setErro('');
    try {
      const blob = await (await fetch(fotoParaEnviar)).blob();
      const form = new FormData();
      form.append('imagem', blob, 'placa.jpg');
      const { data, error } = await supabase.functions.invoke('ler-placa', { body: form });
      if (error) throw error;
      if (data?.erro) throw new Error(data.erro);
      const lista = data?.resultados || [];
      if (!lista.length) {
        setResultados(lista);
        setErro('Nenhuma placa reconhecida nessa foto — tente de novo, mais de perto e com boa luz.');
        return;
      }
      // Só uma placa na foto (sem ambiguidade de qual carro) e confiança
      // alta: preenche direto, sem parar pra confirmar.
      if (lista.length === 1 && lista[0].confianca >= LIMITE_CONFIANCA_AUTO) {
        confirmar(lista[0].placa);
        return;
      }
      setResultados(lista);
    } catch (e) {
      setErro(e.message || 'Falha ao reconhecer a placa.');
    } finally {
      setProcessando(false);
    }
  }

  function tentarNovamente() {
    reset();
    abrir();
  }

  function confirmar(placa) {
    onConfirmar(placa);
    fechar();
  }

  return (
    <>
      <button type="button" className="btn-ghost" onClick={abrir} title="Ler placa por foto">
        📷{rotulo ? ` ${rotulo}` : ''}
      </button>

      {aberto && (
        <div className="modal-bg" onClick={fechar}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
            <h2>Ler placa por foto</h2>

            {!foto && !modoArquivo && (
              <>
                <video ref={videoRef} style={{ width: '100%', borderRadius: 8, background: '#000' }} muted playsInline />
                <div className="linha-form" style={{ justifyContent: 'space-between', marginTop: 10 }}>
                  <button type="button" className="btn-ghost" onClick={() => { pararCamera(); setModoArquivo(true); }}>Usar arquivo</button>
                  <button type="button" className="btn-primary" onClick={capturar}>Capturar</button>
                </div>
              </>
            )}

            {!foto && modoArquivo && (
              <div className="campo">
                <label>Escolha uma foto da placa</label>
                <input type="file" accept="image/*" capture="environment" onChange={onArquivoEscolhido} />
              </div>
            )}

            {foto && !resultados && (
              <>
                <img src={foto} alt="Foto capturada" style={{ width: '100%', borderRadius: 8 }} />
                {processando && <p className="suave" style={{ marginTop: 10 }}>Lendo a placa…</p>}
                {erro && <div className="aviso" style={{ marginTop: 10 }}>{erro}</div>}
                <div className="linha-form" style={{ justifyContent: 'space-between', marginTop: 10 }}>
                  <button type="button" className="btn-ghost" onClick={tentarNovamente} disabled={processando}>Repetir foto</button>
                  {!processando && (
                    <button type="button" className="btn-primary" onClick={() => enviar(foto)}>
                      {erro ? 'Tentar de novo' : 'Ler placa'}
                    </button>
                  )}
                </div>
              </>
            )}

            {resultados && (
              <>
                <p className="suave">Confira e escolha a placa correta — nada é preenchido sem confirmar.</p>
                {resultados.map((r, i) => (
                  <button key={i} type="button" className="btn-ghost" style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 6 }}
                    onClick={() => confirmar(r.placa)}>
                    <span className="placa mono">{r.placa}</span>
                    {r.confianca != null && <span className="suave"> · {Math.round(r.confianca * 100)}% confiança</span>}
                    {r.candidatos?.length > 0 && (
                      <div className="suave" style={{ fontSize: 11 }}>
                        outras leituras: {r.candidatos.map((c) => c.placa).join(', ')}
                      </div>
                    )}
                  </button>
                ))}
                {erro && <div className="aviso">{erro}</div>}
                <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                  <button type="button" className="btn-ghost" onClick={tentarNovamente}>Tentar outra foto</button>
                  <button type="button" className="btn-ghost" onClick={fechar}>Cancelar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Reduz pra no máximo 1280px no lado maior e comprime em JPEG — o Plate
// Recognizer aceita até 3MB, e foto de celular sem redimensionar passa disso.
function redimensionarDeElemento(elemento, largura, altura) {
  const escala = Math.min(1, 1280 / Math.max(largura, altura));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(largura * escala);
  canvas.height = Math.round(altura * escala);
  canvas.getContext('2d').drawImage(elemento, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}
