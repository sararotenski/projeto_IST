// Lançamento de resultados laboratoriais (formulário ou CSV).
// Tudo ou nada: se qualquer linha tiver erro, nada é gravado e todos os
// erros são devolvidos com o número da linha.
// Após gravar, os alertas são gerados automaticamente.

import { lerCsvComCabecalho } from '../scripts/lib/csv.js';
import { converterDecimalBR, normalizarTexto, normalizarUnidade } from '../scripts/lib/normalizar.js';
import { gerarAlertas } from '../scripts/lib/alertas.js';

export const COLUNAS_CSV = [
  'codigo_amostra',
  'ponto_coleta',
  'cliente',
  'legislacao',
  'origem_amostra',
  'matriz',
  'data_coleta',
  'codigo_ensaio',
  'valor',
  'unidade',
  'data_resultado',
];
const OBRIGATORIAS = ['codigo_amostra', 'ponto_coleta', 'cliente', 'legislacao', 'origem_amostra', 'data_coleta', 'codigo_ensaio', 'valor'];
const TAMANHOS = { codigo_amostra: 40, ponto_coleta: 80, cliente: 30, matriz: 30, origem_amostra: 30, unidade: 30 };
const MATRIZ_PADRAO = 'Água - BNU';

const semAcento = (t) => (normalizarTexto(t) ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Aceita AAAA-MM-DD ou DD/MM/AAAA. Retorna AAAA-MM-DD ou null. */
export function converterData(valor) {
  const t = normalizarTexto(valor);
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let iso = m ? t : null;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (!iso) return undefined;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? undefined : iso;
}

/** Lê o CSV de resultados (separador ; ou ,) em linhas no formato do formulário. */
export function lerCsvResultados(texto) {
  const primeira = texto.replace(/^\ufeff/, '').split(/\r?\n/, 1)[0] ?? '';
  const separador = primeira.includes(';') ? ';' : ',';
  const { colunas, registros } = lerCsvComCabecalho(texto, separador);
  const normalizadas = colunas.map((c) => semAcento(c).replace(/\s+/g, '_'));
  const faltando = OBRIGATORIAS.filter((c) => !normalizadas.includes(c));
  if (faltando.length) return { erros: [{ linha: 1, mensagem: `Colunas obrigatórias ausentes: ${faltando.join(', ')}` }], linhas: [] };
  const linhas = registros.map((r) => {
    const l = { linha: r._linha };
    colunas.forEach((c, i) => {
      l[normalizadas[i]] = r[c];
    });
    return l;
  });
  return { erros: [], linhas };
}

async function catalogos(client) {
  const legislacoes = (await client.query('SELECT id_legislacao, nome FROM legislacao')).rows;
  const origens = (await client.query('SELECT DISTINCT origem_amostra FROM limite WHERE origem_amostra IS NOT NULL')).rows.map((r) => r.origem_amostra);
  const ensaios = new Map((await client.query('SELECT id_ensaio, codigo_origem, nome FROM ensaio')).rows.map((e) => [e.codigo_origem, e]));
  return { legislacoes, origens, ensaios };
}

function acharLegislacao(legislacoes, valor) {
  const alvo = semAcento(valor);
  if (!alvo) return null;
  const exata = legislacoes.find((l) => semAcento(l.nome) === alvo);
  if (exata) return exata;
  // atalhos: "888", "GM888", "1468", "SES1468"
  const numero = alvo.match(/\d{3,4}/)?.[0];
  const candidatas = numero ? legislacoes.filter((l) => semAcento(l.nome).replace(/\D/g, ' ').split(/\s+/).includes(numero)) : [];
  return candidatas.length === 1 ? candidatas[0] : null;
}

/** Valida e normaliza as linhas. Não acessa o banco além dos catálogos. */
export function validarLinhas(linhas, cat) {
  const erros = [];
  const validas = [];
  for (const bruta of linhas) {
    const n = bruta.linha;
    const e = (mensagem) => erros.push({ linha: n, mensagem });
    const l = {
      linha: n,
      codigo_amostra: normalizarTexto(bruta.codigo_amostra),
      ponto_coleta: normalizarTexto(bruta.ponto_coleta),
      cliente: normalizarTexto(bruta.cliente),
      matriz: normalizarTexto(bruta.matriz) ?? MATRIZ_PADRAO,
      unidade: normalizarUnidade(bruta.unidade),
      codigo_ensaio: normalizarTexto(bruta.codigo_ensaio),
    };
    for (const c of OBRIGATORIAS) if (!normalizarTexto(bruta[c])) e(`"${c}" é obrigatório`);
    for (const [c, max] of Object.entries(TAMANHOS)) if (l[c] && l[c].length > max) e(`"${c}" passa de ${max} caracteres`);

    const leg = acharLegislacao(cat.legislacoes, bruta.legislacao);
    if (normalizarTexto(bruta.legislacao) && !leg) e(`legislação "${bruta.legislacao}" não encontrada (use: ${cat.legislacoes.map((x) => x.nome).join(' ou ')})`);
    l.id_legislacao = leg?.id_legislacao;
    l.legislacao = leg?.nome;

    const origem = cat.origens.find((o) => semAcento(o) === semAcento(bruta.origem_amostra));
    if (normalizarTexto(bruta.origem_amostra) && !origem) e(`origem "${bruta.origem_amostra}" não reconhecida (use: ${[...new Set(cat.origens)].join(', ')})`);
    l.origem_amostra = origem;

    const ensaio = cat.ensaios.get(l.codigo_ensaio);
    if (l.codigo_ensaio && !ensaio) e(`ensaio de código ${l.codigo_ensaio} não cadastrado`);
    l.id_ensaio = ensaio?.id_ensaio;
    l.nome_ensaio = ensaio?.nome;

    try {
      l.valor = converterDecimalBR(bruta.valor);
    } catch {
      e(`valor "${bruta.valor}" não é numérico (use vírgula ou ponto decimal; em ensaios P/A, 0 = ausente e 1 = presente)`);
    }
    l.data_coleta = converterData(bruta.data_coleta);
    if (l.data_coleta === undefined) e(`data de coleta "${bruta.data_coleta}" inválida (use DD/MM/AAAA)`);
    const dr = converterData(bruta.data_resultado);
    if (dr === undefined) e(`data do resultado "${bruta.data_resultado}" inválida (use DD/MM/AAAA)`);
    l.data_resultado = dr ?? l.data_coleta;
    if (l.data_resultado && l.data_coleta && l.data_resultado < l.data_coleta) e('data do resultado anterior à data de coleta');
    validas.push(l);
  }
  // mesma amostra + mesmo ensaio repetidos no lote
  const vistos = new Map();
  for (const l of validas) {
    const k = `${l.codigo_amostra}|${l.codigo_ensaio}`;
    if (vistos.has(k)) erros.push({ linha: l.linha, mensagem: `ensaio ${l.codigo_ensaio} repetido para a amostra ${l.codigo_amostra} (linha ${vistos.get(k)})` });
    else vistos.set(k, l.linha);
  }
  return { erros, linhas: validas };
}

const proximo = async (client, tabela, coluna) => Number((await client.query(`SELECT COALESCE(MAX(${coluna}),0)+1 AS id FROM ${tabela}`)).rows[0].id);

/**
 * Grava as linhas (já validadas) em uma transação. Retorna { erros } ou
 * { lote, resultados } com a classificação automática de cada resultado.
 */
export async function registrarResultados(pool, linhasBrutas, { origem, arquivo = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE cliente, proposta_comercial, amostra, resultado IN SHARE ROW EXCLUSIVE MODE');
    const cat = await catalogos(client);
    const { erros, linhas } = validarLinhas(linhasBrutas, cat);
    if (!linhas.length && !erros.length) erros.push({ linha: null, mensagem: 'Nenhum resultado para lançar.' });

    // Unidade em branco: usa a do limite aplicável, se houver exatamente um.
    for (const l of linhas.filter((x) => !x.unidade && x.id_ensaio && x.id_legislacao && x.origem_amostra)) {
      const r = await client.query(
        `SELECT DISTINCT unidade_medida FROM limite WHERE ativo AND fk_id_ensaio = $1 AND fk_id_legislacao = $2
           AND fn_normalizar_texto(origem_amostra) = fn_normalizar_texto($3)`,
        [l.id_ensaio, l.id_legislacao, l.origem_amostra],
      );
      if (r.rowCount === 1) l.unidade = r.rows[0].unidade_medida;
      else erros.push({ linha: l.linha, mensagem: 'unidade não informada e não foi possível deduzi-la do limite' });
    }

    const lote = (await client.query(
      `INSERT INTO etl.lote_resultados (origem, arquivo) VALUES ($1, $2) RETURNING id_lote`, [origem, arquivo],
    )).rows[0].id_lote;
    const criados = { clientes: [], propostas: [] };
    const clientes = new Map();
    const propostas = new Map();
    const amostras = new Map();
    const inseridos = [];

    for (const l of erros.length ? [] : linhas) {
      // CLIENTE (por nome exato)
      if (!clientes.has(l.cliente)) {
        const r = await client.query('SELECT id_cliente FROM cliente WHERE nome = $1 ORDER BY id_cliente LIMIT 1', [l.cliente]);
        let id = r.rows[0]?.id_cliente;
        if (!id) {
          id = await proximo(client, 'cliente', 'id_cliente');
          await client.query('INSERT INTO cliente (id_cliente, nome) VALUES ($1, $2)', [id, l.cliente]);
          criados.clientes.push(id);
        }
        clientes.set(l.cliente, id);
      }
      const idCliente = clientes.get(l.cliente);

      // PROPOSTA do cliente associada exatamente a esta legislação
      const kp = `${idCliente}|${l.id_legislacao}`;
      if (!propostas.has(kp)) {
        const r = await client.query(
          `SELECT p.id_proposta FROM proposta_comercial p
            WHERE p.fk_id_cliente = $1
              AND (SELECT array_agg(fk_id_legislacao ORDER BY fk_id_legislacao) FROM e__assoc__1_possui a WHERE a.fk_id_proposta = p.id_proposta) = ARRAY[$2::int]
            ORDER BY p.id_proposta LIMIT 1`,
          [idCliente, l.id_legislacao],
        );
        let id = r.rows[0]?.id_proposta;
        if (!id) {
          id = await proximo(client, 'proposta_comercial', 'id_proposta');
          await client.query('INSERT INTO proposta_comercial (id_proposta, fk_id_cliente) VALUES ($1, $2)', [id, idCliente]);
          await client.query('INSERT INTO e__assoc__1_possui (fk_id_proposta, fk_id_legislacao) VALUES ($1, $2)', [id, l.id_legislacao]);
          criados.propostas.push(id);
        }
        propostas.set(kp, id);
      }
      const idProposta = propostas.get(kp);

      // AMOSTRA (por código do laboratório)
      if (!amostras.has(l.codigo_amostra)) {
        const r = await client.query(
          `SELECT id_amostra, fk_id_proposta, ponto_coleta, origem, data_coleta FROM amostra WHERE codigo_amostra = $1`, [l.codigo_amostra],
        );
        let id = r.rows[0]?.id_amostra;
        if (id) {
          const a = r.rows[0];
          if (a.fk_id_proposta !== idProposta || a.ponto_coleta !== l.ponto_coleta || a.origem !== l.origem_amostra || a.data_coleta !== l.data_coleta) {
            erros.push({ linha: l.linha, mensagem: `amostra ${l.codigo_amostra} já existe com cliente, legislação, ponto, origem ou data de coleta diferentes` });
            continue;
          }
        } else {
          id = await proximo(client, 'amostra', 'id_amostra');
          await client.query(
            `INSERT INTO amostra (id_amostra, data_coleta, origem, matriz, fk_id_cliente, fk_id_proposta, codigo_amostra, ponto_coleta, id_lote)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [id, l.data_coleta, l.origem_amostra, l.matriz, idCliente, idProposta, l.codigo_amostra, l.ponto_coleta, lote],
          );
        }
        amostras.set(l.codigo_amostra, id);
      }
      const idAmostra = amostras.get(l.codigo_amostra);

      const dup = await client.query('SELECT 1 FROM resultado WHERE fk_id_amostra = $1 AND fk_id_ensaio = $2', [idAmostra, l.id_ensaio]);
      if (dup.rowCount) {
        erros.push({ linha: l.linha, mensagem: `já existe resultado do ensaio ${l.codigo_ensaio} para a amostra ${l.codigo_amostra}` });
        continue;
      }
      const idResultado = await proximo(client, 'resultado', 'id_resultado');
      await client.query(
        `INSERT INTO resultado (id_resultado, valor, data_resultado, fk_id_amostra, fk_id_ensaio, unidade_medida) VALUES ($1, $2, $3, $4, $5, $6)`,
        [idResultado, l.valor, l.data_resultado, idAmostra, l.id_ensaio, l.unidade],
      );
      inseridos.push(idResultado);
    }

    if (erros.length) {
      await client.query('ROLLBACK');
      return { erros: erros.sort((a, b) => (a.linha ?? 0) - (b.linha ?? 0)) };
    }

    await client.query(
      `UPDATE etl.lote_resultados SET qtd_amostras = $2, qtd_resultados = $3, criados = $4 WHERE id_lote = $1`,
      [lote, amostras.size, inseridos.length, JSON.stringify(criados)],
    );
    const alertas = await gerarAlertas(client);
    const resultados = (await client.query(
      `SELECT id_resultado, codigo_amostra, ponto_coleta, codigo_ensaio, ensaio, valor, unidade_resultado, data_resultado,
              valor_minimo, valor_maximo, unidade_limite, legislacao, categoria, motivo_pendencia
       FROM vw_resultado_conformidade WHERE id_resultado = ANY($1) ORDER BY id_resultado`,
      [inseridos],
    )).rows;
    await client.query('COMMIT');
    return { lote, amostras: amostras.size, resultados, alertas };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Desfaz um lote: remove alertas, resultados e amostras criados por ele. */
export async function desfazerLote(pool, idLote) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lote = (await client.query('SELECT * FROM etl.lote_resultados WHERE id_lote = $1 FOR UPDATE', [idLote])).rows[0];
    if (!lote) throw Object.assign(new Error('Lote não encontrado'), { status: 404 });
    if (lote.desfeito_em) throw Object.assign(new Error('Este lote já foi desfeito'), { status: 409 });
    const amostras = (await client.query('SELECT id_amostra FROM amostra WHERE id_lote = $1', [idLote])).rows.map((r) => r.id_amostra);
    const alertas = await client.query(
      'DELETE FROM alerta WHERE fk_id_resultado IN (SELECT id_resultado FROM resultado WHERE fk_id_amostra = ANY($1))', [amostras],
    );
    const resultados = await client.query('DELETE FROM resultado WHERE fk_id_amostra = ANY($1)', [amostras]);
    await client.query('DELETE FROM amostra WHERE id_amostra = ANY($1)', [amostras]);
    const criados = lote.criados ?? { clientes: [], propostas: [] };
    // propostas e clientes criados pelo lote, somente se ficaram sem uso
    await client.query(
      `DELETE FROM e__assoc__1_possui WHERE fk_id_proposta = ANY($1) AND NOT EXISTS (SELECT 1 FROM amostra a WHERE a.fk_id_proposta = e__assoc__1_possui.fk_id_proposta)`,
      [criados.propostas],
    );
    await client.query(
      `DELETE FROM proposta_comercial p WHERE id_proposta = ANY($1) AND NOT EXISTS (SELECT 1 FROM amostra a WHERE a.fk_id_proposta = p.id_proposta)
         AND NOT EXISTS (SELECT 1 FROM e__assoc__1_possui x WHERE x.fk_id_proposta = p.id_proposta)`,
      [criados.propostas],
    );
    await client.query(
      `DELETE FROM cliente c WHERE id_cliente = ANY($1) AND NOT EXISTS (SELECT 1 FROM amostra a WHERE a.fk_id_cliente = c.id_cliente)
         AND NOT EXISTS (SELECT 1 FROM proposta_comercial p WHERE p.fk_id_cliente = c.id_cliente)`,
      [criados.clientes],
    );
    await client.query('UPDATE etl.lote_resultados SET desfeito_em = now() WHERE id_lote = $1', [idLote]);
    await client.query('COMMIT');
    return { lote: idLote, amostras: amostras.length, resultados: resultados.rowCount, alertas: alertas.rowCount };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
