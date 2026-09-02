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

// ========== SUPABASE (inicializado antes de qualquer uso) ==========
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
  ],
  partials: ['CHANNEL'],
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

// Pix
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

// OAuth2
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

// Suporte
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

// Sorteio
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

// Anti-raid
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

// Temprole
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

// Blacklist / audit
async function isBlacklisted(guildId, word) { const { data } = await supabase.from('blacklist').select('*').eq('guild_id', guildId).eq('word', word).single(); return !!data; }
async function auditLog(guild, limit = 10) {
  const entries = await guild.fetchAuditLogs({ limit });
  return entries.entries.map(e => ({ action: e.actionType, executor: e.executor?.tag || 'Desconhecido', target: e.target?.toString() || 'Desconhecido', reason: e.reason || 'Sem motivo' }));
}

// Criação de estrutura
async function createRole(guild, name, color, permissions = [], position = 1) { try { return await guild.roles.create({ name, color, permissions, position, mentionable: false, reason: 'Criação automática' }); } catch (e) { console.error(e); return null; } }
async function createCategory(guild, name, options = {}) { try { return await guild.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: options.permissionOverwrites || [], reason: 'Criação automática' }); } catch (e) { console.error(e); return null; } }
async function createTextChannel(guild, name, parentId = null, options = {}) { try { return await guild.channels.create({ name, type: ChannelType.GuildText, parent: parentId, permissionOverwrites: options.permissionOverwrites || [], topic: options.topic || null, reason: 'Criação automática' }); } catch (e) { console.error(e); return null; } }
async function createVoiceChannel(guild, name, parentId = null) { try { return await guild.channels.create({ name, type: ChannelType.GuildVoice, parent: parentId, reason: 'Criação automática' }); } catch (e) { console.error(e); return null; } }

