# SKY EXPLORER

## Documentação de Produto e Especificação do Frontend

**Projeto:** Sky Explorer --- NASA Space Apps Challenge\
**Versão:** 1.0 \| **Status:** Planejamento para implementação\
**Escopo:** Frontend em React + TypeScript + Vite

------------------------------------------------------------------------

## 1. Visão geral

O **Sky Explorer** é uma aplicação web para exploração visual de
observações astronômicas obtidas pelo telescópio espacial **SPHEREx**. O
usuário informa coordenadas celestes e, opcionalmente, uma data; a
aplicação solicita os dados ao backend e apresenta imagens, observações
temporais, bandas espectrais, gráficos e metadados.

O frontend é responsável pela interface, interação, validação dos dados
de entrada e apresentação dos resultados. A obtenção, calibração,
combinação e processamento científico das imagens são responsabilidades
do backend.

### 1.1 Objetivos

1.  Tornar a exploração de observações SPHEREx compreensível e
    acessível.
2.  Localizar regiões celestes por ascensão reta (RA) e declinação
    (Dec).
3.  Apresentar imagens e permitir navegar entre diferentes observações.
4.  Permitir selecionar bandas espectrais disponíveis.
5.  Exibir gráficos e metadados associados às observações.
6.  Apresentar o contexto científico e institucional do projeto.

### 1.2 Princípios de experiência

-   **Clareza:** cada página deve ter uma finalidade evidente.
-   **Consistência:** navegação, cores, tipografia e controles devem
    seguir um sistema comum.
-   **Feedback:** ações devem apresentar estados de carregamento,
    sucesso, ausência de dados ou erro.
-   **Progressividade:** priorizar informações essenciais e evitar
    sobrecarga visual.
-   **Responsividade:** manter a usabilidade em desktop e dispositivos
    móveis.
-   **Integridade científica:** nunca apresentar dados simulados como
    observações reais.

------------------------------------------------------------------------

## 2. Escopo e responsabilidades

### 2.1 Escopo desta etapa

Construir a base do frontend:

-   Estrutura de pastas e organização modular.
-   Configuração React, TypeScript e Vite.
-   Navegação entre páginas.
-   Temas claro e escuro.
-   Componentes visuais reutilizáveis.
-   Página inicial.
-   Formulário de coordenadas e parâmetros.
-   Estrutura da página de visualização astronômica.
-   Componentes preparados para Aladin Lite e Plotly.
-   Estrutura da linha temporal.
-   Estados de interface e dados simulados claramente identificados,
    quando necessários.

A prioridade é uma base funcional, organizada e extensível. Integrações
reais poderão ser concluídas posteriormente, conforme a disponibilidade
dos endpoints e contratos do backend.

### 2.2 Fora do escopo inicial

Não implementar nesta etapa, salvo solicitação explícita:

-   Consultas completas a serviços externos da NASA ou IRSA.
-   Download e processamento de arquivos FITS.
-   Calibração, alinhamento, reamostragem ou subtração de imagens.
-   Soma científica de bandas espectrais.
-   Cálculo de espectros ou métricas astronômicas.
-   Criação de dados científicos fictícios.
-   Alterações estruturais amplas no backend.

### 2.3 Responsabilidades do frontend

-   Coletar e validar parâmetros.
-   Converter RA para graus decimais, conforme o contrato da API.
-   Enviar consultas ao backend por uma camada de serviços.
-   Interpretar respostas conforme os tipos definidos.
-   Exibir imagens, gráficos, metadados e observações.
-   Gerenciar navegação, seleções e estados da interface.
-   Apresentar mensagens de erro e carregamento.

### 2.4 Responsabilidades do backend

-   Consultar as fontes de dados astronômicos.
-   Localizar observações correspondentes às coordenadas e à data.
-   Processar e preparar imagens e metadados.
-   Disponibilizar resultados em formatos adequados ao frontend.
-   Informar bandas, datas, horários e metadados disponíveis.
-   Retornar erros estruturados.

