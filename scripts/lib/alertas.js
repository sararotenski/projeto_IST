// Geração idempotente de alertas: um alerta por (resultado, tipo).
// Tipos de conformidade vêm de vw_alerta_calculado (SQL).
// Tipos de tendência e desvio vêm da análise estatística das séries:
//   TENDENCIA_AUMENTO / TENDENCIA_REDUCAO → ligado ao último resultado da série
//   VALOR_ATIPICO → ligado ao resultado atípico
// Alertas existentes não são alterados nem apagados.

import { carregarSeries } from '../../server/analise/series.js';

const fmt = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 6 }));

export async function alertasEstatisticos(db) {
  const series = await carregarSeries(db);
  const alertas = [];
  for (const s of series) {
    if (s.tendencia.significativa) {
      alertas.push({
        id_resultado: s.ultimo.idResultado,
        tipo: s.tendencia.situacao === 'Aumentando' ? 'TENDENCIA_AUMENTO' : 'TENDENCIA_REDUCAO',
        descricao: `${s.ensaio}${s.pontoColeta ? ` no ponto ${s.pontoColeta}` : ''}: ${s.tendencia.descricao}`.slice(0, 250),
      });
    }
    for (const a of s.atipicos) {
      alertas.push({
        id_resultado: a.id_resultado,
        tipo: 'VALOR_ATIPICO',
        descricao: `${s.ensaio}${s.pontoColeta ? ` no ponto ${s.pontoColeta}` : ''}: ${fmt(a.valor)} ${s.unidade ?? ''} está a ${a.z.toFixed(1)} desvios-padrão da média da série (${fmt(a.media)}).`.slice(0, 250),
      });
    }
  }
  return alertas;
}

/** Grava os alertas novos. Deve ser chamada dentro de uma transação. */
export async function gerarAlertas(client) {
  await client.query('LOCK TABLE alerta IN SHARE ROW EXCLUSIVE MODE');
  const conformidade = await client.query(`
    INSERT INTO alerta (id_alerta, tipo, descricao, data_geracao, fk_id_resultado)
    SELECT (SELECT COALESCE(MAX(id_alerta), 0) FROM alerta) + row_number() OVER (ORDER BY c.id_resultado, c.tipo),
           c.tipo, c.descricao, CURRENT_DATE, c.id_resultado
    FROM vw_alerta_calculado c
    WHERE NOT EXISTS (SELECT 1 FROM alerta a WHERE a.fk_id_resultado = c.id_resultado AND a.tipo = c.tipo)`);
  let estatisticos = 0;
  for (const a of await alertasEstatisticos(client)) {
    const r = await client.query(
      `INSERT INTO alerta (id_alerta, tipo, descricao, data_geracao, fk_id_resultado)
       SELECT (SELECT COALESCE(MAX(id_alerta), 0) + 1 FROM alerta), $1::varchar(20), $2::varchar(250), CURRENT_DATE, $3::int
       WHERE NOT EXISTS (SELECT 1 FROM alerta WHERE fk_id_resultado = $3::int AND tipo = $1::varchar(20))`,
      [a.tipo, a.descricao, a.id_resultado],
    );
    estatisticos += r.rowCount;
  }
  return { conformidade: conformidade.rowCount, estatisticos };
}
