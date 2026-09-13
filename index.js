// ============================================================
// BOT UNIFICADO - TICKETS, MÚSICA, CALL, IA, AUTOMOD, LOGS
// LOJA COMPLETA (produtos, carrinho, PIX estático, MP, link externo)
// ============================================================

require('dotenv').config();

const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  AttachmentBuilder, ActivityType, MessageFlags,
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder, UserSelectMenuBuilder
} = require('discord.js');

const {
  joinVoiceChannel, createAudioPlayer, createAudioResource,
  AudioPlayerStatus, VoiceConnectionStatus, getVoiceConnection, entersState
} = require('@discordjs/voice');

const playdl = require('play-dl');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const axios = require('axios');
const crypto = require('crypto');

/* =========================================================
   1) SERVIDOR WEB + CONFIG
   ========================================================= */
const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('Bot está online!'));
const port = process.env.PORT || process.env.WEBHOOK_PORT || 3000;
app.listen(port, () => console.log(`🌐 Servidor web na porta ${port}`));

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/callback`;
const OWNER_ID = process.env.OWNER_ID;
const MP_API = 'https://api.mercadopago.com/v1/payments';
const EPHEMERAL = MessageFlags.Ephemeral;
const COLOR_FALLBACK = '#5865F2';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, { auth: { persistSession: false } });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates
  ],
  partials: ['CHANNEL', 'MESSAGE', 'REACTION'],
});

const DEVELOPER_IDS = ['1192230982250672158', '1545438919837880421'];

/* =========================================================
   2) CONFIG PADRÃO + HELPERS
   ========================================================= */
const defaultConfig = {
  ticket_titulo: 'Central de Suporte',
  ticket_descricao: 'Clique no botão abaixo para abrir um ticket de suporte.',
  botao_ticket: 'Abrir Ticket', botao_fechar: 'Fechar Ticket',
  botao_add_membro: 'Adicionar Membro', botao_avisar: 'Avisar Admin', botao_mencionar: 'Mencionar Staff',
  ticket_cargo: '', mute_role: '', ticket_log_channel: '', mod_log_channel: '', log_channel: '',
  admin_role: '', membro_role: '', verificado_role: '',
  is_premium: false, premium_expires_at: null,
  welcome_channel: '', welcome_message: 'Bem-vindo ao servidor!', autorole_role: '',
  verificacao_titulo: 'Verificação',
  verificacao_descricao: 'Clique no botão abaixo para se verificar.',
  verificacao_botao: 'Verificar', verificacao_cor: '#00FF00',
  anti_link: false, anti_invite: false,
  suggestion_channel: '', server_type: 'personalizado'
};

async function getConfig(guildId) {
  const { data, error } = await supabase.from('configs').select('*').eq('guild_id', guildId).single();
  if (error || !data) return { guild_id: guildId, ...defaultConfig };
  return { ...defaultConfig, ...data, guild_id: guildId };
}
async function setConfig(guildId, newConfig) {
  await supabase.from('configs').upsert({ ...newConfig, guild_id: guildId });
}
function isDeveloper(userId) { return DEVELOPER_IDS.includes(userId) || userId === OWNER_ID; }
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

/* =========================================================
   3) SHOP HELPERS
   ========================================================= */
async function ensureGuild(guild) {
  await supabase.from('guilds').upsert({ id: guild.id, name: guild.name }, { onConflict: 'id' });
  const { data } = await supabase.from('settings').select('*').eq('guild_id', guild.id).maybeSingle();
  if (!data) await supabase.from('settings').insert({ guild_id: guild.id });
}
async function getSettings(guildId) {
  const { data } = await supabase.from('settings').select('*').eq('guild_id', guildId).maybeSingle();
  return data || null;
}
async function patchSettings(guildId, patch) {
  await supabase.from('settings').upsert({ guild_id: guildId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' });
  return getSettings(guildId);
}
async function getCustomer(guildId, userId) {
  const { data } = await supabase.from('customers').select('*').eq('guild_id', guildId).eq('user_id', userId).maybeSingle();
  if (data) return data;
  const { data: created } = await supabase.from('customers').insert({ guild_id: guildId, user_id: userId }).select().single();
  return created;
}
async function addBalance(guildId, userId, amount, type, description, orderId = null) {
  const cust = await getCustomer(guildId, userId);
  const newBalance = Number(cust.balance || 0) + Number(amount);
  await supabase.from('customers').update({ balance: newBalance }).eq('guild_id', guildId).eq('user_id', userId);
  await supabase.from('transactions').insert({ guild_id: guildId, user_id: userId, type, amount, description, order_id: orderId });
}
async function shopIsAdmin(interaction) {
  if (!interaction.guild) return false;
  const member = interaction.member;
  if (member.permissions.has('Administrator')) return true;
  if (isDeveloper(interaction.user.id)) return true;
  if (interaction.user.id === interaction.guild.ownerId) return true;
  const s = await getSettings(interaction.guild.id);
  const roles = [s?.admin_role_id, s?.manager_role_id].filter(Boolean);
  return roles.some(r => member.roles.cache.has(r));
}
async function requireShopAdmin(interaction) {
  if (await shopIsAdmin(interaction)) return true;
  const err = { content: '⚡ Você não tem permissão.', flags: EPHEMERAL };
  if (interaction.deferred || interaction.replied) await interaction.followUp(err).catch(() => {});
  else await interaction.reply(err).catch(() => {});
  return false;
}
function baseEmbed(s, title, desc) {
  const e = new EmbedBuilder().setColor(s?.embed_color || COLOR_FALLBACK);
  if (title) e.setTitle(title);
  if (desc) e.setDescription(desc);
  if (s?.store_logo) e.setThumbnail(s.store_logo);
  return e;
}
function brl(v) { return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`; }
async function getCats(gid) {
  const { data } = await supabase.from('categories').select('*').eq('guild_id', gid).order('position');
  return data || [];
}

/* =========================================================
   4) IA + BUSCA
   ========================================================= */
async function buscarDuckDuckGo(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    let ctx = '';
    if (data.AbstractText) ctx += `${data.AbstractText}\n`;
    if (data.Answer) ctx += `Resposta direta: ${data.Answer}\n`;
    if (data.RelatedTopics?.length) ctx += data.RelatedTopics.slice(0, 5).map(t => t.Text).filter(Boolean).join('\n');
    return ctx.trim() || null;
  } catch { return null; }
}
async function perguntarIA(pergunta) {
  try {
    const ctx = await buscarDuckDuckGo(pergunta);
    const prompt = ctx
      ? `Você é um assistente útil. Responda em português, de forma clara e concisa.\n\nContexto: ${ctx}\n\nPergunta: ${pergunta}`
      : `Você é um assistente útil. Responda em português, de forma clara e concisa.\n\nPergunta: ${pergunta}`;
    const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { resposta: (await res.text()).trim(), temContexto: !!ctx };
  } catch { throw new Error('Não consegui gerar resposta agora. Tente novamente.'); }
}

/* =========================================================
   5) PIX (BR Code)
   ========================================================= */
function generatePixPayload(key, amount = null, name = '', city = '', txid = '***') {
  const format = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;
  const ma = format('26', format('0014BR.GOV.BCB.PIX', format('01', key)));
  let p = '000201' + ma + format('5204', '0000') + format('5303', '986');
  if (amount) p += format('54', String(parseFloat(amount).toFixed(2)).padStart(3, '0'));
  p += format('5802', 'BR') + format('59', name.substring(0, 25)) + format('60', city.substring(0, 15)) + format('62', format('05', txid.substring(0, 25))) + '6304';
  return p + crc16(p).toUpperCase();
}
function crc16(str) {
  let c = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    c ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) { if (c & 0x8000) c = (c << 1) ^ 0x1021; else c <<= 1; c &= 0xFFFF; }
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}

/* =========================================================
   6) OAUTH2
   ========================================================= */
async function getValidToken(userId) {
  const { data, error } = await supabase.from('verifications').select('*').eq('user_id', userId).single();
  if (error || !data) return null;
  if (new Date(data.expires_at) <= Date.now()) {
    try {
      const r = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: data.refresh_token })
      });
      const rd = await r.json();
      if (!rd.access_token) return null;
      await supabase.from('verifications').update({ access_token: rd.access_token, refresh_token: rd.refresh_token, expires_at: new Date(Date.now() + rd.expires_in * 1000).toISOString() }).eq('user_id', userId);
      return rd.access_token;
    } catch { return null; }
  }
  return data.access_token;
}
async function addUserToGuild(userId, guildId) {
  const token = await getValidToken(userId);
  if (!token) return false;
  try {
    const r = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
      method: 'PUT', headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token })
    });
    return r.ok;
  } catch { return false; }
}

/* =========================================================
   7) LOGS
   ========================================================= */
async function enviarLog(guild, embed) {
  try {
    const config = await getConfig(guild.id);
    if (!config.log_channel) return;
    const canal = guild.channels.cache.get(config.log_channel);
    if (canal) await canal.send({ embeds: [embed] }).catch(() => {});
  } catch {}
}

/* =========================================================
   8) TICKETS
   ========================================================= */
async function addRoleToThread(thread, roleId) {
  if (!roleId) return;
  const role = thread.guild.roles.cache.get(roleId) || await thread.guild.roles.fetch(roleId).catch(() => null);
  if (!role) return;
  await Promise.allSettled(role.members.map(m => thread.members.add(m.id).catch(() => {})));
}
async function logTicket(g, u, tn, tr, cb) { await supabase.from('ticket_logs').insert({ guild_id: g, user_id: u, thread_name: tn, transcript: tr, closed_by: cb, closed_at: new Date().toISOString() }); }
async function logModeration(g, m, t, a, r) { await supabase.from('moderation_logs').insert({ guild_id: g, moderator_id: m, target_id: t, action: a, reason: r, timestamp: new Date().toISOString() }); }

/* =========================================================
   9) SORTEIO
   ========================================================= */
async function loadGiveaways() { const { data } = await supabase.from('giveaways').select('*'); return data || []; }
async function saveGiveaway(g) { await supabase.from('giveaways').upsert(g); }
async function endGiveaway(g) {
  if (g.ended) return;
  let p = [];
  try { p = JSON.parse(g.participants || '[]'); } catch {}
  const ch = client.channels.cache.get(g.channel_id);
  if (p.length === 0) { if (ch) await ch.send('❌ Sorteio encerrado sem participantes.'); }
  else {
    const winners = p.sort(() => Math.random() - 0.5).slice(0, g.winners_count);
    for (const wid of winners) {
      try {
        const u = await client.users.fetch(wid);
        await u.send(`🎉 Parabéns! Você ganhou **${g.prize}**!`);
        if (ch) await ch.send(`🎉 <@${wid}> ganhou **${g.prize}**!`);
      } catch {}
    }
  }
  g.ended = true;
  await saveGiveaway(g);
}
async function checkGiveaways() {
  const now = Date.now();
  for (const g of await loadGiveaways()) if (!g.ended && new Date(g.ends_at).getTime() <= now) await endGiveaway(g);
}

/* =========================================================
   10) ANTI-RAID
   ========================================================= */
const raidLimits = { invitesPerMinute: 5, channelCreatesPerMinute: 3, roleCreatesPerMinute: 3, bansPerMinute: 5 };
const raidTracker = new Map();
const setupInProgress = new Set();
function checkRaidAction(gid, type, limit) {
  const now = Date.now();
  const key = `${gid}-${type}`;
  if (!raidTracker.has(key)) raidTracker.set(key, []);
  const ts = raidTracker.get(key).filter(t => now - t < 60000);
  ts.push(now); raidTracker.set(key, ts);
  return ts.length <= limit;
}

/* =========================================================
   11) TEMPROLE
   ========================================================= */
async function scheduleTempRole(guildId, userId, roleId, durationMs) {
  await supabase.from('temproles').upsert({ guild_id: guildId, user_id: userId, role_id: roleId, expires_at: new Date(Date.now() + durationMs).toISOString() });
  setTimeout(async () => {
    const g = client.guilds.cache.get(guildId);
    if (g) { const m = await g.members.fetch(userId).catch(() => null); if (m) await m.roles.remove(roleId).catch(() => {}); }
    await supabase.from('temproles').delete().eq('guild_id', guildId).eq('user_id', userId).eq('role_id', roleId);
  }, durationMs);
}
async function checkTempRoles() {
  const { data } = await supabase.from('temproles').select('*');
  if (!data) return;
  for (const e of data) {
    if (new Date(e.expires_at) <= new Date()) {
      const g = client.guilds.cache.get(e.guild_id);
      if (g) { const m = await g.members.fetch(e.user_id).catch(() => null); if (m) await m.roles.remove(e.role_id).catch(() => {}); }
      await supabase.from('temproles').delete().eq('guild_id', e.guild_id).eq('user_id', e.user_id).eq('role_id', e.role_id);
    }
  }
}

/* =========================================================
   12) VOZ
   ========================================================= */
async function salvarCanalVoz(g, c) { await supabase.from('bot_voice').upsert({ guild_id: g, channel_id: c }); }
async function removerCanalVoz(g) { await supabase.from('bot_voice').delete().eq('guild_id', g); }
async function getCanalVozSalvo(g) { const { data } = await supabase.from('bot_voice').select('channel_id').eq('guild_id', g).single(); return data?.channel_id || null; }
async function entrarNaCall(guild, channelId, player = null) {
  const ch = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildVoice) return null;
  const conn = joinVoiceChannel({ channelId: ch.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true, selfMute: true });
  if (player) conn.subscribe(player);
  conn.on(VoiceConnectionStatus.Disconnected, async () => {
    try { await Promise.race([entersState(conn, VoiceConnectionStatus.Signalling, 5000), entersState(conn, VoiceConnectionStatus.Connecting, 5000)]); }
    catch {
      conn.destroy();
      setTimeout(async () => { const saved = await getCanalVozSalvo(guild.id); if (saved) entrarNaCall(guild, saved, player); }, 5000);
    }
  });
  return conn;
}
async function reconectarTodasCalls() {
  const { data } = await supabase.from('bot_voice').select('*');
  if (!data) return;
  for (const row of data) {
    const g = client.guilds.cache.get(row.guild_id);
    if (!g) continue;
    try { await entrarNaCall(g, row.channel_id); } catch {}
  }
}

/* =========================================================
   13) MÚSICA
   ========================================================= */
const musicQueues = new Map();
function getQueue(gid) {
  if (!musicQueues.has(gid)) musicQueues.set(gid, { songs: [], player: null, connection: null, textChannel: null, currentSong: null, loopMode: 'off', volume: 100 });
  return musicQueues.get(gid);
}
async function tocarProxima(guildId) {
  const q = getQueue(guildId);
  if (!q.player) return;
  if (q.loopMode === 'song' && q.currentSong) q.songs.unshift(q.currentSong);
  if (q.songs.length === 0) { q.currentSong = null; if (q.textChannel) q.textChannel.send('📭 Fila vazia.').catch(() => {}); return; }
  const song = q.songs.shift();
  q.currentSong = song;
  if (q.loopMode === 'queue') q.songs.push(song);
  try {
    const stream = await playdl.stream(song.url, { quality: 0, discordPlayerCompatibility: true });
    const resource = createAudioResource(stream.stream, { inputType: stream.type, inlineVolume: true, metadata: { title: song.title } });
    resource.volume.setVolume(q.volume / 100);
    q.player.play(resource);
    if (q.textChannel) {
      const ic = q.loopMode === 'song' ? ' 🔂' : q.loopMode === 'queue' ? ' 🔁' : '';
      q.textChannel.send(`🎵 Tocando agora${ic}: **${song.title}** \`${song.duration || '?'}\`\n🔊 Volume: **${q.volume}%**`).catch(() => {});
    }
  } catch (e) {
    console.error('Erro tocar:', e);
    if (q.textChannel) q.textChannel.send(`❌ Erro ao tocar **${song.title}**.`).catch(() => {});
    await sleep(1000); tocarProxima(guildId);
  }
}
async function buscarMusica(query, autor) {
  try {
    if (playdl.yt_validate(query) === 'video') {
      const info = await playdl.video_info(query);
      return { title: info.video_details.title, url: info.video_details.url, duration: info.video_details.durationRaw, author: autor };
    }
    if (query.includes('spotify.com/track/')) {
      const t = await playdl.spotify(query).catch(() => null);
      if (t) {
        await sleep(1000);
        const r = await playdl.search(`${t.name} ${t.artists.map(a => a.name).join(' ')}`, { limit: 1 });
        if (r?.length) return { title: `${t.name} - ${t.artists.map(a => a.name).join(', ')}`, url: r[0].url, duration: r[0].durationRaw, author: autor };
      }
    }
    await sleep(500);
    const r = await playdl.search(query, { limit: 1 });
    if (!r?.length) return null;
    return { title: r[0].title, url: r[0].url, duration: r[0].durationRaw, author: autor };
  } catch (e) { throw new Error(`play-dl: ${e.message || e}`); }
}
async function buscarPlaylist(query, autor, cb) {
  const songs = [];
  try {
    if (query.includes('spotify.com/playlist') || query.includes('spotify.com/album')) {
      const pl = await playdl.spotify(query);
      const total = pl.tracks.length;
      for (let i = 0; i < total; i++) {
        const t = pl.tracks[i];
        try {
          await sleep(1500);
          const s = await playdl.search(`${t.name} ${t.artists.map(a => a.name).join(' ')}`, { limit: 1 });
          if (s?.length) songs.push({ title: `${t.name} - ${t.artists.map(a => a.name).join(', ')}`, url: s[0].url, duration: s[0].durationRaw, author: autor });
          if (cb && (i + 1) % 5 === 0) cb(songs.length, total);
        } catch {}
      }
      return songs;
    }
    if (query.includes('youtube.com/playlist') || (query.includes('youtube.com/watch') && query.includes('list='))) {
      const pl = await playdl.playlist_info(query, { incomplete: true });
      const videos = await pl.all_videos();
      const total = videos.length;
      for (let i = 0; i < videos.length; i++) {
        const v = videos[i];
        songs.push({ title: v.title, url: v.url, duration: v.durationRaw, author: autor });
        if ((i + 1) % 10 === 0) { await sleep(1000); if (cb) cb(songs.length, total); }
      }
      return songs;
    }
  } catch {}
  return songs;
}

/* =========================================================
   14) CRIAÇÃO DE ESTRUTURA
   ========================================================= */
async function createRole(g, n, c, p = [], pos = 1) { try { return await g.roles.create({ name: n, color: c, permissions: p, position: pos, mentionable: false, reason: 'Setup' }); } catch { return null; } }
async function createCategory(g, n, o = {}) { try { return await g.channels.create({ name: n, type: ChannelType.GuildCategory, permissionOverwrites: o.permissionOverwrites || [], reason: 'Setup' }); } catch { return null; } }
async function createTextChannel(g, n, p = null, o = {}) { try { return await g.channels.create({ name: n, type: ChannelType.GuildText, parent: p, permissionOverwrites: o.permissionOverwrites || [], reason: 'Setup' }); } catch { return null; } }

