// ═══════════════════════════════════════════════════════════
// 🎮 FRIO APOSTAS — apostas.js — v1.0.0
// Bot enxuto: Apostas FF + Streamers + Tickets + Dev/Premium
// Compartilha Supabase com o Frio Bot principal
// App Discord separado (novo token + client_id)
// ═══════════════════════════════════════════════════════════
require('dotenv').config();

const crypto = require('crypto');
const os = require('os');

const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  AttachmentBuilder, ActivityType, MessageFlags, Options,
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder,
} = require('discord.js');

let playdl;
try { playdl = require('play-dl'); } catch { playdl = null; }

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');

// ═══════════════════════════════════════════════════════════
// VERSÃO
// ═══════════════════════════════════════════════════════════
const BOT_VERSION = 'v1.0.0';
const BOT_START_TIME = Date.now();

// ═══════════════════════════════════════════════════════════
// ENV
// ═══════════════════════════════════════════════════════════
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const OWNER_ID = process.env.OWNER_ID ? String(process.env.OWNER_ID) : null;
const PANEL_API_TOKEN = process.env.PANEL_API_TOKEN || null;
const JWT_SECRET = process.env.JWT_SECRET || null;
const REDIRECT_URI = process.env.REDIRECT_URI || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/callback`;
const VERIFY_SECRET = process.env.VERIFY_SECRET || DISCORD_CLIENT_SECRET || 'frio-verify-fallback';
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || null;

if (!DISCORD_TOKEN) { console.error('❌ DISCORD_TOKEN ausente.'); process.exit(1); }
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) { console.error('❌ SUPABASE_URL ou SUPABASE_KEY ausente.'); process.exit(1); }

// ═══════════════════════════════════════════════════════════
// EXPRESS
// ═══════════════════════════════════════════════════════════
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

app.get('/', (req, res) => res.send(`Frio Apostas ${BOT_VERSION} online! 🎮`));

const PORT = process.env.PORT || process.env.WEBHOOK_PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 [EXPRESS] Web em http://0.0.0.0:${PORT}`);
});

// ═══════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════
const EPHEMERAL = MessageFlags.Ephemeral;
const MAX_FORM_QUESTIONS = 5;
const MAX_TICKET_TYPES_PER_PANEL = 24;
const MAX_TICKET_PANELS = 100;

const DEV_ROLE_NAME = 'Dev do Frio Bot';

const PREMIUM_TIERS = {
  basic:     { label: 'Basic',     emoji: '🥉', color: '#CD7F32', weight: 1 },
  premium:   { label: 'Premium',   emoji: '🥈', color: '#C0C0C0', weight: 2 },
  ultra:     { label: 'Ultra',     emoji: '🥇', color: '#FFD700', weight: 3 },
  unlimited: { label: 'Unlimited', emoji: '💎', color: '#8B5CF6', weight: 4 },
};

function tierWeight(t) { return PREMIUM_TIERS[t]?.weight || 0; }
function tierAtLeast(userTier, requiredTier) { return tierWeight(userTier) >= tierWeight(requiredTier); }

// ═══════════════════════════════════════════════════════════
// FF FORMATS
// ═══════════════════════════════════════════════════════════
const FF_FORMATS = [
  { id: '1x1_mobile', label: '1v1 Mobile', emoji: '📱', teamSize: 1, totalPlayers: 2 },
  { id: '2x2_mobile', label: '2v2 Mobile', emoji: '📱', teamSize: 2, totalPlayers: 4 },
  { id: '3x3_mobile', label: '3v3 Mobile', emoji: '📱', teamSize: 3, totalPlayers: 6 },
  { id: '4x4_mobile', label: '4v4 Mobile', emoji: '📱', teamSize: 4, totalPlayers: 8 },
  { id: '1x1_emu',    label: '1v1 Emulador', emoji: '💻', teamSize: 1, totalPlayers: 2 },
  { id: '2x2_emu',    label: '2v2 Emulador', emoji: '💻', teamSize: 2, totalPlayers: 4 },
  { id: '3x3_emu',    label: '3v3 Emulador', emoji: '💻', teamSize: 3, totalPlayers: 6 },
  { id: '4x4_emu',    label: '4v4 Emulador', emoji: '💻', teamSize: 4, totalPlayers: 8 },
  { id: '2x2_misto',  label: '2v2 Misto',    emoji: '📱💻', teamSize: 2, totalPlayers: 4 },
  { id: '3x3_misto',  label: '3v3 Misto',    emoji: '📱💻', teamSize: 3, totalPlayers: 6 },
  { id: '4x4_misto',  label: '4v4 Misto',    emoji: '📱💻', teamSize: 4, totalPlayers: 8 },
];

