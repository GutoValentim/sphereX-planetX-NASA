# Arquitetura

Estrutura do SPHEREx Time Explorer:

- `frontend/`: interface em TypeScript/TSX, com configuração reservada para Vite.
- `backend/app/api/`: API Express/TypeScript, healthcheck e gateway de consultas.
- `backend/`: módulos Python em desenvolvimento; publicação em etapa posterior.
- `infra/`: stack de produção e deploy via SSH, com build em imagem oficial Node.
- `docs/`: documentação da arquitetura e da API.

O frontend React/Vite e a API Node rodam em containers separados na rede `web`. O Traefik existente resolve os hosts configurados nas labels e emite TLS após os apontamentos DNS. O gateway usa `PYTHON_API_URL` para encaminhar consultas ao serviço Python quando ele estiver disponível.

PRs validam lint, tipos, testes e build. Pushes na `main` que passam no CI publicam o SHA aprovado, verificam `/healthz` nos dois serviços e restauram a release anterior se a nova falhar. Consulte `infra/README.md` para operação.
