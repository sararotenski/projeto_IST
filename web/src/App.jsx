import { useEffect, useState } from 'react';
import { useApi } from './api.js';
import { Aviso } from './components/ui.jsx';
import VisaoGeral from './pages/VisaoGeral.jsx';
import Limites from './pages/Limites.jsx';
import Conformidade from './pages/Conformidade.jsx';
import Historico from './pages/Historico.jsx';
import Alertas from './pages/Alertas.jsx';
import Qualidade from './pages/Qualidade.jsx';

const PAGINAS = [
  { id: 'visao-geral', titulo: 'Visão geral', Componente: VisaoGeral },
  { id: 'limites', titulo: 'Limites legais', Componente: Limites },
  { id: 'conformidade', titulo: 'Conformidade', Componente: Conformidade },
  { id: 'historico', titulo: 'Histórico', Componente: Historico },
  { id: 'alertas', titulo: 'Alertas', Componente: Alertas },
  { id: 'qualidade', titulo: 'Qualidade dos dados', Componente: Qualidade },
];

const paginaDaUrl = () => {
  const id = window.location.hash.replace('#', '');
  return PAGINAS.some((p) => p.id === id) ? id : PAGINAS[0].id;
};

export default function App() {
  const [pagina, setPagina] = useState(paginaDaUrl);
  const saude = useApi('saude');

  useEffect(() => {
    const aoMudar = () => setPagina(paginaDaUrl());
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);

  const atual = PAGINAS.find((p) => p.id === pagina);
  const { Componente } = atual;

  return (
    <div className="app">
      <a className="pular" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="topo">
        <div className="marca">
          <span className="marca-sigla" aria-hidden="true">IST</span>
          <div>
            <h1>Ensaios Ambientais</h1>
            <p>Apoio à análise de conformidade com limites legais</p>
          </div>
        </div>
        <p className="conexao" role="status">
          {saude.carregando ? 'Verificando conexão…' : saude.erro ? 'Sem conexão com o banco' : `Conectado ao banco ${saude.dados.banco}`}
        </p>
      </header>

      <nav className="abas" aria-label="Seções do dashboard">
        <ul>
          {PAGINAS.map((p) => (
            <li key={p.id}>
              <a href={`#${p.id}`} aria-current={p.id === pagina ? 'page' : undefined}>
                {p.titulo}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main id="conteudo" tabIndex={-1}>
        {saude.erro && <Aviso tipo="erro">{saude.erro}</Aviso>}
        {saude.dados && !saude.dados.views_ok && (
          <Aviso tipo="erro">As views de análise não existem no banco. Rode: npm run migrar -- --confirmar</Aviso>
        )}
        <Componente key={atual.id} />
      </main>

      <footer className="rodape">
        Ferramenta de apoio à análise técnica. Não substitui a interpretação profissional nem emite conclusões regulatórias.
      </footer>
    </div>
  );
}
