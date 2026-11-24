import 'dotenv/config';
import express from 'express';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags
} from 'discord.js';
import { autenticarSalaDoFuturo } from './sedAuth.js';
import {
  listarLivros,
  obterDetalhesLivro,
  obterEstatisticasAluno,
  registrarProgressoLeitura,
  fecharLivro,
  consultarQuiz
} from './leiaspClient.js';

// Servidor HTTP mínimo para manter o Render ativo
const app = express();
app.get('/', (_, res) => res.status(200).send('OK'));
app.listen(process.env.PORT || 3000, () => {
  console.log(`HTTP server ativo na porta ${process.env.PORT || 3000}`);
});

// Sessão temporária apenas em RAM (expira em 30 min, zero persistência em disco)
const sessoes = new Map();
const TTL_MS = 30 * 60 * 1000;

function salvarSessaoTemp(userId, dados) {
  sessoes.set(userId, { ...dados, livrosCache: [], expiraEm: Date.now() + TTL_MS });
}

function obterSessaoTemp(userId) {
  const s = sessoes.get(userId);
  if (!s) return null;
  if (Date.now() > s.expiraEm) {
    sessoes.delete(userId);
    return null;
  }
  return s;
}

// Limpeza periódica de sessões expiradas
setInterval(() => {
  const agora = Date.now();
  for (const [uid, s] of sessoes.entries()) {
    if (agora > s.expiraEm) sessoes.delete(uid);
  }
}, 5 * 60 * 1000);

// Painel público fixo
function criarPainelPublico(bannerUrl) {
  const container = new ContainerBuilder().setAccentColor(0xff6b00);

  if (bannerUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(bannerUrl)
      )
    );
  }

  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '## LeiaSP+\n' +
        'Leio os livros do LeiaSP+ por você e respondo o quiz no fim.\n' +
        'Informe seu RA e senha para iniciar uma sessão temporária (nenhum dado é salvo).'
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_vincular_conta')
          .setLabel('Vincular conta')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('btn_usar_sistema')
          .setLabel('Usar sistema')
          .setStyle(ButtonStyle.Secondary)
      )
    );

  return container;
}

// Painel privado (efêmero) do usuário logado
function criarPainelUsuario(sessao) {
  return new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Olá, ${sessao.nome.toUpperCase()}!\n` +
        `RA \`${sessao.ra}\``
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_meus_livros')
          .setLabel('Meus livros')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('btn_andamento')
          .setLabel('Andamento')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('btn_encerrar_sessao')
          .setLabel('Sair')
          .setStyle(ButtonStyle.Danger)
      )
    );
}

