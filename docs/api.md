# API — CosmoSPHERE

A API pública Node/Express encaminha consultas ao serviço científico FastAPI, acompanha jobs e serve os artefatos. Referências: [README](../README.md), [backend científico](../backend/README.md), [frontend](../frontend/README.md) e [documentação técnica completa em inglês (PDF)](cosmosphere-technical-documentation-en.pdf).

## Endereços e convenções

| Item | Valor |
|---|---|
| Base em produção | `https://api.spherex.prospectordigital.com.br` |
| Base local | `http://localhost:3000` |
| Formato | JSON UTF-8; imagens `image/webp` e gráficos `image/svg+xml` |
| Autenticação pública | Sem token; laboratório tem HTTP Basic próprio |
| CORS | Origem única em `FRONTEND_ORIGIN`; métodos `GET`, `POST`, `OPTIONS` |
| Corpo JSON | Limite de 1 MB |
| Timeout Node → Python | 30 s por chamada; processamento longo continua em jobs consultáveis |

O Python não é publicado na internet. A API reescreve URLs `/sequencias/…` e `/espectros/…` com o prefixo público `/api`. `status_url` é relativo à base da API; URLs de arquivos já podem ser usadas pela interface após resolver essa base.

### Saúde

`GET /healthz`:

```json
{ "status": "ok", "service": "spherex-api", "version": "<SHA da release>" }
```

O servidor Express do frontend e o Python têm o mesmo endpoint, com `service` igual a `spherex-frontend` e `spherex-python`, respectivamente. O healthcheck informa que o processo está disponível; não garante cobertura científica ou disponibilidade do IRSA. O Vite de desenvolvimento não implementa esse endpoint.

## Consulta

- `GET /api/consulta`: parâmetros na query string.
- `POST /api/consulta`: parâmetros no corpo JSON; `bandas` como lista. O corpo é encaminhado ao Python.

| Parâmetro | Obrigatório | Valores e efeito |
|---|---|---|
| `RA` | Sim | Graus ICRS; `0 ≤ RA < 360` |
| `DEC` | Sim | Graus ICRS; `−90 ≤ DEC ≤ 90` |
| `Data` | No GET | Data válida no GET (`YYYY-MM-DD` recomendado); opcional no POST. É devolvida em `consulta`, mas **não filtra** a descoberta |
| `elemento` | Não | `imagem` (padrão) ou `espectro` |
| `bandas` | Não | Bandas das imagens **ou** do espectro: `D1,D3` na query; `["D1", "D3"]` no JSON. Aceita prefixo `SPHEREx-`; padrão D1–D6 |
| `tema` | Não | Espectro: `escuro` (padrão) ou `claro` |
| `modo` | Não | Imagens: `rapida` (padrão, até 4 épocas), `balanceada` (até 12), `completa` (todas, limite de segurança 100) |
| `perfil` | Não | Imagens: `limpa` (padrão), `original`, `suave`, `difusa`, `pontual` |
| `cor` | Não | Imagens: `falsa` (padrão) ou `mono` |
| `referencia` | Não | Imagens: banda que ancora as épocas; padrão `D3` |

O frontend atual pede imagens em modo `balanceada`, com as seis bandas; uma banda selecionada define a referência, e `P` usa D3. Bandas inválidas e opções não suportadas retornam 400.

### Imagens: metadados e job

```text
GET /api/consulta?RA=133.79513&DEC=-7.24515&Data=2026-11-15&elemento=imagem&bandas=D1,D3&modo=balanceada
```

Resposta 200, resumida e ilustrativa:

```json
{
  "consulta": { "RA": 133.79513, "DEC": -7.24515, "Data": "2026-11-15" },
  "request_id": "3f2a9c1b0d4e5f60",
  "bandpass": "SPHEREx-D3",
  "collections": ["spherex_dr1", "spherex_qr3"],
  "fov_arcmin": 30.0,
  "cutout_fov_arcmin": 45.0,
  "pixel_scale_arcsec": 6.15,
  "observations": [
    { "observation_id": "…", "observed_at": "2025-…", "access_url": "https://irsa.ipac.caltech.edu/…" }
  ],
  "cache_hit": false,
  "sequencia": {
    "status_url": "/api/sequencias/9b1c2d3e4f5a6b7c",
    "job": { "job_id": "9b1c2d3e4f5a6b7c", "status": "discovering" }
  }
}
```

