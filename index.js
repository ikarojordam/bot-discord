const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, PermissionFlagsBits, ChannelType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

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
  ]
});

const defaultConfig = {
  painel_channel: '',
  verificado_channel: '',
  recusado_channel: '',
  feedback_channel: '',
  admin_role: '',
  membro_role: '',
  meta_vendas: 0,
  cargo_meta: '',
  painel_descricao: 'Clique no botão abaixo para vender seu Gmail.',
  ticket_cargo: '',
  ticket_descricao: 'Clique no botão abaixo para abrir um ticket de suporte.',
  mute_role: ''
};

async function getConfig(guildId) {
  const { data, error } = await supabase
    .from('configs')
    .select('*')
    .eq('guild_id', guildId)
    .single();

  if (error || !data) {
    return { guild_id: guildId, ...defaultConfig };
  }
  return data;
}

async function setConfig(guildId, newConfig) {
  const configToSave = { ...newConfig, guild_id: guildId };
  const { error } = await supabase
    .from('configs')
    .upsert(configToSave);

  if (error) console.error('Erro ao salvar config:', error);
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
    .upsert({ user_id: userId, guild_id: guildId, count: 1 }, { onConflict: 'user_id,guild_id' })
    .select('count')
    .single();

  if (data) {
    await supabase
      .from('sales')
      .update({ count: data.count + 1 })
      .eq('user_id', userId)
      .eq('guild_id', guildId);
  } else {
    console.error('Erro no incremento:', error);
  }
}

async function isAdmin(member) {
  const config = await getConfig(member.guild.id);
  return (config.admin_role && member.roles.cache.has(config.admin_role)) || member.permissions.has(PermissionFlagsBits.Administrator);
}

async function isAllowed(member) {
  const config = await getConfig(member.guild.id);
  return (config.membro_role && member.roles.cache.has(config.membro_role)) || await isAdmin(member);
}

async function isTicketStaff(member) {
  const config = await getConfig(member.guild.id);
  return (config.ticket_cargo && member.roles.cache.has(config.ticket_cargo)) || await isAdmin(member);
}

