# Arquitetura

Estrutura do SPHEREx Time Explorer:

- `frontend/`: interface em TypeScript/TSX, com configuração reservada para Vite.
- `backend/app/api/`: API Express/TypeScript, healthcheck e gateway de consultas.
- `backend/app/main.py`: serviço FastAPI que expõe o núcleo científico Python (IRSA, FITS, WCS) para a API Node.
- `infra/`: stack de produção e deploy via SSH, com build em imagens oficiais Node e Python.
- `docs/`: documentação da arquitetura e da API.

```
Navegador ─HTTPS─▶ Traefik ─┬─▶ frontend (Node :8080)            rede web
                            └─▶ api (Node :3000) ─HTTP─▶ python (FastAPI :8000) ─HTTPS─▶ IRSA
                                                  rede interna spherex_internal
```

O frontend React/Vite, a API Node e o serviço Python rodam em containers separados. O Traefik existente resolve os hosts configurados nas labels e emite TLS após os apontamentos DNS. Apenas frontend e API são publicados; o container Python fica somente na rede interna do projeto (com saída para a internet, para consultar o IRSA) e é acessado pela API em `http://spherex-python:8000`, definido em `PYTHON_API_URL`.

PRs validam lint, tipos, testes e build. Pushes na `main` que passam no CI publicam o SHA aprovado, verificam `/healthz` em cada serviço publicado e restauram a release anterior se a nova falhar. Consulte `infra/README.md` para operação.
