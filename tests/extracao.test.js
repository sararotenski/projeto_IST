import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extrairLimites } from '../scripts/lib/extracao.js';
import { carregarFontes } from '../scripts/extrair.js';

const CAB = 'Legislacao;Matriz;Origem_Amostra;Ensaio;Descricao;Classe_Legislacao;Valor_Min_Permitido;Valor_Max_Permitido;Un_Medida';
const linha = (ensaio, nome, min, max, un, classe = 'Sem classe', origem = 'Agua Tratada') =>
  `Lei X;Água - BNU;${origem};${ensaio};${nome};${classe};${min};${max};${un}`;
const extrair = (...linhas) => extrairLimites([{ arquivo: 't.csv', texto: [CAB, ...linhas].join('\n') }]);

test('duplicatas exatas são consolidadas e registradas', () => {
  const r = extrair(linha(1, 'Amônia', '0,0', '1,2', 'mg/L'), linha(1, 'Amônia', '0,0', '1,2', 'mg/L'));
  assert.equal(r.limites.length, 1);
  assert.equal(r.limites[0].linhas_origem, '2,3');
  assert.equal(r.pendencias.filter((p) => p.tipo === 'DUPLICATA_EXATA').length, 1);
});

test('ug/L e µg/L do mesmo limite não são conflito', () => {
  const r = extrair(linha(2, 'Tiram', '0', '6', 'ug/L'), linha(2, 'Tiram', '0', '6', 'µg/L'));
  assert.equal(r.limites.length, 1);
  assert.equal(r.limites[0].unidade_medida, 'µg/L');
});

test('valores conflitantes: nenhuma versão é escolhida', () => {
  const r = extrair(linha(3, 'Paraquate', '0', '13', 'µg/L'), linha(3, 'Paraquate', '0', '0', 'µg/L'));
  assert.equal(r.limites.length, 0);
  assert.equal(r.pendencias[0].tipo, 'LIMITE_CONFLITANTE');
  assert.equal(r.pendencias[0].importado, false);
});

test('ppb × µg/L é conflito (sem conversão automática)', () => {
  const r = extrair(linha(4, 'Microcistinas', '0', '1', 'ppb'), linha(4, 'Microcistinas', '0', '1', 'µg/L'));
  assert.equal(r.limites.length, 0);
  assert.ok(r.pendencias.some((p) => p.tipo === 'LIMITE_CONFLITANTE'));
});

test('mínimo maior que máximo é rejeitado', () => {
  const r = extrair(linha(5, 'Cloro', '0,2', '0', 'mg/L'));
  assert.equal(r.limites.length, 0);
  assert.equal(r.pendencias[0].tipo, 'FAIXA_INCONSISTENTE');
});

test('máximo zero e unidade ausente são importados marcados para validação', () => {
  const r = extrair(linha(6, 'E. coli', '0', '0', 'Aus/Pres em 100mL'), linha(7, 'pH', '6', '9', ''));
  assert.equal(r.limites.length, 2);
  assert.ok(r.limites.every((l) => l.requer_validacao));
  assert.equal(r.limites.find((l) => l.codigo_ensaio === '7').unidade_medida, null);
  assert.equal(r.limites.find((l) => l.codigo_ensaio === '7').valor_minimo, '6');
});

test('mesma origem com classes diferentes são limites distintos', () => {
  const r = extrair(linha(8, 'Cloraminas', '0', '4', 'mg/L'), linha(8, 'Cloraminas', '0', '4', 'mg/L', 'ESPECIFICAÇÃO'));
  assert.equal(r.limites.length, 2);
  assert.deepEqual(r.classes, [{ legislacao: 'Lei X', nome: 'ESPECIFICAÇÃO' }]);
});

test('mesmo nome com códigos diferentes não é unificado', () => {
  const r = extrair(linha(9, 'Ferro', '0', '0,3', 'mg/L'), linha(10, 'Ferro', '0', '0,3', 'mg/L'));
  assert.equal(r.ensaios.length, 2);
  assert.ok(r.pendencias.some((p) => p.tipo === 'NOME_EM_CODIGOS_DIFERENTES'));
});

test('vigência nunca é inventada', () => {
  const r = extrair(linha(11, 'Sulfato', '0', '250', 'mg/L'));
  assert.equal(r.limites[0].data_inicio_vigencia, null);
  assert.equal(r.limites[0].data_fim_vigencia, null);
  assert.ok(r.pendencias.some((p) => p.tipo === 'VIGENCIA_NAO_INFORMADA'));
});

test('arquivos reais: todas as linhas são contabilizadas', async () => {
  const r = extrairLimites(await carregarFontes());
  assert.equal(r.arquivos.length, 6);
  assert.equal(r.estatisticas.totalLinhas, 794);
  const linhasEmLimites = r.limites.reduce((s, l) => s + l.linhas_origem.split(',').length, 0);
  const linhasRejeitadas = r.pendencias
    .filter((p) => ['LIMITE_CONFLITANTE', 'FAIXA_INCONSISTENTE', 'LINHA_INVALIDA', 'COMPRIMENTO_EXCEDIDO'].includes(p.tipo))
    .reduce((s, p) => s + p.linhas_origem.split(',').length, 0);
  assert.equal(linhasEmLimites + linhasRejeitadas, 794);
  assert.equal(r.limites.length, 732);
  // chave natural única
  const chaves = new Set(r.limites.map((l) => [l.legislacao, l.origem_amostra, l.matriz, l.codigo_ensaio, l.classe].join('|')));
  assert.equal(chaves.size, r.limites.length);
});
