# SPHEREx Temporal Lab

Interface local para testar descoberta de épocas e carregamento lazy dos cutouts
SPHEREx. Não faz parte do frontend do produto nem implementa FastAPI.

## Executar

```bash
"/Users/caio/Documents/Dev/NASA/NSA SphereX/dev/.venv/bin/python" \
  "/Users/caio/Documents/Dev/NASA/NSA SphereX/sphereX-planetX-NASA/dev/temporal-lab/server.py"
```

Abra <http://127.0.0.1:8765>.

Para rodar este checkout em outra porta (ex.: quando já há um lab na 8765) e
reaproveitar o cache existente:

```bash
SPHEREX_LAB_CACHE_DIR="/Users/caio/Documents/Dev/NASA/NSA SphereX/dev/results/temporal-lab-cache" \
  "/Users/caio/Documents/Dev/NASA/NSA SphereX/dev/.venv/bin/python" dev/temporal-lab/server.py --port 8766
```

## Renderização e configurações

- **Renderização** (barra acima da imagem): Original, Limpa, Suave, Difusa e
  Pontual. Trocar o preset reaproveita os FITS e a matriz já alinhada
  (`aligned/*.npz`); só a imagem é refeita, mantendo a época atual.
- **Cor**: falsa cor por pixel (`WCS-WAVE`) ou monocromático; com várias bandas,
  as camadas monocromáticas também se sobrepõem com mistura `screen`.
- **Configurações** (aba): janela final de 10′, 15′, 20′, 30′ ou 40′; o recorte
  baixado é sempre 1,5× a janela. Amostragem nativa (6,15″/px) ou 2× interpolada
  (3,08″/px). FOV e amostragem mudam o dataset (novo download); o preset não.

## Comportamento

- consulta apenas metadados na primeira busca;
- reutiliza `dataset.json` ao repetir as mesmas coordenadas;
- libera o primeiro frame assim que ele fica pronto;
- pré-carrega automaticamente todos os frames selecionados pelo modo;
- reprojeta todos os FITS para uma grade WCS comum centrada no RA/Dec consultado;
- permite selecionar por checkbox uma, várias ou todas as bandas D1–D6;
- usa o `WCS-WAVE` do FITS para aplicar falsa cor por pixel;
- comprime logaritmicamente 0,744–5,002 µm em 420–640 nm e gera WebP RGBA com
  opacidade 0,82;
- sobrepõe as camadas prontas progressivamente com mistura `screen`;
- ancora o slider na primeira banda selecionada e associa, nas demais, a
  observação temporal mais próxima, exibindo o delta de tempo de cada camada;
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

A falsa cor é uma codificação de visualização. Ela preserva a ordem e o
espaçamento fracionário dos comprimentos de onda, mas não transforma a medição
infravermelha em uma fotografia de cor visível real.
