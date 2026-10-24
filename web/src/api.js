import { useEffect, useState } from 'react';

/** Busca um endpoint da API. Parâmetros vazios são omitidos. */
export async function buscar(caminho, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined));
  const url = `/api/${caminho}${qs.toString() ? `?${qs}` : ''}`;
  let resposta;
  try {
    resposta = await fetch(url);
  } catch {
    throw new Error('Não foi possível falar com a API. Verifique se "npm run api" está em execução.');
  }
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(corpo.erro ?? `Erro ${resposta.status} ao consultar ${caminho}`);
  return corpo;
}

/** POST para rotas de escrita. Devolve { ok, status, corpo } sem lançar em erro de validação (422). */
export async function enviar(caminho, corpo) {
  let resposta;
  try {
    resposta = await fetch(`/api/${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-IST-Dashboard': '1' },
      body: JSON.stringify(corpo ?? {}),
    });
  } catch {
    throw new Error('Não foi possível falar com a API. Verifique se o servidor está em execução.');
  }
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok && resposta.status !== 422) throw new Error(dados.erro ?? `Erro ${resposta.status}`);
  return { ok: resposta.ok, status: resposta.status, corpo: dados };
}

/** Hook: { dados, erro, carregando, recarregar } — refaz a busca quando os parâmetros mudam. */
export function useApi(caminho, params) {
  const [versao, setVersao] = useState(0);
  const chave = JSON.stringify(params ?? {}) + versao;
  const [estado, setEstado] = useState({ dados: null, erro: null, carregando: true });
  useEffect(() => {
    // caminho null = nada a buscar (ex.: nenhum item selecionado ainda)
    if (!caminho) {
      setEstado({ dados: null, erro: null, carregando: false });
      return undefined;
    }
    let ativo = true;
    setEstado((e) => ({ ...e, carregando: true, erro: null }));
    buscar(caminho, params ?? {})
      .then((dados) => ativo && setEstado({ dados, erro: null, carregando: false }))
      .catch((erro) => ativo && setEstado({ dados: null, erro: erro.message, carregando: false }));
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caminho, chave]);
  return { ...estado, recarregar: () => setVersao((v) => v + 1) };
}

const formatador = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 });

/** Formata número vindo do banco (string DECIMAL) no padrão brasileiro. */
export function numero(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? formatador.format(n) : String(v);
}

export function dataBR(v) {
  if (!v) return '—';
  // data e hora (timestamp): mostra no fuso local; data pura (AAAA-MM-DD): sem conversão
  if (String(v).length > 10 && !String(v).endsWith('T00:00:00.000Z')) return new Date(v).toLocaleDateString('pt-BR');
  const [a, m, d] = String(v).slice(0, 10).split('-');
  return d ? `${d}/${m}/${a}` : String(v);
}
