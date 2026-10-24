// Aplica as decisões de curadoria (data/curadoria/decisoes.json) aos limites.
// - Cada decisão é aplicada uma única vez (chave em etl.decisao_curadoria).
// - Os valores anteriores ficam registrados em etl.decisao_curadoria.antes.
// - As pendências resolvidas recebem resolvida = true e o texto da resolução.
// A função não abre nem fecha transação: quem chama controla (CLI usa uma única).

const ORDEM = { definir_limite: 1, confirmar_limite: 2, inativar_limite: 2, definir_unidade: 2, renomear_classe: 3, definir_vigencia: 4, resolver_informativo: 5 };

async function idLegislacao(client, nome) {
  const r = await client.query('SELECT id_legislacao FROM legislacao WHERE nome = $1', [nome]);
  if (!r.rowCount) throw new Error(`Legislação não encontrada: ${nome}`);
  return r.rows[0].id_legislacao;
}

async function buscarLimites(client, alvo) {
  const origens = alvo.origens_amostra ?? [alvo.origem_amostra];
  const codigos = alvo.codigos_ensaio ?? [alvo.codigo_ensaio];
  const { rows } = await client.query(
    `SELECT l.*, e.codigo_origem FROM limite l
       JOIN ensaio e ON e.id_ensaio = l.fk_id_ensaio
       JOIN legislacao g ON g.id_legislacao = l.fk_id_legislacao
      WHERE g.nome = $1 AND l.origem_amostra = ANY($2) AND e.codigo_origem = ANY($3)
        AND COALESCE(l.matriz, '') = COALESCE($4, '') AND l.fk_id_classe IS NULL`,
    [alvo.legislacao, origens, codigos, alvo.matriz ?? null],
  );
  return rows;
}

const instantaneo = (l) => ({
  valor_minimo: l.valor_minimo, valor_maximo: l.valor_maximo, unidade_medida: l.unidade_medida,
  requer_validacao: l.requer_validacao, observacao_validacao: l.observacao_validacao,
  ativo: l.ativo, motivo_inativacao: l.motivo_inativacao, data_inicio_vigencia: l.data_inicio_vigencia,
});

async function proximoId(client, tabela, coluna) {
  const { rows } = await client.query(`SELECT COALESCE(MAX(${coluna}), 0) + 1 AS id FROM ${tabela}`);
  return Number(rows[0].id);
}

async function resolverPendencias(client, criterios, texto) {
  let total = 0;
  for (const c of criterios ?? []) {
    const linhas = c.linhas === undefined ? null : Array.isArray(c.linhas) ? c.linhas : [c.linhas];
    const r = await client.query(
      `UPDATE etl.pendencia SET resolvida = TRUE, resolucao = $5
        WHERE NOT resolvida AND tipo = $1
          AND ($2::text IS NULL OR arquivo_origem = $2)
          AND ($3::text[] IS NULL OR linhas_origem = ANY($3))
          AND ($4::text IS NULL OR chave LIKE '%|' || $4)`,
      [c.tipo, c.arquivo ?? null, linhas, c.extra ?? null, texto],
    );
    total += r.rowCount;
  }
  return total;
}

