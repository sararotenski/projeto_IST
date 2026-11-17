import { useMemo, useState } from 'react';
import { useApi, numero, dataBR, ePresencaAusencia, faixaLimite, nomeCurto, valorResultado } from '../api.js';
import { CampoTexto, COR, COR_CATEGORIA, Estado, Etiqueta, Filtros, Secao, Seletor, SemDados, Tabela } from '../components/ui.jsx';

const vazio = { inicio: '', fim: '', legislacao: '', ensaio: '', categoria: '', ponto: '', busca: '' };

const CURTO = {
  'Dentro dos limites': '✓ Dentro',
  'Acima do limite máximo': '▲ Acima',
  'Abaixo do limite mínimo': '▼ Abaixo',
  Inconclusivo: '? Inconclusivo',
  'Pendente de validação': 'Pendente',
};

/** Classificação do resultado em uma portaria específica. */
function CelulaPortaria({ p }) {
  if (!p || p.categoria === 'Sem limite aplicável identificado') return <span className="nota">não se aplica</span>;
  return (
    <div>
      <Etiqueta cor={COR_CATEGORIA[p.categoria]} titulo={p.motivo ?? undefined}>{CURTO[p.categoria] ?? p.categoria}</Etiqueta>
      <div className="nota">{faixaLimite(p.minimo, p.maximo, p.unidade)}</div>
    </div>
  );
}

export default function Resultados() {
  const [f, setF] = useState(vazio);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const op = useApi('opcoes');
  const lista = useApi('resultados', f);

  const colunas = useMemo(() => {
    const portarias = (op.dados?.legislacoes ?? []).map((l) => ({
      chave: `portaria:${l.nome}`,
      titulo: nomeCurto(l.nome),
      valorOrdem: (r) => r.portarias?.[l.nome]?.categoria ?? 'z',
      render: (r) => <CelulaPortaria p={r.portarias?.[l.nome]} />,
    }));
    return [
      { chave: 'data_resultado', titulo: 'Data', render: (l) => dataBR(l.data_resultado) },
      { chave: 'codigo_amostra', titulo: 'Amostra', render: (l) => l.codigo_amostra ?? l.id_amostra },
      { chave: 'ensaio', titulo: 'Ensaio', render: (l) => <>{l.ensaio} <span className="codigo">{l.codigo_ensaio}</span></> },
      { chave: 'valor', titulo: 'Resultado', numerica: true, render: (l) => valorResultado(l) },
      ...portarias,
      {
        chave: 'categoria',
        titulo: 'Geral',
        render: (l) => <Etiqueta cor={COR_CATEGORIA[l.categoria]} titulo={l.motivo_inconclusivo ?? l.motivo_pendencia ?? undefined}>{l.categoria}</Etiqueta>,
      },
      {
        chave: 'percentual_do_maximo',
        titulo: '% do máximo',
        numerica: true,
        render: (l) => (l.percentual_do_maximo === null || ePresencaAusencia(l.unidade_limite) ? '—' : (
          <><span className="medidor" aria-hidden="true"><span style={{ width: `${Math.min(100, Number(l.percentual_do_maximo))}%`, '--cor': COR_CATEGORIA[l.categoria] }} /></span>{l.qualificador ?? ''}{numero(l.percentual_do_maximo)}%</>
        )),
      },
    ];
  }, [op.dados]);

  const fora = (lista.dados ?? []).filter((l) => l.categoria === 'Acima do limite máximo' || l.categoria === 'Abaixo do limite mínimo').length;

  return (
    <Secao titulo="Resultados"
      descricao="Cada resultado é comparado com cada portaria que tem limite para o ensaio. A coluna Geral mostra a classificação mais grave entre as portarias.">
      <Estado erro={op.erro} carregando={op.carregando}>
        {op.dados && (
          <Filtros aoLimpar={() => setF(vazio)}>
            <CampoTexto rotulo="Amostra ou ensaio" valor={f.busca} aoMudar={set('busca')} placeholder="buscar…" />
            <Seletor rotulo="Classificação geral" valor={f.categoria} aoMudar={set('categoria')} opcoes={op.dados.categorias} />
            <Seletor rotulo="Com limite na portaria" valor={f.legislacao} aoMudar={set('legislacao')} todas="Qualquer"
              opcoes={op.dados.legislacoes.map((l) => ({ valor: l.nome, rotulo: nomeCurto(l.nome) }))} />
            <Seletor rotulo="Ensaio" valor={f.ensaio} aoMudar={set('ensaio')} todas="Todos"
              opcoes={op.dados.todosEnsaios.map((e) => ({ valor: String(e.id), rotulo: `${e.nome} (${e.codigo})` }))} />
            {op.dados.pontos.length > 0 && (
              <Seletor rotulo="Ponto de coleta" valor={f.ponto} aoMudar={set('ponto')} todas="Todos" opcoes={op.dados.pontos} />
            )}
            <CampoTexto rotulo="De" tipo="date" valor={f.inicio} aoMudar={set('inicio')} pequeno />
            <CampoTexto rotulo="Até" tipo="date" valor={f.fim} aoMudar={set('fim')} pequeno />
          </Filtros>
        )}
      </Estado>
      <Estado erro={lista.erro} carregando={lista.carregando}>
        {lista.dados && (lista.dados.length ? (
          <>
            <p className="nota">
              {lista.dados.length} resultado(s) · <span style={{ color: COR.acima }}>{fora} fora do limite</span>. Passe o mouse sobre uma classificação para ver o motivo.
            </p>
            <Tabela legenda="Resultados" colunas={colunas} linhas={lista.dados} chaveLinha={(l) => l.id_resultado} />
          </>
        ) : (
          <SemDados titulo="Nenhum resultado encontrado">Ajuste os filtros ou lance resultados em <a href="#lancar">Lançar resultados</a>.</SemDados>
        ))}
      </Estado>
    </Secao>
  );
}
