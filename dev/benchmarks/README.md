# Experimentos de desempenho do espectro

`spectrum.py` compara a fotometria da worktree com os arquivos
`image_aligner.py` e `spectrum_service.py` de uma revisão Git. Reutiliza somente
os metadados e FITS de espectro já presentes em um cache (FOV 3′, cutout 4′).
Não inicia o laboratório, não consulta o IRSA e não escreve no cache de origem.
Os resultados ficam em uma pasta nova, que precisa estar fora do acervo original.
Não há alterações nos motores congelados nem nos seus registros.

Execute na raiz do repositório, usando o Python do ambiente científico:

```sh
<venv>/bin/python dev/benchmarks/spectrum.py \
  --cache "<cache existente>" \
  --output backend/cache/spectrum-experiment-01 \
  --ra 133.795129167 --dec -7.245147222 \
  --baseline-ref dbc0a8dc72ac82260230a4d4322e005aaeba0caa \
  --workers 1 --repeats 3 --limits 8 17
```

O relatório `report.md` contém tempos e links para SVGs de uma banda (D3) e
das bandas escolhidas (`--bands D1 D2 D3 D4 D5 D6`, padrão). `results.json`
inclui cada tempo, pontos, erros, rejeições, outliers, canais e diferenças das
medianas por canal. O script exige que o motor completo preserve exatamente
os resultados do baseline, e que os resultados se repitam entre execuções.
Registra também o SHA do baseline e os hashes dos dois fontes atuais.

Os dois arquivos do baseline são carregados em módulos isolados; a descoberta
e o acesso aos FITS são substituídos por entradas locais, com sockets bloqueados.
A infraestrutura restante é a da worktree. Escolha a revisão imediatamente
anterior ao experimento, com os mesmos contratos dos outros módulos.

Cada execução usa uma pasta de fotometria vazia. O tempo inclui leitura dos
FITS, fotometria, medianas/outliers, JSON e SVG; exclui importações, consulta de
metadados e download. O cache de arquivos do sistema operacional fica aquecido.
A ordem dos cenários alterna entre repetições. `--workers 1` permite comparar
o custo local com pouca concorrência (ainda há uma thread por banda);
`--workers 8` usa a concorrência padrão do serviço, até oito tarefas por banda.
Esses tempos não estimam a espera por rede em uma coordenada nova.

## O que está sendo comparado

O motor completo agora avalia a WCS espectral nos quatro pixels que participam
da interpolação bilinear do alvo. A WCS alternativa W recebe só suas chaves e
as dimensões da imagem. O caminho anterior avaliava a grade toda e serializava
metadados que não participam da solução espectral. A precisão float32 e a
interpolação foram mantidas.

A fotometria converte e mascara apenas a janela do anel de fundo (raio externo
de 10 px), preservando todos os pixels da abertura e do anel. Em imagens grandes,
lê só essa seção de IMAGE e VARIANCE. Para imagens até 64×64, a leitura contígua
evita o custo das buscas por linha da seção FITS. Abertura, fundo, variância e
quantidade de observações continuam iguais; não foi necessária uma nova versão
do formato de fotometria. O hash de código do lab permite congelar esse motor
como uma nova versão, mantendo as versões anteriores intactas.

`--limits` é um experimento separado: escolhe visitas igualmente espaçadas na
ordem temporal do dataset antes de medir. Não usa λ conhecido para escolher
observações. Menos visitas podem deixar lacunas no espectro e perder variação
temporal. Essa seleção não foi adicionada à API nem ao mapeamento do produto.

## Primeira medição local — 15/11/2026

Referência: `dbc0a8d` (main). Alvo RA 133,795129167°, Dec −7,245147222°.
258 observações disponíveis: 257 pontos válidos e uma rejeição de D6.
Três repetições, um worker por banda, sem rede:

| Cenário | D3 | D1–D6 | Pontos D1–D6 | Canais preenchidos D1–D6 |
|---|---:|---:|---:|---:|
| Baseline, todas as visitas | 0,916 s | 5,411 s | 257 | 101 |
| Otimizado, todas as visitas | 0,595 s | 3,998 s | 257 | 101 |
| Otimizado, até 17 visitas/banda | 0,248 s | 1,667 s | 102 | 67 |
| Otimizado, até 8 visitas/banda | 0,108 s | 0,713 s | 48 | 38 |

Otimização completa: redução de 35% em D3 e 26% nas seis bandas, com pontos,
erros, rejeições, outliers, medianas e conteúdo dos SVGs idênticos. Há até 102
canais (17 por banda), mas D5 já tinha apenas 16 preenchidos no baseline.

Limitar visitas acelera mais, com perda de cobertura: 17 visitas por banda
preservaram 67/101 canais; oito preservaram 38/101. Nos canais restantes, as
medianas também podem mudar. Um limite de 17 visitas não garante 17 canais.
O próximo experimento para reduzir visitas deve buscar cobertura em λ, sem
confundir épocas distintas nem pressupor que a amostragem temporal é espectral.

Os artefatos desta execução estão em `backend/cache/spectrum-performance/run-1/`
(ignorados pelo Git). O script permite repetir a medição em outra máquina ou alvo.

Com oito workers por banda (padrão do serviço), outra comparação com três
repetições mediu D3 em 0,898 → 0,631 s e D1–D6 em 5,533 → 3,879 s: cerca de
30% menos tempo, novamente com resultados completos idênticos. Artefatos em
`backend/cache/spectrum-performance/workers-8/`.
