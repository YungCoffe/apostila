# LeiaSP+ Discord Bot (Node.js)

Bot em Node.js (`discord.js` v14 com Components V2 + Express para Render) sem persistência de dados em banco ou disco.

## Arquivos
- `index.js`: Servidor HTTP (Render), painel público `/painel`, modal de login, navegação efêmera e ações.
- `sedAuth.js`: Fluxo de login na SED (sem `Ocp-Apim-Subscription-Key`) e troca de token OAuth para o LeiaSP+ / Elefante Letrado.
- `leiaspClient.js`: Cliente HTTP para listar livros, consultar estatísticas, registrar progresso/tempo de leitura e consultar/enviar quiz.
- `package.json`: Dependências (`discord.js`, `dotenv`, `express`).
- `.env.example`: Variáveis de ambiente necessárias.

## Configuração no Render
1. Suba os arquivos para um repositório no GitHub.
2. Crie um **Web Service** no Render apontando para o repositório.
3. Configure **Build Command**: `npm install` e **Start Command**: `npm start`.
4. Adicione as variáveis de ambiente:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
