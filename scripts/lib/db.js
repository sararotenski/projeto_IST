// Conexão com o PostgreSQL.
// As credenciais vêm SOMENTE de variáveis de ambiente (arquivo .env local,
// fora do controle de versão): PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD.
// O driver `pg` lê essas variáveis automaticamente.

import pg from 'pg';

// DECIMAL/NUMERIC (OID 1700) chega como string para não perder precisão.
// DATE (OID 1082) chega como 'AAAA-MM-DD', sem conversão de fuso.
pg.types.setTypeParser(1082, (v) => v);

export function configuracaoBanco() {
  const faltando = ['PGDATABASE', 'PGUSER'].filter((v) => !process.env[v]);
  if (faltando.length) {
    throw new Error(
      `Variáveis de ambiente ausentes: ${faltando.join(', ')}. Copie .env.example para .env e preencha os valores.`,
    );
  }
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    application_name: 'ist-ensaios',
    connectionTimeoutMillis: 5000,
  };
}

export function criarPool(opcoes = {}) {
  return new pg.Pool({ ...configuracaoBanco(), max: 5, ...opcoes });
}

export async function conectar() {
  const client = new pg.Client(configuracaoBanco());
  await client.connect();
  return client;
}

/** Mensagem de erro amigável, sem expor credenciais. */
export function descreverErroBanco(erro) {
  const codigo = erro?.code;
  if (codigo === 'ECONNREFUSED') return 'Não foi possível conectar ao PostgreSQL (servidor recusou a conexão). Verifique PGHOST/PGPORT e se o serviço está ativo.';
  if (codigo === '28P01') return 'Usuário ou senha do PostgreSQL inválidos. Verifique PGUSER/PGPASSWORD no arquivo .env.';
  if (codigo === '3D000') return 'Banco de dados informado em PGDATABASE não existe.';
  if (codigo === '42P01') return 'Tabela ou view não encontrada. Verifique se a estrutura e a migração foram aplicadas (npm run inspecionar).';
  if (codigo === '42703') return 'Coluna não encontrada. A migração 001 provavelmente não foi aplicada (npm run inspecionar).';
  if (/password/i.test(erro?.message ?? '')) return 'Senha do PostgreSQL não informada ou inválida. Verifique PGPASSWORD no arquivo .env.';
  return erro?.message ?? String(erro);
}

/** Verifica se uma migração registrada em etl.migracao foi aplicada. */
export async function migracaoAplicada(client, nome) {
  const { rows } = await client.query(
    `SELECT to_regclass('etl.migracao') IS NOT NULL AS existe`,
  );
  if (!rows[0].existe) return false;
  const r = await client.query('SELECT 1 FROM etl.migracao WHERE nome = $1', [nome]);
  return r.rowCount > 0;
}
