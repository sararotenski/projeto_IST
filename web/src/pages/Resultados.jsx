import { useState } from 'react';
import { useApi, numero, dataBR } from '../api.js';
import { CampoTexto, COR_CATEGORIA, Estado, Etiqueta, Filtros, Secao, Seletor, SemDados, Tabela } from '../components/ui.jsx';

const vazio = { inicio: '', fim: '', legislacao: '', ensaio: '', categoria: '', ponto: '', busca: '' };

const faixa = (l) => {
  if (l.valor_minimo === null && l.valor_maximo === null) return '—';
  const min = l.valor_minimo !== null && Number(l.valor_minimo) > 0 ? `${numero(l.valor_minimo)} a ` : 'até ';
  return `${min}${numero(l.valor_maximo)} ${l.unidade_limite ?? ''}`;
};

const colunas = [
  { chave: 'data_resultado', titulo: 'Data', render: (l) => dataBR(l.data_resultado) },
  { chave: 'codigo_amostra', titulo: 'Amostra', render: (l) => l.codigo_amostra ?? l.id_amostra },
  { chave: 'ponto_coleta', titulo: 'Ponto', render: (l) => l.ponto_coleta ?? '—' },
  { chave: 'ensaio', titulo: 'Ensaio', render: (l) => <>{l.ensaio} <span className="codigo">{l.codigo_ensaio}</span></> },
  { chave: 'valor', titulo: 'Resultado', numerica: true, render: (l) => `${numero(l.valor)} ${l.unidade_resultado ?? ''}` },
  { chave: 'limite', titulo: 'Limite', ordenavel: false, render: faixa },
  {
    chave: 'percentual_do_maximo',
    titulo: '% do máximo',
    numerica: true,
    render: (l) => l.percentual_do_maximo === null ? '—' : (
      <><span className="medidor" aria-hidden="true"><span style={{ width: `${Math.min(100, Number(l.percentual_do_maximo))}%`, '--cor': COR_CATEGORIA[l.categoria] }} /></span>{numero(l.percentual_do_maximo)}%</>
    ),
  },
  { chave: 'categoria', titulo: 'Classificação', render: (l) => <Etiqueta cor={COR_CATEGORIA[l.categoria]} titulo={l.motivo_pendencia ?? undefined}>{l.categoria}</Etiqueta> },
  { chave: 'legislacao', titulo: 'Legislação', render: (l) => l.legislacao ?? l.motivo_pendencia ?? '—' },
];

export default function Resultados() {
  const [f, setF] = useState(vazio);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const op = useApi('opcoes');
  const lista = useApi('resultados', f);

  return (
    <Secao titulo="Resultados" descricao="Todos os resultados lançados, com o limite aplicado e a classificação automática. Fora do limite aparece em destaque.">
      <Estado erro={op.erro} carregando={op.carregando}>
        {op.dados && (
          <Filtros aoLimpar={() => setF(vazio)}>
            <CampoTexto rotulo="Amostra ou ensaio" valor={f.busca} aoMudar={set('busca')} placeholder="buscar…" />
            <Seletor rotulo="Classificação" valor={f.categoria} aoMudar={set('categoria')} opcoes={op.dados.categorias} />
            <Seletor rotulo="Ponto de coleta" valor={f.ponto} aoMudar={set('ponto')} todas="Todos" opcoes={op.dados.pontos} />
            <Seletor rotulo="Legislação" valor={f.legislacao} aoMudar={set('legislacao')} opcoes={op.dados.legislacoes.map((l) => l.nome)} />
            <Seletor rotulo="Ensaio" valor={f.ensaio} aoMudar={set('ensaio')} todas="Todos"
              opcoes={op.dados.todosEnsaios.map((e) => ({ valor: String(e.id), rotulo: `${e.nome} (${e.codigo})` }))} />
            <CampoTexto rotulo="De" tipo="date" valor={f.inicio} aoMudar={set('inicio')} pequeno />
            <CampoTexto rotulo="Até" tipo="date" valor={f.fim} aoMudar={set('fim')} pequeno />
          </Filtros>
        )}
      </Estado>
      <Estado erro={lista.erro} carregando={lista.carregando}>
        {lista.dados && (lista.dados.length ? (
          <Tabela legenda="Resultados" colunas={colunas} linhas={lista.dados} chaveLinha={(l) => l.id_resultado} />
        ) : (
          <SemDados titulo="Nenhum resultado encontrado">Ajuste os filtros ou lance resultados em <a href="#lancar">Lançar resultados</a>.</SemDados>
        ))}
      </Estado>
    </Secao>
  );
}