const FF_PULL_SIZE = 2;
const FF_DEFAULT_VALUES = ['0.50', '0.70', '1.00', '2.00', '3.00', '5.00', '10.00', '20.00', '30.00', '40.00', '50.00', '100.00'];
const FF_COIN_DEFAULTS = [
  { name: '・Girl 🎀',           emoji: '🎀', price: 5,   role_name: '・Girl 🎀' },
  { name: '・Trem 🚂',           emoji: '🚂', price: 10,  role_name: '・Trem 🚂' },
  { name: '・Rei Dos Clips',     emoji: '🎬', price: 15,  role_name: '・Rei Dos Clips' },
  { name: '・GREEN',             emoji: '🟢', price: 20,  role_name: '・GREEN' },
  { name: '・rei do 2,90',       emoji: '💸', price: 30,  role_name: '・rei do 2,90' },
  { name: '・CRIA DA DG',        emoji: '👑', price: 40,  role_name: '・CRIA DA DG' },
  { name: '・Magnata',           emoji: '💰', price: 50,  role_name: '・Magnata' },
  { name: '・REI DA 2X',         emoji: '👑', price: 75,  role_name: '・REI DA 2X' },
  { name: '・REI DOS AP',        emoji: '🏆', price: 100, role_name: '・REI DOS AP' },
  { name: '・@RICO DA ORG',      emoji: '💎', price: 150, role_name: '・@RICO DA ORG' },
];

// ═══════════════════════════════════════════════════════════
// SUPABASE (mesmo DB do Frio Bot)
// ═══════════════════════════════════════════════════════════
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
  auth: { persistSession: false },
  global: {
    headers: { 'X-Client-Info': 'frio-apostas/1.0.0' },
    fetch: (url, opts = {}) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timeout));
    },
  },
  db: { schema: 'public' },
});

// ═══════════════════════════════════════════════════════════
// DISCORD CLIENT
// ═══════════════════════════════════════════════════════════
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: ['CHANNEL', 'MESSAGE', 'REACTION'],
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    GuildMemberManager: 50,
    PresenceManager: 0,
    VoiceStateManager: 0,
    MessageManager: 15,
    ReactionManager: 3,
    GuildInviteManager: 5,
    GuildScheduledEventManager: 0,
    StageInstanceManager: 0,
    GuildEmojiManager: 50,
    GuildStickerManager: 30,
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: { interval: 300, lifetime: 600, filter: () => () => true },
    users: { interval: 3600, filter: () => u => u.bot && u.id !== client.user?.id },
    guildMembers: { interval: 600, filter: () => m => m.user.bot },
    presences: { interval: 120, filter: () => () => true },
    threads: { interval: 3600, lifetime: 7200, filter: () => () => true },
  },
});

// ═══════════════════════════════════════════════════════════
// DEVELOPERS
// ═══════════════════════════════════════════════════════════
const DEVELOPER_IDS = ['1192230982250672158', '1545438919837880421'];
function isDeveloper(id) {
  if (!id || typeof id !== 'string') return false;
  if (DEVELOPER_IDS.includes(id)) return true;
  if (OWNER_ID && id === OWNER_ID) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════
// HELPERS GERAIS
// ═══════════════════════════════════════════════════════════
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function parseJson(v, def = []) {
  if (v === null || v === undefined) return def;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return def; }
}
function brl(v) { return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`; }
function fmtUptime(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600),
        m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
}
function maskToken(t) {
  if (!t) return null;
  const s = String(t);
  if (s.length < 8) return '••••••••';
  return `${s.substring(0, 4)}••••••••${s.substring(s.length - 4)}`;
}
function isValidHex(s) { return /^#?[0-9A-Fa-f]{6}$/.test(s || ''); }
function normalizeHex(s, def = '#5865F2') {
  if (!isValidHex(s)) return def;
  return s.startsWith('#') ? s : `#${s}`;
}
function isValidUrl(s) { return /^https?:\/\/.+/i.test(s || ''); }

function safeStr(v, max = 0) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === 'undefined' || s === 'null') return null;
  return max > 0 ? s.slice(0, max) : s;
}
function safeColor(v, def = '#5865F2') {
  if (!v || v === 'undefined' || v === 'null') return def;
  const s = String(v);
  return /^#?[0-9A-Fa-f]{6}$/.test(s) ? (s.startsWith('#') ? s : `#${s}`) : def;
}
function safeUrl(v) {
  if (!v || v === 'undefined' || v === 'null') return null;
  return /^https?:\/\/.+/i.test(String(v)) ? String(v) : null;
}