// Função para gerar QR Code PIX
function generatePixQrCode(pixKey) {
  // Usando API pública para gerar QR Code
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixKey)}`;
  return qrCodeUrl;
}

async function registerCommands() {
  const commands = [
    // Comandos de Vendas
    new SlashCommandBuilder().setName('enviar').setDescription('Envia o painel de vendas').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('configurar').setDescription('Abre painel de configuração').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('vendas').setDescription('Mostra quantas vendas você concluiu'),
    new SlashCommandBuilder().setName('perfil').setDescription('Mostra seu perfil de vendas'),
    new SlashCommandBuilder().setName('ping').setDescription('Mostra a latência do bot'),
    new SlashCommandBuilder().setName('serverinfo').setDescription('Mostra informações do servidor'),
    new SlashCommandBuilder().setName('userinfo').setDescription('Mostra informações de um usuário').addUserOption(o => o.setName('usuario').setDescription('Usuário (opcional)').setRequired(false)),
    new SlashCommandBuilder().setName('avatar').setDescription('Mostra o avatar de um usuário').addUserOption(o => o.setName('usuario').setDescription('Usuário (opcional)').setRequired(false)),

    // Comandos de Moderação
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

    // Comandos de Ticket
    new SlashCommandBuilder().setName('painel').setDescription('Envia painel (ticket ou vendas)').addStringOption(o => o.setName('tipo').setDescription('Tipo do painel').setRequired(true).addChoices({ name: 'Ticket', value: 'ticket' }, { name: 'Vendas', value: 'vendas' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('configurar_ticket').setDescription('Configura o sistema de ticket').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // Comando de Embed Personalizado
    new SlashCommandBuilder().setName('criar_embed').setDescription('Cria embed personalizado').addStringOption(o => o.setName('titulo').setDescription('Título do embed').setRequired(true)).addStringOption(o => o.setName('descricao').setDescription('Descrição do embed').setRequired(true)).addStringOption(o => o.setName('cargo_menção').setDescription('ID do cargo para mencionar (opcional)').setRequired(false)).addStringOption(o => o.setName('usuario_menção').setDescription('ID do usuário para mencionar (opcional)').setRequired(false)).addStringOption(o => o.setName('cor').setDescription('Cor em hex (ex: #FF0000)').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  ];

  const guilds = client.guilds.cache.map(g => g.id);
  for (const guildId of guilds) {
    const guild = client.guilds.cache.get(guildId);
    if (guild) await guild.commands.set(commands);
  }
  console.log('📡 Slash commands registrados!');
}

client.once('ready', async () => {
  console.log(`✅ Bot ${client.user.tag} está online!`);
  await registerCommands();
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const { commandName, member, guild, channel } = interaction;

    // ============ CONFIGURAÇÃO PRINCIPAL ============
    if (commandName === 'configurar') {
      if (!await isAdmin(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      
      const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('⚙️ Configuração do Bot')
        .setDescription('Selecione o que deseja configurar:');

      const select = new StringSelectMenuBuilder()
        .setCustomId('select_config')
        .setPlaceholder('Escolha uma opção')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Canal do Painel').setValue('painel_channel').setDescription('Canal onde o painel será enviado'),
          new StringSelectMenuOptionBuilder().setLabel('Descrição do Painel').setValue('painel_descricao').setDescription('Texto do painel de vendas'),
          new StringSelectMenuOptionBuilder().setLabel('Canal Verificado').setValue('verificado_channel').setDescription('Canal para vendas verificadas'),
          new StringSelectMenuOptionBuilder().setLabel('Canal Recusado').setValue('recusado_channel').setDescription('Canal para vendas recusadas'),
          new StringSelectMenuOptionBuilder().setLabel('Canal Feedback').setValue('feedback_channel').setDescription('Canal para feedbacks'),
          new StringSelectMenuOptionBuilder().setLabel('Cargo Admin').setValue('admin_role').setDescription('Cargo com permissões de admin'),
          new StringSelectMenuOptionBuilder().setLabel('Cargo de Membros').setValue('membro_role').setDescription('Cargo para comandos públicos'),
          new StringSelectMenuOptionBuilder().setLabel('Meta de Vendas').setValue('meta_vendas').setDescription('Número para ganhar cargo'),
          new StringSelectMenuOptionBuilder().setLabel('Cargo da Meta').setValue('cargo_meta').setDescription('Cargo dado ao atingir meta'),
          new StringSelectMenuOptionBuilder().setLabel('Cargo de Mute').setValue('mute_role').setDescription('Cargo para silenciar')
        );

      const row = new ActionRowBuilder().addComponents(select);
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // ============ CONFIGURAÇÃO DO TICKET ============
    if (commandName === 'configurar_ticket') {
      if (!await isAdmin(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      
      const embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle('⚙️ Configuração do Ticket')
        .setDescription('Selecione o que deseja configurar:');

      const select = new StringSelectMenuBuilder()
        .setCustomId('select_ticket_config')
        .setPlaceholder('Escolha uma opção')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Cargo de Atendimento').setValue('ticket_cargo').setDescription('Cargo que atenderá os tickets'),
          new StringSelectMenuOptionBuilder().setLabel('Descrição do Painel').setValue('ticket_descricao').setDescription('Texto do painel de ticket')
        );

      const row = new ActionRowBuilder().addComponents(select);
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // ============ SISTEMA DE TICKET ============
    if (commandName === 'painel') {
      if (!await isAdmin(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const tipo = interaction.options.getString('tipo');
      const config = await getConfig(guild.id);

      if (tipo === 'ticket') {
        const ticketEmbed = new EmbedBuilder()
          .setColor('#9B59B6')
          .setTitle('🎫 Central de Suporte')
          .setDescription(config.ticket_descricao)
          .setFooter({ text: 'Clique no botão para abrir um ticket' });

        const ticketButton = new ButtonBuilder()
          .setCustomId('btn_abrir_ticket')
          .setLabel('Abrir Ticket')
          .setEmoji('🎫')
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(ticketButton);
        await interaction.reply({ content: '✅ Painel de ticket enviado!', ephemeral: true });
        await channel.send({ embeds: [ticketEmbed], components: [row] });
      } else if (tipo === 'vendas') {
        const painelEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🛒 Painel de Vendas - Gmail')
          .setDescription(config.painel_descricao)
          .setFooter({ text: 'Sistema automático de verificação' });

        const venderButton = new ButtonBuilder()
          .setCustomId('btn_vender')
          .setLabel('Vender Gmail')
          .setEmoji('💰')
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(venderButton);
        await interaction.reply({ content: '✅ Painel de vendas enviado!', ephemeral: true });
        await channel.send({ embeds: [painelEmbed], components: [row] });
      }
    }

    // ============ EMBED PERSONALIZADO ============
    if (commandName === 'criar_embed') {
      if (!await isAdmin(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      
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
    }

    // ============ MODERAÇÃO ============
    if (commandName === 'unban') {
      if (!await isAdmin(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const userId = interaction.options.getString('id');
      await guild.members.unban(userId).catch(e => {
        return interaction.reply({ content: `❌ Erro ao desbanir: ${e.message}`, ephemeral: true });
      });
      await interaction.reply({ content: `✅ Usuário desbanido!`, ephemeral: true });
    }

    if (commandName === 'mute') {
      if (!await isAdmin(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
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
    }

    if (commandName === 'unmute') {
      if (!await isAdmin(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const config = await getConfig(guild.id);
      const muteRole = guild.roles.cache.get(config.mute_role);
      if (!muteRole) return interaction.reply({ content: '❌ Cargo de mute não configurado!', ephemeral: true });

      const membro = await guild.members.fetch(usuario.id).catch(() => null);
      if (!membro) return interaction.reply({ content: '❌ Membro não encontrado.', ephemeral: true });

      await membro.roles.remove(muteRole);
      await interaction.reply({ content: `🔊 ${usuario.tag} dessilenciado.`, ephemeral: true });
    }

    if (commandName === 'warn') {
      if (!await isAdmin(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const motivo = interaction.options.getString('motivo');

      const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('⚠️ Advertência')
        .setDescription(`${usuario.tag} foi advertido`)
        .addFields({ name: 'Motivo', value: motivo })
        .setFooter({ text: `Por ${interaction.user.tag}` });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'limpar') {
      if (!await isAdmin(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const quantidade = interaction.options.getInteger('quantidade');
      await channel.bulkDelete(quantidade, true).catch(() => {});
      await interaction.reply({ content: `🧹 ${quantidade} mensagens apagadas.`, ephemeral: true });
    }

    if (commandName === 'kick') {
      if (!await isAdmin(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const motivo = interaction.options.getString('motivo') || 'Sem motivo';
      const membro = await guild.members.fetch(usuario.id).catch(() => null);
      if (!membro) return interaction.reply({ content: '❌ Membro não encontrado.', ephemeral: true });
      await membro.kick(motivo).catch(e => {
        return interaction.reply({ content: `❌ Erro ao expulsar: ${e.message}`, ephemeral: true });
      });
      await interaction.reply({ content: `👢 ${usuario.tag} foi expulso.`, ephemeral: true });
    }

    if (commandName === 'ban') {
      if (!await isAdmin(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const motivo = interaction.options.getString('motivo') || 'Sem motivo';
      await guild.members.ban(usuario.id, { reason: motivo }).catch(e => {
        return interaction.reply({ content: `❌ Erro ao banir: ${e.message}`, ephemeral: true });
      });
      await interaction.reply({ content: `🔨 ${usuario.tag} foi banido.`, ephemeral: true });
    }

    if (commandName === 'anunciar') {
      if (!await isAdmin(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
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
    }

    if (commandName === 'say') {
      if (!await isAdmin(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const mensagem = interaction.options.getString('mensagem');
      await channel.send(mensagem);
      await interaction.reply({ content: '✅ Mensagem enviada!', ephemeral: true });
    }

    if (commandName === 'lock') {
      if (!await isAdmin(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
      await interaction.reply({ content: '🔒 Canal trancado.', ephemeral: true });
    }

    if (commandName === 'unlock') {
      if (!await isAdmin(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
      await interaction.reply({ content: '🔓 Canal destrancado.', ephemeral: true });
    }

    if (commandName === 'slowmode') {
      if (!await isAdmin(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const segundos = interaction.options.getInteger('segundos');
      await channel.setRateLimitPerUser(segundos);
      await interaction.reply({ content: `⏱️ Modo lento definido para ${segundos} segundos.`, ephemeral: true });
    }

    // ============ COMANDOS PÚBLICOS ============
    if (commandName === 'vendas') {
      if (!await isAllowed(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const sales = await getUserSales(interaction.user.id, guild.id);
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('📊 Suas Vendas Concluídas')
        .setDescription(`Você já concluiu **${sales}** venda(s).`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'perfil') {
      if (!await isAllowed(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const sales = await getUserSales(interaction.user.id, guild.id);
      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle(`👤 Perfil de ${interaction.user.username}`)
        .addFields(
          { name: 'Vendas Concluídas', value: `${sales}`, inline: true },
          { name: 'Membro desde', value: interaction.user.createdAt.toLocaleDateString('pt-BR'), inline: true }
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'ping') {
      if (!await isAllowed(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      await interaction.reply({ content: `🏓 Pong! Latência: ${client.ws.ping}ms`, ephemeral: true });
    }

    if (commandName === 'serverinfo') {
      if (!await isAllowed(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
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
    }

    if (commandName === 'userinfo') {
      if (!await isAllowed(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
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
    }

    if (commandName === 'avatar') {
      if (!await isAllowed(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario') || interaction.user;
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`🖼️ Avatar de ${usuario.tag}`)
        .setImage(usuario.displayAvatarURL({ dynamic: true, size: 1024 }));
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
                                                       }
