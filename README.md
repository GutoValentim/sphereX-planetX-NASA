# CosmoSPHERE

**SPHEREx Explorex**

**T.A.R.S. — Team for Advanced Research of Space**

Uberlândia, Minas Gerais, Brasil

Uma aplicação para explorar observações reais da missão SPHEREx por coordenadas celestes, comparar imagens entre épocas e visualizar o espectro de um alvo nas bandas D1–D6. Desenvolvida para o **NASA Space Apps Challenge**, no desafio **Planet X and SPHEREx**. É um projeto independente da equipe, não um produto oficial da NASA.

**[Acessar o CosmoSPHERE](https://spherex.prospectordigital.com.br)** · **[Documentação técnica completa em inglês (PDF)](docs/cosmosphere-technical-documentation-en.pdf)** · **[Repositório público](https://github.com/GutoValentim/sphereX-planetX-NASA)**

## O que o projeto faz

- **Exploração por coordenadas ou mapa do céu:** informe ascensão reta e declinação, ou selecione uma posição na esfera interativa.
- **Comparação temporal:** imagens reprojetadas para a mesma grade celeste, com norte para cima, alvo centralizado e uma linha do tempo com reprodução.
- **Visualização multibanda:** sobreposição das bandas D1–D6 em falsa cor e opção monocromática.
- **Espectro do alvo:** fotometria forçada em diferentes observações, com pontos, incertezas e gráficos por banda e combinados.
- **Alvos pré-mapeados:** o laboratório prepara imagens e espectros, versiona o motor científico e exporta um catálogo para a aplicação.
- **Referência óptica:** o DSS2 colorido, exibido pelo Aladin Lite, ajuda a localizar o campo; essa imagem de referência não é um dado SPHEREx.

O fluxo principal é: **escolher uma posição → abrir o visualizador → comparar épocas/bandas ou consultar o espectro**. Consultas novas dependem da cobertura e da disponibilidade do arquivo IRSA e podem levar minutos; resultados já processados são reaproveitados do cache.

## Um pouco da ciência

A [missão SPHEREx, da NASA](https://science.nasa.gov/mission/spherex/), realiza um levantamento espectral do céu no infravermelho próximo, aproximadamente de **0,75 a 5,0 µm**. O projeto consulta os dados públicos do [NASA/IPAC IRSA](https://irsa.ipac.caltech.edu/Missions/spherex.html), nas coleções `spherex_dr1` e `spherex_qr3`.

O filtro variável linear (**LVF**) faz o comprimento de onda medido variar ao longo de cada detector. Por isso, uma exposição mede o alvo em um comprimento de onda por banda; o espectro é montado reunindo as medições das diferentes visitas. O backend usa os FITS científicos, a calibração `WCS-WAVE` e, na fotometria, a extensão `VARIANCE` para estimar as incertezas.

Para comparar imagens, todas as épocas são reprojetadas com WCS/SIP para uma grade TAN comum de **6,15″ por pixel**, mantendo o mesmo intervalo de exibição em cada variante. A falsa cor converte o infravermelho para cores visíveis em escala logarítmica: **é uma representação de comprimento de onda, não a cor visível real do objeto**. O FITS permanece como fonte científica.

**Limites importantes:** diferenças entre épocas também podem refletir o comprimento de onda amostrado pelo LVF e a PSF; a escala comum não elimina esses efeitos. A fotometria ainda não propaga movimento próprio, não aplica correção de abertura e não usa a máscara `FLAGS`. Bandas são pareadas pela observação mais próxima no tempo, com `delta_seconds` informado; a composição pode reunir instantes diferentes. O campo `Data` é aceito pela API, mas **ainda não filtra a descoberta de observações**. O projeto não afirma detectar ou confirmar o Planeta X.

## Fontes de dados e créditos

| Fonte oficial ou serviço de referência | O que o CosmoSPHERE utiliza |
|---|---|
| [NASA — missão SPHEREx](https://science.nasa.gov/mission/spherex/) | Contexto da missão, objetivos científicos e instrumento |
| [NASA/IPAC IRSA — SPHEREx](https://irsa.ipac.caltech.edu/Missions/spherex.html) | Observações e produtos FITS públicos das coleções `spherex_dr1` e `spherex_qr3` |
| [IRSA — interfaces programáticas](https://irsa.ipac.caltech.edu/voapi.html) | Descoberta SIA2 por `astroquery` e acesso IBE aos arquivos/recortes FITS |
| [IRSA — Explanatory Supplement do Quick Release](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHEREx_Expsupp_QR.pdf) | Referência dos produtos científicos, extensões FITS, calibração e `WCS-WAVE` |
| [NASA/JPL-Caltech — primeiro mapa de todo o céu, PIA26600](https://www.jpl.nasa.gov/images/pia26600-spherexs-first-all-sky-map/) | Mapas de estrelas/galáxias e gás/poeira usados como textura da esfera do céu, distintos dos cutouts individuais do visualizador |
| [NASA Scientific Visualization Studio — SPHEREx Spacecraft and Observing Animations](https://svs.gsfc.nasa.gov/14966/) | Vídeo da espaçonave e imagem de apresentação usados na home |
| [CDS/DSS2 colorido, espelho HiPS do IRSA](https://irsa.ipac.caltech.edu/data/hips/CDS/DSS2/color) | Céu óptico de referência apresentado pelo Aladin Lite; **não é uma observação SPHEREx** |

**Agradecimento aos dados:** este projeto utiliza produtos da missão SPHEREx, um projeto conjunto do Jet Propulsion Laboratory e do California Institute of Technology, financiado pela NASA, e disponibilizados pelo NASA/IPAC IRSA. Os mapas e materiais visuais acima recebem os créditos NASA/JPL-Caltech e os demais créditos indicados nas páginas de origem. O uso desses dados e recursos públicos não implica vínculo institucional ou endosso da NASA ao CosmoSPHERE.

## Arquitetura e serviços

```text
Navegador → Traefik (HTTPS) → frontend React
                         → API Node/Express → FastAPI/Python → NASA/IPAC IRSA
                         → laboratório com autenticação → motores versionados
                                      └─ exportações → catálogo da API
```

| Componente | Tecnologia e responsabilidade | Acesso |
|---|---|---|
| Frontend | React + TypeScript + Vite; mapa WebGL, visualizador, linha do tempo e espectros | [Aplicação em produção](https://spherex.prospectordigital.com.br) |
| API pública | Node.js 24 + Express; validação, gateway para Python, arquivos e catálogo | [API e healthcheck](https://api.spherex.prospectordigital.com.br/healthz) |
| Serviço científico | FastAPI/Python; descoberta no IRSA, recortes FITS, alinhamento, renderização e fotometria | Somente rede interna em produção |
| Laboratório | Python; pré-mapeamento, versões congeladas do motor e exportações | [Laboratório](https://lab.spherex.prospectordigital.com.br), com autenticação |

Não há banco de dados nem fila externa: os artefatos ficam em arquivos e os jobs executam em threads. O cache de produção pode ser regenerado; o acervo do laboratório deve ser preservado. Detalhes em [docs/architecture.md](docs/architecture.md).

## Documentação

| Referência | Conteúdo |
|---|---|
| [Documentação técnica completa — inglês, PDF](docs/cosmosphere-technical-documentation-en.pdf) | Edição de 15/11/2026: arquitetura, frontend, API, ciência, fórmulas, figuras e operação |
| [Frontend](frontend/README.md) | Rotas, componentes, estado, configuração e comandos atuais |
| [Backend científico](backend/README.md) | Processamento de imagens, falsa cor, espectros e limitações |
| [Contrato da API](docs/api.md) | Consultas, parâmetros, jobs de imagens/espectros, arquivos e catálogo |
| [Arquitetura](docs/architecture.md) | Serviços, fluxo de dados, persistência e fronteiras de produção |
| [Operação e deploy](infra/README.md) | VPS, Docker, Traefik, DNS, CI/CD e rollback |
| [Laboratório](dev/temporal-lab/README.md) | Pré-mapeamento, motores e exportação dos alvos |
| [Design system](docs/DESIGN_SYSTEM.md) | Estilos e componentes da interface |
| [Especificação inicial do frontend](docs/Sky_Explorer_Documentacao_Frontend.md) | Documento histórico de planejamento; não substitui o código e as referências atuais acima |

O PDF é uma edição datada. Para comandos e contratos vigentes, consulte os arquivos Markdown e o código da `main`.

## Rodar localmente

Requisitos: **Node.js 24**, npm e **Python 3.11+**; produção usa Python 3.12.

Na raiz do repositório:

```sh
npm ci
cp .env.example .env
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
```

Inicie os três processos em terminais separados, sempre a partir da raiz:

```sh
# Terminal 1 — serviço científico
.venv/bin/python -m uvicorn app.main:app --app-dir backend --port 8000 --reload
```

```sh
# Terminal 2 — API pública; .env contém PYTHON_API_URL=http://localhost:8000
npm run dev
```

```sh
# Terminal 3 — frontend
npm run dev --workspace frontend
```

Abra [http://localhost:5173](http://localhost:5173). A API fica em `http://localhost:3000` e o serviço científico em `http://localhost:8000`. `GET /healthz` está disponível nos três servidores de produção; o servidor de desenvolvimento Vite não implementa esse healthcheck.

Para testar os builds localmente, mantenha o serviço Python ativo e execute:

```sh
npm run build
# Em um terminal:
FRONTEND_ORIGIN=http://localhost:8080 npm start
# Em outro terminal:
node frontend/server.mjs
```

A interface compilada abre em `http://localhost:8080`. O servidor Express do frontend é iniciado diretamente por `node frontend/server.mjs`; o workspace atual não define um script `start`.

### Configuração

- `.env` da raiz: `PORT`, `FRONTEND_ORIGIN` e `PYTHON_API_URL` para a API Node.
- Frontend: `VITE_API_BASE_URL` no ambiente de build ou em `frontend/.env.local`; padrão `http://localhost:3000`.
- Catálogo: `SPHEREX_CATALOG_DIR` aponta para as exportações do laboratório; sem ele, `/api/catalogo` retorna 503. `VITE_CATALOG_URL` vazio desativa o catálogo na interface.
- Cache científico: `SPHEREX_CACHE_DIR`; padrão `backend/cache/temporal/`.

Não versione credenciais, arquivos `.env` ou chaves. Outras variáveis estão nas referências de [API](docs/api.md), [frontend](frontend/README.md) e [operação](infra/README.md).

## API em resumo

A API pública não exige token. O Python é acessado por ela pela rede interna; o laboratório tem autenticação própria.

| Rota | Uso |
|---|---|
| `GET /healthz` | Disponibilidade do processo e SHA da release |
| `GET /api/consulta?RA=...&DEC=...&Data=YYYY-MM-DD` | Consulta por coordenadas; `elemento=imagem` ou `espectro` |
| `POST /api/consulta` | Mesmos parâmetros em JSON |
| `GET /api/sequencias/<job_id>` | Progresso, épocas e camadas de imagens prontas |
| `GET /api/espectros/<job_id>` | Progresso, pontos e gráficos do espectro |
| `GET /api/catalogo/index.json` | Lista de alvos pré-mapeados |

Exemplo para uma sequência de imagens:

```sh
curl --get 'http://localhost:3000/api/consulta' \
  --data-urlencode 'RA=133.79513' \
  --data-urlencode 'DEC=-7.24515' \
  --data-urlencode 'Data=2026-11-15' \
  --data-urlencode 'elemento=imagem' \
  --data-urlencode 'bandas=D1,D3' \
  --data-urlencode 'modo=balanceada'
```

A resposta traz metadados e `sequencia.status_url`: consulte esse caminho até o estado final. Para espectro, use `elemento=espectro` e acompanhe `status_url`. Não se trata de um download instantâneo de todos os resultados. Formatos, opções e erros em [docs/api.md](docs/api.md).

## Validação e publicação

```sh
npm run lint
npm run typecheck
npm test
npm run build
(cd backend && ../.venv/bin/python -m unittest discover -s tests -p 'test_*.py')
node --test dev/temporal-lab/tests/*.test.mjs
.venv/bin/python -m unittest discover -s dev/temporal-lab/tests -p 'test_*.py'
```

Os testes científicos e do laboratório não estão todos incluídos no `npm test` agregado. O [GitHub Actions](.github/workflows/ci-cd.yml) detecta os projetos alterados e executa suas verificações. Alterações apenas em `README.md` e `docs/` não reimplantam os serviços; mudanças nos caminhos de aplicação/infraestrutura seguem o deploy automático da `main`. O deploy verifica healthchecks e restaura a release anterior se falhar.

## Equipe

**T.A.R.S. — Team for Advanced Research of Space** · Uberlândia, Minas Gerais, Brasil.

| Integrante | Atuação e formação | LinkedIn |
|---|---|---|
| **Caio Séjour** | Engenheiro de telecomunicações | [Perfil](https://www.linkedin.com/in/caio-s%C3%A9jour-araujo-a5b9b6147/) |
| **Gustavo Valentim** | Graduando em Ciência da Computação | Não possui perfil |
| **Michael Reis** | Analista de dados | [Perfil](https://www.linkedin.com/in/michael-dos-reis-bb7763196/) |
| **Raul de Souza** | Estudante do ensino médio | Não possui perfil |