function extractId(input) {
  if (!input) return null;
  const s = String(input).trim();
  const m = s.match(/^<[@#]!?&?(\d{15,25})>$/);
  if (m) return m[1];
  if (/^\d{15,25}$/.test(s)) return s;
  return null;
}
function resolveChannel(guild, input) {
  if (!guild || !input) return null;
  const s = String(input).trim();
  const id = extractId(s);
  if (id) return guild.channels.cache.get(id) || null;
  const name = s.startsWith('#') ? s.slice(1) : s;
  return guild.channels.cache.find(c => c.name === name)
    || guild.channels.cache.find(c => c.name.toLowerCase() === name.toLowerCase())
    || null;
}
function resolveRole(guild, input) {
  if (!guild || !input) return null;
  const s = String(input).trim();
  const id = extractId(s);
  if (id) return guild.roles.cache.get(id) || null;
  const name = s.replace(/^@/, '');
  return guild.roles.cache.find(r => r.name === name)
    || guild.roles.cache.find(r => r.name.toLowerCase() === name.toLowerCase())
    || null;
}

// ═══════════════════════════════════════════════════════════
// SAFE EMBEDS
// ═══════════════════════════════════════════════════════════
function applyEmbedSafe(embed, opts = {}) {
  const title = safeStr(opts.title, 256);
  const desc = safeStr(opts.description, 4096);
  const color = safeColor(opts.color);
  if (title) embed.setTitle(title);
  if (desc) embed.setDescription(desc);
  if (color) embed.setColor(color);
  const thumb = safeUrl(opts.thumbnail); if (thumb) embed.setThumbnail(thumb);
  const image = safeUrl(opts.image); if (image) embed.setImage(image);
  const footerText = safeStr(opts.footer, 2048);
  const footerIcon = safeUrl(opts.footerIcon);
  if (footerText) embed.setFooter(footerIcon ? { text: footerText, iconURL: footerIcon } : { text: footerText });
  const authorName = safeStr(opts.authorName, 256);
  const authorIcon = safeUrl(opts.authorIcon);
  if (authorName) embed.setAuthor(authorIcon ? { name: authorName, iconURL: authorIcon } : { name: authorName });
  if (Array.isArray(opts.fields)) {
    const fields = opts.fields
      .filter(f => f && safeStr(f.name) && safeStr(f.value))
      .slice(0, 25)
      .map(f => ({ name: safeStr(f.name, 256), value: safeStr(f.value, 1024), inline: !!f.inline }));
    if (fields.length) embed.addFields(fields);
  }
  return embed;
}

// ═══════════════════════════════════════════════════════════
// CACHES
// ═══════════════════════════════════════════════════════════
const _recentActivity = new Map();
const _refreshQueue = new Map();
const _ticketSaveLocks = new Map();
const USER_RATE_LIMITS = new Map();
const TICKET_COOLDOWN = new Map();
const TICKET_CLOSING = new Set();
const BROADCAST_DRAFTS = new Map();
const _activeIntervals = new Set();

function safeInterval(fn, ms, label = 'interval') {
  let running = false;
  const handle = setInterval(async () => {
    if (running) return;
    running = true;
    try { await fn(); }
    catch (e) { console.error(`[${label}]`, e?.message || e); }
    finally { running = false; }
  }, ms);
  _activeIntervals.add(handle);
  return handle;
}

function clearAllIntervals() {
  for (const h of _activeIntervals) clearInterval(h);
  _activeIntervals.clear();
}

function checkInteractionRateLimit(userId, key, limitMs) {
  const rlKey = `${userId}:${key}`;
  const now = Date.now();
  const last = USER_RATE_LIMITS.get(rlKey) || 0;
  if (now - last < limitMs) return false;
  USER_RATE_LIMITS.set(rlKey, now);
  if (USER_RATE_LIMITS.size > 5000) {
    const cutoff = now - 60000;
    for (const [k, v] of USER_RATE_LIMITS) if (v < cutoff) USER_RATE_LIMITS.delete(k);
  }
  return true;
}

function scheduleRefresh(key, fn, delay = 1000) {
  const existing = _refreshQueue.get(key);
  if (existing?.timer) clearTimeout(existing.timer);
  const timer = setTimeout(async () => {
    _refreshQueue.delete(key);
    try { await fn(); }
    catch (e) { console.error(`[REFRESH] ${key}:`, e.message); }
  }, delay);
  _refreshQueue.set(key, { fn, timer });
}

// ═══════════════════════════════════════════════════════════
// CONFIG — get/set
// ═══════════════════════════════════════════════════════════
const defaultConfig = {
  server_type: 'apostas',
  is_premium: false,
  premium_expires_at: null,
  premium_tier: null,
  admin_role: '',
  log_channel: '',
  embed_color: '#5865F2',
};

async function getConfig(gid) {
  try {
    const { data, error } = await supabase.from('configs').select('*').eq('guild_id', gid).maybeSingle();
    if (error) return { guild_id: gid, ...defaultConfig };
    return data ? { ...defaultConfig, ...data, guild_id: gid } : { guild_id: gid, ...defaultConfig };
  } catch { return { guild_id: gid, ...defaultConfig }; }
}

async function setConfig(gid, cfg) {
  try {
    const clean = {};
    for (const [k, v] of Object.entries(cfg)) if (v !== undefined && k !== 'guild_id') clean[k] = v;
    clean.guild_id = gid;
    clean.updated_at = new Date().toISOString();
    const { error } = await supabase.from('configs').upsert(clean, { onConflict: 'guild_id' });
    return !error;
  } catch { return false; }
}

async function ensureGuild(g) {
  try { await supabase.from('guilds').upsert({ id: g.id, name: g.name }, { onConflict: 'id' }); } catch {}
}

async function fetchMember(g, id) { try { return await g.members.fetch(id); } catch { return null; } }

// ═══════════════════════════════════════════════════════════
// PERMISSÕES
// ═══════════════════════════════════════════════════════════
async function isAdmin(mu, g) {
  const id = mu?.user?.id || mu?.id;
  if (isDeveloper(id)) return true;
  if (id === g.ownerId) return true;
  const m = await fetchMember(g, id);
  if (!m) return false;
  if (m.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const c = await getConfig(g.id);
  if (c.admin_role && m.roles.cache.has(c.admin_role)) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════
// PREMIUM
// ═══════════════════════════════════════════════════════════
async function isPremium(gid) {
  try {
    const { data: fp } = await supabase.from('force_premium').select('scope,target_id,permanent,expires_at').eq('scope', 'guild').eq('target_id', gid).maybeSingle();
    if (fp) {
      if (fp.permanent) return true;
      if (fp.expires_at && new Date(fp.expires_at) > new Date()) return true;
    }
  } catch {}
  const c = await getConfig(gid);
  if (!c.is_premium) return false;
  if (c.premium_expires_at && new Date(c.premium_expires_at) <= new Date()) return false;
  return true;
}

async function getPremiumTier(gid) {
  try {
    const { data: fp } = await supabase.from('force_premium').select('tier,permanent,expires_at').eq('scope', 'guild').eq('target_id', gid).maybeSingle();
    if (fp && (fp.permanent || (fp.expires_at && new Date(fp.expires_at) > new Date()))) return fp.tier || 'unlimited';
  } catch {}
  const c = await getConfig(gid);
  if (!c.is_premium) return null;
  if (c.premium_expires_at && new Date(c.premium_expires_at) <= new Date()) return null;
  return c.premium_tier || 'basic';
}

// ═══════════════════════════════════════════════════════════
// LOG CENTRAL (opcional — só se LOG_CHANNEL_ID setado)
// ═══════════════════════════════════════════════════════════
async function logImportant(category, title, opts = {}) {
  if (!LOG_CHANNEL_ID) return;
  try {
    const ch = client.channels.cache.get(LOG_CHANNEL_ID)
      || await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!ch) return;

    const meta = {
      'PREM': { emoji: '💎', color: '#FFD700' },
      'DEV': { emoji: '👑', color: '#FFD700' },
      'APOSTA': { emoji: '🎮', color: '#f1c40f' },
      'TICKET': { emoji: '🎫', color: '#9B59B6' },
      'STREAMER': { emoji: '🎥', color: '#9146FF' },
      'ERRO': { emoji: '❌', color: '#ED4245' },
      'CONFIG': { emoji: '⚙️', color: '#5865F2' },
    }[category] || { emoji: '📢', color: '#5865F2' };

    const e = new EmbedBuilder()
      .setTitle(`${meta.emoji} [${category}] ${String(title).substring(0, 240)}`)
      .setColor(opts.color || meta.color)
      .setTimestamp();
    if (opts.description) e.setDescription(String(opts.description).substring(0, 4000));

    const fields = [];
    if (opts.user) fields.push({ name: '👤 Autor', value: `<@${opts.user}>`, inline: true });
    if (opts.guild) {
      const g = client.guilds.cache.get(opts.guild);
      fields.push({ name: '🌐 Servidor', value: g ? `**${g.name}**` : `\`${opts.guild}\``, inline: true });
    }
    if (opts.severity) {
      const sevEmoji = { info: 'ℹ️', success: '✅', warning: '⚠️', danger: '🚨' }[opts.severity] || 'ℹ️';
      fields.push({ name: '📌', value: `${sevEmoji} \`${opts.severity.toUpperCase()}\``, inline: true });
    }
    if (Array.isArray(opts.fields)) {
      for (const f of opts.fields.slice(0, 15)) {
        if (f?.name && f?.value) fields.push({
          name: String(f.name).substring(0, 256),
          value: String(f.value).substring(0, 1024),
          inline: !!f.inline,
        });
      }
    }
    if (fields.length) e.addFields(fields.slice(0, 25));
    e.setFooter({ text: 'Frio Apostas • Logs' });

    await ch.send({ embeds: [e] }).catch(() => {});
  } catch (err) { console.error('[LOG]', err.message); }
}

async function logError(ctx, err, uid = null, gid = null) {
  try {
    await supabase.from('error_logs').insert({
      context: ctx,
      message: (err?.message || String(err)).substring(0, 2000),
      stack: (err?.stack || '').substring(0, 4000),
      user_id: uid, guild_id: gid,
    });
  } catch {}
  const ignorar = ['Unknown interaction', 'Unknown Message', 'Missing Access', 'Missing Permissions', 'AbortError'];
  const msg = err?.message || String(err);
  if (ignorar.some(x => msg.includes(x))) return;
  console.error(`[${ctx}]`, msg);
}

// ═══════════════════════════════════════════════════════════
// FF CONFIG (com cache)
// ═══════════════════════════════════════════════════════════
const _ffConfigCache = new Map();
const _ffConfigTtl = 3 * 60 * 1000;

async function ffGetConfig(gid) {
  const cached = _ffConfigCache.get(gid);
  if (cached && Date.now() - cached.at < _ffConfigTtl) return cached.data;

  try {
    const { data } = await supabase.from('ff_config').select('*').eq('guild_id', gid).maybeSingle();
    if (data) {
      _ffConfigCache.set(gid, { data, at: Date.now() });
      return data;
    }
    const { data: c } = await supabase.from('ff_config').insert({ guild_id: gid }).select().single();
    if (c) _ffConfigCache.set(gid, { data: c, at: Date.now() });
    return c;
  } catch { return null; }
}

async function ffPatchConfig(gid, p) {
  try {
    await supabase.from('ff_config').upsert({
      guild_id: gid, ...p, updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id' });
    _ffConfigCache.delete(gid);

    // AUTO-REFRESH de painéis afetados
    const keys = Object.keys(p);
    if (keys.some(k => ['custom_bet_embed', 'value_options'].includes(k))) {
      scheduleRefresh(`ff:bets:${gid}`, () => refreshAllBets(gid), 1500);
    }
  } catch (e) { console.error('[FF-CFG]', e.message); }
  return ffGetConfig(gid);
}

// ═══════════════════════════════════════════════════════════
// FF CANAIS (mapeamento formato → canal)
// ═══════════════════════════════════════════════════════════
async function ffGetCanais(gid) {
  const { data } = await supabase.from('ff_canais_apostas')
    .select('*').eq('guild_id', gid).eq('ativo', true);
  const map = {};
  for (const c of data || []) map[c.formato] = c.canal_id;
  return map;
}

async function ffSetCanal(gid, formato, canalId) {
  await supabase.from('ff_canais_apostas').upsert({
    guild_id: gid, formato, canal_id: canalId, ativo: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'guild_id,formato' });
  return true;
}

async function ffDelCanal(gid, formato) {
  await supabase.from('ff_canais_apostas').delete().eq('guild_id', gid).eq('formato', formato);
  return true;
}

// ═══════════════════════════════════════════════════════════
// FF BETS
// ═══════════════════════════════════════════════════════════
async function ffGetBet(id) {
  const { data } = await supabase.from('ff_bets').select('*').eq('id', id).maybeSingle();
  return data;
}

async function ffPatchBet(id, p) {
  try { await supabase.from('ff_bets').update(p).eq('id', id); } catch {}
  const bet = await ffGetBet(id);

  if (bet && (p.value !== undefined || p.format !== undefined || p.active !== undefined)) {
    const g = client.guilds.cache.get(bet.guild_id);
    if (g) scheduleRefresh(`ff:bet:${id}`, () => ffUpdateBetMessage(g, bet).catch(() => {}), 800);
  }

  return bet;
}

async function ffGetMatch(id) {
  const { data } = await supabase.from('ff_matches').select('*').eq('id', id).maybeSingle();
  return data;
}

async function ffPatchMatch(id, p) {
  try { await supabase.from('ff_matches').update(p).eq('id', id); } catch {}
  return ffGetMatch(id);
}

function ffCalcPlayerPay(v, f, extra = 0, extraAtivo = false) {
  const n = Number(v) || 0;
  const fee = Number(f) || 0;
  const ex = Number(extra) || 0;
  return +(n + fee + (extraAtivo ? ex : 0)).toFixed(2);
}

// ═══════════════════════════════════════════════════════════
// FF MULTI-PIX MEDIADORES
// ═══════════════════════════════════════════════════════════
async function ffGetMediatorPix(guildId, userId) {
  try {
    const { data } = await supabase.from('ff_mediator_pix')
      .select('*').eq('guild_id', guildId).eq('user_id', userId).maybeSingle();
    return data || null;
  } catch { return null; }
}

async function ffGetAllMediatorPix(guildId) {
  try {
    const { data } = await supabase.from('ff_mediator_pix')
      .select('*').eq('guild_id', guildId).order('updated_at', { ascending: false });
    return data || [];
  } catch { return []; }
}

async function ffSetMediatorPix(guildId, userId, pixKey, pixName, pixCity = null, pixType = 'aleatoria') {
  try {
    const { data, error } = await supabase.from('ff_mediator_pix').upsert({
      guild_id: guildId, user_id: userId,
      pix_key: pixKey, pix_name: pixName,
      pix_city: pixCity || 'SAO PAULO', pix_type: pixType,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id,user_id' }).select().single();

    if (error) return null;
    return data;
  } catch { return null; }
}

async function ffRemoveMediatorPix(guildId, userId) {
  try {
    await supabase.from('ff_mediator_pix').delete().eq('guild_id', guildId).eq('user_id', userId);
    return true;
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════
// FF PIX (BRCODE)
// ═══════════════════════════════════════════════════════════
function crc16(s) {
  let c = 0xFFFF;
  for (let i = 0; i < s.length; i++) {
    c ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (c & 0x8000) c = (c << 1) ^ 0x1021;
      else c <<= 1;
      c &= 0xFFFF;
    }
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}

function generatePixPayload(k, a = null, n = '', ci = '', tx = '***') {
  const f = (id, v) => `${id}${String(v.length).padStart(2, '0')}${v}`;
  const ma = f('26', f('0014BR.GOV.BCB.PIX', f('01', k)));
  let p = '000201' + ma + f('5204', '0000') + f('5303', '986');
  if (a) p += f('54', String(parseFloat(a).toFixed(2)).padStart(3, '0'));
  p += f('5802', 'BR') + f('59', n.substring(0, 25)) + f('60', ci.substring(0, 15)) + f('62', f('05', tx.substring(0, 25))) + '6304';
  return p + crc16(p).toUpperCase();
}

async function criarPixEstatico(v, oid, s) {
  if (!s?.pix_key) throw new Error('Pix não configurado.');
  const p = generatePixPayload(s.pix_key, v, s.pix_name || 'Loja', s.pix_city || 'SAO PAULO', `PEDIDO${oid}`);
  return { payload: p, qrBuf: await QRCode.toBuffer(p, { type: 'png', width: 320, margin: 2 }) };
}

// ═══════════════════════════════════════════════════════════
// MERCADO PAGO
// ═══════════════════════════════════════════════════════════
async function criarPixMercadoPago(valor, oid, descricao = 'Pedido', accessToken = null) {
  const token = accessToken || process.env.MP_ACCESS_TOKEN;
  if (!token) return { error: 'MP não configurado.' };
  try {
    const r = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `frio-${oid}-${Date.now()}`,
      },
      body: JSON.stringify({
        transaction_amount: Number(Number(valor).toFixed(2)),
        description: `${descricao} #${oid}`,
        payment_method_id: 'pix',
        external_reference: String(oid),
        payer: { email: `cliente${oid}@friobot.local`, first_name: 'Cliente', last_name: `#${oid}` },
      }),
    });
    const data = await r.json();
    if (!r.ok) return { error: data.message || data.cause?.[0]?.description || `HTTP ${r.status}` };
    const pix = data.point_of_interaction?.transaction_data;
    if (!pix?.qr_code) return { error: 'Sem QR code' };
    const qrBuf = await QRCode.toBuffer(pix.qr_code, { type: 'png', width: 320, margin: 2 });
    return {
      ok: true, payment_id: data.id, status: data.status,
      payload: pix.qr_code, ticket_url: pix.ticket_url, qrBuf,
    };
  } catch (e) { return { error: e.message }; }
}

// ═══════════════════════════════════════════════════════════
// FF LOGS
// ═══════════════════════════════════════════════════════════
async function ffLog(g, cat, action, uid = null, details = {}) {
  try {
    await supabase.from('ff_logs').insert({
      guild_id: g.id, category: cat, action, user_id: uid, details,
    });
  } catch {}

  try {
    const c = await ffGetConfig(g.id);
    if (!c?.log_channel_id) return;
    const ch = g.channels.cache.get(c.log_channel_id);
    if (!ch) return;

    const colors = {
      config: '#5865F2', queue: '#22c55e', thread: '#9B59B6',
      pix: '#FFD700', match: '#FFA500', resultado: '#E74C3C',
      moderator: '#00AAFF', pixmed: '#22c55e',
    };

    const e = new EmbedBuilder()
      .setTitle(`📋 Log • ${cat.toUpperCase()}`)
      .setColor(colors[cat] || '#808080')
      .addFields(
        { name: 'Ação', value: `\`${action}\``, inline: true },
        { name: 'Por', value: uid ? `<@${uid}>` : '—', inline: true },
      );

    if (Object.keys(details).length) {
      e.addFields({ name: 'Detalhes', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 900)}\n\`\`\`` });
    }
    await ch.send({ embeds: [e] }).catch(() => {});
  } catch {}
}

async function logCoins(g, uid, amount, reason, fromId = null) {
  try {
    const cfg = await ffGetConfig(g.id);
    if (!cfg?.log_channel_id) return;
    const ch = g.channels.cache.get(cfg.log_channel_id);
    if (!ch) return;

    const e = new EmbedBuilder()
      .setTitle('💎 Log Coins')
      .setColor(amount >= 0 ? '#22c55e' : '#ff5555')
      .addFields(
        { name: 'Usuário', value: `<@${uid}>`, inline: true },
        { name: 'Qtd', value: `${amount >= 0 ? '+' : ''}${amount}`, inline: true },
        { name: 'Motivo', value: reason || '—', inline: true },
      ).setTimestamp();
    await ch.send({ embeds: [e] }).catch(() => {});
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// FF EMBEDS
// ═══════════════════════════════════════════════════════════
function ffBuildBetEmbed(bet, cfg) {
  const gi = parseJson(bet.gelo_infinito_players);
  const gn = parseJson(bet.gelo_normal_players);
  const lines = [];

  if (gi.length) lines.push(`🧊 **Gelo Infinito:** ${gi.map(p => `<@${p.userId}>`).join(', ')}`);
  if (gn.length) lines.push(`🧊 **Gelo Normal:** ${gn.map(p => `<@${p.userId}>`).join(', ')}`);

  const jog = lines.length ? lines.join('\n') : 'Nenhum jogador na fila.';
  const fmt = FF_FORMATS.find(f => f.label === bet.format);
  const team = fmt ? `Times de ${fmt.teamSize} • Total ${fmt.totalPlayers}` : '';
  const v = `R$ ${Number(bet.value).toFixed(2).replace('.', ',')}`;
  const c = cfg?.custom_bet_embed || {};

  const e = new EmbedBuilder()
    .setColor(safeColor(c.color, '#f1c40f'))
    .setTitle(safeStr(c.title) ? `${c.title} — ${v}` : `${bet.format} — ${v}`)
    .addFields(
      { name: safeStr(c.field_format_name) || 'Formato', value: `${bet.format}${team ? `\n*${team}*` : ''}`, inline: false },
      { name: safeStr(c.field_value_name) || 'Valor', value: v, inline: false },
      { name: safeStr(c.field_players_name) || 'Jogadores', value: jog, inline: false },
    );

  const thumb = safeUrl(c.thumbnail) || 'https://cdn.discordapp.com/emojis/1002259488279195708.png';
  if (thumb) e.setThumbnail(thumb);
  const banner = safeUrl(c.banner); if (banner) e.setImage(banner);
  const footer = safeStr(c.footer); if (footer) e.setFooter({ text: footer });
  const author = safeStr(c.author); if (author) e.setAuthor({ name: author });

  return e;
}

function ffBuildBetButtons(bid, cfg) {
  const c = cfg?.custom_bet_embed?.buttons || {};
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ffbet:gi:${bid}`).setLabel(c.gi_label || 'Gelo Infinito').setEmoji(c.gi_emoji || '🧊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ffbet:gn:${bid}`).setLabel(c.gn_label || 'Gelo Normal').setEmoji(c.gn_emoji || '🧊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ffbet:sair:${bid}`).setLabel(c.sair_label || 'Sair').setEmoji(c.sair_emoji || '🚪').setStyle(ButtonStyle.Danger),
  );
}

async function ffUpdateBetMessage(g, bet) {
  try {
    const ch = g.channels.cache.get(bet.channel_id) || await g.channels.fetch(bet.channel_id).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(bet.message_id).catch(() => null);
    if (!msg) return;
    const cfg = await ffGetConfig(g.id);
    await msg.edit({
      embeds: [ffBuildBetEmbed(bet, cfg)],
      components: [ffBuildBetButtons(bet.id, cfg)],
    }).catch(() => {});
  } catch {}
}

async function refreshAllBets(guildId) {
  const g = client.guilds.cache.get(guildId);
  if (!g) return;
  const cfg = await ffGetConfig(guildId);
  if (!cfg) return;

  const { data: bets } = await supabase.from('ff_bets')
    .select('*').eq('guild_id', guildId).eq('active', true).not('message_id', 'is', null);

  if (!bets?.length) return;

  for (const bet of bets) {
    await ffUpdateBetMessage(g, bet).catch(() => {});
    await sleep(300);
  }
}

// ═══════════════════════════════════════════════════════════
// FF FILAS (Mediador/Analista)
// ═══════════════════════════════════════════════════════════
async function ffGetMediatorQueue(gid) {
  const { data } = await supabase.from('ff_mediator_queue')
    .select('*').eq('guild_id', gid).order('joined_at');
  return data || [];
}

async function ffMediatorJoin(gid, uid) {
  try {
    const { error } = await supabase.from('ff_mediator_queue')
      .insert({ guild_id: gid, user_id: uid, status: 'waiting' });
    if (error) {
      if (error.code === '23505') return false;
      return false;
    }
    return true;
  } catch { return false; }
}

async function ffMediatorLeave(gid, uid) {
  const { data: m } = await supabase.from('ff_mediator_queue')
    .select('status').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
  if (m?.status === 'busy') return false;
  try {
    await supabase.from('ff_mediator_queue').delete().eq('guild_id', gid).eq('user_id', uid);
  } catch {}
  return true;
}

async function ffMediatorNext(gid) {
  const { data } = await supabase.from('ff_mediator_queue')
    .select('*').eq('guild_id', gid).eq('status', 'waiting')
    .order('joined_at').limit(1).maybeSingle();
  return data;
}

async function ffGetAnalystQueue(gid) {
  const { data } = await supabase.from('ff_analyst_queue')
    .select('*').eq('guild_id', gid).order('joined_at');
  return data || [];
}

async function ffAnalystJoin(gid, uid) {
  try {
    const { error } = await supabase.from('ff_analyst_queue')
      .insert({ guild_id: gid, user_id: uid, status: 'waiting' });
    if (error) return false;
    return true;
  } catch { return false; }
}

async function ffAnalystLeave(gid, uid) {
  const { data: a } = await supabase.from('ff_analyst_queue')
    .select('status').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
  if (a?.status === 'busy') return false;
  try {
    await supabase.from('ff_analyst_queue').delete().eq('guild_id', gid).eq('user_id', uid);
  } catch {}
  return true;
}

async function ffAnalystNext(gid) {
  const { data } = await supabase.from('ff_analyst_queue')
    .select('*').eq('guild_id', gid).eq('status', 'waiting')
    .order('joined_at').limit(1).maybeSingle();
  return data;
}

async function ffAnalystRelease(gid, userId, increment = true) {
  const { data: a } = await supabase.from('ff_analyst_queue')
    .select('*').eq('guild_id', gid).eq('user_id', userId).maybeSingle();
  if (!a) return;
  try {
    await supabase.from('ff_analyst_queue').update({
      status: 'waiting',
      current_match_id: null,
      analyses_total: increment ? (Number(a.analyses_total || 0) + 1) : Number(a.analyses_total || 0),
    }).eq('id', a.id);
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 1/5 — Base
// ═══════════════════════════════════════════════════════════
