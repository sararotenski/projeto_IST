// Extração e validação dos limites legais a partir dos CSVs exportados
// do sistema do laboratório (lista de ensaios por legislação).
//
// Saída: entidades prontas para importação (LEGISLACAO, CLASSE, ENSAIO, LIMITE)
// e uma lista de pendências para revisão humana. Nenhum valor é inventado:
// o que não pode ser determinado com segurança vira pendência.

import { lerCsvComCabecalho } from './csv.js';
import {
  normalizarTexto,
  converterDecimalBR,
  normalizarUnidade,
  normalizarClasse,
  chaveTexto,
} from './normalizar.js';

export const COLUNAS_ESPERADAS = [
  'Legislacao',
  'Matriz',
  'Origem_Amostra',
  'Ensaio',
  'Descricao',
  'Classe_Legislacao',
  'Valor_Min_Permitido',
  'Valor_Max_Permitido',
  'Un_Medida',
];

// Tipos de pendência e se o registro envolvido é importado ou não.
export const TIPOS_PENDENCIA = {
  LINHA_INVALIDA: { importado: false, descricao: 'Linha com estrutura ou valor numérico inválido' },
  DUPLICATA_EXATA: { importado: true, descricao: 'Linhas idênticas consolidadas em um único limite' },
  LIMITE_CONFLITANTE: { importado: false, descricao: 'Mesmo ensaio/legislação/origem/classe com valores ou unidades diferentes' },
  FAIXA_INCONSISTENTE: { importado: false, descricao: 'Valor mínimo maior que o valor máximo' },
  MAXIMO_ZERO: { importado: true, descricao: 'Valor máximo igual a zero: pode indicar ausência exigida ou limite não informado' },
  UNIDADE_AUSENTE: { importado: true, descricao: 'Unidade de medida não informada na fonte' },
  CLASSE_GRAFIA: { importado: true, descricao: 'Nome de classe com possível erro de grafia (preservado como na fonte)' },
  ENSAIO_NOME_DIVERGENTE: { importado: false, descricao: 'Mesmo código de ensaio com nomes diferentes' },
  NOME_EM_CODIGOS_DIFERENTES: { importado: true, descricao: 'Mesmo nome de ensaio com códigos diferentes (mantidos como ensaios distintos)' },
  VIGENCIA_NAO_INFORMADA: { importado: true, descricao: 'Fonte não informa versão nem período de vigência dos limites' },
  COMPRIMENTO_EXCEDIDO: { importado: false, descricao: 'Texto maior que o tamanho da coluna de destino' },
};

// Tamanhos de coluna após a migração 001 (ver sql/001_ajustes_modelo.sql).
export const TAMANHOS = {
  legislacaoNome: 30,
  classeNome: 30,
  ensaioNome: 150,
  ensaioCodigo: 20,
  unidade: 30,
  matriz: 30,
  origem: 60,
};

const juntarLinhas = (linhas) => [...new Set(linhas)].sort((a, b) => a - b).join(',');

/**
 * @param {{arquivo: string, texto: string}[]} fontes
 */
