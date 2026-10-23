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

/** Hook: { dados, erro, carregando } — refaz a busca quando os parâmetros mudam. */
export function useApi(caminho, params) {
  const chave = JSON.stringify(params ?? {});
  const [estado, setEstado] = useState({ dados: null, erro: null, carregando: true });
  useEffect(() => {
    // caminho null = nada a buscar (ex.: nenhum item selecionado ainda)
    if (!caminho) {
      setEstado({ dados: null, erro: null, carregando: false });
      return undefined;
    }
    let ativo = true;
    setEstado((e) => ({ ...e, carregando: true, erro: null }));
    buscar(caminho, JSON.parse(chave))
      .then((dados) => ativo && setEstado({ dados, erro: null, carregando: false }))
      .catch((erro) => ativo && setEstado({ dados: null, erro: erro.message, carregando: false }));
    return () => {
      ativo = false;
    };
  }, [caminho, chave]);
  return estado;
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
  const [a, m, d] = String(v).slice(0, 10).split('-');
  return d ? `${d}/${m}/${a}` : String(v);
}
