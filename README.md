# SPHEREx Time Explorer

Projeto para o NASA Space Apps Challenge: Planet X e SPHEREx.

Estrutura inicial do projeto, organizada em frontend, backend e documentação.

- `frontend/`: páginas, componentes, hooks, serviços, tipos e utilitários.
- `backend/`: rotas, serviços, schemas, configuração e cache.
- `docs/`: arquitetura e documentação da API.
- `dev/temporal-lab/`: laboratório de mapeamento (https://lab.spherex.prospectordigital.com.br,
  com senha): guarda FITS, imagens e espectros por versão do motor e exporta para o produto.

Requer Node.js 24. Execute `npm ci`, copie `.env.example` para `.env` e use `npm run dev` para a API Express (porta 3000). Em outro terminal, `npm run dev --workspace frontend` inicia o React/Vite (porta 5173).

`npm run lint`, `npm run typecheck`, `npm test` e `npm run build` são comandos locais agregados; no CI, as validações aparecem separadas por projeto. Depois do build, `npm start` executa a API e `npm start --workspace frontend` serve a interface compilada (porta 8080).

A API publica `GET /healthz`, `GET /api/consulta` com parâmetros `RA`, `DEC` e `Data` na query string, e `POST /api/consulta` com JSON. Os dois métodos de consulta encaminham a requisição ao serviço FastAPI (`backend/app/main.py`), que consulta o IRSA e devolve as observações encontradas; sem `PYTHON_API_URL`, respondem 503. Para rodar o Python localmente: `cd backend && pip install -r requirements-dev.txt && uvicorn app.main:app --port 8000 --reload`. Com `elemento=espectro`, a mesma rota devolve um job cujo resultado traz gráficos SVG do espectro D1–D6 (`/api/espectros/…`). Contratos em [docs/api.md](docs/api.md).

O deploy automático da `main` usa a VPS Oracle, Docker, Portainer e Traefik. Veja [infra/README.md](infra/README.md) para operação, DNS e rollback. O CI valida separadamente backend Node, backend científico Python, frontend, laboratório e infraestrutura. O laboratório é publicado como serviço próprio (`lab`).

Arquivos `.gitkeep` mantêm as pastas vazias versionadas no Git.