export function extrairLimites(fontes) {
  const pendencias = [];
  const arquivos = [];
  const candidatos = []; // registros válidos, antes de consolidar

  const registrarPendencia = (tipo, descricao, arquivo, linhas, dados, chaveExtra = '') => {
    const linhasTxt = Array.isArray(linhas) ? juntarLinhas(linhas) : String(linhas ?? '');
    pendencias.push({
      chave: [tipo, arquivo ?? '*', linhasTxt, chaveExtra].join('|'),
      tipo,
      importado: TIPOS_PENDENCIA[tipo].importado,
      descricao,
      arquivo_origem: arquivo ?? null,
      linhas_origem: linhasTxt || null,
      dados: dados ?? null,
    });
  };

  // 1) Leitura e validação linha a linha
  for (const { arquivo, texto } of fontes) {
    const { colunas, registros } = lerCsvComCabecalho(texto, ';');
    const faltando = COLUNAS_ESPERADAS.filter((c) => !colunas.includes(c));
    arquivos.push({ arquivo, colunas, totalLinhas: registros.length, colunasFaltando: faltando });
    if (faltando.length) {
      registrarPendencia('LINHA_INVALIDA', `Arquivo sem as colunas: ${faltando.join(', ')}`, arquivo, [1], null);
      continue;
    }

    for (const r of registros) {
      if (r._colunasDivergentes) {
        registrarPendencia('LINHA_INVALIDA', `Linha com ${r._colunasDivergentes} colunas (esperado ${colunas.length})`, arquivo, [r._linha], r);
        continue;
      }
      try {
        const rec = {
          arquivo,
          linha: r._linha,
          legislacao: normalizarTexto(r.Legislacao),
          matriz: normalizarTexto(r.Matriz),
          origem_amostra: normalizarTexto(r.Origem_Amostra),
          codigo_ensaio: normalizarTexto(r.Ensaio),
          nome_ensaio: normalizarTexto(r.Descricao),
          classe: normalizarClasse(r.Classe_Legislacao),
          valor_minimo: converterDecimalBR(r.Valor_Min_Permitido),
          valor_maximo: converterDecimalBR(r.Valor_Max_Permitido),
          unidade_medida: normalizarUnidade(r.Un_Medida),
          unidade_original: normalizarTexto(r.Un_Medida),
        };
        if (!rec.legislacao || !rec.codigo_ensaio || !rec.nome_ensaio) {
          throw new Error('Legislação, código ou descrição do ensaio ausente');
        }
        const excedidos = [
          ['legislação', rec.legislacao, TAMANHOS.legislacaoNome],
          ['classe', rec.classe, TAMANHOS.classeNome],
          ['nome do ensaio', rec.nome_ensaio, TAMANHOS.ensaioNome],
          ['código do ensaio', rec.codigo_ensaio, TAMANHOS.ensaioCodigo],
          ['unidade', rec.unidade_medida, TAMANHOS.unidade],
          ['matriz', rec.matriz, TAMANHOS.matriz],
          ['origem', rec.origem_amostra, TAMANHOS.origem],
        ].filter(([, v, max]) => v && v.length > max);
        if (excedidos.length) {
          registrarPendencia(
            'COMPRIMENTO_EXCEDIDO',
            excedidos.map(([n, v, max]) => `${n} com ${v.length} caracteres (máx. ${max})`).join('; '),
            arquivo,
            [r._linha],
            rec,
          );
          continue;
        }
        candidatos.push(rec);
      } catch (erro) {
        registrarPendencia('LINHA_INVALIDA', erro.message, arquivo, [r._linha], r);
      }
    }
  }

  // 2) Consistência código ↔ nome do ensaio (entre todos os arquivos)
  const nomesPorCodigo = new Map();
  for (const c of candidatos) {
    if (!nomesPorCodigo.has(c.codigo_ensaio)) nomesPorCodigo.set(c.codigo_ensaio, new Set());
    nomesPorCodigo.get(c.codigo_ensaio).add(c.nome_ensaio);
  }
  const codigosDivergentes = new Set();
  for (const [codigo, nomes] of nomesPorCodigo) {
    if (nomes.size > 1) {
      codigosDivergentes.add(codigo);
      const linhas = candidatos.filter((c) => c.codigo_ensaio === codigo);
      registrarPendencia(
        'ENSAIO_NOME_DIVERGENTE',
        `Código ${codigo} aparece com os nomes: ${[...nomes].join(' | ')}`,
        [...new Set(linhas.map((l) => l.arquivo))].join(', '),
        linhas.map((l) => l.linha),
        { codigo, nomes: [...nomes] },
        codigo,
      );
    }
  }

  // Mesmo nome com códigos diferentes: informativo, não são unificados.
  const codigosPorNome = new Map();
  for (const [codigo, nomes] of nomesPorCodigo) {
    for (const nome of nomes) {
      const k = chaveTexto(nome);
      if (!codigosPorNome.has(k)) codigosPorNome.set(k, { nome, codigos: new Set() });
      codigosPorNome.get(k).codigos.add(codigo);
    }
  }
  for (const { nome, codigos } of codigosPorNome.values()) {
    if (codigos.size > 1) {
      const lista = [...codigos].sort((a, b) => Number(a) - Number(b));
      registrarPendencia(
        'NOME_EM_CODIGOS_DIFERENTES',
        `"${nome}" aparece com os códigos ${lista.join(', ')}. Mantidos como ensaios distintos; confirmar se são métodos diferentes.`,
        null,
        null,
        { nome, codigos: lista },
        lista.join(','),
      );
    }
  }

  // 3) Consolidação: duplicatas exatas e conflitos
  const chaveLimite = (c) =>
    [c.legislacao, c.matriz, c.origem_amostra, c.codigo_ensaio, c.classe ?? ''].map((v) => chaveTexto(v)).join('|');
  const chaveValores = (c) => [c.valor_minimo, c.valor_maximo, c.unidade_medida].join('|');

  const grupos = new Map();
  for (const c of candidatos) {
    if (codigosDivergentes.has(c.codigo_ensaio)) continue;
    const k = chaveLimite(c);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(c);
  }

  const limites = [];
  for (const registros of grupos.values()) {
    const variantes = new Map();
    for (const r of registros) {
      const kv = chaveValores(r);
      if (!variantes.has(kv)) variantes.set(kv, []);
      variantes.get(kv).push(r);
    }
    const base = registros[0];
    const linhasTodas = registros.map((r) => r.linha);

    if (variantes.size > 1) {
      const descricaoVariantes = [...variantes.values()]
        .map((vs) => {
          const v = vs[0];
          return `mín ${v.valor_minimo ?? '—'} / máx ${v.valor_maximo ?? '—'} ${v.unidade_original ?? '(sem unidade)'} (linhas ${juntarLinhas(vs.map((x) => x.linha))})`;
        })
        .join(' × ');
      registrarPendencia(
        'LIMITE_CONFLITANTE',
        `${base.nome_ensaio} (código ${base.codigo_ensaio}) em ${base.origem_amostra}: ${descricaoVariantes}. Nenhuma versão foi escolhida.`,
        base.arquivo,
        linhasTodas,
        { codigo: base.codigo_ensaio, variantes: [...variantes.values()].map((vs) => vs[0]) },
      );
      continue;
    }

    if (registros.length > 1) {
      registrarPendencia(
        'DUPLICATA_EXATA',
        `${base.nome_ensaio} (código ${base.codigo_ensaio}) repetido ${registros.length} vezes com os mesmos valores`,
        base.arquivo,
        linhasTodas,
        null,
      );
    }

    const min = base.valor_minimo === null ? null : Number(base.valor_minimo);
    const max = base.valor_maximo === null ? null : Number(base.valor_maximo);
    if (min !== null && max !== null && min > max) {
      registrarPendencia(
        'FAIXA_INCONSISTENTE',
        `${base.nome_ensaio} (código ${base.codigo_ensaio}) em ${base.origem_amostra}: mínimo ${base.valor_minimo} maior que máximo ${base.valor_maximo}`,
        base.arquivo,
        linhasTodas,
        base,
      );
      continue;
    }

    const observacoes = [];
    if (max === 0) {
      observacoes.push('máximo igual a zero');
      registrarPendencia(
        'MAXIMO_ZERO',
        `${base.nome_ensaio} (código ${base.codigo_ensaio}) em ${base.origem_amostra}: máximo 0 ${base.unidade_original ?? ''}`.trim(),
        base.arquivo,
        linhasTodas,
        null,
      );
    }
    if (!base.unidade_medida) {
      observacoes.push('unidade não informada');
      registrarPendencia(
        'UNIDADE_AUSENTE',
        `${base.nome_ensaio} (código ${base.codigo_ensaio}) em ${base.origem_amostra}`,
        base.arquivo,
        linhasTodas,
        null,
      );
    }
    if (base.classe && /^\u00c0/.test(base.classe)) {
      registrarPendencia(
        'CLASSE_GRAFIA',
        `Classe "${base.classe}" (${base.nome_ensaio}, código ${base.codigo_ensaio}): possível grafia de "Água tratada"`,
        base.arquivo,
        linhasTodas,
        null,
      );
    }

    limites.push({
      legislacao: base.legislacao,
      codigo_ensaio: base.codigo_ensaio,
      classe: base.classe,
      matriz: base.matriz,
      origem_amostra: base.origem_amostra,
      valor_minimo: base.valor_minimo,
      valor_maximo: base.valor_maximo,
      unidade_medida: base.unidade_medida,
      versao: 1,
      data_inicio_vigencia: null,
      data_fim_vigencia: null,
      requer_validacao: observacoes.length > 0,
      observacao_validacao: observacoes.length ? `Revisar: ${observacoes.join('; ')}` : null,
      arquivo_origem: base.arquivo,
      linhas_origem: juntarLinhas(linhasTodas),
    });
  }

  // 4) Entidades derivadas (apenas as referenciadas por limites válidos)
  const legislacoes = [...new Set(limites.map((l) => l.legislacao))].sort().map((nome) => ({ nome }));
  const classes = [
    ...new Map(limites.filter((l) => l.classe).map((l) => [`${l.legislacao}|${l.classe}`, { legislacao: l.legislacao, nome: l.classe }])).values(),
  ];
  const ensaiosMap = new Map();
  for (const l of limites) {
    if (!ensaiosMap.has(l.codigo_ensaio)) {
      ensaiosMap.set(l.codigo_ensaio, { codigo_origem: l.codigo_ensaio, nome: [...nomesPorCodigo.get(l.codigo_ensaio)][0] });
    }
  }
  const ensaios = [...ensaiosMap.values()].sort((a, b) => Number(a.codigo_origem) - Number(b.codigo_origem));

  for (const { nome } of legislacoes) {
    registrarPendencia(
      'VIGENCIA_NAO_INFORMADA',
      `${nome}: arquivos não trazem versão nem datas de vigência. Limites importados com versão 1 e vigência vazia; confirmar no texto oficial.`,
      null,
      null,
      null,
      nome,
    );
  }

  const totalLinhas = arquivos.reduce((s, a) => s + a.totalLinhas, 0);
  return {
    arquivos,
    legislacoes,
    classes,
    ensaios,
    limites,
    pendencias,
    estatisticas: {
      totalLinhas,
      linhasValidas: candidatos.length,
      limitesConsolidados: limites.length,
      limitesRequerValidacao: limites.filter((l) => l.requer_validacao).length,
      pendenciasPorTipo: Object.fromEntries(
        Object.keys(TIPOS_PENDENCIA).map((t) => [t, pendencias.filter((p) => p.tipo === t).length]),
      ),
    },
  };
}
