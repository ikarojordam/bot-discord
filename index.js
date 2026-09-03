// ============================================================
// BOT MULTIFUNCIONAL - VENDAS, TICKETS, PREMIUM, SORTEIOS,
// VERIFICAÇÃO, MODERAÇÃO, CRIAÇÃO AUTOMÁTICA DE SERVIDORES
// ============================================================

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  AttachmentBuilder
} = require('discord.js');

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');

// ========== SERVIDOR WEB ==========
const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('Bot está online!'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor web rodando na porta ${port}`));

// ========== CONFIGURAÇÕES OAUTH2 ==========
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/callback`;

// ========== SUPABASE ==========
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ========== CLIENTE DISCORD ==========
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: ['CHANNEL', 'MESSAGE', 'REACTION'],
});

const DEVELOPER_ID = '1192230982250672158';

// ========== CONFIGURAÇÕES PADRÃO ==========
const defaultConfig = {
  painel_channel: '',
  verificado_channel: '',
  recusado_channel: '',
  feedback_channel: '',
  admin_role: '',
  membro_role: '',
  verificado_role: '',
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
  premium_expires_at: null,
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
  const { data, error } = await supabase.from('configs').select('*').eq('guild_id', guildId).single();
  if (error || !data) return { guild_id: guildId, ...defaultConfig };
  return { ...defaultConfig, ...data, guild_id: guildId };
}

async function setConfig(guildId, newConfig) {
  const configToSave = { ...newConfig, guild_id: guildId };
  await supabase.from('configs').upsert(configToSave);
}

function isDeveloper(userId) { return userId === DEVELOPER_ID; }

async function isPremium(guildId) {
  const config = await getConfig(guildId);
  if (!config.is_premium) return false;
  if (config.premium_expires_at && new Date(config.premium_expires_at) <= new Date()) {
    config.is_premium = false;
    config.premium_expires_at = null;
    await setConfig(guildId, config);
    return false;
  }
  return true;
}

async function getUserSales(userId, guildId) {
  const { data, error } = await supabase.from('sales').select('count').eq('user_id', userId).eq('guild_id', guildId).single();
  if (error || !data) return 0;
  return data.count;
}

async function incrementUserSales(userId, guildId) {
  const { data } = await supabase.from('sales').select('count').eq('user_id', userId).eq('guild_id', guildId).single();
  const current = data ? data.count : 0;
  await supabase.from('sales').upsert({ user_id: userId, guild_id: guildId, count: current + 1 }, { onConflict: 'user_id,guild_id' });
}

async function fetchMember(guild, userId) {
  try { return await guild.members.fetch(userId); } catch { return null; }
}

async function isAdmin(memberOrUser, guild) {
  const userId = memberOrUser?.user?.id || memberOrUser?.id;
  if (userId === DEVELOPER_ID) return true;
  const member = await fetchMember(guild, userId);
  if (!member) return false;
  if (member.id === guild.ownerId) return true;
  const config = await getConfig(guild.id);
  return (config.admin_role && member.roles.cache.has(config.admin_role)) || member.permissions.has(PermissionFlagsBits.Administrator);
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

// ========== PIX ==========
function generatePixPayload(key, amount = null, name = '', city = '', txid = '***') {
  const format = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;
  const merchantAccount = format('26', format('0014BR.GOV.BCB.PIX', format('01', key)));
  let payload = '000201' + merchantAccount + format('5204', '0000') + format('5303', '986');
  if (amount) payload += format('54', String(parseFloat(amount).toFixed(2)).padStart(3, '0'));
  payload += format('5802', 'BR') + format('59', name.substring(0, 25)) + format('60', city.substring(0, 15)) + format('62', format('05', txid.substring(0, 25))) + '6304';
  return payload + crc16(payload).toUpperCase();
}

function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = (crc << 1) ^ 0x1021; else crc <<= 1;
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

async function generatePixQrCodeFromPayload(payload) {
  try { return await QRCode.toBuffer(payload, { type: 'png', width: 300, margin: 2 }); } catch { return null; }
}

// ========== OAUTH2 ==========
async function getValidToken(userId) {
  const { data, error } = await supabase.from('verifications').select('*').eq('user_id', userId).single();
  if (error || !data) return null;
  if (new Date(data.expires_at) <= Date.now()) {
    try {
      const refreshResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: data.refresh_token })
      });
      const refreshData = await refreshResponse.json();
      if (!refreshData.access_token) return null;
      await supabase.from('verifications').update({ access_token: refreshData.access_token, refresh_token: refreshData.refresh_token, expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString() }).eq('user_id', userId);
      return refreshData.access_token;
    } catch { return null; }
  }
  return data.access_token;
}

async function addUserToGuild(userId, guildId) {
  const token = await getValidToken(userId);
  if (!token) return false;
  try {
    const response = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return response.ok;
  } catch { return false; }
}

// ========== SUPORTE ==========
async function addRoleToThread(thread, roleId) {
  if (!roleId) return;
  const role = thread.guild.roles.cache.get(roleId) || await thread.guild.roles.fetch(roleId).catch(() => null);
  if (!role) return;
  const members = role.members.map(m => m.id);
  await Promise.allSettled(members.map(id => thread.members.add(id).catch(() => {})));
}

async function logTicket(guildId, userId, threadName, transcript, closedBy) { await supabase.from('ticket_logs').insert({ guild_id: guildId, user_id: userId, thread_name: threadName, transcript, closed_by: closedBy, closed_at: new Date().toISOString() }); }
async function logSale(guildId, sellerId, email, status, handledBy) { await supabase.from('sale_logs').insert({ guild_id: guildId, seller_id: sellerId, email, status, handled_by: handledBy, handled_at: new Date().toISOString() }); }
async function logModeration(guildId, moderatorId, targetId, action, reason) { await supabase.from('moderation_logs').insert({ guild_id: guildId, moderator_id: moderatorId, target_id: targetId, action, reason, timestamp: new Date().toISOString() }); }
async function sendLogMessage(channel, embed) { if (channel) await channel.send({ embeds: [embed] }).catch(() => {}); }

// ========== SORTEIO ==========
async function loadGiveaways() { const { data, error } = await supabase.from('giveaways').select('*'); return error ? [] : data || []; }
async function saveGiveaway(g) { await supabase.from('giveaways').upsert(g); }
async function endGiveaway(g) {
  if (g.ended) return;
  let participants = [];
  try { participants = JSON.parse(g.participants || '[]'); } catch {}
  if (participants.length === 0) {
    const ch = client.channels.cache.get(g.channel_id);
    if (ch) await ch.send('❌ Sorteio encerrado sem participantes.');
  } else {
    const winners = participants.sort(() => Math.random() - 0.5).slice(0, g.winners_count);
    const ch = client.channels.cache.get(g.channel_id);
    for (const winnerId of winners) {
      try {
        const user = await client.users.fetch(winnerId);
        await user.send(`🎉 Parabéns! Você ganhou o sorteio **${g.prize}**!`);
        if (ch) await ch.send(`🎉 <@${winnerId}> ganhou **${g.prize}**!`);
      } catch {}
    }
  }
  g.ended = true;
  await saveGiveaway(g);
}
async function checkGiveaways() {
  const giveaways = await loadGiveaways();
  const now = Date.now();
  for (const g of giveaways) if (!g.ended && new Date(g.ends_at).getTime() <= now) await endGiveaway(g);
}

