import { useMemo, useState } from 'react';
import { enviar, useApi, numero, dataBR, faixaLimite, nomeCurto, valorResultado } from '../api.js';
import { Aviso, CampoTexto, Cartao, COR_CATEGORIA, Estado, Etiqueta, Secao, Seletor, Tabela } from '../components/ui.jsx';

const amostraVazia = { codigo_amostra: '', ponto_coleta: '', cliente: '', legislacao: '', origem_amostra: '', data_coleta: '' };
const itemVazio = () => ({ chave: Math.random().toString(36).slice(2), codigo_ensaio: '', valor: '', unidade: '', data_resultado: '' });

export default function Lancar() {
  const op = useApi('opcoes');
  const lotes = useApi('lotes');
  const [retorno, setRetorno] = useState(null);

  const concluir = (r) => {
    setRetorno(r);
    lotes.recarregar();
    op.recarregar();
  };

  return (
    <Secao titulo="Lançar resultados" descricao="Os resultados são comparados com o limite de cada portaria no momento do lançamento. Cada importação vira um lote, que pode ser desfeito.">
      <Estado erro={op.erro} carregando={op.carregando}>
        {op.dados && (
          <div className="grade">
            <ImportarCsv aoConcluir={concluir} />
            <Formulario opcoes={op.dados} aoConcluir={concluir} />
          </div>
        )}
      </Estado>
      {retorno && <Retorno r={retorno} />}
      <h3 className="subtitulo">Lotes lançados</h3>
      <Lotes estado={lotes} aoDesfazer={() => { lotes.recarregar(); setRetorno(null); }} />
    </Secao>
  );
}