**Regra fundamental:** o frontend não deve presumir como os dados
científicos são obtidos ou processados. Deve consumir os resultados
efetivamente fornecidos pelo backend.

------------------------------------------------------------------------

## 3. Tecnologias

  Tecnologia     Responsabilidade
  -------------- -------------------------------------------------
  React          Construção da interface por componentes
  TypeScript     Tipagem e segurança em tempo de desenvolvimento
  Vite           Ambiente de desenvolvimento e build
  React Router   Navegação entre páginas
  Aladin Lite    Visualização e navegação pelo céu
  Plotly         Gráficos e visualização de dados
  CSS            Estilização, responsividade e temas

### 3.1 Diretrizes de dependências

-   Reutilizar dependências instaladas quando adequadas.
-   Evitar bibliotecas redundantes.
-   Isolar Aladin Lite e Plotly em componentes próprios.
-   Verificar compatibilidade de versões antes de instalar ou atualizar
    pacotes.
-   Não adicionar gerenciamento global de estado sem necessidade
    demonstrada.

------------------------------------------------------------------------

## 4. Arquitetura e organização do frontend

Organizar o frontend por responsabilidade, evitando componentes
excessivamente grandes e dependências desnecessárias entre páginas.

### 4.1 Estrutura recomendada

``` text
frontend/
├── public/
│   ├── images/
│   └── icons/
├── src/
│   ├── assets/
│   │   ├── images/
│   │   └── fonts/
│   ├── components/
│   │   ├── common/
│   │   │   ├── Button.tsx
│   │   │   ├── ThemeToggle.tsx
│   │   │   ├── LoadingState.tsx
│   │   │   ├── ErrorState.tsx
│   │   │   └── EmptyState.tsx
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── PageContainer.tsx
│   │   ├── home/
│   │   │   ├── HeroSection.tsx
│   │   │   ├── InformationCard.tsx
│   │   │   └── TeamSection.tsx
│   │   ├── explore/
│   │   │   ├── CoordinateForm.tsx
│   │   │   ├── CoordinateInput.tsx
│   │   │   ├── DateSelector.tsx
│   │   │   └── SpectralBandSelect.tsx
│   │   └── viewer/
│   │       ├── AladinViewer.tsx
│   │       ├── ViewerToolbar.tsx
│   │       ├── SpectralBandPanel.tsx
│   │       ├── ViewModeToggle.tsx
│   │       ├── TimelinePlayer.tsx
│   │       ├── ObservationMetadata.tsx
│   │       └── SpectralChart.tsx
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── ExploreTheSky.tsx
│   │   └── SeeTheSky.tsx
│   ├── services/
│   │   └── api.ts
│   ├── hooks/
│   │   └── useTheme.ts
│   ├── types/
│   │   ├── coordinates.ts
│   │   ├── observation.ts
│   │   └── api.ts
│   ├── utils/
│   │   ├── coordinateConversion.ts
│   │   ├── coordinateValidation.ts
│   │   └── dateFormatting.ts
│   ├── styles/
│   │   ├── globals.css
│   │   ├── themes.css
│   │   └── variables.css
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

A estrutura é uma referência, não uma obrigação de criar arquivos
vazios. Criar módulos quando houver uma responsabilidade real.

### 4.2 Responsabilidades dos diretórios

-   `pages/`: composição das páginas.
-   `components/common/`: controles e estados reutilizáveis.
-   `components/layout/`: cabeçalho, rodapé e estrutura compartilhada.
-   `components/home/`: componentes da página inicial.
-   `components/explore/`: campos e controles de consulta.
-   `components/viewer/`: visualizador, timeline, bandas e gráficos.
-   `services/`: comunicação HTTP.
-   `hooks/`: lógica React reutilizável.
-   `types/`: interfaces e tipos compartilhados.
-   `utils/`: conversão, validação e formatação.
-   `styles/`: tokens, temas e estilos globais.

### 4.3 Regras de implementação

1.  Cada componente deve ter responsabilidade clara.
2.  Não concentrar uma página inteira em um único arquivo.
3.  Não duplicar estilos ou regras de validação.
4.  Manter chamadas ao backend fora dos componentes visuais.
5.  Tipar propriedades, estados e respostas da API.
6.  Evitar `any`; preferir tipos explícitos ou `unknown` com validação.
7.  Evitar abstrações genéricas sem necessidade concreta.
8.  Manter nomes de arquivos e componentes consistentes.
9.  Não alterar arquivos fora de `frontend/` sem necessidade e
    autorização.
10. Preservar funcionalidades existentes após inspecionar sua
    finalidade.

------------------------------------------------------------------------

## 5. Navegação e rotas

  Página          Rota         Finalidade
  --------------- ------------ -----------------------------
  Home            `/`          Apresentação do projeto
  ExploreTheSky   `/explore`   Entrada dos parâmetros
  SeeTheSky       `/viewer`    Visualização dos resultados

### 5.1 Fluxo principal

``` text
Home
  → ExploreTheSky
  → envio dos parâmetros ao backend
  → resposta do backend
  → SeeTheSky
  → ExploreTheSky (nova consulta)