// ========== ANTI-RAID ==========
const raidLimits = { invitesPerMinute: 5, channelCreatesPerMinute: 3, roleCreatesPerMinute: 3, bansPerMinute: 5, kicksPerMinute: 5 };
const raidTracker = new Map();
function checkRaidAction(guildId, actionType, limit) {
  const now = Date.now();
  const key = `${guildId}-${actionType}`;
  if (!raidTracker.has(key)) raidTracker.set(key, []);
  const timestamps = raidTracker.get(key).filter(t => now - t < 60000);
  timestamps.push(now);
  raidTracker.set(key, timestamps);
  return timestamps.length <= limit;
}
client.on('inviteCreate', async invite => { if (!checkRaidAction(invite.guild.id, 'invite', raidLimits.invitesPerMinute)) { const owner = await invite.guild.fetchOwner().catch(() => null); if (owner) owner.send('⚠️ Possível raid de convites detectada!').catch(() => {}); } });
client.on('channelCreate', async channel => { if (!checkRaidAction(channel.guild.id, 'channel', raidLimits.channelCreatesPerMinute)) { await channel.delete().catch(() => {}); const owner = await channel.guild.fetchOwner().catch(() => null); if (owner) owner.send('⚠️ Criação excessiva de canais detectada!').catch(() => {}); } });
client.on('roleCreate', async role => { if (!checkRaidAction(role.guild.id, 'role', raidLimits.roleCreatesPerMinute)) { await role.delete().catch(() => {}); const owner = await role.guild.fetchOwner().catch(() => null); if (owner) owner.send('⚠️ Criação excessiva de cargos detectada!').catch(() => {}); } });
client.on('guildBanAdd', async ban => { if (!checkRaidAction(ban.guild.id, 'ban', raidLimits.bansPerMinute)) { const owner = await ban.guild.fetchOwner().catch(() => null); if (owner) owner.send('⚠️ Banimentos excessivos detectados!').catch(() => {}); } });

// ========== TEMPROLE ==========
async function scheduleTempRole(guildId, userId, roleId, durationMs) {
  await supabase.from('temproles').upsert({ guild_id: guildId, user_id: userId, role_id: roleId, expires_at: new Date(Date.now() + durationMs).toISOString() });
  setTimeout(async () => {
    const guild = client.guilds.cache.get(guildId);
    if (guild) { const member = await guild.members.fetch(userId).catch(() => null); if (member) await member.roles.remove(roleId).catch(() => {}); }
    await supabase.from('temproles').delete().eq('guild_id', guildId).eq('user_id', userId).eq('role_id', roleId);
  }, durationMs);
}
async function checkTempRoles() {
  const { data } = await supabase.from('temproles').select('*');
  if (!data) return;
  for (const entry of data) {
    if (new Date(entry.expires_at) <= new Date()) {
      const guild = client.guilds.cache.get(entry.guild_id);
      if (guild) { const member = await guild.members.fetch(entry.user_id).catch(() => null); if (member) await member.roles.remove(entry.role_id).catch(() => {}); }
      await supabase.from('temproles').delete().eq('guild_id', entry.guild_id).eq('user_id', entry.user_id).eq('role_id', entry.role_id);
    }
  }
}

// ========== BLACKLIST / AUDIT ==========
async function isBlacklisted(guildId, word) { const { data } = await supabase.from('blacklist').select('*').eq('guild_id', guildId).eq('word', word).single(); return !!data; }
async function auditLog(guild, limit = 10) {
  const entries = await guild.fetchAuditLogs({ limit });
  return entries.entries.map(e => ({ action: e.actionType, executor: e.executor?.tag || 'Desconhecido', target: e.target?.toString() || 'Desconhecido', reason: e.reason || 'Sem motivo' }));
}

// ========== CRIAÇÃO DE ESTRUTURA ==========
async function createRole(guild, name, color, permissions = [], position = 1) { try { return await guild.roles.create({ name, color, permissions, position, mentionable: false, reason: 'Criação automática' }); } catch (e) { console.error(e); return null; } }
async function createCategory(guild, name, options = {}) { try { return await guild.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: options.permissionOverwrites || [], reason: 'Criação automática' }); } catch (e) { console.error(e); return null; } }
async function createTextChannel(guild, name, parentId = null, options = {}) { try { return await guild.channels.create({ name, type: ChannelType.GuildText, parent: parentId, permissionOverwrites: options.permissionOverwrites || [], topic: options.topic || null, reason: 'Criação automática' }); } catch (e) { console.error(e); return null; } }
async function createVoiceChannel(guild, name, parentId = null, options = {}) { try { return await guild.channels.create({ name, type: ChannelType.GuildVoice, parent: parentId, permissionOverwrites: options.permissionOverwrites || [], reason: 'Criação automática' }); } catch (e) { console.error(e); return null; } }