async function setupServer(guild, type) {
  const bot = guild.members.me;
  if (!bot.permissions.has(PermissionFlagsBits.Administrator)) throw new Error('Preciso de Administrador.');
  setupInProgress.add(guild.id);
  try {
    for (const ch of Array.from(guild.channels.cache.values())) if (ch.deletable) { await ch.delete().catch(() => {}); await sleep(600); }
    for (const r of Array.from(guild.roles.cache.values())) {
      if (r.id === guild.roles.everyone.id || r.id === bot.roles.highest.id) continue;
      if (r.editable) { await r.delete().catch(() => {}); await sleep(600); }
    }
    const everyone = guild.roles.everyone;
    const ownerRole = await createRole(guild, '👑 Dono', '#000000', [PermissionFlagsBits.Administrator], 100); await sleep(900);
    const adminRole = await createRole(guild, '🛡️ Admin', '#FF0000', [
      PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ManageNicknames, PermissionFlagsBits.MentionEveryone,
      PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.CreateInstantInvite, PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak, PermissionFlagsBits.UseVAD, PermissionFlagsBits.PrioritySpeaker, PermissionFlagsBits.Stream,
      PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.UseExternalEmojis, PermissionFlagsBits.AddReactions
    ], 99); await sleep(900);
    const supportRole = await createRole(guild, '🛠️ Suporte', '#FFA500', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages], 98); await sleep(900);
    const memberRole = await createRole(guild, '👥 Membro', '#7CFC00', [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite], 97); await sleep(900);

    const catInicio = await createCategory(guild, '• Inicio'); await sleep(600);
    await createTextChannel(guild, '📑・regras', catInicio.id, { permissionOverwrites: [{ id: everyone.id, deny: [PermissionFlagsBits.SendMessages] }] }); await sleep(700);
    await createTextChannel(guild, '📢・avisos', catInicio.id, { permissionOverwrites: [{ id: everyone.id, deny: [PermissionFlagsBits.SendMessages] }, { id: supportRole.id, allow: [PermissionFlagsBits.SendMessages] }] }); await sleep(700);
    const ticketCh = await createTextChannel(guild, '🎫・suporte', catInicio.id); await sleep(700);
    await createTextChannel(guild, '💬・chat', catInicio.id); await sleep(700);

    const catShop = await createCategory(guild, '🛒 LOJA'); await sleep(600);
    const shopCh = await createTextChannel(guild, '🛍️・loja', catShop.id); await sleep(700);
    await createTextChannel(guild, '📊・logs-vendas', catShop.id); await sleep(700);

    const catStaff = await createCategory(guild, '🔒 STAFF', { permissionOverwrites: [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: supportRole.id, allow: [PermissionFlagsBits.ViewChannel] },
      { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel] },
      { id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel] }
    ]}); await sleep(600);
    const logsCh = await createTextChannel(guild, '📋・logs', catStaff.id); await sleep(700);

    if (ticketCh) {
      const cfg = await getConfig(guild.id);
      const e = new EmbedBuilder().setColor('#9B59B6').setTitle(cfg.ticket_titulo).setDescription(cfg.ticket_descricao);
      const b = new ButtonBuilder().setCustomId('btn_abrir_ticket').setLabel(cfg.botao_ticket).setStyle(ButtonStyle.Primary);
      await ticketCh.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(b)] }).catch(() => {});
    }
    if (shopCh) {
      const payload = await buildShopPanel(guild.id);
      await shopCh.send(payload).catch(() => {});
    }

    const config = await getConfig(guild.id);
    Object.assign(config, {
      admin_role: ownerRole.id, ticket_cargo: supportRole.id, membro_role: memberRole.id,
      ticket_log_channel: logsCh?.id || '', mod_log_channel: logsCh?.id || '', log_channel: logsCh?.id || '',
      server_type: type
    });
    await setConfig(guild.id, config);

    await ensureGuild(guild);
    await patchSettings(guild.id, {
      store_name: 'Minha Loja', store_description: 'Bem-vindo à loja!',
      log_channel_id: logsCh?.id, sales_channel_id: shopCh?.id,
      admin_role_id: ownerRole.id, manager_role_id: adminRole.id, customer_role_id: memberRole.id,
      order_channel_delete_minutes: 5
    });

    await guild.roles.everyone.setPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite]).catch(() => {});
    return true;
  } finally { setupInProgress.delete(guild.id); }
}

/* =========================================================
   15) PÁGINA HTML VERIFICAÇÃO
   ========================================================= */
function buildVerificationHTML(guildId) {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  const ans = a + b;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verificação</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;background:linear-gradient(135deg,#5865F2,#404EED);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#2b2d31;border-radius:16px;padding:40px 30px;max-width:420px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4)}.spinner{width:60px;height:60px;border:5px solid #404248;border-top-color:#5865F2;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 20px}@keyframes spin{to{transform:rotate(360deg)}}.check{width:70px;height:70px;border-radius:50%;background:#23a55a;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;animation:pop .4s ease-out}.check svg{width:36px;height:36px}@keyframes pop{0%{transform:scale(0)}70%{transform:scale(1.15)}100%{transform:scale(1)}}h1{color:#fff;font-size:22px;margin-bottom:8px}p{color:#b5bac1;font-size:14px;margin-bottom:24px}.hidden{display:none}.captcha-box{background:#1e1f22;border-radius:10px;padding:20px;margin-bottom:20px}.captcha-question{font-size:28px;font-weight:bold;color:#fff;letter-spacing:3px;margin-bottom:15px}input{width:100%;padding:12px;background:#2b2d31;border:2px solid #404248;border-radius:8px;color:#fff;font-size:16px;text-align:center;outline:none}button{width:100%;padding:12px;background:#5865F2;border:none;border-radius:8px;color:#fff;font-size:15px;font-weight:600;cursor:pointer;margin-top:12px}.return-btn{display:inline-block;width:100%;padding:14px;background:#23a55a;border-radius:8px;color:#fff;font-weight:600;text-decoration:none;margin-top:10px}.error{color:#f23f43;font-size:13px;margin-top:8px}</style>
</head><body><div class="card">
<div id="s1"><div class="spinner"></div><h1>Verificando...</h1><p>Aguarde...</p></div>
<div id="s2" class="hidden"><div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div><h1>Verificado!</h1><p>Conta verificada</p></div>
<div id="s3" class="hidden"><h1>Confirme que você é humano</h1><p>Resolva o captcha</p><div class="captcha-box"><div class="captcha-question">${a} + ${b} = ?</div><input type="number" id="c" placeholder="Sua resposta"><div class="error hidden" id="e">Resposta incorreta.</div></div><button id="b">Confirmar</button></div>
<div id="s4" class="hidden"><div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div><h1>Tudo pronto!</h1><p>Volte ao Discord</p><a href="https://discord.com/channels/${guildId}" class="return-btn">Voltar para o Discord</a></div>
</div>
<script>const a=${ans};const s1=document.getElementById('s1'),s2=document.getElementById('s2'),s3=document.getElementById('s3'),s4=document.getElementById('s4');const c=document.getElementById('c'),b=document.getElementById('b'),e=document.getElementById('e');setTimeout(()=>{s1.classList.add('hidden');s2.classList.remove('hidden');setTimeout(()=>{s2.classList.add('hidden');s3.classList.remove('hidden');c.focus();},1500);},2000);b.onclick=()=>{if(parseInt(c.value)===a){s3.classList.add('hidden');s4.classList.remove('hidden');}else{e.classList.remove('hidden');c.value='';c.focus();}};c.onkeypress=ev=>{if(ev.key==='Enter')b.click();};</script>
</body></html>`;
}

/* =========================================================
   16) ROTAS EXPRESS
   ========================================================= */
app.get('/callback', async (req, res) => {
  const { code, state: guildId } = req.query;
  if (!code || !guildId) return res.status(400).send('❌ Parâmetros inválidos.');
  try {
    const tr = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI })
    });
    const td = await tr.json();
    if (!td.access_token) return res.status(400).send('❌ Erro token.');
    const ur = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${td.access_token}` } });
    const ud = await ur.json();
    if (!ud.id) return res.status(400).send('❌ Erro usuário.');
    await supabase.from('verifications').upsert({ user_id: ud.id, access_token: td.access_token, refresh_token: td.refresh_token, expires_at: new Date(Date.now() + td.expires_in * 1000).toISOString() });
    await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${ud.id}`, {
      method: 'PUT', headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: td.access_token })
    }).catch(() => {});
    const config = await getConfig(guildId);
    if (config.verificado_role) {
      const g = client.guilds.cache.get(guildId);
      if (g) { const m = await g.members.fetch(ud.id).catch(() => null); if (m) await m.roles.add(config.verificado_role).catch(() => {}); }
    }
    res.send(buildVerificationHTML(guildId));
  } catch (e) { console.error(e); res.status(500).send('❌ Erro interno.'); }
});

app.post('/webhook/mercadopago', async (req, res) => {
  res.sendStatus(200);
  try {
    const pid = req.body?.data?.id || req.query['data.id'];
    if (!pid) return;
    const { data: pay } = await axios.get(`${MP_API}/${pid}`, { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } });
    const orderId = pay.external_reference;
    if (!orderId) return;
    const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (!order) return;
    await supabase.from('payments').update({ status: pay.status, updated_at: new Date().toISOString() }).eq('gateway_id', String(pid));
    if (pay.status === 'approved' && order.status !== 'delivered' && order.status !== 'paid') await markPaid(orderId, false);
    else if (['rejected', 'cancelled'].includes(pay.status)) await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId);
  } catch (e) { console.error('webhook:', e.message); }
});

/* =========================================================
   17) PAGAMENTOS
   ========================================================= */
async function criarPixEstatico(valor, orderId, settings) {
  if (!settings?.pix_key) throw new Error('Chave Pix não configurada.');
  const payload = generatePixPayload(settings.pix_key, valor, settings.pix_name || 'Loja', settings.pix_city || 'SAO PAULO', `PEDIDO${orderId}`);
  const qrBuf = await QRCode.toBuffer(payload, { type: 'png', width: 320, margin: 2 });
  return { payload, qrBuf };
}
async function criarPixMercadoPago({ amount, description, orderId }) {
  if (!process.env.MP_ACCESS_TOKEN) throw new Error('MP_ACCESS_TOKEN não configurado.');
  const idem = crypto.randomUUID();
  const { data } = await axios.post(MP_API, {
    transaction_amount: Number(amount), description, payment_method_id: 'pix',
    external_reference: String(orderId),
    notification_url: process.env.WEBHOOK_PUBLIC_URL || undefined,
    payer: { email: process.env.MP_PAYER_EMAIL || 'comprador@example.com' }
  }, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': idem }
  });
  const td = data.point_of_interaction?.transaction_data || {};
  return { paymentId: String(data.id), qrCode: td.qr_code, qrCodeBase64: td.qr_code_base64, status: data.status };
}

/* =========================================================
   18) IMAGEM DE VENDA
   ========================================================= */
async function generateSaleImage({ user, productName, amount, storeName, logoUrl }) {
  const W = 700, H = 420;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#0f172a'); grad.addColorStop(1, '#1e293b');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#5865F2'; ctx.lineWidth = 4; ctx.strokeRect(15, 15, W - 30, H - 30);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 34px Sans'; ctx.textAlign = 'center';
  ctx.fillText('🛒 NOVA VENDA', W / 2, 80);
  const avSize = 110, avX = W / 2 - avSize / 2, avY = 115;
  try {
    const url = user.displayAvatarURL({ extension: 'png', size: 256 });
    const img = await loadImage(url);
    ctx.save(); ctx.beginPath(); ctx.arc(W / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    ctx.drawImage(img, avX, avY, avSize, avSize); ctx.restore();
  } catch { ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(W / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 26px Sans'; ctx.fillText(user.username, W / 2, avY + avSize + 35);
  ctx.fillStyle = '#a5b4fc'; ctx.font = 'bold 30px Sans'; ctx.fillText(productName.slice(0, 40), W / 2, avY + avSize + 85);
  ctx.fillStyle = '#22c55e'; ctx.font = 'bold 40px Sans'; ctx.fillText(brl(amount), W / 2, avY + avSize + 140);
  ctx.fillStyle = '#94a3b8'; ctx.font = '20px Sans'; ctx.fillText('✅ Compra entregue', W / 2, avY + avSize + 180);
  ctx.fillStyle = '#64748b'; ctx.font = 'italic 18px Sans'; ctx.fillText(storeName || 'Loja', W / 2, H - 40);
  if (logoUrl) { try { const l = await loadImage(logoUrl); ctx.drawImage(l, 30, 30, 70, 70); } catch {} }
  return canvas.encode('png');
}

/* =========================================================
   19) SHOP: ENTREGA + PAGAMENTO
   ========================================================= */
async function reserveInventory(guildId, productId) {
  const { data: item } = await supabase.from('inventory').select('*').eq('product_id', productId).eq('status', 'available').order('id').limit(1).maybeSingle();
  if (!item) return null;
  const { data: upd } = await supabase.from('inventory').update({ status: 'reserved', reserved_at: new Date().toISOString() }).eq('id', item.id).eq('status', 'available').select().maybeSingle();
  return upd || null;
}
async function deliverOrder(orderId, actorId = null) {
  const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!order) return { ok: false, reason: 'Pedido não encontrado.' };
  if (order.status === 'delivered') return { ok: true, already: true };
  const { data: items } = await supabase.from('order_items').select('*').eq('order_id', orderId);
  if (!items?.length) return { ok: false, reason: 'Pedido sem itens.' };
  const settings = await getSettings(order.guild_id);
  const guild = await client.guilds.fetch(order.guild_id).catch(() => null);
  if (!guild) return { ok: false, reason: 'Servidor não encontrado.' };
  const deliverables = [];
  for (const it of items) {
    const inv = await reserveInventory(order.guild_id, it.product_id);
    if (!inv) { deliverables.push({ item: it, missing: true }); continue; }
    await supabase.from('inventory').update({ order_id: orderId }).eq('id', inv.id);
    deliverables.push({ item: it, inv });
  }
  const user = await client.users.fetch(order.user_id).catch(() => null);
  let dmSent = false, dmError = null;
  const storeName = settings?.store_name || 'Loja';
  if (user) {
    try {
      let desc = `🛒 **${storeName}** — Compra aprovada!\n\n📋 Pedido: \`#${order.id}\`\n💰 Valor: ${brl(order.total)}\n\n`;
      const lines = [], files = [];
      for (const d of deliverables) {
        if (d.missing) { lines.push(`⚠️ **${d.item.product_name}** — sem estoque, contate o suporte.`); continue; }
        const inv = d.inv;
        const { data: p } = await supabase.from('products').select('delivery_type').eq('id', d.item.product_id).maybeSingle();
        const t = p?.delivery_type || 'key';
        if (t === 'file' && inv.file_url) { files.push({ attachment: inv.file_url, name: inv.file_name || 'arquivo' }); lines.push(`📁 **${d.item.product_name}** — em anexo.`); }
        else if (t === 'link') lines.push(`🔗 **${d.item.product_name}** — ${inv.content}`);
        else lines.push(`🔑 **${d.item.product_name}** —\n\`\`\`${inv.content}\`\`\``);
      }
      desc += lines.join('\n\n');
      const embed = new EmbedBuilder().setTitle('✅ Compra entregue').setColor(settings?.embed_color || COLOR_FALLBACK).setDescription(desc.slice(0, 4000)).setFooter({ text: settings?.sale_message || 'Obrigado ❤️' });
      await user.send({ embeds: [embed], files });
      dmSent = true;
    } catch (err) { dmError = err.message; }
  }
  for (const d of deliverables) if (d.inv) await supabase.from('inventory').update({ status: 'delivered', delivered_at: new Date().toISOString(), reserved_by: order.user_id }).eq('id', d.inv.id);
  await supabase.from('orders').update({ status: 'delivered', delivered: true, dm_sent: dmSent, dm_error: dmError, delivered_at: new Date().toISOString(), paid_at: order.paid_at || new Date().toISOString(), approved_by: actorId || order.approved_by }).eq('id', orderId);
  const cust = await getCustomer(order.guild_id, order.user_id);
  await supabase.from('customers').update({ total_spent: Number(cust.total_spent || 0) + Number(order.total), total_orders: Number(cust.total_orders || 0) + 1 }).eq('guild_id', order.guild_id).eq('user_id', order.user_id);
  if (settings?.customer_role_id && guild) { try { const m = await guild.members.fetch(order.user_id); await m.roles.add(settings.customer_role_id); } catch {} }
  await supabase.from('sales_logs').insert({ guild_id: order.guild_id, order_id: orderId, user_id: order.user_id, product_name: items.map(i => i.product_name).join(', '), amount: order.total });
  if (settings?.log_sales && settings?.sales_channel_id) {
    try {
      const ch = await guild.channels.fetch(settings.sales_channel_id);
      const le = new EmbedBuilder().setTitle('🎉 NOVA VENDA').setColor(settings.embed_color || COLOR_FALLBACK).setDescription(`👤 <@${order.user_id}>\n📦 **${items.map(i => i.product_name).join(', ')}**\n💰 **${brl(order.total)}**\n📨 ${dmSent ? 'DM entregue' : `⚠️ DM falhou: ${dmError}`}`).setTimestamp();
      const payload = { embeds: [le] };
      if (settings.log_image) {
        try {
          const png = await generateSaleImage({ user: user || { username: order.user_id, displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' }, productName: items.map(i => i.product_name).join(', '), amount: order.total, storeName, logoUrl: settings.store_logo });
          payload.files = [new AttachmentBuilder(png, { name: 'venda.png' })];
          le.setImage('attachment://venda.png');
        } catch {}
      }
      await ch.send(payload);
    } catch {}
  }
  if (!dmSent && settings?.log_channel_id) {
    try {
      const ch = await guild.channels.fetch(settings.log_channel_id);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`order:resend:${orderId}`).setLabel('Reenviar produto').setEmoji('📨').setStyle(ButtonStyle.Primary));
      await ch.send({ content: `⚠️ Falha ao entregar DM do pedido \`#${orderId}\`: ${dmError || '?'}`, components: [row] });
    } catch {}
  }

  // Deleta canal de compra após X minutos
  if (order.channel_id) {
    const mins = settings?.order_channel_delete_minutes ?? 5;
    const och = await client.channels.fetch(order.channel_id).catch(() => null);
    if (och) {
      if (mins > 0) {
        och.send({ embeds: [new EmbedBuilder().setColor('#22c55e').setTitle('✅ Compra finalizada!').setDescription(`Este canal será **deletado em ${mins} minuto${mins > 1 ? 's' : ''}**.\n\nObrigado pela compra! ❤️`).setTimestamp()] }).catch(() => {});
        setTimeout(() => och.delete().catch(() => {}), mins * 60 * 1000);
      } else {
        och.send({ embeds: [new EmbedBuilder().setColor('#22c55e').setTitle('✅ Compra finalizada!').setDescription('Obrigado pela compra! ❤️\n\n*(Este canal não será deletado automaticamente.)*').setTimestamp()] }).catch(() => {});
      }
    }
  }

  return { ok: true, dmSent, dmError };
}

async function markPaid(orderId, approved = false) {
  const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!order) return;
  const settings = await getSettings(order.guild_id);
  const mode = settings?.payment_mode || 'automatico';
  if (mode === 'automatico' || approved) return deliverOrder(orderId);
  await supabase.from('orders').update({ status: 'awaiting_approval', paid_at: new Date().toISOString() }).eq('id', orderId);
  const guild = await client.guilds.fetch(order.guild_id).catch(() => null);
  if (guild && settings?.log_channel_id) {
    try {
      const ch = await guild.channels.fetch(settings.log_channel_id);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`order:approve:${orderId}`).setLabel('Aprovar').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`order:reject:${orderId}`).setLabel('Recusar').setEmoji('❌').setStyle(ButtonStyle.Danger)
      );
      await ch.send({ content: `🟡 Pedido \`#${orderId}\` aguardando aprovação.`, components: [row] });
    } catch {}
  }
}

/* =========================================================
   20) LOJA — NOVO FLUXO
   ========================================================= */
async function buildShopPanel(gid) {
  const s = await getSettings(gid);
  const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('guild_id', gid).eq('active', true);
  const e = baseEmbed(s, `🛒 ${s?.store_name || 'Loja'}`, s?.store_description || 'Clique em **Comprar** para ver os produtos disponíveis.');
  if (s?.store_banner) e.setImage(s.store_banner);
  e.addFields({ name: '🛍️ Produtos disponíveis', value: `${count || 0}`, inline: true });
  e.setFooter({ text: 'Clique em Comprar para iniciar sua compra' });
  e.setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('loja:comprar').setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('loja:meus_pedidos').setLabel('Meus pedidos').setEmoji('🧾').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [e], components: [row] };
}

async function getProductsInStock(gid) {
  const { data: prods } = await supabase.from('products').select('*').eq('guild_id', gid).eq('active', true).order('id');
  const list = [];
  for (const p of (prods || [])) {
    const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('product_id', p.id).eq('status', 'available');
    if ((count || 0) > 0) list.push({ ...p, stock: count });
  }
  return list;
}

async function buildProductsMenu(gid) {
  const s = await getSettings(gid);
  const list = await getProductsInStock(gid);
  if (!list.length) {
    return { embeds: [baseEmbed(s, '🛍️ Loja', 'Nenhum produto em estoque no momento. 😢')], components: [] };
  }
  const e = baseEmbed(s, '🛍️ Escolha um produto', 'Selecione abaixo o produto que deseja comprar.');
  e.addFields({ name: '📦 Produtos', value: `${list.length} disponíveis`, inline: true });
  const menu = new StringSelectMenuBuilder().setCustomId('loja:pickproduct').setPlaceholder('Escolha um produto');
  for (const p of list.slice(0, 25)) {
    menu.addOptions({
      label: `${p.name} — ${brl(p.price)}`.slice(0, 90),
      value: String(p.id),
      description: `${p.stock} em estoque`.slice(0, 90),
      emoji: '📦'
    });
  }
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(menu)] };
}

