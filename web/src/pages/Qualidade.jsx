import { useState } from 'react';
import { useApi } from '../api.js';
import { Aviso, Estado, Etiqueta, Filtros, Secao, Seletor, SemDados, Tabela } from '../components/ui.jsx';

const TIPOS = {
  LIMITE_CONFLITANTE: 'Limite conflitante (não importado)',
  FAIXA_INCONSISTENTE: 'Mínimo maior que máximo (não importado)',
  LINHA_INVALIDA: 'Linha inválida (não importada)',
  COMPRIMENTO_EXCEDIDO: 'Texto longo demais (não importado)',
  ENSAIO_NOME_DIVERGENTE: 'Código com nomes diferentes (não importado)',
  MAXIMO_ZERO: 'Máximo igual a zero',
  UNIDADE_AUSENTE: 'Unidade não informada',
  CLASSE_GRAFIA: 'Possível erro de grafia na classe',
  VIGENCIA_NAO_INFORMADA: 'Vigência não informada',
  NOME_EM_CODIGOS_DIFERENTES: 'Mesmo nome em códigos diferentes',
  DUPLICATA_EXATA: 'Linhas duplicadas consolidadas',
  ENSAIO_DIVERGENTE_BANCO: 'Ensaio diverge do banco',
  LIMITE_DIVERGENTE_BANCO: 'Limite diverge do banco',
};

const colunas = [
  { chave: 'tipo', titulo: 'Tipo', render: (l) => <Etiqueta cor={l.importado ? '#C68A2E' : '#A0402A'}>{TIPOS[l.tipo] ?? l.tipo}</Etiqueta> },
  { chave: 'descricao', titulo: 'Descrição' },
  { chave: 'arquivo_origem', titulo: 'Arquivo', render: (l) => l.arquivo_origem ?? '—' },
  { chave: 'linhas_origem', titulo: 'Linhas', render: (l) => l.linhas_origem ?? '—' },
  { chave: 'importado', titulo: 'Importado?', render: (l) => (l.importado ? 'Sim, com ressalva' : 'Não') },
];

export default function Qualidade() {
  const [tipo, setTipo] = useState('');
  const dados = useApi('pendencias', { tipo });

  return (
    <Secao
      titulo="Qualidade dos dados"
      descricao="Informações ambíguas ou conflitantes encontradas na importação. Nada foi escolhido ou corrigido automaticamente."
    >
      <Aviso>
        Itens em vermelho ficaram fora do banco até que alguém confirme o valor correto no texto oficial da legislação. Itens em ocre
        foram importados e estão marcados para validação.
      </Aviso>
      <Filtros>
        <Seletor rotulo="Tipo de pendência" valor={tipo} aoMudar={setTipo} todas="Todos" opcoes={Object.entries(TIPOS).map(([valor, rotulo]) => ({ valor, rotulo }))} />
      </Filtros>
      <Estado erro={dados.erro} carregando={dados.carregando}>
        {dados.dados &&
          (dados.dados.length ? (
            <Tabela legenda="Pendências para revisão humana" colunas={colunas} linhas={dados.dados} chaveLinha={(l) => l.id_pendencia} />
          ) : (
            <SemDados>Nenhuma pendência deste tipo.</SemDados>
          ))}
      </Estado>
    </Secao>
  );
}
