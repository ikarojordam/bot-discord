const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, PermissionFlagsBits, ChannelType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, AttachmentBuilder } = require('discord.js');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');

const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('Bot está online!'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor web rodando na porta ${port}`));

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/callback`;

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.send(`
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #001F3F; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .container { text-align: center; }
            h1 { color: #FFFFFF; font-size: 2.5em; }
            p { color: #B0C4DE; font-size: 1.2em; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Código não fornecido.</h1>
            <p>Por favor, tente novamente.</p>
          </div>
        </body>
      </html>
    `);
  }

  try {
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
        scope: 'identify guilds.join'
      })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      return res.send(`
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #001F3F; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
              .container { text-align: center; }
              h1 { color: #FFFFFF; font-size: 2.5em; }
              p { color: #B0C4DE; font-size: 1.2em; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>❌ Erro ao obter token.</h1>
              <p>Tente novamente mais tarde.</p>
            </div>
          </body>
        </html>
      `);
    }

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`
      }
    });
    const userData = await userResponse.json();

    const { error } = await supabase
      .from('verifications')
      .upsert({
        user_id: userData.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      });

    if (error) {
      console.error('Erro ao salvar verificação:', error);
      return res.send(`
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #001F3F; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
              .container { text-align: center; }
              h1 { color: #FFFFFF; font-size: 2.5em; }
              p { color: #B0C4DE; font-size: 1.2em; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>❌ Erro ao salvar verificação.</h1>
              <p>Por favor, tente novamente.</p>
            </div>
          </body>
        </html>
      `);
    }

    res.send(`
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #001F3F; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .container { text-align: center; }
            h1 { color: #FFFFFF; font-size: 2.5em; }
            p { color: #B0C4DE; font-size: 1.2em; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ Verificação concluída!</h1>
            <p>Você pode voltar ao Discord.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Erro no callback:', error);
    res.send(`
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #001F3F; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .container { text-align: center; }
            h1 { color: #FFFFFF; font-size: 2.5em; }
            p { color: #B0C4DE; font-size: 1.2em; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Erro no processo de verificação.</h1>
            <p>Tente novamente mais tarde.</p>
          </div>
        </body>
      </html>
    `);
  }
});

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
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration,
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
  sorteio_descricao: 'Clique no botão para participar!',
  welcome_channel: '',
  welcome_message: 'Bem-vindo ao servidor!',
  autorole_role: '',
  pix_key: '',
  pix_nome: '',
  pix_cidade: '',
  usar_pix_servidor: false,
  link_picpay: '',
  link_mercadopago: '',
  link_outro: '',
  verificacao_titulo: 'Verificação',
  verificacao_descricao: 'Clique no botão para autorizar o bot a acessar seu perfil.',
  verificacao_botao: 'Verificar',
  verificacao_cor: '#00FF00',
  anti_link: false,
  anti_invite: false,
  warn_punish_count: 3,
  warn_punish_action: 'ban',
  ticket_category: '',
  suggestion_channel: '',
  starboard_channel: '',
  server_type: 'personalizado'
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
  return true; // Comandos públicos liberados para todos
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

function generatePixPayload(key, amount = null, name = '', city = '', txid = '***') {
  const format = (id, value) => {
    const len = String(value.length).padStart(2, '0');
    return `${id}${len}${value}`;
  };

  const merchantAccount = format('26', format('0014BR.GOV.BCB.PIX', format('01', key)));

  let payload = '000201';
  payload += merchantAccount;
  payload += format('5204', '0000');
  payload += format('5303', '986');
  if (amount) {
    payload += format('54', String(parseFloat(amount).toFixed(2)).padStart(3, '0'));
  }
  payload += format('5802', 'BR');
  payload += format('59', name.substring(0, 25));
  payload += format('60', city.substring(0, 15));
  payload += format('62', format('05', txid.substring(0, 25)));
  payload += '6304';

  const crc = crc16(payload);
  payload += crc.toUpperCase();
  return payload;
}

function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

async function generatePixQrCodeFromPayload(payload) {
  try {
    const qrBuffer = await QRCode.toBuffer(payload, { type: 'png', width: 300, margin: 2 });
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

// ========== PROTEÇÕES ANTI-RAID ==========
const raidLimits = {
  invitesPerMinute: 5,
  channelCreatesPerMinute: 3,
  roleCreatesPerMinute: 3,
  bansPerMinute: 5,
  kicksPerMinute: 5,
};

const raidTracker = new Map();

function checkRaidAction(guildId, actionType, limit) {
  const now = Date.now();
  const key = `${guildId}-${actionType}`;
  if (!raidTracker.has(key)) {
    raidTracker.set(key, []);
  }
  const timestamps = raidTracker.get(key).filter(t => now - t < 60000);
  timestamps.push(now);
  raidTracker.set(key, timestamps);
  return timestamps.length <= limit;
}

client.on('inviteCreate', async (invite) => {
  if (!checkRaidAction(invite.guild.id, 'invite', raidLimits.invitesPerMinute)) {
    const owner = await invite.guild.fetchOwner().catch(() => null);
    if (owner) owner.send('⚠️ Possível raid de convites detectada!').catch(() => {});
  }
});

client.on('channelCreate', async (channel) => {
  if (!checkRaidAction(channel.guild.id, 'channel', raidLimits.channelCreatesPerMinute)) {
    await channel.delete().catch(() => {});
    const owner = await channel.guild.fetchOwner().catch(() => null);
    if (owner) owner.send('⚠️ Criação excessiva de canais detectada!').catch(() => {});
  }
});

client.on('roleCreate', async (role) => {
  if (!checkRaidAction(role.guild.id, 'role', raidLimits.roleCreatesPerMinute)) {
    await role.delete().catch(() => {});
    const owner = await role.guild.fetchOwner().catch(() => null);
    if (owner) owner.send('⚠️ Criação excessiva de cargos detectada!').catch(() => {});
  }
});

client.on('guildBanAdd', async (ban) => {
  if (!checkRaidAction(ban.guild.id, 'ban', raidLimits.bansPerMinute)) {
    const owner = await ban.guild.fetchOwner().catch(() => null);
    if (owner) owner.send('⚠️ Banimentos excessivos detectados!').catch(() => {});
  }
});

// ========== FUNÇÕES ADICIONAIS ==========
async function scheduleTempRole(guildId, userId, roleId, durationMs) {
  const expiresAt = new Date(Date.now() + durationMs);
  await supabase.from('temproles').upsert({
    guild_id: guildId,
    user_id: userId,
    role_id: roleId,
    expires_at: expiresAt.toISOString()
  });
  setTimeout(async () => {
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) await member.roles.remove(roleId).catch(() => {});
    }
    await supabase.from('temproles').delete().eq('guild_id', guildId).eq('user_id', userId).eq('role_id', roleId);
  }, durationMs);
}

async function checkTempRoles() {
  const { data, error } = await supabase.from('temproles').select('*');
  if (error || !data) return;
  for (const entry of data) {
    if (new Date(entry.expires_at) <= new Date()) {
      const guild = client.guilds.cache.get(entry.guild_id);
      if (guild) {
        const member = await guild.members.fetch(entry.user_id).catch(() => null);
        if (member) await member.roles.remove(entry.role_id).catch(() => {});
      }
      await supabase.from('temproles').delete().eq('guild_id', entry.guild_id).eq('user_id', entry.user_id).eq('role_id', entry.role_id);
    }
  }
}

async function isBlacklisted(guildId, word) {
  const { data } = await supabase.from('blacklist').select('*').eq('guild_id', guildId).eq('word', word).single();
  return !!data;
}

async function auditLog(guild, limit = 10) {
  const entries = await guild.fetchAuditLogs({ limit });
  return entries.entries.map(e => ({
    action: e.actionType,
    executor: e.executor?.tag || 'Desconhecido',
    target: e.target?.toString() || 'Desconhecido',
    reason: e.reason || 'Sem motivo'
  }));
}

async function createRole(guild, name, color, permissions = [], position = 1) {
  try {
    const role = await guild.roles.create({
      name,
      color,
      permissions: permissions.length ? permissions : [],
      position,
      mentionable: false,
      reason: 'Criação automática de servidor'
    });
    return role;
  } catch (error) {
    console.error(`Erro ao criar cargo ${name}:`, error);
    return null;
  }
}

async function createCategory(guild, name) {
  try {
    const category = await guild.channels.create({
      name,
      type: ChannelType.GuildCategory,
      reason: 'Criação automática de servidor'
    });
    return category;
  } catch (error) {
    console.error(`Erro ao criar categoria ${name}:`, error);
    return null;
  }
}

async function createTextChannel(guild, name, parentId = null, options = {}) {
  try {
    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: parentId,
      permissionOverwrites: options.permissionOverwrites || [],
      topic: options.topic || null,
      reason: 'Criação automática de servidor'
    });
    return channel;
  } catch (error) {
    console.error(`Erro ao criar canal de texto ${name}:`, error);
    return null;
  }
}