```

### 5.2 Regras de navegação

-   Páginas internas devem apresentar controle de retorno.
-   Preservar os parâmetros da consulta ao abrir o visualizador.
-   "Explorar novamente" retorna a `/explore`.
-   Acesso direto a `/viewer` sem consulta deve ser tratado:
    redirecionar para `/explore` ou exibir orientação.
-   Utilizar navegação interna, sem recarregar a página inteira.

------------------------------------------------------------------------

## 6. Sistema visual

A interface deve ter identidade científica, moderna, consistente e
acessível.

### 6.1 Tipografia

  Uso                               Fonte
  --------------------------------- ------------
  Títulos e cabeçalhos              Montserrat
  Textos, formulários e controles   Manrope

Evitar adicionar outras famílias tipográficas sem necessidade.

### 6.2 Paleta --- tema claro

  Elemento             Cor             Código
  -------------------- --------------- -----------
  Texto principal      Grey11          `#1C1C1C`
  Fundo geral          Azure2          `#E0EEEE`
  Cartões              WhiteSmoke      `#F5F5F5`
  Botões               Maroon          `#B03060`
  Cabeçalho e rodapé   LightSkyBlue    `#87CEFA`
  Destaques            DarkSlateBlue   `#483D8B`

### 6.3 Paleta --- tema escuro

  Elemento             Cor             Código
  -------------------- --------------- -----------
  Texto principal      GhostWhite      `#F8F8FF`
  Fundo geral          Grey11          `#1C1C1C`
  Cartões              Azul profundo   `#24364D`
  Botões               MediumOrchid    `#BA55D3`
  Cabeçalho e rodapé   MidnightBlue    `#191970`
  Destaques            Tan1            `#FFA54F`

As cores são referências iniciais. Ajustes podem ser feitos para
melhorar contraste e legibilidade sem descaracterizar a identidade.

### 6.4 Tokens de design

Centralizar cores e propriedades visuais em variáveis CSS. Não espalhar
valores hexadecimais diretamente pelos componentes.

``` css
:root {
  --color-background: #E0EEEE;
  --color-surface: #F5F5F5;
  --color-text: #1C1C1C;
  --color-primary: #B03060;
  --color-accent: #483D8B;
}

[data-theme="dark"] {
  --color-background: #1C1C1C;
  --color-surface: #24364D;
  --color-text: #F8F8FF;
  --color-primary: #BA55D3;
  --color-accent: #FFA54F;
}
```

Os nomes dos tokens devem representar sua função, permitindo alterar a
paleta sem modificar cada componente.

### 6.5 Tema claro e escuro

-   Botão minimalista com ícone de sol ou lua.
-   A alternância deve atualizar todas as páginas e componentes.
-   Cartões, textos, bordas, campos, menus e gráficos devem acompanhar o
    tema.
-   Utilizar transições discretas.
-   Definir um tema inicial coerente; persistir a preferência somente se
    isso fizer sentido para a implementação.
-   Garantir contraste adequado nos dois temas.

### 6.6 Animações

Utilizar com moderação:

