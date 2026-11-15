# SPHEREx na VPS Oracle

Esta stack tem quatro serviços: `frontend` e `api` (Node, publicados pelo Traefik), `python` (FastAPI, sem publicação) e `lab` (laboratório de mapeamento em `dev/temporal-lab`, publicado em `lab.spherex…` com senha). Usa a rede externa `web` e o Traefik já existente; `api` e `python` também compartilham a rede privada `spherex_internal`, pela qual a API chama `http://spherex-python:8000`. Não publica portas adicionais no host e não recria outros projetos. O Compose é exclusivo deste projeto; não execute `docker compose down` no diretório das outras aplicações.

## Pipeline

`.github/workflows/ci-cd.yml` valida PRs destinados à `main` e todo push na `main` em três jobs independentes:

- **Backend:** instala as dependências Node, executa ESLint, TypeScript, testes da API e build.
- **Python:** instala `backend/requirements-dev.txt` e executa os testes do núcleo científico e do FastAPI.
- **Frontend:** instala as dependências Node, executa ESLint, TypeScript, testes do servidor e build Vite.
- **Lab:** ESLint de `dev/`, testes do laboratório (Python e Node) e um smoke test que sobe o gateway com autenticação e o motor `v1`.
- **Infra:** verifica a sintaxe dos scripts Bash e executa os testes Python de deploy.

Arquivos `backend/**/*.py` e `backend/requirements*.txt` pertencem ao serviço Python e também ao `lab` (que congela esse código em versões do motor); `dev/temporal-lab/**` pertence só ao `lab`; o restante de `backend/` pertence à API Node. Se arquivos de um serviço mudarem sem alterações em `infra/`, esse serviço é publicado quando seu próprio CI passar, independentemente dos demais. Alterações em `infra/` acionam um deploy da stack inteira e exigem sucesso de todos os CIs. A execução manual também valida e publica a stack inteira. PRs apenas validam; o merge gera o push que publica.

Após o CI passar, o job de deploy usa uma chave SSH exclusiva do usuário `spherex-deploy`. A chave aceita somente `deploy <SHA de 40 caracteres> [api|frontend|python|lab|stack]`; não abre shell, SFTP, túnel ou encaminhamento de portas. O secret `SPHEREX_SSH_PRIVATE_KEY` já foi configurado no repositório. A chave local está em `~/.ssh/spherex_github_actions_ed25519`; não a versione. `ssh_known_hosts` contém somente as chaves públicas do servidor já confiadas por este Mac.

A VPS busca o repositório público por HTTPS e publica exatamente o commit aprovado. Um lock na VPS serializa deploys. Execuções de commits superados pela `main` são ignoradas para evitar regressão por ordem de conclusão do CI.

O build dos serviços Node roda em um container temporário `node:24-bookworm-slim` com limite de 1 GB e 1 CPU. O deploy de API compila somente o backend; o de frontend compila somente o frontend. Ambos instalam pelo lockfile e removem dependências de desenvolvimento. O build Python roda em `python:3.12-slim-bookworm` (2 GB, 1 CPU) e cria um venv em `/app/.venv` dentro da release com `backend/requirements.txt`. A release do `lab` reaproveita a release Python do mesmo commit quando ela existe (mesmo venv e mesmo caminho `/app`); senão faz o mesmo build. Um deploy de stack prepara os três. Os containers finais usam as mesmas imagens oficiais; não há imagem própria, registry ou servidor de desenvolvimento em produção. Todos rodam sem root, com filesystem e código somente leitura, limites de memória/CPU e logs rotacionados. O Python tem 2 GB/1 CPU e grava apenas em `/opt/docker/spherex/cache` (montado em `/cache`) e no `/tmp` em memória.

As releases ficam em `/opt/docker/spherex/releases/<api|frontend|python|lab>/<SHA>`. Os links `/opt/docker/spherex/current-api`, `current-frontend`, `current-python` e `current-lab` são atualizados atomicamente; um deploy de serviço recria somente esse container, enquanto um deploy de stack recria todos. Cada serviço mantém sua própria versão, indicada por seu `/healthz`. Existe uma breve interrupção durante a recriação do serviço atualizado; este fluxo não oferece zero downtime.