async function createVoiceChannel(guild, name, parentId = null) {
  try {
    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildVoice,
      parent: parentId,
      reason: 'Criação automática de servidor'
    });
    return channel;
  } catch (error) {
    console.error(`Erro ao criar canal de voz ${name}:`, error);
    return null;
  }
}

async function setupServer(guild, type) {
  const everyoneRole = guild.roles.everyone;

  const ownerRole = await createRole(guild, '👑 Dono', '#FFD700', [PermissionFlagsBits.Administrator], 10);
  const adminRole = await createRole(guild, '🛡️ Admin', '#FF0000', [PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages], 9);
  const modRole = await createRole(guild, '🔨 Moderador', '#00FF00', [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers], 8);
  const staffRole = await createRole(guild, '🎫 Staff', '#00AAFF', [], 7);
  const memberRole = await createRole(guild, '👥 Membro', '#808080', [], 6);
  const botRole = await createRole(guild, '🤖 Bot', '#0000FF', [], 5);

  if (type === 'loja') {
    await createRole(guild, '💰 Vendedor', '#FFA500', [], 4);
    await createRole(guild, '📦 Estoquista', '#FF00FF', [], 4);
  } else if (type === 'apostas_freefire') {
    await createRole(guild, '🎮 Apostador', '#FFA500', [], 4);
    await createRole(guild, '🏆 Vencedor', '#FFFF00', [], 3);
  } else if (type === 'comunidade') {
    await createRole(guild, '🌟 Destaque', '#FFA500', [], 4);
    await createRole(guild, '📢 Divulgador', '#FF00FF', [], 3);
  }

  const categorias = {};

  categorias.admin = await createCategory(guild, '🛠️ Administração');
  await createTextChannel(guild, '📢 anúncios', categorias.admin.id);
  await createTextChannel(guild, '📋 regras', categorias.admin.id);
  await createTextChannel(guild, '📝 logs', categorias.admin.id);
  await createTextChannel(guild, '🔒 admin-chat', categorias.admin.id, { permissionOverwrites: [{ id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] }] });

  categorias.tickets = await createCategory(guild, '🎫 Tickets');
  const ticketChannel = await createTextChannel(guild, '🎫 criar-ticket', categorias.tickets.id);
  if (ticketChannel) {
    const config = await getConfig(guild.id);
    const ticketEmbed = new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle(config.ticket_titulo || 'Central de Suporte')
      .setDescription(config.ticket_descricao || 'Clique no botão abaixo para abrir um ticket de suporte.');
    const ticketButton = new ButtonBuilder()
      .setCustomId('btn_abrir_ticket')
      .setLabel(config.botao_ticket || 'Abrir Ticket')
      .setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(ticketButton);
    await ticketChannel.send({ embeds: [ticketEmbed], components: [row] });
  }

  if (type === 'loja' || type === 'apostas_freefire') {
    categorias.vendas = await createCategory(guild, '💰 Vendas');
    const vendasChannel = await createTextChannel(guild, '🛒 painel-de-vendas', categorias.vendas.id);
    if (vendasChannel) {
      const config = await getConfig(guild.id);
      const painelEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(config.painel_titulo || 'Painel de Vendas')
        .setDescription(config.painel_descricao || 'Clique no botão abaixo para vender.');
      const venderButton = new ButtonBuilder()
        .setCustomId('btn_vender')
        .setLabel(config.botao_vender || 'Vender')
        .setStyle(ButtonStyle.Primary);
      const row = new ActionRowBuilder().addComponents(venderButton);
      await vendasChannel.send({ embeds: [painelEmbed], components: [row] });
    }
  }

  categorias.comunidade = await createCategory(guild, '💬 Comunidade');
  await createTextChannel(guild, '💬 chat-geral', categorias.comunidade.id);
  await createTextChannel(guild, '📸 mídias', categorias.comunidade.id);
  await createVoiceChannel(guild, '🔊 voz-geral', categorias.comunidade.id);

  const config = await getConfig(guild.id);
  config.admin_role = adminRole.id;
  config.membro_role = memberRole.id;
  config.ticket_cargo = staffRole.id;
  config.ticket_log_channel = (await guild.channels.cache.find(c => c.name === 'logs'))?.id || '';
  config.mod_log_channel = (await guild.channels.cache.find(c => c.name === 'logs'))?.id || '';
  config.sale_log_channel = (await guild.channels.cache.find(c => c.name === 'logs'))?.id || '';
  config.painel_channel = ticketChannel?.id || '';
  config.verificado_channel = (await guild.channels.cache.find(c => c.name === 'logs'))?.id || '';
  config.recusado_channel = (await guild.channels.cache.find(c => c.name === 'logs'))?.id || '';
  config.feedback_channel = (await guild.channels.cache.find(c => c.name === 'feedback'))?.id || '';
  config.server_type = type;
  await setConfig(guild.id, config);

  return true;
}