A descoberta síncrona fornece os metadados D3 das observações cujas pegadas contêm o recorte-fonte de 45′. A sequência multibanda baixa e renderiza os FITS em segundo plano. O cache de metadados evita repetir a consulta SIA2 para o mesmo dataset; a resposta inicial não espera todos os frames ficarem prontos.

### Espectro: iniciar ou recuperar job

```text
GET /api/consulta?RA=133.68146&DEC=-7.29895&Data=2026-11-15&elemento=espectro&bandas=D1,D3
```

Retorna 202 enquanto o job está `running`, ou 200 se a mesma consulta já terminou:

```json
{
  "elemento": "espectro",
  "status_url": "/api/espectros/75b74ca95298b93b",
  "job": {
    "job_id": "75b74ca95298b93b",
    "status": "running",
    "progress": { "SPHEREx-D1": { "done": 3, "total": 35 } }
  }
}
```

## Sequências de imagens

### `GET /api/sequencias/<job_id>`

`job_id` tem 16 caracteres hexadecimais. Estados: `discovering` → `rendering` → `completed`, `partial` ou `failed`. `partial` indica que pelo menos uma camada continuou com erro após as retentativas.

Resposta resumida e ilustrativa:

```json
{
  "job_id": "9b1c2d3e4f5a6b7c",
  "status": "rendering",
  "anchor_bandpass": "SPHEREx-D3",
  "frames": [
    {
      "id": "2025W46_2A_0214_1",
      "observed_at": "2025-11-14T12:07:21.418",
      "layers": [
        {
          "bandpass": "SPHEREx-D3",
          "delta_seconds": 0.0,
          "image_url": "/api/sequencias/arquivos/3f2a9c1b0d4e5f60/frames/limpa-color/001_2025W46_2A_0214_1.webp?v=8",
          "error": null
        }
      ]
    }
  ],
  "progress": { "done": 7, "total": 24 },
  "error": null
}
```

Consulte aproximadamente a cada 1,5 s enquanto o job estiver em andamento. Cada `image_url` fica `null` até a camada estar pronta; erros aparecem por camada e banda. `delta_seconds` informa a distância temporal à época de referência: as bandas podem ter sido observadas em instantes diferentes.

### `GET /api/sequencias/arquivos/<dataset>/frames/<variante>/<arquivo>.webp`

Frames alinhados, norte para cima, por padrão 293×293 pixels: RGBA em falsa cor ou L em monocromático. A variante usa `<perfil>-color` ou `<perfil>-mono`. `Cache-Control: public, max-age=86400`; `?v=<FRAME_CACHE_VERSION>` invalida versões antigas. Caminhos fora do padrão retornam 404.

## Espectros

### `GET /api/espectros/<job_id>`

Estados: `running` → `completed` ou `failed`. Consulte aproximadamente a cada 1,5 s até o estado final.

Resposta concluída, resumida e ilustrativa:

```json
{
  "job_id": "75b74ca95298b93b",
  "status": "completed",
  "result": {
    "combined_chart_url": "/api/espectros/arquivos/0a1b2c3d4e5f6a7b/spectrum/combined-dark-example.svg",
    "bands": [
      {
        "bandpass": "SPHEREx-D1",
        "chart_url": "/api/espectros/arquivos/0a1b2c3d4e5f6a7b/spectrum/band-dark-example.svg",
        "band": { "wavelength_min_um": 0.744, "wavelength_max_um": 1.116, "display_rgb": [0, 17, 255] },
        "measured_count": 35,
        "observation_count": 35,
        "outliers": [],
        "rejected": {},
        "failed": {},
        "points": [ { "wavelength_um": 0.75, "flux_mjy": 361.2, "flux_error_mjy": 4.1, "observed_at": "…" } ],
        "channels": [ { "wavelength_um": 0.76, "flux_mjy": 358.0 } ]
      }
    ]
  },
  "error": null
}
```

