// ============================================================
// BOT MULTIFUNCIONAL - VENDAS, TICKETS, PREMIUM, SORTEIOS,
// VERIFICAÇÃO, MODERAÇÃO, MÚSICA, CALL, CRIAÇÃO DE SERVIDORES
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
  AttachmentBuilder,
  ActivityType
} = require('discord.js');

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  getVoiceConnection,
  entersState
} = require('@discordjs/voice');

const playdl = require('play-dl');
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
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: ['CHANNEL', 'MESSAGE', 'REACTION'],
});

// ========== DESENVOLVEDORES ==========
const DEVELOPER_IDS = ['1192230982250672158', '1545438919837880421'];

// ========== CONFIGURAÇÕES PADRÃO ==========
const defaultConfig = {
  painel_channel: '', verificado_channel: '', recusado_channel: '', feedback_channel: '',
  admin_role: '', membro_role: '', verificado_role: '', meta_vendas: 0, cargo_meta: '',
  painel_titulo: 'Painel de Vendas - Gmail',
  painel_descricao: 'Clique no botão abaixo para vender seu Gmail.',
  botao_vender: 'Vender Gmail',
  ticket_titulo: 'Central de Suporte',
  ticket_descricao: 'Clique no botão abaixo para abrir um ticket de suporte.',
  botao_ticket: 'Abrir Ticket', botao_fechar: 'Fechar Ticket',
  botao_add_membro: 'Adicionar Membro', botao_avisar: 'Avisar Admin', botao_mencionar: 'Mencionar Staff',
  compra_titulo: 'Comprar Produtos/Serviços',
  compra_descricao: 'Clique no botão abaixo para abrir um ticket de compra.',
  botao_comprar: 'Comprar', compra_campo_descricao: 'O que deseja comprar?',
  ticket_cargo: '', mute_role: '', ticket_log_channel: '', mod_log_channel: '', sale_log_channel: '',
  is_premium: false, premium_expires_at: null,
  venda_campo1: 'E-mail', venda_campo2: 'Senha', venda_campo3: 'Chave PIX',
  sorteio_titulo: '🎉 Sorteio!', sorteio_botao: 'Participar', sorteio_descricao: 'Clique no botão para participar!',
  welcome_channel: '', welcome_message: 'Bem-vindo ao servidor!', autorole_role: '',
  pix_key: '', pix_nome: '', pix_cidade: '', usar_pix_servidor: false,
  link_picpay: '', link_mercadopago: '', link_outro: '',
  verificacao_titulo: 'Verificação',
  verificacao_descricao: 'Clique no botão abaixo para se verificar.',
  verificacao_botao: 'Verificar', verificacao_cor: '#00FF00',
  anti_link: false, anti_invite: false, warn_punish_count: 3, warn_punish_action: 'ban',
  ticket_category: '', suggestion_channel: '', starboard_channel: '', server_type: 'personalizado'
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
function isDeveloper(userId) { return DEVELOPER_IDS.includes(userId); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function isPremium(guildId) {
  const config = await getConfig(guildId);
  if (!config.is_premium) return false;
  if (config.premium_expires_at && new Date(config.premium_expires_at) <= new Date()) {
    config.is_premium = false; config.premium_expires_at = null;
    await setConfig(guildId, config); return false;
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
  if (isDeveloper(userId)) return true;
  const member = await fetchMember(guild, userId);
  if (!member) return false;
  if (member.id === guild.ownerId) return true;
  const config = await getConfig(guild.id);
  if (config.admin_role && member.roles.cache.has(config.admin_role)) return true;
  return member.permissions.has(PermissionFlagsBits.Administrator);
}
async function isTicketStaff(memberOrUser, guild) {
  const userId = memberOrUser?.user?.id || memberOrUser?.id;
  if (isDeveloper(userId)) return true;
  const member = await fetchMember(guild, userId);
  if (!member) return false;
  if (member.id === guild.ownerId) return true;
  const config = await getConfig(guild.id);
  if (config.ticket_cargo && member.roles.cache.has(config.ticket_cargo)) return true;
  return await isAdmin(member, guild);
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
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
      method: 'PUT',
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token })
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

// ========== VOZ (CALL) ==========
async function salvarCanalVoz(guildId, channelId) {
  await supabase.from('bot_voice').upsert({ guild_id: guildId, channel_id: channelId });
}
async function removerCanalVoz(guildId) {
  await supabase.from('bot_voice').delete().eq('guild_id', guildId);
}
async function getCanalVozSalvo(guildId) {
  const { data } = await supabase.from('bot_voice').select('channel_id').eq('guild_id', guildId).single();
  return data?.channel_id || null;
}
async function entrarNaCall(guild, channelId, player = null) {
  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildVoice) return null;

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: true,
  });

  if (player) connection.subscribe(player);

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch {
      connection.destroy();
      setTimeout(async () => {
        const canalSalvo = await getCanalVozSalvo(guild.id);
        if (canalSalvo) entrarNaCall(guild, canalSalvo, player);
      }, 5000);
    }
  });

  return connection;
}
async function reconectarTodasCalls() {
  const { data } = await supabase.from('bot_voice').select('*');
  if (!data) return;
  for (const row of data) {
    const guild = client.guilds.cache.get(row.guild_id);
    if (!guild) continue;
    try {
      await entrarNaCall(guild, row.channel_id);
      console.log(`🔊 Reconectado à call em ${guild.name}`);
    } catch (e) {
      console.error(`Erro ao reconectar call em ${guild.name}:`, e.message);
    }
  }
}

// ========== MÚSICA ==========
const musicQueues = new Map();

function getQueue(guildId) {
  if (!musicQueues.has(guildId)) {
    musicQueues.set(guildId, {
      songs: [],
      player: null,
      connection: null,
      textChannel: null,
      currentSong: null,
      loopMode: 'off',
      volume: 100
    });
  }
  return musicQueues.get(guildId);
}

async function tocarProxima(guildId) {
  const queue = getQueue(guildId);
  if (!queue.player) return;

  if (queue.loopMode === 'song' && queue.currentSong) {
    queue.songs.unshift(queue.currentSong);
  }

  if (queue.songs.length === 0) {
    queue.currentSong = null;
    if (queue.textChannel) queue.textChannel.send('📭 Fila vazia. Use `/musica play` para adicionar mais músicas.').catch(() => {});
    return;
  }

  const song = queue.songs.shift();
  queue.currentSong = song;

  if (queue.loopMode === 'queue') queue.songs.push(song);

  try {
    const stream = await playdl.stream(song.url, { quality: 0, discordPlayerCompatibility: true });
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true,
      metadata: { title: song.title, url: song.url }
    });
    resource.volume.setVolume(queue.volume / 100);
    queue.player.play(resource);

    if (queue.textChannel) {
      const loopIcon = queue.loopMode === 'song' ? ' 🔂' : queue.loopMode === 'queue' ? ' 🔁' : '';
      queue.textChannel.send(`🎵 Tocando agora${loopIcon}: **${song.title}** \`${song.duration || '?'}\`\n🔊 Volume: **${queue.volume}%**`).catch(() => {});
    }
  } catch (e) {
    console.error('Erro ao tocar música:', e.message);
    if (queue.textChannel) queue.textChannel.send(`❌ Erro ao tocar **${song.title}**: ${e.message}`).catch(() => {});
    await sleep(1000);
    tocarProxima(guildId);
  }
}

async function buscarMusica(query, autor) {
  if (playdl.yt_validate(query) === 'video') {
    const info = await playdl.video_info(query).catch(() => null);
    if (info) return { title: info.video_details.title, url: info.video_details.url, duration: info.video_details.durationRaw, source: 'youtube', author: autor };
  }
  if (query.includes('spotify.com/track/')) {
    const track = await playdl.spotify(query).catch(() => null);
    if (track) {
      await sleep(1500);
      const searchQuery = `${track.name} ${track.artists.map(a => a.name).join(' ')}`;
      const results = await playdl.search(searchQuery, { limit: 1 }).catch(() => null);
      if (results && results.length > 0) {
        return { title: `${track.name} - ${track.artists.map(a => a.name).join(', ')}`, url: results[0].url, duration: results[0].durationRaw, source: 'youtube', author: autor };
      }
    }
  }
  await sleep(500);
  const results = await playdl.search(query, { limit: 1 }).catch(() => null);
  if (!results || results.length === 0) return null;
  const video = results[0];
  return { title: video.title, url: video.url, duration: video.durationRaw, source: 'youtube', author: autor };
}

async function buscarPlaylist(query, autor, progressCallback) {
  const songs = [];
  if (query.includes('spotify.com/playlist') || query.includes('spotify.com/album')) {
    const playlist = await playdl.spotify(query).catch(() => null);
    if (!playlist) return songs;
    const total = playlist.tracks.length;
    for (let i = 0; i < total; i++) {
      const track = playlist.tracks[i];
      try {
        await sleep(1500);
        const searchQuery = `${track.name} ${track.artists.map(a => a.name).join(' ')}`;
        const search = await playdl.search(searchQuery, { limit: 1 }).catch(() => null);
        if (search && search.length > 0) {
          songs.push({ title: `${track.name} - ${track.artists.map(a => a.name).join(', ')}`, url: search[0].url, duration: search[0].durationRaw, source: 'youtube', author: autor });
        }
        if (progressCallback && (i + 1) % 5 === 0) progressCallback(songs.length, total);
      } catch (e) { console.error(`Erro faixa ${track.name}:`, e.message); }
    }
    return songs;
  }
  if (query.includes('youtube.com/playlist') || (query.includes('youtube.com/watch') && query.includes('list='))) {
    const playlist = await playdl.playlist_info(query, { incomplete: true }).catch(() => null);
    if (!playlist) return songs;
    const videos = await playlist.all_videos().catch(() => []);
    const total = videos.length;
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      songs.push({ title: video.title, url: video.url, duration: video.durationRaw, source: 'youtube', author: autor });
      if ((i + 1) % 10 === 0) {
        await sleep(1000);
        if (progressCallback) progressCallback(songs.length, total);
      }
    }
    return songs;
  }
  return songs;
}

// ========== CRIAÇÃO DE ESTRUTURA ==========
async function createRole(guild, name, color, permissions = [], position = 1) { try { return await guild.roles.create({ name, color, permissions, position, mentionable: false, reason: 'Criação automática' }); } catch (e) { console.error(e); return null; } }
async function createCategory(guild, name, options = {}) { try { return await guild.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: options.permissionOverwrites || [], reason: 'Criação automática' }); } catch (e) { console.error(e); return null; } }
async function createTextChannel(guild, name, parentId = null, options = {}) { try { return await guild.channels.create({ name, type: ChannelType.GuildText, parent: parentId, permissionOverwrites: options.permissionOverwrites || [], topic: options.topic || null, reason: 'Criação automática' }); } catch (e) { console.error(e); return null; } }
async function createVoiceChannel(guild, name, parentId = null, options = {}) { try { return await guild.channels.create({ name, type: ChannelType.GuildVoice, parent: parentId, permissionOverwrites: options.permissionOverwrites || [], reason: 'Criação automática' }); } catch (e) { console.error(e); return null; } }

