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
  mute_role: '',
  ticket_log_channel: ''
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

async function generatePixQrCode(pixKey) {
  try {
    const qrBuffer = await QRCode.toBuffer(pixKey, { type: 'png', width: 300, margin: 2 });
    return qrBuffer;
  } catch (error) {
    console.error('Erro ao gerar QR Code:', error);
    return null;
  }
}

// Função para adicionar todos os membros com um cargo a uma thread privada
async function addRoleToThread(thread, roleId) {
  if (!roleId) return;
  const guild = thread.guild;
  const role = guild.roles.cache.get(roleId);
  if (!role) return;
  const members = role.members.map(m => m.id);
  for (const memberId of members) {
    await thread.members.add(memberId).catch(e => console.error(`Erro ao adicionar ${memberId}:`, e.message));
  }
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder().setName('enviar').setDescription('Envia o painel de vendas').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('configurar').setDescription('Abre painel de configuração').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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
    new SlashCommandBuilder().setName('painel').setDescription('Envia painel (ticket ou vendas)').addStringOption(o => o.setName('tipo').setDescription('Tipo do painel').setRequired(true).addChoices({ name: 'Ticket', value: 'ticket' }, { name: 'Vendas', value: 'vendas' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('configurar_ticket').setDescription('Configura o sistema de ticket').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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
  await client.application.commands.set([]); // limpa comandos globais
  await registerCommands();
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const { commandName, member, guild, channel } = interaction;

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
          new StringSelectMenuOptionBuilder().setLabel('Descrição do Painel').setValue('ticket_descricao').setDescription('Texto do painel de ticket'),
          new StringSelectMenuOptionBuilder().setLabel('Canal de Log').setValue('ticket_log_channel').setDescription('Canal para logs e transcrições')
        );

      const row = new ActionRowBuilder().addComponents(select);
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (commandName === 'painel') {
      if (!await isAdmin(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const tipo = interaction.options.getString('tipo');
      const config = await getConfig(guild.id);

      if (tipo === 'ticket') {
        const ticketEmbed = new EmbedBuilder()
          .setColor('#9B59B6')
          .setTitle('🎫 Central de Suporte')
          .setDescription(config.ticket_descricao || 'Clique no botão abaixo para abrir um ticket de suporte.')
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
          .setDescription(config.painel_descricao || 'Clique no botão abaixo para vender seu Gmail.')
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

    // ... (demais comandos de moderação e públicos, idênticos ao código anterior)

  // ============ SELECT MENUS ============
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'select_config') {
      const configKey = interaction.values[0];

      if (configKey.includes('channel')) {
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
      else if (configKey.includes('descricao')) {
        const modal = new ModalBuilder()
          .setCustomId(`modal_desc_${configKey}`)
          .setTitle('Descrição');

        const input = new TextInputBuilder()
          .setCustomId('input_desc')
          .setLabel('Nova descrição')
          .setPlaceholder('Digite a descrição')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(true);

        const row = new ActionRowBuilder().addComponents(input);
        modal.addComponents(row);
        await interaction.showModal(modal);
      }
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
      else if (configKey === 'ticket_descricao') {
        const modal = new ModalBuilder()
          .setCustomId('modal_desc_ticket_descricao')
          .setTitle('Descrição do Ticket');

        const input = new TextInputBuilder()
          .setCustomId('input_desc')
          .setLabel('Nova descrição')
          .setPlaceholder('Digite a descrição do painel')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(true);

        const row = new ActionRowBuilder().addComponents(input);
        modal.addComponents(row);
        await interaction.showModal(modal);
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
    }

    if (interaction.customId.startsWith('select_channel_')) {
      const configKey = interaction.customId.replace('select_channel_', '');
      const channelId = interaction.values[0];
      const config = await getConfig(interaction.guild.id);
      
      config[configKey] = channelId;
      await setConfig(interaction.guild.id, config);
      
      await interaction.reply({ content: `✅ Canal configurado com sucesso!`, ephemeral: true });
    }

    if (interaction.customId.startsWith('select_role_')) {
      const configKey = interaction.customId.replace('select_role_', '');
      const roleId = interaction.values[0];
      const config = await getConfig(interaction.guild.id);
      
      config[configKey] = roleId;
      await setConfig(interaction.guild.id, config);
      
      await interaction.reply({ content: `✅ Cargo configurado com sucesso!`, ephemeral: true });
    }
  }

  // ============ BOTÕES ============
  if (interaction.isButton()) {
    if (interaction.customId === 'btn_abrir_ticket') {
      const config = await getConfig(interaction.guild.id);
      const canal = interaction.channel;
      
      const thread = await canal.threads.create({
        name: `ticket-${interaction.user.username}`,
        autoArchiveDuration: 60,
        type: ChannelType.PrivateThread,
        reason: 'Ticket de suporte',
      });

      await thread.members.add(interaction.user.id);
      // Adicionar todos os membros do cargo de suporte
      if (config.ticket_cargo) {
        await addRoleToThread(thread, config.ticket_cargo);
      }

      const ticketEmbed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle('🎫 Ticket Aberto')
        .setDescription(`Ticket de ${interaction.user}`)
        .addFields(
          { name: '👤 Usuário', value: `<@${interaction.user.id}>` },
          { name: '📋 Status', value: 'Aberto' }
        )
        .setTimestamp();

      const closeButton = new ButtonBuilder().setCustomId('btn_fechar_ticket').setLabel('Fechar Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger);
      const addMemberButton = new ButtonBuilder().setCustomId('btn_add_membro').setLabel('Adicionar Membro').setEmoji('➕').setStyle(ButtonStyle.Secondary);
      const avisarButton = new ButtonBuilder().setCustomId('btn_avisar_adm').setLabel('Avisar Admin').setEmoji('📢').setStyle(ButtonStyle.Primary);
      const mentionStaffButton = new ButtonBuilder().setCustomId('btn_mencionar_staff').setLabel('Mencionar Staff').setEmoji('👥').setStyle(ButtonStyle.Secondary);

      const row1 = new ActionRowBuilder().addComponents(closeButton, addMemberButton);
      const row2 = new ActionRowBuilder().addComponents(avisarButton, mentionStaffButton);

      await thread.send({ embeds: [ticketEmbed], components: [row1, row2] });
      await interaction.reply({ content: `✅ Ticket criado em ${thread}`, ephemeral: true });
    }

    if (interaction.customId === 'btn_fechar_ticket' || interaction.customId === 'btn_add_membro' || interaction.customId === 'btn_avisar_adm') {
      if (!await isTicketStaff(interaction.member)) {
        return interaction.reply({ content: '❌ Você não pode apertar nesse botão, somente nossa equipe.', ephemeral: true });
      }

      const thread = interaction.channel;

      if (interaction.customId === 'btn_fechar_ticket') {
        try {
          // Enviar transcrição para canal de log, se configurado
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
            }
          }
          await thread.setArchived(true);
          await thread.setLocked(true);
          await interaction.reply({ content: '🔒 Ticket fechado com sucesso!', ephemeral: true });
        } catch (e) {
          console.error('Erro ao fechar ticket:', e);
          await interaction.reply({ content: '❌ Erro ao fechar ticket. Verifique minhas permissões.', ephemeral: true });
        }
      }

      if (interaction.customId === 'btn_add_membro') {
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
      }

      if (interaction.customId === 'btn_avisar_adm') {
        const config = await getConfig(interaction.guild.id);
        const cargo = interaction.guild.roles.cache.get(config.ticket_cargo);
        if (cargo) {
          await thread.send({ content: `📢 Atenção ${cargo}! Um admin está online e disponível no ticket.` });
        }
        await interaction.reply({ content: '✅ Staff avisado!', ephemeral: true });
      }
    }

    if (interaction.customId === 'btn_mencionar_staff') {
      const config = await getConfig(interaction.guild.id);
      const cargo = interaction.guild.roles.cache.get(config.ticket_cargo);
      if (cargo) {
        await interaction.channel.send({ content: `${cargo} foi mencionado pelo usuário ${interaction.user}!` });
      }
      await interaction.reply({ content: '✅ Staff mencionado!', ephemeral: true });
    }

    if (interaction.customId === 'btn_vender') {
      const modal = new ModalBuilder()
        .setCustomId('modal_vender')
        .setTitle('Vender Gmail');

      const emailInput = new TextInputBuilder().setCustomId('input_email').setLabel('E-mail').setPlaceholder('exemplo@gmail.com').setStyle(TextInputStyle.Short).setRequired(true);
      const senhaInput = new TextInputBuilder().setCustomId('input_senha').setLabel('Senha').setPlaceholder('Senha do e-mail').setStyle(TextInputStyle.Short).setRequired(true);
      const pixInput = new TextInputBuilder().setCustomId('input_pix').setLabel('Chave PIX').setPlaceholder('Sua chave PIX').setStyle(TextInputStyle.Short).setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(emailInput);
      const row2 = new ActionRowBuilder().addComponents(senhaInput);
      const row3 = new ActionRowBuilder().addComponents(pixInput);

      modal.addComponents(row1, row2, row3);
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'btn_verificado' || interaction.customId === 'btn_recusado') {
      const config = await getConfig(interaction.guild.id);
      const thread = interaction.channel;
      if (!thread.isThread()) return interaction.reply({ content: 'Não é uma thread.', ephemeral: true });

      if (!await isAdmin(interaction.member)) {
        return interaction.reply({ content: '❌ Apenas administradores podem verificar.', ephemeral: true });
      }

      const vendedorId = thread.name.split('-')[0];
      const vendedor = await interaction.guild.members.fetch(vendedorId).catch(() => null);

      if (interaction.customId === 'btn_verificado') {
        const targetChannel = interaction.guild.channels.cache.get(config.verificado_channel);
        if (!targetChannel) return interaction.reply({ content: 'Canal verificado não configurado.', ephemeral: true });

        await targetChannel.send({ content: `✅ Venda verificada por ${interaction.user.tag}\nVendedor: <@${vendedorId}>` });
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

        const feedbackChannel = interaction.guild.channels.cache.get(config.feedback_channel);
        if (feedbackChannel) {
          await feedbackChannel.send(`📝 Venda de <@${vendedorId}> foi verificada. Deixe um feedback!`);
        }
        await interaction.reply({ content: '✅ Venda verificada!', ephemeral: true });
      }

      if (interaction.customId === 'btn_recusado') {
        const targetChannel = interaction.guild.channels.cache.get(config.recusado_channel);
        if (!targetChannel) return interaction.reply({ content: 'Canal recusado não configurado.', ephemeral: true });

        await targetChannel.send({ content: `❌ Venda recusada por ${interaction.user.tag}\nVendedor: <@${vendedorId}>` });
        await thread.setArchived(true);
        await thread.setLocked(true);

        if (vendedor) {
          try {
            await vendedor.send('😔 Sua venda foi **recusada**.');
          } catch (e) {}
        }
        await interaction.reply({ content: '❌ Venda recusada.', ephemeral: true });
      }
    }
  }

  // ============ MODAIS ============
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_vender') {
      const email = interaction.fields.getTextInputValue('input_email');
      const senha = interaction.fields.getTextInputValue('input_senha');
      const pix = interaction.fields.getTextInputValue('input_pix');

      const vendedor = interaction.user;
      const channel = interaction.channel;
      if (!channel) return;

      try {
        const thread = await channel.threads.create({
          name: `${vendedor.id}-venda`,
          autoArchiveDuration: 60,
          type: ChannelType.PrivateThread,
          reason: 'Venda de Gmail',
        });

        // Adicionar todos os membros com o cargo admin_role à thread para que possam verificar
        const config = await getConfig(interaction.guild.id);
        if (config.admin_role) {
          await addRoleToThread(thread, config.admin_role);
        }

        await thread.members.remove(vendedor.id).catch(() => {});

        const infoEmbed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('📧 Nova Venda de Gmail')
          .setDescription('**Detalhes da conta** (clique para copiar):')
          .addFields(
            { name: '📧 E-mail', value: `\`\`\`${email}\`\`\`` },
            { name: '🔒 Senha', value: `\`\`\`${senha}\`\`\`` },
            { name: '💠 Chave PIX', value: `\`\`\`${pix}\`\`\`` },
            { name: '👤 Vendedor', value: `<@${vendedor.id}>` }
          )
          .setFooter({ text: 'Use os botões abaixo para verificar ou recusar.' });

        const qrBuffer = await generatePixQrCode(pix);
        if (qrBuffer) {
          const attachment = new AttachmentBuilder(qrBuffer, { name: 'pix-qrcode.png' });
          await thread.send({ content: '📱 **QR Code PIX para pagamento:**', files: [attachment] });
        } else {
          await thread.send({ content: '⚠️ Não foi possível gerar o QR Code, mas a chave PIX está acima.' });
        }

        const verificadoButton = new ButtonBuilder().setCustomId('btn_verificado').setLabel('Verificado').setStyle(ButtonStyle.Success).setEmoji('✅');
        const recusadoButton = new ButtonBuilder().setCustomId('btn_recusado').setLabel('Recusar').setStyle(ButtonStyle.Danger).setEmoji('❌');

        const row = new ActionRowBuilder().addComponents(verificadoButton, recusadoButton);

        await thread.send({ embeds: [infoEmbed], components: [row] });
        await interaction.reply({ content: `✅ Venda enviada! Os administradores revisarão.`, ephemeral: true });
      } catch (e) {
        console.error('Erro ao criar thread:', e);
        await interaction.reply({ content: '❌ Erro ao processar venda. Tente novamente.', ephemeral: true });
      }
    }

    if (interaction.customId === 'modal_add_membro') {
      const userId = interaction.fields.getTextInputValue('input_user_id');
      const thread = interaction.channel;
      try {
        await thread.members.add(userId);
        await interaction.reply({ content: `✅ Membro <@${userId}> adicionado ao ticket!`, ephemeral: true });
      } catch (e) {
        await interaction.reply({ content: '❌ Erro ao adicionar membro. Verifique o ID.', ephemeral: true });
      }
    }

    if (interaction.customId === 'modal_meta_vendas') {
      const meta = parseInt(interaction.fields.getTextInputValue('input_meta'));
      if (isNaN(meta) || meta < 0) {
        return interaction.reply({ content: '❌ Valor inválido.', ephemeral: true });
      }
      const config = await getConfig(interaction.guild.id);
      config.meta_vendas = meta;
      await setConfig(interaction.guild.id, config);
      await interaction.reply({ content: `✅ Meta de vendas definida para ${meta}!`, ephemeral: true });
    }

    if (interaction.customId.startsWith('modal_desc_')) {
      const configKey = interaction.customId.replace('modal_desc_', '');
      const value = interaction.fields.getTextInputValue('input_desc');
      const config = await getConfig(interaction.guild.id);
      config[configKey] = value;
      await setConfig(interaction.guild.id, config);
      await interaction.reply({ content: `✅ Descrição atualizada!`, ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
