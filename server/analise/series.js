// Carrega as séries de vw_historico e aplica a análise de tendência/desvio.

import { analisarSerie } from './tendencia.js';

export async function carregarSeries(db, filtro = {}) {
  const { rows } = await db.query(
    `SELECT serie, serie_validada, id_resultado, id_amostra, codigo_amostra, ponto_coleta, id_ensaio, codigo_ensaio, ensaio,
            legislacao, origem, data_resultado, valor, unidade_resultado, valor_minimo, valor_maximo, unidade_limite,
            categoria, fora_limite, recorrencia_fora_limite
     FROM vw_historico
     WHERE ($1::int IS NULL OR id_ensaio = $1) AND ($2::text IS NULL OR serie = $2)
     ORDER BY serie, posicao`,
    [filtro.ensaio ?? null, filtro.serie ?? null],
  );
  const grupos = new Map();
  for (const r of rows) {
    if (!grupos.has(r.serie)) grupos.set(r.serie, []);
    grupos.get(r.serie).push(r);
  }
  return [...grupos.entries()].map(([serie, linhas]) => {
    const ultima = linhas[linhas.length - 1];
    const analise = analisarSerie(linhas.map((l) => ({ data: l.data_resultado, valor: Number(l.valor), id_resultado: l.id_resultado })));
    return {
      serie,
      serieValidada: ultima.serie_validada,
      pontoColeta: ultima.ponto_coleta,
      idEnsaio: ultima.id_ensaio,
      codigoEnsaio: ultima.codigo_ensaio,
      ensaio: ultima.ensaio,
      legislacao: ultima.legislacao,
      unidade: ultima.unidade_resultado,
      limite: { minimo: ultima.valor_minimo, maximo: ultima.valor_maximo, unidade: ultima.unidade_limite },
      ultimo: { data: ultima.data_resultado, valor: ultima.valor, categoria: ultima.categoria, idResultado: ultima.id_resultado },
      foraDoLimite: linhas.filter((l) => l.fora_limite).length,
      linhas,
      ...analise,
    };
  });
}
