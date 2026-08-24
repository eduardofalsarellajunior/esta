import { useState } from 'react';
import { fmtBRL } from '../lib/tempo.js';
import { venderProduto } from '../lib/produtos.js';

/** Lista de produtos ativos, com busca por código/descrição. */
function SelecionarProdutoModal({ produtos, onSelecionar, onFechar }) {
  const [busca, setBusca] = useState('');
  const alvo = busca.trim().toLowerCase();
  const filtrados = alvo
    ? produtos.filter((p) => p.codigo.toLowerCase().includes(alvo) || p.descricao.toLowerCase().includes(alvo))
    : produtos;

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420, maxHeight: '85vh', overflow: 'auto' }}>
        <h2>Venda de produtos</h2>
        <p className="suave">Digite o código ou selecione na lista.</p>
        <div className="campo" style={{ marginBottom: 10 }}>
          <label>Buscar</label>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código ou descrição…" autoFocus />
        </div>
        <div className="tabela-scroll">
          <table>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="mono">{p.codigo}</span> — {p.descricao}
                    <div className="suave" style={{ fontSize: 12 }}>
                      {fmtBRL(Number(p.valor_venda))} · estoque: {p.quantidade_estoque}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-primary" onClick={() => onSelecionar(p)}>Vender</button>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && <tr><td colSpan={2} className="suave">Nenhum produto encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn-ghost" onClick={onFechar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

/** Quantidade + forma de pagamento, com o total calculado ao vivo. */
function ConfirmarVendaModal({ produto, formas, semCaixa, onConfirmar, onFechar }) {
  const [quantidade, setQuantidade] = useState('1');
  const [forma, setForma] = useState(formas.find((f) => f.eh_dinheiro)?.codigo || formas[0]?.codigo || '');
  const valorUnitario = Number(produto.valor_venda || 0);
  const qtdNum = Number(quantidade) || 0;
  const valorTotal = Math.round(qtdNum * valorUnitario * 100) / 100;
  const qtdInvalida = !(qtdNum > 0);
  const semEstoque = qtdNum > Number(produto.quantidade_estoque || 0);

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(420px, 92vw)' }}>
        <h2>{produto.descricao}</h2>
        <p className="suave" style={{ marginTop: -4 }}>
          {produto.codigo} · {fmtBRL(valorUnitario)}/un · estoque: {produto.quantidade_estoque}
        </p>
        {semCaixa && (
          <p className="aviso" style={{ fontSize: 12 }}>
            Sem caixa aberto — a venda é registrada e aparece no Painel/BI, mas fica fora do fechamento de caixa.
          </p>
        )}
        <form onSubmit={(e) => { e.preventDefault(); onConfirmar({ quantidade: qtdNum, forma }); }}>
          <div className="linha-form" style={{ marginBottom: 10 }}>
            <div className="campo" style={{ flex: 1 }}>
              <label>Quantidade</label>
              <input type="number" step="1" min="1" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} required autoFocus />
            </div>
            <div className="campo" style={{ flex: 1 }}>
              <label>Forma de pagamento</label>
              <select value={forma} onChange={(e) => setForma(e.target.value)} required>
                {formas.map((f) => <option key={f.codigo} value={f.codigo}>{f.descricao}</option>)}
              </select>
            </div>
          </div>
          <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Total: {fmtBRL(valorTotal)}</p>
          {semEstoque && (
            <p className="aviso" style={{ fontSize: 12 }}>
              Quantidade maior que o estoque cadastrado — confirma mesmo assim se for o caso.
            </p>
          )}
          <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={qtdInvalida || !forma}>Confirmar venda</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Fluxo completo, autocontido (mesmo espírito de ReceberMensalidadeFluxo):
 * lista de produtos -> confirmação (quantidade + forma) -> grava e devolve o
 * ticket pro chamador imprimir. Ticket sempre no formato simples (sem token
 * customizável) de propósito — venda de produto nunca deve encostar no fluxo
 * de RPS/NFS-e, então nem passa perto do sistema de modelos por token.
 */
export default function VendaProdutosFluxo({ perfil, produtos, formas, caixaAberto, onConcluido, onFechar }) {
  const [produto, setProduto] = useState(null);
  const [erro, setErro] = useState('');

  async function confirmar({ quantidade, forma }) {
    setErro('');
    const { error } = await venderProduto({ perfil, produto, quantidade, forma });
    if (error) { setErro(error); return; }
    const formaDescricao = formas.find((f) => f.codigo === forma)?.descricao || forma;
    const valorTotal = Math.round(Number(quantidade) * Number(produto.valor_venda || 0) * 100) / 100;
    onConcluido({
      titulo: 'Venda de produto',
      linhas: [
        ['Produto', `${produto.codigo} — ${produto.descricao}`],
        ['Quantidade', String(quantidade)],
        ['Vlr. unitário', fmtBRL(Number(produto.valor_venda || 0))],
        ['Vlr. total', fmtBRL(valorTotal)],
        ['Forma de pagamento', formaDescricao],
        ['Operador', perfil.nome],
      ],
    });
  }

  if (!produto) {
    return <SelecionarProdutoModal produtos={produtos} onSelecionar={setProduto} onFechar={onFechar} />;
  }
  return (
    <>
      {erro && <div className="modal-bg" onClick={() => setErro('')}>
        <div className="modal aviso" onClick={(e) => e.stopPropagation()}>{erro}</div>
      </div>}
      <ConfirmarVendaModal produto={produto} formas={formas} semCaixa={!caixaAberto}
        onConfirmar={confirmar} onFechar={onFechar} />
    </>
  );
}