- `points`: medições por observação, incluindo λ, fluxo e incerteza.
- `channels`: medianas em até 17 canais por banda, espaçados em log λ.
- `outliers`: pontos sinalizados, mostrados vazados e excluídos das medianas.
- `rejected`: observações descartadas por motivo científico.
- `failed`: falhas de rede nesta execução, que podem ser tentadas novamente.

O espectro usa fotometria forçada com abertura de 3 px e fundo local, λ do `WCS-WAVE` no alvo e incertezas da `VARIANCE`. Os cutouts de 4′ são baixados apenas até `VARIANCE`, e a calibração `WCS-WAVE` é reutilizada por detector/versão. Uma coordenada nova pode levar minutos; cache e disponibilidade do IRSA afetam a duração. Limitações científicas no [backend](../backend/README.md#espectro-spectrum_service-spectrum_chart).

### `GET /api/espectros/arquivos/<id>/spectrum/<arquivo>.svg`

Gráficos por banda e combinado, nos temas claro e escuro, prontos para `<img src>`. Os nomes contêm hash do conteúdo: `Cache-Control: public, max-age=31536000, immutable`.

## Catálogo de alvos pré-mapeados

Somente leitura, servido das exportações do laboratório montadas em `SPHEREX_CATALOG_DIR` (produção: `/opt/docker/spherex/lab/exports` → `/catalog:ro`). Sem a variável, responde 503.

- `GET /api/catalogo/index.json`: lista de alvos com esquema `spherex-catalog/1`, nomes, coordenadas, slug, manifesto, sequências, temas, data de exportação e motor. Ordenada por nome; `max-age=30`.
- `GET /api/catalogo/<slug>/manifest.json`: manifesto `spherex-lab-target/1`. `sequences[].frames[].layers[]` segue o formato das sequências; `spectrum.dark|light` segue o formato dos espectros. URLs relativas à pasta do alvo; `max-age=60`.
- `GET /api/catalogo/<slug>/<caminho>`: arquivos `.webp`, `.svg` e `.json` do mesmo motor do manifesto; caminhos fora do padrão retornam 404. Imagens usam `max-age=86400`.

Para cada alvo, vale o motor mais novo com exportação 100% completa: seis bandas em todas as sequências e espectros nos dois temas. Se nenhum está completo, vale a exportação do motor mais antigo. Assim, um motor novo não substitui um alvo completo por resultados parciais.

O frontend usa `/api/catalogo` por padrão; `VITE_CATALOG_URL` permite sobrescrever ou, se vazio, desativar. O laboratório está documentado em [dev/temporal-lab/README.md](../dev/temporal-lab/README.md).

## Erros

Sempre em JSON `{ "erro": "…" }`; validações do FastAPI incluem `detalhes`.

| Status | Situação |
|---|---|
| 400 | Entrada inválida ou identificador de job malformado |
| 404 | Sem cobertura, job inexistente ou arquivo ausente/inválido |
| 422 | Observações acima do limite de segurança da sequência |
| 502 | IRSA indisponível, Python inacessível ou resposta inválida do Python |
| 503 | `PYTHON_API_URL` ou catálogo não configurado |
| 504 | Timeout de 30 s na comunicação com Python |

Jobs também podem terminar em estado de falha com detalhes na resposta de status. O laboratório usa autenticação separada; 401/403 não são respostas de autenticação da API pública.

## Serviço Python interno

Local: `http://localhost:8000`. Produção: `http://spherex-python:8000`, somente na rede Docker.

- `POST /receber-dados`: valida a consulta e retorna metadados + job de imagens, ou job de espectro.
- `GET /sequencias/<job_id>` e `GET /sequencias/arquivos/…`: estado e WebPs.
- `GET /espectros/<job_id>` e `GET /espectros/arquivos/…`: estado e SVGs.
- `GET /healthz`: processo e SHA do serviço científico.

Execução local e variáveis no [README principal](../README.md#rodar-localmente). O campo `Data` é metadado de referência e não é aplicado como filtro temporal na descoberta.
