# SPHEREx na VPS Oracle

Esta stack usa a rede externa `web` e o Traefik já existente. Não publica portas adicionais no host e não recria outros projetos. O Compose é exclusivo deste projeto; não execute `docker compose down` no diretório das outras aplicações.

## Pipeline

`.github/workflows/ci-cd.yml` valida PRs destinados à `main` e todo push na `main`: `npm ci`, lint, typecheck, testes e build. Um PR aberto apenas valida; seu merge gera o push que publica. Também é possível executar manualmente a pipeline da `main`.

Após o CI passar, o job de deploy usa uma chave SSH exclusiva do usuário `spherex-deploy`. A chave aceita somente `deploy <SHA de 40 caracteres>`; não abre shell, SFTP, túnel ou encaminhamento de portas. O secret `SPHEREX_SSH_PRIVATE_KEY` já foi configurado no repositório. A chave local está em `~/.ssh/spherex_github_actions_ed25519`; não a versione. `ssh_known_hosts` contém somente as chaves públicas do servidor já confiadas por este Mac.

A VPS busca o repositório público por HTTPS e publica exatamente o commit aprovado. Um lock na VPS e a concorrência do GitHub serializam deploys. Execuções de commits superados pela `main` são ignoradas para evitar regressão por ordem de conclusão do CI.

O build roda em um container temporário `node:24-bookworm-slim` com limite de 1 GB e 1 CPU. Ele instala pelo lockfile, compila Node/React e remove dependências de desenvolvimento. Os containers finais usam a mesma imagem oficial; não há imagem própria, registry ou `npm run dev` em produção. Os dois serviços rodam sem root, com filesystem e código somente leitura, limites de memória/CPU e logs rotacionados.

As releases ficam em `/opt/docker/spherex/releases/<SHA>`. O link `/opt/docker/spherex/current` é trocado atomicamente antes de recriar somente `api` e `frontend`. Os containers anteriores continuam usando sua release até a recriação. Existe uma breve interrupção durante a troca: este fluxo não oferece zero downtime.

O SHA vem do arquivo gerado `.release.env`, incluído em cada release. Ambos os `/healthz` devem responder com essa versão. Se a subida ou os healthchecks falharem, o script restaura o link e o Compose anteriores, recria a stack e retorna falha ao Actions. Se o build falhar, a versão em execução permanece ativa. São mantidas as releases ativa e anterior, além das três outras mais recentes.

## Arquivos na VPS

- `/opt/docker/spherex/compose.yaml`: Compose ativo, enviado inicialmente por SCP e atualizado a partir de cada release.
- `/opt/docker/spherex/.env`: somente caminho e domínios; veja `.env.example`.
- `/opt/docker/spherex/api.env`: variáveis privadas da API; veja `api.env.example`. `PYTHON_API_URL` começa vazia. O arquivo pertence ao UID/GID 1000, com permissão 600, e é montado somente na API como somente leitura. O Node carrega esse arquivo diretamente, sem o Portainer precisar ler o caminho do host.
- `/opt/docker/spherex/repository.git`: clone bare do repositório público.
- `/opt/docker/spherex/current-sha`: último deploy concluído com sucesso.
- `/usr/local/sbin/spherex-deploy`: cópia root-owned de `deploy.sh`.
- `/usr/local/bin/spherex-ssh-deploy`: cópia root-owned do comando SSH restrito.
- `/etc/sudoers.d/spherex-deploy`: permite ao usuário de CI executar somente o script de deploy.

Os arquivos `.env` reais têm permissão 600 e não entram no Git. O único secret enviado ao GitHub é a chave exclusiva de deploy; credenciais de outras aplicações não são copiadas para esta stack. Alterações nos scripts instalados em `/usr/local` exigem nova cópia via SSH administrativo; a pipeline não sobrescreve seus próprios comandos privilegiados.

## Portainer

Stack `spherex`, ambiente `local`. O Compose usa o bind fixo `/opt/docker/spherex/current`, portanto a versão do código não depende de editar variáveis no Portainer a cada publicação. A pipeline recria os serviços pelo Docker Compose no mesmo projeto que o Portainer gerencia. Não é necessário token administrativo do Portainer no Actions.

Se alterar `infra/compose.yaml`, a pipeline aplica o novo arquivo na VPS; atualize também a definição salva no editor da stack antes de fazer um redeploy manual pelo Portainer. Um redeploy manual pela interface usa a última release do link `current` e a definição salva no Portainer. O script instalado aplica a definição do commit selecionado.

## DNS e TLS

Crie os dois registros A no Cloudflare apontando para `150.230.73.212`:

| Nome na zona prospectordigital.com.br | Destino |
| --- | --- |
| `spherex` | `150.230.73.212` |
| `api.spherex` | `150.230.73.212` |

Comece com **Somente DNS** (nuvem cinza): o resolver existente `lets-encrypt` usa TLS-ALPN e precisa alcançar a VPS diretamente na porta 443 para emitir e renovar certificados. Não ative proxy laranja enquanto este método de validação for usado. Não crie AAAA sem configurar IPv6 na VPS. A rota HTTP já redireciona para HTTPS no Traefik existente.

Depois da propagação, valide os certificados sem `-k`:

```sh
curl --fail https://api.spherex.prospectordigital.com.br/healthz
curl --fail https://spherex.prospectordigital.com.br/healthz
```

O frontend usa `VITE_API_BASE_URL=https://api.spherex.prospectordigital.com.br` no build. A API permite CORS somente para `https://spherex.prospectordigital.com.br`. Alterar o domínio da API exige um novo build: ajuste a configuração da VPS e publique um novo commit, para gerar uma release com outro SHA.

## Operação

Conecte por `ssh ubuntu@150.230.73.212`. Na VPS:

```sh
sudo docker compose --project-name spherex --env-file /opt/docker/spherex/.env -f /opt/docker/spherex/compose.yaml ps
sudo docker compose --project-name spherex --env-file /opt/docker/spherex/.env -f /opt/docker/spherex/compose.yaml logs --tail 100
sudo cat /opt/docker/spherex/current-sha
```

Para rollback administrativo, substitua `SHA_ANTERIOR` por um commit completo que ainda pertence à `main`:

```sh
sudo env SPHEREX_ALLOW_ROLLBACK=1 /usr/local/sbin/spherex-deploy SHA_ANTERIOR
```

O rollback é manual por SSH administrativo; a chave do Actions não pode habilitar essa opção. O próximo push na `main` voltará a publicar a nova versão aprovada.

Referências: [gatilhos e concorrência do GitHub Actions](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments), [labels do provider Docker do Traefik](https://doc.traefik.io/traefik/reference/routing-configuration/other-providers/docker/), [TLS-ALPN no Traefik](https://doc.traefik.io/traefik/reference/install-configuration/tls/certificate-resolvers/acme/#tlschallenge).
