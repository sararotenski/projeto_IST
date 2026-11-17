import { useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApi, numero, dataBR, nomeCurto } from '../api.js';
import { Aviso, Cartao, COR, CampoTexto, Estado, Filtros, Kpi, Secao, Seletor, SemDados, Tabela } from '../components/ui.jsx';

const vazio = { agrupamento: 'semana', ensaio: '', legislacao: '', inicio: '', fim: '' };
const eixo = { fill: '#8392b0', fontSize: 12 };
const SERIES = [
  ['dentro', 'Dentro', COR.ok],
  ['acima', 'Acima', COR.acima],
  ['abaixo', 'Abaixo', COR.abaixo],
  ['inconclusivos', 'Inconclusivo', COR.tendencia],
  ['pendentes', 'Pendente', COR.texto2],
];

const rotuloPeriodo = (p, agrupamento) => {
  if (agrupamento === 'mes') {
    const [a, m] = p.inicio.split('-');
    return `${m}/${a}`;
  }
  return dataBR(p.inicio).slice(0, 5);
};
const pct = (v) => (v === null || v === undefined ? '—' : `${numero(v)}%`);

/** Abre a aba Resultados com os filtros do período clicado. */
function abrirResultados(periodo, f) {
  const q = new URLSearchParams({ inicio: periodo.inicio, fim: periodo.fim });
  if (f.ensaio) q.set('ensaio', f.ensaio);
  if (f.legislacao) q.set('legislacao', f.legislacao);
  window.location.hash = `resultados/${q}`;
}

function DicaPeriodo({ active, payload, agrupamento }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="recharts-default-tooltip" style={{ padding: '0.6rem 0.8rem' }}>
      <strong>{agrupamento === 'mes' ? rotuloPeriodo(p, 'mes') : `${dataBR(p.inicio)} a ${dataBR(p.fim)}`}</strong>
      <div className="nota">{p.comparados} comparados · {pct(p.percentualFora)} fora</div>
      {SERIES.filter(([k]) => p[k] > 0).map(([k, nome, cor]) => (
        <div key={k} style={{ color: cor }}>{nome}: {p[k]}</div>
      ))}
      {p.comparados > 0 && <div className="nota">Clique para ver os resultados</div>}
    </div>
  );
}

export default function Evolucao() {
  const [f, setF] = useState(vazio);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const op = useApi('opcoes');
  const ev = useApi('evolucao', f);

  return (
    <Secao titulo="Evolução ao longo do tempo"
      descricao="Quantos resultados ficaram dentro e fora do limite em cada período, pela data de coleta. O gráfico descreve o que aconteceu; não é uma tendência estatística (para isso, veja a aba Tendências).">
      <Estado erro={op.erro} carregando={op.carregando}>
        {op.dados && (
          <Filtros aoLimpar={() => setF(vazio)}>
            <Seletor rotulo="Agrupar por" valor={f.agrupamento} aoMudar={set('agrupamento')} todas={null}
              opcoes={[{ valor: 'semana', rotulo: 'Semana' }, { valor: 'mes', rotulo: 'Mês' }]} pequeno />
            <Seletor rotulo="Ensaio" valor={f.ensaio} aoMudar={set('ensaio')} todas="Todos"
              opcoes={op.dados.todosEnsaios.map((e) => ({ valor: String(e.id), rotulo: `${e.nome} (${e.codigo})` }))} />
            <Seletor rotulo="Portaria" valor={f.legislacao} aoMudar={set('legislacao')} todas="Classificação geral"
              opcoes={op.dados.legislacoes.map((l) => ({ valor: l.nome, rotulo: nomeCurto(l.nome) }))} />
            <CampoTexto rotulo="Coleta de" tipo="date" valor={f.inicio} aoMudar={set('inicio')} pequeno />
            <CampoTexto rotulo="Até" tipo="date" valor={f.fim} aoMudar={set('fim')} pequeno />
          </Filtros>
        )}
      </Estado>
      <Estado erro={ev.erro} carregando={ev.carregando}>
        {ev.dados && <Conteudo dados={ev.dados} filtros={f} />}
      </Estado>
    </Secao>
  );
}

