# Frontend — CosmoSPHERE

Interface React + TypeScript, construída com Vite. Permite explorar coordenadas ou o mapa do céu, comparar imagens SPHEREx entre épocas e consultar espectros. O processamento científico ocorre no backend; o frontend acompanha os jobs da API e exibe os resultados.

## Páginas

| Rota | Página | Função |
|---|---|---|
| `/` | `Home` | Apresentação, instruções e equipe T.A.R.S. |
| `/explore` | `ExploreTheSky` | Formulário de coordenadas e alvos pré-mapeados |
| `/explore-map` | `ExploreMap` | Esfera do céu WebGL e seleção de posições |
| `/viewer` | `SeeTheSky` | Imagens, linha do tempo, bandas e espectro |

A consulta é transportada nos parâmetros de `/viewer`: `ra`, `dec`, `band`, `date`, `target` e `entry`. As rotas são definidas em [`src/routes/paths.ts`](src/routes/paths.ts).

## Organização e fluxo de dados

- `src/pages/` e `src/components/`: páginas e componentes; `ObservationWorkspace` coordena as fontes, abas e modos do visualizador.
- `src/services/api.ts`: consultas à API Node; imagens usam `modo=balanceada`, todas as bandas e uma banda de referência. Jobs são acompanhados até terminarem.
- `src/services/catalog.ts` e `src/hooks/useCatalog.ts`: catálogo e manifestos exportados pelo laboratório; um alvo já mapeado usa esses artefatos, com consulta ao vivo para as partes ausentes.
- `src/hooks/`: formulário, linha do tempo, seleção de bandas, espectro e polling. A consulta ativa fica na URL; tema em Context; histórico e preferência de tema em `localStorage`.
- `src/components/sky-map/`: esfera WebGL e marcadores. `integrations/aladin.ts` e `integrations/plotly.ts` carregam bibliotecas sob demanda.
- `src/constants/homeContent.ts`: apresentação e integrantes da equipe. `src/constants/uiFeatures.ts`: flags da interface.
- CSS Modules e `src/styles/`: estilos. Consulte o [design system](../docs/DESIGN_SYSTEM.md).

O visualizador combina camadas em falsa cor com `mix-blend-mode: screen`. A imagem DSS2/Aladin é uma referência óptica, separada dos dados SPHEREx. A galeria de espectros usa SVGs do backend; Plotly é uma alternativa controlada por flag.

## Comandos

Na raiz do repositório, com Node.js 24 e dependências instaladas por `npm ci`:

```sh
npm run dev --workspace frontend       # Vite, http://localhost:5173
npm run typecheck --workspace frontend
npm run build --workspace frontend    # frontend/dist/
node --test frontend/tests/*.test.mjs
```

Depois do build, o servidor usado em produção pode ser iniciado com:

```sh
node frontend/server.mjs              # Express, http://localhost:8080
```

Esse servidor implementa fallback de SPA, arquivos estáticos e `GET /healthz`. O Vite de desenvolvimento não implementa esse healthcheck. Não há script `start` no `frontend/package.json` atual. Para a aplicação completa, inicie também API Node e Python conforme o [README principal](../README.md#rodar-localmente).

## Configuração

| Variável | Uso |
|---|---|
| `VITE_API_BASE_URL` | Base da API Node, padrão `http://localhost:3000` |
| `VITE_CATALOG_URL` | URL do catálogo; padrão `/api/catalogo` na API. Valor vazio desativa os alvos pré-mapeados |

As variáveis `VITE_*` são lidas no build/desenvolvimento: defina-as no ambiente do processo ou em `frontend/.env.local`. O `vite.config.ts` atual não configura a raiz do repositório como `envDir`, portanto o `.env` da raiz não é a fonte dessas variáveis para o Vite. O CORS da API deve aceitar a origem usada pelo navegador (`FRONTEND_ORIGIN`).

## Referências e limites

- [Contrato da API](../docs/api.md), [arquitetura](../docs/architecture.md) e [documentação técnica em inglês (PDF)](../docs/cosmosphere-technical-documentation-en.pdf).
- [Especificação inicial](../docs/Sky_Explorer_Documentacao_Frontend.md): planejamento histórico; a implementação atual é descrita aqui e no código.
- Os testes existentes cobrem o servidor Express; não há suíte de componentes/hooks.
- A home inclui um exemplo de espectro explicitamente identificado como ilustrativo; os resultados científicos do visualizador vêm do IRSA ou das exportações do laboratório.