-   Fade-in e deslocamento vertical sutil nos cartões da Home.
-   Transições suaves de tema.
-   Feedback visual em hover, focus e active.
-   Transições discretas em menus e painéis.

Respeitar `prefers-reduced-motion`, reduzindo ou removendo animações
quando solicitado pelo sistema operacional.

------------------------------------------------------------------------

## 7. Especificação das páginas

## 7.1 Home (`/`)

### Hero

Apresentar:

-   Título: **Sky Explorer**.
-   Texto introdutório sobre o SPHEREx e o propósito da aplicação.
-   Botão **Começar exploração**, direcionando a `/explore`.
-   Alternância de tema no canto superior direito.
-   Imagem de fundo dinâmica.

**Tema claro:** céu azulado, nuvens e incidência de luz solar.\
**Tema escuro:** universo, estrelas, galáxias e planetas.

O fundo deve manter o texto legível, utilizando sobreposição ou
gradiente quando necessário. A animação não pode prejudicar leitura,
performance ou navegação.

### Seções informativas

Criar três cartões ou blocos visuais:

1.  **O que é o SPHEREx?** --- missão, história, objetivos e tecnologia.
2.  **Sky Explorer --- NASA Space Apps Challenge** --- desafio,
    propósito e funcionamento da ferramenta.
3.  **Quem somos nós** --- equipe e integrantes.

O conteúdo definitivo será fornecido posteriormente. Usar textos
provisórios claramente identificados. Os cartões devem aparecer com
animação discreta ao entrar na área visível da tela.

### Rodapé

Incluir identificação do projeto, créditos, links relevantes e
referências institucionais quando fornecidas. Manter consistência com o
tema ativo.

------------------------------------------------------------------------

## 7.2 ExploreTheSky (`/explore`)

### Objetivo e estrutura

Permitir que o usuário informe uma posição celeste e parâmetros de
observação.

A página deve conter cabeçalho com retorno, título **Explore o
Universo**, formulário centralizado, campos agrupados, botão principal e
mensagens de validação próximas aos campos.

### Coordenadas celestes

**Ascensão reta (RA)**

-   Entrada em horas, minutos e segundos.
-   Campos separados para hora, minuto e segundo.
-   Hora no intervalo de 0 a menos de 24.
-   Minutos e segundos no intervalo de 0 a menos de 60.
-   Converter para graus decimais antes do envio, se esse for o formato
    acordado com o backend.

\[
RA\_{graus}=15`\left`{=tex}(h+`\frac{m}{60}`{=tex}+`\frac{s}{3600}`{=tex}`\right`{=tex})
\]

**Declinação (Dec)**

-   Entrada em graus.
-   Aceitar valores positivos e negativos.
-   Permitir graus decimais.
-   Validar entre `-90°` e `+90°`.

**Referência celeste:** o ponto vernal/equinócio vernal é a origem da
ascensão reta; não deve ser um terceiro campo de entrada.

### Seleção de data

Oferecer duas opções:

-   Utilizar a observação mais recente disponível.
-   Informar uma data específica.

Quando habilitada:

-   Exibir date picker.
-   Mostrar data como `DD/MM/YYYY`.
-   Validar datas reais do calendário.
-   Enviar como `YYYY-MM-DD`.

Não presumir que toda data escolhida possui observação; isso depende da
resposta do backend.

### Seleção espectral

-   Menu suspenso com as bandas disponíveis.
-   Opção inicial `P` (padrão).
-   Demais opções em ordem alfabética.
-   Lista alimentada por valores definidos pelo projeto ou fornecidos
    pelo backend.
-   Não inventar nomes de bandas.
-   Menu acessível por teclado e adequado a dispositivos móveis.

### Envio

Botão: **Visualizar →**.

Ao clicar:

1.  Validar os campos.
2.  Bloquear o envio se houver dados inválidos.
3.  Preparar parâmetros no formato esperado pela API.
4.  Exibir carregamento.
5.  Enviar a consulta.
6.  Em caso de sucesso, abrir `/viewer` preservando os dados.
7.  Em caso de falha, manter o usuário no formulário e apresentar
    mensagem clara.

