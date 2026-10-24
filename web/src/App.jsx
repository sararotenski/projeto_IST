import { useEffect, useState } from 'react';
import { useApi } from './api.js';
import { Aviso } from './components/ui.jsx';
import Painel from './pages/Painel.jsx';
import Resultados from './pages/Resultados.jsx';
import Tendencias from './pages/Tendencias.jsx';
import Lancar from './pages/Lancar.jsx';
import Limites from './pages/Limites.jsx';
import Dados from './pages/Dados.jsx';

const PAGINAS = [
  { id: 'painel', titulo: 'Painel', Componente: Painel },
  { id: 'resultados', titulo: 'Resultados', Componente: Resultados },
  { id: 'tendencias', titulo: 'Tendências', Componente: Tendencias },
  { id: 'lancar', titulo: 'Lançar resultados', Componente: Lancar },
  { id: 'limites', titulo: 'Limites legais', Componente: Limites },
  { id: 'dados', titulo: 'Dados e curadoria', Componente: Dados },
];

const lerHash = () => {
  const [id, ...resto] = window.location.hash.replace('#', '').split('/');
  return { pagina: PAGINAS.some((p) => p.id === id) ? id : PAGINAS[0].id, parametro: resto.length ? decodeURIComponent(resto.join('/')) : null };
};

export default function App() {
  const [rota, setRota] = useState(lerHash);
  const saude = useApi('saude');

  useEffect(() => {
    const aoMudar = () => setRota(lerHash());
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);

  const atual = PAGINAS.find((p) => p.id === rota.pagina);
  const { Componente } = atual;
  const estadoConexao = saude.carregando ? '' : saude.erro ? 'erro' : 'ok';

  return (
    <>
      <a className="pular" href="#conteudo">Pular para o conteúdo</a>
      <header className="topo">
        <div>
          <h1>Ensaios Ambientais <span>·</span> IST</h1>
          <p>Comparação automática de resultados com os limites legais e acompanhamento de tendências</p>
        </div>
        <p className={`conexao ${estadoConexao}`} role="status">
          {saude.carregando ? 'Verificando conexão…' : saude.erro ? 'Sem conexão com o banco' : `Banco ${saude.dados.banco}`}
        </p>
      </header>
      <nav className="abas" aria-label="Seções">
        <ul>
          {PAGINAS.map((p) => (
            <li key={p.id}>
              <a href={`#${p.id}`} aria-current={p.id === rota.pagina ? 'page' : undefined}>{p.titulo}</a>
            </li>
          ))}
        </ul>
      </nav>
      <main id="conteudo" tabIndex={-1}>
        {saude.erro && <Aviso tipo="erro">{saude.erro}</Aviso>}
        {saude.dados && (!saude.dados.views_ok || !saude.dados.migracao_ok) && (
          <Aviso tipo="erro">Estrutura do banco incompleta. Rode: npm run migrar -- --confirmar</Aviso>
        )}
        <Componente key={atual.id} parametro={rota.parametro} />
      </main>
      <footer className="rodape">
        Ferramenta de apoio à análise técnica. Não substitui a avaliação de um profissional nem emite conclusões regulatórias.
      </footer>
    </>
  );
}
