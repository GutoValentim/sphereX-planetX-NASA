# SPHEREx Temporal Lab

Interface local para testar descoberta de épocas e carregamento lazy dos cutouts
SPHEREx. Não faz parte do frontend do produto nem implementa FastAPI.

## Executar

```bash
"/Users/caio/Documents/Dev/NASA/NSA SphereX/dev/.venv/bin/python" \
  "/Users/caio/Documents/Dev/NASA/NSA SphereX/sphereX-planetX-NASA/dev/temporal-lab/server.py"
```

Abra <http://127.0.0.1:8765>.

## Comportamento

- consulta apenas metadados na primeira busca;
- reutiliza `dataset.json` ao repetir as mesmas coordenadas;
- libera o primeiro frame assim que ele fica pronto;
- pré-carrega automaticamente todos os frames selecionados pelo modo;
- reprojeta todos os FITS para uma grade WCS comum centrada no RA/Dec consultado;
- mantém norte para cima e o mesmo centro, escala e dimensão durante o slider;
- usa recorte-fonte de 45′ e janela final de 30′ para preservar todos os cantos;
- continua o cronômetro total até o lote inteiro terminar;
- permite navegar enquanto os frames restantes são baixados e convertidos;
- oferece modos rápido (até 4), balanceado (até 12) e completo (até 100);
- permite limpar o dataset atual ou todo o cache gerado pelo laboratório.
- mantém um histórico local das coordenadas consultadas, com atalho para reabri-las;
- preserva o histórico do navegador mesmo quando o cache científico é limpo.

Se a página for aberta por outro servidor local, ela ainda usa a API em
`http://127.0.0.1:8765`. O `server.py` precisa estar em execução.

O código do laboratório é versionado em `dev/temporal-lab`, mas o cache científico
continua fora do repositório. No workspace atual, ele fica em:

```text
/Users/caio/Documents/Dev/NASA/NSA SphereX/dev/results/temporal-lab-cache
```

Todos os dados removidos pelos botões são artefatos regeneráveis.