function Conteudo({ dados, filtros }) {
  const t = dados.total;
  if (!dados.periodos.length || t.comparados === 0) {
    return (
      <SemDados titulo="Nenhum resultado comparado neste recorte">
        {t.semLimite > 0
          ? `Há ${t.semLimite} resultado(s), mas nenhum tem limite ${filtros.legislacao ? 'nesta portaria' : 'em alguma portaria'}.`
          : <>Ajuste os filtros ou importe resultados em <a href="#lancar">Lançar resultados</a>.</>}
      </SemDados>
    );
  }
  const grafico = dados.periodos.map((p) => ({ ...p, rotulo: rotuloPeriodo(p, dados.agrupamento) }));
  const clicar = (item) => {
    const p = item?.payload ?? item;
    if (p?.inicio && p.comparados > 0) abrirResultados(p, filtros);
  };

  return (
    <>
      <div className="kpis">
        <Kpi rotulo="Resultados comparados" valor={numero(t.comparados)} detalhe={`${dados.periodos.length} ${dados.agrupamento === 'mes' ? 'mês(es)' : 'semana(s)'}`} cor={COR.neon} />
        <Kpi rotulo="Fora do limite" valor={numero(t.acima + t.abaixo)} detalhe={`${pct(t.percentualFora)} · ${t.acima} acima · ${t.abaixo} abaixo`} cor={COR.acima} />
        <Kpi rotulo="Inconclusivos" valor={numero(t.inconclusivos)} cor={COR.tendencia} />
        {t.semLimite > 0 && <Kpi rotulo="Sem limite" valor={numero(t.semLimite)} detalhe="não entram no total" cor={COR.neutro} />}
      </div>

      {dados.periodos.length < 3 && (
        <Aviso tipo="atencao">Só {dados.periodos.length} período(s) neste recorte. {dados.agrupamento === 'mes' ? 'Experimente agrupar por semana.' : 'Amplie o período para comparar mais semanas.'}</Aviso>
      )}

      <Cartao largura="total" titulo={`Resultados por ${dados.agrupamento === 'mes' ? 'mês' : 'semana'} de coleta · linha = % fora do limite`}>
        <div role="img" aria-label={`Gráfico de barras: ${grafico.map((p) => `${p.rotulo}: ${p.comparados} comparados, ${pct(p.percentualFora)} fora`).join('; ')}`}>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={grafico} margin={{ top: 16, right: 16, left: 0, bottom: 8 }} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="2 6" vertical={false} />
              <XAxis dataKey="rotulo" tick={eixo} />
              <YAxis yAxisId="n" tick={eixo} allowDecimals={false} width={48} />
              <YAxis yAxisId="pct" orientation="right" tick={eixo} width={48} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<DicaPeriodo agrupamento={dados.agrupamento} />} cursor={{ fill: 'rgb(0 229 255 / 0.06)' }} />
              <Legend />
              {SERIES.filter(([k]) => dados.periodos.some((p) => p[k] > 0)).map(([k, nome, cor]) => (
                <Bar key={k} yAxisId="n" dataKey={k} name={nome} stackId="a" fill={cor} onClick={clicar} isAnimationActive={false} />
              ))}
              <Line yAxisId="pct" dataKey="percentualFora" name="% fora do limite" stroke={COR.neon} strokeWidth={2}
                dot={{ r: 4, fill: COR.neon }} connectNulls isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="nota">Clique numa barra para abrir esses resultados na aba Resultados.</p>
      </Cartao>

      <div style={{ marginTop: '1.25rem' }}>
        <Tabela legenda="Números por período" chaveLinha={(p) => p.inicio} linhas={dados.periodos} porPagina={53}
          aoSelecionar={(p) => p.comparados > 0 && abrirResultados(p, filtros)}
          colunas={[
            { chave: 'inicio', titulo: dados.agrupamento === 'mes' ? 'Mês' : 'Semana', render: (p) => (dados.agrupamento === 'mes' ? rotuloPeriodo(p, 'mes') : `${dataBR(p.inicio)} a ${dataBR(p.fim)}`) },
            { chave: 'comparados', titulo: 'Comparados', numerica: true },
            { chave: 'dentro', titulo: 'Dentro', numerica: true },
            { chave: 'acima', titulo: 'Acima', numerica: true, render: (p) => <span style={{ color: p.acima ? COR.acima : undefined }}>{p.acima}</span> },
            { chave: 'abaixo', titulo: 'Abaixo', numerica: true, render: (p) => <span style={{ color: p.abaixo ? COR.abaixo : undefined }}>{p.abaixo}</span> },
            { chave: 'inconclusivos', titulo: 'Inconcl.', numerica: true },
            { chave: 'percentualFora', titulo: '% fora', numerica: true, render: (p) => pct(p.percentualFora) },
            { chave: 'sem_limite', titulo: 'Sem limite', numerica: true },
          ]} />
      </div>
    </>
  );
}
