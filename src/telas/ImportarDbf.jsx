import { useMemo, useState } from 'react';
import { lerDbf } from '../../packages/dbf/dbf.ts';
import { DESTINOS, sugerirMapeamento, converterLinha } from '../../packages/dbf/mapeamento.ts';
import { importarDestino, importarVeiculosExtras } from '../lib/importacaoDbf.js';

const LIMITE_PREVIA = 5;

// Importação dos cadastros do legado (.dbf, Clipper/DOS) direto pela interface:
// lê e decodifica o arquivo inteiramente no navegador (CP850 -> Unicode, ver
// packages/dbf/dbf.ts), sem enviar pra nenhum servidor — o .dbf de mensalistas
// tem dados pessoais. Restrita a supervisor (rota fora de ROTAS_OPERADOR).
export default function ImportarDbf({ perfil }) {
  const [destino, setDestino] = useState('mensalistas');
  const [dbf, setDbf] = useState(null); // { nomeArquivo, campos, registros }
  const [mapeamento, setMapeamento] = useState({});
  const [codigoEhPlacaPrincipal, setCodigoEhPlacaPrincipal] = useState(true);
  const [erro, setErro] = useState('');
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const destinoAtual = DESTINOS[destino];
  const ehVeiculosExtra = destinoAtual.tipoImportacao === 'veiculos_extra';

  function mudarDestino(novo) {
    setDestino(novo);
    setResultado(null);
    if (dbf) {
      const nomes = dbf.campos.map((c) => c.nome);
      setMapeamento(sugerirMapeamento(DESTINOS[novo].colunas, nomes));
    }
  }

  async function onArquivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErro(''); setResultado(null);
    try {
      const buffer = await file.arrayBuffer();
      const { campos, registros } = lerDbf(buffer);
      if (!registros.length) { setErro('Nenhum registro encontrado (ou o arquivo está vazio/todo excluído).'); setDbf(null); return; }
      const nomes = campos.map((c) => c.nome);
      setDbf({ nomeArquivo: file.name, campos, registros });
      setMapeamento(sugerirMapeamento(destinoAtual.colunas, nomes));
    } catch (err) {
      setErro(`Não foi possível ler esse arquivo como .dbf: ${err.message}`);
      setDbf(null);
    }
  }

  const preview = useMemo(() => {
    if (!dbf) return [];
    return dbf.registros.slice(0, LIMITE_PREVIA).map((r) => converterLinha(r, destinoAtual.colunas, mapeamento));
  }, [dbf, mapeamento, destinoAtual]);

  async function importar() {
    if (!dbf) return;
    setImportando(true); setErro(''); setResultado(null);
    try {
      const linhas = dbf.registros.map((r) => converterLinha(r, destinoAtual.colunas, mapeamento));
      const res = ehVeiculosExtra
        ? await importarVeiculosExtras({ perfil, linhas, colunas: destinoAtual.colunas })
        : await importarDestino({
            perfil, destino: destinoAtual, colunas: destinoAtual.colunas, linhas,
            codigoEhPlacaPrincipal: destino === 'mensalistas' && codigoEhPlacaPrincipal,
          });
      setResultado(res);
    } catch (err) {
      setErro(err.message);
    } finally {
      setImportando(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2>Importar do legado (.dbf)</h2>
        <p className="suave">
          Lê o arquivo .dbf do sistema antigo direto no navegador (nada é enviado a
          nenhum servidor) e cria os cadastros novos. Um código que já existir no
          sistema é sempre ignorado — nunca sobrescreve o que já está cadastrado.
        </p>
        <div className="linha-form">
          <div className="campo">
            <label>O que importar?</label>
            <select value={destino} onChange={(e) => mudarDestino(e.target.value)}>
              {Object.entries(DESTINOS).map(([chave, d]) => <option key={chave} value={chave}>{d.rotulo}</option>)}
            </select>
          </div>
          <div className="campo">
            <label>Arquivo .dbf</label>
            <input type="file" accept=".dbf" onChange={onArquivo} />
          </div>
        </div>
        {destino === 'mensalistas' && (
          <label className="campo-check" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={codigoEhPlacaPrincipal}
              onChange={(e) => setCodigoEhPlacaPrincipal(e.target.checked)} />
            O código é a placa do veículo principal — cadastrar esse veículo também
          </label>
        )}
        {destino === 'mensalistas' && codigoEhPlacaPrincipal && (
          <p className="suave" style={{ fontSize: 12 }}>
            Comum no ESTAEMPR do legado (campo VEICULO). Sem isso, o mensalista só seria
            reconhecido na entrada do pátio com os veículos extras — não com o principal.
          </p>
        )}
        {ehVeiculosExtra && (
          <p className="suave" style={{ fontSize: 12, marginTop: 10 }}>
            Cada linha vira um veículo de um mensalista que já existe (achado pelo código
            dele) — importe os Mensalistas primeiro. Corresponde ao ESTASUBS.dbf do legado.
          </p>
        )}
        {erro && <div className="aviso" style={{ marginTop: 10 }}>{erro}</div>}
        {dbf && (
          <p className="suave" style={{ marginTop: 10 }}>
            <strong>{dbf.nomeArquivo}</strong> — {dbf.registros.length} registro(s), {dbf.campos.length} campo(s) encontrado(s).
          </p>
        )}
      </div>

      {dbf && (
        <div className="card">
          <h2>Mapeamento — {destinoAtual.rotulo}</h2>
          <p className="suave">
            Confira se cada coluna bateu com o campo certo do arquivo (os nomes de campo
            do legado variam). "— não importar —" deixa a coluna em branco.
          </p>
          <div className="tabela-scroll">
            <table>
              <thead><tr><th>Coluna</th><th>Campo no .dbf</th></tr></thead>
              <tbody>
                {destinoAtual.colunas.map((c) => (
                  <tr key={c.campo}>
                    <td>{c.rotulo}{c.obrigatorio ? ' *' : ''}</td>
                    <td>
                      <select value={mapeamento[c.campo] ?? ''} onChange={(e) => setMapeamento((m) => ({ ...m, [c.campo]: e.target.value || null }))}>
                        <option value="">— não importar —</option>
                        {dbf.campos.map((f) => <option key={f.nome} value={f.nome}>{f.nome} ({f.tipo}, {f.tamanho})</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: 16 }}>Prévia (primeiras {Math.min(LIMITE_PREVIA, dbf.registros.length)} de {dbf.registros.length})</h2>
          <div className="tabela-scroll">
            <table>
              <thead><tr>{destinoAtual.colunas.map((c) => <th key={c.campo}>{c.rotulo}</th>)}</tr></thead>
              <tbody>
                {preview.map((linha, i) => (
                  <tr key={i}>
                    {destinoAtual.colunas.map((c) => <td key={c.campo}>{formatarPrevia(linha[c.campo])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="linha-form" style={{ marginTop: 16 }}>
            <button className="btn-primary" onClick={importar} disabled={importando}>
              {importando ? 'Importando…' : `Importar ${dbf.registros.length} registro(s)`}
            </button>
          </div>
        </div>
      )}

      {resultado && (
        <div className="card">
          <h2>Resultado</h2>
          <p>
            <strong>{resultado.criados}</strong> criado(s), <strong>{resultado.ignorados}</strong> ignorado(s)
            {' '}({ehVeiculosExtra ? 'placa já cadastrada' : 'código já existia'}).
          </p>
          {resultado.erros.length > 0 && (
            <>
              <p className="aviso">{resultado.erros.length} problema(s):</p>
              <ul>
                {resultado.erros.map((e, i) => <li key={i} className="suave">Linha {e.linha}: {e.motivo}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </>
  );
}

function formatarPrevia(v) {
  if (v === null || v === undefined) return '—';
  if (v === true) return 'Sim';
  if (v === false) return 'Não';
  return String(v);
}
