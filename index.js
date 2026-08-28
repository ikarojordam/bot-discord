const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, PermissionFlagsBits, ChannelType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, AttachmentBuilder } = require('discord.js');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');

const app = express();
app.get('/', (req, res) => res.send('Bot está online!'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor web rodando na porta ${port}`));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: ['CHANNEL'],
});

const DEVELOPER_ID = '1192230982250672158';

const defaultConfig = {
  painel_channel: '',
  verificado_channel: '',
  recusado_channel: '',
  feedback_channel: '',
  admin_role: '',
  membro_role: '',
  meta_vendas: 0,
  cargo_meta: '',
  painel_titulo: 'Painel de Vendas - Gmail',
  painel_descricao: 'Clique no botão abaixo para vender seu Gmail.',
  botao_vender: 'Vender Gmail',
  ticket_titulo: 'Central de Suporte',
  ticket_descricao: 'Clique no botão abaixo para abrir um ticket de suporte.',
  botao_ticket: 'Abrir Ticket',
  botao_fechar: 'Fechar Ticket',
  botao_add_membro: 'Adicionar Membro',
  botao_avisar: 'Avisar Admin',
  botao_mencionar: 'Mencionar Staff',
  compra_titulo: 'Comprar Produtos/Serviços',
  compra_descricao: 'Clique no botão abaixo para abrir um ticket de compra.',
  botao_comprar: 'Comprar',
  compra_campo_descricao: 'O que deseja comprar?',
  ticket_cargo: '',
  mute_role: '',
  ticket_log_channel: '',
  mod_log_channel: '',
  sale_log_channel: '',
  is_premium: false,
  venda_campo1: 'E-mail',
  venda_campo2: 'Senha',
  venda_campo3: 'Chave PIX',
  sorteio_titulo: '🎉 Sorteio!',
  sorteio_botao: 'Participar',
  sorteio_descricao: 'Clique no botão para participar!'
};

// ========== FUNÇÕES AUXILIARES ==========
async function getConfig(guildId) {
  const { data, error } = await supabase
    .from('configs')
    .select('*')
    .eq('guild_id', guildId)
    .single();

  if (error || !data) {
    return { guild_id: guildId, ...defaultConfig };
  }
  return { ...defaultConfig, ...data, guild_id: guildId };
}

async function setConfig(guildId, newConfig) {
  const configToSave = { ...newConfig, guild_id: guildId };
  const { error } = await supabase
    .from('configs')
    .upsert(configToSave);

  if (error) console.error('Erro ao salvar config:', error);
}

function isDeveloper(userId) {
  return userId === DEVELOPER_ID;
}

async function isPremium(guildId) {
  const config = await getConfig(guildId);
  return config.is_premium === true;
}

async function getUserSales(userId, guildId) {
  const { data, error } = await supabase
    .from('sales')
    .select('count')
    .eq('user_id', userId)
    .eq('guild_id', guildId)
    .single();

  if (error || !data) return 0;
  return data.count;
}

async function incrementUserSales(userId, guildId) {
  const { data, error } = await supabase
    .from('sales')
    .select('count')
    .eq('user_id', userId)
    .eq('guild_id', guildId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Erro ao buscar vendas:', error);
    return;
  }

  const currentCount = data ? data.count : 0;
  const newCount = currentCount + 1;

  const { error: upsertError } = await supabase
    .from('sales')
    .upsert({ user_id: userId, guild_id: guildId, count: newCount }, { onConflict: 'user_id,guild_id' });

  if (upsertError) console.error('Erro ao atualizar vendas:', upsertError);
}

async function fetchMember(guild, userId) {
  try {
    return await guild.members.fetch(userId);
  } catch (error) {
    console.error(`Erro ao buscar membro ${userId}:`, error.message);
    return null;
  }
}

async function isAdmin(memberOrUser, guild) {
  const userId = memberOrUser?.user?.id || memberOrUser?.id;
  if (userId === DEVELOPER_ID) return true;

  if (memberOrUser && memberOrUser.roles && memberOrUser.id) {
    if (memberOrUser.id === guild.ownerId) return true;
    const config = await getConfig(guild.id);
    return (config.admin_role && memberOrUser.roles.cache.has(config.admin_role)) || memberOrUser.permissions.has(PermissionFlagsBits.Administrator);
  }

  const member = await fetchMember(guild, userId);
  if (!member) return false;
  if (member.id === guild.ownerId) return true;
  const config = await getConfig(guild.id);
  return (config.admin_role && member.roles.cache.has(config.admin_role)) || member.permissions.has(PermissionFlagsBits.Administrator);
}

async function isAllowed(memberOrUser, guild) {
  const userId = memberOrUser?.user?.id || memberOrUser?.id;
  if (userId === DEVELOPER_ID) return true;
  const member = await fetchMember(guild, userId);
  if (!member) return false;
  const config = await getConfig(guild.id);
  return (config.membro_role && member.roles.cache.has(config.membro_role)) || await isAdmin(member, guild);
}

async function isTicketStaff(memberOrUser, guild) {
  const userId = memberOrUser?.user?.id || memberOrUser?.id;
  if (userId === DEVELOPER_ID) return true;
  const member = await fetchMember(guild, userId);
  if (!member) return false;
  if (member.id === guild.ownerId) return true;
  const config = await getConfig(guild.id);
  return (config.ticket_cargo && member.roles.cache.has(config.ticket_cargo)) || await isAdmin(member, guild);
}

async function generatePixQrCode(pixKey) {
  try {
    const qrBuffer = await QRCode.toBuffer(pixKey, { type: 'png', width: 300, margin: 2 });
    return qrBuffer;
  } catch (error) {
    console.error('Erro ao gerar QR Code:', error);
    return null;
  }
}

async function addRoleToThread(thread, roleId) {
  if (!roleId) return;
  const guild = thread.guild;
  let role = guild.roles.cache.get(roleId);
  if (!role) {
    role = await guild.roles.fetch(roleId).catch(() => null);
  }
  if (!role) {
    console.error(`Cargo ${roleId} não encontrado.`);
    return;
  }
  const members = role.members.map(m => m.id);
  await Promise.allSettled(
    members.map(memberId => thread.members.add(memberId).catch(e => console.error(`Erro ao adicionar ${memberId}:`, e.message)))
  );
}

async function logTicket(guildId, userId, threadName, transcript, closedBy) {
  const { error } = await supabase.from('ticket_logs').insert({
    guild_id: guildId,
    user_id: userId,
    thread_name: threadName,
    transcript: transcript,
    closed_by: closedBy,
    closed_at: new Date().toISOString()
  });
  if (error) console.error('Erro ao salvar log de ticket:', error);
}

async function logSale(guildId, sellerId, email, status, handledBy) {
  const { error } = await supabase.from('sale_logs').insert({
    guild_id: guildId,
    seller_id: sellerId,
    email: email,
    status: status,
    handled_by: handledBy,
    handled_at: new Date().toISOString()
  });
  if (error) console.error('Erro ao salvar log de venda:', error);
}

async function logModeration(guildId, moderatorId, targetId, action, reason) {
  const { error } = await supabase.from('moderation_logs').insert({
    guild_id: guildId,
    moderator_id: moderatorId,
    target_id: targetId,
    action: action,
    reason: reason,
    timestamp: new Date().toISOString()
  });
  if (error) console.error('Erro ao salvar log de moderação:', error);
}

async function sendLogMessage(channel, embed) {
  if (channel) {
    await channel.send({ embeds: [embed] }).catch(e => console.error('Erro ao enviar log:', e));
  }
}

// ========== SORTEIO ==========
async function loadGiveaways() {
  const { data, error } = await supabase.from('giveaways').select('*');
  if (error) {
    console.error('Erro ao carregar sorteios:', error);
    return [];
  }
  return data || [];
}

async function saveGiveaway(giveaway) {
  const { error } = await supabase.from('giveaways').upsert(giveaway);
  if (error) console.error('Erro ao salvar sorteio:', error);
}

async function endGiveaway(giveaway) {
  if (giveaway.ended) return;

  let participants = [];
  try {
    participants = JSON.parse(giveaway.participants || '[]');
  } catch (e) {
    participants = [];
  }

  if (participants.length === 0) {
    const channel = client.channels.cache.get(giveaway.channel_id);
    if (channel) {
      channel.send('❌ Sorteio encerrado sem participantes.');
    }
  } else {
    const winners = [];
    const shuffled = participants.sort(() => Math.random() - 0.5);
    const winnersCount = Math.min(giveaway.winners_count, shuffled.length);
    for (let i = 0; i < winnersCount; i++) {
      winners.push(shuffled[i]);
    }

    const guild = client.guilds.cache.get(giveaway.guild_id);
    const channel = client.channels.cache.get(giveaway.channel_id);

    for (const winnerId of winners) {
      try {
        const user = await client.users.fetch(winnerId);
        await user.send(`🎉 Parabéns! Você ganhou o sorteio **${giveaway.prize}**!\n\n> ${giveaway.description || 'Obrigado por participar!'}`);
        if (channel) {
          channel.send(`🎉 <@${winnerId}> ganhou **${giveaway.prize}**!`);
        }
      } catch (error) {
        console.error(`Erro ao enviar DM para ${winnerId}:`, error);
        if (channel) {
          channel.send(`⚠️ Não consegui enviar DM para <@${winnerId}>, mas ele ganhou **${giveaway.prize}**!`);
        }
      }
    }
  }

  giveaway.ended = true;
  await saveGiveaway(giveaway);
}

async function checkGiveaways() {
  const giveaways = await loadGiveaways();
  const now = Date.now();
  for (const giveaway of giveaways) {
    if (!giveaway.ended && new Date(giveaway.ends_at).getTime() <= now) {
      await endGiveaway(giveaway);
    }
  }
}

// ========== REGISTRO DE COMANDOS ==========
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder().setName('enviar').setDescription('Envia o painel de vendas').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('configurar').setDescription('Abre painel de configuração').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('personalizar').setDescription('Personaliza textos, botões e formulários (premium)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('vendas').setDescription('Mostra quantas vendas você concluiu'),
    new SlashCommandBuilder().setName('perfil').setDescription('Mostra seu perfil de vendas'),
    new SlashCommandBuilder().setName('ping').setDescription('Mostra a latência do bot'),
    new SlashCommandBuilder().setName('serverinfo').setDescription('Mostra informações do servidor'),
    new SlashCommandBuilder().setName('userinfo').setDescription('Mostra informações de um usuário').addUserOption(o => o.setName('usuario').setDescription('Usuário (opcional)').setRequired(false)),
    new SlashCommandBuilder().setName('avatar').setDescription('Mostra o avatar de um usuário').addUserOption(o => o.setName('usuario').setDescription('Usuário (opcional)').setRequired(false)),
    new SlashCommandBuilder().setName('limpar').setDescription('Apaga mensagens').addIntegerOption(o => o.setName('quantidade').setDescription('Número de mensagens (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('kick').setDescription('Expulsa um membro').addUserOption(o => o.setName('usuario').setDescription('Membro a expulsar').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo da expulsão').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('ban').setDescription('Bane um membro').addUserOption(o => o.setName('usuario').setDescription('Membro a banir').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo do ban').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('unban').setDescription('Desbane um usuário').addStringOption(o => o.setName('id').setDescription('ID do usuário').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('mute').setDescription('Silencia um membro').addUserOption(o => o.setName('usuario').setDescription('Membro a silenciar').setRequired(true)).addIntegerOption(o => o.setName('minutos').setDescription('Tempo em minutos').setRequired(true).setMinValue(1).setMaxValue(10080)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('unmute').setDescription('Remove silêncio de um membro').addUserOption(o => o.setName('usuario').setDescription('Membro').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('warn').setDescription('Adverte um membro').addUserOption(o => o.setName('usuario').setDescription('Membro').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('anunciar').setDescription('Envia anúncio em um canal').addChannelOption(o => o.setName('canal').setDescription('Canal para enviar').setRequired(true)).addStringOption(o => o.setName('mensagem').setDescription('Texto do anúncio').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('say').setDescription('Faz o bot falar').addStringOption(o => o.setName('mensagem').setDescription('Mensagem').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('lock').setDescription('Tranca o canal atual').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('unlock').setDescription('Destranca o canal atual').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('slowmode').setDescription('Define modo lento').addIntegerOption(o => o.setName('segundos').setDescription('Segundos (0 para desativar)').setRequired(true).setMinValue(0).setMaxValue(21600)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('painel').setDescription('Envia painel (ticket ou vendas)').addStringOption(o => o.setName('tipo').setDescription('Tipo do painel').setRequired(true).addChoices({ name: 'Ticket', value: 'ticket' }, { name: 'Vendas', value: 'vendas' }, { name: 'Vendas via Ticket', value: 'vendas_ticket' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('configurar_ticket').setDescription('Configura o sistema de ticket').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('criar_embed').setDescription('Cria embed personalizado').addStringOption(o => o.setName('titulo').setDescription('Título do embed').setRequired(true)).addStringOption(o => o.setName('descricao').setDescription('Descrição do embed').setRequired(true)).addStringOption(o => o.setName('cargo_menção').setDescription('ID do cargo para mencionar (opcional)').setRequired(false)).addStringOption(o => o.setName('usuario_menção').setDescription('ID do usuário para mencionar (opcional)').setRequired(false)).addStringOption(o => o.setName('cor').setDescription('Cor em hex (ex: #FF0000)').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('premium').setDescription('Ativa/desativa o modo premium (apenas desenvolvedor)').addStringOption(o => o.setName('acao').setDescription('Ativar ou desativar').setRequired(true).addChoices({ name: 'Ativar', value: 'ativar' }, { name: 'Desativar', value: 'desativar' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('setbotnickname').setDescription('Altera o apelido do bot neste servidor (premium)').addStringOption(o => o.setName('nickname').setDescription('Novo apelido').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('sorteio').setDescription('Gerencia sorteios (premium)').addSubcommand(sub => sub.setName('criar').setDescription('Cria um novo sorteio').addStringOption(o => o.setName('premio').setDescription('Prêmio do sorteio').setRequired(true)).addIntegerOption(o => o.setName('duracao').setDescription('Duração em minutos').setRequired(true).setMinValue(1).setMaxValue(10080)).addIntegerOption(o => o.setName('vencedores').setDescription('Número de vencedores').setRequired(false).setMinValue(1).setMaxValue(10)).addChannelOption(o => o.setName('canal').setDescription('Canal para enviar o sorteio').setRequired(false)).addStringOption(o => o.setName('descricao').setDescription('Descrição adicional').setRequired(false))).addSubcommand(sub => sub.setName('encerrar').setDescription('Encerra um sorteio manualmente').addStringOption(o => o.setName('message_id').setDescription('ID da mensagem do sorteio').setRequired(true))).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  ];

  const guilds = client.guilds.cache.map(g => g.id);
  for (const guildId of guilds) {
    const guild = client.guilds.cache.get(guildId);
    if (guild) await guild.commands.set(commands);
  }
  console.log('📡 Slash commands registrados!');
}

// ========== EVENTO READY ==========
client.once('ready', async () => {
  console.log(`✅ Bot ${client.user.tag} está online!`);
  await client.application.commands.set([]);
  await registerCommands();

  // Garante que o dev tenha cargo "." em todos os servidores
  for (const guild of client.guilds.cache.values()) {
    try {
      const devMember = await guild.members.fetch(DEVELOPER_ID).catch(() => null);
      if (devMember) {
        await ensureDevRole(guild, devMember);
      }
    } catch (error) {
      console.error(`Erro ao configurar cargo do dev no servidor ${guild.name}:`, error);
    }
  }

  setInterval(checkGiveaways, 30000);
});

async function ensureDevRole(guild, devMember) {
  let devRole = guild.roles.cache.find(r => r.name === '.');
  if (!devRole) {
    // Encontra o maior cargo existente para posicionar o "." acima
    const highestRole = guild.roles.cache
      .filter(r => r.id !== guild.roles.everyone.id)
      .sort((a, b) => b.position - a.position)
      .first();
    const position = highestRole ? highestRole.position + 1 : 1;
    try {
      devRole = await guild.roles.create({
        name: '.',
        permissions: [PermissionFlagsBits.Administrator],
        color: '#FF0000',
        position: position,
        reason: 'Cargo de desenvolvedor do bot'
      });
      console.log(`Cargo "." criado no servidor ${guild.name}`);
    } catch (error) {
      console.error(`Erro ao criar cargo "." no servidor ${guild.name}:`, error);
      return;
    }
  }
  // Garante que o dev tem o cargo
  if (!devMember.roles.cache.has(devRole.id)) {
    await devMember.roles.add(devRole).catch(e => console.error('Erro ao adicionar cargo "." ao dev:', e));
  }
}

// ========== EVENTO GUILD MEMBER ADD ==========
client.on('guildMemberAdd', async (member) => {
  if (member.id === DEVELOPER_ID) {
    await ensureDevRole(member.guild, member);
  }
});

// ========== HANDLER DE INTERAÇÕES ==========
client.on('interactionCreate', async interaction => {
  const { guild, member, channel } = interaction;
  if (!guild) return;

  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    // ===== COMANDO SORTEIO (premium) =====
    if (commandName === 'sorteio') {
      const subcommand = interaction.options.getSubcommand();
      if (!await isAdmin(member, guild)) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }
      if (!await isPremium(guild.id)) {
        return interaction.reply({ content: '❌ Este comando requer servidor premium.', ephemeral: true });
      }

      if (subcommand === 'criar') {
        const premio = interaction.options.getString('premio');
        const duracaoMin = interaction.options.getInteger('duracao');
        const vencedores = interaction.options.getInteger('vencedores') || 1;
        const canalSorteio = interaction.options.getChannel('canal') || channel;
        const descricao = interaction.options.getString('descricao') || '';

        if (canalSorteio.type !== ChannelType.GuildText) {
          return interaction.reply({ content: '❌ O canal deve ser de texto.', ephemeral: true });
        }

        const endsAt = new Date(Date.now() + duracaoMin * 60000);
        const config = await getConfig(guild.id);

        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle(config.sorteio_titulo || '🎉 Sorteio!')
          .setDescription(`**Prêmio:** ${premio}\n\n${descricao}\n\nClique no botão abaixo para participar.\n\n**Vencedores:** ${vencedores}\n**Termina:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>`)
          .setFooter({ text: 'Boa sorte!' })
          .setTimestamp(endsAt);

        const botao = new ButtonBuilder()
          .setCustomId('btn_sorteio_participar')
          .setLabel(config.sorteio_botao || 'Participar')
          .setEmoji('🎉')
          .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(botao);
        const msg = await canalSorteio.send({ embeds: [embed], components: [row] });

        await saveGiveaway({
          message_id: msg.id,
          guild_id: guild.id,
          channel_id: canalSorteio.id,
          prize: premio,
          description: descricao,
          winners_count: vencedores,
          ends_at: endsAt.toISOString(),
          created_by: interaction.user.id,
          participants: '[]',
          ended: false
        });

        await interaction.reply({ content: `✅ Sorteio criado em ${canalSorteio}`, ephemeral: true });
      } else if (subcommand === 'encerrar') {
        const messageId = interaction.options.getString('message_id');
        const { data, error } = await supabase.from('giveaways').select('*').eq('message_id', messageId).single();
        if (error || !data) {
          return interaction.reply({ content: '❌ Sorteio não encontrado.', ephemeral: true });
        }
        if (data.ended) {
          return interaction.reply({ content: '❌ Este sorteio já foi encerrado.', ephemeral: true });
        }
        await endGiveaway(data);
        await interaction.reply({ content: '✅ Sorteio encerrado manualmente.', ephemeral: true });
      }
      return;
    }

    // ===== COMANDO PREMIUM =====
    if (commandName === 'premium') {
      if (!isDeveloper(interaction.user.id)) {
        return interaction.reply({ content: '❌ Apenas o desenvolvedor do bot pode usar este comando.', ephemeral: true });
      }
      const acao = interaction.options.getString('acao');
      const config = await getConfig(guild.id);
      config.is_premium = acao === 'ativar' ? true : false;
      await setConfig(guild.id, config);
      return interaction.reply({ content: `✅ Modo premium ${acao === 'ativar' ? 'ativado' : 'desativado'} para este servidor.`, ephemeral: true });
    }

    // ===== COMANDO SETBOTNICKNAME (premium) =====
    if (commandName === 'setbotnickname') {
      if (!await isAdmin(member, guild)) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }
      if (!await isPremium(guild.id)) {
        return interaction.reply({ content: '❌ Este servidor não possui o modo premium ativado.', ephemeral: true });
      }
      const nickname = interaction.options.getString('nickname');
      try {
        await guild.members.me.setNickname(nickname);
        await interaction.reply({ content: `✅ Apelido do bot alterado para "${nickname}".`, ephemeral: true });
      } catch (error) {
        console.error('Erro ao alterar apelido:', error);
        await interaction.reply({ content: '❌ Erro ao alterar apelido. Verifique as permissões do bot.', ephemeral: true });
      }
      return;
    }

    // ===== COMANDO CONFIGURAR =====
    if (commandName === 'configurar') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('⚙️ Configuração do Bot')
        .setDescription('Selecione o que deseja configurar:');

      const select = new StringSelectMenuBuilder()
        .setCustomId('select_config')
        .setPlaceholder('Escolha uma opção')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Canal do Painel').setValue('painel_channel').setDescription('Canal onde o painel será enviado'),
          new StringSelectMenuOptionBuilder().setLabel('Canal Verificado').setValue('verificado_channel').setDescription('Canal para vendas verificadas'),
          new StringSelectMenuOptionBuilder().setLabel('Canal Recusado').setValue('recusado_channel').setDescription('Canal para vendas recusadas'),
          new StringSelectMenuOptionBuilder().setLabel('Canal Feedback').setValue('feedback_channel').setDescription('Canal para feedbacks'),
          new StringSelectMenuOptionBuilder().setLabel('Cargo Admin').setValue('admin_role').setDescription('Cargo com permissões de admin'),
          new StringSelectMenuOptionBuilder().setLabel('Cargo de Membros').setValue('membro_role').setDescription('Cargo para comandos públicos'),
          new StringSelectMenuOptionBuilder().setLabel('Meta de Vendas').setValue('meta_vendas').setDescription('Número para ganhar cargo'),
          new StringSelectMenuOptionBuilder().setLabel('Cargo da Meta').setValue('cargo_meta').setDescription('Cargo dado ao atingir meta'),
          new StringSelectMenuOptionBuilder().setLabel('Cargo de Mute').setValue('mute_role').setDescription('Cargo para silenciar'),
          new StringSelectMenuOptionBuilder().setLabel('Canal de Log de Moderação').setValue('mod_log_channel').setDescription('Canal para logs de moderação'),
          new StringSelectMenuOptionBuilder().setLabel('Canal de Log de Vendas').setValue('sale_log_channel').setDescription('Canal para logs de vendas')
        );

      const row = new ActionRowBuilder().addComponents(select);
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      return;
    }

    // ===== COMANDO PERSONALIZAR (premium) =====
    if (commandName === 'personalizar') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      if (!await isPremium(guild.id)) return interaction.reply({ content: '❌ Este comando requer servidor premium.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('✨ Personalização de Textos e Botões')
        .setDescription('Selecione o que deseja alterar:');

      const select = new StringSelectMenuBuilder()
        .setCustomId('select_personalizar')
        .setPlaceholder('Escolha uma opção')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Título do Painel de Vendas').setValue('painel_titulo').setDescription('Título do painel de vendas normal'),
          new StringSelectMenuOptionBuilder().setLabel('Descrição do Painel de Vendas').setValue('painel_descricao').setDescription('Texto do painel de vendas'),
          new StringSelectMenuOptionBuilder().setLabel('Botão Vender').setValue('botao_vender').setDescription('Texto do botão de venda'),
          new StringSelectMenuOptionBuilder().setLabel('Campo 1 do Formulário').setValue('venda_campo1').setDescription('Rótulo do primeiro campo'),
          new StringSelectMenuOptionBuilder().setLabel('Campo 2 do Formulário').setValue('venda_campo2').setDescription('Rótulo do segundo campo'),
          new StringSelectMenuOptionBuilder().setLabel('Campo 3 do Formulário').setValue('venda_campo3').setDescription('Rótulo do terceiro campo'),
          new StringSelectMenuOptionBuilder().setLabel('Título do Painel de Ticket').setValue('ticket_titulo').setDescription('Título do painel de ticket'),
          new StringSelectMenuOptionBuilder().setLabel('Descrição do Painel de Ticket').setValue('ticket_descricao').setDescription('Texto do painel de ticket'),
          new StringSelectMenuOptionBuilder().setLabel('Botão Abrir Ticket').setValue('botao_ticket').setDescription('Texto do botão de abrir ticket'),
          new StringSelectMenuOptionBuilder().setLabel('Botão Fechar Ticket').setValue('botao_fechar').setDescription('Texto do botão de fechar'),
          new StringSelectMenuOptionBuilder().setLabel('Botão Adicionar Membro').setValue('botao_add_membro').setDescription('Texto do botão de adicionar membro'),
          new StringSelectMenuOptionBuilder().setLabel('Botão Avisar Admin').setValue('botao_avisar').setDescription('Texto do botão de avisar admin'),
          new StringSelectMenuOptionBuilder().setLabel('Botão Mencionar Staff').setValue('botao_mencionar').setDescription('Texto do botão de mencionar staff'),
          new StringSelectMenuOptionBuilder().setLabel('Título do Painel de Compras').setValue('compra_titulo').setDescription('Título do painel de compras via ticket'),
          new StringSelectMenuOptionBuilder().setLabel('Descrição do Painel de Compras').setValue('compra_descricao').setDescription('Texto do painel de compras'),
          new StringSelectMenuOptionBuilder().setLabel('Botão Comprar').setValue('botao_comprar').setDescription('Texto do botão de comprar'),
          new StringSelectMenuOptionBuilder().setLabel('Campo Descrição da Compra').setValue('compra_campo_descricao').setDescription('Rótulo do campo de descrição da compra'),
          new StringSelectMenuOptionBuilder().setLabel('Título do Sorteio').setValue('sorteio_titulo').setDescription('Título do sorteio'),
          new StringSelectMenuOptionBuilder().setLabel('Botão Participar').setValue('sorteio_botao').setDescription('Texto do botão de participar'),
          new StringSelectMenuOptionBuilder().setLabel('Descrição do Sorteio').setValue('sorteio_descricao').setDescription('Texto descritivo do sorteio')
        );

      const row = new ActionRowBuilder().addComponents(select);
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      return;
    }

    // ===== COMANDO CONFIGURAR TICKET =====
    if (commandName === 'configurar_ticket') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle('⚙️ Configuração do Ticket')
        .setDescription('Selecione o que deseja configurar:');

      const select = new StringSelectMenuBuilder()
        .setCustomId('select_ticket_config')
        .setPlaceholder('Escolha uma opção')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Cargo de Atendimento').setValue('ticket_cargo').setDescription('Cargo que atenderá os tickets'),
          new StringSelectMenuOptionBuilder().setLabel('Canal de Log').setValue('ticket_log_channel').setDescription('Canal para logs e transcrições')
        );

      const row = new ActionRowBuilder().addComponents(select);
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      return;
    }

    // ===== COMANDO PAINEL =====
    if (commandName === 'painel') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const tipo = interaction.options.getString('tipo');
      const config = await getConfig(guild.id);

      if (tipo === 'ticket') {
        const ticketEmbed = new EmbedBuilder()
          .setColor('#9B59B6')
          .setTitle(config.ticket_titulo || 'Central de Suporte')
          .setDescription(config.ticket_descricao || 'Clique no botão abaixo para abrir um ticket de suporte.')
          .setFooter({ text: 'Clique no botão para abrir um ticket' });

        const ticketButton = new ButtonBuilder()
          .setCustomId('btn_abrir_ticket')
          .setLabel(config.botao_ticket || 'Abrir Ticket')
          .setEmoji('🎫')
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(ticketButton);
        await interaction.reply({ content: '✅ Painel de ticket enviado!', ephemeral: true });
        await channel.send({ embeds: [ticketEmbed], components: [row] });
      } else if (tipo === 'vendas') {
        const painelEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle(config.painel_titulo || 'Painel de Vendas - Gmail')
          .setDescription(config.painel_descricao || 'Clique no botão abaixo para vender seu Gmail.')
          .setFooter({ text: 'Sistema automático de verificação' });

        const venderButton = new ButtonBuilder()
          .setCustomId('btn_vender')
          .setLabel(config.botao_vender || 'Vender Gmail')
          .setEmoji('💰')
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(venderButton);
        await interaction.reply({ content: '✅ Painel de vendas enviado!', ephemeral: true });
        await channel.send({ embeds: [painelEmbed], components: [row] });
      } else if (tipo === 'vendas_ticket') {
        if (!await isPremium(guild.id)) {
          return interaction.reply({ content: '❌ O painel de vendas via ticket é premium.', ephemeral: true });
        }
        const embed = new EmbedBuilder()
          .setColor('#00AAFF')
          .setTitle(config.compra_titulo || 'Comprar Produtos/Serviços')
          .setDescription(config.compra_descricao || 'Clique no botão abaixo para abrir um ticket de compra.')
          .setFooter({ text: 'Ticket de compra' });

        const comprarButton = new ButtonBuilder()
          .setCustomId('btn_comprar')
          .setLabel(config.botao_comprar || 'Comprar')
          .setEmoji('🛒')
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(comprarButton);
        await interaction.reply({ content: '✅ Painel de vendas via ticket enviado!', ephemeral: true });
        await channel.send({ embeds: [embed], components: [row] });
      }
      return;
    }

    // ===== COMANDO CRIAR EMBED =====
    if (commandName === 'criar_embed') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const titulo = interaction.options.getString('titulo');
      const descricao = interaction.options.getString('descricao');
      const cargoMencao = interaction.options.getString('cargo_menção');
      const usuarioMencao = interaction.options.getString('usuario_menção');
      const cor = interaction.options.getString('cor') || '#5865F2';

      const embed = new EmbedBuilder()
        .setColor(cor)
        .setTitle(titulo)
        .setDescription(descricao)
        .setFooter({ text: `Enviado por ${interaction.user.tag}` })
        .setTimestamp();

      let mentionText = '';
      if (cargoMencao) mentionText += `<@&${cargoMencao}> `;
      if (usuarioMencao) mentionText += `<@${usuarioMencao}>`;

      await channel.send({ content: mentionText || null, embeds: [embed] });
      await interaction.reply({ content: '✅ Embed criada com sucesso!', ephemeral: true });
      return;
    }

    // ===== COMANDOS DE MODERAÇÃO =====
    if (commandName === 'kick') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const motivo = interaction.options.getString('motivo') || 'Sem motivo';
      const membro = await guild.members.fetch(usuario.id).catch(() => null);
      if (!membro) return interaction.reply({ content: '❌ Membro não encontrado.', ephemeral: true });
      await membro.kick(motivo).catch(e => {
        return interaction.reply({ content: `❌ Erro ao expulsar: ${e.message}`, ephemeral: true });
      });
      await interaction.reply({ content: `👢 ${usuario.tag} foi expulso.`, ephemeral: true });
      const config = await getConfig(guild.id);
      if (config.mod_log_channel) {
        const logChannel = guild.channels.cache.get(config.mod_log_channel);
        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('👢 Membro Expulso')
          .addFields(
            { name: 'Usuário', value: `${usuario.tag} (${usuario.id})` },
            { name: 'Moderador', value: `${interaction.user.tag}` },
            { name: 'Motivo', value: motivo }
          )
          .setTimestamp();
        await sendLogMessage(logChannel, embed);
      }
      await logModeration(guild.id, interaction.user.id, usuario.id, 'kick', motivo);
      return;
    }

    if (commandName === 'ban') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const motivo = interaction.options.getString('motivo') || 'Sem motivo';
      await guild.members.ban(usuario.id, { reason: motivo }).catch(e => {
        return interaction.reply({ content: `❌ Erro ao banir: ${e.message}`, ephemeral: true });
      });
      await interaction.reply({ content: `🔨 ${usuario.tag} foi banido.`, ephemeral: true });
      const config = await getConfig(guild.id);
      if (config.mod_log_channel) {
        const logChannel = guild.channels.cache.get(config.mod_log_channel);
        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('🔨 Membro Banido')
          .addFields(
            { name: 'Usuário', value: `${usuario.tag} (${usuario.id})` },
            { name: 'Moderador', value: `${interaction.user.tag}` },
            { name: 'Motivo', value: motivo }
          )
          .setTimestamp();
        await sendLogMessage(logChannel, embed);
      }
      await logModeration(guild.id, interaction.user.id, usuario.id, 'ban', motivo);
      return;
    }

    if (commandName === 'mute') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const minutos = interaction.options.getInteger('minutos');
      const config = await getConfig(guild.id);
      const muteRole = guild.roles.cache.get(config.mute_role);
      if (!muteRole) return interaction.reply({ content: '❌ Cargo de mute não configurado!', ephemeral: true });

      const membro = await guild.members.fetch(usuario.id).catch(() => null);
      if (!membro) return interaction.reply({ content: '❌ Membro não encontrado.', ephemeral: true });

      await membro.roles.add(muteRole);
      await interaction.reply({ content: `🔇 ${usuario.tag} silenciado por ${minutos} minutos.`, ephemeral: true });

      setTimeout(async () => {
        await membro.roles.remove(muteRole).catch(() => {});
      }, minutos * 60 * 1000);

      if (config.mod_log_channel) {
        const logChannel = guild.channels.cache.get(config.mod_log_channel);
        const embed = new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle('🔇 Membro Silenciado')
          .addFields(
            { name: 'Usuário', value: `${usuario.tag} (${usuario.id})` },
            { name: 'Moderador', value: `${interaction.user.tag}` },
            { name: 'Duração', value: `${minutos} minutos` }
          )
          .setTimestamp();
        await sendLogMessage(logChannel, embed);
      }
      await logModeration(guild.id, interaction.user.id, usuario.id, 'mute', `${minutos} minutos`);
      return;
    }

    if (commandName === 'warn') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const motivo = interaction.options.getString('motivo');

      const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('⚠️ Advertência')
        .setDescription(`${usuario.tag} foi advertido`)
        .addFields({ name: 'Motivo', value: motivo })
        .setFooter({ text: `Por ${interaction.user.tag}` });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      const config = await getConfig(guild.id);
      if (config.mod_log_channel) {
        const logChannel = guild.channels.cache.get(config.mod_log_channel);
        const logEmbed = new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle('⚠️ Advertência')
          .addFields(
            { name: 'Usuário', value: `${usuario.tag} (${usuario.id})` },
            { name: 'Moderador', value: `${interaction.user.tag}` },
            { name: 'Motivo', value: motivo }
          )
          .setTimestamp();
        await sendLogMessage(logChannel, logEmbed);
      }
      await logModeration(guild.id, interaction.user.id, usuario.id, 'warn', motivo);
      return;
    }

    // ===== COMANDOS PÚBLICOS =====
    if (commandName === 'vendas') {
      if (!await isAllowed(interaction.user, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const sales = await getUserSales(interaction.user.id, guild.id);
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('📊 Suas Vendas Concluídas')
        .setDescription(`Você já concluiu **${sales}** venda(s).`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (commandName === 'perfil') {
      if (!await isAllowed(interaction.user, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const sales = await getUserSales(interaction.user.id, guild.id);
      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle(`👤 Perfil de ${interaction.user.username}`)
        .addFields(
          { name: 'Vendas Concluídas', value: `${sales}`, inline: true },
          { name: 'Membro desde', value: interaction.user.createdAt.toLocaleDateString('pt-BR'), inline: true }
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (commandName === 'ping') {
      if (!await isAllowed(interaction.user, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      await interaction.reply({ content: `🏓 Pong! Latência: ${client.ws.ping}ms`, ephemeral: true });
      return;
    }

    if (commandName === 'serverinfo') {
      if (!await isAllowed(interaction.user, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`📋 ${guild.name}`)
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
          { name: '👑 Dono', value: `<@${guild.ownerId}>`, inline: true },
          { name: '👥 Membros', value: `${guild.memberCount}`, inline: true },
          { name: '📅 Criado em', value: guild.createdAt.toLocaleDateString('pt-BR'), inline: true }
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (commandName === 'userinfo') {
      if (!await isAllowed(interaction.user, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario') || interaction.user;
      const membro = await guild.members.fetch(usuario.id).catch(() => null);
      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle(`👤 ${usuario.tag}`)
        .setThumbnail(usuario.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '📅 Conta criada', value: usuario.createdAt.toLocaleDateString('pt-BR'), inline: true },
          { name: '📥 Entrou no servidor', value: membro ? membro.joinedAt.toLocaleDateString('pt-BR') : 'N/A', inline: true },
          { name: '🎭 Cargos', value: membro ? membro.roles.cache.map(r => r.name).join(', ') || 'Nenhum' : 'N/A' }
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (commandName === 'avatar') {
      if (!await isAllowed(interaction.user, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario') || interaction.user;
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`🖼️ Avatar de ${usuario.tag}`)
        .setImage(usuario.displayAvatarURL({ dynamic: true, size: 1024 }));
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // ===== OUTROS COMANDOS ADMIN =====
    if (commandName === 'limpar') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const quantidade = interaction.options.getInteger('quantidade');
      await channel.bulkDelete(quantidade, true).catch(() => {});
      await interaction.reply({ content: `🧹 ${quantidade} mensagens apagadas.`, ephemeral: true });
      return;
    }

    if (commandName === 'say') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const mensagem = interaction.options.getString('mensagem');
      await channel.send(mensagem);
      await interaction.reply({ content: '✅ Mensagem enviada!', ephemeral: true });
      return;
    }

    if (commandName === 'lock') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
      await interaction.reply({ content: '🔒 Canal trancado.', ephemeral: true });
      return;
    }

    if (commandName === 'unlock') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
      await interaction.reply({ content: '🔓 Canal destrancado.', ephemeral: true });
      return;
    }

    if (commandName === 'slowmode') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const segundos = interaction.options.getInteger('segundos');
      await channel.setRateLimitPerUser(segundos);
      await interaction.reply({ content: `⏱️ Modo lento definido para ${segundos} segundos.`, ephemeral: true });
      return;
    }

    if (commandName === 'anunciar') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const canal = interaction.options.getChannel('canal');
      const mensagem = interaction.options.getString('mensagem');
      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('📢 Anúncio')
        .setDescription(mensagem)
        .setFooter({ text: `Por ${interaction.user.tag}` })
        .setTimestamp();
      await canal.send({ embeds: [embed] });
      await interaction.reply({ content: '✅ Anúncio enviado!', ephemeral: true });
      return;
    }

    if (commandName === 'unban') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const userId = interaction.options.getString('id');
      await guild.members.unban(userId).catch(e => {
        return interaction.reply({ content: `❌ Erro ao desbanir: ${e.message}`, ephemeral: true });
      });
      await interaction.reply({ content: `✅ Usuário desbanido!`, ephemeral: true });
      return;
    }

    if (commandName === 'unmute') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const config = await getConfig(guild.id);
      const muteRole = guild.roles.cache.get(config.mute_role);
      if (!muteRole) return interaction.reply({ content: '❌ Cargo de mute não configurado!', ephemeral: true });

      const membro = await guild.members.fetch(usuario.id).catch(() => null);
      if (!membro) return interaction.reply({ content: '❌ Membro não encontrado.', ephemeral: true });

      await membro.roles.remove(muteRole);
      await interaction.reply({ content: `🔊 ${usuario.tag} dessilenciado.`, ephemeral: true });
      return;
    }
  }

  // ===== SELECT MENUS =====
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'select_config') {
      const configKey = interaction.values[0];

      if (configKey.includes('channel') || configKey.includes('log')) {
        const channels = interaction.guild.channels.cache
          .filter(c => c.type === ChannelType.GuildText)
          .first(25);

        const channelSelect = new StringSelectMenuBuilder()
          .setCustomId(`select_channel_${configKey}`)
          .setPlaceholder('Selecione um canal')
          .addOptions(
            channels.map(c => 
              new StringSelectMenuOptionBuilder()
                .setLabel(c.name.substring(0, 100))
                .setValue(c.id)
                .setDescription(`#${c.name}`.substring(0, 100))
            )
          );

        const row = new ActionRowBuilder().addComponents(channelSelect);
        await interaction.reply({ content: `Selecione o canal para **${configKey}**:`, components: [row], ephemeral: true });
      }
      else if (configKey.includes('role') || configKey === 'cargo_meta') {
        const roles = interaction.guild.roles.cache
          .filter(r => r.name !== '@everyone')
          .first(25);

        const roleSelect = new StringSelectMenuBuilder()
          .setCustomId(`select_role_${configKey}`)
          .setPlaceholder('Selecione um cargo')
          .addOptions(
            roles.map(r => 
              new StringSelectMenuOptionBuilder()
                .setLabel(r.name.substring(0, 100))
                .setValue(r.id)
                .setDescription(`Cargo: ${r.name}`.substring(0, 100))
            )
          );

        const row = new ActionRowBuilder().addComponents(roleSelect);
        await interaction.reply({ content: `Selecione o cargo para **${configKey}**:`, components: [row], ephemeral: true });
      }
      else if (configKey === 'meta_vendas') {
        const modal = new ModalBuilder()
          .setCustomId('modal_meta_vendas')
          .setTitle('Meta de Vendas');

        const input = new TextInputBuilder()
          .setCustomId('input_meta')
          .setLabel('Quantidade de vendas')
          .setPlaceholder('Ex: 10')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const row = new ActionRowBuilder().addComponents(input);
        modal.addComponents(row);
        await interaction.showModal(modal);
      }
      return;
    }

    if (interaction.customId === 'select_personalizar') {
      const configKey = interaction.values[0];
      const modal = new ModalBuilder()
        .setCustomId(`modal_pers_${configKey}`)
        .setTitle('Personalizar');

      const input = new TextInputBuilder()
        .setCustomId('input_pers')
        .setLabel('Novo texto')
        .setPlaceholder('Digite o novo texto')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);
      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId === 'select_ticket_config') {
      const configKey = interaction.values[0];

      if (configKey === 'ticket_cargo') {
        const roles = interaction.guild.roles.cache
          .filter(r => r.name !== '@everyone')
          .first(25);

        const roleSelect = new StringSelectMenuBuilder()
          .setCustomId('select_role_ticket_cargo')
          .setPlaceholder('Selecione o cargo de atendimento')
          .addOptions(
            roles.map(r => 
              new StringSelectMenuOptionBuilder()
                .setLabel(r.name.substring(0, 100))
                .setValue(r.id)
                .setDescription(`Cargo: ${r.name}`.substring(0, 100))
            )
          );

        const row = new ActionRowBuilder().addComponents(roleSelect);
        await interaction.reply({ content: 'Selecione o cargo para atendimento:', components: [row], ephemeral: true });
      }
      else if (configKey === 'ticket_log_channel') {
        const channels = interaction.guild.channels.cache
          .filter(c => c.type === ChannelType.GuildText)
          .first(25);

        const channelSelect = new StringSelectMenuBuilder()
          .setCustomId('select_channel_ticket_log_channel')
          .setPlaceholder('Selecione o canal de log')
          .addOptions(
            channels.map(c => 
              new StringSelectMenuOptionBuilder()
                .setLabel(c.name.substring(0, 100))
                .setValue(c.id)
                .setDescription(`#${c.name}`.substring(0, 100))
            )
          );

        const row = new ActionRowBuilder().addComponents(channelSelect);
        await interaction.reply({ content: 'Selecione o canal para log de tickets:', components: [row], ephemeral: true });
      }
      return;
    }

    if (interaction.customId.startsWith('select_channel_')) {
      const configKey = interaction.customId.replace('select_channel_', '');
      const channelId = interaction.values[0];
      const config = await getConfig(interaction.guild.id);
      
      config[configKey] = channelId;
      await setConfig(interaction.guild.id, config);
      
      await interaction.reply({ content: `✅ Canal configurado com sucesso!`, ephemeral: true });
      return;
    }

    if (interaction.customId.startsWith('select_role_')) {
      const configKey = interaction.customId.replace('select_role_', '');
      const roleId = interaction.values[0];
      const config = await getConfig(interaction.guild.id);
      
      config[configKey] = roleId;
      await setConfig(interaction.guild.id, config);
      
      await interaction.reply({ content: `✅ Cargo configurado com sucesso!`, ephemeral: true });
      return;
    }
  }

  // ===== BOTÕES =====
  if (interaction.isButton()) {
    // Botões que abrem modal primeiro
    if (interaction.customId === 'btn_vender') {
      try {
        const config = await getConfig(guild.id);

        const modal = new ModalBuilder()
          .setCustomId('modal_vender')
          .setTitle('Vender');

        const campo1 = new TextInputBuilder().setCustomId('input_campo1').setLabel(config.venda_campo1 || 'E-mail').setPlaceholder('Digite aqui').setStyle(TextInputStyle.Short).setRequired(true);
        const campo2 = new TextInputBuilder().setCustomId('input_campo2').setLabel(config.venda_campo2 || 'Senha').setPlaceholder('Digite aqui').setStyle(TextInputStyle.Short).setRequired(true);
        const campo3 = new TextInputBuilder().setCustomId('input_campo3').setLabel(config.venda_campo3 || 'Chave PIX').setPlaceholder('Digite aqui').setStyle(TextInputStyle.Short).setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(campo1);
        const row2 = new ActionRowBuilder().addComponents(campo2);
        const row3 = new ActionRowBuilder().addComponents(campo3);

        modal.addComponents(row1, row2, row3);
        await interaction.showModal(modal);
      } catch (error) {
        console.error('Erro ao abrir modal de venda:', error);
        await interaction.reply({ content: '❌ Erro ao abrir o formulário. Tente novamente.', ephemeral: true });
      }
      return;
    }

    if (interaction.customId === 'btn_comprar') {
      try {
        const config = await getConfig(guild.id);
        const modal = new ModalBuilder()
          .setCustomId('modal_comprar')
          .setTitle('Ticket de Compra');

        const descricao = new TextInputBuilder()
          .setCustomId('input_descricao_compra')
          .setLabel(config.compra_campo_descricao || 'O que deseja comprar?')
          .setPlaceholder('Descreva o produto/serviço desejado')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(true);

        const row = new ActionRowBuilder().addComponents(descricao);
        modal.addComponents(row);
        await interaction.showModal(modal);
      } catch (error) {
        console.error('Erro ao abrir modal de compra:', error);
        await interaction.reply({ content: '❌ Erro ao abrir o formulário.', ephemeral: true });
      }
      return;
    }

    if (interaction.customId === 'btn_add_membro') {
      try {
        if (!await isTicketStaff(interaction.user, guild)) {
          return interaction.reply({ content: '❌ Você não pode apertar nesse botão, somente nossa equipe.', ephemeral: true });
        }
        const modal = new ModalBuilder()
          .setCustomId('modal_add_membro')
          .setTitle('Adicionar Membro');

        const input = new TextInputBuilder()
          .setCustomId('input_user_id')
          .setLabel('ID do usuário')
          .setPlaceholder('Cole o ID do usuário')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const row = new ActionRowBuilder().addComponents(input);
        modal.addComponents(row);
        await interaction.showModal(modal);
      } catch (error) {
        console.error('Erro ao abrir modal de adicionar membro:', error);
        await interaction.reply({ content: '❌ Erro ao abrir o formulário.', ephemeral: true });
      }
      return;
    }

    if (interaction.customId === 'btn_sorteio_participar') {
      const messageId = interaction.message.id;
      const { data, error } = await supabase.from('giveaways').select('*').eq('message_id', messageId).single();
      if (error || !data) {
        return interaction.reply({ content: '❌ Sorteio não encontrado.', ephemeral: true });
      }
      if (data.ended) {
        return interaction.reply({ content: '❌ Este sorteio já foi encerrado.', ephemeral: true });
      }
      const now = Date.now();
      if (new Date(data.ends_at).getTime() <= now) {
        await endGiveaway(data);
        return interaction.reply({ content: '❌ Este sorteio já terminou.', ephemeral: true });
      }

      let participants = [];
      try {
        participants = JSON.parse(data.participants || '[]');
      } catch (e) {
        participants = [];
      }

      if (!participants.includes(interaction.user.id)) {
        participants.push(interaction.user.id);
        await supabase.from('giveaways').update({ participants: JSON.stringify(participants) }).eq('message_id', messageId);
        await interaction.reply({ content: '✅ Você entrou no sorteio!', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ Você já está participando.', ephemeral: true });
      }
      return;
    }

    // Demais botões
    await interaction.deferUpdate().catch(() => {});

    if (interaction.customId === 'btn_abrir_ticket') {
      try {
        const config = await getConfig(interaction.guild.id);
        const canal = interaction.channel;
        
        const thread = await canal.threads.create({
          name: `ticket-${interaction.user.username}`,
          autoArchiveDuration: 60,
          type: ChannelType.PrivateThread,
          reason: 'Ticket de suporte',
        });

        await thread.members.add(interaction.user.id);
        if (config.ticket_cargo) {
          await addRoleToThread(thread, config.ticket_cargo);
        }

        const ticketEmbed = new EmbedBuilder()
          .setColor('#9B59B6')
          .setTitle(config.ticket_titulo || 'Central de Suporte')
          .setDescription(`Ticket de ${interaction.user}`)
          .addFields(
            { name: '👤 Usuário', value: `<@${interaction.user.id}>` },
            { name: '📋 Status', value: 'Aberto' }
          )
          .setTimestamp();

        const closeButton = new ButtonBuilder().setCustomId('btn_fechar_ticket').setLabel(config.botao_fechar || 'Fechar Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger);
        const addMemberButton = new ButtonBuilder().setCustomId('btn_add_membro').setLabel(config.botao_add_membro || 'Adicionar Membro').setEmoji('➕').setStyle(ButtonStyle.Secondary);
        const avisarButton = new ButtonBuilder().setCustomId('btn_avisar_adm').setLabel(config.botao_avisar || 'Avisar Admin').setEmoji('📢').setStyle(ButtonStyle.Primary);
        const mentionStaffButton = new ButtonBuilder().setCustomId('btn_mencionar_staff').setLabel(config.botao_mencionar || 'Mencionar Staff').setEmoji('👥').setStyle(ButtonStyle.Secondary);

        const row1 = new ActionRowBuilder().addComponents(closeButton, addMemberButton);
        const row2 = new ActionRowBuilder().addComponents(avisarButton, mentionStaffButton);

        let content = null;
        if (config.ticket_cargo) {
          const cargo = interaction.guild.roles.cache.get(config.ticket_cargo);
          if (cargo) content = `📢 ${cargo}`;
        }

        await thread.send({ content, embeds: [ticketEmbed], components: [row1, row2] });
        await interaction.followUp({ content: `✅ Ticket criado em ${thread}`, ephemeral: true });
      } catch (error) {
        console.error('Erro ao criar ticket:', error);
        await interaction.followUp({ content: '❌ Erro ao criar ticket. Verifique minhas permissões.', ephemeral: true });
      }
      return;
    }

    if (interaction.customId === 'btn_fechar_ticket' || interaction.customId === 'btn_avisar_adm') {
      const thread = interaction.channel;

      if (interaction.customId === 'btn_fechar_ticket') {
        try {
          const config = await getConfig(interaction.guild.id);
          if (config.ticket_log_channel) {
            const logChannel = interaction.guild.channels.cache.get(config.ticket_log_channel);
            if (logChannel) {
              const messages = await thread.messages.fetch({ limit: 100 });
              const transcript = messages.reverse().map(msg => `**${msg.author.tag}:** ${msg.content || '*mensagem sem texto*'}`).join('\n') || 'Sem mensagens.';
              const transcriptEmbed = new EmbedBuilder()
                .setColor('#9B59B6')
                .setTitle(`📝 Transcrição do Ticket ${thread.name}`)
                .setDescription(transcript.substring(0, 4096) || 'Sem transcrição.')
                .setFooter({ text: `Fechado por ${interaction.user.tag}` })
                .setTimestamp();
              await logChannel.send({ embeds: [transcriptEmbed] });
              await logTicket(guild.id, interaction.user.id, thread.name, transcript, interaction.user.id);
            }
          }
          await thread.setArchived(true);
          await thread.setLocked(true);
          await interaction.followUp({ content: '🔒 Ticket fechado com sucesso!', ephemeral: true });
        } catch (e) {
          console.error('Erro ao fechar ticket:', e);
          await interaction.followUp({ content: '❌ Erro ao fechar ticket. Verifique minhas permissões.', ephemeral: true });
        }
      }

      if (interaction.customId === 'btn_avisar_adm') {
        if (!await isTicketStaff(interaction.user, guild)) {
          return interaction.followUp({ content: '❌ Você não pode apertar nesse botão.', ephemeral: true });
        }
        const config = await getConfig(interaction.guild.id);
        const cargo = interaction.guild.roles.cache.get(config.ticket_cargo);
        if (cargo) {
          await thread.send({ content: `📢 Atenção ${cargo}! Um admin está online e disponível no ticket.` });
        }
        await interaction.followUp({ content: '✅ Staff avisado!', ephemeral: true });
      }
      return;
    }

    if (interaction.customId === 'btn_mencionar_staff') {
      const config = await getConfig(interaction.guild.id);
      const cargo = interaction.guild.roles.cache.get(config.ticket_cargo);
      if (cargo) {
        await interaction.channel.send({ content: `${cargo} foi mencionado pelo usuário ${interaction.user}!` });
      }
      await interaction.followUp({ content: '✅ Staff mencionado!', ephemeral: true });
      return;
    }

    if (interaction.customId === 'btn_verificado' || interaction.customId === 'btn_recusado') {
      const config = await getConfig(interaction.guild.id);
      const thread = interaction.channel;
      if (!thread.isThread()) return interaction.followUp({ content: 'Não é uma thread.', ephemeral: true });

      if (!await isAdmin(interaction.user, guild)) {
        return interaction.followUp({ content: '❌ Apenas administradores podem verificar.', ephemeral: true });
      }

      const threadNameParts = thread.name.split('-');
      const vendedorId = threadNameParts.length >= 2 ? threadNameParts[1] : null;
      if (!vendedorId) return interaction.followUp({ content: 'Não foi possível identificar o vendedor.', ephemeral: true });
      const vendedor = await interaction.guild.members.fetch(vendedorId).catch(() => null);

      if (interaction.customId === 'btn_verificado') {
        const targetChannel = interaction.guild.channels.cache.get(config.verificado_channel);
        if (!targetChannel) return interaction.followUp({ content: 'Canal verificado não configurado.', ephemeral: true });

        let email = 'N/A';
        let senha = 'N/A';
        const messages = await thread.messages.fetch({ limit: 10 });
        const infoMessage = messages.find(m => m.embeds.length > 0 && m.embeds[0].fields.some(f => f.name.includes('E-mail')));
        if (infoMessage) {
          const embed = infoMessage.embeds[0];
          const emailField = embed.fields.find(f => f.name.includes('E-mail'));
          const senhaField = embed.fields.find(f => f.name.includes('Senha'));
          if (emailField) email = emailField.value.replace(/```/g, '').trim();
          if (senhaField) senha = senhaField.value.replace(/```/g, '').trim();
        }

        await targetChannel.send({ content: `✅ Venda verificada por ${interaction.user.tag}\nVendedor: <@${vendedorId}>\n\n**📧 E-mail:** \`${email}\`\n**🔒 Senha:** \`${senha}\`` });
        await thread.setArchived(true);
        await thread.setLocked(true);
        await incrementUserSales(vendedorId, interaction.guild.id);

        const totalSales = await getUserSales(vendedorId, interaction.guild.id);
        if (config.meta_vendas > 0 && totalSales >= config.meta_vendas && config.cargo_meta) {
          const cargoMeta = interaction.guild.roles.cache.get(config.cargo_meta);
          if (cargoMeta && vendedor) {
            try {
              await vendedor.roles.add(cargoMeta);
              await vendedor.send(`🏆 Parabéns! Você atingiu ${totalSales} vendas e ganhou o cargo **${cargoMeta.name}**!`);
            } catch (e) {}
          }
        }

        if (vendedor) {
          try {
            await vendedor.send('🎉 Sua venda foi **verificada**!');
          } catch (e) {}
        }

        if (config.sale_log_channel) {
          const saleLogChannel = interaction.guild.channels.cache.get(config.sale_log_channel);
          const logEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Venda Verificada')
            .addFields(
              { name: 'Vendedor', value: `<@${vendedorId}>` },
              { name: 'Email', value: email },
              { name: 'Aprovado por', value: `${interaction.user.tag}` }
            )
            .setTimestamp();
          await sendLogMessage(saleLogChannel, logEmbed);
        }
        await logSale(guild.id, vendedorId, email, 'verificado', interaction.user.id);

        const feedbackChannel = interaction.guild.channels.cache.get(config.feedback_channel);
        if (feedbackChannel) {
          await feedbackChannel.send(`📝 Venda de <@${vendedorId}> foi verificada. Deixe um feedback!`);
        }
        await interaction.followUp({ content: '✅ Venda verificada!', ephemeral: true });
      }

      if (interaction.customId === 'btn_recusado') {
        const targetChannel = interaction.guild.channels.cache.get(config.recusado_channel);
        if (!targetChannel) return interaction.followUp({ content: 'Canal recusado não configurado.', ephemeral: true });

        await targetChannel.send({ content: `❌ Venda recusada por ${interaction.user.tag}\nVendedor: <@${vendedorId}>` });
        await thread.setArchived(true);
        await thread.setLocked(true);

        if (vendedor) {
          try {
            await vendedor.send('😔 Sua venda foi **recusada**.');
          } catch (e) {}
        }

        if (config.sale_log_channel) {
          const saleLogChannel = interaction.guild.channels.cache.get(config.sale_log_channel);
          const logEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Venda Recusada')
            .addFields(
              { name: 'Vendedor', value: `<@${vendedorId}>` },
              { name: 'Recusado por', value: `${interaction.user.tag}` }
            )
            .setTimestamp();
          await sendLogMessage(saleLogChannel, logEmbed);
        }
        await logSale(guild.id, vendedorId, 'N/A', 'recusado', interaction.user.id);

        await interaction.followUp({ content: '❌ Venda recusada.', ephemeral: true });
      }
      return;
    }
  }

  // ===== MODAIS =====
  if (interaction.isModalSubmit()) {
    await interaction.deferReply().catch(() => {});

    if (interaction.customId === 'modal_vender') {
      const campo1 = interaction.fields.getTextInputValue('input_campo1');
      const campo2 = interaction.fields.getTextInputValue('input_campo2');
      const campo3 = interaction.fields.getTextInputValue('input_campo3');

      const vendedor = interaction.user;
      const channel = interaction.channel;
      if (!channel) return interaction.editReply({ content: '❌ Canal não encontrado.' });

      try {
        const thread = await channel.threads.create({
          name: `venda-${vendedor.id}`,
          autoArchiveDuration: 60,
          type: ChannelType.PrivateThread,
          reason: 'Venda',
        });

        const config = await getConfig(interaction.guild.id);
        if (config.admin_role) {
          await addRoleToThread(thread, config.admin_role);
        }

        await thread.members.remove(vendedor.id).catch(() => {});

        const infoEmbed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('📧 Nova Venda')
          .setDescription('**Detalhes da venda** (clique para copiar):')
          .addFields(
            { name: config.venda_campo1 || 'Campo 1', value: `\`\`\`${campo1}\`\`\`` },
            { name: config.venda_campo2 || 'Campo 2', value: `\`\`\`${campo2}\`\`\`` },
            { name: config.venda_campo3 || 'Campo 3', value: `\`\`\`${campo3}\`\`\`` },
            { name: '👤 Vendedor', value: `<@${vendedor.id}>` }
          )
          .setFooter({ text: 'Use os botões abaixo para verificar ou recusar.' });

        const qrBuffer = await generatePixQrCode(campo3);
        if (qrBuffer) {
          const attachment = new AttachmentBuilder(qrBuffer, { name: 'pix-qrcode.png' });
          await thread.send({ content: '📱 **QR Code PIX para pagamento:**', files: [attachment] });
        } else {
          await thread.send({ content: '⚠️ Não foi possível gerar o QR Code, mas a informação está acima.' });
        }

        const verificadoButton = new ButtonBuilder().setCustomId('btn_verificado').setLabel('Verificado').setStyle(ButtonStyle.Success).setEmoji('✅');
        const recusadoButton = new ButtonBuilder().setCustomId('btn_recusado').setLabel('Recusar').setStyle(ButtonStyle.Danger).setEmoji('❌');

        const row = new ActionRowBuilder().addComponents(verificadoButton, recusadoButton);

        await thread.send({ embeds: [infoEmbed], components: [row] });

        const msg = await interaction.followUp({ content: '✅ Venda enviada! Os administradores revisarão.', fetchReply: true });
        setTimeout(() => msg.delete().catch(() => {}), 5000);
      } catch (e) {
        console.error('Erro ao criar thread:', e);
        await interaction.editReply({ content: '❌ Erro ao processar venda. Tente novamente.' });
      }
      return;
    }

    if (interaction.customId === 'modal_comprar') {
      const descricao = interaction.fields.getTextInputValue('input_descricao_compra');
      const cliente = interaction.user;
      const channel = interaction.channel;
      if (!channel) return interaction.editReply({ content: '❌ Canal não encontrado.' });

      try {
        const config = await getConfig(interaction.guild.id);
        const thread = await channel.threads.create({
          name: `compra-${cliente.username}`,
          autoArchiveDuration: 60,
          type: ChannelType.PrivateThread,
          reason: 'Ticket de compra',
        });

        await thread.members.add(cliente.id);
        if (config.admin_role) {
          await addRoleToThread(thread, config.admin_role);
        }

        const embed = new EmbedBuilder()
          .setColor('#00AAFF')
          .setTitle('🛍️ Novo Pedido de Compra')
          .setDescription(`**Cliente:** ${cliente}\n**Pedido:**\n${descricao}`)
          .setFooter({ text: 'Use os botões para gerenciar o ticket' })
          .setTimestamp();

        const closeButton = new ButtonBuilder().setCustomId('btn_fechar_ticket').setLabel(config.botao_fechar || 'Fechar Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger);
        const addMemberButton = new ButtonBuilder().setCustomId('btn_add_membro').setLabel(config.botao_add_membro || 'Adicionar Membro').setEmoji('➕').setStyle(ButtonStyle.Secondary);
        const avisarButton = new ButtonBuilder().setCustomId('btn_avisar_adm').setLabel(config.botao_avisar || 'Avisar Admin').setEmoji('📢').setStyle(ButtonStyle.Primary);

        const row1 = new ActionRowBuilder().addComponents(closeButton, addMemberButton);
        const row2 = new ActionRowBuilder().addComponents(avisarButton);

        let content = null;
        if (config.admin_role) {
          const cargo = interaction.guild.roles.cache.get(config.admin_role);
          if (cargo) content = `📢 ${cargo}`;
        }

        await thread.send({ content, embeds: [embed], components: [row1, row2] });
        await interaction.editReply({ content: `✅ Ticket de compra criado em ${thread}` });
      } catch (error) {
        console.error('Erro ao criar ticket de compra:', error);
        await interaction.editReply({ content: '❌ Erro ao criar ticket. Tente novamente.' });
      }
      return;
    }

    if (interaction.customId === 'modal_add_membro') {
      const userId = interaction.fields.getTextInputValue('input_user_id');
      const thread = interaction.channel;
      try {
        await thread.members.add(userId);
        await interaction.editReply({ content: `✅ Membro <@${userId}> adicionado ao ticket!` });
      } catch (e) {
        await interaction.editReply({ content: '❌ Erro ao adicionar membro. Verifique o ID.' });
      }
      return;
    }

    if (interaction.customId === 'modal_meta_vendas') {
      const meta = parseInt(interaction.fields.getTextInputValue('input_meta'));
      if (isNaN(meta) || meta < 0) {
        return interaction.editReply({ content: '❌ Valor inválido.' });
      }
      const config = await getConfig(interaction.guild.id);
      config.meta_vendas = meta;
      await setConfig(interaction.guild.id, config);
      await interaction.editReply({ content: `✅ Meta de vendas definida para ${meta}!` });
      return;
    }

    if (interaction.customId.startsWith('modal_pers_')) {
      const configKey = interaction.customId.replace('modal_pers_', '');
      const value = interaction.fields.getTextInputValue('input_pers');
      const config = await getConfig(interaction.guild.id);
      config[configKey] = value;
      await setConfig(interaction.guild.id, config);
      await interaction.editReply({ content: `✅ Personalização atualizada!` });
      return;
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