Não simular sucesso de uma consulta real quando o backend não estiver
conectado.

------------------------------------------------------------------------

## 7.3 SeeTheSky (`/viewer`)

### Objetivo

Apresentar imagens retornadas pelo backend e permitir explorar
observações, bandas espectrais, informações temporais e gráficos.

Título: **SPHEREx Image**.

### Layout principal

-   **Esquerda:** seleção de bandas.
-   **Centro:** visualizador astronômico.
-   **Direita:** alternância entre imagem e gráfico.
-   **Cabeçalho:** título, retorno e controles contextuais.
-   **Área temporal:** navegação entre observações.

Em telas menores, reorganizar ou recolher painéis laterais sem impedir o
acesso aos controles.

### Aladin Lite

O componente `AladinViewer` encapsula a biblioteca e deverá:

-   Exibir a imagem ou camada astronômica recebida.
-   Permitir navegação pelo campo celeste.
-   Aplicar zoom.
-   Permitir pan/arraste.
-   Responder ao scroll quando suportado.
-   Atualizar a visualização conforme a observação selecionada.

**Diretrizes técnicas:**

-   Manter a integração isolada.
-   Não recriar a instância a cada renderização React.
-   Gerenciar inicialização e limpeza corretamente.
-   Evitar conflitos entre controles personalizados e controles nativos.
-   Utilizar Aladin para visualização, não para processamento
    científico.

### Zoom e panorâmica

Disponibilizar controle visual agrupado (`+ | -`). Preferir os
comportamentos nativos do Aladin. O cursor poderá indicar `grab` e
`grabbing` quando compatível com a interação real.

### Bandas espectrais

O painel esquerdo deverá:

-   Exibir as bandas disponíveis.
-   Selecionar todas por padrão quando esse for o comportamento definido
    para a consulta.
-   Permitir selecionar/desmarcar individualmente.
-   Indicar claramente as bandas ativas.
-   Atualizar a visualização conforme a seleção.
-   Informar quando nenhuma banda estiver selecionada.

A combinação das bandas será fornecida ou processada pelo backend. O
frontend envia a seleção e apresenta o resultado. Não presumir que a
soma direta de imagens de bandas diferentes equivale cientificamente a
uma imagem convencional.

### Alternância imagem/gráfico

No lado direito, disponibilizar controle para alternar entre:

-   **Imagem:** Aladin.
-   **Gráfico:** Plotly.

O controle deverá ocupar a mesma região nos dois modos. A mudança não
deve apagar a seleção temporal ou espectral.

### Gráficos com Plotly

O componente `SpectralChart` deverá:

-   Isolar a biblioteca Plotly.
-   Renderizar os dados disponibilizados pelo backend.
-   Permitir selecionar o tipo de informação representada, conforme os
    dados disponíveis.
-   Redimensionar conforme o espaço disponível.
-   Exibir carregamento, ausência de dados e erro.
-   Atualizar quando os parâmetros relevantes mudarem.

Não inventar eixos, unidades, séries ou valores científicos. A definição
dos gráficos depende do contrato do backend.

### Linha temporal

A navegação temporal é uma funcionalidade central.

O componente `TimelinePlayer` deverá percorrer observações ordenadas da
mais recente para a mais antiga.

Controles:

-   Slider para selecionar observação.
-   Botões anterior e próxima.
-   Reproduzir/pausar.
-   Data e horário da observação ativa.
-   Posição atual na sequência, quando útil.

**Comportamento:**

1.  Selecionar inicialmente a observação mais recente, exceto quando uma
    data solicitada resultar em observação correspondente.
2.  Atualizar a observação ativa ao mover o slider.
3.  Atualizar a imagem conforme a observação ativa.
4.  Atualizar metadados junto com a observação.
5.  Avançar automaticamente durante a reprodução.
6.  Definir comportamento previsível ao chegar ao fim da sequência:
    pausar ou reiniciar conforme decisão de produto.