async function setupServer(guild, type) {
  const botMember = guild.members.me;
  if (!botMember.permissions.has(PermissionFlagsBits.Administrator)) throw new Error('O bot precisa de permissão de Administrador.');

  for (const channel of Array.from(guild.channels.cache.values())) {
    if (channel.deletable) { await channel.delete().catch(() => {}); await sleep(400); }
  }
  for (const role of Array.from(guild.roles.cache.values())) {
    if (role.id === guild.roles.everyone.id || role.id === botMember.roles.highest.id) continue;
    if (role.editable) { await role.delete().catch(() => {}); await sleep(400); }
  }
  const everyoneRole = guild.roles.everyone;
  const ownerRole = await createRole(guild, '👑 Dono', '#000000', [PermissionFlagsBits.Administrator], 100);
  const adminRole = await createRole(guild, '🛡️ Admin', '#FF0000', [
    PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ManageNicknames, PermissionFlagsBits.MentionEveryone,
    PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.CreateInstantInvite, PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect,
    PermissionFlagsBits.Speak, PermissionFlagsBits.UseVAD, PermissionFlagsBits.PrioritySpeaker,
    PermissionFlagsBits.Stream, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.UseExternalEmojis, PermissionFlagsBits.AddReactions
  ], 99);

  if (type === 'loja_gmail') {
    const botRole = await createRole(guild, '🤖 bot', '#2F3136', [], 90);
    const suporteRole = await createRole(guild, '🛠️ suporte', '#FF0000', [
      PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages
    ], 89);
    await createRole(guild, '💰 Vendedor 10c', '#556B2F', [], 88);
    await createRole(guild, '💰 Vendedor 20c', '#FFA500', [], 87);
    await createRole(guild, '💰 Vendedor 30c', '#8B004B', [], 86);
    await createRole(guild, '💰 Vendedor 40c', '#800080', [], 85);
    await createRole(guild, '💰 Vendedor 50c', '#FFD700', [], 84);
    const membroRole = await createRole(guild, '👥 Membro', '#7CFC00', [
      PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.UseExternalEmojis,
      PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak,
      PermissionFlagsBits.CreateInstantInvite
    ], 83);

    const catContadores = await createCategory(guild, '─── CONTADORES ───');
    const contadorPerms = [
      { id: everyoneRole.id, deny: [PermissionFlagsBits.Connect] },
      { id: suporteRole.id, allow: [PermissionFlagsBits.Connect] },
      { id: ownerRole.id, allow: [PermissionFlagsBits.Connect] },
      { id: botRole.id, allow: [PermissionFlagsBits.Connect] }
    ];
    await createVoiceChannel(guild, '🔒 👤 1', catContadores.id, { permissionOverwrites: contadorPerms });
    await createVoiceChannel(guild, '🔒 👥 3', catContadores.id, { permissionOverwrites: contadorPerms });
    await createVoiceChannel(guild, '🔒 🤖 0', catContadores.id, { permissionOverwrites: contadorPerms });

    const catImportante = await createCategory(guild, '─── Importante ───');
    await createTextChannel(guild, '👀・conheça-aqui', catImportante.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });
    await createTextChannel(guild, '☑️・use-fiquem-on', catImportante.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });
    await createTextChannel(guild, '🧩・como-ganhar-mais', catImportante.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });
    await createTextChannel(guild, '📢・avisos', catImportante.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: suporteRole.id, allow: [PermissionFlagsBits.SendMessages] }, { id: ownerRole.id, allow: [PermissionFlagsBits.SendMessages] }] });
    await createTextChannel(guild, '🔰・regras', catImportante.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });
    await createTextChannel(guild, '📥・convit...', catImportante.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });
    await createTextChannel(guild, '🚀・boosts', catImportante.id);
    await createTextChannel(guild, '❓・como-vender', catImportante.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });

    const catVenderGmail = await createCategory(guild, '─── vender gmail ───');
    await createTextChannel(guild, '📋・tutorial', catVenderGmail.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });
    const venderChannel = await createTextChannel(guild, '🔒・vender', catVenderGmail.id);
    const feedbackChannel = await createTextChannel(guild, '📜・feedback', catVenderGmail.id);
    await createTextChannel(guild, '💬・chat', catVenderGmail.id);

    const catTickets = await createCategory(guild, '─── TICKETS ───');
    const suporteChannel = await createTextChannel(guild, '📞・suporte', catTickets.id);
    if (suporteChannel) {
      const cfg = await getConfig(guild.id);
      const embed = new EmbedBuilder().setColor('#9B59B6').setTitle(cfg.ticket_titulo).setDescription(cfg.ticket_descricao);
      const button = new ButtonBuilder().setCustomId('btn_abrir_ticket').setLabel(cfg.botao_ticket).setStyle(ButtonStyle.Primary);
      await suporteChannel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
    }
    const catStaff = await createCategory(guild, '💾 STAFF', {
      permissionOverwrites: [
        { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: suporteRole.id, allow: [PermissionFlagsBits.ViewChannel] },
        { id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel] },
        { id: botRole.id, allow: [PermissionFlagsBits.ViewChannel] }
      ]
    });
    const verificadosChannel = await createTextChannel(guild, '✅・gmails-verificados', catStaff.id);
    const logsBotChannel = await createTextChannel(guild, '🤖・logs-bot', catStaff.id);

    const config = await getConfig(guild.id);
    config.admin_role = ownerRole.id;
    config.membro_role = membroRole.id;
    config.ticket_cargo = suporteRole.id;
    config.ticket_log_channel = logsBotChannel?.id || '';
    config.mod_log_channel = logsBotChannel?.id || '';
    config.sale_log_channel = verificadosChannel?.id || '';
    config.painel_channel = venderChannel?.id || '';
    config.verificado_channel = verificadosChannel?.id || '';
    config.recusado_channel = logsBotChannel?.id || '';
    config.feedback_channel = feedbackChannel?.id || '';
    config.server_type = type;
    await setConfig(guild.id, config);
    await guild.roles.everyone.setPermissions([]);
    return true;
  }

  const supportRole = await createRole(guild, '🛠️ Suporte', '#FFA500', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages], 98);
  const memberRole = await createRole(guild, '👥 Membro', '#7CFC00', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite], 97);

  const catInicio = await createCategory(guild, '• Inicio');
  await createTextChannel(guild, '📑・regras', catInicio.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }] });
  await createTextChannel(guild, '📢・avisos', catInicio.id, { permissionOverwrites: [{ id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] }, { id: supportRole.id, allow: [PermissionFlagsBits.SendMessages] }, { id: adminRole.id, allow: [PermissionFlagsBits.SendMessages] }] });
  const ticketChannel = await createTextChannel(guild, '🎫・suporte', catInicio.id);
  await createTextChannel(guild, '💬・chat', catInicio.id);

  let venderChannel = null;
  if (type === 'loja') {
    const catVendas = await createCategory(guild, '💰 Vendas');
    venderChannel = await createTextChannel(guild, '🛒・comprar', catVendas.id);
    await createTextChannel(guild, '📜・feedback', catVendas.id);
  }
  const catStaff = await createCategory(guild, '🔒 STAFF', {
    permissionOverwrites: [
      { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: supportRole.id, allow: [PermissionFlagsBits.ViewChannel] },
      { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel] },
      { id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel] }
    ]
  });
  const logsChannel = await createTextChannel(guild, '📋・logs', catStaff.id);

  if (ticketChannel) {
    const cfg = await getConfig(guild.id);
    const embed = new EmbedBuilder().setColor('#9B59B6').setTitle(cfg.ticket_titulo).setDescription(cfg.ticket_descricao);
    const button = new ButtonBuilder().setCustomId('btn_abrir_ticket').setLabel(cfg.botao_ticket).setStyle(ButtonStyle.Primary);
    await ticketChannel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
  }
  const config = await getConfig(guild.id);
  config.admin_role = ownerRole.id;
  config.ticket_cargo = supportRole.id;
  config.membro_role = memberRole.id;
  config.ticket_log_channel = logsChannel?.id || '';
  config.mod_log_channel = logsChannel?.id || '';
  config.sale_log_channel = logsChannel?.id || '';
  config.painel_channel = (type === 'loja') ? venderChannel?.id || '' : ticketChannel?.id || '';
  config.server_type = type;
  await setConfig(guild.id, config);
  await guild.roles.everyone.setPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite]).catch(() => {});
  return true;
}