O SHA vem do arquivo gerado `.release.env`, incluído em cada release. Se a subida ou o healthcheck falhar, o script restaura a release anterior do serviço; em deploy de stack, também restaura o Compose anterior. Um serviço sem release anterior (por exemplo, o primeiro deploy do Python) é removido no rollback. Se o build falhar, as versões em execução permanecem ativas. Para cada serviço, são mantidas as releases ativa e anterior, além das três outras mais recentes.

## Arquivos na VPS

- `/opt/docker/spherex/compose.yaml`: Compose ativo, enviado inicialmente por SCP e atualizado a partir de cada release.
- `/opt/docker/spherex/.env`: caminhos independentes da API e do frontend, mais os domínios; veja `.env.example`.
- `/opt/docker/spherex/api.env`: variáveis privadas da API; veja `api.env.example`. `PYTHON_API_URL` vem do `compose.yaml`, não deste arquivo. O arquivo pertence ao UID/GID 1000, com permissão 600, e é montado somente na API como somente leitura. O Node carrega esse arquivo diretamente, sem o Portainer precisar ler o caminho do host.
- `/opt/docker/spherex/repository.git`: clone bare do repositório público.
- `/opt/docker/spherex/api-current-sha`, `frontend-current-sha` e `python-current-sha`: últimas releases publicadas de cada serviço.
- `/opt/docker/spherex/cache`: cache gravável do Python (UID 1000); pode ser apagado, tudo é regenerável.
- `/opt/docker/spherex/lab`: acervo do laboratório (UID 1000): motores congelados, registros, caches por versão e `exports/` para o produto. **Não é regenerável sem horas de download do IRSA; não apague.** `CREDENTIALS.txt` tem o usuário e a senha do lab (gerados no primeiro start; para trocar, apague `auth.json` e `CREDENTIALS.txt` e reinicie o container).
- `/opt/docker/spherex/lab/exports`: montado na API como `/catalog:ro` (`SPHEREX_CATALOG_DIR`) para `/api/catalogo`. Precisa existir (UID 1000) antes do deploy da stack; se o Docker criar a pasta, ela fica com dono root e o lab não consegue exportar.
- `/opt/docker/spherex/current-sha`: SHA do último deploy concluído.
- `/usr/local/sbin/spherex-deploy`: cópia root-owned de `deploy.sh`.
- `/usr/local/bin/spherex-ssh-deploy`: cópia root-owned do comando SSH restrito.
- `/etc/sudoers.d/spherex-deploy`: permite ao usuário de CI executar somente o script de deploy.

Os arquivos `.env` reais têm permissão 600 e não entram no Git. O único secret enviado ao GitHub é a chave exclusiva de deploy; credenciais de outras aplicações não são copiadas para esta stack. Alterações nos scripts instalados em `/usr/local` exigem nova cópia via SSH administrativo; a pipeline não sobrescreve seus próprios comandos privilegiados.

Antes do primeiro deploy independente, atualize uma vez os scripts root-owned no servidor com os arquivos deste repositório (`infra/deploy.sh` e `infra/ssh-deploy.sh`). A chave restrita do Actions não pode instalar esses scripts. Faça essa migração administrativa antes de publicar alterações de `infra/` que ativem os novos argumentos de deploy.

Na raiz do repositório, copie os scripts e instale-os por SSH administrativo:

```sh
scp infra/deploy.sh infra/ssh-deploy.sh ubuntu@150.230.73.212:/tmp/
ssh ubuntu@150.230.73.212 'sudo install -o root -g root -m 755 /tmp/deploy.sh /usr/local/sbin/spherex-deploy && sudo install -o root -g root -m 755 /tmp/ssh-deploy.sh /usr/local/bin/spherex-ssh-deploy && rm -f /tmp/deploy.sh /tmp/ssh-deploy.sh'
```

