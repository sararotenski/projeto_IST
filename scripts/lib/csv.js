// Leitor de CSV simples e sem dependências.
// Suporta: BOM UTF-8, quebras de linha CRLF/LF, separador configurável
// e campos entre aspas (com aspas duplicadas como escape).

/**
 * Converte o texto de um CSV em uma lista de linhas.
 * Cada linha é { numeroLinha, valores } — numeroLinha é 1-based e
 * corresponde à linha física no arquivo (o cabeçalho é a linha 1).
 */
export function lerLinhasCsv(texto, separador = ';') {
  const conteudo = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const linhas = [];
  let campo = '';
  let valores = [];
  let entreAspas = false;
  let linhaAtual = 1;
  let linhaInicio = 1;

  const fecharLinha = () => {
    valores.push(campo);
    // Ignora linhas totalmente vazias (ex.: quebra de linha final).
    if (!(valores.length === 1 && valores[0] === '')) {
      linhas.push({ numeroLinha: linhaInicio, valores });
    }
    valores = [];
    campo = '';
  };

  for (let i = 0; i < conteudo.length; i++) {
    const c = conteudo[i];
    if (entreAspas) {
      if (c === '"') {
        if (conteudo[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreAspas = false;
        }
      } else {
        if (c === '\n') linhaAtual++;
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      entreAspas = true;
    } else if (c === separador) {
      valores.push(campo);
      campo = '';
    } else if (c === '\r') {
      // tratado junto com \n
    } else if (c === '\n') {
      fecharLinha();
      linhaAtual++;
      linhaInicio = linhaAtual;
    } else {
      campo += c;
    }
  }
  if (campo !== '' || valores.length > 0) fecharLinha();
  return linhas;
}

/**
 * Lê um CSV com cabeçalho e devolve registros como objetos,
 * preservando o número da linha de origem em `_linha`.
 */
export function lerCsvComCabecalho(texto, separador = ';') {
  const [cabecalho, ...dados] = lerLinhasCsv(texto, separador);
  if (!cabecalho) return { colunas: [], registros: [] };
  const colunas = cabecalho.valores.map((c) => c.trim());
  const registros = dados.map(({ numeroLinha, valores }) => {
    const obj = { _linha: numeroLinha };
    colunas.forEach((col, idx) => {
      obj[col] = valores[idx] ?? '';
    });
    if (valores.length !== colunas.length) obj._colunasDivergentes = valores.length;
    return obj;
  });
  return { colunas, registros };
}
