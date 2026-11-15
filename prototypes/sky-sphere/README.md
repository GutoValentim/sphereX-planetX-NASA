# Sky Sphere (protótipo)

Validação de ideia: navegar pelo mapa all-sky da SPHEREx (PIA26600) como se o observador estivesse dentro de uma esfera.

```sh
node prototypes/sky-sphere/serve.mjs   # http://localhost:5180
```

- Arraste para olhar em volta; scroll/pinça para zoom (ancorado no cursor).
- Clique para marcar um alvo: a caixa mostra RA/Dec (ICRS, J2000), l/b galácticos e o FOV atual.
- Botões alternam as duas imagens e ligam uma grade galáctica de 30°.

## Como funciona

As imagens estão em projeção Mollweide e coordenadas galácticas. Não há pré-processamento: o fragment shader WebGL converte, para cada pixel, direção da câmera → (l, b) → coordenada Mollweide → UV da textura. A elipse é detectada automaticamente, então uma versão de maior resolução pode substituir os JPGs sem ajustes.

RA/Dec são obtidos pela matriz de rotação galáctica → equatorial (Hipparcos/ICRS). Conferido: centro galáctico = RA 266.405°, Dec −28.936°.

## Limitações

- Imagens de 2000 px (~0,18°/px): fica borrado com zoom alto.
- Sem dependências e sem build; não faz parte do frontend React nem do CI.
