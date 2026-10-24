import { useState } from 'react';
import { useApi, numero, dataBR } from '../api.js';
import { CampoTexto, Estado, Filtros, Secao, Seletor, SemDados, Tabela } from '../components/ui.jsx';

const vazio = { legislacao: '', origem: '', busca: '' };

const colunas = [
  { chave: 'parametro', titulo: 'Parâmetro' },
  { chave: 'legislacao', titulo: 'Legislação' },
  { chave: 'origem_amostra', titulo: 'Origem da amostra' },
  { chave: 'classe', titulo: 'Classe' },
  {
    chave: 'faixa',
    titulo: 'Limite',
    ordenavel: false,
    render: (l) => `${Number(l.valor_minimo) > 0 ? `${numero(l.valor_minimo)} a ` : 'até '}${numero(l.valor_maximo)} ${l.unidade_medida ?? ''}`,
  },
  { chave: 'codigos', titulo: 'Códigos do laboratório', ordenavel: false, render: (l) => l.codigos.map((c) => <span key={c} className="codigo">{c}</span>) },
  { chave: 'data_inicio_vigencia', titulo: 'Vigente desde', render: (l) => dataBR(l.data_inicio_vigencia) },
  { chave: 'observacao', titulo: 'Observação', ordenavel: false, render: (l) => <span className="nota">{l.observacao ?? '—'}</span> },
];

export default function Limites() {
  const [f, setF] = useState(vazio);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const op = useApi('opcoes');
  const lista = useApi('limites', f);
  const totalCodigos = (lista.dados ?? []).reduce((s, l) => s + l.qtd_codigos, 0);

  return (
    <Secao titulo="Limites legais"
      descricao="Valores máximos e mínimos permitidos, já tratados. Códigos do laboratório com o mesmo parâmetro e o mesmo limite aparecem agrupados em uma única linha.">
      <Estado erro={op.erro} carregando={op.carregando}>
        {op.dados && (
          <Filtros aoLimpar={() => setF(vazio)}>
            <CampoTexto rotulo="Parâmetro ou código" valor={f.busca} aoMudar={set('busca')} placeholder="ex.: Ferro" />
            <Seletor rotulo="Legislação" valor={f.legislacao} aoMudar={set('legislacao')} opcoes={op.dados.legislacoes.map((l) => l.nome)} />
            <Seletor rotulo="Origem da amostra" valor={f.origem} aoMudar={set('origem')} opcoes={op.dados.origens} />
          </Filtros>
        )}
      </Estado>
      <Estado erro={lista.erro} carregando={lista.carregando}>
        {lista.dados && (lista.dados.length ? (
          <>
            <p className="nota">{lista.dados.length} parâmetros, que reúnem {totalCodigos} registros de limite ativos.</p>
            <Tabela legenda="Limites por parâmetro" colunas={colunas} linhas={lista.dados}
              chaveLinha={(l) => `${l.legislacao}|${l.origem_amostra}|${l.classe}|${l.parametro}|${l.valor_maximo}|${l.unidade_medida}`} />
          </>
        ) : (
          <SemDados>Nenhum limite com esses filtros.</SemDados>
        ))}
      </Estado>
    </Secao>
  );
}
