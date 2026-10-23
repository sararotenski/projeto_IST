import { useState } from 'react';
import { useApi, dataBR } from '../api.js';
import { Aviso, CampoTexto, Estado, Etiqueta, Filtros, Secao, Seletor, SemDados, Tabela } from '../components/ui.jsx';

const vazio = { tipo: '', ensaio: '', legislacao: '', inicio: '', fim: '' };

const ROTULO_TIPO = {
  ACIMA_MAXIMO: 'Acima do máximo',
  ABAIXO_MINIMO: 'Abaixo do mínimo',
  RECORRENCIA: 'Recorrência fora do limite',
  PENDENTE_VALIDACAO: 'Pendente de validação',
};
const COR_TIPO = { ACIMA_MAXIMO: '#A0402A', ABAIXO_MINIMO: '#C68A2E', RECORRENCIA: '#3B2618', PENDENTE_VALIDACAO: '#9C8A78' };

const colunas = [
  { chave: 'tipo', titulo: 'Tipo', render: (l) => <Etiqueta cor={COR_TIPO[l.tipo]}>{ROTULO_TIPO[l.tipo] ?? l.tipo}</Etiqueta> },
  { chave: 'descricao', titulo: 'Descrição' },
  { chave: 'data_referencia', titulo: 'Data do resultado', render: (l) => dataBR(l.data_referencia) },
  { chave: 'id_resultado', titulo: 'Resultado', numerica: true },
  { chave: 'legislacao', titulo: 'Legislação', render: (l) => l.legislacao ?? '—' },
  { chave: 'registrado', titulo: 'Gravado em ALERTA', render: (l) => (l.registrado ? 'Sim' : 'Não (rode npm run alertas)') },
  { chave: 'requer_avaliacao_profissional', titulo: 'Avaliação profissional', ordenavel: false, render: () => 'Necessária' },
];

export default function Alertas() {
  const [f, setF] = useState(vazio);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const opcoes = useApi('filtros');
  const dados = useApi('alertas', f);

  return (
    <Secao titulo="Alertas" descricao="Situações que merecem atenção, calculadas por critérios explícitos. Todas exigem avaliação de um profissional.">
      <Aviso>
        Critérios: resultado acima do máximo ou abaixo do mínimo aplicável; dois resultados consecutivos fora do limite na mesma série;
        comparação impossível por falta de dados ou inconsistência. Variações dentro dos limites não geram alerta, pois não há limiar
        validado para isso.
      </Aviso>
      <Estado erro={opcoes.erro} carregando={opcoes.carregando}>
        {opcoes.dados && (
          <Filtros aoLimpar={() => setF(vazio)}>
            <Seletor
              rotulo="Categoria"
              valor={f.tipo}
              aoMudar={set('tipo')}
              opcoes={opcoes.dados.tiposAlerta.map((t) => ({ valor: t, rotulo: ROTULO_TIPO[t] }))}
            />
            <Seletor
              rotulo="Ensaio"
              valor={f.ensaio}
              aoMudar={set('ensaio')}
              todas="Todos"
              opcoes={opcoes.dados.ensaios.map((e) => ({ valor: String(e.id), rotulo: `${e.nome} (cód. ${e.codigo})` }))}
            />
            <Seletor rotulo="Legislação" valor={f.legislacao} aoMudar={set('legislacao')} opcoes={opcoes.dados.legislacoes} />
            <CampoTexto rotulo="De" tipo="date" valor={f.inicio} aoMudar={set('inicio')} />
            <CampoTexto rotulo="Até" tipo="date" valor={f.fim} aoMudar={set('fim')} />
          </Filtros>
        )}
      </Estado>
      <Estado erro={dados.erro} carregando={dados.carregando}>
        {dados.dados &&
          (dados.dados.calculados.length === 0 ? (
            <SemDados titulo="Nenhum alerta">Não há resultados laboratoriais cadastrados que gerem alertas com os filtros escolhidos.</SemDados>
          ) : (
            <Tabela legenda="Alertas calculados" colunas={colunas} linhas={dados.dados.calculados} chaveLinha={(l) => `${l.id_resultado}-${l.tipo}`} />
          ))}
      </Estado>
    </Secao>
  );
}