A timeline deve ser desacoplada do visualizador. Ela controla o índice
ou identificador da observação ativa; o visualizador recebe a observação
correspondente.

### Metadados

Abaixo da área principal, exibir, quando disponíveis:

-   RA.
-   Dec.
-   Data da observação.
-   Horário da observação.
-   Bandas selecionadas.
-   Identificador da observação.
-   Outros metadados relevantes retornados pelo backend.

Apresentar rótulos e unidades claros. Não exibir valores fictícios como
dados reais.

### Explorar novamente

Ao final da página, apresentar **Explorar novamente →**, direcionando
para `/explore`.

------------------------------------------------------------------------

## 8. Integração com o backend

A comunicação deverá ser centralizada em `services/api.ts`.

### 8.1 Princípios

-   Não espalhar chamadas `fetch` pelos componentes.
-   Não inventar endpoints nem formatos de resposta.
-   Confirmar o contrato da API com a equipe do backend.
-   Criar tipos TypeScript correspondentes aos dados reais.
-   Tratar erros HTTP, respostas inválidas e ausência de dados.
-   Separar dados da consulta, observações, imagens e metadados.

### 8.2 Dados de entrada conceituais

A consulta poderá exigir:

-   RA em graus decimais.
-   Dec em graus decimais.
-   Data específica ou indicação de observação mais recente.
-   Uma banda ou conjunto de bandas.

O formato definitivo deve seguir o contrato acordado com o backend.

### 8.3 Dados de saída conceituais

A resposta poderá conter:

-   Identificação da consulta.
-   Coordenadas consultadas.
-   Lista de observações.
-   Datas e horários.
-   Identificadores ou referências das imagens.
-   Bandas disponíveis.
-   Metadados.
-   Dados necessários aos gráficos.

Esta é uma proposta conceitual, não um contrato definitivo. Confirmar
nomes, tipos, obrigatoriedade e formatos antes da integração.

### 8.4 Estados assíncronos

  -----------------------------------------------------------------------
  Estado                              Comportamento
  ----------------------------------- -----------------------------------
  Idle                                Interface pronta

  Loading                             Indicador de carregamento e
                                      controles adequadamente
                                      desabilitados

  Success                             Apresentar os dados recebidos

  Empty                               Informar que não foram encontradas
                                      observações

  Error                               Exibir mensagem clara e opção de
                                      tentar novamente
  -----------------------------------------------------------------------

Não deixar áreas vazias sem explicação durante carregamentos ou quando
não houver resultados.

------------------------------------------------------------------------

## 9. Responsividade e acessibilidade

### 9.1 Responsividade

A aplicação deve funcionar em desktop, notebook, tablet e smartphone.

-   Evitar larguras fixas que causem overflow.
-   Reorganizar painéis laterais em telas pequenas.
-   Preservar legibilidade de formulários e metadados.
-   Garantir área útil adequada para o visualizador.
-   Adaptar controles da timeline ao toque.
-   Evitar menus que cubram permanentemente a visualização.

### 9.2 Acessibilidade

-   Utilizar HTML semântico.
-   Associar rótulos aos campos.
-   Permitir navegação por teclado.
-   Exibir foco visível.
-   Não depender apenas de cores para indicar seleção ou erro.
-   Garantir contraste adequado.
-   Fornecer nomes acessíveis a ícones e controles.
-   Respeitar `prefers-reduced-motion`.

------------------------------------------------------------------------

## 10. Desempenho e estabilidade

-   Evitar renderizações desnecessárias.
-   Não recriar instâncias Aladin ou Plotly sem necessidade.
-   Carregar recursos pesados somente quando necessários.
-   Otimizar imagens e fontes.
-   Limpar listeners, instâncias e recursos ao desmontar componentes.
-   Tratar falhas de carregamento de imagens.
-   Evitar armazenar grandes arquivos astronômicos no estado React.
-   Separar estado da interface dos dados científicos.
-   Não bloquear a navegação durante operações que possam ocorrer em
    segundo plano com segurança.

------------------------------------------------------------------------

## 11. Plano de implementação

### Etapa 1 --- Fundação