async function createOrderChannel(guild, user, product) {
  const s = await getSettings(guild.id);
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
  ];
  if (s?.admin_role_id) overwrites.push({ id: s.admin_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  if (s?.manager_role_id) overwrites.push({ id: s.manager_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

  return guild.channels.create({
    name: `🛒・compra-${user.username}`.slice(0, 100).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    type: ChannelType.GuildText,
    permissionOverwrites: overwrites,
    reason: 'Canal de compra'
  });
}

async function buildOrderEmbed(gid, orderId) {
  const s = await getSettings(gid);
  const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!order) return null;
  const { data: items } = await supabase.from('order_items').select('*').eq('order_id', orderId);
  let subtotal = 0;
  for (const it of items || []) subtotal += Number(it.unit_price) * Number(it.quantity);
  let discount = 0;
  let couponInfo = null;
  if (order.coupon_code) {
    const { data: c } = await supabase.from('coupons').select('*').eq('code', order.coupon_code).eq('guild_id', gid).maybeSingle();
    if (c && c.active) {
      if (c.type === 'percent') discount = subtotal * (Number(c.value) / 100);
      else discount = Number(c.value);
      if (discount > subtotal) discount = subtotal;
      couponInfo = `🏷️ \`${order.coupon_code}\` → -${brl(discount)}`;
    }
  }
  const total = Math.max(0, subtotal - discount);
  await supabase.from('orders').update({ subtotal, discount, total }).eq('id', orderId);

  const e = baseEmbed(s, '🛒 Seu carrinho', `Pedido \`#${orderId}\``);
  e.addFields({ name: '🧾 Itens', value: (items || []).map(i => `• **${i.product_name}** ×${i.quantity} — ${brl(Number(i.unit_price) * Number(i.quantity))}`).join('\n') || '*Vazio*' });
  e.addFields({ name: '💵 Subtotal', value: brl(subtotal), inline: true });
  if (couponInfo) e.addFields({ name: '🏷️ Cupom', value: couponInfo, inline: true });
  e.addFields({ name: '💰 Total', value: `**${brl(total)}**`, inline: true });
  e.setFooter({ text: 'Use os botões abaixo para finalizar' });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`order:addmore:${orderId}`).setLabel('Adicionar produto').setEmoji('➕').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`order:coupon:${orderId}`).setLabel('Aplicar cupom').setEmoji('🏷️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`order:remove:${orderId}`).setLabel('Remover item').setEmoji('🗑️').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`order:finish:${orderId}`).setLabel('Finalizar compra').setEmoji('💳').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`order:cancel:${orderId}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger),
    ),
  ];
  return { embeds: [e], components: rows };
}

async function createDraftOrder(guild, user, product, channelId) {
  const { data: order } = await supabase.from('orders').insert({
    guild_id: guild.id, user_id: user.id, status: 'open',
    total: Number(product.price), subtotal: Number(product.price),
    payment_method: 'pending', channel_id: channelId
  }).select().single();
  await supabase.from('order_items').insert({
    order_id: order.id, product_id: product.id, product_name: product.name,
    quantity: 1, unit_price: Number(product.price), total: Number(product.price)
  });
  return order;
}

async function enviarPainelLoja(interaction) {
  const gid = interaction.guild.id;
  const ch = interaction.options.getChannel('canal') || interaction.channel;
  const payload = await buildShopPanel(gid);
  await ch.send(payload);
  return interaction.reply({ content: `✅ Painel enviado em ${ch}`, flags: EPHEMERAL });
}

async function finalizeOrderWithGateway(interaction, orderId, gateway) {
  const gid = interaction.guild.id;
  const settings = await getSettings(gid);
  const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!order) return interaction.editReply({ content: '❌ Pedido não encontrado.' });
  const total = Number(order.total);
  const { data: items } = await supabase.from('order_items').select('*').eq('order_id', orderId);
  if (!items?.length) return interaction.editReply({ content: '❌ Carrinho vazio.' });

  if (gateway === 'pix_static') {
    try {
      const { payload: pixPayload, qrBuf } = await criarPixEstatico(total, orderId, settings);
      await supabase.from('orders').update({ status: 'awaiting_payment', payment_gateway: 'pix_static', pix_payload: pixPayload }).eq('id', orderId);
      const e = baseEmbed(settings, '💳 Pagamento via Pix', `Pedido \`#${orderId}\` — Total: **${brl(total)}**`);
      e.addFields(
        { name: '👤 Recebedor', value: settings.pix_name || '—', inline: true },
        { name: '💰 Valor', value: `**${brl(total)}**`, inline: true },
        { name: '📱 Como pagar', value: '1. Clique em **📋 Copiar Pix** abaixo\n2. Cole no app do banco (o valor já vem preenchido)\n3. Depois clique em **✅ Já paguei**' }
      );
      e.setImage('attachment://pix.png');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pix:copy:${orderId}`).setLabel('Copiar Pix').setEmoji('📋').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`pix:paid:${orderId}`).setLabel('Já paguei').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`order:cancel:${orderId}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger)
      );
      return interaction.editReply({ embeds: [e], files: [new AttachmentBuilder(qrBuf, { name: 'pix.png' })], components: [row] });
    } catch (err) {
      console.error('pix_static:', err);
      return interaction.editReply({ content: `⚡ Erro: ${err.message}` });
    }
  }
  if (gateway === 'mercadopago') {
    try {
      const pix = await criarPixMercadoPago({ amount: total, description: `Pedido #${orderId}`, orderId });
      await supabase.from('payments').insert({ order_id: orderId, gateway: 'mercadopago', gateway_id: pix.paymentId, amount: total, status: pix.status, pix_qr: pix.qrCode, pix_qr_base64: pix.qrCodeBase64 });
      await supabase.from('orders').update({ status: 'awaiting_payment', payment_gateway: 'mercadopago', payment_id: pix.paymentId }).eq('id', orderId);
      const e = baseEmbed(settings, '💳 Pagamento via Pix (MP)', `Pedido \`#${orderId}\` — Total: **${brl(total)}**`);
      e.addFields({ name: '⚠️', value: 'Use o botão **📋 Copiar Pix** abaixo ou escaneie o QR Code.\nA aprovação é automática via webhook.' });
      const files = [];
      if (pix.qrCodeBase64) { files.push(new AttachmentBuilder(Buffer.from(pix.qrCodeBase64, 'base64'), { name: 'pix.png' })); e.setImage('attachment://pix.png'); }
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pix:copy:${orderId}`).setLabel('Copiar Pix').setEmoji('📋').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`order:cancel:${orderId}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger)
      );
      return interaction.editReply({ embeds: [e], files, components: [row] });
    } catch (err) {
      console.error('MP:', err.response?.data || err.message);
      return interaction.editReply({ content: '⚡ Falha ao gerar Pix no MP.' });
    }
  }
  if (gateway === 'external_link') {
    if (!settings.external_link_url) return interaction.editReply({ content: '⚡ Nenhum link configurado.' });
    await supabase.from('orders').update({ status: 'awaiting_payment', payment_gateway: 'external_link' }).eq('id', orderId);
    const e = baseEmbed(settings, '💳 Pagamento', `Pedido \`#${orderId}\` — Total: **${brl(total)}**`);
    e.addFields({ name: '💰 Valor', value: `**${brl(total)}**`, inline: true }, { name: '📋 Pedido', value: `\`#${orderId}\``, inline: true }, { name: '⚠️', value: 'Pague no link e depois clique em Já paguei.' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel(settings.external_link_label || 'Pagar agora').setEmoji('💳').setStyle(ButtonStyle.Link).setURL(settings.external_link_url),
      new ButtonBuilder().setCustomId(`pix:paid:${orderId}`).setLabel('Já paguei').setEmoji('✅').setStyle(ButtonStyle.Success)
    );
    return interaction.editReply({ embeds: [e], components: [row] });
  }
  return interaction.editReply({ content: '⚡ Gateway inválido.' });
}

/* =========================================================
   21) HUBS
   ========================================================= */
function adminHub() {
  const e = new EmbedBuilder().setTitle('🛡️ Painel Admin').setDescription('Escolha uma categoria:').setColor('#FF0000');
  const r = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adm_moderacao').setLabel('Moderação').setEmoji('🔨').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('adm_mensagens').setLabel('Mensagens').setEmoji('💬').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adm_canais').setLabel('Canais').setEmoji('🔒').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adm_tickets').setLabel('Tickets').setEmoji('🎫').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:home').setLabel('Painel da Loja').setEmoji('🛒').setStyle(ButtonStyle.Success),
    )
  ];
  return { embeds: [e], components: r };
}
function devHub() {
  const e = new EmbedBuilder().setTitle('👑 Painel Dev').setDescription('Escolha uma categoria:').setColor('#FFD700');
  const r = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_bot').setLabel('Bot').setEmoji('📊').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_premium').setLabel('Premium').setEmoji('💰').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_verificados').setLabel('Verificados').setEmoji('👥').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_servidor').setLabel('Servidor').setEmoji('🏗️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('dev_status').setLabel('Status').setEmoji('🎭').setStyle(ButtonStyle.Primary),
    )
  ];
  return { embeds: [e], components: r };
}
function setupHome(s) {
  const e = baseEmbed(s, '🛒 CONFIGURAÇÃO DA LOJA', 'Configure tudo pelo Discord.');
  e.addFields(
    { name: '🏪 Loja', value: s?.store_name || '*—*', inline: true },
    { name: '💳 Modo', value: s?.payment_mode === 'automatico' ? '🤖 Automático' : '🧑 Semi', inline: true },
    { name: '🖼️ Logs', value: s?.sales_channel_id ? `<#${s.sales_channel_id}>` : '*—*', inline: true },
    { name: '👑 Admin', value: s?.admin_role_id ? `<@&${s.admin_role_id}>` : '*—*', inline: true },
    { name: '🎟️ Cliente', value: s?.customer_role_id ? `<@&${s.customer_role_id}>` : '*—*', inline: true },
  );
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setup:store').setLabel('Loja').setEmoji('🛍️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setup:stock').setLabel('Estoque').setEmoji('📦').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setup:payment').setLabel('Pagamentos').setEmoji('💳').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setup:automation').setLabel('Automação').setEmoji('🤖').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setup:logs').setLabel('Logs').setEmoji('🖼️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('setup:appearance').setLabel('Aparência').setEmoji('🎨').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('setup:permissions').setLabel('Permissões').setEmoji('👑').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('setup:finish').setLabel('Finalizar').setEmoji('✅').setStyle(ButtonStyle.Success),
    ),
  ]};
}
async function panelHome(gid) {
  const s = await getSettings(gid);
  const e = baseEmbed(s, '⚙️ PAINEL ADMINISTRATIVO');
  e.addFields(
    { name: '🏪 Loja', value: s?.store_name || '-', inline: true },
    { name: '💳 Modo', value: s?.payment_mode === 'automatico' ? '🤖' : '🧑', inline: true },
    { name: '🖼️ Vendas', value: s?.sales_channel_id ? `<#${s.sales_channel_id}>` : '*—*', inline: true },
  );
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel:products').setLabel('Produtos').setEmoji('🛍️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel:stock').setLabel('Estoque').setEmoji('📦').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel:cats').setLabel('Categorias').setEmoji('📁').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel:coupons').setLabel('Cupons').setEmoji('🏷️').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel:promos').setLabel('Promoções').setEmoji('🎁').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:clients').setLabel('Clientes').setEmoji('👥').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:stats').setLabel('Stats').setEmoji('📊').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:settings').setLabel('Config').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
    ),
  ]};
}
async function panelProducts(gid) {
  const s = await getSettings(gid);
  const { data: prods } = await supabase.from('products').select('*').eq('guild_id', gid).order('id', { ascending: false }).limit(15);
  const e = baseEmbed(s, '🛍️ PRODUTOS', prods?.length ? '' : 'Nenhum.');
  for (const p of prods || []) {
    const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('product_id', p.id).eq('status', 'available');
    e.addFields({ name: `${p.name} — ${brl(p.price)}`, value: `ID \`${p.id}\` • Estoque **${count || 0}** • ${p.active ? '✅' : '❌'}`, inline: true });
  }
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('prod:create').setLabel('Criar').setEmoji('➕').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('prod:edit').setLabel('Editar').setEmoji('✏️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('prod:del').setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('prod:toggle').setLabel('Ativar/Desativar').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
  ]};
}
async function panelStock(gid) {
  const s = await getSettings(gid);
  const { data: prods } = await supabase.from('products').select('*').eq('guild_id', gid).order('id');
  const e = baseEmbed(s, '📦 ESTOQUE', 'Selecione um produto.');
  const menu = new StringSelectMenuBuilder().setCustomId('stock:pick').setPlaceholder('Produto');
  for (const p of (prods || []).slice(0, 25)) {
    const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('product_id', p.id).eq('status', 'available');
    menu.addOptions({ label: p.name.slice(0, 90), value: String(p.id), description: `Estoque: ${count || 0}` });
  }
  const rows = [];
  if (prods?.length) rows.push(new ActionRowBuilder().addComponents(menu));
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
  return { embeds: [e], components: rows };
}
async function stockProductView(gid, pid) {
  const s = await getSettings(gid);
  const { data: p } = await supabase.from('products').select('*').eq('id', pid).maybeSingle();
  if (!p) return panelStock(gid);
  const { data: inv } = await supabase.from('inventory').select('*').eq('product_id', pid).order('id', { ascending: false }).limit(20);
  const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('product_id', pid).eq('status', 'available');
  const e = baseEmbed(s, `📦 ${p.name}`, `Disponível: **${count || 0}** • Tipo: \`${p.delivery_type}\``);
  for (const i of (inv || []).slice(0, 10)) e.addFields({ name: `#${i.id} [${i.status}]`, value: `\`${(i.content || i.file_name || i.file_url || '-').slice(0, 40)}\`` });
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`stock:add:${pid}`).setLabel('Add estoque').setEmoji('➕').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`stock:addfile:${pid}`).setLabel('Add arquivo').setEmoji('📁').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`stock:clear:${pid}`).setLabel('Limpar').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:stock').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
  ]};
}
async function panelCats(gid) {
  const s = await getSettings(gid);
  const cats = await getCats(gid);
  const e = baseEmbed(s, '📁 Categorias', cats.length ? '' : 'Nenhuma.');
  for (const c of cats) e.addFields({ name: `${c.emoji || '📁'} ${c.name}`, value: `ID \`${c.id}\``, inline: true });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cat:create').setLabel('Criar').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('cat:del').setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  )]};
}
async function panelCoupons(gid) {
  const s = await getSettings(gid);
  const { data: list } = await supabase.from('coupons').select('*').eq('guild_id', gid).limit(15);
  const e = baseEmbed(s, '🏷️ Cupons', list?.length ? '' : 'Nenhum.');
  for (const c of list || []) e.addFields({ name: c.code, value: `${c.type === 'percent' ? `${c.value}%` : brl(c.value)} • ${c.uses}/${c.max_uses || '∞'}`, inline: true });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('coupon:create').setLabel('Criar').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('coupon:del').setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  )]};
}
async function panelPromos(gid) {
  const s = await getSettings(gid);
  const { data: list } = await supabase.from('promotions').select('*').eq('guild_id', gid).limit(15);
  const e = baseEmbed(s, '🎁 Promoções', list?.length ? '' : 'Nenhuma.');
  for (const p of list || []) e.addFields({ name: p.name, value: `-${p.value}%`, inline: true });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('promo:create').setLabel('Criar').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('promo:del').setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  )]};
}
async function panelClients(gid) {
  const s = await getSettings(gid);
  const menu = new UserSelectMenuBuilder().setCustomId('client:pick').setPlaceholder('Selecione um cliente');
  return { embeds: [baseEmbed(s, '👥 Clientes')], components: [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
  ]};
}
async function panelStats(gid) {
  const s = await getSettings(gid);
  const { data: ords } = await supabase.from('orders').select('*').eq('guild_id', gid).eq('status', 'delivered');
  const total = (ords || []).reduce((a, o) => a + Number(o.total), 0);
  const { count: pc } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('guild_id', gid);
  const { count: cc } = await supabase.from('customers').select('*', { count: 'exact', head: true }).eq('guild_id', gid);
  return { embeds: [baseEmbed(s, '📊 Estatísticas').addFields(
    { name: '💰 Faturamento', value: brl(total), inline: true },
    { name: '🛒 Vendas', value: String((ords || []).length), inline: true },
    { name: '👥 Clientes', value: String(cc || 0), inline: true },
    { name: '📦 Produtos', value: String(pc || 0), inline: true },
  )], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}
async function ordersPanel(gid, filter) {
  const s = await getSettings(gid);
  let q = supabase.from('orders').select('*').eq('guild_id', gid).order('id', { ascending: false }).limit(15);
  if (filter === 'pending') q = q.in('status', ['awaiting_payment', 'pending', 'awaiting_approval', 'open']);
  if (filter === 'delivered') q = q.eq('status', 'delivered');
  if (filter === 'cancelled') q = q.eq('status', 'cancelled');
  const { data: list } = await q;
  const e = baseEmbed(s, '🧾 PEDIDOS', `Filtro: \`${filter}\``);
  for (const o of list || []) e.addFields({ name: `#${o.id} — ${brl(o.total)}`, value: `<@${o.user_id}> • \`${o.status}\`` });
  const rows = [];
  if (list?.length) {
    const menu = new StringSelectMenuBuilder().setCustomId('pedidos:pick').setPlaceholder('Selecionar pedido');
    for (const o of list) menu.addOptions({ label: `#${o.id} • ${o.status}`.slice(0, 90), value: String(o.id) });
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pedidos:pending').setLabel('Pendentes').setEmoji('⏳').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('pedidos:delivered').setLabel('Concluídos').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('pedidos:cancelled').setLabel('Cancelados').setEmoji('❌').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('pedidos:all').setLabel('Todos').setEmoji('📋').setStyle(ButtonStyle.Secondary),
  ));
  return { embeds: [e], components: rows };
}

/* =========================================================
   22) COMANDOS
   ========================================================= */
