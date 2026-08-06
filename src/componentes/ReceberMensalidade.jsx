import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { hojeISO, proximoVencimento, primeiroVencimento, diferencaEmDias, dentroDoVencimento, fmtDataBR, fmtBRL } from '../lib/tempo.js';
import { receberMensalidade, ticketRecebimento, descricaoForma } from '../lib/mensalidade.js';
import { criarNotaFiscal } from '../lib/notaFiscal.js';

/**
 * Recebimento da mensalidade: valor sugerido pelo cadastro, forma de pagamento e
 * próximo pagamento calculado com o dia de vencimento fixo do cadastro (não no
 * dia do pagamento). Primeira mensalidade (sem vencimento anterior no
 * cadastro): o primeiro vencimento cai na próxima ocorrência do dia fixo, e o
 * valor sugerido é proporcional aos dias até lá.
 */
export function ReceberModal({ mensalista, formas, semCaixa, onConfirmar, onFechar }) {
  const hoje = hojeISO();
  const primeiraMensalidade = !mensalista.proximo_pagamento;
  // Base do próximo vencimento: a data que está no cadastro (a competência que
  // está sendo paga); sem ela (primeira mensalidade), a data do pagamento.
  const base = mensalista.proximo_pagamento || hoje;
  const proximoInicial = primeiraMensalidade
    ? primeiroVencimento(base, mensalista.dia_venc)
    : proximoVencimento(base, mensalista.dia_venc);
  const diasProporcionaisIniciais = primeiraMensalidade && mensalista.dia_venc
    ? diferencaEmDias(base, proximoInicial) : null;
  const valorInicial = diasProporcionaisIniciais != null
    ? Number(((Number(mensalista.valor_mensalidade || 0) / 30) * diasProporcionaisIniciais).toFixed(2))
    : Number(mensalista.valor_mensalidade || 0);

  const [dtPagamento, setDtPagamento] = useState(hoje);
  const [valor, setValor] = useState(String(valorInicial));
  const [forma, setForma] = useState('');
  const [proximo, setProximo] = useState(proximoInicial);
  const [observacao, setObservacao] = useState('');
  const [gerarNota, setGerarNota] = useState(!!mensalista.cpf_cnpj);

  // Forma padrão = dinheiro (como na saída do pátio).
  useEffect(() => {
    if (!forma && formas.length) setForma(formas.find((f) => f.eh_dinheiro)?.codigo || formas[0].codigo);
    // eslint-disable-next-line
  }, [formas]);

  const semFormas = formas.length === 0;
  const valorInvalido = !(Number(valor) > 0);

  // Sugestão ao vivo (segue a "Data do pagamento" digitada) — só informativa;
  // "Data do pagamento" e "Próximo pagamento" continuam livres pra editar.
  const sugestaoAoVivo = primeiraMensalidade && mensalista.dia_venc
    ? (() => {
        const proximoVivo = primeiroVencimento(dtPagamento, mensalista.dia_venc);
        const dias = diferencaEmDias(dtPagamento, proximoVivo);
        const valorVivo = Number(((Number(mensalista.valor_mensalidade || 0) / 30) * dias).toFixed(2));
        return { proximo: proximoVivo, dias, valor: valorVivo };
      })()
    : null;

  function usarSugestao() {
    setProximo(sugestaoAoVivo.proximo);
    setValor(String(sugestaoAoVivo.valor));
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <h2>Receber mensalidade — {mensalista.razao}</h2>
        {primeiraMensalidade ? (
          <p className="suave">
            Primeira mensalidade — sem vencimento anterior no cadastro.
            {mensalista.dia_venc
              ? ` O vencimento fixo é dia ${mensalista.dia_venc}; o período até lá é cobrado proporcional.`
              : ' Cadastre o "Dia vencimento" pra fixar sempre no mesmo dia e prorratear a primeira mensalidade.'}
            {' '}Confira/ajuste o valor e a data abaixo antes de confirmar.
          </p>
        ) : (
          <p className="suave">
            Vencimento no cadastro: {fmtDataBR(mensalista.proximo_pagamento)}. Ao confirmar, o
            próximo pagamento passa para a data abaixo
            {mensalista.dia_venc ? ` (dia ${mensalista.dia_venc} do mês seguinte, o vencimento fixo do cadastro)` : ' (mesmo dia do mês seguinte — cadastre o "Dia vencimento" pra fixar sempre no mesmo dia)'}
            {' '}e o comprovante é impresso.
          </p>
        )}
        {sugestaoAoVivo && (sugestaoAoVivo.proximo !== proximo || String(sugestaoAoVivo.valor) !== valor) && (
          <p className="suave">
            Pela data do pagamento acima: {sugestaoAoVivo.dias} dia(s) até {fmtDataBR(sugestaoAoVivo.proximo)},
            {' '}valor proporcional {fmtBRL(sugestaoAoVivo.valor)}.{' '}
            <button type="button" className="btn-ghost" onClick={usarSugestao} style={{ padding: '2px 8px' }}>Usar esta sugestão</button>
          </p>
        )}
        {semCaixa && (
          <p className="aviso">
            Você não tem caixa aberto — este recebimento fica registrado e aparece no
            Painel/BI, mas não entra em nenhum fechamento de caixa.
          </p>
        )}
        <form onSubmit={(e) => { e.preventDefault(); onConfirmar({ mensalista, dtPagamento, valor, forma, proximo, observacao, gerarNota }); }}>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Data do pagamento</label>
            <input type="date" value={dtPagamento} onChange={(e) => setDtPagamento(e.target.value)} required />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Valor pago</label>
            <input type="number" step="0.01" min="0.01" value={valor} onChange={(e) => setValor(e.target.value)} required />
            {Number(mensalista.valor_mensalidade || 0) > 0 && (
              <span className="suave" style={{ fontSize: 11 }}>Mensalidade do cadastro: {fmtBRL(Number(mensalista.valor_mensalidade))}</span>
            )}
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Forma de pagamento</label>
            <select value={forma} onChange={(e) => setForma(e.target.value)} required>
              {formas.map((f) => <option key={f.codigo} value={f.codigo}>{f.descricao}</option>)}
            </select>
            {semFormas && <span className="suave" style={{ fontSize: 11 }}>Nenhuma forma ativa — cadastre em Cadastros → Formas de pagamento.</span>}
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Próximo pagamento</label>
            <input type="date" value={proximo} onChange={(e) => setProximo(e.target.value)} required />
            {!dentroDoVencimento(proximo, 0) && (
              <span className="suave" style={{ fontSize: 11 }}>
                Continua vencido — é o pagamento de um mês em atraso; receba os meses seguintes ou ajuste a data.
              </span>
            )}
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Observação (opcional)</label>
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
          <label className="campo-check" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={gerarNota} onChange={(e) => setGerarNota(e.target.checked)} />
            Gerar nota fiscal (DPS) — usa o CPF/CNPJ e endereço do cadastro
            {!mensalista.cpf_cnpj && ' (mensalista sem CPF/CNPJ cadastrado — sai sem identificação)'}
          </label>
          {valorInvalido && <p className="aviso">Informe o valor pago.</p>}
          <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={semFormas || valorInvalido}>Confirmar recebimento</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Lista de mensalistas ativos em ordem alfabética, com busca por nome/código. */
function SelecionarMensalistaModal({ onSelecionar, onFechar }) {
  const [lista, setLista] = useState([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    supabase.from('mensalistas').select('*').eq('ativo', true).order('razao')
      .then(({ data }) => { setLista(data || []); setCarregando(false); });
  }, []);

  const alvo = busca.trim().toLowerCase();
  const filtrada = alvo
    ? lista.filter((m) => m.razao.toLowerCase().includes(alvo) || m.codigo.toLowerCase().includes(alvo))
    : lista;

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420, maxHeight: '85vh', overflow: 'auto' }}>
        <h2>Receber mensalidade</h2>
        <p className="suave">Selecione o mensalista (ordem alfabética).</p>
        <div className="campo" style={{ marginBottom: 10 }}>
          <label>Buscar</label>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou código…" autoFocus />
        </div>
        <div className="tabela-scroll">
          <table>
            <tbody>
              {filtrada.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.razao}
                    {!dentroDoVencimento(m.proximo_pagamento, m.tolerancia_dias) && (
                      <span className="status status-cancelada" style={{ marginLeft: 6 }}>Vencida</span>
                    )}
                    <div className="suave" style={{ fontSize: 12 }}>
                      {m.codigo} · próx. pagamento {fmtDataBR(m.proximo_pagamento)}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-primary" onClick={() => onSelecionar(m)}>Receber</button>
                  </td>
                </tr>
              ))}
              {!carregando && filtrada.length === 0 && (
                <tr><td colSpan={2} className="suave">Nenhum mensalista encontrado.</td></tr>
              )}
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

