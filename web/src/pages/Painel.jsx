import { useApi, numero, dataBR, faixaLimite, nomeCurto, valorResultado } from '../api.js';
import { Cartao, COR, COR_CATEGORIA, Estado, Kpi, Secao, SemDados, Tabela } from '../components/ui.jsx';

const ICONE = {
  acima: { s: '▲', cor: COR.acima },
  abaixo: { s: '▼', cor: COR.abaixo },
  inconclusivo: { s: '?', cor: COR.tendencia },
  aumento: { s: '↗', cor: COR.tendencia },
  reducao: { s: '↘', cor: COR.tendencia },
  atipico: { s: '◆', cor: COR.neon },
};
const MAX_ATENCAO = 40;

export default function Painel() {
  const { dados, erro, carregando } = useApi('painel');
  return (
    <Secao titulo="Painel" descricao="Cada resultado é comparado automaticamente com o limite de cada portaria. Séries de um mesmo ponto de coleta são analisadas quanto a tendência e desvios.">
      <Estado erro={erro} carregando={carregando}>
        {dados && <Conteudo dados={dados} />}
      </Estado>
    </Secao>
  );
}

function Conteudo({ dados }) {
  const k = dados.kpis;
  if (k.resultados === 0) {
    return (
      <SemDados titulo="Nenhum resultado lançado ainda">
        Importe as exportações do sistema do laboratório (Gerência de Amostra e Expedição) em <a href="#lancar">Lançar resultados</a>.
        {' '}{numero(k.limites)} limites legais de {k.legislacoes} legislações já estão prontos para a comparação.
      </SemDados>
    );
  }
  const categorias = [
    ['Dentro dos limites', k.dentro],
    ['Acima do limite máximo', k.acima],
    ['Abaixo do limite mínimo', k.abaixo],
    ['Inconclusivo', k.inconclusivos],
    ['Sem limite aplicável identificado', k.sem_limite],
    ['Pendente de validação', k.pendentes],
  ].filter(([, n]) => n > 0);
  const pct = (n) => (k.resultados ? `${numero(Math.round((n / k.resultados) * 1000) / 10)}%` : '—');

  return (
    <>
      <div className="kpis">
        <Kpi rotulo="Resultados analisados" valor={numero(k.resultados)} detalhe={`${numero(k.amostras)} amostras`} cor={COR.neon} />
        <Kpi rotulo="Dentro dos limites" valor={numero(k.dentro)} detalhe={pct(k.dentro)} cor={COR.ok} />
        <Kpi rotulo="Fora do limite" valor={numero(k.fora)} detalhe={`${k.acima} acima · ${k.abaixo} abaixo`} cor={COR.acima} />
        <Kpi rotulo="Inconclusivos" valor={numero(k.inconclusivos)} detalhe="limite de quantificação acima do VMP" cor={COR.tendencia} />
        {k.series > 0 && (
          <Kpi rotulo="Tendências" valor={numero(k.tendenciaAumento + k.tendenciaReducao)} detalhe={`${k.tendenciaAumento} de aumento · ${k.tendenciaReducao} de redução`} cor={COR.tendencia} />
        )}
        {k.atipicos > 0 && <Kpi rotulo="Valores atípicos" valor={numero(k.atipicos)} detalhe="mais de 2 desvios-padrão" cor={COR.neon} />}
      </div>

      <Cartao titulo="Distribuição das classificações (geral)">
        <div className="distribuicao" role="img" aria-label={categorias.map(([c, n]) => `${c}: ${n}`).join('; ')}>
          {categorias.map(([c, n]) => <span key={c} style={{ width: `${(n / k.resultados) * 100}%`, background: COR_CATEGORIA[c] }} />)}
        </div>
        <ul className="legenda">
          {categorias.map(([c, n]) => <li key={c} style={{ '--cor': COR_CATEGORIA[c] }}>{c}: {n} ({pct(n)})</li>)}
        </ul>
      </Cartao>

      <div className="grade">
        <Cartao titulo="Por portaria">
          <Tabela legenda="Classificação em cada portaria" chaveLinha={(p) => p.legislacao} linhas={dados.porPortaria}
            colunas={[
              { chave: 'legislacao', titulo: 'Portaria', render: (p) => nomeCurto(p.legislacao) },
              { chave: 'dentro', titulo: 'Dentro', numerica: true },
              { chave: 'acima', titulo: 'Acima', numerica: true, render: (p) => <span style={{ color: p.acima ? COR.acima : undefined }}>{p.acima}</span> },
              { chave: 'abaixo', titulo: 'Abaixo', numerica: true, render: (p) => <span style={{ color: p.abaixo ? COR.abaixo : undefined }}>{p.abaixo}</span> },
              { chave: 'inconclusivos', titulo: 'Inconcl.', numerica: true },
              { chave: 'nao_se_aplica', titulo: 'Não se aplica', numerica: true },
            ]} />
        </Cartao>
        <Cartao titulo="Ensaios com mais resultados fora do limite">
          {dados.ensaiosFora.length ? (
            <Tabela legenda="Ensaios" chaveLinha={(e) => e.codigo_ensaio} linhas={dados.ensaiosFora}
              colunas={[
                { chave: 'ensaio', titulo: 'Ensaio', render: (e) => <>{e.ensaio} <span className="codigo">{e.codigo_ensaio}</span></> },
                { chave: 'fora', titulo: 'Fora', numerica: true, render: (e) => <span style={{ color: COR.acima }}>{e.fora}</span> },
                { chave: 'total', titulo: 'Resultados', numerica: true },
              ]} />
          ) : <SemDados titulo="Nenhum ensaio fora do limite" />}
        </Cartao>
      </div>

      <h3 className="subtitulo">Requer atenção</h3>
      <Cartao>
        {dados.atencao.length === 0 ? (
          <SemDados titulo="Nada fora do padrão">Nenhum resultado fora do limite ou inconclusivo, nenhuma tendência e nenhum valor atípico.</SemDados>
        ) : (
          <>
            <ul className="atencao">
              {dados.atencao.slice(0, MAX_ATENCAO).map((a, i) => (
                <li key={i} style={{ '--cor': ICONE[a.tipo].cor }}>
                  <span className="icone" aria-hidden="true">{ICONE[a.tipo].s}</span>
                  <div>
                    <strong>{a.titulo}</strong> · {a.ensaio}
                    {a.ponto && <> · {a.ponto}</>}
                    <div className="meta"><Detalhe a={a} /></div>
                  </div>
                  <span className="data">{dataBR(a.data)}</span>
                </li>
              ))}
            </ul>
            {dados.atencao.length > MAX_ATENCAO && (
              <p className="nota">Mostrando os {MAX_ATENCAO} mais recentes de {dados.atencao.length}. Veja todos em <a href="#resultados">Resultados</a>.</p>
            )}
          </>
        )}
      </Cartao>
    </>
  );
}

function Detalhe({ a }) {
  const d = a.detalhe;
  if (a.tipo === 'acima' || a.tipo === 'abaixo' || a.tipo === 'inconclusivo') {
    return (
      <>
        Resultado {valorResultado({ valor: d.valor, qualificador: d.qualificador }, d.unidade)} · limite {faixaLimite(d.minimo, d.maximo, d.unidadeLimite)} · {nomeCurto(d.legislacao)}
        {d.amostra && <> · amostra {d.amostra}</>}
        {d.motivo && <div>{d.motivo}</div>}
      </>
    );
  }
  if (a.tipo === 'atipico') {
    return <>Resultado {numero(d.valor)} {d.unidade}, a {numero(Math.round(d.z * 10) / 10)} desvios-padrão da média ({numero(d.media)}) · <a href={`#tendencias/${encodeURIComponent(a.serie)}`}>ver série</a></>;
  }
  return <>{d.descricao} · {d.n} resultados · <a href={`#tendencias/${encodeURIComponent(a.serie)}`}>ver série</a></>;
}