## Portainer

Stack `spherex`, ambiente `local`. O Compose usa binds fixos para `/opt/docker/spherex/current-api` e `/opt/docker/spherex/current-frontend`, portanto cada serviço pode atualizar sua versão sem recriar o outro. A pipeline recria os serviços pelo Docker Compose no mesmo projeto que o Portainer gerencia. Não é necessário token administrativo do Portainer no Actions.

Se alterar `infra/compose.yaml`, a pipeline aplica o novo arquivo na VPS; atualize também a definição salva no editor da stack antes de fazer um redeploy manual pelo Portainer. Um redeploy manual pela interface usa as releases apontadas pelos links `current-api`, `current-frontend` e `current-python` e a definição salva no Portainer. O script instalado aplica a definição do commit selecionado.

## DNS e TLS

Crie os dois registros A no Cloudflare apontando para `150.230.73.212`:

| Nome na zona prospectordigital.com.br | Destino |
| --- | --- |
| `spherex` | `150.230.73.212` |
| `api.spherex` | `150.230.73.212` |
| `lab.spherex` | `150.230.73.212` |

Comece com **Somente DNS** (nuvem cinza): o resolver existente `lets-encrypt` usa TLS-ALPN e precisa alcançar a VPS diretamente na porta 443 para emitir e renovar certificados. Não ative proxy laranja enquanto este método de validação for usado. Não crie AAAA sem configurar IPv6 na VPS. A rota HTTP já redireciona para HTTPS no Traefik existente.

Depois da propagação, valide os certificados sem `-k`:

```sh
curl --fail https://api.spherex.prospectordigital.com.br/healthz
curl --fail https://spherex.prospectordigital.com.br/healthz
curl -s -o /dev/null -w '%{http_code}\n' https://lab.spherex.prospectordigital.com.br/   # 401 sem senha
```

O frontend usa `VITE_API_BASE_URL=https://api.spherex.prospectordigital.com.br` no build. A API permite CORS somente para `https://spherex.prospectordigital.com.br`. Alterar o domínio da API exige um novo build: ajuste a configuração da VPS e publique um novo commit, para gerar uma release com outro SHA.

## Operação

Conecte por `ssh ubuntu@150.230.73.212`. Na VPS:

```sh
sudo docker compose --project-name spherex --env-file /opt/docker/spherex/.env -f /opt/docker/spherex/compose.yaml ps
sudo docker compose --project-name spherex --env-file /opt/docker/spherex/.env -f /opt/docker/spherex/compose.yaml logs --tail 100
sudo cat /opt/docker/spherex/current-sha
sudo cat /opt/docker/spherex/api-current-sha
sudo cat /opt/docker/spherex/frontend-current-sha
sudo cat /opt/docker/spherex/python-current-sha
sudo cat /opt/docker/spherex/lab-current-sha
sudo cat /opt/docker/spherex/lab/CREDENTIALS.txt
```

Para copiar os dados do lab para o produto (hardlinks preservados):

```sh
sudo rsync -aH /opt/docker/spherex/lab/exports/ /caminho/de/destino/
```

Para rollback administrativo, substitua `SHA_ANTERIOR` por um commit completo que ainda pertence à `main`:

```sh
sudo env SPHEREX_ALLOW_ROLLBACK=1 /usr/local/sbin/spherex-deploy SHA_ANTERIOR stack
```

O rollback é manual por SSH administrativo; a chave do Actions não pode habilitar essa opção. O próximo push na `main` voltará a publicar a nova versão aprovada.

Referências: [gatilhos e concorrência do GitHub Actions](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments), [labels do provider Docker do Traefik](https://doc.traefik.io/traefik/reference/routing-configuration/other-providers/docker/), [TLS-ALPN no Traefik](https://doc.traefik.io/traefik/reference/install-configuration/tls/certificate-resolvers/acme/#tlschallenge).
