import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApi, numero, dataBR } from '../api.js';
import { Aviso, Cartao, COR_CATEGORIA, Estado, Etiqueta, Filtros, Secao, Seletor, SemDados, Tabela } from '../components/ui.jsx';

const eixo = { fill: '#5C3D2E', fontSize: 12 };

const colunas = [
  { chave: 'data_resultado', titulo: 'Data', render: (l) => dataBR(l.data_resultado) },
  { chave: 'id_amostra', titulo: 'Amostra', numerica: true },
  { chave: 'valor', titulo: 'Valor', numerica: true, render: (l) => `${numero(l.valor)} ${l.unidade_resultado ?? ''}` },
  { chave: 'variacao_absoluta', titulo: 'Variação', numerica: true, render: (l) => numero(l.variacao_absoluta) },
  { chave: 'variacao_percentual', titulo: 'Variação %', numerica: true, render: (l) => (l.variacao_percentual === null ? '—' : `${numero(l.variacao_percentual)}%`) },
  { chave: 'direcao', titulo: 'Direção', render: (l) => l.direcao ?? '—' },
  { chave: 'categoria', titulo: 'Classificação', render: (l) => <Etiqueta cor={COR_CATEGORIA[l.categoria]}>{l.categoria}</Etiqueta> },
  { chave: 'recorrencia_fora_limite', titulo: 'Recorrência', render: (l) => (l.recorrencia_fora_limite ? 'Sim' : 'Não') },
];

export default function Historico() {
  const [ensaio, setEnsaio] = useState('');
  const [serie, setSerie] = useState('');
  const opcoes = useApi('filtros');
  const dados = useApi('historico', { ensaio, serie });

  const series = dados.dados?.series ?? [];
  const pontos = dados.dados?.pontos ?? [];
  const grafico = pontos.map((p) => ({ data: dataBR(p.data_resultado), valor: Number(p.valor) }));
  const ultimo = pontos[pontos.length - 1];
  const min = ultimo?.valor_minimo !== null && ultimo?.valor_minimo !== undefined ? Number(ultimo.valor_minimo) : null;
  const max = ultimo?.valor_maximo !== null && ultimo?.valor_maximo !== undefined ? Number(ultimo.valor_maximo) : null;

  return (
    <Secao
      titulo="Histórico dos resultados"
      descricao="Séries de resultados do mesmo ensaio, cliente, origem, matriz e unidade. Variação observada não é o mesmo que tendência estatística."
    >
      <Aviso tipo="atencao">
        O modelo não tem identificador de ponto de coleta. A regra de série usada aqui é provisória e precisa de validação técnica
        antes de qualquer conclusão sobre evolução.
      </Aviso>
      <Estado erro={opcoes.erro} carregando={opcoes.carregando}>
        {opcoes.dados && (
          <Filtros>
            <Seletor
              rotulo="Ensaio"
              valor={ensaio}
              aoMudar={(v) => {
                setEnsaio(v);
                setSerie('');
              }}
              todas="Todos"
              opcoes={opcoes.dados.ensaios.map((e) => ({ valor: String(e.id), rotulo: `${e.nome} (cód. ${e.codigo})` }))}
            />
            <Seletor
              rotulo="Série"
              valor={serie}
              aoMudar={setSerie}
              todas="Selecione uma série"
              opcoes={series.map((s) => ({ valor: s.serie, rotulo: `${s.serie} (${s.pontos} pontos)` }))}
            />
          </Filtros>
        )}
      </Estado>

      <Estado erro={dados.erro} carregando={dados.carregando}>
        {series.length === 0 ? (
          <SemDados titulo="Nenhuma série histórica disponível">
            Não há resultados laboratoriais com valor e data cadastrados. O histórico aparece quando houver resultados reais.
          </SemDados>
        ) : !serie ? (
          <Tabela
            legenda="Séries disponíveis"
            colunas={[
              { chave: 'ensaio', titulo: 'Ensaio' },
              { chave: 'serie', titulo: 'Série' },
              { chave: 'pontos', titulo: 'Pontos', numerica: true },
              { chave: 'primeira', titulo: 'Primeiro', render: (l) => dataBR(l.primeira) },
              { chave: 'ultima', titulo: 'Último', render: (l) => dataBR(l.ultima) },
              { chave: 'fora_limite', titulo: 'Fora do limite', numerica: true },
            ]}
            linhas={series}
            chaveLinha={(l) => l.serie}
          />
        ) : (
          <>
            {pontos.length > 0 && !pontos[0].serie_suficiente && (
              <Aviso tipo="atencao">Série com {pontos.length} ponto(s): insuficiente para descrever evolução (mínimo de 3).</Aviso>
            )}
            <Cartao titulo={`Evolução — ${ultimo?.unidade_resultado ?? ''}`} largura="total">
              <div role="img" aria-label="Gráfico de linha com a evolução dos resultados da série e os limites aplicáveis">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={grafico} margin={{ left: 10, right: 30, top: 10 }}>
                    <CartesianGrid stroke="#E8DACB" />
                    <XAxis dataKey="data" tick={eixo} />
                    <YAxis tick={eixo} />
                    <Tooltip formatter={(v) => numero(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="valor" name="Resultado" stroke="#8B5E3C" strokeWidth={2} dot={{ r: 4 }} />
                    {max !== null && <ReferenceLine y={max} stroke="#A0402A" strokeDasharray="6 4" label={{ value: `Máx. ${numero(max)}`, fill: '#A0402A' }} />}
                    {min !== null && min > 0 && <ReferenceLine y={min} stroke="#C68A2E" strokeDasharray="6 4" label={{ value: `Mín. ${numero(min)}`, fill: '#C68A2E' }} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Cartao>
            <Tabela legenda="Pontos da série" colunas={colunas} linhas={pontos} chaveLinha={(l) => l.id_resultado} />
          </>
        )}
      </Estado>
    </Secao>
  );
}
