# API

## Node (porta 3000)

- `GET /healthz`: `{ "status": "ok", "service": "spherex-api", "version": "<SHA>" }`.
- `GET /api/consulta?RA=215.341667&DEC=-23.55052&Data=2026-11-14`: consulta os dados com parâmetros na query string e exibe a resposta JSON no navegador. Os três parâmetros são obrigatórios.
- `POST /api/consulta`: encaminha o JSON para `PYTHON_API_URL/receber-dados`, preservando o status e o JSON recebidos.

Ambos os métodos encaminham a consulta para o serviço Python e repassam o status e o JSON recebidos. Parâmetros GET inválidos retornam 400; sem `PYTHON_API_URL` a rota retorna 503, 502 se o Python estiver inacessível e 504 em timeout (30 s).

O frontend em produção também possui `GET /healthz` com `service: spherex-frontend` e o SHA da release. Esses endpoints indicam disponibilidade dos processos Node, sem afirmar que a análise científica ou o Python estão prontos.

## Python (FastAPI, porta 8000, somente rede interna)

Não é publicado na internet; apenas a API Node o chama.

- `GET /healthz`: `{ "status": "ok", "service": "spherex-python", "version": "<SHA>" }`.
- `POST /receber-dados` com `{ "RA": 133.79513, "DEC": -7.24515, "Data": "2026-11-14" }`: consulta o SIA2 do IRSA (`spherex_dr1` e `spherex_qr3`) e devolve as observações SPHEREx da banda D3 que cobrem a janela de 45′ em torno de RA/Dec, ordenadas por data. Só metadados: nenhum FITS é baixado. O resultado fica em cache (`SPHEREX_CACHE_DIR`), então repetir a coordenada responde sem nova chamada ao IRSA (`cache_hit: true`). `Data` é devolvida em `consulta`, mas ainda não filtra a busca.

Resposta (resumida):

```json
{
  "consulta": { "RA": 133.79513, "DEC": -7.24515, "Data": "2026-11-14" },
  "request_id": "3f2a…",
  "bandpass": "SPHEREx-D3",
  "collections": ["spherex_dr1", "spherex_qr3"],
  "source_observation_count": 120,
  "band_observation_count": 20,
  "frame_count": 12,
  "observations": [{ "observation_id": "…", "observed_at": "2025-…", "access_url": "https://irsa.ipac.caltech.edu/…" }],
  "discovered_at": "2026-11-15T…",
  "cache_hit": false
}
```

Erros (sempre `{ "erro": "…" }`): 400 parâmetros inválidos (com `detalhes`), 404 nenhuma observação cobre a região, 422 mais observações que o limite da sequência, 502 falha ao consultar o IRSA.

Local: `cd backend && pip install -r requirements-dev.txt && uvicorn app.main:app --port 8000 --reload`, com `PYTHON_API_URL=http://localhost:8000` no `.env` da raiz.