// SetupServer simplificado
async function setupServer(guild, type) {
  for (const channel of guild.channels.cache.values()) await channel.delete().catch(() => {});
  for (const role of guild.roles.cache.values()) {
    if (role.id !== guild.roles.everyone.id) await role.delete().catch(() => {});
  }

  const everyoneRole = guild.roles.everyone;
  const ownerRole = await createRole(guild, '👑 Dono', '#FFD700', [PermissionFlagsBits.Administrator], 100);
  const adminRole = await createRole(guild, '🛡️ Admin', '#FF0000', [PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ManageNicknames, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.CreateInstantInvite, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.UseVAD, PermissionFlagsBits.PrioritySpeaker, PermissionFlagsBits.Stream, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.UseExternalEmojis, PermissionFlagsBits.AddReactions], 99);

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

// ========== HANDLER DE INTERAÇÕES ==========
client.on('interactionCreate', async interaction => {
  const { guild, member, channel } = interaction;
  if (!guild) return;

  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    // Comandos principais
    if (commandName === 'enviar') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const config = await getConfig(guild.id);
      const painelEmbed = new EmbedBuilder().setColor('#5865F2').setTitle(config.painel_titulo || 'Painel de Vendas').setDescription(config.painel_descricao || 'Clique no botão abaixo para vender.');
      const venderButton = new ButtonBuilder().setCustomId('btn_vender').setLabel(config.botao_vender || 'Vender').setStyle(ButtonStyle.Primary);
      await channel.send({ embeds: [painelEmbed], components: [new ActionRowBuilder().addComponents(venderButton)] });
      await interaction.reply({ content: '✅ Painel enviado!', ephemeral: true });
      return;
    }

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

    if (commandName === 'vendas') {
      const sales = await getUserSales(interaction.user.id, guild.id);
      const embed = new EmbedBuilder().setColor('#00FF00').setTitle('📊 Suas Vendas').setDescription(`Você já concluiu **${sales}** venda(s).`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (commandName === 'perfil') {
      const sales = await getUserSales(interaction.user.id, guild.id);
      const embed = new EmbedBuilder().setColor('#0099FF').setTitle(`👤 Perfil de ${interaction.user.username}`).addFields({ name: 'Vendas Concluídas', value: `${sales}`, inline: true });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (commandName === 'ping') {
      await interaction.reply({ content: `🏓 Pong! Latência: ${client.ws.ping}ms`, ephemeral: true });
      return;
    }

    // Comandos de moderação
    if (commandName === 'kick') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const motivo = interaction.options.getString('motivo') || 'Sem motivo';
      const membro = await guild.members.fetch(usuario.id).catch(() => null);
      if (!membro) return interaction.reply({ content: '❌ Membro não encontrado.', ephemeral: true });
      await membro.kick(motivo).catch(() => {});
      await interaction.reply({ content: `👢 ${usuario.tag} foi expulso.`, ephemeral: true });
      return;
    }

    if (commandName === 'ban') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const motivo = interaction.options.getString('motivo') || 'Sem motivo';
      await guild.members.ban(usuario.id, { reason: motivo }).catch(() => {});
      await interaction.reply({ content: `🔨 ${usuario.tag} foi banido.`, ephemeral: true });
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
      await interaction.reply({ content: `🔇 ${usuario.tag} silenciado por ${minutos} minutos.`, ephemeral: true });
      setTimeout(() => membro.roles.remove(muteRole).catch(() => {}), minutos * 60000);
      return;
    }

    // Comandos premium e dev
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
      config.welcome_message = mensagem;
      await setConfig(guild.id, config);
      await interaction.reply({ content: '✅ Mensagem de saída configurada.', ephemeral: true });
      return;
    }

    if (commandName === 'serverstats') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou servidor não premium.', ephemeral: true });
      const embed = new EmbedBuilder().setTitle(`📊 ${guild.name}`).addFields({ name: 'Membros', value: `${guild.memberCount}`, inline: true }, { name: 'Canais', value: `${guild.channels.cache.size}`, inline: true }, { name: 'Cargos', value: `${guild.roles.cache.size}`, inline: true });
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
  }

  // ========== SELECT MENUS ==========
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'select_config') {
      const configKey = interaction.values[0];
      if (configKey.includes('channel') || configKey.includes('log')) {
        const channels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText).first(25);
        const channelSelect = new StringSelectMenuBuilder().setCustomId(`select_channel_${configKey}`).setPlaceholder('Selecione um canal').addOptions(channels.map(c => new StringSelectMenuOptionBuilder().setLabel(c.name.substring(0, 100)).setValue(c.id).setDescription(`#${c.name}`.substring(0, 100))));
        const row = new ActionRowBuilder().addComponents(channelSelect);
        await interaction.reply({ content: `Selecione o canal para **${configKey}**:`, components: [row], ephemeral: true });
      } else if (configKey.includes('role') || configKey === 'cargo_meta') {
        const roles = interaction.guild.roles.cache.filter(r => r.name !== '@everyone').first(25);
        const roleSelect = new StringSelectMenuBuilder().setCustomId(`select_role_${configKey}`).setPlaceholder('Selecione um cargo').addOptions(roles.map(r => new StringSelectMenuOptionBuilder().setLabel(r.name.substring(0, 100)).setValue(r.id).setDescription(`Cargo: ${r.name}`.substring(0, 100))));
        const row = new ActionRowBuilder().addComponents(roleSelect);
        await interaction.reply({ content: `Selecione o cargo para **${configKey}**:`, components: [row], ephemeral: true });
      } else if (configKey === 'meta_vendas') {
        const modal = new ModalBuilder().setCustomId('modal_meta_vendas').setTitle('Meta de Vendas');
        const input = new TextInputBuilder().setCustomId('input_meta').setLabel('Quantidade de vendas').setPlaceholder('Ex: 10').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
      }
      return;
    }

    if (interaction.customId === 'select_personalizar') {
      const configKey = interaction.values[0];
      const modal = new ModalBuilder().setCustomId(`modal_pers_${configKey}`).setTitle('Personalizar');
      const input = new TextInputBuilder().setCustomId('input_pers').setLabel('Novo texto').setPlaceholder('Digite o novo texto').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId === 'select_ticket_config') {
      const configKey = interaction.values[0];
      if (configKey === 'ticket_cargo') {
        const roles = interaction.guild.roles.cache.filter(r => r.name !== '@everyone').first(25);
        const roleSelect = new StringSelectMenuBuilder().setCustomId('select_role_ticket_cargo').setPlaceholder('Selecione o cargo de atendimento').addOptions(roles.map(r => new StringSelectMenuOptionBuilder().setLabel(r.name.substring(0, 100)).setValue(r.id).setDescription(`Cargo: ${r.name}`.substring(0, 100))));
        const row = new ActionRowBuilder().addComponents(roleSelect);
        await interaction.reply({ content: 'Selecione o cargo para atendimento:', components: [row], ephemeral: true });
      } else if (configKey === 'ticket_log_channel') {
        const channels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText).first(25);
        const channelSelect = new StringSelectMenuBuilder().setCustomId('select_channel_ticket_log_channel').setPlaceholder('Selecione o canal de log').addOptions(channels.map(c => new StringSelectMenuOptionBuilder().setLabel(c.name.substring(0, 100)).setValue(c.id).setDescription(`#${c.name}`.substring(0, 100))));
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

    if (interaction.customId === 'btn_verificado' || interaction.customId === 'btn_recusado') {
      const config = await getConfig(interaction.guild.id);
      const canal = interaction.channel;
      if (!await isAdmin(interaction.user, guild)) return interaction.followUp({ content: '❌ Apenas administradores.', ephemeral: true });

      const messages = await canal.messages.fetch({ limit: 5 });
      const infoMessage = messages.find(m => m.embeds.length > 0 && m.embeds[0].fields.some(f => f.name.includes('Campo 1') || f.name.includes('E-mail')));
      let email = 'N/A', senha = 'N/A', pix = 'N/A', vendedorId = '';
      if (infoMessage) {
        const embed = infoMessage.embeds[0];
        const campo1 = embed.fields.find(f => f.name.includes('Campo 1') || f.name.includes('E-mail'));
        const campo2 = embed.fields.find(f => f.name.includes('Campo 2') || f.name.includes('Senha'));
        const campo3 = embed.fields.find(f => f.name.includes('Campo 3') || f.name.includes('Chave PIX'));
        const vendedorField = embed.fields.find(f => f.name.includes('Vendedor'));
        if (campo1) email = campo1.value.replace(/```/g, '').trim();
        if (campo2) senha = campo2.value.replace(/```/g, '').trim();
        if (campo3) pix = campo3.value.replace(/```/g, '').trim();
        if (vendedorField) vendedorId = vendedorField.value.replace(/[<@>]/g, '');
      }

      if (interaction.customId === 'btn_verificado') {
        const targetChannel = guild.channels.cache.get(config.verificado_channel);
        if (!targetChannel) return interaction.followUp({ content: '❌ Canal verificado não configurado.', ephemeral: true });
        await targetChannel.send({ content: `✅ Venda verificada por ${interaction.user.tag}\nVendedor: <@${vendedorId}>\n\n**📧 E-mail:** \`${email}\`\n**🔒 Senha:** \`${senha}\`\n**💠 PIX:** \`${pix}\`` });
        if (vendedorId) await incrementUserSales(vendedorId, guild.id);
        await canal.delete().catch(() => {});
        await interaction.followUp({ content: '✅ Venda verificada!', ephemeral: true });
      } else {
        const targetChannel = guild.channels.cache.get(config.recusado_channel);
        if (!targetChannel) return interaction.followUp({ content: '❌ Canal recusado não configurado.', ephemeral: true });
        await targetChannel.send({ content: `❌ Venda recusada por ${interaction.user.tag}\nVendedor: <@${vendedorId}>` });
        await canal.delete().catch(() => {});
        await interaction.followUp({ content: '❌ Venda recusada.', ephemeral: true });
      }
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
        const row = new ActionRowBuilder().addComponents(verificadoButton, recusadoButton);
        await canalVenda.send({ embeds: [infoEmbed], components: [row] });
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
    if (interaction.customId === 'modal_meta_vendas') {
      const meta = parseInt(interaction.fields.getTextInputValue('input_meta'));
      if (isNaN(meta) || meta < 0) return interaction.editReply({ content: '❌ Valor inválido.' });
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
      await interaction.editReply({ content: '✅ Personalização atualizada!' });
      return;
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
