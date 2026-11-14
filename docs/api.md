# API

## Node (porta 3000)

- `GET /healthz`: `{ "status": "ok", "service": "spherex-api", "version": "<SHA>" }`.
- `GET /api/consulta?RA=215.341667&DEC=-23.55052&Data=2026-11-14`: consulta os dados com parâmetros na query string e exibe a resposta JSON no navegador. Os três parâmetros são obrigatórios.
- `POST /api/consulta`: encaminha o JSON para `PYTHON_API_URL/receber-dados`, preservando o status e o JSON recebidos.

Ambos os métodos encaminham a consulta para o serviço Python. Parâmetros GET inválidos retornam 400; enquanto o serviço Python não estiver configurado a rota retorna 503, 502 se ele estiver inacessível e 504 em timeout.

O frontend em produção também possui `GET /healthz` com `service: spherex-frontend` e o SHA da release. Esses endpoints indicam disponibilidade dos processos Node, sem afirmar que a análise científica ou o Python estão prontos.

## Python (próxima etapa)

Módulos reservados para implementação:

- `observations.py`: observações.
- `targets.py`: alvos.
- `frames.py`: frames.

Endpoints, contratos e exemplos serão definidos durante a implementação.
