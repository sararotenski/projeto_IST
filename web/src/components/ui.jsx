import { useId, useMemo, useState } from 'react';

export const PALETA = ['#8B5E3C', '#C8A27C', '#5C3D2E', '#D8B98F', '#A47551', '#3B2618', '#B88B5E', '#E3CBA8'];

export const COR_CATEGORIA = {
  'Dentro dos limites': '#6B7B3A',
  'Abaixo do limite mínimo': '#C68A2E',
  'Acima do limite máximo': '#A0402A',
  'Sem limite aplicável identificado': '#9C8A78',
  'Pendente de validação': '#5C3D2E',
};

export function Secao({ titulo, descricao, children, acoes }) {
  return (
    <section className="secao" aria-label={titulo}>
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

export function Kpi({ rotulo, valor, detalhe, destaque }) {
  return (
    <div className={`kpi ${destaque ? 'kpi-destaque' : ''}`}>
      <span className="kpi-rotulo">{rotulo}</span>
      <strong className="kpi-valor">{valor ?? '—'}</strong>
      {detalhe && <span className="kpi-detalhe">{detalhe}</span>}
    </div>
  );
}

/** Mensagem para quando não há dados suficientes (nunca mostra números fictícios). */
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

/** Envolve o conteúdo dependente da API com estados de carregamento e erro. */
export function Estado({ carregando, erro, children }) {
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (carregando) return <p className="carregando" role="status">Carregando…</p>;
  return children;
}

export function Seletor({ rotulo, valor, aoMudar, opcoes, todas = 'Todas' }) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value)}>
        <option value="">{todas}</option>
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

export function CampoTexto({ rotulo, valor, aoMudar, tipo = 'text', placeholder }) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <input id={id} type={tipo} value={valor} placeholder={placeholder} onChange={(e) => aoMudar(e.target.value)} />
    </div>
  );
}

export function Filtros({ children, aoLimpar }) {
  return (
    <div className="filtros" role="group" aria-label="Filtros">
      {children}
      {aoLimpar && (
        <button type="button" className="botao-secundario" onClick={aoLimpar}>
          Limpar filtros
        </button>
      )}
    </div>
  );
}

export function Etiqueta({ cor, children }) {
  return (
    <span className="etiqueta" style={{ '--cor': cor }}>
      {children}
    </span>
  );
}

/**
 * Tabela com ordenação por coluna e paginação.
 * colunas: [{ chave, titulo, render?, numerica?, ordenavel? }]
 */
export function Tabela({ legenda, colunas, linhas, chaveLinha, porPagina = 25 }) {
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

  const ordenar = (chave) => {
    setOrdem((o) => ({ chave, asc: o.chave === chave ? !o.asc : true }));
    setPagina(0);
  };

  return (
    <div className="tabela-container">
      <table>
        <caption>
          {legenda} <span className="contagem">({ordenadas.length} registros)</span>
        </caption>
        <thead>
          <tr>
            {colunas.map((c) => (
              <th
                key={c.chave}
                scope="col"
                className={c.numerica ? 'numerica' : undefined}
                aria-sort={ordem.chave === c.chave ? (ordem.asc ? 'ascending' : 'descending') : 'none'}
              >
                {c.ordenavel === false ? (
                  c.titulo
                ) : (
                  <button type="button" className="ordenar" onClick={() => ordenar(c.chave)}>
                    {c.titulo}
                    <span aria-hidden="true">{ordem.chave === c.chave ? (ordem.asc ? ' ▲' : ' ▼') : ''}</span>
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visiveis.map((l, i) => (
            <tr key={chaveLinha ? chaveLinha(l) : i}>
              {colunas.map((c) => (
                <td key={c.chave} className={c.numerica ? 'numerica' : undefined}>
                  {c.render ? c.render(l) : (l[c.chave] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {totalPaginas > 1 && (
        <nav className="paginacao" aria-label={`Paginação: ${legenda}`}>
          <button type="button" onClick={() => setPagina(paginaAtual - 1)} disabled={paginaAtual === 0}>
            Anterior
          </button>
          <span>
            Página {paginaAtual + 1} de {totalPaginas}
          </span>
          <button type="button" onClick={() => setPagina(paginaAtual + 1)} disabled={paginaAtual >= totalPaginas - 1}>
            Próxima
          </button>
        </nav>
      )}
    </div>
  );
}
