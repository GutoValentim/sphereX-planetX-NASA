# CLAUDE.md

As instruções do projeto ficam em `AGENTS.md`, compartilhado com outros agentes:

@AGENTS.md

## Específico do Claude Code

- Antes de qualquer mudança: `git fetch`, confira o estado da `main` e os
  `/healthz` de produção (`curl https://api.spherex.prospectordigital.com.br/healthz`
  e `curl https://spherex.prospectordigital.com.br/healthz`).
- Trabalhe em branch `claude/<assunto>`; nunca faça push direto na `main`.
- Rode a validação completa de `AGENTS.md` antes de abrir PR e informe o que não
  pôde ser verificado (por exemplo, testes de container).
- Comandos que chamam o IRSA ou geram sequências/espectros podem levar minutos:
  rode em segundo plano.
