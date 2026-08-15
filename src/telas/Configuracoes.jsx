import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { obterTema, aplicarTema } from '../lib/tema.js';
import { ehFornecedor } from '../lib/acesso.js';

// Dados do estacionamento (nome/endereço/CNPJ/fiscal). Só o fornecedor altera:
// são dados com efeito legal e fiscal, e mexer neles é chamado de suporte. A
// trava não é só desta tela — a policy de UPDATE em `filiais` exige fornecedor
// (ver 0018_papeis_e_fornecedor.sql), então vale também fora do app.
export default function Configuracoes({ perfil }) {
  const [filial, setFilial] = useState(null);
  const [erro, setErro] = useState('');
  const [salvo, setSalvo] = useState(false);
  const [tema, setTema] = useState(obterTema());
  const podeEditar = ehFornecedor(perfil);

  function mudarTema(novoTema) {
    aplicarTema(novoTema);
    setTema(novoTema);
  }

  async function carregar() {
    const { data, error } = await supabase.from('filiais').select('*').eq('id', perfil.filial_id).maybeSingle();
    if (error) setErro(error.message); else setFilial(data);
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, []);

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvo(false);
    const { error } = await supabase.from('filiais').update({
      nome_fantasia: filial.nome_fantasia || null,
      endereco: filial.endereco || null,
      numero: filial.numero || null,
      bairro: filial.bairro || null,
      uf: filial.uf || null,
      cep: filial.cep || null,
      cnpj: filial.cnpj || null,
      inscricao_mun: filial.inscricao_mun || null,
      cod_ibge: filial.cod_ibge || null,
      config: filial.config || {},
    }).eq('id', filial.id);
    if (error) setErro(error.message); else setSalvo(true);
  }

  function setPatio(campo, valor) {
    setFilial((f) => ({ ...f, config: { ...f.config, patio: { ...(f.config?.patio || {}), [campo]: valor } } }));
  }

  function setNfse(campo, valor) {
    setFilial((f) => ({ ...f, config: { ...f.config, nfse: { ...(f.config?.nfse || {}), [campo]: valor } } }));
  }

  function setNfseAbrasf(campo, valor) {
    setFilial((f) => ({
      ...f,
      config: {
        ...f.config,
        nfse: {
          ...(f.config?.nfse || {}),
          abrasf: { ...(f.config?.nfse?.abrasf || {}), [campo]: valor },
        },
      },
    }));
  }

  return (
    <>
      <div className="card">
        <h2>Aparência</h2>
        <p className="suave">Preferência pessoal deste navegador — não afeta outros usuários/dispositivos.</p>
        <div className="campo" style={{ maxWidth: 220 }}>
          <label>Tema</label>
          <select value={tema} onChange={(e) => mudarTema(e.target.value)}>
            <option value="escuro">Escuro</option>
            <option value="claro">Claro</option>
          </select>
        </div>
      </div>

      <div className="card">
        <h2>Dados do estacionamento</h2>
        <p className="suave">Aparecem no cabeçalho impresso dos tickets de entrada e saída.</p>
        {erro && <div className="aviso">{erro}</div>}
        {!filial ? 'Carregando…' : (
          <>
            {salvo && <p className="ok-txt">Salvo.</p>}
            <form onSubmit={salvar}>
              <div className="campo" style={{ marginBottom: 10, maxWidth: 420 }}>
                <label>Nome</label>
                <input value={filial.nome_fantasia || ''} disabled={!podeEditar}
                  onChange={(e) => setFilial({ ...filial, nome_fantasia: e.target.value })} />
              </div>
              <div className="linha-form" style={{ marginBottom: 10 }}>
                <div className="campo" style={{ flex: 2 }}>
                  <label>Endereço</label>
                  <input value={filial.endereco || ''} disabled={!podeEditar}
                    onChange={(e) => setFilial({ ...filial, endereco: e.target.value })} />
                </div>
                <div className="campo" style={{ width: 90 }}>
                  <label>Número</label>
                  <input value={filial.numero || ''} disabled={!podeEditar}
                    onChange={(e) => setFilial({ ...filial, numero: e.target.value })} />
                </div>
              </div>
              <div className="linha-form" style={{ marginBottom: 10 }}>
                <div className="campo" style={{ flex: 2 }}>
                  <label>Bairro</label>
                  <input value={filial.bairro || ''} disabled={!podeEditar}
                    onChange={(e) => setFilial({ ...filial, bairro: e.target.value })} />
                </div>
                <div className="campo" style={{ width: 70 }}>
                  <label>UF</label>
                  <input className="mono" style={{ textTransform: 'uppercase' }} maxLength={2}
                    value={filial.uf || ''} disabled={!podeEditar}
                    onChange={(e) => setFilial({ ...filial, uf: e.target.value.toUpperCase() })} />
                </div>
                <div className="campo" style={{ width: 130 }}>
                  <label>CEP</label>
                  <input value={filial.cep || ''} disabled={!podeEditar}
                    onChange={(e) => setFilial({ ...filial, cep: e.target.value })} />
                </div>
              </div>
              <div className="campo" style={{ marginBottom: 10, maxWidth: 420 }}>
                <label>CNPJ</label>
                <input value={filial.cnpj || ''} disabled={!podeEditar}
                  onChange={(e) => setFilial({ ...filial, cnpj: e.target.value })} />
              </div>
              <label className="campo-check" style={{ marginBottom: 4 }}>
                <input type="checkbox" checked={filial.config?.patio?.imprimeTicketMensalista ?? true} disabled={!podeEditar}
                  onChange={(e) => setPatio('imprimeTicketMensalista', e.target.checked)} />
                Imprime ticket para mensalista/hóspede?
              </label>
              <p className="suave" style={{ fontSize: 11, marginTop: 0, marginBottom: 10 }}>
                Desmarcado, a entrada e a saída de mensalistas/hóspedes não param na tela do
                comprovante. Quem entra/sai cobrado como avulso (fora do vencimento, vaga
                esgotada, fora do horário contratado) continua sempre mostrando o ticket.
              </p>
              {podeEditar
                ? <button className="btn-primary" type="submit">Salvar</button>
                : <p className="suave">Somente leitura — esses dados só são alterados pelo fornecedor do sistema.</p>}
            </form>
          </>
        )}
      </div>

      <div className="card">
        <h2>Fiscal (NFS-e)</h2>
        <p className="suave">
          Necessários pra gerar e enviar o DPS/NFS-e (Sistema Nacional NFS-e). Sem eles
          o documento é rejeitado mesmo assinado corretamente.
        </p>
        {!filial ? 'Carregando…' : (
          <form onSubmit={salvar}>
            <div className="linha-form" style={{ marginBottom: 10 }}>
              <div className="campo" style={{ maxWidth: 220 }}>
                <label>Inscrição municipal</label>
                <input value={filial.inscricao_mun || ''} disabled={!podeEditar}
                  onChange={(e) => setFilial({ ...filial, inscricao_mun: e.target.value })} />
              </div>
              <div className="campo" style={{ maxWidth: 160 }}>
                <label>Código do município (IBGE)</label>
                <input value={filial.cod_ibge || ''} disabled={!podeEditar}
                  onChange={(e) => setFilial({ ...filial, cod_ibge: e.target.value })} />
              </div>
              <div className="campo" style={{ maxWidth: 120 }}>
                <label>Série do DPS</label>
                <input value={filial.config?.nfse?.serie || ''} disabled={!podeEditar}
                  onChange={(e) => setNfse('serie', e.target.value)} />
              </div>
            </div>
            <div className="linha-form" style={{ marginBottom: 10 }}>
              <div className="campo" style={{ maxWidth: 220 }}>
                <label>Código de tributação nacional</label>
                <input value={filial.config?.nfse?.codTribNacional || ''} disabled={!podeEditar}
                  maxLength={6} onChange={(e) => setNfse('codTribNacional', e.target.value)} />
                <span className="suave" style={{ fontSize: 11 }}>
                  6 dígitos, lista da LC 116/2003 — confirme com o contador ou veja o que o
                  sistema antigo (DSF) já usava. Não é o CNAE.
                </span>
              </div>
              <div className="campo" style={{ maxWidth: 160 }}>
                <label>Código de tributação municipal</label>
                <input value={filial.config?.nfse?.codTribMunicipal || ''} disabled={!podeEditar}
                  maxLength={4} onChange={(e) => setNfse('codTribMunicipal', e.target.value)} />
                <span className="suave" style={{ fontSize: 11 }}>
                  4 dígitos, exigido por Campinas além do código nacional — confirme com o contador.
                </span>
              </div>
              <div className="campo" style={{ maxWidth: 120 }}>
                <label>% ISS</label>
                <input type="number" step="0.0001" min="0" value={filial.config?.nfse?.perc_iss ?? ''} disabled={!podeEditar}
                  onChange={(e) => setNfse('perc_iss', e.target.value)} />
              </div>
              <div className="campo" style={{ maxWidth: 200 }}>
                <label>Ambiente de envio</label>
                <select value={filial.config?.nfse?.ambiente || 'homologacao'} disabled={!podeEditar}
                  onChange={(e) => setNfse('ambiente', e.target.value)}>
                  <option value="homologacao">Homologação (teste)</option>
                  <option value="producao">Produção (nota de verdade)</option>
                </select>
                <span className="suave" style={{ fontSize: 11 }}>Só mude pra Produção depois de validar em Homologação.</span>
              </div>
            </div>
            <div className="linha-form" style={{ marginBottom: 10 }}>
              <div className="campo" style={{ maxWidth: 300 }}>
                <label>Padrão de envio</label>
                <select value={filial.config?.nfse?.padrao || 'padrao_nacional_campinas'} disabled={!podeEditar}
                  onChange={(e) => setNfse('padrao', e.target.value)}>
                  <option value="padrao_nacional">Padrão Nacional</option>
                  <option value="padrao_nacional_campinas">Padrão Nacional Campinas</option>
                  <option value="abrasf">ABRASF</option>
                </select>
                <span className="suave" style={{ fontSize: 11 }}>
                  Hoje Campinas emite em produção pelo ABRASF — é o que deve ficar
                  selecionado (campos específicos dele logo abaixo). Padrão Nacional
                  Campinas o esta também sabe gerar/enviar, mas ainda não entrou em
                  operação na prefeitura. Padrão Nacional (ADN compartilhado) é pra
                  quando Campinas migrar pra lá — sem previsão, envio bloqueado.
                </span>
              </div>
              <div className="campo" style={{ maxWidth: 300 }}>
                <label>Regime tributário (Simples Nacional)</label>
                <select value={filial.config?.nfse?.opSimpNac || ''} disabled={!podeEditar}
                  onChange={(e) => setNfse('opSimpNac', e.target.value)}>
                  <option value="">— confirme com o contador —</option>
                  <option value="1">Não optante</option>
                  <option value="2">Optante — Microempresa municipal/ME/EPP</option>
                  <option value="3">Optante — Outros</option>
                </select>
                <span className="suave" style={{ fontSize: 11 }}>
                  Exigido pelo governo no DPS. Confirme com o contador antes de enviar — errar
                  isso classifica errado o regime tributário da empresa.
                </span>
              </div>
            </div>

            <h3 style={{ marginTop: 4 }}>ABRASF (Campinas)</h3>
            <p className="suave" style={{ marginTop: -6, marginBottom: 10 }}>
              Só usados quando "Padrão de envio" acima é ABRASF — é diferente do Padrão
              Nacional (não usa código de tributação municipal, por exemplo).
            </p>
            <div className="linha-form" style={{ marginBottom: 10 }}>
              <div className="campo" style={{ maxWidth: 160 }}>
                <label>CNAE (Campinas)</label>
                <input value={filial.config?.nfse?.abrasf?.codigoCnae || ''} disabled={!podeEditar}
                  maxLength={9} onChange={(e) => setNfseAbrasf('codigoCnae', e.target.value)} />
                <span className="suave" style={{ fontSize: 11 }}>
                  9 dígitos, tabela própria de Campinas (drm-codae.campinas.sp.gov.br/cnae.php) —
                  não é o CNAE do IBGE (7 dígitos).
                </span>
              </div>
              <div className="campo" style={{ maxWidth: 140 }}>
                <label>Item lista serviço</label>
                <input value={filial.config?.nfse?.abrasf?.itemListaServico || ''} disabled={!podeEditar}
                  placeholder="11.01" onChange={(e) => setNfseAbrasf('itemListaServico', e.target.value)} />
                <span className="suave" style={{ fontSize: 11 }}>LC 116/2003 — "11.01" é Guarda e estacionamento de veículos.</span>
              </div>
              <div className="campo" style={{ maxWidth: 120 }}>
                <label>% tributos (Lei 12.741)</label>
                <input type="number" step="0.01" min="0" value={filial.config?.nfse?.abrasf?.percTributosLei12741 ?? ''} disabled={!podeEditar}
                  onChange={(e) => setNfseAbrasf('percTributosLei12741', e.target.value)} />
                <span className="suave" style={{ fontSize: 11 }}>Vai no texto de discriminação da nota (aviso da Lei 12.741/2012).</span>
              </div>
              <div className="campo" style={{ maxWidth: 100 }}>
                <label>Série RPS</label>
                <input value={filial.config?.nfse?.abrasf?.serie || ''} disabled={!podeEditar}
                  placeholder="99" onChange={(e) => setNfseAbrasf('serie', e.target.value)} />
              </div>
            </div>
            <div className="linha-form" style={{ marginBottom: 10 }}>
              <div className="campo" style={{ maxWidth: 200 }}>
                <label>Optante Simples Nacional</label>
                <select value={filial.config?.nfse?.abrasf?.optanteSimplesNacional || '1'} disabled={!podeEditar}
                  onChange={(e) => setNfseAbrasf('optanteSimplesNacional', e.target.value)}>
                  <option value="1">Sim</option>
                  <option value="2">Não</option>
                </select>
              </div>
              <div className="campo" style={{ maxWidth: 160 }}>
                <label>Incentivo fiscal</label>
                <select value={filial.config?.nfse?.abrasf?.incentivoFiscal || '2'} disabled={!podeEditar}
                  onChange={(e) => setNfseAbrasf('incentivoFiscal', e.target.value)}>
                  <option value="1">Sim</option>
                  <option value="2">Não</option>
                </select>
              </div>
              <div className="campo" style={{ maxWidth: 160 }}>
                <label>ISS retido pelo tomador</label>
                <select value={filial.config?.nfse?.abrasf?.issRetido || '2'} disabled={!podeEditar}
                  onChange={(e) => setNfseAbrasf('issRetido', e.target.value)}>
                  <option value="1">Sim</option>
                  <option value="2">Não</option>
                </select>
              </div>
            </div>

            {podeEditar
              ? <button className="btn-primary" type="submit">Salvar</button>
              : <p className="suave">Somente leitura — esses dados só são alterados pelo fornecedor do sistema.</p>}
          </form>
        )}
      </div>
    </>
  );
}
