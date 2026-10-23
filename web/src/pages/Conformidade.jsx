import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApi, numero, dataBR } from '../api.js';
import { Aviso, CampoTexto, Cartao, COR_CATEGORIA, Estado, Etiqueta, Filtros, Secao, Seletor, SemDados, Tabela } from '../components/ui.jsx';

const eixo = { fill: '#5C3D2E', fontSize: 12 };
const vazio = { inicio: '', fim: '', legislacao: '', ensaio: '', classe: '', categoria: '' };

const faixa = (l) => {
  if (l.valor_minimo === null && l.valor_maximo === null) return '—';
  return `${numero(l.valor_minimo)} a ${numero(l.valor_maximo)} ${l.unidade_limite ?? ''}`.trim();
};

const colunas = [
  { chave: 'data_resultado', titulo: 'Data', render: (l) => dataBR(l.data_resultado) },
  { chave: 'id_amostra', titulo: 'Amostra', numerica: true },
  { chave: 'ensaio', titulo: 'Ensaio' },
  { chave: 'valor', titulo: 'Valor', numerica: true, render: (l) => `${numero(l.valor)} ${l.unidade_resultado ?? ''}` },
  { chave: 'limite', titulo: 'Limite utilizado', ordenavel: false, render: faixa },
  { chave: 'legislacao', titulo: 'Legislação', render: (l) => (l.legislacao ? `${l.legislacao}${l.classe ? ` · ${l.classe}` : ''} · v${l.versao ?? 1}` : '—') },
  { chave: 'categoria', titulo: 'Classificação', render: (l) => <Etiqueta cor={COR_CATEGORIA[l.categoria]}>{l.categoria}</Etiqueta> },
  {
    chave: 'motivo_pendencia',
    titulo: 'Observação',
    render: (l) =>
      l.motivo_pendencia
        ? `${l.motivo_pendencia}${l.classificacao_indicativa ? ` (indicativo: ${l.classificacao_indicativa.toLowerCase()})` : ''}`
        : '—',
  },
];

export default function Conformidade() {
  const [f, setF] = useState(vazio);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const opcoes = useApi('filtros');
  const lista = useApi('conformidade', f);

  const porCategoria = useMemo(() => {
    const m = new Map();
    for (const l of lista.dados ?? []) m.set(l.categoria, (m.get(l.categoria) ?? 0) + 1);
    return [...m.entries()].map(([categoria, quantidade]) => ({ categoria, quantidade }));
  }, [lista.dados]);

  const porEnsaio = useMemo(() => {
    const m = new Map();
    for (const l of lista.dados ?? []) {
      const k = l.ensaio ?? 'Ensaio não identificado';
      if (!m.has(k)) m.set(k, { ensaio: k, total: 0 });
      const o = m.get(k);
      o[l.categoria] = (o[l.categoria] ?? 0) + 1;
      o.total++;
    }
    return [...m.values()].sort((a, b) => b.total - a.total).slice(0, 15);
  }, [lista.dados]);

  return (
    <Secao
      titulo="Análise de conformidade"
      descricao="Cada resultado é comparado ao limite do mesmo ensaio, na legislação da proposta, para a origem da amostra e vigente na data do resultado."
    >
      <Estado erro={opcoes.erro} carregando={opcoes.carregando}>
        {opcoes.dados && (
          <Filtros aoLimpar={() => setF(vazio)}>
            <CampoTexto rotulo="De" tipo="date" valor={f.inicio} aoMudar={set('inicio')} />
            <CampoTexto rotulo="Até" tipo="date" valor={f.fim} aoMudar={set('fim')} />
            <Seletor rotulo="Legislação" valor={f.legislacao} aoMudar={set('legislacao')} opcoes={opcoes.dados.legislacoes} />
            <Seletor
              rotulo="Ensaio"
              valor={f.ensaio}
              aoMudar={set('ensaio')}
              todas="Todos"
              opcoes={opcoes.dados.ensaios.map((e) => ({ valor: String(e.id), rotulo: `${e.nome} (cód. ${e.codigo})` }))}
            />
            <Seletor rotulo="Classe" valor={f.classe} aoMudar={set('classe')} opcoes={opcoes.dados.classes} />
            <Seletor rotulo="Classificação" valor={f.categoria} aoMudar={set('categoria')} opcoes={opcoes.dados.categorias} />
          </Filtros>
        )}
      </Estado>

      <Aviso>
        Os limites importados não têm vigência informada na fonte. Enquanto ela não for confirmada, as comparações ficam como
        “Pendente de validação”, com a classificação indicativa ao lado.
      </Aviso>

      <Estado erro={lista.erro} carregando={lista.carregando}>
        {lista.dados && lista.dados.length === 0 ? (
          <SemDados titulo="Nenhum resultado laboratorial encontrado">
            A tabela RESULTADO está vazia ou nenhum resultado atende aos filtros. A análise passa a funcionar assim que amostras e
            resultados reais forem cadastrados.
          </SemDados>
        ) : (
          lista.dados && (
            <>
              <div className="grade">
                <Cartao titulo="Distribuição por classificação">
                  <div role="img" aria-label="Gráfico com a quantidade de resultados por classificação">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={porCategoria}>
                        <CartesianGrid stroke="#E8DACB" vertical={false} />
                        <XAxis dataKey="categoria" tick={eixo} interval={0} />
                        <YAxis tick={eixo} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="quantidade" name="Resultados" fill="#8B5E3C" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Cartao>
                <Cartao titulo="Classificação por ensaio (15 com mais resultados)" largura="larga">
                  <div role="img" aria-label="Gráfico de barras empilhadas com as classificações por ensaio">
                    <ResponsiveContainer width="100%" height={Math.max(220, porEnsaio.length * 28)}>
                      <BarChart data={porEnsaio} layout="vertical" margin={{ left: 10, right: 20 }}>
                        <CartesianGrid stroke="#E8DACB" horizontal={false} />
                        <XAxis type="number" tick={eixo} allowDecimals={false} />
                        <YAxis type="category" dataKey="ensaio" width={200} tick={eixo} />
                        <Tooltip />
                        <Legend />
                        {Object.entries(COR_CATEGORIA).map(([cat, cor]) => (
                          <Bar key={cat} dataKey={cat} stackId="a" fill={cor} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Cartao>
              </div>
              <Tabela legenda="Resultados comparados com limites" colunas={colunas} linhas={lista.dados} chaveLinha={(l) => l.id_resultado} />
            </>
          )
        )}
      </Estado>
    </Secao>
  );
}