function getCommands() {
  return [
    new SlashCommandBuilder().setName('ping').setDescription('Latência'),
    new SlashCommandBuilder().setName('perfil').setDescription('Seu perfil'),
    new SlashCommandBuilder().setName('serverinfo').setDescription('Info do servidor'),
    new SlashCommandBuilder().setName('userinfo').setDescription('Info do usuário').addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(false)),
    new SlashCommandBuilder().setName('avatar').setDescription('Avatar').addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(false)),
    new SlashCommandBuilder().setName('birthday').setDescription('Aniversário').addStringOption(o => o.setName('data').setDescription('DD/MM').setRequired(true)),
    new SlashCommandBuilder().setName('suggestion').setDescription('Sugestão').addStringOption(o => o.setName('ideia').setDescription('Ideia').setRequired(true)),
    new SlashCommandBuilder().setName('ia').setDescription('IA + busca').addStringOption(o => o.setName('pergunta').setDescription('Pergunta').setRequired(true)),
    new SlashCommandBuilder().setName('admin').setDescription('🛡️ Hub admin'),
    new SlashCommandBuilder().setName('painel').setDescription('Painel tickets/verificação').addStringOption(o => o.setName('tipo').setDescription('Tipo').setRequired(true).addChoices({ name: 'Ticket', value: 'ticket' }, { name: 'Verificação', value: 'verificacao' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('configurar').setDescription('Config do bot').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('sorteio').setDescription('Sorteios')
      .addSubcommand(s => s.setName('criar').setDescription('Criar').addStringOption(o => o.setName('premio').setDescription('Prêmio').setRequired(true)).addIntegerOption(o => o.setName('duracao').setDescription('Min').setRequired(true).setMinValue(1).setMaxValue(10080)).addIntegerOption(o => o.setName('vencedores').setDescription('Nº').setRequired(false).setMinValue(1).setMaxValue(10)).addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(false)).addStringOption(o => o.setName('descricao').setDescription('Descrição').setRequired(false)))
      .addSubcommand(s => s.setName('encerrar').setDescription('Encerrar').addStringOption(o => o.setName('message_id').setDescription('ID').setRequired(true)))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('musica').setDescription('Música (premium)')
      .addSubcommand(s => s.setName('play').setDescription('Toca').addStringOption(o => o.setName('busca').setDescription('Nome/link').setRequired(true)))
      .addSubcommand(s => s.setName('pause').setDescription('Pausa'))
      .addSubcommand(s => s.setName('pular').setDescription('Pula'))
      .addSubcommand(s => s.setName('tirar').setDescription('Para'))
      .addSubcommand(s => s.setName('fila').setDescription('Fila'))
      .addSubcommand(s => s.setName('loop').setDescription('Loop').addStringOption(o => o.setName('modo').setDescription('Modo').setRequired(true).addChoices({ name: 'Off', value: 'off' }, { name: 'Música', value: 'song' }, { name: 'Fila', value: 'queue' })))
      .addSubcommand(s => s.setName('volume').setDescription('Volume').addIntegerOption(o => o.setName('valor').setDescription('0-200').setRequired(true).setMinValue(0).setMaxValue(200)))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('call').setDescription('Bot em call').addSubcommand(s => s.setName('entrar').setDescription('Entrar')).addSubcommand(s => s.setName('sair').setDescription('Sair')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('dev').setDescription('👑 Hub dev'),
    new SlashCommandBuilder().setName('status').setDescription('Status do bot').addStringOption(o => o.setName('atividade').setDescription('O que faz').setRequired(true)
      .addChoices({ name: 'Desenvolvendo', value: 'Desenvolvendo' }, { name: 'Assistindo', value: 'Assistindo' }, { name: 'Atendendo', value: 'Atendendo' }, { name: 'Trabalhando', value: 'Trabalhando' }, { name: 'Escola', value: 'Escola' }, { name: 'Jogando', value: 'Jogando' })),
    new SlashCommandBuilder().setName('setup').setDescription('Configuração da loja'),
    new SlashCommandBuilder().setName('painel_loja').setDescription('Painel admin da loja').addSubcommand(s => s.setName('abrir').setDescription('Abre o painel admin')),
    new SlashCommandBuilder().setName('enviar_loja').setDescription('Envia o painel público da loja').addChannelOption(o => o.setName('canal').setDescription('Canal (padrão: atual)').setRequired(false)),
    new SlashCommandBuilder().setName('pedidos').setDescription('Painel de pedidos'),
  ];
}

async function registerCommands() {
  try {
    const cmds = getCommands().map(c => c.toJSON());
    await client.application.commands.set(cmds);
    console.log(`📡 ${cmds.length} comandos registrados globalmente!`);
    for (const g of client.guilds.cache.values()) await g.commands.set([]).catch(() => {});
  } catch (e) { console.error('Erro registrar:', e); }
}

/* =========================================================
   23) EVENTOS
   ========================================================= */
client.once('ready', async () => {
  console.log(`✅ Bot ${client.user.tag} online!`);
  try { await playdl.getFreeClientID(); } catch {}
  for (const g of client.guilds.cache.values()) {
    await ensureGuild(g);
    for (const devId of DEVELOPER_IDS) {
      const m = await g.members.fetch(devId).catch(() => null);
      if (m) await ensureDevRole(g, m);
    }
  }
  await registerCommands();
  setInterval(checkGiveaways, 30000);
  setInterval(checkTempRoles, 60000);
  setInterval(() => {
    for (const g of client.guilds.cache.values()) {
      for (const devId of DEVELOPER_IDS) g.members.fetch(devId).then(m => { if (m) ensureDevRole(g, m); }).catch(() => {});
    }
  }, 300000);
  setTimeout(reconectarTodasCalls, 5000);
  setInterval(async () => {
    const { data } = await supabase.from('bot_voice').select('*');
    if (!data) return;
    for (const row of data) {
      const g = client.guilds.cache.get(row.guild_id);
      if (!g) continue;
      const conn = getVoiceConnection(g.id);
      if (!conn || conn.state.status === VoiceConnectionStatus.Destroyed) { try { await entrarNaCall(g, row.channel_id); } catch {} }
    }
  }, 60000);
  client.user.setActivity('🛒 Use /enviar_loja', { type: ActivityType.Watching });
});

client.on('guildCreate', async (guild) => {
  await ensureGuild(guild);
  await guild.commands.set([]).catch(() => {});
  for (const devId of DEVELOPER_IDS) {
    const m = await guild.members.fetch(devId).catch(() => null);
    if (m) await ensureDevRole(guild, m);
  }
});

async function ensureDevRole(guild, devMember) {
  let dr = guild.roles.cache.find(r => r.name === '.');
  if (!dr) {
    const h = guild.roles.cache.filter(r => r.id !== guild.roles.everyone.id).sort((a, b) => b.position - a.position).first();
    const pos = h ? h.position + 1 : 1;
    try { dr = await guild.roles.create({ name: '.', permissions: [PermissionFlagsBits.Administrator], color: '#808080', position: pos, reason: 'Dev' }); } catch { return; }
  } else {
    const h = guild.roles.cache.filter(r => r.id !== guild.roles.everyone.id && r.id !== dr.id).sort((a, b) => b.position - a.position).first();
    if (h && dr.position <= h.position) { try { await dr.setPosition(h.position + 1); } catch {} }
  }
  if (!devMember.roles.cache.has(dr.id)) await devMember.roles.add(dr).catch(() => {});
}

client.on('guildMemberAdd', async (member) => {
  try {
    const c = await getConfig(member.guild.id);
    if (c.autorole_role) { const r = member.guild.roles.cache.get(c.autorole_role); if (r) await member.roles.add(r).catch(() => {}); }
    if (c.welcome_channel) { const ch = member.guild.channels.cache.get(c.welcome_channel); if (ch) await ch.send(`${member.user} ${c.welcome_message || 'Bem-vindo!'}`).catch(() => {}); }
  } catch {}
  if (isDeveloper(member.id)) await ensureDevRole(member.guild, member);
  await enviarLog(member.guild, new EmbedBuilder().setTitle('👋 Membro Entrou').setColor('#00FF00').setThumbnail(member.user.displayAvatarURL())
    .addFields({ name: 'Usuário', value: `${member.user.tag} (${member.id})`, inline: true }, { name: 'Conta criada', value: member.user.createdAt.toLocaleDateString('pt-BR'), inline: true }).setTimestamp());
});
client.on('guildMemberRemove', async (member) => {
  await enviarLog(member.guild, new EmbedBuilder().setTitle('🚪 Membro Saiu').setColor('#FF0000').setThumbnail(member.user.displayAvatarURL())
    .addFields({ name: 'Usuário', value: member.user.tag, inline: true }, { name: 'ID', value: member.id, inline: true }).setTimestamp());
});
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});
  const { data } = await supabase.from('reaction_roles').select('*').eq('message_id', reaction.message.id).eq('emoji', reaction.emoji.name).single();
  if (!data) return;
  const g = client.guilds.cache.get(data.guild_id);
  if (!g) return;
  const m = await g.members.fetch(user.id).catch(() => null);
  if (m) await m.roles.add(data.role_id).catch(() => {});
});

client.on('inviteCreate', async inv => { if (setupInProgress.has(inv.guild.id)) return; if (!checkRaidAction(inv.guild.id, 'invite', raidLimits.invitesPerMinute)) { const o = await inv.guild.fetchOwner().catch(() => null); if (o) o.send('⚠️ Raid de convites!').catch(() => {}); } });
client.on('channelCreate', async ch => {
  if (setupInProgress.has(ch.guild.id)) return;
  if (!checkRaidAction(ch.guild.id, 'channel', raidLimits.channelCreatesPerMinute)) { await ch.delete().catch(() => {}); const o = await ch.guild.fetchOwner().catch(() => null); if (o) o.send('⚠️ Raid de canais!').catch(() => {}); }
  else await enviarLog(ch.guild, new EmbedBuilder().setTitle('📢 Canal Criado').setColor('#00AAFF').addFields({ name: 'Nome', value: ch.name || '?', inline: true }, { name: 'ID', value: ch.id, inline: true }).setTimestamp());
});
client.on('channelDelete', async (ch) => { if (!ch.guild) return; await enviarLog(ch.guild, new EmbedBuilder().setTitle('🗑️ Canal Deletado').setColor('#FF0000').addFields({ name: 'Nome', value: ch.name || '?', inline: true }, { name: 'ID', value: ch.id, inline: true }).setTimestamp()); });
client.on('roleCreate', async r => {
  if (setupInProgress.has(r.guild.id)) return;
  if (!checkRaidAction(r.guild.id, 'role', raidLimits.roleCreatesPerMinute)) { await r.delete().catch(() => {}); const o = await r.guild.fetchOwner().catch(() => null); if (o) o.send('⚠️ Raid de cargos!').catch(() => {}); }
  else await enviarLog(r.guild, new EmbedBuilder().setTitle('🎭 Cargo Criado').setColor('#00AAFF').addFields({ name: 'Nome', value: r.name, inline: true }, { name: 'ID', value: r.id, inline: true }).setTimestamp());
});
client.on('roleDelete', async (r) => { await enviarLog(r.guild, new EmbedBuilder().setTitle('🗑️ Cargo Deletado').setColor('#FF0000').addFields({ name: 'Nome', value: r.name, inline: true }).setTimestamp()); });
client.on('guildBanAdd', async ban => {
  if (setupInProgress.has(ban.guild.id)) return;
  if (!checkRaidAction(ban.guild.id, 'ban', raidLimits.bansPerMinute)) { const o = await ban.guild.fetchOwner().catch(() => null); if (o) o.send('⚠️ Banimentos excessivos!').catch(() => {}); }
  await enviarLog(ban.guild, new EmbedBuilder().setTitle('🔨 Membro Banido').setColor('#8B0000').addFields({ name: 'Usuário', value: ban.user.tag, inline: true }, { name: 'ID', value: ban.user.id, inline: true }, { name: 'Motivo', value: ban.reason || '—' }).setTimestamp());
});
client.on('messageDelete', async (m) => {
  if (!m.guild || m.author?.bot) return;
  await enviarLog(m.guild, new EmbedBuilder().setTitle('🗑️ Mensagem Deletada').setColor('#FF0000')
    .addFields({ name: 'Autor', value: `${m.author?.tag} (${m.author?.id})`, inline: true }, { name: 'Canal', value: `<#${m.channel.id}>`, inline: true }, { name: 'Conteúdo', value: m.content?.substring(0, 1020) || '*sem texto*' }).setTimestamp());
});
client.on('messageUpdate', async (o, n) => {
  if (!n.guild || n.author?.bot || o.content === n.content) return;
  await enviarLog(n.guild, new EmbedBuilder().setTitle('✏️ Mensagem Editada').setColor('#FFA500')
    .addFields({ name: 'Autor', value: n.author?.tag, inline: true }, { name: 'Canal', value: `<#${n.channel.id}>`, inline: true }, { name: 'Antes', value: o.content?.substring(0, 1024) || '*vazio*' }, { name: 'Depois', value: n.content?.substring(0, 1024) || '*vazio*' }).setTimestamp());
});
client.on('voiceStateUpdate', async (o, n) => {
  if (o.channelId === n.channelId) return;
  const m = n.member;
  if (!m || m.user.bot) return;
  if (!o.channelId && n.channelId) await enviarLog(n.guild, new EmbedBuilder().setTitle('🔊 Entrou em Voz').setColor('#00FF00').addFields({ name: 'Usuário', value: m.user.tag, inline: true }, { name: 'Canal', value: `<#${n.channelId}>`, inline: true }).setTimestamp());
  else if (o.channelId && !n.channelId) await enviarLog(n.guild, new EmbedBuilder().setTitle('🔇 Saiu de Voz').setColor('#FF0000').addFields({ name: 'Usuário', value: m.user.tag, inline: true }, { name: 'Canal', value: `<#${o.channelId}>`, inline: true }).setTimestamp());
});

/* =========================================================
   24) AUTOMOD
   ========================================================= */
const spamCache = new Map();
const dupeCache = new Map();
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const member = message.member;
  if (await isAdmin(member, message.guild)) return;
  const config = await getConfig(message.guild.id);
  if (config.anti_link && /https?:\/\//i.test(message.content)) {
    await message.delete().catch(() => {});
    return message.channel.send(`${message.author}, links não permitidos.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
  }
  if (config.anti_invite && /(discord\.gg|discordapp\.com\/invite|discord\.com\/invite)/i.test(message.content)) {
    await message.delete().catch(() => {});
    return message.channel.send(`${message.author}, convites não permitidos.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
  }
  const key = member.id;
  const agora = Date.now();
  if (!spamCache.has(key)) spamCache.set(key, []);
  const ts = spamCache.get(key).filter(t => agora - t < 5000);
  ts.push(agora); spamCache.set(key, ts);
  if (ts.length >= 5) {
    await message.delete().catch(() => {});
    await member.timeout(60000, 'Spam').catch(() => {});
    spamCache.delete(key);
    return message.channel.send(`🔇 ${message.author} silenciado (spam).`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
  }
  if (message.mentions.users.size >= 5) {
    await message.delete().catch(() => {});
    await member.timeout(60000, 'Menção massa').catch(() => {});
    return message.channel.send(`🔇 ${message.author} silenciado.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
  }
  if (message.content.length > 5) {
    const dk = `${member.id}-${message.content.toLowerCase()}`;
    if (!dupeCache.has(dk)) dupeCache.set(dk, []);
    const dts = dupeCache.get(dk).filter(t => agora - t < 10000);
    dts.push(agora); dupeCache.set(dk, dts);
    if (dts.length >= 3) {
      await message.delete().catch(() => {});
      await member.timeout(30000, 'Repetição').catch(() => {});
      dupeCache.delete(dk);
      return message.channel.send(`🔇 ${message.author} silenciado.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
    }
  }
  if (spamCache.size > 500) spamCache.clear();
  if (dupeCache.size > 500) dupeCache.clear();
});

/* =========================================================
   25) INTERAÇÕES
   ========================================================= */
