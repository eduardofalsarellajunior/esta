// Comprovante/ticket compartilhado (entrada, saída, exclusão, mensalidade).
// Um ticket é `{ titulo, linhas: [[rotulo, valor], ...] }`.
import { useEffect } from 'react';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Impressão numa janela dedicada (não no modal): evita a duplicação de página que
// ocorre ao imprimir conteúdo dentro de um overlay position:fixed.
export function imprimirTicket(ticket, filial) {
  const cabecalho = filial && (filial.nome_fantasia || filial.endereco || filial.cnpj) ? `
    ${filial.nome_fantasia ? `<div class="nome">${escapeHtml(filial.nome_fantasia)}</div>` : ''}
    ${filial.endereco ? `<div class="linha-end">${escapeHtml(filial.endereco)}</div>` : ''}
    ${filial.cnpj ? `<div class="linha-end">CNPJ: ${escapeHtml(filial.cnpj)}</div>` : ''}
    <hr>` : '';
  const corpo = ticket.linhas.map(([r, v]) => `<p><strong>${escapeHtml(r)}:</strong> ${escapeHtml(v)}</p>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(ticket.titulo)}</title>
    <style>
      body { font-family: system-ui, Arial, sans-serif; color: #000; padding: 16px; max-width: 320px; }
      .nome { font-size: 16px; font-weight: 800; margin-bottom: 2px; }
      .linha-end { font-size: 11px; color: #333; margin-bottom: 2px; }
      hr { border: none; border-top: 1px dashed #999; margin: 10px 0; }
      h2 { font-size: 14px; margin: 0 0 8px; }
      p { font-size: 13px; margin: 4px 0; }
    </style></head><body>
      ${cabecalho}
      <h2>${escapeHtml(ticket.titulo)}</h2>
      ${corpo}
    </body></html>`;
  const win = window.open('', '_blank', 'width=380,height=600');
  if (!win) { window.alert('Permita pop-ups para imprimir o ticket.'); return; }
  win.document.write(html);
  win.document.close();
  win.onafterprint = () => win.close();
  win.focus();
  win.print();
}

export function linkWhatsApp(ticket, celular, filial) {
  const cabecalho = filial && (filial.nome_fantasia || filial.endereco || filial.cnpj)
    ? [filial.nome_fantasia, filial.endereco, filial.cnpj ? `CNPJ: ${filial.cnpj}` : null].filter(Boolean).join('\n') + '\n\n'
    : '';
  const texto = cabecalho + [ticket.titulo, ...ticket.linhas.map(([r, v]) => `${r}: ${v}`)].join('\n');
  const digitos = (celular || '').replace(/\D/g, '');
  const numero = digitos ? (digitos.startsWith('55') ? digitos : `55${digitos}`) : '';
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/**
 * Modal do comprovante, com campo de celular (WhatsApp) e botão de imprimir.
 * `celular`/`onCelular` ficam no chamador para o campo zerar junto com o ticket.
 *
 * Atalhos de teclado (F/W/I) porque na cabine o fluxo é rápido e quase sempre
 * termina em imprimir — sem precisar tirar a mão do teclado pra pegar o mouse.
 */
export function TicketModal({ ticket, filial, celular, onCelular, onFechar }) {
  useEffect(() => {
    function aoTeclar(e) {
      // Digitando o celular (ou qualquer campo)? Atalho não vale — senão um
      // "9" tudo bem, mas o "F" de um telefone fecharia o ticket.
      const alvo = e.target;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return;
      // Deixa os atalhos do navegador em paz (Ctrl+P, Alt+Tab...).
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const tecla = e.key.toLowerCase();
      if (tecla === 'f' || tecla === 'escape') { e.preventDefault(); onFechar(); }
      else if (tecla === 'w') { e.preventDefault(); window.open(linkWhatsApp(ticket, celular, filial), '_blank', 'noopener,noreferrer'); }
      else if (tecla === 'i') { e.preventDefault(); imprimirTicket(ticket, filial); }
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [ticket, filial, celular, onFechar]);

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="ticket-impressao">
          <h2>{ticket.titulo}</h2>
          {ticket.linhas.map(([rotulo, valor]) => (
            <p className="mono" key={rotulo}>{rotulo}: <strong>{valor}</strong></p>
          ))}
        </div>
        <div className="campo" style={{ marginTop: 10 }}>
          <label>Celular para WhatsApp (opcional)</label>
          <input value={celular} onChange={(e) => onCelular(e.target.value)} placeholder="(19) 99999-9999" />
        </div>
        {/* A letra sublinhada é o atalho (ver o useEffect acima). */}
        <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn-ghost" onClick={onFechar}><u>F</u>echar</button>
          <a className="btn-ghost" href={linkWhatsApp(ticket, celular, filial)} target="_blank" rel="noopener noreferrer">
            Enviar por <u>W</u>hatsApp
          </a>
          <button className="btn-primary" onClick={() => imprimirTicket(ticket, filial)}><u>I</u>mprimir</button>
        </div>
      </div>
    </div>
  );
}
