# 📚 Apostila Bot

Bot em **discord.js v14** para publicar um painel persistente de apostilas. Um administrador usa `/apostilas` no canal; qualquer pessoa escolhe uma série ou um volume do SP em Ação e recebe botões em uma resposta privada. Depois de reiniciar o bot, o painel antigo continua funcionando, desde que o bot esteja online.

## Situação importante

**Os PDFs com marca d’água não estão incluídos nem hospedados neste projeto.** As 26 entradas estão indisponíveis; nenhum link original é mostrado ao usuário. `watermarked: true` por si só não comprova a marca e não libera link: também é necessária uma entrada revisada em `src/verified-files.js`, atualmente vazia. Antes de qualquer liberação, inspecione o PDF correto e confirme a marca roxa **VyxUtils** no rodapé, hospede exatamente esses bytes em HTTPS e confira em janela anônima, sem autenticação nem página intermediária. Registre a URL exata e o SHA-256 do arquivo inspecionado. Arquivos licenciados devem ser distribuídos apenas com autorização aplicável.

A lista revisada e o hash são registros de uma conferência humana; o bot não baixa, inspeciona nem recalcula hash do PDF a cada clique. Mesmo após a conferência, URLs podem mudar, redirecionar ou expirar. Portanto, só adicione uma URL se a hospedagem e o processo de verificação assegurarem que ela continuará servindo os bytes examinados; caso contrário, mantenha a entrada indisponível. Não há garantia técnica contra uma hospedagem que troque os bytes depois da revisão.

O catálogo contém as URLs de origem das 20 apostilas por série como metadados; elas não são exibidas aos usuários. Os seis links de origem do SP em Ação aparecem somente como metadados `sourceReference`, nunca como botões. Nada aqui converte ou hospeda PDFs automaticamente.

## Requisitos

- Node.js 20+ e npm.
- Uma aplicação/bot no Discord Developer Portal, com token secreto. Instale o bot no servidor com os escopos `bot` e `applications.commands`; dê acesso ao canal, permissão de ver e enviar mensagens, usar comandos e incorporar links/anexar arquivos. Nenhum intent privilegiado é necessário.
- `assets/banner.png`: imagem fornecida pelo usuário. O banner fornecido está incluído no projeto.

## Configuração e execução

1. Instale dependências com `npm install` e copie `.env.example` para `.env`.
2. Preencha `DISCORD_TOKEN` e `DISCORD_CLIENT_ID` no `.env`. Nunca compartilhe nem comite o token. Opcionalmente, preencha `DISCORD_GUILD_ID` para registrar o comando apenas em um servidor e disponibilizá-lo mais rápido. Sem ele, o comando é global e pode levar tempo para aparecer.
3. Execute `npm run register`. O registro adiciona ou atualiza somente `/apostilas`; não substitui os demais comandos da aplicação.
4. Execute `npm start` em uma máquina ou serviço que mantenha o processo online. Registrar o comando não inicia o bot.
5. Como administrador do servidor, use `/apostilas` no canal desejado. A permissão de administrador também é conferida no recebimento da interação. O painel é público e as respostas às escolhas são privadas.

Não foi feito registro, deploy, hospedagem nem teste real no Discord durante a criação do projeto.

## Cadastrar os 26 links com marca d’água

O arquivo padrão é `config/apostilas.json`. Para cada elemento dentro de `groups.<chave>.files`, mantenha o `id`, `label` e `sourceReference`, e, somente após a revisão indicada acima, preencha `url` e `watermarked: true`. Inclua também em `src/verified-files.js`, sob o mesmo `id`, a URL exata e o SHA-256 do arquivo revisado; rever essa alteração de código e reiniciar o bot é obrigatório. Exemplo ilustrativo do catálogo — não é um arquivo hospedado nem uma aprovação:

```json
{ "id": "6-1", "label": "Apostila 1", "sourceReference": "169678/1781599", "url": "https://arquivos.exemplo.org/apostilas/6-1-vyxutils.pdf", "watermarked": true }
```

`6`, `7`, `8`, `9`, `em1`, `em2`, `em3` são as séries (3 arquivos em cada, exceto `em3` com 2); `portugues1` a `portugues3` e `matematica1` a `matematica3` são os seis volumes separados do SP em Ação. O painel mostra os botões já prontos e informa quantos faltam; se nenhum arquivo estiver pronto, informa indisponibilidade. URLs dos originais conhecidos, HTTP, URLs privadas básicas e entradas sem declaração explícita de marca são recusadas. Não é possível garantir que uma URL pública não redirecione, expire ou contenha o PDF errado: teste cada arquivo.

O arquivo é relido em cada interação, então uma atualização **atômica** (escrever outro arquivo e renomear por cima) não exige reinício. Se hospedado em um serviço com disco efêmero, armazene o catálogo em volume persistente e defina `APOSTILAS_CONFIG` com o caminho absoluto desse arquivo; faça backup também dos PDFs e das URLs. Uma edição inválida causa resposta de erro até corrigir o arquivo. Proteja a gravação do catálogo: quem o altera controla os links enviados pelo bot.

## Testes locais sem Discord

`npm test` ou `node --test`. Testes usam mocks e não enviam mensagens, não precisam de credenciais nem rede. Execute também testes reais de hospedagem, PDFs e permissões do servidor antes de disponibilizar o painel.
