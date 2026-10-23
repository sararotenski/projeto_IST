import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApi, numero, dataBR } from '../api.js';
import { Aviso, Cartao, COR_CATEGORIA, Estado, Kpi, PALETA, SemDados, Secao, Tabela } from '../components/ui.jsx';

const eixo = { fill: '#5C3D2E', fontSize: 12 };

export default function VisaoGeral() {
  const { dados, erro, carregando } = useApi('resumo');

  return (
    <Secao
      titulo="Visão geral"
      descricao="Indicadores calculados diretamente do banco PostgreSQL. Quando não há dados suficientes, o painel mostra uma mensagem em vez de números."
    >
      <Estado erro={erro} carregando={carregando}>
        {dados && <Conteudo dados={dados} />}
      </Estado>
    </Secao>
  );
}

function Conteudo({ dados }) {
  const c = dados.contagens;
  const porOrigem = dados.limitesPorOrigem.map((l) => ({
    nome: `${l.origem_amostra} · ${l.legislacao.replace('Portaria ', '')}`,
    'Limites válidos': l.limites - l.requer_validacao,
    'Requerem validação': l.requer_validacao,
  }));

  return (
    <>
      <div className="kpis">
        <Kpi rotulo="Legislações" valor={numero(c.legislacoes)} detalhe={`${c.classes} classes`} />
        <Kpi rotulo="Ensaios" valor={numero(c.ensaios)} />
        <Kpi rotulo="Limites legais" valor={numero(c.limites)} detalhe={`${c.limites_requer_validacao} requerem validação`} />
        <Kpi rotulo="Amostras" valor={numero(c.amostras)} />
        <Kpi rotulo="Resultados" valor={numero(c.resultados)} />
        <Kpi rotulo="Alertas" valor={numero(c.alertas)} />
        <Kpi rotulo="Pendências de dados" valor={numero(c.pendencias)} destaque detalhe="para revisão humana" />
      </div>

      {c.resultados === 0 && (
        <Aviso>
          Os arquivos fornecidos trazem apenas legislações, ensaios e limites. As tabelas de clientes, propostas, amostras,
          resultados, alertas e pareceres continuam sem dados reais. Por isso, conformidade, histórico e alertas aparecem
          vazios.
        </Aviso>
      )}

      <div className="grade">
        <Cartao titulo="Limites por origem da amostra e legislação" largura="larga">
          {porOrigem.length ? (
            <div role="img" aria-label="Gráfico de barras com a quantidade de limites por origem da amostra e legislação">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={porOrigem} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid stroke="#E8DACB" horizontal={false} />
                  <XAxis type="number" tick={eixo} allowDecimals={false} />
                  <YAxis type="category" dataKey="nome" width={260} tick={eixo} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Limites válidos" stackId="a" fill={PALETA[0]} />
                  <Bar dataKey="Requerem validação" stackId="a" fill={PALETA[3]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <SemDados>Nenhum limite importado.</SemDados>
          )}
        </Cartao>

        <Cartao titulo="Classificação dos resultados">
          {dados.classificacao.length ? (
            <div role="img" aria-label="Gráfico de barras com a distribuição dos resultados por categoria">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dados.classificacao}>
                  <CartesianGrid stroke="#E8DACB" vertical={false} />
                  <XAxis dataKey="categoria" tick={eixo} interval={0} />
                  <YAxis tick={eixo} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="quantidade" name="Resultados">
                    {dados.classificacao.map((d) => (
                      <Cell key={d.categoria} fill={COR_CATEGORIA[d.categoria]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <SemDados>Nenhum resultado laboratorial cadastrado.</SemDados>
          )}
        </Cartao>

        <Cartao titulo="Alertas por tipo">
          {dados.alertasPorTipo.length ? (
            <Tabela legenda="Alertas registrados por tipo" colunas={[{ chave: 'tipo', titulo: 'Tipo' }, { chave: 'quantidade', titulo: 'Quantidade', numerica: true }]} linhas={dados.alertasPorTipo} chaveLinha={(l) => l.tipo} />
          ) : (
            <SemDados>Nenhum alerta registrado. Alertas dependem de resultados laboratoriais.</SemDados>
          )}
        </Cartao>

        <Cartao titulo="Pendências de qualidade por tipo" largura="larga">
          <Tabela
            legenda="Pendências abertas"
            colunas={[
              { chave: 'tipo', titulo: 'Tipo' },
              { chave: 'importado', titulo: 'Registro importado?', render: (l) => (l.importado ? 'Sim, com ressalva' : 'Não') },
              { chave: 'quantidade', titulo: 'Quantidade', numerica: true },
            ]}
            linhas={dados.pendenciasPorTipo}
            chaveLinha={(l) => `${l.tipo}-${l.importado}`}
          />
        </Cartao>
      </div>
      {dados.ultimaImportacao && (
        <p className="nota">
          Última importação concluída: execução nº {dados.ultimaImportacao.id_execucao} em {dataBR(dados.ultimaImportacao.finalizado_em)}.
        </p>
      )}
    </>
  );
}