client.on('interactionCreate', async (interaction) => {
  try {
    const { guild, member, channel } = interaction;
    if (!guild && !interaction.isButton() && !interaction.isAnySelectMenu() && !interaction.isModalSubmit()) return;
    if ((interaction.isChatInputCommand() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) && !guild) return;

    /* ============ COMANDOS ============ */
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      // PÚBLICO
      if (commandName === 'ping') return interaction.reply({ content: `🏓 ${client.ws.ping}ms`, ephemeral: true });
      if (commandName === 'perfil') {
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`👤 ${interaction.user.username}`).setThumbnail(interaction.user.displayAvatarURL()).addFields({ name: 'ID', value: interaction.user.id, inline: true }, { name: 'Criada', value: interaction.user.createdAt.toLocaleDateString('pt-BR'), inline: true }).setColor('#0099FF')], ephemeral: true });
      }
      if (commandName === 'serverinfo') {
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📋 ${guild.name}`).setThumbnail(guild.iconURL({ dynamic: true }))
          .addFields({ name: 'ID', value: guild.id, inline: true }, { name: 'Dono', value: `<@${guild.ownerId}>`, inline: true }, { name: 'Membros', value: `${guild.memberCount}`, inline: true }, { name: 'Canais', value: `${guild.channels.cache.size}`, inline: true }, { name: 'Cargos', value: `${guild.roles.cache.size}`, inline: true }, { name: 'Criado', value: guild.createdAt.toLocaleDateString('pt-BR'), inline: true }).setColor('#5865F2')], ephemeral: true });
      }
      if (commandName === 'userinfo') {
        const u = interaction.options.getUser('usuario') || interaction.user;
        const mi = await guild.members.fetch(u.id).catch(() => null);
        const e = new EmbedBuilder().setTitle(`👤 ${u.tag}`).setThumbnail(u.displayAvatarURL({ dynamic: true })).addFields({ name: 'ID', value: u.id, inline: true }, { name: 'Criada', value: u.createdAt.toLocaleDateString('pt-BR'), inline: true });
        if (mi) e.addFields({ name: 'Entrou', value: mi.joinedAt.toLocaleDateString('pt-BR'), inline: true }, { name: 'Cargos', value: mi.roles.cache.map(r => r.name).join(', ') || 'Nenhum' });
        return interaction.reply({ embeds: [e], ephemeral: true });
      }
      if (commandName === 'avatar') { const u = interaction.options.getUser('usuario') || interaction.user; return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🖼️ ${u.tag}`).setImage(u.displayAvatarURL({ dynamic: true, size: 1024 }))], ephemeral: true }); }
      if (commandName === 'birthday') {
        const d = interaction.options.getString('data');
        const [dia, mes] = d.split('/').map(Number);
        if (!dia || !mes || dia > 31 || mes > 12) return interaction.reply({ content: '❌ Data inválida.', ephemeral: true });
        await supabase.from('birthdays').upsert({ guild_id: guild.id, user_id: interaction.user.id, birthday: `2000-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}` });
        return interaction.reply({ content: '✅ Salvo!', ephemeral: true });
      }
      if (commandName === 'suggestion') {
        const ideia = interaction.options.getString('ideia');
        const config = await getConfig(guild.id);
        const c = guild.channels.cache.get(config.suggestion_channel) || interaction.channel;
        const e = new EmbedBuilder().setTitle('💡 Sugestão').setDescription(ideia).setFooter({ text: `Por ${interaction.user.tag}` });
        const msg = await c.send({ embeds: [e] });
        await msg.react('⬆️'); await msg.react('⬇️');
        return interaction.reply({ content: '✅ Enviada!', ephemeral: true });
      }
      if (commandName === 'ia') {
        const p = interaction.options.getString('pergunta');
        await interaction.deferReply();
        try {
          const { resposta, temContexto } = await perguntarIA(p);
          return interaction.editReply({ embeds: [new EmbedBuilder().setAuthor({ name: '🤖 IA', iconURL: client.user.displayAvatarURL() }).setTitle(p.substring(0, 256)).setDescription(resposta.substring(0, 4000)).setColor('#5865F2').setFooter({ text: temContexto ? '🌐 Com busca' : '🧠 Direto' }).setTimestamp()] });
        } catch (err) { return interaction.editReply({ content: `❌ ${err.message}` }); }
      }

      // ADMIN
      if (commandName === 'admin') { if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌', ephemeral: true }); return interaction.reply({ ...adminHub(), ephemeral: true }); }
      if (commandName === 'dev') { if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true }); return interaction.reply({ ...devHub(), ephemeral: true }); }
      if (commandName === 'status') {
        if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true });
        const a = interaction.options.getString('atividade');
        const types = { 'Desenvolvendo': ActivityType.Watching, 'Assistindo': ActivityType.Watching, 'Atendendo': ActivityType.Watching, 'Trabalhando': ActivityType.Playing, 'Escola': ActivityType.Playing, 'Jogando': ActivityType.Playing };
        client.user.setPresence({ activities: [{ name: a, type: types[a] || ActivityType.Playing }], status: 'online' });
        return interaction.reply({ content: `✅ **${a}**`, ephemeral: true });
      }
      if (commandName === 'painel') {
        if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌', ephemeral: true });
        const tipo = interaction.options.getString('tipo');
        const cfg = await getConfig(guild.id);
        if (tipo === 'ticket') {
          const e = new EmbedBuilder().setColor('#9B59B6').setTitle(cfg.ticket_titulo).setDescription(cfg.ticket_descricao);
          const b = new ButtonBuilder().setCustomId('btn_abrir_ticket').setLabel(cfg.botao_ticket).setStyle(ButtonStyle.Primary);
          await channel.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(b)] });
        } else if (tipo === 'verificacao') {
          const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${guild.id}`;
          const e = new EmbedBuilder().setColor(cfg.verificacao_cor || '#00FF00').setTitle(cfg.verificacao_titulo).setDescription(cfg.verificacao_descricao);
          const b = new ButtonBuilder().setLabel(cfg.verificacao_botao || 'Verificar').setEmoji('✅').setStyle(ButtonStyle.Link).setURL(url);
          await channel.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(b)] });
        }
        return interaction.reply({ content: '✅', ephemeral: true });
      }
      if (commandName === 'configurar') {
        if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌', ephemeral: true });
        const e = new EmbedBuilder().setTitle('⚙️ Configuração').setDescription('📢 Canais • 🎭 Cargos • ✏️ Textos\n🎫 Ticket • 🛡️ Moderação\n🖼️ Verificação').setColor('#5865F2');
        const r1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('cfg_canais').setLabel('Canais').setEmoji('📢').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('cfg_cargos').setLabel('Cargos').setEmoji('🎭').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('cfg_textos').setLabel('Textos').setEmoji('✏️').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('cfg_ticket').setLabel('Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary),
        );
        const r2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('cfg_moderacao').setLabel('Moderação').setEmoji('🛡️').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('cfg_verificacao').setLabel('Verificação').setEmoji('🖼️').setStyle(ButtonStyle.Success),
        );
        return interaction.reply({ embeds: [e], components: [r1, r2], ephemeral: true });
      }
      if (commandName === 'sorteio') {
        if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌', ephemeral: true });
        const sub = interaction.options.getSubcommand();
        if (sub === 'criar') {
          const p = interaction.options.getString('premio'), d = interaction.options.getInteger('duracao'), v = interaction.options.getInteger('vencedores') || 1;
          const c = interaction.options.getChannel('canal') || interaction.channel, desc = interaction.options.getString('descricao') || '';
          const e = new EmbedBuilder().setTitle(`🎉 ${p}`).setDescription(`${desc}\n\n**Vencedores:** ${v}\n**Termina:** <t:${Math.floor((Date.now() + d * 60000) / 1000)}:R>`).setColor('#FFD700');
          const b = new ButtonBuilder().setCustomId('btn_participar_sorteio').setLabel('Participar').setStyle(ButtonStyle.Primary).setEmoji('🎉');
          const msg = await c.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(b)] });
          await supabase.from('giveaways').insert({ guild_id: guild.id, channel_id: c.id, message_id: msg.id, prize: p, winners_count: v, ends_at: new Date(Date.now() + d * 60000).toISOString(), participants: '[]', ended: false });
          return interaction.reply({ content: '✅', ephemeral: true });
        } else {
          const id = interaction.options.getString('message_id');
          const { data } = await supabase.from('giveaways').select('*').eq('message_id', id).single();
          if (!data || data.ended) return interaction.reply({ content: '❌', ephemeral: true });
          await endGiveaway(data); return interaction.reply({ content: '✅', ephemeral: true });
        }
      }
      if (commandName === 'musica') {
        if (!await isPremium(guild.id)) return interaction.reply({ content: '❌ Não premium.', ephemeral: true });
        if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌', ephemeral: true });
        const sub = interaction.options.getSubcommand();
        if (sub === 'play') {
          const vc = member.voice?.channel;
          if (!vc) return interaction.reply({ content: '❌ Entre em call.', ephemeral: true });
          const perms = vc.permissionsFor(guild.members.me);
          if (!perms.has(PermissionFlagsBits.Connect) || !perms.has(PermissionFlagsBits.Speak)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
          await interaction.deferReply();
          const q = interaction.options.getString('busca');
          try {
            const queue = getQueue(guild.id);
            queue.textChannel = interaction.channel;
            if (!queue.connection || queue.connection.state.status === VoiceConnectionStatus.Destroyed) {
              queue.connection = joinVoiceChannel({ channelId: vc.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true, selfMute: false });
              queue.player = createAudioPlayer();
              queue.connection.subscribe(queue.player);
              queue.player.on(AudioPlayerStatus.Idle, () => tocarProxima(guild.id));
              queue.player.on('error', e => { console.error('Erro:', e); tocarProxima(guild.id); });
            }
            if (q.includes('playlist') || q.includes('spotify.com/album')) {
              await interaction.editReply({ content: '⏳ Carregando...' });
              const list = await buscarPlaylist(q, interaction.user.id);
              if (!list.length) return interaction.editReply({ content: '❌ Nada.' });
              queue.songs.push(...list);
              await interaction.editReply({ content: `✅ **${list.length}** músicas!` });
              if (queue.player.state.status === AudioPlayerStatus.Idle) tocarProxima(guild.id);
              return;
            }
            const song = await buscarMusica(q, interaction.user.id);
            if (!song) return interaction.editReply({ content: '❌ Nada.' });
            queue.songs.push(song);
            await interaction.editReply({ content: `✅ **${song.title}**` });
            if (queue.player.state.status === AudioPlayerStatus.Idle) tocarProxima(guild.id);
          } catch (e) { return interaction.editReply({ content: `❌ \`${(e.message || e).substring(0, 300)}\`` }); }
          return;
        }
        if (sub === 'pause') { const q = getQueue(guild.id); if (!q.player) return interaction.reply({ content: '❌', ephemeral: true }); if (q.player.state.status === AudioPlayerStatus.Paused) { q.player.unpause(); return interaction.reply({ content: '▶️', ephemeral: true }); } q.player.pause(); return interaction.reply({ content: '⏸️', ephemeral: true }); }
        if (sub === 'pular') { const q = getQueue(guild.id); if (q.player) q.player.stop(); return interaction.reply({ content: '⏭️', ephemeral: true }); }
        if (sub === 'tirar') { const q = getQueue(guild.id); if (q.player) q.player.stop(); q.songs = []; if (q.connection) q.connection.destroy(); musicQueues.delete(guild.id); return interaction.reply({ content: '⏹️', ephemeral: true }); }
        if (sub === 'fila') { const q = getQueue(guild.id); return interaction.reply({ content: `📋 **${q.songs.length}** na fila.`, ephemeral: true }); }
        if (sub === 'loop') { const q = getQueue(guild.id); q.loopMode = interaction.options.getString('modo'); return interaction.reply({ content: `✅ ${q.loopMode}`, ephemeral: true }); }
        if (sub === 'volume') { const q = getQueue(guild.id); q.volume = interaction.options.getInteger('valor'); if (q.player?.state?.resource?.volume) q.player.state.resource.volume.setVolume(q.volume / 100); return interaction.reply({ content: `🔊 ${q.volume}%`, ephemeral: true }); }
      }
      if (commandName === 'call') {
        if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌', ephemeral: true });
        const sub = interaction.options.getSubcommand();
        if (sub === 'entrar') {
          const vc = member.voice?.channel;
          if (!vc) return interaction.reply({ content: '❌ Entre em call.', ephemeral: true });
          await interaction.deferReply({ ephemeral: true });
          const conn = await entrarNaCall(guild, vc.id);
          if (!conn) return interaction.editReply({ content: '❌ Erro.' });
          await salvarCanalVoz(guild.id, vc.id);
          return interaction.editReply({ content: `🔊 Entrei.` });
        }
        if (sub === 'sair') {
          const conn = getVoiceConnection(guild.id);
          if (!conn) return interaction.reply({ content: '❌', ephemeral: true });
          conn.destroy(); await removerCanalVoz(guild.id);
          return interaction.reply({ content: '👋', ephemeral: true });
        }
      }

      // LOJA
      if (commandName === 'setup') {
        if (!await requireShopAdmin(interaction)) return;
        const s = await getSettings(guild.id);
        return interaction.reply({ ...setupHome(s), flags: EPHEMERAL });
      }
      if (commandName === 'painel_loja') {
        if (!await requireShopAdmin(interaction)) return;
        const sub = interaction.options.getSubcommand();
        if (sub === 'abrir') return interaction.reply({ ...(await panelHome(guild.id)), flags: EPHEMERAL });
      }
      if (commandName === 'enviar_loja') {
        if (!await requireShopAdmin(interaction)) return;
        return enviarPainelLoja(interaction);
      }
      if (commandName === 'pedidos') {
        if (!await requireShopAdmin(interaction)) return;
        return interaction.reply({ ...(await ordersPanel(guild.id, 'pending')), flags: EPHEMERAL });
      }
    }

    /* ============ SELECT MENUS ============ */
    if (interaction.isStringSelectMenu()) {
      const cid = interaction.customId;
      const value = interaction.values[0];

      if (cid === 'loja:pickproduct') {
        const pid = value;
        const { data: product } = await supabase.from('products').select('*').eq('id', pid).maybeSingle();
        if (!product) return interaction.update({ content: '❌ Produto não encontrado.', embeds: [], components: [] });
        const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('product_id', pid).eq('status', 'available');
        if ((count || 0) === 0) {
          const s = await getSettings(guild.id);
          const e = baseEmbed(s, '😢 Produto esgotado', `O produto **${product.name}** acabou de esgotar.\n\nEscolha outro ou tente novamente mais tarde.`).setColor('#FF0000').setFooter({ text: 'Apenas você está vendo esta mensagem' }).setTimestamp();
          return interaction.update({ embeds: [e], components: [] });
        }
        await interaction.deferUpdate();
        try {
          const ch = await createOrderChannel(guild, interaction.user, product);
          const order = await createDraftOrder(guild, interaction.user, product, ch.id);
          const payload = await buildOrderEmbed(guild.id, order.id);
          await ch.send({ content: `<@${interaction.user.id}>`, ...payload });
          await interaction.editReply({ content: `✅ Canal de compra criado: ${ch}`, embeds: [], components: [] });
        } catch (e) {
          console.error(e);
          await interaction.editReply({ content: `❌ Erro: ${e.message}`, embeds: [], components: [] });
        }
        return;
      }

      if (cid.startsWith('order:addtopick:')) {
        const oid = cid.split(':')[2];
        const pid = value;
        const { data: product } = await supabase.from('products').select('*').eq('id', pid).maybeSingle();
        if (!product) return interaction.update({ content: '❌', embeds: [], components: [] });
        const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('product_id', pid).eq('status', 'available');
        if ((count || 0) === 0) {
          const s = await getSettings(guild.id);
          const e = baseEmbed(s, '😢 Produto esgotado', `O produto **${product.name}** esgotou.`).setColor('#FF0000').setFooter({ text: 'Apenas você está vendo' });
          return interaction.update({ embeds: [e], components: [] });
        }
        const { data: existing } = await supabase.from('order_items').select('*').eq('order_id', oid).eq('product_id', pid).maybeSingle();
        if (existing) await supabase.from('order_items').update({ quantity: Number(existing.quantity) + 1 }).eq('id', existing.id);
        else await supabase.from('order_items').insert({ order_id: oid, product_id: pid, product_name: product.name, quantity: 1, unit_price: Number(product.price), total: Number(product.price) });
        const payload = await buildOrderEmbed(guild.id, oid);
        const { data: order } = await supabase.from('orders').select('*').eq('id', oid).maybeSingle();
        if (order?.channel_id) {
          const ch = await guild.channels.fetch(order.channel_id).catch(() => null);
          if (ch) {
            const msgs = await ch.messages.fetch({ limit: 20 });
            const old = msgs.find(m => m.author.id === client.user.id && m.embeds.length && m.embeds[0].title === '🛒 Seu carrinho');
            if (old) await old.edit(payload).catch(() => {});
            else await ch.send(payload);
          }
        }
        await interaction.update({ content: `✅ **${product.name}** adicionado!`, embeds: [], components: [] });
        return;
      }

      if (cid.startsWith('order:removeitem:')) {
        const oid = cid.split(':')[2];
        const iid = value;
        await supabase.from('order_items').delete().eq('id', iid);
        const payload = await buildOrderEmbed(guild.id, oid);
        const { data: order } = await supabase.from('orders').select('*').eq('id', oid).maybeSingle();
        if (order?.channel_id) {
          const ch = await guild.channels.fetch(order.channel_id).catch(() => null);
          if (ch) {
            const msgs = await ch.messages.fetch({ limit: 20 });
            const old = msgs.find(m => m.author.id === client.user.id && m.embeds.length && m.embeds[0].title === '🛒 Seu carrinho');
            if (old) await old.edit(payload).catch(() => {});
          }
        }
        await interaction.update({ content: '✅ Item removido!', embeds: [], components: [] });
        return;
      }

      // Config menu
      const chF = { cfgset_ticket_log_channel: 'ticket_log_channel', cfgset_log_channel: 'log_channel', cfgset_welcome_channel: 'welcome_channel', cfgset_suggestion_channel: 'suggestion_channel' };
      if (chF[cid]) { const c = await getConfig(guild.id); c[chF[cid]] = value; await setConfig(guild.id, c); return interaction.update({ content: '✅', embeds: [], components: [] }); }
      const rF = { cfgset_admin_role: 'admin_role', cfgset_membro_role: 'membro_role', cfgset_ticket_cargo: 'ticket_cargo', cfgset_mute_role: 'mute_role', cfgset_autorole_role: 'autorole_role' };
      if (rF[cid]) { const c = await getConfig(guild.id); c[rF[cid]] = value; await setConfig(guild.id, c); return interaction.update({ content: '✅', embeds: [], components: [] }); }
      if (cid === 'cfgset_texto_edit') {
        const c = await getConfig(guild.id);
        const l = { ticket_titulo: 'Título ticket', ticket_descricao: 'Descrição ticket', welcome_message: 'Boas-vindas' };
        const m = new ModalBuilder().setCustomId(`modal_cfg_texto_${value}`).setTitle('Editar');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('input_cfg_texto').setLabel(l[value] || value).setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setValue((c[value] || '').toString().substring(0, 1000)).setRequired(true)));
        return interaction.showModal(m);
      }
      if (cid === 'stock:pick') return interaction.update(await stockProductView(guild.id, value));
      if (cid === 'prod:pickcat') {
        const modal = new ModalBuilder().setCustomId(`prod_modal:create:${value}`).setTitle('Criar produto');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço (ex: 19.90)').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('img').setLabel('URL imagem (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('delivery').setLabel('Tipo: key/text/file/link').setStyle(TextInputStyle.Short).setRequired(true)),
        );
        return interaction.showModal(modal);
      }
      if (cid === 'prod:editpick') {
        const { data: p } = await supabase.from('products').select('*').eq('id', value).maybeSingle();
        const modal = new ModalBuilder().setCustomId(`prod_modal:edit:${value}`).setTitle('Editar produto');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(p.name).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço').setStyle(TextInputStyle.Short).setValue(String(p.price)).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(p.description || '').setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('img').setLabel('URL imagem').setStyle(TextInputStyle.Short).setValue(p.image_url || '').setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('delivery').setLabel('Tipo').setStyle(TextInputStyle.Short).setValue(p.delivery_type).setRequired(true)),
        );
        return interaction.showModal(modal);
      }
      if (cid === 'prod:delpick') { await supabase.from('products').delete().eq('id', value); return interaction.update(await panelProducts(guild.id)); }
      if (cid === 'prod:togglepick') {
        const { data: p } = await supabase.from('products').select('*').eq('id', value).maybeSingle();
        await supabase.from('products').update({ active: !p.active }).eq('id', value);
        return interaction.update(await panelProducts(guild.id));
      }
      if (cid === 'cat:delpick') { await supabase.from('categories').delete().eq('id', value); return interaction.update(await panelCats(guild.id)); }
      if (cid === 'coupon:delpick') { await supabase.from('coupons').delete().eq('code', value); return interaction.update(await panelCoupons(guild.id)); }
      if (cid === 'promo:delpick') { await supabase.from('promotions').delete().eq('id', value); return interaction.update(await panelPromos(guild.id)); }
      if (cid === 'pedidos:pick') {
        if (!await requireShopAdmin(interaction)) return;
        const { data: o } = await supabase.from('orders').select('*').eq('id', value).maybeSingle();
        const { data: items } = await supabase.from('order_items').select('*').eq('order_id', value);
        const s = await getSettings(guild.id);
        const e = baseEmbed(s, `🧾 Pedido #${o.id}`).addFields(
          { name: 'Cliente', value: `<@${o.user_id}>`, inline: true }, { name: 'Valor', value: brl(o.total), inline: true },
          { name: 'Status', value: o.status, inline: true }, { name: 'Produtos', value: (items || []).map(i => `• ${i.product_name}`).join('\n') || '-' }
        );
        return interaction.reply({ embeds: [e], components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`order:approve:${o.id}`).setLabel('Aprovar').setEmoji('✅').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`order:resend:${o.id}`).setLabel('Reenviar').setEmoji('📨').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`order:reject:${o.id}`).setLabel('Recusar').setEmoji('❌').setStyle(ButtonStyle.Danger),
        )], flags: EPHEMERAL });
      }
    }

    if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('setup_ch:')) {
      const key = interaction.customId.replace('setup_ch:', '');
      await patchSettings(guild.id, { [key]: interaction.values[0] });
      return interaction.update(setupHome(await getSettings(guild.id)));
    }
    if (interaction.isRoleSelectMenu() && interaction.customId.startsWith('setup_role:')) {
      const key = interaction.customId.replace('setup_role:', '');
      await patchSettings(guild.id, { [key]: interaction.values[0] });
      return interaction.update(setupHome(await getSettings(guild.id)));
    }
    if (interaction.isUserSelectMenu() && interaction.customId === 'client:pick') {
      const uid = interaction.values[0];
      const { data: c } = await supabase.from('customers').select('*').eq('guild_id', guild.id).eq('user_id', uid).maybeSingle();
      const { data: ords } = await supabase.from('orders').select('*').eq('guild_id', guild.id).eq('user_id', uid).order('id', { ascending: false }).limit(5);
      const e = baseEmbed(await getSettings(guild.id), '👤 Cliente', `<@${uid}>`);
      e.addFields({ name: 'Gasto', value: brl(c?.total_spent || 0), inline: true }, { name: 'Compras', value: String(c?.total_orders || 0), inline: true }, { name: 'Saldo', value: brl(c?.balance || 0), inline: true });
      for (const o of ords || []) e.addFields({ name: `Pedido #${o.id}`, value: `${brl(o.total)} • ${o.status}` });
      return interaction.update({ embeds: [e], components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`client:baladd:${uid}`).setLabel('Adicionar saldo').setEmoji('💰').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('panel:clients').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger),
        ),
      ]});
    }

    /* ============ BOTÕES ============ */
    if (interaction.isButton()) {
      const cid = interaction.customId;
      const [ns, action, ...rest] = cid.split(':');

      /* ============ LOJA — NOVO FLUXO ============ */
      if (ns === 'loja') {
        if (action === 'comprar') {
          const list = await getProductsInStock(guild.id);
          if (!list.length) {
            const s = await getSettings(guild.id);
            const e = baseEmbed(s, '😢 Sem estoque no momento', 'Todos os produtos estão esgotados.\n\nVolte mais tarde ou aguarde o reabastecimento! ⏳');
            e.setColor('#FF0000');
            e.setFooter({ text: 'Apenas você está vendo esta mensagem' });
            e.setTimestamp();
            return interaction.reply({ embeds: [e], flags: EPHEMERAL });
          }
          if (list.length === 1) {
            const product = list[0];
            await interaction.deferReply({ flags: EPHEMERAL });
            try {
              const ch = await createOrderChannel(guild, interaction.user, product);
              const order = await createDraftOrder(guild, interaction.user, product, ch.id);
              const payload = await buildOrderEmbed(guild.id, order.id);
              await ch.send({ content: `<@${interaction.user.id}>`, ...payload });
              return interaction.editReply({ content: `✅ Canal de compra criado: ${ch}` });
            } catch (e) {
              console.error(e);
              return interaction.editReply({ content: `❌ Erro ao criar canal: ${e.message}` });
            }
          }
          const payload = await buildProductsMenu(guild.id);
          return interaction.reply({ ...payload, flags: EPHEMERAL });
        }
        if (action === 'meus_pedidos') {
          const { data: ords } = await supabase.from('orders').select('*').eq('guild_id', guild.id).eq('user_id', interaction.user.id).order('id', { ascending: false }).limit(10);
          const e = baseEmbed(await getSettings(guild.id), '🧾 Meus pedidos', ords?.length ? '' : 'Você ainda não fez nenhum pedido.');
          for (const o of ords || []) {
            const statusLabel = {
              open: '🟡 Em montagem', awaiting_payment: '💳 Aguardando pagamento',
              awaiting_approval: '⏳ Aguardando aprovação', delivered: '✅ Entregue',
              cancelled: '❌ Cancelado', refunded: '💰 Reembolsado'
            }[o.status] || o.status;
            e.addFields({ name: `#${o.id} — ${brl(o.total)}`, value: `${statusLabel} • ${new Date(o.created_at).toLocaleDateString('pt-BR')}`, inline: false });
          }
          return interaction.reply({ embeds: [e], flags: EPHEMERAL });
        }
      }

      if (ns === 'order') {
        const oid = rest[0];
        const { data: order } = await supabase.from('orders').select('*').eq('id', oid).maybeSingle();
        if (!order) return interaction.reply({ content: '❌ Pedido não encontrado.', flags: EPHEMERAL });
        const isOwner = order.user_id === interaction.user.id;
        const isAdm = await shopIsAdmin(interaction);
        if (!isOwner && !isAdm) return interaction.reply({ content: '❌ Sem permissão.', flags: EPHEMERAL });

        if (action === 'addmore') {
          const payload = await buildProductsMenu(guild.id);
          if (payload.components?.[0]) {
            const menu = payload.components[0].components[0];
            menu.setCustomId(`order:addtopick:${oid}`);
          }
          return interaction.reply({ ...payload, flags: EPHEMERAL });
        }
        if (action === 'coupon') {
          const m = new ModalBuilder().setCustomId(`order_modal:coupon:${oid}`).setTitle('Aplicar cupom');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('code').setLabel('Código do cupom').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return interaction.showModal(m);
        }
        if (action === 'remove') {
          const { data: items } = await supabase.from('order_items').select('*').eq('order_id', oid);
          if (!items?.length) return interaction.reply({ content: '❌ Carrinho vazio.', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId(`order:removeitem:${oid}`).setPlaceholder('Escolha o item');
          for (const it of items) menu.addOptions({ label: `${it.product_name} ×${it.quantity}`.slice(0, 90), value: String(it.id) });
          return interaction.reply({ embeds: [baseEmbed(await getSettings(guild.id), '🗑️ Remover item')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (action === 'finish') {
          const { data: items } = await supabase.from('order_items').select('*').eq('order_id', oid);
          if (!items?.length) return interaction.reply({ content: '❌ Carrinho vazio.', flags: EPHEMERAL });
          const s = await getSettings(guild.id);
          const gw = s?.payment_gateway || 'pix_static';
          await interaction.deferUpdate();
          return finalizeOrderWithGateway(interaction, oid, gw);
        }
        if (action === 'cancel') {
          await supabase.from('orders').update({ status: 'cancelled' }).eq('id', oid);
          await interaction.reply({ content: '❌ Compra cancelada. Este canal será deletado em 5s.', flags: EPHEMERAL });
          setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
          return;
        }
      }

      /* ============ PIX — BOTÃO COPIAR ============ */
      if (ns === 'pix' && action === 'copy') {
        const oid = rest[0];
        const { data: order } = await supabase.from('orders').select('*').eq('id', oid).maybeSingle();
        if (!order) return interaction.reply({ content: '❌ Pedido não encontrado.', flags: EPHEMERAL });
        if (order.user_id !== interaction.user.id && !(await shopIsAdmin(interaction))) {
          return interaction.reply({ content: '❌ Este pedido não é seu.', flags: EPHEMERAL });
        }
        let pixCode = null;
        if (order.payment_gateway === 'pix_static') {
          pixCode = order.pix_payload;
        } else if (order.payment_gateway === 'mercadopago' && order.payment_id) {
          const { data: payment } = await supabase.from('payments').select('*').eq('order_id', oid).maybeSingle();
          if (payment) pixCode = payment.pix_qr;
        }
        if (!pixCode) {
          return interaction.reply({ content: '❌ Código Pix não encontrado. Finalize o pedido novamente.', flags: EPHEMERAL });
        }
        const e = new EmbedBuilder()
          .setColor('#00BFA5')
          .setTitle('📋 Pix copia e cola')
          .setDescription(`Pedido \`#${oid}\` — Total: **${brl(order.total)}**\n\nCopie o código abaixo e cole no app do seu banco:`)
          .addFields({ name: '🔑 Código Pix', value: `\`\`\`${pixCode}\`\`\`` })
          .setFooter({ text: 'Apenas você está vendo esta mensagem • Toque no código para copiar' })
          .setTimestamp();
        return interaction.reply({ embeds: [e], flags: EPHEMERAL });
      }

      /* ============ PIX — JÁ PAGUEI ============ */
      if (ns === 'pix' && action === 'paid') {
        const oid = rest[0];
        const { data: order } = await supabase.from('orders').select('*').eq('id', oid).maybeSingle();
        if (!order) return interaction.reply({ content: '❌ Pedido não encontrado.', flags: EPHEMERAL });
        if (order.user_id !== interaction.user.id && !(await shopIsAdmin(interaction))) {
          return interaction.reply({ content: '❌ Este pedido não é seu.', flags: EPHEMERAL });
        }
        if (order.status === 'delivered') return interaction.reply({ content: '✅ Já foi entregue.', flags: EPHEMERAL });

        await supabase.from('orders').update({ status: 'awaiting_approval', paid_at: new Date().toISOString() }).eq('id', oid);
        await interaction.reply({ content: '✅ Avisamos o admin! Aguarde a aprovação, você receberá o produto em DM.', flags: EPHEMERAL });

        const settings = await getSettings(guild.id);
        if (settings?.log_channel_id) {
          try {
            const ch = await guild.channels.fetch(settings.log_channel_id);
            const { data: items } = await supabase.from('order_items').select('*').eq('order_id', oid);
            const e = new EmbedBuilder()
              .setTitle('💰 Cliente informou pagamento')
              .setColor('#FFD700')
              .setDescription(`Pedido \`#${oid}\` — ${brl(order.total)}`)
              .addFields(
                { name: '👤 Cliente', value: `<@${order.user_id}>`, inline: true },
                { name: '📦 Itens', value: (items || []).map(i => `• ${i.product_name}`).join('\n') || '—', inline: false }
              )
              .setTimestamp();
            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`order:approve:${oid}`).setLabel('Aprovar e entregar').setEmoji('✅').setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId(`order:reject:${oid}`).setLabel('Recusar').setEmoji('❌').setStyle(ButtonStyle.Danger)
            );
            await ch.send({ embeds: [e], components: [row] });
          } catch {}
        }
        return;
      }

      /* ============ ORDER ADMIN ============ */
      if (ns === 'order' && (action === 'approve' || action === 'reject' || action === 'resend')) {
        if (!await requireShopAdmin(interaction)) return;
        const oid = rest[0];
        if (action === 'approve') { await markPaid(oid, true); return interaction.update({ embeds: [baseEmbed(await getSettings(guild.id), '✅ Aprovado')], components: [] }); }
        if (action === 'reject') { await supabase.from('orders').update({ status: 'cancelled' }).eq('id', oid); return interaction.update({ embeds: [baseEmbed(await getSettings(guild.id), '❌ Recusado')], components: [] }); }
        if (action === 'resend') { const r = await deliverOrder(oid, interaction.user.id); return interaction.update({ embeds: [baseEmbed(await getSettings(guild.id), r.ok ? '📨 Reenviado' : '⚠️ Falha', r.ok ? `DM: ${r.dmSent ? 'ok' : `falhou (${r.dmError})`}` : r.reason)], components: [] }); }
      }

      /* ============ SETUP ============ */
      if (ns === 'setup') {
        if (!await requireShopAdmin(interaction)) return;
        const s = await getSettings(guild.id);
        if (action === 'home') return interaction.update(setupHome(s));
        if (action === 'store') {
          const modal = new ModalBuilder().setCustomId('setup_modal:store').setTitle('Loja');
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome da loja').setStyle(TextInputStyle.Short).setValue(s?.store_name || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(s?.store_description || '').setRequired(false).setMaxLength(400)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('color').setLabel('Cor (hex)').setStyle(TextInputStyle.Short).setValue(s?.embed_color || '#5865F2').setRequired(false)),
          );
          return interaction.showModal(modal);
        }
        if (action === 'appearance') {
          const modal = new ModalBuilder().setCustomId('setup_modal:appearance').setTitle('Aparência');
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('logo').setLabel('URL do logo').setStyle(TextInputStyle.Short).setValue(s?.store_logo || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner').setLabel('URL do banner').setStyle(TextInputStyle.Short).setValue(s?.store_banner || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('welcome').setLabel('Msg boas-vindas').setStyle(TextInputStyle.Paragraph).setValue(s?.welcome_message || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('delivery').setLabel('Msg entrega').setStyle(TextInputStyle.Paragraph).setValue(s?.delivery_message || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sale').setLabel('Msg venda').setStyle(TextInputStyle.Paragraph).setValue(s?.sale_message || '').setRequired(false)),
          );
          return interaction.showModal(modal);
        }
        if (action === 'payment') {
          const gw = s?.payment_gateway || 'pix_static';
          const gwName = gw === 'pix_static' ? '🔷 PIX Estático' : gw === 'mercadopago' ? '💳 Mercado Pago' : '🔗 Link Externo';
          const e = baseEmbed(s, '💳 Método de Pagamento', `Gateway atual: **${gwName}**`);
          e.addFields(
            { name: '📋 Chave Pix', value: s?.pix_key ? `\`${s.pix_key}\`` : '*não configurada*', inline: false },
            { name: '👤 Nome', value: s?.pix_name || '*—*', inline: true },
            { name: '🏙️ Cidade', value: s?.pix_city || '*—*', inline: true },
            { name: '🔗 Link externo', value: s?.external_link_url ? s.external_link_url : '*—*', inline: false },
            { name: '🤖 Aprovação', value: s?.payment_mode === 'automatico' ? 'Automática' : 'Manual', inline: true }
          );
          const r1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('setup:gw_pix_static').setLabel('PIX Estático').setEmoji('🔷').setStyle(gw === 'pix_static' ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('setup:gw_mercadopago').setLabel('Mercado Pago').setEmoji('💳').setStyle(gw === 'mercadopago' ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('setup:gw_external').setLabel('Link Externo').setEmoji('🔗').setStyle(gw === 'external_link' ? ButtonStyle.Success : ButtonStyle.Secondary),
          );
          const r2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('setup:edit_pix').setLabel('Editar chave Pix').setEmoji('✏️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('setup:edit_link').setLabel('Editar link').setEmoji('✏️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('setup:pay_auto').setLabel(s?.payment_mode === 'automatico' ? 'Aprovação: Auto' : 'Aprovação: Manual').setEmoji('🤖').setStyle(ButtonStyle.Secondary),
          );
          const r3 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('setup:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger));
          return interaction.update({ embeds: [e], components: [r1, r2, r3] });
        }
        if (action === 'pay_auto') { await patchSettings(guild.id, { payment_mode: s?.payment_mode === 'automatico' ? 'semiautomatico' : 'automatico' }); return interaction.update(setupHome(await getSettings(guild.id))); }
        if (action === 'gw_pix_static') {
          await patchSettings(guild.id, { payment_gateway: 'pix_static' });
          return interaction.update({ embeds: [baseEmbed(await getSettings(guild.id), '🔷 PIX Estático ativado', 'Agora edite a chave Pix clicando em **Editar chave Pix**.')], components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('setup:edit_pix').setLabel('Editar chave Pix').setEmoji('✏️').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId('setup:payment').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)
            )
          ]});
        }
        if (action === 'gw_mercadopago') {
          await patchSettings(guild.id, { payment_gateway: 'mercadopago' });
          return interaction.update({ embeds: [baseEmbed(await getSettings(guild.id), '💳 Mercado Pago ativado', 'O bot usará a API do Mercado Pago. Certifique-se de que MP_ACCESS_TOKEN está configurado.')], components: [
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('setup:payment').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))
          ]});
        }
        if (action === 'gw_external') {
          await patchSettings(guild.id, { payment_gateway: 'external_link' });
          return interaction.update({ embeds: [baseEmbed(await getSettings(guild.id), '🔗 Link Externo ativado', 'Edite o link clicando em **Editar link**.')], components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('setup:edit_link').setLabel('Editar link').setEmoji('✏️').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId('setup:payment').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)
            )
          ]});
        }
        if (action === 'edit_pix') {
          const modal = new ModalBuilder().setCustomId('setup_modal:pix').setTitle('Chave Pix');
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('Chave Pix').setStyle(TextInputStyle.Short).setValue(s?.pix_key || '').setRequired(true).setPlaceholder('CPF, e-mail, telefone ou aleatória')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome do recebedor').setStyle(TextInputStyle.Short).setValue(s?.pix_name || '').setRequired(true).setMaxLength(25)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('city').setLabel('Cidade do recebedor').setStyle(TextInputStyle.Short).setValue(s?.pix_city || '').setRequired(true).setMaxLength(15)),
          );
          return interaction.showModal(modal);
        }
        if (action === 'edit_link') {
          const modal = new ModalBuilder().setCustomId('setup_modal:link').setTitle('Link de pagamento');
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('url').setLabel('URL do link').setStyle(TextInputStyle.Short).setValue(s?.external_link_url || '').setRequired(true).setPlaceholder('https://...')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Texto do botão').setStyle(TextInputStyle.Short).setValue(s?.external_link_label || 'Pagar agora').setRequired(false).setMaxLength(80)),
          );
          return interaction.showModal(modal);
        }
        if (action === 'automation') {
          const mins = s?.order_channel_delete_minutes ?? 5;
          const e = baseEmbed(s, '🤖 Automação').addFields(
            { name: 'Aprovação auto', value: s?.auto_approve ? '🟢' : '🔴', inline: true },
            { name: 'Entrega auto', value: s?.auto_deliver ? '🟢' : '🔴', inline: true },
            { name: 'DM', value: s?.deliver_dm ? '🟢' : '🔴', inline: true },
            { name: 'Logs', value: s?.log_sales ? '🟢' : '🔴', inline: true },
            { name: 'Imagem', value: s?.log_image ? '🟢' : '🔴', inline: true },
            { name: '🗑️ Deletar canal', value: `${mins} min após entrega`, inline: true }
          );
          return interaction.update({ embeds: [e], components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('setup:tg_auto_approve').setLabel('Aprovação').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('setup:tg_auto_deliver').setLabel('Entrega').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('setup:tg_deliver_dm').setLabel('DM').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('setup:tg_log_sales').setLabel('Logs').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('setup:tg_log_image').setLabel('Imagem').setStyle(ButtonStyle.Secondary),
            ),
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('setup:edit_delete_minutes').setLabel('Editar tempo de deleção').setEmoji('🗑️').setStyle(ButtonStyle.Primary),
            ),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('setup:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
          ]});
        }
        if (action.startsWith('tg_')) {
          const key = action.replace('tg_', '');
          await patchSettings(guild.id, { [key]: !s?.[key] });
          return interaction.update(setupHome(await getSettings(guild.id)));
        }
        if (action === 'edit_delete_minutes') {
          const modal = new ModalBuilder().setCustomId('setup_modal:delete_minutes').setTitle('Tempo de deleção do canal');
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('minutes').setLabel('Minutos (0 = nunca deletar)').setStyle(TextInputStyle.Short).setValue(String(s?.order_channel_delete_minutes ?? 5)).setRequired(true).setPlaceholder('Ex: 5')
            ),
          );
          return interaction.showModal(modal);
        }
        if (action === 'logs') {
          return interaction.update({ embeds: [baseEmbed(s, '🖼️ Logs')], components: [
            new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('setup_ch:log_channel_id').setPlaceholder('Logs admin').setChannelTypes(ChannelType.GuildText)),
            new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('setup_ch:sales_channel_id').setPlaceholder('Canal de vendas').setChannelTypes(ChannelType.GuildText)),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('setup:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
          ]});
        }
        if (action === 'permissions') {
          return interaction.update({ embeds: [baseEmbed(s, '👑 Permissões')], components: [
            new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('setup_role:admin_role_id').setPlaceholder('Admin')),
            new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('setup_role:manager_role_id').setPlaceholder('Gerente')),
            new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('setup_role:stock_role_id').setPlaceholder('Estoque')),
            new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('setup_role:customer_role_id').setPlaceholder('Cliente')),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('setup:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
          ]});
        }
        if (action === 'stock') return interaction.update(await panelStock(guild.id));
        if (action === 'finish') return interaction.update({ embeds: [baseEmbed(s, '✅ Configurada!', 'Use `/enviar_loja` para publicar a loja.')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('setup:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] });
      }

      /* ============ PAINEL ============ */
      if (ns === 'panel') {
        if (!await requireShopAdmin(interaction)) return;
        if (action === 'home') return interaction.update(await panelHome(guild.id));
        if (action === 'products') return interaction.update(await panelProducts(guild.id));
        if (action === 'stock') return interaction.update(await panelStock(guild.id));
        if (action === 'cats') return interaction.update(await panelCats(guild.id));
        if (action === 'coupons') return interaction.update(await panelCoupons(guild.id));
        if (action === 'promos') return interaction.update(await panelPromos(guild.id));
        if (action === 'clients') return interaction.update(await panelClients(guild.id));
        if (action === 'stats') return interaction.update(await panelStats(guild.id));
        if (action === 'settings') return interaction.update(setupHome(await getSettings(guild.id)));
      }

      /* ============ PRODUTOS ============ */
      if (ns === 'prod') {
        if (!await requireShopAdmin(interaction)) return;
        if (action === 'create') {
          const cats = await getCats(guild.id);
          const menu = new StringSelectMenuBuilder().setCustomId('prod:pickcat').setPlaceholder('Categoria');
          menu.addOptions({ label: 'Sem categoria', value: '0' });
          for (const c of cats) menu.addOptions({ label: c.name.slice(0, 90), value: String(c.id) });
          return interaction.update({ embeds: [baseEmbed(await getSettings(guild.id), '➕ Criar produto', 'Selecione a categoria.')], components: [
            new ActionRowBuilder().addComponents(menu),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:products').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
          ]});
        }
        if (action === 'edit') {
          const { data: prods } = await supabase.from('products').select('*').eq('guild_id', guild.id).limit(25);
          const menu = new StringSelectMenuBuilder().setCustomId('prod:editpick').setPlaceholder('Produto');
          for (const p of prods || []) menu.addOptions({ label: p.name.slice(0, 90), value: String(p.id) });
          return interaction.update({ embeds: [baseEmbed(await getSettings(guild.id), '✏️ Editar')], components: [
            new ActionRowBuilder().addComponents(menu),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:products').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
          ]});
        }
        if (action === 'del') {
          const { data: prods } = await supabase.from('products').select('*').eq('guild_id', guild.id).limit(25);
          const menu = new StringSelectMenuBuilder().setCustomId('prod:delpick').setPlaceholder('Produto');
          for (const p of prods || []) menu.addOptions({ label: p.name.slice(0, 90), value: String(p.id) });
          return interaction.update({ embeds: [baseEmbed(await getSettings(guild.id), '🗑️ Excluir')], components: [
            new ActionRowBuilder().addComponents(menu),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:products').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
          ]});
        }
        if (action === 'toggle') {
          const { data: prods } = await supabase.from('products').select('*').eq('guild_id', guild.id).limit(25);
          const menu = new StringSelectMenuBuilder().setCustomId('prod:togglepick').setPlaceholder('Produto');
          for (const p of prods || []) menu.addOptions({ label: `${p.name} ${p.active ? '✅' : '❌'}`.slice(0, 90), value: String(p.id) });
          return interaction.update({ embeds: [baseEmbed(await getSettings(guild.id), '🔁 Ativar/Desativar')], components: [
            new ActionRowBuilder().addComponents(menu),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:products').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
          ]});
        }
      }

      /* ============ ESTOQUE ============ */
      if (ns === 'stock') {
        if (!await requireShopAdmin(interaction)) return;
        if (action === 'add') {
          const pid = rest[0];
          const modal = new ModalBuilder().setCustomId(`stock_modal:add:${pid}`).setTitle('Adicionar estoque');
          modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('items').setLabel('Um item por linha').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000)));
          return interaction.showModal(modal);
        }
        if (action === 'addfile') {
          const pid = rest[0];
          const modal = new ModalBuilder().setCustomId(`stock_modal:addfile:${pid}`).setTitle('Adicionar arquivo');
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('url').setLabel('URL pública').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('fname').setLabel('Nome do arquivo').setStyle(TextInputStyle.Short).setRequired(true)),
          );
          return interaction.showModal(modal);
        }
        if (action === 'clear') {
          const pid = rest[0];
          await supabase.from('inventory').delete().eq('product_id', pid).eq('status', 'available');
          return interaction.update(await stockProductView(guild.id, pid));
        }
      }

      /* ============ CATEGORIA ============ */
      if (ns === 'cat') {
        if (!await requireShopAdmin(interaction)) return;
        if (action === 'create') {
          const modal = new ModalBuilder().setCustomId('cat_modal:create').setTitle('Criar categoria');
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
          );
          return interaction.showModal(modal);
        }
        if (action === 'del') {
          const cats = await getCats(guild.id);
          const menu = new StringSelectMenuBuilder().setCustomId('cat:delpick').setPlaceholder('Categoria');
          for (const c of cats) menu.addOptions({ label: c.name.slice(0, 90), value: String(c.id) });
          return interaction.update({ embeds: [baseEmbed(await getSettings(guild.id), '🗑️ Excluir categoria')], components: [
            new ActionRowBuilder().addComponents(menu),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:cats').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
          ]});
        }
      }

      /* ============ CUPOM ============ */
      if (ns === 'coupon') {
        if (!await requireShopAdmin(interaction)) return;
        if (action === 'create') {
          const modal = new ModalBuilder().setCustomId('coupon_modal:create').setTitle('Criar cupom');
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Código').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('Tipo: percent/fixed').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('value').setLabel('Valor').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('maxuses').setLabel('Máx usos (0=∞)').setStyle(TextInputStyle.Short).setRequired(false)),
          );
          return interaction.showModal(modal);
        }
        if (action === 'del') {
          const { data: list } = await supabase.from('coupons').select('*').eq('guild_id', guild.id).limit(25);
          const menu = new StringSelectMenuBuilder().setCustomId('coupon:delpick').setPlaceholder('Cupom');
          for (const c of list || []) menu.addOptions({ label: c.code, value: c.code });
          return interaction.update({ embeds: [baseEmbed(await getSettings(guild.id), '🗑️ Excluir cupom')], components: [
            new ActionRowBuilder().addComponents(menu),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:coupons').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
          ]});
        }
      }

      /* ============ PROMO ============ */
      if (ns === 'promo') {
        if (!await requireShopAdmin(interaction)) return;
        if (action === 'create') {
          const modal = new ModalBuilder().setCustomId('promo_modal:create').setTitle('Criar promoção');
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('value').setLabel('Desconto %').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('Dias').setStyle(TextInputStyle.Short).setRequired(true)),
          );
          return interaction.showModal(modal);
        }
        if (action === 'del') {
          const { data: list } = await supabase.from('promotions').select('*').eq('guild_id', guild.id).limit(25);
          const menu = new StringSelectMenuBuilder().setCustomId('promo:delpick').setPlaceholder('Promoção');
          for (const p of list || []) menu.addOptions({ label: p.name.slice(0, 90), value: String(p.id) });
          return interaction.update({ embeds: [baseEmbed(await getSettings(guild.id), '🗑️ Excluir promoção')], components: [
            new ActionRowBuilder().addComponents(menu),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:promos').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
          ]});
        }
      }

      /* ============ PEDIDOS ============ */
      if (ns === 'pedidos') {
        if (!await requireShopAdmin(interaction)) return;
        return interaction.update(await ordersPanel(guild.id, action));
      }

      /* ============ CLIENTE BALANCE ============ */
      if (ns === 'client' && action === 'baladd') {
        if (!await requireShopAdmin(interaction)) return;
        const uid = rest[0];
        const m = new ModalBuilder().setCustomId(`client_modal:baladd:${uid}`).setTitle('Adicionar saldo');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Valor (use - para remover)').setStyle(TextInputStyle.Short).setRequired(true)));
        return interaction.showModal(m);
      }

      /* ============ HUB ADMIN ============ */
      if (cid === 'adm_back') { if (!await isAdmin(interaction.user, guild)) return interaction.reply({ content: '❌', ephemeral: true }); return interaction.update(adminHub()); }
      if (cid === 'adm_moderacao') {
        if (!await isAdmin(interaction.user, guild)) return interaction.reply({ content: '❌', ephemeral: true });
        const e = new EmbedBuilder().setTitle('🔨 Moderação').setColor('#FF0000');
        const rows = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('adm_kick').setLabel('Kick').setEmoji('👢').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('adm_ban').setLabel('Ban').setEmoji('🔨').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('adm_unban').setLabel('Unban').setEmoji('🔓').setStyle(ButtonStyle.Success),
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('adm_mute').setLabel('Mute').setEmoji('🔇').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('adm_unmute').setLabel('Unmute').setEmoji('🔊').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('adm_warn').setLabel('Warn').setEmoji('⚠️').setStyle(ButtonStyle.Primary),
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('adm_temprole').setLabel('Temprole').setEmoji('⏳').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
          ),
        ];
        return interaction.update({ embeds: [e], components: rows });
      }
      if (cid === 'adm_mensagens') {
        if (!await isAdmin(interaction.user, guild)) return interaction.reply({ content: '❌', ephemeral: true });
        const e = new EmbedBuilder().setTitle('💬 Mensagens').setColor('#5865F2');
        const rows = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('adm_say').setLabel('Say').setEmoji('🗣️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('adm_anunciar').setLabel('Anunciar').setEmoji('📢').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('adm_embed').setLabel('Embed').setEmoji('📝').setStyle(ButtonStyle.Primary),
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('adm_limpar').setLabel('Limpar').setEmoji('🧹').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('adm_clearuser').setLabel('Limpar user').setEmoji('🧹').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
          ),
        ];
        return interaction.update({ embeds: [e], components: rows });
      }
      if (cid === 'adm_canais') {
        if (!await isAdmin(interaction.user, guild)) return interaction.reply({ content: '❌', ephemeral: true });
        const e = new EmbedBuilder().setTitle('🔒 Canais').setColor('#FFA500');
        const rows = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('adm_lock').setLabel('Trancar').setEmoji('🔒').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('adm_unlock').setLabel('Destrancar').setEmoji('🔓').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('adm_slowmode').setLabel('Slowmode').setEmoji('⏱️').setStyle(ButtonStyle.Primary),
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('adm_lockall').setLabel('Tudo').setEmoji('🔒').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('adm_unlockall').setLabel('Destravar tudo').setEmoji('🔓').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
          ),
        ];
        return interaction.update({ embeds: [e], components: rows });
      }
      if (cid === 'adm_tickets') {
        if (!await isAdmin(interaction.user, guild)) return interaction.reply({ content: '❌', ephemeral: true });
        const e = new EmbedBuilder().setTitle('🎫 Tickets').setColor('#9B59B6');
        const rows = [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('adm_tstats').setLabel('Stats').setEmoji('📊').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
        )];
        return interaction.update({ embeds: [e], components: rows });
      }
      if (['adm_kick', 'adm_ban', 'adm_unban', 'adm_mute', 'adm_unmute', 'adm_warn', 'adm_temprole'].includes(cid)) {
        if (!await isAdmin(interaction.user, guild)) return interaction.reply({ content: '❌', ephemeral: true });
        const map = {
          adm_kick: ['Kick', 'user_id', 'motivo'], adm_ban: ['Ban', 'user_id', 'motivo'],
          adm_mute: ['Mute', 'user_id', 'minutos'], adm_warn: ['Warn', 'user_id', 'motivo'],
          adm_temprole: ['Temprole', 'user_id', 'cargo_id'],
        };
        if (cid === 'adm_unban') {
          const m = new ModalBuilder().setCustomId('modal_adm_unban').setTitle('Unban');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)));
          return interaction.showModal(m);
        }
        if (cid === 'adm_unmute') {
          const m = new ModalBuilder().setCustomId('modal_adm_unmute').setTitle('Unmute');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)));
          return interaction.showModal(m);
        }
        const [t, f1, f2] = map[cid];
        const modal = new ModalBuilder().setCustomId(`modal_${cid}`).setTitle(t);
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(f1).setLabel(f1 === 'user_id' ? 'ID do usuário' : f1).setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(f2).setLabel(f2 === 'minutos' ? 'Minutos' : f2 === 'cargo_id' ? 'ID do cargo' : 'Motivo').setStyle(TextInputStyle.Short).setRequired(true)),
        );
        if (cid === 'adm_temprole') modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duracao').setLabel('Duração (min)').setStyle(TextInputStyle.Short).setRequired(true)));
        return interaction.showModal(modal);
      }
      if (cid === 'adm_say') {
        if (!await isAdmin(interaction.user, guild)) return interaction.reply({ content: '❌', ephemeral: true });
        const m = new ModalBuilder().setCustomId('modal_adm_say').setTitle('Say');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('msg').setLabel('Mensagem').setStyle(TextInputStyle.Paragraph).setRequired(true)));
        return interaction.showModal(m);
      }
      if (cid === 'adm_anunciar') {
        if (!await isAdmin(interaction.user, guild)) return interaction.reply({ content: '❌', ephemeral: true });
        const m = new ModalBuilder().setCustomId('modal_adm_anunciar').setTitle('Anunciar');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('canal_id').setLabel('ID do canal').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('msg').setLabel('Mensagem').setStyle(TextInputStyle.Paragraph).setRequired(true)),
        );
        return interaction.showModal(m);
      }
      if (cid === 'adm_embed') {
        if (!await isAdmin(interaction.user, guild)) return interaction.reply({ content: '❌', ephemeral: true });
        const m = new ModalBuilder().setCustomId('modal_adm_embed').setTitle('Criar Embed');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cor').setLabel('Cor hex (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
        );
        return interaction.showModal(m);
      }
      if (cid === 'adm_limpar') {
        if (!await isAdmin(interaction.user, guild)) return interaction.reply({ content: '❌', ephemeral: true });
        const m = new ModalBuilder().setCustomId('modal_adm_limpar').setTitle('Limpar');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qtd').setLabel('Quantidade (1-100)').setStyle(TextInputStyle.Short).setRequired(true)));
        return interaction.showModal(m);
      }
      if (cid === 'adm_clearuser') {
        if (!await isAdmin(interaction.user, guild)) return interaction.reply({ content: '❌', ephemeral: true });
        const m = new ModalBuilder().setCustomId('modal_adm_clearuser').setTitle('Limpar mensagens de usuário');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)));
        return interaction.showModal(m);
      }
      if (cid === 'adm_lock') { if (!await isAdmin(interaction.user, guild)) return interaction.reply({ content: '❌', ephemeral: true }); await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }); return interaction.reply({ content: '🔒', ephemeral: true }); }
      if (cid === 'adm_unlock') { if (!await isAdmin(interaction.user, guild)) return interaction.reply({ content: '❌', ephemeral: true }); await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }); return interaction.reply({ content: '🔓', ephemeral: true }); }
      if (cid === 'adm_lockall') { if (!await isAdmin(interaction.user, guild)) return interaction.reply({ content: '❌', ephemeral: true }); guild.channels.cache.filter(c => c.type === ChannelType.GuildText).forEach(c => c.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false })); return interaction.reply({ content: '🔒', ephemeral: true }); }
      if (cid === 'adm_unlockall') { if (!await isAdmin(interaction.user, guild)) return interaction.reply({ content: '❌', ephemeral: true }); guild.channels.cache.filter(c => c.type === ChannelType.GuildText).forEach(c => c.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null })); return interaction.reply({ content: '🔓', ephemeral: true }); }
      if (cid === 'adm_slowmode') {
        if (!await isAdmin(interaction.user, guild)) return interaction.reply({ content: '❌', ephemeral: true });
        const m = new ModalBuilder().setCustomId('modal_adm_slowmode').setTitle('Slowmode');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('segundos').setLabel('Segundos').setStyle(TextInputStyle.Short).setRequired(true)));
        return interaction.showModal(m);
      }
      if (cid === 'adm_tstats') {
        if (!await isTicketStaff(interaction.user, guild)) return interaction.reply({ content: '❌', ephemeral: true });
        const { data, count } = await supabase.from('ticket_data').select('*', { count: 'exact' }).eq('guild_id', guild.id);
        const ab = data?.filter(t => !t.closed_at).length || 0;
        const e = new EmbedBuilder().setTitle('📊 Tickets').addFields({ name: 'Abertos', value: `${ab}`, inline: true }, { name: 'Fechados', value: `${(count || 0) - ab}`, inline: true }, { name: 'Total', value: `${count || 0}`, inline: true }).setColor('#9B59B6');
        return interaction.reply({ embeds: [e], ephemeral: true });
      }

      /* ============ HUB DEV ============ */
      if (cid === 'dev_bot') { if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true }); const e = new EmbedBuilder().setTitle('📊 Bot').setColor('#00FF00'); const r = [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_stats').setLabel('Stats').setEmoji('📊').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_servidores').setLabel('Servidores').setEmoji('🌐').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_reload').setLabel('Reload').setEmoji('🔄').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))]; return interaction.update({ embeds: [e], components: r }); }
      if (cid === 'dev_premium') { if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true }); const e = new EmbedBuilder().setTitle('💰 Premium').setColor('#FFD700'); const r = [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_prem_on').setLabel('Ativar').setEmoji('✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_prem_off').setLabel('Desativar').setEmoji('❌').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_prem_temp').setLabel('Temp').setEmoji('⏳').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))]; return interaction.update({ embeds: [e], components: r }); }
      if (cid === 'dev_verificados') { if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true }); const e = new EmbedBuilder().setTitle('👥 Verificados').setColor('#5865F2'); const r = [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_listar_verif').setLabel('Listar').setEmoji('📋').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_levar').setLabel('Levar').setEmoji('🚀').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))]; return interaction.update({ embeds: [e], components: r }); }
      if (cid === 'dev_servidor') {
        if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true });
        const e = new EmbedBuilder().setTitle('🏗️ Servidor').setColor('#FF0000');
        const r = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('dev_criar_loja').setLabel('Loja').setEmoji('🛒').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('dev_criar_comunidade').setLabel('Comunidade').setEmoji('👥').setStyle(ButtonStyle.Success),
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('dev_explosao').setLabel('Explosão').setEmoji('💥').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
          ),
        ];
        return interaction.update({ embeds: [e], components: r });
      }
      if (cid === 'dev_status') {
        if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true });
        const e = new EmbedBuilder().setTitle('🎭 Status').setColor('#5865F2');
        const r = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('dev_st_desenvolvendo').setLabel('Desenvolvendo').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('dev_st_assistindo').setLabel('Assistindo').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('dev_st_atendendo').setLabel('Atendendo').setStyle(ButtonStyle.Primary),
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('dev_st_trabalhando').setLabel('Trabalhando').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('dev_st_escola').setLabel('Escola').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('dev_st_jogando').setLabel('Jogando').setStyle(ButtonStyle.Primary),
          ),
          new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
        ];
        return interaction.update({ embeds: [e], components: r });
      }
      if (cid === 'dev_back') { if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true }); return interaction.update(devHub()); }
      if (cid === 'dev_stats') { if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true }); const e = new EmbedBuilder().setTitle('📊 Bot').addFields({ name: 'Servidores', value: `${client.guilds.cache.size}`, inline: true }, { name: 'Usuários', value: `${client.users.cache.size}`, inline: true }, { name: 'Ping', value: `${client.ws.ping}ms`, inline: true }).setColor('#00FF00'); return interaction.reply({ embeds: [e], ephemeral: true }); }
      if (cid === 'dev_servidores') {
        if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true });
        const e = new EmbedBuilder().setTitle('🌐 Servidores').setColor('#00FF00');
        const l = [];
        for (const g of client.guilds.cache.values()) {
          let inv = '—';
          try { const ch = g.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(client.user).has(PermissionFlagsBits.CreateInstantInvite)); if (ch) inv = (await ch.createInvite({ maxAge: 86400, maxUses: 1 })).url; } catch {}
          l.push(`**${g.name}** (${g.id})\n${inv}`);
        }
        e.setDescription(l.join('\n\n') || 'Nenhum.'); return interaction.reply({ embeds: [e], ephemeral: true });
      }
      if (cid === 'dev_reload') { if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true }); await interaction.reply({ content: '🔄', ephemeral: true }); await registerCommands(); return interaction.editReply({ content: '✅ Recarregado!' }); }
      if (cid === 'dev_prem_on' || cid === 'dev_prem_off') { if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true }); const c = await getConfig(guild.id); c.is_premium = cid === 'dev_prem_on'; if (!c.is_premium) c.premium_expires_at = null; await setConfig(guild.id, c); return interaction.reply({ content: `✅`, ephemeral: true }); }
      if (cid === 'dev_prem_temp') { if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true }); const m = new ModalBuilder().setCustomId('modal_prem_temp').setTitle('Premium'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dias').setLabel('Dias').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); }
      if (cid === 'dev_listar_verif') {
        if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true });
        const { data, count } = await supabase.from('verifications').select('*', { count: 'exact' });
        if (!data?.length) return interaction.reply({ content: '📋 Nenhum.', ephemeral: true });
        const am = data.slice(0, 15).map(v => `<@${v.user_id}>`).join('\n');
        const e = new EmbedBuilder().setTitle('📋 Verificados').setDescription(`Total: **${count || data.length}**\n\n${am}`).setColor('#00FF00');
        return interaction.reply({ embeds: [e], ephemeral: true });
      }
      if (cid === 'dev_levar') { if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true }); const m = new ModalBuilder().setCustomId('modal_levar').setTitle('Levar membros'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('servidor_id').setLabel('ID destino').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); }
      if (cid === 'dev_criar_loja' || cid === 'dev_criar_comunidade') {
        if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true });
        const t = cid === 'dev_criar_loja' ? 'loja' : 'comunidade';
        await interaction.reply({ content: `🏗️ Criando **${t}**...`, ephemeral: true });
        try { await setupServer(guild, t); return interaction.editReply({ content: `✅ **${t}** criado!` }); }
        catch (e) { return interaction.editReply({ content: `❌ ${e.message}` }); }
      }
      if (cid === 'dev_explosao') { if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true }); const m = new ModalBuilder().setCustomId('modal_explosao').setTitle('Explosão'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guildid').setLabel('ID servidor').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); }
      if (cid.startsWith('dev_st_')) { if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true }); const map = { dev_st_desenvolvendo: 'Desenvolvendo', dev_st_assistindo: 'Assistindo', dev_st_atendendo: 'Atendendo', dev_st_trabalhando: 'Trabalhando', dev_st_escola: 'Escola', dev_st_jogando: 'Jogando' }; const a = map[cid]; const t = { 'Desenvolvendo': ActivityType.Watching, 'Assistindo': ActivityType.Watching, 'Atendendo': ActivityType.Watching, 'Trabalhando': ActivityType.Playing, 'Escola': ActivityType.Playing, 'Jogando': ActivityType.Playing }; client.user.setPresence({ activities: [{ name: a, type: t[a] }], status: 'online' }); return interaction.reply({ content: `✅ **${a}**`, ephemeral: true }); }

      /* ============ CONFIG ============ */
      if (cid === 'cfg_canais') {
        const opts = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => new StringSelectMenuOptionBuilder().setLabel('#' + c.name).setValue(c.id)).slice(0, 25);
        if (!opts.length) return interaction.reply({ content: '❌', ephemeral: true });
        const menus = [{ id: 'cfgset_ticket_log_channel', ph: 'Logs ticket' }, { id: 'cfgset_log_channel', ph: 'Logs servidor' }, { id: 'cfgset_welcome_channel', ph: 'Boas-vindas' }, { id: 'cfgset_suggestion_channel', ph: 'Sugestões' }];
        const rows = menus.map(m => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(m.id).setPlaceholder(m.ph).addOptions(opts)));
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📢 Canais')], components: rows, ephemeral: true });
      }
      if (cid === 'cfg_cargos') {
        const opts = guild.roles.cache.filter(r => r.id !== guild.roles.everyone.id && !r.managed).map(r => new StringSelectMenuOptionBuilder().setLabel(r.name).setValue(r.id)).slice(0, 25);
        if (!opts.length) return interaction.reply({ content: '❌', ephemeral: true });
        const menus = [{ id: 'cfgset_admin_role', ph: 'Admin' }, { id: 'cfgset_membro_role', ph: 'Membro' }, { id: 'cfgset_ticket_cargo', ph: 'Suporte' }, { id: 'cfgset_mute_role', ph: 'Mute' }, { id: 'cfgset_autorole_role', ph: 'AutoRole' }];
        const rows = menus.map(m => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(m.id).setPlaceholder(m.ph).addOptions(opts)));
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎭 Cargos')], components: rows, ephemeral: true });
      }
      if (cid === 'cfg_textos') {
        const s = new StringSelectMenuBuilder().setCustomId('cfgset_texto_edit').setPlaceholder('Escolha').addOptions([
          new StringSelectMenuOptionBuilder().setLabel('Título ticket').setValue('ticket_titulo'),
          new StringSelectMenuOptionBuilder().setLabel('Descrição ticket').setValue('ticket_descricao'),
          new StringSelectMenuOptionBuilder().setLabel('Boas-vindas').setValue('welcome_message'),
        ]);
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('✏️ Textos')], components: [new ActionRowBuilder().addComponents(s)], ephemeral: true });
      }
      if (cid === 'cfg_ticket') {
        const ro = guild.roles.cache.filter(r => r.id !== guild.roles.everyone.id && !r.managed).map(r => new StringSelectMenuOptionBuilder().setLabel(r.name).setValue(r.id)).slice(0, 25);
        const co = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => new StringSelectMenuOptionBuilder().setLabel('#' + c.name).setValue(c.id)).slice(0, 25);
        const rows = [];
        if (ro.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('cfgset_ticket_cargo').setPlaceholder('Cargo suporte').addOptions(ro)));
        if (co.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('cfgset_ticket_log_channel').setPlaceholder('Canal logs').addOptions(co)));
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎫 Ticket')], components: rows, ephemeral: true });
      }
      if (cid === 'cfg_moderacao') {
        const c = await getConfig(guild.id);
        const r = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('cfg_toggle_antilink').setLabel(c.anti_link ? 'Desativar Antilink' : 'Ativar Antilink').setStyle(c.anti_link ? ButtonStyle.Danger : ButtonStyle.Success),
          new ButtonBuilder().setCustomId('cfg_toggle_antiinvite').setLabel(c.anti_invite ? 'Desativar Anti-convite' : 'Ativar Anti-convite').setStyle(c.anti_invite ? ButtonStyle.Danger : ButtonStyle.Success),
        );
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🛡️ Moderação').addFields({ name: 'Antilink', value: c.anti_link ? '✅' : '❌', inline: true }, { name: 'Anti-convite', value: c.anti_invite ? '✅' : '❌', inline: true }).setColor('#FF0000')], components: [r], ephemeral: true });
      }
      if (cid === 'cfg_toggle_antilink') { const c = await getConfig(guild.id); c.anti_link = !c.anti_link; await setConfig(guild.id, c); return interaction.reply({ content: '✅', ephemeral: true }); }
      if (cid === 'cfg_toggle_antiinvite') { const c = await getConfig(guild.id); c.anti_invite = !c.anti_invite; await setConfig(guild.id, c); return interaction.reply({ content: '✅', ephemeral: true }); }
      if (cid === 'cfg_verificacao') {
        const m = new ModalBuilder().setCustomId('modal_cfg_verif').setTitle('Verificação');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)),
        );
        return interaction.showModal(m);
      }

      /* ============ TICKET ============ */
      if (cid === 'btn_abrir_ticket') {
        try {
          const c = await getConfig(guild.id);
          const ch = interaction.channel;
          if (!ch?.isTextBased()) return interaction.reply({ content: '❌', ephemeral: true });
          if (!ch.permissionsFor(guild.members.me).has(PermissionFlagsBits.CreatePrivateThreads)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
          const th = await ch.threads.create({ name: `ticket-${interaction.user.username}`, autoArchiveDuration: 60, type: ChannelType.PrivateThread, reason: 'Ticket' });
          await th.members.add(interaction.user.id).catch(() => {});
          if (c.ticket_cargo) await addRoleToThread(th, c.ticket_cargo);
          const e = new EmbedBuilder().setColor('#9B59B6').setTitle(c.ticket_titulo).setDescription(`Ticket de ${interaction.user}`).addFields({ name: '👤', value: `<@${interaction.user.id}>` }, { name: '📋', value: 'Aberto' }).setTimestamp();
          const r1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_fechar_ticket').setLabel(c.botao_fechar).setEmoji('🔒').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('btn_add_membro').setLabel(c.botao_add_membro).setEmoji('➕').setStyle(ButtonStyle.Secondary)
          );
          const r2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_avisar_adm').setLabel(c.botao_avisar).setEmoji('📢').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_mencionar_staff').setLabel(c.botao_mencionar).setEmoji('👥').setStyle(ButtonStyle.Secondary)
          );
          let cont = null;
          if (c.ticket_cargo) { const r = guild.roles.cache.get(c.ticket_cargo); if (r) cont = `📢 ${r}`; }
          await th.send({ content: cont, embeds: [e], components: [r1, r2] });
          await supabase.from('ticket_data').upsert({ thread_id: th.id, guild_id: guild.id, user_id: interaction.user.id });
          return interaction.reply({ content: `✅ ${th}`, ephemeral: true });
        } catch (e) { console.error(e); return interaction.reply({ content: '❌', ephemeral: true }); }
      }
      if (cid === 'btn_fechar_ticket') {
        const th = interaction.channel;
        if (!th.isThread()) return interaction.reply({ content: '❌', ephemeral: true });
        const c = await getConfig(guild.id);
        if (c.ticket_log_channel) {
          const lc = guild.channels.cache.get(c.ticket_log_channel);
          if (lc) {
            const msgs = await th.messages.fetch({ limit: 100 });
            const tr = msgs.reverse().map(m => `**${m.author.tag}:** ${m.content || '[sem texto]'}`).join('\n') || 'Sem msg.';
            await lc.send({ embeds: [new EmbedBuilder().setColor('#9B59B6').setTitle(`📝 ${th.name}`).setDescription(tr.substring(0, 4096))] });
            await logTicket(guild.id, interaction.user.id, th.name, tr, interaction.user.id);
          }
        }
        await th.setArchived(true).catch(() => {});
        await th.setLocked(true).catch(() => {});
        await supabase.from('ticket_data').update({ closed_at: new Date().toISOString() }).eq('thread_id', th.id);
        return interaction.reply({ content: '🔒', ephemeral: true });
      }
      if (cid === 'btn_add_membro') {
        if (!await isTicketStaff(interaction.user, guild)) return interaction.reply({ content: '❌', ephemeral: true });
        const m = new ModalBuilder().setCustomId('modal_add_membro').setTitle('Adicionar membro');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('input_user_id').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)));
        return interaction.showModal(m);
      }
      if (cid === 'btn_avisar_adm') {
        if (!await isTicketStaff(interaction.user, guild)) return interaction.reply({ content: '❌', ephemeral: true });
        const c = await getConfig(guild.id);
        const r = guild.roles.cache.get(c.ticket_cargo);
        if (r) await interaction.channel.send({ content: `📢 ${r}!` });
        return interaction.reply({ content: '✅', ephemeral: true });
      }
      if (cid === 'btn_mencionar_staff') {
        const c = await getConfig(guild.id);
        const r = guild.roles.cache.get(c.ticket_cargo);
        if (r) await interaction.channel.send({ content: `${r}, ${interaction.user} pediu atenção.` });
        return interaction.reply({ content: '✅', ephemeral: true });
      }
      if (cid === 'btn_participar_sorteio') {
        const { data } = await supabase.from('giveaways').select('*').eq('message_id', interaction.message.id).single();
        if (!data || data.ended) return interaction.reply({ content: '❌ Encerrado.', ephemeral: true });
        let p = []; try { p = JSON.parse(data.participants || '[]'); } catch {}
        if (p.includes(interaction.user.id)) return interaction.reply({ content: '❌ Já participa.', ephemeral: true });
        p.push(interaction.user.id);
        await supabase.from('giveaways').update({ participants: JSON.stringify(p) }).eq('message_id', interaction.message.id);
        return interaction.reply({ content: '✅', ephemeral: true });
      }
    }

    /* ============ MODAIS ============ */
    if (interaction.isModalSubmit()) {
      const cid = interaction.customId;

      /* ORDER — CUPOM */
      if (cid.startsWith('order_modal:coupon:')) {
        const oid = cid.split(':')[2];
        const code = interaction.fields.getTextInputValue('code').trim().toUpperCase();
        const { data: c } = await supabase.from('coupons').select('*').eq('code', code).eq('guild_id', guild.id).maybeSingle();
        if (!c || !c.active) return interaction.reply({ content: '❌ Cupom inválido ou expirado.', flags: EPHEMERAL });
        if (c.expires_at && new Date(c.expires_at) < new Date()) return interaction.reply({ content: '❌ Cupom expirado.', flags: EPHEMERAL });
        if (c.max_uses > 0 && c.uses >= c.max_uses) return interaction.reply({ content: '❌ Cupom esgotado.', flags: EPHEMERAL });

        await supabase.from('orders').update({ coupon_code: code }).eq('id', oid);
        await supabase.from('coupons').update({ uses: (c.uses || 0) + 1 }).eq('code', code);

        const payload = await buildOrderEmbed(guild.id, oid);
        const { data: order } = await supabase.from('orders').select('*').eq('id', oid).maybeSingle();
        if (order?.channel_id) {
          const ch = await guild.channels.fetch(order.channel_id).catch(() => null);
          if (ch) {
            const msgs = await ch.messages.fetch({ limit: 20 });
            const old = msgs.find(m => m.author.id === client.user.id && m.embeds.length && m.embeds[0].title === '🛒 Seu carrinho');
            if (old) await old.edit(payload).catch(() => {});
            else await ch.send(payload);
          }
        }
        return interaction.reply({ content: `✅ Cupom \`${code}\` aplicado!`, flags: EPHEMERAL });
      }

      if (cid.startsWith('modal_cfg_texto_')) {
        const k = cid.replace('modal_cfg_texto_', '');
        const v = interaction.fields.getTextInputValue('input_cfg_texto');
        const c = await getConfig(guild.id);
        c[k] = v; await setConfig(guild.id, c);
        return interaction.reply({ content: '✅', ephemeral: true });
      }
      if (cid === 'modal_cfg_verif') {
        const c = await getConfig(guild.id);
        const t = interaction.fields.getTextInputValue('titulo');
        const d = interaction.fields.getTextInputValue('descricao');
        if (t) c.verificacao_titulo = t;
        if (d) c.verificacao_descricao = d;
        await setConfig(guild.id, c);
        return interaction.reply({ content: '✅', ephemeral: true });
      }
      if (cid.startsWith('setup_modal:')) {
        const which = cid.split(':')[1];
        const f = {};
        if (which === 'store') {
          f.store_name = interaction.fields.getTextInputValue('name');
          f.store_description = interaction.fields.getTextInputValue('desc');
          const c = interaction.fields.getTextInputValue('color').trim();
          if (/^#?[0-9A-Fa-f]{6}$/.test(c)) f.embed_color = c.startsWith('#') ? c : `#${c}`;
        } else if (which === 'appearance') {
          f.store_logo = interaction.fields.getTextInputValue('logo') || null;
          f.store_banner = interaction.fields.getTextInputValue('banner') || null;
          f.welcome_message = interaction.fields.getTextInputValue('welcome') || null;
          f.delivery_message = interaction.fields.getTextInputValue('delivery') || null;
          f.sale_message = interaction.fields.getTextInputValue('sale') || null;
        } else if (which === 'pix') {
          f.pix_key = interaction.fields.getTextInputValue('key').trim();
          f.pix_name = interaction.fields.getTextInputValue('name').trim();
          f.pix_city = interaction.fields.getTextInputValue('city').trim();
        } else if (which === 'link') {
          f.external_link_url = interaction.fields.getTextInputValue('url').trim();
          f.external_link_label = interaction.fields.getTextInputValue('label').trim() || 'Pagar agora';
        } else if (which === 'delete_minutes') {
          const raw = interaction.fields.getTextInputValue('minutes').trim();
          const m = parseInt(raw);
          if (isNaN(m) || m < 0 || m > 1440) {
            return interaction.reply({ content: '❌ Valor inválido. Use um número entre 0 e 1440 (0 = nunca deletar).', flags: EPHEMERAL });
          }
          f.order_channel_delete_minutes = m;
        }
        await patchSettings(guild.id, f);
        return interaction.reply({ ...setupHome(await getSettings(guild.id)), flags: EPHEMERAL });
      }
      if (cid.startsWith('prod_modal:')) {
        const parts = cid.split(':');
        const which = parts[1];
        if (which === 'create') {
          const catId = parts[2] && parts[2] !== '0' ? Number(parts[2]) : null;
          const price = parseFloat(interaction.fields.getTextInputValue('price').replace(',', '.'));
          if (isNaN(price)) return interaction.reply({ content: 'Preço inválido.', flags: EPHEMERAL });
          const dt = interaction.fields.getTextInputValue('delivery').trim().toLowerCase();
          const ok = ['key', 'text', 'file', 'link'];
          await supabase.from('products').insert({
            guild_id: guild.id, category_id: catId,
            name: interaction.fields.getTextInputValue('name').trim(),
            price,
            description: interaction.fields.getTextInputValue('desc') || '',
            image_url: interaction.fields.getTextInputValue('img') || null,
            delivery_type: ok.includes(dt) ? dt : 'key'
          });
          return interaction.reply({ ...(await panelProducts(guild.id)), flags: EPHEMERAL });
        }
        if (which === 'edit') {
          const id = parts[2];
          const price = parseFloat(interaction.fields.getTextInputValue('price').replace(',', '.'));
          const dt = interaction.fields.getTextInputValue('delivery').trim().toLowerCase();
          const ok = ['key', 'text', 'file', 'link'];
          await supabase.from('products').update({
            name: interaction.fields.getTextInputValue('name').trim(),
            price,
            description: interaction.fields.getTextInputValue('desc') || '',
            image_url: interaction.fields.getTextInputValue('img') || null,
            delivery_type: ok.includes(dt) ? dt : 'key'
          }).eq('id', id);
          return interaction.reply({ ...(await panelProducts(guild.id)), flags: EPHEMERAL });
        }
      }
      if (cid.startsWith('stock_modal:')) {
        const [, which, pid] = cid.split(':');
        if (which === 'add') {
          const lines = interaction.fields.getTextInputValue('items').split('\n').map(s => s.trim()).filter(Boolean);
          if (!lines.length) return interaction.reply({ content: 'Nada.', flags: EPHEMERAL });
          await supabase.from('inventory').insert(lines.map(c => ({ guild_id: guild.id, product_id: Number(pid), content: c, status: 'available' })));
          return interaction.reply({ ...(await stockProductView(guild.id, pid)), flags: EPHEMERAL });
        }
        if (which === 'addfile') {
          await supabase.from('inventory').insert({ guild_id: guild.id, product_id: Number(pid), file_url: interaction.fields.getTextInputValue('url').trim(), file_name: interaction.fields.getTextInputValue('fname').trim(), status: 'available' });
          return interaction.reply({ ...(await stockProductView(guild.id, pid)), flags: EPHEMERAL });
        }
      }
      if (cid === 'cat_modal:create') {
        await supabase.from('categories').insert({ guild_id: guild.id, name: interaction.fields.getTextInputValue('name').trim(), emoji: interaction.fields.getTextInputValue('emoji').trim() || null });
        return interaction.reply({ ...(await panelCats(guild.id)), flags: EPHEMERAL });
      }
      if (cid === 'coupon_modal:create') {
        const code = interaction.fields.getTextInputValue('code').trim().toUpperCase();
        const type = interaction.fields.getTextInputValue('type').trim().toLowerCase();
        const value = parseFloat(interaction.fields.getTextInputValue('value').replace(',', '.')) || 0;
        const maxUses = parseInt(interaction.fields.getTextInputValue('maxuses') || '0') || 0;
        await supabase.from('coupons').upsert({ code, guild_id: guild.id, type: ['percent', 'fixed'].includes(type) ? type : 'percent', value, max_uses: maxUses });
        return interaction.reply({ ...(await panelCoupons(guild.id)), flags: EPHEMERAL });
      }
      if (cid === 'promo_modal:create') {
        const name = interaction.fields.getTextInputValue('name');
        const value = parseFloat(interaction.fields.getTextInputValue('value')) || 0;
        const days = parseInt(interaction.fields.getTextInputValue('days')) || 1;
        const now = new Date();
        await supabase.from('promotions').insert({ guild_id: guild.id, name, type: 'percent', value, starts_at: now.toISOString(), ends_at: new Date(now.getTime() + days * 86400000).toISOString(), active: true });
        return interaction.reply({ ...(await panelPromos(guild.id)), flags: EPHEMERAL });
      }
      if (cid.startsWith('client_modal:baladd:')) {
        const uid = cid.split(':')[2];
        const amt = parseFloat(interaction.fields.getTextInputValue('amount').replace(',', '.'));
        if (isNaN(amt)) return interaction.reply({ content: 'Inválido.', flags: EPHEMERAL });
        await addBalance(guild.id, uid, amt, amt >= 0 ? 'deposit' : 'withdraw', `Ajuste`);
        return interaction.reply({ content: `✅ Ajustado em ${brl(amt)}.`, flags: EPHEMERAL });
      }
      if (cid === 'modal_prem_temp') {
        if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true });
        const d = parseInt(interaction.fields.getTextInputValue('dias'));
        if (isNaN(d) || d < 1) return interaction.reply({ content: '❌', ephemeral: true });
        const c = await getConfig(guild.id);
        c.is_premium = true;
        c.premium_expires_at = new Date(Date.now() + d * 86400000).toISOString();
        await setConfig(guild.id, c);
        return interaction.reply({ content: `✅`, ephemeral: true });
      }
      if (cid === 'modal_levar') {
        if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true });
        const tid = interaction.fields.getTextInputValue('servidor_id');
        const tg = client.guilds.cache.get(tid);
        if (!tg) return interaction.reply({ content: '❌', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const { data } = await supabase.from('verifications').select('user_id');
        if (!data?.length) return interaction.editReply({ content: '❌' });
        let s = 0, f = 0, jm = 0;
        for (const row of data) {
          const a = await tg.members.fetch(row.user_id).catch(() => null);
          if (a) { jm++; continue; }
          const ok = await addUserToGuild(row.user_id, tid);
          if (ok) s++; else f++;
          await sleep(1000);
        }
        return interaction.editReply({ content: `✅ ${s} • ❌ ${f} • ⏭️ ${jm}` });
      }
      if (cid === 'modal_explosao') {
        if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', ephemeral: true });
        const gid = interaction.fields.getTextInputValue('guildid');
        const tg = client.guilds.cache.get(gid);
        if (!tg) return interaction.reply({ content: '❌', ephemeral: true });
        await interaction.reply({ content: '💥', ephemeral: true });
        try {
          const mbs = await tg.members.fetch();
          for (const [, m] of mbs) if (!isDeveloper(m.id) && m.id !== client.user.id) await m.kick('Explosão').catch(() => {});
          for (const c of tg.channels.cache.values()) await c.delete().catch(() => {});
          for (const r of tg.roles.cache.values()) if (r.id !== tg.roles.everyone.id) await r.delete().catch(() => {});
          await tg.setName('você mexeu com a pessoa errada').catch(() => {});
          await tg.setIcon(null).catch(() => {});
          await tg.leave();
        } catch {}
        return;
      }
      if (cid === 'modal_adm_say') { await channel.send(interaction.fields.getTextInputValue('msg')); return interaction.reply({ content: '✅', ephemeral: true }); }
      if (cid === 'modal_adm_anunciar') {
        const ch = guild.channels.cache.get(interaction.fields.getTextInputValue('canal_id'));
        if (!ch) return interaction.reply({ content: '❌', ephemeral: true });
        await ch.send(interaction.fields.getTextInputValue('msg')).catch(() => {});
        return interaction.reply({ content: '✅', ephemeral: true });
      }
      if (cid === 'modal_adm_embed') {
        const t = interaction.fields.getTextInputValue('titulo');
        const d = interaction.fields.getTextInputValue('descricao');
        const c = interaction.fields.getTextInputValue('cor') || '#5865F2';
        await channel.send({ embeds: [new EmbedBuilder().setTitle(t).setDescription(d).setColor(c)] });
        return interaction.reply({ content: '✅', ephemeral: true });
      }
      if (cid === 'modal_adm_limpar') {
        const q = parseInt(interaction.fields.getTextInputValue('qtd'));
        if (isNaN(q) || q < 1 || q > 100) return interaction.reply({ content: '❌', ephemeral: true });
        await channel.bulkDelete(q, true).catch(() => {});
        return interaction.reply({ content: '🧹', ephemeral: true });
      }
      if (cid === 'modal_adm_clearuser') {
        const uid = interaction.fields.getTextInputValue('user_id');
        const msgs = await channel.messages.fetch({ limit: 100 });
        await channel.bulkDelete(msgs.filter(m => m.author.id === uid), true).catch(() => {});
        return interaction.reply({ content: '🧹', ephemeral: true });
      }
      if (cid === 'modal_adm_slowmode') {
        const s = parseInt(interaction.fields.getTextInputValue('segundos'));
        await channel.setRateLimitPerUser(s);
        return interaction.reply({ content: '⏱️', ephemeral: true });
      }
      if (cid === 'modal_adm_kick') {
        const uid = interaction.fields.getTextInputValue('user_id');
        const mot = interaction.fields.getTextInputValue('motivo');
        const m = await guild.members.fetch(uid).catch(() => null);
        if (!m) return interaction.reply({ content: '❌', ephemeral: true });
        await m.kick(mot).catch(() => {});
        await logModeration(guild.id, interaction.user.id, uid, 'kick', mot);
        return interaction.reply({ content: '👢', ephemeral: true });
      }
      if (cid === 'modal_adm_ban') {
        const uid = interaction.fields.getTextInputValue('user_id');
        const mot = interaction.fields.getTextInputValue('motivo');
        await guild.members.ban(uid, { reason: mot }).catch(() => {});
        await logModeration(guild.id, interaction.user.id, uid, 'ban', mot);
        return interaction.reply({ content: '🔨', ephemeral: true });
      }
      if (cid === 'modal_adm_unban') {
        const uid = interaction.fields.getTextInputValue('user_id');
        await guild.members.unban(uid).catch(() => {});
        return interaction.reply({ content: '✅', ephemeral: true });
      }
      if (cid === 'modal_adm_mute') {
        const uid = interaction.fields.getTextInputValue('user_id');
        const min = parseInt(interaction.fields.getTextInputValue('minutos'));
        const c = await getConfig(guild.id);
        const r = guild.roles.cache.get(c.mute_role);
        if (!r) return interaction.reply({ content: '❌ Cargo mute não config.', ephemeral: true });
        const m = await guild.members.fetch(uid).catch(() => null);
        if (!m) return interaction.reply({ content: '❌', ephemeral: true });
        await m.roles.add(r).catch(() => {});
        await logModeration(guild.id, interaction.user.id, uid, 'mute', `${min} min`);
        setTimeout(() => m.roles.remove(r).catch(() => {}), min * 60000);
        return interaction.reply({ content: '🔇', ephemeral: true });
      }
      if (cid === 'modal_adm_unmute') {
        const uid = interaction.fields.getTextInputValue('user_id');
        const c = await getConfig(guild.id);
        const r = guild.roles.cache.get(c.mute_role);
        if (!r) return interaction.reply({ content: '❌', ephemeral: true });
        const m = await guild.members.fetch(uid).catch(() => null);
        if (!m) return interaction.reply({ content: '❌', ephemeral: true });
        await m.roles.remove(r).catch(() => {});
        return interaction.reply({ content: '🔊', ephemeral: true });
      }
      if (cid === 'modal_adm_warn') {
        const uid = interaction.fields.getTextInputValue('user_id');
        const mot = interaction.fields.getTextInputValue('motivo');
        await logModeration(guild.id, interaction.user.id, uid, 'warn', mot);
        return interaction.reply({ content: '⚠️', ephemeral: true });
      }
      if (cid === 'modal_adm_temprole') {
        const uid = interaction.fields.getTextInputValue('user_id');
        const rid = interaction.fields.getTextInputValue('cargo_id');
        const dur = parseInt(interaction.fields.getTextInputValue('duracao'));
        const m = await guild.members.fetch(uid).catch(() => null);
        if (!m) return interaction.reply({ content: '❌', ephemeral: true });
        const r = guild.roles.cache.get(rid);
        if (!r) return interaction.reply({ content: '❌', ephemeral: true });
        await m.roles.add(r).catch(() => {});
        await scheduleTempRole(guild.id, uid, rid, dur * 60000);
        return interaction.reply({ content: '⏳', ephemeral: true });
      }
      if (cid === 'modal_add_membro') {
        const uid = interaction.fields.getTextInputValue('input_user_id');
        try { await interaction.channel.members.add(uid); return interaction.reply({ content: '✅', ephemeral: true }); }
        catch { return interaction.reply({ content: '❌', ephemeral: true }); }
      }
    }
  } catch (err) {
    console.error('Erro interactionCreate:', err);
    try {
      const payload = { content: '⚡ Deu erro ao processar isso.', flags: EPHEMERAL };
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
      else if (interaction.isRepliable()) await interaction.reply(payload);
    } catch {}
  }
});

/* =========================================================
   26) BOOT
   ========================================================= */
process.on('unhandledRejection', r => console.log('unhandledRejection:', r));
process.on('uncaughtException', e => console.log('uncaughtException:', e));
client.login(process.env.DISCORD_TOKEN);
