const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.get('/', (req, res) => res.send('Bot está online!'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor web rodando na porta ${port}`));

// Configuração do Supabase
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
  admin_role: '1541498053175803985',
  meta_vendas: 0,
  cargo_meta: '',
  painel_descricao: 'Clique no botão abaixo para vender seu Gmail.'
};

// Funções de banco de dados com Supabase
async function getConfig(guildId) {
  const { data, error } = await supabase
    .from('configs')
    .select('*')
    .eq('guild_id', guildId)
    .single();

  if (error || !data) {
    // Se não existir, retorna config padrão
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
  // Primeiro tenta inserir/atualizar com upsert
  const { data, error } = await supabase
    .from('sales')
    .upsert({ user_id: userId, guild_id: guildId, count: 1 }, { onConflict: 'user_id,guild_id' })
    .select('count')
    .single();

  if (data) {
    // Incrementa manualmente
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
  return member.roles.cache.has(config.admin_role) || member.permissions.has(PermissionFlagsBits.Administrator);
}

// Registrar slash commands
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('enviar')
      .setDescription('Envia o painel de vendas no canal configurado')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
      .setName('configurar')
      .setDescription('Abre o painel de configuração (somente admin)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
      .setName('vendas')
      .setDescription('Mostra quantas vendas você concluiu'),
    new SlashCommandBuilder()
      .setName('perfil')
      .setDescription('Mostra seu perfil de vendas'),
  ];
  await client.application.commands.set(commands);
  console.log('📡 Slash commands registrados!');
}

client.once('ready', async () => {
  console.log(`✅ Bot ${client.user.tag} está online!`);
  await registerCommands();
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const { commandName, member, guild, channel } = interaction;

    if (commandName === 'enviar') {
      if (!await isAdmin(member)) {
        return interaction.reply({ content: '❌ Você não tem permissão.', ephemeral: true });
      }

      const config = await getConfig(guild.id);
      const descricao = config.painel_descricao || defaultConfig.painel_descricao;
      const painelEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🛒 Painel de Vendas - Gmail')
        .setDescription(descricao)
        .setFooter({ text: 'Sistema automático de verificação' });

      const venderButton = new ButtonBuilder()
        .setCustomId('btn_vender')
        .setLabel('Vender Gmail')
        .setEmoji('💰')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(venderButton);

      let targetChannel = channel;
      if (config.painel_channel) {
        const configuredChannel = guild.channels.cache.get(config.painel_channel);
        if (configuredChannel) {
          targetChannel = configuredChannel;
        } else {
          return interaction.reply({ content: '⚠️ Canal do painel configurado não encontrado. Verifique as configurações.', ephemeral: true });
        }
      }

      await interaction.reply({ content: `✅ Painel enviado para ${targetChannel}.`, ephemeral: true });
      await targetChannel.send({ embeds: [painelEmbed], components: [row] });
    }

    if (commandName === 'configurar') {
      if (!await isAdmin(member)) {
        return interaction.reply({ content: '❌ Você não tem permissão.', ephemeral: true });
      }
      const configEmbed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('⚙️ Configuração do Bot')
        .setDescription('Clique nos botões para definir canais, cargos e textos.');

      const buttons = [
        new ButtonBuilder().setCustomId('cfg_painel').setLabel('Canal do Painel').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg_paineldescricao').setLabel('Descrição do Painel').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg_verificado').setLabel('Canal Verificado').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg_recusado').setLabel('Canal Recusado').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg_feedback').setLabel('Canal Feedback').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg_adminrole').setLabel('Cargo Admin').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg_metavendas').setLabel('Meta de Vendas').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg_cargometa').setLabel('Cargo da Meta').setStyle(ButtonStyle.Secondary),
      ];

      const row1 = new ActionRowBuilder().addComponents(buttons[0], buttons[1], buttons[2], buttons[3], buttons[4]);
      const row2 = new ActionRowBuilder().addComponents(buttons[5], buttons[6], buttons[7]);
      await interaction.reply({ embeds: [configEmbed], components: [row1, row2], ephemeral: true });
    }

    if (commandName === 'vendas') {
      const sales = await getUserSales(interaction.user.id, guild.id);
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('📊 Suas Vendas Concluídas')
        .setDescription(`Você já concluiu **${sales}** venda(s).`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'perfil') {
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
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'btn_vender') {
      const modal = new ModalBuilder()
        .setCustomId('modal_vender')
        .setTitle('Vender Gmail');

      const emailInput = new TextInputBuilder()
        .setCustomId('input_email')
        .setLabel('E-mail')
        .setPlaceholder('exemplo@gmail.com')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const senhaInput = new TextInputBuilder()
        .setCustomId('input_senha')
        .setLabel('Senha')
        .setPlaceholder('Senha do e-mail')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const pixInput = new TextInputBuilder()
        .setCustomId('input_pix')
        .setLabel('Chave PIX')
        .setPlaceholder('Sua chave PIX (CPF, e-mail, etc)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(emailInput);
      const row2 = new ActionRowBuilder().addComponents(senhaInput);
      const row3 = new ActionRowBuilder().addComponents(pixInput);

      modal.addComponents(row1, row2, row3);
      await interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('cfg_')) {
      const configKey = interaction.customId.replace('cfg_', '');
      const modal = new ModalBuilder()
        .setCustomId(`modal_cfg_${configKey}`)
        .setTitle(`Configurar ${configKey}`);

      const input = new TextInputBuilder()
        .setCustomId('input_id')
        .setLabel('ID do canal ou cargo')
        .setPlaceholder('Cole o ID aqui')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      if (configKey === 'paineldescricao') {
        modal.setTitle('Descrição do Painel');
        input.setLabel('Nova descrição')
          .setPlaceholder('Digite a descrição que aparecerá no painel')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000);
      }
      if (configKey === 'metavendas') {
        input.setLabel('Quantidade de vendas')
          .setPlaceholder('Ex: 10');
      }
      if (configKey === 'cargometa') {
        input.setLabel('ID do cargo de recompensa')
          .setPlaceholder('Cole o ID do cargo');
      }

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);
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
              await targetChannel.send(`🎉 <@${vendedorId}> alcançou a meta de ${config.meta_vendas} vendas e recebeu o cargo ${cargoMeta}!`);
            } catch (e) {
              console.log('Erro ao adicionar cargo meta:', e);
              await targetChannel.send(`⚠️ Não consegui adicionar o cargo de meta para <@${vendedorId}>. Verifique as permissões do bot.`);
            }
          }
        }

        if (vendedor) {
          try {
            await vendedor.send('🎉 Sua venda foi **verificada**! Por favor, deixe um feedback sobre o processo.');
          } catch (e) { console.log('Não foi possível enviar DM.'); }
        }

        const feedbackChannel = interaction.guild.channels.cache.get(config.feedback_channel);
        if (feedbackChannel) {
          const feedbackEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('📝 Feedback de Venda')
            .setDescription(`Venda de <@${vendedorId}> foi verificada.\nPor favor, deixe seu feedback abaixo:`);
          await feedbackChannel.send({ embeds: [feedbackEmbed] });
        }
        await interaction.reply({ content: '✅ Venda verificada com sucesso!', ephemeral: true });
      }

      if (interaction.customId === 'btn_recusado') {
        const targetChannel = interaction.guild.channels.cache.get(config.recusado_channel);
        if (!targetChannel) return interaction.reply({ content: 'Canal recusado não configurado.', ephemeral: true });

        await targetChannel.send({ content: `❌ Venda recusada por ${interaction.user.tag}\nVendedor: <@${vendedorId}>` });
        await thread.setArchived(true);
        await thread.setLocked(true);

        if (vendedor) {
          try {
            await vendedor.send('😔 Sua venda foi **recusada**. Entre em contato com um administrador para mais detalhes.');
          } catch (e) { console.log('Não foi possível enviar DM.'); }
        }
        await interaction.reply({ content: '❌ Venda recusada.', ephemeral: true });
      }
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_vender') {
      const email = interaction.fields.getTextInputValue('input_email');
      const senha = interaction.fields.getTextInputValue('input_senha');
      const pix = interaction.fields.getTextInputValue('input_pix');

      const vendedor = interaction.user;
      const channel = interaction.channel;
      if (!channel) return;

      const thread = await channel.threads.create({
        name: `${vendedor.id}-venda`,
        autoArchiveDuration: 60,
        type: ChannelType.PrivateThread,
        reason: 'Venda de Gmail',
      });

      await thread.members.add(vendedor.id);
      const config = await getConfig(interaction.guild.id);
      const adminRole = interaction.guild.roles.cache.get(config.admin_role);
      if (adminRole) {
        await thread.members.add(adminRole.id);
      }

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

      const verificadoButton = new ButtonBuilder()
        .setCustomId('btn_verificado')
        .setLabel('Verificado')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅');

      const recusadoButton = new ButtonBuilder()
        .setCustomId('btn_recusado')
        .setLabel('Recusar')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌');

      const row = new ActionRowBuilder().addComponents(verificadoButton, recusadoButton);

      await thread.send({ embeds: [infoEmbed], components: [row] });
      await interaction.reply({ content: `✅ Venda enviada! Acompanhe na thread <#${thread.id}>`, ephemeral: true });
    }

    if (interaction.customId.startsWith('modal_cfg_')) {
      const configKey = interaction.customId.replace('modal_cfg_', '');
      const value = interaction.fields.getTextInputValue('input_id');
      const config = await getConfig(interaction.guild.id);

      if (configKey === 'painel') config.painel_channel = value;
      else if (configKey === 'paineldescricao') config.painel_descricao = value;
      else if (configKey === 'verificado') config.verificado_channel = value;
      else if (configKey === 'recusado') config.recusado_channel = value;
      else if (configKey === 'feedback') config.feedback_channel = value;
      else if (configKey === 'adminrole') config.admin_role = value;
      else if (configKey === 'metavendas') {
        const meta = parseInt(value);
        if (isNaN(meta) || meta < 0) {
          return interaction.reply({ content: '❌ Valor inválido. Digite um número inteiro não negativo.', ephemeral: true });
        }
        config.meta_vendas = meta;
      }
      else if (configKey === 'cargometa') config.cargo_meta = value;

      await setConfig(interaction.guild.id, config);
      await interaction.reply({ content: `✅ Configuração de "${configKey}" atualizada!`, ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
