# API

## Node (porta 3000)

- `GET /healthz`: `{ "status": "ok", "service": "spherex-api", "version": "<SHA>" }`.
- `GET /api/consulta?RA=215.341667&DEC=-23.55052&Data=2026-11-14`: consulta usando parâmetros na query string, para abrir diretamente no navegador. `RA`, `DEC` e `Data` são obrigatórios; parâmetros ausentes ou inválidos retornam 400.
- `POST /api/consulta`: encaminha o JSON para `PYTHON_API_URL/receber-dados`, preservando o status e o JSON recebidos.

Ambos os métodos de consulta encaminham a requisição ao serviço Python. Retornam 503 enquanto ele não estiver configurado, 502 se estiver inacessível e 504 em timeout.

O frontend em produção também possui `GET /healthz` com `service: spherex-frontend` e o SHA da release. Esses endpoints indicam disponibilidade dos processos Node, sem afirmar que a análise científica ou o Python estão prontos.

## Python (próxima etapa)

Módulos reservados para implementação:

- `observations.py`: observações.
- `targets.py`: alvos.
- `frames.py`: frames.

Endpoints, contratos e exemplos serão definidos durante a implementação.