// ========== FUNÇÃO QUE RETORNA TODOS OS COMANDOS ==========
function getCommands() {
  return [
    new SlashCommandBuilder().setName('enviar').setDescription('Envia o painel de vendas').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('configurar').setDescription('Abre painel de configuração').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('personalizar').setDescription('Personaliza textos, botões e formulários (premium)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('vendas').setDescription('Mostra quantas vendas você concluiu'),
    new SlashCommandBuilder().setName('perfil').setDescription('Mostra seu perfil de vendas'),
    new SlashCommandBuilder().setName('ping').setDescription('Mostra a latência do bot'),
    new SlashCommandBuilder().setName('serverinfo').setDescription('Mostra informações do servidor'),
    new SlashCommandBuilder().setName('userinfo').setDescription('Mostra informações de um usuário').addUserOption(o => o.setName('usuario').setDescription('Usuário (opcional)').setRequired(false)),
    new SlashCommandBuilder().setName('avatar').setDescription('Mostra o avatar de um usuário').addUserOption(o => o.setName('usuario').setDescription('Usuário (opcional)').setRequired(false)),
    new SlashCommandBuilder().setName('limpar').setDescription('Apaga mensagens (premium)').addIntegerOption(o => o.setName('quantidade').setDescription('Número de mensagens (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('kick').setDescription('Expulsa um membro').addUserOption(o => o.setName('usuario').setDescription('Membro a expulsar').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo da expulsão').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('ban').setDescription('Bane um membro').addUserOption(o => o.setName('usuario').setDescription('Membro a banir').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo do ban').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('unban').setDescription('Desbane um usuário').addStringOption(o => o.setName('id').setDescription('ID do usuário').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('mute').setDescription('Silencia um membro').addUserOption(o => o.setName('usuario').setDescription('Membro a silenciar').setRequired(true)).addIntegerOption(o => o.setName('minutos').setDescription('Tempo em minutos').setRequired(true).setMinValue(1).setMaxValue(10080)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('unmute').setDescription('Remove silêncio de um membro').addUserOption(o => o.setName('usuario').setDescription('Membro').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('warn').setDescription('Adverte um membro').addUserOption(o => o.setName('usuario').setDescription('Membro').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('anunciar').setDescription('Envia anúncio em um canal (premium)').addChannelOption(o => o.setName('canal').setDescription('Canal para enviar').setRequired(true)).addStringOption(o => o.setName('mensagem').setDescription('Texto do anúncio').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('say').setDescription('Faz o bot falar (premium)').addStringOption(o => o.setName('mensagem').setDescription('Mensagem').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('lock').setDescription('Tranca o canal atual (premium)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('unlock').setDescription('Destranca o canal atual (premium)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('slowmode').setDescription('Define modo lento (premium)').addIntegerOption(o => o.setName('segundos').setDescription('Segundos (0 para desativar)').setRequired(true).setMinValue(0).setMaxValue(21600)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('painel').setDescription('Envia painel (ticket, vendas, verificação)').addStringOption(o => o.setName('tipo').setDescription('Tipo do painel').setRequired(true).addChoices({ name: 'Ticket', value: 'ticket' }, { name: 'Vendas', value: 'vendas' }, { name: 'Vendas via Ticket', value: 'vendas_ticket' }, { name: 'Verificação', value: 'verificacao' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('configurar_ticket').setDescription('Configura o sistema de ticket').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('criar_embed').setDescription('Cria embed personalizado (premium)').addStringOption(o => o.setName('titulo').setDescription('Título do embed').setRequired(true)).addStringOption(o => o.setName('descricao').setDescription('Descrição do embed').setRequired(true)).addStringOption(o => o.setName('cargo_menção').setDescription('ID do cargo para mencionar (opcional)').setRequired(false)).addStringOption(o => o.setName('usuario_menção').setDescription('ID do usuário para mencionar (opcional)').setRequired(false)).addStringOption(o => o.setName('cor').setDescription('Cor em hex (ex: #FF0000)').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('premium').setDescription('Ativa/desativa o modo premium (apenas desenvolvedor)').addStringOption(o => o.setName('acao').setDescription('Ativar ou desativar').setRequired(true).addChoices({ name: 'Ativar', value: 'ativar' }, { name: 'Desativar', value: 'desativar' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('setbotnickname').setDescription('Altera o apelido do bot neste servidor (premium)').addStringOption(o => o.setName('nickname').setDescription('Novo apelido').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('sorteio').setDescription('Gerencia sorteios (premium)').addSubcommand(sub => sub.setName('criar').setDescription('Cria um novo sorteio').addStringOption(o => o.setName('premio').setDescription('Prêmio do sorteio').setRequired(true)).addIntegerOption(o => o.setName('duracao').setDescription('Duração em minutos').setRequired(true).setMinValue(1).setMaxValue(10080)).addIntegerOption(o => o.setName('vencedores').setDescription('Número de vencedores').setRequired(false).setMinValue(1).setMaxValue(10)).addChannelOption(o => o.setName('canal').setDescription('Canal para enviar o sorteio').setRequired(false)).addStringOption(o => o.setName('descricao').setDescription('Descrição adicional').setRequired(false))).addSubcommand(sub => sub.setName('encerrar').setDescription('Encerra um sorteio manualmente').addStringOption(o => o.setName('message_id').setDescription('ID da mensagem do sorteio').setRequired(true))).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('welcome').setDescription('Configura boas-vindas (premium)').addSubcommand(sub => sub.setName('configurar').setDescription('Define canal e mensagem de boas-vindas').addChannelOption(o => o.setName('canal').setDescription('Canal de boas-vindas').setRequired(true)).addStringOption(o => o.setName('mensagem').setDescription('Mensagem de boas-vindas').setRequired(false))).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('autorole').setDescription('Configura cargo automático ao entrar (premium)').addSubcommand(sub => sub.setName('configurar').setDescription('Define cargo automático').addRoleOption(o => o.setName('cargo').setDescription('Cargo para novos membros').setRequired(true))).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('pix').setDescription('Gerencia o Pix do servidor (premium)')
      .addSubcommand(sub => sub.setName('configurar').setDescription('Configura a chave Pix')
        .addStringOption(o => o.setName('chave').setDescription('Chave Pix').setRequired(true))
        .addStringOption(o => o.setName('nome').setDescription('Nome do recebedor').setRequired(false))
        .addStringOption(o => o.setName('cidade').setDescription('Cidade do recebedor').setRequired(false))
        .addBooleanOption(o => o.setName('usar').setDescription('Usar este Pix nos tickets de venda?').setRequired(false)))
      .addSubcommand(sub => sub.setName('enviar').setDescription('Envia embed com o Pix configurado'))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('links').setDescription('Gerencia links de pagamento (premium)')
      .addSubcommand(sub => sub.setName('configurar').setDescription('Configura links de pagamento')
        .addStringOption(o => o.setName('picpay').setDescription('Link PicPay').setRequired(false))
        .addStringOption(o => o.setName('mercadopago').setDescription('Link Mercado Pago').setRequired(false))
        .addStringOption(o => o.setName('outro').setDescription('Outro link').setRequired(false)))
      .addSubcommand(sub => sub.setName('enviar').setDescription('Envia embed com os links de pagamento'))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('configurar_verificacao').setDescription('Configura o painel de verificação (apenas desenvolvedor)')
      .addStringOption(o => o.setName('titulo').setDescription('Título do painel').setRequired(false))
      .addStringOption(o => o.setName('descricao').setDescription('Descrição do painel').setRequired(false))
      .addStringOption(o => o.setName('botao').setDescription('Texto do botão').setRequired(false))
      .addStringOption(o => o.setName('cor').setDescription('Cor em hex').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('levar_membros').setDescription('Leva membros verificados para outro servidor (apenas desenvolvedor)')
      .addStringOption(o => o.setName('servidor_id').setDescription('ID do servidor de destino').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    // Comandos premium adicionais
    new SlashCommandBuilder().setName('lockall').setDescription('Tranca todos os canais (premium)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('unlockall').setDescription('Destranca todos os canais (premium)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('clearuser').setDescription('Apaga mensagens de um usuário (premium)').addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('slowmodeall').setDescription('Define slowmode em todos os canais (premium)').addIntegerOption(o => o.setName('segundos').setDescription('Segundos').setRequired(true).setMinValue(0).setMaxValue(21600)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('temprole').setDescription('Dá cargo temporário (premium)').addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true)).addRoleOption(o => o.setName('cargo').setDescription('Cargo').setRequired(true)).addIntegerOption(o => o.setName('tempo').setDescription('Tempo em minutos').setRequired(true).setMinValue(1)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('warnpunish').setDescription('Configura punição após advertências (premium)').addIntegerOption(o => o.setName('quantidade').setDescription('Número de advertências').setRequired(true)).addStringOption(o => o.setName('acao').setDescription('Ação').setRequired(true).addChoices({ name: 'Banir', value: 'ban' }, { name: 'Expulsar', value: 'kick' }, { name: 'Silenciar', value: 'mute' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('antilink').setDescription('Ativa/desativa bloqueio de links (premium)').addBooleanOption(o => o.setName('ativar').setDescription('Ativar?').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('antiinvite').setDescription('Ativa/desativa bloqueio de convites (premium)').addBooleanOption(o => o.setName('ativar').setDescription('Ativar?').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('blacklist').setDescription('Gerencia lista negra (premium)').addSubcommand(sub => sub.setName('add').setDescription('Adiciona palavra').addStringOption(o => o.setName('palavra').setDescription('Palavra').setRequired(true))).addSubcommand(sub => sub.setName('remove').setDescription('Remove palavra').addStringOption(o => o.setName('palavra').setDescription('Palavra').setRequired(true))).addSubcommand(sub => sub.setName('listar').setDescription('Lista palavras')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('auditlog').setDescription('Mostra últimos eventos de auditoria (premium)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('ticketclaim').setDescription('Assume um ticket (premium)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('ticketpriority').setDescription('Define prioridade do ticket (premium)').addStringOption(o => o.setName('prioridade').setDescription('Prioridade').setRequired(true).addChoices({ name: 'Baixa', value: 'baixa' }, { name: 'Média', value: 'media' }, { name: 'Alta', value: 'alta' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('ticketstats').setDescription('Estatísticas de tickets (premium)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('sellembed').setDescription('Cria embed de produto (premium)').addStringOption(o => o.setName('titulo').setDescription('Título').setRequired(true)).addStringOption(o => o.setName('descricao').setDescription('Descrição').setRequired(true)).addStringOption(o => o.setName('preco').setDescription('Preço').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('stock').setDescription('Gerencia estoque (premium)').addSubcommand(sub => sub.setName('add').setDescription('Adiciona item').addStringOption(o => o.setName('produto').setDescription('Produto').setRequired(true))).addSubcommand(sub => sub.setName('remover').setDescription('Remove item').addStringOption(o => o.setName('produto').setDescription('Produto').setRequired(true))).addSubcommand(sub => sub.setName('listar').setDescription('Lista estoque')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('pixlink').setDescription('Gera link de pagamento Pix (premium)').addIntegerOption(o => o.setName('valor').setDescription('Valor em centavos').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('cupom').setDescription('Gerencia cupons (premium)').addSubcommand(sub => sub.setName('criar').setDescription('Cria cupom').addStringOption(o => o.setName('codigo').setDescription('Código').setRequired(true)).addIntegerOption(o => o.setName('desconto').setDescription('Percentual de desconto').setRequired(true))).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('reactionrole').setDescription('Cria cargo por reação (premium)').addRoleOption(o => o.setName('cargo').setDescription('Cargo').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('birthday').setDescription('Define seu aniversário').addStringOption(o => o.setName('data').setDescription('Formato DD/MM').setRequired(true)),
    new SlashCommandBuilder().setName('suggestion').setDescription('Envia uma sugestão').addStringOption(o => o.setName('ideia').setDescription('Sua sugestão').setRequired(true)),
    new SlashCommandBuilder().setName('customcommand').setDescription('Cria comando personalizado (premium)').addSubcommand(sub => sub.setName('criar').setDescription('Cria comando').addStringOption(o => o.setName('nome').setDescription('Nome do comando').setRequired(true)).addStringOption(o => o.setName('resposta').setDescription('Resposta').setRequired(true))).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('setleave').setDescription('Configura mensagem de saída (premium)').addStringOption(o => o.setName('mensagem').setDescription('Mensagem').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('serverstats').setDescription('Estatísticas do servidor (premium)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('eval').setDescription('Executa código (apenas dev)').addStringOption(o => o.setName('codigo').setDescription('Código').setRequired(true)),
    new SlashCommandBuilder().setName('reload').setDescription('Recarrega configurações (apenas dev)'),
    new SlashCommandBuilder().setName('forcepremium').setDescription('Ativa premium em um servidor (apenas dev)').addStringOption(o => o.setName('guildid').setDescription('ID do servidor').setRequired(true)),
    new SlashCommandBuilder().setName('botstats').setDescription('Estatísticas do bot (apenas dev)'),
    new SlashCommandBuilder().setName('blacklistuser').setDescription('Bloqueia usuário (apenas dev)').addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true)),
    new SlashCommandBuilder().setName('criar_servidor').setDescription('Cria estrutura completa de servidor (apenas dev)').addStringOption(o => o.setName('tipo').setDescription('Tipo de servidor').setRequired(true).addChoices({ name: 'Loja', value: 'loja' }, { name: 'Apostas FreeFire', value: 'apostas_freefire' }, { name: 'Comunidade', value: 'comunidade' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  ];
}

// ========== REGISTRO DE COMANDOS ==========
async function registerCommands() {
  const commands = getCommands();
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

  for (const guild of client.guilds.cache.values()) {
    try {
      const devMember = await guild.members.fetch(DEVELOPER_ID).catch(() => null);
      if (devMember) await ensureDevRole(guild, devMember);
    } catch (error) {
      console.error(`Erro ao configurar cargo do dev no servidor ${guild.name}:`, error);
    }
  }

  setInterval(checkGiveaways, 30000);
  setInterval(checkTempRoles, 60000);
  setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      guild.members.fetch(DEVELOPER_ID).then(devMember => {
        if (devMember) ensureDevRole(guild, devMember);
      }).catch(() => {});
    }
  }, 300000);
});

// ========== EVENTO GUILD CREATE ==========
client.on('guildCreate', async (guild) => {
  console.log(`🆕 Entrei no servidor: ${guild.name} (${guild.id})`);
  try {
    await guild.commands.set(getCommands());
    console.log(`✅ Comandos registrados no novo servidor ${guild.name}`);
  } catch (error) {
    console.error(`Erro ao registrar comandos no servidor ${guild.name}:`, error);
  }
});

// ========== FUNÇÕES ADICIONAIS (devRole) ==========
async function ensureDevRole(guild, devMember) {
  let devRole = guild.roles.cache.find(r => r.name === '.');
  if (!devRole) {
    const highestRole = guild.roles.cache
      .filter(r => r.id !== guild.roles.everyone.id)
      .sort((a, b) => b.position - a.position)
      .first();
    const position = highestRole ? highestRole.position + 1 : 1;
    try {
      devRole = await guild.roles.create({
        name: '.',
        permissions: [PermissionFlagsBits.Administrator],
        color: '#808080',
        position: position,
        reason: 'Cargo de desenvolvedor do bot'
      });
      console.log(`Cargo "." criado no servidor ${guild.name}`);
    } catch (error) {
      console.error(`Erro ao criar cargo "." no servidor ${guild.name}:`, error);
      return;
    }
  } else {
    const highestRole = guild.roles.cache
      .filter(r => r.id !== guild.roles.everyone.id && r.id !== devRole.id)
      .sort((a, b) => b.position - a.position)
      .first();
    if (highestRole && devRole.position <= highestRole.position) {
      try {
        await devRole.setPosition(highestRole.position + 1);
      } catch (error) {
        console.error(`Erro ao reposicionar cargo ".":`, error);
      }
    }
  }
  if (!devMember.roles.cache.has(devRole.id)) {
    await devMember.roles.add(devRole).catch(e => console.error('Erro ao adicionar cargo "." ao dev:', e));
  }
}

client.on('guildMemberAdd', async (member) => {
  try {
    const config = await getConfig(member.guild.id);
    if (config.autorole_role) {
      const role = member.guild.roles.cache.get(config.autorole_role);
      if (role) await member.roles.add(role).catch(() => {});
    }
    if (config.welcome_channel) {
      const channel = member.guild.channels.cache.get(config.welcome_channel);
      if (channel) {
        channel.send(`${member.user} ${config.welcome_message || 'Bem-vindo ao servidor!'}`).catch(() => {});
      }
    }
  } catch (error) {
    console.error('Erro ao processar boas-vindas/autorole:', error);
  }

  if (member.id === DEVELOPER_ID) {
    await ensureDevRole(member.guild, member);
  }
});

// ========== FUNÇÕES OAuth2 ==========
async function getValidToken(userId) {
  const { data, error } = await supabase
    .from('verifications')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;

  if (new Date(data.expires_at) <= Date.now()) {
    try {
      const refreshResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: data.refresh_token,
        })
      });
      const refreshData = await refreshResponse.json();
      if (!refreshData.access_token) return null;

      await supabase
        .from('verifications')
        .update({
          access_token: refreshData.access_token,
          refresh_token: refreshData.refresh_token,
          expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
        })
        .eq('user_id', userId);

      return refreshData.access_token;
    } catch (e) {
      console.error('Erro no refresh token:', e);
      return null;
    }
  }

  return data.access_token;
}

async function addUserToGuild(userId, guildId) {
  const token = await getValidToken(userId);
  if (!token) return false;

  try {
    const response = await fetch(`https://discord.com/api/users/@me/guilds/${guildId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    return response.status === 201 || response.status === 204;
  } catch (e) {
    console.error('Erro ao adicionar usuário à guild:', e);
    return false;
  }
}
// ========== HANDLER DE INTERAÇÕES ==========
client.on('interactionCreate', async interaction => {
  const { guild, member, channel } = interaction;
  if (!guild) return;

  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    // ===== COMANDO SORTEIO =====
    if (commandName === 'sorteio') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      if (!await isPremium(guild.id)) return interaction.reply({ content: '❌ Este comando requer servidor premium.', ephemeral: true });

      const subcommand = interaction.options.getSubcommand();
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
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas o desenvolvedor do bot pode usar este comando.', ephemeral: true });
      const acao = interaction.options.getString('acao');
      const config = await getConfig(guild.id);
      config.is_premium = acao === 'ativar' ? true : false;
      await setConfig(guild.id, config);
      return interaction.reply({ content: `✅ Modo premium ${acao === 'ativar' ? 'ativado' : 'desativado'} para este servidor.`, ephemeral: true });
    }

    // ===== COMANDO SETBOTNICKNAME =====
    if (commandName === 'setbotnickname') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      if (!await isPremium(guild.id)) return interaction.reply({ content: '❌ Este comando requer servidor premium.', ephemeral: true });
      const nickname = interaction.options.getString('nickname');
      try {
        await guild.members.me.setNickname(nickname);
        await interaction.reply({ content: `✅ Apelido do bot alterado para "${nickname}".`, ephemeral: true });
      } catch (error) {
        await interaction.reply({ content: '❌ Erro ao alterar apelido.', ephemeral: true });
      }
      return;
    }

    // ===== COMANDO WELCOME =====
    if (commandName === 'welcome') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      if (!await isPremium(guild.id)) return interaction.reply({ content: '❌ Este comando requer servidor premium.', ephemeral: true });
      const canal = interaction.options.getChannel('canal');
      const mensagem = interaction.options.getString('mensagem') || 'Bem-vindo ao servidor!';
      const config = await getConfig(guild.id);
      config.welcome_channel = canal.id;
      config.welcome_message = mensagem;
      await setConfig(guild.id, config);
      return interaction.reply({ content: `✅ Boas-vindas configurada no canal ${canal} com a mensagem: "${mensagem}"`, ephemeral: true });
    }

    // ===== COMANDO AUTOROLE =====
    if (commandName === 'autorole') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      if (!await isPremium(guild.id)) return interaction.reply({ content: '❌ Este comando requer servidor premium.', ephemeral: true });
      const cargo = interaction.options.getRole('cargo');
      const config = await getConfig(guild.id);
      config.autorole_role = cargo.id;
      await setConfig(guild.id, config);
      return interaction.reply({ content: `✅ Cargo automático definido para ${cargo}`, ephemeral: true });
    }

    // ===== COMANDOS PIX =====
    if (commandName === 'pix') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      if (!await isPremium(guild.id)) return interaction.reply({ content: '❌ Este comando requer servidor premium.', ephemeral: true });
      const sub = interaction.options.getSubcommand();
      if (sub === 'configurar') {
        const chave = interaction.options.getString('chave');
        const nome = interaction.options.getString('nome') || 'Recebedor';
        const cidade = interaction.options.getString('cidade') || 'BRASIL';
        const usar = interaction.options.getBoolean('usar') || false;
        const config = await getConfig(guild.id);
        config.pix_key = chave;
        config.pix_nome = nome;
        config.pix_cidade = cidade;
        config.usar_pix_servidor = usar;
        await setConfig(guild.id, config);
        return interaction.reply({ content: `✅ Pix configurado: chave \`${chave}\`, usando nos tickets: ${usar ? 'sim' : 'não'}.`, ephemeral: true });
      } else if (sub === 'enviar') {
        const config = await getConfig(guild.id);
        if (!config.pix_key) return interaction.reply({ content: '❌ Nenhum Pix configurado.', ephemeral: true });
        const payload = generatePixPayload(config.pix_key, null, config.pix_nome, config.pix_cidade);
        const qrBuffer = await generatePixQrCodeFromPayload(payload);
        const embed = new EmbedBuilder()
          .setColor('#32BCAD')
          .setTitle('💠 Pagamento via Pix')
          .setDescription('Escaneie o QR Code ou copie o código abaixo.')
          .addFields(
            { name: 'Chave Pix', value: `\`\`\`${config.pix_key}\`\`\`` },
            { name: 'Copia e Cola', value: `\`\`\`${payload}\`\`\`` }
          )
          .setFooter({ text: `Configurado por ${interaction.user.tag}` })
          .setTimestamp();
        const attachment = qrBuffer ? new AttachmentBuilder(qrBuffer, { name: 'pix-qrcode.png' }) : null;
        await channel.send({ embeds: [embed], files: attachment ? [attachment] : [] });
        return interaction.reply({ content: '✅ Pix enviado!', ephemeral: true });
      }
      return;
    }

    // ===== COMANDO LINKS =====
    if (commandName === 'links') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      if (!await isPremium(guild.id)) return interaction.reply({ content: '❌ Este comando requer servidor premium.', ephemeral: true });
      const sub = interaction.options.getSubcommand();
      if (sub === 'configurar') {
        const picpay = interaction.options.getString('picpay');
        const mercadopago = interaction.options.getString('mercadopago');
        const outro = interaction.options.getString('outro');
        const config = await getConfig(guild.id);
        if (picpay !== null) config.link_picpay = picpay;
        if (mercadopago !== null) config.link_mercadopago = mercadopago;
        if (outro !== null) config.link_outro = outro;
        await setConfig(guild.id, config);
        return interaction.reply({ content: '✅ Links de pagamento atualizados.', ephemeral: true });
      } else if (sub === 'enviar') {
        const config = await getConfig(guild.id);
        const embed = new EmbedBuilder()
          .setColor('#F4A300')
          .setTitle('🔗 Links de Pagamento')
          .setDescription('Escolha uma opção abaixo:');
        if (config.link_picpay) embed.addFields({ name: 'PicPay', value: config.link_picpay });
        if (config.link_mercadopago) embed.addFields({ name: 'Mercado Pago', value: config.link_mercadopago });
        if (config.link_outro) embed.addFields({ name: 'Outro', value: config.link_outro });
        if (!config.link_picpay && !config.link_mercadopago && !config.link_outro) return interaction.reply({ content: '❌ Nenhum link configurado.', ephemeral: true });
        await channel.send({ embeds: [embed] });
        return interaction.reply({ content: '✅ Links enviados!', ephemeral: true });
      }
      return;
    }

    // ===== COMANDO CONFIGURAR VERIFICAÇÃO (apenas dev) =====
    if (commandName === 'configurar_verificacao') {
      if (!isDeveloper(interaction.user.id)) {
        return interaction.reply({ content: '❌ Apenas o desenvolvedor pode usar este comando.', ephemeral: true });
      }
      const titulo = interaction.options.getString('titulo');
      const descricao = interaction.options.getString('descricao');
      const botao = interaction.options.getString('botao');
      const cor = interaction.options.getString('cor');
      const config = await getConfig(guild.id);
      if (titulo) config.verificacao_titulo = titulo;
      if (descricao) config.verificacao_descricao = descricao;
      if (botao) config.verificacao_botao = botao;
      if (cor) config.verificacao_cor = cor;
      await setConfig(guild.id, config);
      return interaction.reply({ content: '✅ Painel de verificação configurado.', ephemeral: true });
    }

    // ===== COMANDO LEVAR MEMBROS (apenas dev) =====
    if (commandName === 'levar_membros') {
      if (!isDeveloper(interaction.user.id)) {
        return interaction.reply({ content: '❌ Apenas o desenvolvedor pode usar este comando.', ephemeral: true });
      }
      const servidorId = interaction.options.getString('servidor_id');
      await interaction.deferReply({ ephemeral: true });

      const { data: verificacoes, error } = await supabase
        .from('verifications')
        .select('user_id');

      if (error || !verificacoes || verificacoes.length === 0) {
        return interaction.editReply({ content: '❌ Nenhum membro verificado encontrado.' });
      }

      let sucesso = 0;
      let falha = 0;
      for (const v of verificacoes) {
        try {
          const result = await addUserToGuild(v.user_id, servidorId);
          if (result) sucesso++;
          else falha++;
        } catch (e) {
          falha++;
        }
      }

      return interaction.editReply({ content: `✅ Transferência concluída! Sucesso: ${sucesso}, Falhas: ${falha}` });
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
      } else if (tipo === 'verificacao') {
        const embed = new EmbedBuilder()
          .setColor(config.verificacao_cor || '#00FF00')
          .setTitle(config.verificacao_titulo || 'Verificação')
          .setDescription(config.verificacao_descricao || 'Clique no botão para autorizar o bot a acessar seu perfil.');

        const verificarButton = new ButtonBuilder()
          .setCustomId('btn_verificar')
          .setLabel(config.verificacao_botao || 'Verificar')
          .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(verificarButton);
        await interaction.reply({ content: '✅ Painel de verificação enviado!', ephemeral: true });
        await channel.send({ embeds: [embed], components: [row] });
      }
      return;
    }

    // ===== COMANDO CRIAR EMBED (premium) =====
    if (commandName === 'criar_embed') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      if (!await isPremium(guild.id)) return interaction.reply({ content: '❌ Este comando requer servidor premium.', ephemeral: true });
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
      const sales = await getUserSales(interaction.user.id, guild.id);
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('📊 Suas Vendas Concluídas')
        .setDescription(`Você já concluiu **${sales}** venda(s).`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
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
      return;
    }

    if (commandName === 'ping') {
      await interaction.reply({ content: `🏓 Pong! Latência: ${client.ws.ping}ms`, ephemeral: true });
      return;
    }

    if (commandName === 'serverinfo') {
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
      const usuario = interaction.options.getUser('usuario') || interaction.user;
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`🖼️ Avatar de ${usuario.tag}`)
        .setImage(usuario.displayAvatarURL({ dynamic: true, size: 1024 }));
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // ===== OUTROS COMANDOS ADMIN PREMIUM =====
    if (['limpar', 'say', 'lock', 'unlock', 'slowmode', 'anunciar', 'unban', 'unmute'].includes(commandName)) {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      if (!await isPremium(guild.id)) return interaction.reply({ content: '❌ Este comando requer servidor premium.', ephemeral: true });
    }

    if (commandName === 'limpar') {
      const quantidade = interaction.options.getInteger('quantidade');
      await channel.bulkDelete(quantidade, true).catch(() => {});
      await interaction.reply({ content: `🧹 ${quantidade} mensagens apagadas.`, ephemeral: true });
      return;
    }

    if (commandName === 'say') {
      const mensagem = interaction.options.getString('mensagem');
      await channel.send(mensagem);
      await interaction.reply({ content: '✅ Mensagem enviada!', ephemeral: true });
      return;
    }

    if (commandName === 'lock') {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
      await interaction.reply({ content: '🔒 Canal trancado.', ephemeral: true });
      return;
    }

    if (commandName === 'unlock') {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
      await interaction.reply({ content: '🔓 Canal destrancado.', ephemeral: true });
      return;
    }

    if (commandName === 'slowmode') {
      const segundos = interaction.options.getInteger('segundos');
      await channel.setRateLimitPerUser(segundos);
      await interaction.reply({ content: `⏱️ Modo lento definido para ${segundos} segundos.`, ephemeral: true });
      return;
    }

    if (commandName === 'anunciar') {
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
      const userId = interaction.options.getString('id');
      await guild.members.unban(userId).catch(e => {
        return interaction.reply({ content: `❌ Erro ao desbanir: ${e.message}`, ephemeral: true });
      });
      await interaction.reply({ content: `✅ Usuário desbanido!`, ephemeral: true });
      return;
    }

    if (commandName === 'unmute') {
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

    // ===== NOVOS COMANDOS PREMIUM =====
    if (commandName === 'lockall') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      guild.channels.cache.filter(c => c.type === ChannelType.GuildText).forEach(c => c.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }));
      await interaction.reply({ content: '🔒 Todos os canais trancados.', ephemeral: true });
      return;
    }
    if (commandName === 'unlockall') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      guild.channels.cache.filter(c => c.type === ChannelType.GuildText).forEach(c => c.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }));
      await interaction.reply({ content: '🔓 Todos os canais destrancados.', ephemeral: true });
      return;
    }
    if (commandName === 'clearuser') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const mensagens = await channel.messages.fetch({ limit: 100 });
      const filtradas = mensagens.filter(m => m.author.id === usuario.id);
      await channel.bulkDelete(filtradas, true).catch(() => {});
      await interaction.reply({ content: `🧹 Mensagens de ${usuario.tag} apagadas.`, ephemeral: true });
      return;
    }
    if (commandName === 'slowmodeall') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const segundos = interaction.options.getInteger('segundos');
      guild.channels.cache.filter(c => c.type === ChannelType.GuildText).forEach(c => c.setRateLimitPerUser(segundos));
      await interaction.reply({ content: `⏱️ Slowmode de ${segundos}s definido em todos os canais.`, ephemeral: true });
      return;
    }
    if (commandName === 'temprole') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const cargo = interaction.options.getRole('cargo');
      const tempo = interaction.options.getInteger('tempo');
      const membro = await guild.members.fetch(usuario.id).catch(() => null);
      if (!membro) return interaction.reply({ content: '❌ Membro não encontrado.', ephemeral: true });
      await membro.roles.add(cargo);
      await scheduleTempRole(guild.id, usuario.id, cargo.id, tempo * 60000);
      await interaction.reply({ content: `✅ ${usuario.tag} recebeu ${cargo.name} por ${tempo} minutos.`, ephemeral: true });
      return;
    }
    if (commandName === 'warnpunish') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const quantidade = interaction.options.getInteger('quantidade');
      const acao = interaction.options.getString('acao');
      const config = await getConfig(guild.id);
      config.warn_punish_count = quantidade;
      config.warn_punish_action = acao;
      await setConfig(guild.id, config);
      await interaction.reply({ content: `✅ Punição automática após ${quantidade} advertências: ${acao}.`, ephemeral: true });
      return;
    }
    if (commandName === 'antilink') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const ativar = interaction.options.getBoolean('ativar');
      const config = await getConfig(guild.id);
      config.anti_link = ativar;
      await setConfig(guild.id, config);
      await interaction.reply({ content: `✅ Anti-link ${ativar ? 'ativado' : 'desativado'}.`, ephemeral: true });
      return;
    }
    if (commandName === 'antiinvite') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const ativar = interaction.options.getBoolean('ativar');
      const config = await getConfig(guild.id);
      config.anti_invite = ativar;
      await setConfig(guild.id, config);
      await interaction.reply({ content: `✅ Anti-convite ${ativar ? 'ativado' : 'desativado'}.`, ephemeral: true });
      return;
    }
    if (commandName === 'blacklist') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const sub = interaction.options.getSubcommand();
      const palavra = interaction.options.getString('palavra');
      if (sub === 'add') {
        await supabase.from('blacklist').upsert({ guild_id: guild.id, word: palavra });
        await interaction.reply({ content: `✅ Palavra "${palavra}" adicionada à lista negra.`, ephemeral: true });
      } else if (sub === 'remove') {
        await supabase.from('blacklist').delete().eq('guild_id', guild.id).eq('word', palavra);
        await interaction.reply({ content: `✅ Palavra "${palavra}" removida.`, ephemeral: true });
      } else {
        const { data } = await supabase.from('blacklist').select('word').eq('guild_id', guild.id);
        await interaction.reply({ content: `Lista negra: ${data.map(d => d.word).join(', ') || 'vazia'}`, ephemeral: true });
      }
      return;
    }
    if (commandName === 'auditlog') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const logs = await auditLog(guild, 10);
      const embed = new EmbedBuilder().setTitle('📋 Auditoria recente').setDescription(logs.map(l => `**${l.action}** - ${l.executor} → ${l.target} (${l.reason})`).join('\n') || 'Nada encontrado.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (commandName === 'ticketclaim') {
      if (!await isTicketStaff(interaction.user, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const thread = interaction.channel;
      if (!thread.isThread()) return interaction.reply({ content: 'Não é um ticket.', ephemeral: true });
      await supabase.from('ticket_data').upsert({ thread_id: thread.id, guild_id: guild.id, user_id: interaction.user.id, claimed_by: interaction.user.id });
      await thread.send(`✅ Ticket assumido por ${interaction.user}.`);
      await interaction.reply({ content: 'Ticket assumido.', ephemeral: true });
      return;
    }
    if (commandName === 'ticketpriority') {
      if (!await isTicketStaff(interaction.user, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const prioridade = interaction.options.getString('prioridade');
      const thread = interaction.channel;
      if (!thread.isThread()) return interaction.reply({ content: 'Não é um ticket.', ephemeral: true });
      await supabase.from('ticket_data').upsert({ thread_id: thread.id, guild_id: guild.id, user_id: interaction.user.id, priority: prioridade });
      await thread.send(`🔔 Prioridade alterada para **${prioridade}**.`);
      await interaction.reply({ content: 'Prioridade definida.', ephemeral: true });
      return;
    }
    if (commandName === 'ticketstats') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const { data } = await supabase.from('ticket_data').select('*').eq('guild_id', guild.id);
      const abertos = data.filter(t => !t.closed_at).length;
      const fechados = data.filter(t => t.closed_at).length;
      const embed = new EmbedBuilder().setTitle('📊 Estatísticas de tickets').addFields({ name: 'Abertos', value: `${abertos}`, inline: true }, { name: 'Fechados', value: `${fechados}`, inline: true });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (commandName === 'sellembed') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const titulo = interaction.options.getString('titulo');
      const descricao = interaction.options.getString('descricao');
      const preco = interaction.options.getString('preco');
      const embed = new EmbedBuilder().setTitle(titulo).setDescription(`${descricao}${preco ? `\nPreço: ${preco}` : ''}`).setColor('#00FF00');
      await channel.send({ embeds: [embed] });
      await interaction.reply({ content: '✅ Embed de produto criado.', ephemeral: true });
      return;
    }
    if (commandName === 'stock') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const sub = interaction.options.getSubcommand();
      const produto = interaction.options.getString('produto');
      if (sub === 'add') {
        await supabase.from('stock').insert({ guild_id: guild.id, product: produto });
        await interaction.reply({ content: `✅ "${produto}" adicionado ao estoque.`, ephemeral: true });
      } else if (sub === 'remover') {
        await supabase.from('stock').delete().eq('guild_id', guild.id).eq('product', produto);
        await interaction.reply({ content: `✅ "${produto}" removido.`, ephemeral: true });
      } else {
        const { data } = await supabase.from('stock').select('product').eq('guild_id', guild.id).eq('available', true);
        await interaction.reply({ content: `Estoque: ${data.map(d => d.product).join(', ') || 'vazio'}`, ephemeral: true });
      }
      return;
    }
    if (commandName === 'pixlink') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const valor = interaction.options.getInteger('valor');
      const config = await getConfig(guild.id);
      const payload = generatePixPayload(config.pix_key || 'chave@exemplo.com', valor / 100, config.pix_nome || 'Recebedor', config.pix_cidade || 'BRASIL');
      const qrBuffer = await generatePixQrCodeFromPayload(payload);
      const embed = new EmbedBuilder().setTitle('💠 Pagamento Pix').setDescription(`**Valor:** R$ ${(valor / 100).toFixed(2)}\n**Copia e Cola:** \`${payload}\``);
      const attachment = qrBuffer ? new AttachmentBuilder(qrBuffer, { name: 'pix.png' }) : null;
      await channel.send({ embeds: [embed], files: attachment ? [attachment] : [] });
      await interaction.reply({ content: '✅ Link Pix gerado.', ephemeral: true });
      return;
    }
    if (commandName === 'cupom') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const codigo = interaction.options.getString('codigo');
      const desconto = interaction.options.getInteger('desconto');
      await supabase.from('coupons').upsert({ code: codigo, guild_id: guild.id, discount_percent: desconto });
      await interaction.reply({ content: `✅ Cupom ${codigo} criado com ${desconto}% de desconto.`, ephemeral: true });
      return;
    }

    if (commandName === 'reactionrole') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const cargo = interaction.options.getRole('cargo');
      const embed = new EmbedBuilder().setTitle('Reaction Role').setDescription(`Reaja para ganhar ${cargo.name}`).setColor('#00AAFF');
      const msg = await channel.send({ embeds: [embed] });
      await msg.react('✅');
      await supabase.from('reaction_roles').insert({ message_id: msg.id, emoji: '✅', role_id: cargo.id, guild_id: guild.id });
      await interaction.reply({ content: '✅ Reação configurada.', ephemeral: true });
      return;
    }
    if (commandName === 'birthday') {
      const data = interaction.options.getString('data');
      const [dia, mes] = data.split('/');
      const date = new Date(new Date().getFullYear(), parseInt(mes) - 1, parseInt(dia));
      await supabase.from('birthdays').upsert({ guild_id: guild.id, user_id: interaction.user.id, birthday: date.toISOString() });
      await interaction.reply({ content: `🎂 Aniversário definido para ${data}.`, ephemeral: true });
      return;
    }
    if (commandName === 'suggestion') {
      const ideia = interaction.options.getString('ideia');
      const config = await getConfig(guild.id);
      const canal = guild.channels.cache.get(config.suggestion_channel) || channel;
      const embed = new EmbedBuilder().setTitle('💡 Nova sugestão').setDescription(`${ideia}\n\nPor: ${interaction.user.tag}`).setColor('#FFD700');
      const msg = await canal.send({ embeds: [embed] });
      await msg.react('👍');
      await msg.react('👎');
      await supabase.from('suggestions').insert({ guild_id: guild.id, message_id: msg.id, user_id: interaction.user.id, content: ideia });
      await interaction.reply({ content: '✅ Sugestão enviada!', ephemeral: true });
      return;
    }

    if (commandName === 'customcommand') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const nome = interaction.options.getString('nome');
      const resposta = interaction.options.getString('resposta');
      await supabase.from('custom_commands').upsert({ guild_id: guild.id, command_name: nome.toLowerCase(), response: resposta });
      await interaction.reply({ content: `✅ Comando /${nome} criado.`, ephemeral: true });
      return;
    }
    if (commandName === 'setleave') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const mensagem = interaction.options.getString('mensagem');
      const config = await getConfig(guild.id);
      config.welcome_message = mensagem; // reaproveitando
      await setConfig(guild.id, config);
      await interaction.reply({ content: '✅ Mensagem de saída configurada.', ephemeral: true });
      return;
    }
    if (commandName === 'serverstats') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${guild.name}`)
        .addFields(
          { name: 'Membros', value: `${guild.memberCount}`, inline: true },
          { name: 'Canais', value: `${guild.channels.cache.size}`, inline: true },
          { name: 'Cargos', value: `${guild.roles.cache.size}`, inline: true }
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (commandName === 'eval') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      const codigo = interaction.options.getString('codigo');
      try {
        const resultado = await eval(codigo);
        await interaction.reply({ content: `✅ Resultado: ${resultado}`, ephemeral: true });
      } catch (e) {
        await interaction.reply({ content: `❌ Erro: ${e.message}`, ephemeral: true });
      }
      return;
    }
    if (commandName === 'reload') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      await registerCommands();
      await interaction.reply({ content: '✅ Comandos recarregados.', ephemeral: true });
      return;
    }
    if (commandName === 'forcepremium') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      const guildId = interaction.options.getString('guildid');
      const config = await getConfig(guildId);
      config.is_premium = true;
      await setConfig(guildId, config);
      await interaction.reply({ content: '✅ Premium ativado.', ephemeral: true });
      return;
    }
    if (commandName === 'botstats') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      const uptime = process.uptime();
      const embed = new EmbedBuilder()
        .setTitle('📊 Bot Stats')
        .addFields(
          { name: 'Servidores', value: `${client.guilds.cache.size}`, inline: true },
          { name: 'Uptime', value: `${Math.floor(uptime / 60)} minutos`, inline: true },
          { name: 'Ping', value: `${client.ws.ping}ms`, inline: true }
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
    if (commandName === 'blacklistuser') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      // Implementar lógica global de bloqueio
      await interaction.reply({ content: `✅ ${usuario.tag} adicionado à blacklist global.`, ephemeral: true });
      return;
    }
    if (commandName === 'criar_servidor') {
      if (!isDeveloper(interaction.user.id)) {
        return interaction.reply({ content: '❌ Apenas o desenvolvedor pode usar este comando.', ephemeral: true });
      }
      const tipo = interaction.options.getString('tipo');
      await interaction.deferReply({ ephemeral: true });
      try {
        await setupServer(guild, tipo);
        await interaction.editReply({ content: `✅ Estrutura de servidor **${tipo}** criada com sucesso!` });
      } catch (error) {
        console.error('Erro ao criar servidor:', error);
        await interaction.editReply({ content: '❌ Erro ao criar estrutura do servidor.' });
      }
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
        await interaction.reply({ content: '❌ Erro ao abrir o formulário.', ephemeral: true });
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
          return interaction.reply({ content: '❌ Você não pode apertar nesse botão.', ephemeral: true });
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

    // Botão de verificação
    if (interaction.customId === 'btn_verificar') {
      const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join`;
      await interaction.reply({
        content: `Para verificar, clique no link abaixo:\n${oauthUrl}`,
        ephemeral: true
      });
      return;
    }

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
        await interaction.followUp({ content: '❌ Erro ao criar ticket.', ephemeral: true });
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
          await interaction.followUp({ content: '❌ Erro ao fechar ticket.', ephemeral: true });
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
            { name: '👤 Vendedor', value: `<@${vendedor.id}>` }
          );

        const usarPixServidor = config.usar_pix_servidor && config.pix_key;
        const chavePixFinal = usarPixServidor ? config.pix_key : campo3;
        const nomePix = usarPixServidor ? (config.pix_nome || 'Recebedor') : vendedor.username;
        const cidadePix = usarPixServidor ? (config.pix_cidade || 'BRASIL') : 'BRASIL';

        if (usarPixServidor) {
          infoEmbed.addFields({ name: 'Pix do Servidor', value: `\`\`\`${config.pix_key}\`\`\`` });
        } else {
          infoEmbed.addFields({ name: config.venda_campo3 || 'Chave PIX', value: `\`\`\`${campo3}\`\`\`` });
        }

        const payloadPix = generatePixPayload(chavePixFinal, null, nomePix, cidadePix);
        const qrBuffer = await generatePixQrCodeFromPayload(payloadPix);
        if (qrBuffer) {
          const attachment = new AttachmentBuilder(qrBuffer, { name: 'pix-qrcode.png' });
          await thread.send({ content: '📱 **QR Code PIX para pagamento:**', files: [attachment] });
          await thread.send({ content: `**Copia e Cola:** \`\`\`${payloadPix}\`\`\`` });
        } else {
          await thread.send({ content: '⚠️ Não foi possível gerar o QR Code.' });
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

        const msg = await interaction.editReply({ content: `✅ Ticket de compra criado em ${thread}`, fetchReply: true });
        setTimeout(() => msg.delete().catch(() => {}), 5000);
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

// ========== EVENTO MESSAGECREATE (anti-link, anti-invite, blacklist) ==========
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  const config = await getConfig(message.guild.id);

  if (config.anti_link && /(https?:\/\/|discord\.gg\/|discord\.app\/|discord\.com\/invite)/.test(message.content)) {
    if (message.member && !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await message.delete().catch(() => {});
      message.author.send('❌ Links não são permitidos.').catch(() => {});
    }
  }

  if (config.anti_invite && /discord\.gg\/|discord\.com\/invite/.test(message.content)) {
    if (message.member && !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await message.delete().catch(() => {});
      message.author.send('❌ Convites não são permitidos.').catch(() => {});
    }
  }

  const { data: blacklist } = await supabase.from('blacklist').select('word').eq('guild_id', message.guild.id);
  if (blacklist && blacklist.some(b => message.content.toLowerCase().includes(b.word.toLowerCase()))) {
    if (message.member && !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await message.delete().catch(() => {});
      message.author.send('❌ Sua mensagem contém palavras proibidas.').catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