-   Inspecionar a estrutura existente.
-   Confirmar dependências e scripts.
-   Configurar rotas.
-   Definir estrutura de pastas.
-   Implementar tokens de design e temas.
-   Criar cabeçalho, rodapé e componentes comuns.

**Conclusão:** aplicação inicia, navega entre rotas e alterna temas sem
inconsistências.

### Etapa 2 --- Home

-   Implementar hero e fundo por tema.
-   Adicionar chamada para ação.
-   Criar cartões informativos.
-   Implementar animações discretas.
-   Criar rodapé.

**Conclusão:** página responsiva e coerente nos dois temas.

### Etapa 3 --- ExploreTheSky

-   Implementar formulário.
-   Criar campos RA e Dec.
-   Implementar validação e conversão de RA.
-   Criar seletor de data e bandas.
-   Implementar estados de envio e erro.

**Conclusão:** formulário produz parâmetros tipados e validados, mesmo
antes da integração real.

### Etapa 4 --- SeeTheSky: estrutura

-   Criar layout e painéis.
-   Criar placeholder do Aladin e do Plotly.
-   Criar seletor de bandas e timeline.
-   Criar metadados.
-   Implementar alternância imagem/gráfico.

**Conclusão:** fluxo visual funciona com dados simulados claramente
identificados.

### Etapa 5 --- Integração

-   Confirmar contrato da API.
-   Implementar serviços HTTP.
-   Conectar formulário ao backend.
-   Mapear respostas para tipos frontend.
-   Integrar Aladin Lite e Plotly.
-   Sincronizar timeline, imagem e metadados.
-   Tratar erros e ausência de dados.

**Conclusão:** uma consulta real percorre o fluxo completo.

### Etapa 6 --- Revisão

-   Testar navegação.
-   Testar validação de coordenadas e datas.
-   Testar os dois temas.
-   Testar responsividade.
-   Verificar console e build.
-   Revisar acessibilidade e desempenho.

------------------------------------------------------------------------

## 12. Critérios de aceitação

-   [ ] As três páginas estão implementadas.
-   [ ] As rotas funcionam corretamente.
-   [ ] Cabeçalho e rodapé são reutilizados quando apropriado.
-   [ ] Tema claro e escuro funcionam em toda a aplicação.
-   [ ] Cores e fontes estão centralizadas.
-   [ ] O formulário valida coordenadas e datas.
-   [ ] A conversão de RA está implementada e testável.
-   [ ] Estados de carregamento, erro e ausência de dados estão
    previstos.
-   [ ] A página de visualização possui estrutura para Aladin e Plotly.
-   [ ] A timeline controla a observação ativa.
-   [ ] A seleção de bandas funciona na interface.
-   [ ] Os metadados acompanham a observação selecionada.
-   [ ] O layout funciona em desktop e dispositivos móveis.
-   [ ] Dados fictícios não são apresentados como científicos.
-   [ ] O projeto compila sem erros de TypeScript.
-   [ ] O build de produção é concluído com sucesso.

------------------------------------------------------------------------

## 13. Diretrizes para Cursor e agentes de programação

1.  Ler esta documentação antes de alterar o código.
2.  Inspecionar a estrutura existente e identificar o que já funciona.
3.  Trabalhar somente em `frontend/`, salvo autorização explícita.
4.  Implementar uma etapa por vez.
5.  Antes de alterações relevantes, apresentar um plano curto.
6.  Preservar funcionalidades existentes.
7.  Não inventar endpoints, respostas, bandas ou valores científicos.
8.  Não instalar dependências sem justificar a necessidade.
9.  Não criar arquivos ou abstrações apenas para preencher a estrutura
    sugerida.
10. Executar verificações de TypeScript e build após mudanças
    relevantes.
11. Informar arquivos criados ou modificados.
12. Registrar pendências que dependam do backend ou de decisões da
    equipe.

**Prioridade final:** entregar uma interface clara, consistente,
funcional e fácil de expandir. A arquitetura deve facilitar o
desenvolvimento, não torná-lo mais lento ou complexo do que o projeto
exige.
