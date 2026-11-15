# AGENTS.md

Guia para agentes de IA (Claude Code, Codex, Cursor etc.) que trabalham neste
repositório. Vale para humanos também. Detalhes ficam nos READMEs citados; este
arquivo resume o que é preciso saber antes de mudar algo.

## Projeto

SPHEREx Time Explorer — NASA Space Apps Challenge (Planet X / SPHEREx). Mostra
como um ponto do céu muda ao longo das épocas observadas pelo SPHEREx (imagens
alinhadas em falsa cor) e mede o espectro do alvo nas bandas D1–D6.

Documentação e textos do projeto são em português; código, nomes de símbolos e
mensagens de commit em inglês (Conventional Commits: `feat:`, `fix(frontend):`…).

## Arquitetura (produção)

```
Navegador ─HTTPS─▶ Traefik ─┬─▶ frontend (Node :8080)            rede web
                            └─▶ api (Node :3000) ─HTTP─▶ python (FastAPI :8000) ─HTTPS─▶ IRSA
                                                  rede interna spherex_internal
```

- Frontend React/Vite: <https://spherex.prospectordigital.com.br>
- API Node/Express (gateway público): <https://api.spherex.prospectordigital.com.br>
- FastAPI (`backend/app/main.py`): só na rede interna (`http://spherex-python:8000`);
  cache gravável em `/opt/docker/spherex/cache`.
- VPS Oracle ARM64, Docker, Portainer, Traefik. Deploy automático em todo push na
  `main` (GitHub Actions). **Merge na `main` = publicação em produção.**

Mais em `docs/architecture.md` e `infra/README.md`.

## Mapa do repositório

| Caminho | O que é |
|---|---|
| `frontend/` | React 19 + Vite + TypeScript (workspace npm). `src/services/api.ts` fala com a API; `server.mjs` serve o build e o `/healthz`. |
| `backend/app/api/*.ts` | API Node/Express: `server.ts`, `consulta.ts` (encaminha ao Python), `resultados.ts` (jobs de espectro/sequência e arquivos). |
| `backend/app/main.py` | FastAPI: `/receber-dados`, `/espectros/…`, `/sequencias/…`, `/healthz`. |
| `backend/app/services/` | Núcleo científico: `irsa_client`, `image_aligner`, `frame_generator` (perfis de renderização), `spectral_color`, `temporal_sequence_service`, `sequence_jobs`, `spectrum_service`, `spectrum_jobs`, `spectrum_chart`, `cutout_cache`. |
| `backend/tests/` | `api.test.ts` (Node) e `test_*.py` (Python). |
| `infra/` | `compose.yaml`, `deploy.sh`, `ssh-deploy.sh`, testes de deploy. |
| `dev/temporal-lab/` | Laboratório local (não publicado) para presets de renderização, FOV e espectro. |
| `prototypes/` | Protótipos isolados (ex.: `sky-sphere`). |
| `docs/` | `api.md` (contratos), `architecture.md`, `DESIGN_SYSTEM.md`, doc do frontend. |

Classificação usada pelo CI e pelo deploy: `backend/*.py` e
`backend/requirements*.txt` → serviço Python; resto de `backend/` → API Node;
`frontend/` → frontend; `infra/` → stack inteira; `package.json`,
`package-lock.json`, `eslint.config.mjs` → API e frontend. Arquivos fora disso
(como este) não disparam deploy.

## Contrato principal (detalhes em `docs/api.md`)

- `GET /api/consulta?RA&DEC&Data[&elemento=imagem|espectro][&bandas=D1,D3][&tema=escuro|claro]`
  (também `POST` com JSON).
  - `imagem` (padrão): metadados das observações + `sequencia` (job em
    `/api/sequencias/<id>`; frames WebP alinhados por época e banda, em falsa
    cor, que aparecem conforme ficam prontos).
  - `espectro`: job em `/api/espectros/<id>`; pontos medidos + gráficos SVG.
- Erros sempre `{ "erro": "…" }`. Sem `PYTHON_API_URL` a API responde 503; 502
  se o Python estiver inacessível; 504 em timeout.

Ciência que não é óbvia pelo código:

- O espectro é fotometria forçada multi-época: o filtro do SPHEREx varia ao
  longo do detector (`WCS-WAVE`), então cada observação mede o alvo em um único λ.
- Recortes são baixados parcialmente (só até `IMAGE` ou `VARIANCE`; a tabela
  EPSF de ~4 MB é pulada). A tabela `WCS-WAVE` fica em cache por
  (detector, `[CALIB] spectral_wcs` uuid) em `<cache>/calibration`.
- Todas as épocas usam a mesma grade TAN (6,15″/px) e o mesmo intervalo de
  exibição; normalizar épocas separadamente cria falsa variação de brilho.
- A falsa cor é só representação; o FITS continua sendo a fonte científica.

## Rodar localmente

Node 24 e Python 3.11+.

```sh
npm ci
cp .env.example .env                      # PYTHON_API_URL=http://localhost:8000
npm run dev                               # API Express :3000
npm run dev --workspace frontend          # Vite :5173
cd backend && pip install -r requirements-dev.txt && uvicorn app.main:app --port 8000 --reload
```

Laboratório (a porta 8765 costuma estar ocupada; use outra e reaproveite o cache):

```sh
SPHEREX_LAB_CACHE_DIR="<cache do lab>" <venv>/bin/python dev/temporal-lab/server.py --port 8766
```

## Validação antes de PR (mesmos passos do CI)

```sh
npx eslint backend frontend dev
npx tsc --noEmit -p backend/tsconfig.json
npx tsx --test backend/tests/*.test.ts
node --test frontend/tests/*.test.mjs
npm run typecheck --workspace frontend
npm run build --workspace frontend
python3 -m unittest discover -s infra/tests
cd backend && <venv>/bin/python -m unittest discover -s tests -p 'test_*.py'
```

## Regras e armadilhas

- **Commit, PR e merge só quando o mantenedor pedir.** O merge na `main` publica
  em produção; confira os `/healthz` depois (cada serviço informa o próprio SHA,
  e um serviço não alterado continua no SHA anterior — isso é esperado).
- `infra/deploy.sh` e `infra/ssh-deploy.sh` são instalados como root na VPS e o
  CI **não** os atualiza. Se mudarem, instale via SSH administrativo antes do
  merge (comando em `infra/README.md`).
- Conflitos em `package-lock.json`: nunca resolver à mão; rode `npm install` na raiz.
- `infra/tests` precisam rodar no bash 3.2 do macOS (sem `declare -A` nem `${x^^}`).
- Docker local pode falhar com o keychain do macOS travado; teste containers em
  containers descartáveis na VPS.
- IRSA às vezes responde 503: os jobs repetem, mas uma camada pode terminar
  `failed`. Não trate isso como bug do código sem reproduzir.
- Limitações conhecidas: movimento próprio não é propagado (alvos rápidos como
  WISE 0855 saem da abertura); `FLAGS` não usadas por falta da tabela oficial de
  bits; espectro sem correção de abertura.
- Downloads só de `https://irsa.ipac.caltech.edu`. Prefira cutouts e poucos
  arquivos ao experimentar.
- Nunca versione `.env`, `api.env` ou chaves (`~/.ssh/spherex_github_actions_ed25519`).
- Ao mudar contrato da API, atualize `docs/api.md` no mesmo PR.
