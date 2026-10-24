// Importação idempotente de LEGISLACAO, ENSAIO, CLASSE, LIMITE e pendências.
// A função NÃO abre nem fecha transação: quem chama controla BEGIN/COMMIT/ROLLBACK
// (o CLI usa uma transação única; os testes usam ROLLBACK).
//
// Regras:
// - IDs dos arquivos não são usados como IDs do banco: novos IDs = MAX + 1,
//   com bloqueio das tabelas durante a importação.
// - Registros existentes são localizados pela chave natural e nunca sobrescritos.
//   Se divergirem dos dados novos, a diferença vira pendência.

const contador = () => ({ inseridos: 0, existentes: 0, divergentes: 0, curados: 0 });

async function proximoId(client, tabela, coluna) {
  const { rows } = await client.query(`SELECT COALESCE(MAX(${coluna}), 0) + 1 AS id FROM ${tabela}`);
  let atual = Number(rows[0].id);
  return () => atual++;
}

export async function importarDados(client, dados) {
  const resumo = {
    legislacao: contador(),
    ensaio: contador(),
    classe: contador(),
    limite: contador(),
    pendencia: { inseridas: 0, existentes: 0 },
    divergencias: [],
  };

  await client.query('LOCK TABLE legislacao, ensaio, classe, limite IN SHARE ROW EXCLUSIVE MODE');
  const idLegislacao = await proximoId(client, 'legislacao', 'id_legislacao');
  const idEnsaio = await proximoId(client, 'ensaio', 'id_ensaio');
  const idClasse = await proximoId(client, 'classe', 'id_classe');
  const idLimite = await proximoId(client, 'limite', 'id_limite');

  const divergencia = (tipo, chave, descricao, dadosExtra) => {
    resumo.divergencias.push({
      chave: `${tipo}|${chave}`,
      tipo,
      importado: false,
      descricao,
      arquivo_origem: dadosExtra?.arquivo_origem ?? null,
      linhas_origem: dadosExtra?.linhas_origem ?? null,
      dados: dadosExtra ?? null,
    });
  };

  // LEGISLACAO (chave: nome)
  const legislacoes = new Map();
  for (const { nome } of dados.legislacoes) {
    const r = await client.query('SELECT id_legislacao FROM legislacao WHERE nome = $1', [nome]);
    if (r.rowCount) {
      legislacoes.set(nome, r.rows[0].id_legislacao);
      resumo.legislacao.existentes++;
    } else {
      const id = idLegislacao();
      await client.query('INSERT INTO legislacao (id_legislacao, nome, descricao) VALUES ($1, $2, NULL)', [id, nome]);
      legislacoes.set(nome, id);
      resumo.legislacao.inseridos++;
    }
  }

  // ENSAIO (chave: codigo_origem)
  const ensaios = new Map();
  for (const { codigo_origem, nome } of dados.ensaios) {
    const r = await client.query('SELECT id_ensaio, nome FROM ensaio WHERE codigo_origem = $1', [codigo_origem]);
    if (r.rowCount) {
      ensaios.set(codigo_origem, r.rows[0].id_ensaio);
      if (r.rows[0].nome !== nome) {
        resumo.ensaio.divergentes++;
        divergencia('ENSAIO_DIVERGENTE_BANCO', codigo_origem,
          `Ensaio ${codigo_origem} já existe no banco como "${r.rows[0].nome}"; arquivo traz "${nome}". Nome do banco mantido.`,
          { codigo_origem, nome_banco: r.rows[0].nome, nome_arquivo: nome });
      } else {
        resumo.ensaio.existentes++;
      }
    } else {
      const id = idEnsaio();
      await client.query(
        'INSERT INTO ensaio (id_ensaio, nome, descricao, atende_nao_atende, codigo_origem) VALUES ($1, $2, NULL, NULL, $3)',
        [id, nome, codigo_origem],
      );
      ensaios.set(codigo_origem, id);
      resumo.ensaio.inseridos++;
    }
  }

  // CLASSE (chave: legislação + nome)
  const classes = new Map();
  for (const { legislacao, nome } of dados.classes) {
    const idLeg = legislacoes.get(legislacao);
    const r = await client.query('SELECT id_classe FROM classe WHERE fk_id_legislacao = $1 AND nome = $2', [idLeg, nome]);
    if (r.rowCount) {
      classes.set(`${legislacao}|${nome}`, r.rows[0].id_classe);
      resumo.classe.existentes++;
    } else {
      const id = idClasse();
      await client.query('INSERT INTO classe (id_classe, nome, descricao, fk_id_legislacao) VALUES ($1, $2, NULL, $3)', [id, nome, idLeg]);
      classes.set(`${legislacao}|${nome}`, id);
      resumo.classe.inseridos++;
    }
  }

  // LIMITE (chave natural: ensaio + legislação + classe + matriz + origem + versão)
  for (const l of dados.limites) {
    const fkEnsaio = ensaios.get(l.codigo_ensaio);
    const fkLeg = legislacoes.get(l.legislacao);
    const fkClasse = l.classe ? classes.get(`${l.legislacao}|${l.classe}`) : null;
    if (fkEnsaio === undefined || fkLeg === undefined || fkClasse === undefined) {
      throw new Error(`Relacionamento não resolvido para o limite do ensaio ${l.codigo_ensaio} (${l.arquivo_origem}, linhas ${l.linhas_origem})`);
    }
    const r = await client.query(
      `SELECT id_limite,
              (valor_minimo IS NOT DISTINCT FROM $7::numeric
               AND valor_maximo IS NOT DISTINCT FROM $8::numeric
               AND unidade_medida IS NOT DISTINCT FROM $9::varchar) AS igual,
              (to_regclass('etl.decisao_curadoria') IS NOT NULL AND EXISTS (
                 SELECT 1 FROM etl.decisao_curadoria d, jsonb_array_elements(d.antes) x
                  WHERE (x->>'id_limite')::int = limite.id_limite)) AS curado
       FROM limite
       WHERE fk_id_ensaio = $1 AND fk_id_legislacao = $2
         AND COALESCE(fk_id_classe, -1) = COALESCE($3::int, -1)
         AND COALESCE(matriz, '') = COALESCE($4::varchar, '')
         AND COALESCE(origem_amostra, '') = COALESCE($5::varchar, '')
         AND COALESCE(versao, 1) = $6`,
      [fkEnsaio, fkLeg, fkClasse, l.matriz, l.origem_amostra, l.versao, l.valor_minimo, l.valor_maximo, l.unidade_medida],
    );
    if (r.rowCount) {
      if (r.rows[0].igual) {
        resumo.limite.existentes++;
      } else if (r.rows[0].curado) {
        // Valor corrigido por decisão de curadoria documentada: a fonte bruta não sobrescreve.
        resumo.limite.curados++;
      } else {
        resumo.limite.divergentes++;
        divergencia('LIMITE_DIVERGENTE_BANCO', `${l.codigo_ensaio}|${l.legislacao}|${l.origem_amostra}|${l.classe ?? ''}`,
          `Limite do ensaio ${l.codigo_ensaio} (${l.origem_amostra}) já existe no banco com valores diferentes; não sobrescrito.`, l);
      }
      continue;
    }
    await client.query(
      `INSERT INTO limite (id_limite, valor_minimo, valor_maximo, unidade_medida, versao,
                           data_inicio_vigencia, data_fim_vigencia, fk_id_ensaio, fk_id_classe, fk_id_legislacao,
                           matriz, origem_amostra, requer_validacao, observacao_validacao, arquivo_origem, linhas_origem)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [idLimite(), l.valor_minimo, l.valor_maximo, l.unidade_medida, l.versao, l.data_inicio_vigencia, l.data_fim_vigencia,
        fkEnsaio, fkClasse, fkLeg, l.matriz, l.origem_amostra, l.requer_validacao, l.observacao_validacao, l.arquivo_origem, l.linhas_origem],
    );
    resumo.limite.inseridos++;
  }

  // Pendências (extração + divergências com o banco)
  for (const p of [...dados.pendencias, ...resumo.divergencias]) {
    const r = await client.query(
      `INSERT INTO etl.pendencia (chave, tipo, importado, descricao, arquivo_origem, linhas_origem, dados)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (chave) DO NOTHING`,
      [p.chave, p.tipo, p.importado, p.descricao, p.arquivo_origem, p.linhas_origem, p.dados ? JSON.stringify(p.dados) : null],
    );
    if (r.rowCount) resumo.pendencia.inseridas++;
    else resumo.pendencia.existentes++;
  }

  return resumo;
}
