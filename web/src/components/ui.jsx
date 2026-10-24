import { useId, useMemo, useState } from 'react';

export const COR = {
  neon: '#00e5ff',
  ok: '#39ff9c',
  acima: '#ff3d8b',
  abaixo: '#ffc93c',
  tendencia: '#b388ff',
  neutro: '#8392b0',
  texto2: '#b4c0d8',
  borda: '#1f2e52',
};

export const COR_CATEGORIA = {
  'Dentro dos limites': COR.ok,
  'Acima do limite máximo': COR.acima,
  'Abaixo do limite mínimo': COR.abaixo,
  'Sem limite aplicável identificado': COR.neutro,
  'Pendente de validação': COR.texto2,
};

export const COR_TENDENCIA = {
  Aumentando: COR.acima,
  Diminuindo: COR.abaixo,
  'Sem tendência significativa': COR.ok,
  'Dados insuficientes': COR.neutro,
};
export const SIMBOLO_TENDENCIA = { Aumentando: '↗', Diminuindo: '↘', 'Sem tendência significativa': '→', 'Dados insuficientes': '·' };

export function Secao({ titulo, descricao, children, acoes }) {
  return (
    <section aria-label={titulo}>
      <header className="secao-cabecalho">
        <div>
          <h2>{titulo}</h2>
          {descricao && <p className="secao-descricao">{descricao}</p>}
        </div>
        {acoes}
      </header>
      {children}
    </section>
  );
}

export function Cartao({ titulo, children, largura = 'normal' }) {
  return (
    <div className={`cartao cartao-${largura}`}>
      {titulo && <h3>{titulo}</h3>}
      {children}
    </div>
  );
}

export function Kpi({ rotulo, valor, detalhe, cor }) {
  return (
    <div className="kpi" style={cor ? { '--cor': cor } : undefined}>
      <span className="kpi-rotulo">{rotulo}</span>
      <strong className="kpi-valor">{valor ?? '—'}</strong>
      {detalhe && <span className="kpi-detalhe">{detalhe}</span>}
    </div>
  );
}

export function SemDados({ titulo = 'Sem dados para exibir', children }) {
  return (
    <div className="sem-dados" role="status">
      <strong>{titulo}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Aviso({ tipo = 'info', children }) {
  return (
    <div className={`aviso aviso-${tipo}`} role={tipo === 'erro' ? 'alert' : 'note'}>
      {children}
    </div>
  );
}

export function Estado({ carregando, erro, children }) {
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (carregando) return <p className="carregando" role="status">Carregando…</p>;
  return children ?? null;
}

export function Seletor({ rotulo, valor, aoMudar, opcoes, todas = 'Todas', obrigatorio, pequeno }) {
  const id = useId();
  return (
    <div className={`campo ${pequeno ? 'campo-pequeno' : ''}`}>
      <label htmlFor={id}>{rotulo}</label>
      <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value)} required={obrigatorio}>
        {todas !== null && <option value="">{todas}</option>}
        {opcoes.map((o) => {
          const op = typeof o === 'object' ? o : { valor: o, rotulo: o };
          return (
            <option key={op.valor} value={op.valor}>
              {op.rotulo}
            </option>
          );
        })}
      </select>
    </div>
  );
}

export function CampoTexto({ rotulo, valor, aoMudar, tipo = 'text', placeholder, obrigatorio, pequeno, lista, ...resto }) {
  const id = useId();
  return (
    <div className={`campo ${pequeno ? 'campo-pequeno' : ''}`}>
      <label htmlFor={id}>{rotulo}</label>
      <input id={id} type={tipo} value={valor} placeholder={placeholder} required={obrigatorio} list={lista}
        onChange={(e) => aoMudar(e.target.value)} {...resto} />
    </div>
  );
}

export function Filtros({ children, aoLimpar }) {
  return (
    <div className="filtros" role="group" aria-label="Filtros">
      {children}
      {aoLimpar && (
        <button type="button" className="botao-secundario" onClick={aoLimpar}>
          Limpar
        </button>
      )}
    </div>
  );
}

export function Etiqueta({ cor, children, titulo }) {
  return (
    <span className="etiqueta" style={{ '--cor': cor }} title={titulo}>
      {children}
    </span>
  );
}

/**
 * Tabela com ordenação e paginação.
 * colunas: [{ chave, titulo, render?, numerica?, ordenavel?, valorOrdem? }]
 */
export function Tabela({ legenda, colunas, linhas, chaveLinha, porPagina = 25, aoSelecionar, selecionada }) {
  const [ordem, setOrdem] = useState({ chave: null, asc: true });
  const [pagina, setPagina] = useState(0);

  const ordenadas = useMemo(() => {
    if (!ordem.chave) return linhas;
    const col = colunas.find((c) => c.chave === ordem.chave);
    const val = (l) => (col?.valorOrdem ? col.valorOrdem(l) : l[ordem.chave]);
    return [...linhas].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const na = Number(va);
      const nb = Number(vb);
      const cmp = col?.numerica && Number.isFinite(na) && Number.isFinite(nb) ? na - nb : String(va).localeCompare(String(vb), 'pt-BR');
      return ordem.asc ? cmp : -cmp;
    });
  }, [linhas, ordem, colunas]);

  const totalPaginas = Math.max(1, Math.ceil(ordenadas.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const visiveis = ordenadas.slice(paginaAtual * porPagina, (paginaAtual + 1) * porPagina);

  return (
    <div className="tabela-container">
      <table>
        <caption>
          {legenda} <span className="contagem">· {ordenadas.length}</span>
        </caption>
        <thead>
          <tr>
            {colunas.map((c) => (
              <th key={c.chave} scope="col" className={c.numerica ? 'numerica' : undefined}
                aria-sort={ordem.chave === c.chave ? (ordem.asc ? 'ascending' : 'descending') : 'none'}>
                {c.ordenavel === false ? (
                  c.titulo
                ) : (
                  <button type="button" className="ordenar" onClick={() => { setOrdem((o) => ({ chave: c.chave, asc: o.chave === c.chave ? !o.asc : true })); setPagina(0); }}>
                    {c.titulo}
                    <span aria-hidden="true">{ordem.chave === c.chave ? (ordem.asc ? ' ↑' : ' ↓') : ''}</span>
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visiveis.map((l, i) => {
            const k = chaveLinha ? chaveLinha(l) : i;
            const sel = selecionada !== undefined && selecionada === k;
            return (
              <tr key={k} className={`${aoSelecionar ? 'selecionavel' : ''} ${sel ? 'selecionada' : ''}`}
                onClick={aoSelecionar ? () => aoSelecionar(l) : undefined}
                onKeyDown={aoSelecionar ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), aoSelecionar(l)) : undefined}
                tabIndex={aoSelecionar ? 0 : undefined} aria-selected={aoSelecionar ? sel : undefined}>
                {colunas.map((c) => (
                  <td key={c.chave} className={c.numerica ? 'numerica' : undefined}>
                    {c.render ? c.render(l) : (l[c.chave] ?? '—')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {totalPaginas > 1 && (
        <nav className="paginacao" aria-label={`Paginação: ${legenda}`}>
          <button type="button" onClick={() => setPagina(paginaAtual - 1)} disabled={paginaAtual === 0}>Anterior</button>
          <span>Página {paginaAtual + 1} de {totalPaginas}</span>
          <button type="button" onClick={() => setPagina(paginaAtual + 1)} disabled={paginaAtual >= totalPaginas - 1}>Próxima</button>
        </nav>
      )}
    </div>
  );
}
