import { useApi, numero, dataBR } from '../api.js';
import { Aviso, Cartao, COR, Estado, Etiqueta, Kpi, Secao, Tabela } from '../components/ui.jsx';

const ACAO = {
  definir_limite: 'Valor definido',
  confirmar_limite: 'Valor confirmado',
  inativar_limite: 'Limite desativado',
  definir_unidade: 'Unidade definida',
  renomear_classe: 'Grafia corrigida',
  definir_vigencia: 'Vigência definida',
  resolver_informativo: 'Repetições tratadas',
};

export default function Dados() {
  const { dados, erro, carregando } = useApi('qualidade');
  return (
    <Secao titulo="Dados e curadoria" descricao="Como os limites dos arquivos do laboratório foram tratados: repetições, valores conflitantes, unidades, vigência e grafia. Cada decisão cita a fonte oficial e guarda o valor anterior.">
      <Estado erro={erro} carregando={carregando}>
        {dados && (
          <>
            <div className="kpis">
              <Kpi rotulo="Parâmetros distintos" valor={numero(dados.contagens.parametros)} detalhe={`${dados.contagens.ativos} registros ativos`} cor={COR.neon} />
              <Kpi rotulo="Decisões aplicadas" valor={numero(dados.contagens.decisoes)} detalhe="com fonte oficial" cor={COR.ok} />
              <Kpi rotulo="Ressalvas resolvidas" valor={`${numero(dados.contagens.pendencias - dados.contagens.abertas)} de ${numero(dados.contagens.pendencias)}`} detalhe={`${dados.contagens.abertas} em aberto`} cor={dados.contagens.abertas ? COR.abaixo : COR.ok} />
              <Kpi rotulo="Limites desativados" valor={numero(dados.contagens.inativos)} detalhe="sem VMP na legislação" cor={COR.neutro} />
            </div>
            {dados.contagens.abertas === 0 ? (
              <Aviso tipo="ok">Nenhuma ressalva em aberto. Todos os limites ativos têm valor, unidade e início de vigência definidos.</Aviso>
            ) : (
              <Aviso tipo="atencao">{dados.contagens.abertas} ressalva(s) ainda em aberto, listadas abaixo.</Aviso>
            )}
            <Tabela legenda="Decisões de curadoria" chaveLinha={(d) => d.chave} linhas={dados.decisoes} porPagina={30}
              colunas={[
                { chave: 'tipo', titulo: 'Ação', render: (d) => <Etiqueta cor={d.tipo === 'inativar_limite' ? COR.neutro : COR.neon}>{ACAO[d.tipo] ?? d.tipo}</Etiqueta> },
                { chave: 'descricao', titulo: 'Decisão' },
                { chave: 'fonte', titulo: 'Fonte', render: (d) => <span className="nota">{d.fonte}</span> },
                { chave: 'aplicada_em', titulo: 'Aplicada em', render: (d) => dataBR(d.aplicada_em) },
              ]} />
            <div className="grade">
              <Cartao titulo="Limites desativados">
                <ul>
                  {dados.inativos.map((l) => (
                    <li key={`${l.codigo_ensaio}-${l.origem_amostra}`}>
                      <strong>{l.ensaio}</strong> <span className="codigo">{l.codigo_ensaio}</span> · {l.origem_amostra} · {l.legislacao}
                      <div className="nota">{l.motivo_inativacao}</div>
                    </li>
                  ))}
                </ul>
              </Cartao>
              <Cartao titulo="Ressalvas da importação, por tipo">
                <Tabela legenda="Ressalvas" chaveLinha={(t) => t.tipo} linhas={dados.porTipo}
                  colunas={[
                    { chave: 'tipo', titulo: 'Tipo' },
                    { chave: 'total', titulo: 'Total', numerica: true },
                    { chave: 'resolvidas', titulo: 'Resolvidas', numerica: true },
                  ]} />
              </Cartao>
            </div>
            {dados.abertas.length > 0 && (
              <Tabela legenda="Ressalvas em aberto" chaveLinha={(p, i) => `${p.tipo}-${p.arquivo_origem}-${p.linhas_origem}-${i}`} linhas={dados.abertas}
                colunas={[{ chave: 'tipo', titulo: 'Tipo' }, { chave: 'descricao', titulo: 'Descrição' }, { chave: 'arquivo_origem', titulo: 'Arquivo' }, { chave: 'linhas_origem', titulo: 'Linhas' }]} />
            )}
          </>
        )}
      </Estado>
    </Secao>
  );
}
