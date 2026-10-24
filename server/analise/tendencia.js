// Análise estatística de séries históricas de resultados.
//
// Tendência: teste de Mann-Kendall (não paramétrico, padrão em monitoramento
// de qualidade da água), com correção para empates, e inclinação de Sen
// (mediana das inclinações entre pares) para estimar a taxa de variação.
// Desvio: um resultado é "atípico" quando seu escore z — distância até a
// média da série, em desvios-padrão — passa de 2 (critério usual de 2σ).
//
// Parâmetros explícitos e documentados (documentacao/documentacao.md, seção 5).

export const PARAMETROS = Object.freeze({
  minPontosTendencia: 5, // com n < 5 o Mann-Kendall não alcança p < 0,05 (bilateral)
  alfa: 0.05, // nível de significância
  zDesvio: 2, // afastamento, em desvios-padrão, para marcar valor atípico
  minPontosDesvio: 6, // com n ≤ 5 o escore z máximo possível, (n−1)/√n, é menor que 2
});

const DIA_MS = 24 * 60 * 60 * 1000;

/** Função de distribuição acumulada da normal padrão (aprox. de Abramowitz-Stegun 7.1.26). */
export function normalAcumulada(z) {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const poli = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poli * Math.exp(-((z * z) / 2));
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** Teste de Mann-Kendall. Retorna S, variância, Z e p-valor bilateral. */
export function mannKendall(valores) {
  const n = valores.length;
  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) s += Math.sign(valores[j] - valores[i]);
  }
  const empates = new Map();
  for (const v of valores) empates.set(v, (empates.get(v) ?? 0) + 1);
  let correcao = 0;
  for (const t of empates.values()) if (t > 1) correcao += t * (t - 1) * (2 * t + 5);
  const variancia = (n * (n - 1) * (2 * n + 5) - correcao) / 18;
  let z = 0;
  if (variancia > 0) {
    if (s > 0) z = (s - 1) / Math.sqrt(variancia);
    else if (s < 0) z = (s + 1) / Math.sqrt(variancia);
  }
  const p = variancia > 0 ? 2 * (1 - normalAcumulada(Math.abs(z))) : 1;
  return { n, s, variancia, z, p };
}

const mediana = (xs) => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

/** Inclinação de Sen (unidade por dia) e intercepto (na escala de dias desde o 1º ponto). */
export function inclinacaoSen(dias, valores) {
  const inclinacoes = [];
  for (let i = 0; i < dias.length - 1; i++) {
    for (let j = i + 1; j < dias.length; j++) {
      if (dias[j] !== dias[i]) inclinacoes.push((valores[j] - valores[i]) / (dias[j] - dias[i]));
    }
  }
  const inclinacao = mediana(inclinacoes);
  if (inclinacao === null) return { inclinacao: null, intercepto: null };
  const intercepto = mediana(valores.map((v, i) => v - inclinacao * dias[i]));
  return { inclinacao, intercepto };
}

export function estatisticas(valores) {
  const n = valores.length;
  if (!n) return { n: 0, media: null, desvioPadrao: null, coeficienteVariacao: null, minimo: null, maximo: null };
  const media = valores.reduce((s, v) => s + v, 0) / n;
  const desvioPadrao = n > 1 ? Math.sqrt(valores.reduce((s, v) => s + (v - media) ** 2, 0) / (n - 1)) : null;
  return {
    n,
    media,
    desvioPadrao,
    coeficienteVariacao: desvioPadrao !== null && media !== 0 ? (desvioPadrao / Math.abs(media)) * 100 : null,
    minimo: Math.min(...valores),
    maximo: Math.max(...valores),
  };
}

/** Pontos cujo escore z (em relação à média e ao desvio-padrão da série) passa de zDesvio. */
export function valoresAtipicos(pontos, p = PARAMETROS) {
  if (pontos.length < p.minPontosDesvio) return [];
  const { media, desvioPadrao } = estatisticas(pontos.map((x) => x.valor));
  if (!desvioPadrao) return [];
  return pontos
    .map((ponto) => ({ ...ponto, z: (ponto.valor - media) / desvioPadrao, media, desvioPadrao }))
    .filter((x) => Math.abs(x.z) > p.zDesvio);
}

/**
 * Analisa uma série ordenada por data.
 * @param {{data: string, valor: number, id_resultado?: number}[]} pontos
 */
export function analisarSerie(pontos, p = PARAMETROS) {
  const ordenados = [...pontos].sort((a, b) => a.data.localeCompare(b.data) || (a.id_resultado ?? 0) - (b.id_resultado ?? 0));
  const valores = ordenados.map((x) => x.valor);
  const est = estatisticas(valores);
  const atipicos = valoresAtipicos(ordenados, p);

  let tendencia = {
    situacao: 'Dados insuficientes',
    descricao: `São necessários pelo menos ${p.minPontosTendencia} resultados para avaliar tendência (série com ${ordenados.length}).`,
    significativa: false,
  };
  let linha = [];

  if (ordenados.length >= p.minPontosTendencia) {
    const mk = mannKendall(valores);
    const t0 = Date.parse(ordenados[0].data);
    const dias = ordenados.map((x) => (Date.parse(x.data) - t0) / DIA_MS);
    const sen = inclinacaoSen(dias, valores);
    const significativa = mk.p < p.alfa && mk.s !== 0;
    const situacao = !significativa ? 'Sem tendência significativa' : mk.s > 0 ? 'Aumentando' : 'Diminuindo';
    const porAno = sen.inclinacao === null ? null : sen.inclinacao * 365.25;
    tendencia = {
      situacao,
      significativa,
      s: mk.s,
      z: mk.z,
      p: mk.p,
      inclinacaoPorAno: porAno,
      descricao: significativa
        ? `${situacao} (Mann-Kendall p = ${formatarP(mk.p)}; taxa estimada de ${porAno >= 0 ? '+' : ''}${formatar(porAno)} por ano).`
        : `Sem tendência estatisticamente significativa (Mann-Kendall p = ${formatarP(mk.p)} ≥ ${String(p.alfa).replace('.', ',')}).`,
    };
    if (sen.inclinacao !== null) {
      linha = ordenados.map((x, i) => ({ data: x.data, valor: sen.intercepto + sen.inclinacao * dias[i] }));
    }
  }

  return { pontos: ordenados, estatisticas: est, tendencia, atipicos, linhaTendencia: linha, parametros: p };
}

const formatarP = (p) => (p < 0.001 ? '< 0,001' : p.toFixed(3).replace('.', ','));

function formatar(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const casas = abs >= 100 ? 1 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}
