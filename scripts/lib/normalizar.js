// Regras de padronização aplicadas aos dados extraídos.
// Princípio: padronizar a forma sem alterar o significado.
// Cada regra está documentada em documentacao/documentacao.md (seção "Tratamento dos dados").

/** Remove espaços nas pontas, colapsa espaços internos e normaliza Unicode (NFC). */
export function normalizarTexto(valor) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).normalize('NFC').replace(/\s+/g, ' ').trim();
  return texto === '' ? null : texto;
}

/**
 * Converte decimal no formato brasileiro ("1.234,500000") para string
 * no formato aceito pelo PostgreSQL ("1234.500000").
 * Mantém como string para não perder precisão (DECIMAL no banco).
 * Valor vazio vira null (ausente) — diferente de "0,000000", que vira "0.000000".
 * Valor não numérico lança erro, para ser registrado como pendência.
 */
export function converterDecimalBR(valor) {
  const texto = normalizarTexto(valor);
  if (texto === null) return null;
  const semMilhar = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto;
  if (!/^-?\d+(\.\d+)?$/.test(semMilhar)) {
    throw new Error(`Valor numérico inválido: "${valor}"`);
  }
  return semMilhar;
}

/**
 * Padroniza a unidade de medida.
 * - Vazio → null (unidade não informada na fonte).
 * - "ug/L" (grafia ASCII de micrograma) → "µg/L". É a mesma unidade, não uma conversão.
 * - Letra grega mu (U+03BC) → sinal de micro (U+00B5), para comparar sem ambiguidade.
 * Outras unidades (ex.: "ppb") são preservadas: equivalências que dependem de
 * conversão não são aplicadas automaticamente.
 */
export function normalizarUnidade(valor) {
  const texto = normalizarTexto(valor);
  if (texto === null) return null;
  return texto.replace(/\u03bc/g, '\u00b5').replace(/^ug\//i, '\u00b5g/');
}

/**
 * "Sem classe" (em qualquer capitalização) significa que o limite não depende
 * de classe → fk_id_classe NULL. Demais classes são preservadas como na fonte.
 */
export function normalizarClasse(valor) {
  const texto = normalizarTexto(valor);
  if (texto === null) return null;
  if (texto.toLowerCase() === 'sem classe') return null;
  // Correção de grafia "Àgua" → "Água" (registrada como pendência CLASSE_GRAFIA)
  return texto.replace(/^\u00c0gua\b/, '\u00c1gua');
}

/** Chave estável para comparar textos sem diferenciar maiúsculas/espaços. */
export function chaveTexto(valor) {
  return (normalizarTexto(valor) ?? '').toLowerCase();
}
