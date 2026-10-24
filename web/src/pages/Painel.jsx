import { useApi, numero, dataBR } from '../api.js';
import { Cartao, COR, COR_CATEGORIA, Estado, Kpi, Secao, SemDados } from '../components/ui.jsx';

const ICONE = {
  acima: { s: '▲', cor: COR.acima },
  abaixo: { s: '▼', cor: COR.abaixo },
  aumento: { s: '↗', cor: COR.tendencia },
  reducao: { s: '↘', cor: COR.tendencia },
  atipico: { s: '◆', cor: COR.neon },
};

export default function Painel() {
  const { dados, erro, carregando } = useApi('painel');
  return (
    <Secao titulo="Painel" descricao="Cada resultado lançado é comparado automaticamente com o limite da legislação correspondente. Séries de um mesmo ponto de coleta são analisadas quanto a tendência e desvios.">
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
        Lance os resultados das amostras em <a href="#lancar">Lançar resultados</a> (formulário ou arquivo CSV). Para conhecer o
        painel, há um arquivo de demonstração com dados fictícios, que pode ser desfeito depois. {numero(k.limites)} limites legais de{' '}
        {k.legislacoes} legislações já estão prontos para a comparação.
      </SemDados>
    );
  }
  const categorias = [
    ['Dentro dos limites', k.dentro],
    ['Acima do limite máximo', k.acima],
    ['Abaixo do limite mínimo', k.abaixo],
    ['Sem limite aplicável identificado', k.sem_limite],
    ['Pendente de validação', k.pendentes],
  ].filter(([, n]) => n > 0);
  const pct = (n) => (k.resultados ? `${numero(Math.round((n / k.resultados) * 1000) / 10)}%` : '—');

  return (
    <>
      <div className="kpis">
        <Kpi rotulo="Resultados analisados" valor={numero(k.resultados)} detalhe={`${k.amostras} amostras · ${k.pontos} pontos de coleta`} cor={COR.neon} />
        <Kpi rotulo="Dentro dos limites" valor={numero(k.dentro)} detalhe={pct(k.dentro)} cor={COR.ok} />
        <Kpi rotulo="Fora do limite" valor={numero(k.fora)} detalhe={`${k.acima} acima · ${k.abaixo} abaixo`} cor={COR.acima} />
        <Kpi rotulo="Tendências" valor={numero(k.tendenciaAumento + k.tendenciaReducao)} detalhe={`${k.tendenciaAumento} de aumento · ${k.tendenciaReducao} de redução`} cor={COR.tendencia} />
        <Kpi rotulo="Valores atípicos" valor={numero(k.atipicos)} detalhe="mais de 2 desvios-padrão" cor={COR.neon} />
        {k.pendentes + k.sem_limite > 0 && <Kpi rotulo="Sem comparação" valor={numero(k.pendentes + k.sem_limite)} detalhe={`${k.sem_limite} sem limite · ${k.pendentes} pendentes`} cor={COR.neutro} />}
      </div>

      <Cartao titulo="Distribuição das classificações">
        <div className="distribuicao" role="img" aria-label={categorias.map(([c, n]) => `${c}: ${n}`).join('; ')}>
          {categorias.map(([c, n]) => (
            <span key={c} style={{ width: `${(n / k.resultados) * 100}%`, background: COR_CATEGORIA[c] }} />
          ))}
        </div>
        <ul className="legenda">
          {categorias.map(([c, n]) => (
            <li key={c} style={{ '--cor': COR_CATEGORIA[c] }}>{c}: {n} ({pct(n)})</li>
          ))}
        </ul>
      </Cartao>

      <h3 className="subtitulo">Requer atenção</h3>
      <Cartao>
        {dados.atencao.length === 0 ? (
          <SemDados titulo="Nada fora do padrão">Nenhum resultado fora do limite, nenhuma tendência significativa e nenhum valor atípico.</SemDados>
        ) : (
          <ul className="atencao">
            {dados.atencao.slice(0, 30).map((a, i) => (
              <li key={i} style={{ '--cor': ICONE[a.tipo].cor }}>
                <span className="icone" aria-hidden="true">{ICONE[a.tipo].s}</span>
                <div>
                  <strong>{a.titulo}</strong> · {a.ensaio}
                  {a.ponto && <> · ponto {a.ponto}</>}
                  <div className="meta"><Detalhe a={a} /></div>
                </div>
                <span className="data">{dataBR(a.data)}</span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </>
  );
}

function Detalhe({ a }) {
  const d = a.detalhe;
  if (a.tipo === 'acima' || a.tipo === 'abaixo') {
    const limite = a.tipo === 'acima' ? `máximo ${numero(d.maximo)}` : `mínimo ${numero(d.minimo)}`;
    return <>Resultado {numero(d.valor)} {d.unidade} · {limite} {d.unidade} · {d.legislacao} · amostra {d.amostra}</>;
  }
  if (a.tipo === 'atipico') {
    return <>Resultado {numero(d.valor)} {d.unidade}, a {numero(Math.round(d.z * 10) / 10)} desvios-padrão da média ({numero(d.media)}) · <a href={`#tendencias/${encodeURIComponent(a.serie)}`}>ver série</a></>;
  }
  return <>{d.descricao} · {d.n} resultados · <a href={`#tendencias/${encodeURIComponent(a.serie)}`}>ver série</a></>;
}