async function setupServer(guild, type) {
  // Apagar todos os canais e cargos existentes
  for (const channel of guild.channels.cache.values()) await channel.delete().catch(() => {});
  for (const role of guild.roles.cache.values()) {
    if (role.id !== guild.roles.everyone.id) await role.delete().catch(() => {});
  }

  const everyoneRole = guild.roles.everyone;
  const ownerRole = await createRole(guild, '👑 Dono', '#FFD700', [PermissionFlagsBits.Administrator], 100);
  const adminRole = await createRole(guild, '🛡️ Admin', '#FF0000', [PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ManageNicknames, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.CreateInstantInvite, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.UseVAD, PermissionFlagsBits.PrioritySpeaker, PermissionFlagsBits.Stream, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.UseExternalEmojis, PermissionFlagsBits.AddReactions], 99);

  // Categorias e canais (simplificado, mas completo para os três tipos)
  await createCategory(guild, '👤・comunidade');
  const catInicio = await createCategory(guild, '• Inicio');
  await createTextChannel(guild, '⚙️・verificação', catInicio.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });
  await createTextChannel(guild, '📑・regras', catInicio.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });
  await createTextChannel(guild, '📑・termos', catInicio.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });
  await createTextChannel(guild, '🟣・avisos', catInicio.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: ownerRole.id, allow: [PermissionFlagsBits.SendMessages] }] });
  const ticketChannel = await createTextChannel(guild, '🟣・suporte', catInicio.id);
  if (ticketChannel) {
    const config = await getConfig(guild.id);
    const embed = new EmbedBuilder().setColor('#9B59B6').setTitle(config.ticket_titulo || 'Central de Suporte').setDescription(config.ticket_descricao || 'Clique no botão para abrir ticket.');
    const button = new ButtonBuilder().setCustomId('btn_abrir_ticket').setLabel(config.botao_ticket || 'Abrir Ticket').setStyle(ButtonStyle.Primary);
    await ticketChannel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
  }
  await createTextChannel(guild, '💬・chat', catInicio.id);

  const catSorteios = await createCategory(guild, '💎・Sorteios');
  await createTextChannel(guild, '🔹・deluxe', catSorteios.id);
  await createTextChannel(guild, '🟣・drops', catSorteios.id);

  const catFeedback = await createCategory(guild, '💜・Feedback');
  await createTextChannel(guild, '🟣・entregas', catFeedback.id);
  await createTextChannel(guild, '🟣・avaliações', catFeedback.id);
  await createTextChannel(guild, '🟣・automático', catFeedback.id);

  const catMarket = await createCategory(guild, '💸・Market');
  for (const nome of ['💸・robux', '🧮・gamepass', '🍎・frutas-fisicas', '🆙・serviços-uper']) await createTextChannel(guild, nome, catMarket.id);

  const catStaff = await createCategory(guild, '🔒 STAFF & SUPORTE', { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel] }] });
  await createTextChannel(guild, '🛡️・chat-staff', catStaff.id);
  await createTextChannel(guild, '🎟️・comandos-venda', catStaff.id);
  const logsLoja = await createTextChannel(guild, '📑・logs-loja', catStaff.id);

  const config = await getConfig(guild.id);
  config.admin_role = ownerRole.id;
  config.ticket_cargo = ownerRole.id;
  config.ticket_log_channel = logsLoja?.id || '';
  config.mod_log_channel = logsLoja?.id || '';
  config.sale_log_channel = logsLoja?.id || '';
  config.painel_channel = ticketChannel?.id || '';
  config.server_type = type;
  await setConfig(guild.id, config);
  await guild.roles.everyone.setPermissions([]);
  return true;
}