/**
 * Fluxo completo de recebimento, autocontido: lista alfabética de mensalistas
 * -> formulário de recebimento -> grava e devolve o ticket pro chamador
 * imprimir/mostrar (o chamador já tem seu próprio modal de ticket, ex.: Pátio
 * e Mensalistas). `onConcluido(ticket, celularSugerido)` fecha o fluxo.
 */
export default function ReceberMensalidadeFluxo({ perfil, formas, caixaAberto, onConcluido, onFechar }) {
  const [mensalista, setMensalista] = useState(null); // null = ainda escolhendo na lista
  const [erro, setErro] = useState('');

  async function confirmar({ mensalista: m, dtPagamento, valor, forma, proximo, observacao, gerarNota }) {
    setErro('');
    const { error } = await receberMensalidade({ perfil, mensalista: m, dtPagamento, valor, forma, proximo, observacao });
    if (error) { setErro(error); return; }
    if (gerarNota) {
      // Best-effort (mesmo espírito da fidelidade no Pátio): o pagamento já
      // está gravado, uma falha aqui não pode travar o comprovante — se der
      // errado, a nota simplesmente não aparece em Fiscal.
      try {
        await criarNotaFiscal(supabase, {
          filialId: perfil.filial_id, competencia: dtPagamento, valor,
          descricao: 'Recebimento de Mensalista',
          tomador: {
            cpf_cnpj: m.cpf_cnpj, nome: m.razao, endereco: m.endereco, numero: m.numero,
            bairro: m.bairro, uf: m.uf, cep: m.cep, telefone: m.telefone, email: m.email,
          },
        });
      } catch { /* nota fiscal é best-effort aqui */ }
    }
    const ticket = ticketRecebimento({
      mensalista: m, dtPagamento, valor, proximo,
      formaDescricao: descricaoForma(formas, forma), operador: perfil.nome,
    });
    onConcluido(ticket, m.celular || '');
  }

  if (!mensalista) {
    return <SelecionarMensalistaModal onSelecionar={setMensalista} onFechar={onFechar} />;
  }
  return (
    <>
      {erro && <div className="modal-bg" onClick={() => setErro('')}>
        <div className="modal aviso" onClick={(e) => e.stopPropagation()}>{erro}</div>
      </div>}
      <ReceberModal mensalista={mensalista} formas={formas} semCaixa={!caixaAberto}
        onConfirmar={confirmar} onFechar={onFechar} />
    </>
  );
}
