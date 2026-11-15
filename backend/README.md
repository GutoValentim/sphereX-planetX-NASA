# Backend científico

Esta etapa contém apenas os serviços Python que consultam e processam dados da
SPHEREx. A camada FastAPI é mantida separada e será integrada por outro membro da
equipe.

## Dependências atuais

- `astroquery`: consulta SIA2 ao NASA/IPAC IRSA;
- `astropy`: coordenadas, tempo, tabelas, FITS e WCS.
- `pyvo`: tratamento dos protocolos e erros do Virtual Observatory;
- `numpy`: normalização e transformação matricial da extensão `IMAGE`;
- `Pillow`: codificação dos frames em PNG, WebP ou JPEG;
- `requests`: download HTTPS dos arquivos e cutouts FITS.

As demais bibliotecas científicas serão adicionadas quando houver uso direto no
código.

## Serviços implementados

- `IrsaClient.query_table`: preserva a tabela científica devolvida pelo SIA2;
- `IrsaClient.search`: converte as linhas para modelos serializáveis;
- `IrsaClient.download`: baixa um FITS completo ou um cutout;
- `inspect_fits`: lista HDUs, metadados e verifica se o alvo está dentro da imagem.
- `generate_frame`: converte a extensão científica `IMAGE` em um frame 8-bit com
  normalização por percentis e stretch `asinh`.
- `SpherexImageService.create_preview`: recebe RA, Dec e FOV, seleciona uma
  observação compatível, baixa o cutout e devolve a imagem com seus metadados.
- `SpherexTemporalSequenceService.create_sequence`: recebe RA e Dec, consulta o
  SIA2 novamente, seleciona até 100 observações D3 que cobrem integralmente o FOV
  fixo de 30 arcmin, baixa os cutouts em paralelo e gera uma sequência WebP com
  manifesto JSON ordenado pelo horário de observação.
- `SpherexTemporalSequenceService.discover_dataset`: consulta apenas metadados e
  reutiliza `dataset.json` para repetir coordenadas sem nova chamada à IRSA;
- `SpherexTemporalSequenceService.select_indices`: oferece os modos rápido (até
  4), balanceado (até 12) e completo (até 100);
- `SpherexTemporalSequenceService.materialize_frame`: baixa e converte apenas o
  índice solicitado pelo consumidor;
- `SpherexTemporalSequenceService.clear_cache`: remove um dataset validado ou
  todos os artefatos regeneráveis da raiz de cache dedicada.

O motor temporal ainda não reprojeta os frames. O manifesto retorna
`aligned: false`, deixando explícito que cada imagem preserva sua grade WCS
original. Os FITS ficam em cache por combinação de coordenadas, banda, coleções
e período. O fluxo completo pode forçar uma nova consulta; o fluxo lazy prefere
o catálogo cacheado até que a camada chamadora solicite refresh ou limpe o cache.

O FITS continua sendo a fonte científica. Os frames são derivados para exibição.
Na comparação entre épocas, todos os frames devem usar o mesmo intervalo
`display_min`/`display_max`; normalizar cada época separadamente pode criar uma
falsa impressão de variação de brilho.

O download aceita somente URLs HTTPS do domínio oficial
`irsa.ipac.caltech.edu`. Para experimentação, prefira cutouts e limite a
quantidade de arquivos baixados.
