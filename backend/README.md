# Backend científico

Serviços Python que consultam e processam dados da SPHEREx, expostos à API Node
pelo FastAPI em `app/main.py` (contratos em `docs/api.md`).

```sh
cd backend
pip install -r requirements-dev.txt
uvicorn app.main:app --port 8000 --reload   # API Node: PYTHON_API_URL=http://localhost:8000
python -m unittest discover -s tests -p 'test_*.py'
```

## Dependências atuais

- `astroquery`: consulta SIA2 ao NASA/IPAC IRSA;
- `astropy`: coordenadas, tempo, tabelas, FITS e WCS.
- `pyvo`: tratamento dos protocolos e erros do Virtual Observatory;
- `numpy`: normalização e transformação matricial da extensão `IMAGE`;
- `Pillow`: codificação dos frames em PNG, WebP ou JPEG;
- `requests`: download HTTPS dos arquivos e cutouts FITS.
- `reproject`: reprojeção de cada FITS para uma grade WCS celeste comum.

As demais bibliotecas científicas serão adicionadas quando houver uso direto no
código.

## Serviços implementados

- `IrsaClient.query_table`: preserva a tabela científica devolvida pelo SIA2;
- `IrsaClient.search`: converte as linhas para modelos serializáveis;
- `IrsaClient.download`: baixa um FITS completo ou um cutout;
- `inspect_fits`: lista HDUs, metadados e verifica se o alvo está dentro da imagem.
- `generate_frame`: converte a extensão científica `IMAGE` em um frame 8-bit com
  normalização por percentis e stretch `asinh`.
- `build_common_sky_grid`: cria uma grade TAN quadrada, norte-para-cima e com o
  RA/Dec solicitado exatamente no pixel central;
- `align_fits_image`: reprojeta a WCS/SIP de cada observação para a grade comum
  e mede a fração efetivamente coberta;
- `SpherexImageService.create_preview`: recebe RA, Dec e FOV, seleciona uma
  observação compatível, baixa o cutout e devolve a imagem com seus metadados.
- `SpherexTemporalSequenceService.create_sequence`: recebe RA e Dec, consulta o
  SIA2 novamente, seleciona até 100 observações D3 que cobrem integralmente o FOV
  final de 30 arcmin, baixa cutouts-fonte de 45 arcmin em paralelo e gera uma
  sequência WebP com manifesto JSON ordenado pelo horário de observação. A
  margem externa preserva a janela menor durante rotações de até qualquer ângulo.
- `SpherexTemporalSequenceService.discover_dataset`: consulta apenas metadados e
  reutiliza `dataset.json` para repetir coordenadas sem nova chamada à IRSA;
- `SpherexTemporalSequenceService.select_indices`: oferece os modos rápido (até
  4), balanceado (até 12) e completo (até 100);
- `SpherexTemporalSequenceService.materialize_frame`: baixa e converte apenas o
  índice solicitado pelo consumidor;
- `SpherexTemporalSequenceService.clear_cache`: remove um dataset validado ou
  todos os artefatos regeneráveis da raiz de cache dedicada.

O motor temporal reprojeta todos os frames para a mesma grade TAN e retorna
`aligned: true`. A correção usa a WCS completa de cada FITS, incluindo a
distorção SIP quando presente, em vez de supor um deslocamento uniforme em RA,
Dec ou pixels. Os FITS ficam em cache por combinação de coordenadas, banda,
coleções e período. O cache de previews possui versão própria; imagens antigas
sem alinhamento são regeneradas automaticamente.

O FITS continua sendo a fonte científica. Os frames são derivados para exibição.
Na comparação entre épocas, todos os frames devem usar o mesmo intervalo
`display_min`/`display_max`; normalizar cada época separadamente pode criar uma
falsa impressão de variação de brilho.

O download aceita somente URLs HTTPS do domínio oficial
`irsa.ipac.caltech.edu`. Para experimentação, prefira cutouts e limite a
quantidade de arquivos baixados.