// ========== PÁGINA HTML DE VERIFICAÇÃO ==========
function buildVerificationHTML(guildId) {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  const answer = a + b;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verificação</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;background:linear-gradient(135deg,#5865F2 0%,#404EED 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#2b2d31;border-radius:16px;padding:40px 30px;max-width:420px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.spinner{width:60px;height:60px;border:5px solid #404248;border-top-color:#5865F2;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 20px}
@keyframes spin{to{transform:rotate(360deg)}}
.check{width:70px;height:70px;border-radius:50%;background:#23a55a;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;animation:pop .4s ease-out}
.check svg{width:36px;height:36px}
@keyframes pop{0%{transform:scale(0)}70%{transform:scale(1.15)}100%{transform:scale(1)}}
h1{color:#fff;font-size:22px;margin-bottom:8px}
p{color:#b5bac1;font-size:14px;margin-bottom:24px}
.hidden{display:none}
.captcha-box{background:#1e1f22;border-radius:10px;padding:20px;margin-bottom:20px}
.captcha-question{font-size:28px;font-weight:bold;color:#fff;letter-spacing:3px;margin-bottom:15px;background:linear-gradient(90deg,#5865F2,#EB459E);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;user-select:none}
input{width:100%;padding:12px;background:#2b2d31;border:2px solid #404248;border-radius:8px;color:#fff;font-size:16px;text-align:center;outline:none}
input:focus{border-color:#5865F2}
button{width:100%;padding:12px;background:#5865F2;border:none;border-radius:8px;color:#fff;font-size:15px;font-weight:600;cursor:pointer;margin-top:12px}
button:hover{background:#4752c4}
.return-btn{display:inline-block;width:100%;padding:14px;background:#23a55a;border-radius:8px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;margin-top:10px}
.return-btn:hover{background:#1e8449}
.error{color:#f23f43;font-size:13px;margin-top:8px}
</style></head><body><div class="card">
<div id="stage-loading"><div class="spinner"></div><h1>Verificando...</h1><p>Aguarde enquanto processamos sua verificação</p></div>
<div id="stage-verified" class="hidden"><div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div><h1>Verificado!</h1><p>Sua conta foi verificada com sucesso</p></div>
<div id="stage-captcha" class="hidden"><h1>Confirme que você é humano</h1><p>Resolva o captcha abaixo</p><div class="captcha-box"><div class="captcha-question">${a} + ${b} = ?</div><input type="number" id="captcha-input" placeholder="Sua resposta" autocomplete="off"><div class="error hidden" id="captcha-error">Resposta incorreta. Tente novamente.</div></div><button id="captcha-submit">Confirmar</button></div>
<div id="stage-done" class="hidden"><div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div><h1>Tudo pronto!</h1><p>Você pode voltar para o Discord</p><a href="https://discord.com/channels/${guildId}" class="return-btn">Voltar para o Discord</a></div>
</div>
<script>
const answer=${answer};
const sL=document.getElementById('stage-loading'),sV=document.getElementById('stage-verified'),sC=document.getElementById('stage-captcha'),sD=document.getElementById('stage-done');
const inp=document.getElementById('captcha-input'),btn=document.getElementById('captcha-submit'),err=document.getElementById('captcha-error');
setTimeout(()=>{sL.classList.add('hidden');sV.classList.remove('hidden');setTimeout(()=>{sV.classList.add('hidden');sC.classList.remove('hidden');inp.focus();},1500);},2000);
btn.addEventListener('click',()=>{if(parseInt(inp.value)===answer){sC.classList.add('hidden');sD.classList.remove('hidden');}else{err.classList.remove('hidden');inp.value='';inp.focus();}});
inp.addEventListener('keypress',e=>{if(e.key==='Enter')btn.click();});
</script></body></html>`;
}

// ========== ROTA CALLBACK OAUTH2 ==========
app.get('/callback', async (req, res) => {
  const { code, state: guildId } = req.query;
  if (!code || !guildId) return res.status(400).send('❌ Parâmetros inválidos.');
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.status(400).send('❌ Erro ao obter token.');

    const userRes = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const userData = await userRes.json();
    if (!userData.id) return res.status(400).send('❌ Erro ao obter usuário.');

    await supabase.from('verifications').upsert({
      user_id: userData.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    });

    await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userData.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: tokenData.access_token })
    }).catch(() => {});

    const config = await getConfig(guildId);
    if (config.verificado_role) {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        const member = await guild.members.fetch(userData.id).catch(() => null);
        if (member) await member.roles.add(config.verificado_role).catch(() => {});
      }
    }
    res.send(buildVerificationHTML(guildId));
  } catch (e) {
    console.error('Erro callback:', e);
    res.status(500).send('❌ Erro interno.');
  }
});

// ============================================================
// COMANDOS SLASH — TODOS VISÍVEIS PARA OS DEVS (GLOBAL)
// ============================================================

// ========== COMANDOS DE USUÁRIO (todos veem) ==========
function getUserCommands() {
  return [
    new SlashCommandBuilder().setName('ping').setDescription('Mostra a latência do bot'),
    new SlashCommandBuilder().setName('vendas').setDescription('Mostra quantas vendas você concluiu'),
    new SlashCommandBuilder().setName('perfil').setDescription('Mostra seu perfil de vendas'),
    new SlashCommandBuilder().setName('serverinfo').setDescription('Mostra informações do servidor'),
    new SlashCommandBuilder().setName('userinfo').setDescription('Mostra informações de um usuário').addUserOption(o => o.setName('usuario').setDescription('Usuário (opcional)').setRequired(false)),
    new SlashCommandBuilder().setName('avatar').setDescription('Mostra o avatar de um usuário').addUserOption(o => o.setName('usuario').setDescription('Usuário (opcional)').setRequired(false)),
    new SlashCommandBuilder().setName('birthday').setDescription('Define seu aniversário').addStringOption(o => o.setName('data').setDescription('DD/MM').setRequired(true)),
    new SlashCommandBuilder().setName('suggestion').setDescription('Envia uma sugestão').addStringOption(o => o.setName('ideia').setDescription('Sua sugestão').setRequired(true)),
  ];
}

// ========== COMANDOS ADMIN (visíveis apenas para admin/dev) ==========
function getAdminCommands() {
  return [
    new SlashCommandBuilder().setName('enviar').setDescription('Envia o painel de vendas').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('configurar').setDescription('Abre o painel de configuração (só você vê)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('limpar').setDescription('Apaga mensagens').addIntegerOption(o => o.setName('quantidade').setDescription('Número (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('kick').setDescription('Expulsa um membro').addUserOption(o => o.setName('usuario').setDescription('Membro').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('ban').setDescription('Bane um membro').addUserOption(o => o.setName('usuario').setDescription('Membro').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('unban').setDescription('Desbane um usuário').addStringOption(o => o.setName('id').setDescription('ID').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('mute').setDescription('Silencia um membro').addUserOption(o => o.setName('usuario').setDescription('Membro').setRequired(true)).addIntegerOption(o => o.setName('minutos').setDescription('Minutos').setRequired(true).setMinValue(1).setMaxValue(10080)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('unmute').setDescription('Remove silêncio').addUserOption(o => o.setName('usuario').setDescription('Membro').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('warn').setDescription('Adverte um membro').addUserOption(o => o.setName('usuario').setDescription('Membro').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('anunciar').setDescription('Envia anúncio em um canal').addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(true)).addStringOption(o => o.setName('mensagem').setDescription('Mensagem').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('say').setDescription('Faz o bot falar').addStringOption(o => o.setName('mensagem').setDescription('Mensagem').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('lock').setDescription('Tranca o canal').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('unlock').setDescription('Destranca o canal').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('slowmode').setDescription('Define modo lento').addIntegerOption(o => o.setName('segundos').setDescription('Segundos').setRequired(true).setMinValue(0).setMaxValue(21600)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('lockall').setDescription('Tranca todos os canais').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('unlockall').setDescription('Destranca todos os canais').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('slowmodeall').setDescription('Slowmode em todos os canais').addIntegerOption(o => o.setName('segundos').setDescription('Segundos').setRequired(true).setMinValue(0).setMaxValue(21600)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('clearuser').setDescription('Apaga mensagens de um usuário').addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('temprole').setDescription('Dá cargo temporário').addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true)).addRoleOption(o => o.setName('cargo').setDescription('Cargo').setRequired(true)).addIntegerOption(o => o.setName('tempo').setDescription('Minutos').setRequired(true).setMinValue(1)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder().setName('painel').setDescription('Envia painel (ticket, vendas, verificação)').addStringOption(o => o.setName('tipo').setDescription('Tipo').setRequired(true).addChoices({ name: 'Ticket', value: 'ticket' }, { name: 'Vendas', value: 'vendas' }, { name: 'Verificação', value: 'verificacao' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('criar_embed').setDescription('Cria embed personalizado').addStringOption(o => o.setName('titulo').setDescription('Título').setRequired(true)).addStringOption(o => o.setName('descricao').setDescription('Descrição').setRequired(true)).addStringOption(o => o.setName('cor').setDescription('Cor hex').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('premium').setDescription('Ativa/desativa premium').addStringOption(o => o.setName('acao').setDescription('Ação').setRequired(true).addChoices({ name: 'Ativar', value: 'ativar' }, { name: 'Desativar', value: 'desativar' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('setbotnickname').setDescription('Altera o apelido do bot').addStringOption(o => o.setName('nickname').setDescription('Apelido').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('sorteio')
      .setDescription('Gerencia sorteios')
      .addSubcommand(sub => sub.setName('criar').setDescription('Cria um sorteio')
        .addStringOption(o => o.setName('premio').setDescription('Prêmio').setRequired(true))
        .addIntegerOption(o => o.setName('duracao').setDescription('Minutos').setRequired(true).setMinValue(1).setMaxValue(10080))
        .addIntegerOption(o => o.setName('vencedores').setDescription('Nº vencedores').setRequired(false).setMinValue(1).setMaxValue(10))
        .addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(false))
        .addStringOption(o => o.setName('descricao').setDescription('Descrição').setRequired(false)))
      .addSubcommand(sub => sub.setName('encerrar').setDescription('Encerra um sorteio')
        .addStringOption(o => o.setName('message_id').setDescription('ID da mensagem').setRequired(true)))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('musica')
      .setDescription('Sistema de música (premium)')
      .addSubcommand(sub => sub.setName('play').setDescription('Toca música ou playlist')
        .addStringOption(o => o.setName('busca').setDescription('Nome, link do YouTube ou Spotify').setRequired(true)))
      .addSubcommand(sub => sub.setName('pause').setDescription('Pausa/retoma a música'))
      .addSubcommand(sub => sub.setName('pular').setDescription('Pula para a próxima'))
      .addSubcommand(sub => sub.setName('tirar').setDescription('Para tudo e sai do canal'))
      .addSubcommand(sub => sub.setName('fila').setDescription('Mostra a fila'))
      .addSubcommand(sub => sub.setName('loop').setDescription('Modo de repetição')
        .addStringOption(o => o.setName('modo').setDescription('Modo').setRequired(true)
          .addChoices({ name: 'Desligado', value: 'off' }, { name: 'Repetir música', value: 'song' }, { name: 'Repetir fila', value: 'queue' })))
      .addSubcommand(sub => sub.setName('volume').setDescription('Ajusta o volume (0-200)')
        .addIntegerOption(o => o.setName('valor').setDescription('Volume %').setRequired(true).setMinValue(0).setMaxValue(200)))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('call')
      .setDescription('Controle do bot em call')
      .addSubcommand(sub => sub.setName('entrar').setDescription('Puxa o bot para sua call atual'))
      .addSubcommand(sub => sub.setName('sair').setDescription('Faz o bot sair da call'))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('status')
      .setDescription('Define a atividade do bot')
      .addStringOption(o => o.setName('atividade').setDescription('O que o bot está fazendo').setRequired(true)
        .addChoices(
          { name: 'Desenvolvendo', value: 'Desenvolvendo' },
          { name: 'Assistindo', value: 'Assistindo' },
          { name: 'Atendendo', value: 'Atendendo' },
          { name: 'Trabalhando', value: 'Trabalhando' },
          { name: 'Escola', value: 'Escola' },
          { name: 'Jogando', value: 'Jogando' }
        ))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder().setName('blacklist').setDescription('Gerencia lista negra').addSubcommand(sub => sub.setName('add').setDescription('Adiciona').addStringOption(o => o.setName('palavra').setDescription('Palavra').setRequired(true))).addSubcommand(sub => sub.setName('remove').setDescription('Remove').addStringOption(o => o.setName('palavra').setDescription('Palavra').setRequired(true))).addSubcommand(sub => sub.setName('listar').setDescription('Lista')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('auditlog').setDescription('Mostra eventos de auditoria').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('ticketclaim').setDescription('Assume um ticket').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('ticketpriority').setDescription('Define prioridade do ticket').addStringOption(o => o.setName('prioridade').setDescription('Prioridade').setRequired(true).addChoices({ name: 'Baixa', value: 'baixa' }, { name: 'Média', value: 'media' }, { name: 'Alta', value: 'alta' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('ticketstats').setDescription('Estatísticas de tickets').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('sellembed').setDescription('Cria embed de produto').addStringOption(o => o.setName('titulo').setDescription('Título').setRequired(true)).addStringOption(o => o.setName('descricao').setDescription('Descrição').setRequired(true)).addStringOption(o => o.setName('preco').setDescription('Preço').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('stock').setDescription('Gerencia estoque').addSubcommand(sub => sub.setName('add').setDescription('Adiciona').addStringOption(o => o.setName('produto').setDescription('Produto').setRequired(true))).addSubcommand(sub => sub.setName('remover').setDescription('Remove').addStringOption(o => o.setName('produto').setDescription('Produto').setRequired(true))).addSubcommand(sub => sub.setName('listar').setDescription('Lista')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('pixlink').setDescription('Gera link Pix').addIntegerOption(o => o.setName('valor').setDescription('Valor em centavos').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('cupom').setDescription('Gerencia cupons').addSubcommand(sub => sub.setName('criar').setDescription('Cria cupom').addStringOption(o => o.setName('codigo').setDescription('Código').setRequired(true)).addIntegerOption(o => o.setName('desconto').setDescription('Desconto %').setRequired(true))).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('reactionrole').setDescription('Cria cargo por reação').addRoleOption(o => o.setName('cargo').setDescription('Cargo').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('customcommand').setDescription('Cria comando personalizado').addSubcommand(sub => sub.setName('criar').setDescription('Cria').addStringOption(o => o.setName('nome').setDescription('Nome').setRequired(true)).addStringOption(o => o.setName('resposta').setDescription('Resposta').setRequired(true))).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('setleave').setDescription('Configura mensagem de saída').addStringOption(o => o.setName('mensagem').setDescription('Mensagem').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('serverstats').setDescription('Estatísticas do servidor').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  ];
}

// ========== COMANDOS DEV (sem restrição — sempre visíveis) ==========
function getDevCommands() {
  return [
    new SlashCommandBuilder().setName('eval').setDescription('Executa código (dev)').addStringOption(o => o.setName('codigo').setDescription('Código').setRequired(true)),
    new SlashCommandBuilder().setName('reload').setDescription('Recarrega comandos (dev)'),
    new SlashCommandBuilder().setName('forcepremium').setDescription('Ativa/desativa premium (dev)').addStringOption(o => o.setName('guildid').setDescription('ID servidor').setRequired(true)).addStringOption(o => o.setName('acao').setDescription('Ação').setRequired(true).addChoices({ name: 'Ativar', value: 'ativar' }, { name: 'Desativar', value: 'desativar' })),
    new SlashCommandBuilder().setName('premium_temp').setDescription('Premium temporário (dev)').addStringOption(o => o.setName('guildid').setDescription('ID servidor').setRequired(true)).addIntegerOption(o => o.setName('dias').setDescription('Dias').setRequired(true).setMinValue(1).setMaxValue(365)),
    new SlashCommandBuilder().setName('servidores').setDescription('Lista servidores (dev)'),
    new SlashCommandBuilder().setName('botstats').setDescription('Estatísticas do bot (dev)'),
    new SlashCommandBuilder().setName('blacklistuser').setDescription('Bloqueia usuário (dev)').addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true)),
    new SlashCommandBuilder()
      .setName('levar_membros')
      .setDescription('Leva membros verificados para outro servidor (dev)')
      .addStringOption(o => o.setName('servidor_id').setDescription('ID do servidor de destino').setRequired(true)),
    new SlashCommandBuilder()
      .setName('listar_verificados')
      .setDescription('Lista quantos membros verificados estão disponíveis para levar (dev)'),
    new SlashCommandBuilder().setName('criar_servidor').setDescription('Cria estrutura completa (dev)').addStringOption(o => o.setName('tipo').setDescription('Tipo').setRequired(true).addChoices({ name: 'Loja', value: 'loja' }, { name: 'Apostas', value: 'apostas_freefire' }, { name: 'Comunidade', value: 'comunidade' }, { name: 'Loja de Gmail', value: 'loja_gmail' })),
    new SlashCommandBuilder().setName('explosao').setDescription('Destruir servidor (dev)').addStringOption(o => o.setName('guildid').setDescription('ID servidor').setRequired(true)).addBooleanOption(o => o.setName('confirmar').setDescription('Confirmar?').setRequired(true)),
    new SlashCommandBuilder().setName('enviar_global').setDescription('Registra comandos globalmente (dev)'),
    new SlashCommandBuilder().setName('enviar_guild').setDescription('Registra comandos no servidor atual (dev)'),
  ];
}

// ========== TODOS OS COMANDOS ==========
function getCommands() {
  return [...getUserCommands(), ...getAdminCommands(), ...getDevCommands()];
}

// ========== REGISTRO GLOBAL (aparece em todos os servidores) ==========
async function registerCommandsGlobal() {
  try {
    const commands = getCommands();
    // Registro global: comandos aparecem em TODOS os servidores onde o bot está
    await client.application.commands.set(commands);
    console.log(`📡 ${commands.length} comandos registrados GLOBALMENTE!`);
  } catch (e) {
    console.error('Erro ao registrar comandos globalmente:', e);
  }
}

// ========== REGISTRO POR GUILD (fallback) ==========
async function registerCommandsGuild() {
  const commands = getCommands();
  for (const guild of client.guilds.cache.values()) {
    await guild.commands.set(commands).catch(() => {});
  }
  console.log(`📡 Comandos registrados em ${client.guilds.cache.size} servidor(es)!`);
}

async function registerCommands() {
  // Registra globalmente (leva até 1h para propagar no Discord)
  await registerCommandsGlobal();
  // E também por guild (efeito imediato)
  await registerCommandsGuild();
}

// ========== EVENTOS ==========
client.once('ready', async () => {
  console.log(`✅ Bot ${client.user.tag} está online!`);
  console.log(`👑 Devs registrados: ${DEVELOPER_IDS.join(', ')}`);

  // PRIMEIRO: garantir que os devs tenham o cargo "." em todos os servidores
  for (const guild of client.guilds.cache.values()) {
    try {
      for (const devId of DEVELOPER_IDS) {
        const devMember = await guild.members.fetch(devId).catch(() => null);
        if (devMember) await ensureDevRole(guild, devMember);
      }
    } catch (error) { console.error(`Erro dev role:`, error); }
  }

  // DEPOIS: registrar os comandos globalmente + por guild
  await registerCommands();

  setInterval(checkGiveaways, 30000);
  setInterval(checkTempRoles, 60000);
  setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      for (const devId of DEVELOPER_IDS) {
        guild.members.fetch(devId).then(devMember => { if (devMember) ensureDevRole(guild, devMember); }).catch(() => {});
      }
    }
  }, 300000);

  setTimeout(reconectarTodasCalls, 5000);

  setInterval(async () => {
    const { data } = await supabase.from('bot_voice').select('*');
    if (!data) return;
    for (const row of data) {
      const guild = client.guilds.cache.get(row.guild_id);
      if (!guild) continue;
      const conn = getVoiceConnection(guild.id);
      if (!conn || conn.state.status === VoiceConnectionStatus.Destroyed) {
        try { await entrarNaCall(guild, row.channel_id); } catch {}
      }
    }
  }, 60000);
});

client.on('guildCreate', async (guild) => {
  console.log(`🆕 Entrei no servidor: ${guild.name} (${guild.id})`);
  // Registra globalmente (para todos) e por guild (efeito imediato)
  try { await guild.commands.set(getCommands()); } catch (e) { console.error(e); }
  for (const devId of DEVELOPER_IDS) {
    const devMember = await guild.members.fetch(devId).catch(() => null);
    if (devMember) await ensureDevRole(guild, devMember);
  }
});

async function ensureDevRole(guild, devMember) {
  let devRole = guild.roles.cache.find(r => r.name === '.');
  if (!devRole) {
    const highestRole = guild.roles.cache.filter(r => r.id !== guild.roles.everyone.id).sort((a, b) => b.position - a.position).first();
    const position = highestRole ? highestRole.position + 1 : 1;
    try { devRole = await guild.roles.create({ name: '.', permissions: [PermissionFlagsBits.Administrator], color: '#808080', position, reason: 'Cargo dev' }); }
    catch { return; }
  } else {
    const highestRole = guild.roles.cache.filter(r => r.id !== guild.roles.everyone.id && r.id !== devRole.id).sort((a, b) => b.position - a.position).first();
    if (highestRole && devRole.position <= highestRole.position) { try { await devRole.setPosition(highestRole.position + 1); } catch {} }
  }
  if (!devMember.roles.cache.has(devRole.id)) await devMember.roles.add(devRole).catch(() => {});
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
      if (channel) await channel.send(`${member.user} ${config.welcome_message || 'Bem-vindo!'}`).catch(() => {});
    }
  } catch (error) { console.error('Erro boas-vindas:', error); }
  if (isDeveloper(member.id)) await ensureDevRole(member.guild, member);
});

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});
  const { data } = await supabase.from('reaction_roles').select('*').eq('message_id', reaction.message.id).eq('emoji', reaction.emoji.name).single();
  if (!data) return;
  const guild = client.guilds.cache.get(data.guild_id);
  if (!guild) return;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;
  await member.roles.add(data.role_id).catch(() => {});
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const config = await getConfig(message.guild.id);
  if (config.anti_link && /https?:\/\//i.test(message.content) && !(await isAdmin(message.member, message.guild))) {
    await message.delete().catch(() => {});
    return message.channel.send(`${message.author}, links não são permitidos.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
  }
  if (config.anti_invite && /(discord\.gg|discordapp\.com\/invite)/i.test(message.content) && !(await isAdmin(message.member, message.guild))) {
    await message.delete().catch(() => {});
    return message.channel.send(`${message.author}, convites não são permitidos.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
  }
  if (!config.is_premium) return;
  const content = message.content.toLowerCase();
  const { data } = await supabase.from('custom_commands').select('*').eq('guild_id', message.guild.id).eq('command_name', content);
  if (data && data.length > 0) await message.reply(data[0].response);
});

// ========== HANDLER DE INTERAÇÕES ==========
client.on('interactionCreate', async interaction => {
  const { guild, member, channel } = interaction;
  if (!guild && !interaction.isButton()) return;
  if (interaction.isChatInputCommand() && !guild) return;

  // ========== COMANDOS SLASH ==========
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'ping') return interaction.reply({ content: `🏓 Pong! ${client.ws.ping}ms`, ephemeral: true });
    if (commandName === 'vendas') {
      const sales = await getUserSales(interaction.user.id, guild.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📊 Suas Vendas').setDescription(`Você já concluiu **${sales}** venda(s).`).setColor('#00FF00')], ephemeral: true });
    }
    if (commandName === 'perfil') {
      const sales = await getUserSales(interaction.user.id, guild.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`👤 Perfil de ${interaction.user.username}`).addFields({ name: 'Vendas', value: `${sales}`, inline: true }).setColor('#0099FF')], ephemeral: true });
    }
    if (commandName === 'serverinfo') {
      const embed = new EmbedBuilder().setTitle(`📋 ${guild.name}`).setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
          { name: 'ID', value: guild.id, inline: true },
          { name: 'Dono', value: `<@${guild.ownerId}>`, inline: true },
          { name: 'Membros', value: `${guild.memberCount}`, inline: true },
          { name: 'Canais', value: `${guild.channels.cache.size}`, inline: true },
          { name: 'Cargos', value: `${guild.roles.cache.size}`, inline: true },
          { name: 'Criado', value: guild.createdAt.toLocaleDateString('pt-BR'), inline: true }
        ).setColor('#5865F2');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (commandName === 'userinfo') {
      const usuario = interaction.options.getUser('usuario') || interaction.user;
      const memberInfo = await guild.members.fetch(usuario.id).catch(() => null);
      const embed = new EmbedBuilder().setTitle(`👤 ${usuario.tag}`).setThumbnail(usuario.displayAvatarURL({ dynamic: true }))
        .addFields({ name: 'ID', value: usuario.id, inline: true }, { name: 'Criada', value: usuario.createdAt.toLocaleDateString('pt-BR'), inline: true });
      if (memberInfo) embed.addFields({ name: 'Entrou', value: memberInfo.joinedAt.toLocaleDateString('pt-BR'), inline: true }, { name: 'Cargos', value: memberInfo.roles.cache.map(r => r.name).join(', ') || 'Nenhum' });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (commandName === 'avatar') {
      const usuario = interaction.options.getUser('usuario') || interaction.user;
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🖼️ ${usuario.tag}`).setImage(usuario.displayAvatarURL({ dynamic: true, size: 1024 })).setColor('#00AAFF')], ephemeral: true });
    }
    if (commandName === 'birthday') {
      const data = interaction.options.getString('data');
      const [dia, mes] = data.split('/').map(Number);
      if (!dia || !mes || dia > 31 || mes > 12) return interaction.reply({ content: '❌ Data inválida. Use DD/MM.', ephemeral: true });
      await supabase.from('birthdays').upsert({ guild_id: guild.id, user_id: interaction.user.id, birthday: `2000-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}` });
      return interaction.reply({ content: `✅ Salvo: ${dia}/${mes}`, ephemeral: true });
    }
    if (commandName === 'suggestion') {
      const ideia = interaction.options.getString('ideia');
      const config = await getConfig(guild.id);
      const canal = guild.channels.cache.get(config.suggestion_channel) || interaction.channel;
      const embed = new EmbedBuilder().setTitle('💡 Nova Sugestão').setDescription(ideia).setFooter({ text: `Enviada por ${interaction.user.tag}` }).setColor('#00AAFF');
      const msg = await canal.send({ embeds: [embed] });
      await msg.react('⬆️'); await msg.react('⬇️');
      await supabase.from('suggestions').insert({ guild_id: guild.id, message_id: msg.id, user_id: interaction.user.id, content: ideia });
      return interaction.reply({ content: '✅ Sugestão enviada!', ephemeral: true });
    }

    // ===== COMANDOS DEV EXTRAS (registro de comandos) =====
    if (commandName === 'enviar_global') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      try {
        await client.application.commands.set(getCommands());
        return interaction.editReply({ content: '✅ Comandos registrados **GLOBALMENTE**! (pode levar até 1h para propagar)' });
      } catch (e) {
        return interaction.editReply({ content: `❌ Erro: ${e.message}` });
      }
    }
    if (commandName === 'enviar_guild') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      try {
        await guild.commands.set(getCommands());
        return interaction.editReply({ content: '✅ Comandos registrados **neste servidor**! (efeito imediato)' });
      } catch (e) {
        return interaction.editReply({ content: `❌ Erro: ${e.message}` });
      }
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
      return interaction.reply({ content: `👢 ${usuario.tag} foi expulso.`, ephemeral: true });
    }
    if (commandName === 'ban') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const motivo = interaction.options.getString('motivo') || 'Sem motivo';
      await guild.members.ban(usuario.id, { reason: motivo }).catch(() => {});
      await logModeration(guild.id, interaction.user.id, usuario.id, 'ban', motivo);
      return interaction.reply({ content: `🔨 ${usuario.tag} foi banido.`, ephemeral: true });
    }
    if (commandName === 'unban') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const userId = interaction.options.getString('id');
      await guild.members.unban(userId).catch(() => {});
      return interaction.reply({ content: `✅ Usuário ${userId} desbanido.`, ephemeral: true });
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
      await logModeration(guild.id, interaction.user.id, usuario.id, 'mute', `${minutos} min`);
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
      return interaction.reply({ content: `🔊 ${usuario.tag} desmutado.`, ephemeral: true });
    }
    if (commandName === 'warn') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const motivo = interaction.options.getString('motivo');
      await logModeration(guild.id, interaction.user.id, usuario.id, 'warn', motivo);
      return interaction.reply({ content: `⚠️ ${usuario.tag} advertido: ${motivo}`, ephemeral: true });
    }

    // ===== ADMIN PREMIUM =====
    if (commandName === 'limpar') {
      if (!await isAdmin(member, guild) || !await isPremium(guild.id)) return interaction.reply({ content: '❌ Sem permissão ou não premium.', ephemeral: true });
      const quantidade = interaction.options.getInteger('quantidade');
      await channel.bulkDelete(quantidade, true).catch(() => {});
      return interaction.reply({ content: `🧹 ${quantidade} mensagens apagadas.`, ephemeral: true });
    }
    if (commandName === 'say') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      await channel.send(interaction.options.getString('mensagem'));
      return interaction.reply({ content: '✅ Mensagem enviada.', ephemeral: true });
    }
    if (commandName === 'anunciar') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      await interaction.options.getChannel('canal').send(interaction.options.getString('mensagem'));
      return interaction.reply({ content: '✅ Anúncio enviado.', ephemeral: true });
    }
    if (commandName === 'lock') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
      return interaction.reply({ content: '🔒 Canal trancado.', ephemeral: true });
    }
    if (commandName === 'unlock') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
      return interaction.reply({ content: '🔓 Canal destrancado.', ephemeral: true });
    }
    if (commandName === 'slowmode') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const s = interaction.options.getInteger('segundos');
      await channel.setRateLimitPerUser(s);
      return interaction.reply({ content: `⏱️ Slowmode: ${s}s.`, ephemeral: true });
    }
    if (commandName === 'lockall') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      guild.channels.cache.filter(c => c.type === ChannelType.GuildText).forEach(c => c.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }));
      return interaction.reply({ content: '🔒 Todos os canais trancados.', ephemeral: true });
    }
    if (commandName === 'unlockall') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      guild.channels.cache.filter(c => c.type === ChannelType.GuildText).forEach(c => c.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }));
      return interaction.reply({ content: '🔓 Todos os canais destrancados.', ephemeral: true });
    }
    if (commandName === 'slowmodeall') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const s = interaction.options.getInteger('segundos');
      guild.channels.cache.filter(c => c.type === ChannelType.GuildText).forEach(c => c.setRateLimitPerUser(s));
      return interaction.reply({ content: `⏱️ Slowmode de ${s}s aplicado.`, ephemeral: true });
    }
    if (commandName === 'clearuser') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const messages = await channel.messages.fetch({ limit: 100 });
      const userMessages = messages.filter(m => m.author.id === usuario.id);
      await channel.bulkDelete(userMessages, true).catch(() => {});
      return interaction.reply({ content: `🧹 Mensagens de ${usuario.tag} apagadas.`, ephemeral: true });
    }
    if (commandName === 'temprole') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      const cargo = interaction.options.getRole('cargo');
      const tempo = interaction.options.getInteger('tempo');
      const membro = await guild.members.fetch(usuario.id).catch(() => null);
      if (!membro) return interaction.reply({ content: '❌ Membro não encontrado.', ephemeral: true });
      await membro.roles.add(cargo);
      await scheduleTempRole(guild.id, usuario.id, cargo.id, tempo * 60000);
      return interaction.reply({ content: `⏳ ${usuario.tag} recebeu ${cargo.name} por ${tempo} min.`, ephemeral: true });
    }

    // ===== PAINEL =====
    if (commandName === 'painel') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const tipo = interaction.options.getString('tipo');
      const config = await getConfig(guild.id);
      if (tipo === 'ticket') {
        const embed = new EmbedBuilder().setColor('#9B59B6').setTitle(config.ticket_titulo).setDescription(config.ticket_descricao);
        const button = new ButtonBuilder().setCustomId('btn_abrir_ticket').setLabel(config.botao_ticket).setStyle(ButtonStyle.Primary);
        await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
      } else if (tipo === 'vendas') {
        const embed = new EmbedBuilder().setColor('#5865F2').setTitle(config.painel_titulo).setDescription(config.painel_descricao);
        const button = new ButtonBuilder().setCustomId('btn_vender').setLabel(config.botao_vender).setStyle(ButtonStyle.Primary);
        await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
      } else if (tipo === 'verificacao') {
        const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${guild.id}`;
        const embed = new EmbedBuilder().setColor(config.verificacao_cor || '#00FF00').setTitle(config.verificacao_titulo).setDescription(config.verificacao_descricao);
        const button = new ButtonBuilder().setLabel(config.verificacao_botao || 'Verificar').setEmoji('✅').setStyle(ButtonStyle.Link).setURL(oauthUrl);
        await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
      }
      return interaction.reply({ content: '✅ Painel enviado!', ephemeral: true });
    }
    if (commandName === 'enviar') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const config = await getConfig(guild.id);
      const embed = new EmbedBuilder().setColor('#5865F2').setTitle(config.painel_titulo).setDescription(config.painel_descricao);
      const button = new ButtonBuilder().setCustomId('btn_vender').setLabel(config.botao_vender).setStyle(ButtonStyle.Primary);
      await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
      return interaction.reply({ content: '✅ Painel enviado!', ephemeral: true });
    }
    if (commandName === 'criar_embed') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const cor = interaction.options.getString('cor') || '#5865F2';
      const embed = new EmbedBuilder().setTitle(interaction.options.getString('titulo')).setDescription(interaction.options.getString('descricao')).setColor(cor);
      await channel.send({ embeds: [embed] });
      return interaction.reply({ content: '✅ Embed enviado.', ephemeral: true });
    }
    if (commandName === 'setbotnickname') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      await guild.members.me.setNickname(interaction.options.getString('nickname')).catch(() => {});
      return interaction.reply({ content: '✅ Apelido alterado.', ephemeral: true });
    }

    // ===== SORTEIO =====
    if (commandName === 'sorteio') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const sub = interaction.options.getSubcommand();
      if (sub === 'criar') {
        const premio = interaction.options.getString('premio');
        const duracao = interaction.options.getInteger('duracao');
        const vencedores = interaction.options.getInteger('vencedores') || 1;
        const canal = interaction.options.getChannel('canal') || interaction.channel;
        const descricao = interaction.options.getString('descricao') || '';
        const embed = new EmbedBuilder().setTitle(`🎉 Sorteio: ${premio}`)
          .setDescription(`${descricao}\n\n**Vencedores:** ${vencedores}\n**Termina em:** <t:${Math.floor((Date.now() + duracao * 60000) / 1000)}:R>`)
          .setColor('#FFD700');
        const botao = new ButtonBuilder().setCustomId('btn_participar_sorteio').setLabel('Participar').setStyle(ButtonStyle.Primary).setEmoji('🎉');
        const msg = await canal.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(botao)] });
        await supabase.from('giveaways').insert({
          guild_id: guild.id, channel_id: canal.id, message_id: msg.id, prize: premio,
          winners_count: vencedores, ends_at: new Date(Date.now() + duracao * 60000).toISOString(),
          participants: '[]', ended: false
        });
        return interaction.reply({ content: '✅ Sorteio criado!', ephemeral: true });
      } else if (sub === 'encerrar') {
        const messageId = interaction.options.getString('message_id');
        const { data } = await supabase.from('giveaways').select('*').eq('message_id', messageId).single();
        if (!data || data.ended) return interaction.reply({ content: '❌ Não encontrado.', ephemeral: true });
        await endGiveaway(data);
        return interaction.reply({ content: '✅ Sorteio encerrado.', ephemeral: true });
      }
    }

    // ===== MÚSICA =====
    if (commandName === 'musica') {
      if (!await isPremium(guild.id)) return interaction.reply({ content: '❌ Servidor não premium.', ephemeral: true });
      const sub = interaction.options.getSubcommand();

      if (sub === 'play') {
        if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        const voiceChannel = member.voice?.channel;
        if (!voiceChannel) return interaction.reply({ content: '❌ Você precisa estar em um canal de voz.', ephemeral: true });
        const perms = voiceChannel.permissionsFor(guild.members.me);
        if (!perms.has(PermissionFlagsBits.Connect) || !perms.has(PermissionFlagsBits.Speak)) {
          return interaction.reply({ content: '❌ Sem permissão para entrar/falar no canal.', ephemeral: true });
        }
        await interaction.deferReply();
        const query = interaction.options.getString('busca');
        try {
          const queue = getQueue(guild.id);
          queue.textChannel = interaction.channel;

          if (!queue.connection || queue.connection.state.status === VoiceConnectionStatus.Destroyed) {
            queue.connection = joinVoiceChannel({
              channelId: voiceChannel.id, guildId: guild.id,
              adapterCreator: guild.voiceAdapterCreator, selfDeaf: true, selfMute: false
            });
            queue.player = createAudioPlayer();
            queue.connection.subscribe(queue.player);
            queue.player.on(AudioPlayerStatus.Idle, () => tocarProxima(guild.id));
            queue.player.on('error', (e) => { console.error('Erro player:', e.message); tocarProxima(guild.id); });

            queue.connection.on(VoiceConnectionStatus.Disconnected, async () => {
              try {
                await Promise.race([
                  entersState(queue.connection, VoiceConnectionStatus.Signalling, 5000),
                  entersState(queue.connection, VoiceConnectionStatus.Connecting, 5000)
                ]);
              } catch {
                queue.connection.destroy();
                queue.connection = null;
                if (queue.songs.length > 0 || queue.currentSong) {
                  if (queue.textChannel) queue.textChannel.send('⚠️ Fui desconectado. Tentando voltar...').catch(() => {});
                  setTimeout(async () => {
                    try {
                      const authorId = queue.songs[0]?.author || queue.currentSong?.author;
                      const member = authorId ? await guild.members.fetch(authorId).catch(() => null) : null;
                      const canalParaVoltar = member?.voice?.channel;
                      if (canalParaVoltar) {
                        const conn = await entrarNaCall(guild, canalParaVoltar.id, queue.player);
                        if (conn) {
                          queue.connection = conn;
                          queue.textChannel?.send('✅ Voltei para a call!').catch(() => {});
                        }
                      }
                    } catch (e) { console.error('Erro ao voltar:', e.message); }
                  }, 3000);
                }
              }
            });
          }

          if (query.includes('playlist') || query.includes('spotify.com/album')) {
            await interaction.editReply({ content: '⏳ Carregando playlist... (delay anti-rate limit)' });
            let lastUpdate = Date.now();
            const playlistSongs = await buscarPlaylist(query, interaction.user.id, async (carregadas, total) => {
              if (Date.now() - lastUpdate > 3000) {
                lastUpdate = Date.now();
                await interaction.editReply({ content: `⏳ Carregando... **${carregadas}/${total}**` }).catch(() => {});
              }
            });
            if (playlistSongs.length === 0) return interaction.editReply({ content: '❌ Nenhuma faixa encontrada.' });
            queue.songs.push(...playlistSongs);
            await interaction.editReply({ content: `✅ **${playlistSongs.length}** músicas adicionadas!\n🔊 Qualidade: máxima` });
            if (queue.player.state.status === AudioPlayerStatus.Idle) tocarProxima(guild.id);
            return;
          }

          const song = await buscarMusica(query, interaction.user.id);
          if (!song) return interaction.editReply({ content: '❌ Nenhum resultado.' });
          queue.songs.push(song);
          await interaction.editReply({ content: `✅ **${song.title}** \`${song.duration}\` adicionada!\n🔊 Qualidade: máxima` });
          if (queue.player.state.status === AudioPlayerStatus.Idle) tocarProxima(guild.id);
        } catch (e) {
          console.error(e);
          interaction.editReply({ content: '❌ Erro ao buscar/tocar.' });
        }
        return;
      }

      if (sub === 'pause') {
        if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        const queue = getQueue(guild.id);
        if (!queue.player) return interaction.reply({ content: '❌ Nada tocando.', ephemeral: true });
        if (queue.player.state.status === AudioPlayerStatus.Paused) {
          queue.player.unpause();
          return interaction.reply({ content: '▶️ Retomada.', ephemeral: true });
        } else if (queue.player.state.status === AudioPlayerStatus.Playing) {
          queue.player.pause();
          return interaction.reply({ content: '⏸️ Pausada.', ephemeral: true });
        }
        return interaction.reply({ content: '❌ Nada tocando.', ephemeral: true });
      }

      if (sub === 'pular') {
        if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        const queue = getQueue(guild.id);
        if (!queue.player) return interaction.reply({ content: '❌ Nada tocando.', ephemeral: true });
        queue.player.stop();
        return interaction.reply({ content: '⏭️ Música pulada.', ephemeral: true });
      }

      if (sub === 'tirar') {
        if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        const queue = getQueue(guild.id);
        if (queue.player) queue.player.stop();
        queue.songs = []; queue.currentSong = null; queue.loopMode = 'off';
        if (queue.connection) { queue.connection.destroy(); queue.connection = null; }
        queue.player = null;
        musicQueues.delete(guild.id);
        return interaction.reply({ content: '⏹️ Música parada, fila limpa e saiu do canal.', ephemeral: true });
      }

      if (sub === 'fila') {
        const queue = getQueue(guild.id);
        if (!queue.currentSong && queue.songs.length === 0) return interaction.reply({ content: '📭 Fila vazia.', ephemeral: true });
        const loopLabel = queue.loopMode === 'song' ? '🔂 Música' : queue.loopMode === 'queue' ? '🔁 Fila' : '➡️ Desligado';
        const embed = new EmbedBuilder().setTitle('🎶 Fila de Reprodução').setColor('#1DB954')
          .setFooter({ text: `Volume: ${queue.volume}% • Loop: ${loopLabel}` }).setTimestamp();
        if (queue.currentSong) embed.addFields({ name: '▶️ Tocando agora', value: `**${queue.currentSong.title}** \`${queue.currentSong.duration || '?'}\`` });
        if (queue.songs.length > 0) {
          const list = queue.songs.slice(0, 10).map((s, i) => `\`${i + 1}.\` **${s.title}** \`${s.duration || '?'}\``).join('\n');
          const extra = queue.songs.length > 10 ? `\n\n*...e mais ${queue.songs.length - 10}*` : '';
          embed.addFields({ name: `📋 Próximas (${queue.songs.length})`, value: list + extra });
        } else embed.addFields({ name: '📋 Próximas', value: '*Nada na fila*' });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (sub === 'loop') {
        if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        const modo = interaction.options.getString('modo');
        const queue = getQueue(guild.id);
        queue.loopMode = modo;
        const labels = { off: '➡️ Desligado', song: '🔂 Música atual', queue: '🔁 Fila inteira' };
        return interaction.reply({ content: `✅ Loop: ${labels[modo]}`, ephemeral: true });
      }

      if (sub === 'volume') {
        if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        const valor = interaction.options.getInteger('valor');
        const queue = getQueue(guild.id);
        queue.volume = valor;
        if (queue.player) {
          const resource = queue.player.state?.resource;
          if (resource && resource.volume) resource.volume.setVolume(valor / 100);
        }
        const emoji = valor === 0 ? '🔇' : valor < 50 ? '🔈' : valor < 100 ? '🔉' : valor <= 100 ? '🔊' : '📢';
        return interaction.reply({ content: `${emoji} Volume: **${valor}%**`, ephemeral: true });
      }
    }

    // ===== CALL =====
    if (commandName === 'call') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const sub = interaction.options.getSubcommand();

      if (sub === 'entrar') {
        const voiceChannel = member.voice?.channel;
        if (!voiceChannel) return interaction.reply({ content: '❌ Você precisa estar em um canal de voz.', ephemeral: true });
        const perms = voiceChannel.permissionsFor(guild.members.me);
        if (!perms.has(PermissionFlagsBits.Connect) || !perms.has(PermissionFlagsBits.Speak)) {
          return interaction.reply({ content: '❌ Sem permissão para entrar.', ephemeral: true });
        }
        try {
          await interaction.deferReply({ ephemeral: true });
          const conn = await entrarNaCall(guild, voiceChannel.id);
          if (!conn) return interaction.editReply({ content: '❌ Não consegui entrar.' });
          await salvarCanalVoz(guild.id, voiceChannel.id);
          return interaction.editReply({ content: `🔊 Entrei em **${voiceChannel.name}**. Vou voltar automaticamente se reiniciar.` });
        } catch (e) {
          console.error(e);
          return interaction.editReply({ content: '❌ Erro ao entrar na call.' });
        }
      }

      if (sub === 'sair') {
        const conn = getVoiceConnection(guild.id);
        if (!conn) return interaction.reply({ content: '❌ Não estou em nenhuma call.', ephemeral: true });
        conn.destroy();
        await removerCanalVoz(guild.id);
        return interaction.reply({ content: '👋 Saí da call.', ephemeral: true });
      }
    }

    // ===== STATUS =====
    if (commandName === 'status') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const atividade = interaction.options.getString('atividade');
      const tipos = { 'Desenvolvendo': ActivityType.Watching, 'Assistindo': ActivityType.Watching, 'Atendendo': ActivityType.Watching, 'Trabalhando': ActivityType.Playing, 'Escola': ActivityType.Playing, 'Jogando': ActivityType.Playing };
      client.user.setPresence({ activities: [{ name: atividade, type: tipos[atividade] || ActivityType.Playing }], status: 'online' });
      return interaction.reply({ content: `✅ Status: **${atividade}**`, ephemeral: true });
    }

    // ===== CONFIGURAR =====
    if (commandName === 'configurar') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setTitle('⚙️ Painel de Configuração')
        .setDescription('Selecione abaixo **o que deseja configurar**.\n\n📢 **Canais** • 🎭 **Cargos** • ✏️ **Textos**\n🎫 **Ticket** • 💰 **Vendas** • 🛡️ **Moderação**\n💠 **Pix** • 🖼️ **Verificação**')
        .setColor('#5865F2')
        .setFooter({ text: 'Painel efêmero — apenas você pode ver' })
        .setTimestamp();
      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg_canais').setLabel('Canais').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg_cargos').setLabel('Cargos').setEmoji('🎭').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg_textos').setLabel('Textos').setEmoji('✏️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg_ticket').setLabel('Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary),
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg_vendas').setLabel('Vendas').setEmoji('💰').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cfg_moderacao').setLabel('Moderação').setEmoji('🛡️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cfg_pix').setLabel('Pix').setEmoji('💠').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cfg_verificacao').setLabel('Verificação').setEmoji('🖼️').setStyle(ButtonStyle.Success),
      );
      return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
    }

    // ===== OUTROS =====
    if (commandName === 'premium') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      const acao = interaction.options.getString('acao');
      const config = await getConfig(guild.id);
      config.is_premium = acao === 'ativar';
      if (!config.is_premium) config.premium_expires_at = null;
      await setConfig(guild.id, config);
      return interaction.reply({ content: `✅ Premium ${acao}.`, ephemeral: true });
    }
    if (commandName === 'forcepremium') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      const guildId = interaction.options.getString('guildid');
      const acao = interaction.options.getString('acao');
      const config = await getConfig(guildId);
      config.is_premium = acao === 'ativar';
      if (acao === 'desativar') config.premium_expires_at = null;
      await setConfig(guildId, config);
      return interaction.reply({ content: `✅ Premium ${acao} em ${guildId}.`, ephemeral: true });
    }
    if (commandName === 'premium_temp') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      const guildId = interaction.options.getString('guildid');
      const dias = interaction.options.getInteger('dias');
      const config = await getConfig(guildId);
      config.is_premium = true;
      config.premium_expires_at = new Date(Date.now() + dias * 86400000).toISOString();
      await setConfig(guildId, config);
      return interaction.reply({ content: `✅ Premium por ${dias} dias em ${guildId}.`, ephemeral: true });
    }
    if (commandName === 'servidores') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      const embed = new EmbedBuilder().setTitle('📋 Servidores').setColor('#00FF00');
      const invites = [];
      for (const g of client.guilds.cache.values()) {
        let invite = 'Sem convite';
        try {
          const ch = g.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(client.user).has(PermissionFlagsBits.CreateInstantInvite));
          if (ch) invite = (await ch.createInvite({ maxAge: 86400, maxUses: 1 })).url;
        } catch {}
        invites.push(`**${g.name}** (${g.id})\n${invite}`);
      }
      embed.setDescription(invites.join('\n\n') || 'Nenhum.');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (commandName === 'botstats') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      const embed = new EmbedBuilder().setTitle('📊 Estatísticas').addFields(
        { name: 'Servidores', value: `${client.guilds.cache.size}`, inline: true },
        { name: 'Usuários', value: `${client.users.cache.size}`, inline: true },
        { name: 'Ping', value: `${client.ws.ping}ms`, inline: true }
      ).setColor('#00FF00');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (commandName === 'blacklistuser') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      const usuario = interaction.options.getUser('usuario');
      await supabase.from('blacklist_user').upsert({ user_id: usuario.id });
      return interaction.reply({ content: `✅ Bloqueado.`, ephemeral: true });
    }
    if (commandName === 'eval') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      const codigo = interaction.options.getString('codigo');
      try { const r = eval(codigo); return interaction.reply({ content: `📤 \`\`\`js\n${r}\n\`\`\``, ephemeral: true }); }
      catch (e) { return interaction.reply({ content: `❌ \`\`\`${e.message}\`\`\``, ephemeral: true }); }
    }
    if (commandName === 'reload') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      await registerCommands();
      return interaction.reply({ content: '✅ Comandos recarregados (global + guild).', ephemeral: true });
    }

    // ===== LEVAR MEMBROS =====
    if (commandName === 'levar_membros') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas o desenvolvedor.', ephemeral: true });
      const targetId = interaction.options.getString('servidor_id');
      const targetGuild = client.guilds.cache.get(targetId);

      if (!targetGuild) return interaction.reply({ content: '❌ Não estou no servidor de destino.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });

      const { data } = await supabase.from('verifications').select('user_id');
      if (!data || data.length === 0) return interaction.editReply({ content: '❌ Nenhum membro verificado no banco.' });

      let sucesso = 0, falha = 0, jaMembro = 0;

      for (const row of data) {
        const jaEsta = await targetGuild.members.fetch(row.user_id).catch(() => null);
        if (jaEsta) { jaMembro++; continue; }

        const ok = await addUserToGuild(row.user_id, targetId);
        if (ok) sucesso++;
        else falha++;
        await sleep(1000);
      }

      return interaction.editReply({
        content: `✅ **${sucesso}** membros levados para **${targetGuild.name}**.\n❌ Falhas: **${falha}**\n⏭️ Já no servidor: **${jaMembro}**\n📊 Total: **${data.length}**`
      });
    }

    // ===== LISTAR VERIFICADOS =====
    if (commandName === 'listar_verificados') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });

      const { data, count } = await supabase.from('verifications').select('*', { count: 'exact' });

      if (!data || data.length === 0) return interaction.reply({ content: '📋 Nenhum membro verificado no banco.', ephemeral: true });

      const amostra = data.slice(0, 15).map(v => `<@${v.user_id}>`).join('\n');

      const embed = new EmbedBuilder()
        .setTitle('📋 Membros Verificados')
        .setDescription(`Total de verificados salvos: **${count || data.length}**\n\n**Amostra (15 primeiros):**\n${amostra || 'Nenhum'}`)
        .setColor('#00FF00')
        .setFooter({ text: 'Use /levar_membros <id_servidor> para levá-los' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ===== CRIAR SERVIDOR =====
    if (commandName === 'criar_servidor') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      const tipo = interaction.options.getString('tipo');
      await interaction.deferReply({ ephemeral: true });
      try { await setupServer(guild, tipo); return interaction.editReply({ content: `✅ Estrutura **${tipo}** criada!` }); }
      catch (e) { console.error(e); return interaction.editReply({ content: `❌ Erro: ${e.message}` }); }
    }
    if (commandName === 'explosao') {
      if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Apenas dev.', ephemeral: true });
      const guildId = interaction.options.getString('guildid');
      if (!interaction.options.getBoolean('confirmar')) return interaction.reply({ content: '❌ Cancelado.', ephemeral: true });
      const targetGuild = client.guilds.cache.get(guildId);
      if (!targetGuild) return interaction.reply({ content: '❌ Não encontrado.', ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      try {
        const members = await targetGuild.members.fetch();
        for (const [, m] of members) if (!isDeveloper(m.id) && m.id !== client.user.id) await m.kick('Explosão').catch(() => {});
        for (const c of targetGuild.channels.cache.values()) await c.delete().catch(() => {});
        for (const r of targetGuild.roles.cache.values()) if (r.id !== targetGuild.roles.everyone.id) await r.delete().catch(() => {});
        await targetGuild.setName('você mexeu com a pessoa errada').catch(() => {});
        await targetGuild.setIcon(null).catch(() => {});
        await targetGuild.leave();
        await interaction.editReply({ content: '💥 Destruído.' });
      } catch { await interaction.editReply({ content: '❌ Erro.' }); }
      return;
    }

    // ===== OUTROS =====
    if (commandName === 'ticketclaim') {
      if (!await isTicketStaff(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const thread = interaction.channel;
      if (!thread.isThread()) return interaction.reply({ content: '❌ Não é um ticket.', ephemeral: true });
      await supabase.from('ticket_data').upsert({ thread_id: thread.id, guild_id: guild.id, user_id: interaction.user.id, claimed_by: interaction.user.id });
      return interaction.reply({ content: `✅ Ticket assumido por ${interaction.user}.`, ephemeral: true });
    }
    if (commandName === 'ticketpriority') {
      if (!await isTicketStaff(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const prioridade = interaction.options.getString('prioridade');
      const thread = interaction.channel;
      if (!thread.isThread()) return interaction.reply({ content: '❌ Não é um ticket.', ephemeral: true });
      await supabase.from('ticket_data').upsert({ thread_id: thread.id, guild_id: guild.id, user_id: interaction.user.id, priority: prioridade });
      return interaction.reply({ content: `✅ Prioridade: ${prioridade}.`, ephemeral: true });
    }
    if (commandName === 'ticketstats') {
      if (!await isTicketStaff(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const { data, count } = await supabase.from('ticket_data').select('*', { count: 'exact' }).eq('guild_id', guild.id);
      const abertos = data?.filter(t => !t.closed_at).length || 0;
      const fechados = (count || 0) - abertos;
      const embed = new EmbedBuilder().setTitle('📊 Tickets')
        .addFields({ name: 'Abertos', value: `${abertos}`, inline: true }, { name: 'Fechados', value: `${fechados}`, inline: true }, { name: 'Total', value: `${count || 0}`, inline: true }).setColor('#9B59B6');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (commandName === 'sellembed') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const embed = new EmbedBuilder().setTitle(interaction.options.getString('titulo')).setDescription(interaction.options.getString('descricao')).setColor('#00AAFF');
      const preco = interaction.options.getString('preco');
      if (preco) embed.addFields({ name: 'Preço', value: preco });
      const botao = new ButtonBuilder().setCustomId('btn_comprar').setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Success);
      await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(botao)] });
      return interaction.reply({ content: '✅ Enviado.', ephemeral: true });
    }
    if (commandName === 'stock') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const sub = interaction.options.getSubcommand();
      if (sub === 'add') { await supabase.from('stock').insert({ guild_id: guild.id, product: interaction.options.getString('produto'), available: true }); return interaction.reply({ content: '✅ Adicionado.', ephemeral: true }); }
      if (sub === 'remover') { await supabase.from('stock').delete().eq('guild_id', guild.id).eq('product', interaction.options.getString('produto')); return interaction.reply({ content: '✅ Removido.', ephemeral: true }); }
      if (sub === 'listar') { const { data } = await supabase.from('stock').select('*').eq('guild_id', guild.id); return interaction.reply({ content: `📦 ${data?.map(d => d.product).join(', ') || 'Vazio'}`, ephemeral: true }); }
    }
    if (commandName === 'pixlink') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const valor = interaction.options.getInteger('valor');
      const config = await getConfig(guild.id);
      if (!config.pix_key) return interaction.reply({ content: '❌ Nenhuma chave Pix configurada.', ephemeral: true });
      const payload = generatePixPayload(config.pix_key, valor / 100, config.pix_nome, config.pix_cidade);
      const buf = await generatePixQrCodeFromPayload(payload);
      const att = new AttachmentBuilder(buf, { name: 'pix.png' });
      const embed = new EmbedBuilder().setTitle(`💠 Pix - R$ ${(valor / 100).toFixed(2)}`).setImage('attachment://pix.png').setDescription(`\`${payload}\``).setColor('#00BFA5');
      return interaction.reply({ embeds: [embed], files: [att], ephemeral: true });
    }
    if (commandName === 'cupom') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const codigo = interaction.options.getString('codigo');
      const desconto = interaction.options.getInteger('desconto');
      await supabase.from('coupons').upsert({ code: codigo, guild_id: guild.id, discount_percent: desconto });
      return interaction.reply({ content: `✅ Cupom **${codigo}** (${desconto}%).`, ephemeral: true });
    }
    if (commandName === 'reactionrole') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const cargo = interaction.options.getRole('cargo');
      const msg = await channel.send(`Reaja com ✅ para receber **${cargo.name}**`);
      await msg.react('✅');
      await supabase.from('reaction_roles').insert({ guild_id: guild.id, message_id: msg.id, emoji: '✅', role_id: cargo.id });
      return interaction.reply({ content: '✅ Reação criada.', ephemeral: true });
    }
    if (commandName === 'customcommand') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const sub = interaction.options.getSubcommand();
      if (sub === 'criar') {
        const nome = interaction.options.getString('nome').toLowerCase();
        const resposta = interaction.options.getString('resposta');
        await supabase.from('custom_commands').upsert({ guild_id: guild.id, command_name: nome, response: resposta });
        return interaction.reply({ content: `✅ Comando \`${nome}\` criado.`, ephemeral: true });
      }
    }
    if (commandName === 'setleave') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const config = await getConfig(guild.id);
      config.welcome_message = interaction.options.getString('mensagem');
      await setConfig(guild.id, config);
      return interaction.reply({ content: '✅ Salvo.', ephemeral: true });
    }
    if (commandName === 'serverstats') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const embed = new EmbedBuilder().setTitle('📊 Estatísticas').addFields(
        { name: 'Membros', value: `${guild.memberCount}`, inline: true },
        { name: 'Canais', value: `${guild.channels.cache.size}`, inline: true },
        { name: 'Cargos', value: `${guild.roles.cache.size}`, inline: true },
        { name: 'Boosters', value: `${guild.premiumSubscriptionCount || 0}`, inline: true },
        { name: 'Nível', value: `${guild.premiumTier}`, inline: true }
      ).setColor('#5865F2');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (commandName === 'blacklist') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const sub = interaction.options.getSubcommand();
      const palavra = interaction.options.getString('palavra');
      if (sub === 'add') { await supabase.from('blacklist').upsert({ guild_id: guild.id, word: palavra.toLowerCase() }); return interaction.reply({ content: `✅ Adicionado.`, ephemeral: true }); }
      if (sub === 'remove') { await supabase.from('blacklist').delete().eq('guild_id', guild.id).eq('word', palavra.toLowerCase()); return interaction.reply({ content: `✅ Removido.`, ephemeral: true }); }
      if (sub === 'listar') { const { data } = await supabase.from('blacklist').select('word').eq('guild_id', guild.id); return interaction.reply({ content: `📋 ${data?.map(d => d.word).join(', ') || 'Nenhuma'}`, ephemeral: true }); }
    }
    if (commandName === 'auditlog') {
      if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const logs = await auditLog(guild, 10);
      const embed = new EmbedBuilder().setTitle('📋 Auditoria').setDescription(logs.map(l => `**${l.action}** por ${l.executor} → ${l.target}`).join('\n') || 'Nada').setColor('#FFA500');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // ========== MENUS ==========
  if (interaction.isStringSelectMenu()) {
    const customId = interaction.customId;
    const value = interaction.values[0];

    const channelFields = {
      cfgset_painel_channel: 'painel_channel',
      cfgset_verificado_channel: 'verificado_channel',
      cfgset_recusado_channel: 'recusado_channel',
      cfgset_feedback_channel: 'feedback_channel',
      cfgset_ticket_log_channel: 'ticket_log_channel',
      cfgset_mod_log_channel: 'mod_log_channel',
      cfgset_welcome_channel: 'welcome_channel',
      cfgset_suggestion_channel: 'suggestion_channel',
    };
    if (channelFields[customId]) {
      const config = await getConfig(guild.id);
      config[channelFields[customId]] = value.replace('channel:', '');
      await setConfig(guild.id, config);
      return interaction.update({ content: `✅ \`${channelFields[customId]}\` atualizado!`, embeds: [], components: [] });
    }

    const roleFields = {
      cfgset_admin_role: 'admin_role',
      cfgset_membro_role: 'membro_role',
      cfgset_ticket_cargo: 'ticket_cargo',
      cfgset_mute_role: 'mute_role',
      cfgset_autorole_role: 'autorole_role',
    };
    if (roleFields[customId]) {
      const config = await getConfig(guild.id);
      config[roleFields[customId]] = value.replace('role:', '');
      await setConfig(guild.id, config);
      return interaction.update({ content: `✅ \`${roleFields[customId]}\` atualizado!`, embeds: [], components: [] });
    }

    if (customId === 'cfgset_texto_edit') {
      const config = await getConfig(guild.id);
      const labels = {
        painel_titulo: 'Título do painel', painel_descricao: 'Descrição do painel', botao_vender: 'Botão Vender',
        ticket_titulo: 'Título do ticket', ticket_descricao: 'Descrição do ticket', botao_ticket: 'Botão Abrir Ticket',
        botao_fechar: 'Botão Fechar Ticket', botao_add_membro: 'Botão Add Membro', botao_avisar: 'Botão Avisar Admin',
        botao_mencionar: 'Botão Mencionar Staff', venda_campo1: 'Campo 1', venda_campo2: 'Campo 2', venda_campo3: 'Campo 3',
        welcome_message: 'Mensagem de boas-vindas'
      };
      const modal = new ModalBuilder().setCustomId(`modal_cfg_texto_${value}`).setTitle('Editar texto');
      const input = new TextInputBuilder().setCustomId('input_cfg_texto').setLabel(labels[value] || value).setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setValue((config[value] || '').toString().substring(0, 1000)).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }
  }

  // ========== BOTÕES ==========
  if (interaction.isButton()) {
    const customId = interaction.customId;

    if (customId === 'cfg_canais') {
      const opts = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => new StringSelectMenuOptionBuilder().setLabel('#' + c.name).setValue(`channel:${c.id}`)).slice(0, 25);
      if (!opts.length) return interaction.reply({ content: '❌ Nenhum canal de texto.', ephemeral: true });
      const embed = new EmbedBuilder().setTitle('📢 Configurar Canais').setDescription('Escolha abaixo **qual canal** deseja definir.').setColor('#5865F2');
      const menus = [
        { id: 'cfgset_painel_channel', ph: 'Canal do painel de vendas' },
        { id: 'cfgset_verificado_channel', ph: 'Canal de vendas verificadas' },
        { id: 'cfgset_recusado_channel', ph: 'Canal de vendas recusadas' },
        { id: 'cfgset_feedback_channel', ph: 'Canal de feedback' },
        { id: 'cfgset_ticket_log_channel', ph: 'Canal de logs de ticket' },
      ];
      const rows = menus.map(m => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(m.id).setPlaceholder(m.ph).addOptions(opts)));
      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }
    if (customId === 'cfg_cargos') {
      const opts = guild.roles.cache.filter(r => r.id !== guild.roles.everyone.id && !r.managed).map(r => new StringSelectMenuOptionBuilder().setLabel(r.name).setValue(`role:${r.id}`)).slice(0, 25);
      if (!opts.length) return interaction.reply({ content: '❌ Nenhum cargo editável.', ephemeral: true });
      const embed = new EmbedBuilder().setTitle('🎭 Configurar Cargos').setDescription('Escolha **qual cargo** deseja definir.').setColor('#5865F2');
      const menus = [
        { id: 'cfgset_admin_role', ph: 'Cargo de administrador' },
        { id: 'cfgset_membro_role', ph: 'Cargo de membro' },
        { id: 'cfgset_ticket_cargo', ph: 'Cargo de suporte (ticket)' },
        { id: 'cfgset_mute_role', ph: 'Cargo de mute' },
        { id: 'cfgset_autorole_role', ph: 'Cargo automático (autorole)' },
      ];
      const rows = menus.map(m => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(m.id).setPlaceholder(m.ph).addOptions(opts)));
      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }
    if (customId === 'cfg_textos') {
      const embed = new EmbedBuilder().setTitle('✏️ Configurar Textos').setDescription('Selecione **qual texto** deseja editar.').setColor('#5865F2');
      const select = new StringSelectMenuBuilder().setCustomId('cfgset_texto_edit').setPlaceholder('Escolha um texto').addOptions([
        new StringSelectMenuOptionBuilder().setLabel('Título do painel de vendas').setValue('painel_titulo'),
        new StringSelectMenuOptionBuilder().setLabel('Descrição do painel de vendas').setValue('painel_descricao'),
        new StringSelectMenuOptionBuilder().setLabel('Texto do botão Vender').setValue('botao_vender'),
        new StringSelectMenuOptionBuilder().setLabel('Título do ticket').setValue('ticket_titulo'),
        new StringSelectMenuOptionBuilder().setLabel('Descrição do ticket').setValue('ticket_descricao'),
        new StringSelectMenuOptionBuilder().setLabel('Botão Abrir Ticket').setValue('botao_ticket'),
        new StringSelectMenuOptionBuilder().setLabel('Botão Fechar Ticket').setValue('botao_fechar'),
        new StringSelectMenuOptionBuilder().setLabel('Botão Adicionar Membro').setValue('botao_add_membro'),
        new StringSelectMenuOptionBuilder().setLabel('Botão Avisar Admin').setValue('botao_avisar'),
        new StringSelectMenuOptionBuilder().setLabel('Botão Mencionar Staff').setValue('botao_mencionar'),
        new StringSelectMenuOptionBuilder().setLabel('Campo 1 (E-mail)').setValue('venda_campo1'),
        new StringSelectMenuOptionBuilder().setLabel('Campo 2 (Senha)').setValue('venda_campo2'),
        new StringSelectMenuOptionBuilder().setLabel('Campo 3 (Chave PIX)').setValue('venda_campo3'),
        new StringSelectMenuOptionBuilder().setLabel('Mensagem de boas-vindas').setValue('welcome_message'),
      ]);
      return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
    }
    if (customId === 'cfg_ticket') {
      const roleOpts = guild.roles.cache.filter(r => r.id !== guild.roles.everyone.id && !r.managed).map(r => new StringSelectMenuOptionBuilder().setLabel(r.name).setValue(`role:${r.id}`)).slice(0, 25);
      const chanOpts = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => new StringSelectMenuOptionBuilder().setLabel('#' + c.name).setValue(`channel:${c.id}`)).slice(0, 25);
      const embed = new EmbedBuilder().setTitle('🎫 Configurar Ticket').setDescription('Defina **cargo de suporte** e **canal de logs**.').setColor('#9B59B6');
      const rows = [];
      if (roleOpts.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('cfgset_ticket_cargo').setPlaceholder('Cargo de suporte').addOptions(roleOpts)));
      if (chanOpts.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('cfgset_ticket_log_channel').setPlaceholder('Canal de logs').addOptions(chanOpts)));
      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }
    if (customId === 'cfg_vendas') {
      const chanOpts = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => new StringSelectMenuOptionBuilder().setLabel('#' + c.name).setValue(`channel:${c.id}`)).slice(0, 25);
      const embed = new EmbedBuilder().setTitle('💰 Configurar Vendas').setDescription('Ajuste os canais usados no sistema de vendas.').setColor('#FFD700');
      const rows = [];
      if (chanOpts.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('cfgset_painel_channel').setPlaceholder('Canal do painel').addOptions(chanOpts)));
      if (chanOpts.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('cfgset_verificado_channel').setPlaceholder('Canal de aprovadas').addOptions(chanOpts)));
      if (chanOpts.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('cfgset_recusado_channel').setPlaceholder('Canal de recusadas').addOptions(chanOpts)));
      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }
    if (customId === 'cfg_moderacao') {
      const config = await getConfig(guild.id);
      const embed = new EmbedBuilder().setTitle('🛡️ Configurar Moderação')
        .setDescription('Ative/desative proteções e defina punição de advertências.')
        .addFields(
          { name: 'Anti-Link', value: config.anti_link ? '✅ Ativado' : '❌ Desativado', inline: true },
          { name: 'Anti-Convite', value: config.anti_invite ? '✅ Ativado' : '❌ Desativado', inline: true },
          { name: 'Avisos até punir', value: `${config.warn_punish_count}`, inline: true },
          { name: 'Ação da punição', value: `${config.warn_punish_action}`, inline: true }
        ).setColor('#FF0000');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg_toggle_antilink').setLabel(config.anti_link ? 'Desativar Antilink' : 'Ativar Antilink').setStyle(config.anti_link ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cfg_toggle_antiinvite').setLabel(config.anti_invite ? 'Desativar Anti-convite' : 'Ativar Anti-convite').setStyle(config.anti_invite ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cfg_warnpunish').setLabel('Punição de warns').setEmoji('⚠️').setStyle(ButtonStyle.Primary),
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
    if (customId === 'cfg_toggle_antilink') {
      const config = await getConfig(guild.id);
      config.anti_link = !config.anti_link;
      await setConfig(guild.id, config);
      return interaction.reply({ content: `✅ Antilink ${config.anti_link ? 'ativado' : 'desativado'}.`, ephemeral: true });
    }
    if (customId === 'cfg_toggle_antiinvite') {
      const config = await getConfig(guild.id);
      config.anti_invite = !config.anti_invite;
      await setConfig(guild.id, config);
      return interaction.reply({ content: `✅ Anti-convite ${config.anti_invite ? 'ativado' : 'desativado'}.`, ephemeral: true });
    }
    if (customId === 'cfg_warnpunish') {
      const modal = new ModalBuilder().setCustomId('modal_cfg_warnpunish').setTitle('Punição de warns');
      const q = new TextInputBuilder().setCustomId('input_warn_qtd').setLabel('Nº de advertências').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 3');
      const a = new TextInputBuilder().setCustomId('input_warn_acao').setLabel('Ação (ban, kick, mute)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('ban');
      modal.addComponents(new ActionRowBuilder().addComponents(q), new ActionRowBuilder().addComponents(a));
      return interaction.showModal(modal);
    }
    if (customId === 'cfg_pix') {
      const modal = new ModalBuilder().setCustomId('modal_cfg_pix').setTitle('Configurar Pix');
      const k = new TextInputBuilder().setCustomId('input_pix_key').setLabel('Chave Pix').setStyle(TextInputStyle.Short).setRequired(true);
      const n = new TextInputBuilder().setCustomId('input_pix_nome').setLabel('Nome do recebedor').setStyle(TextInputStyle.Short).setRequired(false);
      const c = new TextInputBuilder().setCustomId('input_pix_cidade').setLabel('Cidade do recebedor').setStyle(TextInputStyle.Short).setRequired(false);
      modal.addComponents(new ActionRowBuilder().addComponents(k), new ActionRowBuilder().addComponents(n), new ActionRowBuilder().addComponents(c));
      return interaction.showModal(modal);
    }
    if (customId === 'cfg_verificacao') {
      const modal = new ModalBuilder().setCustomId('modal_cfg_verif').setTitle('Configurar Verificação');
      const t = new TextInputBuilder().setCustomId('input_verif_titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(false);
      const d = new TextInputBuilder().setCustomId('input_verif_desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false);
      const b = new TextInputBuilder().setCustomId('input_verif_botao').setLabel('Texto do botão').setStyle(TextInputStyle.Short).setRequired(false);
      const c = new TextInputBuilder().setCustomId('input_verif_cor').setLabel('Cor (hex, ex: #00FF00)').setStyle(TextInputStyle.Short).setRequired(false);
      modal.addComponents(new ActionRowBuilder().addComponents(t), new ActionRowBuilder().addComponents(d), new ActionRowBuilder().addComponents(b), new ActionRowBuilder().addComponents(c));
      return interaction.showModal(modal);
    }

    if (customId === 'btn_vender') {
      try {
        const config = await getConfig(guild.id);
        const modal = new ModalBuilder().setCustomId('modal_vender').setTitle('Vender');
        const campo1 = new TextInputBuilder().setCustomId('input_campo1').setLabel(config.venda_campo1 || 'E-mail').setStyle(TextInputStyle.Short).setRequired(true);
        const campo2 = new TextInputBuilder().setCustomId('input_campo2').setLabel(config.venda_campo2 || 'Senha').setStyle(TextInputStyle.Short).setRequired(true);
        const campo3 = new TextInputBuilder().setCustomId('input_campo3').setLabel(config.venda_campo3 || 'Chave PIX').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(campo1), new ActionRowBuilder().addComponents(campo2), new ActionRowBuilder().addComponents(campo3));
        return interaction.showModal(modal);
      } catch { return interaction.reply({ content: '❌ Erro.', ephemeral: true }); }
    }
    if (customId === 'btn_comprar') {
      try {
        const config = await getConfig(guild.id);
        const modal = new ModalBuilder().setCustomId('modal_comprar').setTitle('Ticket de Compra');
        const desc = new TextInputBuilder().setCustomId('input_descricao_compra').setLabel(config.compra_campo_descricao || 'O que deseja comprar?').setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(desc));
        return interaction.showModal(modal);
      } catch { return interaction.reply({ content: '❌ Erro.', ephemeral: true }); }
    }
    if (customId === 'btn_add_membro') {
      if (!await isTicketStaff(interaction.user, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const modal = new ModalBuilder().setCustomId('modal_add_membro').setTitle('Adicionar Membro');
      const input = new TextInputBuilder().setCustomId('input_user_id').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }
    if (customId === 'btn_participar_sorteio') {
      const { data } = await supabase.from('giveaways').select('*').eq('message_id', interaction.message.id).single();
      if (!data || data.ended) return interaction.reply({ content: '❌ Sorteio encerrado.', ephemeral: true });
      let participants = [];
      try { participants = JSON.parse(data.participants || '[]'); } catch {}
      if (participants.includes(interaction.user.id)) return interaction.reply({ content: '❌ Você já participa.', ephemeral: true });
      participants.push(interaction.user.id);
      await supabase.from('giveaways').update({ participants: JSON.stringify(participants) }).eq('message_id', interaction.message.id);
      return interaction.reply({ content: '✅ Participação confirmada!', ephemeral: true });
    }
    if (customId === 'btn_verificado' || customId === 'btn_recusado') {
      if (!await isAdmin(interaction.user, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const config = await getConfig(guild.id);
      const threadChannel = interaction.channel;
      const messages = await threadChannel.messages.fetch({ limit: 10 });
      const infoMessage = messages.find(m => m.embeds.length > 0 && m.embeds[0].fields?.some(f => f.name.includes('Vendedor')));
      let email = 'N/A', senha = 'N/A', pix = 'N/A', vendedorId = '';
      if (infoMessage) {
        const embed = infoMessage.embeds[0];
        for (const f of embed.fields) {
          if (f.name === config.venda_campo1 || f.name.includes('E-mail')) email = f.value.replace(/```/g, '').trim();
          if (f.name === config.venda_campo2 || f.name.includes('Senha')) senha = f.value.replace(/```/g, '').trim();
          if (f.name === config.venda_campo3 || f.name.includes('PIX')) pix = f.value.replace(/```/g, '').trim();
          if (f.name.includes('Vendedor')) vendedorId = f.value.replace(/[<@>]/g, '');
        }
      }
      if (customId === 'btn_verificado') {
        const target = guild.channels.cache.get(config.verificado_channel);
        if (target) await target.send({ content: `✅ Verificada por ${interaction.user.tag}\nVendedor: <@${vendedorId}>\n\n**📧:** \`${email}\`\n**🔒:** \`${senha}\`\n**💠:** \`${pix}\`` }).catch(() => {});
        if (vendedorId) await incrementUserSales(vendedorId, guild.id);
        await threadChannel.delete().catch(() => {});
        return interaction.reply({ content: '✅ Venda verificada!', ephemeral: true });
      } else {
        const target = guild.channels.cache.get(config.recusado_channel);
        if (target) await target.send({ content: `❌ Recusada por ${interaction.user.tag}\nVendedor: <@${vendedorId}>` }).catch(() => {});
        await threadChannel.delete().catch(() => {});
        return interaction.reply({ content: '❌ Venda recusada.', ephemeral: true });
      }
    }
    if (customId === 'btn_abrir_ticket') {
      try {
        const config = await getConfig(guild.id);
        const canal = interaction.channel;
        if (!canal || !canal.isTextBased()) return interaction.reply({ content: '❌ Canal inválido.', ephemeral: true });
        if (!canal.permissionsFor(guild.members.me).has(PermissionFlagsBits.CreatePrivateThreads)) return interaction.reply({ content: '❌ Sem permissão para threads.', ephemeral: true });
        const thread = await canal.threads.create({ name: `ticket-${interaction.user.username}`, autoArchiveDuration: 60, type: ChannelType.PrivateThread, reason: 'Ticket' });
        await thread.members.add(interaction.user.id).catch(() => {});
        if (config.ticket_cargo) await addRoleToThread(thread, config.ticket_cargo);
        const embed = new EmbedBuilder().setColor('#9B59B6').setTitle(config.ticket_titulo).setDescription(`Ticket de ${interaction.user}`)
          .addFields({ name: '👤', value: `<@${interaction.user.id}>` }, { name: '📋', value: 'Aberto' }).setTimestamp();
        const close = new ButtonBuilder().setCustomId('btn_fechar_ticket').setLabel(config.botao_fechar).setEmoji('🔒').setStyle(ButtonStyle.Danger);
        const addM = new ButtonBuilder().setCustomId('btn_add_membro').setLabel(config.botao_add_membro).setEmoji('➕').setStyle(ButtonStyle.Secondary);
        const avis = new ButtonBuilder().setCustomId('btn_avisar_adm').setLabel(config.botao_avisar).setEmoji('📢').setStyle(ButtonStyle.Primary);
        const men = new ButtonBuilder().setCustomId('btn_mencionar_staff').setLabel(config.botao_mencionar).setEmoji('👥').setStyle(ButtonStyle.Secondary);
        const row1 = new ActionRowBuilder().addComponents(close, addM);
        const row2 = new ActionRowBuilder().addComponents(avis, men);
        let content = null;
        if (config.ticket_cargo) { const c = guild.roles.cache.get(config.ticket_cargo); if (c) content = `📢 ${c}`; }
        await thread.send({ content, embeds: [embed], components: [row1, row2] });
        await supabase.from('ticket_data').upsert({ thread_id: thread.id, guild_id: guild.id, user_id: interaction.user.id });
        return interaction.reply({ content: `✅ Ticket criado em ${thread}`, ephemeral: true });
      } catch (e) { console.error(e); return interaction.reply({ content: '❌ Erro.', ephemeral: true }); }
    }
    if (customId === 'btn_fechar_ticket') {
      const thread = interaction.channel;
      if (!thread.isThread()) return interaction.reply({ content: '❌ Não é um ticket.', ephemeral: true });
      const config = await getConfig(guild.id);
      if (config.ticket_log_channel) {
        const logChannel = guild.channels.cache.get(config.ticket_log_channel);
        if (logChannel) {
          const msgs = await thread.messages.fetch({ limit: 100 });
          const transcript = msgs.reverse().map(m => `**${m.author.tag}:** ${m.content || '[sem texto]'}`).join('\n') || 'Sem mensagens.';
          const embed = new EmbedBuilder().setColor('#9B59B6').setTitle(`📝 Transcrição: ${thread.name}`).setDescription(transcript.substring(0, 4096)).setFooter({ text: `Fechado por ${interaction.user.tag}` });
          await logChannel.send({ embeds: [embed] });
          await logTicket(guild.id, interaction.user.id, thread.name, transcript, interaction.user.id);
        }
      }
      await thread.setArchived(true).catch(() => {});
      await thread.setLocked(true).catch(() => {});
      await supabase.from('ticket_data').update({ closed_at: new Date().toISOString() }).eq('thread_id', thread.id);
      return interaction.reply({ content: '🔒 Ticket fechado!', ephemeral: true });
    }
    if (customId === 'btn_avisar_adm') {
      if (!await isTicketStaff(interaction.user, guild)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const config = await getConfig(guild.id);
      const cargo = guild.roles.cache.get(config.ticket_cargo);
      if (cargo) await interaction.channel.send({ content: `📢 Atenção ${cargo}!` });
      return interaction.reply({ content: '✅ Staff avisado!', ephemeral: true });
    }
    if (customId === 'btn_mencionar_staff') {
      const config = await getConfig(guild.id);
      const cargo = guild.roles.cache.get(config.ticket_cargo);
      if (cargo) await interaction.channel.send({ content: `${cargo}, ${interaction.user} solicitou atenção.` });
      return interaction.reply({ content: '✅ Staff mencionado.', ephemeral: true });
    }
  }

  // ========== MODAIS ==========
  if (interaction.isModalSubmit()) {
    const customId = interaction.customId;

    if (customId === 'modal_vender') {
      await interaction.deferReply({ ephemeral: true });
      const campo1 = interaction.fields.getTextInputValue('input_campo1');
      const campo2 = interaction.fields.getTextInputValue('input_campo2');
      const campo3 = interaction.fields.getTextInputValue('input_campo3');
      const config = await getConfig(guild.id);
      const adminRole = guild.roles.cache.get(config.admin_role);
      try {
        const canalVenda = await guild.channels.create({
          name: `venda-${interaction.user.id}`, type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: adminRole?.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
          ]
        });
        const embed = new EmbedBuilder().setColor('#FFD700').setTitle('📧 Nova Venda').setDescription('Detalhes:').addFields(
          { name: config.venda_campo1 || 'Campo 1', value: `\`\`\`${campo1}\`\`\`` },
          { name: config.venda_campo2 || 'Campo 2', value: `\`\`\`${campo2}\`\`\`` },
          { name: config.venda_campo3 || 'Campo 3', value: `\`\`\`${campo3}\`\`\`` },
          { name: '👤 Vendedor', value: `<@${interaction.user.id}>` }
        ).setFooter({ text: 'Verifique ou recuse.' });
        const bv = new ButtonBuilder().setCustomId('btn_verificado').setLabel('Verificado').setStyle(ButtonStyle.Success).setEmoji('✅');
        const br = new ButtonBuilder().setCustomId('btn_recusado').setLabel('Recusar').setStyle(ButtonStyle.Danger).setEmoji('❌');
        await canalVenda.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(bv, br)] });
        const msg = await interaction.editReply({ content: '✅ Venda enviada!' });
        setTimeout(() => msg.delete().catch(() => {}), 5000);
      } catch { await interaction.editReply({ content: '❌ Erro.' }); }
      return;
    }
    if (customId === 'modal_comprar') {
      await interaction.deferReply({ ephemeral: true });
      const desc = interaction.fields.getTextInputValue('input_descricao_compra');
      const config = await getConfig(guild.id);
      const adminRole = guild.roles.cache.get(config.admin_role);
      try {
        const canal = await guild.channels.create({
          name: `compra-${interaction.user.id}`, type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: adminRole?.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
          ]
        });
        const embed = new EmbedBuilder().setColor('#00AAFF').setTitle('🛍️ Novo Pedido').setDescription(`**Cliente:** ${interaction.user}\n**Pedido:**\n${desc}`).setTimestamp();
        const fechar = new ButtonBuilder().setCustomId('btn_fechar_ticket').setLabel('Fechar').setStyle(ButtonStyle.Danger);
        await canal.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(fechar)] });
        return interaction.editReply({ content: `✅ Criado em ${canal}.` });
      } catch { return interaction.editReply({ content: '❌ Erro.' }); }
    }
    if (customId === 'modal_add_membro') {
      const userId = interaction.fields.getTextInputValue('input_user_id');
      const thread = interaction.channel;
      try { await thread.members.add(userId); await interaction.reply({ content: `✅ <@${userId}> adicionado.`, ephemeral: true }); }
      catch { await interaction.reply({ content: '❌ Erro.', ephemeral: true }); }
      return;
    }
    if (customId.startsWith('modal_cfg_texto_')) {
      const key = customId.replace('modal_cfg_texto_', '');
      const val = interaction.fields.getTextInputValue('input_cfg_texto');
      const config = await getConfig(guild.id);
      config[key] = val;
      await setConfig(guild.id, config);
      return interaction.reply({ content: `✅ \`${key}\` atualizado!`, ephemeral: true });
    }
    if (customId === 'modal_cfg_warnpunish') {
      const qtd = parseInt(interaction.fields.getTextInputValue('input_warn_qtd'));
      const acao = interaction.fields.getTextInputValue('input_warn_acao').toLowerCase();
      if (isNaN(qtd) || qtd < 1) return interaction.reply({ content: '❌ Quantidade inválida.', ephemeral: true });
      if (!['ban', 'kick', 'mute'].includes(acao)) return interaction.reply({ content: '❌ Ação inválida.', ephemeral: true });
      const config = await getConfig(guild.id);
      config.warn_punish_count = qtd;
      config.warn_punish_action = acao;
      await setConfig(guild.id, config);
      return interaction.reply({ content: `✅ Após **${qtd}** warns, ação: **${acao}**.`, ephemeral: true });
    }
    if (customId === 'modal_cfg_pix') {
      const config = await getConfig(guild.id);
      config.pix_key = interaction.fields.getTextInputValue('input_pix_key');
      config.pix_nome = interaction.fields.getTextInputValue('input_pix_nome') || '';
      config.pix_cidade = interaction.fields.getTextInputValue('input_pix_cidade') || '';
      await setConfig(guild.id, config);
      return interaction.reply({ content: '✅ Pix configurado!', ephemeral: true });
    }
    if (customId === 'modal_cfg_verif') {
      const config = await getConfig(guild.id);
      const t = interaction.fields.getTextInputValue('input_verif_titulo');
      const d = interaction.fields.getTextInputValue('input_verif_desc');
      const b = interaction.fields.getTextInputValue('input_verif_botao');
      const c = interaction.fields.getTextInputValue('input_verif_cor');
      if (t) config.verificacao_titulo = t;
      if (d) config.verificacao_descricao = d;
      if (b) config.verificacao_botao = b;
      if (c) config.verificacao_cor = c;
      await setConfig(guild.id, config);
      return interaction.reply({ content: '✅ Verificação atualizada!', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
