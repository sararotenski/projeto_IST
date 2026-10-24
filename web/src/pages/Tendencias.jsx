import { useState } from 'react';
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApi, numero, dataBR } from '../api.js';
import { Aviso, Cartao, COR, COR_CATEGORIA, COR_TENDENCIA, Estado, Etiqueta, Filtros, Secao, Seletor, SemDados, SIMBOLO_TENDENCIA, Tabela } from '../components/ui.jsx';

const SITUACOES = ['Aumentando', 'Diminuindo', 'Sem tendência significativa', 'Dados insuficientes', 'Valor atípico'];
const eixo = { fill: '#8392b0', fontSize: 12 };

const colunas = [
  { chave: 'pontoColeta', titulo: 'Ponto', render: (s) => s.pontoColeta ?? <span title="Sem ponto de coleta: série provisória">—</span> },
  { chave: 'ensaio', titulo: 'Ensaio', render: (s) => <>{s.ensaio} <span className="codigo">{s.codigoEnsaio}</span></> },
  { chave: 'n', titulo: 'Resultados', numerica: true },
  { chave: 'ultimo', titulo: 'Último', numerica: true, valorOrdem: (s) => Number(s.ultimo.valor), render: (s) => `${numero(s.ultimo.valor)} ${s.unidade ?? ''}` },
  {
    chave: 'tendencia',
    titulo: 'Tendência',
    valorOrdem: (s) => s.tendencia.situacao,
    render: (s) => <Etiqueta cor={COR_TENDENCIA[s.tendencia.situacao]}>{SIMBOLO_TENDENCIA[s.tendencia.situacao]} {s.tendencia.situacao}</Etiqueta>,
  },
  { chave: 'p', titulo: 'p-valor', numerica: true, valorOrdem: (s) => s.tendencia.p ?? 9, render: (s) => (s.tendencia.p === undefined ? '—' : numero(Math.round(s.tendencia.p * 1000) / 1000)) },
  { chave: 'desvioPadrao', titulo: 'Desvio-padrão', numerica: true, render: (s) => numero(s.desvioPadrao === null ? null : Number(s.desvioPadrao.toPrecision(3))) },
  { chave: 'atipicos', titulo: 'Atípicos', numerica: true, render: (s) => (s.atipicos ? <Etiqueta cor={COR.neon}>{s.atipicos}</Etiqueta> : '0') },
  { chave: 'foraDoLimite', titulo: 'Fora do limite', numerica: true, render: (s) => (s.foraDoLimite ? <Etiqueta cor={COR.acima}>{s.foraDoLimite}</Etiqueta> : '0') },
];

export default function Tendencias({ parametro }) {
  const [ensaio, setEnsaio] = useState('');
  const [situacao, setSituacao] = useState('');
  const [serie, setSerie] = useState(parametro ?? '');
  const op = useApi('opcoes');
  const lista = useApi('tendencias', { ensaio, situacao });

  return (
    <Secao titulo="Tendências e desvios"
      descricao="Cada série reúne os resultados de um mesmo ponto de coleta, ensaio e unidade. A tendência é avaliada pelo teste de Mann-Kendall (p < 0,05, mínimo de 5 resultados) e os desvios pelo critério de 2 desvios-padrão (mínimo de 6 resultados).">
      <Estado erro={op.erro} carregando={op.carregando}>
        {op.dados && (
          <Filtros aoLimpar={() => { setEnsaio(''); setSituacao(''); }}>
            <Seletor rotulo="Situação" valor={situacao} aoMudar={setSituacao} opcoes={SITUACOES} />
            <Seletor rotulo="Ensaio" valor={ensaio} aoMudar={setEnsaio} todas="Todos"
              opcoes={op.dados.todosEnsaios.map((e) => ({ valor: String(e.id), rotulo: `${e.nome} (${e.codigo})` }))} />
          </Filtros>
        )}
      </Estado>
      <Estado erro={lista.erro} carregando={lista.carregando}>
        {lista.dados && (lista.dados.length ? (
          <Tabela legenda="Séries (clique para ver o gráfico)" colunas={colunas} linhas={lista.dados} chaveLinha={(s) => s.serie}
            aoSelecionar={(s) => { setSerie(s.serie); window.history.replaceState(null, '', `#tendencias/${encodeURIComponent(s.serie)}`); }}
            selecionada={serie} porPagina={15} />
        ) : (
          <SemDados titulo="Nenhuma série encontrada">As séries aparecem quando há resultados lançados com data e valor.</SemDados>
        ))}
      </Estado>
      {serie && <Detalhe serie={serie} />}
    </Secao>
  );
}