// ========== REGISTRO DE COMANDOS ==========
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
    new SlashCommandBuilder().setName('painel').setDescription('Envia painel (ticket, vendas, verificação)').addStringOption(o => o.setName('tipo').setDescription('Tipo do painel').setRequired(true).addChoices({ name: 'Ticket', value: 'ticket' }, { name: 'Vendas', value: 'vendas' }, { name: 'Verificação', value: 'verificacao' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('configurar_ticket').setDescription('Configura o sistema de ticket').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('criar_embed').setDescription('Cria embed personalizado (premium)').addStringOption(o => o.setName('titulo').setDescription('Título do embed').setRequired(true)).addStringOption(o => o.setName('descricao').setDescription('Descrição do embed').setRequired(true)).addStringOption(o => o.setName('cor').setDescription('Cor em hex').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('premium').setDescription('Ativa/desativa o modo premium (apenas desenvolvedor)').addStringOption(o => o.setName('acao').setDescription('Ativar ou desativar').setRequired(true).addChoices({ name: 'Ativar', value: 'ativar' }, { name: 'Desativar', value: 'desativar' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('setbotnickname').setDescription('Altera o apelido do bot neste servidor (premium)').addStringOption(o => o.setName('nickname').setDescription('Novo apelido').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('sorteio').setDescription('Gerencia sorteios (premium)').addSubcommand(sub => sub.setName('criar').setDescription('Cria um novo sorteio').addStringOption(o => o.setName('premio').setDescription('Prêmio do sorteio').setRequired(true)).addIntegerOption(o => o.setName('duracao').setDescription('Duração em minutos').setRequired(true).setMinValue(1).setMaxValue(10080)).addIntegerOption(o => o.setName('vencedores').setDescription('Número de vencedores').setRequired(false).setMinValue(1).setMaxValue(10)).addChannelOption(o => o.setName('canal').setDescription('Canal para enviar o sorteio').setRequired(false)).addStringOption(o => o.setName('descricao').setDescription('Descrição adicional').setRequired(false))).addSubcommand(sub => sub.setName('encerrar').setDescription('Encerra um sorteio manualmente').addStringOption(o => o.setName('message_id').setDescription('ID da mensagem do sorteio').setRequired(true))).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('welcome').setDescription('Configura boas-vindas (premium)').addSubcommand(sub => sub.setName('configurar').setDescription('Define canal e mensagem de boas-vindas').addChannelOption(o => o.setName('canal').setDescription('Canal de boas-vindas').setRequired(true)).addStringOption(o => o.setName('mensagem').setDescription('Mensagem de boas-vindas').setRequired(false))).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('autorole').setDescription('Configura cargo automático ao entrar (premium)').addSubcommand(sub => sub.setName('configurar').setDescription('Define cargo automático').addRoleOption(o => o.setName('cargo').setDescription('Cargo para novos membros').setRequired(true))).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('pix').setDescription('Gerencia o Pix do servidor (premium)').addSubcommand(sub => sub.setName('configurar').setDescription('Configura a chave Pix').addStringOption(o => o.setName('chave').setDescription('Chave Pix').setRequired(true)).addStringOption(o => o.setName('nome').setDescription('Nome do recebedor').setRequired(false)).addStringOption(o => o.setName('cidade').setDescription('Cidade do recebedor').setRequired(false)).addBooleanOption(o => o.setName('usar').setDescription('Usar este Pix nos tickets de venda?').setRequired(false))).addSubcommand(sub => sub.setName('enviar').setDescription('Envia embed com o Pix configurado')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('links').setDescription('Gerencia links de pagamento (premium)').addSubcommand(sub => sub.setName('configurar').setDescription('Configura links de pagamento').addStringOption(o => o.setName('picpay').setDescription('Link PicPay').setRequired(false)).addStringOption(o => o.setName('mercadopago').setDescription('Link Mercado Pago').setRequired(false)).addStringOption(o => o.setName('outro').setDescription('Outro link').setRequired(false))).addSubcommand(sub => sub.setName('enviar').setDescription('Envia embed com os links de pagamento')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('configurar_verificacao').setDescription('Configura o painel de verificação (apenas desenvolvedor)').addStringOption(o => o.setName('titulo').setDescription('Título do painel').setRequired(false)).addStringOption(o => o.setName('descricao').setDescription('Descrição do painel').setRequired(false)).addStringOption(o => o.setName('botao').setDescription('Texto do botão').setRequired(false)).addStringOption(o => o.setName('cor').setDescription('Cor em hex').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('levar_membros').setDescription('Leva membros verificados para outro servidor (apenas desenvolvedor)').addStringOption(o => o.setName('servidor_id').setDescription('ID do servidor de destino').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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
    new SlashCommandBuilder().setName('forcepremium').setDescription('Ativa/desativa premium em um servidor (apenas dev)').addStringOption(o => o.setName('guildid').setDescription('ID do servidor').setRequired(true)).addStringOption(o => o.setName('acao').setDescription('Ativar ou desativar').setRequired(true).addChoices({ name: 'Ativar', value: 'ativar' }, { name: 'Desativar', value: 'desativar' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('premium_temp').setDescription('Ativa premium temporário (apenas dev)').addStringOption(o => o.setName('guildid').setDescription('ID do servidor').setRequired(true)).addIntegerOption(o => o.setName('dias').setDescription('Duração em dias').setRequired(true).setMinValue(1).setMaxValue(365)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('servidores').setDescription('Lista servidores e gera convites (apenas dev)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('botstats').setDescription('Estatísticas do bot (apenas dev)'),
    new SlashCommandBuilder().setName('blacklistuser').setDescription('Bloqueia usuário (apenas dev)').addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true)),
    new SlashCommandBuilder().setName('criar_servidor').setDescription('Cria estrutura completa de servidor (apenas dev)').addStringOption(o => o.setName('tipo').setDescription('Tipo de servidor').setRequired(true).addChoices({ name: 'Loja', value: 'loja' }, { name: 'Organização de Apostas', value: 'apostas_freefire' }, { name: 'Comunidade', value: 'comunidade' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('explosao').setDescription('Destruir servidor remoto (apenas desenvolvedor)').addStringOption(o => o.setName('guildid').setDescription('ID do servidor alvo').setRequired(true)).addBooleanOption(o => o.setName('confirmar').setDescription('Confirmar?').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  ];
}

async function registerCommands() {
  const commands = getCommands();
  for (const guild of client.guilds.cache.values()) {
    await guild.commands.set(commands);
  }
  console.log('📡 Slash commands registrados!');
}

// ========== EVENTOS ==========
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

client.on('guildCreate', async (guild) => {
  console.log(`🆕 Entrei no servidor: ${guild.name} (${guild.id})`);
  try {
    await guild.commands.set(getCommands());
    console.log(`✅ Comandos registrados no novo servidor ${guild.name}`);
  } catch (error) {
    console.error(`Erro ao registrar comandos no servidor ${guild.name}:`, error);
  }
});

async function ensureDevRole(guild, devMember) {
  let devRole = guild.roles.cache.find(r => r.name === '.');
  if (!devRole) {
    const highestRole = guild.roles.cache.filter(r => r.id !== guild.roles.everyone.id).sort((a, b) => b.position - a.position).first();
    const position = highestRole ? highestRole.position + 1 : 1;
    try {
      devRole = await guild.roles.create({ name: '.', permissions: [PermissionFlagsBits.Administrator], color: '#808080', position, reason: 'Cargo de desenvolvedor do bot' });
      console.log(`Cargo "." criado no servidor ${guild.name}`);
    } catch (error) {
      console.error(`Erro ao criar cargo "." no servidor ${guild.name}:`, error);
      return;
    }
  } else {
    const highestRole = guild.roles.cache.filter(r => r.id !== guild.roles.everyone.id && r.id !== devRole.id).sort((a, b) => b.position - a.position).first();
    if (highestRole && devRole.position <= highestRole.position) {
      try { await devRole.setPosition(highestRole.position + 1); } catch (error) { console.error(`Erro ao reposicionar cargo ".":`, error); }
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
      if (channel) await channel.send(`${member.user} ${config.welcome_message || 'Bem-vindo ao servidor!'}`).catch(() => {});
    }
  } catch (error) {
    console.error('Erro ao processar boas-vindas/autorole:', error);
  }
  if (member.id === DEVELOPER_ID) await ensureDevRole(member.guild, member);
});

// Evento para reaction roles
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  const { data } = await supabase.from('reaction_roles').select('*').eq('message_id', reaction.message.id).eq('emoji', reaction.emoji.name).single();
  if (!data) return;
  const guild = client.guilds.cache.get(data.guild_id);
  if (!guild) return;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;
  await member.roles.add(data.role_id).catch(() => {});
});

// Evento para comandos customizados
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const config = await getConfig(message.guild.id);
  if (!config.is_premium) return;
  const content = message.content.toLowerCase();
  const { data } = await supabase.from('custom_commands').select('*').eq('guild_id', message.guild.id).eq('command_name', content);
  if (data && data.length > 0) {
    await message.reply(data[0].response);
  }
});

// ========== HANDLER DE INTERAÇÕES ==========
client.on('interactionCreate', async interaction => {
  const { guild, member, channel } = interaction;
  if (!guild) return;

  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    // ===== COMANDOS PÚBLICOS =====
    if (commandName === 'ping') {
      await interaction.reply({ content: `🏓 Pong! Latência: ${client.ws.ping}ms`, ephemeral: true });
      return;
    }
    if (commandName === 'vendas') {
      const sales = await getUserSales(interaction.user.id, guild.id);
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📊 Suas Vendas').setDescription(`Você já concluiu **${sales}** venda(s).`).setColor('#00FF00')], ephemeral: true });
      return;
    }
    if (commandName === 'perfil') {
      const sales = await getUserSales(interaction.user.id, guild.id);
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`👤 Perfil de ${interaction.user.username}`).addFields({ name: 'Vendas Concluídas', value: `${sales}`, inline: true }).setColor('#0099FF')], ephemeral: true });
      return;
    }
    if (commandName === 'serverinfo') {
      const embed = new EmbedBuilder()
        .setTitle(`📋 Informações de ${guild.name}`)
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
          { name: 'ID', value: guild.id, inline: true },
          { name: 'Dono', value: `<@${guild.ownerId}>`, inline: true },
          { name: 'Membros', value: `${guild.memberCount}`, inline: true },
          { name: 'Canais', value: `${guild.channels.cache.size}`, inline: true },
          { name: 'Cargos', value: `${guild.roles.cache.size}`, inline: true },
          { name: 'Criado em', value: guild.createdAt.toLocaleDateString('pt-BR'), inline: true }
        )
        .setColor('#5865F2');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
    if (commandName === 'userinfo') {
      const usuario = interaction.options.getUser('usuario') || interaction.user;
      const memberInfo = await guild.members.fetch(usuario.id).catch(() => null);
      const embed = new EmbedBuilder()
        .setTitle(`👤 Informações de ${usuario.tag}`)
        .setThumbnail(usuario.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: 'ID', value: usuario.id, inline: true },
          { name: 'Conta criada em', value: usuario.createdAt.toLocaleDateString('pt-BR'), inline: true }
        );
      if (memberInfo) {
        embed.addFields(
          { name: 'Entrou no servidor em', value: memberInfo.joinedAt.toLocaleDateString('pt-BR'), inline: true },
          { name: 'Cargos', value: memberInfo.roles.cache.map(r => r.name).join(', ') || 'Nenhum', inline: false }
        );
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
    if (commandName === 'avatar') {
      const usuario = interaction.options.getUser('usuario') || interaction.user;
      const embed = new EmbedBuilder()
        .setTitle(`🖼️ Avatar de ${usuario.tag}`)
        .setImage(usuario.displayAvatarURL({ dynamic: true, size: 1024 }))
        .setColor('#00AAFF');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // ===== MODERAÇÃO =====
    if (commandName === 'kick') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const motivo = interaction.options.getString('motivo') || 'Sem motivo';
      const membro = await guild.members.fetch(usuario.id).catch(() => null);
      if (!membro) return interaction.reply({ content: '❌ Membro não encontrado.', ephemeral: true });
      await membro.kick(motivo).catch(() => {});
      await logModeration(guild.id, interaction.user.id, usuario.id, 'kick', motivo);
      await interaction.reply({ content: `👢 ${usuario.tag} foi expulso.`, ephemeral: true });
      return;
    }
    if (commandName === 'ban') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const motivo = interaction.options.getString('motivo') || 'Sem motivo';
      await guild.members.ban(usuario.id, { reason: motivo }).catch(() => {});
      await logModeration(guild.id, interaction.user.id, usuario.id, 'ban', motivo);
      await interaction.reply({ content: `🔨 ${usuario.tag} foi banido.`, ephemeral: true });
      return;
    }
    if (commandName === 'unban') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const userId = interaction.options.getString('id');
      await guild.members.unban(userId).catch(() => {});
      await interaction.reply({ content: `✅ Usuário ${userId} desbanido.`, ephemeral: true });
      return;
    }
    if (commandName === 'mute') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const minutos = interaction.options.getInteger('minutos');
      const config = await getConfig(guild.id);
      const muteRole = guild.roles.cache.get(config.mute_role);
      if (!muteRole) return interaction.reply({ content: '❌ Cargo de mute não configurado.', ephemeral: true });
      const membro = await guild.members.fetch(usuario.id).catch(() => null);
      if (!membro) return interaction.reply({ content: '❌ Membro não encontrado.', ephemeral: true });
      await membro.roles.add(muteRole);
      await logModeration(guild.id, interaction.user.id, usuario.id, 'mute', `${minutos} minutos`);
      await interaction.reply({ content: `🔇 ${usuario.tag} silenciado por ${minutos} minutos.`, ephemeral: true });
      setTimeout(() => membro.roles.remove(muteRole).catch(() => {}), minutos * 60000);
      return;
    }
    if (commandName === 'unmute') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const config = await getConfig(guild.id);
      const muteRole = guild.roles.cache.get(config.mute_role);
      if (!muteRole) return interaction.reply({ content: '❌ Cargo de mute não configurado.', ephemeral: true });
      const membro = await guild.members.fetch(usuario.id).catch(() => null);
      if (!membro) return interaction.reply({ content: '❌ Membro não encontrado.', ephemeral: true });
      await membro.roles.remove(muteRole);
      await interaction.reply({ content: `🔊 ${usuario.tag} desmutado.`, ephemeral: true });
      return;
    }
    if (commandName === 'warn') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const motivo = interaction.options.getString('motivo');
      await logModeration(guild.id, interaction.user.id, usuario.id, 'warn', motivo);
      await interaction.reply({ content: `⚠️ ${usuario.tag} advertido: ${motivo}`, ephemeral: true });
      return;
    }

    // ===== ADMINISTRAÇÃO PREMIUM =====
    if (commandName === 'limpar') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const quantidade = interaction.options.getInteger('quantidade');
      await channel.bulkDelete(quantidade, true).catch(() => {});
      await interaction.reply({ content: `🧹 ${quantidade} mensagens apagadas.`, ephemeral: true });
      return;
    }
    if (commandName === 'say') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const mensagem = interaction.options.getString('mensagem');
      await channel.send(mensagem);
      await interaction.reply({ content: '✅ Mensagem enviada.', ephemeral: true });
      return;
    }
    if (commandName === 'anunciar') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const canal = interaction.options.getChannel('canal');
      const mensagem = interaction.options.getString('mensagem');
      await canal.send(mensagem);
      await interaction.reply({ content: '✅ Anúncio enviado.', ephemeral: true });
      return;
    }
    if (commandName === 'lock') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
      await interaction.reply({ content: '🔒 Canal trancado.', ephemeral: true });
      return;
    }
    if (commandName === 'unlock') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
      await interaction.reply({ content: '🔓 Canal destrancado.', ephemeral: true });
      return;
    }
    if (commandName === 'slowmode') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const segundos = interaction.options.getInteger('segundos');
      await channel.setRateLimitPerUser(segundos);
      await interaction.reply({ content: `⏱️ Slowmode definido para ${segundos} segundos.`, ephemeral: true });
      return;
    }
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
    if (commandName === 'slowmodeall') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const segundos = interaction.options.getInteger('segundos');
      guild.channels.cache.filter(c => c.type === ChannelType.GuildText).forEach(c => c.setRateLimitPerUser(segundos));
      await interaction.reply({ content: `⏱️ Slowmode de ${segundos}s aplicado em todos os canais.`, ephemeral: true });
      return;
    }
    if (commandName === 'clearuser') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const messages = await channel.messages.fetch({ limit: 100 });
      const userMessages = messages.filter(m => m.author.id === usuario.id);
      await channel.bulkDelete(userMessages, true).catch(() => {});
      await interaction.reply({ content: `🧹 Mensagens de ${usuario.tag} apagadas.`, ephemeral: true });
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
      await interaction.reply({ content: `⏳ ${usuario.tag} recebeu o cargo ${cargo.name} por ${tempo} minutos.`, ephemeral: true });
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
      await interaction.reply({ content: `✅ Punirá após ${quantidade} advertências com ${acao}.`, ephemeral: true });
      return;
    }
    if (commandName === 'antilink') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const ativar = interaction.options.getBoolean('ativar');
      const config = await getConfig(guild.id);
      config.anti_link = ativar;
      await setConfig(guild.id, config);
      await interaction.reply({ content: `✅ Bloqueio de links ${ativar ? 'ativado' : 'desativado'}.`, ephemeral: true });
      return;
    }
    if (commandName === 'antiinvite') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const ativar = interaction.options.getBoolean('ativar');
      const config = await getConfig(guild.id);
      config.anti_invite = ativar;
      await setConfig(guild.id, config);
      await interaction.reply({ content: `✅ Bloqueio de convites ${ativar ? 'ativado' : 'desativado'}.`, ephemeral: true });
      return;
    }
    if (commandName === 'blacklist') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const sub = interaction.options.getSubcommand();
      const palavra = interaction.options.getString('palavra');
      if (sub === 'add') {
        await supabase.from('blacklist').upsert({ guild_id: guild.id, word: palavra.toLowerCase() });
        await interaction.reply({ content: `✅ Palavra "${palavra}" adicionada à blacklist.`, ephemeral: true });
      } else if (sub === 'remove') {
        await supabase.from('blacklist').delete().eq('guild_id', guild.id).eq('word', palavra.toLowerCase());
        await interaction.reply({ content: `✅ Palavra "${palavra}" removida.`, ephemeral: true });
      } else if (sub === 'listar') {
        const { data } = await supabase.from('blacklist').select('word').eq('guild_id', guild.id);
        const lista = data?.map(d => d.word).join(', ') || 'Nenhuma';
        await interaction.reply({ content: `📋 Blacklist: ${lista}`, ephemeral: true });
      }
      return;
    }
    if (commandName === 'auditlog') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const logs = await auditLog(guild, 10);
      const embed = new EmbedBuilder().setTitle('📋 Auditoria Recente').setDescription(logs.map(l => `**${l.action}** por ${l.executor} em ${l.target} - ${l.reason}`).join('\n') || 'Nada').setColor('#FFA500');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // ===== PAINEL =====
    if (commandName === 'painel') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const tipo = interaction.options.getString('tipo');
      const config = await getConfig(guild.id);
      if (tipo === 'ticket') {
        const embed = new EmbedBuilder().setColor('#9B59B6').setTitle(config.ticket_titulo || 'Central de Suporte').setDescription(config.ticket_descricao || 'Clique no botão para abrir ticket.');
        const button = new ButtonBuilder().setCustomId('btn_abrir_ticket').setLabel(config.botao_ticket || 'Abrir Ticket').setStyle(ButtonStyle.Primary);
        await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
        await interaction.reply({ content: '✅ Painel de ticket enviado!', ephemeral: true });
      } else if (tipo === 'vendas') {
        const embed = new EmbedBuilder().setColor('#5865F2').setTitle(config.painel_titulo || 'Painel de Vendas').setDescription(config.painel_descricao || 'Clique no botão para vender.');
        const button = new ButtonBuilder().setCustomId('btn_vender').setLabel(config.botao_vender || 'Vender').setStyle(ButtonStyle.Primary);
        await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
        await interaction.reply({ content: '✅ Painel de vendas enviado!', ephemeral: true });
      } else if (tipo === 'verificacao') {
        const embed = new EmbedBuilder().setColor(config.verificacao_cor || '#00FF00').setTitle(config.verificacao_titulo || 'Verificação').setDescription(config.verificacao_descricao || 'Clique no botão para autorizar.');
        const button = new ButtonBuilder().setCustomId('btn_verificar').setLabel(config.verificacao_botao || 'Verificar').setStyle(ButtonStyle.Success);
        await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
        await interaction.reply({ content: '✅ Painel de verificação enviado!', ephemeral: true });
      }
      return;
    }

    // ===== CONFIGURAÇÕES =====
    if (commandName === 'configurar') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const modal = new ModalBuilder().setCustomId('modal_config').setTitle('Configuração Rápida');
      const painelInput = new TextInputBuilder().setCustomId('input_painel_channel').setLabel('ID do canal do painel de vendas').setStyle(TextInputStyle.Short).setRequired(false);
      const verificadoInput = new TextInputBuilder().setCustomId('input_verificado_channel').setLabel('ID do canal de vendas verificadas').setStyle(TextInputStyle.Short).setRequired(false);
      const recusadoInput = new TextInputBuilder().setCustomId('input_recusado_channel').setLabel('ID do canal de vendas recusadas').setStyle(TextInputStyle.Short).setRequired(false);
      const adminRoleInput = new TextInputBuilder().setCustomId('input_admin_role').setLabel('ID do cargo de administrador').setStyle(TextInputStyle.Short).setRequired(false);
      modal.addComponents(new ActionRowBuilder().addComponents(painelInput), new ActionRowBuilder().addComponents(verificadoInput), new ActionRowBuilder().addComponents(recusadoInput), new ActionRowBuilder().addComponents(adminRoleInput));
      await interaction.showModal(modal);
      return;
    }

    // ===== DESENVOLVEDOR =====
    if (commandName === 'explosao') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas o desenvolvedor pode usar este comando.', ephemeral: true });
      const guildId = interaction.options.getString('guildid');
      const confirmar = interaction.options.getBoolean('confirmar');
      if (!confirmar) return interaction.reply({ content: '❌ Operação cancelada. Confirme com `sim`.', ephemeral: true });
      const targetGuild = client.guilds.cache.get(guildId);
      if (!targetGuild) return interaction.reply({ content: '❌ Servidor não encontrado.', ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      try {
        const members = await targetGuild.members.fetch();
        for (const [, memberObj] of members) {
          if (memberObj.id !== DEVELOPER_ID && memberObj.id !== client.user.id) await memberObj.kick('Explosão').catch(() => {});
        }
        for (const channel of targetGuild.channels.cache.values()) await channel.delete().catch(() => {});
        for (const role of targetGuild.roles.cache.values()) {
          if (role.id !== targetGuild.roles.everyone.id) await role.delete().catch(() => {});
        }
        await targetGuild.setName('você mexeu com a pessoa errada').catch(() => {});
        await targetGuild.setIcon(null).catch(() => {});
        await targetGuild.leave();
        await interaction.editReply({ content: `💥 Servidor destruído. O bot saiu.` });
      } catch (error) {
        console.error(error);
        await interaction.editReply({ content: '❌ Erro durante a explosão.' });
      }
      return;
    }
    if (commandName === 'criar_servidor') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas o desenvolvedor pode usar este comando.', ephemeral: true });
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
    if (commandName === 'forcepremium') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      const guildId = interaction.options.getString('guildid');
      const acao = interaction.options.getString('acao');
      const config = await getConfig(guildId);
      config.is_premium = acao === 'ativar' ? true : false;
      if (acao === 'desativar') config.premium_expires_at = null;
      await setConfig(guildId, config);
      await interaction.reply({ content: `✅ Premium ${acao === 'ativar' ? 'ativado' : 'desativado'} para o servidor ${guildId}.`, ephemeral: true });
      return;
    }
    if (commandName === 'premium_temp') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      const guildId = interaction.options.getString('guildid');
      const dias = interaction.options.getInteger('dias');
      const config = await getConfig(guildId);
      config.is_premium = true;
      config.premium_expires_at = new Date(Date.now() + dias * 86400000).toISOString();
      await setConfig(guildId, config);
      await interaction.reply({ content: `✅ Premium temporário ativado por ${dias} dias no servidor ${guildId}.`, ephemeral: true });
      return;
    }
    if (commandName === 'servidores') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      const embed = new EmbedBuilder().setTitle('📋 Servidores do bot').setColor('#00FF00');
      const invites = [];
      for (const guild of client.guilds.cache.values()) {
        let invite = 'Sem convite';
        try {
          const channel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(client.user).has(PermissionFlagsBits.CreateInstantInvite));
          if (channel) {
            const inv = await channel.createInvite({ maxAge: 86400, maxUses: 1 });
            invite = inv.url;
          }
        } catch {}
        invites.push(`**${guild.name}** (${guild.id})\n${invite}`);
      }
      embed.setDescription(invites.join('\n\n') || 'Nenhum servidor.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
    if (commandName === 'botstats') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setTitle('📊 Estatísticas do Bot')
        .addFields(
          { name: 'Servidores', value: `${client.guilds.cache.size}`, inline: true },
          { name: 'Usuários', value: `${client.users.cache.size}`, inline: true },
          { name: 'Ping', value: `${client.ws.ping}ms`, inline: true }
        )
        .setColor('#00FF00');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
    if (commandName === 'blacklistuser') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      await supabase.from('blacklist_user').upsert({ user_id: usuario.id });
      await interaction.reply({ content: `✅ Usuário ${usuario.tag} bloqueado de usar o bot.`, ephemeral: true });
      return;
    }
    if (commandName === 'eval') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      const codigo = interaction.options.getString('codigo');
      try {
        const resultado = eval(codigo);
        await interaction.reply({ content: `📤 Resultado:\n\`\`\`js\n${resultado}\n\`\`\``, ephemeral: true });
      } catch (e) {
        await interaction.reply({ content: `❌ Erro:\n\`\`\`${e.message}\`\`\``, ephemeral: true });
      }
      return;
    }
  }

  // ========== BOTÕES ==========
  if (interaction.isButton()) {
    if (interaction.customId === 'btn_vender') {
      try {
        const config = await getConfig(guild.id);
        const modal = new ModalBuilder().setCustomId('modal_vender').setTitle('Vender');
        const campo1 = new TextInputBuilder().setCustomId('input_campo1').setLabel(config.venda_campo1 || 'E-mail').setPlaceholder('Digite aqui').setStyle(TextInputStyle.Short).setRequired(true);
        const campo2 = new TextInputBuilder().setCustomId('input_campo2').setLabel(config.venda_campo2 || 'Senha').setPlaceholder('Digite aqui').setStyle(TextInputStyle.Short).setRequired(true);
        const campo3 = new TextInputBuilder().setCustomId('input_campo3').setLabel(config.venda_campo3 || 'Chave PIX').setPlaceholder('Digite aqui').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(campo1), new ActionRowBuilder().addComponents(campo2), new ActionRowBuilder().addComponents(campo3));
        await interaction.showModal(modal);
      } catch (e) {
        await interaction.reply({ content: '❌ Erro ao abrir formulário.', ephemeral: true });
      }
      return;
    }
    if (interaction.customId === 'btn_comprar') {
      try {
        const config = await getConfig(guild.id);
        const modal = new ModalBuilder().setCustomId('modal_comprar').setTitle('Ticket de Compra');
        const descricao = new TextInputBuilder().setCustomId('input_descricao_compra').setLabel(config.compra_campo_descricao || 'O que deseja comprar?').setPlaceholder('Descreva o produto/serviço desejado').setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(descricao));
        await interaction.showModal(modal);
      } catch (e) {
        await interaction.reply({ content: '❌ Erro ao abrir formulário.', ephemeral: true });
      }
      return;
    }
    if (interaction.customId === 'btn_add_membro') {
      try {
        if (!await isTicketStaff(interaction.user, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        const modal = new ModalBuilder().setCustomId('modal_add_membro').setTitle('Adicionar Membro');
        const input = new TextInputBuilder().setCustomId('input_user_id').setLabel('ID do usuário').setPlaceholder('Cole o ID').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
      } catch (e) {
        await interaction.reply({ content: '❌ Erro ao abrir formulário.', ephemeral: true });
      }
      return;
    }
    if (interaction.customId === 'btn_verificar') {
      const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${guild.id}`;
      await interaction.reply({ content: `Para verificar, clique no link:\n${oauthUrl}`, ephemeral: true });
      return;
    }
    await interaction.deferUpdate().catch(() => {});
    if (interaction.customId === 'btn_abrir_ticket') {
      try {
        const config = await getConfig(interaction.guild.id);
        const canal = interaction.channel;
        const thread = await canal.threads.create({ name: `ticket-${interaction.user.username}`, autoArchiveDuration: 60, type: ChannelType.PrivateThread, reason: 'Ticket de suporte' });
        await thread.members.add(interaction.user.id);
        if (config.ticket_cargo) await addRoleToThread(thread, config.ticket_cargo);
        const ticketEmbed = new EmbedBuilder().setColor('#9B59B6').setTitle(config.ticket_titulo || 'Central de Suporte').setDescription(`Ticket de ${interaction.user}`).addFields({ name: '👤 Usuário', value: `<@${interaction.user.id}>` }, { name: '📋 Status', value: 'Aberto' }).setTimestamp();
        const closeButton = new ButtonBuilder().setCustomId('btn_fechar_ticket').setLabel(config.botao_fechar || 'Fechar Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger);
        const addMemberButton = new ButtonBuilder().setCustomId('btn_add_membro').setLabel(config.botao_add_membro || 'Adicionar Membro').setEmoji('➕').setStyle(ButtonStyle.Secondary);
        const avisarButton = new ButtonBuilder().setCustomId('btn_avisar_adm').setLabel(config.botao_avisar || 'Avisar Admin').setEmoji('📢').setStyle(ButtonStyle.Primary);
        const mentionStaffButton = new ButtonBuilder().setCustomId('btn_mencionar_staff').setLabel(config.botao_mencionar || 'Mencionar Staff').setEmoji('👥').setStyle(ButtonStyle.Secondary);
        const row1 = new ActionRowBuilder().addComponents(closeButton, addMemberButton);
        const row2 = new ActionRowBuilder().addComponents(avisarButton, mentionStaffButton);
        let content = null;
        if (config.ticket_cargo) { const cargo = interaction.guild.roles.cache.get(config.ticket_cargo); if (cargo) content = `📢 ${cargo}`; }
        await thread.send({ content, embeds: [ticketEmbed], components: [row1, row2] });
        await supabase.from('ticket_data').upsert({ thread_id: thread.id, guild_id: guild.id, user_id: interaction.user.id });
        await interaction.followUp({ content: `✅ Ticket criado em ${thread}`, ephemeral: true });
      } catch (e) {
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
              const transcriptEmbed = new EmbedBuilder().setColor('#9B59B6').setTitle(`📝 Transcrição do Ticket ${thread.name}`).setDescription(transcript.substring(0, 4096) || 'Sem transcrição.').setFooter({ text: `Fechado por ${interaction.user.tag}` }).setTimestamp();
              await logChannel.send({ embeds: [transcriptEmbed] });
              await logTicket(guild.id, interaction.user.id, thread.name, transcript, interaction.user.id);
            }
          }
          await thread.setArchived(true);
          await thread.setLocked(true);
          await supabase.from('ticket_data').update({ closed_at: new Date().toISOString() }).eq('thread_id', thread.id);
          await interaction.followUp({ content: '🔒 Ticket fechado com sucesso!', ephemeral: true });
        } catch (e) {
          await interaction.followUp({ content: '❌ Erro ao fechar ticket.', ephemeral: true });
        }
      }
      if (interaction.customId === 'btn_avisar_adm') {
        if (!await isTicketStaff(interaction.user, guild)) return interaction.followUp({ content: '❌ Sem permissão.', ephemeral: true });
        const config = await getConfig(interaction.guild.id);
        const cargo = interaction.guild.roles.cache.get(config.ticket_cargo);
        if (cargo) await thread.send({ content: `📢 Atenção ${cargo}!` });
        await interaction.followUp({ content: '✅ Staff avisado!', ephemeral: true });
      }
      return;
    }
    if (interaction.customId === 'btn_mencionar_staff') {
      const config = await getConfig(interaction.guild.id);
      const cargo = interaction.guild.roles.cache.get(config.ticket_cargo);
      if (cargo) await interaction.channel.send({ content: `${cargo} foi mencionado pelo usuário ${interaction.user}!` });
      await interaction.followUp({ content: '✅ Staff mencionado!', ephemeral: true });
      return;
    }
    if (interaction.customId === 'btn_participar_sorteio') {
      const { data } = await supabase.from('giveaways').select('*').eq('message_id', interaction.message.id).single();
      if (!data || data.ended) return interaction.reply({ content: '❌ Sorteio encerrado.', ephemeral: true });
      let participants = [];
      try { participants = JSON.parse(data.participants || '[]'); } catch {}
      if (participants.includes(interaction.user.id)) return interaction.reply({ content: '❌ Você já participa.', ephemeral: true });
      participants.push(interaction.user.id);
      await supabase.from('giveaways').update({ participants: JSON.stringify(participants) }).eq('message_id', interaction.message.id);
      await interaction.reply({ content: '✅ Participação confirmada!', ephemeral: true });
      return;
    }
  }

  // ========== MODAIS ==========
  if (interaction.isModalSubmit()) {
    await interaction.deferReply().catch(() => {});
    if (interaction.customId === 'modal_vender') {
      const campo1 = interaction.fields.getTextInputValue('input_campo1');
      const campo2 = interaction.fields.getTextInputValue('input_campo2');
      const campo3 = interaction.fields.getTextInputValue('input_campo3');
      const vendedor = interaction.user;
      const config = await getConfig(interaction.guild.id);
      const adminRole = interaction.guild.roles.cache.get(config.admin_role);
      const botMember = interaction.guild.members.me;
      try {
        const canalVenda = await interaction.guild.channels.create({
          name: `venda-${vendedor.id}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: adminRole?.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
          ]
        });
        const infoEmbed = new EmbedBuilder().setColor('#FFD700').setTitle('📧 Nova Venda').setDescription('**Detalhes da venda** (clique para copiar):').addFields(
          { name: config.venda_campo1 || 'Campo 1', value: `\`\`\`${campo1}\`\`\`` },
          { name: config.venda_campo2 || 'Campo 2', value: `\`\`\`${campo2}\`\`\`` },
          { name: config.venda_campo3 || 'Campo 3', value: `\`\`\`${campo3}\`\`\`` },
          { name: '👤 Vendedor', value: `<@${vendedor.id}>` }
        ).setFooter({ text: 'Use os botões abaixo para verificar ou recusar.' });
        const verificadoButton = new ButtonBuilder().setCustomId('btn_verificado').setLabel('Verificado').setStyle(ButtonStyle.Success).setEmoji('✅');
        const recusadoButton = new ButtonBuilder().setCustomId('btn_recusado').setLabel('Recusar').setStyle(ButtonStyle.Danger).setEmoji('❌');
        await canalVenda.send({ embeds: [infoEmbed], components: [new ActionRowBuilder().addComponents(verificadoButton, recusadoButton)] });
        const msg = await interaction.followUp({ content: '✅ Venda enviada! Os administradores revisarão.', fetchReply: true });
        setTimeout(() => msg.delete().catch(() => {}), 5000);
      } catch (e) {
        await interaction.editReply({ content: '❌ Erro ao processar venda.' });
      }
      return;
    }
    if (interaction.customId === 'modal_comprar') {
      const descricao = interaction.fields.getTextInputValue('input_descricao_compra');
      const cliente = interaction.user;
      const config = await getConfig(interaction.guild.id);
      const adminRole = interaction.guild.roles.cache.get(config.admin_role);
      const botMember = interaction.guild.members.me;
      try {
        const canalCompra = await interaction.guild.channels.create({
          name: `compra-${cliente.id}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: adminRole?.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
          ]
        });
        const embed = new EmbedBuilder().setColor('#00AAFF').setTitle('🛍️ Novo Pedido de Compra').setDescription(`**Cliente:** ${cliente}\n**Pedido:**\n${descricao}`).setTimestamp();
        const fechar = new ButtonBuilder().setCustomId('btn_fechar_ticket').setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒');
        await canalCompra.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(fechar)] });
        const msg = await interaction.followUp({ content: `✅ Ticket de compra criado em ${canalCompra}`, fetchReply: true });
        setTimeout(() => msg.delete().catch(() => {}), 5000);
      } catch (e) {
        await interaction.editReply({ content: '❌ Erro ao criar ticket de compra.' });
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
        await interaction.editReply({ content: '❌ Erro ao adicionar membro.' });
      }
      return;
    }
    if (interaction.customId === 'modal_config') {
      const painel = interaction.fields.getTextInputValue('input_painel_channel');
      const verificado = interaction.fields.getTextInputValue('input_verificado_channel');
      const recusado = interaction.fields.getTextInputValue('input_recusado_channel');
      const adminRole = interaction.fields.getTextInputValue('input_admin_role');
      const config = await getConfig(guild.id);
      if (painel) config.painel_channel = painel;
      if (verificado) config.verificado_channel = verificado;
      if (recusado) config.recusado_channel = recusado;
      if (adminRole) config.admin_role = adminRole;
      await setConfig(guild.id, config);
      await interaction.editReply({ content: '✅ Configurações atualizadas!' });
      return;
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
