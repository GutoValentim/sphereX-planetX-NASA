# SPHEREx Time Explorer

Projeto para o NASA Space Apps Challenge: Planet X e SPHEREx.

Estrutura inicial do projeto, organizada em frontend, backend e documentação.

- `frontend/`: páginas, componentes, hooks, serviços, tipos e utilitários.
- `backend/`: rotas, serviços, schemas, configuração e cache.
- `docs/`: arquitetura e documentação da API.

Requer Node.js 24. Execute `npm ci`, copie `.env.example` para `.env` e use `npm run dev` para a API Express (porta 3000). Em outro terminal, `npm run dev --workspace frontend` inicia o React/Vite (porta 5173).

`npm run lint`, `npm run typecheck`, `npm test` e `npm run build` são os checks do CI. Depois do build, `npm start` executa a API e `npm start --workspace frontend` serve a interface compilada (porta 8080).

A API publica `GET /healthz` e mantém `POST /api/consulta`. Enquanto `PYTHON_API_URL` não estiver configurada, a consulta responde 503; o serviço Python será integrado em uma próxima etapa. A interface inicial verifica a disponibilidade da API.

O deploy automático da `main` usa a VPS Oracle, Docker, Portainer e Traefik. Veja [infra/README.md](infra/README.md) para operação, DNS e rollback. O CI desta etapa cobre Node e frontend; a aplicação Python em desenvolvimento ainda não é executada pela pipeline.

Arquivos `.gitkeep` mantêm as pastas vazias versionadas no Git.
