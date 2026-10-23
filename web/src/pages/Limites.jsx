import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApi, numero } from '../api.js';
import { Aviso, CampoTexto, Cartao, Estado, Etiqueta, Filtros, PALETA, Secao, Seletor, SemDados, Tabela } from '../components/ui.jsx';

const eixo = { fill: '#5C3D2E', fontSize: 12 };
const vazio = { legislacao: '', origem: '', classe: '', validacao: '', busca: '' };

const colunas = [
  { chave: 'codigo_ensaio', titulo: 'Código', numerica: true },
  { chave: 'ensaio', titulo: 'Ensaio' },
  { chave: 'legislacao', titulo: 'Legislação' },
  { chave: 'origem_amostra', titulo: 'Origem da amostra' },
  { chave: 'classe', titulo: 'Classe', render: (l) => l.classe ?? 'Sem classe' },
  { chave: 'valor_minimo', titulo: 'Mínimo', numerica: true, render: (l) => numero(l.valor_minimo) },
  { chave: 'valor_maximo', titulo: 'Máximo', numerica: true, render: (l) => numero(l.valor_maximo) },
  { chave: 'unidade_medida', titulo: 'Unidade', render: (l) => l.unidade_medida ?? 'não informada' },
  { chave: 'tipo_limite', titulo: 'Tipo' },
  {
    chave: 'requer_validacao',
    titulo: 'Situação',
    render: (l) => (l.requer_validacao ? <Etiqueta cor="#C68A2E">{l.observacao_validacao ?? 'Revisar'}</Etiqueta> : <Etiqueta cor="#6B7B3A">Conforme fonte</Etiqueta>),
  },
  { chave: 'arquivo_origem', titulo: 'Fonte', render: (l) => `${l.arquivo_origem} (linha ${l.linhas_origem})` },
];

export default function Limites() {
  const [f, setF] = useState(vazio);
  const [ensaioComparado, setEnsaioComparado] = useState('');
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const opcoes = useApi('filtros');
  const lista = useApi('limites', f);
  const comparacao = useApi(ensaioComparado ? 'limites' : null, { ensaio: ensaioComparado });

  const porUnidade = useMemo(() => {
    const m = new Map();
    for (const l of lista.dados ?? []) {
      const u = l.unidade_medida ?? 'não informada';
      m.set(u, (m.get(u) ?? 0) + 1);
    }
    return [...m.entries()].map(([unidade, limites]) => ({ unidade, limites })).sort((a, b) => b.limites - a.limites);
  }, [lista.dados]);

  return (
    <Secao titulo="Limites legais" descricao="Limites importados das listas de ensaios por legislação, com a linha de origem de cada registro.">
      <Estado erro={opcoes.erro} carregando={opcoes.carregando}>
        {opcoes.dados && (
          <Filtros aoLimpar={() => setF(vazio)}>
            <Seletor rotulo="Legislação" valor={f.legislacao} aoMudar={set('legislacao')} opcoes={opcoes.dados.legislacoes} />
            <Seletor rotulo="Origem da amostra" valor={f.origem} aoMudar={set('origem')} opcoes={opcoes.dados.origens} />
            <Seletor rotulo="Classe" valor={f.classe} aoMudar={set('classe')} opcoes={['(sem classe)', ...opcoes.dados.classes]} />
            <Seletor
              rotulo="Situação"
              valor={f.validacao}
              aoMudar={set('validacao')}
              opcoes={[{ valor: 'sim', rotulo: 'Requer validação' }, { valor: 'nao', rotulo: 'Conforme fonte' }]}
            />
            <CampoTexto rotulo="Ensaio ou código" valor={f.busca} aoMudar={set('busca')} placeholder="ex.: Chumbo" />
          </Filtros>
        )}
      </Estado>

      <div className="grade">
        <Cartao titulo="Limites por unidade de medida">
          <Estado erro={lista.erro} carregando={lista.carregando}>
            {porUnidade.length ? (
              <div role="img" aria-label="Gráfico de barras com a quantidade de limites por unidade de medida">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={porUnidade} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid stroke="#E8DACB" horizontal={false} />
                    <XAxis type="number" tick={eixo} allowDecimals={false} />
                    <YAxis type="category" dataKey="unidade" width={130} tick={eixo} />
                    <Tooltip />
                    <Bar dataKey="limites" name="Limites" fill={PALETA[0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <SemDados>Nenhum limite com os filtros escolhidos.</SemDados>
            )}
          </Estado>
        </Cartao>

        <Cartao titulo="Comparar um ensaio entre origens e legislações">
          <Estado erro={opcoes.erro} carregando={opcoes.carregando}>
            {opcoes.dados && (
              <Seletor
                rotulo="Ensaio"
                valor={ensaioComparado}
                aoMudar={setEnsaioComparado}
                todas="Selecione um ensaio"
                opcoes={opcoes.dados.ensaios.map((e) => ({ valor: String(e.id), rotulo: `${e.nome} (cód. ${e.codigo})` }))}
              />
            )}
          </Estado>
          {ensaioComparado ? <Comparacao estado={comparacao} /> : <SemDados titulo="Escolha um ensaio">O gráfico mostra o máximo permitido em cada origem.</SemDados>}
        </Cartao>
      </div>

      <Estado erro={lista.erro} carregando={lista.carregando}>
        {lista.dados && <Tabela legenda="Limites legais" colunas={colunas} linhas={lista.dados} chaveLinha={(l) => l.id_limite} />}
      </Estado>
    </Secao>
  );
}

function Comparacao({ estado }) {
  if (estado.erro || estado.carregando) return <Estado erro={estado.erro} carregando={estado.carregando} />;
  const linhas = estado.dados ?? [];
  if (!linhas.length) return <SemDados>Sem limites para este ensaio.</SemDados>;
  const unidades = [...new Set(linhas.map((l) => l.unidade_medida ?? 'não informada'))];
  const dados = linhas.map((l) => ({
    nome: `${l.origem_amostra}${l.classe ? ` · ${l.classe}` : ''}`,
    legislacao: l.legislacao,
    Mínimo: Number(l.valor_minimo),
    Máximo: Number(l.valor_maximo),
  }));
  return (
    <>
      {unidades.length > 1 && <Aviso tipo="atencao">Unidades diferentes ({unidades.join(', ')}): os valores não são diretamente comparáveis.</Aviso>}
      <div role="img" aria-label="Gráfico comparando mínimo e máximo do ensaio em cada origem">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={dados}>
            <CartesianGrid stroke="#E8DACB" vertical={false} />
            <XAxis dataKey="nome" tick={eixo} interval={0} />
            <YAxis tick={eixo} label={{ value: unidades.join(' / '), angle: -90, position: 'insideLeft', fill: '#5C3D2E' }} />
            <Tooltip formatter={(v) => numero(v)} labelFormatter={(n, p) => `${n} — ${p?.[0]?.payload?.legislacao ?? ''}`} />
            <Legend />
            <Bar dataKey="Mínimo" fill={PALETA[3]} />
            <Bar dataKey="Máximo" fill={PALETA[0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