// Painel efêmero de lista de livros (até 25 itens no SelectMenu)
function criarPainelLivros(livros) {
  const pendentes = livros.filter((l) => !l.isComplete);
  const baseExibicao = pendentes.length > 0 ? pendentes : livros;
  const fatia = baseExibicao.slice(0, 25);

  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Meus livros — ${pendentes.length} por ler\n` +
        'Escolha um livro abaixo para ver opções de leitura, tempo e quiz.'
      )
    );

  if (fatia.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('select_livro')
      .setPlaceholder('Escolha um item')
      .addOptions(
        fatia.map((livro) => ({
          label: livro.title.slice(0, 100),
          description: `${livro.progress}% • ${livro.totalPages || '?'} págs • ${livro.isComplete ? 'Lido' : 'Pendente'}`.slice(0, 100),
          value: livro.id
        }))
      );

    container
      .addActionRowComponents(new ActionRowBuilder().addComponents(select))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `Mostrando ${fatia.length} de ${baseExibicao.length} (total no acervo: ${livros.length}).`
        )
      );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Nenhum livro encontrado na sua biblioteca.')
    );
  }

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_meus_livros')
        .setLabel('Atualizar')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('btn_voltar_inicio')
        .setLabel('Voltar')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return container;
}

// Painel de ações de um livro específico
function criarPainelAcoesLivro(livro) {
  return new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${livro.title}\n` +
        `**Autor:** ${livro.author}\n` +
        `**Páginas:** ${livro.currentPage}/${livro.totalPages || '?'} (${livro.progress}%)\n` +
        `**Status:** ${livro.isComplete ? 'Leitura concluída' : 'Em andamento'} | **Quiz:** ${livro.isQuizCompleted ? 'Concluído' : (livro.isQuizActive ? 'Disponível' : 'Pendente')}`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`btn_ler_livro:${livro.id}`)
          .setLabel('Ler + Injetar tempo')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`btn_ver_quiz:${livro.id}`)
          .setLabel('Ver Quiz')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('btn_meus_livros')
          .setLabel('Voltar')
          .setStyle(ButtonStyle.Secondary)
      )
    );
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
  console.log(`Bot online como ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('painel')
      .setDescription('Envia o painel do LeiaSP+ neste canal')
      .addStringOption((opt) =>
        opt
          .setName('banner')
          .setDescription('URL opcional da imagem de banner do painel')
          .setRequired(false)
      )
      .toJSON()
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
});

client.on('interactionCreate', async (interaction) => {
  try {
    // 1. Comando /painel
    if (interaction.isChatInputCommand() && interaction.commandName === 'painel') {
      const bannerUrl = interaction.options.getString('banner');
      await interaction.reply({
        components: [criarPainelPublico(bannerUrl)],
        flags: MessageFlags.IsComponentsV2
      });
      return;
    }

    // 2. Botões
    if (interaction.isButton()) {
      const id = interaction.customId;

      if (id === 'btn_vincular_conta') {
        const modal = new ModalBuilder()
          .setCustomId('modal_login_sed')
          .setTitle('Login Sala do Futuro');

        const raInput = new TextInputBuilder()
          .setCustomId('input_ra')
          .setLabel('RA + Dígito + SP (ex: 1168136416sp)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const senhaInput = new TextInputBuilder()
          .setCustomId('input_senha')
          .setLabel('Senha')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(raInput),
          new ActionRowBuilder().addComponents(senhaInput)
        );

        await interaction.showModal(modal);
        return;
      }

      if (id === 'btn_usar_sistema') {
        const sessao = obterSessaoTemp(interaction.user.id);
        if (!sessao) {
          await interaction.reply({
            content: 'Nenhuma sessão ativa em memória. Clique em **Vincular conta** primeiro.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        await interaction.reply({
          components: [criarPainelUsuario(sessao)],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
        return;
      }

      if (id === 'btn_encerrar_sessao') {
        sessoes.delete(interaction.user.id);
        await interaction.update({
          components: [
            new ContainerBuilder()
              .setAccentColor(0xed4245)
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('Sessão encerrada e removida da memória.')
              )
          ],
          flags: MessageFlags.IsComponentsV2
        });
        return;
      }

      if (id === 'btn_voltar_inicio') {
        const sessao = obterSessaoTemp(interaction.user.id);
        if (!sessao) {
          await interaction.reply({
            content: 'Sessão expirada. Clique em **Vincular conta** novamente.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        await interaction.update({
          components: [criarPainelUsuario(sessao)],
          flags: MessageFlags.IsComponentsV2
        });
        return;
      }

      if (id === 'btn_meus_livros') {
        const sessao = obterSessaoTemp(interaction.user.id);
        if (!sessao) {
          await interaction.reply({
            content: 'Sessão expirada. Clique em **Vincular conta** novamente.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        await interaction.deferUpdate();
        const livros = await listarLivros(sessao.elefanteToken);
        sessao.livrosCache = livros;

        await interaction.editReply({
          components: [criarPainelLivros(livros)],
          flags: MessageFlags.IsComponentsV2
        });
        return;
      }

      if (id === 'btn_andamento') {
        const sessao = obterSessaoTemp(interaction.user.id);
        if (!sessao) {
          await interaction.reply({
            content: 'Sessão expirada. Clique em **Vincular conta** novamente.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        await interaction.deferUpdate();
        const [stats, livros] = await Promise.all([
          obterEstatisticasAluno(sessao.elefanteToken),
          listarLivros(sessao.elefanteToken)
        ]);
        sessao.livrosCache = livros;

        const concluidos = livros.filter((l) => l.isComplete).length;
        const pendentes = livros.length - concluidos;
        const pontos = stats?.Points ?? stats?.points ?? 0;

        const container = new ContainerBuilder()
          .setAccentColor(0x57f287)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## Andamento — ${sessao.nome}\n` +
              `**Livros concluídos:** ${concluidos}\n` +
              `**Livros pendentes:** ${pendentes}\n` +
              `**Pontos acumulados:** ${pontos}`
            )
          )
          .addActionRowComponents(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('btn_voltar_inicio')
                .setLabel('Voltar')
                .setStyle(ButtonStyle.Secondary)
            )
          );

        await interaction.editReply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
        return;
      }

      if (id.startsWith('btn_ler_livro:')) {
        const bookId = id.split(':')[1];
        const sessao = obterSessaoTemp(interaction.user.id);
        if (!sessao) {
          await interaction.reply({
            content: 'Sessão expirada. Clique em **Vincular conta** novamente.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        await interaction.deferUpdate();

        const detalhes = await obterDetalhesLivro(sessao.elefanteToken, bookId).catch(() => ({}));
        const livroCache = sessao.livrosCache.find((l) => l.id === bookId);
        const totalPages = Number(detalhes?.NumberPages ?? detalhes?.TotalPages ?? livroCache?.totalPages ?? 20);
        const tempoInjetado = Math.max(totalPages * 15, 180);

        await registrarProgressoLeitura(sessao.elefanteToken, {
          bookId,
          page: totalPages,
          pageCount: totalPages,
          timeElapsed: tempoInjetado,
          isComplete: true
        });

        await fecharLivro(sessao.elefanteToken, bookId, tempoInjetado, false);

        const container = new ContainerBuilder()
          .setAccentColor(0x57f287)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## Leitura enviada\n` +
              `**Livro:** ${livroCache?.title || bookId}\n` +
              `**Páginas enviadas:** ${totalPages}/${totalPages}\n` +
              `**Tempo registrado:** ${tempoInjetado}s`
            )
          )
          .addActionRowComponents(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`btn_ver_quiz:${bookId}`)
                .setLabel('Abrir Quiz')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId('btn_meus_livros')
                .setLabel('Voltar aos livros')
                .setStyle(ButtonStyle.Secondary)
            )
          );

        await interaction.editReply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
        return;
      }

      if (id.startsWith('btn_ver_quiz:')) {
        const bookId = id.split(':')[1];
        const sessao = obterSessaoTemp(interaction.user.id);
        if (!sessao) {
          await interaction.reply({
            content: 'Sessão expirada. Clique em **Vincular conta** novamente.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        await interaction.deferUpdate();
        const quizData = await consultarQuiz(sessao.elefanteToken, bookId);
        const questoes = Array.isArray(quizData?.Question)
          ? quizData.Question
          : Array.isArray(quizData?.questions)
            ? quizData.questions
            : Array.isArray(quizData)
              ? quizData
              : [];

        const resumo = questoes.length > 0
          ? questoes.slice(0, 5).map((q, idx) => `**${idx + 1}.** ${q.Description || q.Title || q.question || 'Questão carregada'}`).join('\n')
          : 'Nenhuma questão retornada ou quiz ainda não liberado pelo servidor.';

        const container = new ContainerBuilder()
          .setAccentColor(0xfee75c)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## Quiz do Livro (${questoes.length} questões)\n${resumo}`
            )
          )
          .addActionRowComponents(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('btn_meus_livros')
                .setLabel('Voltar aos livros')
                .setStyle(ButtonStyle.Secondary)
            )
          );

        await interaction.editReply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
        return;
      }
    }

    // 3. SelectMenu de escolha de livro
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_livro') {
      const sessao = obterSessaoTemp(interaction.user.id);
      if (!sessao) {
        await interaction.reply({
          content: 'Sessão expirada. Clique em **Vincular conta** novamente.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const bookId = interaction.values[0];
      const livro = sessao.livrosCache.find((l) => l.id === bookId) || {
        id: bookId,
        title: `Livro #${bookId}`,
        author: 'Desconhecido',
        currentPage: 0,
        totalPages: 0,
        progress: 0,
        isComplete: false,
        isQuizCompleted: false,
        isQuizActive: false
      };

      await interaction.update({
        components: [criarPainelAcoesLivro(livro)],
        flags: MessageFlags.IsComponentsV2
      });
      return;
    }

    // 4. Modal de Login
    if (interaction.isModalSubmit() && interaction.customId === 'modal_login_sed') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const ra = interaction.fields.getTextInputValue('input_ra');
      const senha = interaction.fields.getTextInputValue('input_senha');

      const sessao = await autenticarSalaDoFuturo(ra, senha);
      salvarSessaoTemp(interaction.user.id, sessao);

      await interaction.editReply({
        components: [criarPainelUsuario(sessao)],
        flags: MessageFlags.IsComponentsV2
      });
    }
  } catch (err) {
    console.error('Erro na interação:', err.message);
    const msg = `Erro: ${err.message}`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: msg, components: [] }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