export async function aplicarCuradoria(client, arquivo) {
  await client.query('LOCK TABLE limite, ensaio, classe IN SHARE ROW EXCLUSIVE MODE');
  const resumo = { aplicadas: 0, jaAplicadas: 0, limitesAlterados: 0, limitesInseridos: 0, pendenciasResolvidas: 0, detalhes: [] };
  const decisoes = [...arquivo.decisoes].sort((a, b) => (ORDEM[a.acao] ?? 9) - (ORDEM[b.acao] ?? 9));

  for (const d of decisoes) {
    const ja = await client.query('SELECT 1 FROM etl.decisao_curadoria WHERE chave = $1', [d.chave]);
    if (ja.rowCount) {
      resumo.jaAplicadas++;
      continue;
    }
    const fonte = arquivo.fontes?.[d.fonte?.split(',')[0]] ? `${d.fonte} — ${arquivo.fontes[d.fonte.split(',')[0]]}` : d.fonte;
    const registros = [];

    if (d.acao === 'definir_limite') {
      const existentes = await buscarLimites(client, d.alvo);
      if (existentes.length > 1) throw new Error(`${d.chave}: mais de um limite corresponde ao alvo`);
      const obs = `Curadoria ${d.chave}: ${d.fonte}`;
      if (existentes.length === 1) {
        const l = existentes[0];
        await client.query(
          `UPDATE limite SET valor_minimo = $2, valor_maximo = $3, unidade_medida = $4,
                  requer_validacao = FALSE, observacao_validacao = $5, ativo = TRUE, motivo_inativacao = NULL
            WHERE id_limite = $1`,
          [l.id_limite, d.valores.valor_minimo, d.valores.valor_maximo, d.valores.unidade_medida, obs],
        );
        registros.push({ id_limite: l.id_limite, antes: instantaneo(l) });
        resumo.limitesAlterados++;
      } else {
        const idLeg = await idLegislacao(client, d.alvo.legislacao);
        let ens = await client.query('SELECT id_ensaio FROM ensaio WHERE codigo_origem = $1', [d.alvo.codigo_ensaio]);
        let idEnsaio = ens.rows[0]?.id_ensaio;
        if (!idEnsaio) {
          if (!d.alvo.nome_ensaio) throw new Error(`${d.chave}: ensaio ${d.alvo.codigo_ensaio} não existe e a decisão não informa o nome`);
          idEnsaio = await proximoId(client, 'ensaio', 'id_ensaio');
          await client.query('INSERT INTO ensaio (id_ensaio, nome, codigo_origem) VALUES ($1, $2, $3)', [idEnsaio, d.alvo.nome_ensaio, d.alvo.codigo_ensaio]);
        }
        const id = await proximoId(client, 'limite', 'id_limite');
        await client.query(
          `INSERT INTO limite (id_limite, valor_minimo, valor_maximo, unidade_medida, versao, fk_id_ensaio, fk_id_legislacao,
                               matriz, origem_amostra, requer_validacao, observacao_validacao, arquivo_origem, linhas_origem)
           VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, FALSE, $9, $10, $11)`,
          [id, d.valores.valor_minimo, d.valores.valor_maximo, d.valores.unidade_medida, idEnsaio, idLeg,
            d.alvo.matriz, d.alvo.origem_amostra, obs, d.origem_registro?.arquivo ?? null, d.origem_registro?.linhas ?? null],
        );
        registros.push({ id_limite: id, antes: null });
        resumo.limitesInseridos++;
      }
    } else if (['confirmar_limite', 'inativar_limite', 'definir_unidade'].includes(d.acao)) {
      const limites = await buscarLimites(client, d.alvo);
      const esperados = (d.alvo.codigos_ensaio?.length ?? 1) * (d.alvo.origens_amostra?.length ?? 1);
      if (limites.length !== esperados) {
        throw new Error(`${d.chave}: esperados ${esperados} limites, encontrados ${limites.length}`);
      }
      for (const l of limites) {
        if (d.acao === 'confirmar_limite') {
          await client.query('UPDATE limite SET requer_validacao = FALSE, observacao_validacao = $2 WHERE id_limite = $1', [l.id_limite, d.valores.observacao_validacao]);
        } else if (d.acao === 'inativar_limite') {
          await client.query('UPDATE limite SET ativo = FALSE, motivo_inativacao = $2, requer_validacao = FALSE WHERE id_limite = $1', [l.id_limite, d.valores.motivo_inativacao]);
        } else {
          await client.query(
            'UPDATE limite SET unidade_medida = $2, requer_validacao = FALSE, observacao_validacao = $3 WHERE id_limite = $1',
            [l.id_limite, d.valores.unidade_medida, d.valores.observacao_validacao ?? `Curadoria ${d.chave}: ${d.fonte}`],
          );
        }
        registros.push({ id_limite: l.id_limite, antes: instantaneo(l) });
        resumo.limitesAlterados++;
      }
    } else if (d.acao === 'renomear_classe') {
      const idLeg = await idLegislacao(client, d.alvo.legislacao);
      const r = await client.query('UPDATE classe SET nome = $3 WHERE fk_id_legislacao = $1 AND nome = $2 RETURNING id_classe', [idLeg, d.alvo.classe, d.valores.nome]);
      registros.push({ id_limite: null, antes: { classe: d.alvo.classe, ids: r.rows.map((x) => x.id_classe) } });
    } else if (d.acao === 'definir_vigencia') {
      const idLeg = await idLegislacao(client, d.alvo.legislacao);
      const r = await client.query(
        `UPDATE limite SET data_inicio_vigencia = $2 WHERE fk_id_legislacao = $1 AND data_inicio_vigencia IS NULL AND data_fim_vigencia IS NULL`,
        [idLeg, d.valores.data_inicio_vigencia],
      );
      await client.query(`UPDATE legislacao SET descricao = COALESCE(descricao, $2) WHERE id_legislacao = $1`,
        [idLeg, `Vigência a partir de ${d.valores.data_inicio_vigencia.split('-').reverse().join('/')}. ${d.fonte}`.slice(0, 250)]);
      registros.push({ id_limite: null, antes: { limites_atualizados: r.rowCount, data_inicio_vigencia: null } });
      resumo.limitesAlterados += r.rowCount;
    } else if (d.acao !== 'resolver_informativo') {
      throw new Error(`${d.chave}: ação desconhecida "${d.acao}"`);
    }

    const resolvidas = await resolverPendencias(client, d.resolve, `${d.descricao} Fonte: ${d.fonte}.`);
    resumo.pendenciasResolvidas += resolvidas;
    await client.query(
      `INSERT INTO etl.decisao_curadoria (chave, tipo, descricao, fonte, id_limite, antes, depois)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [d.chave, d.acao, d.descricao, fonte, registros.length === 1 ? registros[0].id_limite : null,
        JSON.stringify(registros), d.valores ? JSON.stringify(d.valores) : null],
    );
    resumo.aplicadas++;
    resumo.detalhes.push({ chave: d.chave, acao: d.acao, registros: registros.length, pendencias: resolvidas });
  }
  return resumo;
}
