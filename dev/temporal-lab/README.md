# SPHEREx Lab

Laboratório para mapear alvos conhecidos (constelações, regiões, estrelas
famosas) e guardar tudo o que o produto vai precisar: FITS, imagens
renderizadas em todas as variantes e espectros. Publicado em
<https://lab.spherex.prospectordigital.com.br> (senha HTTP Basic) e também roda
localmente. Não faz parte do frontend do produto.

## Arquitetura

```
navegador ─▶ server.py (gateway :8765)
               ├─ interface (public/), registros, fila de mapeamento, exportação
               ├─▶ motor v1: engines/v1/code/dev/temporal-lab/engine_server.py (127.0.0.1:8801)
               └─▶ motor v2: engines/v2/code/…                              (127.0.0.1:8802)
```

- `server.py`: gateway. Serve a interface, autentica, guarda os registros,
  calcula a cobertura a partir do disco, executa a fila de mapeamento e exporta.
- `engine_server.py`: a API científica (sequências, pré-carregamento, espectro).
  Cada **versão do motor** roda este arquivo a partir de uma cópia congelada de
  `backend/app` + `engine_server.py`, em subprocesso próprio e com cache próprio.
- `lab_store.py`: persistência (motores, registros, cobertura, exportação), sem
  dependências científicas. Testes em `tests/`.

### Diretório de dados (`SPHEREX_LAB_DATA_DIR`)

| Caminho | Conteúdo |
|---|---|
| `engines/<v>/engine.json` | título, descrição, commit e hash do código congelado |
| `engines/<v>/code/` | cópia de `backend/app/**/*.py` e `engine_server.py` |
| `engines/<v>/cache/` | datasets, FITS, matrizes alinhadas, WebPs, espectros e `calibration/` |
| `engines/<v>/results/<registro>/` | resumo do espectro (temas escuro e claro) |
| `records/<id>.json` | alvo: nome, descrição, RA/Dec, plano e estado do mapeamento |
| `exports/<v>/index.json` | catálogo dos alvos exportados |
| `exports/<v>/<slug>/` | `manifest.json` + `frames/` + `spectrum/` (hardlinks do cache) |
| `auth.json`, `CREDENTIALS.txt` | credenciais geradas no primeiro start (só com `SPHEREX_LAB_AUTH=required`) |

Em produção: `/opt/docker/spherex/lab` (montado em `/data`).

## Versões do motor

- No primeiro start é criada a `v1` a partir do código da release.
- Uma versão nunca muda de código. Quando uma release traz código novo do
  backend (`backend/app/**/*.py` ou `engine_server.py`), a aba **Versões do
  motor** mostra um aviso e permite congelá-lo como nova versão, com título e
  descrição (ex.: “v2 — espectro com menos pontos, mais rápido”).
- O seletor **Motor** escolhe a versão usada para explorar e mapear. Registros e
  caches de outras versões continuam intactos.
- As versões usam o venv da release atual: se uma versão nova exigir outra
  dependência, as antigas continuam com a mesma lista de pacotes.

## Registros e mapeamento

- Cada busca salva um **registro** por coordenada (nome e descrição opcionais,
  editáveis depois). Os registros são compartilhados entre todos que usam o lab.
- RA aceita graus (`133.795`) ou horas (`08h55m10.8s`, `08 55 10.8`,
  `08:55:10.8`). Dec aceita graus (`-7.245`) ou `−07°14′42″`, `-07 14 42`,
  `-07:14:42`.
- **Mapear…** coloca o alvo na fila do servidor (pode fechar a aba). Para cada
  FOV e banda escolhidos, baixa todas as épocas (modo completo) e renderiza as
  10 variantes (5 perfis × falsa cor/mono); mede o espectro das bandas
  escolhidas e gera os gráficos nos temas escuro e claro. Falhas do IRSA
  (502/503) são repetidas com espera de 5, 20 e 60 s; o que já foi baixado não
  é refeito. Ao terminar, exporta o alvo. A fila sobrevive a reinícios e deploys.
- A aba **Registros** mostra, por motor: estado geral (100% mapeado, parcial,
  com erro, na fila, mapeando), FOVs e bandas com percentual de FITS e de
  imagens renderizadas, espectro por banda e as falhas do último mapeamento.
  Com um plano de mapeamento, o “100%” mede o que foi pedido; explorações
  avulsas em outros FOVs aparecem com badge tracejado.
- **Apagar…** pede confirmação e remove do motor selecionado o cache e a
  exportação daquele alvo (opcionalmente o registro). Não existe “limpar tudo”.

## Exportação para o produto

`exports/<v>/<slug>/manifest.json` (`schema: spherex-lab-target/1`):

- `name`, `description`, `ra_deg`, `dec_deg`, `engine`;
- `sequences[]`: uma por FOV/amostragem/variante (`key` = `30-native/limpa-color`),
  com `frames[].layers[]` no mesmo formato de `/api/sequencias/<id>` e
  `image_url` relativo à pasta do alvo. Só entram bandas com todas as épocas
  renderizadas naquela variante (`omitted_bandpasses` lista as demais);
- `spectrum.dark` / `spectrum.light`: mesmo formato do resultado de
  `/api/espectros/<id>`, com `combined_chart_url` e `chart_url` relativos.

Os arquivos são hardlinks do cache (não ocupam espaço extra). Para levar ao
produto, copie `exports/<v>/` (com `cp -a`/`rsync -H`). O lab também serve
`/exports/<v>/index.json` e os arquivos para inspeção.

## Executar localmente

```bash
SPHEREX_LAB_DATA_DIR="/Users/caio/Documents/Dev/NASA/NSA SphereX/dev/results/temporal-lab-data" \
SPHEREX_LAB_CACHE_DIR="/Users/caio/Documents/Dev/NASA/NSA SphereX/dev/results/temporal-lab-cache" \
  "/Users/caio/Documents/Dev/NASA/NSA SphereX/dev/.venv/bin/python" dev/temporal-lab/server.py --port 8766
```

- `SPHEREX_LAB_CACHE_DIR` (opcional) liga um cache antigo à `v1` na primeira
  execução.
- Sem `SPHEREX_LAB_AUTH=required` não há senha (uso local).
- Os motores usam as portas `SPHEREX_LAB_ENGINE_BASE_PORT + n` (padrão 8800).

Testes: `python3 -m unittest discover -s dev/temporal-lab/tests -p 'test_*.py'`
e `node --test dev/temporal-lab/tests/*.test.mjs`.

## Renderização e espectro

- **Renderização**: Original, Limpa, Suave, Difusa e Pontual. Trocar o preset
  reaproveita os FITS e a matriz alinhada; só a imagem é refeita.
- **Cor**: falsa cor por pixel (`WCS-WAVE`) ou monocromático; várias bandas se
  sobrepõem com mistura `screen`.
- **Configurações**: janela final de 10′ a 40′ (o recorte baixado é 1,5× a
  janela) e amostragem nativa (6,15″/px) ou 2× interpolada (3,08″/px).
- **Espectro**: fotometria forçada (abertura 3 px, fundo local 6–10 px) em
  todas as observações; o filtro varia ao longo do detector, então cada visita
  mede o alvo em um único λ (`WCS-WAVE`). Recortes de 4′ baixados só até a
  `VARIANCE`; a tabela `WCS-WAVE` fica em `calibration/` por detector.
  Limitações: sem movimento próprio (WISE 0855 sai da abertura), sem correção
  de abertura, `FLAGS` não usadas.

A falsa cor é uma codificação de visualização: preserva a ordem e o espaçamento
fracionário dos comprimentos de onda, mas não é uma fotografia em luz visível.
