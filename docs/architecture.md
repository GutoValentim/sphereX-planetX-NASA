# Arquitetura — CosmoSPHERE

O CosmoSPHERE combina uma interface web, um gateway público e um núcleo científico Python para explorar observações reais do SPHEREx. Visão de produto, equipe e execução local no [README principal](../README.md); contratos em [api.md](api.md).

## Componentes

| Caminho | Responsabilidade |
|---|---|
| `frontend/` | React + TypeScript + Vite; mapa WebGL, formulário, visualizador temporal e espectros. O build é servido por `frontend/server.mjs` (Express) |
| `backend/app/api/` | API Node/Express: `server.ts` inicia `createApp()` de `resultados.ts`; valida consultas, encaminha ao Python, reescreve URLs e serve o catálogo por `catalogo.ts` |
| `backend/app/main.py` | FastAPI; validação, descoberta no IRSA e jobs científicos |
| `backend/app/services/` | IRSA, cutouts FITS, calibração espectral, alinhamento, renderização, fotometria e gerenciadores de jobs |
| `dev/temporal-lab/` | Laboratório com autenticação, motores científicos congelados por versão e exportação de alvos |
| `infra/` | Docker Compose, Traefik, deploy por SSH, healthchecks e rollback |
| `docs/` | Contrato da API, arquitetura, design system e PDF técnico |

```text
Navegador ─HTTPS─▶ Traefik ─┬─▶ frontend (Node :8080)
                          ├─▶ api (Node :3000) ─HTTP─▶ python (FastAPI :8000) ─HTTPS─▶ IRSA
                          │                     rede spherex_internal
                          └─▶ lab (Python :8765, autenticação) ─▶ motores v1, v2… ─HTTPS─▶ IRSA
                                           └─ exports/ ─somente leitura─▶ api /api/catalogo
```

## Fluxo de dados

1. O frontend transforma coordenadas ou a seleção do mapa em uma consulta transportada na URL do visualizador.
2. Um alvo pré-mapeado usa o catálogo exportado pelo laboratório. Partes ausentes, ou coordenadas novas, usam a API pública.
3. A API encaminha `/api/consulta` a `/receber-dados` no Python. Para imagens, a resposta contém metadados e `sequencia.status_url`; para espectro, `status_url` e o estado do job.
4. O serviço científico consulta metadados SIA2, seleciona observações com cobertura suficiente, baixa recortes FITS e processa imagens ou fotometria em segundo plano.
5. O frontend acompanha os jobs e exibe camadas/gráficos à medida que ficam prontos. A API reescreve caminhos internos sob `/api/sequencias/…` e `/api/espectros/…`.

Alinhamento espacial, calibração de comprimento de onda e cálculo de fluxo ocorrem no Python. A falsa cor e os WebPs são derivados de exibição; os FITS continuam sendo a fonte científica.

## Persistência e execução

Não há banco de dados nem fila externa. `SequenceJobManager` e `SpectrumJobManager` executam jobs em threads, em um processo; seus estados ficam em memória. Reiniciar o processo perde esses estados, mas preserva os arquivos em cache. Metadados, FITS, matrizes alinhadas, frames, fotometria e gráficos são reutilizados por identificadores derivados dos parâmetros.

O cache regenerável de produção fica em `/opt/docker/spherex/cache`. O acervo do laboratório fica em `/opt/docker/spherex/lab`, incluindo motores congelados, dados e exportações. Esse acervo exige preservação: reconstruí-lo depende de horas de downloads.

## Fronteiras de produção

Frontend, API, Python e laboratório usam containers separados. Traefik publica **frontend, API e laboratório** por HTTPS; o laboratório exige HTTP Basic. O Python não tem rota pública e é acessado pela API em `http://spherex-python:8000`. O volume de exportações é montado somente leitura na API (`SPHEREX_CATALOG_DIR=/catalog`).

A API pública não exige token nem aplica rate limiting. Seu CORS aceita a origem `FRONTEND_ORIGIN`. O cliente IRSA restringe downloads HTTPS ao host `irsa.ipac.caltech.edu`.

## CI/CD

O [workflow](../.github/workflows/ci-cd.yml) detecta os caminhos alterados e valida os projetos afetados. Pushes aprovados na `main` publicam os serviços correspondentes, verificam `/healthz` e voltam à release anterior se houver falha. Cada serviço informa seu próprio SHA; serviços não alterados podem permanecer em SHAs anteriores.

Mudanças apenas no README da raiz e em `docs/` não selecionam um serviço para deploy. Arquivos dentro de `frontend/` ou `backend/`, inclusive documentação, seguem os filtros desses diretórios. Operação detalhada em [infra/README.md](../infra/README.md).