/** Lê o arquivo como UTF-8; se não for UTF-8 válido, como Windows-1252 (exportações antigas do Excel). */
async function lerTexto(arquivo) {
  const bytes = await arquivo.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function ImportarCsv({ aoConcluir }) {
  const [arquivos, setArquivos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);

  const importar = async (e) => {
    e.preventDefault();
    if (!arquivos.length) return;
    setEnviando(true);
    setErro(null);
    try {
      const lidos = await Promise.all(arquivos.map(async (a) => ({ nome: a.name, conteudo: await lerTexto(a) })));
      const { corpo } = await enviar('resultados/arquivos', { arquivos: lidos });
      aoConcluir(corpo);
    } catch (x) {
      setErro(x.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Cartao titulo="Importar arquivos do laboratório">
      <form onSubmit={importar}>
        <p className="nota">
          Selecione as exportações do sistema do laboratório: <strong>Gerência de Amostra</strong> e, se tiver, a <strong>Expedição</strong>
          {' '}(pode selecionar os dois de uma vez). O site junta os arquivos pelo código externo da amostra, compara cada resultado com
          {' '}cada portaria e mostra o que ficou de fora e por quê. Reenviar um arquivo não duplica resultados.
        </p>
        <div className="campo" style={{ flexBasis: '100%', maxWidth: 'none' }}>
          <label htmlFor="arquivo-csv">Arquivos CSV</label>
          <input id="arquivo-csv" type="file" multiple accept=".csv,text/csv" onChange={(e) => setArquivos([...(e.target.files ?? [])])} />
        </div>
        {arquivos.length > 0 && <p className="nota">{arquivos.map((a) => a.name).join(' + ')}</p>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div className="acoes">
          <button className="botao" type="submit" disabled={!arquivos.length || enviando}>{enviando ? 'Importando…' : 'Importar e comparar'}</button>
        </div>
        <p className="nota" style={{ marginTop: '1rem' }}>
          Também aceita o modelo do site (um arquivo): <a href="/api/modelo-csv">baixar modelo</a> · <a href="/api/exemplo-csv">demonstração fictícia</a>.
        </p>
      </form>
    </Cartao>
  );
}

function Formulario({ opcoes, aoConcluir }) {
  const [amostra, setAmostra] = useState(amostraVazia);
  const [itens, setItens] = useState([itemVazio()]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const setA = (k) => (v) => setAmostra((a) => ({ ...a, [k]: v }));

  // um item por código de ensaio (o mesmo código pode ter limites de classes diferentes)
  const ensaios = useMemo(() => {
    const m = new Map();
    for (const e of opcoes.ensaios) {
      if (e.legislacao !== amostra.legislacao || e.origem_amostra !== amostra.origem_amostra) continue;
      if (m.has(e.codigo)) m.get(e.codigo).classe = 'mais de uma classe';
      else m.set(e.codigo, { ...e });
    }
    return [...m.values()];
  }, [opcoes.ensaios, amostra.legislacao, amostra.origem_amostra]);
  const origens = useMemo(
    () => [...new Set(opcoes.ensaios.filter((e) => !amostra.legislacao || e.legislacao === amostra.legislacao).map((e) => e.origem_amostra))].sort(),
    [opcoes.ensaios, amostra.legislacao],
  );

  const setItem = (chave, campo, valor) =>
    setItens((xs) => xs.map((x) => {
      if (x.chave !== chave) return x;
      const novo = { ...x, [campo]: valor };
      if (campo === 'codigo_ensaio') novo.unidade = ensaios.find((e) => e.codigo === valor)?.unidade ?? '';
      return novo;
    }));

  const lancar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const corpo = { itens: itens.map(({ chave, ...i }) => ({ ...amostra, ...i })) };
      const { ok, corpo: r } = await enviar('resultados', corpo);
      aoConcluir(r);
      if (ok) setItens([itemVazio()]);
    } catch (x) {
      setErro(x.message);
    } finally {
      setEnviando(false);
    }
  };

  const limite = (codigo) => {
    const l = ensaios.find((x) => x.codigo === codigo);
    if (!l) return null;
    return `${Number(l.valor_minimo) > 0 ? `${numero(l.valor_minimo)} a ` : 'até '}${numero(l.valor_maximo)} ${l.unidade}`;
  };

  return (
    <Cartao titulo="Lançar manualmente">
      <form onSubmit={lancar}>
        <div className="filtros">
          <CampoTexto rotulo="Código da amostra" valor={amostra.codigo_amostra} aoMudar={setA('codigo_amostra')} obrigatorio />
          <CampoTexto rotulo="Ponto de coleta" valor={amostra.ponto_coleta} aoMudar={setA('ponto_coleta')} obrigatorio lista="lista-pontos" />
          <CampoTexto rotulo="Cliente" valor={amostra.cliente} aoMudar={setA('cliente')} obrigatorio lista="lista-clientes" maxLength={30} />
          <Seletor rotulo="Legislação" valor={amostra.legislacao} aoMudar={(v) => { setA('legislacao')(v); setItens([itemVazio()]); }}
            todas="Selecione" obrigatorio opcoes={opcoes.legislacoes.map((l) => l.nome)} />
          <Seletor rotulo="Origem da amostra" valor={amostra.origem_amostra} aoMudar={(v) => { setA('origem_amostra')(v); setItens([itemVazio()]); }}
            todas="Selecione" obrigatorio opcoes={origens} />
          <CampoTexto rotulo="Data da coleta" tipo="date" valor={amostra.data_coleta} aoMudar={setA('data_coleta')} obrigatorio pequeno />
        </div>
        <datalist id="lista-pontos">{opcoes.pontos.map((p) => <option key={p} value={p} />)}</datalist>
        <datalist id="lista-clientes">{opcoes.clientes.map((c) => <option key={c} value={c} />)}</datalist>

        {itens.map((it, i) => (
          <div className="linha-item" key={it.chave}>
            <Seletor rotulo={`Ensaio ${i + 1}`} valor={it.codigo_ensaio} aoMudar={(v) => setItem(it.chave, 'codigo_ensaio', v)} todas={ensaios.length ? 'Selecione' : 'Escolha legislação e origem'}
              obrigatorio opcoes={ensaios.map((e) => ({ valor: e.codigo, rotulo: `${e.nome} (${e.codigo})${e.classe ? ` · ${e.classe}` : ''}` }))} />
            <CampoTexto rotulo="Valor" valor={it.valor} aoMudar={(v) => setItem(it.chave, 'valor', v)} obrigatorio pequeno inputMode="decimal" placeholder="0,00" />
            <CampoTexto rotulo="Unidade" valor={it.unidade} aoMudar={(v) => setItem(it.chave, 'unidade', v)} pequeno />
            <CampoTexto rotulo="Data do resultado" tipo="date" valor={it.data_resultado} aoMudar={(v) => setItem(it.chave, 'data_resultado', v)} pequeno />
            <span className="nota" style={{ alignSelf: 'center' }}>{limite(it.codigo_ensaio) ? `Limite: ${limite(it.codigo_ensaio)}` : ''}</span>
            {itens.length > 1 && (
              <button type="button" className="botao-secundario" onClick={() => setItens((xs) => xs.filter((x) => x.chave !== it.chave))} aria-label={`Remover ensaio ${i + 1}`}>Remover</button>
            )}
          </div>
        ))}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div className="acoes">
          <button type="button" className="botao-secundario" onClick={() => setItens((xs) => [...xs, itemVazio()])}>+ Ensaio</button>
          <button className="botao" type="submit" disabled={enviando}>{enviando ? 'Lançando…' : 'Lançar e comparar'}</button>
        </div>
      </form>
    </Cartao>
  );
}

function Retorno({ r }) {
  if (r.erros) {
    return (
      <Cartao largura="total" titulo="Nada foi gravado: corrija os erros abaixo">
        <ul>
          {r.erros.slice(0, 100).map((e, i) => <li key={i}>{e.linha ? `Linha ${e.linha}: ` : ''}{e.mensagem}</li>)}
        </ul>
        {r.erros.length > 100 && <p className="nota">… e mais {r.erros.length - 100} erros.</p>}
      </Cartao>
    );
  }
  if (r.relatorio) return <RetornoLaboratorio r={r} />;
  const fora = r.resultados.filter((x) => x.categoria === 'Acima do limite máximo' || x.categoria === 'Abaixo do limite mínimo').length;
  return (
    <div style={{ marginTop: '1.25rem' }}>
      <Aviso tipo={fora ? 'atencao' : 'ok'}>
        Lote {r.lote} gravado: {r.resultados.length} resultado(s) de {r.amostras} amostra(s). {fora ? `${fora} fora do limite.` : 'Nenhum fora do limite.'}{' '}
        Alertas gerados: {r.alertas.conformidade + r.alertas.estatisticos}. Veja o <a href="#painel">Painel</a> e as <a href="#tendencias">Tendências</a>.
      </Aviso>
      <Tabela legenda="Comparação automática" chaveLinha={(x) => x.id_resultado} linhas={r.resultados} porPagina={15}
        colunas={[
          { chave: 'codigo_amostra', titulo: 'Amostra' },
          { chave: 'ensaio', titulo: 'Ensaio' },
          { chave: 'valor', titulo: 'Resultado', numerica: true, render: (x) => `${numero(x.valor)} ${x.unidade_resultado ?? ''}` },
          { chave: 'limite', titulo: 'Limite', ordenavel: false, render: (x) => (x.valor_maximo === null ? '—' : `${Number(x.valor_minimo) > 0 ? `${numero(x.valor_minimo)} a ` : 'até '}${numero(x.valor_maximo)} ${x.unidade_limite ?? ''}`) },
          { chave: 'categoria', titulo: 'Classificação', render: (x) => <Etiqueta cor={COR_CATEGORIA[x.categoria]} titulo={x.motivo_pendencia ?? undefined}>{x.categoria}</Etiqueta> },
        ]} />
    </div>
  );
}

function Lotes({ estado, aoDesfazer }) {
  const [erro, setErro] = useState(null);
  const desfazer = async (l) => {
    if (!window.confirm(`Desfazer o lote ${l.id_lote}? Isso remove as ${l.qtd_amostras} amostras e os ${l.qtd_resultados} resultados lançados nele (e seus alertas).`)) return;
    try {
      await enviar(`lotes/${l.id_lote}/desfazer`);
      aoDesfazer();
    } catch (x) {
      setErro(x.message);
    }
  };
  return (
    <Estado erro={estado.erro} carregando={estado.carregando}>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {estado.dados && (estado.dados.length ? (
        <Tabela legenda="Lotes" chaveLinha={(l) => l.id_lote} linhas={estado.dados} porPagina={10}
          colunas={[
            { chave: 'id_lote', titulo: 'Lote', numerica: true },
            { chave: 'criado_em', titulo: 'Lançado em', render: (l) => dataBR(l.criado_em) },
            { chave: 'origem', titulo: 'Origem', render: (l) => ({ csv: `CSV · ${l.arquivo ?? ''}`, laboratorio: `Laboratório · ${l.arquivo ?? ''}` }[l.origem] ?? 'Formulário') },
            { chave: 'qtd_resultados', titulo: 'Resultados', numerica: true },
            { chave: 'situacao', titulo: 'Situação', ordenavel: false, render: (l) => (l.desfeito_em ? `desfeito em ${dataBR(l.desfeito_em)}` : 'ativo') },
            { chave: 'acao', titulo: '', ordenavel: false, render: (l) => (!l.desfeito_em && <button type="button" className="botao-secundario botao-perigo" onClick={() => desfazer(l)}>Desfazer</button>) },
          ]} />
      ) : (
        <p className="nota">Nenhum lote lançado.</p>
      ))}
    </Estado>
  );
}

const TIPO_ARQUIVO = { gerencia: 'Gerência de Amostra', expedicao: 'Expedição', modelo: 'Modelo do site' };

/** Relatório da importação das exportações do laboratório. */
function RetornoLaboratorio({ r }) {
  const rel = r.relatorio;
  const c = rel.porCategoria ?? {};
  const fora = (c['Acima do limite máximo'] ?? 0) + (c['Abaixo do limite mínimo'] ?? 0);
  const ignorados = rel.semLimite + rel.invalidos.length;
  return (
    <div style={{ marginTop: '1.25rem' }}>
      {r.aviso ? (
        <Aviso tipo="atencao">{r.aviso}</Aviso>
      ) : (
        <Aviso tipo={fora ? 'atencao' : 'ok'}>
          Lote {r.lote} gravado: {rel.importados} resultado(s) comparados, de {rel.amostrasComResultado} amostra(s).{' '}
          {fora ? `${fora} fora do limite` : 'Nenhum fora do limite'}{c.Inconclusivo ? ` e ${c.Inconclusivo} inconclusivo(s)` : ''}.{' '}
          Veja o <a href="#painel">Painel</a> e os <a href="#resultados">Resultados</a>.
        </Aviso>
      )}
      <div className="grade">
        <Cartao titulo="O que foi lido">
          <ul>
            {rel.arquivos.map((a) => <li key={a.nome}>{a.nome}: {TIPO_ARQUIVO[a.tipo] ?? a.tipo}, {a.linhas} linha(s)</li>)}
            <li>{numero(rel.amostrasNoArquivo)} amostras e {numero(rel.resultadosNoArquivo)} resultados nos arquivos</li>
            <li><strong>{numero(rel.importados)}</strong> resultados importados e comparados ({numero(rel.amostrasNovas)} amostras novas)</li>
            {rel.jaImportados > 0 && <li>{numero(rel.jaImportados)} já tinham sido importados antes (mantidos)</li>}
          </ul>
        </Cartao>
        <Cartao titulo="Classificação por portaria">
          <ul>
            {Object.entries(r.porPortaria.reduce((m, p) => ({ ...m, [p.legislacao]: { ...(m[p.legislacao] ?? {}), [p.categoria]: p.n } }), {})).map(([leg, cats]) => (
              <li key={leg}>
                <strong>{nomeCurto(leg)}</strong>:{' '}
                {Object.entries(cats).map(([cat, n]) => `${n} ${cat === 'Sem limite aplicável identificado' ? 'não se aplica' : cat.toLowerCase()}`).join(' · ')}
              </li>
            ))}
          </ul>
        </Cartao>
        <Cartao titulo={`Ficou de fora (${numero(ignorados + rel.naoAgua.length)})`}>
          <ul>
            <li>{numero(rel.semLimite)} resultado(s) de ensaios sem limite em nenhuma portaria (ex.: {rel.ensaiosSemLimite.slice(0, 4).map((e) => e.ensaio).join(', ')}{rel.ensaiosSemLimite.length > 4 ? '…' : ''})</li>
            {rel.naoAgua.length > 0 && (
              <li>{rel.naoAgua.length} amostra(s) que não são água: {rel.naoAgua.map((a) => `${a.amostra} (${a.ponto})`).join('; ')}</li>
            )}
            {rel.invalidos.length > 0 && <li>{rel.invalidos.length} valor(es) não reconhecidos (lista abaixo)</li>}
          </ul>
        </Cartao>
      </div>
      {rel.invalidos.length > 0 && (
        <Tabela legenda="Valores não reconhecidos" chaveLinha={(x, i) => `${x.amostra}-${x.ensaio}-${i}`} linhas={rel.invalidos} porPagina={10}
          colunas={[{ chave: 'amostra', titulo: 'Amostra' }, { chave: 'ensaio', titulo: 'Ensaio' }, { chave: 'valor', titulo: 'Valor' }, { chave: 'motivo', titulo: 'Motivo' }]} />
      )}
      {r.resultados.length > 0 && (
        <div style={{ marginTop: '1.25rem' }}>
          <Tabela legenda="Resultados importados (fora do limite primeiro)" chaveLinha={(x) => x.id_resultado} linhas={r.resultados} porPagina={15}
            colunas={[
              { chave: 'codigo_amostra', titulo: 'Amostra' },
              { chave: 'ensaio', titulo: 'Ensaio', render: (x) => <>{x.ensaio} <span className="codigo">{x.codigo_ensaio}</span></> },
              { chave: 'valor', titulo: 'Resultado', numerica: true, render: (x) => valorResultado(x) },
              { chave: 'limite', titulo: 'Limite', ordenavel: false, render: (x) => faixaLimite(x.valor_minimo, x.valor_maximo, x.unidade_limite) },
              { chave: 'legislacao', titulo: 'Portaria', render: (x) => (x.legislacao ? nomeCurto(x.legislacao) : '—') },
              { chave: 'categoria', titulo: 'Classificação', render: (x) => <Etiqueta cor={COR_CATEGORIA[x.categoria]} titulo={x.motivo_inconclusivo ?? x.motivo_pendencia ?? undefined}>{x.categoria}</Etiqueta> },
            ]} />
        </div>
      )}
    </div>
  );
}
