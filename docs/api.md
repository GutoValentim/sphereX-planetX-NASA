# API

## Node (porta 3000)

- `GET /healthz`: `{ "status": "ok", "service": "spherex-api", "version": "<SHA>" }`.
- `GET /api/consulta?RA=215.341667&DEC=-23.55052&Data=2026-11-14`: consulta os dados com parâmetros na query string e exibe a resposta JSON no navegador. Os três parâmetros são obrigatórios.
- `POST /api/consulta`: encaminha o JSON para `PYTHON_API_URL/receber-dados`, preservando o status e o JSON recebidos.
- Parâmetros opcionais (GET na query, POST no JSON):
  - `elemento`: `imagem` (padrão, resposta de sempre) ou `espectro`.
  - `bandas`: só para espectro; `D1,D3` na query (ou lista no JSON). Padrão: D1–D6.
  - `tema`: `escuro` (padrão) ou `claro`, para os gráficos.
- `GET /api/espectros/<job_id>`: progresso do espectro e, ao concluir, URLs dos gráficos e pontos medidos.
- `GET /api/espectros/arquivos/<id>/spectrum/<arquivo>.svg`: gráfico SVG (nome com hash do conteúdo; cache imutável).

Exemplo de espectro:

```
GET /api/consulta?RA=133.68146&DEC=-7.29895&Data=2026-11-15&elemento=espectro&bandas=D1,D3
→ 202 { "elemento": "espectro", "status_url": "/api/espectros/75b74ca95298b93b", "job": { "status": "running", "progress": { "SPHEREx-D1": { "done": 3, "total": 35 } } } }

GET /api/espectros/75b74ca95298b93b   (repetir a cada ~1–2 s enquanto status = "running")
→ 200 { "status": "completed", "result": {
        "combined_chart_url": "/api/espectros/arquivos/…/spectrum/combined-dark-….svg",
        "bands": [ { "bandpass": "SPHEREx-D1", "chart_url": "/api/espectros/arquivos/…svg",
                     "band": { "wavelength_min_um": 0.744, "wavelength_max_um": 1.116, "display_rgb": [117, 0, 255] },
                     "measured_count": 35, "observation_count": 35, "outliers": [], "rejected": {}, "failed": {},
                     "points": [ { "wavelength_um": 0.75, "flux_mjy": 361.2, "flux_error_mjy": 4.1, "observed_at": "…" } ] } ] } }
```

As URLs dos SVGs já vêm com o prefixo público `/api` e podem ir direto em `<img src>`.
Uma coordenada nova leva ~1–2 min (uma medição por observação, ~250 nas 6 bandas);
repetir a mesma coordenada responde do cache em milissegundos.

Ambos os métodos encaminham a consulta para o serviço Python e repassam o status e o JSON recebidos. Parâmetros GET inválidos retornam 400; sem `PYTHON_API_URL` a rota retorna 503, 502 se o Python estiver inacessível e 504 em timeout (30 s).

O frontend em produção também possui `GET /healthz` com `service: spherex-frontend` e o SHA da release. Esses endpoints indicam disponibilidade dos processos Node, sem afirmar que a análise científica ou o Python estão prontos.

## Python (FastAPI, porta 8000, somente rede interna)

Não é publicado na internet; apenas a API Node o chama.

- `GET /healthz`: `{ "status": "ok", "service": "spherex-python", "version": "<SHA>" }`.
- `POST /receber-dados` com `elemento: "espectro"` (e opcionalmente `bandas`, `tema`): inicia o espectro em segundo plano e responde 202 com `status_url: "/espectros/<job_id>"`; bandas inválidas → 400.
- `GET /espectros/<job_id>` e `GET /espectros/arquivos/<id>/spectrum/<arquivo>.svg`: progresso/resultado e SVGs. A API Node expõe os mesmos caminhos sob `/api/espectros/…` e reescreve as URLs.
- Espectro: fotometria forçada multi-época (abertura 3 px, fundo local, λ do `WCS-WAVE` no pixel do alvo, erro da `VARIANCE`), recortes de 4′ baixados só até a `VARIANCE`, tabela `WCS-WAVE` em cache por calibração de detector. Detalhes em `backend/README.md`.
- `POST /receber-dados` com `{ "RA": 133.79513, "DEC": -7.24515, "Data": "2026-11-14" }` (sem `elemento`, ou `elemento: "imagem"`): consulta o SIA2 do IRSA (`spherex_dr1` e `spherex_qr3`) e devolve as observações SPHEREx da banda D3 que cobrem a janela de 45′ em torno de RA/Dec, ordenadas por data. Só metadados: nenhum FITS é baixado. O resultado fica em cache (`SPHEREX_CACHE_DIR`), então repetir a coordenada responde sem nova chamada ao IRSA (`cache_hit: true`). `Data` é devolvida em `consulta`, mas ainda não filtra a busca.

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
