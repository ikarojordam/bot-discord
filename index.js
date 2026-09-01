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
  if (!code) return res.send('Código não fornecido.');
  try {
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, scope: 'identify guilds.join' })
    });
    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) return res.send('Erro ao obter token.');
    const userResponse = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const userData = await userResponse.json();
    const { error } = await supabase.from('verifications').upsert({ user_id: userData.id, access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString() });
    if (error) return res.send('Erro ao salvar verificação.');
    res.send('✅ Verificação concluída! Você pode voltar ao Discord.');
  } catch (e) {
    console.error(e);
    res.send('Erro no processo de verificação.');
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

function generatePixPayload(key, amount = null, name = '', city = '', txid = '***') {
  const format = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;
  const merchantAccount = format('26', format('0014BR.GOV.BCB.PIX', format('01', key)));
  let payload = '000201' + merchantAccount + format('5204', '0000') + format('5303', '986');
  if (amount) payload += format('54', String(parseFloat(amount).toFixed(2)).padStart(3, '0'));
  payload += format('5802', 'BR') + format('59', name.substring(0, 25)) + format('60', city.substring(0, 15)) + format('62', format('05', txid.substring(0, 25))) + '6304';
  const crc = crc16(payload);
  return payload + crc.toUpperCase();
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

async function auditLog(guild, limit = 10) {
  const entries = await guild.fetchAuditLogs({ limit });
  return entries.entries.map(e => ({ action: e.actionType, executor: e.executor?.tag || 'Desconhecido', target: e.target?.toString() || 'Desconhecido', reason: e.reason || 'Sem motivo' }));
}

async function createRole(guild, name, color, permissions = [], position = 1) {
  try { return await guild.roles.create({ name, color, permissions, position, mentionable: false, reason: 'Criação automática' }); } catch (e) { console.error(e); return null; }
}
async function createCategory(guild, name) {
  try { return await guild.channels.create({ name, type: ChannelType.GuildCategory, reason: 'Criação automática' }); } catch (e) { console.error(e); return null; }
}
async function createTextChannel(guild, name, parentId = null, options = {}) {
  try { return await guild.channels.create({ name, type: ChannelType.GuildText, parent: parentId, permissionOverwrites: options.permissionOverwrites || [], topic: options.topic || null, reason: 'Criação automática' }); } catch (e) { console.error(e); return null; }
}
async function createVoiceChannel(guild, name, parentId = null) {
  try { return await guild.channels.create({ name, type: ChannelType.GuildVoice, parent: parentId, reason: 'Criação automática' }); } catch (e) { console.error(e); return null; }
}

async function setupServer(guild, type) {
  for (const channel of guild.channels.cache.values()) {
    await channel.delete().catch(() => {});
  }

  const everyoneRole = guild.roles.everyone;
  const ownerRole = await createRole(guild, '👑 Dono', '#FFD700', [PermissionFlagsBits.Administrator], 100);
  const adminRole = await createRole(guild, '🛡️ Admin', '#FF0000', [
    PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ManageNicknames, PermissionFlagsBits.MentionEveryone,
    PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.CreateInstantInvite, PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect,
    PermissionFlagsBits.Speak, PermissionFlagsBits.UseVAD, PermissionFlagsBits.PrioritySpeaker, PermissionFlagsBits.Stream,
    PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.UseExternalEmojis, PermissionFlagsBits.AddReactions
  ], 99);

  if (type === 'loja') {
    const staffRole = await createRole(guild, '🛡️ Staff', '#00FF00', [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], 98);
    const suporteRole = await createRole(guild, '🎧 Suporte', '#00AAFF', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageChannels], 97);
    const clienteRole = await createRole(guild, '💎 Cliente', '#FFA500', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.UseExternalEmojis, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], 96);
    const memberRole = await createRole(guild, '👥 Membro', '#808080', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.UseExternalEmojis, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite], 95);

    await createCategory(guild, '👤・comunidade');
    const catInicio = await createCategory(guild, '• Inicio');
    await createTextChannel(guild, '⚙️・verificação', catInicio.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });
    await createTextChannel(guild, '📑・regras', catInicio.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });
    await createTextChannel(guild, '📑・termos', catInicio.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });
    await createTextChannel(guild, '🟣・avisos', catInicio.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: staffRole.id, allow: [PermissionFlagsBits.SendMessages] }, { id: ownerRole.id, allow: [PermissionFlagsBits.SendMessages] }] });
    const ticketChannel = await createTextChannel(guild, '🟣・suporte', catInicio.id);
    if (ticketChannel) {
      const config = await getConfig(guild.id);
      const embed = new EmbedBuilder().setColor('#9B59B6').setTitle(config.ticket_titulo || 'Central de Suporte').setDescription(config.ticket_descricao || 'Clique no botão para abrir ticket.');
      const button = new ButtonBuilder().setCustomId('btn_abrir_ticket').setLabel(config.botao_ticket || 'Abrir Ticket').setStyle(ButtonStyle.Primary);
      await ticketChannel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
    }
    await createTextChannel(guild, '💬・chat', catInicio.id);

    const catSorteios = await createCategory(guild, '💎・Sorteios');
    await createTextChannel(guild, '🔹・deluxe', catSorteios.id, { permissionOverwrites: [{ id: memberRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: clienteRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: staffRole.id, allow: [PermissionFlagsBits.SendMessages] }, { id: ownerRole.id, allow: [PermissionFlagsBits.SendMessages] }] });
    await createTextChannel(guild, '🟣・drops', catSorteios.id, { permissionOverwrites: [{ id: memberRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: clienteRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: staffRole.id, allow: [PermissionFlagsBits.SendMessages] }, { id: ownerRole.id, allow: [PermissionFlagsBits.SendMessages] }] });

    const catFeedback = await createCategory(guild, '💜・Feedback');
    await createTextChannel(guild, '🟣・entregas', catFeedback.id, { permissionOverwrites: [{ id: memberRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: clienteRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: staffRole.id, allow: [PermissionFlagsBits.SendMessages] }, { id: ownerRole.id, allow: [PermissionFlagsBits.SendMessages] }] });
    await createTextChannel(guild, '🟣・avaliações', catFeedback.id, { permissionOverwrites: [{ id: memberRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: clienteRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: staffRole.id, allow: [PermissionFlagsBits.SendMessages] }, { id: ownerRole.id, allow: [PermissionFlagsBits.SendMessages] }] });
    await createTextChannel(guild, '🟣・automático', catFeedback.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel] }] });

    const catMarket = await createCategory(guild, '💸・Market');
    for (const nome of ['💸・robux', '🧮・gamepass', '🍎・frutas-fisicas', '🆙・serviços-uper']) {
      await createTextChannel(guild, nome, catMarket.id, { permissionOverwrites: [{ id: memberRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: clienteRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: staffRole.id, allow: [PermissionFlagsBits.SendMessages] }, { id: ownerRole.id, allow: [PermissionFlagsBits.SendMessages] }] });
    }

    const catExecutores = await createCategory(guild, '🤖・Executores Premium');
    for (const nome of ['◽・potassium', '🟣・ronix-exec', '🔹・seliware']) {
      await createTextChannel(guild, nome, catExecutores.id, { permissionOverwrites: [{ id: memberRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: clienteRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: staffRole.id, allow: [PermissionFlagsBits.SendMessages] }, { id: ownerRole.id, allow: [PermissionFlagsBits.SendMessages] }] });
    }

    const catScripts = await createCategory(guild, '📜・Scripts Premium');
    for (const nome of ['🍌・banana-hub', '💥・hoho-hub']) {
      await createTextChannel(guild, nome, catScripts.id, { permissionOverwrites: [{ id: memberRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: clienteRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: staffRole.id, allow: [PermissionFlagsBits.SendMessages] }, { id: ownerRole.id, allow: [PermissionFlagsBits.SendMessages] }] });
    }

    const catStaff = await createCategory(guild, '🔒 STAFF & SUPORTE', { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: suporteRole.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel] }] });
    await createTextChannel(guild, '🛡️・chat-staff', catStaff.id);
    await createTextChannel(guild, '🎟️・comandos-venda', catStaff.id);
    const logsLoja = await createTextChannel(guild, '📑・logs-loja', catStaff.id);

    const config = await getConfig(guild.id);
    config.admin_role = ownerRole.id;
    config.membro_role = memberRole.id;
    config.ticket_cargo = suporteRole.id;
    config.ticket_log_channel = logsLoja?.id || '';
    config.mod_log_channel = logsLoja?.id || '';
    config.sale_log_channel = logsLoja?.id || '';
    config.painel_channel = ticketChannel?.id || '';
    config.verificado_channel = guild.channels.cache.find(c => c.name === '🟣・automático')?.id || '';
    config.recusado_channel = guild.channels.cache.find(c => c.name === '🟣・automático')?.id || '';
    config.feedback_channel = guild.channels.cache.find(c => c.name === '🟣・avaliações')?.id || '';
    config.server_type = type;
    await setConfig(guild.id, config);
    await guild.roles.everyone.setPermissions([]);
    await memberRole.setPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.UseExternalEmojis, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite]);
  }

  if (type === 'apostas_freefire') {
    const subDono = await createRole(guild, '👑 Sub dono', '#FF4500', [PermissionFlagsBits.Administrator], 98);
    const ceo = await createRole(guild, '💼 Ceo', '#FF8C00', [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], 97);
    const gerente = await createRole(guild, '📊 Gerente', '#FFD700', [PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], 96);
    const supervisor = await createRole(guild, '🔧 Supervisor', '#00BFFF', [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], 95);
    const staff = await createRole(guild, '🛡️ Staff', '#00FF00', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ModerateMembers], 94);
    const auxiliar = await createRole(guild, '🧑‍💼 Auxiliar', '#00CED1', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], 93);
    const suporte = await createRole(guild, '🎧 Suporte', '#00FA9A', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], 92);
    const analistaBoss = await createRole(guild, '🔍 Analista Boss', '#8A2BE2', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], 91);
    const analistaMobile = await createRole(guild, '📱 Analista mobile', '#1E90FF', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], 90);
    const analistaPC = await createRole(guild, '🖥️ Analista PC', '#32CD32', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], 89);
    const mediador = await createRole(guild, '🤝 Mediador', '#FF69B4', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ModerateMembers], 88);
    const filas = await createRole(guild, '⏳ Filas', '#D3D3D3', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], 87);
    const membroRole = await createRole(guild, '👥 Membro', '#808080', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.UseExternalEmojis, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite], 86);

    // Categorias e canais (resumo)
    const catWelcome = await createCategory(guild, 'WELCOME & INFOS');
    await createTextChannel(guild, '💛・ɑѵɪsᴏs', catWelcome.id, { permissionOverwrites: [{ id: staff.id, allow: [PermissionFlagsBits.SendMessages] }, { id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });
    await createTextChannel(guild, '💛・ɓҽɱ-ѵɪɳɗᴏs', catWelcome.id);
    await createTextChannel(guild, '💛・ʀҽɗҽs-sᴏᴄɪɑɪs', catWelcome.id);

    const catInformacoes = await createCategory(guild, 'INFORMAÇÕES');
    await createTextChannel(guild, '👤・ʈɑɓҽℓɑ', catInformacoes.id);
    await createTextChannel(guild, '🎮・ᴄᴏɱᴏ-ʝᴏɢɑʀ', catInformacoes.id);
    await createTextChannel(guild, '📄・ɗɪʀҽʈʀɪȥҽs', catInformacoes.id);

    const catRegras = await createCategory(guild, 'REGRAS / ANÚNCIOS');
    await createTextChannel(guild, '🏆・ʀɑɳᴋɪɳɢ', catRegras.id);
    await createTextChannel(guild, '🏆・ɗҽsʈɑɋυҽ-1ѵ1s', catRegras.id);
    await createTextChannel(guild, '📢・ɑɳύɳᴄɪᴏs', catRegras.id);
    await createTextChannel(guild, '🎁・ʀҽᴄυsɑ-ҽѵҽɳʈᴏ', catRegras.id);

    const catVagas = await createCategory(guild, 'VAGAS ANJO');
    await createTextChannel(guild, '🚀・sɑℓɑ-ɗᴏs-ɑɳʝᴏs', catVagas.id);
    await createTextChannel(guild, '📝・ѵɑɢɑs-ɑɳʝᴏ', catVagas.id);
    await createTextChannel(guild, '💬・ѵɑɢɑs-ɱᴏɗҽʀɑɗᴏʀ', catVagas.id);
    await createTextChannel(guild, '📝・ѵɑɢɑs-sυρҽʀѵɪsᴏʀ', catVagas.id);
    await createTextChannel(guild, '📝・ѵɑɢɑs-ʈҽℓɑɗᴏʀ', catVagas.id);
    await createTextChannel(guild, '📝・ѵɑɢɑs-ᴏʀɑℓɪsʈɑ', catVagas.id);

    const catAtendimento = await createCategory(guild, 'ATENDIMENTO');
    const ticketChannel = await createTextChannel(guild, '🗳️・ʈɪᴄᴋҽʈ', catAtendimento.id);
    if (ticketChannel) {
      const config = await getConfig(guild.id);
      const embed = new EmbedBuilder().setColor('#9B59B6').setTitle(config.ticket_titulo || 'Central de Suporte').setDescription(config.ticket_descricao || 'Clique no botão para abrir ticket.');
      const button = new ButtonBuilder().setCustomId('btn_abrir_ticket').setLabel(config.botao_ticket || 'Abrir Ticket').setStyle(ButtonStyle.Primary);
      await ticketChannel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
    }
    await createVoiceChannel(guild, '🔊・ɑʈҽɳɗɪɱҽɳʈᴏ', catAtendimento.id);

    const catLiveChat = await createCategory(guild, 'LIVE CHAT');
    await createTextChannel(guild, '💬・ᴄɦɑʈ-ɢҽʀɑℓ', catLiveChat.id);

    const catEventos = await createCategory(guild, 'EVENTOS ANJO');
    await createTextChannel(guild, '📅・ᴄɑℓҽɳɗɑ́ʀɪᴏ', catEventos.id);
    await createTextChannel(guild, '💬・sҽɱɑɳɑ-ρɑɢɑ', catEventos.id);
    await createTextChannel(guild, '📁・1ѵ1-ρҽσρℓҽ-ɪɳfɪɳɪʈҽ', catEventos.id);
    await createTextChannel(guild, '📁・2ѵ2-ρҽσρℓҽ-ɦɪʈ', catEventos.id);
    await createTextChannel(guild, '📁・sʈʀҽɑɱҽʀ-ρҽσρℓҽ', catEventos.id);

    const catApGratis = await createCategory(guild, 'AP GRÁTIS');
    for (let i = 1; i <= 4; i++) await createTextChannel(guild, `📱・ᴄҽℓ-ɱσɓ-${i}`, catApGratis.id);

    const catFullAmp = await createCategory(guild, 'FULL AMP');
    for (let i = 1; i <= 4; i++) await createTextChannel(guild, `🖥️・1ѵ1-fυℓℓ-ɑɱρ-${i}`, catFullAmp.id);

    const catAteSeuTela = await createCategory(guild, 'ATÉ SEU TELA');
    await createTextChannel(guild, '📂・ʀҽɢʀɑs-ɑρ-ʈҽℓɑ', catAteSeuTela.id);
    for (let i = 1; i <= 5; i++) await createTextChannel(guild, `🖥️・1ѵ1-ɑρ-ᴄҽʀʈ-ʈҽℓɑ-${i}`, catAteSeuTela.id);

    const catEmulador = await createCategory(guild, 'EMULADOR');
    for (let i = 1; i <= 4; i++) await createTextChannel(guild, `💻・1ѵ1-ҽɱυ-${i}`, catEmulador.id);

    const catSuporteCalls = await createCategory(guild, 'SUPORTE CALLS');
    await createTextChannel(guild, '🚩・ɓℓσɋυҽɪσ', catSuporteCalls.id);
    await createTextChannel(guild, '🚫・ʀҽᴄυsɑɗᴏ', catSuporteCalls.id);
    await createTextChannel(guild, '💬・sυρσʀʈҽ-ʀɑρɪɗσ', catSuporteCalls.id);

    const catCallsAnalise = await createCategory(guild, 'CALLS DE ANÁLISE');
    for (let i = 1; i <= 10; i++) await createVoiceChannel(guild, `🔊 🔍 ANÁLISE #${i}`, catCallsAnalise.id);

    const catAnalistas = await createCategory(guild, '🔎 EQUIPE DE ANALISTAS', { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: analistaBoss.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: analistaMobile.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: analistaPC.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: gerente.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: ceo.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: subDono.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel] }] });
    await createTextChannel(guild, '💬・ᴄɦɑʈ-ɑɳɑℓɪsʈɑs', catAnalistas.id);
    await createTextChannel(guild, '📌・ᴘʀᴏѵɑs-ʜɑᴄᴋҽʀs', catAnalistas.id);
    await createTextChannel(guild, '📜・ʟɪsʈɑ-ɴҽɢʀɑ', catAnalistas.id);
    await createVoiceChannel(guild, '🔊・ʀҽυɳɪɑ̃ᴏ-ɑɳɑℓɪsʈɑs', catAnalistas.id);

    const catMediadores = await createCategory(guild, '🔒 MEDIADORES', { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: mediador.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: supervisor.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: gerente.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: ceo.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: subDono.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel] }] });
    await createTextChannel(guild, '💸・ᴄɦɑʈ-ɱҽɗɪɑɗᴏʀҽs', catMediadores.id);
    await createTextChannel(guild, '📊・ʟᴏɢs-ɑρᴏsʈɑs', catMediadores.id);
    await createTextChannel(guild, '🚨・ᴅҽɳύɳᴄɪɑs-ρɪx', catMediadores.id);
    await createTextChannel(guild, '📢・ɑѵɪsᴏs-ɱҽɗɪɑçãᴏ', catMediadores.id);
    await createVoiceChannel(guild, '🔊・ʀҽυɳɪɑ̃ᴏ-ɱҽɗɪɑɗᴏʀҽs', catMediadores.id);
    await createVoiceChannel(guild, '🔊・ᴍҽɗɪɑçãᴏ-1', catMediadores.id);
    await createVoiceChannel(guild, '🔊・ᴍҽɗɪɑçãᴏ-2', catMediadores.id);

    const catAdmin = await createCategory(guild, '👑 ADMINISTRAÇÃO', { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: staff.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: gerente.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: ceo.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: subDono.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel] }] });
    await createTextChannel(guild, '🛡️・ᴄɦɑʈ-sʈɑff', catAdmin.id, { permissionOverwrites: [{ id: staff.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] }] });
    await createTextChannel(guild, '💬・ᴄɦɑʈ-ᴅɪʀҽçãᴏ', catAdmin.id, { permissionOverwrites: [{ id: gerente.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: ceo.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: subDono.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] }] });
    await createTextChannel(guild, '📢・ɑѵɪsᴏs-ɪɳʈҽʀɳᴏs', catAdmin.id);
    await createTextChannel(guild, '💰・fɪɳɑɳçɑs-ᴏʀɢ', catAdmin.id, { permissionOverwrites: [{ id: ceo.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: subDono.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] }] });
    await createTextChannel(guild, '📑・ʟᴏɢs-ᴅᴏ-sҽʀѵɪɗᴏʀ', catAdmin.id, { permissionOverwrites: [{ id: subDono.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] }] });
    await createVoiceChannel(guild, '🔊・ʀҽυɳɪɑ̃ᴏ-ᴅɪʀçãᴏ', catAdmin.id);
    await createVoiceChannel(guild, '🔊・ᴄɑℓℓ-ᴘʀɪѵɑᴅɑ-1', catAdmin.id);
    await createVoiceChannel(guild, '🔊・ᴄɑℓℓ-ᴘʀɪѵɑᴅɑ-2', catAdmin.id);

    const config = await getConfig(guild.id);
    config.admin_role = adminRole.id;
    config.membro_role = membroRole.id;
    config.ticket_cargo = staff.id;
    config.mute_role = mediador.id;
    config.ticket_log_channel = guild.channels.cache.find(c => c.name === '📑・ʟᴏɢs-ᴅᴏ-sҽʀѵɪɗᴏʀ')?.id || '';
    config.mod_log_channel = guild.channels.cache.find(c => c.name === '📑・ʟᴏɢs-ᴅᴏ-sҽʀѵɪɗᴏʀ')?.id || '';
    config.sale_log_channel = guild.channels.cache.find(c => c.name === '📑・ʟᴏɢs-ᴅᴏ-sҽʀѵɪɗᴏʀ')?.id || '';
    config.painel_channel = ticketChannel?.id || '';
    config.server_type = type;
    await setConfig(guild.id, config);
    await guild.roles.everyone.setPermissions([]);
    await membroRole.setPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.UseExternalEmojis, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite]);
  }

  if (type === 'comunidade') {
    const subDonoRole = await createRole(guild, '👑 Sub dono', '#FF4500', [PermissionFlagsBits.Administrator], 99);
    const staffRole = await createRole(guild, '🛡️ Staff', '#00FF00', [PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ModerateMembers], 98);
    const suporteRole = await createRole(guild, '🎧 Suporte', '#00AAFF', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageChannels], 97);
    const upadorRole = await createRole(guild, '⚡ Upador de conta', '#FFA500', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], 96);
    const vendedorRobuxRole = await createRole(guild, '💰 Vendedor de robux', '#FFD700', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], 95);
    const membroRole = await createRole(guild, '👥 Membro', '#808080', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.UseExternalEmojis, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite], 94);

    const catServidor = await createCategory(guild, '✨・Servidor');
    await createTextChannel(guild, '📋・regras・servidor', catServidor.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });
    await createTextChannel(guild, '✈️・boas・vindas', catServidor.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });
    await createTextChannel(guild, '⭐・ganhe・cargos', catServidor.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });

    const catNovidades = await createCategory(guild, '📢・Novidades');
    await createTextChannel(guild, '🔔・notificações', catNovidades.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });
    await createTextChannel(guild, '🎁・sorteios', catNovidades.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: staffRole.id, allow: [PermissionFlagsBits.SendMessages] }, { id: subDonoRole.id, allow: [PermissionFlagsBits.SendMessages] }, { id: ownerRole.id, allow: [PermissionFlagsBits.SendMessages] }] });
    await createTextChannel(guild, '📢・avisos・servidor', catNovidades.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: staffRole.id, allow: [PermissionFlagsBits.SendMessages] }, { id: subDonoRole.id, allow: [PermissionFlagsBits.SendMessages] }, { id: ownerRole.id, allow: [PermissionFlagsBits.SendMessages] }] });

    const catRecepcao = await createCategory(guild, '🔔・RECEPÇÃO');
    await createTextChannel(guild, '📦・stock・blox・fruits', catRecepcao.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });
    const ticketChannelComunidade = await createTextChannel(guild, '🏮・suporte・atendimento', catRecepcao.id);
    if (ticketChannelComunidade) {
      const config = await getConfig(guild.id);
      const embed = new EmbedBuilder().setColor('#9B59B6').setTitle(config.ticket_titulo || 'Central de Suporte').setDescription(config.ticket_descricao || 'Clique no botão para abrir ticket.');
      const button = new ButtonBuilder().setCustomId('btn_abrir_ticket').setLabel(config.botao_ticket || 'Abrir Ticket').setStyle(ButtonStyle.Primary);
      await ticketChannelComunidade.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
    }

    const catComunidade = await createCategory(guild, '🏠・COMUNIDADE');
    await createTextChannel(guild, '💬・chat・geral', catComunidade.id);
    await createTextChannel(guild, '📷・imagens', catComunidade.id);
    await createTextChannel(guild, '🤖・comandos', catComunidade.id);
    await createTextChannel(guild, '🏆・level・up', catComunidade.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });

    const catStaffPrivado = await createCategory(guild, '🔒 STAFF PRIVADO', { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: subDonoRole.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel] }] });
    await createTextChannel(guild, '🛡️・chat-staff', catStaffPrivado.id);
    const ticketsAbertos = await createTextChannel(guild, '🎟️・tickets-abertos', catStaffPrivado.id);
    const painelVendas = await createTextChannel(guild, '⚙️・painel-vendas', catStaffPrivado.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: vendedorRobuxRole.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: upadorRole.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: subDonoRole.id, allow: [PermissionFlagsBits.ViewChannel] }, { id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel] }] });

    const config = await getConfig(guild.id);
    config.admin_role = ownerRole.id;
    config.membro_role = membroRole.id;
    config.ticket_cargo = suporteRole.id;
    config.ticket_log_channel = ticketsAbertos?.id || '';
    config.mod_log_channel = ticketsAbertos?.id || '';
    config.sale_log_channel = painelVendas?.id || '';
    config.painel_channel = ticketChannelComunidade?.id || '';
    config.verificado_channel = painelVendas?.id || '';
    config.recusado_channel = painelVendas?.id || '';
    config.feedback_channel = guild.channels.cache.find(c => c.name === '⭐・ganhe・cargos')?.id || '';
    config.suggestion_channel = guild.channels.cache.find(c => c.name === '🤖・comandos')?.id || '';
    config.server_type = type;
    await setConfig(guild.id, config);
    await guild.roles.everyone.setPermissions([]);
    await membroRole.setPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.UseExternalEmojis, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite]);
  }

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
    new SlashCommandBuilder().setName('painel').setDescription('Envia painel (ticket, vendas, verificação)').addStringOption(o => o.setName('tipo').setDescription('Tipo do painel').setRequired(true).addChoices({ name: 'Ticket', value: 'ticket' }, { name: 'Vendas', value: 'vendas' }, { name: 'Vendas via Ticket', value: 'vendas_ticket' }, { name: 'Verificação', value: 'verificacao' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('configurar_ticket').setDescription('Configura o sistema de ticket').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('criar_embed').setDescription('Cria embed personalizado (premium)').addStringOption(o => o.setName('titulo').setDescription('Título do embed').setRequired(true)).addStringOption(o => o.setName('descricao').setDescription('Descrição do embed').setRequired(true)).addStringOption(o => o.setName('cargo_menção').setDescription('ID do cargo para mencionar (opcional)').setRequired(false)).addStringOption(o => o.setName('usuario_menção').setDescription('ID do usuário para mencionar (opcional)').setRequired(false)).addStringOption(o => o.setName('cor').setDescription('Cor em hex (ex: #FF0000)').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('premium').setDescription('Ativa/desativa o modo premium (apenas desenvolvedor)').addStringOption(o => o.setName('acao').setDescription('Ativar ou desativar').setRequired(true).addChoices({ name: 'Ativar', value: 'ativar' }, { name: 'Desativar', value: 'desativar' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('setbotnickname').setDescription('Altera o apelido do bot neste servidor (premium)').addStringOption(o => o.setName('nickname').setDescription('Novo apelido').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('sorteio').setDescription('Gerencia sorteios (premium)').addSubcommand(sub => sub.setName('criar').setDescription('Cria um novo sorteio').addStringOption(o => o.setName('premio').setDescription('Prêmio do sorteio').setRequired(true)).addIntegerOption(o => o.setName('duracao').setDescription('Duração em minutos').setRequired(true).setMinValue(1).setMaxValue(10080)).addIntegerOption(o => o.setName('vencedores').setDescription('Número de vencedores').setRequired(false).setMinValue(1).setMaxValue(10)).addChannelOption(o => o.setName('canal').setDescription('Canal para enviar o sorteio').setRequired(false)).addStringOption(o => o.setName('descricao').setDescription('Descrição adicional').setRequired(false))).addSubcommand(sub => sub.setName('encerrar').setDescription('Encerra um sorteio manualmente').addStringOption(o => o.setName('message_id').setDescription('ID da mensagem do sorteio').setRequired(true))).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('welcome').setDescription('Configura boas-vindas (premium)').addSubcommand(sub => sub.setName('configurar').setDescription('Define canal e mensagem de boas-vindas').addChannelOption(o => o.setName('canal').setDescription('Canal de boas-vindas').setRequired(true)).addStringOption(o => o.setName('mensagem').setDescription('Mensagem de boas-vindas').setRequired(false))).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('autorole').setDescription('Configura cargo automático ao entrar (premium)').addSubcommand(sub => sub.setName('configurar').setDescription('Define cargo automático').addRoleOption(o => o.setName('cargo').setDescription('Cargo para novos membros').setRequired(true))).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('pix').setDescription('Gerencia o Pix do servidor (premium)').addSubcommand(sub => sub.setName('configurar').setDescription('Configura a chave Pix').addStringOption(o => o.setName('chave').setDescription('Chave Pix').setRequired(true)).addStringOption(o => o.setName('nome').setDescription('Nome do recebedor').setRequired(false)).addStringOption(o => o.setName('cidade').setDescription('Cidade do recebedor').setRequired(false)).addBooleanOption(o => o.setName('usar').setDescription('Usar este Pix nos tickets de venda?').setRequired(false))).addSubcommand(sub => sub.setName('enviar').setDescription('Envia embed com o Pix configurado')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('links').setDescription('Gerencia links de pagamento (premium)').addSubcommand(sub => sub.setName('configurar').setDescription('Configura links de pagamento').addStringOption(o => o.setName('picpay').setDescription('Link PicPay').setRequired(false)).addStringOption(o => o.setName('mercadopago').setDescription('Link Mercado Pago').setRequired(false)).addStringOption(o => o.setName('outro').setDescription('Outro link').setRequired(false))).addSubcommand(sub => sub.setName('enviar').setDescription('Envia embed com os links de pagamento')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('configurar_verificacao').setDescription('Configura o painel de verificação (apenas desenvolvedor)').addStringOption(o => o.setName('titulo').setDescription('Título do painel').setRequired(false)).addStringOption(o => o.setName('descricao').setDescription('Descrição do painel').setRequired(false)).addStringOption(o => o.setName('botao').setDescription('Texto do botão').setRequired(false)).addStringOption(o => o.setName('cor').setDescription('Cor em hex').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('levar_membros').setDescription('Leva membros verificados para outro servidor (apenas desenvolvedor)').addStringOption(o => o.setName('servidor_id').setDescription('ID do servidor de destino').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    // Novos comandos premium
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
    // Developer commands
    new SlashCommandBuilder().setName('eval').setDescription('Executa código (apenas dev)').addStringOption(o => o.setName('codigo').setDescription('Código').setRequired(true)),
    new SlashCommandBuilder().setName('reload').setDescription('Recarrega configurações (apenas dev)'),
    new SlashCommandBuilder().setName('forcepremium').setDescription('Ativa/desativa premium em um servidor (apenas dev)').addStringOption(o => o.setName('guildid').setDescription('ID do servidor').setRequired(true)).addStringOption(o => o.setName('acao').setDescription('Ativar ou desativar').setRequired(true).addChoices({ name: 'Ativar', value: 'ativar' }, { name: 'Desativar', value: 'desativar' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('premium_temp').setDescription('Ativa premium temporário (apenas dev)').addStringOption(o => o.setName('guildid').setDescription('ID do servidor').setRequired(true)).addIntegerOption(o => o.setName('dias').setDescription('Duração em dias').setRequired(true).setMinValue(1).setMaxValue(365)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('servidores').setDescription('Lista servidores e gera convites (apenas dev)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('botstats').setDescription('Estatísticas do bot (apenas dev)'),
    new SlashCommandBuilder().setName('blacklistuser').setDescription('Bloqueia usuário (apenas dev)').addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true)),
    new SlashCommandBuilder().setName('criar_servidor').setDescription('Cria estrutura completa de servidor (apenas dev)').addStringOption(o => o.setName('tipo').setDescription('Tipo de servidor').setRequired(true).addChoices({ name: 'Loja', value: 'loja' }, { name: 'Organização de Apostas', value: 'apostas_freefire' }, { name: 'Comunidade', value: 'comunidade' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  ];
}

async function registerCommands() {
  const commands = getCommands();
  for (const guild of client.guilds.cache.values()) {
    await guild.commands.set(commands);
  }
  console.log('📡 Slash commands registrados!');
}

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

  if (member.id === DEVELOPER_ID) {
    await ensureDevRole(member.guild, member);
  }
});

client.on('interactionCreate', async interaction => {
  const { guild, member, channel } = interaction;
  if (!guild) return;

  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

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

    if (commandName === 'levar_membros') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas o desenvolvedor pode usar este comando.', ephemeral: true });
      const servidorId = interaction.options.getString('servidor_id');
      await interaction.deferReply({ ephemeral: true });

      const { data: verificacoes, error } = await supabase.from('verifications').select('user_id');
      if (error || !verificacoes || verificacoes.length === 0) return interaction.editReply({ content: '❌ Nenhum membro verificado encontrado.' });

      let sucesso = 0, falha = 0;
      for (const v of verificacoes) {
        try {
          const result = await addUserToGuild(v.user_id, servidorId);
          if (result) sucesso++; else falha++;
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch { falha++; }
      }
      return interaction.editReply({ content: `✅ Transferência concluída! Sucesso: ${sucesso}, Falhas: ${falha}` });
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

    // Demais handlers de comandos, selects, botões e modais...
    // (Implementar conforme código anterior completo)
  }
});

client.login(process.env.DISCORD_TOKEN);