function Detalhe({ serie }) {
  const { dados: s, erro, carregando } = useApi('serie', { serie });
  if (erro || carregando) return <div style={{ marginTop: '1.5rem' }}><Estado erro={erro} carregando={carregando} /></div>;
  if (!s) return null;

  const t = (d) => Date.parse(`${d}T00:00:00Z`);
  const idsAtipicos = new Set(s.atipicosDetalhe.map((a) => a.id_resultado));
  const pontos = s.pontos.map((p) => ({
    t: t(p.data_resultado),
    valor: Number(p.valor),
    categoria: p.categoria,
    amostra: p.codigo_amostra,
    atipico: idsAtipicos.has(p.id_resultado),
  }));
  const linha = s.linhaTendencia.map((l) => ({ t: t(l.data), tendencia: l.valor }));
  const dadosGrafico = [...pontos.map((p) => ({ ...p })), ...linha].sort((a, b) => a.t - b.t);
  const max = s.limite.maximo !== null ? Number(s.limite.maximo) : null;
  const min = s.limite.minimo !== null && Number(s.limite.minimo) > 0 ? Number(s.limite.minimo) : null;
  const banda = s.desvioPadrao && s.n >= s.parametros.minPontosDesvio ? [s.media - 2 * s.desvioPadrao, s.media + 2 * s.desvioPadrao] : null;

  const ponto = (props) => {
    const { cx, cy, payload } = props;
    if (cx === undefined || payload.valor === undefined) return null;
    const cor = COR_CATEGORIA[payload.categoria] ?? COR.neon;
    return (
      <g>
        {payload.atipico && <circle cx={cx} cy={cy} r={10} fill="none" stroke={COR.neon} strokeWidth={1.5} />}
        <circle cx={cx} cy={cy} r={5} fill={cor} stroke="#0a1224" strokeWidth={1.5} />
      </g>
    );
  };

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <Cartao largura="total" titulo={`${s.ensaio} · ${s.pontoColeta ? `ponto ${s.pontoColeta}` : 'série sem ponto de coleta'} · ${s.unidade ?? ''}`}>
        {!s.serieValidada && <Aviso tipo="atencao">Os resultados não têm ponto de coleta: a série foi montada por cliente, origem e matriz e precisa de validação.</Aviso>}
        <dl className="estatisticas">
          <div><dt>Tendência</dt><dd style={{ color: COR_TENDENCIA[s.tendencia.situacao] }}>{SIMBOLO_TENDENCIA[s.tendencia.situacao]} {s.tendencia.situacao}</dd></div>
          <div><dt>Taxa estimada (Sen)</dt><dd>{s.tendencia.inclinacaoPorAno === undefined || s.tendencia.inclinacaoPorAno === null ? '—' : `${numero(Number(s.tendencia.inclinacaoPorAno.toPrecision(3)))} ${s.unidade ?? ''}/ano`}</dd></div>
          <div><dt>Média</dt><dd>{numero(Number(s.media?.toPrecision(4)))}</dd></div>
          <div><dt>Desvio-padrão</dt><dd>{numero(s.desvioPadrao === null ? null : Number(s.desvioPadrao.toPrecision(3)))}</dd></div>
          <div><dt>Coef. de variação</dt><dd>{s.coeficienteVariacao === null ? '—' : `${numero(Math.round(s.coeficienteVariacao * 10) / 10)}%`}</dd></div>
          <div><dt>Limite</dt><dd>{max === null ? 'sem limite' : `${min !== null ? `${numero(min)} a ` : 'até '}${numero(max)} ${s.limite.unidade ?? ''}`}</dd></div>
        </dl>
        <p className="nota">{s.tendencia.descricao}</p>
        <div role="img" aria-label={`Gráfico da série ${s.serie}: ${s.n} resultados, ${s.tendencia.situacao.toLowerCase()}`}>
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={dadosGrafico} margin={{ top: 16, right: 80, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="2 6" />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tick={eixo} tickFormatter={(v) => dataBR(new Date(v).toISOString())} />
              <YAxis tick={eixo} width={70} domain={['auto', 'auto']} tickFormatter={(v) => numero(Number(Number(v).toPrecision(3)))} />
              <Tooltip labelFormatter={(v) => dataBR(new Date(v).toISOString())} formatter={(v, nome) => [numero(Number(Number(v).toPrecision(4))), nome]}
                contentStyle={{ background: '#14213f', border: '1px solid #1f2e52', borderRadius: 8 }} labelStyle={{ color: '#fff' }} />
              <Legend />
              {banda && <ReferenceArea y1={banda[0]} y2={banda[1]} fill={COR.neon} fillOpacity={0.05} stroke="none" ifOverflow="extendDomain" label={{ value: 'média ± 2σ', position: 'insideTopLeft', fill: '#8392b0', fontSize: 11 }} />}
              {max !== null && <ReferenceLine y={max} stroke={COR.acima} strokeDasharray="6 4" ifOverflow="extendDomain" label={{ value: `máx. ${numero(max)}`, position: 'right', fill: COR.acima, fontSize: 12 }} />}
              {min !== null && <ReferenceLine y={min} stroke={COR.abaixo} strokeDasharray="6 4" ifOverflow="extendDomain" label={{ value: `mín. ${numero(min)}`, position: 'right', fill: COR.abaixo, fontSize: 12 }} />}
              <Line dataKey="valor" name="Resultado" stroke={COR.neon} strokeWidth={1.5} dot={ponto} activeDot={false} connectNulls isAnimationActive={false} />
              {linha.length > 0 && <Line dataKey="tendencia" name="Tendência (Sen)" stroke={COR.tendencia} strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="nota">Pontos coloridos pela classificação · círculo externo = valor atípico · faixa clara = média ± 2 desvios-padrão.</p>
      </Cartao>
      <Tabela legenda="Resultados da série" chaveLinha={(p) => p.id_resultado} porPagina={50} linhas={s.pontos}
        colunas={[
          { chave: 'data_resultado', titulo: 'Data', render: (p) => dataBR(p.data_resultado) },
          { chave: 'codigo_amostra', titulo: 'Amostra' },
          { chave: 'valor', titulo: 'Resultado', numerica: true, render: (p) => `${numero(p.valor)} ${p.unidade_resultado ?? ''}` },
          { chave: 'categoria', titulo: 'Classificação', render: (p) => <Etiqueta cor={COR_CATEGORIA[p.categoria]}>{p.categoria}</Etiqueta> },
          { chave: 'atipico', titulo: 'Desvio', render: (p) => (idsAtipicos.has(p.id_resultado) ? <Etiqueta cor={COR.neon}>atípico</Etiqueta> : '—') },
          { chave: 'recorrencia_fora_limite', titulo: 'Recorrência', render: (p) => (p.recorrencia_fora_limite ? 'sim' : '—') },
        ]} />
    </div>
  );
}
