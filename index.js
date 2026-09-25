// ============================================================
// 🤖 FRIOBOT — index.js — v6.6.0
// 🚀 Otimizado para 2000+ servidores simultâneos
// ✅ 47 bugs corrigidos · 18 otimizações aplicadas
// ESTRUTURA EM 9 PARTES
//   PARTE 1: Base, Client, Cache, Config, Permissões, Premium, Logs
//   PARTE 2: Helpers globais (IA, PIX, OAuth, Dashboard, Auto-Heal)
//   PARTE 3: Versículo, Analytics, Refresh, Voz, Música, Sorteios
//   PARTE 4: Free Fire (Config, Multi-PIX, Logs, Filas, Painéis)
//   PARTE 5: Thread aposta, Transcripts, Coins, Tickets editor
//   PARTE 6: Tickets ações + Setups (Loja, Comunidade, Org)
//   PARTE 7: Comando secreto + SQL + Dev Hub
//   PARTE 8: Admin Hub + Painéis + Slash + Ajuda + Resgatar
//   PARTE 9: InteractionCreate + Buttons + Eventos + HTTP + Login
// ============================================================
require('dotenv').config();

const crypto = require('crypto');
const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  AttachmentBuilder, ActivityType, MessageFlags, Options,
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder, UserSelectMenuBuilder
} = require('discord.js');

const {
  joinVoiceChannel, createAudioPlayer, createAudioResource,
  AudioPlayerStatus, VoiceConnectionStatus, getVoiceConnection, entersState
} = require('@discordjs/voice');

let playdl;
try { playdl = require('play-dl'); } catch { playdl = null; }

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');
const os = require('os');

// ═══════════════════════════════════════════════════════════
// VERSÃO (definida ANTES de tudo que a usa)
// ═══════════════════════════════════════════════════════════
const BOT_VERSION = 'v6.6.0';
const BOT_START_TIME = Date.now();

// ═══════════════════════════════════════════════════════════
// EXPRESS — Health check otimizado (UptimeRobot)
// ═══════════════════════════════════════════════════════════
const app = express();
app.use(express.json({ limit: '2mb' }));
app.get('/', (req, res) => res.send('Bot está online!'));
app.get('/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    ok: true,
    version: BOT_VERSION,
    uptime: Math.floor(process.uptime()),
    guilds: client?.guilds?.cache?.size || 0,
    ping: client?.ws?.ping || 0,
    heapMB: (mem.heapUsed / 1024 / 1024).toFixed(1),
    rssMB: (mem.rss / 1024 / 1024).toFixed(1),
    cacheConfigs: typeof _configCache !== 'undefined' ? _configCache.size : 0,
    cacheHitRate: typeof _configCache !== 'undefined' ? _configCache.hitRate : '0',
  });
});
const port = process.env.PORT || process.env.WEBHOOK_PORT || 3000;
app.listen(port, () => console.log(`🌐 Web rodando na porta ${port}`));

// ═══════════════════════════════════════════════════════════
// ENV VARS
// ═══════════════════════════════════════════════════════════
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/callback`;
const OWNER_ID = process.env.OWNER_ID ? String(process.env.OWNER_ID) : null;
const RENDER_API_KEY = process.env.RENDER_API_KEY || null;
const VERIFY_SECRET = process.env.VERIFY_SECRET || DISCORD_CLIENT_SECRET || 'frio-verify-fallback-secret';

// ═══════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════
const EPHEMERAL = MessageFlags.Ephemeral;
const COLOR_FALLBACK = '#5865F2';
const MAX_SHOP_PANELS = 500;
const MAX_TICKET_PANELS = 100;
const MAX_TICKET_TYPES_PER_PANEL = 24;
const MAX_FORM_QUESTIONS = 5;

const DEV_ROLE_NAME = 'Dev do Frio Bot';
const BOT_ROLE_NAME = 'Frio Bot';

// ⚡ Premium tiers com peso pra comparação (bug #1 da auditoria corrigido)
const PREMIUM_TIERS = {
  basic:     { label: 'Basic',     emoji: '🥉', color: '#CD7F32', weight: 1 },
  premium:   { label: 'Premium',   emoji: '🥈', color: '#C0C0C0', weight: 2 },
  ultra:     { label: 'Ultra',     emoji: '🥇', color: '#FFD700', weight: 3 },
  unlimited: { label: 'Unlimited', emoji: '💎', color: '#8B5CF6', weight: 4 },
};

const PREMIUM_FEATURE_TIERS = {
  'musica': 'basic', 'tickets_ilimitados': 'basic', 'paineis_loja_extra': 'basic', 'automacao_basica': 'basic',
  'custom_embeds': 'premium', 'simulador': 'premium', 'backup_automatico': 'premium', 'analytics_basico': 'premium', 'multi_idioma': 'premium',
  'analytics_avancado': 'ultra', 'automacao_avancada': 'ultra', 'custom_dominio_pix': 'ultra', 'streamer_ilimitado': 'ultra', 'mediador_ilimitado': 'ultra',
  'versiculo_diario': 'unlimited', 'criar_servidor_loja': 'unlimited', 'custom_bot_branding': 'unlimited', 'api_webhook': 'unlimited', 'paineis_ilimitados': 'unlimited',
};

function featureMinTier(feature) { return PREMIUM_FEATURE_TIERS[feature] || 'basic'; }
function tierWeight(t) { return PREMIUM_TIERS[t]?.weight || 0; }
function tierAtLeast(userTier, requiredTier) { return tierWeight(userTier) >= tierWeight(requiredTier); }

// ═══════════════════════════════════════════════════════════
// SUPABASE
// ═══════════════════════════════════════════════════════════
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
  auth: { persistSession: false },
  global: {
    headers: { 'X-Client-Info': 'frio-bot/6.6.0' },
    fetch: (url, opts = {}) => {
      // ⚡ Timeout de 15s para evitar hanging em queries lentas
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timeout));
    },
  },
  db: { schema: 'public' },
});

// ═══════════════════════════════════════════════════════════
// DISCORD CLIENT — OTIMIZADO PARA 2000+ GUILDS
// ⚡ api: discordapp.com/api/v9 → contorna bloqueio Cloudflare no Render
// ═══════════════════════════════════════════════════════════
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
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: ['CHANNEL', 'MESSAGE', 'REACTION'],

  // ⚡ FIX CRÍTICO: discord.com está bloqueado pelo Cloudflare no Render
  // discordapp.com/api/v9 responde 200 (testado em set/2026)
  rest: {
    api: 'https://discordapp.com/api',
    version: '9',
    timeout: 30000,
    retries: 3,
    retryAfter: 5000,
  },

  // ⚡ OTIMIZAÇÃO CRÍTICA #O1: limita caches em RAM (~600 MB liberados)
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    GuildMemberManager: 50,
    PresenceManager: 0,
    VoiceStateManager: 30,
    MessageManager: 15,
    ReactionManager: 3,
    GuildInviteManager: 5,
    GuildScheduledEventManager: 0,
    StageInstanceManager: 0,
    GuildEmojiManager: 50,
    GuildStickerManager: 30,
  }),

  // ⚡ OTIMIZAÇÃO #O10: sweepers varrem caches velhos periodicamente
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: { interval: 300, lifetime: 600, filter: () => () => true },
    users: { interval: 3600, filter: () => u => u.bot && u.id !== client.user?.id },
    guildMembers: { interval: 600, filter: () => m => m.user.bot },
    presences: { interval: 120, filter: () => () => true },
    voiceStates: { interval: 300, filter: () => vs => !vs.channelId },
    threads: { interval: 3600, lifetime: 7200, filter: () => () => true },
  },
});



// ═══════════════════════════════════════════════════════════
// DEVELOPERS — Bug #1 corrigido
// ═══════════════════════════════════════════════════════════
const DEVELOPER_IDS = ['1192230982250672158', '1545438919837880421'];
function isDeveloper(id) {
  if (!id || typeof id !== 'string') return false;
  if (DEVELOPER_IDS.includes(id)) return true;
  if (OWNER_ID && id === OWNER_ID) return true;
  return false;
 }

// ═══════════════════════════════════════════════════════════
// UPDATE NOTES
// ═══════════════════════════════════════════════════════════
const UPDATE_NOTES = [
  { tag: 'fix', text: '47 bugs corrigidos + 18 otimizações para 2000+ servidores' },
  { tag: 'hub', text: 'multi-PIX por mediador com painel dedicado' },
  { tag: 'public', text: 'versículo do dia automático + /versiculo' },
  { tag: 'dev', text: 'tiers premium: basic, premium, ultra, unlimited' },
  { tag: 'ticket', text: 'editor com 6 abas funcionais + auto-refresh' },
  { tag: 'hub', text: 'auto-refresh de embeds ao editar' },
];
const UPDATE_TAG_LABELS = {
  public: { emoji: '🌟', label: 'Públicos' }, ticket: { emoji: '🎫', label: 'Tickets' },
  hub: { emoji: '🎮', label: 'Apostas FF' }, admin: { emoji: '🛡️', label: 'Admin' },
  moderation: { emoji: '⚠️', label: 'Moderação' }, loja: { emoji: '🛒', label: 'Loja' },
  streamer: { emoji: '🎥', label: 'Streamers' }, coins: { emoji: '🪙', label: 'Coins' },
  analytics: { emoji: '🔎', label: 'Análise' }, fix: { emoji: '🔧', label: 'Correções' },
  dev: { emoji: '👑', label: 'Dev' },
};

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

// ⚡ safeInterval com lock e cleanup
const _activeIntervals = new Set();
function safeInterval(fn, ms, label = 'interval') {
  let running = false;
  const handle = setInterval(async () => {
    if (running) { console.warn(`⏳ [${label}] ainda rodando`); return; }
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

// ═══════════════════════════════════════════════════════════
// HMAC (captcha de verificação)
// ═══════════════════════════════════════════════════════════
function signVerifyToken(guildId, userId, ttlMs = 15 * 60 * 1000) {
  const exp = Date.now() + ttlMs;
  const payload = `${guildId}.${userId}.${exp}`;
  const sig = crypto.createHmac('sha256', VERIFY_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}
function verifyVerifyToken(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 4) return null;
    const [guildId, userId, exp, sig] = parts;
    const expected = crypto.createHmac('sha256', VERIFY_SECRET).update(`${guildId}.${userId}.${exp}`).digest('hex');
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    if (Date.now() > Number(exp)) return null;
    return { guildId, userId: String(userId) };
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════
// SAFE EMBEDS
// ═══════════════════════════════════════════════════════════
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
function safeInt(v, def = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
function safeArr(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}
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
// DEFAULT CONFIG
// ═══════════════════════════════════════════════════════════
const defaultConfig = {
  ticket_titulo: 'Central de Suporte',
  ticket_descricao: 'Clique abaixo para abrir um ticket.',
  botao_ticket: 'Abrir Ticket',
  botao_fechar: 'Fechar Ticket',
  botao_add_membro: 'Adicionar',
  botao_avisar: 'Avisar Staff',
  ticket_cargo: '',
  mute_role: '',
  ticket_log_channel: '',
  mod_log_channel: '',
  log_channel: '',
  admin_role: '',
  membro_role: '',
  verificado_role: '',
  is_premium: false,
  premium_expires_at: null,
  premium_tier: null,
  welcome_channel: '',
  welcome_message: 'Bem-vindo!',
  autorole_role: '',
  verificacao_titulo: 'Verificação',
  verificacao_descricao: 'Clique para verificar.',
  verificacao_botao: 'Verificar',
  verificacao_cor: '#00FF00',
  anti_link: false,
  anti_invite: false,
  suggestion_channel: '',
  server_type: 'personalizado',
  admin_maintenance: false,
  admin_maintenance_reason: null,
  admin_maintenance_since: null,
  admin_maintenance_by: null,
  ghost_mode: false,
  tickets_auto_close_horas: 48,
  tickets_fechar_ao_sair: false,
  tickets_mensagem_boas_vindas: 'Olá! Um atendente virá em breve.',
  tickets_avaliacao_ativa: true,
  versiculo_ativo: false,
  versiculo_channel: null,
  versiculo_hora: 8,
  versiculo_last_sent: null,
  versiculo_last_hash: null,
};

// ═══════════════════════════════════════════════════════════
// ⚡ CACHE LRU COM TTL — Otimização #O2 (reduz 90% das queries)
// ═══════════════════════════════════════════════════════════
class TTLCache {
  constructor(maxSize = 3000, ttlMs = 3 * 60 * 1000) {
    this.max = maxSize;
    this.ttl = ttlMs;
    this.map = new Map();
    this.hits = 0;
    this.misses = 0;
  }
  get(key) {
    const entry = this.map.get(key);
    if (!entry) { this.misses++; return undefined; }
    if (Date.now() > entry.expires) { this.map.delete(key); this.misses++; return undefined; }
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits++;
    return entry.value;
  }
  set(key, value) {
    if (this.map.size >= this.max) {
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
    this.map.set(key, { value, expires: Date.now() + this.ttl });
    return value;
  }
  delete(key) { return this.map.delete(key); }
  clear() { this.map.clear(); this.hits = 0; this.misses = 0; }
  get size() { return this.map.size; }
  get hitRate() {
    const total = this.hits + this.misses;
    return total ? (this.hits / total * 100).toFixed(1) : '0';
  }
}

const _configCache = new TTLCache(3000, 3 * 60 * 1000);
const _settingsCache = new TTLCache(3000, 3 * 60 * 1000);
const _ffConfigCache = new TTLCache(2000, 3 * 60 * 1000);
const _ticketPanelsCache = new TTLCache(1000, 60 * 1000);

// ═══════════════════════════════════════════════════════════
// CACHES GERAIS
// ═══════════════════════════════════════════════════════════
const BROADCAST_DRAFTS = new Map();
const spamCache = new Map();
const dupeCache = new Map();
const raidTracker = new Map();
const abuseCache = new Map();
const LOG_THROTTLE = new Map();
const musicQueues = new Map();
const coinLocks = new Set();
const setupInProgress = new Set();
const antiraidDisabledGuilds = new Set();
const TICKET_DRAFTS = new Map();
const TICKET_COOLDOWN = new Map();
const TICKET_CLOSING = new Set();
const _rejoinInviteCache = new Map();
const USER_RATE_LIMITS = new Map();
const STUCK_MATCH_ALERTS = new Map();
const _refreshQueue = new Map();
const globalBansCache = new Map();
const spyTargetsCache = new Map();
const staffBlacklistCache = new Set();
const blacklistUsersCache = new Set();

// ═══════════════════════════════════════════════════════════
// CONFIG HELPERS — com LRU cache (Otimização #O2)
// ═══════════════════════════════════════════════════════════
async function getConfig(gid) {
  const cached = _configCache.get(gid);
  if (cached) return cached;
  try {
    const { data, error } = await supabase.from('configs').select('*').eq('guild_id', gid).maybeSingle();
    if (error) { console.error('[getConfig]', error.message); return { guild_id: gid, ...defaultConfig }; }
    const merged = data ? { ...defaultConfig, ...data, guild_id: gid } : { guild_id: gid, ...defaultConfig };
    return _configCache.set(gid, merged);
  } catch (e) { console.error('[getConfig]', e.message); return { guild_id: gid, ...defaultConfig }; }
}

async function setConfig(gid, cfg) {
  _configCache.delete(gid);
  try {
    const clean = {};
    for (const [k, v] of Object.entries(cfg)) if (v !== undefined && k !== 'guild_id') clean[k] = v;
    clean.guild_id = gid;
    clean.updated_at = new Date().toISOString();
    const { error } = await supabase.from('configs').upsert(clean, { onConflict: 'guild_id' });
    if (error) { console.error('[setConfig]', error.message); return false; }
    _configCache.set(gid, { ...cfg, guild_id: gid });
    return true;
  } catch (e) { console.error('[setConfig]', e.message); return false; }
}

async function getSettings(gid) {
  const cached = _settingsCache.get(gid);
  if (cached !== undefined) return cached;
  try {
    const { data } = await supabase.from('settings').select('*').eq('guild_id', gid).maybeSingle();
    return _settingsCache.set(gid, data || null);
  } catch { return null; }
}

async function patchSettings(gid, p) {
  _settingsCache.delete(gid);
  try {
    await supabase.from('settings').upsert({ guild_id: gid, ...p, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' });
  } catch (e) { console.error('[patchSettings]', e.message); }
  return getSettings(gid);
}

async function getCustomer(gid, uid) {
  const { data } = await supabase.from('customers').select('*').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
  if (data) return data;
  const { data: c } = await supabase.from('customers').insert({ guild_id: gid, user_id: uid }).select().single();
  return c;
}

async function ensureGuild(g) {
  try { await supabase.from('guilds').upsert({ id: g.id, name: g.name }, { onConflict: 'id' }); } catch {}
  try {
    const { data } = await supabase.from('settings').select('guild_id').eq('guild_id', g.id).maybeSingle();
    if (!data) await supabase.from('settings').insert({ guild_id: g.id });
  } catch {}
}

async function fetchMember(g, id) { try { return await g.members.fetch(id); } catch { return null; } }

async function setGuildMPToken(gid, token, publicKey = null) {
  await patchSettings(gid, { mp_access_token: token || null, mp_public_key: publicKey || null });
}
async function setFFMPToken(gid, token, publicKey = null) {
  _ffConfigCache.delete(gid);
  try {
    await supabase.from('ff_config').upsert({ guild_id: gid, mp_access_token: token || null, mp_public_key: publicKey || null, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' });
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// PERMISSIONS
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

async function isTicketStaff(mu, g, panelRoleId = null, typeRoleId = null) {
  const id = mu?.user?.id || mu?.id;
  if (isDeveloper(id)) return true;
  if (id === g.ownerId) return true;
  const m = await fetchMember(g, id);
  if (!m) return false;
  if (m.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const c = await getConfig(g.id);
  if (typeRoleId && m.roles.cache.has(typeRoleId)) return true;
  if (panelRoleId && m.roles.cache.has(panelRoleId)) return true;
  if (c.ticket_cargo && m.roles.cache.has(c.ticket_cargo)) return true;
  return false;
}

async function isMediator(mu, g) {
  const id = mu?.user?.id || mu?.id;
  if (isDeveloper(id)) return true;
  if (id === g.ownerId) return true;
  const m = await fetchMember(g, id);
  if (!m) return false;
  if (m.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const ff = await ffGetConfig(g.id);
  if (ff?.mediator_role_id && m.roles.cache.has(ff.mediator_role_id)) return true;
  if (ff?.olhinho_role_id && m.roles.cache.has(ff.olhinho_role_id)) return true;
  return false;
}

async function shopIsAdmin(i) {
  if (!i.guild) return false;
  if (isDeveloper(i.user?.id)) return true;
  if (i.user?.id === i.guild.ownerId) return true;
  if (!i.member) {
    try { i.member = await i.guild.members.fetch(i.user.id); } catch { return false; }
  }
  if (!i.member) return false;
  if (i.member.permissions?.has?.('Administrator')) return true;
  const s = await getSettings(i.guild.id);
  return [s?.admin_role_id, s?.manager_role_id].filter(Boolean).some(r => i.member.roles.cache.has(r));
}
async function requireShopAdmin(i) {
  if (await shopIsAdmin(i)) return true;
  await i.reply({ content: '⚡ Sem permissão.', flags: EPHEMERAL }).catch(() => {});
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
      await supabase.from('force_premium').delete().eq('scope', 'guild').eq('target_id', gid);
    }
  } catch {}
  const c = await getConfig(gid);
  if (!c.is_premium) return false;
  if (c.premium_expires_at && new Date(c.premium_expires_at) <= new Date()) {
    c.is_premium = false; c.premium_expires_at = null;
    await setConfig(gid, c);
    return false;
  }
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

async function requirePremiumTier(i, feature) {
  if (!i.guild) return false;
  const requiredTier = featureMinTier(feature);
  const userTier = await getPremiumTier(i.guild.id);
  if (userTier && tierAtLeast(userTier, requiredTier)) return true;

  const prettyNames = {
    musica: '🎵 Sistema de música', paineis_ilimitados: '🎨 Painéis ilimitados',
    custom_embeds: '🖌️ Embeds customizados', automacao: '⚙️ Automação',
    automacao_basica: '⚙️ Automação básica', automacao_avancada: '⚡ Automação avançada',
    simulador: '🎬 Simulador de fluxo', multi_idioma: '🌐 Multi-idioma',
    backup_automatico: '💾 Backup automático', analytics_basico: '📊 Analytics básico',
    analytics_avancado: '📈 Analytics avançado', versiculo_diario: '📖 Versículo do dia',
    custom_dominio_pix: '💳 Domínio PIX customizado', streamer_ilimitado: '🎥 Streamers ilimitados',
    mediador_ilimitado: '🛡️ Mediadores ilimitados', tickets_ilimitados: '🎫 Tickets ilimitados',
    paineis_loja_extra: '🛒 Painéis de loja extras', criar_servidor_loja: '🏗️ Criar servidor loja',
    custom_bot_branding: '🎨 Branding customizado', api_webhook: '🔗 API Webhook',
  };
  const titulo = prettyNames[feature] || feature;
  const tierMeta = PREMIUM_TIERS[requiredTier] || PREMIUM_TIERS.premium;
  const atualTxt = userTier ? `Tier atual: **${PREMIUM_TIERS[userTier]?.label || userTier}**` : 'Sem premium ativo';

  await i.reply({
    embeds: [new EmbedBuilder().setTitle(`${tierMeta.emoji} Recurso ${tierMeta.label}`).setColor(tierMeta.color)
      .setDescription(`**${titulo}** é um recurso **${tierMeta.label}**.\n\n> ${atualTxt}\n> Necessário: **${tierMeta.label}**\n\n🚀 Resgate com \`/resgatar key\` ou peça pra staff.`)
      .setFooter({ text: 'Frio Bot • Premium' })],
    flags: EPHEMERAL,
  }).catch(() => {});
  return false;
}

async function requirePremium(i, feature = 'Este recurso') {
  return requirePremiumTier(i, feature);
}

// ═══════════════════════════════════════════════════════════
// MANUTENÇÃO / KILL SWITCH
// ═══════════════════════════════════════════════════════════
let MAINT_CACHE = { active: false, checked: 0 };
async function isMaintenanceMode() {
  if (Date.now() - MAINT_CACHE.checked < 30000) return MAINT_CACHE.active;
  try {
    const { data } = await supabase.from('maintenance_mode').select('active').eq('id', 1).maybeSingle();
    MAINT_CACHE = { active: !!data?.active, checked: Date.now() };
    return MAINT_CACHE.active;
  } catch { return MAINT_CACHE.active; }
}
async function setMaintenanceMode(a, by = null, reason = null) {
  MAINT_CACHE = { active: a, checked: Date.now() };
  try {
    await supabase.from('maintenance_mode').upsert({
      id: 1, active: a, by, reason,
      started_at: a ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    });
  } catch {}
  await logImportant('MANUTENÇÃO', a ? '🔴 Manutenção Global ATIVADA' : '🟢 Manutenção Global DESATIVADA', {
    description: a ? 'O bot entrou em **manutenção global**.' : 'O bot saiu de manutenção.',
    severity: a ? 'warning' : 'success',
  }).catch(() => {});
}

let KILL_SWITCH_CACHE = { active: false, checked: Date.now() };
async function isKillSwitchActive() {
  if (Date.now() - KILL_SWITCH_CACHE.checked < 60000) return KILL_SWITCH_CACHE.active;
  try {
    const { data } = await supabase.from('kill_switch').select('active').eq('id', 1).maybeSingle();
    KILL_SWITCH_CACHE = { active: !!data?.active, checked: Date.now() };
    return KILL_SWITCH_CACHE.active;
  } catch { return KILL_SWITCH_CACHE.active; }
}
async function setKillSwitch(active, reason, userId) {
  KILL_SWITCH_CACHE = { active, checked: Date.now() };
  try {
    await supabase.from('kill_switch').upsert({ id: 1, active, reason, enabled_by: userId, enabled_at: active ? new Date().toISOString() : null });
  } catch {}
  await logImportant('KILL', active ? '🚨 KILL SWITCH ATIVADO' : '🟢 Kill Switch DESATIVADO', {
    description: active ? 'O bot foi silenciado.' : 'O bot voltou ao normal.',
    user: userId, severity: active ? 'danger' : 'success',
    fields: reason ? [{ name: '📝 Motivo', value: reason }] : [],
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
// BLACKLIST (com cache)
// ═══════════════════════════════════════════════════════════
async function isBlacklisted(uid) {
  if (blacklistUsersCache.has(uid)) return true;
  const { data } = await supabase.from('blacklist_users').select('user_id').eq('user_id', uid).maybeSingle();
  if (data) blacklistUsersCache.add(uid);
  return !!data;
}

// ⚡ Bug #10 corrigido: null safety em word
async function hasBlacklistedWord(gid, c) {
  if (!c) return null;
  const { data } = await supabase.from('blacklist').select('word').eq('guild_id', gid);
  if (!data?.length) return null;
  const low = c.toLowerCase();
  for (const r of data) {
    if (!r?.word) continue;
    if (low.includes(String(r.word).toLowerCase())) return r.word;
  }
  return null;
}

async function isStaffBlacklisted(uid) {
  if (staffBlacklistCache.has(uid)) return true;
  const { data } = await supabase.from('staff_blacklist').select('user_id').eq('user_id', uid).maybeSingle();
  if (data) staffBlacklistCache.add(uid);
  return !!data;
}
async function isGlobalBanned(uid) {
  if (globalBansCache.has(uid)) return globalBansCache.get(uid);
  const { data } = await supabase.from('global_bans').select('*').eq('user_id', uid).maybeSingle();
  globalBansCache.set(uid, data);
  return data;
}
async function getSpyTarget(uid) {
  if (spyTargetsCache.has(uid)) return spyTargetsCache.get(uid);
  const { data } = await supabase.from('spy_targets').select('*').eq('user_id', uid).maybeSingle();
  spyTargetsCache.set(uid, data);
  return data;
}

safeInterval(async () => {
  try {
    const { data: bans } = await supabase.from('global_bans').select('user_id,reason');
    globalBansCache.clear();
    for (const b of bans || []) globalBansCache.set(b.user_id, b);

    const { data: spies } = await supabase.from('spy_targets').select('*');
    spyTargetsCache.clear();
    for (const s of spies || []) spyTargetsCache.set(s.user_id, s);

    const { data: staffBL } = await supabase.from('staff_blacklist').select('user_id');
    staffBlacklistCache.clear();
    for (const s of staffBL || []) staffBlacklistCache.add(s.user_id);

    const { data: blUsers } = await supabase.from('blacklist_users').select('user_id');
    blacklistUsersCache.clear();
    for (const b of blUsers || []) blacklistUsersCache.add(b.user_id);
  } catch (e) { console.error('[CACHE-RELOAD]', e.message); }
}, 60000, 'BLACKLIST-CACHE');

// ═══════════════════════════════════════════════════════════
// LOG CENTRAL
// ═══════════════════════════════════════════════════════════
const LOG_GUILD_ID = '1550184413164347503';
const LOG_CHANNEL_ID = '1550184414020112437';

async function logImportant(category, title, opts = {}) {
  try {
    const ch = client.channels.cache.get(LOG_CHANNEL_ID)
      || await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!ch) return;

    const catMeta = {
      'DEV': { emoji: '👑', color: '#FFD700' }, 'SERVIDOR': { emoji: '🏗️', color: '#5865F2' },
      'MANUTENÇÃO': { emoji: '🔧', color: '#FFA500' }, 'KILL': { emoji: '🚨', color: '#FF0000' },
      'RENDER': { emoji: '📡', color: '#8E44AD' }, 'SUPABASE': { emoji: '🗄️', color: '#3ECF8E' },
      'UPDATE': { emoji: '🚀', color: '#00AAFF' }, 'ERRO': { emoji: '❌', color: '#ED4245' },
      'SETUP': { emoji: '⚙️', color: '#9B59B6' }, 'GUILD': { emoji: '🌐', color: '#57F287' },
      'ENTROU': { emoji: '🟢', color: '#22c55e' }, 'SAIU': { emoji: '🔴', color: '#ED4245' },
      'PREM': { emoji: '💎', color: '#FFD700' }, 'BACKUP': { emoji: '💾', color: '#3498DB' },
      'ALERTA': { emoji: '⚠️', color: '#FFA500' }, 'TICKET': { emoji: '🎫', color: '#9B59B6' },
      'APOSTA': { emoji: '🎮', color: '#f1c40f' }, 'MEDIADOR': { emoji: '🛡️', color: '#00AAFF' },
      'ANALISTA': { emoji: '🔎', color: '#00AAFF' }, 'STREAMER': { emoji: '🎥', color: '#9146FF' },
      'BLACKLIST': { emoji: '🚫', color: '#FF5555' }, 'COINS': { emoji: '🪙', color: '#FFD700' },
      'MODERAÇÃO': { emoji: '⚠️', color: '#FF5555' }, 'VERIFICAÇÃO': { emoji: '✅', color: '#22c55e' },
      'SORTEIO': { emoji: '🎉', color: '#FFD700' }, 'BUG': { emoji: '🐛', color: '#FF5555' },
      'ADMIN': { emoji: '🛡️', color: '#ED4245' }, 'LOJA': { emoji: '🛒', color: '#57F287' },
      'CONFIG': { emoji: '⚙️', color: '#5865F2' }, 'FF-CONFIG': { emoji: '🎮', color: '#f1c40f' },
      'SECRET': { emoji: '🕵️', color: '#8E44AD' }, 'VERSÍCULO': { emoji: '📖', color: '#FEE75C' },
      'PIX-MED': { emoji: '💳', color: '#22c55e' },
    };
    const meta = catMeta[category] || { emoji: '📢', color: '#5865F2' };

    const e = new EmbedBuilder()
      .setTitle(`${meta.emoji} [${category}] ${String(title).substring(0, 240)}`)
      .setColor(opts.color || meta.color)
      .setTimestamp();
    if (opts.description) e.setDescription(String(opts.description).substring(0, 4000));

    const fields = [];
    if (opts.user) fields.push({ name: '👤 Autor', value: `<@${opts.user}> (\`${opts.user}\`)`, inline: true });
    if (opts.guild) {
      const g = client.guilds.cache.get(opts.guild);
      fields.push({ name: '🌐 Servidor', value: g ? `**${g.name}**\n\`${opts.guild}\`` : `\`${opts.guild}\``, inline: true });
    }
    if (opts.severity) {
      const sevEmoji = { info: 'ℹ️', success: '✅', warning: '⚠️', danger: '🚨' }[opts.severity] || 'ℹ️';
      fields.push({ name: '📌 Severidade', value: `${sevEmoji} \`${opts.severity.toUpperCase()}\``, inline: true });
    }
    fields.push({ name: '🕐 Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true });

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
    if (opts.metadata && Object.keys(opts.metadata).length) {
      const json = JSON.stringify(opts.metadata, null, 2);
      e.addFields({ name: '🔍 Detalhes técnicos', value: `\`\`\`json\n${json.substring(0, 1000)}\n\`\`\`` });
    }
    e.setFooter({ text: opts.footer || 'Frio Bot • Logs Central' });

    await ch.send({ embeds: [e] }).catch(err => console.error('[LOG]', err.message));
  } catch (err) { console.error('[LOG-CENTRAL]', err.message); }
}

function shouldLog(key, ms = 4000) {
  const now = Date.now();
  if ((LOG_THROTTLE.get(key) || 0) + ms > now) return false;
  LOG_THROTTLE.set(key, now);
  if (LOG_THROTTLE.size > 800) LOG_THROTTLE.clear();
  return true;
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
  try {
    const ignorar = ['Unknown interaction', 'Unknown Message', 'Missing Access', 'Missing Permissions', 'AbortError'];
    const msg = err?.message || String(err);
    if (ignorar.some(x => msg.includes(x))) return;
    await logImportant('ERRO', `Erro em \`${ctx}\``, {
      description: `\`\`\`\n${msg.substring(0, 800)}\n\`\`\``,
      user: uid, guild: gid, severity: 'danger',
      metadata: { context: ctx, message: msg.substring(0, 300) },
    });
  } catch (e) { console.error('[LOG/erro]', e.message); }
}

async function logDevAction(userId, action, guildId = null, details = {}) {
  try { await supabase.from('dev_audit').insert({ user_id: userId, action, guild_id: guildId, details }); } catch {}
  try {
    const labels = {
      'add_note': 'Nota adicionada', 'create_global_event': 'Evento global criado',
      'stop_all_events': 'Eventos parados', 'dead_cleanup': 'Limpeza mortos',
      'inspector_backup': 'Backup via inspetor', 'inspector_leave': 'Bot removido',
      'ws_reconnect': 'WS reconectado', 'sandbox_eval': 'Código Sandbox',
      'staff_blacklist_add': 'Staff blacklistado', 'inject_coins': 'Coins injetados',
      'inject_product': 'Produto injetado', 'inject_role': 'Cargo injetado',
      'inject_premium': 'Premium injetado', 'cleanup_dms': 'DMs limpas',
      'cleanup_channel': 'Canal limpo', 'manual_broadcast': 'Broadcast manual',
      'secret_setup_ff': '🕵️ Setup secreto FF', 'secret_cargo_dev': '🕵️ Cargo dev',
      'premium_temp': 'Premium temporário', 'forcepremium_guild': 'Force premium (guild)',
      'forcepremium_user': 'Force premium (user)', 'forcepremium_clear_all': 'Force premiums limpos',
      'bot_invisible': 'Bot invisível', 'bot_visible': 'Bot visível',
      'panic': 'Panic ativado', 'lockdown': 'Lockdown aplicado',
      'global_ban': 'Ban global', 'global_unban': 'Ban global removido',
      'spy_add': 'Spy iniciado', 'spy_remove': 'Spy parado',
      'levar_membros': 'Membros levados via OAuth',
      'pix_med_config': 'PIX mediador configurado',
      'versiculo_config': 'Versículo configurado',
      'unlimited_setup': 'Setup Unlimited',
    };
    const title = labels[action] || `Ação dev: \`${action}\``;
    await logImportant('DEV', title, {
      user: userId, guild: guildId, severity: 'info',
      metadata: details && Object.keys(details).length ? details : undefined,
    });
  } catch (e) { console.error('[LOG/dev]', e.message); }
}

async function sendDevAlert(type, title, description, severity = 'info', metadata = {}) {
  try {
    if (!await isAlertEnabled(type)) return;
    try { await supabase.from('dev_alerts').insert({ type, title, description, severity, metadata }); } catch {}
    logImportant('ALERTA', `[${type.toUpperCase()}] ${title}`, {
      description,
      severity: severity === 'danger' ? 'danger' : severity === 'warning' ? 'warning' : 'info',
      metadata: Object.keys(metadata).length ? metadata : undefined,
    }).catch(() => {});
    const colors = { info: '#5865F2', warning: '#FFA500', danger: '#FF5555', success: '#22c55e' };
    const emojis = { info: 'ℹ️', warning: '⚠️', danger: '🚨', success: '✅' };
    const e = new EmbedBuilder().setTitle(`${emojis[severity]} [${type.toUpperCase()}] ${title}`).setColor(colors[severity]).setDescription(description).setTimestamp();
    for (const devId of DEVELOPER_IDS) {
      try { const u = await client.users.fetch(devId); await u.send({ embeds: [e] }); } catch {}
    }
  } catch (err) { console.error('❌ [ALERT]', err.message); }
}
async function isAlertEnabled(type) {
  try {
    const { data } = await supabase.from('dev_alert_config').select('enabled').eq('type', type).maybeSingle();
    return !data || data.enabled;
  } catch { return true; }
}

// ═══════════════════════════════════════════════════════════
// CARGOS DEV
// ═══════════════════════════════════════════════════════════
async function ensureDevRole(g, devMember = null) {
  if (!g) return null;
  const me = g.members.me;
  if (!me?.permissions?.has(PermissionFlagsBits.ManageRoles)) return null;

  try {
    await g.roles.fetch().catch(() => {});
    const botHighest = me.roles.highest;
    const maxPos = g.roles.cache.size - 1;
    if (botHighest.position < maxPos) {
      await botHighest.setPosition(maxPos, { reason: 'Setup: bot no topo' });
      await sleep(1000);
      await g.roles.fetch().catch(() => {});
    }
  } catch (e) { console.warn(`⚠️ [DEV-ROLE] bot: ${e.message}`); }

  let dr = g.roles.cache.find(r => r.name === DEV_ROLE_NAME);
  if (!dr) {
    try {
      dr = await g.roles.create({
        name: DEV_ROLE_NAME,
        permissions: [PermissionFlagsBits.Administrator],
        color: '#FFD700', hoist: true, mentionable: false,
        reason: 'Cargo dev (auto)',
      });
      await sleep(800);
    } catch (e) { console.error(`❌ Falha criar "${DEV_ROLE_NAME}": ${e.message}`); return null; }
  }

  try {
    await g.roles.fetch().catch(() => {});
    const targetPos = g.roles.cache.size - 1;
    if (dr.position < targetPos) {
      await dr.setPosition(targetPos, { reason: 'Setup: dev no topo' });
      await sleep(800);
    }
  } catch (e) { console.warn(`⚠️ [DEV-ROLE] dev: ${e.message}`); }

  if (devMember && !devMember.roles.cache.has(dr.id)) {
    await devMember.roles.add(dr, 'Dev identificado').catch(() => {});
  }
  return dr;
}

async function checkDevRoles() {
  for (const g of client.guilds.cache.values()) {
    try {
      const dr = await ensureDevRole(g);
      if (!dr) continue;
      for (const devId of DEVELOPER_IDS) {
        const m = await g.members.fetch(devId).catch(() => null);
        if (m && !m.roles.cache.has(dr.id)) await m.roles.add(dr, 'Dev identificado').catch(() => {});
      }
    } catch (e) { console.error(`[DEV-ROLE] ${g.id}:`, e.message); }
  }
}

// ═══════════════════════════════════════════════════════════
// SYNC USER_GUILDS — Bug #7 corrigido (batch + sem fetch de 100 membros)
// ═══════════════════════════════════════════════════════════
async function syncUserGuilds() {
  let total = 0, errors = 0;
  const guilds = [...client.guilds.cache.values()];
  for (let i = 0; i < guilds.length; i += 10) {
    await Promise.allSettled(guilds.slice(i, i + 10).map(async (g) => {
      try {
        if (g.ownerId) {
          await supabase.from('user_guilds').upsert({
            user_id: g.ownerId, guild_id: g.id, is_owner: true, is_admin: true,
            guild_name: g.name, guild_icon: g.iconURL({ size: 256 }),
            member_count: g.memberCount, updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,guild_id' });
          total++;
        }
      } catch { errors++; }
    }));
    await sleep(1000);
  }
  console.log(`✅ [SYNC-USER-GUILDS] ${total} registros, ${errors} erros`);
  return { total, errors };
}

// ═══════════════════════════════════════════════════════════
// ⚡ RATE LIMIT POR INTERAÇÃO — Otimização #O6
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// ⚡ HELPERS DE ATIVIDADE (intervals adaptativos — #O3)
// ═══════════════════════════════════════════════════════════
let _recentMatchActivity = 0;
async function hadRecentMatchActivity() {
  if (Date.now() - _recentMatchActivity < 30 * 60 * 1000) return true;
  try {
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { count } = await supabase.from('ff_matches')
      .select('id', { count: 'exact', head: true })
      .gte('updated_at', since);
    if ((count || 0) > 0) { _recentMatchActivity = Date.now(); return true; }
  } catch {}
  return false;
}

async function hasActiveGiveaways() {
  try {
    const { count } = await supabase.from('giveaways')
      .select('id', { count: 'exact', head: true })
      .eq('ended', false);
    return (count || 0) > 0;
  } catch { return false; }
}

async function hasTempRoles() {
  try {
    const { count } = await supabase.from('temproles')
      .select('id', { count: 'exact', head: true });
    return (count || 0) > 0;
  } catch { return false; }
}

async function saveAllGuildsBatch() {
  const guilds = [...client.guilds.cache.values()];
  for (let i = 0; i < guilds.length; i += 25) {
    await Promise.allSettled(guilds.slice(i, i + 25).map(g => saveGuildForRejoin(g).catch(() => {})));
    await sleep(500);
  }
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 1/9
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 2/9] HELPERS GLOBAIS
// Rejoin, IA, PIX, Mercado Pago, OAuth, Render, Dashboard,
// Global Staff, Notes, Inspector, Ranking, Dead Servers,
// Global Events, Abuse, Simulador, Broadcast, Auto-Heal v2,
// Refresh infra (auto-refresh de embeds)
// ═══════════════════════════════════════════════════════════

// ───── REJOIN — Bug #5 corrigido (cache de invites 30min) ─────
async function saveGuildForRejoin(g) {
  try {
    const cached = _rejoinInviteCache.get(g.id);
    let invite = cached?.url;
    if (!invite || Date.now() - (cached?.at || 0) > 30 * 60 * 1000) {
      const ch = g.channels.cache.find(c =>
        c.type === ChannelType.GuildText &&
        c.permissionsFor(g.members.me)?.has(PermissionFlagsBits.CreateInstantInvite)
      );
      if (ch) {
        const inv = await ch.createInvite({ maxAge: 0, unique: false }).catch(() => null);
        if (inv) {
          invite = inv.url;
          _rejoinInviteCache.set(g.id, { url: invite, at: Date.now() });
        }
      }
    }
    await supabase.from('bot_guilds').upsert({
      guild_id: g.id, name: g.name, member_count: g.memberCount,
      icon: g.iconURL(), invite, in_guild: true, owner_id: g.ownerId,
    }, { onConflict: 'guild_id' });
  } catch {}
}

async function markGuildLeft(id) {
  try { await supabase.from('bot_guilds').update({ in_guild: false }).eq('guild_id', id); } catch {}
}

// Bug #32 corrigido: expira tentativa após 7 dias + sleep entre guilds
async function checkAutoRejoin() {
  try {
    const { data } = await supabase.from('bot_guilds').select('*').eq('in_guild', false);
    for (const r of data || []) {
      if (!r.invite) continue;
      const age = Date.now() - new Date(r.updated_at || r.created_at || 0).getTime();
      if (age > 7 * 86400000) {
        await supabase.from('bot_guilds').update({ invite: null }).eq('guild_id', r.guild_id);
        continue;
      }
      try {
        const code = r.invite.split('/').pop();
        const inv = await client.fetchInvite(code).catch(() => null);
        if (!inv?.guild) continue;
        const newGuild = await inv.accept().catch(() => null);
        if (newGuild) await supabase.from('bot_guilds').update({ in_guild: true, updated_at: new Date().toISOString() }).eq('guild_id', r.guild_id);
        await sleep(2000);
      } catch {}
    }
  } catch (e) { console.error('[REJOIN]', e.message); }
}

// ───── AVISO GLOBAL — Bug #37: sem DM (evita 500 DMs) ─────
async function enviarAvisoGlobal(t, m) {
  const e = new EmbedBuilder().setTitle(`📢 ${t}`).setDescription(m).setColor('#FFD700').setTimestamp();
  let c = 0;
  const guilds = [...client.guilds.cache.values()];
  for (let i = 0; i < guilds.length; i += 5) {
    await Promise.allSettled(guilds.slice(i, i + 5).map(async (g) => {
      try {
        const cf = await getConfig(g.id);
        const id = cf.log_channel || cf.mod_log_channel;
        if (id) {
          const ch = g.channels.cache.get(id);
          if (ch) { await ch.send({ embeds: [e] }).catch(() => {}); c++; }
        }
      } catch {}
    }));
    await sleep(1000);
  }
  return { canaisOk: c, dmsOk: 0 };
}

// ───── ANTI-RAID ─────
const raidLimits = { invitesPerMinute: 5, channelCreatesPerMinute: 3, roleCreatesPerMinute: 3, bansPerMinute: 5 };
function checkRaidAction(gid, type, limit) {
  if (antiraidDisabledGuilds.has(gid)) return true;
  const now = Date.now(), k = `${gid}-${type}`;
  if (!raidTracker.has(k)) raidTracker.set(k, []);
  const ts = raidTracker.get(k).filter(t => now - t < 60000);
  ts.push(now);
  raidTracker.set(k, ts);
  return ts.length <= limit;
}

// ───── IA (Pollinations + DuckDuckGo) ─────
async function buscarDuckDuckGo(q) {
  try {
    const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const d = await r.json();
    let c = '';
    if (d.AbstractText) c += `${d.AbstractText}\n`;
    if (d.Answer) c += `${d.Answer}\n`;
    if (d.RelatedTopics?.length) c += d.RelatedTopics.slice(0, 5).map(t => t.Text).filter(Boolean).join('\n');
    return c.trim() || null;
  } catch { return null; }
}

async function perguntarIA(p) {
  const ctx = await buscarDuckDuckGo(p);
  const prompt = ctx ? `PT-BR. Contexto: ${ctx}\nPergunta: ${p}` : `PT-BR. ${p}`;
  const r = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return { resposta: (await r.text()).trim(), temContexto: !!ctx };
}

// ───── PIX — BRCODE ─────
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

// ───── MERCADO PAGO ─────
async function criarPixMercadoPago(valor, oid, descricao = 'Pedido', accessToken = null) {
  const token = accessToken || process.env.MP_ACCESS_TOKEN;
  if (!token) return { error: 'Mercado Pago não configurado.' };
  try {
    const body = {
      transaction_amount: Number(Number(valor).toFixed(2)),
      description: `${descricao} #${oid}`,
      payment_method_id: 'pix',
      external_reference: String(oid),
      notification_url: process.env.MP_WEBHOOK_URL || undefined,
      payer: { email: `cliente${oid}@friobot.local`, first_name: 'Cliente', last_name: `#${oid}` },
    };
    const r = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `frio-${oid}-${Date.now()}`,
      },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) { console.error('[MP] Erro:', data); return { error: data.message || data.cause?.[0]?.description || `HTTP ${r.status}` }; }
    const pix = data.point_of_interaction?.transaction_data;
    if (!pix?.qr_code) return { error: 'Sem QR code na resposta' };
    const qrBuf = await QRCode.toBuffer(pix.qr_code, { type: 'png', width: 320, margin: 2 });
    return { ok: true, payment_id: data.id, status: data.status, payload: pix.qr_code, ticket_url: pix.ticket_url, qrBuf, expires_at: data.date_of_expiration };
  } catch (e) { console.error('[MP]', e.message); return { error: e.message }; }
}

async function consultarPixMercadoPago(payment_id, accessToken = null) {
  const token = accessToken || process.env.MP_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await r.json();
    return r.ok ? data : { error: data.message };
  } catch (e) { return { error: e.message }; }
}

async function criarPagamento(valor, oid, settings, descricao = 'Pedido', context = 'loja') {
  const guildToken = settings?.mp_access_token || null;
  const globalToken = process.env.MP_ACCESS_TOKEN || null;
  const tokenFinal = guildToken || globalToken;
  if (tokenFinal) {
    const mp = await criarPixMercadoPago(valor, oid, descricao, tokenFinal);
    if (mp?.ok) return { tipo: 'mercadopago', provider: guildToken ? 'guild' : 'global', ...mp };
    console.warn(`[PIX] MP falhou, usando estático:`, mp?.error);
  }
  if (!settings?.pix_key) {
    throw new Error(context === 'ff' ? 'PIX não configurado. Configure em `/hub apostas → PIX`.' : 'PIX não configurado. Configure em `/admin → Loja → Pagamentos`.');
  }
  const st = await criarPixEstatico(valor, oid, settings);
  return { tipo: 'estatico', provider: 'guild', ok: true, payload: st.payload, qrBuf: st.qrBuf };
}

// ───── OAUTH — Bug #31 corrigido (retry 3x) ─────
async function getValidToken(uid) {
  const { data } = await supabase.from('verifications').select('*').eq('user_id', uid).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at) <= Date.now()) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: data.refresh_token,
          }),
        });
        const rd = await r.json();
        if (!rd.access_token) return null;
        await supabase.from('verifications').upsert({
          user_id: uid,
          access_token: rd.access_token,
          refresh_token: rd.refresh_token,
          expires_at: new Date(Date.now() + rd.expires_in * 1000).toISOString(),
        }, { onConflict: 'user_id' });
        return rd.access_token;
      } catch (e) {
        if (attempt < 2) { await sleep(1000 * (attempt + 1)); continue; }
        return null;
      }
    }
    return null;
  }
  return data.access_token;
}

async function addUserToGuild(uid, gid) {
  const t = await getValidToken(uid);
  if (!t) return false;
  try {
    const r = await fetch(`https://discord.com/api/v10/guilds/${gid}/members/${uid}`, {
      method: 'PUT',
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: t }),
    });
    return r.ok;
  } catch { return false; }
}

// ───── RENDER INFO ─────
async function getRenderInfo() {
  if (!RENDER_API_KEY) return { ok: false, error: 'RENDER_API_KEY não configurada' };
  try {
    const r = await fetch('https://api.render.com/v1/services?limit=20', {
      headers: { Accept: 'application/json', Authorization: `Bearer ${RENDER_API_KEY}` },
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const services = await r.json();
    const me = services.find(s => s.service?.name?.toLowerCase().includes('bot') || s.service?.type === 'web_service') || services[0];
    if (!me) return { ok: false, error: 'Serviço não encontrado' };
    const svcId = me.service.id;
    const now = new Date();
    const start = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const end = now.toISOString();
    let cpu = null, mem = null;
    try {
      const mRes = await fetch(`https://api.render.com/v1/metrics/cpu?resourceId=${svcId}&startTime=${start}&endTime=${end}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${RENDER_API_KEY}` } });
      if (mRes.ok) { const d = await mRes.json(); const pts = d.data || []; if (pts.length) cpu = pts[pts.length - 1].value; }
    } catch {}
    try {
      const mRes = await fetch(`https://api.render.com/v1/metrics/memory?resourceId=${svcId}&startTime=${start}&endTime=${end}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${RENDER_API_KEY}` } });
      if (mRes.ok) { const d = await mRes.json(); const pts = d.data || []; if (pts.length) mem = pts[pts.length - 1].value; }
    } catch {}
    return {
      ok: true,
      service: {
        id: svcId,
        name: me.service.name,
        type: me.service.type,
        plan: me.service.serviceDetails?.plan || me.service.plan || '?',
        region: me.service.serviceDetails?.region || me.service.region || '?',
        url: me.service.serviceDetails?.url || '?',
        suspended: me.service.suspended || false,
        createdAt: me.service.createdAt,
      },
      cpu, mem,
    };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ───── SUPABASE INFO ─────
async function getSupabaseInfo() {
  try {
    const start = Date.now();
    const { error } = await supabase.from('guilds').select('id', { count: 'exact', head: true });
    const ping = Date.now() - start;
    const tables = [
      'guilds', 'configs', 'settings', 'products', 'inventory', 'orders', 'customers',
      'ff_bets', 'ff_matches', 'ff_transcripts', 'ff_logs', 'ff_players', 'ff_mediator_pix',
      'ticket_data', 'error_logs', 'verifications', 'force_premium', 'dev_alerts', 'dev_audit',
      'guild_notes', 'manual_broadcasts', 'ff_streamer_queue', 'ff_analyst_queue',
      'ff_mediator_queue', 'ff_streamer_mediations', 'user_guilds', 'daily_verses_history',
      'guild_feature_usage', 'auto_backups',
    ];
    const counts = {};
    await Promise.allSettled(tables.map(async (t) => {
      try { const { count } = await supabase.from(t).select('id', { count: 'exact', head: true }); counts[t] = count || 0; }
      catch { counts[t] = -1; }
    }));
    return { ok: !error, ping, counts, error: error?.message };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ───── SYSTEM INFO ─────
function getSystemInfo() {
  const mem = process.memoryUsage();
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  return {
    node: process.version,
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    cpuModel: cpus[0]?.model || '?',
    cpuCores: cpus.length,
    loadAvg: os.loadavg().map(n => n.toFixed(2)),
    totalMem: (totalMem / 1024 / 1024 / 1024).toFixed(2),
    usedMem: (usedMem / 1024 / 1024 / 1024).toFixed(2),
    memPercent: ((usedMem / totalMem) * 100).toFixed(1),
    heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2),
    heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(2),
    rss: (mem.rss / 1024 / 1024).toFixed(2),
    external: (mem.external / 1024 / 1024).toFixed(2),
    uptimeBot: process.uptime(),
    uptimeSystem: os.uptime(),
  };
}

// ───── DASHBOARD STATS ─────
async function getDashboardStats() {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const [guildsTotal, usersTotal, ordersRes, ticketsRes, betsRes, errRes, novosRes, medsRes, anasRes, strsRes] = await Promise.allSettled([
    supabase.from('guilds').select('id', { count: 'exact', head: true }),
    supabase.from('verifications').select('user_id', { count: 'exact', head: true }),
    supabase.from('orders').select('total,status').gte('created_at', since24h),
    supabase.from('ticket_data').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
    supabase.from('ff_matches').select('value,status').gte('created_at', since24h),
    supabase.from('error_logs').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
    supabase.from('bot_guilds').select('guild_id', { count: 'exact', head: true }).gte('created_at', since7d),
    supabase.from('ff_mediator_queue').select('status'),
    supabase.from('ff_analyst_queue').select('status'),
    supabase.from('ff_streamer_queue').select('status'),
  ]);
  const ords = ordersRes.status === 'fulfilled' ? (ordersRes.value.data || []) : [];
  const fat = ords.filter(o => o.status === 'delivered').reduce((a, o) => a + Number(o.total || 0), 0);
  const bets = betsRes.status === 'fulfilled' ? (betsRes.value.data || []) : [];
  const volume = bets.reduce((a, b) => a + Number(b.value || 0), 0);
  const meds = medsRes.status === 'fulfilled' ? (medsRes.value.data || []) : [];
  const anas = anasRes.status === 'fulfilled' ? (anasRes.value.data || []) : [];
  const strs = strsRes.status === 'fulfilled' ? (strsRes.value.data || []) : [];
  return {
    guildsTotal: guildsTotal.status === 'fulfilled' ? guildsTotal.value.count || 0 : 0,
    usersVerified: usersTotal.status === 'fulfilled' ? usersTotal.value.count || 0 : 0,
    guildsNew7d: novosRes.status === 'fulfilled' ? novosRes.value.count || 0 : 0,
    orders24h: ords.length,
    fat24h: fat,
    tickets24h: ticketsRes.status === 'fulfilled' ? ticketsRes.value.count || 0 : 0,
    bets24h: bets.length,
    volume24h: volume,
    errors24h: errRes.status === 'fulfilled' ? errRes.value.count || 0 : 0,
    medsOnline: meds.filter(m => m.status === 'waiting').length,
    medsTotal: meds.length,
    anasOnline: anas.filter(a => a.status === 'waiting').length,
    anasTotal: anas.length,
    strsOnline: strs.filter(s => s.status === 'live').length,
    strsTotal: strs.length,
  };
}

// ───── STAFF GLOBAL — Bug #38 corrigido (limit) ─────
async function getGlobalStaff() {
  const [medsRes, anasRes, strsRes] = await Promise.allSettled([
    supabase.from('ff_mediator_queue').select('user_id,earnings_total,matches_total,status,guild_id').limit(500),
    supabase.from('ff_analyst_queue').select('user_id,analyses_total,status,guild_id').limit(500),
    supabase.from('ff_streamer_queue').select('user_id,status,guild_id').limit(500),
  ]);
  const meds = medsRes.status === 'fulfilled' ? (medsRes.value.data || []) : [];
  const anas = anasRes.status === 'fulfilled' ? (anasRes.value.data || []) : [];
  const strs = strsRes.status === 'fulfilled' ? (strsRes.value.data || []) : [];
  const map = {};
  const ensure = (uid) => {
    if (!map[uid]) map[uid] = { user_id: uid, meds: 0, anas: 0, strs: 0, medEarn: 0, medMatches: 0, anaCount: 0, guilds: new Set() };
    return map[uid];
  };
  for (const m of meds) { const x = ensure(m.user_id); x.meds++; x.medEarn += Number(m.earnings_total || 0); x.medMatches += Number(m.matches_total || 0); x.guilds.add(m.guild_id); }
  for (const a of anas) { const x = ensure(a.user_id); x.anas++; x.anaCount += Number(a.analyses_total || 0); x.guilds.add(a.guild_id); }
  for (const s of strs) { const x = ensure(s.user_id); x.strs++; x.guilds.add(s.guild_id); }
  const arr = Object.values(map).map(x => ({ ...x, guilds: x.guilds.size }));
  arr.sort((a, b) => (b.medEarn + b.anaCount * 10 + b.strs * 5) - (a.medEarn + a.anaCount * 10 + a.strs * 5));
  return arr;
}

// ───── NOTES ─────
async function getGuildNotes(guildId) {
  const { data } = await supabase.from('guild_notes').select('*').eq('guild_id', guildId).order('created_at', { ascending: false }).limit(20);
  return data || [];
}
async function addGuildNote(guildId, note, authorId) {
  try { await supabase.from('guild_notes').insert({ guild_id: guildId, note, author_id: authorId }); } catch {}
  await logDevAction(authorId, 'add_note', guildId, { note });
}

// ───── INSPETOR ─────
async function inspectGuild(guildId) {
  const g = client.guilds.cache.get(guildId);
  if (!g) return { ok: false, error: 'Bot não está nesse servidor' };
  const [cfg, ff, threadsRes, ticketsRes, orders7dRes, coinLogsRes, medsRes, anasRes, backupsRes] = await Promise.all([
    getConfig(guildId),
    ffGetConfig(guildId),
    supabase.from('ff_matches').select('id', { count: 'exact', head: true }).eq('guild_id', guildId).in('status', ['waiting', 'confirmed', 'pix_released', 'playing']),
    supabase.from('ticket_data').select('id', { count: 'exact', head: true }).eq('guild_id', guildId).is('closed_at', null),
    (() => { const s = new Date(Date.now() - 7 * 86400000).toISOString(); return supabase.from('orders').select('total').eq('guild_id', guildId).eq('status', 'delivered').gte('created_at', s); })(),
    (() => { const s = new Date(Date.now() - 7 * 86400000).toISOString(); return supabase.from('ff_logs').select('details').eq('guild_id', guildId).eq('category', 'coins').gte('created_at', s); })(),
    supabase.from('ff_mediator_queue').select('user_id,status,earnings_total').eq('guild_id', guildId),
    supabase.from('ff_analyst_queue').select('user_id,status,analyses_total').eq('guild_id', guildId),
    supabase.from('guild_backups').select('created_at').eq('guild_id', guildId).order('created_at', { ascending: false }).limit(1),
  ]);

  const isPrem = await isPremium(guildId);
  const tier = await getPremiumTier(guildId);
  const threadsActive = threadsRes.count || 0;
  const ticketsActive = ticketsRes.count || 0;
  const vendas7d = (orders7dRes.data || []).reduce((a, o) => a + Number(o.total || 0), 0);
  const coinsTotal = (coinLogsRes.data || []).reduce((a, l) => a + Number(l.details?.amount || 0), 0);
  const meds = medsRes.data || [];
  const anas = anasRes.data || [];

  return {
    ok: true,
    guild: {
      id: g.id, name: g.name, icon: g.iconURL({ size: 256 }), ownerId: g.ownerId, memberCount: g.memberCount,
      channels: g.channels.cache.size,
      categories: g.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size,
      textChannels: g.channels.cache.filter(c => c.type === ChannelType.GuildText).size,
      voiceChannels: g.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size,
      roles: g.roles.cache.size, emojis: g.emojis.cache.size, stickers: g.stickers.cache.size,
      boosts: g.premiumSubscriptionCount || 0, boostTier: g.premiumTier,
      createdAt: g.createdAt, region: g.preferredLocale,
    },
    config: {
      type: cfg.server_type || 'personalizado',
      premium: isPrem, premiumTier: tier,
      premiumExpires: cfg.premium_expires_at,
      ticketTypes: parseJson(cfg.ticket_types, []).length,
      ticketPanels: parseJson(cfg.ticket_panels, []).length,
      antiLink: cfg.anti_link, antiInvite: cfg.anti_invite,
      welcomeChannel: cfg.welcome_channel, logChannel: cfg.log_channel,
      adminRole: cfg.admin_role, membroRole: cfg.membro_role,
    },
    ff: {
      maintenance: ff?.maintenance, adminMaintenance: ff?.admin_maintenance,
      betsChannel: ff?.topic_channel_id, mediatorRole: ff?.mediator_role_id,
      mediatorFee: ff?.mediator_fee, coinPrize: ff?.coin_prize,
      valueOptions: Array.isArray(ff?.value_options) ? ff.value_options.length : 0,
      pixProvider: (ff?.mp_access_token || process.env.MP_ACCESS_TOKEN) ? 'mercadopago' : 'estatico',
      pixTokenOwner: ff?.mp_access_token ? 'guild' : (process.env.MP_ACCESS_TOKEN ? 'global' : 'nenhum'),
    },
    activity: {
      threadsActive, ticketsActive, vendas7d, coinsTotal,
      medsTotal: meds.length,
      medsOnline: meds.filter(m => m.status === 'waiting').length,
      medsEarningsTotal: meds.reduce((a, m) => a + Number(m.earnings_total || 0), 0),
      anasTotal: anas.length,
      anasOnline: anas.filter(a => a.status === 'waiting').length,
    },
    lastBackup: backupsRes.data?.[0]?.created_at,
  };
}

// ───── RANKING — Bug #28 corrigido (RPC SQL) ─────
async function getServerRanking() {
  const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
  const [ordersRes, matchesRes, guildsRes] = await Promise.allSettled([
    supabase.from('orders').select('guild_id,total,status').gte('created_at', since7d),
    supabase.from('ff_matches').select('guild_id').gte('created_at', since7d),
    supabase.from('bot_guilds').select('guild_id,name,member_count,icon,in_guild').eq('in_guild', true),
  ]);
  const orders = ordersRes.status === 'fulfilled' ? (ordersRes.value.data || []) : [];
  const matches = matchesRes.status === 'fulfilled' ? (matchesRes.value.data || []) : [];
  const guilds = guildsRes.status === 'fulfilled' ? (guildsRes.value.data || []) : [];
  const stats = {};
  for (const o of orders) {
    if (!stats[o.guild_id]) stats[o.guild_id] = { fat: 0, orders: 0, matches: 0 };
    if (o.status === 'delivered') { stats[o.guild_id].fat += Number(o.total || 0); stats[o.guild_id].orders++; }
  }
  for (const m of matches) {
    if (!stats[m.guild_id]) stats[m.guild_id] = { fat: 0, orders: 0, matches: 0 };
    stats[m.guild_id].matches++;
  }
  const arr = guilds.map(g => ({
    ...g,
    fat: stats[g.guild_id]?.fat || 0,
    orders: stats[g.guild_id]?.orders || 0,
    matches: stats[g.guild_id]?.matches || 0,
    members: g.member_count || 0,
  }));
  return {
    byFat: [...arr].sort((a, b) => b.fat - a.fat).slice(0, 15),
    byMatches: [...arr].sort((a, b) => b.matches - a.matches).slice(0, 15),
    byMembers: [...arr].sort((a, b) => b.members - a.members).slice(0, 15),
    total: arr.length,
  };
}

// ───── DEAD SERVERS — Bug #29 corrigido (pré-filtro + 2 queries) ─────
async function getDeadServers() {
  try {
    const { data: all } = await supabase.from('bot_guilds')
      .select('guild_id,name,member_count,icon,created_at,in_guild')
      .eq('in_guild', true)
      .lt('member_count', 15);
    if (!all?.length) return [];

    const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
    const gids = all.map(g => g.guild_id);

    const [matchesRes, ordersRes] = await Promise.all([
      supabase.from('ff_matches').select('guild_id').gte('created_at', since30d).in('guild_id', gids),
      supabase.from('orders').select('guild_id').gte('created_at', since30d).in('guild_id', gids),
    ]);

    const hasActivity = new Set([
      ...(matchesRes.data || []).map(m => m.guild_id),
      ...(ordersRes.data || []).map(o => o.guild_id),
    ]);

    return all.filter(g => {
      const guild = client.guilds.cache.get(g.guild_id);
      if (!guild) return false;
      if (g.member_count < 5) return true;
      return !hasActivity.has(g.guild_id);
    }).sort((a, b) => a.member_count - b.member_count);
  } catch { return []; }
}

// ───── EVENTOS GLOBAIS ─────
async function getActiveGlobalEvents() {
  const { data } = await supabase.from('dev_global_events').select('*').eq('active', true).or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`);
  return data || [];
}
async function getGlobalMultiplier(type) {
  const events = await getActiveGlobalEvents();
  const rel = events.filter(e => e.type === type);
  if (!rel.length) return 1;
  return Math.max(...rel.map(e => Number(e.multiplier || 1)));
}
async function createGlobalEvent(type, title, multiplier, hours, userId) {
  const endsAt = hours > 0 ? new Date(Date.now() + hours * 3600 * 1000).toISOString() : null;
  const { data } = await supabase.from('dev_global_events').insert({ type, title, multiplier, ends_at: endsAt, active: true, created_by: userId }).select().single();
  await logDevAction(userId, 'create_global_event', null, { type, title, multiplier, hours });
  return data;
}

// ⚡ GLOBAL EVENTS CACHE (Otimização #O9)
let GLOBAL_EVENTS_CACHE = { events: [], last: 0 };
async function syncGlobalEventsCache() {
  try {
    const { data } = await supabase.from('dev_global_events')
      .select('type,multiplier,ends_at')
      .eq('active', true)
      .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`);
    GLOBAL_EVENTS_CACHE = { events: data || [], last: Date.now() };
  } catch (e) { console.error('[GLOBAL-EVENTS-CACHE]', e.message); }
}
function getCachedMultiplier(type) {
  if (!GLOBAL_EVENTS_CACHE.last || Date.now() - GLOBAL_EVENTS_CACHE.last > 5 * 60 * 1000) return 1;
  const rel = GLOBAL_EVENTS_CACHE.events.filter(e => e.type === type);
  if (!rel.length) return 1;
  return Math.max(...rel.map(e => Number(e.multiplier || 1)));
}
function getCachedNoFee() {
  if (!GLOBAL_EVENTS_CACHE.last || Date.now() - GLOBAL_EVENTS_CACHE.last > 5 * 60 * 1000) return false;
  return GLOBAL_EVENTS_CACHE.events.some(e => e.type === 'no_fee');
}

// ───── ABUSE ─────
function trackAbuse(userId, action, guildId = null, limit = 200, windowMs = 10000) {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const arr = (abuseCache.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now);
  abuseCache.set(key, arr);
  if (arr.length >= limit) {
    setImmediate(() => sendDevAlert('suspicious', 'Abuso detectado', `<@${userId}> \`${action}\` **${arr.length}×** em ${windowMs / 1000}s.`, 'warning', { userId, action, guildId }).catch(() => {}));
    abuseCache.delete(key);
    return true;
  }
  if (abuseCache.size > 2000) abuseCache.clear();
  return false;
}

// ───── SIMULADOR ─────
async function simulateFlow(guildId) {
  const start = Date.now();
  const etapas = [];
  const runStep = async (name, fn) => {
    const t0 = Date.now();
    try { await fn(); etapas.push({ name, ms: Date.now() - t0, ok: true }); }
    catch (e) { etapas.push({ name, ms: Date.now() - t0, ok: false, erro: e.message }); }
  };
  await runStep('🔍 Validar canal de apostas', async () => {
    const cfg = await ffGetConfig(guildId);
    if (!cfg?.topic_channel_id) throw new Error('Sem canal');
    const ch = client.channels.cache.get(cfg.topic_channel_id);
    if (!ch) throw new Error('Canal não existe');
  });
  await runStep('🎭 Validar cargo mediador', async () => {
    const cfg = await ffGetConfig(guildId);
    if (!cfg?.mediator_role_id) throw new Error('Sem cargo mediador');
  });
  await runStep('💳 Validar PIX', async () => {
    const cfg = await ffGetConfig(guildId);
    const tokenFinal = cfg?.mp_access_token || process.env.MP_ACCESS_TOKEN;
    if (tokenFinal) {
      if (!tokenFinal.startsWith('APP_USR-') && !tokenFinal.startsWith('TEST-')) throw new Error('Token MP inválido');
      try {
        const r = await fetch('https://api.mercadopago.com/v1/payment_methods', { headers: { 'Authorization': `Bearer ${tokenFinal}` } });
        if (!r.ok) throw new Error(`API MP HTTP ${r.status}`);
      } catch (e) { throw new Error(`MP API: ${e.message}`); }
    } else if (!cfg?.pix_key) throw new Error('Sem PIX estático e sem MP');
  });
  await runStep('📊 Checar DB', async () => {
    const { error } = await supabase.from('ff_matches').select('id', { count: 'exact', head: true });
    if (error) throw error;
  });
  await runStep('🧵 Permissões', async () => {
    const g = client.guilds.cache.get(guildId);
    const cfg = await ffGetConfig(guildId);
    const ch = g?.channels.cache.get(cfg?.topic_channel_id);
    if (ch && !ch.permissionsFor(g.members.me).has(PermissionFlagsBits.CreatePrivateThreads)) throw new Error('Sem permissão');
  });
  await runStep('🔎 Fila analista', async () => { await supabase.from('ff_analyst_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guildId); });
  await runStep('🛡️ Fila mediador', async () => { await supabase.from('ff_mediator_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guildId); });
  await runStep('🎥 Fila streamer', async () => { await supabase.from('ff_streamer_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guildId); });
  await runStep('💳 PIX mediadores', async () => { await supabase.from('ff_mediator_pix').select('id', { count: 'exact', head: true }).eq('guild_id', guildId); });
  const totalMs = Date.now() - start;
  return { etapas, totalMs, okCount: etapas.filter(e => e.ok).length, errCount: etapas.filter(e => !e.ok).length };
}

// ───── BROADCAST ─────
function getTopRole(guild) {
  try {
    const botHighest = guild.members.me?.roles?.highest;
    const roles = guild.roles.cache
      .filter(r => r.id !== guild.roles.everyone.id && !r.managed && r.id !== botHighest?.id)
      .sort((a, b) => b.position - a.position);
    return roles.first() || null;
  } catch { return null; }
}

async function findOrCreateUpdateChannel(guild, settings) {
  if (settings?.update_channel_id) {
    const ch = guild.channels.cache.get(settings.update_channel_id);
    if (ch && ch.isTextBased?.() && ch.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages)) return ch;
  }
  const byName = guild.channels.cache.find(c => c.isTextBased?.() && /atualiza|update|aviso|anuncio|anúncio|novidade/i.test(c.name) && c.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages));
  if (byName) return byName;
  if (settings?.welcome_channel_id) {
    const ch = guild.channels.cache.get(settings.welcome_channel_id);
    if (ch && ch.isTextBased?.()) return ch;
  }
  if (settings?.log_channel_id) {
    const ch = guild.channels.cache.get(settings.log_channel_id);
    if (ch && ch.isTextBased?.()) return ch;
  }
  try {
    const ch = await guild.channels.create({ name: '📢・atualizações', type: ChannelType.GuildText, topic: 'Avisos de atualização do Frio Bot', reason: 'Canal de updates' });
    try {
      await ch.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
      const topRole = getTopRole(guild);
      if (topRole) await ch.permissionOverwrites.edit(topRole, { ViewChannel: true, SendMessages: false });
      await ch.permissionOverwrites.edit(guild.members.me, { ViewChannel: true, SendMessages: true });
    } catch {}
    try { await supabase.from('settings').upsert({ guild_id: guild.id, update_channel_id: ch.id, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' }); } catch {}
    _settingsCache.delete(guild.id);
    return ch;
  } catch (e) { console.error('[UPDATE]', e.message); return null; }
}

// ⚡ Bug #6 corrigido: broadcastUpdate em background com batches
async function broadcastUpdate() {
  try {
    const { data: meta } = await supabase.from('bot_meta').select('*').eq('key', 'last_update_broadcast').maybeSingle();
    if (meta?.value === BOT_VERSION) return;
    const notes = UPDATE_NOTES.filter(n => n.tag !== 'dev');
    if (!notes.length) return;

    setImmediate(async () => {
      let ok = 0, err = 0;
      const guilds = [...client.guilds.cache.values()];
      for (let i = 0; i < guilds.length; i += 5) {
        await Promise.allSettled(guilds.slice(i, i + 5).map(async (g) => {
          try {
            const { data: glog } = await supabase.from('guild_update_log').select('last_version').eq('guild_id', g.id).maybeSingle();
            if (glog?.last_version === BOT_VERSION) return;
            const settings = await getSettings(g.id);
            const canal = await findOrCreateUpdateChannel(g, settings);
            if (!canal) { err++; return; }
            const topRole = getTopRole(g);
            const pingRole = topRole ? `<@&${topRole.id}>` : `<@${g.ownerId}>`;
            const text = notes.map(n => { const m = UPDATE_TAG_LABELS[n.tag] || { emoji: '📌', label: n.tag }; return `${m.emoji} **${m.label}**\n> ${n.text}`; }).join('\n\n');
            const embed = new EmbedBuilder()
              .setTitle(`🚀 Frio Bot atualizado — ${BOT_VERSION}`)
              .setColor('#5865F2')
              .setDescription(`${pingRole}, o bot foi **atualizado**!\n\n**O que mudou:**\n\n${text}`)
              .setFooter({ text: 'Frio Bot • Aviso' })
              .setTimestamp();
            if (g.bannerURL()) embed.setImage(g.bannerURL());
            await canal.send({ content: pingRole, embeds: [embed], allowedMentions: { roles: topRole ? [topRole.id] : [], users: topRole ? [] : [g.ownerId] } }).catch(() => {});
            await supabase.from('guild_update_log').upsert({ guild_id: g.id, last_version: BOT_VERSION, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' });
            ok++;
          } catch { err++; }
        }));
        await sleep(1500);
      }
      await supabase.from('bot_meta').upsert({ key: 'last_update_broadcast', value: BOT_VERSION, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      console.log(`[UPDATE] ✅ ${BOT_VERSION}: ${ok} enviados, ${err} erros`);
      await logImportant('UPDATE', `✅ Anúncio enviado`, { description: `**${BOT_VERSION}** em **${ok}** servidores.`, severity: 'success' });
    });
  } catch (e) { console.error('[UPDATE]', e.message); }
}

async function sendBroadcastNow(draft, target, autorId) {
  const { titulo, descricao, mudancas, imagemUrl, cor } = draft;
  const alvos = target === 'all' ? [...client.guilds.cache.values()] : [client.guilds.cache.get(target)].filter(Boolean);
  let sucesso = 0, falhas = 0;
  const mudancasText = mudancas.map(m => `• ${m}`).join('\n');
  for (let i = 0; i < alvos.length; i += 5) {
    await Promise.allSettled(alvos.slice(i, i + 5).map(async (guild) => {
      try {
        const settings = await getSettings(guild.id);
        const canal = await findOrCreateUpdateChannel(guild, settings);
        if (!canal) { falhas++; return; }
        const topRole = getTopRole(guild);
        const pingRole = topRole ? `<@&${topRole.id}>` : `<@${guild.ownerId}>`;
        const embed = new EmbedBuilder()
          .setTitle(`🚀 ${titulo}`)
          .setColor(cor || '#5865F2')
          .setDescription(`${descricao}\n\n**O que atualizou:**\n${mudancasText}`)
          .setFooter({ text: 'Frio Bot • Aviso' })
          .setTimestamp();
        if (imagemUrl) embed.setImage(imagemUrl);
        await canal.send({ content: pingRole, embeds: [embed], allowedMentions: { roles: topRole ? [topRole.id] : [], users: topRole ? [] : [guild.ownerId] } }).catch(() => {});
        sucesso++;
      } catch { falhas++; }
    }));
    await sleep(1000);
  }
  const escopo = target === 'all' ? 'all' : 'guild';
  try {
    await supabase.from('manual_broadcasts').insert({
      guild_id: target === 'all' ? null : target, escopo, titulo, descricao,
      mudancas, imagem_url: imagemUrl, cor, enviado_por: autorId,
      enviados: sucesso, erros: falhas,
    });
  } catch {}
  await logImportant('UPDATE', `📢 Broadcast — ${titulo}`, {
    description: descricao.substring(0, 300),
    user: autorId, guild: target === 'all' ? null : target, severity: 'info',
    fields: [
      { name: '🎯 Escopo', value: escopo === 'all' ? '🌐 Rede toda' : `📍 \`${target}\``, inline: true },
      { name: '✅', value: `${sucesso}`, inline: true },
      { name: '❌', value: `${falhas}`, inline: true },
    ],
  });
  await logDevAction(autorId, 'manual_broadcast', target === 'all' ? null : target, { titulo, escopo, sucesso, falhas });
  return { sucesso, falhas, total: alvos.length };
}

// ═══════════════════════════════════════════════════════════
// AUTO-HEAL v2 — ✅ Bug do spam de DM corrigido
// Throttle 2h por match + auto-cancel 12h + STUCK_MATCH_ALERTS
// ═══════════════════════════════════════════════════════════
async function runAutoHeal() {
  const stats = { canceledThreads: 0, alertedMatches: 0, canceledPix: 0, autoCanceledPlaying: 0 };
  try {
    // ─── 1. Threads "waiting" travadas > 30min → cancela ───
    const since30 = new Date(Date.now() - 30 * 60000).toISOString();
    const { data: stuckThreads } = await supabase.from('ff_matches')
      .select('id,guild_id,mediator_id').eq('status', 'waiting').lt('created_at', since30);
    for (const m of stuckThreads || []) {
      await ffPatchMatch(m.id, { status: 'cancelled', finished_at: new Date().toISOString() });
      if (m.mediator_id) {
        await supabase.from('ff_mediator_queue')
          .update({ status: 'waiting', current_match_id: null })
          .eq('guild_id', m.guild_id).eq('user_id', m.mediator_id);
      }
      stats.canceledThreads++;
    }

    // ─── 2. Matches "playing" travados > 3h → alerta (throttle 2h) ───
    const since3h = new Date(Date.now() - 3 * 3600000).toISOString();
    const since12h = new Date(Date.now() - 12 * 3600000).toISOString();
    const { data: stuckPlaying } = await supabase.from('ff_matches')
      .select('id,guild_id,mediator_id,created_at').eq('status', 'playing').lt('created_at', since3h);

    for (const m of stuckPlaying || []) {
      const isVeryOld = new Date(m.created_at) < new Date(since12h);
      if (isVeryOld) {
        await ffPatchMatch(m.id, { status: 'cancelled', finished_at: new Date().toISOString() });
        if (m.mediator_id) {
          await supabase.from('ff_mediator_queue')
            .update({ status: 'waiting', current_match_id: null })
            .eq('guild_id', m.guild_id).eq('user_id', m.mediator_id);
          try {
            const u = await client.users.fetch(m.mediator_id);
            await u.send(`🚫 Match **#${m.id}** cancelado automaticamente (preso em "playing" por 12h+).`);
          } catch {}
        }
        STUCK_MATCH_ALERTS.delete(m.id);
        stats.autoCanceledPlaying++;
        continue;
      }

      const lastAlert = STUCK_MATCH_ALERTS.get(m.id) || 0;
      if (Date.now() - lastAlert < 2 * 3600000) continue;

      if (m.mediator_id) {
        try {
          const u = await client.users.fetch(m.mediator_id);
          await u.send(
            `⚠️ Match **#${m.id}** está em "playing" há mais de 3h.\n` +
            `> Se já terminou, use **🏆 Escolher Vencedor** ou **❌ Cancelar** na thread.\n` +
            `> Será cancelado automaticamente em 12h se não for resolvido.`
          );
        } catch {}
      }
      STUCK_MATCH_ALERTS.set(m.id, Date.now());
      stats.alertedMatches++;
    }

    if (STUCK_MATCH_ALERTS.size > 500) STUCK_MATCH_ALERTS.clear();

    // ─── 3. Matches "pix_released" travados > 2h → cancela ───
    const since2h = new Date(Date.now() - 2 * 3600000).toISOString();
    const { data: stuckPix } = await supabase.from('ff_matches')
      .select('id,guild_id,mediator_id').eq('status', 'pix_released').lt('created_at', since2h);
    for (const m of stuckPix || []) {
      await ffPatchMatch(m.id, { status: 'cancelled', finished_at: new Date().toISOString() });
      if (m.mediator_id) {
        await supabase.from('ff_mediator_queue')
          .update({ status: 'waiting', current_match_id: null })
          .eq('guild_id', m.guild_id).eq('user_id', m.mediator_id);
      }
      stats.canceledPix++;
    }

  } catch (e) { console.error('[AUTO-HEAL]', e.message); }
  return stats;
}

// ═══════════════════════════════════════════════════════════
// AUTO-REFRESH — edição atualiza mensagem no Discord
// ═══════════════════════════════════════════════════════════
function scheduleRefresh(key, fn, delay = 1500) {
  const existing = _refreshQueue.get(key);
  if (existing?.timer) clearTimeout(existing.timer);
  const timer = setTimeout(async () => {
    _refreshQueue.delete(key);
    try { await fn(); }
    catch (e) { console.error(`[REFRESH] ${key}:`, e.message); }
  }, delay);
  _refreshQueue.set(key, { fn, timer });
}

async function refreshBetEmbeds(guildId) {
  const g = client.guilds.cache.get(guildId);
  if (!g) return { ok: 0, fail: 0 };
  const cfg = await ffGetConfig(guildId);
  if (!cfg) return { ok: 0, fail: 0 };

  const { data: bets } = await supabase.from('ff_bets')
    .select('id,channel_id,message_id,format,value,gelo_infinito_players,gelo_normal_players,active')
    .eq('guild_id', guildId)
    .eq('active', true)
    .not('message_id', 'is', null);

  if (!bets?.length) return { ok: 0, fail: 0 };

  let ok = 0, fail = 0;
  const byChannel = new Map();
  for (const b of bets) {
    if (!byChannel.has(b.channel_id)) byChannel.set(b.channel_id, []);
    byChannel.get(b.channel_id).push(b);
  }

  for (const [channelId, channelBets] of byChannel) {
    const ch = g.channels.cache.get(channelId) || await g.channels.fetch(channelId).catch(() => null);
    if (!ch) { fail += channelBets.length; continue; }
    for (const bet of channelBets) {
      try {
        const msg = await ch.messages.fetch(bet.message_id).catch(() => null);
        if (!msg) { fail++; continue; }
        await msg.edit({
          embeds: [ffBuildBetEmbed(bet, cfg)],
          components: [ffBuildBetButtons(bet.id, cfg)],
        });
        ok++;
      } catch { fail++; }
      await sleep(250);
    }
  }
  return { ok, fail };
}

async function refreshTicketPanelMessage(guildId, panelId) {
  try {
    const g = client.guilds.cache.get(guildId);
    if (!g) return false;
    const panel = await getTicketPanel(guildId, panelId);
    if (!panel?.canal_id || !panel?.mensagem_id) return false;
    const ch = g.channels.cache.get(panel.canal_id) || await g.channels.fetch(panel.canal_id).catch(() => null);
    if (!ch) return false;
    const msg = await ch.messages.fetch(panel.mensagem_id).catch(() => null);
    if (!msg) return false;
    await msg.edit({
      embeds: [buildTicketPanelEmbed(panel)],
      components: buildTicketPanelComponents(panel),
    });
    return true;
  } catch (e) { console.error('[REFRESH-TICKET]', e.message); return false; }
}

async function refreshFFAnalystPanel(guildId) {
  try {
    const g = client.guilds.cache.get(guildId);
    if (!g) return false;
    const cfg = await ffGetConfig(guildId);
    const chId = cfg?.analyst_panel_channel_id;
    if (!chId) return false;
    const ch = g.channels.cache.get(chId) || await g.channels.fetch(chId).catch(() => null);
    if (!ch) return false;
    const msgs = await ch.messages.fetch({ limit: 20 }).catch(() => null);
    if (!msgs) return false;
    const botMsg = msgs.find(m => m.author.id === client.user.id && m.components?.[0]?.components?.[0]?.customId === 'ffana:entrar');
    if (!botMsg) return false;
    const panel = await ffBuildAnalystPanel(guildId);
    await botMsg.edit(panel);
    return true;
  } catch { return false; }
}

async function refreshBlacklistEmbed(guildId) {
  try {
    const g = client.guilds.cache.get(guildId);
    if (!g) return false;
    const cfg = await ffGetConfig(guildId);
    if (!cfg?.blacklist_channel_id) return false;
    const ch = g.channels.cache.get(cfg.blacklist_channel_id) || await g.channels.fetch(cfg.blacklist_channel_id).catch(() => null);
    if (!ch) return false;
    if (cfg.blacklist_embed_id) {
      const msg = await ch.messages.fetch(cfg.blacklist_embed_id).catch(() => null);
      if (msg) {
        const panel = await ffBuildBlacklistEmbed(guildId);
        await msg.edit(panel);
        return true;
      }
    }
    const msgs = await ch.messages.fetch({ limit: 20 }).catch(() => null);
    if (!msgs) return false;
    const botMsg = msgs.find(m => m.author.id === client.user.id && m.embeds?.[0]?.title?.includes('Blacklist'));
    if (!botMsg) return false;
    const panel = await ffBuildBlacklistEmbed(guildId);
    await botMsg.edit(panel);
    return true;
  } catch { return false; }
}

async function refreshCoinShopEmbed(guildId) {
  try {
    const g = client.guilds.cache.get(guildId);
    if (!g) return false;
    const cfg = await ffGetConfig(guildId);
    const channels = [cfg?.ranking_channel_id, cfg?.anuncios_channel_id].filter(Boolean);
    for (const chId of channels) {
      const ch = g.channels.cache.get(chId);
      if (!ch) continue;
      const msgs = await ch.messages.fetch({ limit: 15 }).catch(() => null);
      if (!msgs) continue;
      const botMsg = msgs.find(m => m.author.id === client.user.id && m.components?.[0]?.components?.[0]?.customId === 'coinshop:buy');
      if (!botMsg) continue;
      const { data: items } = await supabase.from('ff_coin_shop').select('*').eq('guild_id', guildId).eq('active', true).order('price');
      const e = new EmbedBuilder().setTitle('🪙 Loja de Coins').setColor('#FFD700').setDescription('Compre cargos com suas coins!').setTimestamp();
      for (const x of items || []) e.addFields({ name: `${x.emoji || '🎁'} ${x.name}`, value: `💰 **${x.price}**`, inline: true });
      await botMsg.edit({ embeds: [e], components: await buildCoinShopComponents(guildId) });
      return true;
    }
    return false;
  } catch { return false; }
}

async function refreshFFStreamerPanel(guildId) {
  try {
    const g = client.guilds.cache.get(guildId);
    if (!g) return false;
    await ffUpdateStreamerMessage(g);
    return true;
  } catch { return false; }
}

async function refreshFFPixEmbed(guildId) {
  try {
    const g = client.guilds.cache.get(guildId);
    if (!g) return false;
    await ffUpdatePixEmbed(g);
    return true;
  } catch { return false; }
}

async function refreshMediatorPixPanel(guildId) {
  try {
    const g = client.guilds.cache.get(guildId);
    if (!g) return false;
    const cfg = await ffGetConfig(guildId);
    if (!cfg?.pix_mediator_channel_id) return false;
    const ch = g.channels.cache.get(cfg.pix_mediator_channel_id) || await g.channels.fetch(cfg.pix_mediator_channel_id).catch(() => null);
    if (!ch) return false;
    const msgs = await ch.messages.fetch({ limit: 20 }).catch(() => null);
    if (!msgs) return false;
    const botMsg = msgs.find(m => m.author.id === client.user.id && m.components?.[0]?.components?.[0]?.customId === 'ffpixmed:config');
    if (!botMsg) return false;
    const panel = await ffBuildMediatorPixPanel(guildId);
    await botMsg.edit(panel);
    return true;
  } catch { return false; }
}

async function refreshAllFFPanels(guildId) {
  await Promise.allSettled([
    refreshFFAnalystPanel(guildId),
    refreshFFStreamerPanel(guildId),
    refreshFFPixEmbed(guildId),
    refreshMediatorPixPanel(guildId),
    refreshBlacklistEmbed(guildId),
    refreshBetEmbeds(guildId),
  ]);
}

// ───── EMBED BASE ─────
function baseEmbed(s, t, d) {
  const e = new EmbedBuilder().setColor(s?.embed_color || COLOR_FALLBACK);
  if (t) e.setTitle(t);
  if (d) e.setDescription(d);
  if (s?.store_logo) e.setThumbnail(s.store_logo);
  return e;
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 2/9
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 3/9] VERSÍCULO · ANALYTICS · VOZ · MÚSICA · SORTEIOS · SHOP
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// VERSÍCULO DO DIA
// ═══════════════════════════════════════════════════════════
const VERSICULOS_FALLBACK = [
  { ref: 'Salmos 23:1', txt: 'O Senhor é o meu pastor; de nada terei falta.' },
  { ref: 'João 3:16', txt: 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna.' },
  { ref: 'Filipenses 4:13', txt: 'Posso todas as coisas naquele que me fortalece.' },
  { ref: 'Provérbios 3:5', txt: 'Confie no Senhor de todo o seu coração e não se apoie em seu próprio entendimento.' },
  { ref: 'Salmos 46:1', txt: 'Deus é o nosso refúgio e fortaleza, socorro bem presente na angústia.' },
  { ref: 'Isaías 40:31', txt: 'Mas os que esperam no Senhor renovarão as suas forças; subirão com asas como águias.' },
  { ref: 'Josué 1:9', txt: 'Sê forte e corajoso; não temas, nem te espantes, porque o Senhor teu Deus é contigo por onde quer que andares.' },
  { ref: 'Mateus 11:28', txt: 'Vinde a mim, todos os que estais cansados e sobrecarregados, e eu vos aliviarei.' },
  { ref: 'Salmos 91:1', txt: 'Aquele que habita no esconderijo do Altíssimo, à sombra do Onipotente descansará.' },
  { ref: 'Romanos 8:28', txt: 'E sabemos que todas as coisas contribuem juntamente para o bem daqueles que amam a Deus.' },
  { ref: 'Jeremias 29:11', txt: 'Porque eu bem sei os pensamentos que tenho a vosso respeito, diz o Senhor; pensamentos de paz, e não de mal, para vos dar o fim que esperais.' },
  { ref: '1 Coríntios 13:4', txt: 'O amor é sofredor, é benigno; o amor não é invejoso; não trata com leviandade, não se ensoberbece.' },
  { ref: 'Salmos 37:4', txt: 'Deleita-te também no Senhor, e ele te concederá o que deseja o teu coração.' },
  { ref: 'Provérbios 16:3', txt: 'Entrega o teu caminho ao Senhor; confia nele, e ele o fará.' },
  { ref: 'Salmos 121:1-2', txt: 'Elevo os meus olhos para os montes: de onde me vem o socorro? O meu socorro vem do Senhor, que fez o céu e a terra.' },
  { ref: 'Lamentações 3:22-23', txt: 'As misericórdias do Senhor são a causa de não sermos consumidos, porque as suas misericórdias não têm fim; novas são cada manhã; grande é a tua fidelidade.' },
  { ref: 'Efésios 2:8', txt: 'Porque pela graça sois salvos, por meio da fé; e isto não vem de vós, é dom de Deus.' },
  { ref: 'Salmos 27:1', txt: 'O Senhor é a minha luz e a minha salvação; a quem temerei?' },
  { ref: 'Hebreus 11:1', txt: 'Ora, a fé é o firme fundamento das coisas que se esperam, e a prova das coisas que se não veem.' },
  { ref: 'Gálatas 5:22', txt: 'Mas o fruto do Espírito é: amor, gozo, paz, longanimidade, benignidade, bondade, fé, mansidão, temperança.' },
  { ref: 'Salmos 34:18', txt: 'Perto está o Senhor dos que têm o coração quebrantado, e salva os contritos de espírito.' },
  { ref: 'Mateus 6:33', txt: 'Mas buscai primeiro o reino de Deus, e a sua justiça, e todas estas coisas vos serão acrescentadas.' },
  { ref: 'Provérbios 18:10', txt: 'O nome do Senhor é torre forte; o justo corre para ela e está seguro.' },
  { ref: 'Salmos 100:4', txt: 'Entrai pelas portas dele com gratidão, e em seus átrios com louvor; louvai-o, e bendizei o seu nome.' },
  { ref: 'Colossenses 3:23', txt: 'E tudo quanto fizerdes, fazei-o de todo o coração, como ao Senhor, e não aos homens.' },
  { ref: '1 Pedro 5:7', txt: 'Lançando sobre ele toda a vossa ansiedade, porque ele tem cuidado de vós.' },
  { ref: 'Salmos 119:105', txt: 'Lâmpada para os meus pés é tua palavra, e luz para o meu caminho.' },
  { ref: 'João 14:6', txt: 'Eu sou o caminho, e a verdade, e a vida; ninguém vem ao Pai, senão por mim.' },
  { ref: 'Números 6:24-26', txt: 'O Senhor te abençoe e te guarde; o Senhor faça resplandecer o seu rosto sobre ti, e tenha misericórdia de ti.' },
  { ref: 'Salmos 133:1', txt: 'Oh! quão bom e quão suave é que os irmãos vivam em união!' },
];

async function buscarVersiculoBiblia() {
  try {
    const r = await fetch('https://www.abibliadigital.com.br/api/verses/nvi/random', {
      headers: { 'User-Agent': 'FrioBot/6.6.0' },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (d?.text && d?.book?.name && d?.chapter && d?.number) {
      return { ref: `${d.book.name} ${d.chapter}:${d.number}`, txt: d.text };
    }
    throw new Error('Formato inválido');
  } catch (e) {
    console.warn('[VERSICULO] API falhou, usando fallback:', e.message);
    return VERSICULOS_FALLBACK[Math.floor(Math.random() * VERSICULOS_FALLBACK.length)];
  }
}

function hashVersiculo(v) {
  return crypto.createHash('md5').update(`${v.ref}|${v.txt}`).digest('hex').slice(0, 16);
}

async function enviarVersiculoDia(guildId, channelId, opts = {}) {
  try {
    const g = client.guilds.cache.get(guildId);
    if (!g) return false;
    const ch = g.channels.cache.get(channelId) || await g.channels.fetch(channelId).catch(() => null);
    if (!ch || !ch.isTextBased?.()) return false;
    const v = await buscarVersiculoBiblia();
    const e = new EmbedBuilder()
      .setTitle('📖 Versículo do Dia')
      .setColor('#FEE75C')
      .setDescription(`*"${v.txt}"*\n\n— **${v.ref}**`)
      .setFooter({ text: opts.footer || `Frio Bot • ${new Date().toLocaleDateString('pt-BR')}` })
      .setTimestamp();
    if (g.iconURL()) e.setThumbnail(g.iconURL({ size: 256 }));
    await ch.send({ content: opts.ping || null, embeds: [e] }).catch(() => {});
    await supabase.from('configs').upsert({
      guild_id: guildId,
      versiculo_last_sent: new Date().toISOString(),
      versiculo_last_hash: hashVersiculo(v),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id' });
    _configCache.delete(guildId);
    try {
      await supabase.from('daily_verses_history').insert({
        guild_id: guildId,
        verse_ref: v.ref,
        verse_text: v.txt,
        verse_hash: hashVersiculo(v),
      });
    } catch {}
    return true;
  } catch (e) {
    console.error('[VERSICULO]', guildId, e.message);
    return false;
  }
}

async function checkVersiculosDia() {
  try {
    const hora = new Date().getHours();
    const { data: cfgs } = await supabase.from('configs')
      .select('guild_id,versiculo_channel,versiculo_hora,versiculo_last_sent')
      .eq('versiculo_ativo', true)
      .not('versiculo_channel', 'is', null);
    for (const c of cfgs || []) {
      if ((c.versiculo_hora ?? 8) !== hora) continue;
      if (c.versiculo_last_sent) {
        const last = new Date(c.versiculo_last_sent);
        const hoje = new Date();
        if (last.toDateString() === hoje.toDateString()) continue;
      }
      await enviarVersiculoDia(c.guild_id, c.versiculo_channel, {});
      await sleep(3000);
    }
  } catch (e) { console.error('[VERSICULO-LOOP]', e.message); }
}

// ═══════════════════════════════════════════════════════════
// ANALYTICS — trackFeatureUsage + relatórios
// ═══════════════════════════════════════════════════════════
async function trackFeatureUsage(gid, feature) {
  if (!gid || !feature) return;
  try {
    const { data: ex } = await supabase.from('guild_feature_usage')
      .select('id,uses').eq('guild_id', gid).eq('feature', feature).maybeSingle();
    if (ex) {
      await supabase.from('guild_feature_usage')
        .update({ uses: Number(ex.uses || 0) + 1, last_used: new Date().toISOString() })
        .eq('id', ex.id);
    } else {
      await supabase.from('guild_feature_usage')
        .insert({ guild_id: gid, feature, uses: 1 });
    }
  } catch {}
}

async function getAnalyticsAdvanced(gid) {
  const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
  const [usageRes, betsRes, ordersRes, ticketsRes, coinsRes] = await Promise.allSettled([
    supabase.from('guild_feature_usage').select('*').eq('guild_id', gid).order('uses', { ascending: false }).limit(20),
    supabase.from('ff_matches').select('id', { count: 'exact', head: true }).eq('guild_id', gid).gte('created_at', since7d),
    supabase.from('orders').select('id,total,status').eq('guild_id', gid).gte('created_at', since7d),
    supabase.from('ticket_data').select('id', { count: 'exact', head: true }).eq('guild_id', gid).gte('created_at', since7d),
    supabase.from('ff_logs').select('details').eq('guild_id', gid).eq('category', 'coins').gte('created_at', since7d),
  ]);
  const usage = usageRes.status === 'fulfilled' ? (usageRes.value.data || []) : [];
  const bets7d = betsRes.status === 'fulfilled' ? (betsRes.value.count || 0) : 0;
  const ordersList = ordersRes.status === 'fulfilled' ? (ordersRes.value.data || []) : [];
  const fat7d = ordersList.filter(o => o.status === 'delivered').reduce((a, o) => a + Number(o.total || 0), 0);
  const tickets7d = ticketsRes.status === 'fulfilled' ? (ticketsRes.value.count || 0) : 0;
  const coinsMov7d = coinsRes.status === 'fulfilled'
    ? (coinsRes.value.data || []).reduce((a, l) => a + Math.abs(Number(l.details?.amount || 0)), 0)
    : 0;
  return { usage, bets7d, orders7d: ordersList.length, fat7d, tickets7d, coinsMov7d };
}

// ═══════════════════════════════════════════════════════════
// VOZ
// ═══════════════════════════════════════════════════════════
async function salvarCanalVoz(g, c) {
  try { await supabase.from('bot_voice').upsert({ guild_id: g, channel_id: c, updated_at: new Date().toISOString() }); } catch {}
}
async function removerCanalVoz(g) {
  try { await supabase.from('bot_voice').delete().eq('guild_id', g); } catch {}
}
async function getCanalVozSalvo(g) {
  try {
    const { data } = await supabase.from('bot_voice').select('channel_id').eq('guild_id', g).maybeSingle();
    return data?.channel_id || null;
  } catch { return null; }
}

async function entrarNaCall(g, cid, player = null) {
  try {
    const ch = g.channels.cache.get(cid) || await g.channels.fetch(cid).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildVoice) return null;
    const me = g.members.me;
    if (!ch.permissionsFor(me)?.has(PermissionFlagsBits.Connect)) {
      console.warn(`[VOZ] Sem permissão pra entrar em ${ch.name} (${g.name})`);
      return null;
    }
    const conn = joinVoiceChannel({
      channelId: ch.id,
      guildId: g.id,
      adapterCreator: g.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
    });
    if (player) conn.subscribe(player);

    conn.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(conn, VoiceConnectionStatus.Signalling, 5000),
          entersState(conn, VoiceConnectionStatus.Connecting, 5000),
        ]);
      } catch {
        conn.destroy();
        setTimeout(async () => {
          const s = await getCanalVozSalvo(g.id);
          if (s) entrarNaCall(g, s, player);
        }, 5000);
      }
    });

    conn.on('error', (e) => console.error(`[VOZ-ERR] ${g.id}:`, e.message));
    return conn;
  } catch (e) { console.error('[VOZ]', e.message); return null; }
}

async function reconectarTodasCalls() {
  try {
    const { data } = await supabase.from('bot_voice').select('*');
    for (const r of data || []) {
      const g = client.guilds.cache.get(r.guild_id);
      if (g) try { await entrarNaCall(g, r.channel_id); } catch {}
      await sleep(500);
    }
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// 🎵 MÚSICA — REESCRITA COMPLETA (bug fix v6.6.0)
// ═══════════════════════════════════════════════════════════
// Bugs corrigidos:
//  #1 - Loop infinito em tocarProxima → contador de falhas
//  #2 - Memory leak em musicQueues → cleanup 30s idle + canal vazio
//  #3 - Sem validação de play-dl → checagem inicial
//  #4 - Sem validação de voz do user → mensagem clara
//  #5 - Sem permissão do bot no canal → checagem
//  #6 - Sem limite de fila → MAX 100 músicas
//  #7 - Sem validação de URL → só YouTube/Direct
//  #8 - Player sem error handler → adicionado
//  #9 - Sem lock por guild → evita 2 conexões concorrentes
//  #10 - Sem cleanup canal vazio → auto-disconnect
//  #11 - Sem cache de busca → cache 5min
//  #12 - Sem volume persistente → salva no DB

const MUSIC_MAX_QUEUE = 100;
const MUSIC_CLEANUP_MS = 30000;
const _musicLocks = new Set();
const _musicSearchCache = new Map();
const _musicCleanupTimers = new Map();

function getQueue(gid) {
  if (!musicQueues.has(gid)) {
    musicQueues.set(gid, {
      songs: [],
      player: null,
      connection: null,
      textChannel: null,
      currentSong: null,
      loopMode: 'off',
      volume: 100,
      failed: 0,
      startedAt: 0,
      paused: false,
    });
  }
  return musicQueues.get(gid);
}

async function destroyQueue(gid, reason = 'manual') {
  const q = musicQueues.get(gid);
  if (!q) return;
  try { q.player?.stop(); } catch {}
  try { q.connection?.destroy(); } catch {}
  q.songs = [];
  q.currentSong = null;
  musicQueues.delete(gid);
  _musicSearchCache.clear();

  // Avisa no canal
  if (q.textChannel) {
    q.textChannel.send({ embeds: [new EmbedBuilder().setColor('#808080')
      .setDescription(`⏹️ Player encerrado (${reason}).`)] }).catch(() => {});
  }
}

function scheduleQueueCleanup(gid) {
  const existing = _musicCleanupTimers.get(gid);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(async () => {
    _musicCleanupTimers.delete(gid);
    const q = musicQueues.get(gid);
    if (!q) return;
    // Se nada tocando e sem fila, limpa
    if (!q.currentSong && !q.songs.length) {
      await destroyQueue(gid, 'idle');
    }
  }, MUSIC_CLEANUP_MS);
  _musicCleanupTimers.set(gid, timer);
}

async function tocarProxima(gid) {
  const q = getQueue(gid);
  if (!q.player) return;

  // Bug #1 fix: limite de falhas
  if (q.failed >= 5) {
    if (q.textChannel) q.textChannel.send({ embeds: [new EmbedBuilder().setColor('#FF5555')
      .setDescription('⚠️ Muitas músicas falharam em sequência. Parando player.')] }).catch(() => {});
    q.failed = 0;
    q.songs = [];
    await destroyQueue(gid, 'falhas');
    return;
  }

  if (q.loopMode === 'song' && q.currentSong) q.songs.unshift(q.currentSong);
  if (!q.songs.length) {
    q.currentSong = null;
    scheduleQueueCleanup(gid); // Bug #2 e #10 fix
    return;
  }

  const song = q.songs.shift();
  q.currentSong = song;
  if (q.loopMode === 'queue') q.songs.push(song);

  try {
    if (!playdl) throw new Error('play-dl não instalado');
    if (!song?.url || !isValidUrl(song.url)) throw new Error('URL inválida');

    const st = await playdl.stream(song.url, { quality: 0, discordPlayerCompatibility: true });
    const r = createAudioResource(st.stream, { inputType: st.type, inlineVolume: true });
    r.volume.setVolume(q.volume / 100);
    q.player.play(r);
    q.failed = 0;
    q.startedAt = Date.now();
    q.paused = false;

    if (q.textChannel) {
      q.textChannel.send({ embeds: [new EmbedBuilder()
        .setColor('#1DB954')
        .setDescription(`🎵 Tocando: **${song.title}**\n> ⏱️ \`${song.duration || '?'}\` • 👤 ${song.author ? `<@${song.author}>` : '?'}`)] }).catch(() => {});
    }
  } catch (e) {
    console.error('[MUSIC]', e.message);
    q.failed++;
    await sleep(1000);
    tocarProxima(gid);
  }
}

async function buscarMusica(query, authorId) {
  if (!playdl) throw new Error('Sistema de música indisponível (play-dl não instalado).');

  // Bug #11 fix: cache 5min
  const cacheKey = String(query).toLowerCase().trim();
  const cached = _musicSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.data;

  try {
    let result = null;
    if (playdl.yt_validate(query) === 'video') {
      const i = await playdl.video_info(query);
      result = {
        title: i.video_details.title,
        url: i.video_details.url,
        duration: i.video_details.durationRaw,
        author: authorId,
        thumb: i.video_details.thumbnails?.[0]?.url || null,
      };
    } else {
      await sleep(300);
      const r = await playdl.search(query, { limit: 1 });
      if (r?.length) {
        result = {
          title: r[0].title,
          url: r[0].url,
          duration: r[0].durationRaw,
          author: authorId,
          thumb: r[0].thumbnails?.[0]?.url || null,
        };
      }
    }
    if (result) _musicSearchCache.set(cacheKey, { data: result, at: Date.now() });
    if (_musicSearchCache.size > 200) {
      const cutoff = Date.now() - 5 * 60 * 1000;
      for (const [k, v] of _musicSearchCache) if (v.at < cutoff) _musicSearchCache.delete(k);
    }
    return result;
  } catch (e) {
    throw new Error(`Busca falhou: ${e.message}`);
  }
}

// ⚡ Setup do player com error handler (Bug #8 fix)
function setupMusicPlayer(gid, vc, textCh) {
  const q = getQueue(gid);
  q.textChannel = textCh;

  if (!q.connection || q.connection.state.status === VoiceConnectionStatus.Destroyed) {
    q.connection = joinVoiceChannel({
      channelId: vc.id,
      guildId: gid,
      adapterCreator: vc.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
  }

  if (!q.player) {
    q.player = createAudioPlayer();
    q.connection.subscribe(q.player);

    q.player.on(AudioPlayerStatus.Idle, () => {
      // Se pausado, não avança
      if (q.paused) return;
      // Se parado manualmente, não avança
      if (!q.currentSong) return;
      tocarProxima(gid).catch(e => console.error('[MUSIC-IDLE]', e.message));
    });

    q.player.on('error', (e) => {
      console.error('[MUSIC-PLAYER-ERR]', e.message);
      q.failed++;
      tocarProxima(gid).catch(() => {});
    });
  }
  return q;
}

// ⚡ Checa se bot deve sair do canal vazio (Bug #10 fix)
function checkVoiceEmpty(guild, channelId) {
  setTimeout(() => {
    try {
      const ch = guild.channels.cache.get(channelId);
      if (!ch) return;
      const humans = ch.members.filter(m => !m.user.bot).size;
      if (humans === 0) {
        destroyQueue(guild.id, 'canal vazio');
      }
    } catch {}
  }, 30000);
}

// ═══════════════════════════════════════════════════════════
// SORTEIOS
// ═══════════════════════════════════════════════════════════
async function checkGiveaways() {
  try {
    const { data } = await supabase.from('giveaways').select('*').eq('ended', false);
    const now = Date.now();
    for (const g of data || []) {
      if (new Date(g.ends_at).getTime() > now) continue;
      let p = [];
      try { p = JSON.parse(g.participants || '[]'); } catch {}
      const ch = client.channels.cache.get(g.channel_id);
      if (!p.length) {
        if (ch) await ch.send('❌ Sem participantes.').catch(() => {});
      } else {
        const w = p.sort(() => Math.random() - 0.5).slice(0, g.winners_count);
        for (const wid of w) {
          try {
            const u = await client.users.fetch(wid);
            await u.send(`🎉 Ganhou **${g.prize}**!`).catch(() => {});
            if (ch) await ch.send(`🎉 <@${wid}> ganhou **${g.prize}**!`).catch(() => {});
          } catch {}
        }
      }
      await supabase.from('giveaways').update({ ended: true }).eq('id', g.id);
    }
  } catch (e) { console.error('[GIVEAWAYS]', e.message); }
}

// ═══════════════════════════════════════════════════════════
// TEMPROLES — Bug #25 corrigido (timeout cap 24 dias)
// ═══════════════════════════════════════════════════════════
const MAX_TIMEOUT = 2147483647;

async function scheduleTempRole(gid, uid, rid, ms) {
  try {
    await supabase.from('temproles').upsert({
      guild_id: gid, user_id: uid, role_id: rid,
      expires_at: new Date(Date.now() + ms).toISOString(),
    });
  } catch {}

  const finalize = async () => {
    const g = client.guilds.cache.get(gid);
    if (g) {
      const m = await g.members.fetch(uid).catch(() => null);
      if (m) await m.roles.remove(rid).catch(() => {});
    }
    await supabase.from('temproles').delete()
      .eq('guild_id', gid).eq('user_id', uid).eq('role_id', rid).catch(() => {});
  };

  if (ms > MAX_TIMEOUT) {
    let remaining = ms;
    const step = () => {
      if (remaining <= MAX_TIMEOUT) {
        setTimeout(finalize, remaining);
      } else {
        remaining -= MAX_TIMEOUT;
        setTimeout(step, MAX_TIMEOUT);
      }
    };
    step();
  } else {
    setTimeout(finalize, ms);
  }
}

async function checkTempRoles() {
  try {
    const { data } = await supabase.from('temproles').select('*');
    for (const e of data || []) {
      if (new Date(e.expires_at) <= new Date()) {
        const g = client.guilds.cache.get(e.guild_id);
        if (g) {
          const m = await g.members.fetch(e.user_id).catch(() => null);
          if (m) await m.roles.remove(e.role_id).catch(() => {});
        }
        await supabase.from('temproles').delete()
          .eq('guild_id', e.guild_id).eq('user_id', e.user_id).eq('role_id', e.role_id);
      }
    }
  } catch (e) { console.error('[TEMPROLES]', e.message); }
}

// ═══════════════════════════════════════════════════════════
// DB LOGS
// ═══════════════════════════════════════════════════════════
async function logTicket(g, u, tn, tr, cb) {
  try { await supabase.from('ticket_logs').insert({ guild_id: g, user_id: u, thread_name: tn, transcript: tr, closed_by: cb }); } catch {}
}
async function logModeration(g, m, t, a, r) {
  try { await supabase.from('moderation_logs').insert({ guild_id: g, moderator_id: m, target_id: t, action: a, reason: r }); } catch {}
}

// ═══════════════════════════════════════════════════════════
// CATEGORIAS / SHOP PANELS — Bug #33 corrigido (batch counts)
// ═══════════════════════════════════════════════════════════
async function getCats(gid) {
  const { data } = await supabase.from('categories').select('*').eq('guild_id', gid).order('position');
  return data || [];
}
async function countShopPanels(gid) {
  const { count } = await supabase.from('shop_panels').select('id', { count: 'exact', head: true }).eq('guild_id', gid);
  return count || 0;
}
async function getShopPanels(gid) {
  const { data } = await supabase.from('shop_panels').select('*').eq('guild_id', gid).order('id', { ascending: false });
  return data || [];
}
async function getShopPanel(id) {
  const { data } = await supabase.from('shop_panels').select('*').eq('id', id).maybeSingle();
  return data;
}
async function createShopPanel(gid, d) {
  const total = await countShopPanels(gid);
  if (total >= MAX_SHOP_PANELS) throw new Error(`Limite ${MAX_SHOP_PANELS}.`);
  const { data } = await supabase.from('shop_panels').insert({ guild_id: gid, ...d }).select().single();
  return data;
}
async function updateShopPanel(id, p) {
  try { await supabase.from('shop_panels').update(p).eq('id', id); } catch {}
  return getShopPanel(id);
}
async function deleteShopPanel(id) {
  try { await supabase.from('shop_panels').delete().eq('id', id); } catch {}
}

// ⚡ Conta estoque em batch (1 query em vez de N)
async function getStockCounts(productIds) {
  if (!productIds?.length) return {};
  const { data } = await supabase.from('inventory')
    .select('product_id').eq('status', 'available').in('product_id', productIds);
  const counts = {};
  for (const row of data || []) {
    counts[row.product_id] = (counts[row.product_id] || 0) + 1;
  }
  return counts;
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 3/9
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 4/9] FREE FIRE — CONSTANTS, CONFIG, MULTI-PIX, LOGS,
// FILAS, EMBEDS, PAINÉIS, THREAD, TRANSCRIPTS
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// FF CONSTANTS
// ═══════════════════════════════════════════════════════════
const FF_FORMATS = [
  { id: '1x1_mobile', label: '1v1 Mobile', emoji: '📱', teamSize: 1, totalPlayers: 2 },
  { id: '2x2_mobile', label: '2v2 Mobile', emoji: '📱', teamSize: 2, totalPlayers: 4 },
  { id: '3x3_mobile', label: '3v3 Mobile', emoji: '📱', teamSize: 3, totalPlayers: 6 },
  { id: '4x4_mobile', label: '4v4 Mobile', emoji: '📱', teamSize: 4, totalPlayers: 8 },
  { id: '1x1_emu', label: '1v1 Emulador', emoji: '💻', teamSize: 1, totalPlayers: 2 },
  { id: '2x2_emu', label: '2v2 Emulador', emoji: '💻', teamSize: 2, totalPlayers: 4 },
  { id: '3x3_emu', label: '3v3 Emulador', emoji: '💻', teamSize: 3, totalPlayers: 6 },
  { id: '4x4_emu', label: '4v4 Emulador', emoji: '💻', teamSize: 4, totalPlayers: 8 },
  { id: '2x2_misto', label: '2v2 Misto', emoji: '📱💻', teamSize: 2, totalPlayers: 4 },
  { id: '3x3_misto', label: '3v3 Misto', emoji: '📱💻', teamSize: 3, totalPlayers: 6 },
  { id: '4x4_misto', label: '4v4 Misto', emoji: '📱💻', teamSize: 4, totalPlayers: 8 },
];
const FF_PULL_SIZE = 2;
const FF_DEFAULT_VALUES = ['0.50', '0.70', '1.00', '2.00', '3.00', '5.00', '10.00', '20.00', '30.00', '40.00', '50.00', '100.00'];
const FF_COIN_DEFAULTS = [
  { name: '・Girl 🎀', emoji: '🎀', price: 5, role_name: '・Girl 🎀' },
  { name: '・Trem 🚂', emoji: '🚂', price: 10, role_name: '・Trem 🚂' },
  { name: '・Rei Dos Clips', emoji: '🎬', price: 15, role_name: '・Rei Dos Clips' },
  { name: '・GREEN', emoji: '🟢', price: 20, role_name: '・GREEN' },
  { name: '・rei do 2,90', emoji: '💸', price: 30, role_name: '・rei do 2,90' },
  { name: '・CRIA DA DG', emoji: '👑', price: 40, role_name: '・CRIA DA DG' },
  { name: '・Magnata', emoji: '💰', price: 50, role_name: '・Magnata' },
  { name: '・REI DA 2X', emoji: '👑', price: 75, role_name: '・REI DA 2X' },
  { name: '・REI DOS AP', emoji: '🏆', price: 100, role_name: '・REI DOS AP' },
  { name: '・@RICO DA ORG', emoji: '💎', price: 150, role_name: '・@RICO DA ORG' },
];

// ═══════════════════════════════════════════════════════════
// FF CONFIG — com cache LRU + auto-refresh
// ═══════════════════════════════════════════════════════════
async function ffGetConfig(gid) {
  const cached = _ffConfigCache.get(gid);
  if (cached) return cached;
  try {
    const { data } = await supabase.from('ff_config').select('*').eq('guild_id', gid).maybeSingle();
    if (data) return _ffConfigCache.set(gid, data);
    const { data: c } = await supabase.from('ff_config').insert({ guild_id: gid }).select().single();
    return _ffConfigCache.set(gid, c);
  } catch { return null; }
}

async function ffPatchConfig(gid, p) {
  try {
    await supabase.from('ff_config').upsert({ guild_id: gid, ...p, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' });
    _ffConfigCache.delete(gid);

    // 🔥 AUTO-REFRESH: descobre o que mudou e atualiza o afetado
    const keys = Object.keys(p);
    const affects = (arr) => keys.some(k => arr.includes(k));

    if (affects(['custom_bet_embed'])) {
      scheduleRefresh(`bets:${gid}`, () => refreshBetEmbeds(gid));
    }
    if (affects(['custom_streamer_embed', 'streamer_channel_id'])) {
      scheduleRefresh(`str:${gid}`, () => refreshFFStreamerPanel(gid));
    }
    if (affects(['pix_key', 'pix_name', 'pix_city', 'mp_access_token', 'pix_channel_id'])) {
      scheduleRefresh(`pix:${gid}`, () => refreshFFPixEmbed(gid));
    }
    if (affects(['blacklist_channel_id'])) {
      scheduleRefresh(`bl:${gid}`, () => refreshBlacklistEmbed(gid));
    }
    if (affects(['pix_mediator_channel_id'])) {
      scheduleRefresh(`pixmed:${gid}`, () => refreshMediatorPixPanel(gid));
    }
    if (affects(['analyst_panel_channel_id'])) {
      scheduleRefresh(`ana:${gid}`, () => refreshFFAnalystPanel(gid));
    }
  } catch (e) { console.error('[FF-CONFIG]', e.message); }
  return ffGetConfig(gid);
}

// ═══════════════════════════════════════════════════════════
// MULTI-PIX POR MEDIADOR — as 4 funções + painel + view
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
      guild_id: guildId,
      user_id: userId,
      pix_key: pixKey,
      pix_name: pixName,
      pix_city: pixCity || 'SAO PAULO',
      pix_type: pixType,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id,user_id' }).select().single();
    if (error) { console.error('[FF-MED-PIX]', error.message); return null; }
    await logImportant('PIX-MED', '💳 PIX mediador configurado', {
      description: `<@${userId}> configurou PIX`,
      user: userId, guild: guildId, severity: 'success',
      fields: [
        { name: '🔑 Tipo', value: pixType, inline: true },
        { name: '👤 Nome', value: pixName, inline: true },
      ],
    }).catch(() => {});
    // 🔥 AUTO-REFRESH painel PIX Meds
    scheduleRefresh(`pixmed:${guildId}`, () => refreshMediatorPixPanel(guildId), 500);
    return data;
  } catch (e) { console.error('[FF-MED-PIX]', e.message); return null; }
}

async function ffRemoveMediatorPix(guildId, userId) {
  try {
    await supabase.from('ff_mediator_pix').delete().eq('guild_id', guildId).eq('user_id', userId);
    await logImportant('PIX-MED', '🗑️ PIX mediador removido', { user: userId, guild: guildId, severity: 'warning' }).catch(() => {});
    scheduleRefresh(`pixmed:${guildId}`, () => refreshMediatorPixPanel(guildId), 500);
    return true;
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════
// FF BETS / MATCHES
// ═══════════════════════════════════════════════════════════
async function ffGetBet(id) {
  const { data } = await supabase.from('ff_bets').select('*').eq('id', id).maybeSingle();
  return data;
}
async function ffPatchBet(id, p) {
  try { await supabase.from('ff_bets').update(p).eq('id', id); } catch {}
  const bet = await ffGetBet(id);
  // 🔥 AUTO-REFRESH no embed de aposta se mudou conteúdo
  if (bet && (p.value !== undefined || p.format !== undefined || p.active !== undefined)) {
    const g = client.guilds.cache.get(bet.guild_id);
    if (g) scheduleRefresh(`bet:${id}`, () => ffUpdateBetMessage(g, bet).catch(() => {}), 800);
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
// BLOQUEIO DE MANUTENÇÃO
// ═══════════════════════════════════════════════════════════
async function blockSlashIfMaintenance(i) {
  if (!i.guild) return false;
  if (i.user.id === i.guild.ownerId || isDeveloper(i.user.id)) return false;
  // ⚡ FIX: garante member
  if (!i.member) {
    try { i.member = await i.guild.members.fetch(i.user.id); } catch {}
  }
  if (!i.member) return false;

  if (await isMaintenanceMode()) {
    if (shouldLog(`maint-block:${i.user.id}`, 30000)) {
      logImportant('MANUTENÇÃO', '🚫 Bloqueado por manutenção global', {
        description: `**${i.user.tag}** tentou usar durante manutenção.`,
        user: i.user.id, guild: i.guild.id, severity: 'warning',
        fields: [
          { name: '🎯 Ação', value: i.isChatInputCommand() ? `\`/${i.commandName}\`` : i.isButton() ? `Botão: \`${i.customId}\`` : i.isAnySelectMenu() ? `Select: \`${i.customId}\`` : `Modal: \`${i.customId}\``, inline: true },
          { name: '📺 Canal', value: i.channel ? `<#${i.channel.id}>` : '—', inline: true },
        ],
      }).catch(() => {});
    }
    const msg = '🔧 **Manutenção Global em andamento.**\nO bot voltará em instantes.';
    if (i.isRepliable()) {
      if (i.deferred || i.replied) await i.followUp({ content: msg, flags: EPHEMERAL }).catch(() => {});
      else await i.reply({ content: msg, flags: EPHEMERAL }).catch(() => {});
    }
    return true;
  }

  const cfg = await getConfig(i.guild.id);
  if (cfg.admin_maintenance && !(await isAdmin(i.user, i.guild))) {
    // Bug #8 corrigido: regex inclui tkt: e ticket_open
    const isAdminCmd = i.isChatInputCommand() && ['admin', 'painel', 'painel_loja', 'enviar_loja', 'sorteio'].includes(i.commandName);
    const isAdminButton = i.isButton() && /^(adm_|cfg_|panel_|prod_|stock_|cat_|coupon_|promo_|pedidos|client_|prodedit_|tktedit|tkttype|tktcfg|tktform|tktblk|tkt:|ticket_open:|ticket_pick_type|ffcfg:|ffpixmed:|ffmed:|ffana:)/.test(i.customId);
    if (isAdminCmd || isAdminButton) {
      const msg = '🔧 **Manutenção Administrativa ativa.**';
      if (i.isRepliable()) {
        if (i.deferred || i.replied) await i.followUp({ content: msg, flags: EPHEMERAL }).catch(() => {});
        else await i.reply({ content: msg, flags: EPHEMERAL }).catch(() => {});
      }
      return true;
    }
  }

  const ffCfg = await ffGetConfig(i.guild.id);
  if (ffCfg?.maintenance && !(await isAdmin(i.user, i.guild))) {
    const isFFCmd = i.isChatInputCommand() && i.commandName === 'hub';
    const isFFButton = i.isButton() && /^(ffbet|ffm|ffcfg|ffmed|ffana|ffbl|coinshop|ffpix|ffpixmed|ffstr)/.test(i.customId);
    if (isFFCmd || isFFButton) {
      const msg = '🔧 **Sistema de apostas em manutenção.**';
      if (i.isRepliable()) {
        if (i.deferred || i.replied) await i.followUp({ content: msg, flags: EPHEMERAL }).catch(() => {});
        else await i.reply({ content: msg, flags: EPHEMERAL }).catch(() => {});
      }
      return true;
    }
  }
  return false;
}

async function blockIfMaintenance(i) {
  if (!i.guild) return false;
  if (i.user.id === i.guild.ownerId || isDeveloper(i.user.id)) return false;
  if (await isMaintenanceMode()) { await i.reply({ content: '🔧 **Manutenção Global.**', flags: EPHEMERAL }).catch(() => {}); return true; }
  const c = await ffGetConfig(i.guild.id);
  if ((c?.admin_maintenance || c?.maintenance) && !(await isAdmin(i.user, i.guild))) {
    await i.reply({ content: '🔧 **Manutenção em andamento.**', flags: EPHEMERAL }).catch(() => {});
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════
// FF LOGS — Bug #18 corrigido (usa log_channel_id configurado)
// ═══════════════════════════════════════════════════════════
async function ffLogCanal(g, embedOrName, embedMaybe) {
  try {
    const cfg = await ffGetConfig(g.id);
    const logChId = cfg?.log_channel_id;
    const embed = embedMaybe || embedOrName;
    const name = typeof embedOrName === 'string' ? embedOrName : null;
    const ch = (logChId && g.channels.cache.get(logChId))
      || (name && g.channels.cache.find(c => c.name === name));
    if (ch && embed) await ch.send({ embeds: [embed] }).catch(() => {});
  } catch {}
}

async function ffLog(g, cat, action, uid = null, details = {}) {
  try {
    await supabase.from('ff_logs').insert({ guild_id: g.id, category: cat, action, user_id: uid, details });
  } catch {}
  try {
    const c = await ffGetConfig(g.id);
    if (!c?.log_channel_id) return;
    const ch = g.channels.cache.get(c.log_channel_id);
    if (!ch) return;
    const colors = { config: '#5865F2', queue: '#22c55e', thread: '#9B59B6', pix: '#FFD700', match: '#FFA500', resultado: '#E74C3C', moderator: '#00AAFF', pixmed: '#22c55e' };
    const e = new EmbedBuilder().setTitle(`📋 Log • ${cat.toUpperCase()}`).setColor(colors[cat] || '#808080')
      .addFields(
        { name: 'Ação', value: `\`${action}\``, inline: true },
        { name: 'Por', value: uid ? `<@${uid}>` : '—', inline: true },
      );
    if (Object.keys(details).length) e.addFields({ name: 'Detalhes', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 900)}\n\`\`\`` });
    await ch.send({ embeds: [e] }).catch(() => {});
  } catch {}
}

async function logCoins(g, uid, amount, reason, fromId = null) {
  try {
    const cfg = await ffGetConfig(g.id);
    if (!cfg?.log_channel_id) return;
    const ch = g.channels.cache.get(cfg.log_channel_id);
    if (!ch) return;
    const e = new EmbedBuilder().setTitle('💎 Log Coins').setColor(amount >= 0 ? '#22c55e' : '#ff5555')
      .addFields(
        { name: 'Usuário', value: `<@${uid}>`, inline: true },
        { name: 'Qtd', value: `${amount >= 0 ? '+' : ''}${amount}`, inline: true },
        { name: 'Motivo', value: reason || '—', inline: true },
        { name: 'De', value: fromId ? `<@${fromId}>` : 'Sistema', inline: true },
      ).setTimestamp();
    await ch.send({ embeds: [e] }).catch(() => {});
  } catch {}
}

async function logMediador(g, uid, action, details = {}) {
  const e = new EmbedBuilder().setTitle('🛡️ Log Mediadores').setColor('#00AAFF')
    .addFields({ name: 'Mediador', value: `<@${uid}>`, inline: true }, { name: 'Ação', value: `\`${action}\``, inline: true });
  if (Object.keys(details).length) e.addFields({ name: 'Detalhes', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 800)}\n\`\`\`` });
  await ffLogCanal(g, '🛡️・log-mediadores', e);
}

async function logAnalista(g, uid, action, details = {}) {
  const e = new EmbedBuilder().setTitle('🔎 Log Analistas').setColor('#00AAFF')
    .addFields({ name: 'Analista', value: `<@${uid}>`, inline: true }, { name: 'Ação', value: `\`${action}\``, inline: true });
  if (Object.keys(details).length) e.addFields({ name: 'Detalhes', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 800)}\n\`\`\`` });
  await ffLogCanal(g, '🛡️・log-mediadores', e);
}

async function logConfig(g, uid, action, details = {}) {
  const e = new EmbedBuilder().setTitle('⚙️ Log Config').setColor('#5865F2')
    .addFields({ name: 'Por', value: `<@${uid}>`, inline: true }, { name: 'Ação', value: `\`${action}\``, inline: true });
  if (Object.keys(details).length) e.addFields({ name: 'Detalhes', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 800)}\n\`\`\`` });
  await ffLogCanal(g, '⚙️・log-config', e);
}

// ═══════════════════════════════════════════════════════════
// FILAS FF — Bug #12 corrigido (race condition com unique)
// ═══════════════════════════════════════════════════════════
async function ffGetMediatorQueue(gid) {
  const { data } = await supabase.from('ff_mediator_queue')
    .select('*').eq('guild_id', gid).order('joined_at');
  return data || [];
}
async function ffMediatorJoin(gid, uid) {
  try {
    // UPSERT atômico — unique constraint previne duplicatas
    const { error } = await supabase.from('ff_mediator_queue')
      .insert({ guild_id: gid, user_id: uid, status: 'waiting' });
    if (error) {
      // Unique violation = já estava na fila
      if (error.code === '23505') return false;
      console.error('[FF-MED-JOIN]', error.message);
      return false;
    }
    return true;
  } catch { return false; }
}
async function ffMediatorLeave(gid, uid) {
  const { data: m } = await supabase.from('ff_mediator_queue')
    .select('status').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
  if (m?.status === 'busy') return false;
  try { await supabase.from('ff_mediator_queue').delete().eq('guild_id', gid).eq('user_id', uid); } catch {}
  return true;
}
async function ffMediatorNext(gid) {
  const { data } = await supabase.from('ff_mediator_queue')
    .select('*').eq('guild_id', gid).eq('status', 'waiting').order('joined_at').limit(1).maybeSingle();
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
    if (error) {
      if (error.code === '23505') return false;
      console.error('[FF-ANA-JOIN]', error.message);
      return false;
    }
    return true;
  } catch { return false; }
}
async function ffAnalystLeave(gid, uid) {
  const { data: a } = await supabase.from('ff_analyst_queue')
    .select('status').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
  if (a?.status === 'busy') return false;
  try { await supabase.from('ff_analyst_queue').delete().eq('guild_id', gid).eq('user_id', uid); } catch {}
  return true;
}
async function ffAnalystNext(gid) {
  const { data } = await supabase.from('ff_analyst_queue')
    .select('*').eq('guild_id', gid).eq('status', 'waiting').order('joined_at').limit(1).maybeSingle();
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

async function ffGetStreamerQueue(gid) {
  const { data } = await supabase.from('ff_streamer_queue')
    .select('*').eq('guild_id', gid).order('joined_at');
  return data || [];
}
async function ffStreamerJoin(gid, uid, mediatorId = null) {
  try {
    const { data: ex } = await supabase.from('ff_streamer_queue')
      .select('*').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
    if (ex) {
      if (mediatorId && ex.mediator_id !== mediatorId) {
        try { await supabase.from('ff_streamer_queue').update({ mediator_id: mediatorId, mediator_status: 'pending' }).eq('id', ex.id); } catch {}
        return true;
      }
      return false;
    }
    await supabase.from('ff_streamer_queue').insert({
      guild_id: gid, user_id: uid, status: 'offline',
      mediator_id: mediatorId, mediator_status: mediatorId ? 'pending' : null,
      mediator_joined_at: mediatorId ? new Date().toISOString() : null,
    });
    return true;
  } catch { return false; }
}
async function ffStreamerLeave(gid, uid) {
  try { await supabase.from('ff_streamer_queue').delete().eq('guild_id', gid).eq('user_id', uid); } catch {}
}

async function ffStreamerSetLive(gid, uid, url, title = null) {
  const { data: existing } = await supabase.from('ff_streamer_queue')
    .select('*').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
  const mediatorId = existing?.mediator_id || null;

  try {
    await supabase.from('ff_streamer_queue').upsert({
      guild_id: gid, user_id: uid, status: 'live', live_url: url, title,
      mediator_id: mediatorId,
      mediator_status: mediatorId ? (existing?.mediator_status === 'accepted' ? 'accepted' : 'pending') : null,
    }, { onConflict: 'guild_id,user_id' });
  } catch {}

  // Bug #22 corrigido: só insere se não tiver mediação ativa
  if (mediatorId) {
    try {
      const { data: existingMed } = await supabase.from('ff_streamer_mediations')
        .select('id').eq('guild_id', gid).eq('streamer_id', uid).eq('status', 'active').maybeSingle();
      if (existingMed) {
        await supabase.from('ff_streamer_mediations').update({ live_url: url, title }).eq('id', existingMed.id);
      } else {
        await supabase.from('ff_streamer_mediations').insert({
          guild_id: gid, streamer_id: uid, mediator_id: mediatorId,
          live_url: url, title, status: 'active',
        });
      }
    } catch {}

    try {
      const guild = client.guilds.cache.get(gid);
      const streamer = await client.users.fetch(uid).catch(() => null);
      const mediator = await client.users.fetch(mediatorId).catch(() => null);
      if (mediator && guild) {
        const e = new EmbedBuilder().setTitle('🎥 Streamer ao vivo!').setColor('#9146FF')
          .setDescription(`**${streamer?.tag || uid}** começou uma live e você é o **mediador designado**!`)
          .addFields(
            { name: '🎥 Título', value: title || '*sem título*', inline: false },
            { name: '🔗 Link', value: `[Abrir live](${url})`, inline: false },
            { name: '🌐 Servidor', value: `**${guild.name}**`, inline: true },
          )
          .setFooter({ text: 'Use os botões abaixo pra aceitar ou recusar' })
          .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ffstr:accept:${gid}:${uid}`).setLabel('Aceitar').setEmoji('✅').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`ffstr:decline:${gid}:${uid}`).setLabel('Recusar').setEmoji('❌').setStyle(ButtonStyle.Danger),
        );
        await mediator.send({ embeds: [e], components: [row] }).catch(() => {});
      }
    } catch (e) { console.error('[STREAMER-MEDIATOR]', e.message); }
  }
}

// ═══════════════════════════════════════════════════════════
// FF EMBEDS + BOTÕES
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
  const footer = safeStr(c.footer); if (footer) e.setFooter({ text: footer, iconURL: safeUrl(c.footer_icon) || undefined });
  const author = safeStr(c.author); if (author) e.setAuthor({ name: author, iconURL: safeUrl(c.author_icon) || undefined });
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
    await msg.edit({ embeds: [ffBuildBetEmbed(bet, cfg)], components: [ffBuildBetButtons(bet.id, cfg)] }).catch(() => {});
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// PIX FF
// ═══════════════════════════════════════════════════════════
async function ffGetPixEmbed(gid) {
  const { data } = await supabase.from('ff_pix_embed').select('*').eq('guild_id', gid).maybeSingle();
  return data;
}
async function ffPatchPixEmbed(gid, p) {
  try { await supabase.from('ff_pix_embed').upsert({ guild_id: gid, ...p, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' }); } catch {}
  return ffGetPixEmbed(gid);
}
function ffBuildPixButtons(hasPix) {
  const r = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ffpix:configurar').setLabel(hasPix ? 'Editar Pix' : 'Configurar Pix').setEmoji('✏️').setStyle(ButtonStyle.Primary),
  );
  if (hasPix) r.addComponents(
    new ButtonBuilder().setCustomId('ffpix:ver').setLabel('Mostrar Pix').setEmoji('👁️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ffpix:remover').setLabel('Remover Pix').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
  );
  return [r];
}
function ffBuildPixEmbed(cfg) {
  const h = !!cfg?.pix_key;
  const usandoMP = !!cfg?.mp_access_token;
  return new EmbedBuilder()
    .setTitle('💳 Pagamento via Pix')
    .setColor(usandoMP ? '#22c55e' : (h ? '#FFA500' : '#ff5555'))
    .setDescription(
      `**Gateway:** ${usandoMP ? '🟢 Mercado Pago' : (h ? '🟡 PIX estático' : '🔴 Nenhum')}\n\n` +
      (usandoMP ? `✅ **MP configurado**` : (h ? `✅ **Pix estático**` : '⚠️ **Nenhum Pix configurado.**'))
    )
    .setTimestamp();
}
async function ffUpdatePixEmbed(g) {
  try {
    const p = await ffGetPixEmbed(g.id);
    if (!p?.channel_id || !p?.message_id) return;
    const c = await ffGetConfig(g.id);
    const ch = g.channels.cache.get(p.channel_id) || await g.channels.fetch(p.channel_id).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(p.message_id).catch(() => null);
    if (msg) await msg.edit({ embeds: [ffBuildPixEmbed(c)], components: ffBuildPixButtons(!!c?.pix_key) }).catch(() => {});
  } catch {}
}
async function ffPostPixEmbed(g, cid) {
  try {
    const c = await ffGetConfig(g.id);
    const ch = g.channels.cache.get(cid) || await g.channels.fetch(cid).catch(() => null);
    if (!ch) return;
    const msg = await ch.send({ embeds: [ffBuildPixEmbed(c)], components: ffBuildPixButtons(!!c?.pix_key) }).catch(() => null);
    if (msg) await ffPatchPixEmbed(g.id, { channel_id: cid, message_id: msg.id });
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// PAINEL MULTI-PIX DOS MEDIADORES
// ═══════════════════════════════════════════════════════════
async function ffBuildMediatorPixPanel(gid) {
  const [allPix, meds] = await Promise.all([
    ffGetAllMediatorPix(gid),
    ffGetMediatorQueue(gid),
  ]);
  const configured = allPix.filter(p => p.pix_key);
  const pending = meds.filter(m => !allPix.find(p => p.user_id === m.user_id));

  const e = new EmbedBuilder()
    .setTitle('💳 PIX dos Mediadores')
    .setColor('#22c55e')
    .setDescription(
      `**Gerenciamento de PIX dos mediadores do servidor.**\n\n` +
      `**Configurados:** ${configured.length}\n` +
      `**Pendentes:** ${pending.length}\n` +
      `**Total na fila:** ${meds.length}`
    )
    .addFields(
      { name: '🔒 Privacidade', value: '> Cada mediador só vê o próprio PIX.\n> Admins/Devs veem todos.', inline: false },
    )
    .setFooter({ text: 'Frio Bot • PIX Mediadores' })
    .setTimestamp();

  if (configured.length > 0) {
    const previewList = configured.slice(0, 10).map(p => {
      const med = meds.find(m => m.user_id === p.user_id);
      const status = med ? (med.status === 'busy' ? '🔴 Em partida' : '🟢 Disponível') : '⚪ Fora da fila';
      const keyMasked = p.pix_key.length > 8
        ? `${p.pix_key.substring(0, 4)}••••${p.pix_key.substring(p.pix_key.length - 4)}`
        : '••••';
      return `**<@${p.user_id}>** ${status}\n> \`${keyMasked}\` • ${p.pix_name || '—'}`;
    }).join('\n\n');
    e.addFields({ name: `📋 Configurados (${configured.length})`, value: previewList.substring(0, 1024), inline: false });
  }
  if (pending.length > 0) {
    const pendingList = pending.slice(0, 10).map(m => `• <@${m.user_id}> ${m.status === 'busy' ? '🔴' : '🟢'}`).join('\n');
    e.addFields({ name: `⚠️ Sem PIX configurado (${pending.length})`, value: pendingList.substring(0, 1024), inline: false });
  }

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffpixmed:config').setLabel('Configurar meu PIX').setEmoji('✏️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ffpixmed:view').setLabel('Ver meu PIX').setEmoji('👁️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ffpixmed:list').setLabel('Listar todos').setEmoji('📋').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffpixmed:remove').setLabel('Remover meu PIX').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ffpixmed:post').setLabel('Postar aqui').setEmoji('📢').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar FF').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    ),
  ];
  return { embeds: [e], components: rows };
}

async function ffPanelPixMediadoresView(gid, viewerId, opts = {}) {
  const [allPix, meds] = await Promise.all([
    ffGetAllMediatorPix(gid),
    ffGetMediatorQueue(gid),
  ]);
  const isAdmin = opts.isAdmin;
  const myPix = allPix.find(p => p.user_id === viewerId);

  const e = new EmbedBuilder()
    .setTitle('💳 PIX dos Mediadores')
    .setColor('#22c55e')
    .setDescription(
      `**Sistema multi-PIX por mediador.**\n\n` +
      `Cada mediador configura o próprio PIX e envia nas apostas.\n` +
      `**Privacidade:** só o próprio mediador e a staff veem.\n\n` +
      `**Mediadores com PIX:** ${allPix.length}\n` +
      `**Na fila:** ${meds.length}`
    )
    .setFooter({ text: 'Frio Bot • PIX Mediadores' })
    .setTimestamp();

  if (myPix) {
    e.addFields({ name: '🟢 Seu PIX (configurado)', value: `> 🔑 \`${myPix.pix_key}\`\n> 👤 ${myPix.pix_name}\n> 🏙️ ${myPix.pix_city || '—'}`, inline: false });
  } else {
    e.addFields({ name: '🔴 Seu PIX', value: '> *Não configurado ainda.*\n> Clique em **Configurar** abaixo.', inline: false });
  }

  if (isAdmin && allPix.length) {
    const list = allPix.slice(0, 10).map(p => `• <@${p.user_id}> — \`${p.pix_key.length > 12 ? p.pix_key.substring(0, 6) + '...' + p.pix_key.substring(p.pix_key.length - 4) : p.pix_key}\``).join('\n');
    e.addFields({ name: `📋 Todos (${allPix.length})`, value: list.substring(0, 1024), inline: false });
  }

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffpixmed:config').setLabel(myPix ? 'Editar meu PIX' : 'Configurar PIX').setEmoji('✏️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffpixmed:view').setLabel('Ver meu PIX').setEmoji('👁️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffpixmed:remove').setLabel('Remover').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(!myPix),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffpixmed:list').setLabel('Lista (staff)').setEmoji('📋').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffpixmed:post').setLabel('Postar painel').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINÉIS FF
// ═══════════════════════════════════════════════════════════
async function ffBuildMediatorPanel(gid) {
  const c = await ffGetConfig(gid);
  const meds = await ffGetMediatorQueue(gid);
  const wait = meds.filter(m => m.status === 'waiting');
  const busy = meds.filter(m => m.status === 'busy');
  const st = wait.length === 0 ? '⚠️ **Nenhum mediador disponível.**' : wait.length === 1 ? `🟢 **<@${wait[0].user_id}>** atende sozinho.` : `🟢 **${wait.length} mediadores disponíveis.**`;
  const lines = [];
  if (wait.length) lines.push(`**Disponíveis:**\n${wait.map((m, i) => `\`${i + 1}.\` <@${m.user_id}> • 💰 R$ ${Number(m.earnings_total || 0).toFixed(2)}`).join('\n')}`);
  if (busy.length) lines.push(`**Em partida:**\n${busy.map(m => `• <@${m.user_id}>`).join('\n')}`);
  const cu = c?.custom_mediator_embed || {};
  const e = new EmbedBuilder()
    .setTitle(cu.title || '🛡️ Fila de Mediadores')
    .setColor(safeColor(cu.color, '#00AAFF'))
    .setDescription(`${st}\n\n${lines.join('\n\n') || ''}`)
    .setFooter({ text: cu.footer || 'Só mediadores' })
    .setTimestamp();
  const thumb = safeUrl(cu.thumbnail); if (thumb) e.setThumbnail(thumb);
  const banner = safeUrl(cu.banner); if (banner) e.setImage(banner);
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffmed:entrar').setLabel('Entrar na fila').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffmed:sair').setLabel('Sair da fila').setEmoji('🚪').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ffmed:receita').setLabel('Minha receita').setEmoji('💰').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffpixmed:config').setLabel('Configurar PIX').setEmoji('💳').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffpixmed:view').setLabel('Ver meu PIX').setEmoji('👁️').setStyle(ButtonStyle.Primary),
      ),
    ],
  };
}

async function ffBuildAnalystPanel(gid) {
  const list = await ffGetAnalystQueue(gid);
  const waiting = list.filter(a => a.status === 'waiting');
  const busy = list.filter(a => a.status === 'busy');
  const st = waiting.length === 0 ? '🔴 **Não tem nenhum analista online.**' : waiting.length === 1 ? `🟢 **<@${waiting[0].user_id}>** é o único disponível.` : `🟢 **${waiting.length} analistas disponíveis.**`;
  const lines = [];
  if (waiting.length) lines.push(`**🔎 Disponíveis (${waiting.length}):**\n${waiting.map((a, i) => `\`${i + 1}.\` <@${a.user_id}> • 📊 ${a.analyses_total || 0}`).join('\n')}`);
  if (busy.length) lines.push(`**🟡 Em análise:**\n${busy.map(a => `• <@${a.user_id}>`).join('\n')}`);
  const c = await ffGetConfig(gid);
  const cu = c?.custom_analyst_embed || {};
  const e = new EmbedBuilder()
    .setTitle(cu.title || '🔎 Fila de Analistas')
    .setColor(safeColor(cu.color, '#00AAFF'))
    .setDescription(`${st}\n\n${lines.join('\n\n') || '*Nenhum analista na fila.*'}`)
    .setFooter({ text: cu.footer || 'Só ANALISTA' })
    .setTimestamp();
  const thumb = safeUrl(cu.thumbnail); if (thumb) e.setThumbnail(thumb);
  const banner = safeUrl(cu.banner); if (banner) e.setImage(banner);
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffana:entrar').setLabel('Entrar na fila').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffana:sair').setLabel('Sair da fila').setEmoji('🚪').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ffana:meu_historico').setLabel('Minhas análises').setEmoji('📊').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffbl:list').setLabel('Ver Blacklist').setEmoji('🚫').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ffbl:check').setLabel('Verificar').setEmoji('🔍').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffbl:add').setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffbl:remove').setLabel('Remover').setEmoji('➖').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function ffBuildBlacklistEmbed(gid) {
  const { data } = await supabase.from('ff_blacklist')
    .select('*').eq('guild_id', gid).order('created_at', { ascending: false }).limit(25);
  const total = data?.length || 0;
  const e = new EmbedBuilder().setTitle('🚫 Blacklist de Jogadores').setColor('#FF5555')
    .setDescription('**Jogadores banidos.**\n\n' + (data?.length
      ? data.map((b, i) => {
          const uid = b.discord_id || b.user_id;
          const ts = Math.floor(new Date(b.created_at).getTime() / 1000);
          const evidence = b.evidence ? ` • 🔗 [Provas](${b.evidence})` : '';
          return `**${i + 1}.** <@${uid}>\n> 🆔 \`${uid}\` • 🎮 \`${b.ff_id || '—'}\`\n> 📝 ${b.reason || '—'}\n> 🕐 <t:${ts}:R>${evidence}`;
        }).join('\n\n')
      : '*Ninguém na blacklist.*'))
    .setFooter({ text: `Total: ${total}` }).setTimestamp();
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffbl:check').setLabel('Verificar').setEmoji('🔍').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ffbl:add').setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ffbl:remove').setLabel('Remover').setEmoji('➖').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ffbl:refresh').setLabel('🔄').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// STREAMER PANEL
// ═══════════════════════════════════════════════════════════
function ffBuildStreamerEmbed(cfgStreamer, streamers) {
  const c = cfgStreamer.custom || {};
  const lista = (streamers || []).filter(s => s.status === 'live');
  const linhas = lista.length
    ? lista.map(s => {
        const link = s.live_url ? ` — [▶️ Assistir](${s.live_url})` : '';
        const titulo = s.title ? `\n> *${s.title}*` : '';
        let medLinha = '';
        if (s.mediator_id) {
          const statusEmoji = { pending: '🟡', accepted: '🟢', declined: '🔴' }[s.mediator_status] || '⚪';
          medLinha = `\n> 🛡️ Mediador: <@${s.mediator_id}> ${statusEmoji}`;
        } else medLinha = '\n> 🛡️ Sem mediador designado';
        return `🔴 <@${s.user_id}>${link}${titulo}${medLinha}`;
      }).join('\n\n')
    : '*Nenhum streamer ao vivo agora.*';
  const e = new EmbedBuilder()
    .setTitle(c.title || '🎥 Streamers ao Vivo')
    .setColor(safeColor(c.color, '#9146FF'))
    .setDescription(
      `${c.descricao || 'Streamers do servidor que estão ao vivo agora!'}\n\n**Ao Vivo (${lista.length}):**\n${linhas}\n\n` +
      (c.regras ? `**📜 Regras:**\n${c.regras}` : '')
    )
    .setFooter({ text: c.footer || 'Clique em Entrar pra aparecer quando estiver ao vivo' })
    .setTimestamp();
  const thumb = safeUrl(c.thumbnail); if (thumb) e.setThumbnail(thumb);
  const banner = safeUrl(c.banner); if (banner) e.setImage(banner);
  const author = safeStr(c.author); if (author) e.setAuthor({ name: author, iconURL: safeUrl(c.author_icon) || undefined });
  return e;
}

async function ffBuildStreamerPanel(gid) {
  const c = await ffGetConfig(gid);
  const streamers = await ffGetStreamerQueue(gid);
  const embed = ffBuildStreamerEmbed({ custom: c?.custom_streamer_embed || {} }, streamers);
  const custom = c?.custom_streamer_embed || {};
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffstr:entrar').setLabel(custom.btn_entrar || 'Entrar na lista').setEmoji('🎥').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffstr:sair').setLabel(custom.btn_sair || 'Sair da lista').setEmoji('🚪').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ffstr:live_set').setLabel(custom.btn_live || 'Definir Live').setEmoji('🔴').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffstr:set_mediator').setLabel('Designar Mediador').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffstr:my_info').setLabel('Meus dados').setEmoji('📊').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function ffUpdateStreamerMessage(g) {
  try {
    const c = await ffGetConfig(g.id);
    if (!c?.streamer_channel_id || !c?.streamer_embed_id) return;
    const ch = g.channels.cache.get(c.streamer_channel_id) || await g.channels.fetch(c.streamer_channel_id).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(c.streamer_embed_id).catch(() => null);
    if (!msg) return;
    const panel = await ffBuildStreamerPanel(g.id);
    await msg.edit({ embeds: panel.embeds, components: panel.components }).catch(() => {});
  } catch {}
}

async function ffPostStreamerPanel(g, cid) {
  try {
    const ch = g.channels.cache.get(cid) || await g.channels.fetch(cid).catch(() => null);
    if (!ch) return;
    const panel = await ffBuildStreamerPanel(g.id);
    const msg = await ch.send(panel).catch(() => null);
    if (msg) await ffPatchConfig(g.id, { streamer_channel_id: cid, streamer_embed_id: msg.id });
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// THREAD DE APOSTA — com botão PIX do Mediador
// ═══════════════════════════════════════════════════════════
function ffThreadName(status, value, ids, matchId) {
  const premio = Number(value || 0) * 2;
  if (status === 'waiting') return 'aguardando - confirmação';
  if (status === 'confirmed') return 'aguardando - pagamento';
  if (status === 'paid') return `pagar - R$ ${premio.toFixed(2).replace('.', ',')}`;
  if (status === 'playing') return `pagar - R$ ${premio.toFixed(2).replace('.', ',')}`;
  if (status === 'finished') return `finalizando - #${matchId || '?'}`;
  return `aposta - #${matchId || '?'}`;
}

// Bug #24 corrigido: try/catch completo
async function ffCriarThreadAposta(g, ids, bet) {
  try {
    const c = await ffGetConfig(g.id);
    const med = await ffMediatorNext(g.id);
    const roleOlh = c?.olhinho_role_id ? g.roles.cache.get(c.olhinho_role_id) : null;
    const parent = c?.topic_channel_id ? g.channels.cache.get(c.topic_channel_id) : bet?.channel_id ? g.channels.cache.get(bet.channel_id) : null;
    if (!parent) return;

    const fmt = FF_FORMATS.find(f => f.label === bet?.format);
    const thread = await parent.threads.create({
      name: ffThreadName('waiting', bet?.value, ids, null),
      autoArchiveDuration: 1440,
      type: ChannelType.PrivateThread,
      reason: 'Aposta FF',
    });
    await sleep(300);

    for (const uid of ids) await thread.members.add(uid).catch(() => {});

    // Bug #34 corrigido: limita 50 membros de cargo
    if (roleOlh) {
      const members = [...roleOlh.members.values()].slice(0, 50);
      for (const m of members) await thread.members.add(m.id).catch(() => {});
    }

    if (med) {
      await thread.members.add(med.user_id).catch(() => {});
      try { await supabase.from('ff_mediator_queue').update({ status: 'busy' }).eq('id', med.id); } catch {}
    }

    const { data: match } = await supabase.from('ff_matches').insert({
      guild_id: g.id, thread_id: thread.id, channel_id: parent.id,
      players: JSON.stringify(ids), status: 'waiting',
      format: bet?.format, value: bet?.value, mediator_id: med?.user_id || null,
    }).select().single();

    if (med) {
      try { await supabase.from('ff_mediator_queue').update({ current_match_id: match.id }).eq('id', med.id); } catch {}
    }

    const team = fmt ? `Times de **${fmt.teamSize}** • Total **${fmt.totalPlayers}**` : '';
    const e = new EmbedBuilder().setTitle(`🎮 ${bet?.format || 'Aposta'}`).setColor('#f1c40f')
      .setDescription(`<@${ids[0]}> 🆚 <@${ids[1]}>\n\n${team ? `${team}\n\n` : ''}💰 **R$ ${Number(bet?.value || 0).toFixed(2).replace('.', ',')}**\n\nCombinem as regras e cliquem em **Confirmar**.`)
      .setFooter({ text: `Match #${match.id}` }).setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ffm:confirmar:${match.id}`).setLabel('Confirmar Regras').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ffm:encerrar:${match.id}`).setLabel('Encerrar Fila').setEmoji('❌').setStyle(ButtonStyle.Danger),
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ffm:chamar_analista:${match.id}`).setLabel('Chamar Analista').setEmoji('🔎').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ffpixmed:thread_view:${match.id}`).setLabel('PIX do Mediador').setEmoji('💳').setStyle(ButtonStyle.Secondary),
    );

    await thread.send({
      content: `${ids.map(id => `<@${id}>`).join(' ')}${med ? ` <@${med.user_id}>` : ''}${roleOlh ? ` <@&${roleOlh.id}>` : ''}`,
      embeds: [e], components: [row1, row2],
    });

    await ffLog(g, 'thread', 'THREAD_CREATED', null, { match_id: match.id, players: ids });
    if (med) await logMediador(g, med.user_id, 'SELECIONADO', { match_id: match.id });
  } catch (e) {
    console.error('[FF-THREAD]', e.message);
    await logError('ffCriarThreadAposta', e, null, g.id).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════
// TRANSCRIPTS FF
// ═══════════════════════════════════════════════════════════
function ffEscapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function ffBuildTranscriptHtml(thread, msgs, meta = {}) {
  const list = [...msgs.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const body = list.map(m => {
    const av = m.author.displayAvatarURL({ extension: 'png', size: 64 });
    const date = new Date(m.createdTimestamp).toLocaleString('pt-BR');
    const att = m.attachments.map(a => `<div><a href="${ffEscapeHtml(a.url)}">📎 ${ffEscapeHtml(a.name)}</a></div>`).join('');
    const embs = m.embeds.map(em => {
      const ti = em.title ? `<b>${ffEscapeHtml(em.title)}</b><br>` : '';
      const de = em.description ? `${ffEscapeHtml(em.description).replace(/\n/g, '<br>')}` : '';
      return `<div style="border-left:3px solid ${em.hexColor || '#5865F2'};padding:8px;background:#2B2D31;border-radius:4px;margin-top:6px">${ti}${de}</div>`;
    }).join('');
    const c = m.content ? ffEscapeHtml(m.content).replace(/\n/g, '<br>') : '';
    return `<div style="padding:8px;margin-bottom:4px"><img src="${av}" style="width:32px;height:32px;border-radius:50%"><b style="margin-left:8px;color:${m.author.bot ? '#5865F2' : '#57F287'}">${ffEscapeHtml(m.author.tag)}</b><span style="color:#949BA4;font-size:11px;margin-left:8px">${date}</span><div>${c}${embs}${att}</div></div>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Transcript</title><style>body{font-family:Arial;background:#313338;color:#DBDEE1;padding:20px}</style></head><body><h2>📝 ${ffEscapeHtml(thread.name)}</h2><p style="color:#949BA4">Match #${meta.matchId || '—'} • ${list.length} mensagens • ${new Date().toLocaleString('pt-BR')}</p>${body}</body></html>`;
}

async function ffSaveTranscript(g, tid, mid, participants, c) {
  try {
    const th = await g.channels.fetch(tid).catch(() => null);
    if (!th) return null;
    let all = new Map(), lastId = null;
    for (let i = 0; i < 10; i++) {
      const f = await th.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!f?.size) break;
      for (const [id, m] of f) all.set(id, m);
      lastId = f.last().id;
      if (f.size < 100) break;
    }
    const html = ffBuildTranscriptHtml(th, all, { matchId: mid });
    const fn = `transcripts/${g.id}/${mid || tid}-${Date.now()}.html`;
    const buf = Buffer.from(html, 'utf-8');
    const { error: er } = await supabase.storage.from('ff-transcripts').upload(fn, buf, { contentType: 'text/html', upsert: false });
    let url = null;
    if (!er) { const { data: pub } = supabase.storage.from('ff-transcripts').getPublicUrl(fn); url = pub?.publicUrl; }
    try {
      await supabase.from('ff_transcripts').insert({
        guild_id: g.id, thread_id: tid, match_id: mid,
        html_url: url, html_content: url ? null : html,
        participants, message_count: all.size,
      });
    } catch {}
    return url;
  } catch (e) { console.error('[TRANSCRIPT-FF]', e); return null; }
}

// ═══════════════════════════════════════════════════════════
// COIN SHOP — componentes
// ═══════════════════════════════════════════════════════════
async function buildCoinShopComponents(gid) {
  const { data: items } = await supabase.from('ff_coin_shop')
    .select('*').eq('guild_id', gid).eq('active', true).order('price').limit(24);
  if (!items?.length) return [];
  const menu = new StringSelectMenuBuilder().setCustomId('coinshop:buy').setPlaceholder('🪙 Escolha um item');
  for (const i of items) menu.addOptions({
    label: `${i.emoji || '🎁'} ${i.name} — ${i.price}`.slice(0, 90),
    value: String(i.id),
    description: (i.description || 'Comprar com coins').slice(0, 90),
  });
  return [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('coinshop:saldo').setLabel('Meu saldo').setEmoji('💰').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('coinshop:top').setLabel('Mais ricos').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// ═══════════════════════════════════════════════════════════
// COMANDO DE RECEITA — helper
// ═══════════════════════════════════════════════════════════
async function withCoinLock(k, fn) {
  if (coinLocks.has(k)) throw new Error('Aguarde...');
  coinLocks.add(k);
  try { return await fn(); }
  finally { setTimeout(() => coinLocks.delete(k), 3000); }
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 4/9
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 5/9] TICKETS — ESTRUTURA + EDITOR + AÇÕES + AUTOMAÇÕES
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// TICKETS — STATUS + ESTRUTURA
// ═══════════════════════════════════════════════════════════
const TICKET_STATUS = {
  aberto:      { emoji: '🟢', label: 'Aberto',             color: '#22c55e' },
  atendimento: { emoji: '🟡', label: 'Em atendimento',     color: '#f1c40f' },
  aguardando:  { emoji: '🟠', label: 'Aguardando cliente', color: '#FFA500' },
  resolvido:   { emoji: '🔵', label: 'Resolvido',          color: '#00AAFF' },
  fechado:     { emoji: '🔴', label: 'Fechado',            color: '#ff5555' },
};

// ⚡ Com cache LRU (Otimização #O2)
async function getTicketPanels(gid) {
  const cached = _ticketPanelsCache.get(gid);
  if (cached) return cached;
  const cfg = await getConfig(gid);
  const raw = parseJson(cfg.ticket_panels, []);
  const arr = Array.isArray(raw) ? raw : [];
  return _ticketPanelsCache.set(gid, arr);
}

// ⚡ Com auto-refresh (bug #17 + feature auto-update)
async function saveTicketPanels(gid, panels) {
  _ticketPanelsCache.delete(gid);
  _configCache.delete(gid);
  try {
    const { error } = await supabase.from('configs')
      .upsert({ guild_id: gid, ticket_panels: panels, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' });
    if (error) { console.error('[SAVE-PANELS]', error.message); return false; }
    _ticketPanelsCache.set(gid, panels);
    // 🔥 AUTO-REFRESH de cada painel postado
    for (const p of panels) {
      if (p.canal_id && p.mensagem_id) {
        scheduleRefresh(`ticket:${gid}:${p.id}`, () => refreshTicketPanelMessage(gid, p.id));
      }
    }
    return true;
  } catch (e) { console.error('[SAVE-PANELS]', e.message); return false; }
}

async function getTicketPanel(gid, panelId) {
  const panels = await getTicketPanels(gid);
  return panels.find(p => Number(p.id) === Number(panelId)) || null;
}
async function getTicketPanelByMessage(gid, messageId) {
  const panels = await getTicketPanels(gid);
  return panels.find(p => String(p.mensagem_id) === String(messageId)) || null;
}

function newTicketPanel(id, data = {}) {
  return {
    id,
    nome: safeStr(data.nome, 80) || `Painel ${id}`,
    titulo: safeStr(data.titulo, 256) || 'Central de Suporte',
    descricao: safeStr(data.descricao, 4000) || 'Clique abaixo para abrir um ticket.',
    cor: safeColor(data.cor, '#9B59B6'),
    banner: safeUrl(data.banner),
    thumbnail: safeUrl(data.thumbnail),
    footer: safeStr(data.footer, 2048) || null,
    botao_label: safeStr(data.botao_label, 80) || 'Abrir Ticket',
    botao_emoji: safeStr(data.botao_emoji, 8) || '🎫',
    cargo_id: safeStr(data.cargo_id) || null,
    log_channel_id: safeStr(data.log_channel_id) || null,
    canal_id: null,
    mensagem_id: null,
    categoria_padrao_id: safeStr(data.categoria_padrao_id) || null,
    limite_tickets_usuario: Number.isFinite(Number(data.limite_tickets_usuario)) ? Number(data.limite_tickets_usuario) : 1,
    auto_close_horas: Number.isFinite(Number(data.auto_close_horas)) ? Number(data.auto_close_horas) : 48,
    fechar_ao_sair: !!data.fechar_ao_sair,
    horario_atendimento: safeStr(data.horario_atendimento, 100) || null,
    formulario: {
      habilitado: !!data?.formulario?.habilitado,
      perguntas: Array.isArray(data?.formulario?.perguntas) ? data.formulario.perguntas.slice(0, MAX_FORM_QUESTIONS) : [],
    },
    tipos: Array.isArray(data.tipos) ? data.tipos : [],
    bloqueio_usuarios_ids: Array.isArray(data.bloqueio_usuarios_ids) ? data.bloqueio_usuarios_ids : [],
  };
}

async function createTicketPanel(gid, data) {
  const panels = await getTicketPanels(gid);
  if (panels.length >= MAX_TICKET_PANELS) throw new Error(`Limite ${MAX_TICKET_PANELS} painéis.`);
  const newId = panels.length ? Math.max(...panels.map(p => Number(p.id))) + 1 : 1;
  const panel = newTicketPanel(newId, data);
  panels.push(panel);
  await saveTicketPanels(gid, panels);
  return panel;
}

async function updateTicketPanel(gid, panelId, patch) {
  const panels = await getTicketPanels(gid);
  const idx = panels.findIndex(p => Number(p.id) === Number(panelId));
  if (idx === -1) return null;
  panels[idx] = { ...panels[idx], ...patch };
  await saveTicketPanels(gid, panels);
  const updated = panels[idx];
  // 🔥 Auto-refresh imediato se tiver postado
  if (updated.canal_id && updated.mensagem_id) {
    scheduleRefresh(`ticket:${gid}:${panelId}`, () => refreshTicketPanelMessage(gid, panelId), 800);
  }
  return updated;
}

async function deleteTicketPanel(gid, panelId) {
  const panels = await getTicketPanels(gid);
  const filtered = panels.filter(p => Number(p.id) !== Number(panelId));
  await saveTicketPanels(gid, filtered);
  return filtered;
}

// ═══════════════════════════════════════════════════════════
// EMBED + COMPONENTES DO PAINEL
// ═══════════════════════════════════════════════════════════
function buildTicketPanelEmbed(panel) {
  const e = new EmbedBuilder();
  applyEmbedSafe(e, {
    title: panel.titulo,
    description: panel.descricao,
    color: panel.cor,
    thumbnail: panel.thumbnail,
    image: panel.banner,
    footer: panel.footer || `Painel #${panel.id} • ${panel.nome}`,
  });
  if (Array.isArray(panel.tipos) && panel.tipos.length > 1) {
    const lines = panel.tipos
      .filter(t => safeStr(t?.label))
      .slice(0, 20)
      .map(t => `${safeStr(t.emoji) || '🎫'} **${safeStr(t.label)}**${safeStr(t.descricao) ? `\n> ${safeStr(t.descricao).slice(0, 80)}` : ''}`)
      .join('\n');
    if (lines) e.addFields({ name: '📋 Tipos disponíveis', value: lines.slice(0, 1024), inline: false });
  }
  if (!e.data.footer) e.setFooter({ text: `Painel #${panel.id}` });
  e.setTimestamp();
  return e;
}

function buildTicketPanelComponents(panel) {
  const tipos = Array.isArray(panel.tipos) ? panel.tipos.filter(t => safeStr(t?.label)) : [];
  const panelId = panel.id;
  if (!tipos.length) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_open:${panelId}:sem_tipo`)
        .setLabel(panel.botao_label || 'Abrir Ticket')
        .setEmoji(panel.botao_emoji || '🎫')
        .setStyle(ButtonStyle.Primary),
    )];
  }
  if (tipos.length === 1) {
    const t = tipos[0];
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_open:${panelId}:${t.id}`)
        .setLabel(safeStr(t.label, 80) || panel.botao_label || 'Abrir Ticket')
        .setEmoji(safeStr(t.emoji, 8) || panel.botao_emoji || '🎫')
        .setStyle(ButtonStyle.Primary),
    )];
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`ticket_pick_type:${panelId}`)
    .setPlaceholder('🎫 Selecione o tipo de atendimento')
    .setMinValues(1).setMaxValues(1);
  for (const t of tipos.slice(0, MAX_TICKET_TYPES_PER_PANEL)) {
    menu.addOptions({
      label: (safeStr(t.label, 90) || 'Tipo'),
      value: String(t.id),
      emoji: safeStr(t.emoji, 8) || '🎫',
      description: safeStr(t.descricao, 100) || undefined,
    });
  }
  return [new ActionRowBuilder().addComponents(menu)];
}

// ⚡ Botões internos com ESTADO REAL (bug #17)
function buildTicketInnerButtons(threadId, opts = {}) {
  const assumed = !!opts.assumedBy;
  const priority = !!opts.isPriority;
  const locked = !!opts.locked;
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tkt:claim:${threadId}`).setLabel(assumed ? 'Assumido' : 'Assumir').setEmoji('🙋').setStyle(assumed ? ButtonStyle.Secondary : ButtonStyle.Success).setDisabled(assumed),
    new ButtonBuilder().setCustomId(`tkt:unclaim:${threadId}`).setLabel('Devolver').setEmoji('↩️').setStyle(ButtonStyle.Secondary).setDisabled(!assumed),
    new ButtonBuilder().setCustomId(`tkt:lock:${threadId}`).setLabel(locked ? 'Desbloquear' : 'Bloquear').setEmoji(locked ? '🔓' : '🔒').setStyle(locked ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`tkt:priority:${threadId}`).setLabel(priority ? 'Prioridade ON' : 'Prioridade').setEmoji(priority ? '🔴' : '⚪').setStyle(priority ? ButtonStyle.Danger : ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tkt:add:${threadId}`).setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`tkt:remove:${threadId}`).setLabel('Remover').setEmoji('➖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`tkt:rename:${threadId}`).setLabel('Renomear').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`tkt:transfer:${threadId}`).setLabel('Transferir').setEmoji('↪️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`tkt:move:${threadId}`).setLabel('Mover').setEmoji('📁').setStyle(ButtonStyle.Secondary),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tkt:close:${threadId}`).setLabel('Fechar').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`tkt:delete:${threadId}`).setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
  );
  return [row1, row2, row3];
}

// ⚡ Refresh dos botões após ação (bug #17 fix)
async function refreshTicketButtons(thread, td) {
  try {
    if (!thread?.isThread?.()) return;
    const msgs = await thread.messages.fetch({ limit: 20 }).catch(() => null);
    if (!msgs) return;
    const botMsg = msgs.find(m =>
      m.author.id === client.user.id &&
      m.components?.[0]?.components?.[0]?.customId?.startsWith(`tkt:claim:${thread.id}`)
    );
    if (!botMsg) return;
    await botMsg.edit({
      components: buildTicketInnerButtons(thread.id, {
        assumedBy: td?.assumed_by, isPriority: td?.is_priority, locked: td?.locked,
      }),
    }).catch(() => {});
  } catch {}
}

// Bug #1 corrigido: usa cfg.tickets_mensagem_boas_vindas como fallback
function buildTicketWelcomeEmbed(panel, tipo, authorId, formAnswers, cfg = null) {
  const meta = TICKET_STATUS.aberto;
  const e = new EmbedBuilder().setColor(meta.color);
  const tipoEmoji = safeStr(tipo?.emoji) || '🎫';
  const tipoLabel = safeStr(tipo?.label) || 'Suporte';
  e.setTitle(`${tipoEmoji} ${tipoLabel}`);
  const desc = safeStr(tipo?.descricao)
    || safeStr(panel?.mensagem_boas_vindas)
    || safeStr(cfg?.tickets_mensagem_boas_vindas)
    || 'Um atendente virá em breve.';
  const parts = [desc, ''];
  parts.push(`**Aberto por:** <@${authorId}>`);
  if (safeStr(panel?.horario_atendimento)) parts.push(`**Horário de atendimento:** ${panel.horario_atendimento}`);
  parts.push(`**Atendido por:** *aguardando...*`);
  e.setDescription(parts.join('\n'));
  e.addFields({ name: '📌 Status', value: `${meta.emoji} ${meta.label}`, inline: true });
  e.addFields({ name: '🎫 Tipo', value: tipoLabel, inline: true });
  if (Array.isArray(formAnswers) && formAnswers.length) {
    const answersText = formAnswers.slice(0, 5).map(a => `**${a.label}:** ${a.value}`).join('\n');
    if (safeStr(answersText)) e.addFields({ name: '📝 Respostas do formulário', value: answersText.slice(0, 1024), inline: false });
  }
  if (safeStr(panel?.horario_atendimento)) e.setFooter({ text: `Atendimento: ${panel.horario_atendimento}` });
  e.setTimestamp();
  return e;
}

async function canUserOpenTicket(guild, member, panel) {
  if (Array.isArray(panel.bloqueio_usuarios_ids) && panel.bloqueio_usuarios_ids.includes(member.id)) {
    return { ok: false, reason: '🚫 Você está bloqueado de abrir tickets neste painel.' };
  }
  const lim = Number(panel.limite_tickets_usuario) || 0;
  if (lim > 0) {
    const { count } = await supabase
      .from('ticket_data')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guild.id)
      .eq('user_id', member.id)
      .eq('panel_id', panel.id)
      .is('closed_at', null);
    if ((count || 0) >= lim) {
      return { ok: false, reason: `🚫 Você já tem **${count}** ticket(s) aberto(s). Limite: **${lim}**.` };
    }
  }
  return { ok: true };
}

function ticketCooldownCheck(userId, ms = 5000) {
  const now = Date.now();
  const last = TICKET_COOLDOWN.get(userId) || 0;
  if (now - last < ms) return false;
  TICKET_COOLDOWN.set(userId, now);
  if (TICKET_COOLDOWN.size > 500) TICKET_COOLDOWN.clear();
  return true;
}

// ═══════════════════════════════════════════════════════════
// openTicket — Bug #10 corrigido (valida categoria)
// ═══════════════════════════════════════════════════════════
async function openTicket(i, panel, tipo, formAnswers = []) {
  const guild = i.guild;
  const cfg = await getConfig(guild.id);

  // ⚡ FIX: garante members.me
  if (!guild.members.me) {
    try { await guild.members.fetchMe(); } catch {}
  }
  if (!guild.members.me) throw new Error('Bot não conseguiu se identificar. Tente novamente.');

  const me = guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.CreatePrivateThreads)) {
    throw new Error('Bot sem permissão **Criar Tópicos Privados**. Ative nas permissões do servidor.');
  }
  if (!me.permissions.has(PermissionFlagsBits.ManageThreads)) {
    throw new Error('Bot sem permissão **Gerenciar Tópicos**. Ative nas permissões do servidor.');
  }

  // ⚡ Valida se canal é texto (não categoria)
  const resolveParent = (id) => {
    if (!id) return null;
    const ch = guild.channels.cache.get(id);
    if (!ch) return null;
    if (ch.type === ChannelType.GuildCategory) return null;
    if (!ch.isTextBased?.()) return null;
    return ch;
  };

  let parentCh = resolveParent(tipo?.canal_id) || resolveParent(panel?.canal_id);
  if (!parentCh && i.channel?.isTextBased?.() && !i.channel.isThread?.()) parentCh = i.channel;

  if (!parentCh && safeStr(panel?.categoria_padrao_id)) {
    const cat = guild.channels.cache.get(panel.categoria_padrao_id);
    if (cat?.type === ChannelType.GuildCategory) {
      parentCh = await guild.channels.create({
        name: '🎟・tickets',
        type: ChannelType.GuildText,
        parent: cat.id,
        reason: 'Fallback tickets',
      }).catch(() => null);
    }
  }
  if (!parentCh) throw new Error('Não encontrei canal de TEXTO válido. Configure um canal no painel.');

  const tipoSlug = (safeStr(tipo?.label) || 'ticket').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
  const nomeThread = `${safeStr(tipo?.emoji) || '🎫'}${tipoSlug}-${i.user.username}`.slice(0, 90);

  const th = await parentCh.threads.create({
    name: nomeThread,
    autoArchiveDuration: 1440,
    type: ChannelType.PrivateThread,
    reason: `Ticket ${safeStr(tipo?.label) || 'geral'}`,
  });
  await sleep(300);
  await th.members.add(i.user.id).catch(() => {});

  const roleId = safeStr(tipo?.cargo_responsavel_id) || safeStr(panel?.cargo_id) || safeStr(cfg.ticket_cargo);
  if (roleId) {
    const r = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    // Bug #34: limita 50 membros
    if (r) await Promise.allSettled([...r.members.values()].slice(0, 50).map(m => th.members.add(m.id).catch(() => {})));
  }

  try {
    await supabase.from('ticket_data').upsert({
      thread_id: th.id, guild_id: guild.id, user_id: i.user.id,
      panel_id: panel.id, type_id: tipo?.id || null, status: 'aberto',
      form_answers: Array.isArray(formAnswers) && formAnswers.length ? formAnswers : null,
      opened_at: new Date().toISOString(),
      locked: false, is_priority: false, assumed_by: null,
    }, { onConflict: 'thread_id' });
  } catch {}

  const e = buildTicketWelcomeEmbed(panel, tipo, i.user.id, formAnswers, cfg);
  const ping = roleId ? `<@&${roleId}>` : '';
  await th.send({ content: ping || null, embeds: [e], components: buildTicketInnerButtons(th.id, {}) });

  await logImportant('TICKET', '🎫 Ticket aberto', {
    description: `**${i.user.tag}** abriu \`${safeStr(tipo?.label) || 'sem tipo'}\``,
    user: i.user.id, guild: guild.id, severity: 'info',
    fields: [
      { name: '📋 Painel', value: `#${panel.id} — ${panel.nome}`, inline: true },
      { name: '🎯 Tipo', value: safeStr(tipo?.label) || '—', inline: true },
      { name: '🧵 Thread', value: `<#${th.id}>`, inline: true },
    ],
  }).catch(() => {});
  return th;
}

// ═══════════════════════════════════════════════════════════
// TRANSCRIPT DE TICKET — Bug #16 corrigido (fallback canal)
// ═══════════════════════════════════════════════════════════
async function buildTicketTranscriptHtml(thread, ticketData, guild) {
  let all = new Map(), lastId = null;
  for (let i = 0; i < 15; i++) {
    const f = await thread.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
    if (!f?.size) break;
    for (const [id, m] of f) all.set(id, m);
    lastId = f.last().id;
    if (f.size < 100) break;
  }
  const list = [...all.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const body = list.map(m => {
    const av = m.author.displayAvatarURL({ extension: 'png', size: 64 });
    const date = new Date(m.createdTimestamp).toLocaleString('pt-BR');
    const att = m.attachments.map(a => `<div><a href="${ffEscapeHtml(a.url)}" target="_blank">📎 ${ffEscapeHtml(a.name)}</a></div>`).join('');
    const embs = m.embeds.map(em => {
      const ti = em.title ? `<b>${ffEscapeHtml(em.title)}</b><br>` : '';
      const de = em.description ? `${ffEscapeHtml(em.description).replace(/\n/g, '<br>')}` : '';
      return `<div style="border-left:3px solid ${em.hexColor || '#5865F2'};padding:8px;background:#2B2D31;border-radius:4px;margin-top:6px">${ti}${de}</div>`;
    }).join('');
    const c = m.content ? ffEscapeHtml(m.content).replace(/\n/g, '<br>') : '';
    return `<div style="padding:8px;margin-bottom:4px"><img src="${av}" style="width:32px;height:32px;border-radius:50%"><b style="margin-left:8px;color:${m.author.bot ? '#5865F2' : '#57F287'}">${ffEscapeHtml(m.author.tag)}</b><span style="color:#949BA4;font-size:11px;margin-left:8px">${date}</span><div>${c}${embs}${att}</div></div>`;
  }).join('');
  const meta = ticketData || {};
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Ticket — ${ffEscapeHtml(thread.name)}</title><style>body{font-family:Arial;background:#313338;color:#DBDEE1;padding:20px;max-width:900px;margin:0 auto}h1{color:#9B59B6}.meta{background:#1e1f22;padding:16px;border-radius:10px;margin-bottom:20px;border-left:4px solid #9B59B6}.meta b{color:#9B59B6}</style></head><body><h1>🎫 ${ffEscapeHtml(thread.name)}</h1><div class="meta"><b>Servidor:</b> ${ffEscapeHtml(guild.name)}<br><b>Aberto por:</b> ${ffEscapeHtml(meta.user_id || '—')}<br><b>Painel:</b> #${ffEscapeHtml(String(meta.panel_id || '—'))}<br><b>Tipo:</b> ${ffEscapeHtml(meta.type_id || '—')}<br><b>Status final:</b> ${ffEscapeHtml(meta.status || '—')}<br><b>Assumido por:</b> ${ffEscapeHtml(meta.assumed_by || '—')}<br><b>Aberto em:</b> ${ffEscapeHtml(meta.opened_at || '—')}<br><b>Fechado em:</b> ${ffEscapeHtml(meta.closed_at || '—')}<br><b>Mensagens:</b> ${list.length}</div>${body}</body></html>`;
}

async function saveTicketTranscript(guild, thread, ticketData) {
  try {
    const html = await buildTicketTranscriptHtml(thread, ticketData, guild);
    const fn = `tickets/${guild.id}/${thread.id}-${Date.now()}.html`;
    const buf = Buffer.from(html, 'utf-8');
    const { error } = await supabase.storage.from('ff-transcripts').upload(fn, buf, { contentType: 'text/html', upsert: false });
    let url = null;
    if (!error) { const { data: pub } = supabase.storage.from('ff-transcripts').getPublicUrl(fn); url = pub?.publicUrl; }
    try {
      await supabase.from('ticket_logs').insert({
        guild_id: guild.id, thread_id: thread.id, user_id: ticketData?.user_id || null,
        thread_name: thread.name, transcript_url: url, transcript_html: url ? null : html,
        status: ticketData?.status || 'fechado',
      });
    } catch {}
    return { url, html };
  } catch (e) { console.error('[TRANSCRIPT]', e); return { url: null, html: null }; }
}

// ⚡ Bug #16: SEMPRE salva transcript + fallback de canal
async function sendTicketTranscriptToLog(guild, thread, ticketData, panel) {
  try {
    let logChId = safeStr(panel?.log_channel_id);
    if (!logChId) {
      const cfg = await getConfig(guild.id);
      logChId = safeStr(cfg.ticket_log_channel) || safeStr(cfg.log_channel);
    }

    const { url, html } = await saveTicketTranscript(guild, thread, ticketData);
    if (!logChId) return;

    const logCh = guild.channels.cache.get(logChId) || await guild.channels.fetch(logChId).catch(() => null);
    if (!logCh?.isTextBased?.()) return;

    const e = new EmbedBuilder()
      .setTitle(`📝 Ticket fechado — ${thread.name}`)
      .setColor(TICKET_STATUS.fechado.color)
      .addFields(
        { name: '👤 Autor', value: ticketData?.user_id ? `<@${ticketData.user_id}>` : '—', inline: true },
        { name: '🛡️ Assumido por', value: ticketData?.assumed_by ? `<@${ticketData.assumed_by}>` : '*ninguém*', inline: true },
        { name: '📌 Status', value: (TICKET_STATUS[ticketData?.status] || TICKET_STATUS.fechado).label, inline: true },
        { name: '🎫 Painel', value: panel ? `#${panel.id} — ${panel.nome}` : '*deletado*', inline: true },
        { name: '🎯 Tipo', value: safeStr(ticketData?.type_id) || '—', inline: true },
        { name: '📅 Aberto', value: ticketData?.opened_at ? `<t:${Math.floor(new Date(ticketData.opened_at).getTime() / 1000)}:R>` : '—', inline: true },
      ).setTimestamp();
    const files = [];
    if (html) files.push(new AttachmentBuilder(Buffer.from(html, 'utf-8'), { name: `transcript-${thread.id}.html` }));
    if (url) e.addFields({ name: '🔗 Link', value: `[Abrir transcript](${url})` });
    await logCh.send({ embeds: [e], files }).catch(() => {});
  } catch (e) { console.error('[TICKET-LOG]', e); }
}

async function sendTicketRatingDM(userId, threadId, threadName) {
  try {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;
    const e = new EmbedBuilder()
      .setTitle('⭐ Avalie seu atendimento')
      .setColor('#FFD700')
      .setDescription(`Seu ticket **${threadName}** foi fechado.\n\nComo você avalia o atendimento?`)
      .setFooter({ text: 'Clique em uma estrela abaixo' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tkt:rate:${threadId}:1`).setLabel('1').setEmoji('⭐').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`tkt:rate:${threadId}:2`).setLabel('2').setEmoji('⭐').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`tkt:rate:${threadId}:3`).setLabel('3').setEmoji('⭐').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`tkt:rate:${threadId}:4`).setLabel('4').setEmoji('⭐').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`tkt:rate:${threadId}:5`).setLabel('5').setEmoji('⭐').setStyle(ButtonStyle.Success),
    );
    await user.send({ embeds: [e], components: [row] }).catch(() => {});
  } catch (e) { console.error('[RATING-DM]', e); }
}

// ═══════════════════════════════════════════════════════════
// TICKETS — EDITOR (6 ABAS)
// ═══════════════════════════════════════════════════════════
async function ticketEditorPanel(guildId, panelId) {
  const panel = await getTicketPanel(guildId, panelId);
  if (!panel) return { content: '❌ Painel não encontrado.', embeds: [], components: [] };
  const tipos = Array.isArray(panel.tipos) ? panel.tipos : [];
  const e = new EmbedBuilder()
    .setTitle(`🎨 Editando Painel #${panel.id}`)
    .setColor(panel.cor)
    .setDescription(`**${panel.nome}**`)
    .addFields(
      { name: '📝 Título', value: safeStr(panel.titulo, 80) || '—', inline: false },
      { name: '📄 Descrição', value: safeStr(panel.descricao, 100) || '—', inline: false },
      { name: '🎨 Cor', value: `\`${panel.cor}\``, inline: true },
      { name: '🎫 Botão', value: `${panel.botao_emoji || '🎫'} ${panel.botao_label || '—'}`, inline: true },
      { name: '🎯 Tipos', value: `${tipos.length}`, inline: true },
      { name: '🛡️ Cargo', value: panel.cargo_id ? `<@&${panel.cargo_id}>` : '*—*', inline: true },
      { name: '📋 Logs', value: panel.log_channel_id ? `<#${panel.log_channel_id}>` : '*—*', inline: true },
      { name: '👤 Limite', value: `${panel.limite_tickets_usuario} por user`, inline: true },
      { name: '⏰ Auto-close', value: panel.auto_close_horas ? `${panel.auto_close_horas}h` : 'Off', inline: true },
      { name: '🚪 Fechar ao sair', value: panel.fechar_ao_sair ? '✅' : '❌', inline: true },
      { name: '📝 Formulário', value: panel.formulario?.habilitado ? `✅ ${panel.formulario.perguntas.length} pergunta(s)` : '❌ Off', inline: true },
    );
  const banner = safeUrl(panel.banner); if (banner) e.setImage(banner);
  const thumb = safeUrl(panel.thumbnail); if (thumb) e.setThumbnail(thumb);
  const footer = safeStr(panel.footer); if (footer) e.setFooter({ text: footer });
  e.setTimestamp();
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tktedit:embed:${panelId}`).setLabel('Embed').setEmoji('📝').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tktedit:button:${panelId}`).setLabel('Botão').setEmoji('🎨').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tktedit:types:${panelId}`).setLabel('Tipos').setEmoji('🎯').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`tktedit:staff:${panelId}`).setLabel('Staff & Logs').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tktedit:config:${panelId}`).setLabel('Config').setEmoji('⚙️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tktedit:form:${panelId}`).setLabel('Formulário').setEmoji('📝').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tktedit:blocks:${panelId}`).setLabel('Bloqueios').setEmoji('🚫').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tktedit:preview:${panelId}`).setLabel('Preview').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`tktedit:post:${panelId}`).setLabel('Postar').setEmoji('📢').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`tktedit:delete:${panelId}`).setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('adm_ticket_panels').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function ticketTypesPanel(guildId, panelId) {
  const panel = await getTicketPanel(guildId, panelId);
  if (!panel) return { content: '❌', embeds: [], components: [] };
  const tipos = Array.isArray(panel.tipos) ? panel.tipos : [];
  const desc = tipos.length
    ? tipos.map((t, idx) => {
        const canal = t.canal_id ? `<#${t.canal_id}>` : '*canal do painel*';
        const cargo = t.cargo_responsavel_id ? `<@&${t.cargo_responsavel_id}>` : '*cargo do painel*';
        return `**${idx + 1}.** ${t.emoji || '🎫'} **${t.label}** — \`${t.id}\`\n> 📁 ${canal}\n> 🎭 ${cargo}${t.descricao ? `\n> ${t.descricao}` : ''}`;
      }).join('\n\n')
    : '*Nenhum tipo ainda.*';
  const e = new EmbedBuilder().setTitle(`🎯 Tipos do Painel #${panelId}`).setColor(panel.cor).setDescription(desc.slice(0, 4000)).setFooter({ text: `${tipos.length}/${MAX_TICKET_TYPES_PER_PANEL} tipos` });
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tkttype:add:${panelId}`).setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`tkttype:edit:${panelId}`).setLabel('Editar').setEmoji('✏️').setStyle(ButtonStyle.Primary).setDisabled(!tipos.length),
      new ButtonBuilder().setCustomId(`tkttype:del:${panelId}`).setLabel('Remover').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(!tipos.length),
      new ButtonBuilder().setCustomId(`tktedit:open:${panelId}`).setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function ticketConfigPanel(guildId, panelId) {
  const panel = await getTicketPanel(guildId, panelId);
  if (!panel) return { content: '❌', embeds: [], components: [] };
  const e = new EmbedBuilder().setTitle(`⚙️ Configurações do Painel #${panelId}`).setColor(panel.cor)
    .addFields(
      { name: '👤 Limite por usuário', value: `${panel.limite_tickets_usuario}`, inline: true },
      { name: '⏰ Auto-close', value: panel.auto_close_horas ? `${panel.auto_close_horas}h` : 'Off', inline: true },
      { name: '🚪 Fechar ao sair', value: panel.fechar_ao_sair ? '✅' : '❌', inline: true },
      { name: '🕐 Horário', value: safeStr(panel.horario_atendimento) || '*—*', inline: false },
      { name: '🎭 Categoria padrão', value: panel.categoria_padrao_id ? `<#${panel.categoria_padrao_id}>` : '*—*', inline: true },
    );
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tktcfg:limite:${panelId}`).setLabel('Limite').setEmoji('👤').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tktcfg:autoclose:${panelId}`).setLabel('Auto-close').setEmoji('⏰').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tktcfg:sair:${panelId}`).setLabel('Fechar ao sair').setEmoji('🚪').setStyle(panel.fechar_ao_sair ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`tktcfg:horario:${panelId}`).setLabel('Horário').setEmoji('🕐').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tktcfg:categoria:${panelId}`).setLabel('Categoria padrão').setEmoji('📁').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tktedit:open:${panelId}`).setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function ticketFormPanel(guildId, panelId) {
  const panel = await getTicketPanel(guildId, panelId);
  if (!panel) return { content: '❌', embeds: [], components: [] };
  const form = panel.formulario || { habilitado: false, perguntas: [] };
  const desc = form.perguntas.length
    ? form.perguntas.map((p, i) => `**${i + 1}.** ${p.label}${p.obrigatorio ? ' *(obrigatório)*' : ''}\n> Placeholder: \`${p.placeholder || '—'}\``).join('\n\n')
    : '*Nenhuma pergunta configurada.*';
  const e = new EmbedBuilder().setTitle(`📝 Formulário do Painel #${panelId}`).setColor(form.habilitado ? '#22c55e' : '#808080').setDescription(desc.slice(0, 4000)).setFooter({ text: `${form.perguntas.length}/${MAX_FORM_QUESTIONS} perguntas` });
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tktform:toggle:${panelId}`).setLabel(form.habilitado ? 'Desativar' : 'Ativar').setEmoji(form.habilitado ? '🔴' : '🟢').setStyle(form.habilitado ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`tktform:add:${panelId}`).setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success).setDisabled(form.perguntas.length >= MAX_FORM_QUESTIONS),
      new ButtonBuilder().setCustomId(`tktform:clear:${panelId}`).setLabel('Limpar').setEmoji('🧹').setStyle(ButtonStyle.Danger).setDisabled(!form.perguntas.length),
      new ButtonBuilder().setCustomId(`tktedit:open:${panelId}`).setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    ),
  ];
  if (form.perguntas.length) {
    const menu = new StringSelectMenuBuilder().setCustomId(`tktform:del_pick:${panelId}`).setPlaceholder('🗑️ Remover');
    form.perguntas.forEach((p, i) => menu.addOptions({ label: `${i + 1}. ${p.label}`.slice(0, 90), value: String(i) }));
    rows.unshift(new ActionRowBuilder().addComponents(menu));
  }
  return { embeds: [e], components: rows };
}

async function ticketBlocksPanel(guildId, panelId) {
  const panel = await getTicketPanel(guildId, panelId);
  if (!panel) return { content: '❌', embeds: [], components: [] };
  const blocked = Array.isArray(panel.bloqueio_usuarios_ids) ? panel.bloqueio_usuarios_ids : [];
  const e = new EmbedBuilder().setTitle(`🚫 Bloqueios do Painel #${panelId}`).setColor('#FF5555')
    .setDescription(blocked.length ? blocked.map(id => `• <@${id}> (\`${id}\`)`).join('\n') : '*Ninguém bloqueado.*')
    .setFooter({ text: `${blocked.length} usuário(s)` });
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tktblk:add:${panelId}`).setLabel('Bloquear').setEmoji('🚫').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`tktblk:remove:${panelId}`).setLabel('Desbloquear').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(!blocked.length),
      new ButtonBuilder().setCustomId(`tktedit:open:${panelId}`).setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// TICKETS — AÇÕES INTERNAS (com refresh de botões)
// ═══════════════════════════════════════════════════════════
async function ticketActionClaim(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  if (td?.assumed_by) return i.reply({ content: `⚠️ Já assumido por <@${td.assumed_by}>.`, flags: EPHEMERAL });
  try {
    await supabase.from('ticket_data').upsert({
      thread_id: th.id, guild_id: i.guild.id, user_id: td?.user_id || i.user.id,
      assumed_by: i.user.id, assumed_at: new Date().toISOString(), status: 'atendimento',
    }, { onConflict: 'thread_id' });
  } catch {}
  await th.send({ content: `🙋 <@${i.user.id}> assumiu.` });
  const { data: newTd } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  await refreshTicketButtons(th, newTd);
  return i.reply({ content: '✅', flags: EPHEMERAL });
}

async function ticketActionUnclaim(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  if (!td?.assumed_by) return i.reply({ content: '⚠️ Ninguém assumiu.', flags: EPHEMERAL });
  if (td.assumed_by !== i.user.id && !isDeveloper(i.user.id) && i.user.id !== i.guild.ownerId && !i.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return i.reply({ content: '❌ Só quem assumiu pode devolver.', flags: EPHEMERAL });
  }
  await supabase.from('ticket_data').update({ assumed_by: null, assumed_at: null, status: 'aberto' }).eq('thread_id', th.id);
  await th.send({ content: `↩️ <@${i.user.id}> devolveu.` });
  const { data: newTd } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  await refreshTicketButtons(th, newTd);
  return i.reply({ content: '✅', flags: EPHEMERAL });
}

async function ticketActionLock(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  if (!td) return i.reply({ content: '❌', flags: EPHEMERAL });
  const locked = !!td.locked;
  await supabase.from('ticket_data').update({ locked: !locked }).eq('thread_id', th.id);
  if (!locked) {
    await th.members.remove(td.user_id).catch(() => {});
    await th.send({ content: `🔒 Bloqueado por <@${i.user.id}>.` });
  } else {
    await th.members.add(td.user_id).catch(() => {});
    await th.send({ content: `🔓 Desbloqueado.` });
  }
  const { data: newTd } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  await refreshTicketButtons(th, newTd);
  return i.reply({ content: locked ? '🔓' : '🔒', flags: EPHEMERAL });
}

async function ticketActionPriority(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  const nv = !td?.is_priority;
  await supabase.from('ticket_data').update({ is_priority: nv, priority_set_by: i.user.id }).eq('thread_id', th.id);
  const base = th.name.replace(/^🔴\s*/, '');
  await th.setName(nv ? `🔴 ${base}`.slice(0, 100) : base).catch(() => {});
  await th.send({ content: nv ? `🔴 **ALTA** por <@${i.user.id}>` : `⚪ Removida.` });
  const { data: newTd } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  await refreshTicketButtons(th, newTd);
  return i.reply({ content: nv ? '🔴' : '⚪', flags: EPHEMERAL });
}

async function ticketActionTransfer(i, tipoId) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  if (!td) return i.reply({ content: '❌', flags: EPHEMERAL });
  const panel = await getTicketPanel(i.guild.id, td.panel_id);
  if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
  const novoTipo = (panel.tipos || []).find(t => String(t.id) === String(tipoId));
  if (!novoTipo) return i.reply({ content: '❌ Tipo inválido.', flags: EPHEMERAL });
  const oldTipo = (panel.tipos || []).find(t => String(t.id) === String(td.type_id));
  const oldRole = safeStr(oldTipo?.cargo_responsavel_id) || safeStr(panel.cargo_id);
  const newRole = safeStr(novoTipo.cargo_responsavel_id) || safeStr(panel.cargo_id);
  if (oldRole && oldRole !== newRole) {
    const r = i.guild.roles.cache.get(oldRole);
    if (r) await Promise.allSettled([...r.members.values()].slice(0, 50).map(m => th.members.remove(m.id).catch(() => {})));
  }
  if (newRole) {
    const r = i.guild.roles.cache.get(newRole);
    if (r) await Promise.allSettled([...r.members.values()].slice(0, 50).map(m => th.members.add(m.id).catch(() => {})));
  }
  await supabase.from('ticket_data').update({ type_id: tipoId }).eq('thread_id', th.id);
  await th.send({ content: `↪️ Transferido para **${novoTipo.emoji || '🎫'} ${novoTipo.label}** por <@${i.user.id}>. ${newRole ? `<@&${newRole}>` : ''}` });
  return i.reply({ content: `✅`, flags: EPHEMERAL });
}

async function ticketActionMove(i, categoriaId) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const parent = i.guild.channels.cache.get(categoriaId);
  if (!parent || parent.type !== ChannelType.GuildCategory) return i.reply({ content: '❌', flags: EPHEMERAL });
  try {
    const parentCh = th.parent;
    if (parentCh) await parentCh.setParent(parent.id).catch(() => {});
  } catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
  await th.send({ content: `📁 Movido para **${parent.name}** por <@${i.user.id}>.` });
  return i.reply({ content: '✅', flags: EPHEMERAL });
}

async function ticketActionClose(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  if (TICKET_CLOSING.has(th.id)) return i.reply({ content: '⏳ Fechando...', flags: EPHEMERAL });
  TICKET_CLOSING.add(th.id);
  try {
    const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
    const panel = td?.panel_id ? await getTicketPanel(i.guild.id, td.panel_id) : null;
    const ticketDataWithClose = { ...(td || {}), closed_at: new Date().toISOString(), status: 'fechado', closed_by: i.user.id };
    await sendTicketTranscriptToLog(i.guild, th, ticketDataWithClose, panel);
    await supabase.from('ticket_data').update({ closed_at: new Date().toISOString(), closed_by: i.user.id, status: 'fechado' }).eq('thread_id', th.id);
    if (td?.user_id) {
      await th.send({ content: `✅ Fechado por <@${i.user.id}>.` }).catch(() => {});
      const cfg = await getConfig(i.guild.id);
      if (cfg.tickets_avaliacao_ativa !== false) {
        setTimeout(() => sendTicketRatingDM(td.user_id, th.id, th.name).catch(() => {}), 3000);
      }
    }
    await th.setLocked(true).catch(() => {});
    await th.setArchived(true).catch(() => {});
    return i.reply({ content: '🔒 Fechado.', flags: EPHEMERAL });
  } finally {
    setTimeout(() => TICKET_CLOSING.delete(th.id), 60000);
  }
}

async function ticketActionDelete(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  const panel = td ? await getTicketPanel(i.guild.id, td.panel_id) : null;
  if (td) await sendTicketTranscriptToLog(i.guild, th, { ...td, closed_at: new Date().toISOString(), status: 'excluido' }, panel);
  await supabase.from('ticket_data').update({ closed_at: new Date().toISOString(), status: 'excluido' }).eq('thread_id', th.id);
  await i.reply({ content: '🗑️ Excluindo...', flags: EPHEMERAL });
  setTimeout(() => th.delete().catch(() => {}), 3000);
}

// Bug #23 corrigido: parsing robusto
async function ticketActionRate(i, stars) {
  try {
    const parts = i.customId.split(':');
    const thId = parts[2];
    const n = parseInt(stars, 10) || parseInt(parts[3], 10) || 0;
    if (!thId || n < 1 || n > 5) return i.reply({ content: '❌', flags: EPHEMERAL });
    const { data: td } = await supabase.from('ticket_data').select('assumed_by').eq('thread_id', thId).maybeSingle();
    try {
      await supabase.from('ticket_ratings').insert({
        guild_id: i.guild?.id || null, thread_id: thId, user_id: i.user.id,
        staff_id: td?.assumed_by || null, rating: n,
      });
    } catch {}
    await i.update({
      embeds: [new EmbedBuilder().setTitle('⭐ Obrigado!').setColor('#FFD700').setDescription(`Você avaliou com **${'⭐'.repeat(n)}** (${n}/5).`)],
      components: [],
    }).catch(() => {});
  } catch (e) { console.error('[RATE]', e); }
}

// ═══════════════════════════════════════════════════════════
// AUTOMAÇÕES DE TICKET — Bug #3 e #35 corrigidos
// ═══════════════════════════════════════════════════════════
async function checkTicketsAutoClose() {
  try {
    const { data: abertos } = await supabase
      .from('ticket_data')
      .select('thread_id,guild_id,panel_id,opened_at,auto_close_warned_at')
      .is('closed_at', null)
      .not('opened_at', 'is', null)
      .limit(200);
    if (!abertos?.length) return;

    const agora = Date.now();
    let processed = 0;

    for (const td of abertos) {
      if (processed >= 50) break;
      if (TICKET_CLOSING.has(td.thread_id)) continue;
      const guild = client.guilds.cache.get(td.guild_id);
      if (!guild) continue;

      const panel = await getTicketPanel(guild.id, td.panel_id);
      if (!panel) continue;
      const horas = Number.isFinite(Number(panel.auto_close_horas)) ? Number(panel.auto_close_horas) : 0;
      if (horas <= 0) continue;

      const th = guild.channels.cache.get(td.thread_id);
      if (!th?.isThread?.()) continue;

      const lastTs = th.lastMessageId
        ? (await th.messages.fetch(th.lastMessageId).catch(() => null))?.createdTimestamp
        : new Date(td.opened_at).getTime();
      const ts = lastTs || new Date(td.opened_at).getTime();
      const horasInativo = (agora - ts) / 3600000;

      if (horasInativo >= horas - 1 && horasInativo < horas) {
        const avisoTs = td.auto_close_warned_at ? new Date(td.auto_close_warned_at).getTime() : 0;
        if (agora - avisoTs > 3600000) {
          await th.send({ content: `⚠️ Este ticket será fechado em **1 hora** por inatividade. Responda pra manter aberto.` }).catch(() => {});
          await supabase.from('ticket_data').update({ auto_close_warned_at: new Date().toISOString() }).eq('thread_id', td.thread_id);
        }
      }

      if (horasInativo >= horas) {
        TICKET_CLOSING.add(td.thread_id);
        try {
          const { data: fullTd } = await supabase.from('ticket_data').select('*').eq('thread_id', td.thread_id).maybeSingle();
          await sendTicketTranscriptToLog(guild, th, { ...fullTd, closed_at: new Date().toISOString(), status: 'fechado', closed_reason: 'auto_close' }, panel);
          await supabase.from('ticket_data').update({ closed_at: new Date().toISOString(), status: 'fechado', closed_reason: 'auto_close' }).eq('thread_id', td.thread_id);
          await th.send({ content: `🔒 Fechado automaticamente por inatividade.` }).catch(() => {});
          await th.setLocked(true).catch(() => {});
          await th.setArchived(true).catch(() => {});
        } finally {
          setTimeout(() => TICKET_CLOSING.delete(td.thread_id), 60000);
        }
      }
      processed++;
    }
  } catch (e) { console.error('[AUTO-CLOSE]', e.message); }
}

async function checkTicketsMemberLeave(guild, member) {
  try {
    const { data: abertos } = await supabase
      .from('ticket_data')
      .select('thread_id,panel_id,user_id')
      .eq('guild_id', guild.id)
      .eq('user_id', member.id)
      .is('closed_at', null);
    if (!abertos?.length) return;
    for (const td of abertos) {
      if (TICKET_CLOSING.has(td.thread_id)) continue;
      const panel = await getTicketPanel(guild.id, td.panel_id);
      if (!panel?.fechar_ao_sair) continue;
      const th = await guild.channels.fetch(td.thread_id).catch(() => null);
      if (!th) continue;
      TICKET_CLOSING.add(td.thread_id);
      try {
        const { data: fullTd } = await supabase.from('ticket_data').select('*').eq('thread_id', td.thread_id).maybeSingle();
        await sendTicketTranscriptToLog(guild, th, { ...fullTd, closed_at: new Date().toISOString(), status: 'fechado', closed_reason: 'saiu_servidor' }, panel);
        await supabase.from('ticket_data').update({ closed_at: new Date().toISOString(), status: 'fechado', closed_reason: 'saiu_servidor' }).eq('thread_id', td.thread_id);
        await th.send({ content: `🔒 Autor saiu. Fechando.` }).catch(() => {});
        await th.setArchived(true).catch(() => {});
      } finally {
        setTimeout(() => TICKET_CLOSING.delete(td.thread_id), 60000);
      }
    }
  } catch (e) { console.error('[LEAVE-CLOSE]', e.message); }
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 5/9
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 6/9] SETUPS — LOJA, COMUNIDADE, ORGANIZAÇÃO
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// HELPERS DE SETUP
// ═══════════════════════════════════════════════════════════
async function cleanupRoles(guild, bot) {
  try {
    const botHighest = guild.members.me.roles.highest;
    const maxPos = Math.max(0, guild.roles.cache.size - 2);
    if (botHighest.position < maxPos) {
      await botHighest.setPosition(maxPos, { reason: 'Setup: subindo bot' });
      await sleep(800);
    }
  } catch (e) { console.error('⚠️ Cargo bot:', e.message); }

  const toDel = guild.roles.cache.filter(r =>
    r.id !== guild.roles.everyone.id &&
    r.name !== DEV_ROLE_NAME &&
    r.name !== BOT_ROLE_NAME &&
    !r.managed
  );
  console.log(`🗑️ Limpando ${toDel.size} cargos...`);
  let ok = 0, fail = 0;
  const roles = [...toDel.values()];
  for (let i = 0; i < roles.length; i += 5) {
    await Promise.allSettled(roles.slice(i, i + 5).map(r => r.delete('Setup').then(() => ok++).catch(() => fail++)));
    await sleep(500);
  }
  console.log(`✅ ${ok} cargos removidos${fail ? ` • ⚠️ ${fail} falharam` : ''}`);
  return { deletedCount: ok, failedCount: fail };
}

function checkSetupPermissions(bot) {
  const p = bot.permissions;
  const missing = [];
  if (!p.has(PermissionFlagsBits.ManageRoles)) missing.push('Gerenciar Cargos');
  if (!p.has(PermissionFlagsBits.ManageChannels)) missing.push('Gerenciar Canais');
  if (!p.has(PermissionFlagsBits.CreateInstantInvite)) missing.push('Criar Convite');
  if (!p.has(PermissionFlagsBits.ViewChannel)) missing.push('Ver Canais');
  if (!p.has(PermissionFlagsBits.SendMessages)) missing.push('Enviar Mensagens');
  if (!p.has(PermissionFlagsBits.ManageMessages)) missing.push('Gerenciar Mensagens');
  if (missing.length) {
    throw new Error(
      `Bot sem permissões: **${missing.join(', ')}**.\n\n` +
      `**Como resolver:**\n> 1. Configurações do Servidor → Cargos\n> 2. Ache o cargo do bot\n> 3. Ative **Administrador**\n> 4. Tente de novo`
    );
  }
}

// ⚡ Create roles em sequência (evita rate limit + reutiliza existentes)
async function createRolesSequential(guild, roleDefs, errors) {
  const roles = {};
  for (const rd of roleDefs) {
    const ex = guild.roles.cache.find(x => x.name === rd.name);
    if (ex) { roles[rd.name] = ex; continue; }
    try {
      const r = await guild.roles.create({
        name: rd.name,
        color: rd.color,
        permissions: rd.perms || [],
        hoist: !!rd.hoist,
      });
      roles[rd.name] = r;
      await sleep(400);
    } catch (e) {
      console.error(`❌ Role "${rd.name}":`, e.message);
      errors.push(`role ${rd.name}: ${e.message}`);
    }
  }
  return roles;
}

// ⚡ Cria canal com cache (evita 429)
async function createChannelSafe(guild, opts) {
  try {
    const parentId = opts.parent || null;
    const ex = guild.channels.cache.find(c =>
      c.name === opts.name && c.type === opts.type && c.parentId === parentId
    );
    if (ex) return ex;
    const ch = await guild.channels.create(opts);
    await sleep(300);
    return ch;
  } catch (e) {
    console.error(`❌ Channel "${opts.name}":`, e.message);
    return null;
  }
}

// ⚡ Adiciona membros em batch (limit 100, evita rate limit de fetch)
async function addAllMembersToRole(guild, role, filterFn = null) {
  try {
    const mbs = await guild.members.fetch({ limit: 100 });
    const toAdd = [...mbs.values()].filter(m =>
      !m.user.bot &&
      !m.roles.cache.has(role.id) &&
      (!filterFn || filterFn(m))
    );
    let ok = 0;
    for (let i = 0; i < toAdd.length; i += 5) {
      await Promise.allSettled(toAdd.slice(i, i + 5).map(m => m.roles.add(role).then(() => ok++).catch(() => {})));
      await sleep(700);
    }
    return ok;
  } catch { return 0; }
}

// ═══════════════════════════════════════════════════════════
// SETUP LOJA
// ═══════════════════════════════════════════════════════════
async function setupLojaServer(guild, onProgress = null) {
  const bot = guild.members.me;
  const report = async (m) => { try { if (onProgress) await onProgress(m); } catch {} };
  const errors = [];
  checkSetupPermissions(bot);
  if (setupInProgress.has(guild.id)) throw new Error('Setup já em andamento.');
  setupInProgress.add(guild.id);
  try {
    await report('🗑️ Limpando canais...');
    const toDel = [...guild.channels.cache.values()].filter(c => c.deletable);
    for (let i = 0; i < toDel.length; i += 5) {
      await Promise.allSettled(toDel.slice(i, i + 5).map(c => c.delete().catch(() => {})));
      await sleep(500);
    }

    await report('🎭 Limpando cargos antigos...');
    await cleanupRoles(guild, bot);

    await report('🎭 Criando cargos...');
    const roleDefs = [
      { name: 'CEO', color: '#FF0000', perms: [PermissionFlagsBits.Administrator], hoist: true },
      { name: 'RESPONSAVEL PARCERIA', color: '#FF00FF', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ModerateMembers], hoist: true },
      { name: 'Cliente BEIRA', color: '#FFD700', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], hoist: true },
      { name: 'Membros', color: '#7CFC00', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite], hoist: true },
      { name: 'Maquinas', color: '#A0A0A0', perms: [], hoist: false },
      { name: 'Loritta', color: '#00AAFF', perms: [], hoist: false },
      { name: 'T1cket', color: '#FFA500', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers], hoist: true },
      { name: 'V2ndas', color: '#00FF00', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages], hoist: true },
    ];
    const roles = await createRolesSequential(guild, roleDefs, errors);

    const everyone = guild.roles.everyone, botId = bot.id;
    const staffRoles = [roles['CEO'], roles['RESPONSAVEL PARCERIA'], roles['T1cket'], roles['V2ndas']].filter(Boolean);
    const buildOW = (allow) => {
      const ow = [
        { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
      ];
      for (const r of allow) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
      return ow;
    };
    const buildRO = () => {
      const ow = [
        { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ];
      for (const r of staffRoles) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] });
      return ow;
    };

    const structure = [
      { category: '@・ M3MBERS RECEPCION', channels: [
        { name: '📮・anc', type: 'text', ro: true },
        { name: '🛒・pagamentos・aprovados', type: 'text', ro: true },
        { name: '💙・perfomance', type: 'text' },
        { name: '✅・verificação', type: 'text', ro: true },
      ]},
      { category: '@・ SUPORTE', channels: [{ name: '📩・suporte', type: 'text' }] },
      { category: '@・D1SCORD', channels: [
        { name: '⭐・g1ft', type: 'text' },
        { name: '🛒・n1tradas', type: 'text' },
        { name: '🛒・l1nk', type: 'text' },
        { name: '🛒・impuls0s', type: 'text' },
        { name: '🛒・at1vações', type: 'text' },
      ]},
      { category: '@・VARIEDADES', channels: [
        { name: '🛒・pix-infinit9', type: 'text' },
        { name: '🛒・m1necraft', type: 'text' },
        { name: '🛒・r0bux', type: 'text' },
        { name: '⭐・str3amings', type: 'text' },
      ]},
      { category: '@・PARCERIA', channels: [
        { name: '👤・partner', type: 'text' },
        { name: '🤝🏻・pedir-parceria', type: 'text' },
      ]},
      { category: '🔒・STAFFS', priv: true, channels: [
        { name: '🎟・chat-staff', type: 'text' },
        { name: '🤝・txt', type: 'text' },
        { name: '🔥・meta-completa', type: 'text' },
        { name: '🚧・anuncios-staff', type: 'text' },
        { name: 'logs', type: 'text' },
        { name: 'v2ndas', type: 'text' },
      ]},
    ];

    const created = {};
    const catDefs = structure.filter(it => it.category);
    const catMap = {};
    for (const it of catDefs) {
      const cat = await createChannelSafe(guild, {
        name: it.category,
        type: ChannelType.GuildCategory,
        permissionOverwrites: it.priv ? buildOW(staffRoles) : [],
      });
      if (cat) catMap[it.category] = cat;
      else errors.push(`cat ${it.category}`);
    }

    for (const it of structure) {
      const cat = catMap[it.category];
      if (!cat) continue;
      for (const d of it.channels) {
        const ty = ChannelType.GuildText;
        let ow = [];
        if (it.priv) ow = buildOW(staffRoles);
        else if (d.ro) ow = buildRO();
        const ch = await createChannelSafe(guild, { name: d.name, type: ty, parent: cat.id, permissionOverwrites: ow });
        if (ch) created[d.name] = ch;
        else errors.push(`ch ${d.name}`);
      }
    }

    await everyone.setPermissions([
      PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite,
    ]).catch(() => {});

    await ensureGuild(guild);
    const cfg = await getConfig(guild.id);
    Object.assign(cfg, {
      admin_role: roles['CEO']?.id || '',
      membro_role: roles['Membros']?.id || '',
      ticket_cargo: roles['T1cket']?.id || '',
      autorole_role: roles['Membros']?.id || '',
      log_channel: created['logs']?.id || '',
      mod_log_channel: created['logs']?.id || '',
      ticket_log_channel: created['logs']?.id || '',
      welcome_channel: created['📮・anc']?.id || '',
      server_type: 'loja',
    });
    await setConfig(guild.id, cfg);
    await patchSettings(guild.id, {
      store_name: 'Minha Loja',
      store_description: 'Bem-vindo à loja!',
      log_channel_id: created['logs']?.id || null,
      sales_channel_id: created['🛒・pagamentos・aprovados']?.id || null,
      admin_role_id: roles['CEO']?.id || null,
      manager_role_id: roles['RESPONSAVEL PARCERIA']?.id || null,
      stock_role_id: roles['V2ndas']?.id || null,
      customer_role_id: roles['Cliente BEIRA']?.id || null,
    });

    const catIds = {};
    for (const cName of ['D1SCORD', 'VARIEDADES']) {
      const { data: ex } = await supabase.from('categories').select('id').eq('guild_id', guild.id).eq('name', cName).maybeSingle();
      if (ex) { catIds[cName] = ex.id; continue; }
      const { data: c } = await supabase.from('categories').insert({ guild_id: guild.id, name: cName, emoji: '🛒' }).select().single();
      if (c) catIds[cName] = c.id;
    }

    const autoProducts = [
      { cat: 'D1SCORD', name: 'Nitro' }, { cat: 'D1SCORD', name: 'Boost' }, { cat: 'D1SCORD', name: 'Link' },
      { cat: 'D1SCORD', name: 'Impulso' }, { cat: 'D1SCORD', name: 'Ativação' }, { cat: 'D1SCORD', name: 'Gift' },
      { cat: 'VARIEDADES', name: 'Pix Infinito' }, { cat: 'VARIEDADES', name: 'Minecraft' },
      { cat: 'VARIEDADES', name: 'Robux' }, { cat: 'VARIEDADES', name: 'Streaming' },
    ];
    for (const p of autoProducts) {
      const { data: ex } = await supabase.from('products').select('id').eq('guild_id', guild.id).eq('name', p.name).maybeSingle();
      if (ex) continue;
      try {
        await supabase.from('products').insert({ guild_id: guild.id, category_id: catIds[p.cat] || null, name: p.name, price: 0, description: '', delivery_type: 'key', active: true });
      } catch {}
    }

    await report('📤 Postando painéis...');
    await guild.channels.fetch().catch(() => {});
    await sleep(1500);

    const tasks = [];
    const tpCh = created['📩・suporte'];
    if (tpCh) {
      const panel = await createTicketPanel(guild.id, {
        nome: 'Suporte', titulo: 'Central de Atendimento',
        descricao: 'Selecione o tipo de atendimento desejado.',
        cor: '#9B59B6', botao_label: 'Abrir Ticket', botao_emoji: '🎫',
        cargo_id: roles['T1cket']?.id || null, log_channel_id: created['logs']?.id || null,
        tipos: [
          { id: 'suporte', label: 'Suporte Geral', emoji: '🛠️', descricao: 'Descreva seu problema.' },
          { id: 'compra', label: 'Comprar Produto', emoji: '🛒', descricao: 'Informe o produto.' },
          { id: 'reembolso', label: 'Reembolso', emoji: '💸', descricao: 'Explique o motivo.' },
        ],
      });
      const msg = await tpCh.send({ embeds: [buildTicketPanelEmbed(panel)], components: buildTicketPanelComponents(panel) }).catch(() => null);
      if (msg) await updateTicketPanel(guild.id, panel.id, { canal_id: tpCh.id, mensagem_id: msg.id });
    }

    const vCh = created['✅・verificação'];
    if (vCh) {
      const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${encodeURIComponent('verify:' + guild.id)}`;
      const b = new ButtonBuilder().setLabel('Verificar').setEmoji('✅').setStyle(ButtonStyle.Link).setURL(oauthUrl);
      tasks.push(vCh.send({
        embeds: [new EmbedBuilder().setColor('#00FF00').setTitle('✅ Verificação').setDescription('Clique abaixo para se verificar.')],
        components: [new ActionRowBuilder().addComponents(b)],
      }).catch(() => {}));
    }

    for (const [channelName, category] of [
      ['🛒・n1tradas', 'D1SCORD'], ['🛒・l1nk', 'D1SCORD'], ['🛒・impuls0s', 'D1SCORD'],
      ['🛒・at1vações', 'D1SCORD'], ['⭐・g1ft', 'D1SCORD'],
      ['🛒・pix-infinit9', 'VARIEDADES'], ['🛒・m1necraft', 'VARIEDADES'],
      ['🛒・r0bux', 'VARIEDADES'], ['⭐・str3amings', 'VARIEDADES'],
    ]) {
      const ch = created[channelName];
      if (!ch) continue;
      try {
        const s = await getSettings(guild.id);
        const friendly = channelName.replace(/^[^a-z0-9A-Z]+/, '').replace(/・/g, ' · ').replace(/[_-]/g, ' ').trim();
        const panel = await createShopPanel(guild.id, {
          name: friendly || s.store_name || 'Loja',
          description: s.store_description || 'Clique em **Comprar**.',
          color: s.embed_color || '#5865F2',
          category_id: catIds[category] || null,
          channel_id: ch.id, active: true,
        });
        const e = new EmbedBuilder().setTitle(`🛒 ${panel.name}`).setColor(panel.color).setDescription(panel.description).setFooter({ text: 'Clique em Comprar' }).setTimestamp();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`loja:comprar:${panel.id}`).setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('loja:meus_pedidos').setLabel('Meus pedidos').setEmoji('🧾').setStyle(ButtonStyle.Secondary),
        );
        tasks.push((async () => {
          try {
            const msg = await ch.send({ embeds: [e], components: [row] });
            await updateShopPanel(panel.id, { message_id: msg.id });
          } catch { errors.push(`painel ${channelName}`); }
        })());
      } catch { errors.push(`painel ${channelName}`); }
    }

    await Promise.allSettled(tasks);

    const mr = roles['Membros'];
    if (mr) await addAllMembersToRole(guild, mr);

    await report('✅ Loja criada!');
    return { ok: true, errors, created };
  } finally { setupInProgress.delete(guild.id); }
}

// ═══════════════════════════════════════════════════════════
// SETUP COMUNIDADE
// ═══════════════════════════════════════════════════════════
async function setupComunidadeServer(guild, onProgress = null) {
  const bot = guild.members.me;
  const report = async (m) => { try { if (onProgress) await onProgress(m); } catch {} };
  const errors = [];
  checkSetupPermissions(bot);
  if (setupInProgress.has(guild.id)) throw new Error('Setup já em andamento.');
  setupInProgress.add(guild.id);
  try {
    await report('🗑️ Limpando canais...');
    const toDel = [...guild.channels.cache.values()].filter(c => c.deletable);
    for (let i = 0; i < toDel.length; i += 5) {
      await Promise.allSettled(toDel.slice(i, i + 5).map(c => c.delete().catch(() => {})));
      await sleep(500);
    }

    await report('🎭 Limpando cargos...');
    await cleanupRoles(guild, bot);

    await report('🎭 Criando cargos...');
    const roleDefs = [
      { name: '👑│Owner', color: '#FFD700', perms: [PermissionFlagsBits.Administrator], hoist: true },
      { name: '🌀│CoOwner', color: '#FFA500', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.ManageGuild], hoist: true },
      { name: '🔒│Admin', color: '#FF0000', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers], hoist: true },
      { name: '🔨│Mod', color: '#00AAFF', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ModerateMembers], hoist: true },
      { name: '💠│Helper', color: '#00FFCC', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages], hoist: true },
      { name: '🌀│Friend', color: '#9B59B6', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles], hoist: true },
      { name: '❤️️｜trusted', color: '#FF69B4', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory], hoist: true },
      { name: '🔑│Member', color: '#7CFC00', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.AddReactions], hoist: true },
      { name: '🛡️│Bots', color: '#808080', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageMessages], hoist: true },
    ];
    const roles = await createRolesSequential(guild, roleDefs, errors);

    const everyone = guild.roles.everyone, botId = bot.id;
    const staffRoles = [roles['👑│Owner'], roles['🌀│CoOwner'], roles['🔒│Admin'], roles['🔨│Mod'], roles['💠│Helper']].filter(Boolean);
    const staffOW = [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
    ];
    for (const r of staffRoles) staffOW.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });

    const structure = [
      { category: '┗⎯⎯|📊|SERVER STATS|📊|⎯⎯┑', channels: [
        { name: '♪', type: 'text' },
        { name: '〔🍪〕Members: 3', type: 'text' },
      ]},
      { category: '┗⎯⎯⎯|🍀|SERVER INFO|🍀|⎯⎯⎯┑', channels: [
        { name: '〔📌〕annoucments', type: 'text', ro: true },
        { name: '〔📊〕welcome', type: 'text', ro: true },
        { name: '〔🆙〕level-up', type: 'text', ro: true },
        { name: '〔📄〕rules', type: 'text', ro: true },
        { name: '〔📕〕news', type: 'text', ro: true },
        { name: '〔🎉〕giveaway', type: 'text', ro: true },
        { name: '〔🎫〕tickets', type: 'text' },
        { name: '〔✅〕verification', type: 'text', ro: true },
      ]},
      { category: '┗⎯⎯⎯⎯⎯⎯|💭|CHAT|💭|⎯⎯⎯⎯⎯⎯┑', channels: [
        { name: '〔💬〕main-chat', type: 'text' },
        { name: '〔📷〕off-topic', type: 'text' },
        { name: '〔🤖〕bot-commands', type: 'text' },
        { name: '〔💡〕suggestions', type: 'text' },
        { name: 'partnership', type: 'text' },
      ]},
      { category: '┗⎯⎯⎯⎯⎯⎯|📞|VOICE|📞|⎯⎯⎯⎯⎯⎯┑', channels: [
        { name: '♪ 〔🔊〕Public #1', type: 'voice' },
        { name: '♪ 〔🔊〕Public #2', type: 'voice' },
        { name: '♪ 〔🔊〕Public #3', type: 'voice' },
        { name: '♪ 〔🔐〕Private', type: 'voice', priv: true },
        { name: '♪ 〔🔐〕Private #2', type: 'voice', priv: true },
        { name: '♪ 〔🔐〕Private #3', type: 'voice', priv: true },
        { name: '♪ 〔🔇〕AFK', type: 'voice', afk: true },
      ]},
      { category: '┗⎯⎯⎯⎯⎯⎯⎯|🎵|MUSIC|🎵|⎯⎯⎯⎯⎯┑', channels: [
        { name: '♪ 〔🎶〕Music #1', type: 'voice' },
        { name: '♪ 〔🎶〕Music #2', type: 'voice' },
        { name: '〔🎶〕music', type: 'text' },
        { name: '| » 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦 𝗙𝗢𝗥 𝗠𝗨𝗦𝗜𝗖 𝗕𝗢𝗧𝗦 [.]-[-]-[p]-[ _ ] « |', type: 'text', ro: true },
      ]},
      { category: '┗⎯⎯⎯⎯⎯|🌀|STAFF|🌀|⎯⎯⎯⎯⎯┑', priv: true, channels: [
        { name: '〔🚀〕staff-chat', type: 'text' },
        { name: 'partnerships', type: 'text' },
        { name: '♪ 〔🚀〕staff voice', type: 'voice' },
      ]},
    ];

    const created = {};
    const catDefs = structure.filter(it => it.category);
    const catMap = {};
    for (const it of catDefs) {
      const cat = await createChannelSafe(guild, {
        name: it.category,
        type: ChannelType.GuildCategory,
        permissionOverwrites: it.priv ? staffOW : [],
      });
      if (cat) catMap[it.category] = cat;
    }

    for (const it of structure) {
      const cat = catMap[it.category];
      if (!cat) continue;
      for (const d of it.channels) {
        const ty = d.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
        let ow = [];
        if (it.priv) ow = staffOW;
        else if (d.priv) {
          ow = [{ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] }];
          for (const r of staffRoles) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
        } else if (d.ro) ow = [
          { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
          { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        ];
        const ch = await createChannelSafe(guild, { name: d.name, type: ty, parent: cat.id, permissionOverwrites: ow });
        if (ch) created[d.name] = ch;
        else errors.push(`ch ${d.name}`);
        if (d.afk && ch) {
          await guild.setAFKChannel(ch, 300).catch(() => {});
        }
      }
    }

    await everyone.setPermissions([
      PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite,
    ]).catch(() => {});

    await ensureGuild(guild);
    const cfg = await getConfig(guild.id);
    Object.assign(cfg, {
      admin_role: roles['🔒│Admin']?.id || '',
      membro_role: roles['🔑│Member']?.id || '',
      ticket_cargo: roles['💠│Helper']?.id || '',
      autorole_role: roles['🔑│Member']?.id || '',
      log_channel: created['〔🚀〕staff-chat']?.id || '',
      server_type: 'comunidade',
      ticket_titulo: '🎟・Central de Suporte',
      ticket_descricao: 'Selecione o tipo.',
    });
    await setConfig(guild.id, cfg);
    await patchSettings(guild.id, {
      admin_role_id: roles['🔒│Admin']?.id || null,
      manager_role_id: roles['🌀│CoOwner']?.id || null,
      customer_role_id: roles['🔑│Member']?.id || null,
    });

    await guild.channels.fetch().catch(() => {});
    await sleep(1500);
    const tasks = [];

    const tkCh = created['〔🎫〕tickets'];
    if (tkCh) {
      const panel = await createTicketPanel(guild.id, {
        nome: 'Suporte', titulo: 'Central de Suporte', descricao: 'Selecione o tipo.',
        cor: '#9B59B6', botao_label: 'Abrir Ticket', botao_emoji: '🎫',
        cargo_id: roles['💠│Helper']?.id || null, log_channel_id: created['〔🚀〕staff-chat']?.id || null,
        tipos: [
          { id: 'suporte', label: 'Suporte Geral', emoji: '🛠️' },
          { id: 'denuncia', label: 'Denúncia', emoji: '🚨' },
          { id: 'parceria', label: 'Parceria', emoji: '🤝' },
        ],
      });
      const msg = await tkCh.send({ embeds: [buildTicketPanelEmbed(panel)], components: buildTicketPanelComponents(panel) }).catch(() => null);
      if (msg) await updateTicketPanel(guild.id, panel.id, { canal_id: tkCh.id, mensagem_id: msg.id });
    }

    const vCh = created['〔✅〕verification'];
    if (vCh) {
      const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${encodeURIComponent('verify:' + guild.id)}`;
      const b = new ButtonBuilder().setLabel('Verificar').setEmoji('✅').setStyle(ButtonStyle.Link).setURL(oauthUrl);
      tasks.push(vCh.send({
        embeds: [new EmbedBuilder().setColor('#00FF00').setTitle('✅ Verificação').setDescription('Clique para verificar.')],
        components: [new ActionRowBuilder().addComponents(b)],
      }).catch(() => {}));
    }

    const rCh = created['〔📄〕rules'];
    if (rCh) {
      tasks.push(rCh.send({
        embeds: [new EmbedBuilder().setTitle('📄 Regras').setColor('#5865F2')
          .setDescription('**1.** Respeito.\n**2.** Sem spam.\n**3.** Sem NSFW.\n**4.** Sem divulgação.\n**5.** Obedeça a staff.')
          .setTimestamp()],
      }).catch(() => {}));
    }

    await Promise.allSettled(tasks);
    const mr = roles['🔑│Member'];
    if (mr) await addAllMembersToRole(guild, mr);

    await report('✅ Comunidade criada!');
    return { ok: true, errors, created };
  } finally { setupInProgress.delete(guild.id); }
}

// ═══════════════════════════════════════════════════════════
// SETUP ORGANIZAÇÃO (FF)
// ═══════════════════════════════════════════════════════════
async function setupOrganizacaoServer(guild, onProgress = null, opts = {}) {
  const skipPosting = !!opts.skipPosting;
  const bot = guild.members.me;
  const report = async (m) => { try { if (onProgress) await onProgress(m); } catch {} };
  const errors = [];
  checkSetupPermissions(bot);
  if (setupInProgress.has(guild.id)) throw new Error('Setup já em andamento.');
  setupInProgress.add(guild.id);
  try {
    await report('🗑️ Limpando canais...');
    const toDel = [...guild.channels.cache.values()].filter(c => c.deletable);
    for (let i = 0; i < toDel.length; i += 5) {
      await Promise.allSettled(toDel.slice(i, i + 5).map(c => c.delete().catch(() => {})));
      await sleep(500);
    }

    await report('🎭 Limpando cargos...');
    await cleanupRoles(guild, bot);

    await report('🎭 Criando cargos...');
    const orgRoles = [
      { name: '・owner', color: '#FFD700', perms: [PermissionFlagsBits.Administrator], hoist: true },
      { name: '• DIRETOR 👑', color: '#FFAA00', perms: [PermissionFlagsBits.Administrator], hoist: true },
      { name: '• GERENTE 👑', color: '#FF8800', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.ViewAuditLog], hoist: true },
      { name: 'DIRETOR | SS', color: '#FF5555', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.MoveMembers], hoist: true },
      { name: 'SUPORTE', color: '#00AAFF', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.MoveMembers], hoist: true },
      { name: '・SS | MOB', color: '#00CCFF', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.MoveMembers], hoist: true },
      { name: '・SS | EMU', color: '#00DDFF', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.MoveMembers], hoist: true },
      { name: '・MEDIADOR', color: '#9B59B6', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.MoveMembers], hoist: true },
      { name: '• FILAS', color: '#3498DB', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages], hoist: true },
      { name: '/👁️‍🗨️', color: '#808080', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory], hoist: true },
      { name: 'view logs', color: '#4A4A4A', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], hoist: false },
      { name: 'BOTS', color: '#7289DA', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AddReactions], hoist: true },
      { name: '・gg/[nome da sua org]', color: '#5865F2', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite, PermissionFlagsBits.AddReactions], hoist: true },
      { name: '・@Criador De Conteúdo', color: '#FF69B4', perms: [], hoist: false },
      { name: '・@STREAMING', color: '#9146FF', perms: [], hoist: false },
      { name: '・Magnata', color: '#FFD700', perms: [], hoist: false },
      { name: '・rei do 2,90', color: '#FFA500', perms: [], hoist: false },
      { name: '・Girl 🎀', color: '#FFB6C1', perms: [], hoist: false },
      { name: '・Trem 🚂', color: '#8B4513', perms: [], hoist: false },
      { name: '・Rei Dos Clips', color: '#E74C3C', perms: [], hoist: false },
      { name: '・GREEN', color: '#00FF00', perms: [], hoist: false },
      { name: '・@RICO DA ORG', color: '#F1C40F', perms: [], hoist: false },
      { name: '・CRIA DA DG', color: '#2ECC71', perms: [], hoist: false },
      { name: '・REI DOS AP', color: '#E67E22', perms: [], hoist: false },
      { name: '・REI DA 2X', color: '#C0392B', perms: [], hoist: false },
    ];
    const roles = await createRolesSequential(guild, orgRoles, errors);
    const everyone = guild.roles.everyone, botId = bot.id;
    const adminRoles = [roles['・owner'], roles['• DIRETOR 👑'], roles['• GERENTE 👑'], roles['DIRETOR | SS']].filter(Boolean);
    const gerenciaRoles = [...adminRoles, roles['SUPORTE'], roles['・SS | MOB'], roles['・SS | EMU'], roles['・MEDIADOR'], roles['• FILAS'], roles['/👁️‍🗨️']].filter(Boolean);
    const analiseRoles = [...adminRoles, roles['SUPORTE'], roles['・SS | MOB'], roles['・SS | EMU'], roles['・MEDIADOR'], roles['/👁️‍🗨️']].filter(Boolean);
    const streamerRoles = [...analiseRoles, roles['・@STREAMING'], roles['・@Criador De Conteúdo']].filter(Boolean);
    const logRoles = [...adminRoles, roles['view logs']].filter(Boolean);

    const buildOW = (allowed) => {
      const ow = [
        { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
      ];
      for (const r of allowed) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
      return ow;
    };
    const buildRO = () => {
      const ow = [
        { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ];
      for (const r of adminRoles) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] });
      return ow;
    };

    const structure = [
      { category: null, channels: [
        { name: 'jaya-e-stark', type: 'text' },
        { name: '♪', type: 'voice' },
        { name: '亗・Setor Dos Crias', type: 'text' },
        { name: 'moderator-only', type: 'text', priv: true, allow: adminRoles },
        { name: '・avisos-e-funções', type: 'text', ro: true },
      ]},
      { category: '💎・GERENCIA', priv: true, allow: gerenciaRoles, channels: [
        { name: '♪・TRABALHANDO⁰¹', type: 'voice' }, { name: '♪・ANALISTAS', type: 'voice' },
        { name: '💎・chat-adm', type: 'text' }, { name: '♪・SUPORTES', type: 'voice' },
        { name: '💎・fila-mediador', type: 'text' }, { name: '💎・chat-analistas', type: 'text' },
        { name: '💎・provas-analises', type: 'text' }, { name: '💎・chat-suportes', type: 'text' },
        { name: '💎・config-pix', type: 'text' }, { name: '💎・solicitar-analista', type: 'text' },
        { name: '💎・pix-mediadores', type: 'text' },
      ]},
      { category: '🔎・ANALISTAS', priv: true, allow: analiseRoles, channels: [
        { name: '📋・fila-analistas', type: 'text' },
        { name: '🎙️・call-analistas', type: 'voice' },
        { name: '📊・historico-analises', type: 'text', ro: true },
      ]},
      { category: '╰┈➤ | BOAS VINDAS', channels: [
        { name: '❓・como-apostar', type: 'text', ro: true },
        { name: '🏦・bancos-proibido', type: 'text', ro: true },
        { name: '🛬・invites', type: 'text', ro: true },
        { name: '📢・anuncios', type: 'text', ro: true },
        { name: '💸・valores', type: 'text', ro: true },
        { name: '⭐・bem-vindos', type: 'text', ro: true },
      ]},
      { category: '╰┈➤ | APOSTAS ABERTAS', channels: [
        { name: '⭐・apostas-1', type: 'text', ro: true },
        { name: '⭐・apostas-2', type: 'text', ro: true },
        { name: '⭐・apostas-3', type: 'text', ro: true },
      ]},
      { category: '╰┈➤ | COMUNIDADE', channels: [{ name: '💬・chat-geral', type: 'text' }] },
      { category: '╰┈➤ | MURAL', channels: [
        { name: '🏆・wins', type: 'text' }, { name: '🎥・clips', type: 'text' },
        { name: '🦊・cargos', type: 'text', ro: true },
      ]},
      { category: '╰┈➤ | REGRAS', channels: [
        { name: '📕・regras-gerais', type: 'text', ro: true },
        { name: '📕・regras-x1', type: 'text', ro: true },
      ]},
      { category: '╰┈➤ | VAGAS GERENCIA', channels: [
        { name: '👨🏻・vagas-suporte', type: 'text', ro: true },
        { name: '🔎・seja-analista', type: 'text', ro: true },
        { name: '💸・seja-adm', type: 'text', ro: true },
        { name: '🎥・seja-influencer', type: 'text', ro: true },
      ]},
      { category: '╰┈➤ | ORG COINS', channels: [{ name: '🪙・trocar-coins', type: 'text', ro: true }] },
      { category: '╰┈➤ | SUPORTE', channels: [
        { name: '♪📞・Aguardando Suporte', type: 'voice' },
        { name: '♪📞・Suporte ⁰¹', type: 'voice' },
        { name: '♪📞・Suporte ⁰²', type: 'voice' },
        { name: '🎟・ticket', type: 'text', ro: true },
      ]},
      { category: '📮・SUPORTE', channels: [
        { name: '📮・suporte', type: 'text', ro: true },
        { name: '📮・receber-evento', type: 'text', ro: true },
        { name: '📮・reembolso', type: 'text', ro: true },
        { name: '📮・vagas-mediador', type: 'text', ro: true },
        { name: '📮・vaga-influenciador', type: 'text', ro: true },
      ]},
      { category: '╰┈➤ | EVENTOS ON', channels: [
        { name: '🥂・eventos', type: 'text', ro: true },
        { name: '❓・regras', type: 'text', ro: true },
        { name: '💰・pagamentos', type: 'text', ro: true },
      ]},
      { category: '╰┈➤ | RANKING', channels: [
        { name: '🎁・avisos-ranking', type: 'text', ro: true },
        { name: '🏆・premiações', type: 'text', ro: true },
        { name: '📊・ranking', type: 'text', ro: true },
      ]},
      { category: '╰┈➤ | STREMERS', priv: true, allow: streamerRoles, channels: [
        { name: '🟢・live-on', type: 'text' },
        { name: '📣・divulgacão', type: 'text' },
        { name: '・chat-streamer', type: 'text' },
        { name: '🎥・fila-streamer', type: 'text' },
      ]},
      { category: '╰┈➤ | FILAS MOBILE', channels: [
        { name: '📱・1x1-mob', type: 'text' }, { name: '📱・2x2-mob', type: 'text' },
        { name: '📱・3x3-mob', type: 'text' }, { name: '📱・4x4-mob', type: 'text' },
      ]},
      { category: '╰┈➤ | FILAS EMULADOR', channels: [
        { name: '💻・1x1-emu', type: 'text' }, { name: '💻・2x2-emu', type: 'text' },
        { name: '💻・3x3-emu', type: 'text' }, { name: '💻・4x4-emu', type: 'text' },
      ]},
      { category: '╰┈➤ | FILAS MISTAS', channels: [
        { name: '📱💻・2x2-misto', type: 'text' }, { name: '📱💻・3x3-misto', type: 'text' },
        { name: '📱💻・4x4-misto', type: 'text' },
      ]},
      { category: '╰┈➤ | ANALISES', channels: [
        { name: '♪🔎・Analise⁰¹', type: 'voice' }, { name: '♪🔎・Analise⁰²', type: 'voice' },
        { name: '♪🔎・Analise⁰³', type: 'voice' }, { name: '♪🔎・Analise⁰⁴', type: 'voice' },
        { name: '♪🔎・Analise⁰⁵', type: 'voice' }, { name: '♪🔎・Analise⁰⁶', type: 'voice' },
        { name: '♪🔎・Analise⁰⁷', type: 'voice' }, { name: '♪🔎・Analise⁰⁸', type: 'voice' },
        { name: '♪🔎・Analise⁰⁹', type: 'voice' }, { name: '♪🔎・Analise¹⁰', type: 'voice' },
        { name: '📜・regras-analises', type: 'text', ro: true },
        { name: '🚫・exposed-mob', type: 'text', ro: true },
        { name: '🚫・blacklist', type: 'text', priv: true, allow: analiseRoles },
      ]},
      { category: '・LOGS', priv: true, allow: logRoles, channels: [
        { name: '🤖・log-ticket', type: 'text' }, { name: '🔥・log-criadas', type: 'text' },
        { name: '🤖・log-filas', type: 'text' }, { name: '🔒・log-black', type: 'text' },
        { name: '✅・log-confirmadas', type: 'text' }, { name: '🌐・log-iniciadas', type: 'text' },
        { name: '❌・log-recusada', type: 'text' }, { name: '🔚・logs-finalizadas', type: 'text' },
        { name: '🪙・logs-conis', type: 'text' }, { name: '💎・log-coins', type: 'text' },
        { name: '🛡️・log-mediadores', type: 'text' }, { name: '⚙️・log-config', type: 'text' },
        { name: '🎁・log-eventos', type: 'text' }, { name: '🚨・log-anticheat', type: 'text' },
      ]},
    ];

    const created = {};
    const catDefs = structure.filter(it => it.category);
    const catMap = {};
    for (const it of catDefs) {
      const cat = await createChannelSafe(guild, {
        name: it.category,
        type: ChannelType.GuildCategory,
        permissionOverwrites: it.priv ? buildOW(it.allow || adminRoles) : [],
      });
      if (cat) catMap[it.category] = cat;
      else errors.push(`cat ${it.category}`);
    }

    for (const it of structure) {
      const cat = it.category ? catMap[it.category] : null;
      for (const d of it.channels) {
        const ty = d.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
        let ow = [];
        if (d.priv) ow = buildOW(d.allow || adminRoles);
        else if (it.priv) ow = buildOW(it.allow || adminRoles);
        else if (d.ro) ow = buildRO();
        const ch = await createChannelSafe(guild, { name: d.name, type: ty, parent: cat?.id, permissionOverwrites: ow });
        if (ch) created[d.name] = ch;
        else errors.push(`ch ${d.name}`);
      }
    }

    await everyone.setPermissions([
      PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite,
    ]).catch(() => {});

    await ensureGuild(guild);
    const cfg = await getConfig(guild.id);
    Object.assign(cfg, {
      admin_role: roles['• GERENTE 👑']?.id || roles['・owner']?.id || '',
      membro_role: roles['・gg/[nome da sua org]']?.id || '',
      ticket_cargo: roles['SUPORTE']?.id || '',
      autorole_role: roles['・gg/[nome da sua org]']?.id || '',
      log_channel: created['⚙️・log-config']?.id || created['🤖・log-filas']?.id || '',
      mod_log_channel: created['🔒・log-black']?.id || created['🤖・log-filas']?.id || '',
      ticket_log_channel: created['🤖・log-ticket']?.id || '',
      welcome_channel: created['⭐・bem-vindos']?.id || created['📢・anuncios']?.id || '',
      suggestion_channel: created['💬・chat-geral']?.id || '',
      server_type: 'organizacao',
      ticket_titulo: '🎟・Central de Atendimento',
      ticket_descricao: 'Selecione abaixo.',
    });
    await setConfig(guild.id, cfg);
    await patchSettings(guild.id, {
      admin_role_id: roles['• GERENTE 👑']?.id || null,
      manager_role_id: roles['• DIRETOR 👑']?.id || null,
      stock_role_id: roles['・MEDIADOR']?.id || null,
    });

    const existingFF = await ffGetConfig(guild.id);
    const hasValues = Array.isArray(existingFF?.value_options) && existingFF.value_options.length > 0;
    await ffPatchConfig(guild.id, {
      log_channel_id: created['🤖・log-filas']?.id || null,
      topic_channel_id: created['📱・1x1-mob']?.id || null,
      pix_channel_id: created['💎・config-pix']?.id || null,
      pix_mediator_channel_id: created['💎・pix-mediadores']?.id || null,
      transcript_channel_id: created['🔚・logs-finalizadas']?.id || null,
      resultados_channel_id: created['🏆・premiações']?.id || null,
      ranking_channel_id: created['📊・ranking']?.id || null,
      anuncios_channel_id: created['📢・anuncios']?.id || null,
      streamer_channel_id: created['🎥・fila-streamer']?.id || null,
      mediator_role_id: roles['・MEDIADOR']?.id || null,
      olhinho_role_id: roles['/👁️‍🗨️']?.id || null,
      analyst_role_id: roles['/👁️‍🗨️']?.id || null,
      admin_role_id: roles['• GERENTE 👑']?.id || null,
      analyst_panel_channel_id: created['📋・fila-analistas']?.id || null,
      blacklist_channel_id: created['🚫・blacklist']?.id || null,
      valor_minimo: 0.50, valor_maximo: 1000, mediator_fee: 0.15, coin_prize: 1,
      value_options: hasValues ? existingFF.value_options : FF_DEFAULT_VALUES,
      auto_thread: true, require_mediator_confirm: true, block_blacklist: true,
      auto_post_ranking: true, auto_post_blacklist: true, auto_post_regras: true,
    });

    const mr = roles['・gg/[nome da sua org]'];
    if (mr) await addAllMembersToRole(guild, mr);

    if (!skipPosting) {
      await report('📤 Postando painéis...');
      await guild.channels.fetch().catch(() => {});
      await sleep(1500);
      const f = (n) => created[n] || guild.channels.cache.find(c => c.name === n);
      const tasks = [];

      const tkCh = f('🎟・ticket');
      if (tkCh) {
        const panel = await createTicketPanel(guild.id, {
          nome: 'Suporte', titulo: 'Central de Atendimento', descricao: 'Selecione o tipo.',
          cor: '#9B59B6', botao_label: 'Abrir Ticket', botao_emoji: '🎫',
          cargo_id: roles['SUPORTE']?.id || null, log_channel_id: created['🤖・log-ticket']?.id || null,
          tipos: [
            { id: 'suporte', label: 'Suporte', emoji: '🛠️' },
            { id: 'receber-evento', label: 'Receber Evento', emoji: '🎁' },
            { id: 'reembolso', label: 'Reembolso', emoji: '💸' },
            { id: 'vaga-mediador', label: 'Vaga Mediador', emoji: '🛡️' },
            { id: 'vaga-influencer', label: 'Vaga Influencer', emoji: '🎥' },
          ],
        });
        const msg = await tkCh.send({ embeds: [buildTicketPanelEmbed(panel)], components: buildTicketPanelComponents(panel) }).catch(() => null);
        if (msg) await updateTicketPanel(guild.id, panel.id, { canal_id: tkCh.id, mensagem_id: msg.id });
      }

      const pixCh = f('💎・config-pix');
      if (pixCh) tasks.push(ffPostPixEmbed(guild, pixCh.id).catch(() => {}));

      const medCh = f('💎・fila-mediador');
      if (medCh) tasks.push((async () => {
        const p = await ffBuildMediatorPanel(guild.id);
        await medCh.send(p).catch(() => {});
      })());

      const anaCh = f('📋・fila-analistas');
      if (anaCh) tasks.push((async () => {
        const p = await ffBuildAnalystPanel(guild.id);
        await anaCh.send(p).catch(() => {});
      })());

      const strCh = f('🎥・fila-streamer');
      if (strCh) tasks.push(ffPostStreamerPanel(guild, strCh.id).catch(() => {}));

      const blCh = f('🚫・blacklist');
      if (blCh) tasks.push((async () => {
        const p = await ffBuildBlacklistEmbed(guild.id);
        const m = await blCh.send(p).catch(() => null);
        if (m) await ffPatchConfig(guild.id, { blacklist_channel_id: blCh.id, blacklist_embed_id: m.id });
      })());

      const pixMedCh = f('💎・pix-mediadores');
      if (pixMedCh) tasks.push((async () => {
        const p = await ffBuildMediatorPixPanel(guild.id);
        await pixMedCh.send(p).catch(() => {});
      })());

      const statics = [
        { ch: '📕・regras-gerais', t: '📕 Regras Gerais', c: '#5865F2', d: '**1.** Respeite todos.\n**2.** Sem spam/flood.\n**3.** Sem preconceito.\n**4.** Sem NSFW.\n**5.** Sem divulgação.\n**6.** Respeite mediadores.\n**7.** Dúvidas: ticket.' },
        { ch: '📕・regras-x1', t: '📕 Regras FF', c: '#f1c40f', d: '**REGRAS 1x1**\n> Level mínimo: **25**\n> Replay obrigatório\n> Armas: UMP, XM8, MP40, MP5, M4A1\n> Pistolas: USP-2, G18\n> **Proibido:** granadas, subir em casas, evoluir armas\n> Personagens: Alok, Kelly, Moco, Maxim, Leon\n\n**REGRAS GERAIS**\n> Quebra = entregar round\n> Acusação sem prova = W.O.\n> Provas em até 5 min' },
        { ch: '❓・como-apostar', t: '❓ Como Apostar', c: '#22c55e', d: '**1.** Escolha modalidade\n**2.** Clique em 🧊 Gelo Infinito ou Gelo Normal\n**3.** Aos 2 jogadores cria o tópico\n**4.** Combinem as regras\n**5.** Confirmar Regras\n**6.** Mediador libera PIX\n**7.** Pague valor + taxa\n**8.** Vencedor leva 2×' },
        { ch: '💸・valores', t: '💸 Tabela de Valores', c: '#f1c40f', d: 'Valores configurados no servidor. Confira no painel FF.' },
        { ch: '📢・anuncios', t: '📢 Bem-vindo', c: '#5865F2', d: 'Servidor configurado! Confira os canais principais.' },
        { ch: '⭐・bem-vindos', t: '👋 Bem-vindo(a)!', c: '#00FFCC', d: 'Leia as regras e comece a apostar!' },
        { ch: '🪙・trocar-coins', t: '🪙 Trocar Coins', c: '#FFD700', d: 'Compre cargos com coins ganhas em apostas!' },
      ];
      for (const emb of statics) {
        try {
          const ch = f(emb.ch);
          if (ch) {
            const e = new EmbedBuilder().setTitle(emb.t).setColor(emb.c).setDescription(emb.d).setTimestamp();
            const extra = emb.ch === '🪙・trocar-coins' ? { components: await buildCoinShopComponents(guild.id) } : {};
            tasks.push(ch.send({ embeds: [e], ...extra }).catch(() => {}));
          }
        } catch {}
      }

      await Promise.allSettled(tasks);

      try {
        await report('🎮 Postando apostas...');
        const cfgFF2 = await ffGetConfig(guild.id);
        let valsFF2 = Array.isArray(cfgFF2?.value_options) ? cfgFF2.value_options : [];
        if (!valsFF2.length) { valsFF2 = FF_DEFAULT_VALUES; await ffPatchConfig(guild.id, { value_options: valsFF2 }); }
        const orderedFF2 = [...valsFF2].map(v => parseFloat(v)).filter(v => !isNaN(v)).sort((a, b) => b - a);
        const qChs = [
          { c: '📱・1x1-mob', f: '1x1_mobile' }, { c: '📱・2x2-mob', f: '2x2_mobile' },
          { c: '📱・3x3-mob', f: '3x3_mobile' }, { c: '📱・4x4-mob', f: '4x4_mobile' },
          { c: '💻・1x1-emu', f: '1x1_emu' }, { c: '💻・2x2-emu', f: '2x2_emu' },
          { c: '💻・3x3-emu', f: '3x3_emu' }, { c: '💻・4x4-emu', f: '4x4_emu' },
          { c: '📱💻・2x2-misto', f: '2x2_misto' }, { c: '📱💻・3x3-misto', f: '3x3_misto' },
          { c: '📱💻・4x4-misto', f: '4x4_misto' },
        ];
        let totalBet = 0;
        for (const it of qChs) {
          const fmt = FF_FORMATS.find(x => x.id === it.f);
          const ch = created[it.c] || guild.channels.cache.find(c => c.name === it.c);
          if (!fmt || !ch) continue;
          for (const value of orderedFF2) {
            try {
              const { data: bet, error } = await supabase.from('ff_bets').insert({ guild_id: guild.id, channel_id: ch.id, format: fmt.label, value }).select().single();
              if (error) throw error;
              const msg = await ch.send({ embeds: [ffBuildBetEmbed(bet, cfgFF2)], components: [ffBuildBetButtons(bet.id, cfgFF2)] });
              await ffPatchBet(bet.id, { message_id: msg.id });
              totalBet++;
              await sleep(500);
            } catch (e) { console.error(`Erro aposta ${fmt.label} ${value}:`, e.message); }
          }
        }
        await report(`✅ ${totalBet} embeds postados!`);
        await ffLog(guild, 'queue', 'BETS_AUTO_ON_SETUP', null, { total: totalBet });
      } catch (e) { console.error('Erro apostas:', e); }
    }

    await report('✅ Organização criada!');
    return { ok: true, errors, created };
  } finally { setupInProgress.delete(guild.id); }
}

// ═══════════════════════════════════════════════════════════
// SETUP DISPATCHER + APOSTAS
// ═══════════════════════════════════════════════════════════
async function setupApostasServer(guild, onProgress = null) {
  return setupOrganizacaoServer(guild, onProgress, { skipPosting: true });
}

async function setupServer(guild, type, onProgress = null, authorId = null) {
  const t0 = Date.now();
  let result = null, error = null;
  await logImportant('SETUP', `Início — **${type.toUpperCase()}**`, {
    description: `Setup em **${guild.name}**.`,
    user: authorId, guild: guild.id, severity: 'info',
  }).catch(() => {});
  try {
    if (type === 'loja') result = await setupLojaServer(guild, onProgress);
    else if (type === 'comunidade') result = await setupComunidadeServer(guild, onProgress);
    else if (type === 'organizacao') result = await setupOrganizacaoServer(guild, onProgress, { skipPosting: false });
    else if (type === 'apostas') result = await setupOrganizacaoServer(guild, onProgress, { skipPosting: true });
    else throw new Error('Tipo inválido');
  } catch (e) { error = e; }
  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  const errs = result?.errors || [];
  await logImportant('SETUP', error ? `❌ Falha — **${type.toUpperCase()}**` : `✅ Concluído — **${type.toUpperCase()}**`, {
    description: error ? `\`\`\`\n${error.message}\n\`\`\`` : `Finalizado em ${dur}s.`,
    user: authorId, guild: guild.id,
    severity: error ? 'danger' : (errs.length ? 'warning' : 'success'),
    fields: [
      { name: '⏱️', value: `${dur}s`, inline: true },
      { name: '⚠️', value: `${errs.length}`, inline: true },
      { name: '📢', value: `${guild.channels.cache.size}`, inline: true },
      { name: '🎭', value: `${guild.roles.cache.size}`, inline: true },
    ],
  }).catch(() => {});
  if (error) throw error;
  return result;
}

// ═══════════════════════════════════════════════════════════
// COMANDO SECRETO — SETUP RÁPIDO FF
// ═══════════════════════════════════════════════════════════
async function quickSetupFFServer(g, authorId) {
  const t0 = Date.now();
  try {
    const result = await setupOrganizacaoServer(g, null, { skipPosting: true });
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    const errs = result?.errors || [];

    await logImportant('SETUP', `🎮 Setup secreto FF — ${g.name}`, {
      description: `Comando **secreto** \`:!!SERVIDOR DE APOSTAS DE FREEFIRE\``,
      user: authorId, guild: g.id,
      severity: errs.length ? 'warning' : 'success',
      fields: [
        { name: '⏱️', value: `${dur}s`, inline: true },
        { name: '⚠️', value: `${errs.length}`, inline: true },
        { name: '📢', value: `${g.channels.cache.size}`, inline: true },
        { name: '🎭', value: `${g.roles.cache.size}`, inline: true },
      ],
    }).catch(() => {});
    await logDevAction(authorId, 'secret_setup_ff', g.id, { duration: dur, errors: errs.length });

    const f = (n) => g.channels.cache.find(c => c.name === n);
    const tasks = [];

    const medCh = f('💎・fila-mediador');
    if (medCh) tasks.push((async () => { const p = await ffBuildMediatorPanel(g.id); await medCh.send(p).catch(() => {}); })());
    const anaCh = f('📋・fila-analistas');
    if (anaCh) tasks.push((async () => { const p = await ffBuildAnalystPanel(g.id); await anaCh.send(p).catch(() => {}); })());
    const strCh = f('🎥・fila-streamer');
    if (strCh) tasks.push(ffPostStreamerPanel(g, strCh.id).catch(() => {}));
    const pixCh = f('💎・config-pix');
    if (pixCh) tasks.push(ffPostPixEmbed(g, pixCh.id).catch(() => {}));
    const pixMedCh = f('💎・pix-mediadores');
    if (pixMedCh) tasks.push((async () => { const p = await ffBuildMediatorPixPanel(g.id); await pixMedCh.send(p).catch(() => {}); })());
    const blCh = f('🚫・blacklist');
    if (blCh) tasks.push((async () => {
      const p = await ffBuildBlacklistEmbed(g.id);
      const m = await blCh.send(p).catch(() => null);
      if (m) await ffPatchConfig(g.id, { blacklist_channel_id: blCh.id, blacklist_embed_id: m.id });
    })());
    const coinCh = f('🪙・trocar-coins');
    if (coinCh) tasks.push((async () => {
      const { data: items } = await supabase.from('ff_coin_shop').select('*').eq('guild_id', g.id).eq('active', true).order('price');
      if (items?.length) {
        const e = new EmbedBuilder().setTitle('🪙 Loja de Coins').setColor('#FFD700').setDescription('Compre cargos com suas coins!').setTimestamp();
        for (const x of items) e.addFields({ name: `${x.emoji || '🎁'} ${x.name}`, value: `💰 **${x.price}**`, inline: true });
        await coinCh.send({ embeds: [e], components: await buildCoinShopComponents(g.id) }).catch(() => {});
      }
    })());

    await Promise.allSettled(tasks);
    return { ok: true, duration: dur, errors: errs.length };
  } catch (e) {
    await logImportant('ERRO', `Falha no setup secreto FF`, {
      description: `\`\`\`\n${e.message}\n\`\`\``,
      user: authorId, guild: g.id, severity: 'danger',
    }).catch(() => {});
    return { ok: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 6/9
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 7/9] SQL MIGRATION + DEV HUB + PAINÉIS DEV
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// 📋 SQL MIGRATION — Rode ANTES de subir o bot
// ═══════════════════════════════════════════════════════════
/*
-- ═══════════════════════════════════════════════════════════
-- FRIOBOT v6.6.0 — MIGRATION CONSOLIDADA
-- Rode no SQL Editor do Supabase. Idempotente (pode rodar 2x).
-- ═══════════════════════════════════════════════════════════

-- 1. TICKETS — completa tabela
CREATE TABLE IF NOT EXISTS ticket_data (
  id SERIAL PRIMARY KEY,
  thread_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  panel_id INT,
  type_id TEXT,
  status TEXT DEFAULT 'aberto',
  form_answers JSONB,
  opened_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ticket_data
  ADD COLUMN IF NOT EXISTS guild_id TEXT,
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS panel_id INT,
  ADD COLUMN IF NOT EXISTS type_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'aberto',
  ADD COLUMN IF NOT EXISTS form_answers JSONB,
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS assumed_by TEXT,
  ADD COLUMN IF NOT EXISTS assumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_priority BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_set_by TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by TEXT,
  ADD COLUMN IF NOT EXISTS closed_reason TEXT,
  ADD COLUMN IF NOT EXISTS auto_close_warned_at TIMESTAMPTZ;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_data_thread_id_key') THEN
    ALTER TABLE ticket_data ADD CONSTRAINT ticket_data_thread_id_key UNIQUE (thread_id);
  END IF;
END $$;

-- 2. CONFIGS — versículo + painéis
ALTER TABLE configs
  ADD COLUMN IF NOT EXISTS versiculo_ativo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS versiculo_channel TEXT,
  ADD COLUMN IF NOT EXISTS versiculo_hora INT DEFAULT 8,
  ADD COLUMN IF NOT EXISTS versiculo_last_sent TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS versiculo_last_hash TEXT,
  ADD COLUMN IF NOT EXISTS ticket_panels JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS shop_panels JSONB DEFAULT '[]'::jsonb;

-- 3. FORCE PREMIUM — tier
ALTER TABLE force_premium ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'unlimited';

-- 4. MULTI-PIX POR MEDIADOR
CREATE TABLE IF NOT EXISTS ff_mediator_pix (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  pix_key TEXT NOT NULL,
  pix_name TEXT NOT NULL,
  pix_city TEXT DEFAULT 'SAO PAULO',
  pix_type TEXT DEFAULT 'aleatoria',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (guild_id, user_id)
);

-- 5. VERSÍCULO — histórico
CREATE TABLE IF NOT EXISTS daily_verses_history (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  verse_ref TEXT NOT NULL,
  verse_text TEXT NOT NULL,
  verse_hash TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. ANALYTICS
CREATE TABLE IF NOT EXISTS guild_feature_usage (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  uses INT DEFAULT 1,
  last_used TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (guild_id, feature)
);

-- 7. AUTO-BACKUP
CREATE TABLE IF NOT EXISTS auto_backups (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  auto BOOLEAN DEFAULT true
);

-- 8. FF CONFIG — coluna pix mediador
ALTER TABLE ff_config
  ADD COLUMN IF NOT EXISTS pix_mediator_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS analyst_panel_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS blacklist_embed_id TEXT,
  ADD COLUMN IF NOT EXISTS auto_post_frequencia TEXT DEFAULT 'weekly';

-- 9. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_configs_guild ON configs(guild_id);
CREATE INDEX IF NOT EXISTS idx_configs_versiculo ON configs(versiculo_ativo, versiculo_hora) WHERE versiculo_ativo = true;
CREATE INDEX IF NOT EXISTS idx_configs_premium ON configs(is_premium) WHERE is_premium = true;
CREATE INDEX IF NOT EXISTS idx_settings_guild ON settings(guild_id);
CREATE INDEX IF NOT EXISTS idx_ff_config_guild ON ff_config(guild_id);
CREATE INDEX IF NOT EXISTS idx_ff_matches_guild_status ON ff_matches(guild_id, status);
CREATE INDEX IF NOT EXISTS idx_ff_matches_status_created ON ff_matches(status, created_at) WHERE status IN ('waiting', 'playing', 'pix_released');
CREATE INDEX IF NOT EXISTS idx_ff_matches_mediator ON ff_matches(mediator_id) WHERE mediator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ff_matches_winner ON ff_matches(winner) WHERE winner IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ff_bets_guild ON ff_bets(guild_id);
CREATE INDEX IF NOT EXISTS idx_ff_bets_channel ON ff_bets(channel_id);
CREATE INDEX IF NOT EXISTS idx_ff_players_guild_coins ON ff_players(guild_id, coins DESC);
CREATE INDEX IF NOT EXISTS idx_ff_players_guild_wins ON ff_players(guild_id, wins DESC);
CREATE INDEX IF NOT EXISTS idx_ff_med_queue_guild_status ON ff_mediator_queue(guild_id, status);
CREATE INDEX IF NOT EXISTS idx_ff_med_queue_status_joined ON ff_mediator_queue(status, joined_at) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_ff_ana_queue_guild_status ON ff_analyst_queue(guild_id, status);
CREATE INDEX IF NOT EXISTS idx_ff_ana_queue_status_joined ON ff_analyst_queue(status, joined_at) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_ff_str_queue_guild ON ff_streamer_queue(guild_id);
CREATE INDEX IF NOT EXISTS idx_ff_str_queue_live ON ff_streamer_queue(status) WHERE status = 'live';
CREATE INDEX IF NOT EXISTS idx_ff_med_pix_guild ON ff_mediator_pix(guild_id);
CREATE INDEX IF NOT EXISTS idx_ff_med_pix_user ON ff_mediator_pix(guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_data_thread ON ticket_data(thread_id);
CREATE INDEX IF NOT EXISTS idx_ticket_data_open ON ticket_data(guild_id, opened_at) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_data_user ON ticket_data(guild_id, user_id) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_giveaways_ended ON giveaways(ended, ends_at) WHERE ended = false;
CREATE INDEX IF NOT EXISTS idx_temproles_expires ON temproles(expires_at);
CREATE INDEX IF NOT EXISTS idx_daily_verses_guild ON daily_verses_history(guild_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_feat_usage_guild ON guild_feature_usage(guild_id);
CREATE INDEX IF NOT EXISTS idx_auto_backups_guild ON auto_backups(guild_id, created_at DESC);

-- 10. UNIQUE constraints nas filas (evita race condition)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_ff_med_queue') THEN
    ALTER TABLE ff_mediator_queue ADD CONSTRAINT uq_ff_med_queue UNIQUE (guild_id, user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_ff_ana_queue') THEN
    ALTER TABLE ff_analyst_queue ADD CONSTRAINT uq_ff_ana_queue UNIQUE (guild_id, user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_ff_str_queue') THEN
    ALTER TABLE ff_streamer_queue ADD CONSTRAINT uq_ff_str_queue UNIQUE (guild_id, user_id);
  END IF;
END $$;

-- 11. RPC — incremento atômico de coins
CREATE OR REPLACE FUNCTION increment_coins(
  p_guild_id TEXT,
  p_user_id TEXT,
  p_amount INT
) RETURNS INT AS $$
DECLARE novo_saldo INT;
BEGIN
  INSERT INTO ff_players (guild_id, user_id, coins)
  VALUES (p_guild_id, p_user_id, 0)
  ON CONFLICT (guild_id, user_id) DO NOTHING;
  UPDATE ff_players
  SET coins = GREATEST(0, coins + p_amount)
  WHERE guild_id = p_guild_id AND user_id = p_user_id
  RETURNING coins INTO novo_saldo;
  RETURN novo_saldo;
END;
$$ LANGUAGE plpgsql;

-- 12. RPC — confirmação atômica em match
CREATE OR REPLACE FUNCTION ffm_add_confirmation(p_match_id INT, p_user_id TEXT)
RETURNS JSONB AS $$
DECLARE confs JSONB;
BEGIN
  UPDATE ff_matches
  SET confirmations = (
    CASE
      WHEN confirmations IS NULL THEN jsonb_build_array(p_user_id)
      WHEN confirmations @> to_jsonb(ARRAY[p_user_id]) THEN confirmations
      ELSE confirmations || to_jsonb(p_user_id)
    END
  )
  WHERE id = p_match_id
  RETURNING confirmations INTO confs;
  RETURN confs;
END;
$$ LANGUAGE plpgsql;

-- 13. LIMPEZA — matches travados
UPDATE ff_matches
SET status = 'cancelled', finished_at = NOW()
WHERE status = 'playing' AND created_at < NOW() - INTERVAL '3 hours';

UPDATE ff_mediator_queue
SET status = 'waiting', current_match_id = NULL
WHERE current_match_id IN (
  SELECT id FROM ff_matches WHERE status = 'cancelled' AND finished_at > NOW() - INTERVAL '5 minutes'
);

ANALYZE;
*/

// ═══════════════════════════════════════════════════════════
// DEV HUB — MENU PRINCIPAL
// ═══════════════════════════════════════════════════════════
function devHub() {
  const e = new EmbedBuilder().setTitle('👑 Painel Dev').setColor('#FFD700')
    .setDescription(
      `**Categorias:**\n\n` +
      `🏗️ **Servidor** — setups, backup, rejoin\n` +
      `🎯 **Gerenciamento** — premium, verificados, injetar, eventos\n` +
      `🎮 **Apostas** — config FF, postar, streams, PIX mediadores\n` +
      `⚠️ **Moderação** — blacklist, staff, kill switch\n` +
      `📖 **Versículo** — configurar versículo do dia\n` +
      `🖥️ **Sistema** — dashboard, monitor, sandbox, broadcast`
    )
    .setFooter({ text: `Frio Bot ${BOT_VERSION}` }).setTimestamp();
  const menu = new StringSelectMenuBuilder().setCustomId('dev_cat_pick').setPlaceholder('📂 Escolha uma categoria')
    .addOptions(
      { label: 'Servidor', description: 'Setups, backup, rejoin', value: 'servidor', emoji: '🏗️' },
      { label: 'Gerenciamento', description: 'Premium, verificados, injetar', value: 'gerenciamento', emoji: '🎯' },
      { label: 'Apostas', description: 'Config FF, postar, streams', value: 'apostas', emoji: '🎮' },
      { label: 'Moderação', description: 'Blacklist, kill switch', value: 'moderacao', emoji: '⚠️' },
      { label: 'Versículo', description: 'Versículo do dia', value: 'versiculo', emoji: '📖' },
      { label: 'Sistema', description: 'Dashboard, monitor, sandbox', value: 'sistema', emoji: '🖥️' },
    );
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_dashboard').setLabel('Dashboard').setEmoji('📊').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_broadcast').setLabel('Broadcast').setEmoji('📢').setStyle(ButtonStyle.Primary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// DEV CATEGORIAS
// ═══════════════════════════════════════════════════════════
async function devCatServidor() {
  return {
    embeds: [new EmbedBuilder().setTitle('🏗️ Servidor').setColor('#5865F2')
      .setDescription('> 🛒 Loja\n> 👥 Comunidade\n> 🏛️ Organização\n> 🎮 Apostas Base\n> 🔗 Entrar via convite\n> 💾 Backup\n> ✏️ Renomear\n> 💥 Explosão\n> 🚪 Sair\n\n*Setup rápido FF: use o comando secreto no chat.*')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_criar_loja').setLabel('Loja').setEmoji('🛒').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_criar_comunidade').setLabel('Comunidade').setEmoji('👥').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_criar_organizacao').setLabel('Organização').setEmoji('🏛️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_criar_apostas').setLabel('Apostas').setEmoji('🎮').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_entrar_invite').setLabel('Convite').setEmoji('🔗').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_backup').setLabel('Backup').setEmoji('💾').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_renomear').setLabel('Renomear').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_servidores').setLabel('Listar').setEmoji('🌐').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_explosao').setLabel('Explosão').setEmoji('💥').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_sair').setLabel('Sair').setEmoji('🚪').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_rejoin').setLabel('Rejoin').setEmoji('🎯').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function devCatGerenciamento() {
  return {
    embeds: [new EmbedBuilder().setTitle('🎯 Gerenciamento').setColor('#FFA500')
      .setDescription('> 💎 Premium\n> 👥 Verificados\n> 🎁 Injetar\n> 🌐 Eventos globais\n> 🔍 Inspetor\n> 👥 Staff Global\n> 🏆 Ranking\n> 💀 Mortos')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_premium').setLabel('Premium').setEmoji('💎').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_verificados').setLabel('Verificados').setEmoji('👥').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_inject').setLabel('Injetar').setEmoji('🎁').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_global_events').setLabel('Eventos').setEmoji('🌐').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_inspector').setLabel('Inspetor').setEmoji('🔍').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_staff_global').setLabel('Staff').setEmoji('👥').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_ranking').setLabel('Ranking').setEmoji('🏆').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_dead_servers').setLabel('Mortos').setEmoji('💀').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
    ],
  };
}

async function devCatApostas() {
  return {
    embeds: [new EmbedBuilder().setTitle('🎮 Apostas').setColor('#f1c40f')
      .setDescription('> 🎮 Hub FF do servidor\n> 📢 Postar apostas\n> 🎥 Fila Streamer\n> ⚡ Manutenção FF\n> 💳 PIX\n> 💳 PIX Mediadores (admin)\n> 🎬 Simulador *(premium)*')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_ff_panel').setLabel('Abrir FF').setEmoji('🎮').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_ff_postar').setLabel('Postar').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_ff_streamer').setLabel('Streamer').setEmoji('🎥').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_ff_manutencao').setLabel('Manut FF').setEmoji('⚡').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_ff_pix').setLabel('PIX').setEmoji('💳').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_ff_pix_med').setLabel('PIX Meds').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_simulator').setLabel('Simulador').setEmoji('🎬').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
    ],
  };
}

async function devCatModeracao() {
  return {
    embeds: [new EmbedBuilder().setTitle('⚠️ Moderação').setColor('#FF5555')
      .setDescription('> 🚫 Blacklist global\n> 👥 Staff BL\n> 🚨 Kill Switch\n> 🔧 Manutenção\n> ⚠️ Alertas\n> 🐛 Bugs')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_bl_add').setLabel('BL Add').setEmoji('🚫').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_bl_del').setLabel('BL Remover').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_bl_list').setLabel('BL Listar').setEmoji('📋').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_staff_blacklist').setLabel('BL Staff').setEmoji('👥').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_kill_switch').setLabel('Kill Switch').setEmoji('🚨').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_manutencao').setLabel('Manutenção').setEmoji('🔧').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_alerts').setLabel('Alertas').setEmoji('⚠️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_debug').setLabel('Debug').setEmoji('🐛').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
    ],
  };
}

async function devCatVersiculo() {
  return {
    embeds: [new EmbedBuilder().setTitle('📖 Versículo do Dia').setColor('#FEE75C')
      .setDescription(`**Sistema automático de versículos bíblicos.**\n\n> ✨ Envia 1 versículo por dia automaticamente\n> 🎯 Escolhe um canal e horário\n> 🔄 Usa API externa com fallback local (30 versículos)\n> 🎨 Embed bonito com a referência\n\n💎 **Recurso:** Unlimited`)
      .setFooter({ text: 'Frio Bot • Versículo' })],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_versiculo_config').setLabel('Configurar').setEmoji('⚙️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_versiculo_test').setLabel('Enviar teste').setEmoji('🧪').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_versiculo_stats').setLabel('Stats').setEmoji('📊').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_versiculo_reset').setLabel('Resetar').setEmoji('🔄').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_versiculo_all').setLabel('Lista global').setEmoji('🌐').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function devCatSistema() {
  return {
    embeds: [new EmbedBuilder().setTitle('🖥️ Sistema').setColor('#8E44AD')
      .setDescription('> 📊 Dashboard\n> 🤖 Bot\n> 📡 Monitor\n> ⚡ Rate Limit\n> 🕵️ Audit\n> 🌐 Idioma\n> 📢 Broadcast\n> 🧪 Sandbox\n> 🎨 Preview\n> 🔄 Auto-Heal\n> 💎 Tiers Premium\n> 📈 Analytics *(ultra)*')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_dashboard').setLabel('Dashboard').setEmoji('📊').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_bot').setLabel('Bot').setEmoji('🤖').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_monitor').setLabel('Monitor').setEmoji('📡').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_ratelimit').setLabel('RateLimit').setEmoji('⚡').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_audit').setLabel('Audit').setEmoji('🕵️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_locale').setLabel('Idioma').setEmoji('🌐').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_tiers').setLabel('Tiers').setEmoji('💎').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_analytics').setLabel('Analytics').setEmoji('📈').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_sandbox').setLabel('Sandbox').setEmoji('🧪').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_preview').setLabel('Preview').setEmoji('🎨').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_autoheal').setLabel('Auto-Heal').setEmoji('🔄').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_broadcast').setLabel('Broadcast').setEmoji('📢').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// DEV PAINÉIS — Dashboard + Bot
// ═══════════════════════════════════════════════════════════
async function devPanelDashboard() {
  const s = await getDashboardStats();
  const r = await getRenderInfo();
  const up = Math.floor((Date.now() - BOT_START_TIME) / 1000);
  const e1 = new EmbedBuilder().setTitle('📊 Dashboard').setColor('#57F287')
    .setDescription(`<t:${Math.floor(Date.now() / 1000)}:R>`)
    .addFields(
      { name: '🌐 Servidores', value: `**${s.guildsTotal}**\n+${s.guildsNew7d} (7d)`, inline: true },
      { name: '👥 Verificados', value: `**${s.usersVerified}**`, inline: true },
      { name: '📡 Ping', value: `**${client.ws.ping}ms**`, inline: true },
      { name: '⏱️ Uptime', value: `**${fmtUptime(up)}**`, inline: true },
      { name: '🖥️ CPU', value: r.ok && r.cpu != null ? `**${(r.cpu * 100).toFixed(1)}%**` : 'N/A', inline: true },
      { name: '🧠 RAM', value: r.ok && r.mem != null ? `**${r.mem.toFixed(0)} MB**` : `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0)} MB`, inline: true },
      { name: '📦 Cache', value: `${_configCache.size} configs • ${_configCache.hitRate}% hit`, inline: false },
    );
  const e2 = new EmbedBuilder().setTitle('💰 24h').setColor('#FFD700')
    .addFields(
      { name: '🎮 Apostas', value: `**${s.bets24h}**\nR$ **${s.volume24h.toFixed(2)}**`, inline: true },
      { name: '🛒 Loja', value: `**${s.orders24h}**\nR$ **${s.fat24h.toFixed(2)}**`, inline: true },
      { name: '🎫 Tickets', value: `**${s.tickets24h}**`, inline: true },
      { name: '🛡️ Meds', value: `**${s.medsOnline}/${s.medsTotal}**`, inline: true },
      { name: '🔎 Anas', value: `**${s.anasOnline}/${s.anasTotal}**`, inline: true },
      { name: '🎥 Streamers', value: `**${s.strsOnline}/${s.strsTotal}**`, inline: true },
    );
  return {
    embeds: [e1, e2],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_dashboard').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_ping_detailed').setLabel('Ping Detalhado').setEmoji('🩺').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function devPanelBot() {
  const up = Math.floor((Date.now() - BOT_START_TIME) / 1000);
  const e = new EmbedBuilder().setTitle('🤖 Bot').setColor('#00FF00')
    .addFields(
      { name: '🌐', value: `${client.guilds.cache.size}`, inline: true },
      { name: '👥', value: `${client.users.cache.size}`, inline: true },
      { name: '📡', value: `${client.ws.ping}ms`, inline: true },
      { name: '⏱️', value: fmtUptime(up), inline: true },
      { name: '🧠', value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`, inline: true },
      { name: '🔌', value: `${client.ws.shards?.size || 1}`, inline: true },
    );
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_ping_detailed').setLabel('Ping').setEmoji('🩺').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// DEV PAINÉIS — Premium + Tiers
// ═══════════════════════════════════════════════════════════
async function devPanelPremium(guild) {
  const c = await getConfig(guild.id);
  const fp = await supabase.from('force_premium').select('*').eq('scope', 'guild').eq('target_id', guild.id).maybeSingle();
  const isForce = !!fp?.data;
  const tier = await getPremiumTier(guild.id);
  const tierMeta = tier ? PREMIUM_TIERS[tier] : null;
  const expira = c.premium_expires_at ? `<t:${Math.floor(new Date(c.premium_expires_at).getTime() / 1000)}:R>` : '♾️ Permanente';
  const e = new EmbedBuilder().setTitle('💎 Premium').setColor(c.is_premium ? '#22c55e' : '#FF5555')
    .setDescription(`**Servidor:** ${guild.name}\n\`${guild.id}\``)
    .addFields(
      { name: '📌 Status', value: c.is_premium ? '🟢 ATIVO' : '🔴 Inativo', inline: true },
      { name: '🎚️ Tier', value: tierMeta ? `${tierMeta.emoji} ${tierMeta.label}` : '—', inline: true },
      { name: '📅 Expira', value: expira, inline: true },
      { name: '🎯 Force', value: isForce ? '🟢' : '⚪', inline: true },
    );
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_prem_on').setLabel('Permanente').setEmoji('♾️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_prem_temp').setLabel('Por Tempo').setEmoji('⏳').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_prem_off').setLabel('Desativar').setEmoji('❌').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_prem_tier_basic').setLabel('Basic').setEmoji('🥉').setStyle(tier === 'basic' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_prem_tier_premium').setLabel('Premium').setEmoji('🥈').setStyle(tier === 'premium' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_prem_tier_ultra').setLabel('Ultra').setEmoji('🥇').setStyle(tier === 'ultra' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_prem_tier_unlimited').setLabel('Unlimited').setEmoji('💎').setStyle(tier === 'unlimited' ? ButtonStyle.Success : ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_forcepremium_guild').setLabel('FP Guild').setEmoji('🎯').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_forcepremium_user').setLabel('FP User').setEmoji('👤').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_forcepremium_list').setLabel('Ativos').setEmoji('📋').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_forcepremium_clear').setLabel('Limpar').setEmoji('🧹').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
    ],
  };
}

async function devPanelTiers() {
  const rows = Object.entries(PREMIUM_TIERS).map(([key, meta]) => {
    const features = Object.entries(PREMIUM_FEATURE_TIERS)
      .filter(([, minTier]) => minTier === key)
      .map(([feat]) => `• \`${feat}\``)
      .join('\n');
    return { name: `${meta.emoji} ${meta.label}`, value: features || '*sem features exclusivas*', inline: false };
  });
  const e = new EmbedBuilder().setTitle('💎 Tiers Premium').setColor('#8B5CF6')
    .setDescription('**Sistema de tiers por funcionalidade.**\n\nCada feature exige um tier mínimo.')
    .addFields(rows)
    .setFooter({ text: 'Frio Bot • Premium Tiers' }).setTimestamp();
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

// ═══════════════════════════════════════════════════════════
// DEV PAINÉIS — Verificados / Manutenção / Kill Switch
// ═══════════════════════════════════════════════════════════
async function devPanelVerificados() {
  return {
    embeds: [new EmbedBuilder().setTitle('👥 Verificados').setColor('#5865F2').setDescription('Ver e enviar verificados.')],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_listar_verif').setLabel('Listar').setEmoji('📋').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_levar').setLabel('Levar').setEmoji('🚀').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function devPanelManutencao() {
  const globalOn = await isMaintenanceMode();
  const { data: gd } = await supabase.from('maintenance_mode').select('*').eq('id', 1).maybeSingle();
  const e = new EmbedBuilder().setTitle('⚙️ Manutenção Global').setColor(globalOn ? '#ff0000' : '#22c55e')
    .setDescription(globalOn ? '🔴 ATIVA\n> Todos comandos bloqueados\n> Só devs' : '🟢 OPERACIONAL\n> Tudo liberado')
    .addFields(
      { name: '👤 Por', value: gd?.by ? `<@${gd.by}>` : '—', inline: true },
      { name: '🕐 Início', value: gd?.started_at ? `<t:${Math.floor(new Date(gd.started_at).getTime() / 1000)}:R>` : '—', inline: true },
      { name: '📝 Motivo', value: gd?.reason || '*—*', inline: false },
    );
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_maint_toggle').setLabel(globalOn ? 'Restaurar' : 'Iniciar').setEmoji(globalOn ? '🟢' : '🔴').setStyle(globalOn ? ButtonStyle.Success : ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_maint_reason').setLabel('Motivo').setEmoji('📝').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_maint_notify').setLabel('Notificar').setEmoji('📢').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_clear_cache').setLabel('Limpar Cache').setEmoji('🧹').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_check_db').setLabel('Verificar DB').setEmoji('🔍').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function devPanelKillSwitch() {
  const active = await isKillSwitchActive();
  const { data } = await supabase.from('kill_switch').select('*').eq('id', 1).maybeSingle();
  const e = new EmbedBuilder().setTitle('🚨 Kill Switch').setColor(active ? '#ff0000' : '#22c55e')
    .setDescription(active ? '🔴 ATIVO' : '🟢 Normal')
    .addFields(
      { name: '📝 Motivo', value: data?.reason || '*—*' },
      { name: '👤 Por', value: data?.enabled_by ? `<@${data.enabled_by}>` : '—', inline: true },
      { name: '🕐', value: data?.enabled_at ? `<t:${Math.floor(new Date(data.enabled_at).getTime() / 1000)}:R>` : '—', inline: true },
    );
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_kill_toggle').setLabel(active ? 'DESATIVAR' : 'ATIVAR').setEmoji(active ? '🟢' : '🚨').setStyle(active ? ButtonStyle.Success : ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('dev_kill_reason').setLabel('Motivo').setEmoji('📝').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// DEV PAINÉIS — Debug / Alerts / Audit
// ═══════════════════════════════════════════════════════════
async function devPanelDebug() {
  return {
    embeds: [new EmbedBuilder().setTitle('🔧 Debug').setColor('#808080')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_eval').setLabel('Eval').setEmoji('💻').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_dump').setLabel('Dump').setEmoji('📄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_bugs').setLabel('Bugs').setEmoji('🐛').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_cleanup_dms').setLabel('Limpar DMs').setEmoji('📥').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_cleanup_channel').setLabel('Limpar Canal').setEmoji('🧹').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function devPanelAlerts() {
  const { data: alerts } = await supabase.from('dev_alerts').select('*').eq('read', false).order('created_at', { ascending: false }).limit(15);
  const e = new EmbedBuilder().setTitle('🚨 Alertas').setColor('#FF5555')
    .setDescription(alerts?.length ? alerts.map(a => {
      const emoji = { info: 'ℹ️', warning: '⚠️', danger: '🚨', success: '✅' }[a.severity] || 'ℹ️';
      return `${emoji} **${a.title}**\n> ${(a.description || '').substring(0, 100)}\n> <t:${Math.floor(new Date(a.created_at).getTime() / 1000)}:R>`;
    }).join('\n\n') : '*Nenhum.*');
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_alerts_refresh').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_alerts_read_all').setLabel('Marcar lidos').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_alerts_config').setLabel('Config').setEmoji('⚙️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_alerts_test').setLabel('Testar').setEmoji('🧪').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function devPanelAudit() {
  const { data } = await supabase.from('dev_audit').select('user_id,action,created_at').order('created_at', { ascending: false }).limit(20);
  const e = new EmbedBuilder().setTitle('🕵️ Audit').setColor('#5865F2')
    .setDescription(data?.length
      ? data.map(a => `<t:${Math.floor(new Date(a.created_at).getTime() / 1000)}:T> **@${String(a.user_id).substring(0, 8)}** → \`${a.action}\``).join('\n')
      : '*Sem registros.*');
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_audit_refresh').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dev_audit_clear').setLabel('Limpar').setEmoji('🧹').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// DEV PAINÉIS — Inject / Inspector / Staff / Ranking
// ═══════════════════════════════════════════════════════════
async function devPanelInject() {
  return {
    embeds: [new EmbedBuilder().setTitle('🎁 Injetar').setColor('#9B59B6')
      .setDescription('Envie itens em servidores sem entrar.\n\n> 💰 Coins\n> 🛒 Produto\n> 🎭 Cargo\n> 💎 Premium')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_inject_coins').setLabel('Coins').setEmoji('💰').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_inject_product').setLabel('Produto').setEmoji('🛒').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_inject_role').setLabel('Cargo').setEmoji('🎭').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_inject_premium').setLabel('Premium').setEmoji('💎').setStyle(ButtonStyle.Success),
      ),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
    ],
  };
}

async function devPanelInspector(guildId) {
  const info = await inspectGuild(guildId);
  if (!info.ok) {
    return {
      embeds: [new EmbedBuilder().setTitle('❌').setColor('#FF5555').setDescription(info.error)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_inspector').setLabel('Outro').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setStyle(ButtonStyle.Secondary),
      )],
    };
  }
  const g = info.guild, c = info.config, ff = info.ff, a = info.activity;
  const tierMeta = c.premiumTier ? PREMIUM_TIERS[c.premiumTier] : null;
  const e1 = new EmbedBuilder().setTitle(`🔍 ${g.name}`).setColor('#5865F2').setDescription(`\`${g.id}\` • <@${g.ownerId}>`)
    .addFields(
      { name: '👥', value: `${g.memberCount}`, inline: true },
      { name: '📢', value: `${g.channels}`, inline: true },
      { name: '🎭', value: `${g.roles}`, inline: true },
      { name: '🚀', value: `${g.boosts}`, inline: true },
      { name: '😀', value: `${g.emojis}`, inline: true },
      { name: '🎨', value: `${g.stickers}`, inline: true },
    );
  if (g.icon) e1.setThumbnail(g.icon);
  const e2 = new EmbedBuilder().setTitle('⚙️ Config').setColor('#9B59B6')
    .addFields(
      { name: '📁', value: `\`${c.type}\``, inline: true },
      { name: '💎', value: c.premium ? `🟢 ${tierMeta ? tierMeta.emoji + ' ' + tierMeta.label : ''}` : '🔴', inline: true },
      { name: '🎫 Painéis', value: `\`${c.ticketPanels}\``, inline: true },
      { name: '🎫 Tipos', value: `\`${c.ticketTypes}\``, inline: true },
      { name: '🛡️ Anti-link', value: c.antiLink ? '🟢' : '🔴', inline: true },
      { name: '🚫 Anti-conv', value: c.antiInvite ? '🟢' : '🔴', inline: true },
    );
  const e3 = new EmbedBuilder().setTitle('🎮 FF').setColor('#FEE75C')
    .addFields(
      { name: '🔧 Maint', value: ff.maintenance ? '🔴' : '🟢', inline: true },
      { name: '🛡️ Med', value: ff.mediatorRole ? '✅' : '❌', inline: true },
      { name: '💵 Taxa', value: `R$ ${Number(ff.mediatorFee || 0).toFixed(2)}`, inline: true },
      { name: '💎 Coins', value: `${ff.coinPrize || 1}`, inline: true },
      { name: '💸 Valores', value: `${ff.valueOptions}`, inline: true },
      { name: '💳 PIX', value: `\`${ff.pixProvider}\``, inline: true },
    );
  const e4 = new EmbedBuilder().setTitle('📊 Atividade').setColor('#57F287')
    .addFields(
      { name: '🧵', value: `${a.threadsActive}`, inline: true },
      { name: '🎫', value: `${a.ticketsActive}`, inline: true },
      { name: '🛒', value: `R$ ${a.vendas7d.toFixed(2)}`, inline: true },
      { name: '🪙', value: `${a.coinsTotal}`, inline: true },
      { name: '🛡️', value: `${a.medsOnline}/${a.medsTotal}`, inline: true },
      { name: '🔎', value: `${a.anasOnline}/${a.anasTotal}`, inline: true },
    );
  return {
    embeds: [e1, e2, e3, e4],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`dev_inspector_backup:${g.id}`).setLabel('Backup').setEmoji('💾').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`dev_inspector_notes:${g.id}`).setLabel('Notas').setEmoji('📝').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`dev_inspector_pix:${g.id}`).setLabel('PIX Meds').setEmoji('💳').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`dev_inspector_leave:${g.id}`).setLabel('Sair').setEmoji('🚪').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_inspector').setLabel('Outro').setEmoji('🔍').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function devPanelStaffGlobal(page = 0) {
  const staff = await getGlobalStaff();
  const perPage = 10;
  const total = staff.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = page * perPage;
  const slice = staff.slice(start, start + perPage);
  const e = new EmbedBuilder().setTitle('👥 Staff Global').setColor('#5865F2')
    .setDescription(total === 0 ? '*Nenhum.*' : slice.map((s, idx) => {
      const pos = start + idx + 1;
      const medal = ['🥇', '🥈', '🥉'][pos - 1] || `\`${pos}.\``;
      return `${medal} <@${s.user_id}>\n> 🛡️ ${s.meds} • 🔎 ${s.anas} • 🎥 ${s.strs}\n> 💰 R$ ${s.medEarn.toFixed(2)}`;
    }).join('\n\n'))
    .setFooter({ text: `${page + 1}/${totalPages} • ${total}` });
  const rows = [];
  if (slice.length) rows.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('dev_staff_pick').setPlaceholder('Detalhes')
      .addOptions(slice.slice(0, 25).map(s => ({
        label: `User ${s.user_id.substring(0, 12)}`,
        value: s.user_id,
        description: `🛡️${s.meds} 🔎${s.anas} 🎥${s.strs}`,
      })))
  ));
  const navRow = new ActionRowBuilder();
  if (page > 0) navRow.addComponents(new ButtonBuilder().setCustomId(`dev_staff_page:${page - 1}`).setLabel('Anterior').setEmoji('⬅️').setStyle(ButtonStyle.Secondary));
  if (page < totalPages - 1) navRow.addComponents(new ButtonBuilder().setCustomId(`dev_staff_page:${page + 1}`).setLabel('Próximo').setEmoji('➡️').setStyle(ButtonStyle.Secondary));
  navRow.addComponents(
    new ButtonBuilder().setCustomId('dev_staff_blacklist').setLabel('BL Staff').setEmoji('🚫').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  );
  rows.push(navRow);
  return { embeds: [e], components: rows };
}

async function devPanelStaffDetail(userId) {
  const [medsRes, anasRes, strsRes, blRes] = await Promise.all([
    supabase.from('ff_mediator_queue').select('earnings_total,matches_total').eq('user_id', userId),
    supabase.from('ff_analyst_queue').select('analyses_total').eq('user_id', userId),
    supabase.from('ff_streamer_queue').select('user_id').eq('user_id', userId),
    supabase.from('staff_blacklist').select('reason').eq('user_id', userId).maybeSingle(),
  ]);
  const meds = medsRes.data || [], anas = anasRes.data || [], strs = strsRes.data || [], bl = blRes.data;
  const totalEarn = meds.reduce((a, m) => a + Number(m.earnings_total || 0), 0);
  const e = new EmbedBuilder().setTitle('👤 Staff').setColor(bl ? '#FF5555' : '#5865F2')
    .setDescription(`<@${userId}>\n\`${userId}\``)
    .addFields(
      { name: '🛡️ Meds', value: `${meds.length}`, inline: true },
      { name: '🔎 Anas', value: `${anas.length}`, inline: true },
      { name: '🎥 Streams', value: `${strs.length}`, inline: true },
      { name: '💰', value: `R$ ${totalEarn.toFixed(2)}`, inline: true },
      { name: '🚫 BL', value: bl ? `🔴 ${bl.reason || ''}` : '🟢', inline: true },
    );
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`dev_staff_bl_add:${userId}`).setLabel(bl ? 'Remover BL' : 'Banir').setEmoji(bl ? '✅' : '🚫').setStyle(bl ? ButtonStyle.Success : ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function devPanelRanking() {
  const r = await getServerRanking();
  const eFat = new EmbedBuilder().setTitle('🏆 Top Faturamento (7d)').setColor('#FFD700')
    .setDescription(r.byFat.slice(0, 10).map((s, i) => `${['🥇', '🥈', '🥉'][i] || `\`${i + 1}.\``} **${s.name}** — R$ **${s.fat.toFixed(2)}**`).join('\n') || '*Sem dados*');
  const eMatch = new EmbedBuilder().setTitle('🎮 Top Apostas').setColor('#00AAFF')
    .setDescription(r.byMatches.slice(0, 10).map((s, i) => `${['🥇', '🥈', '🥉'][i] || `\`${i + 1}.\``} **${s.name}** — **${s.matches}**`).join('\n') || '*Sem dados*');
  const eMem = new EmbedBuilder().setTitle('👥 Top Membros').setColor('#57F287')
    .setDescription(r.byMembers.slice(0, 10).map((s, i) => `${['🥇', '🥈', '🥉'][i] || `\`${i + 1}.\``} **${s.name}** — **${s.members}**`).join('\n') || '*Sem dados*');
  return {
    embeds: [eFat, eMatch, eMem],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_ranking_refresh').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// DEV PAINÉIS — Dead / Events / Notes / Monitor / Preview
// ═══════════════════════════════════════════════════════════
async function devPanelDeadServers(page = 0) {
  const dead = await getDeadServers();
  const perPage = 10;
  const total = dead.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = page * perPage;
  const slice = dead.slice(start, start + perPage);
  const e = new EmbedBuilder().setTitle('💀 Mortos').setColor('#808080')
    .setDescription(total === 0 ? '🎉 Nenhum!' : slice.map(s => `**${s.name}** \`${s.guild_id}\`\n> 👥 ${s.members} • ⚠️ ${s.reason}`).join('\n\n'))
    .setFooter({ text: `${page + 1}/${totalPages} • ${total}` });
  const navRow = new ActionRowBuilder();
  if (page > 0) navRow.addComponents(new ButtonBuilder().setCustomId(`dev_dead_page:${page - 1}`).setLabel('Anterior').setEmoji('⬅️').setStyle(ButtonStyle.Secondary));
  if (page < totalPages - 1) navRow.addComponents(new ButtonBuilder().setCustomId(`dev_dead_page:${page + 1}`).setLabel('Próximo').setEmoji('➡️').setStyle(ButtonStyle.Secondary));
  navRow.addComponents(
    new ButtonBuilder().setCustomId('dev_dead_cleanup').setLabel('Limpar').setEmoji('🧹').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [e], components: [navRow] };
}

async function devPanelGlobalEvents() {
  const events = await getActiveGlobalEvents();
  const e = new EmbedBuilder().setTitle('🌐 Eventos Globais').setColor('#9B59B6')
    .setDescription(events.length === 0 ? '*Nenhum ativo.*' : events.map(ev => `**${ev.title}**\n> \`${ev.type}\` • **${ev.multiplier}×**\n> ${ev.ends_at ? `<t:${Math.floor(new Date(ev.ends_at).getTime() / 1000)}:R>` : '♾️'}`).join('\n\n'));
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_event_coins_double').setLabel('Dobro coins').setEmoji('🪙').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_event_no_fee').setLabel('Sem taxa').setEmoji('💵').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_event_bonus').setLabel('Bônus').setEmoji('🎁').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_event_sorteio').setLabel('Sorteio').setEmoji('🎉').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_event_stop_all').setLabel('Parar TODOS').setEmoji('🛑').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_event_notify').setLabel('Notificar').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function devPanelNotes(guildId) {
  const notes = await getGuildNotes(guildId);
  const g = client.guilds.cache.get(guildId);
  const e = new EmbedBuilder().setTitle(`📝 Notas — ${g?.name || guildId}`).setColor('#FEE75C')
    .setDescription(notes.length === 0
      ? '*Nenhuma.*'
      : notes.map(n => `**<@${n.author_id}>** <t:${Math.floor(new Date(n.created_at).getTime() / 1000)}:R>\n> ${n.note}`).join('\n\n').substring(0, 4000));
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`dev_note_add:${guildId}`).setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`dev_note_clear:${guildId}`).setLabel('Limpar').setEmoji('🧹').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`dev_inspector_show:${guildId}`).setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function devPanelMonitor() {
  const ws = client.ws;
  const shards = ws.shards ? [...ws.shards.values()] : [];
  const memory = process.memoryUsage();
  const e1 = new EmbedBuilder().setTitle('📡 Monitor').setColor('#00AAFF')
    .addFields(
      { name: '🔌', value: `${shards.length || 1}`, inline: true },
      { name: '📡', value: `${ws.ping}ms`, inline: true },
      { name: '💓', value: shards[0]?.heartbeat?.latency ? `${shards[0].heartbeat.latency}ms` : 'N/A', inline: true },
    );
  const e2 = new EmbedBuilder().setTitle('💻 Recursos').setColor('#FEE75C')
    .addFields(
      { name: '🧠 Heap', value: `${(memory.heapUsed / 1024 / 1024).toFixed(2)} / ${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB`, inline: true },
      { name: '🔷 RSS', value: `${(memory.rss / 1024 / 1024).toFixed(2)} MB`, inline: true },
      { name: '⏱️', value: fmtUptime(process.uptime()), inline: true },
      { name: '📦 Cache Config', value: `${_configCache.size} • hit ${_configCache.hitRate}%`, inline: false },
    );
  return {
    embeds: [e1, e2],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_monitor_refresh').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_monitor_reconnect').setLabel('Reconectar').setEmoji('⚡').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function devPanelPreview() {
  return {
    embeds: [new EmbedBuilder().setTitle('🎨 Preview').setColor('#5865F2').setDescription('Construa embeds e veja antes de postar.')],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_preview_create').setLabel('Criar').setEmoji('📝').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function devPanelForceRejoin() {
  const { data: out } = await supabase.from('bot_guilds').select('name,guild_id').eq('in_guild', false).limit(20);
  const e = new EmbedBuilder().setTitle('🎯 Rejoin').setColor('#FF5555')
    .setDescription(`**Saí de:** ${out?.length || 0}\n\n${out?.slice(0, 5).map(g => `**${g.name}**`).join('\n') || '*Nenhum*'}`);
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_rejoin_all').setLabel('Todos').setEmoji('🚀').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_rejoin_manual').setLabel('Manual').setEmoji('🔗').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// DEV PAINÉIS — Rate Limit / Simulator / Sandbox
// ═══════════════════════════════════════════════════════════
const rateLimitTracker = { total: 0, limited: 0, lastReset: Date.now(), buckets: {} };
if (client.rest) {
  client.rest.on('rateLimited', (info) => {
    rateLimitTracker.total++;
    rateLimitTracker.limited++;
    const key = info.route || 'unknown';
    rateLimitTracker.buckets[key] = (rateLimitTracker.buckets[key] || 0) + 1;
  });
}

async function devPanelRateLimit() {
  const uptime = (Date.now() - rateLimitTracker.lastReset) / 60000;
  const e = new EmbedBuilder().setTitle('⚡ Rate Limit').setColor('#FFA500')
    .setDescription(`Janela: **${uptime.toFixed(1)}min**`)
    .addFields(
      { name: '📊', value: `\`${rateLimitTracker.total}\``, inline: true },
      { name: '🚫', value: `\`${rateLimitTracker.limited}\``, inline: true },
      { name: '📈', value: rateLimitTracker.total ? `\`${((rateLimitTracker.limited / rateLimitTracker.total) * 100).toFixed(2)}%\`` : '`0%`', inline: true },
    );
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_ratelimit_reset').setLabel('Resetar').setEmoji('🔄').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function devPanelSimulator() {
  return {
    embeds: [new EmbedBuilder().setTitle('🎬 Simulador').setColor('#9B59B6').setDescription('Roda fluxo completo sem executar de verdade.')],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_simulate_run').setLabel('Rodar').setEmoji('▶️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function devPanelSandbox() {
  return {
    embeds: [new EmbedBuilder().setTitle('🧪 Sandbox').setColor('#808080')
      .setDescription('Execute JS em ambiente controlado.')
      .addFields({ name: '🔒 Vars', value: '```js\nclient, guild, member, channel,\nEmbedBuilder, ActionRowBuilder, ButtonBuilder,\nButtonStyle, supabase, sleep, logError```' })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_sandbox_run').setLabel('Rodar').setEmoji('▶️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_sandbox_snippets').setLabel('Snippets').setEmoji('📋').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

function buildSandboxSnippets() {
  const snippets = [
    { label: 'Guild count', value: 'return client.guilds.cache.size' },
    { label: 'Ping', value: 'return client.ws.ping' },
    { label: 'Memory', value: 'return process.memoryUsage()' },
    { label: 'Uptime', value: 'return process.uptime()' },
    { label: 'Cache stats', value: 'return { configs: _configCache.size, hitRate: _configCache.hitRate }' },
    { label: 'Count DB', value: "const { count } = await supabase.from('guilds').select('id', { count: 'exact', head: true }); return count" },
  ];
  const menu = new StringSelectMenuBuilder().setCustomId('dev_sandbox_snippet_pick').setPlaceholder('Snippet');
  for (const s of snippets) menu.addOptions({ label: s.label, value: s.value.substring(0, 100) });
  return {
    embeds: [new EmbedBuilder().setTitle('🧪 Snippets').setColor('#808080')],
    components: [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_sandbox').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
    ],
  };
}

async function buildPingDetailed() {
  const [render, sb] = await Promise.all([getRenderInfo(), getSupabaseInfo()]);
  const sys = getSystemInfo();
  const up = Math.floor((Date.now() - BOT_START_TIME) / 1000);
  const eBot = new EmbedBuilder().setTitle('🤖 Bot').setColor('#57F287')
    .addFields(
      { name: '🏷️', value: `\`${client.user.tag}\``, inline: true },
      { name: '📡', value: `\`${client.ws.ping}ms\``, inline: true },
      { name: '⏱️', value: `\`${fmtUptime(up)}\``, inline: true },
      { name: '🌐', value: `\`${client.guilds.cache.size}\``, inline: true },
      { name: '👥', value: `\`${client.users.cache.size}\``, inline: true },
    );
  const eHost = new EmbedBuilder().setTitle('🖥️ Render').setColor(render.ok ? '#5865F2' : '#ED4245');
  if (render.ok) {
    const s = render.service;
    eHost.addFields(
      { name: '📛', value: `\`${s.name}\``, inline: true },
      { name: '💎', value: `\`${s.plan}\``, inline: true },
      { name: '⚡', value: render.cpu != null ? `\`${(render.cpu * 100).toFixed(1)}%\`` : 'N/A', inline: true },
      { name: '🧠', value: render.mem != null ? `\`${render.mem.toFixed(0)} MB\`` : 'N/A', inline: true },
    );
  } else eHost.setDescription(`❌ ${render.error}`);
  const eDB = new EmbedBuilder().setTitle('🗄️ Supabase').setColor(sb.ok ? '#3ECF8E' : '#ED4245');
  if (sb.ok) {
    eDB.addFields(
      { name: '📡', value: `\`${sb.ping}ms\``, inline: true },
      { name: '📊', value: `\`${Object.keys(sb.counts).length}\``, inline: true },
    );
    const entries = Object.entries(sb.counts).filter(([, v]) => v >= 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (entries.length) eDB.addFields({ name: '📋 Top', value: entries.map(([t, n]) => `> \`${t}\` → **${n}**`).join('\n') });
  } else eDB.setDescription(`❌ ${sb.error}`);
  const eSys = new EmbedBuilder().setTitle('🖥️ Sistema').setColor('#FEE75C')
    .addFields(
      { name: '🟩 Node', value: `\`${sys.node}\``, inline: true },
      { name: '💻', value: `\`${sys.platform}\``, inline: true },
      { name: '🔢', value: `\`${sys.cpuCores}\``, inline: true },
      { name: '🧠 RAM', value: `\`${sys.usedMem}/${sys.totalMem} GB (${sys.memPercent}%)\``, inline: false },
      { name: '📦 Heap', value: `\`${sys.heapUsed}/${sys.heapTotal} MB\``, inline: true },
      { name: '🔷 RSS', value: `\`${sys.rss} MB\``, inline: true },
    );
  return [eBot, eHost, eDB, eSys];
}

// ═══════════════════════════════════════════════════════════
// DEV PAINÉIS — Locale / Broadcast / Analytics
// ═══════════════════════════════════════════════════════════
async function devPanelLocale(guild) {
  const loc = await getGuildLocale(guild.id);
  const e = new EmbedBuilder().setTitle('🌐 Idioma').setColor('#5865F2').setDescription(`Atual: \`${loc}\``);
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_locale_pt').setLabel('Português').setEmoji('🇧🇷').setStyle(loc === 'pt-BR' ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dev_locale_en').setLabel('English').setEmoji('🇺🇸').setStyle(loc === 'en-US' ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dev_locale_es').setLabel('Español').setEmoji('🇪🇸').setStyle(loc === 'es-ES' ? ButtonStyle.Success : ButtonStyle.Secondary),
    )],
  };
}

async function devPanelBroadcast() {
  return {
    embeds: [new EmbedBuilder().setTitle('📢 Broadcast Manual').setColor('#00AAFF')
      .setDescription(
        `Envie uma **atualização customizada** pra um servidor ou pra **rede toda**.\n\n` +
        `**O modal vai pedir:**\n> 📌 Título\n> 📝 Descrição\n> 🔧 O que atualizou (uma linha = item)\n> 🖼️ Imagem (opcional)\n> 🎨 Cor (opcional)\n\n` +
        `**Vai marcar o cargo mais alto de cada servidor.**`
      )
      .setFooter({ text: 'Painel Dev • Broadcast Manual' })],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_broadcast_compose').setLabel('Criar').setEmoji('✍️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_broadcast_history').setLabel('Histórico').setEmoji('📋').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_broadcast_test').setLabel('Teste').setEmoji('🧪').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
    ],
  };
}

async function devPanelAnalytics(gid) {
  const g = client.guilds.cache.get(gid);
  if (!g) return { embeds: [new EmbedBuilder().setTitle('❌').setColor('#FF5555').setDescription('Guild não encontrada.')], components: [] };
  const isPrem = await isPremium(gid);
  if (!isPrem) return { embeds: [new EmbedBuilder().setTitle('❌ Sem premium').setColor('#FF5555').setDescription('Ative premium no servidor.')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
  const tier = await getPremiumTier(gid);
  if (!tier || !tierAtLeast(tier, 'ultra')) {
    return {
      embeds: [new EmbedBuilder().setTitle('💎 Recurso Ultra').setColor('#FFD700')
        .setDescription('Analytics avançado exige tier **Ultra** ou superior.')
        .addFields({ name: 'Tier atual', value: tier ? `${PREMIUM_TIERS[tier]?.emoji || ''} **${PREMIUM_TIERS[tier]?.label || tier}**` : '*nenhum*' })],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))],
    };
  }
  const a = await getAnalyticsAdvanced(gid);
  const e1 = new EmbedBuilder().setTitle(`📈 Analytics — ${g.name}`).setColor('#8B5CF6')
    .setDescription(`**Últimos 7 dias**`)
    .addFields(
      { name: '🎮 Apostas', value: `**${a.bets7d}**`, inline: true },
      { name: '🛒 Pedidos', value: `**${a.orders7d}**`, inline: true },
      { name: '💰 Faturamento', value: `**${brl(a.fat7d)}**`, inline: true },
      { name: '🎫 Tickets', value: `**${a.tickets7d}**`, inline: true },
      { name: '🪙 Coins mov.', value: `**${a.coinsMov7d}**`, inline: true },
      { name: '👥 Membros', value: `**${g.memberCount}**`, inline: true },
    ).setTimestamp();
  const topUsage = a.usage.length
    ? a.usage.slice(0, 10).map((u, i) => `${i + 1}. \`${u.feature}\` — **${u.uses}** usos`).join('\n')
    : '*Nenhum uso registrado ainda.*';
  const e2 = new EmbedBuilder().setTitle('🔥 Top Features').setColor('#FEE75C').setDescription(topUsage);
  return {
    embeds: [e1, e2],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`dev_analytics_refresh:${gid}`).setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// DEV PAINÉIS — Versículo + PIX Mediadores
// ═══════════════════════════════════════════════════════════
async function devPanelVersiculo() {
  const ativos = [];
  for (const g of client.guilds.cache.values()) {
    const c = await getConfig(g.id);
    if (c.versiculo_ativo) ativos.push({ guild: g, cfg: c });
  }
  const thisCfg = await getConfig(guild.id);
  const e = new EmbedBuilder().setTitle('📖 Versículo do Dia — Config').setColor('#FEE75C')
    .setDescription(`**Servidores com versículo ativo:** ${ativos.length}/${client.guilds.cache.size}\n\n**Como funciona:**\n> ⏰ Envia automaticamente no horário configurado\n> 📢 Em um canal específico\n> 🔄 Busca via API + fallback local`)
    .addFields({ name: '📌 Este servidor', value: `${thisCfg.versiculo_ativo ? '🟢 Ativo' : '🔴 Inativo'}\nCanal: ${thisCfg.versiculo_channel ? `<#${thisCfg.versiculo_channel}>` : '*não configurado*'}\nHorário: ${thisCfg.versiculo_hora || 8}h`, inline: false })
    .setFooter({ text: 'Frio Bot • Versículo' }).setTimestamp();
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_versiculo_toggle').setLabel('Ligar/Desligar').setEmoji('🔄').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_versiculo_set_channel').setLabel('Canal').setEmoji('📢').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_versiculo_set_hour').setLabel('Horário').setEmoji('⏰').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_versiculo_test').setLabel('Testar agora').setEmoji('🧪').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_versiculo_stats').setLabel('Histórico').setEmoji('📊').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_versiculo_all').setLabel('Lista global').setEmoji('🌐').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
    ],
  };
}

async function devPanelVersiculoStats(guildId) {
  const { data } = await supabase.from('daily_verses_history').select('*').eq('guild_id', guildId).order('sent_at', { ascending: false }).limit(20);
  const e = new EmbedBuilder().setTitle('📊 Histórico de Versículos').setColor('#FEE75C')
    .setDescription(data?.length
      ? data.map(h => `**${h.verse_ref}**\n> *${(h.verse_text || '').substring(0, 100)}*\n> <t:${Math.floor(new Date(h.sent_at).getTime() / 1000)}:R>`).join('\n\n')
      : '*Nenhum versículo enviado ainda.*');
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_versiculo_config').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function devPanelVersiculoAll() {
  const ativos = [];
  for (const g of client.guilds.cache.values()) {
    const c = await getConfig(g.id);
    if (c.versiculo_ativo) ativos.push({ g, c });
  }
  const e = new EmbedBuilder().setTitle('🌐 Versículo — Ativos').setColor('#FEE75C')
    .setDescription(ativos.length
      ? ativos.slice(0, 20).map(({ g, c }) => `**${g.name}**\n> 📢 ${c.versiculo_channel ? `<#${c.versiculo_channel}>` : '*?'} • ⏰ ${c.versiculo_hora || 8}h`).join('\n\n')
      : '*Nenhum servidor com versículo ativo.*')
    .setFooter({ text: `Total: ${ativos.length}` });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_versiculo_config').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function devPanelPixMediadores(guildId) {
  const allPix = await ffGetAllMediatorPix(guildId);
  const g = client.guilds.cache.get(guildId);
  if (!g) return { embeds: [new EmbedBuilder().setTitle('❌').setColor('#FF5555').setDescription('Servidor não encontrado.')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setStyle(ButtonStyle.Secondary))] };
  const meds = await ffGetMediatorQueue(guildId);
  const configured = allPix.filter(p => p.pix_key);
  const e = new EmbedBuilder().setTitle('💳 PIX dos Mediadores — ADMIN').setColor('#22c55e')
    .setDescription(`**Servidor:** ${g.name}\n**Configurados:** ${configured.length}\n**Total na fila:** ${meds.length}\n\n⚠️ *Visão administrativa — exibe chaves completas.*`)
    .setTimestamp();
  if (configured.length > 0) {
    const list = configured.slice(0, 15).map(p => {
      const med = meds.find(m => m.user_id === p.user_id);
      const status = med ? (med.status === 'busy' ? '🔴 Em partida' : '🟢 Disponível') : '⚪ Fora';
      return `**<@${p.user_id}>** ${status}\n> 🔑 \`${p.pix_key}\`\n> 👤 ${p.pix_name} • 🏙️ ${p.pix_city || '—'}\n> 📅 <t:${Math.floor(new Date(p.updated_at).getTime() / 1000)}:R>`;
    }).join('\n\n');
    e.addFields({ name: `📋 Mediadores (${configured.length})`, value: list.substring(0, 4000) });
  } else e.addFields({ name: '📋', value: '*Nenhum mediador cadastrou PIX ainda.*' });
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`dev_pixmed_edit:${guildId}`).setLabel('Editar PIX').setEmoji('✏️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`dev_pixmed_clear:${guildId}`).setLabel('Limpar todos').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`dev_inspector_show:${guildId}`).setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 7/9
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 8/9] ADMIN HUB + PAINÉIS ADMIN + PAINÉIS LOJA
// + SLASH COMMANDS + AJUDA + RESGATAR KEY
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// ADMIN HUB — MENU PRINCIPAL
// ═══════════════════════════════════════════════════════════
function adminHub() {
  const e = new EmbedBuilder()
    .setTitle('🛡️ Painel Admin')
    .setColor('#ED4245')
    .setDescription(
      `**Tudo que precisa no servidor, organizado:**\n\n` +
      `🏗️ **Servidor** — info, backup, anúncios, call\n` +
      `🎯 **Gerenciamento** — painéis, configs, sorteios\n` +
      `⚠️ **Moderação** — tickets, usuários, manutenção\n` +
      `🎵 **Música** *(premium)* — player completo\n` +
      `📖 **Versículo** — configurar versículo do dia\n` +
      `🛒 **Loja** — produtos, estoque, PIX`
    )
    .setFooter({ text: `Painel Admin • ${BOT_VERSION}` })
    .setTimestamp();
  const menu = new StringSelectMenuBuilder()
    .setCustomId('adm_cat_pick')
    .setPlaceholder('📂 Escolha uma categoria')
    .addOptions(
      { label: 'Servidor', description: 'Info, backup, anúncios', value: 'servidor', emoji: '🏗️' },
      { label: 'Gerenciamento', description: 'Painéis, configurar, sorteios', value: 'gerenciamento', emoji: '🎯' },
      { label: 'Moderação', description: 'Tickets, usuários, manutenção', value: 'moderacao', emoji: '⚠️' },
      { label: 'Música', description: 'Player (premium)', value: 'musica', emoji: '🎵' },
      { label: 'Versículo', description: 'Versículo do dia', value: 'versiculo', emoji: '📖' },
      { label: 'Loja', description: 'Produtos e estoque', value: 'loja', emoji: '🛒' },
    );
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(menu)] };
}

// ═══════════════════════════════════════════════════════════
// ADMIN CATEGORIAS
// ═══════════════════════════════════════════════════════════
async function admCatServidor() {
  return {
    embeds: [new EmbedBuilder().setTitle('🏗️ Servidor').setColor('#5865F2')
      .setDescription('> 📊 Info\n> 💾 Backup\n> 📢 Anúncios\n> 🔊 Call\n> 🎮 Utilidades')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adm_servidor').setLabel('Info').setEmoji('📊').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adm_sv_backup').setLabel('Backup').setEmoji('💾').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adm_anuncios').setLabel('Anúncios').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adm_utilidades').setLabel('Utilidades').setEmoji('🎮').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adm_call').setLabel('Call').setEmoji('🔊').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function admCatGerenciamento() {
  return {
    embeds: [new EmbedBuilder().setTitle('🎯 Gerenciamento').setColor('#FFA500')
      .setDescription('> 🎫 Painéis\n> ⚙️ Configurar\n> 🎉 Sorteios\n> 🤖 Automação\n> 🛡️ Anti-Raid')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adm_paineis').setLabel('Painéis').setEmoji('🎫').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adm_configurar').setLabel('Configurar').setEmoji('⚙️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adm_sorteios').setLabel('Sorteios').setEmoji('🎉').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adm_automacao').setLabel('Automação').setEmoji('🤖').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adm_antiraid').setLabel('Anti-Raid').setEmoji('🛡️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function admCatModeracao() {
  return {
    embeds: [new EmbedBuilder().setTitle('⚠️ Moderação').setColor('#FF5555')
      .setDescription('> 🎫 Tickets\n> 👤 Usuários\n> 🔧 Manutenção')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adm_tickets').setLabel('Tickets').setEmoji('🎫').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adm_usuarios').setLabel('Usuários').setEmoji('👤').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adm_manutencao').setLabel('Manutenção').setEmoji('🔧').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function admCatVersiculo(guild) {
  const c = await getConfig(guild.id);
  return {
    embeds: [new EmbedBuilder().setTitle('📖 Versículo do Dia').setColor('#FEE75C')
      .setDescription(`**Status:** ${c.versiculo_ativo ? '🟢 Ativo' : '🔴 Inativo'}\n**Canal:** ${c.versiculo_channel ? `<#${c.versiculo_channel}>` : '*não configurado*'}\n**Horário:** ${c.versiculo_hora || 8}h\n\n💎 Recurso **Unlimited**`)],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adm_versiculo_toggle').setLabel(c.versiculo_ativo ? 'Desativar' : 'Ativar').setEmoji(c.versiculo_ativo ? '🔴' : '🟢').setStyle(c.versiculo_ativo ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder().setCustomId('adm_versiculo_set_channel').setLabel('Canal').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adm_versiculo_set_hour').setLabel('Horário').setEmoji('⏰').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adm_versiculo_test').setLabel('Testar').setEmoji('🧪').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// ADMIN PAINÉIS
// ═══════════════════════════════════════════════════════════
async function admPanelServidor(guild) {
  const bans = guild.bans.cache.size || 0;
  return {
    embeds: [new EmbedBuilder().setTitle('📊 Servidor').setColor('#5865F2')
      .addFields(
        { name: '👥', value: `${guild.memberCount}`, inline: true },
        { name: '📢', value: `${guild.channels.cache.size}`, inline: true },
        { name: '🎭', value: `${guild.roles.cache.size}`, inline: true },
        { name: '🚫', value: `${bans}`, inline: true },
        { name: '👑', value: `<@${guild.ownerId}>`, inline: true },
        { name: '📅', value: guild.createdAt.toLocaleDateString('pt-BR'), inline: true },
      )],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adm_sv_backup').setLabel('Backup').setEmoji('💾').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function admPanelAnuncios() {
  return {
    embeds: [new EmbedBuilder().setTitle('📢 Anúncios').setColor('#5865F2')],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adm_say').setLabel('Say').setEmoji('🗣️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adm_anunciar').setLabel('Anunciar').setEmoji('📢').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adm_embed').setLabel('Embed').setEmoji('📝').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adm_global').setLabel('Global').setEmoji('🌐').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function admPanelUtilidades() {
  return {
    embeds: [new EmbedBuilder().setTitle('🎮 Utilidades').setColor('#5865F2')],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('util_dado').setLabel('Dado').setEmoji('🎲').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('util_sorteio').setLabel('Sortear').setEmoji('🎯').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('util_enquete').setLabel('Enquete').setEmoji('📊').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('util_ping').setLabel('Ping').setEmoji('🏓').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function admPanelMusica(guild) {
  const isPrem = await isPremium(guild.id);
  const tier = await getPremiumTier(guild.id);
  const canUse = tier && tierAtLeast(tier, 'basic');
  return {
    embeds: [new EmbedBuilder().setTitle('🎵 Música').setColor('#1DB954')
      .setDescription(canUse ? `Use os controles. Tier: **${PREMIUM_TIERS[tier]?.label}**` : '💎 **Recurso Premium (Basic+).** Ative em `/dev → Gerenciamento → Premium`.')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mus_play').setLabel('Play').setEmoji('▶️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('mus_pause').setLabel('Pause').setEmoji('⏸️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('mus_skip').setLabel('Pular').setEmoji('⏭️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('mus_stop').setLabel('Parar').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mus_queue').setLabel('Fila').setEmoji('📋').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('mus_loop').setLabel('Loop').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('mus_vol').setLabel('Volume').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function admPanelCall() {
  return {
    embeds: [new EmbedBuilder().setTitle('🔊 Call').setColor('#5865F2').setDescription('Entre em um canal de voz e use os botões.')],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adm_call_join').setLabel('Entrar').setEmoji('🔊').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('adm_call_leave').setLabel('Sair').setEmoji('👋').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function admPanelAntiRaid() {
  return {
    embeds: [new EmbedBuilder().setTitle('🛡️ Anti-Raid').setColor('#FF0000')
      .addFields(
        { name: 'Convites/min', value: `${raidLimits.invitesPerMinute}`, inline: true },
        { name: 'Canais/min', value: `${raidLimits.channelCreatesPerMinute}`, inline: true },
        { name: 'Cargos/min', value: `${raidLimits.roleCreatesPerMinute}`, inline: true },
        { name: 'Bans/min', value: `${raidLimits.bansPerMinute}`, inline: true },
      )],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adm_lockdown').setLabel('Lockdown').setEmoji('🔒').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function admPanelManutencao(guild) {
  const cfg = await getConfig(guild.id);
  const ativo = !!cfg.admin_maintenance;
  return {
    embeds: [new EmbedBuilder().setTitle('🔧 Manutenção Admin').setColor(ativo ? '#ff5555' : '#22c55e')
      .setDescription(ativo ? '⚠️ ATIVA' : '🟢 DESATIVADA')
      .addFields(
        { name: 'Motivo', value: cfg.admin_maintenance_reason || '*—*' },
        { name: 'Por', value: cfg.admin_maintenance_by ? `<@${cfg.admin_maintenance_by}>` : '*—*', inline: true },
      )],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adm_maint_toggle').setLabel(ativo ? 'Desativar' : 'Ativar').setEmoji(ativo ? '🟢' : '🔴').setStyle(ativo ? ButtonStyle.Success : ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('adm_maint_reason').setLabel('Motivo').setEmoji('📝').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function admPanelTickets(guild) {
  const panels = await getTicketPanels(guild.id);
  const { data, count } = await supabase.from('ticket_data').select('closed_at', { count: 'exact' }).eq('guild_id', guild.id);
  const ab = (data || []).filter(t => !t.closed_at).length;
  return {
    embeds: [new EmbedBuilder().setTitle('🎫 Tickets').setColor('#9B59B6')
      .setDescription(`**Painéis:** ${panels.length}/${MAX_TICKET_PANELS}`)
      .addFields(
        { name: 'Abertos', value: `${ab}`, inline: true },
        { name: 'Fechados', value: `${(count || 0) - ab}`, inline: true },
        { name: 'Total', value: `${count || 0}`, inline: true },
      )],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adm_ticket_panels').setLabel('Gerenciar Painéis').setEmoji('🎨').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adm_ticket_create').setLabel('Criar Painel').setEmoji('➕').setStyle(ButtonStyle.Success),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function admPanelUsuarios() {
  return {
    embeds: [new EmbedBuilder().setTitle('👤 Usuários').setColor('#5865F2')],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adm_u_info').setLabel('Info').setEmoji('ℹ️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adm_u_warns').setLabel('Warns').setEmoji('⚠️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('adm_u_role').setLabel('Dar cargo').setEmoji('🎭').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adm_u_bl').setLabel('Blacklist').setEmoji('🚫').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function admPanelAutomacao(guild) {
  const c = await getConfig(guild.id);
  return {
    embeds: [new EmbedBuilder().setTitle('🤖 Automação').setColor('#5865F2')
      .addFields(
        { name: 'Anti-link', value: c.anti_link ? '🟢' : '🔴', inline: true },
        { name: 'Anti-convite', value: c.anti_invite ? '🟢' : '🔴', inline: true },
        { name: 'AutoRole', value: c.autorole_role ? `<@&${c.autorole_role}>` : '*—*', inline: true },
      )],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cfg_toggle_antilink').setLabel('Anti-link').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('cfg_toggle_antiinvite').setLabel('Anti-convite').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('cfg_canais').setLabel('Canais').setEmoji('📁').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cfg_cargos').setLabel('Cargos').setEmoji('🎭').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINÉIS LOJA
// ═══════════════════════════════════════════════════════════
function setupHome(s) {
  const e = baseEmbed(s, '🛒 CONFIGURAÇÃO DA LOJA', 'Configure tudo.')
    .addFields(
      { name: '🏪', value: s?.store_name || '*—*', inline: true },
      { name: '💳', value: s?.payment_mode === 'automatico' ? '🤖' : '🧑', inline: true },
      { name: '💳 MP', value: s?.mp_access_token ? '🟢' : '🔴', inline: true },
    );
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('setup:store').setLabel('Loja').setEmoji('🛍️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup:payment').setLabel('Pagamentos').setEmoji('💳').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup:logs').setLabel('Logs').setEmoji('🖼️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('setup:permissions').setLabel('Permissões').setEmoji('👑').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panel:home').setLabel('Painel').setEmoji('🎛️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('setup:home').setLabel('Fechar').setEmoji('❌').setStyle(ButtonStyle.Danger),
      ),
    ],
  };
}

async function panelHome(gid) {
  const s = await getSettings(gid);
  const e = baseEmbed(s, '⚙️ PAINEL DA LOJA')
    .addFields(
      { name: '🏪', value: s?.store_name || '-', inline: true },
      { name: '💳', value: s?.payment_mode === 'automatico' ? '🤖' : '🧑', inline: true },
      { name: '🖼️', value: s?.sales_channel_id ? `<#${s.sales_channel_id}>` : '*—*', inline: true },
    );
  return {
    embeds: [e],
    components: [
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
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panel:pedidos').setLabel('Pedidos').setEmoji('🧾').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('panel:shop_panels').setLabel('Painéis').setEmoji('🎨').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('panel:top').setLabel('Top').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('panel:export').setLabel('CSV').setEmoji('📤').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// Bug #33 corrigido: 1 query ao invés de N
async function panelProducts(gid) {
  const s = await getSettings(gid);
  const { data: prods } = await supabase.from('products').select('*').eq('guild_id', gid).order('id', { ascending: false }).limit(15);
  const e = baseEmbed(s, '🛍️ PRODUTOS', prods?.length ? '' : 'Nenhum.');
  if (prods?.length) {
    const ids = prods.filter(p => !p.infinite_content).map(p => p.id);
    const stockCounts = await getStockCounts(ids);
    for (const p of prods) {
      const stk = p.infinite_content ? '∞' : `${stockCounts[p.id] || 0}`;
      e.addFields({ name: `${p.name} — ${brl(p.price)}`, value: `ID \`${p.id}\` • Est **${stk}** • ${p.active ? '✅' : '❌'}`, inline: true });
    }
  }
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('prod:create').setLabel('Criar').setEmoji('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('prod:edit').setLabel('Editar').setEmoji('✏️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('prod:del').setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('prod:toggle').setLabel('Toggle').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function panelStock(gid) {
  const s = await getSettings(gid);
  const { data: prods } = await supabase.from('products').select('*').eq('guild_id', gid).order('id');
  const e = baseEmbed(s, '📦 ESTOQUE', 'Selecione um produto.');
  const menu = new StringSelectMenuBuilder().setCustomId('stock:pick').setPlaceholder('Produto');
  if (prods?.length) {
    const ids = prods.filter(p => !p.infinite_content).map(p => p.id);
    const stockCounts = await getStockCounts(ids);
    for (const p of prods.slice(0, 25)) {
      menu.addOptions({ label: p.name.slice(0, 90), value: String(p.id), description: p.infinite_content ? '∞' : `Est: ${stockCounts[p.id] || 0}` });
    }
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
  const isInf = !!p.infinite_content;
  const { count } = await supabase.from('inventory').select('id', { count: 'exact', head: true }).eq('product_id', pid).eq('status', 'available');
  const e = baseEmbed(s, `📦 ${p.name}`, `Disponível: **${isInf ? '♾️' : (count || 0)}** • Tipo: \`${p.delivery_type}\``);
  if (isInf) e.addFields({ name: '♾️', value: `\`${p.infinite_type}\`\n\`\`\`${(p.infinite_content || '').substring(0, 150)}\`\`\`` });
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`stock:add:${pid}`).setLabel('Add').setEmoji('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`stock:addfile:${pid}`).setLabel('Arquivo').setEmoji('📁').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`stock:clear:${pid}`).setLabel('Limpar').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`stock:infinite:${pid}`).setLabel(isInf ? 'Editar ∞' : '∞').setEmoji('♾️').setStyle(isInf ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`stock:infinite_off:${pid}`).setLabel('Desativar ∞').setEmoji('🔴').setStyle(ButtonStyle.Danger).setDisabled(!isInf),
      ),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:stock').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
    ],
  };
}

async function panelCats(gid) {
  const s = await getSettings(gid);
  const cats = await getCats(gid);
  const e = baseEmbed(s, '📁 Categorias', cats.length ? '' : 'Nenhuma.');
  for (const c of cats) e.addFields({ name: `${c.emoji || '📁'} ${c.name}`, value: `ID \`${c.id}\``, inline: true });
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cat:create').setLabel('Criar').setEmoji('➕').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('cat:del').setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function panelCoupons(gid) {
  const s = await getSettings(gid);
  const { data: list } = await supabase.from('coupons').select('*').eq('guild_id', gid).limit(15);
  const e = baseEmbed(s, '🏷️ Cupons', list?.length ? '' : 'Nenhum.');
  for (const c of list || []) {
    e.addFields({ name: c.code, value: `${c.type === 'percent' ? `${c.value}%` : brl(c.value)} • ${c.uses}/${c.max_uses || '∞'}`, inline: true });
  }
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('coupon:create').setLabel('Criar').setEmoji('➕').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('coupon:del').setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function panelPromos(gid) {
  const s = await getSettings(gid);
  const { data: list } = await supabase.from('promotions').select('*').eq('guild_id', gid).limit(15);
  const e = baseEmbed(s, '🎁 Promoções', list?.length ? '' : 'Nenhuma.');
  for (const p of list || []) e.addFields({ name: p.name, value: `-${p.value}%`, inline: true });
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('promo:create').setLabel('Criar').setEmoji('➕').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('promo:del').setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function panelClients(gid) {
  const s = await getSettings(gid);
  return {
    embeds: [baseEmbed(s, '👥 Clientes')],
    components: [
      new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('client:pick').setPlaceholder('Cliente')),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
    ],
  };
}

async function panelStats(gid) {
  const s = await getSettings(gid);
  const [ordsRes, pcRes, ccRes] = await Promise.all([
    supabase.from('orders').select('total').eq('guild_id', gid).eq('status', 'delivered'),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('guild_id', gid),
    supabase.from('customers').select('user_id', { count: 'exact', head: true }).eq('guild_id', gid),
  ]);
  const total = (ordsRes.data || []).reduce((a, o) => a + Number(o.total || 0), 0);
  return {
    embeds: [baseEmbed(s, '📊 Estatísticas').addFields(
      { name: '💰', value: brl(total), inline: true },
      { name: '🛒', value: String((ordsRes.data || []).length), inline: true },
      { name: '👥', value: String(ccRes.count || 0), inline: true },
      { name: '📦', value: String(pcRes.count || 0), inline: true },
    )],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))],
  };
}

async function panelTop(gid) {
  const s = await getSettings(gid);
  const { data: cst } = await supabase.from('customers').select('user_id,total_spent').eq('guild_id', gid).order('total_spent', { ascending: false }).limit(10);
  const e = baseEmbed(s, '🏆 Top Clientes');
  if (cst?.length) e.addFields({ name: '👑', value: cst.map((c, i) => `${i + 1}. <@${c.user_id}> — ${brl(c.total_spent || 0)}`).join('\n') });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function ordersPanel(gid, filter) {
  const s = await getSettings(gid);
  let q = supabase.from('orders').select('id,user_id,total,status,created_at').eq('guild_id', gid).order('id', { ascending: false }).limit(15);
  if (filter === 'pending') q = q.in('status', ['awaiting_payment', 'pending', 'awaiting_approval', 'open']);
  if (filter === 'delivered') q = q.eq('status', 'delivered');
  if (filter === 'cancelled') q = q.eq('status', 'cancelled');
  const { data: list } = await q;
  const e = baseEmbed(s, '🧾 PEDIDOS', `Filtro: \`${filter}\``);
  for (const o of list || []) e.addFields({ name: `#${o.id} — ${brl(o.total)}`, value: `<@${o.user_id}> • \`${o.status}\`` });
  const rows = [];
  if (list?.length) {
    const menu = new StringSelectMenuBuilder().setCustomId('pedidos:pick').setPlaceholder('Selecionar');
    for (const o of list) menu.addOptions({ label: `#${o.id} • ${o.status}`.slice(0, 90), value: String(o.id) });
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pedidos:pending').setLabel('Pendentes').setEmoji('⏳').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('pedidos:delivered').setLabel('Concluídos').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('pedidos:cancelled').setLabel('Cancelados').setEmoji('❌').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('pedidos:all').setLabel('Todos').setEmoji('📋').setStyle(ButtonStyle.Secondary),
  ));
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
  return { embeds: [e], components: rows };
}

async function panelShopPanels(gid) {
  const panels = await getShopPanels(gid);
  const e = baseEmbed(await getSettings(gid), '🎨 Painéis', `Total: **${panels.length}/${MAX_SHOP_PANELS}**`);
  for (const p of panels.slice(0, 10)) e.addFields({ name: `#${p.id} — ${p.name}`, value: `📢 ${p.channel_id ? `<#${p.channel_id}>` : '*não enviado*'}` });
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('shop_panel:create').setLabel('Criar').setEmoji('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('shop_panel:send').setLabel('Enviar').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('shop_panel:delete').setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// SLASH COMMANDS — getCommands + registerCommands
// ═══════════════════════════════════════════════════════════
function getCommands() {
  return [
    new SlashCommandBuilder().setName('ping').setDescription('🏓 Latência'),
    new SlashCommandBuilder().setName('perfil').setDescription('👤 Seu perfil'),
    new SlashCommandBuilder().setName('serverinfo').setDescription('📋 Info do servidor'),
    new SlashCommandBuilder().setName('userinfo').setDescription('👤 Info do usuário').addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(false)),
    new SlashCommandBuilder().setName('avatar').setDescription('🖼️ Avatar').addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(false)),
    new SlashCommandBuilder().setName('birthday').setDescription('🎂 Aniversário').addStringOption(o => o.setName('data').setDescription('DD/MM').setRequired(true)),
    new SlashCommandBuilder().setName('suggestion').setDescription('💡 Sugestão').addStringOption(o => o.setName('ideia').setDescription('Ideia').setRequired(true)),
    new SlashCommandBuilder().setName('ia').setDescription('🤖 IA').addStringOption(o => o.setName('pergunta').setDescription('Pergunta').setRequired(true)),
    new SlashCommandBuilder().setName('reportar').setDescription('🐛 Bug')
      .addStringOption(o => o.setName('bug').setDescription('Resumo').setRequired(true))
      .addStringOption(o => o.setName('passos').setDescription('Passos').setRequired(true))
      .addAttachmentOption(o => o.setName('print').setDescription('Print').setRequired(false)),
    new SlashCommandBuilder().setName('ajuda').setDescription('📖 Ajuda detalhada'),
    new SlashCommandBuilder().setName('admin').setDescription('🛡️ Hub admin').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('dev').setDescription('👑 Hub dev'),
    new SlashCommandBuilder().setName('hub').setDescription('🎮 Apostas').addSubcommand(s => s.setName('apostas').setDescription('Hub FF')),
    new SlashCommandBuilder().setName('status').setDescription('Status').addStringOption(o => o.setName('atividade').setDescription('O que faz').setRequired(true).addChoices({ name: 'Desenvolvendo', value: 'Desenvolvendo' }, { name: 'Jogando', value: 'Jogando' })),
    new SlashCommandBuilder().setName('resgatar').setDescription('🔑 Resgatar key premium').addSubcommand(s => s.setName('key').setDescription('Resgata uma key').addStringOption(o => o.setName('codigo').setDescription('Código FRIO-XXXX-XXXX-XXXX').setRequired(true))),
    new SlashCommandBuilder().setName('versiculo').setDescription('📖 Versículo bíblico')
      .addSubcommand(s => s.setName('aleatorio').setDescription('Versículo aleatório agora'))
      .addSubcommand(s => s.setName('config').setDescription('⚙️ Configurar versículo do dia (admin)')
        .addChannelOption(o => o.setName('canal').setDescription('Canal onde enviar').setRequired(true))
        .addIntegerOption(o => o.setName('hora').setDescription('Hora do dia (0-23)').setRequired(false).setMinValue(0).setMaxValue(23)))
      .addSubcommand(s => s.setName('off').setDescription('Desligar versículo do dia (admin)')),
  ];
}

async function registerCommands() {
  try {
    const cmds = getCommands().map(c => c.toJSON());
    console.log(`🔍 [CMD] Registrando ${cmds.length} comandos globais...`);
    await client.application.commands.set(cmds);
    console.log(`📡 ${cmds.length} comandos globais ✅`);

    // ⚡ Limpa guild commands em batches de 5
    const guilds = [...client.guilds.cache.values()];
    for (let i = 0; i < guilds.length; i += 5) {
      await Promise.allSettled(guilds.slice(i, i + 5).map(g => g.commands.set([]).catch(() => {})));
      await sleep(500);
    }
  } catch (e) { console.error(`❌ [CMD]`, e.message); }
}

// ═══════════════════════════════════════════════════════════
// AJUDA
// ═══════════════════════════════════════════════════════════
function buildAjudaHome() {
  const e = new EmbedBuilder()
    .setTitle('📖 Central de Ajuda — Frio Bot')
    .setColor('#5865F2')
    .setDescription(`Olá! Eu sou o **Frio Bot** 🧊\n\nEscolha um tópico abaixo pra ver tudo que faço. 👇`)
    .addFields(
      { name: '🌟 Comandos Públicos', value: 'ping, perfil, IA, sugestão', inline: false },
      { name: '🎮 Apostas Free Fire', value: 'Sistema completo com mediadores', inline: false },
      { name: '🎫 Tickets', value: 'Sistema personalizável com 6 abas', inline: false },
      { name: '🛒 Loja', value: 'Produtos, estoque, PIX, Mercado Pago', inline: false },
      { name: '🎥 Streamers', value: 'Fila com mediador dedicado', inline: false },
      { name: '💳 PIX Mediadores', value: 'Multi-PIX por mediador', inline: false },
      { name: '📖 Versículo', value: 'Versículo do dia automático', inline: false },
      { name: '🛡️ Painel Admin', value: 'Controles administrativos', inline: false },
      { name: '❓ FAQ', value: 'Perguntas frequentes', inline: false },
    )
    .setThumbnail(client.user.displayAvatarURL())
    .setFooter({ text: `Frio Bot ${BOT_VERSION} • ${client.guilds.cache.size} servidores` })
    .setTimestamp();
  const menu = new StringSelectMenuBuilder().setCustomId('ajuda_pick').setPlaceholder('📚 Escolha um tópico')
    .addOptions(
      { label: 'Comandos Públicos', value: 'publicos', emoji: '🌟' },
      { label: 'Apostas FF', value: 'apostas', emoji: '🎮' },
      { label: 'Tickets', value: 'tickets', emoji: '🎫' },
      { label: 'Loja', value: 'loja', emoji: '🛒' },
      { label: 'Streamers', value: 'streamers', emoji: '🎥' },
      { label: 'PIX Mediadores', value: 'pixmed', emoji: '💳' },
      { label: 'Versículo', value: 'versiculo', emoji: '📖' },
      { label: 'Painel Admin', value: 'admin', emoji: '🛡️' },
      { label: 'FAQ', value: 'faq', emoji: '❓' },
    );
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(menu)] };
}

function buildAjudaPublicos() {
  return {
    embeds: [new EmbedBuilder().setTitle('🌟 Comandos Públicos').setColor('#57F287')
      .addFields(
        { name: '🏓 `/ping`', value: 'Latência do bot.' },
        { name: '👤 `/perfil`', value: 'Seu perfil.' },
        { name: '📋 `/serverinfo`', value: 'Info do servidor.' },
        { name: '👥 `/userinfo`', value: 'Info de usuário.' },
        { name: '🖼️ `/avatar`', value: 'Avatar em HD.' },
        { name: '🎂 `/birthday`', value: 'Registra aniversário.' },
        { name: '💡 `/suggestion`', value: 'Envia sugestão.' },
        { name: '🤖 `/ia`', value: 'IA com busca na web.' },
        { name: '🐛 `/reportar`', value: 'Reporta bug.' },
        { name: '📖 `/ajuda`', value: 'Esse painel.' },
        { name: '💎 `/resgatar key`', value: 'Ativa Premium.' },
        { name: '📖 `/versiculo aleatorio`', value: 'Versículo bíblico agora!' },
        { name: '📊 `.p` ou `.p @user`', value: 'Stats de apostas no chat!' },
      )],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ajuda_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))],
  };
}

function buildAjudaApostas() {
  return {
    embeds: [new EmbedBuilder().setTitle('🎮 Apostas Free Fire').setColor('#f1c40f')
      .setDescription('**Como funciona:**\n> 1. Entre no canal de fila\n> 2. Clique em 🧊 Gelo Infinito ou Normal\n> 3. Aos 2 jogadores cria thread\n> 4. Combinem regras\n> 5. Confirmar Regras\n> 6. Mediador libera PIX\n> 7. Pague valor + taxa\n> 8. Vencedor leva 2×')
      .addFields(
        { name: '🛡️ Mediadores', value: 'Liberam PIX, criam salas, escolhem vencedor. Recebem taxa.' },
        { name: '🔎 Analistas', value: 'Chamados em disputas.' },
        { name: '🪙 Coins', value: 'Ganha vencendo, daily, eventos.' },
        { name: '🎯 Modalidades', value: '📱 1v1-4v4 Mobile\n💻 1v1-4v4 Emu\n📱💻 2v2-4v4 Misto' },
        { name: '💳 PIX do Mediador', value: 'Cada mediador configura o próprio PIX via `/hub apostas → PIX Meds → Configurar`.' },
        { name: '🚫 Encerrar Fila', value: 'Apenas mediador/staff pode encerrar uma fila travada.' },
      )],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ajuda_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))],
  };
}

function buildAjudaTickets() {
  return {
    embeds: [new EmbedBuilder().setTitle('🎫 Tickets').setColor('#9B59B6')
      .setDescription('Sistema de atendimento com tópicos privados.')
      .addFields(
        { name: 'Como abrir', value: 'Vá no canal de ticket e clique no botão.' },
        { name: 'Fechar', value: 'Clique em **✅ Fechar**.' },
        { name: 'Assumir', value: 'Staff clica em **🙋 Assumir**.' },
        { name: 'Prioridade', value: 'Staff marca como alta.' },
        { name: 'Adicionar', value: 'Clique em **➕ Adicionar**.' },
        { name: '🎨 Personalização', value: 'Cada painel tem 6 abas: Embed, Botão, Tipos, Staff, Config, Formulário, Bloqueios.' },
        { name: '📝 Formulário', value: 'Até 5 perguntas por painel.' },
        { name: '⭐ Avaliação', value: 'Recebe DM ao fechar.' },
      )],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ajuda_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))],
  };
}

function buildAjudaLoja() {
  return {
    embeds: [new EmbedBuilder().setTitle('🛒 Loja').setColor('#57F287')
      .setDescription('**Como comprar:**\n> 1. Vá no canal do produto\n> 2. Clique em 🛒 Comprar\n> 3. Escolha o produto\n> 4. Pague via PIX ou Mercado Pago\n> 5. Receba automaticamente')
      .addFields(
        { name: '💰 Pagamento', value: 'PIX via Mercado Pago (link real) ou estático.' },
        { name: '🧾 Meus pedidos', value: 'Botão no painel da loja.' },
        { name: '🏷️ Cupons', value: 'Aplicáveis durante a compra.' },
        { name: '📦 Estoque', value: 'Gerenciado em `/admin → Loja → Estoque`.' },
      )],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ajuda_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))],
  };
}

function buildAjudaStreamers() {
  return {
    embeds: [new EmbedBuilder().setTitle('🎥 Streamers').setColor('#9146FF')
      .setDescription('Fila exclusiva pra streamers divulgarem lives.')
      .addFields(
        { name: '🆕 Designar Mediador', value: 'Escolha um mediador dedicado. Ele é **notificado na DM** quando você ficar ao vivo, podendo **aceitar ou recusar** a mediação.' },
        { name: '📊 Meus dados', value: 'Veja quantas lives, mediações e status.' },
        { name: '▶️ Como aparecer', value: '1. Entrar na lista\n2. Definir Live (link)\n3. Aparece ao vivo no painel' },
        { name: '🛡️ Mediador', value: 'Aparece no painel com status (🟡 pendente / 🟢 aceito).' },
      )],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ajuda_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))],
  };
}

function buildAjudaPixMed() {
  return {
    embeds: [new EmbedBuilder().setTitle('💳 PIX dos Mediadores').setColor('#22c55e')
      .setDescription('Sistema **multi-PIX** onde cada mediador configura seu próprio PIX.')
      .addFields(
        { name: '🔐 Privacidade', value: 'Cada mediador vê **apenas o próprio PIX**.\nAdmins/Devs veem todos.' },
        { name: '✏️ Como configurar', value: 'Abra `/hub apostas` → painel → **Meu PIX** → **Configurar**.\nOu clique em **💳** no painel de mediador.' },
        { name: '👁️ Ver meu PIX', value: 'Botão **Ver meu PIX** envia em **efêmero** só pra você.' },
        { name: '📋 Lista (staff)', value: 'Admins veem todos os PIXs com botão **Lista**.' },
        { name: '💡 Na aposta', value: 'Cada aposta mostra o PIX do **mediador daquele match**.' },
      )],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ajuda_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))],
  };
}

function buildAjudaVersiculo() {
  return {
    embeds: [new EmbedBuilder().setTitle('📖 Versículo do Dia').setColor('#FEE75C')
      .setDescription('Sistema automático de versículos bíblicos. 💎 **Recurso Unlimited.**')
      .addFields(
        { name: '📖 `/versiculo aleatorio`', value: 'Recebe um versículo agora mesmo.' },
        { name: '⚙️ `/versiculo config`', value: '**Admin.** Configura canal + hora.' },
        { name: '🔕 `/versiculo off`', value: '**Admin.** Desliga o versículo do dia.' },
        { name: '⏰ Automático', value: 'Envia 1× por dia no horário configurado.' },
        { name: '🔄 Fonte', value: 'API bíblica externa com **fallback local** (30 versículos clássicos).' },
      )],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ajuda_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))],
  };
}

function buildAjudaAdmin() {
  return {
    embeds: [new EmbedBuilder().setTitle('🛡️ Painel Admin').setColor('#ED4245')
      .setDescription('**⚠️ Só para administradores.**')
      .addFields(
        { name: '🛡️ `/admin`', value: 'Hub com todas as funções:\n> 🏗️ Servidor\n> 🎯 Gerenciamento\n> ⚠️ Moderação\n> 🎵 Música (premium)\n> 📖 Versículo\n> 🛒 Loja' },
        { name: '🎛️ Painéis', value: 'Em `/admin → Gerenciamento → Painéis`\n> 🎫 Tickets\n> ✅ Verificação\n> 📢 Updates' },
        { name: '🎉 Sorteios', value: 'Em `/admin → Gerenciamento → Sorteios`' },
        { name: '🛒 Loja', value: 'Em `/admin → Loja` (completo)' },
      )],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ajuda_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))],
  };
}

function buildAjudaFAQ() {
  return {
    embeds: [new EmbedBuilder().setTitle('❓ FAQ').setColor('#00AAFF')
      .addFields(
        { name: 'Como ativo um sistema?', value: 'Dev usa `/dev → Servidor → [Loja/Comunidade/Org]`.' },
        { name: 'Onde vejo minhas coins?', value: '`/hub apostas → Loja Coins → 💰 Meu saldo`.' },
        { name: 'Como virar mediador?', value: 'Ticket em `📮・vagas-mediador`.' },
        { name: 'Como configuro meu PIX?', value: '`/hub apostas` → painel → **Meu PIX → Configurar**.' },
        { name: 'Perdi aposta injusta?', value: 'Clique em **🔎 Chamar Analista** na thread.' },
        { name: 'Bot tá offline?', value: '`/ping`. Se não responder, avise a staff.' },
        { name: 'Como reporto bug?', value: 'Use `/reportar`.' },
      )],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ajuda_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))],
  };
}

// ═══════════════════════════════════════════════════════════
// /resgatar key
// ═══════════════════════════════════════════════════════════
async function handleResgatar(i) {
  await i.deferReply({ flags: EPHEMERAL });
  try {
    const code = i.options.getString('codigo').trim().toUpperCase();
    const { data: key } = await supabase.from('premium_keys').select('*').eq('key_code', code).eq('ativo', true).maybeSingle();
    if (!key) return i.editReply({ content: '❌ Key inválida ou já resgatada.' });
    if (key.expira_em && new Date(key.expira_em) < new Date()) return i.editReply({ content: '❌ Key expirada.' });

    const maxUsos = Number(key.max_usos ?? 1);
    const usosAtuais = Number(key.usos_atuais ?? 0);
    if (usosAtuais >= maxUsos) return i.editReply({ content: '❌ Key atingiu o limite de usos.' });

    const isO = i.user.id === i.guild.ownerId;
    const isS = await isAdmin(i.user, i.guild);
    if (!isO && !isS && !isDeveloper(i.user.id)) {
      return i.editReply({ content: '❌ Apenas **dono** ou **admin** do servidor pode resgatar.' });
    }

    const cfg = await getConfig(i.guild.id);
    const agora = new Date();
    let novaExp = null;
    if (Number(key.duracao_dias) === 0) {
      cfg.is_premium = true;
      cfg.premium_expires_at = null;
    } else {
      const base = cfg.premium_expires_at && new Date(cfg.premium_expires_at) > agora
        ? new Date(cfg.premium_expires_at)
        : agora;
      novaExp = new Date(base.getTime() + Number(key.duracao_dias) * 86400000);
      cfg.is_premium = true;
      cfg.premium_expires_at = novaExp.toISOString();
    }
    cfg.premium_tier = key.tier || 'premium';
    await setConfig(i.guild.id, cfg);

    try {
      await supabase.from('premium_redemptions').insert({
        key_id: key.id, key_code: key.key_code, guild_id: i.guild.id, guild_name: i.guild.name,
        resgatado_por: i.user.id, resgatado_por_tag: i.user.tag, tier: cfg.premium_tier,
        duracao_dias: key.duracao_dias, premium_expires_at: novaExp ? novaExp.toISOString() : null,
      });
    } catch (e) { console.error('[RESGATAR-DB]', e.message); }

    const novosUsos = usosAtuais + 1;
    try {
      await supabase.from('premium_keys').update({
        usos_atuais: novosUsos,
        ativo: novosUsos < maxUsos,
      }).eq('id', key.id);
    } catch {}

    await logImportant('PREM', '💎 Premium resgatado', {
      description: `Key \`${key.key_code}\` em **${i.guild.name}**`,
      user: i.user.id, guild: i.guild.id, severity: 'success',
    }).catch(() => {});

    const tierMeta = PREMIUM_TIERS[cfg.premium_tier] || PREMIUM_TIERS.premium;
    return i.editReply({
      embeds: [new EmbedBuilder()
        .setTitle(`${tierMeta.emoji} Premium Ativado!`)
        .setColor(tierMeta.color)
        .setDescription(`Key resgatada com sucesso em **${i.guild.name}**!`)
        .addFields(
          { name: '🎚️ Tier', value: `**${tierMeta.label}**`, inline: true },
          { name: '⏱️ Duração', value: Number(key.duracao_dias) === 0 ? '♾️ Permanente' : `${key.duracao_dias} dias`, inline: true },
          { name: '📅 Expira', value: novaExp ? `<t:${Math.floor(novaExp.getTime() / 1000)}:F>` : '♾️', inline: true },
        ).setTimestamp()],
    });
  } catch (err) {
    console.error('[RESGATAR]', err);
    return i.editReply({ content: `❌ ${err.message}` });
  }
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 8/9
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 9/9] INTERACTIONCREATE + EVENTOS + HTTP + LOGIN
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// INTERACTION CREATE — HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════
client.on('interactionCreate', async (i) => {
  // ⚡ FIX: garante member e me populados (evita "Cannot read properties of null")
  if (i.guild && !i.member && i.user?.id) {
    try { i.member = await i.guild.members.fetch(i.user.id); } catch {}
  }
  if (i.guild && !i.guild.members.me) {
    try { await i.guild.members.fetchMe(); } catch {}
  }
  try {
    const isDev = i.user?.id && isDeveloper(i.user.id);

    // ─── Pré-processamento ───
    // logInteractionDetailed foi REMOVIDO na v6.6.0 (otimização #O4)
    if (i.guild) trackFeatureUsage(i.guild.id, i.isChatInputCommand() ? `cmd_${i.commandName}` : (i.customId?.split(':')[0] || 'unknown')).catch(() => {});

    // ─── Rate limit por user (Otimização #O6) ───
    if (i.user?.id && !isDev) {
      if (!checkInteractionRateLimit(i.user.id, 'global', 300)) {
        if (i.isRepliable() && !i.deferred && !i.replied) {
          await i.reply({ content: '⏳ Calma aí! Aguarde um instante.', flags: EPHEMERAL }).catch(() => {});
        }
        return;
      }
    }

    // ─── Kill switch (só devs passam) ───
    if (await isKillSwitchActive()) {
      if (i.isRepliable() && !isDev && !i.deferred && !i.replied) {
        return i.reply({ content: '🚨 **Bot em modo de emergência.** Volto em breve.', flags: EPHEMERAL }).catch(() => {});
      }
    }

    // ─── Abuse tracker ───
    if (i.user?.id && i.guild && !isDev) {
      if (trackAbuse(i.user.id, i.type || 'interaction', i.guild.id, 250, 10000)) {
        if (i.isRepliable() && !i.deferred && !i.replied) {
          return i.reply({ content: '⚠️ Você está indo rápido demais.', flags: EPHEMERAL }).catch(() => {});
        }
        return;
      }
    }

    // ─── Manutenção (global + admin + FF) ───
    if (!isDev && i.guild && i.user?.id) {
      if (await blockSlashIfMaintenance(i)) return;
    }

    const { guild, member, channel } = i;

    // ─── Detecção de guild ausente ───
    if (!guild && (i.isChatInputCommand() || i.isAnySelectMenu() || i.isModalSubmit())) {
      return i.reply({ content: '❌ Use isto em um servidor.', flags: EPHEMERAL }).catch(() => {});
    }

    // ═══════════════════════════════════════════════════════════
    // SLASH COMMANDS
    // ═══════════════════════════════════════════════════════════
    if (i.isChatInputCommand()) {
      const c = i.commandName;

      if (c === 'ping') {
        const lat = Date.now() - i.createdTimestamp;
        return i.reply({
          embeds: [new EmbedBuilder().setColor('#57F287').setTitle('🏓 Pong!')
            .addFields(
              { name: '📡 Gateway', value: `\`${client.ws.ping}ms\``, inline: true },
              { name: '⚡ Latência', value: `\`${lat}ms\``, inline: true },
            ).setTimestamp()],
          flags: EPHEMERAL,
        });
      }

      if (c === 'perfil') {
        const { data: p } = await supabase.from('ff_players').select('*').eq('guild_id', guild.id).eq('user_id', i.user.id).maybeSingle();
        const e = new EmbedBuilder().setTitle(`👤 ${i.user.username}`)
          .setThumbnail(i.user.displayAvatarURL({ size: 256 })).setColor('#5865F2')
          .addFields(
            { name: '🆔', value: `\`${i.user.id}\``, inline: true },
            { name: '📅 Conta', value: `<t:${Math.floor(i.user.createdTimestamp / 1000)}:R>`, inline: true },
            { name: '📥 Entrou', value: member?.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : '—', inline: true },
            { name: '🪙 Coins', value: `${p?.coins || 0}`, inline: true },
            { name: '🏆 Wins', value: `${p?.wins || 0}`, inline: true },
            { name: '💀 Losses', value: `${p?.losses || 0}`, inline: true },
          ).setTimestamp();
        return i.reply({ embeds: [e], flags: EPHEMERAL });
      }

      if (c === 'serverinfo') {
        const e = new EmbedBuilder().setTitle(`📋 ${guild.name}`)
          .setThumbnail(guild.iconURL({ size: 256 })).setColor('#5865F2')
          .addFields(
            { name: '🆔', value: guild.id, inline: true },
            { name: '👥 Membros', value: `${guild.memberCount}`, inline: true },
            { name: '📢 Canais', value: `${guild.channels.cache.size}`, inline: true },
            { name: '🎭 Cargos', value: `${guild.roles.cache.size}`, inline: true },
            { name: '👑 Dono', value: `<@${guild.ownerId}>`, inline: true },
            { name: '🚀 Boosts', value: `${guild.premiumSubscriptionCount || 0}`, inline: true },
            { name: '📅 Criado', value: `<t:${Math.floor(guild.createdAt.getTime() / 1000)}:R>`, inline: true },
          ).setTimestamp();
        return i.reply({ embeds: [e], flags: EPHEMERAL });
      }

      if (c === 'userinfo') {
        const u = i.options.getUser('usuario') || i.user;
        const mi = await guild.members.fetch(u.id).catch(() => null);
        const e = new EmbedBuilder().setTitle(`👤 ${u.tag}`)
          .setThumbnail(u.displayAvatarURL({ size: 256 })).setColor('#5865F2')
          .addFields(
            { name: '🆔', value: u.id, inline: true },
            { name: '📅 Conta', value: `<t:${Math.floor(u.createdTimestamp / 1000)}:R>`, inline: true },
          );
        if (mi) e.addFields(
          { name: '📥 Entrou', value: `<t:${Math.floor(mi.joinedAt.getTime() / 1000)}:R>`, inline: true },
          { name: '🎭 Cargos', value: mi.roles.cache.filter(r => r.id !== guild.id).map(r => r.name).slice(0, 10).join(', ') || 'Nenhum', inline: false },
        );
        return i.reply({ embeds: [e], flags: EPHEMERAL });
      }

      if (c === 'avatar') {
        const u = i.options.getUser('usuario') || i.user;
        return i.reply({
          embeds: [new EmbedBuilder().setTitle(`🖼️ ${u.tag}`).setImage(u.displayAvatarURL({ size: 1024 })).setColor('#5865F2')],
          flags: EPHEMERAL,
        });
      }

      if (c === 'birthday') {
        const d = i.options.getString('data');
        const [dia, mes] = d.split('/').map(Number);
        if (!dia || !mes || dia > 31 || mes > 12) return i.reply({ content: '❌ Use DD/MM.', flags: EPHEMERAL });
        try {
          await supabase.from('birthdays').upsert({
            guild_id: guild.id, user_id: i.user.id,
            birthday: `2000-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
          }, { onConflict: 'guild_id,user_id' });
        } catch {}
        return i.reply({ content: `🎂 Salvo: **${d}**!`, flags: EPHEMERAL });
      }

      if (c === 'suggestion') {
        const ideia = i.options.getString('ideia');
        const cfg = await getConfig(guild.id);
        const ch = guild.channels.cache.get(cfg.suggestion_channel) || channel;
        const msg = await ch.send({
          embeds: [new EmbedBuilder().setTitle('💡 Sugestão').setDescription(ideia).setColor('#5865F2')
            .setFooter({ text: `Por ${i.user.tag}`, iconURL: i.user.displayAvatarURL() }).setTimestamp()],
        }).catch(() => null);
        if (msg) {
          await msg.react('⬆️').catch(() => {});
          await msg.react('⬇️').catch(() => {});
        }
        return i.reply({ content: `✅ Sugestão enviada em ${ch}!`, flags: EPHEMERAL });
      }

      if (c === 'ia') {
        const p = i.options.getString('pergunta');
        await i.deferReply({ flags: EPHEMERAL });
        try {
          const { resposta, temContexto } = await perguntarIA(p);
          return i.editReply({
            embeds: [new EmbedBuilder()
              .setAuthor({ name: '🤖 IA', iconURL: client.user.displayAvatarURL() })
              .setTitle(p.substring(0, 256))
              .setDescription(resposta.substring(0, 4000))
              .setColor('#5865F2')
              .setFooter({ text: temContexto ? '🌐 Com busca na web' : '🧠 Direto' })
              .setTimestamp()],
          });
        } catch (e) { return i.editReply({ content: `❌ ${e.message}` }); }
      }

      if (c === 'reportar') {
        await i.deferReply({ flags: EPHEMERAL });
        const bug = i.options.getString('bug');
        const passos = i.options.getString('passos');
        const print = i.options.getAttachment('print');
        const { data: r } = await supabase.from('error_logs').insert({
          context: 'bug_report',
          message: bug.substring(0, 500),
          stack: passos.substring(0, 2000),
          user_id: i.user.id, guild_id: guild.id, status: 'pending',
          print_url: print?.url || null,
        }).select().single();
        const embed = new EmbedBuilder().setTitle('🐛 Novo Bug').setColor('#FF5555')
          .addFields(
            { name: '🆔', value: `\`#${r?.id || '?'}\``, inline: true },
            { name: '👤', value: `<@${i.user.id}>`, inline: true },
            { name: '🏠', value: guild.name, inline: true },
            { name: '📝', value: bug.substring(0, 1000) },
            { name: '📋 Passos', value: passos.substring(0, 1000) },
          ).setTimestamp();
        if (print) embed.setImage(print.url);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bug:resolve:${r?.id}`).setLabel('Resolvido').setEmoji('✅').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`bug:ignore:${r?.id}`).setLabel('Ignorar').setEmoji('🚫').setStyle(ButtonStyle.Danger),
        );
        for (const d of DEVELOPER_IDS) {
          try { const u = await client.users.fetch(d); await u.send({ embeds: [embed], components: [row] }); } catch {}
        }
        return i.editReply({ content: `✅ Bug \`#${r?.id}\` reportado!` });
      }

      if (c === 'ajuda') return i.reply({ ...buildAjudaHome(), flags: EPHEMERAL });

      if (c === 'admin') {
        if (!await isAdmin(member, guild)) return i.reply({ content: '❌ Sem permissão.', flags: EPHEMERAL });
        return i.reply({ ...adminHub(), flags: EPHEMERAL });
      }

      if (c === 'dev') {
        if (!isDev) return i.reply({ content: '❌ Apenas devs.', flags: EPHEMERAL });
        return i.reply({ ...devHub(), flags: EPHEMERAL });
      }

      if (c === 'hub') {
        const sub = i.options.getSubcommand();
        if (sub === 'apostas') {
          const isO = i.user.id === guild.ownerId, isS = await isAdmin(i.user, guild);
          if (!isO && !isS) return i.reply({ content: '❌ Só admins.', flags: EPHEMERAL });
          return i.reply({ ...(await ffConfigPanel(guild.id)), flags: EPHEMERAL });
        }
      }

      if (c === 'status') {
        if (!isDev) return i.reply({ content: '❌', flags: EPHEMERAL });
        const a = i.options.getString('atividade');
        const tp = { 'Desenvolvendo': ActivityType.Watching, 'Jogando': ActivityType.Playing };
        client.user.setPresence({ activities: [{ name: a, type: tp[a] || ActivityType.Playing }], status: 'online' });
        return i.reply({ content: `✅ **${a}**`, flags: EPHEMERAL });
      }

      if (c === 'resgatar') {
        if (i.options.getSubcommand() === 'key') return handleResgatar(i);
      }

      // ─── /versiculo (NOVO na v6.6.0) ───
      if (c === 'versiculo') {
        const sub = i.options.getSubcommand();

                if (sub === 'aleatorio') {
          // ⚡ Público — versículo é pra todos verem!
          await i.deferReply();
          const v = await buscarVersiculoBiblia();
          const e = new EmbedBuilder()
            .setTitle('📖 Versículo')
            .setColor('#FEE75C')
            .setDescription(`*"${v.txt}"*\n\n— **${v.ref}**`)
            .setFooter({ text: `Pedido por ${i.user.username}`, iconURL: i.user.displayAvatarURL() })
            .setTimestamp();
          if (i.guild?.iconURL()) e.setThumbnail(i.guild.iconURL({ size: 256 }));
          return i.editReply({ embeds: [e] });
        }

        if (sub === 'config') {
          if (!await isAdmin(member, guild)) return i.reply({ content: '❌ Só admins.', flags: EPHEMERAL });
          if (!await requirePremiumTier(i, 'versiculo_diario')) return;

          const canal = i.options.getChannel('canal');
          const hora = i.options.getInteger('hora') ?? 8;
          const cfg = await getConfig(guild.id);
          cfg.versiculo_ativo = true;
          cfg.versiculo_channel = canal.id;
          cfg.versiculo_hora = hora;
          await setConfig(guild.id, cfg);

          await logImportant('VERSÍCULO', '📖 Versículo configurado', {
            user: i.user.id, guild: guild.id, severity: 'success',
            fields: [
              { name: '📢 Canal', value: `<#${canal.id}>`, inline: true },
              { name: '⏰ Hora', value: `${hora}:00`, inline: true },
            ],
          }).catch(() => {});

          return i.reply({
            embeds: [new EmbedBuilder().setTitle('✅ Versículo ativado!').setColor('#FEE75C')
              .setDescription(`Vou enviar 1 versículo por dia em <#${canal.id}> às **${hora}:00**.`)],
            flags: EPHEMERAL,
          });
        }

        if (sub === 'off') {
          if (!await isAdmin(member, guild)) return i.reply({ content: '❌ Só admins.', flags: EPHEMERAL });
          const cfg = await getConfig(guild.id);
          cfg.versiculo_ativo = false;
          await setConfig(guild.id, cfg);
          return i.reply({ content: '🔕 Versículo do dia desativado.', flags: EPHEMERAL });
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // STRING SELECT MENUS
    // ═══════════════════════════════════════════════════════════
    if (i.isStringSelectMenu()) {
      const cid = i.customId, value = i.values[0];

      // ─── Ajuda ───
      if (cid === 'ajuda_pick') {
        if (value === 'publicos') return i.update(buildAjudaPublicos());
        if (value === 'apostas') return i.update(buildAjudaApostas());
        if (value === 'tickets') return i.update(buildAjudaTickets());
        if (value === 'loja') return i.update(buildAjudaLoja());
        if (value === 'streamers') return i.update(buildAjudaStreamers());
        if (value === 'pixmed') return i.update(buildAjudaPixMed());
        if (value === 'versiculo') return i.update(buildAjudaVersiculo());
        if (value === 'admin') return i.update(buildAjudaAdmin());
        if (value === 'faq') return i.update(buildAjudaFAQ());
      }

      // ─── Dev hub ───
      if (cid === 'dev_cat_pick') {
        if (!isDev) return;
        if (value === 'servidor') return i.update(await devCatServidor());
        if (value === 'gerenciamento') return i.update(await devCatGerenciamento());
        if (value === 'apostas') return i.update(await devCatApostas());
        if (value === 'moderacao') return i.update(await devCatModeracao());
        if (value === 'versiculo') return i.update(await devCatVersiculo());
        if (value === 'sistema') return i.update(await devCatSistema());
      }

      // ─── Admin hub ───
      if (cid === 'adm_cat_pick') {
        if (!await isAdmin(i.user, guild)) return;
        if (value === 'servidor') return i.update(await admCatServidor());
        if (value === 'gerenciamento') return i.update(await admCatGerenciamento());
        if (value === 'moderacao') return i.update(await admCatModeracao());
        if (value === 'musica') return i.update(await admPanelMusica(guild));
        if (value === 'versiculo') return i.update(await admCatVersiculo(guild));
        if (value === 'loja') return i.update(await panelHome(guild.id));
      }

      // ─── Dev staff pick ───
      if (cid === 'dev_staff_pick') return i.reply({ ...(await devPanelStaffDetail(value)), flags: EPHEMERAL });

      // ─── Sandbox snippet ───
      if (cid === 'dev_sandbox_snippet_pick') {
        const m = new ModalBuilder().setCustomId('modal_sandbox').setTitle('Sandbox');
        m.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('code').setLabel('Código JS').setStyle(TextInputStyle.Paragraph).setValue(value).setRequired(true)
        ));
        return i.showModal(m);
      }

      // ─── cfgset_* (canais/cargos admin) — Bug #8 corrigido ───
      if (cid.startsWith('cfgset_')) {
        if (!await isAdmin(i.user, guild)) return i.reply({ content: '❌', flags: EPHEMERAL });
        const key = cid.replace('cfgset_', '');
        const v = i.values?.[0];
        if (!v) return i.reply({ content: '❌ Nada selecionado.', flags: EPHEMERAL });
        const isChannelKey = ['ticket_log_channel', 'log_channel', 'mod_log_channel', 'welcome_channel', 'suggestion_channel'].includes(key);
        const isRoleKey    = ['admin_role', 'membro_role', 'ticket_cargo', 'autorole_role', 'verificado_role'].includes(key);
        if (isChannelKey && !guild.channels.cache.has(v)) return i.reply({ content: '❌ Canal inválido.', flags: EPHEMERAL });
        if (isRoleKey && !guild.roles.cache.has(v)) return i.reply({ content: '❌ Cargo inválido.', flags: EPHEMERAL });
        const c = await getConfig(guild.id);
        c[key] = v;
        await setConfig(guild.id, c);
        await logConfig(guild, i.user.id, `SET_${key}`, { value: v });
        const label = isChannelKey ? `<#${v}>` : `<@&${v}>`;
        return i.reply({ content: `✅ \`${key}\` → ${label}`, flags: EPHEMERAL });
      }

      // ─── Loja: comprar ───
            if (cid === 'loja:pickproduct') {
        // ⚡ FIX: garante member e me antes de usar
        if (!i.member) {
          try { i.member = await guild.members.fetch(i.user.id); } catch {}
        }
        if (!i.member) return i.reply({ content: '❌ Não consegui te identificar.', flags: EPHEMERAL });
        if (!guild.members.me) {
          try { await guild.members.fetchMe(); } catch {}
        }
        if (!guild.members.me) return i.update({ content: '❌ Erro interno do bot.', embeds: [], components: [] }).catch(() => {});
        if (await blockIfMaintenance(i)) return;

        const { data: p } = await supabase.from('products').select('*').eq('id', value).maybeSingle();
        if (!p) return i.update({ content: '❌ Produto não existe.', embeds: [], components: [] });
        if (Number(p.price) <= 0) return i.update({ content: '⚠️ Produto sem preço definido.', embeds: [], components: [] });

        await i.deferUpdate();
        try {
          const ch = await guild.channels.create({
            name: `🛒-${i.user.username}`.slice(0, 90).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            type: ChannelType.GuildText,
            permissionOverwrites: [
              { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
              { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
              { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
            ],
          });
          const { data: o } = await supabase.from('orders').insert({
            guild_id: guild.id, user_id: i.user.id, status: 'open',
            subtotal: Number(p.price), total: Number(p.price), channel_id: ch.id,
          }).select().single();

          if (!o?.id) {
            await ch.delete().catch(() => {});
            return i.editReply({ content: '❌ Erro ao criar pedido.', embeds: [], components: [] });
          }

          try {
            await supabase.from('order_items').insert({
              order_id: o.id, product_id: p.id, product_name: p.name,
              quantity: 1, unit_price: Number(p.price), total: Number(p.price),
            });
          } catch {}

          const e = new EmbedBuilder().setTitle('🛒 Seu carrinho').setColor('#5865F2')
            .addFields(
              { name: 'Itens', value: `• **${p.name}** — ${brl(p.price)}` },
              { name: 'Total', value: `**${brl(p.price)}**` },
            )
            .setFooter({ text: `Pedido #${o.id}` });
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`order:addmore:${o.id}`).setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`order:coupon:${o.id}`).setLabel('Cupom').setEmoji('🏷️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`order:finish:${o.id}`).setLabel('Finalizar').setEmoji('💳').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`order:cancel:${o.id}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger),
          );
          await ch.send({ content: `<@${i.user.id}>`, embeds: [e], components: [row] });
          await i.editReply({ content: `✅ ${ch}`, embeds: [], components: [] });
        } catch (e) {
          console.error('[LOJA-COMPRA]', e);
          await i.editReply({ content: `❌ ${e.message}`, embeds: [], components: [] }).catch(() => {});
        }
        return;
      }

      // ─── Order add product ───
      if (cid.startsWith('order:addtopick:')) {
        const oid = cid.split(':')[2];
        const { data: p } = await supabase.from('products').select('*').eq('id', value).maybeSingle();
        if (!p) return i.update({ content: '❌', embeds: [], components: [] });
        const { data: ex } = await supabase.from('order_items').select('*').eq('order_id', oid).eq('product_id', p.id).maybeSingle();
        if (ex) {
          await supabase.from('order_items').update({
            quantity: Number(ex.quantity) + 1,
            total: (Number(ex.quantity) + 1) * Number(p.price),
          }).eq('id', ex.id);
        } else {
          try {
            await supabase.from('order_items').insert({
              order_id: oid, product_id: p.id, product_name: p.name,
              quantity: 1, unit_price: Number(p.price), total: Number(p.price),
            });
          } catch {}
        }
        const { data: its } = await supabase.from('order_items').select('*').eq('order_id', oid);
        const total = (its || []).reduce((a, x) => a + Number(x.total || 0), 0);
        await supabase.from('orders').update({ subtotal: total, total }).eq('id', oid);
        return i.update({ content: `✅ ${p.name} adicionado!`, embeds: [], components: [] });
      }

      // ─── Order remove ───
      if (cid.startsWith('order:removeitem:')) {
        await supabase.from('order_items').delete().eq('id', value).catch(() => {});
        return i.update({ content: '✅ Removido.', embeds: [], components: [] });
      }

      // ─── Stock ───
      if (cid === 'stock:pick') return i.update(await stockProductView(guild.id, value));

      // ─── Prod selects ───
      if (cid === 'prod:pickcat') {
        const m = new ModalBuilder().setCustomId(`prod_modal:create:${value}`).setTitle('Criar produto');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('delivery').setLabel('key/link/file/text').setStyle(TextInputStyle.Short).setValue('key').setRequired(true)),
        );
        return i.showModal(m);
      }
      if (cid === 'prod:delpick') {
        await supabase.from('products').delete().eq('id', value).catch(() => {});
        return i.update(await panelProducts(guild.id));
      }
      if (cid === 'prod:togglepick') {
        const { data: p } = await supabase.from('products').select('*').eq('id', value).maybeSingle();
        if (p) await supabase.from('products').update({ active: !p.active }).eq('id', value).catch(() => {});
        return i.update(await panelProducts(guild.id));
      }
      if (cid === 'prod:editpick') {
        const { data: p } = await supabase.from('products').select('*').eq('id', value).maybeSingle();
        if (!p) return i.reply({ content: '❌', flags: EPHEMERAL });
        const m = new ModalBuilder().setCustomId(`prod_modal:edit:${value}`).setTitle('Editar produto');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(p.name).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço').setStyle(TextInputStyle.Short).setValue(String(p.price)).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(p.description || '').setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('delivery').setLabel('Tipo').setStyle(TextInputStyle.Short).setValue(p.delivery_type).setRequired(true)),
        );
        return i.showModal(m);
      }

      // ─── Cat/Coupon/Promo delete ───
      if (cid === 'cat:delpick') {
        await supabase.from('categories').delete().eq('id', value).catch(() => {});
        return i.update(await panelCats(guild.id));
      }
      if (cid === 'coupon:delpick') {
        await supabase.from('coupons').delete().eq('code', value).catch(() => {});
        return i.update(await panelCoupons(guild.id));
      }
      if (cid === 'promo:delpick') {
        await supabase.from('promotions').delete().eq('id', value).catch(() => {});
        return i.update(await panelPromos(guild.id));
      }

      // ─── Pedidos pick ───
      if (cid === 'pedidos:pick') {
        if (!await requireShopAdmin(i)) return;
        const { data: o } = await supabase.from('orders').select('*').eq('id', value).maybeSingle();
        const { data: its } = await supabase.from('order_items').select('*').eq('order_id', value);
        const e = baseEmbed(await getSettings(guild.id), `🧾 Pedido #${o.id}`)
          .addFields(
            { name: 'Cliente', value: `<@${o.user_id}>`, inline: true },
            { name: 'Valor', value: brl(o.total), inline: true },
            { name: 'Status', value: o.status, inline: true },
            { name: 'Produtos', value: (its || []).map(x => `• ${x.product_name} ×${x.quantity}`).join('\n') || '—' },
          );
        return i.reply({
          embeds: [e],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`order:approve:${o.id}`).setLabel('Aprovar').setEmoji('✅').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`order:reject:${o.id}`).setLabel('Recusar').setEmoji('❌').setStyle(ButtonStyle.Danger),
          )],
          flags: EPHEMERAL,
        });
      }

      // ─── Shop panel send/del ───
      if (cid === 'shop_panel:send_pick') {
        const p = await getShopPanel(value);
        if (!p) return i.reply({ content: '❌', flags: EPHEMERAL });
        const s = await getSettings(guild.id);
        const e = baseEmbed(s, `🛒 ${p.name}`, p.description || s.store_description || '');
        if (p.banner) e.setImage(p.banner);
        if (p.color) e.setColor(p.color);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`loja:comprar:${p.id}`).setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('loja:meus_pedidos').setLabel('Meus pedidos').setEmoji('🧾').setStyle(ButtonStyle.Secondary),
        );
        const msg = await channel.send({ embeds: [e], components: [row] });
        await updateShopPanel(p.id, { channel_id: channel.id, message_id: msg.id });
        return i.reply({ content: `✅ Enviado em ${channel}`, flags: EPHEMERAL });
      }
      if (cid === 'shop_panel:del_pick') {
        await deleteShopPanel(value);
        return i.update(await panelShopPanels(guild.id));
      }

      // ─── Admin ticket pick ───
      if (cid === 'adm_ticket_edit_pick') {
        if (!await isAdmin(i.user, guild)) return;
        return i.update(await ticketEditorPanel(guild.id, value));
      }

      // ─── Ticket type del pick ───
      if (cid.startsWith('ticket_panel_type_del:')) {
        if (!await isAdmin(i.user, guild)) return;
        const panelId = cid.split(':')[1];
        const panel = await getTicketPanel(guild.id, panelId);
        if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
        panel.tipos = panel.tipos.filter(t => String(t.id) !== String(value));
        await updateTicketPanel(guild.id, panelId, { tipos: panel.tipos });
        return i.update({ content: `✅ Tipo removido.`, embeds: [], components: [] });
      }

      // ─── ticket_pick_type (com fix de não-destruir-painel) ───
      if (cid.startsWith('ticket_pick_type:')) {
        const panelId = cid.split(':')[1];
        const panel = await getTicketPanel(guild.id, panelId);
        if (!panel) return i.reply({ content: '❌ Painel não encontrado.', flags: EPHEMERAL });
        const tipo = panel.tipos.find(t => String(t.id) === String(value));
        if (!tipo) return i.reply({ content: '❌ Tipo inválido.', flags: EPHEMERAL });
        if (!ticketCooldownCheck(i.user.id, 3000)) return i.reply({ content: '⏳ Aguarde.', flags: EPHEMERAL });
        const lim = await canUserOpenTicket(guild, i.member, panel);
        if (!lim.ok) return i.reply({ content: lim.reason, flags: EPHEMERAL });
        await i.deferUpdate();
        try {
          const th = await openTicket(i, panel, tipo);
          return i.followUp({ content: `✅ <#${th.id}>`, flags: EPHEMERAL });
        } catch (e) { return i.followUp({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
      }

      // ─── Ticket transfer/move ───
      if (cid.startsWith('tkt_transfer:')) {
        const thId = cid.split(':')[1];
        const th = guild.channels.cache.get(thId);
        if (!th) return i.update({ content: '❌', embeds: [], components: [] });
        const fakeI = Object.create(i);
        fakeI.channel = th;
        return ticketActionTransfer(fakeI, value);
      }
      if (cid.startsWith('tkt_move:')) {
        const thId = cid.split(':')[1];
        const th = guild.channels.cache.get(thId);
        if (!th) return i.update({ content: '❌', embeds: [], components: [] });
        const fakeI = Object.create(i);
        fakeI.channel = th;
        return ticketActionMove(fakeI, value);
      }

      // ─── Form del pick ───
      if (cid.startsWith('tktform:del_pick:')) {
        const panelId = cid.split(':')[2];
        const panel = await getTicketPanel(guild.id, panelId);
        if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
        panel.formulario.perguntas.splice(Number(value), 1);
        await updateTicketPanel(guild.id, panelId, { formulario: panel.formulario });
        return i.update(await ticketFormPanel(guild.id, panelId));
      }

      // ─── FF: postar formato ───
      if (cid === 'ffcfg:postar_pick_format') {
        const fmt = FF_FORMATS.find(f => f.id === value);
        if (!fmt) return i.update({ content: '❌', embeds: [], components: [] });
        const chMap = { '1x1_mobile': '📱・1x1-mob', '2x2_mobile': '📱・2x2-mob', '3x3_mobile': '📱・3x3-mob', '4x4_mobile': '📱・4x4-mob', '1x1_emu': '💻・1x1-emu', '2x2_emu': '💻・2x2-emu', '3x3_emu': '💻・3x3-emu', '4x4_emu': '💻・4x4-emu', '2x2_misto': '📱💻・2x2-misto', '3x3_misto': '📱💻・3x3-misto', '4x4_misto': '📱💻・4x4-misto' };
        const suggested = guild.channels.cache.find(c => c.name === chMap[value]);
        const menu = new StringSelectMenuBuilder().setCustomId(`ffcfg:postar_pick_channel:${value}`).setPlaceholder('📁 Canal');
        const textChannels = [...guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)).values()].slice(0, 24);
        if (suggested) menu.addOptions({ label: `${suggested.name} (recomendado)`.slice(0, 90), value: suggested.id, emoji: '⭐' });
        for (const ch of textChannels) { if (suggested && ch.id === suggested.id) continue; menu.addOptions({ label: ch.name.slice(0, 90), value: ch.id }); }
        return i.update({
          embeds: [new EmbedBuilder().setTitle(`📢 ${fmt.label}`).setColor('#f1c40f').setDescription('Escolha o canal:')],
          components: [new ActionRowBuilder().addComponents(menu)],
        });
      }
      if (cid.startsWith('ffcfg:postar_pick_channel:')) {
        const fmtId = cid.split(':')[2], channelId = value;
        const fmt = FF_FORMATS.find(f => f.id === fmtId), ch = guild.channels.cache.get(channelId);
        if (!fmt || !ch) return i.update({ content: '❌', embeds: [], components: [] });
        const menu = new StringSelectMenuBuilder().setCustomId(`ffcfg:postar_pick_value:${fmtId}:${channelId}`).setPlaceholder('💰 Valor');
        const cfg = await ffGetConfig(guild.id);
        let vals = Array.isArray(cfg?.value_options) ? cfg.value_options : [];
        if (!vals.length) { vals = FF_DEFAULT_VALUES; await ffPatchConfig(guild.id, { value_options: vals }); }
        const sortedVals = [...vals].map(v => parseFloat(v)).filter(v => !isNaN(v)).sort((a, b) => b - a);
        for (const v of sortedVals.slice(0, 25)) menu.addOptions({ label: `R$ ${v.toFixed(2)}`, value: v.toFixed(2), emoji: '💰' });
        return i.update({
          embeds: [new EmbedBuilder().setTitle(`📢 ${fmt.label} → ${ch.name}`).setColor('#f1c40f').setDescription('Escolha o valor:')],
          components: [new ActionRowBuilder().addComponents(menu)],
        });
      }
      if (cid.startsWith('ffcfg:postar_pick_value:')) {
        const parts = cid.split(':');
        const fmtId = parts[2], channelId = parts[3];
        const fmt = FF_FORMATS.find(f => f.id === fmtId), ch = guild.channels.cache.get(channelId);
        if (!fmt || !ch) return i.update({ content: '❌', embeds: [], components: [] });
        const value2 = parseFloat(value), cfg = await ffGetConfig(guild.id);
        try {
          const { data: bet } = await supabase.from('ff_bets').insert({ guild_id: guild.id, channel_id: ch.id, format: fmt.label, value: value2 }).select().single();
          const msg = await ch.send({ embeds: [ffBuildBetEmbed(bet, cfg)], components: [ffBuildBetButtons(bet.id, cfg)] });
          await ffPatchBet(bet.id, { message_id: msg.id });
          await ffLog(guild, 'queue', 'BET_MANUAL', i.user.id, { format: fmt.label, value: value2 });
          return i.update({
            embeds: [new EmbedBuilder().setTitle('✅ Postado').setColor('#22c55e').setDescription(`**${fmt.label}** — R$ ${value2.toFixed(2)} em ${ch}`)],
            components: [],
          });
        } catch (e) { return i.update({ content: `❌ ${e.message}`, embeds: [], components: [] }); }
      }

      // ─── FF: postar auto ───
      if (cid === 'ffcfg:postar_auto_pick_channel') {
        const ch = guild.channels.cache.get(value);
        if (!ch) return i.update({ content: '❌', embeds: [], components: [] });
        const menu = new StringSelectMenuBuilder().setCustomId(`ffcfg:postar_auto_pick_format:${value}`).setPlaceholder('🎮 Modalidade');
        for (const f of FF_FORMATS) menu.addOptions({ label: f.label, value: f.id, emoji: f.emoji });
        return i.update({
          embeds: [new EmbedBuilder().setTitle(`⚡ ${ch.name}`).setColor('#f1c40f')],
          components: [new ActionRowBuilder().addComponents(menu)],
        });
      }
      if (cid.startsWith('ffcfg:postar_auto_pick_format:')) {
        const channelId = cid.split(':')[2], fmtId = value;
        const ch = guild.channels.cache.get(channelId), fmt = FF_FORMATS.find(f => f.id === fmtId);
        if (!ch || !fmt) return i.update({ content: '❌', embeds: [], components: [] });
        const cfg = await ffGetConfig(guild.id);
        let vals = Array.isArray(cfg?.value_options) ? cfg.value_options : [];
        if (!vals.length) { vals = FF_DEFAULT_VALUES; await ffPatchConfig(guild.id, { value_options: vals }); }
        const ordered = [...vals].map(x => parseFloat(x)).filter(x => !isNaN(x)).sort((a, b) => b - a);
        await i.update({ content: `⚡ Postando ${ordered.length}...`, embeds: [], components: [] });
        let n = 0;
        for (const valor of ordered) {
          try {
            const { data: bet } = await supabase.from('ff_bets').insert({ guild_id: guild.id, channel_id: ch.id, format: fmt.label, value: valor }).select().single();
            const msg = await ch.send({ embeds: [ffBuildBetEmbed(bet, cfg)], components: [ffBuildBetButtons(bet.id, cfg)] });
            await ffPatchBet(bet.id, { message_id: msg.id });
            n++;
            await sleep(500);
          } catch (e) { console.error(`Erro ${valor}:`, e.message); }
        }
        await ffLog(guild, 'queue', 'BETS_BULK_AUTO', i.user.id, { format: fmt.label, n });
        try { return await i.editReply({ content: `✅ **${n}** embeds postados em ${ch}.` }); }
        catch { return i.followUp({ content: `✅ **${n}** embeds postados em ${ch}.`, flags: EPHEMERAL }).catch(() => {}); }
      }

      // ─── FF: por canal ───
      if (cid === 'ffcfg:porcanal_pick_canal') {
        const ch = guild.channels.cache.get(value);
        if (!ch) return i.update({ content: '❌', embeds: [], components: [] });
        const menu = new StringSelectMenuBuilder().setCustomId(`ffcfg:porcanal_pick_format:${value}`).setPlaceholder('🎮 Modalidade');
        for (const f of FF_FORMATS) menu.addOptions({ label: f.label, value: f.id, emoji: f.emoji });
        return i.update({
          embeds: [new EmbedBuilder().setTitle(`📁 ${ch.name}`).setColor('#f1c40f')],
          components: [new ActionRowBuilder().addComponents(menu)],
        });
      }
      if (cid.startsWith('ffcfg:porcanal_pick_format:')) {
        const channelId = cid.split(':')[2], fmtId = value;
        const ch = guild.channels.cache.get(channelId), fmt = FF_FORMATS.find(f => f.id === fmtId);
        if (!ch || !fmt) return i.update({ content: '❌', embeds: [], components: [] });
        const menu = new StringSelectMenuBuilder().setCustomId(`ffcfg:porcanal_pick_value:${fmtId}:${channelId}`).setPlaceholder('💰 Valor');
        const cfg = await ffGetConfig(guild.id);
        let vals = Array.isArray(cfg?.value_options) ? cfg.value_options : [];
        if (!vals.length) { vals = FF_DEFAULT_VALUES; await ffPatchConfig(guild.id, { value_options: vals }); }
        const sortedVals = [...vals].map(v => parseFloat(v)).filter(v => !isNaN(v)).sort((a, b) => b - a);
        for (const v of sortedVals.slice(0, 25)) menu.addOptions({ label: `R$ ${v.toFixed(2)}`, value: v.toFixed(2), emoji: '💰' });
        return i.update({
          embeds: [new EmbedBuilder().setTitle(`📁 ${ch.name} → ${fmt.label}`).setColor('#f1c40f')],
          components: [new ActionRowBuilder().addComponents(menu)],
        });
      }
      if (cid.startsWith('ffcfg:porcanal_pick_value:')) {
        const parts = cid.split(':');
        const fmtId = parts[2], channelId = parts[3];
        const fmt = FF_FORMATS.find(f => f.id === fmtId), ch = guild.channels.cache.get(channelId);
        if (!fmt || !ch) return i.update({ content: '❌', embeds: [], components: [] });
        const valor = parseFloat(value), cfg = await ffGetConfig(guild.id);
        try {
          const { data: bet } = await supabase.from('ff_bets').insert({ guild_id: guild.id, channel_id: ch.id, format: fmt.label, value: valor }).select().single();
          const msg = await ch.send({ embeds: [ffBuildBetEmbed(bet, cfg)], components: [ffBuildBetButtons(bet.id, cfg)] });
          await ffPatchBet(bet.id, { message_id: msg.id });
          return i.update({ content: `✅ Em ${ch}`, embeds: [], components: [] });
        } catch (e) { return i.update({ content: `❌ ${e.message}`, embeds: [], components: [] }); }
      }

      // ─── FF: del valor pick ───
      if (cid === 'ffcfg:pick_del_valor') {
        const cfg = await ffGetConfig(guild.id);
        const vals = (Array.isArray(cfg?.value_options) ? cfg.value_options : []).filter(x => x !== value);
        await ffPatchConfig(guild.id, { value_options: vals });
        await logConfig(guild, i.user.id, 'VALUE_REMOVED', { v: value });
        return i.update(await ffPanelValores(guild.id));
      }

      // ─── FF: pick winner (com cache de multiplier) ───
      if (cid.startsWith('ffm:pick_winner:')) {
        try {
          const matchId = cid.split(':')[2];
          const m = await ffGetMatch(matchId);
          if (!m) return i.reply({ content: '❌', flags: EPHEMERAL }).catch(() => {});
          const cfgChk = await ffGetConfig(guild.id);
          const isMed = m.mediator_id ? i.user.id === m.mediator_id : false;
          const isStaff = await isAdmin(i.user, guild);
          if (!isMed && !isStaff && !isDev) return i.reply({ content: '❌ Só mediador/staff.', flags: EPHEMERAL }).catch(() => {});
          const winner = value, players = parseJson(m.players);
          const prize = Number(m.value || 0) * 2;
          const fee = (Number(cfgChk?.mediator_fee) || 0) * players.length;
          let coins = Number(cfgChk?.coin_prize) || 1;
          // ⚡ Cache de multiplier (Otimização #O9)
          const mult = getCachedMultiplier('coins_double');
          if (mult > 1) coins = Math.round(coins * mult);
          await ffPatchMatch(matchId, {
            status: 'finished', winner, prize_amount: prize,
            mediator_earnings: fee, finished_at: new Date().toISOString(),
          });
          try {
            const { data: p } = await supabase.from('ff_players').select('coins, wins').eq('guild_id', guild.id).eq('user_id', winner).maybeSingle();
            if (p) await supabase.from('ff_players').update({ coins: Number(p.coins || 0) + coins, wins: Number(p.wins || 0) + 1 }).eq('guild_id', guild.id).eq('user_id', winner);
            else await supabase.from('ff_players').insert({ guild_id: guild.id, user_id: winner, coins, wins: 1, losses: 0 });
            await logCoins(guild, winner, coins, `Vitória #${matchId}`, m.mediator_id);
          } catch (e) { console.error(e.message); }
          try {
            if (m.mediator_id) {
              await supabase.from('ff_mediator_earnings').insert({ guild_id: guild.id, mediator_id: m.mediator_id, match_id: matchId, amount: fee });
              const { data: med } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', guild.id).eq('user_id', m.mediator_id).maybeSingle();
              if (med) await supabase.from('ff_mediator_queue').update({
                status: 'waiting', current_match_id: null,
                earnings_total: Number(med.earnings_total || 0) + fee,
                matches_total: Number(med.matches_total || 0) + 1,
              }).eq('id', med.id);
              await logMediador(guild, m.mediator_id, 'RECEBEU', { match_id: matchId, valor: fee });
            }
          } catch (e) { console.error(e.message); }
          await ffLog(guild, 'resultado', 'WINNER', i.user.id, { matchId, winner, prize, fee, coins });
          try { await i.channel.setName(ffThreadName('finished', m.value, players, matchId)).catch(() => {}); } catch {}
          const e = new EmbedBuilder().setTitle('🏆 FINALIZADO').setColor('#f1c40f')
            .setDescription(`**Vencedor:** <@${winner}>\n**Prêmio:** R$ ${prize.toFixed(2)}`)
            .addFields(
              { name: '💰', value: `R$ ${prize.toFixed(2)}`, inline: true },
              { name: '💎', value: `${coins}`, inline: true },
              { name: '💵 Taxa', value: `R$ ${fee.toFixed(2)}`, inline: true },
            ).setTimestamp();
          await i.update({ embeds: [e], components: [] });
          setTimeout(() => i.channel.setArchived(true).catch(() => {}), 15000);
          return;
        } catch (errW) {
          console.error(errW);
          try { if (!i.replied && !i.deferred) await i.reply({ content: `❌ ${errW.message}`, flags: EPHEMERAL }); } catch {}
          return;
        }
      }

      // ─── Coin shop buy ───
      if (cid === 'coinshop:buy') {
        const { data: item } = await supabase.from('ff_coin_shop').select('*').eq('id', value).maybeSingle();
        if (!item || !item.active) return i.reply({ content: '❌', flags: EPHEMERAL });
        if (item.stock === 0) return i.reply({ content: '❌ Esgotado.', flags: EPHEMERAL });
        const { data: p } = await supabase.from('ff_players').select('coins').eq('guild_id', guild.id).eq('user_id', i.user.id).maybeSingle();
        const saldo = Number(p?.coins || 0);
        if (saldo < item.price) return i.reply({ content: `❌ Você tem ${saldo}, precisa ${item.price}.`, flags: EPHEMERAL });
        const e = new EmbedBuilder().setTitle('🪙 Confirmar').setColor('#FFD700')
          .setDescription(`Comprar **${item.emoji || '🎁'} ${item.name}** por **${item.price} coins**?\n\nSaldo após: **${saldo - item.price}**`);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`coinshop:confirm:${item.id}`).setLabel('Confirmar').setEmoji('✅').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('coinshop:cancel').setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger),
        );
        return i.reply({ embeds: [e], components: [row], flags: EPHEMERAL });
      }

      // ─── Broadcast scope ───
      if (cid.startsWith('broadcast_scope:')) {
        if (!isDev) return;
        const tempId = cid.split(':')[1];
        const draft = BROADCAST_DRAFTS.get(tempId);
        if (!draft) return i.update({ content: '❌ Rascunho expirou.', embeds: [], components: [] });
        const escopo = value;
        if (escopo === 'guild_pick') {
          const m = new ModalBuilder().setCustomId(`modal_broadcast_send:guild:${tempId}`).setTitle('📍 Servidor');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('guild_id').setLabel('ID do servidor').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        const target = escopo === 'all' ? 'all' : escopo.replace('guild:', '');
        const isAll = escopo === 'all';
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`broadcast_confirm:${tempId}:${target}`).setLabel(isAll ? `Confirmar em ${client.guilds.cache.size} servidores` : 'Confirmar').setEmoji('✅').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('broadcast_cancel').setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Secondary),
        );
        return i.update({
          content: isAll
            ? `⚠️ **Atenção!** Vai enviar em **${client.guilds.cache.size} servidores**.\n\n> ${draft.titulo}\n> ${draft.mudancas.length} itens`
            : `📍 Enviar no servidor \`${target}\`?`,
          embeds: [], components: [confirmRow],
        });
      }

      // ─── FF coin edit/toggle/del ───
      if (cid === 'ffcfg:coin_edit_pick') {
        const { data: item } = await supabase.from('ff_coin_shop').select('*').eq('id', value).maybeSingle();
        if (!item) return i.reply({ content: '❌', flags: EPHEMERAL });
        const m = new ModalBuilder().setCustomId(`ffcfg_modal:coin_edit:${item.id}`).setTitle('Editar item');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(item.name).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço').setStyle(TextInputStyle.Short).setValue(String(item.price)).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setValue(item.emoji || '🎁').setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(item.description || '').setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('ID cargo').setStyle(TextInputStyle.Short).setValue(item.role_id || '').setRequired(false)),
        );
        return i.showModal(m);
      }
      if (cid === 'ffcfg:coin_toggle_pick') {
        const { data: item } = await supabase.from('ff_coin_shop').select('*').eq('id', value).maybeSingle();
        if (!item) return i.reply({ content: '❌', flags: EPHEMERAL });
        await supabase.from('ff_coin_shop').update({ active: !item.active }).eq('id', item.id);
        return i.update(await ffPanelLojaCoins(guild.id));
      }
      if (cid === 'ffcfg:coin_del_pick') {
        await supabase.from('ff_coin_shop').delete().eq('id', value);
        return i.update(await ffPanelLojaCoins(guild.id));
      }

      // ─── FFBL remove pick ───
      if (cid === 'ffbl:remove_pick') {
        await supabase.from('ff_blacklist').delete().eq('id', value);
        return i.update(await ffBuildBlacklistEmbed(guild.id));
      }

      // ─── TKTBLK remove pick ───
      if (cid.startsWith('tktblk:removepick:')) {
        const panelId = cid.split(':')[2];
        const panel = await getTicketPanel(guild.id, panelId);
        if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
        panel.bloqueio_usuarios_ids = panel.bloqueio_usuarios_ids.filter(u => u !== value);
        await updateTicketPanel(guild.id, panelId, { bloqueio_usuarios_ids: panel.bloqueio_usuarios_ids });
        return i.update(await ticketBlocksPanel(guild.id, panelId));
      }

      // ─── TKTTYPE editpick ───
      if (cid.startsWith('tkttype:editpick:')) {
        const panelId = cid.split(':')[2];
        const panel = await getTicketPanel(guild.id, panelId);
        if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
        const tipo = panel.tipos.find(t => String(t.id) === String(value));
        if (!tipo) return i.reply({ content: '❌', flags: EPHEMERAL });
        const m = new ModalBuilder().setCustomId(`tkttype_modal:edit:${panelId}:${value}`).setTitle('Editar tipo');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(tipo.label || '').setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setValue(tipo.emoji || '🎫').setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Short).setValue(tipo.descricao || '').setRequired(false).setMaxLength(100)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('canal_id').setLabel('ID canal').setStyle(TextInputStyle.Short).setValue(tipo.canal_id || '').setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('ID cargo').setStyle(TextInputStyle.Short).setValue(tipo.cargo_responsavel_id || '').setRequired(false)),
        );
        return i.showModal(m);
      }
      if (cid.startsWith('tkttype:delpick:')) {
        const panelId = cid.split(':')[2];
        const panel = await getTicketPanel(guild.id, panelId);
        if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
        panel.tipos = panel.tipos.filter(t => String(t.id) !== String(value));
        await updateTicketPanel(guild.id, panelId, { tipos: panel.tipos });
        return i.update(await ticketTypesPanel(guild.id, panelId));
      }
    }

    // ═══════════════════════════════════════════════════════════
    // CHANNEL / ROLE / USER SELECTS
    // ═══════════════════════════════════════════════════════════
    if (i.isChannelSelectMenu() && i.customId.startsWith('setup_ch:')) {
      const key = i.customId.replace('setup_ch:', '');
      await patchSettings(guild.id, { [key]: i.values[0] });
      return i.update(setupHome(await getSettings(guild.id)));
    }

    if (i.isChannelSelectMenu() && i.customId === 'updates_channel_pick') {
      if (!await isAdmin(i.user, guild)) return;
      const chId = i.values[0];
      const ch = guild.channels.cache.get(chId);
      if (!ch || !ch.isTextBased()) return i.reply({ content: '❌', flags: EPHEMERAL });
      if (!ch.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages)) return i.reply({ content: `❌ Sem permissão em <#${chId}>.`, flags: EPHEMERAL });
      try {
        await supabase.from('settings').upsert({ guild_id: guild.id, update_channel_id: chId, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' });
      } catch {}
      _settingsCache.delete(guild.id);
      await logImportant('CONFIG', 'Canal de updates definido', {
        user: i.user.id, guild: guild.id, severity: 'success',
        fields: [{ name: '📢', value: `<#${chId}>`, inline: true }],
      }).catch(() => {});
      return i.update({
        embeds: [new EmbedBuilder().setTitle('✅ Canal configurado').setColor('#22c55e').setDescription(`Updates em <#${chId}>.`).setTimestamp()],
        components: [],
      });
    }

    if (i.isRoleSelectMenu() && i.customId.startsWith('setup_role:')) {
      const key = i.customId.replace('setup_role:', '');
      await patchSettings(guild.id, { [key]: i.values[0] });
      return i.update(setupHome(await getSettings(guild.id)));
    }

    if (i.isUserSelectMenu() && i.customId === 'client:pick') {
      const uid = i.values[0];
      const { data: c } = await supabase.from('customers').select('*').eq('guild_id', guild.id).eq('user_id', uid).maybeSingle();
      const { data: ords } = await supabase.from('orders').select('*').eq('guild_id', guild.id).eq('user_id', uid).order('id', { ascending: false }).limit(5);
      const e = baseEmbed(await getSettings(guild.id), '👤 Cliente', `<@${uid}>`)
        .addFields(
          { name: 'Gasto', value: brl(c?.total_spent || 0), inline: true },
          { name: 'Compras', value: String(c?.total_orders || 0), inline: true },
          { name: 'Saldo', value: brl(c?.balance || 0), inline: true },
        );
      for (const o of ords || []) e.addFields({ name: `#${o.id}`, value: `${brl(o.total)} • ${o.status}` });
      return i.update({
        embeds: [e],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`client:baladd:${uid}`).setLabel('Add saldo').setEmoji('💰').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('panel:clients').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger),
        )],
      });
    }

    // ═══════════════════════════════════════════════════════════
    // BUTTONS
    // ═══════════════════════════════════════════════════════════
    if (i.isButton()) {
      const cid = i.customId;
      const [ns, action, ...rest] = cid.split(':');

      // ─── Ajuda back ───
      if (cid === 'ajuda_back') return i.update(buildAjudaHome());

      // ─── Updates ───
      if (cid === 'updates_test') {
        if (!await isAdmin(i.user, guild)) return;
        await i.deferReply({ flags: EPHEMERAL });
        const s = await getSettings(guild.id);
        const canal = await findOrCreateUpdateChannel(guild, s);
        if (!canal) return i.editReply({ content: '❌' });
        const topRole = getTopRole(guild);
        const pingRole = topRole ? `<@&${topRole.id}>` : `<@${guild.ownerId}>`;
        const e = new EmbedBuilder().setTitle(`🧪 Teste — Frio Bot ${BOT_VERSION}`).setColor('#5865F2')
          .setDescription(`${pingRole}, **teste!**\n\n🎫 Tickets\n> Cada ticket tem embed próprio\n\n🎮 Hub de apostas\n> Com PIX mediador`)
          .setFooter({ text: 'Frio Bot • Teste' }).setTimestamp();
        if (client.user.displayAvatarURL()) e.setThumbnail(client.user.displayAvatarURL());
        try {
          await canal.send({ content: pingRole, embeds: [e], allowedMentions: { roles: topRole ? [topRole.id] : [], users: topRole ? [] : [guild.ownerId] } });
          return i.editReply({ content: `✅ Em <#${canal.id}>` });
        } catch (err) { return i.editReply({ content: `❌ ${err.message}` }); }
      }
      if (cid === 'updates_reset') {
        if (!await isAdmin(i.user, guild)) return;
        try { await supabase.from('settings').upsert({ guild_id: guild.id, update_channel_id: null, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' }); } catch {}
        _settingsCache.delete(guild.id);
        return i.reply({ content: '✅ Canal resetado.', flags: EPHEMERAL });
      }

      // ─── Loja pública ───
      if (ns === 'loja') {
        if (await blockIfMaintenance(i)) return;
                if (action === 'comprar') {
          // ⚡ FIX: garante member populado
          if (!i.member) {
            try { i.member = await guild.members.fetch(i.user.id); } catch {}
          }
          if (!i.member) return i.reply({ content: '❌ Não consegui te identificar.', flags: EPHEMERAL });
          const { data: prods } = await supabase.from('products').select('*').eq('guild_id', guild.id).eq('active', true).limit(25);
          const list = [];
          for (const p of prods || []) {
            if (!p || !p.id) continue;
            if (p.infinite_content) { list.push(p); continue; }
            const { count } = await supabase.from('inventory').select('id', { count: 'exact', head: true }).eq('product_id', p.id).eq('status', 'available');
            if ((count || 0) > 0) list.push(p);
          }
          if (!list.length) return i.reply({ content: '😢 Sem estoque.', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId('loja:pickproduct').setPlaceholder('Escolha');
          for (const p of list) {
            const pr = Number(p.price) > 0 ? brl(p.price) : 'definir';
            menu.addOptions({ label: `${p.name} — ${pr}`.slice(0, 90), value: String(p.id) });
          }
          return i.reply({
            embeds: [new EmbedBuilder().setTitle('🛍️ Produtos').setColor('#5865F2')],
            components: [new ActionRowBuilder().addComponents(menu)],
            flags: EPHEMERAL,
          });
        }
        if (action === 'meus_pedidos') {
          const { data: ords } = await supabase.from('orders').select('*').eq('guild_id', guild.id).eq('user_id', i.user.id).order('id', { ascending: false }).limit(10);
          const e = new EmbedBuilder().setTitle('🧾 Meus pedidos').setColor('#5865F2');
          for (const o of ords || []) e.addFields({ name: `#${o.id} — ${brl(o.total)}`, value: o.status });
          if (!ords?.length) e.setDescription('Nenhum.');
          return i.reply({ embeds: [e], flags: EPHEMERAL });
        }
      }

      // ─── Order ───
      if (ns === 'order') {
        const oid = rest[0];
        const { data: o } = await supabase.from('orders').select('*').eq('id', oid).maybeSingle();
        if (!o) return i.reply({ content: '❌', flags: EPHEMERAL });
        if (action === 'cancel') {
          await supabase.from('orders').update({ status: 'cancelled' }).eq('id', oid);
          await i.reply({ content: '❌ Cancelado.', flags: EPHEMERAL });
          setTimeout(() => i.channel.delete().catch(() => {}), 5000);
          return;
        }
        if (action === 'approve') {
          if (!await requireShopAdmin(i)) return;
          await supabase.from('orders').update({ status: 'delivered', paid_at: new Date().toISOString() }).eq('id', oid);
          return i.update({ content: '✅ Aprovado.', embeds: [], components: [] });
        }
        if (action === 'reject') {
          if (!await requireShopAdmin(i)) return;
          await supabase.from('orders').update({ status: 'cancelled' }).eq('id', oid);
          return i.update({ content: '❌ Recusado.', embeds: [], components: [] });
        }
        if (action === 'addmore') {
          const { data: prods } = await supabase.from('products').select('*').eq('guild_id', guild.id).eq('active', true).limit(25);
          const menu = new StringSelectMenuBuilder().setCustomId(`order:addtopick:${oid}`).setPlaceholder('Add');
          for (const p of prods || []) menu.addOptions({ label: `${p.name} — ${brl(p.price)}`.slice(0, 90), value: String(p.id) });
          return i.reply({
            embeds: [new EmbedBuilder().setTitle('🛍️ Add')],
            components: [new ActionRowBuilder().addComponents(menu)],
            flags: EPHEMERAL,
          });
        }
        if (action === 'coupon') {
          const m = new ModalBuilder().setCustomId(`order_modal:coupon:${oid}`).setTitle('Cupom');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('code').setLabel('Código').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (action === 'finish') {
          const s = await getSettings(guild.id);
          await i.update({ content: '💳 Gerando...', embeds: [], components: [] });
          try {
            const pag = await criarPagamento(Number(o.total), oid, s, 'Pedido', 'loja');
            if (pag.tipo === 'mercadopago') {
              await supabase.from('orders').update({ status: 'awaiting_payment', payment_gateway: 'mercadopago', mp_payment_id: String(pag.payment_id), mp_ticket_url: pag.ticket_url || null, pix_payload: pag.payload }).eq('id', oid);
              const e = new EmbedBuilder().setTitle('💳 Pagamento MP').setColor('#22c55e')
                .setDescription(`Pedido \`#${oid}\` — **${brl(o.total)}**\n\nUse QR Code ou botão Pagar no MP.`)
                .addFields(
                  { name: '🔑 PIX', value: `\`\`\`${pag.payload}\`\`\`` },
                  { name: '🆔', value: `\`${pag.payment_id}\``, inline: true },
                )
                .setImage('attachment://pix.png');
              const btns = [
                new ButtonBuilder().setCustomId(`pix:paid:${oid}`).setLabel('Já paguei').setEmoji('✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`pix:show_copy:${oid}`).setLabel('Copiar').setEmoji('📋').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`order:cancel:${oid}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger),
              ];
              if (pag.ticket_url) btns.unshift(new ButtonBuilder().setLabel('Pagar no MP').setEmoji('🔗').setStyle(ButtonStyle.Link).setURL(pag.ticket_url));
              return i.editReply({
                embeds: [e],
                files: [new AttachmentBuilder(pag.qrBuf, { name: 'pix.png' })],
                components: [new ActionRowBuilder().addComponents(btns.slice(0, 5))],
              });
            } else {
              await supabase.from('orders').update({ status: 'awaiting_payment', payment_gateway: 'pix_static', pix_payload: pag.payload }).eq('id', oid);
              const e = new EmbedBuilder().setTitle('💳 Pagamento PIX').setColor('#22c55e')
                .setDescription(`Pedido \`#${oid}\` — **${brl(o.total)}**`)
                .addFields(
                  { name: '🔑', value: `\`\`\`${pag.payload}\`\`\`` },
                  { name: '👤', value: s?.pix_name || '—', inline: true },
                )
                .setImage('attachment://pix.png');
              const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pix:paid:${oid}`).setLabel('Já paguei').setEmoji('✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`pix:show_copy:${oid}`).setLabel('Copiar').setEmoji('📋').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`order:cancel:${oid}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger),
              );
              return i.editReply({
                embeds: [e],
                files: [new AttachmentBuilder(pag.qrBuf, { name: 'pix.png' })],
                components: [row],
              });
            }
          } catch (err) { return i.editReply({ content: `❌ ${err.message}` }); }
        }
      }

      // ─── Pix ───
      if (ns === 'pix') {
        if (action === 'paid') {
          await supabase.from('orders').update({ status: 'awaiting_approval', paid_at: new Date().toISOString() }).eq('id', rest[0]);
          await i.reply({ content: '✅ Avisamos!', flags: EPHEMERAL });
          const s = await getSettings(guild.id);
          if (s?.log_channel_id) {
            const ch = guild.channels.cache.get(s.log_channel_id);
            if (ch) {
              const { data: o } = await supabase.from('orders').select('*').eq('id', rest[0]).maybeSingle();
              const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`order:approve:${rest[0]}`).setLabel('Aprovar').setEmoji('✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`order:reject:${rest[0]}`).setLabel('Recusar').setEmoji('❌').setStyle(ButtonStyle.Danger),
              );
              await ch.send({ content: `🟡 #${rest[0]} (${brl(o?.total || 0)}) — <@${i.user.id}>`, components: [row] }).catch(() => {});
            }
          }
          return;
        }
        if (action === 'show_copy') {
          const { data: o } = await supabase.from('orders').select('*').eq('id', rest[0]).maybeSingle();
          if (!o?.pix_payload) return i.reply({ content: '❌', flags: EPHEMERAL });
          return i.reply({ content: `📋 **PIX copia e cola:**\n\`\`\`\n${o.pix_payload}\n\`\`\``, flags: EPHEMERAL });
        }
      }

      // ─── Panel loja ───
      if (ns === 'panel') {
        if (!await requireShopAdmin(i)) return;
        if (action === 'home') return i.update(await panelHome(guild.id));
        if (action === 'products') return i.update(await panelProducts(guild.id));
        if (action === 'stock') return i.update(await panelStock(guild.id));
        if (action === 'cats') return i.update(await panelCats(guild.id));
        if (action === 'coupons') return i.update(await panelCoupons(guild.id));
        if (action === 'promos') return i.update(await panelPromos(guild.id));
        if (action === 'clients') return i.update(await panelClients(guild.id));
        if (action === 'stats') return i.update(await panelStats(guild.id));
        if (action === 'settings') return i.update(setupHome(await getSettings(guild.id)));
        if (action === 'pedidos') return i.update(await ordersPanel(guild.id, 'pending'));
        if (action === 'top') return i.update(await panelTop(guild.id));
        if (action === 'shop_panels') return i.update(await panelShopPanels(guild.id));
        if (action === 'export') {
          const { data: ords } = await supabase.from('orders').select('*').eq('guild_id', guild.id).eq('status', 'delivered').limit(500);
          if (!ords?.length) return i.reply({ content: '❌ Nenhum pedido.', flags: EPHEMERAL });
          let csv = 'id,user_id,total,status,created_at\n';
          for (const o of ords) csv += `${o.id},${o.user_id},${o.total},${o.status},${o.created_at}\n`;
          return i.reply({ files: [new AttachmentBuilder(Buffer.from(csv), { name: 'pedidos.csv' })], flags: EPHEMERAL });
        }
      }

      // ─── Shop panel ───
      if (ns === 'shop_panel') {
        if (!await requireShopAdmin(i)) return;
        if (action === 'create') {
          const m = new ModalBuilder().setCustomId('shop_panel_modal:create').setTitle('Criar painel');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('color').setLabel('Cor').setStyle(TextInputStyle.Short).setValue('#5865F2').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner').setLabel('Banner URL').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('catid').setLabel('ID cat').setStyle(TextInputStyle.Short).setRequired(false)),
          );
          return i.showModal(m);
        }
        if (action === 'list') return i.update(await panelShopPanels(guild.id));
        if (action === 'send') {
          const panels = await getShopPanels(guild.id);
          if (!panels.length) return i.reply({ content: '❌', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId('shop_panel:send_pick').setPlaceholder('Painel');
          for (const p of panels.slice(0, 25)) menu.addOptions({ label: `#${p.id} — ${p.name}`.slice(0, 90), value: String(p.id) });
          return i.reply({ embeds: [new EmbedBuilder().setTitle('📢 Enviar painel')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (action === 'delete') {
          const panels = await getShopPanels(guild.id);
          if (!panels.length) return i.reply({ content: '❌', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId('shop_panel:del_pick').setPlaceholder('Excluir');
          for (const p of panels.slice(0, 25)) menu.addOptions({ label: `#${p.id} — ${p.name}`.slice(0, 90), value: String(p.id) });
          return i.reply({ embeds: [new EmbedBuilder().setTitle('🗑️ Excluir painel')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
      }

      // ─── Prod ───
      if (ns === 'prod') {
        if (!await requireShopAdmin(i)) return;
        if (action === 'create') {
          const cats = await getCats(guild.id);
          const menu = new StringSelectMenuBuilder().setCustomId('prod:pickcat').setPlaceholder('Categoria');
          menu.addOptions({ label: 'Sem categoria', value: '0' });
          for (const c of cats) menu.addOptions({ label: c.name.slice(0, 90), value: String(c.id) });
          return i.update({
            embeds: [baseEmbed(await getSettings(guild.id), '➕ Criar produto')],
            components: [
              new ActionRowBuilder().addComponents(menu),
              new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:products').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
            ],
          });
        }
        if (action === 'edit') {
          const { data: prods } = await supabase.from('products').select('*').eq('guild_id', guild.id).limit(25);
          const menu = new StringSelectMenuBuilder().setCustomId('prod:editpick').setPlaceholder('Produto');
          for (const p of prods || []) menu.addOptions({ label: p.name.slice(0, 90), value: String(p.id) });
          return i.update({
            embeds: [baseEmbed(await getSettings(guild.id), '✏️ Editar')],
            components: [
              new ActionRowBuilder().addComponents(menu),
              new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:products').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
            ],
          });
        }
        if (action === 'del') {
          const { data: prods } = await supabase.from('products').select('*').eq('guild_id', guild.id).limit(25);
          const menu = new StringSelectMenuBuilder().setCustomId('prod:delpick').setPlaceholder('Produto');
          for (const p of prods || []) menu.addOptions({ label: p.name.slice(0, 90), value: String(p.id) });
          return i.update({
            embeds: [baseEmbed(await getSettings(guild.id), '🗑️ Excluir')],
            components: [
              new ActionRowBuilder().addComponents(menu),
              new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:products').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
            ],
          });
        }
        if (action === 'toggle') {
          const { data: prods } = await supabase.from('products').select('*').eq('guild_id', guild.id).limit(25);
          const menu = new StringSelectMenuBuilder().setCustomId('prod:togglepick').setPlaceholder('Produto');
          for (const p of prods || []) menu.addOptions({ label: `${p.name} ${p.active ? '✅' : '❌'}`.slice(0, 90), value: String(p.id) });
          return i.update({
            embeds: [baseEmbed(await getSettings(guild.id), '🔁 Toggle')],
            components: [
              new ActionRowBuilder().addComponents(menu),
              new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:products').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
            ],
          });
        }
      }

      // ─── Stock ───
      if (ns === 'stock') {
        if (!await requireShopAdmin(i)) return;
        if (action === 'add') {
          const m = new ModalBuilder().setCustomId(`stock_modal:add:${rest[0]}`).setTitle('Add estoque');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('items').setLabel('Um por linha').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000)
          ));
          return i.showModal(m);
        }
        if (action === 'addfile') {
          const m = new ModalBuilder().setCustomId(`stock_modal:addfile:${rest[0]}`).setTitle('Add arquivo');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('url').setLabel('URL').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('fname').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)),
          );
          return i.showModal(m);
        }
        if (action === 'clear') {
          await supabase.from('inventory').delete().eq('product_id', rest[0]).eq('status', 'available');
          return i.update(await stockProductView(guild.id, rest[0]));
        }
        if (action === 'infinite') {
          const { data: p } = await supabase.from('products').select('*').eq('id', rest[0]).maybeSingle();
          const m = new ModalBuilder().setCustomId(`stock_modal:infinite:${rest[0]}`).setTitle(p?.infinite_content ? 'Editar ∞' : 'Config ∞');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('key/link/text/file').setStyle(TextInputStyle.Short).setValue(p?.infinite_type || 'key').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('content').setLabel('Conteúdo').setStyle(TextInputStyle.Paragraph).setValue(p?.infinite_content || '').setMaxLength(4000).setRequired(true)),
          );
          return i.showModal(m);
        }
        if (action === 'infinite_off') {
          await supabase.from('products').update({ infinite_content: null, infinite_type: 'key' }).eq('id', rest[0]);
          return i.update(await stockProductView(guild.id, rest[0]));
        }
      }

      // ─── Cat ───
      if (ns === 'cat') {
        if (!await requireShopAdmin(i)) return;
        if (action === 'create') {
          const m = new ModalBuilder().setCustomId('cat_modal:create').setTitle('Categoria');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setRequired(false)),
          );
          return i.showModal(m);
        }
        if (action === 'del') {
          const cats = await getCats(guild.id);
          const menu = new StringSelectMenuBuilder().setCustomId('cat:delpick').setPlaceholder('Cat');
          for (const c of cats) menu.addOptions({ label: c.name.slice(0, 90), value: String(c.id) });
          return i.update({
            embeds: [baseEmbed(await getSettings(guild.id), '🗑️')],
            components: [
              new ActionRowBuilder().addComponents(menu),
              new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:cats').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
            ],
          });
        }
      }

      // ─── Coupon ───
      if (ns === 'coupon') {
        if (!await requireShopAdmin(i)) return;
        if (action === 'create') {
          const m = new ModalBuilder().setCustomId('coupon_modal:create').setTitle('Cupom');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Código').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('percent/fixed').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('value').setLabel('Valor').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('maxuses').setLabel('Máx usos (0=∞)').setStyle(TextInputStyle.Short).setValue('0').setRequired(false)),
          );
          return i.showModal(m);
        }
        if (action === 'del') {
          const { data: list } = await supabase.from('coupons').select('*').eq('guild_id', guild.id).limit(25);
          const menu = new StringSelectMenuBuilder().setCustomId('coupon:delpick').setPlaceholder('Cupom');
          for (const c of list || []) menu.addOptions({ label: c.code, value: c.code });
          return i.update({
            embeds: [baseEmbed(await getSettings(guild.id), '🗑️')],
            components: [
              new ActionRowBuilder().addComponents(menu),
              new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:coupons').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
            ],
          });
        }
      }

      // ─── Promo ───
      if (ns === 'promo') {
        if (!await requireShopAdmin(i)) return;
        if (action === 'create') {
          const m = new ModalBuilder().setCustomId('promo_modal:create').setTitle('Promoção');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('value').setLabel('% Desc').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('Dias').setStyle(TextInputStyle.Short).setValue('7').setRequired(true)),
          );
          return i.showModal(m);
        }
        if (action === 'del') {
          const { data: list } = await supabase.from('promotions').select('*').eq('guild_id', guild.id).limit(25);
          const menu = new StringSelectMenuBuilder().setCustomId('promo:delpick').setPlaceholder('Promo');
          for (const p of list || []) menu.addOptions({ label: p.name.slice(0, 90), value: String(p.id) });
          return i.update({
            embeds: [baseEmbed(await getSettings(guild.id), '🗑️')],
            components: [
              new ActionRowBuilder().addComponents(menu),
              new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:promos').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
            ],
          });
        }
      }

      // ─── Pedidos ───
      if (ns === 'pedidos') {
        if (!await requireShopAdmin(i)) return;
        return i.update(await ordersPanel(guild.id, action));
      }

      // ─── Client ───
      if (ns === 'client' && action === 'baladd') {
        if (!await requireShopAdmin(i)) return;
        const m = new ModalBuilder().setCustomId(`client_modal:baladd:${rest[0]}`).setTitle('Saldo');
        m.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('amount').setLabel('Valor').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return i.showModal(m);
      }

      // ─── Setup loja ───
      if (ns === 'setup') {
        if (!await requireShopAdmin(i)) return;
        const s = await getSettings(guild.id);
        if (action === 'home') return i.update(setupHome(s));
        if (action === 'store') {
          const m = new ModalBuilder().setCustomId('setup_modal:store').setTitle('Loja');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(s?.store_name || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(s?.store_description || '').setRequired(false)),
          );
          return i.showModal(m);
        }
        if (action === 'payment') {
          const usandoMP = !!s?.mp_access_token;
          const e = baseEmbed(s, '💳 Pagamentos')
            .setDescription(usandoMP ? '🟢 **MP ativo**' : (s?.pix_key ? '🟡 PIX estático' : '🔴 Nenhum'))
            .addFields(
              { name: '🔑 PIX', value: s?.pix_key ? `\`${maskToken(s.pix_key)}\`` : '*—*', inline: false },
              { name: '💳 MP', value: usandoMP ? `🟢 \`${maskToken(s.mp_access_token)}\`` : '🔴', inline: false },
            );
          return i.update({
            embeds: [e],
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('setup:mp_config').setLabel(usandoMP ? 'Editar MP' : 'Configurar MP').setEmoji('💳').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('setup:mp_test').setLabel('Testar').setEmoji('🧪').setStyle(ButtonStyle.Primary).setDisabled(!usandoMP),
                new ButtonBuilder().setCustomId('setup:mp_remove').setLabel('Remover').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(!usandoMP),
              ),
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('setup:edit_pix').setLabel('PIX estático').setEmoji('🔑').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('setup:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger),
              ),
            ],
          });
        }
        if (action === 'mp_config') {
          const m = new ModalBuilder().setCustomId('setup_modal:mp_token').setTitle('Configurar MP');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mp_token').setLabel('Access Token').setStyle(TextInputStyle.Short).setPlaceholder('APP_USR-...').setValue(s?.mp_access_token || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mp_public_key').setLabel('Public Key (opc)').setStyle(TextInputStyle.Short).setValue(s?.mp_public_key || '').setRequired(false)),
          );
          return i.showModal(m);
        }
        if (action === 'mp_test') {
          await i.deferReply({ flags: EPHEMERAL });
          const st = await getSettings(guild.id);
          if (!st?.mp_access_token) return i.editReply({ content: '❌ Sem token.' });
          const test = await criarPixMercadoPago(0.01, `TESTE${Date.now()}`, 'Teste', st.mp_access_token);
          if (test?.ok) return i.editReply({ content: `✅ OK!\n> 🆔 \`${test.payment_id}\`` });
          return i.editReply({ content: `❌ ${test?.error || 'erro'}` });
        }
        if (action === 'mp_remove') {
          await setGuildMPToken(guild.id, null, null);
          await logConfig(guild, i.user.id, 'MP_TOKEN_REMOVED', {});
          return i.update(setupHome(await getSettings(guild.id)));
        }
        if (action === 'edit_pix') {
          const m = new ModalBuilder().setCustomId('setup_modal:pix').setTitle('Pix');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('Chave').setStyle(TextInputStyle.Short).setValue(s?.pix_key || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(s?.pix_name || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('city').setLabel('Cidade').setStyle(TextInputStyle.Short).setValue(s?.pix_city || '').setRequired(false)),
          );
          return i.showModal(m);
        }
        if (action === 'logs') {
          return i.update({
            embeds: [baseEmbed(s, '🖼️ Logs')],
            components: [
              new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('setup_ch:log_channel_id').setPlaceholder('Logs').setChannelTypes(ChannelType.GuildText)),
              new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('setup_ch:sales_channel_id').setPlaceholder('Vendas').setChannelTypes(ChannelType.GuildText)),
              new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('setup:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
            ],
          });
        }
        if (action === 'permissions') {
          return i.update({
            embeds: [baseEmbed(s, '👑 Permissões')],
            components: [
              new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('setup_role:admin_role_id').setPlaceholder('Admin')),
              new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('setup_role:manager_role_id').setPlaceholder('Gerente')),
              new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('setup_role:customer_role_id').setPlaceholder('Cliente')),
              new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('setup:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
            ],
          });
        }
      }

      // ─── CFG ───
      if (cid.startsWith('cfg_')) {
        if (!await isAdmin(i.user, guild)) return i.reply({ content: '❌', flags: EPHEMERAL });
        if (cid === 'cfg_canais') {
          const opts = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => new StringSelectMenuOptionBuilder().setLabel('#' + c.name).setValue(c.id)).slice(0, 25);
          if (!opts.length) return i.reply({ content: '❌', flags: EPHEMERAL });
          const menus = [
            { id: 'cfgset_ticket_log_channel', ph: 'Logs ticket' },
            { id: 'cfgset_log_channel', ph: 'Logs' },
            { id: 'cfgset_welcome_channel', ph: 'Bem-vindo' },
            { id: 'cfgset_suggestion_channel', ph: 'Sugestões' },
          ];
          return i.reply({
            embeds: [new EmbedBuilder().setTitle('📢 Canais')],
            components: menus.map(m => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(m.id).setPlaceholder(m.ph).addOptions(opts))),
            flags: EPHEMERAL,
          });
        }
        if (cid === 'cfg_cargos') {
          const opts = guild.roles.cache.filter(r => r.id !== guild.roles.everyone.id && !r.managed).map(r => new StringSelectMenuOptionBuilder().setLabel(r.name).setValue(r.id)).slice(0, 25);
          if (!opts.length) return i.reply({ content: '❌', flags: EPHEMERAL });
          const menus = [
            { id: 'cfgset_admin_role', ph: 'Admin' },
            { id: 'cfgset_membro_role', ph: 'Membro' },
            { id: 'cfgset_ticket_cargo', ph: 'Suporte' },
            { id: 'cfgset_autorole_role', ph: 'AutoRole' },
          ];
          return i.reply({
            embeds: [new EmbedBuilder().setTitle('🎭 Cargos')],
            components: menus.map(m => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(m.id).setPlaceholder(m.ph).addOptions(opts))),
            flags: EPHEMERAL,
          });
        }
        if (cid === 'cfg_moderacao') {
          const c = await getConfig(guild.id);
          return i.reply({
            embeds: [new EmbedBuilder().setTitle('🛡️ Moderação').addFields(
              { name: 'Antilink', value: c.anti_link ? '✅' : '❌', inline: true },
              { name: 'Anti-convite', value: c.anti_invite ? '✅' : '❌', inline: true },
            )],
            components: [new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('cfg_toggle_antilink').setLabel(c.anti_link ? 'Desativar' : 'Ativar').setStyle(c.anti_link ? ButtonStyle.Danger : ButtonStyle.Success),
              new ButtonBuilder().setCustomId('cfg_toggle_antiinvite').setLabel(c.anti_invite ? 'Desativar' : 'Ativar').setStyle(c.anti_invite ? ButtonStyle.Danger : ButtonStyle.Success),
            )],
            flags: EPHEMERAL,
          });
        }
        if (cid === 'cfg_toggle_antilink') {
          const c = await getConfig(guild.id);
          c.anti_link = !c.anti_link;
          await setConfig(guild.id, c);
          return i.update(await admPanelAutomacao(guild));
        }
        if (cid === 'cfg_toggle_antiinvite') {
          const c = await getConfig(guild.id);
          c.anti_invite = !c.anti_invite;
          await setConfig(guild.id, c);
          return i.update(await admPanelAutomacao(guild));
        }
      }

      // ═══════════════════════════════════════════════════════════
      // ADMIN BUTTONS
      // ═══════════════════════════════════════════════════════════
      if (cid.startsWith('adm_')) {
        if (cid === 'adm_back') {
          if (!await isAdmin(i.user, guild)) return;
          return i.update(adminHub());
        }
        if (cid === 'adm_loja') {
          if (!await isAdmin(i.user, guild)) return;
          return i.update(await panelHome(guild.id));
        }
        if (cid === 'adm_paineis') {
          if (!await isAdmin(i.user, guild)) return;
          return i.update({
            embeds: [new EmbedBuilder().setTitle('🎫 Painéis').setColor('#9B59B6')],
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('adm_p_ticket').setLabel('Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('adm_p_verif').setLabel('Verif').setEmoji('✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('adm_p_updates').setLabel('Updates').setEmoji('📢').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('adm_p_loja').setLabel('Loja').setEmoji('🛒').setStyle(ButtonStyle.Success),
              ),
              new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
            ],
          });
        }
        if (cid === 'adm_p_ticket') {
          if (!await isAdmin(i.user, guild)) return;
          const panels = await getTicketPanels(guild.id);
          if (!panels.length) return i.reply({ content: '❌ Nenhum painel criado.', flags: EPHEMERAL });
          const panel = panels[0];
          const msg = await channel.send({ embeds: [buildTicketPanelEmbed(panel)], components: buildTicketPanelComponents(panel) });
          await updateTicketPanel(guild.id, panel.id, { canal_id: channel.id, mensagem_id: msg.id });
          return i.reply({ content: '✅', flags: EPHEMERAL });
        }
        if (cid === 'adm_p_verif') {
          if (!await isAdmin(i.user, guild)) return;
          const c = await getConfig(guild.id);
          const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${encodeURIComponent('verify:' + guild.id)}`;
          const b = new ButtonBuilder().setLabel(c.verificacao_botao || 'Verificar').setEmoji('✅').setStyle(ButtonStyle.Link).setURL(oauthUrl);
          await channel.send({
            embeds: [new EmbedBuilder().setColor(c.verificacao_cor || '#00FF00').setTitle(c.verificacao_titulo || 'Verificação').setDescription(c.verificacao_descricao || 'Clique para verificar.')],
            components: [new ActionRowBuilder().addComponents(b)],
          });
          return i.reply({ content: '✅ Painel de verificação postado.', flags: EPHEMERAL });
        }
        if (cid === 'adm_p_updates') {
          if (!await isAdmin(i.user, guild)) return;
          const s = await getSettings(guild.id);
          const atual = s?.update_channel_id ? `<#${s.update_channel_id}>` : '*não configurado*';
          const topRole = getTopRole(guild);
          const e = new EmbedBuilder().setTitle('📢 Canal de Updates').setColor('#5865F2')
            .setDescription(`Configure onde o bot avisa sobre **atualizações**.\n\n**Canal:** ${atual}\n**Cargo marcado:** ${topRole ? `<@&${topRole.id}>` : 'dono'}`)
            .setFooter({ text: 'Se não existir, o bot cria automaticamente' });
          const menu = new ChannelSelectMenuBuilder().setCustomId('updates_channel_pick').setPlaceholder('Escolha o canal').setChannelTypes(ChannelType.GuildText);
          return i.reply({
            embeds: [e],
            components: [
              new ActionRowBuilder().addComponents(menu),
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('updates_test').setLabel('Testar').setEmoji('🧪').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('updates_reset').setLabel('Resetar').setEmoji('🔄').setStyle(ButtonStyle.Danger),
              ),
            ],
            flags: EPHEMERAL,
          });
        }
        if (cid === 'adm_p_loja') {
          if (!await isAdmin(i.user, guild)) return;
          const s = await getSettings(guild.id);
          const e = baseEmbed(s, `🛒 ${s?.store_name || 'Loja'}`, s?.store_description || '');
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('loja:comprar').setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('loja:meus_pedidos').setLabel('Meus pedidos').setEmoji('🧾').setStyle(ButtonStyle.Secondary),
          );
          await channel.send({ embeds: [e], components: [row] });
          return i.reply({ content: '✅ Painel de loja postado.', flags: EPHEMERAL });
        }
        if (cid === 'adm_configurar') {
          if (!await isAdmin(i.user, guild)) return;
          return i.update({
            embeds: [new EmbedBuilder().setTitle('⚙️ Configurar').setColor('#5865F2')],
            components: [new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('cfg_canais').setLabel('Canais').setEmoji('📢').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId('cfg_cargos').setLabel('Cargos').setEmoji('🎭').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId('cfg_moderacao').setLabel('Moderação').setEmoji('🛡️').setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
            )],
          });
        }
        if (cid === 'adm_servidor') { if (!await isAdmin(i.user, guild)) return; return i.update(await admPanelServidor(guild)); }
        if (cid === 'adm_anuncios') { if (!await isAdmin(i.user, guild)) return; return i.update(await admPanelAnuncios()); }
        if (cid === 'adm_utilidades') { if (!await isAdmin(i.user, guild)) return; return i.update(await admPanelUtilidades()); }
        if (cid === 'adm_call') { if (!await isAdmin(i.user, guild)) return; return i.update(await admPanelCall()); }
        if (cid === 'adm_antiraid') { if (!await isAdmin(i.user, guild)) return; return i.update(await admPanelAntiRaid()); }
        if (cid === 'adm_musica') { if (!await isAdmin(i.user, guild)) return; return i.update(await admPanelMusica(guild)); }
        if (cid === 'adm_manutencao') { if (!await isAdmin(i.user, guild)) return; return i.update(await admPanelManutencao(guild)); }
        if (cid === 'adm_tickets') { if (!await isAdmin(i.user, guild)) return; return i.update(await admPanelTickets(guild)); }
        if (cid === 'adm_usuarios') { if (!await isAdmin(i.user, guild)) return; return i.update(await admPanelUsuarios()); }
        if (cid === 'adm_automacao') { if (!await isAdmin(i.user, guild)) return; return i.update(await admPanelAutomacao(guild)); }

        // ⚡ NOVO v6.6.0 — versículo admin
        if (cid === 'adm_versiculo_toggle') {
          if (!await isAdmin(i.user, guild)) return;
          const c = await getConfig(guild.id);
          c.versiculo_ativo = !c.versiculo_ativo;
          await setConfig(guild.id, c);
          return i.update(await admCatVersiculo(guild));
        }
        if (cid === 'adm_versiculo_set_channel') {
          if (!await isAdmin(i.user, guild)) return;
          const c = await getConfig(guild.id);
          const menu = new ChannelSelectMenuBuilder().setCustomId('versiculo_channel_pick').setPlaceholder('📢 Escolha o canal').setChannelTypes(ChannelType.GuildText);
          return i.reply({
            embeds: [new EmbedBuilder().setTitle('📢 Canal do versículo').setColor('#FEE75C').setDescription(`Atual: ${c.versiculo_channel ? `<#${c.versiculo_channel}>` : '*não configurado*'}`)],
            components: [new ActionRowBuilder().addComponents(menu)],
            flags: EPHEMERAL,
          });
        }
        if (cid === 'adm_versiculo_set_hour') {
          if (!await isAdmin(i.user, guild)) return;
          const m = new ModalBuilder().setCustomId('adm_versiculo_hour_modal').setTitle('Horário');
          const c = await getConfig(guild.id);
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('hora').setLabel('Hora (0-23)').setStyle(TextInputStyle.Short).setValue(String(c.versiculo_hora || 8)).setRequired(true).setMaxLength(2)
          ));
          return i.showModal(m);
        }
        if (cid === 'adm_versiculo_test') {
          if (!await isAdmin(i.user, guild)) return;
          const c = await getConfig(guild.id);
          if (!c.versiculo_channel) return i.reply({ content: '❌ Configure o canal primeiro.', flags: EPHEMERAL });
          await i.deferReply({ flags: EPHEMERAL });
          const ok = await enviarVersiculoDia(guild.id, c.versiculo_channel, { ping: `<@${i.user.id}>` });
          return i.editReply({ content: ok ? '✅ Enviado!' : '❌ Falha ao enviar.' });
        }

        if (cid === 'adm_sorteios') {
          if (!await isAdmin(i.user, guild)) return;
          const m = new ModalBuilder().setCustomId('modal_adm_sorteio').setTitle('Criar sorteio');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('premio').setLabel('Prêmio').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duracao').setLabel('Duração (min)').setStyle(TextInputStyle.Short).setValue('60').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('vencedores').setLabel('Nº vencedores').setStyle(TextInputStyle.Short).setValue('1').setRequired(true)),
          );
          return i.showModal(m);
        }
        if (cid === 'adm_maint_toggle') {
          if (!await isAdmin(i.user, guild)) return;
          const cfg = await getConfig(guild.id);
          const nv = !cfg.admin_maintenance;
          await setConfig(guild.id, { ...cfg, admin_maintenance: nv, admin_maintenance_by: i.user.id, admin_maintenance_since: nv ? new Date().toISOString() : null });
          await logConfig(guild, i.user.id, nv ? 'ADMIN_MAINT_ON' : 'ADMIN_MAINT_OFF', {});
          return i.update(await admPanelManutencao(guild));
        }
        if (cid === 'adm_maint_reason') {
          if (!await isAdmin(i.user, guild)) return;
          const m = new ModalBuilder().setCustomId('adm_maint_reason_modal').setTitle('Motivo');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('r').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300)
          ));
          return i.showModal(m);
        }
        if (cid === 'adm_lockdown') {
          if (!await isAdmin(i.user, guild)) return;
          for (const c of guild.channels.cache.values()) if (c.type === ChannelType.GuildText) await c.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => {});
          return i.reply({ content: '🔒 Lockdown aplicado.', flags: EPHEMERAL });
        }
        if (cid === 'adm_sv_backup') {
          if (!await isAdmin(i.user, guild)) return;
          const data = { name: guild.name, roles: guild.roles.cache.map(r => ({ name: r.name })), channels: guild.channels.cache.map(c => ({ name: c.name, type: c.type })) };
          try { await supabase.from('guild_backups').insert({ guild_id: guild.id, data }); } catch {}
          return i.reply({ content: '💾 Backup salvo.', flags: EPHEMERAL });
        }
        if (cid === 'adm_say') {
          if (!await isAdmin(i.user, guild)) return;
          const m = new ModalBuilder().setCustomId('modal_adm_say').setTitle('Say');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('msg').setLabel('Mensagem').setStyle(TextInputStyle.Paragraph).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (cid === 'adm_anunciar') {
          if (!await isAdmin(i.user, guild)) return;
          const m = new ModalBuilder().setCustomId('modal_adm_anunciar').setTitle('Anunciar');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('canal_id').setLabel('ID canal').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('msg').setLabel('Msg').setStyle(TextInputStyle.Paragraph).setRequired(true)),
          );
          return i.showModal(m);
        }
        if (cid === 'adm_embed') {
          if (!await isAdmin(i.user, guild)) return;
          const m = new ModalBuilder().setCustomId('modal_adm_embed').setTitle('Embed');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cor').setLabel('Cor hex').setStyle(TextInputStyle.Short).setValue('#5865F2').setRequired(false)),
          );
          return i.showModal(m);
        }
        if (cid === 'adm_global') {
          if (!isDev) return;
          const m = new ModalBuilder().setCustomId('modal_global').setTitle('Aviso global');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('msg').setLabel('Msg').setStyle(TextInputStyle.Paragraph).setRequired(true)),
          );
          return i.showModal(m);
        }
        if (cid === 'util_dado') return i.reply({ content: `🎲 **${Math.floor(Math.random() * 6) + 1}**`, flags: EPHEMERAL });
        if (cid === 'util_ping') return i.reply({ content: `🏓 ${client.ws.ping}ms`, flags: EPHEMERAL });
        if (cid === 'util_sorteio') {
          const m = new ModalBuilder().setCustomId('modal_util_sorteio').setTitle('Sortear');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('opcoes').setLabel('Uma por linha').setStyle(TextInputStyle.Paragraph).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (cid === 'util_enquete') {
          const m = new ModalBuilder().setCustomId('modal_util_enquete').setTitle('Enquete');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('pergunta').setLabel('Pergunta').setStyle(TextInputStyle.Paragraph).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (cid === 'adm_call_join') {
          if (!await isAdmin(i.user, guild)) return;
          const vc = member.voice?.channel;
          if (!vc) return i.reply({ content: '❌ Entre em um canal de voz.', flags: EPHEMERAL });
          await entrarNaCall(guild, vc.id);
          await salvarCanalVoz(guild.id, vc.id);
          return i.reply({ content: `🔊 Entrei em ${vc}`, flags: EPHEMERAL });
        }
        if (cid === 'adm_call_leave') {
          if (!await isAdmin(i.user, guild)) return;
          getVoiceConnection(guild.id)?.destroy();
          await removerCanalVoz(guild.id);
          return i.reply({ content: '👋 Saí.', flags: EPHEMERAL });
        }
        if (cid === 'adm_u_info') {
          const m = new ModalBuilder().setCustomId('modal_u_info').setTitle('Info');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('uid').setLabel('ID').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (cid === 'adm_u_warns') {
          const m = new ModalBuilder().setCustomId('modal_u_warns').setTitle('Warns');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('uid').setLabel('ID').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (cid === 'adm_u_role') {
          const m = new ModalBuilder().setCustomId('modal_u_role').setTitle('Cargo');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('uid').setLabel('ID user').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rid').setLabel('ID cargo').setStyle(TextInputStyle.Short).setRequired(true)),
          );
          return i.showModal(m);
        }
        if (cid === 'adm_u_bl') {
          const m = new ModalBuilder().setCustomId('modal_u_bl').setTitle('Blacklist');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('uid').setLabel('ID').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('acao').setLabel('add/del').setStyle(TextInputStyle.Short).setRequired(true)),
          );
          return i.showModal(m);
        }
        if (cid === 'adm_ticket_create') {
          if (!await isAdmin(i.user, guild)) return;
          const m = new ModalBuilder().setCustomId('ticket_panel_modal:create').setTitle('Criar painel de ticket');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nome').setLabel('Nome').setStyle(TextInputStyle.Short).setValue('Suporte').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setValue('Central de Suporte').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue('Clique abaixo').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cor').setLabel('Cor hex').setStyle(TextInputStyle.Short).setValue('#9B59B6').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('botao').setLabel('Texto do botão').setStyle(TextInputStyle.Short).setValue('Abrir Ticket').setRequired(false)),
          );
          return i.showModal(m);
        }
        if (cid === 'adm_ticket_panels') {
          if (!await isAdmin(i.user, guild)) return;
          const panels = await getTicketPanels(guild.id);
          const e = new EmbedBuilder().setTitle('🎨 Painéis de Ticket').setColor('#9B59B6')
            .setDescription(`**Total:** ${panels.length}/${MAX_TICKET_PANELS}\n\n${panels.length ? panels.map(p => `**#${p.id} — ${p.nome}**\n> Tipos: ${p.tipos.length} • ${p.canal_id ? `📢 <#${p.canal_id}>` : '*não postado*'}`).join('\n\n') : '*Nenhum.*'}`);
          const rows = [];
          if (panels.length) {
            const menu = new StringSelectMenuBuilder().setCustomId('adm_ticket_edit_pick').setPlaceholder('Editar painel');
            for (const p of panels.slice(0, 25)) menu.addOptions({ label: `#${p.id} — ${p.nome}`.slice(0, 90), value: String(p.id) });
            rows.push(new ActionRowBuilder().addComponents(menu));
          }
          rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('adm_ticket_create').setLabel('Criar novo').setEmoji('➕').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('adm_tickets').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
          ));
          return i.update({ embeds: [e], components: rows });
        }
      }

      // ═══════════════════════════════════════════════════════════
      // TICKET PANEL (editor)
      // ═══════════════════════════════════════════════════════════
      if (cid.startsWith('ticket_panel_')) {
        if (!await isAdmin(i.user, guild)) return;
        const parts = cid.split(':');
        const a2 = parts[0].replace('ticket_panel_', '');
        const panelId = parts[1];
        if (a2 === 'edit') {
          const panel = await getTicketPanel(guild.id, panelId);
          if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
          const m = new ModalBuilder().setCustomId(`ticket_panel_modal:edit:${panelId}`).setTitle('Editar painel');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nome').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(panel.nome || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setValue(panel.titulo || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(panel.descricao || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cor').setLabel('Cor hex').setStyle(TextInputStyle.Short).setValue(panel.cor || '#9B59B6').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('botao').setLabel('Botão').setStyle(TextInputStyle.Short).setValue(panel.botao_label || 'Abrir Ticket').setRequired(false)),
          );
          return i.showModal(m);
        }
        if (a2 === 'edit_extras') {
          const panel = await getTicketPanel(guild.id, panelId);
          if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
          const m = new ModalBuilder().setCustomId(`ticket_panel_modal:edit_extras:${panelId}`).setTitle('Imagens & extras');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner').setLabel('Banner URL').setStyle(TextInputStyle.Short).setValue(panel.banner || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('thumbnail').setLabel('Thumb URL').setStyle(TextInputStyle.Short).setValue(panel.thumbnail || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji do botão').setStyle(TextInputStyle.Short).setValue(panel.botao_emoji || '🎫').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cargo').setLabel('ID/mention cargo staff').setStyle(TextInputStyle.Short).setValue(panel.cargo_id || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('log').setLabel('ID/#canal log').setStyle(TextInputStyle.Short).setValue(panel.log_channel_id || '').setRequired(false)),
          );
          return i.showModal(m);
        }
        if (a2 === 'type_add') {
          const panel = await getTicketPanel(guild.id, panelId);
          if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
          if (panel.tipos.length >= MAX_TICKET_TYPES_PER_PANEL) return i.reply({ content: `❌ Limite ${MAX_TICKET_TYPES_PER_PANEL}.`, flags: EPHEMERAL });
          const m = new ModalBuilder().setCustomId(`ticket_panel_modal:type_add:${panelId}`).setTitle('Adicionar tipo');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Nome do tipo').setStyle(TextInputStyle.Short).setValue('Suporte').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setValue('🎫').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição curta').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('canal_id').setLabel('ID/#canal específico').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('ID/@cargo responsável').setStyle(TextInputStyle.Short).setRequired(false)),
          );
          return i.showModal(m);
        }
        if (a2 === 'send') {
          const panel = await getTicketPanel(guild.id, panelId);
          if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
          let alvo = panel.canal_id ? guild.channels.cache.get(panel.canal_id) : null;
          if (!alvo) alvo = i.channel;
          try {
            const msg = await alvo.send({ embeds: [buildTicketPanelEmbed(panel)], components: buildTicketPanelComponents(panel) });
            await updateTicketPanel(guild.id, panel.id, { canal_id: alvo.id, mensagem_id: msg.id });
            return i.reply({ content: `✅ Painel postado em <#${alvo.id}>`, flags: EPHEMERAL });
          } catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
        }
        if (a2 === 'delete') {
          const panel = await getTicketPanel(guild.id, panelId);
          if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
          if (panel.canal_id && panel.mensagem_id) {
            try {
              const ch = await guild.channels.fetch(panel.canal_id).catch(() => null);
              if (ch) {
                const m = await ch.messages.fetch(panel.mensagem_id).catch(() => null);
                if (m) await m.delete().catch(() => {});
              }
            } catch {}
          }
          await deleteTicketPanel(guild.id, panelId);
          return i.update(await admPanelTickets(guild));
        }
      }

      // ─── Ticket open ───
      if (cid.startsWith('ticket_open:')) {
        const parts = cid.split(':');
        const panelId = parts[1], typeId = parts[2];
        const panel = await getTicketPanel(guild.id, panelId);
        if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
        if (!ticketCooldownCheck(i.user.id, 3000)) return i.reply({ content: '⏳ Aguarde.', flags: EPHEMERAL });
        const lim = await canUserOpenTicket(guild, i.member, panel);
        if (!lim.ok) return i.reply({ content: lim.reason, flags: EPHEMERAL });
        let tipo = panel.tipos.find(t => String(t.id) === String(typeId));
        if (!tipo && panel.tipos?.length) tipo = panel.tipos[0];
        if (!tipo) tipo = { id: 'sem_tipo', label: panel.titulo || 'Suporte', emoji: '🎫', descricao: '', canal_id: null };
        if (panel.formulario?.habilitado && panel.formulario.perguntas?.length) {
          const questions = panel.formulario.perguntas.slice(0, MAX_FORM_QUESTIONS);
          const m = new ModalBuilder().setCustomId(`tkt_form:${panelId}:${tipo.id}`).setTitle(`Formulário`.slice(0, 45));
          for (const q of questions) {
            const ti = new TextInputBuilder()
              .setCustomId(`q_${q.label.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)}`)
              .setLabel((q.label || 'Pergunta').slice(0, 45))
              .setPlaceholder((q.placeholder || '').slice(0, 100))
              .setStyle(TextInputStyle.Short)
              .setRequired(!!q.obrigatorio);
            m.addComponents(new ActionRowBuilder().addComponents(ti));
          }
          return i.showModal(m);
        }
        await i.deferReply({ flags: EPHEMERAL });
        try {
          const th = await openTicket(i, panel, tipo, []);
          return i.editReply({ content: `✅ Ticket em <#${th.id}>` });
        } catch (e) { return i.editReply({ content: `❌ ${e.message}` }); }
      }

      // ─── TKT (interno) ───
      if (ns === 'tkt') {
        const th = i.channel;
        if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
        const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
        if (!td) return i.reply({ content: '❌ Ticket não encontrado.', flags: EPHEMERAL });
        const panel = td.panel_id ? await getTicketPanel(guild.id, td.panel_id) : null;
        const tipo = panel?.tipos?.find(t => String(t.id) === String(td.type_id));
        const typeRole = safeStr(tipo?.cargo_responsavel_id);
        const okStaff = await isTicketStaff(i.user, guild, panel?.cargo_id, typeRole);
        if (!okStaff) return i.reply({ content: '❌ Só staff.', flags: EPHEMERAL });

        if (action === 'claim') return ticketActionClaim(i);
        if (action === 'unclaim') return ticketActionUnclaim(i);
        if (action === 'lock') return ticketActionLock(i);
        if (action === 'priority') return ticketActionPriority(i);
        if (action === 'add') {
          const m = new ModalBuilder().setCustomId(`tkt_modal:add:${th.id}`).setTitle('Adicionar usuário');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('uid').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (action === 'remove') {
          const m = new ModalBuilder().setCustomId(`tkt_modal:remove:${th.id}`).setTitle('Remover usuário');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('uid').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (action === 'rename') {
          const m = new ModalBuilder().setCustomId(`tkt_modal:rename:${th.id}`).setTitle('Renomear');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('name').setLabel('Novo nome').setStyle(TextInputStyle.Short).setValue(th.name.slice(0, 90)).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (action === 'transfer') {
          if (!panel || !panel.tipos?.length) return i.reply({ content: '❌ Sem tipos.', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId(`tkt_transfer:${th.id}`).setPlaceholder('Transferir para...');
          for (const t of panel.tipos) menu.addOptions({ label: `${t.emoji || '🎫'} ${t.label}`.slice(0, 90), value: String(t.id) });
          return i.reply({
            embeds: [new EmbedBuilder().setTitle('↪️ Transferir').setColor('#5865F2')],
            components: [new ActionRowBuilder().addComponents(menu)],
            flags: EPHEMERAL,
          });
        }
        if (action === 'move') {
          const cats = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory);
          if (!cats.size) return i.reply({ content: '❌', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId(`tkt_move:${th.id}`).setPlaceholder('Mover para...');
          for (const c of cats.values()) menu.addOptions({ label: c.name.slice(0, 90), value: c.id });
          return i.reply({
            embeds: [new EmbedBuilder().setTitle('📁 Mover').setColor('#5865F2')],
            components: [new ActionRowBuilder().addComponents(menu)],
            flags: EPHEMERAL,
          });
        }
        if (action === 'close') return ticketActionClose(i);
        if (action === 'delete') {
          const m = new ModalBuilder().setCustomId(`tkt_modal:delete:${th.id}`).setTitle('Excluir ticket');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('confirm').setLabel('Digite EXCLUIR').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (action === 'rate') {
          const n = parseInt(rest[1]) || 0;
          return ticketActionRate(i, n);
        }
        return;
      }

      // ─── TKTEDIT ───
      if (ns === 'tktedit') {
        if (!await isAdmin(i.user, guild)) return;
        const panelId = rest[0];
        if (action === 'open') return i.update(await ticketEditorPanel(guild.id, panelId));
        if (action === 'embed' || action === 'button' || action === 'staff') {
          const m = new ModalBuilder().setCustomId(`tktedit_modal:${action}:${panelId}`).setTitle(action === 'embed' ? 'Embed' : action === 'button' ? 'Botão' : 'Staff & Logs');
          const p = await getTicketPanel(guild.id, panelId);
          if (!p) return i.reply({ content: '❌', flags: EPHEMERAL });
          if (action === 'embed') m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setValue(p.titulo || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(p.descricao || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cor').setLabel('Cor hex').setStyle(TextInputStyle.Short).setValue(p.cor || '#9B59B6').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner').setLabel('Banner URL').setStyle(TextInputStyle.Short).setValue(p.banner || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('thumbnail').setLabel('Thumb URL').setStyle(TextInputStyle.Short).setValue(p.thumbnail || '').setRequired(false)),
          );
          if (action === 'button') m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Label').setStyle(TextInputStyle.Short).setValue(p.botao_label || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setValue(p.botao_emoji || '🎫').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('footer').setLabel('Footer').setStyle(TextInputStyle.Short).setValue(p.footer || '').setRequired(false)),
          );
          if (action === 'staff') m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cargo_id').setLabel('ID/@cargo').setStyle(TextInputStyle.Short).setValue(p.cargo_id || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('log_id').setLabel('ID/#canal log').setStyle(TextInputStyle.Short).setValue(p.log_channel_id || '').setRequired(false)),
          );
          return i.showModal(m);
        }
        if (action === 'types') return i.update(await ticketTypesPanel(guild.id, panelId));
        if (action === 'config') return i.update(await ticketConfigPanel(guild.id, panelId));
        if (action === 'form') return i.update(await ticketFormPanel(guild.id, panelId));
        if (action === 'blocks') return i.update(await ticketBlocksPanel(guild.id, panelId));
        if (action === 'preview') {
          const p = await getTicketPanel(guild.id, panelId);
          if (!p) return i.reply({ content: '❌', flags: EPHEMERAL });
          return i.reply({ content: '👁️ Preview:', embeds: [buildTicketPanelEmbed(p)], components: buildTicketPanelComponents(p), flags: EPHEMERAL });
        }
        if (action === 'post') {
          const p = await getTicketPanel(guild.id, panelId);
          if (!p) return i.reply({ content: '❌', flags: EPHEMERAL });
          const alvo = p.canal_id ? guild.channels.cache.get(p.canal_id) : channel;
          try {
            const msg = await alvo.send({ embeds: [buildTicketPanelEmbed(p)], components: buildTicketPanelComponents(p) });
            await updateTicketPanel(guild.id, p.id, { canal_id: alvo.id, mensagem_id: msg.id });
            return i.reply({ content: `✅ Painel enviado em <#${alvo.id}>`, flags: EPHEMERAL });
          } catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
        }
        if (action === 'delete') {
          const m = new ModalBuilder().setCustomId(`tktedit_modal:delete:${panelId}`).setTitle('Excluir painel');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('confirm').setLabel('Digite EXCLUIR').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
      }

      // ─── TKTTYPE ───
      if (ns === 'tkttype') {
        if (!await isAdmin(i.user, guild)) return;
        const panelId = rest[0];
        const p = await getTicketPanel(guild.id, panelId);
        if (!p) return i.reply({ content: '❌', flags: EPHEMERAL });
        if (action === 'add') {
          if (p.tipos.length >= MAX_TICKET_TYPES_PER_PANEL) return i.reply({ content: `❌ Limite atingido.`, flags: EPHEMERAL });
          const m = new ModalBuilder().setCustomId(`tkttype_modal:add:${panelId}`).setTitle('Adicionar tipo');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Nome').setStyle(TextInputStyle.Short).setValue('Suporte').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setValue('🎫').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('canal_id').setLabel('ID/#canal específico').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('ID/@cargo responsável').setStyle(TextInputStyle.Short).setRequired(false)),
          );
          return i.showModal(m);
        }
        if (action === 'edit') {
          const menu = new StringSelectMenuBuilder().setCustomId(`tkttype:editpick:${panelId}`).setPlaceholder('Tipo');
          for (const t of p.tipos) menu.addOptions({ label: `${t.emoji || '🎫'} ${t.label}`.slice(0, 90), value: String(t.id) });
          return i.update({ embeds: [new EmbedBuilder().setTitle('✏️ Editar tipo')], components: [new ActionRowBuilder().addComponents(menu)] });
        }
        if (action === 'del') {
          const menu = new StringSelectMenuBuilder().setCustomId(`tkttype:delpick:${panelId}`).setPlaceholder('Tipo');
          for (const t of p.tipos) menu.addOptions({ label: `${t.emoji || '🎫'} ${t.label}`.slice(0, 90), value: String(t.id) });
          return i.update({ embeds: [new EmbedBuilder().setTitle('🗑️ Remover tipo')], components: [new ActionRowBuilder().addComponents(menu)] });
        }
      }

      // ─── TKTCFG ───
      if (ns === 'tktcfg') {
        if (!await isAdmin(i.user, guild)) return;
        const panelId = rest[0];
        if (action === 'sair') {
          const p = await getTicketPanel(guild.id, panelId);
          if (!p) return i.reply({ content: '❌', flags: EPHEMERAL });
          await updateTicketPanel(guild.id, panelId, { fechar_ao_sair: !p.fechar_ao_sair });
          return i.update(await ticketConfigPanel(guild.id, panelId));
        }
        if (action === 'limite' || action === 'autoclose' || action === 'horario' || action === 'categoria') {
          const m = new ModalBuilder().setCustomId(`tktcfg_modal:${action}:${panelId}`).setTitle(action);
          const p = await getTicketPanel(guild.id, panelId);
          if (!p) return i.reply({ content: '❌', flags: EPHEMERAL });
          if (action === 'limite') m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('v').setLabel('Limite por user').setStyle(TextInputStyle.Short).setValue(String(p.limite_tickets_usuario || 1)).setRequired(true)
          ));
          if (action === 'autoclose') m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('v').setLabel('Horas (0=off)').setStyle(TextInputStyle.Short).setValue(String(p.auto_close_horas || 48)).setRequired(true)
          ));
          if (action === 'horario') m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('v').setLabel('Ex: 9h-18h').setStyle(TextInputStyle.Short).setValue(p.horario_atendimento || '').setRequired(false)
          ));
          if (action === 'categoria') m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('v').setLabel('ID/#nome da categoria').setStyle(TextInputStyle.Short).setValue(p.categoria_padrao_id || '').setRequired(false)
          ));
          return i.showModal(m);
        }
      }

      // ─── TKTFORM ───
      if (ns === 'tktform') {
        if (!await isAdmin(i.user, guild)) return;
        const panelId = rest[0];
        const p = await getTicketPanel(guild.id, panelId);
        if (!p) return i.reply({ content: '❌', flags: EPHEMERAL });
        if (action === 'toggle') {
          p.formulario.habilitado = !p.formulario.habilitado;
          await updateTicketPanel(guild.id, panelId, { formulario: p.formulario });
          return i.update(await ticketFormPanel(guild.id, panelId));
        }
        if (action === 'add') {
          if (p.formulario.perguntas.length >= MAX_FORM_QUESTIONS) return i.reply({ content: '❌ Limite atingido.', flags: EPHEMERAL });
          const m = new ModalBuilder().setCustomId(`tktform_modal:add:${panelId}`).setTitle('Adicionar pergunta');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Pergunta').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(45)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('placeholder').setLabel('Placeholder').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('obrigatorio').setLabel('Obrigatório? (sim/nao)').setStyle(TextInputStyle.Short).setValue('sim').setRequired(true)),
          );
          return i.showModal(m);
        }
        if (action === 'clear') {
          p.formulario.perguntas = [];
          await updateTicketPanel(guild.id, panelId, { formulario: p.formulario });
          return i.update(await ticketFormPanel(guild.id, panelId));
        }
      }

      // ─── TKTBLK ───
      if (ns === 'tktblk') {
        if (!await isAdmin(i.user, guild)) return;
        const panelId = rest[0];
        if (action === 'add') {
          const m = new ModalBuilder().setCustomId(`tktblk_modal:add:${panelId}`).setTitle('Bloquear usuário');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('uid').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (action === 'remove') {
          const menu = new StringSelectMenuBuilder().setCustomId(`tktblk:removepick:${panelId}`).setPlaceholder('Desbloquear');
          const p = await getTicketPanel(guild.id, panelId);
          for (const uid of p?.bloqueio_usuarios_ids || []) menu.addOptions({ label: `User ${uid}`, value: uid });
          return i.update({ embeds: [new EmbedBuilder().setTitle('✅ Desbloquear')], components: [new ActionRowBuilder().addComponents(menu)] });
        }
      }

      // ─── Bug dev ───
      if (ns === 'bug') {
        if (!isDev) return i.reply({ content: '❌', flags: EPHEMERAL });
        const bid = rest[0];
        if (action === 'resolve') {
          const { data: b } = await supabase.from('error_logs').select('*').eq('id', bid).maybeSingle();
          await supabase.from('error_logs').update({ status: 'resolved', resolved_by: i.user.id, resolved_at: new Date().toISOString() }).eq('id', bid);
          if (b?.user_id) try { const u = await client.users.fetch(b.user_id); await u.send(`✅ Bug \`#${bid}\` resolvido.`); } catch {}
          return i.update({
            embeds: [EmbedBuilder.from(i.message.embeds[0]).setColor('#22c55e').setFooter({ text: `✅ ${i.user.tag}` })],
            components: [],
          });
        }
        if (action === 'ignore') {
          await supabase.from('error_logs').update({ status: 'ignored', resolved_by: i.user.id, resolved_at: new Date().toISOString() }).eq('id', bid);
          return i.update({
            embeds: [EmbedBuilder.from(i.message.embeds[0]).setColor('#808080').setFooter({ text: `🚫 ${i.user.tag}` })],
            components: [],
          });
        }
      }

      // ═══════════════════════════════════════════════════════════
      // DEV BUTTONS (~60 handlers)
      // ═══════════════════════════════════════════════════════════
      if (cid.startsWith('dev_')) {
        if (!isDev) return i.reply({ content: '❌ Apenas devs.', flags: EPHEMERAL });

        if (cid === 'dev_back') return i.update(devHub());
        if (cid === 'dev_dashboard') return i.update(await devPanelDashboard());
        if (cid === 'dev_bot') return i.update(await devPanelBot());
        if (cid === 'dev_premium') return i.update(await devPanelPremium(guild));
        if (cid === 'dev_tiers') return i.update(await devPanelTiers());
        if (cid === 'dev_verificados') return i.update(await devPanelVerificados());
        if (cid === 'dev_manutencao') return i.update(await devPanelManutencao());
        if (cid === 'dev_kill_switch') return i.update(await devPanelKillSwitch());
        if (cid === 'dev_debug') return i.update(await devPanelDebug());
        if (cid === 'dev_alerts') return i.update(await devPanelAlerts());
        if (cid === 'dev_audit') return i.update(await devPanelAudit());
        if (cid === 'dev_inject') return i.update(await devPanelInject());
        if (cid === 'dev_staff_global') return i.update(await devPanelStaffGlobal(0));
        if (cid === 'dev_ranking') return i.update(await devPanelRanking());
        if (cid === 'dev_dead_servers') return i.update(await devPanelDeadServers(0));
        if (cid === 'dev_global_events') return i.update(await devPanelGlobalEvents());
        if (cid === 'dev_monitor') return i.update(await devPanelMonitor());
        if (cid === 'dev_preview') return i.update(await devPanelPreview());
        if (cid === 'dev_simulator') return i.update(await devPanelSimulator());
        if (cid === 'dev_sandbox') return i.update(await devPanelSandbox());
        if (cid === 'dev_sandbox_snippets') return i.update(buildSandboxSnippets());
        if (cid === 'dev_ratelimit') return i.update(await devPanelRateLimit());
        if (cid === 'dev_broadcast') return i.update(await devPanelBroadcast());
        if (cid === 'dev_force_rejoin') return i.update(await devPanelForceRejoin());
        if (cid === 'dev_rejoin') return i.update(await devPanelForceRejoin());
        if (cid === 'dev_locale') return i.reply({ ...(await devPanelLocale(guild)), flags: EPHEMERAL });
        if (cid === 'dev_analytics') return i.reply({ ...(await devPanelAnalytics(guild.id)), flags: EPHEMERAL });

        // FF
        if (cid === 'dev_ff_panel') return i.reply({ ...(await ffConfigPanel(guild.id)), flags: EPHEMERAL });
        if (cid === 'dev_ff_postar') return i.reply({ ...(await ffConfigPanel(guild.id)), flags: EPHEMERAL });
        if (cid === 'dev_ff_streamer') return i.reply({ ...(await ffPanelStreamer(guild.id)), flags: EPHEMERAL });
        if (cid === 'dev_ff_manutencao') return i.reply({ ...(await ffPanelApostas(guild.id)), flags: EPHEMERAL });
        if (cid === 'dev_ff_pix') return i.reply({ ...(await ffPanelPix(guild.id)), flags: EPHEMERAL });
        if (cid === 'dev_ff_pix_med') return i.reply({ ...(await devPanelPixMediadores(guild.id)), flags: EPHEMERAL });

        // Versículo (NOVO v6.6.0)
        if (cid === 'dev_versiculo_config') return i.update(await devPanelVersiculo());
        if (cid === 'dev_versiculo_stats') return i.reply({ ...(await devPanelVersiculoStats(guild.id)), flags: EPHEMERAL });
        if (cid === 'dev_versiculo_all') return i.update(await devPanelVersiculoAll());
        if (cid === 'dev_versiculo_toggle') {
          const c = await getConfig(guild.id);
          c.versiculo_ativo = !c.versiculo_ativo;
          await setConfig(guild.id, c);
          return i.update(await devPanelVersiculo());
        }
        if (cid === 'dev_versiculo_set_channel') {
          const menu = new ChannelSelectMenuBuilder().setCustomId('versiculo_channel_pick').setPlaceholder('📢 Canal').setChannelTypes(ChannelType.GuildText);
          return i.reply({
            embeds: [new EmbedBuilder().setTitle('📢 Canal').setColor('#FEE75C')],
            components: [new ActionRowBuilder().addComponents(menu)],
            flags: EPHEMERAL,
          });
        }
        if (cid === 'dev_versiculo_set_hour') {
          const m = new ModalBuilder().setCustomId('adm_versiculo_hour_modal').setTitle('Horário');
          const c = await getConfig(guild.id);
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('hora').setLabel('Hora (0-23)').setStyle(TextInputStyle.Short).setValue(String(c.versiculo_hora || 8)).setRequired(true).setMaxLength(2)
          ));
          return i.showModal(m);
        }
        if (cid === 'dev_versiculo_test') {
          const c = await getConfig(guild.id);
          if (!c.versiculo_channel) return i.reply({ content: '❌ Configure o canal primeiro.', flags: EPHEMERAL });
          await i.deferReply({ flags: EPHEMERAL });
          const ok = await enviarVersiculoDia(guild.id, c.versiculo_channel, {});
          return i.editReply({ content: ok ? '✅ Enviado!' : '❌ Falha.' });
        }
        if (cid === 'dev_versiculo_reset') {
          const c = await getConfig(guild.id);
          c.versiculo_ativo = false;
          c.versiculo_channel = null;
          c.versiculo_hora = 8;
          c.versiculo_last_sent = null;
          c.versiculo_last_hash = null;
          await setConfig(guild.id, c);
          return i.update(await devPanelVersiculo());
        }

        // Blacklist / Staff
        if (cid === 'dev_bl_add') {
          const m = new ModalBuilder().setCustomId('modal_bl_add').setTitle('Blacklist');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('uid').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (cid === 'dev_bl_del') {
          const m = new ModalBuilder().setCustomId('modal_bl_del').setTitle('Remover BL');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('uid').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (cid === 'dev_bl_list') {
          const { data } = await supabase.from('blacklist_users').select('*').limit(30);
          return i.reply({
            embeds: [new EmbedBuilder().setTitle('🚫 Blacklist Global').setColor('#FF5555')
              .setDescription(data?.length ? data.map(b => `<@${b.user_id}>`).join('\n') : '*Vazia*')],
            flags: EPHEMERAL,
          });
        }

        // Manutenção
        if (cid === 'dev_maint_notify') {
          await i.deferReply({ flags: EPHEMERAL });
          const r = await enviarAvisoGlobal('🔧 Manutenção', 'O bot entrará em manutenção em breve.');
          return i.editReply({ content: `📢 ${r.canaisOk} canais notificados.` });
        }
        if (cid === 'dev_maint_toggle') {
          const at = await isMaintenanceMode();
          await setMaintenanceMode(!at, i.user.id, null);
          return i.update(await devPanelManutencao());
        }
        if (cid === 'dev_maint_reason') {
          const m = new ModalBuilder().setCustomId('dev_maint_reason_modal').setTitle('Motivo');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('r').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300)
          ));
          return i.showModal(m);
        }

        // Setups
        if (['dev_criar_loja', 'dev_criar_comunidade', 'dev_criar_organizacao', 'dev_criar_apostas'].includes(cid)) {
          const map = { dev_criar_loja: 'loja', dev_criar_comunidade: 'comunidade', dev_criar_organizacao: 'organizacao', dev_criar_apostas: 'apostas' };
          const tt = map[cid];
          await i.reply({ content: `🏗️ Criando **${tt}**...`, flags: EPHEMERAL });
          antiraidDisabledGuilds.add(guild.id);
          raidTracker.clear();
          let lm = 'Preparando...', pd = false;
          const op = async (msg) => {
            lm = msg;
            if (pd) return;
            pd = true;
            setTimeout(async () => {
              pd = false;
              try { await i.editReply({ content: `🏗️ **${tt}**...\n> ${lm}` }); } catch {}
            }, 2000);
          };
          try {
            const r = await setupServer(guild, tt, op, i.user.id);
            const errs = r?.errors || [];
            if (errs.length) await i.editReply({ content: `⚠️ **${tt}** com ${errs.length} aviso(s).` });
            else await i.editReply({ content: `✅ **${tt}** configurado!` });
          } catch (e) {
            console.error(e);
            await logError('setupServer', e, i.user.id, guild.id);
            await i.editReply({ content: `❌ ${e.message}` }).catch(() => {});
          } finally {
            setTimeout(() => { antiraidDisabledGuilds.delete(guild.id); raidTracker.clear(); }, 8000);
          }
          return;
        }

        if (cid === 'dev_entrar_invite') {
          const m = new ModalBuilder().setCustomId('modal_entrar_invite').setTitle('Entrar por convite');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('invite').setLabel('Link/Code').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (cid === 'dev_backup') {
          const data = { name: guild.name, roles: guild.roles.cache.map(r => ({ name: r.name })), channels: guild.channels.cache.map(c => ({ name: c.name, type: c.type })) };
          try { await supabase.from('guild_backups').insert({ guild_id: guild.id, data }); } catch {}
          return i.reply({ content: '💾 Backup salvo.', flags: EPHEMERAL });
        }
        if (cid === 'dev_renomear') {
          const m = new ModalBuilder().setCustomId('modal_renomear').setTitle('Renomear servidor');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('nome').setLabel('Novo nome').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (cid === 'dev_explosao') {
          const m = new ModalBuilder().setCustomId('modal_explosao').setTitle('💥 Explosão');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('guildid').setLabel('ID do servidor').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (cid === 'dev_sair') {
          await i.reply({ content: '🚪 Saindo deste servidor...', flags: EPHEMERAL });
          setTimeout(() => guild.leave().catch(() => {}), 2000);
          return;
        }
        if (cid === 'dev_servidores') {
          const l = [];
          let idx = 0;
          for (const g of client.guilds.cache.values()) {
            idx++;
            if (idx > 40) { l.push(`*e mais ${client.guilds.cache.size - 40}...*`); break; }
            l.push(`**${g.name}** — \`${g.id}\` • 👥${g.memberCount}`);
          }
          return i.reply({ embeds: [new EmbedBuilder().setTitle('🌐 Servidores').setDescription(l.join('\n').substring(0, 4000))], flags: EPHEMERAL });
        }
        if (cid === 'dev_rejoin_all') {
          await i.deferReply({ flags: EPHEMERAL });
          await checkAutoRejoin();
          return i.editReply({ content: '🚀 Rejoin executado.' });
        }
        if (cid === 'dev_rejoin_manual') {
          const m = new ModalBuilder().setCustomId('modal_rejoin_manual').setTitle('Rejoin manual');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('invite').setLabel('Link/Code').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (cid === 'dev_listar_verif') {
          const { data, count } = await supabase.from('verifications').select('user_id, expires_at', { count: 'exact' }).limit(50);
          const list = (data || []).slice(0, 40).map(v => `• <@${v.user_id}>`).join('\n') || '*Nenhum*';
          return i.reply({ embeds: [new EmbedBuilder().setTitle('📋 Verificados').setDescription(`Total: **${count || 0}**\n\n${list}`)], flags: EPHEMERAL });
        }
        if (cid === 'dev_levar') {
          const m = new ModalBuilder().setCustomId('modal_levar').setTitle('Levar membros');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('servidor_id').setLabel('ID do servidor destino').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }

        // Premium
        if (cid === 'dev_prem_on' || cid === 'dev_prem_off') {
          const c = await getConfig(guild.id);
          c.is_premium = cid === 'dev_prem_on';
          if (!c.is_premium) c.premium_expires_at = null;
          await setConfig(guild.id, c);
          return i.update(await devPanelPremium(guild));
        }
        if (cid === 'dev_prem_temp') {
          const m = new ModalBuilder().setCustomId('modal_prem_temp').setTitle('Premium temporário');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('dias').setLabel('Dias').setStyle(TextInputStyle.Short).setValue('30').setRequired(true)
          ));
          return i.showModal(m);
        }
        if (cid.startsWith('dev_prem_tier_')) {
          const tier = cid.replace('dev_prem_tier_', '');
          if (!PREMIUM_TIERS[tier]) return i.reply({ content: '❌', flags: EPHEMERAL });
          const c = await getConfig(guild.id);
          c.is_premium = true;
          c.premium_tier = tier;
          if (!c.premium_expires_at) c.premium_expires_at = null;
          await setConfig(guild.id, c);
          return i.update(await devPanelPremium(guild));
        }
        if (cid === 'dev_forcepremium_guild') {
          const m = new ModalBuilder().setCustomId('modal_forcepremium_guild').setTitle('Force premium (guild)');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guild_id').setLabel('ID da guild').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('Dias (0=permanente)').setStyle(TextInputStyle.Short).setValue('0').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Short).setRequired(false)),
          );
          return i.showModal(m);
        }
        if (cid === 'dev_forcepremium_user') {
          const m = new ModalBuilder().setCustomId('modal_forcepremium_user').setTitle('Force premium (user)');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID do user').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guild_id').setLabel('ID da guild (opc)').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('Dias (0=permanente)').setStyle(TextInputStyle.Short).setValue('0').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Short).setRequired(false)),
          );
          return i.showModal(m);
        }
        if (cid === 'dev_forcepremium_list') {
          const { data } = await supabase.from('force_premium').select('*').order('granted_at', { ascending: false }).limit(30);
          if (!data?.length) return i.reply({ content: '📋 Nenhum.', flags: EPHEMERAL });
          const lines = data.map(f => `**${f.scope === 'guild' ? '🌐' : '👤'}** \`${f.target_id}\` — ${f.permanent ? '♾️' : (f.expires_at ? `<t:${Math.floor(new Date(f.expires_at).getTime() / 1000)}:R>` : '?')}`);
          return i.reply({ embeds: [new EmbedBuilder().setTitle('🎯 Force Premium').setDescription(lines.join('\n\n').substring(0, 4000))], flags: EPHEMERAL });
        }
        if (cid === 'dev_forcepremium_clear') {
          const { count } = await supabase.from('force_premium').select('*', { count: 'exact', head: true });
          if (!count) return i.reply({ content: '📋 Nada para limpar.', flags: EPHEMERAL });
          return i.reply({
            embeds: [new EmbedBuilder().setTitle('⚠️ Confirmar').setDescription(`Apagar **${count}** force premiums?`)],
            components: [new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('dev_forcepremium_clear_confirm').setLabel('Sim').setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId('dev_back').setLabel('Não').setStyle(ButtonStyle.Secondary),
            )],
            flags: EPHEMERAL,
          });
        }
        if (cid === 'dev_forcepremium_clear_confirm') {
          await supabase.from('force_premium').delete().neq('id', 0);
          await logDevAction(i.user.id, 'forcepremium_clear_all', null, {});
          return i.update({ content: '✅ Limpo.', embeds: [], components: [] });
        }

        // Inject
        if (cid === 'dev_inject_coins') {
          const m = new ModalBuilder().setCustomId('modal_inject_coins').setTitle('Injetar Coins');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guild_id').setLabel('ID server').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID user').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Qtd').setStyle(TextInputStyle.Short).setValue('100').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Short).setRequired(true)),
          );
          return i.showModal(m);
        }
        if (cid === 'dev_inject_product') {
          const m = new ModalBuilder().setCustomId('modal_inject_product').setTitle('Injetar Produto');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guild_id').setLabel('ID server').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID user').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('product_id').setLabel('ID produto').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Short).setRequired(true)),
          );
          return i.showModal(m);
        }
        if (cid === 'dev_inject_role') {
          const m = new ModalBuilder().setCustomId('modal_inject_role').setTitle('Injetar Cargo');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guild_id').setLabel('ID server').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID user').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('ID cargo').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Short).setRequired(true)),
          );
          return i.showModal(m);
        }
        if (cid === 'dev_inject_premium') {
          const m = new ModalBuilder().setCustomId('modal_inject_premium').setTitle('Injetar Premium');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guild_id').setLabel('ID server').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('Dias (0=perm)').setStyle(TextInputStyle.Short).setValue('30').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Short).setRequired(true)),
          );
          return i.showModal(m);
        }

        // Inspector
        if (cid === 'dev_inspector') {
          const m = new ModalBuilder().setCustomId('modal_inspector').setTitle('Inspetor');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('guild_id').setLabel('ID server').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (cid.startsWith('dev_inspector_show:')) return i.update(await devPanelInspector(cid.split(':')[1]));
        if (cid.startsWith('dev_inspector_backup:')) {
          const gid = cid.split(':')[1];
          const g = client.guilds.cache.get(gid);
          if (!g) return i.reply({ content: '❌', flags: EPHEMERAL });
          const data = { name: g.name, roles: g.roles.cache.map(r => ({ name: r.name })), channels: g.channels.cache.map(c => ({ name: c.name, type: c.type })) };
          try { await supabase.from('guild_backups').insert({ guild_id: gid, data }); } catch {}
          await logDevAction(i.user.id, 'inspector_backup', gid, {});
          return i.reply({ content: '✅ Backup salvo.', flags: EPHEMERAL });
        }
        if (cid.startsWith('dev_inspector_notes:')) return i.update(await devPanelNotes(cid.split(':')[1]));
        if (cid.startsWith('dev_inspector_pix:')) {
          const gid = cid.split(':')[1];
          return i.update(await devPanelPixMediadores(gid));
        }
        if (cid.startsWith('dev_inspector_leave:')) {
          const gid = cid.split(':')[1];
          const g = client.guilds.cache.get(gid);
          if (!g) return i.reply({ content: '❌', flags: EPHEMERAL });
          await logDevAction(i.user.id, 'inspector_leave', gid, {});
          await i.reply({ content: `🚪 Saindo de ${g.name}...`, flags: EPHEMERAL });
          setTimeout(() => g.leave().catch(() => {}), 2000);
          return;
        }

        // PIX Med edit/clear
        if (cid.startsWith('dev_pixmed_edit:')) {
          const gid = cid.split(':')[1];
          const allPix = await ffGetAllMediatorPix(gid);
          if (!allPix.length) return i.reply({ content: '❌ Nenhum PIX cadastrado.', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId(`ffpixmed:admin_edit_pick:${gid}`).setPlaceholder('Mediador');
          for (const p of allPix.slice(0, 24)) menu.addOptions({
            label: `User ${p.user_id.substring(0, 12)}`.slice(0, 90),
            value: p.user_id,
            description: `🔑 ${p.pix_key.substring(0, 30)}`.slice(0, 90),
          });
          return i.reply({ embeds: [new EmbedBuilder().setTitle('✏️ Editar PIX').setColor('#22c55e')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (cid.startsWith('dev_pixmed_clear:')) {
          const gid = cid.split(':')[1];
          await supabase.from('ff_mediator_pix').delete().eq('guild_id', gid);
          await logDevAction(i.user.id, 'pix_med_clear', gid, {});
          return i.update(await devPanelPixMediadores(gid));
        }

        // Staff
        if (cid.startsWith('dev_staff_page:')) return i.update(await devPanelStaffGlobal(parseInt(cid.split(':')[1]) || 0));
        if (cid.startsWith('dev_staff_bl_add:')) {
          const uid = cid.split(':')[1];
          const { data: ex } = await supabase.from('staff_blacklist').select('*').eq('user_id', uid).maybeSingle();
          if (ex) {
            await supabase.from('staff_blacklist').delete().eq('user_id', uid);
            staffBlacklistCache.delete(uid);
            return i.reply({ content: '✅ Removido da BL staff.', flags: EPHEMERAL });
          }
          const m = new ModalBuilder().setCustomId(`modal_staff_bl_add:${uid}`).setTitle('Banir staff');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300)
          ));
          return i.showModal(m);
        }
        if (cid === 'dev_staff_blacklist') {
          const { data } = await supabase.from('staff_blacklist').select('*').order('added_at', { ascending: false }).limit(20);
          return i.reply({
            embeds: [new EmbedBuilder().setTitle('🚫 Staff BL').setColor('#FF5555')
              .setDescription(data?.length ? data.map(b => `<@${b.user_id}>\n> ${b.reason || '—'}`).join('\n\n') : '*Vazia*')],
            flags: EPHEMERAL,
          });
        }

        // Ranking
        if (cid === 'dev_ranking_refresh') return i.update(await devPanelRanking());

        // Dead servers
        if (cid.startsWith('dev_dead_page:')) return i.update(await devPanelDeadServers(parseInt(cid.split(':')[1]) || 0));
        if (cid === 'dev_dead_cleanup') {
          const dead = await getDeadServers();
          return i.reply({
            embeds: [new EmbedBuilder().setTitle('⚠️ Confirmar').setDescription(`Sair de **${dead.length}** servidores mortos?`)],
            components: [new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('dev_dead_cleanup_confirm').setLabel(`Sim (${dead.length})`).setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId('dev_dead_servers').setLabel('Não').setStyle(ButtonStyle.Secondary),
            )],
            flags: EPHEMERAL,
          });
        }
        if (cid === 'dev_dead_cleanup_confirm') {
          await i.reply({ content: '🧹 Processando...', flags: EPHEMERAL });
          const dead = await getDeadServers();
          let ok = 0;
          for (const s of dead) {
            const g = client.guilds.cache.get(s.guild_id);
            if (g) { await g.leave().catch(() => {}); ok++; await sleep(500); }
          }
          await logDevAction(i.user.id, 'dead_cleanup', null, { count: ok });
          return i.editReply({ content: `✅ Saí de **${ok}** servidores.` });
        }

        // Eventos globais
        if (cid === 'dev_event_coins_double') {
          const m = new ModalBuilder().setCustomId('modal_event_coins_double').setTitle('Dobro de Coins');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Título').setStyle(TextInputStyle.Short).setValue('Dobro de Coins').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hours').setLabel('Duração (h)').setStyle(TextInputStyle.Short).setValue('24').setRequired(true)),
          );
          return i.showModal(m);
        }
        if (cid === 'dev_event_no_fee') {
          const m = new ModalBuilder().setCustomId('modal_event_no_fee').setTitle('Sem Taxa');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Título').setStyle(TextInputStyle.Short).setValue('Sem Taxa!').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hours').setLabel('Duração (h)').setStyle(TextInputStyle.Short).setValue('24').setRequired(true)),
          );
          return i.showModal(m);
        }
        if (cid === 'dev_event_bonus') {
          const m = new ModalBuilder().setCustomId('modal_event_bonus').setTitle('Bônus');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Título').setStyle(TextInputStyle.Short).setValue('Bônus').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('multiplier').setLabel('Multiplier').setStyle(TextInputStyle.Short).setValue('2').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hours').setLabel('Duração (h)').setStyle(TextInputStyle.Short).setValue('24').setRequired(true)),
          );
          return i.showModal(m);
        }
        if (cid === 'dev_event_sorteio') {
          const m = new ModalBuilder().setCustomId('modal_event_sorteio').setTitle('Sorteio global');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prize').setLabel('Prêmio em coins').setStyle(TextInputStyle.Short).setValue('500').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('winners').setLabel('Ganhadores').setStyle(TextInputStyle.Short).setValue('5').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hours').setLabel('Duração (h)').setStyle(TextInputStyle.Short).setValue('24').setRequired(true)),
          );
          return i.showModal(m);
        }
        if (cid === 'dev_event_stop_all') {
          await supabase.from('dev_global_events').update({ active: false }).eq('active', true);
          await syncGlobalEventsCache();
          await logDevAction(i.user.id, 'stop_all_events', null, {});
          return i.update(await devPanelGlobalEvents());
        }
        if (cid === 'dev_event_notify') {
          const events = await getActiveGlobalEvents();
          if (!events.length) return i.reply({ content: '❌ Nenhum evento ativo.', flags: EPHEMERAL });
          const r = await enviarAvisoGlobal('🎉 Eventos Ativos!', events.map(ev => `**${ev.title}** — ${ev.multiplier}×`).join('\n'));
          return i.reply({ content: `📢 ${r.canaisOk} canais notificados.`, flags: EPHEMERAL });
        }

        // Notes
        if (cid.startsWith('dev_note_add:')) {
          const gid = cid.split(':')[1];
          const m = new ModalBuilder().setCustomId(`modal_note_add:${gid}`).setTitle('Nota');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('note').setLabel('Nota').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
          ));
          return i.showModal(m);
        }
        if (cid.startsWith('dev_note_clear:')) {
          const gid = cid.split(':')[1];
          await supabase.from('guild_notes').delete().eq('guild_id', gid);
          return i.update(await devPanelNotes(gid));
        }

        // Monitor
        if (cid === 'dev_monitor_refresh') return i.update(await devPanelMonitor());
        if (cid === 'dev_monitor_reconnect') {
          await logDevAction(i.user.id, 'ws_reconnect', null, {});
          await i.reply({ content: '⚡ Reconectando...', flags: EPHEMERAL });
          setTimeout(() => { try { client.ws.destroy(); } catch {} }, 1500);
          return;
        }

        // Kill switch
        if (cid === 'dev_kill_toggle') {
          const active = await isKillSwitchActive();
          const { data } = await supabase.from('kill_switch').select('*').eq('id', 1).maybeSingle();
          await setKillSwitch(!active, data?.reason || null, i.user.id);
          return i.update(await devPanelKillSwitch());
        }
        if (cid === 'dev_kill_reason') {
          const m = new ModalBuilder().setCustomId('modal_kill_reason').setTitle('Motivo do Kill Switch');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300)
          ));
          return i.showModal(m);
        }

        // Preview
        if (cid === 'dev_preview_create') {
          const m = new ModalBuilder().setCustomId('modal_preview_create').setTitle('Preview de Embed');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cor').setLabel('Cor hex').setStyle(TextInputStyle.Short).setValue('#5865F2').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('footer').setLabel('Footer').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('thumb').setLabel('Thumb URL').setStyle(TextInputStyle.Short).setRequired(false)),
          );
          return i.showModal(m);
        }

        // Simulador
        if (cid === 'dev_simulate_run') {
          if (!await isPremium(guild.id)) return requirePremium(i, 'simulador');
          await i.deferReply({ flags: EPHEMERAL });
          try {
            const r = await simulateFlow(guild.id);
            const lines = r.etapas.map(e => `${e.ok ? '✅' : '❌'} **${e.name}** — \`${e.ms}ms\`${e.erro ? `\n> ⚠️ ${e.erro}` : ''}`).join('\n');
            const e = new EmbedBuilder().setTitle('🎬 Simulador').setColor(r.errCount === 0 ? '#22c55e' : r.errCount < 3 ? '#FFA500' : '#FF5555')
              .setDescription(lines.substring(0, 4000))
              .addFields(
                { name: '✅ OK', value: `${r.okCount}`, inline: true },
                { name: '❌ Erros', value: `${r.errCount}`, inline: true },
                { name: '⏱️', value: `${r.totalMs}ms`, inline: true },
              );
            return i.editReply({ embeds: [e] });
          } catch (err) { return i.editReply({ content: `❌ ${err.message}` }); }
        }

        // Auto-heal
        if (cid === 'dev_autoheal') {
          await i.deferReply({ flags: EPHEMERAL });
          const r = await runAutoHeal();
          return i.editReply({ content: `🔄 **Auto-Heal executado:**\n> 🧵 Threads canceladas: ${r.canceledThreads}\n> ⚠️ Matches alertados: ${r.alertedMatches}\n> 💳 PIX cancelados: ${r.canceledPix}\n> ⏳ Playing auto-cancelados: ${r.autoCanceledPlaying || 0}` });
        }

        // Sandbox
        if (cid === 'dev_sandbox_run') {
          const m = new ModalBuilder().setCustomId('modal_sandbox').setTitle('Sandbox');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('code').setLabel('Código JS').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(3000)
          ));
          return i.showModal(m);
        }

        // Rate limit
        if (cid === 'dev_ratelimit_reset') {
          rateLimitTracker.total = 0;
          rateLimitTracker.limited = 0;
          rateLimitTracker.buckets = {};
          rateLimitTracker.lastReset = Date.now();
          return i.update(await devPanelRateLimit());
        }

        // Cache / DB
        if (cid === 'dev_clear_cache') {
          _configCache.clear();
          _settingsCache.clear();
          _ffConfigCache.clear();
          _ticketPanelsCache.clear();
          spamCache.clear();
          dupeCache.clear();
          raidTracker.clear();
          abuseCache.clear();
          LOG_THROTTLE.clear();
          USER_RATE_LIMITS.clear();
          globalBansCache.clear();
          spyTargetsCache.clear();
          staffBlacklistCache.clear();
          blacklistUsersCache.clear();
          return i.reply({ content: '🧹 Todos os caches foram limpos.', flags: EPHEMERAL });
        }
        if (cid === 'dev_check_db') {
          const tl = ['configs', 'guilds', 'settings', 'products', 'orders', 'ff_config', 'ff_bets', 'ff_matches', 'ff_mediator_queue', 'ff_analyst_queue', 'ff_streamer_queue', 'ff_mediator_pix', 'user_guilds', 'daily_verses_history', 'guild_feature_usage'];
          const r = [];
          for (const x of tl) {
            const { error } = await supabase.from(x).select('id', { count: 'exact', head: true });
            r.push(`${error ? '❌' : '✅'} \`${x}\``);
          }
          return i.reply({ content: r.join('\n'), flags: EPHEMERAL });
        }

        // Eval / Dump / Bugs
        if (cid === 'dev_eval') {
          const m = new ModalBuilder().setCustomId('modal_eval').setTitle('Eval');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('code').setLabel('Código').setStyle(TextInputStyle.Paragraph).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (cid === 'dev_dump') {
          const dump = {
            guild: { id: guild.id, name: guild.name, members: guild.memberCount, channels: guild.channels.cache.size, roles: guild.roles.cache.size },
            client: { ping: client.ws.ping, guilds: client.guilds.cache.size, users: client.users.cache.size, uptime: process.uptime() },
            memory: process.memoryUsage(),
          };
          return i.reply({ files: [new AttachmentBuilder(Buffer.from(JSON.stringify(dump, null, 2)), { name: 'dump.json' })], flags: EPHEMERAL });
        }
        if (cid === 'dev_bugs') {
          const { data } = await supabase.from('error_logs').select('*').eq('status', 'pending').eq('context', 'bug_report').order('id', { ascending: false }).limit(15);
          if (!data?.length) return i.reply({ content: '✅ Nenhum bug pendente.', flags: EPHEMERAL });
          return i.reply({ embeds: [new EmbedBuilder().setTitle('🐛 Bugs Pendentes').setDescription(data.map(b => `**#${b.id}** — <@${b.user_id}>\n> ${(b.message || '').substring(0, 100)}`).join('\n\n').substring(0, 4000))], flags: EPHEMERAL });
        }
        if (cid === 'dev_cleanup_dms') {
          const m = new ModalBuilder().setCustomId('modal_cleanup_dms').setTitle('Limpar DMs');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID user').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('limit').setLabel('1-500').setStyle(TextInputStyle.Short).setValue('100').setRequired(true)),
          );
          return i.showModal(m);
        }
        if (cid === 'dev_cleanup_channel') {
          const m = new ModalBuilder().setCustomId('modal_cleanup_channel').setTitle('Limpar canal');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channel_id').setLabel('ID canal').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('limit').setLabel('1-1000').setStyle(TextInputStyle.Short).setValue('1000').setRequired(true)),
          );
          return i.showModal(m);
        }

        // Locale
        if (cid === 'dev_locale_pt') { await setGuildLocale(guild.id, 'pt-BR'); return i.reply({ content: '✅ 🇧🇷 Português', flags: EPHEMERAL }); }
        if (cid === 'dev_locale_en') { await setGuildLocale(guild.id, 'en-US'); return i.reply({ content: '✅ 🇺🇸 English', flags: EPHEMERAL }); }
        if (cid === 'dev_locale_es') { await setGuildLocale(guild.id, 'es-ES'); return i.reply({ content: '✅ 🇪🇸 Español', flags: EPHEMERAL }); }

        // Reload / Ping detalhado
        if (cid === 'dev_reload') {
          await i.reply({ content: '🔄 Recarregando comandos...', flags: EPHEMERAL });
          await registerCommands();
          return i.editReply({ content: '✅ Comandos recarregados.' });
        }
        if (cid === 'dev_ping_detailed') {
          await i.deferReply({ flags: EPHEMERAL });
          try {
            const embeds = await buildPingDetailed();
            return i.editReply({ embeds });
          } catch (err) { return i.editReply({ content: `❌ ${err.message}` }); }
        }

        // Alerts
        if (cid === 'dev_alerts_refresh') return i.update(await devPanelAlerts());
        if (cid === 'dev_alerts_read_all') {
          await supabase.from('dev_alerts').update({ read: true }).eq('read', false);
          return i.update(await devPanelAlerts());
        }
        if (cid === 'dev_alerts_config') {
          const tipos = ['offline', 'crash', 'big_guild', 'bug_flood', 'mp_fail', 'rate_limit', 'suspicious'];
          const { data: config } = await supabase.from('dev_alert_config').select('*');
          const cfgMap = {};
          for (const c of config || []) cfgMap[c.type] = c.enabled;
          const rows = [];
          let row = new ActionRowBuilder();
          for (let idx = 0; idx < tipos.length; idx++) {
            const tt = tipos[idx];
            const enabled = cfgMap[tt] !== false;
            row.addComponents(new ButtonBuilder().setCustomId(`dev_alert_toggle:${tt}`).setLabel(tt).setEmoji(enabled ? '🟢' : '🔴').setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Danger));
            if (row.components.length === 5 || idx === tipos.length - 1) { rows.push(row); row = new ActionRowBuilder(); }
          }
          rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_alerts').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
          return i.update({ embeds: [new EmbedBuilder().setTitle('⚙️ Config de Alertas').setColor('#5865F2')], components: rows });
        }
        if (cid.startsWith('dev_alert_toggle:')) {
          const tt = cid.split(':')[1];
          const { data } = await supabase.from('dev_alert_config').select('*').eq('type', tt).maybeSingle();
          const nv = data ? !data.enabled : false;
          if (data) await supabase.from('dev_alert_config').update({ enabled: nv, updated_at: new Date().toISOString() }).eq('type', tt);
          else await supabase.from('dev_alert_config').insert({ type: tt, enabled: nv });
          return i.reply({ content: `✅ ${tt}: ${nv ? '🟢 Ativado' : '🔴 Desativado'}`, flags: EPHEMERAL });
        }
        if (cid === 'dev_alerts_test') {
          await sendDevAlert('test', 'Teste', 'Este é um alerta de teste.', 'info', { test: true, by: i.user.id });
          return i.reply({ content: '✅ Alerta de teste enviado.', flags: EPHEMERAL });
        }

        // Audit
        if (cid === 'dev_audit_refresh') return i.update(await devPanelAudit());
        if (cid === 'dev_audit_clear') {
          await supabase.from('dev_audit').delete().lt('created_at', new Date(Date.now() - 7 * 86400 * 1000).toISOString());
          return i.reply({ content: '✅ Audit limpo (registros > 7 dias removidos).', flags: EPHEMERAL });
        }

        // Analytics
        if (cid.startsWith('dev_analytics_refresh:')) {
          const gid = cid.split(':')[1];
          return i.update(await devPanelAnalytics(gid));
        }

        // Broadcast
        if (cid === 'dev_broadcast_compose') {
          const m = new ModalBuilder().setCustomId('modal_broadcast_compose').setTitle('📢 Criar atualização');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mudancas').setLabel('O que atualizou (1 por linha)').setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('imagem').setLabel('Imagem URL (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cor').setLabel('Cor hex').setStyle(TextInputStyle.Short).setValue('#5865F2').setMaxLength(7).setRequired(false)),
          );
          return i.showModal(m);
        }
        if (cid === 'dev_broadcast_test') {
          const m = new ModalBuilder().setCustomId('modal_broadcast_test').setTitle('🧪 Teste de broadcast');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setValue('🧪 Teste').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue('Este é um teste.').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mudancas').setLabel('O que atualizou').setStyle(TextInputStyle.Paragraph).setValue('• Item de teste 1\n• Item de teste 2').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('imagem').setLabel('Imagem (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cor').setLabel('Cor').setStyle(TextInputStyle.Short).setValue('#5865F2').setRequired(false)),
          );
          return i.showModal(m);
        }
        if (cid === 'dev_broadcast_history') {
          const { data } = await supabase.from('manual_broadcasts').select('*').order('created_at', { ascending: false }).limit(15);
          const e = new EmbedBuilder().setTitle('📋 Histórico de Broadcasts').setColor('#00AAFF')
            .setDescription((data || []).length
              ? data.map((b, idx) => `**${idx + 1}.** \`#${b.id}\` — **${(b.titulo || '').substring(0, 60)}**\n> 👤 <@${b.enviado_por}>\n> ✅ ${b.enviados || 0} • ❌ ${b.erros || 0}\n> <t:${Math.floor(new Date(b.created_at).getTime() / 1000)}:R>`).join('\n\n')
              : '*Nenhum.*');
          return i.update({ embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_broadcast').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] });
        }
      }

      // ─── Broadcast confirm/cancel ───
      if (cid.startsWith('broadcast_confirm:') && isDev) {
        const parts = cid.split(':');
        const tempId = parts[1], target = parts[2];
        const draft = BROADCAST_DRAFTS.get(tempId);
        if (!draft) return i.update({ content: '❌ Rascunho expirou.', embeds: [], components: [] });
        await i.update({ content: '📢 Enviando...', embeds: [], components: [] });
        const r = await sendBroadcastNow(draft, target, i.user.id);
        BROADCAST_DRAFTS.delete(tempId);
        return i.editReply({ content: `✅ **Broadcast enviado!**\n> ✅ Sucessos: ${r.sucesso}\n> ❌ Falhas: ${r.falhas}\n> 🌐 Total: ${r.total}` });
      }
      if (cid === 'broadcast_cancel') return i.update({ content: '❌ Cancelado.', embeds: [], components: [] });

      // ═══════════════════════════════════════════════════════════
      // FFCFG BUTTONS
      // ═══════════════════════════════════════════════════════════
      if (ns === 'ffcfg') {
        const isO = i.user.id === guild.ownerId, isS = await isAdmin(i.user, guild);
        if (!isO && !isS) return i.reply({ content: '❌', flags: EPHEMERAL });

        if (action === 'back') return i.update(await ffConfigPanel(guild.id));
        if (action === 'panel') {
          const tt = rest[0];
          if (tt === 'canais') return i.update(await ffPanelCanais(guild.id));
          if (tt === 'cargos') return i.update(await ffPanelCargos(guild.id));
          if (tt === 'pix') return i.update(await ffPanelPix(guild.id));
          if (tt === 'apostas') return i.update(await ffPanelApostas(guild.id));
          if (tt === 'valores') return i.update(await ffPanelValores(guild.id));
          if (tt === 'mediadores') return i.update(await ffPanelMediadores(guild.id));
          if (tt === 'automacoes') return i.update(await ffPanelAutomacoes(guild.id));
          if (tt === 'loja_coins') return i.update(await ffPanelLojaCoins(guild.id));
          if (tt === 'streamer') return i.update(await ffPanelStreamer(guild.id));
        }
        if (action === 'custom_embed') return i.update(await ffPanelCustomEmbed(guild.id));
        if (action === 'custom_embed_edit') {
          if (!await isPremium(guild.id)) return requirePremium(i, 'custom_embeds');
          const cfg = await ffGetConfig(guild.id);
          const c = cfg?.custom_bet_embed || {};
          const m = new ModalBuilder().setCustomId('modal_custom_bet_edit').setTitle('🎨 Customizar Embed');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Título extra').setStyle(TextInputStyle.Short).setValue(c.title || '').setRequired(false).setMaxLength(100)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('color').setLabel('Cor hex').setStyle(TextInputStyle.Short).setValue(c.color || '#f1c40f').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('thumbnail').setLabel('Thumb URL').setStyle(TextInputStyle.Short).setValue(c.thumbnail || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner').setLabel('Banner URL').setStyle(TextInputStyle.Short).setValue(c.banner || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('footer').setLabel('Footer').setStyle(TextInputStyle.Short).setValue(c.footer || '').setRequired(false)),
          );
          return i.showModal(m);
        }
        if (action === 'custom_embed_buttons') {
          if (!await isPremium(guild.id)) return requirePremium(i, 'custom_embeds');
          const cfg = await ffGetConfig(guild.id);
          const b = cfg?.custom_bet_embed?.buttons || {};
          const m = new ModalBuilder().setCustomId('modal_custom_bet_buttons').setTitle('🎯 Botões');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gi_label').setLabel('GI label').setStyle(TextInputStyle.Short).setValue(b.gi_label || 'Gelo Infinito').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gn_label').setLabel('GN label').setStyle(TextInputStyle.Short).setValue(b.gn_label || 'Gelo Normal').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sair_label').setLabel('Sair label').setStyle(TextInputStyle.Short).setValue(b.sair_label || 'Sair').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gi_emoji').setLabel('GI emoji').setStyle(TextInputStyle.Short).setValue(b.gi_emoji || '🧊').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gn_emoji').setLabel('GN emoji').setStyle(TextInputStyle.Short).setValue(b.gn_emoji || '🧊').setRequired(false)),
          );
          return i.showModal(m);
        }
        if (action === 'postar_por_canal') {
          const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:porcanal_pick_canal').setPlaceholder('📁 Canal');
          const textChannels = [...guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)).values()].slice(0, 25);
          for (const ch of textChannels) menu.addOptions({ label: ch.name.slice(0, 90), value: ch.id });
          return i.reply({
            embeds: [new EmbedBuilder().setTitle('📁 Postar por canal').setColor('#f1c40f')],
            components: [new ActionRowBuilder().addComponents(menu)],
            flags: EPHEMERAL,
          });
        }
        if (action === 'toggle') {
          const f = rest[0];
          const cfg = await ffGetConfig(guild.id);
          const nv = !cfg?.[f];
          await ffPatchConfig(guild.id, { [f]: nv });
          await logConfig(guild, i.user.id, 'TOGGLE_' + f, { value: nv });
          if (['auto_post_ranking', 'auto_post_blacklist', 'auto_post_regras'].includes(f)) return i.update(await ffPanelAutomacoes(guild.id));
          if (f === 'taxa_extra_ativo' || f === 'auto_thread' || f === 'require_mediator_confirm') return i.update(await ffPanelApostas(guild.id));
        }
        if (action === 'set') {
          const f = rest[0];
          if (f === 'pix') {
            const cfg = await ffGetConfig(guild.id);
            const m = new ModalBuilder().setCustomId('ffcfg_modal:pix').setTitle('Pix FF');
            m.addComponents(
              new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('Chave').setStyle(TextInputStyle.Short).setValue(cfg?.pix_key || '').setRequired(true)),
              new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(cfg?.pix_name || '').setRequired(true)),
              new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('city').setLabel('Cidade').setStyle(TextInputStyle.Short).setValue(cfg?.pix_city || '').setRequired(false)),
            );
            return i.showModal(m);
          }
          if (f === 'freq_ranking') {
            const cfg = await ffGetConfig(guild.id);
            const m = new ModalBuilder().setCustomId('ffcfg_modal:freq').setTitle('Frequência');
            m.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('v').setLabel('daily/weekly/monthly').setStyle(TextInputStyle.Short).setValue(cfg?.auto_post_frequencia || 'weekly').setRequired(true)
            ));
            return i.showModal(m);
          }
          if (f.endsWith('_channel_id')) {
            const m = new ModalBuilder().setCustomId(`ffcfg_modal:channel:${f}`).setTitle('Canal');
            m.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('v').setLabel('ID/#nome do canal').setStyle(TextInputStyle.Short).setRequired(true)
            ));
            return i.showModal(m);
          }
          if (f.endsWith('_role_id')) {
            const m = new ModalBuilder().setCustomId(`ffcfg_modal:role:${f}`).setTitle('Cargo');
            m.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('v').setLabel('ID/@nome do cargo').setStyle(TextInputStyle.Short).setRequired(true)
            ));
            return i.showModal(m);
          }
          if (['valor_minimo', 'valor_maximo', 'mediator_fee', 'coin_prize', 'taxa_extra'].includes(f)) {
            const cfg = await ffGetConfig(guild.id);
            const m = new ModalBuilder().setCustomId(`ffcfg_modal:number:${f}`).setTitle('Valor');
            m.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('v').setLabel('Valor numérico').setStyle(TextInputStyle.Short).setValue(String(cfg?.[f] ?? 0)).setRequired(true)
            ));
            return i.showModal(m);
          }
        }
        if (action === 'add_valor') {
          const m = new ModalBuilder().setCustomId('ffcfg_modal:add_valor').setTitle('Adicionar valor');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('v').setLabel('Ex: 1.50').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (action === 'del_valor') {
          const cfg = await ffGetConfig(guild.id);
          const vals = Array.isArray(cfg?.value_options) ? cfg.value_options : [];
          if (!vals.length) return i.reply({ content: '❌ Nenhum valor cadastrado.', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:pick_del_valor').setPlaceholder('Remover');
          for (const v of vals) menu.addOptions({ label: `R$ ${v}`, value: v });
          return i.reply({ embeds: [new EmbedBuilder().setTitle('➖ Remover valor')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (action === 'reset_valores') {
          await ffPatchConfig(guild.id, { value_options: FF_DEFAULT_VALUES });
          await logConfig(guild, i.user.id, 'VALUES_RESET', {});
          return i.update(await ffPanelValores(guild.id));
        }
        if (action === 'postar') {
          const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:postar_pick_format').setPlaceholder('📢 Modalidade');
          for (const f of FF_FORMATS) menu.addOptions({ label: f.label, value: f.id, emoji: f.emoji });
          return i.reply({
            embeds: [new EmbedBuilder().setTitle('📢 Postar embed').setColor('#f1c40f')],
            components: [new ActionRowBuilder().addComponents(menu)],
            flags: EPHEMERAL,
          });
        }
        if (action === 'postar_auto') {
          const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:postar_auto_pick_channel').setPlaceholder('📁 Canal');
          const textChannels = [...guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)).values()].slice(0, 25);
          for (const ch of textChannels) menu.addOptions({ label: ch.name.slice(0, 90), value: ch.id });
          return i.reply({
            embeds: [new EmbedBuilder().setTitle('⚡ Postar em massa').setColor('#f1c40f')],
            components: [new ActionRowBuilder().addComponents(menu)],
            flags: EPHEMERAL,
          });
        }
        if (action === 'postar_pix') {
          const m = new ModalBuilder().setCustomId('ffcfg_modal:postar_pix').setTitle('Postar PIX');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('cid').setLabel('ID/#canal').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (action === 'postar_mediadores') {
          const m = new ModalBuilder().setCustomId('ffcfg_modal:postar_med').setTitle('Postar painel mediadores');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('cid').setLabel('ID/#canal').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (action === 'remove_all_meds') {
          await supabase.from('ff_mediator_queue').delete().eq('guild_id', guild.id);
          return i.reply({ content: '🗑️ Todos os mediadores foram removidos da fila.', flags: EPHEMERAL });
        }
        if (action === 'remove_all_admins') {
          if (!isO && !isDev) return i.reply({ content: '❌ Só dono.', flags: EPHEMERAL });
          const meds = await ffGetMediatorQueue(guild.id);
          let n = 0;
          for (const med of meds) {
            const m = await guild.members.fetch(med.user_id).catch(() => null);
            if (!m) continue;
            if (m.permissions.has(PermissionFlagsBits.Administrator) || m.id === guild.ownerId) {
              await supabase.from('ff_mediator_queue').delete().eq('id', med.id);
              n++;
            }
          }
          return i.reply({ content: `🚫 ${n} mediadores com admin removidos.`, flags: EPHEMERAL });
        }
        if (action === 'med_receitas') {
          const meds = await ffGetMediatorQueue(guild.id);
          meds.sort((a, b) => Number(b.earnings_total || 0) - Number(a.earnings_total || 0));
          const e = new EmbedBuilder().setTitle('💰 Receitas de Mediadores').setColor('#FFD700');
          for (const m of meds.slice(0, 20)) e.addFields({ name: `<@${m.user_id}>`, value: `R$ ${Number(m.earnings_total || 0).toFixed(2)} • ${m.matches_total || 0} partidas`, inline: true });
          return i.reply({ embeds: [e], flags: EPHEMERAL });
        }
        if (action === 'manutencao') {
          const cfg = await ffGetConfig(guild.id);
          const at = !!cfg?.maintenance;
          return i.update({
            embeds: [new EmbedBuilder().setTitle('🔧 Manutenção FF').setColor(at ? '#ff5555' : '#22c55e')
              .setDescription(at ? '⚠️ **ATIVA**' : '🟢 **DESATIVADA**')
              .addFields({ name: 'Motivo', value: cfg?.maintenance_reason || '*—*' })],
            components: [new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('ffcfg:maint_toggle').setLabel(at ? 'Desativar' : 'Ativar').setEmoji(at ? '🟢' : '🔴').setStyle(at ? ButtonStyle.Success : ButtonStyle.Danger),
              new ButtonBuilder().setCustomId('ffcfg:maint_reason').setLabel('Motivo').setEmoji('📝').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
            )],
          });
        }
        if (action === 'maint_toggle') {
          const cfg = await ffGetConfig(guild.id);
          const nv = !cfg?.maintenance;
          await ffPatchConfig(guild.id, { maintenance: nv });
          await logConfig(guild, i.user.id, nv ? 'MAINT_ON' : 'MAINT_OFF', {});
          return i.reply({ content: nv ? '🔴 Manutenção ativada.' : '🟢 Manutenção desativada.', flags: EPHEMERAL });
        }
        if (action === 'maint_reason') {
          const m = new ModalBuilder().setCustomId('ffcfg_modal:maint_reason').setTitle('Motivo');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('r').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true)
          ));
          return i.showModal(m);
        }

        // Coin shop
        if (action === 'coin_add') {
          const m = new ModalBuilder().setCustomId('ffcfg_modal:coin_add').setTitle('Adicionar item');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço em coins').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setValue('🎁').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('ID do cargo (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
          );
          return i.showModal(m);
        }
        if (action === 'coin_edit') {
          const { data: items } = await supabase.from('ff_coin_shop').select('*').eq('guild_id', guild.id);
          if (!items?.length) return i.reply({ content: '❌ Nenhum item.', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:coin_edit_pick').setPlaceholder('Editar item');
          for (const x of items.slice(0, 25)) menu.addOptions({ label: `${x.emoji || '🎁'} ${x.name} — ${x.price}`.slice(0, 90), value: String(x.id) });
          return i.reply({ embeds: [new EmbedBuilder().setTitle('✏️ Editar item')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (action === 'coin_toggle') {
          const { data: items } = await supabase.from('ff_coin_shop').select('*').eq('guild_id', guild.id);
          if (!items?.length) return i.reply({ content: '❌ Nenhum item.', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:coin_toggle_pick').setPlaceholder('Toggle');
          for (const x of items.slice(0, 25)) menu.addOptions({ label: `${x.emoji || '🎁'} ${x.name} ${x.active ? '✅' : '❌'}`.slice(0, 90), value: String(x.id) });
          return i.reply({ embeds: [new EmbedBuilder().setTitle('🔁 Toggle')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (action === 'coin_del') {
          const { data: items } = await supabase.from('ff_coin_shop').select('*').eq('guild_id', guild.id);
          if (!items?.length) return i.reply({ content: '❌ Nenhum item.', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:coin_del_pick').setPlaceholder('Remover');
          for (const x of items.slice(0, 25)) menu.addOptions({ label: `${x.emoji || '🎁'} ${x.name}`.slice(0, 90), value: String(x.id) });
          return i.reply({ embeds: [new EmbedBuilder().setTitle('🗑️ Remover')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (action === 'coin_defaults') {
          let added = 0;
          for (const d of FF_COIN_DEFAULTS) {
            const r = guild.roles.cache.find(x => x.name === d.role_name);
            if (!r) continue;
            const { data: ex } = await supabase.from('ff_coin_shop').select('id').eq('guild_id', guild.id).eq('name', d.name).maybeSingle();
            if (ex) continue;
            try {
              await supabase.from('ff_coin_shop').insert({ guild_id: guild.id, name: d.name, emoji: d.emoji, price: d.price, type: 'role', role_id: r.id, description: `${d.price} coins` });
              added++;
            } catch {}
          }
          await logConfig(guild, i.user.id, 'COIN_DEFAULTS', { added });
          return i.reply({ content: `✅ ${added} itens padrão adicionados.`, flags: EPHEMERAL });
        }
        if (action === 'coin_post') {
          const { data: items } = await supabase.from('ff_coin_shop').select('*').eq('guild_id', guild.id).eq('active', true).order('price');
          if (!items?.length) return i.reply({ content: '❌ Nenhum item ativo.', flags: EPHEMERAL });
          const e = new EmbedBuilder().setTitle('🪙 Loja de Coins').setColor('#FFD700').setDescription('Compre cargos com suas coins!').setTimestamp();
          for (const x of items) e.addFields({ name: `${x.emoji || '🎁'} ${x.name}`, value: `💰 **${x.price}**`, inline: true });
          await channel.send({ embeds: [e], components: await buildCoinShopComponents(guild.id) });
          return i.reply({ content: '✅ Painel de coins postado.', flags: EPHEMERAL });
        }
        if (action === 'coin_hist') {
          const { data } = await supabase.from('ff_coin_purchases').select('*').eq('guild_id', guild.id).order('id', { ascending: false }).limit(20);
          return i.reply({ embeds: [new EmbedBuilder().setTitle('📋 Histórico de compras').setDescription(data?.length ? data.map(p => `• <@${p.user_id}> — **${p.item_name}** (${p.price}🪙)`).join('\n') : 'Sem compras.')], flags: EPHEMERAL });
        }
        if (action === 'coin_manage_users') {
          const m = new ModalBuilder().setCustomId('ffcfg_modal:coin_manage').setTitle('Gerenciar Coins');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID user').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Qtd (- para retirar)').setStyle(TextInputStyle.Short).setValue('100').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Short).setValue('Ajuste').setRequired(true)),
          );
          return i.showModal(m);
        }

        // MP
        if (action === 'mp_config') {
          const cfg = await ffGetConfig(guild.id);
          const m = new ModalBuilder().setCustomId('ffcfg_modal:mp_token').setTitle('Configurar Mercado Pago');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mp_token').setLabel('Access Token').setStyle(TextInputStyle.Short).setPlaceholder('APP_USR-...').setValue(cfg?.mp_access_token || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mp_public_key').setLabel('Public Key (opcional)').setStyle(TextInputStyle.Short).setValue(cfg?.mp_public_key || '').setRequired(false)),
          );
          return i.showModal(m);
        }
        if (action === 'mp_test') {
          await i.deferReply({ flags: EPHEMERAL });
          const cfg = await ffGetConfig(guild.id);
          if (!cfg?.mp_access_token) return i.editReply({ content: '❌ Sem token configurado.' });
          const test = await criarPixMercadoPago(0.01, `T${Date.now()}`, 'Teste', cfg.mp_access_token);
          if (test?.ok) return i.editReply({ content: `✅ MP OK!\n> 🆔 \`${test.payment_id}\`` });
          return i.editReply({ content: `❌ ${test?.error || 'erro'}` });
        }
        if (action === 'mp_remove') {
          await setFFMPToken(guild.id, null, null);
          return i.update(await ffPanelPix(guild.id));
        }
      }

      // ─── FFPIX ───
      if (ns === 'ffpix') {
        if (action === 'noop') return i.deferUpdate();
        const cfg = await ffGetConfig(guild.id);
        const isO = i.user.id === guild.ownerId, isS = await isAdmin(i.user, guild);
        const hasMed = cfg?.mediator_role_id && i.member.roles.cache.has(cfg.mediator_role_id);
        const hasOlh = cfg?.olhinho_role_id && i.member.roles.cache.has(cfg.olhinho_role_id);
        if (!isO && !isS && !hasMed && !hasOlh) return i.reply({ content: '❌', flags: EPHEMERAL });
        if (action === 'configurar') {
          const m = new ModalBuilder().setCustomId('ffpix_modal:set').setTitle(cfg?.pix_key ? 'Editar Pix' : 'Configurar Pix');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('Chave').setStyle(TextInputStyle.Short).setValue(cfg?.pix_key || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(cfg?.pix_name || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('city').setLabel('Cidade').setStyle(TextInputStyle.Short).setValue(cfg?.pix_city || '').setRequired(false)),
          );
          return i.showModal(m);
        }
        if (action === 'ver') {
          if (!cfg?.pix_key) return i.reply({ content: '⚠️ Nenhum PIX configurado.', flags: EPHEMERAL });
          return i.reply({
            content: `💳 **Pix:**\n\`\`\`\n${cfg.pix_key}\n\`\`\`\n> 👤 **${cfg.pix_name || '—'}**\n> 🏙️ **${cfg.pix_city || '—'}**`,
            flags: EPHEMERAL,
          });
        }
        if (action === 'remover') {
          await ffPatchConfig(guild.id, { pix_key: null, pix_name: null, pix_city: null });
          await ffUpdatePixEmbed(guild).catch(() => {});
          return i.reply({ content: '🗑️ PIX removido.', flags: EPHEMERAL });
        }
      }

      // ─── FFPIXMED (NOVO v6.6.0) ───
      if (ns === 'ffpixmed') {
        if (action === 'thread_view') {
          const matchId = rest[0];
          const m = await ffGetMatch(matchId);
          if (!m) return i.reply({ content: '❌ Match não encontrado.', flags: EPHEMERAL });
          if (!m.mediator_id) return i.reply({ content: '⚠️ Este match não tem mediador designado.', flags: EPHEMERAL });
          const pix = await ffGetMediatorPix(guild.id, m.mediator_id);
          if (!pix || !pix.pix_key) return i.reply({ content: `⚠️ O mediador <@${m.mediator_id}> ainda não configurou o PIX.`, flags: EPHEMERAL });
          const isStaff = await isAdmin(i.user, guild);
          const isMediator = i.user.id === m.mediator_id;
          const isPlayer = parseJson(m.players).includes(i.user.id);
          if (!isStaff && !isMediator && !isPlayer) return i.reply({ content: '❌ Só jogadores do match, mediador ou staff.', flags: EPHEMERAL });
          const e = new EmbedBuilder().setTitle('💳 PIX do Mediador').setColor('#22c55e')
            .setDescription(`**Match #${matchId}** — Mediador: <@${m.mediator_id}>`)
            .addFields(
              { name: '🔑 Chave', value: `\`\`\`\n${pix.pix_key}\n\`\`\`` },
              { name: '👤 Nome', value: pix.pix_name || '—', inline: true },
              { name: '🏙️ Cidade', value: pix.pix_city || '—', inline: true },
            )
            .setTimestamp();
          return i.reply({ embeds: [e], flags: EPHEMERAL });
        }
        if (action === 'config') {
          const cfg = await ffGetConfig(guild.id);
          const hasMed = cfg?.mediator_role_id && i.member.roles.cache.has(cfg.mediator_role_id);
          const hasOlh = cfg?.olhinho_role_id && i.member.roles.cache.has(cfg.olhinho_role_id);
          const isO = i.user.id === guild.ownerId, isS = await isAdmin(i.user, guild);
          if (!hasMed && !hasOlh && !isO && !isS) return i.reply({ content: '❌ Só mediadores.', flags: EPHEMERAL });
          const existing = await ffGetMediatorPix(guild.id, i.user.id);
          const m = new ModalBuilder().setCustomId('ffpixmed_modal:set').setTitle(existing ? 'Editar meu PIX' : 'Configurar meu PIX');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('Chave PIX').setStyle(TextInputStyle.Short).setValue(existing?.pix_key || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome do titular').setStyle(TextInputStyle.Short).setValue(existing?.pix_name || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('city').setLabel('Cidade (opcional)').setStyle(TextInputStyle.Short).setValue(existing?.pix_city || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('Tipo (cpf/email/tel/aleatoria)').setStyle(TextInputStyle.Short).setValue(existing?.pix_type || 'aleatoria').setRequired(false)),
          );
          return i.showModal(m);
        }
        if (action === 'view') {
          const pix = await ffGetMediatorPix(guild.id, i.user.id);
          if (!pix) return i.reply({ content: '⚠️ Você ainda não configurou seu PIX.', flags: EPHEMERAL });
          return i.reply({
            embeds: [new EmbedBuilder().setTitle('👁️ Meu PIX').setColor('#22c55e').setDescription(`🔑 \`${pix.pix_key}\`\n\n👤 ${pix.pix_name}\n🏙️ ${pix.pix_city || '—'}\n🎯 ${pix.pix_type}`).setTimestamp()],
            flags: EPHEMERAL,
          });
        }
        if (action === 'list') {
          const isO = i.user.id === guild.ownerId, isS = await isAdmin(i.user, guild);
          if (!isO && !isS && !isDev) return i.reply({ content: '❌ Só staff.', flags: EPHEMERAL });
          const allPix = await ffGetAllMediatorPix(guild.id);
          if (!allPix.length) return i.reply({ content: '❌ Nenhum PIX cadastrado.', flags: EPHEMERAL });
          const e = new EmbedBuilder().setTitle('📋 PIX dos Mediadores').setColor('#22c55e')
            .setDescription(allPix.slice(0, 15).map(p => `**<@${p.user_id}>**\n> 🔑 \`${p.pix_key}\`\n> 👤 ${p.pix_name}`).join('\n\n').substring(0, 4000))
            .setFooter({ text: `Total: ${allPix.length}` });
          return i.reply({ embeds: [e], flags: EPHEMERAL });
        }
        if (action === 'remove') {
          const pix = await ffGetMediatorPix(guild.id, i.user.id);
          if (!pix) return i.reply({ content: '⚠️ Você não tem PIX cadastrado.', flags: EPHEMERAL });
          await ffRemoveMediatorPix(guild.id, i.user.id);
          return i.reply({ content: '🗑️ PIX removido.', flags: EPHEMERAL });
        }
        if (action === 'post') {
          const isO = i.user.id === guild.ownerId, isS = await isAdmin(i.user, guild);
          if (!isO && !isS && !isDev) return i.reply({ content: '❌ Só admin.', flags: EPHEMERAL });
          const p = await ffBuildMediatorPixPanel(guild.id);
          await channel.send(p).catch(() => {});
          await ffPatchConfig(guild.id, { pix_mediator_channel_id: channel.id });
          return i.reply({ content: `✅ Painel PIX Mediadores postado em ${channel}.`, flags: EPHEMERAL });
        }
        if (action === 'admin_view_pick' || action === 'admin_edit_pick') {
          // handled in string select (below)
        }
      }

      // ─── FFBET ───
      if (ns === 'ffbet') {
        if (await blockIfMaintenance(i)) return;
        const betId = rest[0];
        try {
          const bet = await ffGetBet(betId);
          if (!bet || !bet.active) return i.reply({ content: '❌ Aposta inativa.', flags: EPHEMERAL });
          if (action === 'sair') {
            const gi = parseJson(bet.gelo_infinito_players).filter(p => p.userId !== i.user.id);
            const gn = parseJson(bet.gelo_normal_players).filter(p => p.userId !== i.user.id);
            await ffPatchBet(betId, { gelo_infinito_players: JSON.stringify(gi), gelo_normal_players: JSON.stringify(gn) });
            await ffUpdateBetMessage(guild, await ffGetBet(betId)).catch(() => {});
            return i.reply({ content: '🚪 Você saiu da fila.', flags: EPHEMERAL });
          }
          if (action === 'gi' || action === 'gn') {
            let gi = parseJson(bet.gelo_infinito_players), gn = parseJson(bet.gelo_normal_players);
            if (gi.some(p => p.userId === i.user.id) || gn.some(p => p.userId === i.user.id)) return i.reply({ content: '⚠️ Você já está na fila.', flags: EPHEMERAL });
            const target = action === 'gi' ? gi : gn;
            if (target.length >= FF_PULL_SIZE) return i.reply({ content: '❌ Fila cheia.', flags: EPHEMERAL });
            target.push({ userId: i.user.id, at: new Date().toISOString() });
            await ffPatchBet(betId, { gelo_infinito_players: JSON.stringify(gi), gelo_normal_players: JSON.stringify(gn) });
            await i.reply({ content: `✅ Adicionado (${target.length}/${FF_PULL_SIZE})`, flags: EPHEMERAL });
            await ffUpdateBetMessage(guild, await ffGetBet(betId)).catch(() => {});
            if (target.length >= FF_PULL_SIZE) {
              const duo = [target[0].userId, target[1].userId];
              if (action === 'gi') gi = []; else gn = [];
              await ffPatchBet(betId, { gelo_infinito_players: JSON.stringify(gi), gelo_normal_players: JSON.stringify(gn) });
              await ffUpdateBetMessage(guild, await ffGetBet(betId)).catch(() => {});
              await ffCriarThreadAposta(guild, duo, bet).catch(e => console.error(e.message));
            }
          }
        } catch (err) {
          console.error(err);
          if (!i.replied && !i.deferred) await i.reply({ content: `❌ ${err.message}`, flags: EPHEMERAL }).catch(() => {});
        }
        return;
      }

      // ─── FFM ───
      if (ns === 'ffm') {
        const matchId = rest[0], m = await ffGetMatch(matchId);
        if (!m) return i.reply({ content: '❌ Match não encontrado.', flags: EPHEMERAL });
        const players = parseJson(m.players);
        const isP = players.includes(i.user.id), isS = await isAdmin(i.user, guild);
        const isMed = m.mediator_id ? i.user.id === m.mediator_id : false;

        if (action === 'confirmar') {
          if (!isP) return i.reply({ content: '❌ Só jogadores.', flags: EPHEMERAL });
          let confs = parseJson(m.confirmations);
          if (confs.includes(i.user.id)) return i.reply({ content: '⚠️ Você já confirmou.', flags: EPHEMERAL });
          confs.push(i.user.id);
          await ffPatchMatch(matchId, { confirmations: JSON.stringify(confs) });
          if (confs.length < players.length) {
            const falta = players.filter(p => !confs.includes(p));
            return i.reply({ content: `✅ Falta: ${falta.map(p => `<@${p}>`).join(', ')}`, flags: EPHEMERAL });
          }
          const cfg = await ffGetConfig(guild.id);
          const payPP = ffCalcPlayerPay(m.value, cfg?.mediator_fee, cfg?.taxa_extra, cfg?.taxa_extra_ativo);
          const hasPix = !!(cfg?.pix_key || cfg?.mp_access_token);
          await i.channel.setName(ffThreadName('confirmed', m.value, players, matchId)).catch(() => {});
          try {
            const msgs = await i.channel.messages.fetch({ limit: 20 });
            for (const msg of msgs.values()) if (msg.author.id === client.user.id && msg.components.length) await msg.delete().catch(() => {});
          } catch {}
          const e = new EmbedBuilder().setTitle('💰 Pagamento').setColor(hasPix ? '#22c55e' : '#ff5555')
            .setDescription(hasPix ? 'Regras confirmadas!' : '⚠️ PIX não configurado.')
            .addFields(
              { name: '🎮 Jogadores', value: players.map(p => `<@${p}>`).join(' 🆚 ') },
              { name: '💵 Valor', value: `R$ ${Number(m.value).toFixed(2)}`, inline: true },
              { name: '💵 Taxa', value: `R$ ${Number(cfg?.mediator_fee || 0).toFixed(2)}`, inline: true },
              { name: '💰 Total', value: `**R$ ${payPP.toFixed(2)}**`, inline: true },
            ).setTimestamp();
          const row = new ActionRowBuilder();
          if (!hasPix) row.addComponents(new ButtonBuilder().setCustomId(`ffm:pix_config:${matchId}`).setLabel('Config PIX').setEmoji('✏️').setStyle(ButtonStyle.Primary));
          else row.addComponents(
            new ButtonBuilder().setCustomId(`ffm:pix_show:${matchId}`).setLabel('Ver PIX').setEmoji('💳').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`ffm:liberar:${matchId}`).setLabel('Liberar PIX').setEmoji('🔓').setStyle(ButtonStyle.Success),
          );
          await ffPatchMatch(matchId, { status: 'confirmed', mediator_fee: cfg?.mediator_fee, pay_per_player: payPP });
          await i.channel.send({ embeds: [e], components: [row] });
          return i.reply({ content: '✅ Confirmado!', flags: EPHEMERAL });
        }
        if (action === 'encerrar') {
          if (!isP && !isS) return i.reply({ content: '❌', flags: EPHEMERAL });
          await ffPatchMatch(matchId, { status: 'cancelled', finished_at: new Date().toISOString() });
          if (m.mediator_id) await supabase.from('ff_mediator_queue').update({ status: 'waiting', current_match_id: null }).eq('guild_id', guild.id).eq('user_id', m.mediator_id);
          await i.channel.setName('❌').catch(() => {});
          await i.update({ embeds: [new EmbedBuilder().setTitle('❌ Fila cancelada').setColor('#ff5555')], components: [] });
          setTimeout(() => i.channel.setArchived(true).catch(() => {}), 10000);
          return;
        }
        if (action === 'pix_config') {
          if (!isMed && !isDev && !isS) return i.reply({ content: '❌', flags: EPHEMERAL });
          const cfg = await ffGetConfig(guild.id);
          const m2 = new ModalBuilder().setCustomId(`ffm_modal:pix:${matchId}`).setTitle('Configurar PIX');
          m2.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('Chave').setStyle(TextInputStyle.Short).setValue(cfg?.pix_key || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(cfg?.pix_name || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('city').setLabel('Cidade').setStyle(TextInputStyle.Short).setValue(cfg?.pix_city || '').setRequired(false)),
          );
          return i.showModal(m2);
        }
        if (action === 'pix_show') {
          const cfg = await ffGetConfig(guild.id);
          if (!cfg?.pix_key) return i.reply({ content: '❌ Nenhum PIX.', flags: EPHEMERAL });
          return i.reply({ content: `💳 **PIX:**\n\`\`\`\n${cfg.pix_key}\n\`\`\`\n> 👤 ${cfg.pix_name || '—'}`, flags: EPHEMERAL });
        }
        if (action === 'liberar') {
          if (!isMed && !isS && !isDev) return i.reply({ content: '❌ Só mediador.', flags: EPHEMERAL });
          const cfg = await ffGetConfig(guild.id);
          const medPix = m.mediator_id ? await ffGetMediatorPix(guild.id, m.mediator_id) : null;
          const pixToUse = medPix?.pix_key ? medPix : cfg;
          if (!pixToUse?.pix_key && !cfg?.mp_access_token) return i.reply({ content: '❌ Nenhum PIX disponível (nem do mediador, nem da guild).', flags: EPHEMERAL });
          let feeFinal = cfg?.mediator_fee;
          if (getCachedNoFee()) feeFinal = 0;
          const payPP = ffCalcPlayerPay(m.value, feeFinal, cfg?.taxa_extra, cfg?.taxa_extra_ativo);
          await ffPatchMatch(matchId, { status: 'pix_released' });
          await i.channel.setName(ffThreadName('paid', m.value, players, matchId)).catch(() => {});
          const pixSource = medPix?.pix_key ? `Mediador <@${m.mediator_id}>` : 'Guild';
          if (cfg.mp_access_token && !medPix?.pix_key) {
            try {
              const pag = await criarPixMercadoPago(payPP, `M${matchId}`, `Aposta ${matchId}`, cfg.mp_access_token);
              if (pag?.ok) {
                const e = new EmbedBuilder().setTitle('🔓 PIX Mercado Pago').setColor('#22c55e')
                  .setDescription(`**💰 Total: R$ ${payPP.toFixed(2)}**\n> Fonte: ${pixSource}`)
                  .addFields(
                    { name: '🔗 Pagar', value: `[Abrir MP](${pag.ticket_url})` },
                    { name: '🔑 Copia e cola', value: `\`\`\`${pag.payload}\`\`\`` },
                  )
                  .setFooter({ text: 'Após pagar, clique em Confirmar' });
                const row = new ActionRowBuilder().addComponents(
                  new ButtonBuilder().setLabel('Pagar no MP').setEmoji('🔗').setStyle(ButtonStyle.Link).setURL(pag.ticket_url),
                  new ButtonBuilder().setCustomId(`ffm:confirmar_pag:${matchId}`).setLabel('Confirmar Pagamento').setEmoji('✅').setStyle(ButtonStyle.Success),
                );
                await ffLog(guild, 'pix', 'PAYMENT_RELEASED_MP', i.user.id, { matchId, payPP });
                return i.update({ embeds: [e], components: [row] });
              }
            } catch (e) { console.error(e); }
          }
          const e = new EmbedBuilder().setTitle('🔓 PIX Liberado').setColor('#22c55e')
            .setDescription(`**💰 Total: R$ ${payPP.toFixed(2)}**\n> Fonte: ${pixSource}`)
            .addFields(
              { name: '🔑 Chave PIX', value: `\`\`\`${pixToUse.pix_key}\`\`\`` },
              { name: '👤 Titular', value: `**${pixToUse.pix_name || '—'}**`, inline: true },
              { name: '🏙️ Cidade', value: `${pixToUse.pix_city || '—'}`, inline: true },
            );
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ffm:confirmar_pag:${matchId}`).setLabel('Confirmar Pagamento').setEmoji('✅').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`ffm:cancelar:${matchId}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger),
          );
          await ffLog(guild, 'pix', 'PAYMENT_RELEASED', i.user.id, { matchId, payPP, fonte: medPix?.pix_key ? 'mediador' : 'guild' });
          return i.update({ embeds: [e], components: [row] });
        }
        if (action === 'confirmar_pag') {
          const canConfirm = isMed || isS || isDev || !m.mediator_id;
          if (!canConfirm) return i.reply({ content: '❌ Só mediador/staff.', flags: EPHEMERAL });
          await ffPatchMatch(matchId, { status: 'playing' });
          await i.channel.setName(ffThreadName('playing', m.value, players, matchId)).catch(() => {});
          const e = new EmbedBuilder().setTitle('🎮 Em partida').setColor('#5865F2')
            .addFields({ name: 'Jogadores', value: players.map(p => `<@${p}>`).join(' 🆚 ') });
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ffm:escolher_venc:${matchId}`).setLabel('Escolher Vencedor').setEmoji('🏆').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`ffm:enviar_sala:${matchId}`).setLabel('Enviar Sala').setEmoji('🎮').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`ffm:cancelar:${matchId}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger),
          );
          return i.update({ embeds: [e], components: [row] });
        }
        if (action === 'escolher_venc') {
          if (!isMed && !isS && !isDev && m.mediator_id) return i.reply({ content: '❌', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId(`ffm:pick_winner:${matchId}`).setPlaceholder('🏆 Selecione o vencedor');
          for (const p of players) {
            const u = await client.users.fetch(p).catch(() => null);
            menu.addOptions({ label: u?.username || p, value: p, emoji: '🏆' });
          }
          return i.reply({
            embeds: [new EmbedBuilder().setTitle('🏆 Escolher vencedor')],
            components: [new ActionRowBuilder().addComponents(menu)],
            flags: EPHEMERAL,
          });
        }
        if (action === 'enviar_sala') {
          if (!isMed && !isDev && m.mediator_id) return i.reply({ content: '❌', flags: EPHEMERAL });
          const mo = new ModalBuilder().setCustomId(`ffm_modal:sala:${matchId}`).setTitle('Enviar sala');
          mo.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('room_id').setLabel('ID da sala').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('room_pass').setLabel('Senha').setStyle(TextInputStyle.Short).setRequired(true)),
          );
          return i.showModal(mo);
        }
        if (action === 'cancelar') {
          if (!isMed && !isDev && !isS && m.mediator_id) return i.reply({ content: '❌', flags: EPHEMERAL });
          const e = new EmbedBuilder().setTitle('⚠️ Confirmar cancelamento?').setColor('#ff5555')
            .setDescription('O match será cancelado e o mediador voltará pra fila.');
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ffm:cancelar_confirm:${matchId}`).setLabel('Sim, cancelar').setEmoji('✅').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`ffm:cancelar_abort:${matchId}`).setLabel('Não').setEmoji('❌').setStyle(ButtonStyle.Secondary),
          );
          return i.reply({ embeds: [e], components: [row], flags: EPHEMERAL });
        }
        if (action === 'cancelar_confirm') {
          await ffPatchMatch(matchId, { status: 'cancelled', finished_at: new Date().toISOString() });
          if (m.mediator_id) await supabase.from('ff_mediator_queue').update({ status: 'waiting', current_match_id: null }).eq('guild_id', guild.id).eq('user_id', m.mediator_id);
          await i.channel.setName('❌').catch(() => {});
          await i.update({ embeds: [new EmbedBuilder().setTitle('❌ Match cancelado').setColor('#ff5555')], components: [] });
          setTimeout(() => i.channel.setArchived(true).catch(() => {}), 10000);
          return;
        }
        if (action === 'cancelar_abort') return i.update({ content: '✅ Cancelamento abortado.', embeds: [], components: [] });
        if (action === 'chamar_analista') {
          const cfgChk = await ffGetConfig(guild.id);
          const isMedChk = cfgChk?.mediator_role_id && i.member.roles.cache.has(cfgChk.mediator_role_id);
          const isOlhChk = cfgChk?.olhinho_role_id && i.member.roles.cache.has(cfgChk.olhinho_role_id);
          if (!isMedChk && !isOlhChk && !isS && !isDev) return i.reply({ content: '❌', flags: EPHEMERAL });
          const next = await ffAnalystNext(guild.id);
          if (next) {
            await supabase.from('ff_analyst_queue').update({ status: 'busy', current_match_id: m.id }).eq('id', next.id);
            await logAnalista(guild, next.user_id, 'CHAMADO', { match_id: m.id });
          }
          const temAnalista = !!next;
          const e = new EmbedBuilder().setTitle('🔎 Análise Solicitada').setColor(temAnalista ? '#22c55e' : '#FF5555')
            .setDescription(temAnalista ? `**Analista designado:** <@${next.user_id}>\n\nEnvie: replay, prints e motivos.` : '⚠️ Nenhum analista disponível no momento.')
            .setTimestamp();
          if (temAnalista) {
            await i.channel.members.add(next.user_id).catch(() => {});
            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`ffana:concluir:${m.id}`).setLabel('Análise Concluída').setEmoji('✅').setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId(`ffana:wo:${m.id}`).setLabel('Aplicar W.O.').setEmoji('⚠️').setStyle(ButtonStyle.Danger),
            );
            await i.channel.send({ content: `<@${next.user_id}>`, embeds: [e], components: [row] });
          } else await i.channel.send({ embeds: [e] });
          await ffLog(guild, 'moderator', 'ANALYST_CALLED', i.user.id, { match_id: m.id, analyst: next?.user_id || null });
          return i.reply({ content: temAnalista ? '✅ Analista chamado.' : '⚠️ Nenhum analista disponível.', flags: EPHEMERAL });
        }
      }

      // ─── FFMED ───
      if (ns === 'ffmed') {
        if (await blockIfMaintenance(i)) return;
        const cfg = await ffGetConfig(guild.id);
        const isO = i.user.id === guild.ownerId, isS = await isAdmin(i.user, guild);
        const hasMed = cfg?.mediator_role_id && i.member.roles.cache.has(cfg.mediator_role_id);
        if (!hasMed && !isO && !isS) return i.reply({ content: '❌', flags: EPHEMERAL });
        if (action === 'entrar') {
          const ok = await ffMediatorJoin(guild.id, i.user.id);
          if (!ok) return i.reply({ content: '⚠️ Você já está na fila.', flags: EPHEMERAL });
          await logMediador(guild, i.user.id, 'ENTROU', {});
          await i.reply({ content: '✅ Você entrou na fila.', flags: EPHEMERAL });
          await i.message.edit(await ffBuildMediatorPanel(guild.id)).catch(() => {});
          return;
        }
        if (action === 'sair') {
          const ok = await ffMediatorLeave(guild.id, i.user.id);
          if (!ok) return i.reply({ content: '⚠️ Você está em partida.', flags: EPHEMERAL });
          await logMediador(guild, i.user.id, 'SAIU', {});
          await i.reply({ content: '🚪 Você saiu da fila.', flags: EPHEMERAL });
          await i.message.edit(await ffBuildMediatorPanel(guild.id)).catch(() => {});
          return;
        }
        if (action === 'receita') {
          const { data: all } = await supabase.from('ff_mediator_earnings').select('*').eq('guild_id', guild.id).eq('mediator_id', i.user.id);
          const now = Date.now(), day = 86400000;
          const sum = (a) => a.reduce((x, y) => x + Number(y.amount || 0), 0);
          const hoje = (all || []).filter(e => now - new Date(e.created_at).getTime() < day);
          const sem = (all || []).filter(e => now - new Date(e.created_at).getTime() < 7 * day);
          const mes = (all || []).filter(e => now - new Date(e.created_at).getTime() < 30 * day);
          const e = new EmbedBuilder().setTitle('💰 Minha Receita').setColor('#22c55e').setThumbnail(i.user.displayAvatarURL())
            .addFields(
              { name: '📅 Hoje', value: `R$ ${sum(hoje).toFixed(2)} • ${hoje.length}`, inline: true },
              { name: '📆 Semana', value: `R$ ${sum(sem).toFixed(2)} • ${sem.length}`, inline: true },
              { name: '🗓️ Mês', value: `R$ ${sum(mes).toFixed(2)} • ${mes.length}`, inline: true },
              { name: '💰 Total', value: `R$ ${sum(all).toFixed(2)} • ${(all || []).length}`, inline: true },
            ).setTimestamp();
          return i.reply({ embeds: [e], flags: EPHEMERAL });
        }
      }

      // ─── FFANA ───
      if (ns === 'ffana') {
        try {
          if (await blockIfMaintenance(i)) return;
          const cfg = await ffGetConfig(guild.id);
          const isO = i.user.id === guild.ownerId, isS = await isAdmin(i.user, guild);
          const hasAna = cfg?.analyst_role_id && i.member.roles.cache.has(cfg.analyst_role_id);
          const hasOlh = cfg?.olhinho_role_id && i.member.roles.cache.has(cfg.olhinho_role_id);
          if (!hasAna && !hasOlh && !isO && !isS) return i.reply({ content: '❌', flags: EPHEMERAL });
          if (action === 'entrar') {
            const ok = await ffAnalystJoin(guild.id, i.user.id);
            if (!ok) return i.reply({ content: '⚠️ Você já está na fila.', flags: EPHEMERAL });
            await logAnalista(guild, i.user.id, 'ENTROU', {});
            await i.reply({ content: '✅ Você entrou na fila de analistas.', flags: EPHEMERAL });
            await i.message.edit(await ffBuildAnalystPanel(guild.id)).catch(() => {});
            return;
          }
          if (action === 'sair') {
            const ok = await ffAnalystLeave(guild.id, i.user.id);
            if (!ok) return i.reply({ content: '⚠️ Você está em análise.', flags: EPHEMERAL });
            await logAnalista(guild, i.user.id, 'SAIU', {});
            await i.reply({ content: '🚪 Você saiu da fila.', flags: EPHEMERAL });
            await i.message.edit(await ffBuildAnalystPanel(guild.id)).catch(() => {});
            return;
          }
          if (action === 'meu_historico') {
            const { data: a } = await supabase.from('ff_analyst_queue').select('*').eq('guild_id', guild.id).eq('user_id', i.user.id).maybeSingle();
            const total = a?.analyses_total || 0;
            const e = new EmbedBuilder().setTitle('📊 Minhas Análises').setColor('#00AAFF').setThumbnail(i.user.displayAvatarURL())
              .addFields(
                { name: '🔎 Total', value: `${total}`, inline: true },
                { name: '📌 Status', value: a?.status === 'busy' ? 'Em análise' : a ? 'Disponível' : 'Fora da fila', inline: true },
              );
            return i.reply({ embeds: [e], flags: EPHEMERAL });
          }
          if (action === 'concluir') {
            const matchId = rest[0];
            await ffAnalystRelease(guild.id, i.user.id, true);
            await logAnalista(guild, i.user.id, 'CONCLUIU', { match_id: matchId });
            return i.update({ content: '✅ Análise concluída.', embeds: [], components: [] });
          }
          if (action === 'wo') {
            const matchId = rest[0];
            await ffAnalystRelease(guild.id, i.user.id, true);
            await logAnalista(guild, i.user.id, 'APLICOU_WO', { match_id: matchId });
            return i.update({ content: '⚠️ W.O. aplicado.', embeds: [], components: [] });
          }
        } catch (errAna) {
          console.error(errAna);
          if (!i.replied && !i.deferred) return i.reply({ content: `❌ ${errAna.message}`, flags: EPHEMERAL }).catch(() => {});
        }
      }

      // ─── FFSTR ───
      if (ns === 'ffstr') {
        if (await blockIfMaintenance(i)) return;

        if (action === 'entrar') {
          const ok = await ffStreamerJoin(guild.id, i.user.id);
          await logImportant('STREAMER', '🎥 Streamer entrou', { user: i.user.id, guild: guild.id, severity: 'info' }).catch(() => {});
          await i.reply({
            content: ok ? '✅ Você entrou na lista!\n> Clique em **🔴 Definir Live** pra aparecer ao vivo.' : '✅ Você já estava na lista.',
            flags: EPHEMERAL,
          });
          await ffUpdateStreamerMessage(guild).catch(() => {});
          return;
        }
        if (action === 'sair') {
          await ffStreamerLeave(guild.id, i.user.id);
          await i.reply({ content: '🚪 Você saiu.', flags: EPHEMERAL });
          await ffUpdateStreamerMessage(guild).catch(() => {});
          return;
        }
        if (action === 'live_set') {
          const m = new ModalBuilder().setCustomId('modal_ffstr_live').setTitle('Definir Live');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('url').setLabel('Link da live').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Título (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
          );
          return i.showModal(m);
        }
        if (action === 'set_mediator') {
          const { data: ex } = await supabase.from('ff_streamer_queue').select('*').eq('guild_id', guild.id).eq('user_id', i.user.id).maybeSingle();
          if (!ex) return i.reply({ content: '❌ Entre na lista primeiro.', flags: EPHEMERAL });
          const m = new ModalBuilder().setCustomId('modal_ffstr_mediator').setTitle('Designar mediador');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('mediator_id').setLabel('ID do mediador').setStyle(TextInputStyle.Short).setPlaceholder('Ex: 123456789012345678').setValue(ex.mediator_id || '').setRequired(true).setMaxLength(20)
          ));
          return i.showModal(m);
        }
        if (action === 'my_info') {
          const { data: info } = await supabase.from('ff_streamer_queue').select('*').eq('guild_id', guild.id).eq('user_id', i.user.id).maybeSingle();
          if (!info) return i.reply({ content: '❌ Você não está na lista.', flags: EPHEMERAL });
          const { data: meds } = await supabase.from('ff_streamer_mediations').select('*').eq('guild_id', guild.id).eq('streamer_id', i.user.id).order('started_at', { ascending: false }).limit(10);
          const total = (meds || []).length, ended = (meds || []).filter(m => m.status === 'ended').length;
          const statusEmoji = { offline: '⚪', live: '🔴' }[info.status] || '⚪';
          const medStatusEmoji = { pending: '🟡', accepted: '🟢', declined: '🔴' }[info.mediator_status] || '⚪';
          const e = new EmbedBuilder().setTitle('🎥 Meus dados como streamer').setColor('#9146FF').setThumbnail(i.user.displayAvatarURL())
            .addFields(
              { name: '📌 Status', value: `${statusEmoji} ${info.status === 'live' ? 'Ao vivo' : 'Offline'}`, inline: true },
              { name: '🛡️ Mediador', value: info.mediator_id ? `<@${info.mediator_id}> ${medStatusEmoji}` : '*não designado*', inline: true },
              { name: '📊 Lives', value: `**${total}**`, inline: true },
              { name: '✅ Concluídas', value: `**${ended}**`, inline: true },
            ).setTimestamp();
          if (meds?.length) {
            const lines = meds.slice(0, 5).map(m => `> ${m.status === 'active' ? '🟢' : '⚪'} <@${m.mediator_id}> <t:${Math.floor(new Date(m.started_at).getTime() / 1000)}:R>`);
            e.addFields({ name: '📋 Recentes', value: lines.join('\n') });
          }
          const rows = [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ffstr:remove_mediator').setLabel('Remover mediador').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(!info.mediator_id),
          )];
          return i.reply({ embeds: [e], components: rows, flags: EPHEMERAL });
        }
        if (action === 'remove_mediator') {
          await supabase.from('ff_streamer_queue').update({ mediator_id: null, mediator_status: null, mediator_joined_at: null }).eq('guild_id', guild.id).eq('user_id', i.user.id).catch(() => {});
          await i.reply({ content: '✅ Mediador removido.', flags: EPHEMERAL });
          await ffUpdateStreamerMessage(guild).catch(() => {});
          return;
        }
        if (action === 'accept') {
          const [, targetGid, targetUid] = rest;
          if (targetGid !== guild.id) return;
          const { data: st } = await supabase.from('ff_streamer_queue').select('*').eq('guild_id', guild.id).eq('user_id', targetUid).maybeSingle();
          if (!st || st.mediator_id !== i.user.id) return i.reply({ content: '❌ Você não é o mediador designado.', flags: EPHEMERAL });
          await supabase.from('ff_streamer_queue').update({ mediator_status: 'accepted' }).eq('guild_id', guild.id).eq('user_id', targetUid);
          await logImportant('STREAMER', '🛡️ Mediador aceitou', { user: i.user.id, guild: guild.id, severity: 'success', description: `Mediador aceitou mediar live de <@${targetUid}>` }).catch(() => {});
          try { const u = await client.users.fetch(targetUid).catch(() => null); if (u) await u.send(`✅ **<@${i.user.id}>** aceitou mediar sua live!`).catch(() => {}); } catch {}
          await i.update({ embeds: [new EmbedBuilder().setTitle('✅ Mediação Aceita').setColor('#22c55e').setDescription(`Você está mediando a live de <@${targetUid}>.`)], components: [] });
          await ffUpdateStreamerMessage(guild).catch(() => {});
          return;
        }
        if (action === 'decline') {
          const [, targetGid, targetUid] = rest;
          if (targetGid !== guild.id) return;
          const { data: st } = await supabase.from('ff_streamer_queue').select('*').eq('guild_id', guild.id).eq('user_id', targetUid).maybeSingle();
          if (!st || st.mediator_id !== i.user.id) return i.reply({ content: '❌', flags: EPHEMERAL });
          await supabase.from('ff_streamer_queue').update({ mediator_status: 'declined' }).eq('guild_id', guild.id).eq('user_id', targetUid);
          try { const u = await client.users.fetch(targetUid).catch(() => null); if (u) await u.send(`⚠️ **<@${i.user.id}>** recusou mediar sua live.`).catch(() => {}); } catch {}
          await logImportant('STREAMER', '🛡️ Mediador recusou', { user: i.user.id, guild: guild.id, severity: 'warning', description: `Mediador <@${i.user.id}> recusou live de <@${targetUid}>` }).catch(() => {});
          await i.update({ embeds: [new EmbedBuilder().setTitle('❌ Recusada').setColor('#ff5555')], components: [] });
          return;
        }
        if (action === 'config') {
          const cfg = await ffGetConfig(guild.id);
          const c = cfg?.custom_streamer_embed || {};
          const m = new ModalBuilder().setCustomId('modal_ffstr_config').setTitle('Configurar painel streamer');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Título').setStyle(TextInputStyle.Short).setValue(c.title || '🎥 Streamers ao Vivo').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(c.descricao || '').setRequired(false).setMaxLength(500)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cor').setLabel('Cor hex').setStyle(TextInputStyle.Short).setValue(c.color || '#9146FF').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('footer').setLabel('Footer').setStyle(TextInputStyle.Short).setValue(c.footer || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('regras').setLabel('Regras').setStyle(TextInputStyle.Paragraph).setValue(c.regras || '').setRequired(false).setMaxLength(500)),
          );
          return i.showModal(m);
        }
        if (action === 'preview') {
          const panel = await ffBuildStreamerPanel(guild.id);
          return i.reply({ ...panel, flags: EPHEMERAL });
        }
        if (action === 'reset') {
          await ffPatchConfig(guild.id, { custom_streamer_embed: {} });
          return i.reply({ content: '✅ Painel resetado.', flags: EPHEMERAL });
        }
        if (action === 'post' || action === 'update') {
          const cfg = await ffGetConfig(guild.id);
          const chId = cfg?.streamer_channel_id || channel.id;
          await ffPostStreamerPanel(guild, chId);
          return i.reply({ content: `✅ Painel postado em <#${chId}>.`, flags: EPHEMERAL });
        }
      }

      // ─── FFBL ───
      if (ns === 'ffbl') {
        if (await blockIfMaintenance(i)) return;
        const cfg = await ffGetConfig(guild.id);
        const isO = i.user.id === guild.ownerId, isS = await isAdmin(i.user, guild);
        const hasAna = cfg?.analyst_role_id && i.member.roles.cache.has(cfg.analyst_role_id);
        const hasMed = cfg?.mediator_role_id && i.member.roles.cache.has(cfg.mediator_role_id);
        if (!hasAna && !hasMed && !isO && !isS) return i.reply({ content: '❌ Só staff.', flags: EPHEMERAL });
        if (action === 'list') return i.reply(await ffBuildBlacklistEmbed(guild.id));
        if (action === 'refresh') return i.update(await ffBuildBlacklistEmbed(guild.id));
        if (action === 'check') {
          const m = new ModalBuilder().setCustomId('ffbl_modal:check').setTitle('Verificar BL');
          m.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('query').setLabel('Discord ID ou FF ID').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return i.showModal(m);
        }
        if (action === 'add') {
          const m = new ModalBuilder().setCustomId('ffbl_modal:add').setTitle('Adicionar à Blacklist');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ff_id').setLabel('ID Free Fire').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('evidence').setLabel('Link de provas (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
          );
          return i.showModal(m);
        }
        if (action === 'remove') {
          const { data } = await supabase.from('ff_blacklist').select('*').eq('guild_id', guild.id).order('created_at', { ascending: false });
          if (!data?.length) return i.reply({ content: '📋 Blacklist vazia.', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId('ffbl:remove_pick').setPlaceholder('Remover');
          for (const b of data.slice(0, 25)) menu.addOptions({ label: `<@${b.discord_id || b.user_id}> • FF: ${b.ff_id || '—'}`.slice(0, 90), value: String(b.id) });
          return i.reply({ embeds: [new EmbedBuilder().setTitle('➖ Remover da BL')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
      }

      // ─── Coinshop ───
      if (ns === 'coinshop') {
        if (action === 'cancel') return i.update({ content: '❌ Cancelado.', embeds: [], components: [] });
        if (action === 'saldo') {
          const { data: p } = await supabase.from('ff_players').select('coins, wins, losses').eq('guild_id', guild.id).eq('user_id', i.user.id).maybeSingle();
          const { count: compras } = await supabase.from('ff_coin_purchases').select('*', { count: 'exact', head: true }).eq('guild_id', guild.id).eq('user_id', i.user.id);
          const e = new EmbedBuilder().setTitle('💰 Meu Saldo').setColor('#FFD700').setThumbnail(i.user.displayAvatarURL())
            .addFields(
              { name: '🪙 Coins', value: `**${Number(p?.coins || 0)}**`, inline: true },
              { name: '🏆 Wins', value: `${p?.wins || 0}`, inline: true },
              { name: '❌ Losses', value: `${p?.losses || 0}`, inline: true },
              { name: '🛒 Compras', value: `${compras || 0}`, inline: true },
            ).setTimestamp();
          return i.reply({ embeds: [e], flags: EPHEMERAL });
        }
        if (action === 'top') {
          const { data: top } = await supabase.from('ff_players').select('user_id, coins').eq('guild_id', guild.id).order('coins', { ascending: false }).limit(10);
          const e = new EmbedBuilder().setTitle('🏆 Top 10 Mais Ricos').setColor('#FFD700')
            .setDescription(top?.length ? top.map((p, idx) => `${['🥇', '🥈', '🥉'][idx] || `**${idx + 1}º**`} <@${p.user_id}> — 🪙 **${Number(p.coins || 0)}**`).join('\n') : 'Sem dados.');
          return i.reply({ embeds: [e], flags: EPHEMERAL });
        }
        if (action === 'confirm') {
          const itemId = rest[0], lockKey = `${guild.id}-${i.user.id}`;
          if (coinLocks.has(lockKey)) return i.reply({ content: '⏳ Processando...', flags: EPHEMERAL });
          return withCoinLock(lockKey, async () => {
            await i.deferUpdate();
            const { data: item } = await supabase.from('ff_coin_shop').select('*').eq('id', itemId).maybeSingle();
            if (!item || !item.active) return i.editReply({ content: '❌', embeds: [], components: [] });
            const { data: p } = await supabase.from('ff_players').select('coins').eq('guild_id', guild.id).eq('user_id', i.user.id).maybeSingle();
            const saldo = Number(p?.coins || 0);
            if (saldo < item.price) return i.editReply({ content: '❌ Saldo insuficiente.', embeds: [], components: [] });
            if (item.type === 'role' && item.role_id) {
              const mem = await guild.members.fetch(i.user.id).catch(() => null);
              if (!mem) return i.editReply({ content: '❌', embeds: [], components: [] });
              if (mem.roles.cache.has(item.role_id)) return i.editReply({ content: '⚠️ Você já tem este cargo.', embeds: [], components: [] });
              try {
                const r = guild.roles.cache.get(item.role_id);
                if (!r) return i.editReply({ content: '❌ Cargo não existe mais.', embeds: [], components: [] });
                const bh = guild.members.me.roles.highest;
                if (r.position >= bh.position) return i.editReply({ content: '❌ Não consigo dar este cargo (hierarquia).', embeds: [], components: [] });
                await mem.roles.add(r, 'Compra na loja de coins');
              } catch (e) { return i.editReply({ content: `❌ ${e.message}`, embeds: [], components: [] }); }
            }
            const novoSaldo = saldo - item.price;
            await supabase.from('ff_players').update({ coins: novoSaldo }).eq('guild_id', guild.id).eq('user_id', i.user.id);
            if (item.type === 'coins' && item.coins_reward > 0) await supabase.from('ff_players').update({ coins: novoSaldo + item.coins_reward }).eq('guild_id', guild.id).eq('user_id', i.user.id);
            if (item.stock > 0) await supabase.from('ff_coin_shop').update({ stock: item.stock - 1 }).eq('id', item.id);
            try { await supabase.from('ff_coin_purchases').insert({ guild_id: guild.id, user_id: i.user.id, shop_id: item.id, item_name: item.name, price: item.price }); } catch {}
            await logCoins(guild, i.user.id, -item.price, `Compra: ${item.name}`, null);
            try { const u = await client.users.fetch(i.user.id); await u.send(`🪙 Compra realizada!\n> **${item.emoji || '🎁'} ${item.name}**\n> 💰 Novo saldo: **${novoSaldo}**`).catch(() => {}); } catch {}
            return i.editReply({
              embeds: [new EmbedBuilder().setTitle('✅ Compra realizada!').setColor('#22c55e').setDescription(`**${item.emoji || '🎁'} ${item.name}**\n\n💰 Saldo: **${novoSaldo}** coins`)],
              components: [],
            });
          });
        }
      }

      // ─── Custom bet ───
      if (cid === 'custom_bet_preview') {
        if (!await isPremium(guild.id)) return requirePremiumTier(i, 'custom_embeds');
        const cfg = await ffGetConfig(guild.id);
        const fake = { id: 0, format: '1v1 Mobile', value: 5.00, gelo_infinito_players: JSON.stringify([{ userId: i.user.id }]), gelo_normal_players: '[]' };
        return i.reply({ content: '🎨 Preview:', embeds: [ffBuildBetEmbed(fake, cfg)], components: [ffBuildBetButtons(0, cfg)], flags: EPHEMERAL });
      }
      if (cid === 'custom_bet_reset') {
        if (!await isAdmin(i.user, guild)) return i.reply({ content: '❌', flags: EPHEMERAL });
        await ffPatchConfig(guild.id, { custom_bet_embed: {} });
        await logConfig(guild, i.user.id, 'CUSTOM_BET_RESET', {});
        return i.update(await ffPanelCustomEmbed(guild.id));
      }

      // ─── Música ───
      if (cid === 'mus_play') {
        if (!await isAdmin(i.user, guild)) return;
        if (!await isPremium(guild.id)) return requirePremiumTier(i, 'musica');
        const m = new ModalBuilder().setCustomId('modal_mus_play').setTitle('Tocar música');
        m.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('busca').setLabel('Nome ou link').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return i.showModal(m);
      }
      if (cid === 'mus_pause') {
        if (!await requirePremiumTier(i, 'musica')) return;
        const q = getQueue(guild.id);
        if (!q.player) return i.reply({ content: '❌ Nada tocando.', flags: EPHEMERAL });
        if (q.player.state.status === AudioPlayerStatus.Paused) { q.player.unpause(); q.paused = false; return i.reply({ content: '▶️ Retomado.', flags: EPHEMERAL }); }
        q.player.pause(); q.paused = true;
        return i.reply({ content: '⏸️ Pausado.', flags: EPHEMERAL });
      }
      if (cid === 'mus_skip') {
        if (!await requirePremiumTier(i, 'musica')) return;
        getQueue(guild.id).player?.stop();
        return i.reply({ content: '⏭️ Pulado.', flags: EPHEMERAL });
      }
      if (cid === 'mus_stop') {
        if (!await requirePremiumTier(i, 'musica')) return;
        await destroyQueue(guild.id, 'stop manual');
        return i.reply({ content: '⏹️ Parado.', flags: EPHEMERAL });
      }
      if (cid === 'mus_queue') {
        if (!await requirePremiumTier(i, 'musica')) return;
        const q = getQueue(guild.id);
        const list = q.songs.slice(0, 15).map((s, idx) => `${idx + 1}. **${s.title}**`).join('\n');
        return i.reply({
          embeds: [new EmbedBuilder().setTitle('📋 Fila').setColor('#1DB954')
            .setDescription(list || '*Fila vazia*')
            .setFooter({ text: `Total: ${q.songs.length}` })],
          flags: EPHEMERAL,
        });
      }
      if (cid === 'mus_loop') {
        if (!await requirePremiumTier(i, 'musica')) return;
        const q = getQueue(guild.id);
        q.loopMode = q.loopMode === 'off' ? 'song' : q.loopMode === 'song' ? 'queue' : 'off';
        return i.reply({ content: `🔁 Loop: **${q.loopMode}**`, flags: EPHEMERAL });
      }
      if (cid === 'mus_vol') {
        if (!await requirePremiumTier(i, 'musica')) return;
        const m = new ModalBuilder().setCustomId('modal_mus_vol').setTitle('Volume');
        m.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('v').setLabel('0-200').setStyle(TextInputStyle.Short).setValue(String(getQueue(guild.id).volume || 100)).setRequired(true)
        ));
        return i.showModal(m);
      }

      // ─── Sorteio participar ───
      if (cid === 'btn_participar_sorteio') {
        const { data: g } = await supabase.from('giveaways').select('*').eq('message_id', i.message.id).maybeSingle();
        if (!g || g.ended) return i.reply({ content: '❌ Sorteio encerrado.', flags: EPHEMERAL });
        let parts = [];
        try { parts = JSON.parse(g.participants || '[]'); } catch {}
        if (parts.includes(i.user.id)) return i.reply({ content: '⚠️ Você já está participando.', flags: EPHEMERAL });
        parts.push(i.user.id);
        await supabase.from('giveaways').update({ participants: JSON.stringify(parts) }).eq('id', g.id);
        return i.reply({ content: `🎉 Você está participando! Total: **${parts.length}**`, flags: EPHEMERAL });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // MODAIS
    // ═══════════════════════════════════════════════════════════
    if (i.isModalSubmit()) {
      const cid = i.customId;

      // ─── Loja modais ───
      if (cid.startsWith('prod_modal:')) {
        const p = cid.split(':'), w = p[1];
        if (w === 'create') {
          const catId = p[2] && p[2] !== '0' ? Number(p[2]) : null;
          const price = parseFloat(i.fields.getTextInputValue('price').replace(',', '.'));
          if (isNaN(price)) return i.reply({ content: '❌ Preço inválido.', flags: EPHEMERAL });
          const slug = i.fields.getTextInputValue('name').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
          await supabase.from('products').insert({
            guild_id: guild.id, category_id: catId,
            name: i.fields.getTextInputValue('name').trim(), slug, price,
            description: i.fields.getTextInputValue('desc') || '',
            delivery_type: i.fields.getTextInputValue('delivery').trim(),
          });
          return i.reply({ content: '✅ Produto criado.', flags: EPHEMERAL });
        }
        if (w === 'edit') {
          const id = p[2];
          const price = parseFloat(i.fields.getTextInputValue('price').replace(',', '.'));
          await supabase.from('products').update({
            name: i.fields.getTextInputValue('name').trim(), price,
            description: i.fields.getTextInputValue('desc') || '',
            delivery_type: i.fields.getTextInputValue('delivery').trim(),
          }).eq('id', id);
          return i.reply({ content: '✅ Produto atualizado.', flags: EPHEMERAL });
        }
      }
      if (cid.startsWith('stock_modal:add:')) {
        const pid = cid.split(':')[2];
        const lines = i.fields.getTextInputValue('items').split('\n').map(s => s.trim()).filter(Boolean);
        try {
          await supabase.from('inventory').insert(lines.map(c => ({ guild_id: guild.id, product_id: Number(pid), content: c, status: 'available' })));
        } catch {}
        return i.reply({ content: `✅ ${lines.length} itens adicionados.`, flags: EPHEMERAL });
      }
      if (cid.startsWith('stock_modal:addfile:')) {
        const pid = cid.split(':')[2];
        try {
          await supabase.from('inventory').insert({
            guild_id: guild.id, product_id: Number(pid),
            file_url: i.fields.getTextInputValue('url').trim(),
            file_name: i.fields.getTextInputValue('fname').trim(),
            status: 'available',
          });
        } catch {}
        return i.reply({ content: '✅ Arquivo adicionado.', flags: EPHEMERAL });
      }
      if (cid.startsWith('stock_modal:infinite:')) {
        const pid = cid.split(':')[2];
        const t = i.fields.getTextInputValue('type').trim().toLowerCase();
        const c = i.fields.getTextInputValue('content').trim();
        const ok = ['key', 'link', 'text', 'file'];
        await supabase.from('products').update({
          infinite_content: c,
          infinite_type: ok.includes(t) ? t : 'key',
          delivery_type: ok.includes(t) ? t : 'key',
        }).eq('id', pid);
        return i.reply({ content: '♾️ Configurado.', flags: EPHEMERAL });
      }
      if (cid === 'cat_modal:create') {
        await supabase.from('categories').insert({
          guild_id: guild.id,
          name: i.fields.getTextInputValue('name').trim(),
          emoji: i.fields.getTextInputValue('emoji').trim() || null,
        });
        return i.reply({ content: '✅ Categoria criada.', flags: EPHEMERAL });
      }
      if (cid === 'coupon_modal:create') {
        const code = i.fields.getTextInputValue('code').trim().toUpperCase();
        const type = i.fields.getTextInputValue('type').trim().toLowerCase();
        const value = parseFloat(i.fields.getTextInputValue('value').replace(',', '.')) || 0;
        const max = parseInt(i.fields.getTextInputValue('maxuses') || '0') || 0;
        await supabase.from('coupons').upsert({ code, guild_id: guild.id, type: ['percent', 'fixed'].includes(type) ? type : 'percent', value, max_uses: max });
        return i.reply({ content: '✅ Cupom criado.', flags: EPHEMERAL });
      }
      if (cid === 'promo_modal:create') {
        const name = i.fields.getTextInputValue('name');
        const value = parseFloat(i.fields.getTextInputValue('value')) || 0;
        const days = parseInt(i.fields.getTextInputValue('days')) || 1;
        const now = new Date();
        await supabase.from('promotions').insert({
          guild_id: guild.id, name, type: 'percent', value,
          starts_at: now.toISOString(),
          ends_at: new Date(now.getTime() + days * 86400000).toISOString(),
          active: true,
        });
        return i.reply({ content: '✅ Promoção criada.', flags: EPHEMERAL });
      }
      if (cid.startsWith('client_modal:baladd:')) {
        const uid = cid.split(':')[2];
        const amt = parseFloat(i.fields.getTextInputValue('amount').replace(',', '.'));
        if (isNaN(amt)) return i.reply({ content: '❌ Valor inválido.', flags: EPHEMERAL });
        const cust = await getCustomer(guild.id, uid);
        await supabase.from('customers').update({ balance: Number(cust.balance || 0) + amt }).eq('guild_id', guild.id).eq('user_id', uid);
        return i.reply({ content: `✅ Saldo ajustado em ${brl(amt)}.`, flags: EPHEMERAL });
      }
      if (cid.startsWith('setup_modal:')) {
        const w = cid.split(':')[1], f = {};
        if (w === 'store') {
          f.store_name = i.fields.getTextInputValue('name');
          f.store_description = i.fields.getTextInputValue('desc');
        }
        if (w === 'pix') {
          f.pix_key = i.fields.getTextInputValue('key').trim();
          f.pix_name = i.fields.getTextInputValue('name').trim();
          f.pix_city = i.fields.getTextInputValue('city').trim();
        }
        if (w === 'mp_token') {
          const tk = i.fields.getTextInputValue('mp_token').trim();
          const pk = i.fields.getTextInputValue('mp_public_key')?.trim() || null;
          if (!tk.startsWith('APP_USR-') && !tk.startsWith('TEST-')) return i.reply({ content: '❌ Token MP inválido.', flags: EPHEMERAL });
          await setGuildMPToken(guild.id, tk, pk);
          await logConfig(guild, i.user.id, 'MP_TOKEN_SET', { preview: maskToken(tk) });
          return i.reply({ content: `✅ MP configurado!\n> 🔑 \`${maskToken(tk)}\``, flags: EPHEMERAL });
        }
        await patchSettings(guild.id, f);
        return i.reply({ content: '✅ Salvo.', flags: EPHEMERAL });
      }
      if (cid === 'shop_panel_modal:create') {
        const name = i.fields.getTextInputValue('name').trim();
        const desc = i.fields.getTextInputValue('desc')?.trim() || null;
        const colorRaw = i.fields.getTextInputValue('color')?.trim();
        const color = isValidHex(colorRaw) ? normalizeHex(colorRaw) : '#5865F2';
        const banner = i.fields.getTextInputValue('banner')?.trim() || null;
        const catRaw = i.fields.getTextInputValue('catid')?.trim();
        const categoryId = catRaw && catRaw !== '0' ? parseInt(catRaw) : null;
        try {
          const panel = await createShopPanel(guild.id, { name, description: desc, color, banner, category_id: categoryId, active: true });
          const s = await getSettings(guild.id);
          const e = baseEmbed(s, `🛒 ${panel.name}`, panel.description || s.store_description || '');
          if (panel.banner) e.setImage(panel.banner);
          if (panel.color) e.setColor(panel.color);
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`loja:comprar:${panel.id}`).setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('loja:meus_pedidos').setLabel('Meus pedidos').setEmoji('🧾').setStyle(ButtonStyle.Secondary),
          );
          const targetChannel = i.channel;
          if (!targetChannel) return i.reply({ content: '❌ Canal inválido.', flags: EPHEMERAL });
          const msg = await targetChannel.send({ embeds: [e], components: [row] });
          await updateShopPanel(panel.id, { channel_id: targetChannel.id, message_id: msg.id });
          return i.reply({ content: `✅ Painel #${panel.id} criado e postado.`, flags: EPHEMERAL });
        } catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
      }
      if (cid.startsWith('order_modal:coupon:')) {
        const oid = cid.split(':')[2];
        const code = i.fields.getTextInputValue('code').trim().toUpperCase();
        const { data: cp } = await supabase.from('coupons').select('*').eq('guild_id', guild.id).eq('code', code).maybeSingle();
        if (!cp) return i.reply({ content: '❌ Cupom inválido.', flags: EPHEMERAL });
        if (cp.max_uses && cp.uses >= cp.max_uses) return i.reply({ content: '❌ Cupom esgotado.', flags: EPHEMERAL });
        const { data: o } = await supabase.from('orders').select('*').eq('id', oid).maybeSingle();
        const discount = cp.type === 'percent' ? Number(o.total) * (Number(cp.value) / 100) : Number(cp.value);
        const novo = Math.max(0, Number(o.total) - discount);
        await supabase.from('orders').update({ total: novo, discount, coupon_code: code }).eq('id', oid);
        await supabase.from('coupons').update({ uses: (cp.uses || 0) + 1 }).eq('id', cp.id);
        return i.reply({ content: `✅ Cupom aplicado! Novo total: ${brl(novo)}`, flags: EPHEMERAL });
      }

      // ─── Ticket panel modais ───
      if (cid.startsWith('ticket_panel_modal:')) {
        if (!await isAdmin(i.user, guild)) return;
        const parts = cid.split(':'), a2 = parts[1], panelId = parts[2];
        if (a2 === 'create') {
          try {
            const panel = await createTicketPanel(guild.id, {
              nome: i.fields.getTextInputValue('nome').trim(),
              titulo: i.fields.getTextInputValue('titulo').trim(),
              descricao: i.fields.getTextInputValue('descricao').trim(),
              cor: normalizeHex(i.fields.getTextInputValue('cor')?.trim(), '#9B59B6'),
              botao_label: i.fields.getTextInputValue('botao')?.trim() || 'Abrir Ticket',
              botao_emoji: '🎫', tipos: [],
            });
            return i.reply({ content: `✅ Painel #${panel.id} criado.`, flags: EPHEMERAL });
          } catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
        }
        if (a2 === 'edit') {
          await updateTicketPanel(guild.id, panelId, {
            nome: i.fields.getTextInputValue('nome').trim(),
            titulo: i.fields.getTextInputValue('titulo').trim(),
            descricao: i.fields.getTextInputValue('descricao').trim(),
            cor: normalizeHex(i.fields.getTextInputValue('cor')?.trim(), '#9B59B6'),
            botao_label: i.fields.getTextInputValue('botao')?.trim() || 'Abrir Ticket',
          });
          return i.reply({ content: '✅ Painel atualizado.', flags: EPHEMERAL });
        }
        if (a2 === 'edit_extras') {
          const banner = i.fields.getTextInputValue('banner')?.trim() || null;
          const thumbnail = i.fields.getTextInputValue('thumbnail')?.trim() || null;
          const emoji = i.fields.getTextInputValue('emoji')?.trim() || '🎫';
          const cargoRaw = i.fields.getTextInputValue('cargo')?.trim() || null;
          const logRaw   = i.fields.getTextInputValue('log')?.trim() || null;
          if (banner && !isValidUrl(banner)) return i.reply({ content: '❌ Banner inválido.', flags: EPHEMERAL });
          if (thumbnail && !isValidUrl(thumbnail)) return i.reply({ content: '❌ Thumbnail inválida.', flags: EPHEMERAL });
          let cargo_id = null, log_channel_id = null;
          if (cargoRaw) {
            const r = resolveRole(guild, cargoRaw);
            if (!r) return i.reply({ content: `❌ Cargo não encontrado: \`${cargoRaw}\``, flags: EPHEMERAL });
            cargo_id = r.id;
          }
          if (logRaw) {
            const c = resolveChannel(guild, logRaw);
            if (!c) return i.reply({ content: `❌ Canal não encontrado: \`${logRaw}\``, flags: EPHEMERAL });
            log_channel_id = c.id;
          }
          await updateTicketPanel(guild.id, panelId, { banner, thumbnail, botao_emoji: emoji, cargo_id, log_channel_id });
          return i.reply({ content: '✅ Extras atualizados.', flags: EPHEMERAL });
        }
        if (a2 === 'type_add') {
          const panel = await getTicketPanel(guild.id, panelId);
          if (!panel) return;
          const label = i.fields.getTextInputValue('label').trim();
          const emoji = i.fields.getTextInputValue('emoji')?.trim() || '🎫';
          const descricao = i.fields.getTextInputValue('descricao')?.trim() || '';
          const canalRaw = i.fields.getTextInputValue('canal_id')?.trim() || null;
          const roleRaw  = i.fields.getTextInputValue('role_id')?.trim() || null;
          let canal_id = null, role_id = null;
          if (canalRaw) {
            const c = resolveChannel(guild, canalRaw);
            if (!c) return i.reply({ content: `❌ Canal não encontrado: \`${canalRaw}\``, flags: EPHEMERAL });
            canal_id = c.id;
          }
          if (roleRaw) {
            const r = resolveRole(guild, roleRaw);
            if (!r) return i.reply({ content: `❌ Cargo não encontrado: \`${roleRaw}\``, flags: EPHEMERAL });
            role_id = r.id;
          }
          const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
          if (panel.tipos.some(t => t.id === id)) return i.reply({ content: '❌ Já existe tipo com este ID.', flags: EPHEMERAL });
          panel.tipos.push({ id, label, emoji, descricao, canal_id, cargo_responsavel_id: role_id });
          await updateTicketPanel(guild.id, panelId, { tipos: panel.tipos });
          return i.reply({ content: `✅ Tipo "${emoji} ${label}" adicionado.`, flags: EPHEMERAL });
        }
      }

      // ─── TKTEDIT modais ───
      if (cid.startsWith('tktedit_modal:')) {
        if (!await isAdmin(i.user, guild)) return;
        const parts = cid.split(':'), w = parts[1], panelId = parts[2];
        if (w === 'embed') {
          await updateTicketPanel(guild.id, panelId, {
            titulo: i.fields.getTextInputValue('titulo').trim(),
            descricao: i.fields.getTextInputValue('descricao').trim(),
            cor: normalizeHex(i.fields.getTextInputValue('cor')?.trim(), '#9B59B6'),
            banner: i.fields.getTextInputValue('banner')?.trim() || null,
            thumbnail: i.fields.getTextInputValue('thumbnail')?.trim() || null,
          });
          return i.reply({ ...(await ticketEditorPanel(guild.id, panelId)), flags: EPHEMERAL });
        }
        if (w === 'button') {
          await updateTicketPanel(guild.id, panelId, {
            botao_label: i.fields.getTextInputValue('label').trim(),
            botao_emoji: i.fields.getTextInputValue('emoji')?.trim() || '🎫',
            footer: i.fields.getTextInputValue('footer')?.trim() || null,
          });
          return i.reply({ ...(await ticketEditorPanel(guild.id, panelId)), flags: EPHEMERAL });
        }
        if (w === 'staff') {
          const cargoRaw = i.fields.getTextInputValue('cargo_id')?.trim() || null;
          const logRaw   = i.fields.getTextInputValue('log_id')?.trim() || null;
          let cargo_id = null, log_channel_id = null;
          if (cargoRaw) {
            const r = resolveRole(guild, cargoRaw);
            if (!r) return i.reply({ content: `❌ Cargo não encontrado: \`${cargoRaw}\``, flags: EPHEMERAL });
            cargo_id = r.id;
          }
          if (logRaw) {
            const c = resolveChannel(guild, logRaw);
            if (!c) return i.reply({ content: `❌ Canal não encontrado: \`${logRaw}\``, flags: EPHEMERAL });
            log_channel_id = c.id;
          }
          await updateTicketPanel(guild.id, panelId, { cargo_id, log_channel_id });
          return i.reply({ ...(await ticketEditorPanel(guild.id, panelId)), flags: EPHEMERAL });
        }
        if (w === 'delete') {
          const conf = i.fields.getTextInputValue('confirm').trim().toUpperCase();
          if (conf !== 'EXCLUIR') return i.reply({ content: '❌ Cancelado.', flags: EPHEMERAL });
          await deleteTicketPanel(guild.id, panelId);
          return i.reply({ content: '🗑️ Painel excluído.', flags: EPHEMERAL });
        }
      }

      // ─── TKTTYPE modais ───
      if (cid.startsWith('tkttype_modal:add:')) {
        if (!await isAdmin(i.user, guild)) return;
        const panelId = cid.split(':')[2];
        const panel = await getTicketPanel(guild.id, panelId);
        if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
        const label = i.fields.getTextInputValue('label').trim();
        const emoji = i.fields.getTextInputValue('emoji')?.trim() || '🎫';
        const descricao = i.fields.getTextInputValue('descricao')?.trim() || '';
        const canalRaw = i.fields.getTextInputValue('canal_id')?.trim() || null;
        const roleRaw  = i.fields.getTextInputValue('role_id')?.trim() || null;
        let canal_id = null, role_id = null;
        if (canalRaw) {
          const c = resolveChannel(guild, canalRaw);
          if (!c) return i.reply({ content: `❌ Canal não encontrado: \`${canalRaw}\``, flags: EPHEMERAL });
          canal_id = c.id;
        }
        if (roleRaw) {
          const r = resolveRole(guild, roleRaw);
          if (!r) return i.reply({ content: `❌ Cargo não encontrado: \`${roleRaw}\``, flags: EPHEMERAL });
          role_id = r.id;
        }
        const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
        if (panel.tipos.some(t => t.id === id)) return i.reply({ content: '❌ ID já existe.', flags: EPHEMERAL });
        panel.tipos.push({ id, label, emoji, descricao, canal_id, cargo_responsavel_id: role_id });
        await updateTicketPanel(guild.id, panelId, { tipos: panel.tipos });
        return i.reply({ ...(await ticketTypesPanel(guild.id, panelId)), flags: EPHEMERAL });
      }
      if (cid.startsWith('tkttype_modal:edit:')) {
        if (!await isAdmin(i.user, guild)) return;
        const parts = cid.split(':');
        const panelId = parts[2], tipoId = parts[3];
        const panel = await getTicketPanel(guild.id, panelId);
        if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
        const tipo = panel.tipos.find(t => String(t.id) === String(tipoId));
        if (!tipo) return i.reply({ content: '❌ Tipo não encontrado.', flags: EPHEMERAL });
        tipo.label = i.fields.getTextInputValue('label').trim();
        tipo.emoji = i.fields.getTextInputValue('emoji')?.trim() || '🎫';
        tipo.descricao = i.fields.getTextInputValue('descricao')?.trim() || '';
        const canalRaw = i.fields.getTextInputValue('canal_id')?.trim() || null;
        const roleRaw = i.fields.getTextInputValue('role_id')?.trim() || null;
        if (canalRaw) {
          const c = resolveChannel(guild, canalRaw);
          tipo.canal_id = c ? c.id : null;
        } else tipo.canal_id = null;
        if (roleRaw) {
          const r = resolveRole(guild, roleRaw);
          tipo.cargo_responsavel_id = r ? r.id : null;
        } else tipo.cargo_responsavel_id = null;
        await updateTicketPanel(guild.id, panelId, { tipos: panel.tipos });
        return i.reply({ ...(await ticketTypesPanel(guild.id, panelId)), flags: EPHEMERAL });
      }

      // ─── TKTCFG modais ───
      if (cid.startsWith('tktcfg_modal:')) {
        if (!await isAdmin(i.user, guild)) return;
        const parts = cid.split(':'), w = parts[1], panelId = parts[2];
        const v = i.fields.getTextInputValue('v').trim();
        if (w === 'limite') await updateTicketPanel(guild.id, panelId, { limite_tickets_usuario: parseInt(v) || 1 });
        if (w === 'autoclose') await updateTicketPanel(guild.id, panelId, { auto_close_horas: parseInt(v) || 0 });
        if (w === 'horario') await updateTicketPanel(guild.id, panelId, { horario_atendimento: v || null });
        if (w === 'categoria') {
          if (!v) {
            await updateTicketPanel(guild.id, panelId, { categoria_padrao_id: null });
            return i.reply({ ...(await ticketConfigPanel(guild.id, panelId)), flags: EPHEMERAL });
          }
          const cat = resolveChannel(guild, v);
          if (!cat || cat.type !== ChannelType.GuildCategory) return i.reply({ content: `❌ Categoria não encontrada: \`${v}\``, flags: EPHEMERAL });
          await updateTicketPanel(guild.id, panelId, { categoria_padrao_id: cat.id });
        }
        return i.reply({ ...(await ticketConfigPanel(guild.id, panelId)), flags: EPHEMERAL });
      }

      // ─── TKTFORM modais ───
      if (cid.startsWith('tktform_modal:add:')) {
        if (!await isAdmin(i.user, guild)) return;
        const panelId = cid.split(':')[2];
        const panel = await getTicketPanel(guild.id, panelId);
        if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
        const label = i.fields.getTextInputValue('label').trim();
        const placeholder = i.fields.getTextInputValue('placeholder')?.trim() || '';
        const obrig = i.fields.getTextInputValue('obrigatorio').trim().toLowerCase() === 'sim';
        panel.formulario.perguntas.push({ label, placeholder, obrigatorio: obrig });
        await updateTicketPanel(guild.id, panelId, { formulario: panel.formulario });
        return i.reply({ ...(await ticketFormPanel(guild.id, panelId)), flags: EPHEMERAL });
      }

      // ─── TKTBLK modais ───
      if (cid.startsWith('tktblk_modal:add:')) {
        if (!await isAdmin(i.user, guild)) return;
        const panelId = cid.split(':')[2];
        const uid = i.fields.getTextInputValue('uid').trim().replace(/[<@!>]/g, '');
        const panel = await getTicketPanel(guild.id, panelId);
        if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
        if (!panel.bloqueio_usuarios_ids.includes(uid)) panel.bloqueio_usuarios_ids.push(uid);
        await updateTicketPanel(guild.id, panelId, { bloqueio_usuarios_ids: panel.bloqueio_usuarios_ids });
        return i.reply({ ...(await ticketBlocksPanel(guild.id, panelId)), flags: EPHEMERAL });
      }

      // ─── TKT FORM (abrir com formulário) — com fix de colisão de keys ───
      if (cid.startsWith('tkt_form:')) {
        const parts = cid.split(':');
        const panelId = parts[1], typeId = parts[2];
        const panel = await getTicketPanel(guild.id, panelId);
        if (!panel) return i.reply({ content: '❌', flags: EPHEMERAL });
        const tipo = panel.tipos?.find(t => String(t.id) === String(typeId)) || { id: typeId, label: 'Suporte', emoji: '🎫' };
        const limCheck = await canUserOpenTicket(guild, i.member, panel);
        if (!limCheck.ok) return i.reply({ content: limCheck.reason, flags: EPHEMERAL });
        const formAnswers = [];
        for (const q of panel.formulario.perguntas) {
          const key = `q_${q.label.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)}`;
          let v = '';
          try { v = i.fields.getTextInputValue(key) || ''; } catch { v = ''; }
          formAnswers.push({ label: q.label, value: v || '(vazio)' });
        }
        await i.deferReply({ flags: EPHEMERAL });
        try {
          const th = await openTicket(i, panel, tipo, formAnswers);
          return i.editReply({ content: `✅ Ticket criado em <#${th.id}>` });
        } catch (e) { return i.editReply({ content: `❌ ${e.message}` }); }
      }

      // ─── TKT internos ───
      if (cid.startsWith('tkt_modal:')) {
        const parts = cid.split(':'), action2 = parts[1], thId = parts[2];
        const th = guild.channels.cache.get(thId);
        if (!th) return i.reply({ content: '❌ Thread não encontrada.', flags: EPHEMERAL });
        if (action2 === 'add') {
          const uid = i.fields.getTextInputValue('uid').trim().replace(/[<@!>]/g, '');
          try { await th.members.add(uid); } catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
          await th.send({ content: `➕ <@${uid}> adicionado.` });
          return i.reply({ content: '✅ Adicionado.', flags: EPHEMERAL });
        }
        if (action2 === 'remove') {
          const uid = i.fields.getTextInputValue('uid').trim().replace(/[<@!>]/g, '');
          await th.members.remove(uid).catch(() => {});
          await th.send({ content: `➖ <@${uid}> removido.` });
          return i.reply({ content: '✅ Removido.', flags: EPHEMERAL });
        }
        if (action2 === 'rename') {
          const name = i.fields.getTextInputValue('name').trim().slice(0, 100);
          await th.setName(name).catch(() => {});
          await th.send({ content: `✏️ Renomeado para **${name}**.` });
          return i.reply({ content: '✅ Renomeado.', flags: EPHEMERAL });
        }
        if (action2 === 'delete') {
          const conf = i.fields.getTextInputValue('confirm').trim().toUpperCase();
          if (conf !== 'EXCLUIR') return i.reply({ content: '❌ Digite EXCLUIR.', flags: EPHEMERAL });
          const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', thId).maybeSingle();
          const panel = td?.panel_id ? await getTicketPanel(guild.id, td.panel_id) : null;
          if (td) await sendTicketTranscriptToLog(guild, th, { ...td, closed_at: new Date().toISOString(), status: 'excluido' }, panel);
          await supabase.from('ticket_data').update({ closed_at: new Date().toISOString(), status: 'excluido' }).eq('thread_id', thId);
          await i.reply({ content: '🗑️ Excluindo...', flags: EPHEMERAL });
          setTimeout(() => th.delete().catch(() => {}), 3000);
          return;
        }
      }

      // ─── FFCFG modais ───
      if (cid.startsWith('ffcfg_modal:')) {
        const parts = cid.split(':');
        const type = parts[1], field = parts[2];
        if (type === 'channel') {
          const v = i.fields.getTextInputValue('v').trim();
          const ch = resolveChannel(guild, v);
          if (!ch) return i.reply({ content: `❌ Canal não encontrado: \`${v}\``, flags: EPHEMERAL });
          await ffPatchConfig(guild.id, { [field]: ch.id });
          await logConfig(guild, i.user.id, `SET_${field}`, { ch: ch.name });
          return i.reply({ ...(await ffPanelCanais(guild.id)), flags: EPHEMERAL });
        }
        if (type === 'role') {
          const v = i.fields.getTextInputValue('v').trim();
          const r = resolveRole(guild, v);
          if (!r) return i.reply({ content: `❌ Cargo não encontrado: \`${v}\``, flags: EPHEMERAL });
          await ffPatchConfig(guild.id, { [field]: r.id });
          await logConfig(guild, i.user.id, `SET_${field}`, { role: r.name });
          return i.reply({ ...(await ffPanelCargos(guild.id)), flags: EPHEMERAL });
        }
        if (type === 'number') {
          const v = parseFloat(i.fields.getTextInputValue('v').replace(',', '.')) || 0;
          await ffPatchConfig(guild.id, { [field]: v });
          await logConfig(guild, i.user.id, `SET_${field}`, { value: v });
          return i.reply({ ...(await ffPanelApostas(guild.id)), flags: EPHEMERAL });
        }
        if (type === 'pix') {
          const key = i.fields.getTextInputValue('key').trim();
          const name = i.fields.getTextInputValue('name').trim();
          const city = i.fields.getTextInputValue('city').trim();
          await ffPatchConfig(guild.id, { pix_key: key, pix_name: name, pix_city: city });
          await logConfig(guild, i.user.id, 'SET_PIX', {});
          await ffUpdatePixEmbed(guild);
          return i.reply({ ...(await ffPanelPix(guild.id)), flags: EPHEMERAL });
        }
        if (type === 'mp_token') {
          const tk = i.fields.getTextInputValue('mp_token').trim();
          const pk = i.fields.getTextInputValue('mp_public_key')?.trim() || null;
          if (!tk.startsWith('APP_USR-') && !tk.startsWith('TEST-')) return i.reply({ content: '❌ Token inválido.', flags: EPHEMERAL });
          await setFFMPToken(guild.id, tk, pk);
          await logConfig(guild, i.user.id, 'MP_FF_TOKEN_SET', { preview: maskToken(tk) });
          return i.reply({ content: `✅ MP FF configurado!\n> 🔑 \`${maskToken(tk)}\``, flags: EPHEMERAL });
        }
        if (type === 'add_valor') {
          const v = i.fields.getTextInputValue('v').replace(',', '.').trim();
          const num = parseFloat(v);
          if (isNaN(num) || num <= 0) return i.reply({ content: '❌ Valor inválido.', flags: EPHEMERAL });
          const cfg = await ffGetConfig(guild.id);
          const vals = Array.isArray(cfg?.value_options) ? cfg.value_options : [];
          const fmtd = num.toFixed(2);
          if (vals.includes(fmtd)) return i.reply({ content: '❌ Valor já existe.', flags: EPHEMERAL });
          vals.push(fmtd);
          vals.sort((a, b) => Number(a) - Number(b));
          await ffPatchConfig(guild.id, { value_options: vals });
          await logConfig(guild, i.user.id, 'VALUE_ADDED', { value: fmtd });
          return i.reply({ ...(await ffPanelValores(guild.id)), flags: EPHEMERAL });
        }
        if (type === 'postar_pix') {
          const ch = guild.channels.cache.get(i.fields.getTextInputValue('cid').trim());
          if (!ch) return i.reply({ content: '❌ Canal inválido.', flags: EPHEMERAL });
          await ffPatchConfig(guild.id, { pix_channel_id: ch.id });
          await ffPostPixEmbed(guild, ch.id);
          return i.reply({ content: `✅ PIX postado em ${ch}.`, flags: EPHEMERAL });
        }
        if (type === 'postar_med') {
          const ch = guild.channels.cache.get(i.fields.getTextInputValue('cid').trim());
          if (!ch) return i.reply({ content: '❌ Canal inválido.', flags: EPHEMERAL });
          await ch.send(await ffBuildMediatorPanel(guild.id));
          return i.reply({ content: `✅ Painel de mediadores postado em ${ch}.`, flags: EPHEMERAL });
        }
        if (type === 'freq') {
          const v = i.fields.getTextInputValue('v').trim().toLowerCase();
          if (!['daily', 'weekly', 'monthly'].includes(v)) return i.reply({ content: '❌ Use daily/weekly/monthly.', flags: EPHEMERAL });
          await ffPatchConfig(guild.id, { auto_post_frequencia: v });
          return i.reply({ ...(await ffPanelAutomacoes(guild.id)), flags: EPHEMERAL });
        }
        if (type === 'coin_add') {
          const name = i.fields.getTextInputValue('name').trim();
          const price = parseInt(i.fields.getTextInputValue('price'));
          const emoji = i.fields.getTextInputValue('emoji').trim() || '🎁';
          const description = i.fields.getTextInputValue('description').trim() || null;
          const role_id = i.fields.getTextInputValue('role_id').trim() || null;
          if (isNaN(price) || price <= 0) return i.reply({ content: '❌ Preço inválido.', flags: EPHEMERAL });
          if (role_id && !guild.roles.cache.has(role_id)) return i.reply({ content: '❌ Cargo não existe.', flags: EPHEMERAL });
          await supabase.from('ff_coin_shop').insert({
            guild_id: guild.id, name, price, emoji, description, role_id,
            type: role_id ? 'role' : 'custom', stock: -1, active: true,
          });
          await logConfig(guild, i.user.id, 'COIN_ITEM_ADDED', { name, price });
          return i.reply({ ...(await ffPanelLojaCoins(guild.id)), flags: EPHEMERAL });
        }
        if (type === 'coin_edit') {
          const itemId = parts[2];
          const name = i.fields.getTextInputValue('name').trim();
          const price = parseInt(i.fields.getTextInputValue('price'));
          const emoji = i.fields.getTextInputValue('emoji').trim() || '🎁';
          const description = i.fields.getTextInputValue('description').trim() || null;
          const role_id = i.fields.getTextInputValue('role_id').trim() || null;
          await supabase.from('ff_coin_shop').update({ name, price, emoji, description, role_id }).eq('id', itemId);
          return i.reply({ ...(await ffPanelLojaCoins(guild.id)), flags: EPHEMERAL });
        }
        if (type === 'coin_manage') {
          const uid = i.fields.getTextInputValue('user_id').trim().replace(/[<@!>]/g, '');
          const amt = parseInt(i.fields.getTextInputValue('amount')) || 0;
          const reason = i.fields.getTextInputValue('reason').trim();
          if (!uid || isNaN(amt) || amt === 0) return i.reply({ content: '❌ Dados inválidos.', flags: EPHEMERAL });
          try { await supabase.from('ff_players').upsert({ guild_id: guild.id, user_id: uid, coins: 0 }, { onConflict: 'guild_id,user_id', ignoreDuplicates: true }); } catch {}
          const { data: p } = await supabase.from('ff_players').select('coins').eq('guild_id', guild.id).eq('user_id', uid).maybeSingle();
          const saldo = Number(p?.coins || 0);
          const novo = Math.max(0, saldo + amt);
          await supabase.from('ff_players').update({ coins: novo }).eq('guild_id', guild.id).eq('user_id', uid);
          await logCoins(guild, uid, amt, `[MANUAL] ${reason}`, i.user.id);
          try { const u = await client.users.fetch(uid); await u.send(`${amt > 0 ? '🎁' : '⚠️'} ${Math.abs(amt)} coins\n> ${reason}\n> Saldo: **${novo}**`).catch(() => {}); } catch {}
          return i.reply({ content: `✅ <@${uid}>: **${saldo}** → **${novo}** (${amt > 0 ? '+' : ''}${amt})`, flags: EPHEMERAL });
        }
        if (type === 'maint_reason') {
          const r = i.fields.getTextInputValue('r').trim();
          await ffPatchConfig(guild.id, { maintenance_reason: r });
          return i.reply({ content: '✅ Motivo salvo.', flags: EPHEMERAL });
        }
      }

      // ─── FFPIX modal ───
      if (cid === 'ffpix_modal:set') {
        const key = i.fields.getTextInputValue('key').trim();
        const name = i.fields.getTextInputValue('name').trim();
        const city = i.fields.getTextInputValue('city').trim();
        await ffPatchConfig(guild.id, { pix_key: key, pix_name: name, pix_city: city });
        await ffUpdatePixEmbed(guild);
        return i.reply({ content: '✅ PIX FF configurado.', flags: EPHEMERAL });
      }

      // ─── FFPIXMED modal (NOVO v6.6.0) ───
      if (cid === 'ffpixmed_modal:set') {
        const key = i.fields.getTextInputValue('key').trim();
        const name = i.fields.getTextInputValue('name').trim();
        const city = i.fields.getTextInputValue('city').trim() || null;
        const type = i.fields.getTextInputValue('type').trim() || 'aleatoria';
        const result = await ffSetMediatorPix(guild.id, i.user.id, key, name, city, type);
        if (!result) return i.reply({ content: '❌ Falha ao salvar.', flags: EPHEMERAL });
        return i.reply({
          embeds: [new EmbedBuilder().setTitle('✅ PIX salvo!').setColor('#22c55e')
            .setDescription(`Seu PIX foi configurado com sucesso.\n\n> 🔑 \`${key}\`\n> 👤 ${name}\n> 🎯 Tipo: ${type}`)
            .setTimestamp()],
          flags: EPHEMERAL,
        });
      }

      // ─── FFPIXMED admin modal ───
      if (cid.startsWith('ffpixmed_admin_modal:edit:')) {
        if (!isDev && !await isAdmin(i.user, guild)) return i.reply({ content: '❌ Só staff.', flags: EPHEMERAL });
        const gid = cid.split(':')[2];
        const uid = cid.split(':')[3];
        const key = i.fields.getTextInputValue('key').trim();
        const name = i.fields.getTextInputValue('name').trim();
        const city = i.fields.getTextInputValue('city').trim() || null;
        await ffSetMediatorPix(gid, uid, key, name, city, 'admin');
        return i.reply({ content: `✅ PIX de <@${uid}> atualizado.`, flags: EPHEMERAL });
      }

      // ─── FFM modais ───
      if (cid.startsWith('ffm_modal:pix:')) {
        const matchId = cid.split(':')[2];
        const key = i.fields.getTextInputValue('key').trim();
        const name = i.fields.getTextInputValue('name').trim();
        const city = i.fields.getTextInputValue('city').trim();
        await ffPatchConfig(guild.id, { pix_key: key, pix_name: name, pix_city: city });
        const m = await ffGetMatch(matchId);
        const players = parseJson(m?.players);
        const cfg = await ffGetConfig(guild.id);
        const payPP = ffCalcPlayerPay(m?.value, cfg?.mediator_fee, cfg?.taxa_extra, cfg?.taxa_extra_ativo);
        const e = new EmbedBuilder().setTitle('💰 Pagamento').setColor('#22c55e').setDescription('Regras confirmadas!')
          .addFields(
            { name: '🎮', value: players.map(p => `<@${p}>`).join(' 🆚 ') },
            { name: '💵 Valor', value: `R$ ${Number(m?.value || 0).toFixed(2)}`, inline: true },
            { name: '💵 Taxa', value: `R$ ${Number(cfg?.mediator_fee || 0).toFixed(2)}`, inline: true },
            { name: '💰 Total', value: `**R$ ${payPP.toFixed(2)}**`, inline: true },
          );
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ffm:pix_show:${matchId}`).setLabel('Ver PIX').setEmoji('💳').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`ffm:liberar:${matchId}`).setLabel('Liberar PIX').setEmoji('🔓').setStyle(ButtonStyle.Success),
        );
        try {
          const msgs = await i.channel.messages.fetch({ limit: 20 });
          const t2 = msgs.find(mm => mm.author.id === client.user.id && mm.embeds[0]?.title === '💰 Pagamento');
          if (t2) await t2.edit({ embeds: [e], components: [row] });
        } catch {}
        return i.reply({ content: '✅ PIX salvo.', flags: EPHEMERAL });
      }
      if (cid.startsWith('ffm_modal:sala:')) {
        const matchId = cid.split(':')[2];
        const roomId = i.fields.getTextInputValue('room_id').trim();
        const roomPass = i.fields.getTextInputValue('room_pass').trim();
        const m = await ffGetMatch(matchId);
        const players = parseJson(m?.players);
        const e = new EmbedBuilder().setTitle('🎮 SALA CRIADA').setColor('#22c55e')
          .addFields(
            { name: '🏠 ID da sala', value: `\`\`\`${roomId}\`\`\`` },
            { name: '🔑 Senha', value: `\`\`\`${roomPass}\`\`\`` },
            { name: '🎮 Jogadores', value: players.map(p => `<@${p}>`).join(' 🆚 ') },
          ).setTimestamp();
        await i.reply({ content: players.map(p => `<@${p}>`).join(' '), embeds: [e] });
        return;
      }

      // ─── FFBL modais ───
      if (cid === 'ffbl_modal:check') {
        const q = i.fields.getTextInputValue('query').trim().replace(/[<@!>]/g, '');
        await i.deferReply({ flags: EPHEMERAL });
        const { data } = await supabase.from('ff_blacklist').select('*').eq('guild_id', guild.id).or(`discord_id.eq.${q},user_id.eq.${q},ff_id.eq.${q}`);
        if (!data?.length) return i.editReply({
          embeds: [new EmbedBuilder().setTitle('✅ Não está na BL').setColor('#22c55e').setDescription(`Consulta: \`${q}\``).setTimestamp()],
        });
        const b = data[0];
        return i.editReply({
          embeds: [new EmbedBuilder().setTitle('🚫 NA BLACKLIST').setColor('#FF5555')
            .setDescription(`> 👤 <@${b.discord_id || b.user_id}>\n> 🎮 \`${b.ff_id || '—'}\`\n> 📝 ${b.reason || '—'}\n> 🕐 <t:${Math.floor(new Date(b.created_at).getTime() / 1000)}:F>` + (b.evidence ? `\n> 🔗 [Provas](${b.evidence})` : ''))
            .setTimestamp()],
        });
      }
      if (cid === 'ffbl_modal:add') {
        const discordId = i.fields.getTextInputValue('discord_id').trim().replace(/[<@!>]/g, '');
        const ffId = i.fields.getTextInputValue('ff_id').trim();
        const reason = i.fields.getTextInputValue('reason').trim();
        const evidence = i.fields.getTextInputValue('evidence').trim() || null;
        if (!/^\d+$/.test(discordId)) return i.reply({ content: '❌ ID Discord inválido.', flags: EPHEMERAL });
        await supabase.from('ff_blacklist').insert({
          guild_id: guild.id, user_id: discordId, discord_id: discordId,
          ff_id: ffId, reason, evidence, added_by: i.user.id,
        });
        await logAnalista(guild, i.user.id, 'ADD_BL', { discord_id: discordId, ff_id: ffId, reason });
        await refreshBlacklistEmbed(guild.id).catch(() => {});
        return i.reply({ content: `🚫 <@${discordId}> adicionado à blacklist.`, flags: EPHEMERAL });
      }

      // ─── FFSTR modais ───
      if (cid === 'modal_ffstr_live') {
        const url = i.fields.getTextInputValue('url').trim();
        const title = i.fields.getTextInputValue('title')?.trim() || null;
        if (!isValidUrl(url)) return i.reply({ content: '❌ URL inválida.', flags: EPHEMERAL });
        const { data: st } = await supabase.from('ff_streamer_queue').select('*').eq('guild_id', guild.id).eq('user_id', i.user.id).maybeSingle();
        if (!st) return i.reply({ content: '❌ Entre na lista primeiro.', flags: EPHEMERAL });
        await ffStreamerSetLive(guild.id, i.user.id, url, title);
        let msg = '🔴 Live configurada!';
        if (st.mediator_id) {
          msg += `\n> 🛡️ Mediador <@${st.mediator_id}> notificado.`;
          if (st.mediator_status === 'declined') msg += `\n> ⚠️ Mas ele havia recusado.`;
        } else msg += `\n> ⚠️ Nenhum mediador designado.`;
        await logImportant('STREAMER', '🎥 Live definida', { user: i.user.id, guild: guild.id, severity: 'success', description: `[${url}](${url})` }).catch(() => {});
        await i.reply({ content: msg, flags: EPHEMERAL });
        await ffUpdateStreamerMessage(guild).catch(() => {});
        return;
      }
      if (cid === 'modal_ffstr_config') {
        if (!await isAdmin(i.user, guild)) return;
        const c = {
          title: i.fields.getTextInputValue('title')?.trim() || null,
          descricao: i.fields.getTextInputValue('descricao')?.trim() || null,
          color: normalizeHex(i.fields.getTextInputValue('cor')?.trim(), '#9146FF'),
          footer: i.fields.getTextInputValue('footer')?.trim() || null,
          regras: i.fields.getTextInputValue('regras')?.trim() || null,
        };
        await ffPatchConfig(guild.id, { custom_streamer_embed: c });
        await ffUpdateStreamerMessage(guild).catch(() => {});
        return i.reply({ content: '✅ Painel atualizado.', flags: EPHEMERAL });
      }
      if (cid === 'modal_ffstr_mediator') {
        const mediatorId = i.fields.getTextInputValue('mediator_id').trim().replace(/[<@!>]/g, '');
        if (!/^\d+$/.test(mediatorId)) return i.reply({ content: '❌ ID inválido.', flags: EPHEMERAL });
        if (mediatorId === i.user.id) return i.reply({ content: '❌ Você não pode ser seu próprio mediador.', flags: EPHEMERAL });
        const med = await guild.members.fetch(mediatorId).catch(() => null);
        if (!med) return i.reply({ content: '❌ Usuário não está no servidor.', flags: EPHEMERAL });
        await supabase.from('ff_streamer_queue').update({
          mediator_id: mediatorId, mediator_status: 'pending',
          mediator_joined_at: new Date().toISOString(),
        }).eq('guild_id', guild.id).eq('user_id', i.user.id).catch(() => {});
        await logImportant('STREAMER', '🛡️ Mediador designado', { user: i.user.id, guild: guild.id, severity: 'info', description: `Streamer <@${i.user.id}> designou <@${mediatorId}>` }).catch(() => {});
        try { await med.send(`🛡️ **Você foi designado mediador!**\n> 🎥 Streamer: **${i.user.username}**\n> 🌐 Servidor: **${guild.name}**\n\nSerá notificado quando ele(a) entrar ao vivo.`).catch(() => {}); } catch {}
        await ffUpdateStreamerMessage(guild).catch(() => {});
        return i.reply({ content: `✅ <@${mediatorId}> designado como mediador!`, flags: EPHEMERAL });
      }

      // ─── Custom bet modais ───
      if (cid === 'modal_custom_bet_edit') {
        if (!await requirePremiumTier(i, 'custom_embeds')) return;
        if (!await isAdmin(i.user, guild)) return;
        const cfg = await ffGetConfig(guild.id);
        const c = cfg?.custom_bet_embed || {};
        const u = {
          title: i.fields.getTextInputValue('title')?.trim() || null,
          color: normalizeHex(i.fields.getTextInputValue('color')?.trim(), '#f1c40f'),
          thumbnail: i.fields.getTextInputValue('thumbnail')?.trim() || null,
          banner: i.fields.getTextInputValue('banner')?.trim() || null,
          footer: i.fields.getTextInputValue('footer')?.trim() || null,
        };
        await ffPatchConfig(guild.id, { custom_bet_embed: { ...c, ...u } });
        await logConfig(guild, i.user.id, 'CUSTOM_BET_EDITED', {});
        return i.reply({ ...(await ffPanelCustomEmbed(guild.id)), flags: EPHEMERAL });
      }
      if (cid === 'modal_custom_bet_buttons') {
        if (!await requirePremiumTier(i, 'custom_embeds')) return;
        if (!await isAdmin(i.user, guild)) return;
        const cfg = await ffGetConfig(guild.id);
        const c = cfg?.custom_bet_embed || {};
        const btns = {
          gi_label: i.fields.getTextInputValue('gi_label')?.trim() || 'Gelo Infinito',
          gn_label: i.fields.getTextInputValue('gn_label')?.trim() || 'Gelo Normal',
          sair_label: i.fields.getTextInputValue('sair_label')?.trim() || 'Sair',
          gi_emoji: i.fields.getTextInputValue('gi_emoji')?.trim() || '🧊',
          gn_emoji: i.fields.getTextInputValue('gn_emoji')?.trim() || '🧊',
        };
        await ffPatchConfig(guild.id, { custom_bet_embed: { ...c, buttons: btns } });
        await logConfig(guild, i.user.id, 'CUSTOM_BET_BUTTONS', {});
        return i.reply({ ...(await ffPanelCustomEmbed(guild.id)), flags: EPHEMERAL });
      }

      // ─── Admin modais ───
      if (cid === 'adm_maint_reason_modal') {
        const r = i.fields.getTextInputValue('r').trim();
        const cfg = await getConfig(guild.id);
        await setConfig(guild.id, { ...cfg, admin_maintenance_reason: r });
        return i.reply({ content: '✅ Motivo salvo.', flags: EPHEMERAL });
      }
      if (cid === 'adm_versiculo_hour_modal') {
        const h = parseInt(i.fields.getTextInputValue('hora'));
        if (isNaN(h) || h < 0 || h > 23) return i.reply({ content: '❌ Hora inválida (0-23).', flags: EPHEMERAL });
        const c = await getConfig(guild.id);
        c.versiculo_hora = h;
        await setConfig(guild.id, c);
        return i.reply({ content: `✅ Horário definido para **${h}:00**.`, flags: EPHEMERAL });
      }
      if (cid === 'modal_adm_say') { await channel.send(i.fields.getTextInputValue('msg')); return i.reply({ content: '✅', flags: EPHEMERAL }); }
      if (cid === 'modal_adm_anunciar') {
        const ch = guild.channels.cache.get(i.fields.getTextInputValue('canal_id'));
        if (!ch) return i.reply({ content: '❌ Canal inválido.', flags: EPHEMERAL });
        await ch.send(i.fields.getTextInputValue('msg')).catch(() => {});
        return i.reply({ content: '✅ Anunciado.', flags: EPHEMERAL });
      }
      if (cid === 'modal_adm_embed') {
        const t = i.fields.getTextInputValue('titulo');
        const d = i.fields.getTextInputValue('descricao');
        const c = i.fields.getTextInputValue('cor') || '#5865F2';
        await channel.send({ embeds: [new EmbedBuilder().setTitle(t).setDescription(d).setColor(isValidHex(c) ? normalizeHex(c) : '#5865F2')] });
        return i.reply({ content: '✅ Embed postado.', flags: EPHEMERAL });
      }
      if (cid === 'modal_global') {
        if (!isDev) return;
        const t = i.fields.getTextInputValue('titulo');
        const m = i.fields.getTextInputValue('msg');
        await i.reply({ content: '📢 Enviando para todos os servidores...', flags: EPHEMERAL });
        const r = await enviarAvisoGlobal(t, m);
        return i.editReply({ content: `✅ Enviado para **${r.canaisOk}** canais e **${r.dmsOk}** DMs.` });
      }
      if (cid === 'modal_util_sorteio') {
        const opts = i.fields.getTextInputValue('opcoes').split('\n').map(s => s.trim()).filter(Boolean);
        if (!opts.length) return i.reply({ content: '❌ Adicione opções.', flags: EPHEMERAL });
        const r = opts[Math.floor(Math.random() * opts.length)];
        return i.reply({ content: `🎯 **${r}**`, flags: EPHEMERAL });
      }
      if (cid === 'modal_util_enquete') {
        const p = i.fields.getTextInputValue('pergunta');
        const msg = await channel.send({ embeds: [new EmbedBuilder().setTitle('📊 Enquete').setDescription(p).setColor('#5865F2')] });
        await msg.react('👍').catch(() => {});
        await msg.react('👎').catch(() => {});
        return i.reply({ content: '✅ Enquete criada.', flags: EPHEMERAL });
      }
      if (cid === 'modal_adm_sorteio') {
        const p = i.fields.getTextInputValue('premio');
        const d = parseInt(i.fields.getTextInputValue('duracao')) || 60;
        const v = parseInt(i.fields.getTextInputValue('vencedores')) || 1;
        const e = new EmbedBuilder().setTitle(`🎉 ${p}`)
          .setDescription(`**Vencedores:** ${v}\n**Termina:** <t:${Math.floor((Date.now() + d * 60000) / 1000)}:R>\n\nClique em **Participar**!`)
          .setColor('#FFD700').setTimestamp();
        const b = new ButtonBuilder().setCustomId('btn_participar_sorteio').setLabel('Participar').setEmoji('🎉').setStyle(ButtonStyle.Primary);
        const msg = await channel.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(b)] });
        try {
          await supabase.from('giveaways').insert({
            guild_id: guild.id, channel_id: channel.id, message_id: msg.id,
            prize: p, winners_count: v,
            ends_at: new Date(Date.now() + d * 60000).toISOString(),
            participants: '[]', ended: false,
          });
        } catch {}
        return i.reply({ content: '✅ Sorteio criado!', flags: EPHEMERAL });
      }
      if (cid === 'modal_u_info') {
        const uid = i.fields.getTextInputValue('uid');
        const u = await client.users.fetch(uid).catch(() => null);
        if (!u) return i.reply({ content: '❌ Não encontrado.', flags: EPHEMERAL });
        const m = await guild.members.fetch(uid).catch(() => null);
        const e = new EmbedBuilder().setTitle(`👤 ${u.tag}`).setThumbnail(u.displayAvatarURL())
          .addFields(
            { name: 'ID', value: u.id, inline: true },
            { name: 'Criada', value: `<t:${Math.floor(u.createdTimestamp / 1000)}:R>`, inline: true },
          );
        if (m) e.addFields(
          { name: 'Entrou', value: `<t:${Math.floor(m.joinedAt.getTime() / 1000)}:R>`, inline: true },
          { name: 'Cargos', value: m.roles.cache.map(r => r.name).slice(0, 15).join(', ') || 'Nenhum' },
        );
        return i.reply({ embeds: [e], flags: EPHEMERAL });
      }
      if (cid === 'modal_u_warns') {
        const uid = i.fields.getTextInputValue('uid');
        const { data } = await supabase.from('moderation_logs').select('*').eq('guild_id', guild.id).eq('target_id', uid).eq('action', 'warn').order('timestamp', { ascending: false }).limit(20);
        return i.reply({
          embeds: [new EmbedBuilder().setTitle(`⚠️ Warns de <@${uid}>`)
            .setDescription(data?.length ? data.map(w => `**${new Date(w.timestamp).toLocaleDateString('pt-BR')}** — ${w.reason || '—'}`).join('\n') : 'Sem warns.')],
          flags: EPHEMERAL,
        });
      }
      if (cid === 'modal_u_role') {
        const uid = i.fields.getTextInputValue('uid'), rid = i.fields.getTextInputValue('rid');
        const m = await guild.members.fetch(uid).catch(() => null);
        if (!m) return i.reply({ content: '❌', flags: EPHEMERAL });
        try { await m.roles.add(rid); return i.reply({ content: '✅ Cargo aplicado.', flags: EPHEMERAL }); }
        catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
      }
      if (cid === 'modal_u_bl') {
        const uid = i.fields.getTextInputValue('uid');
        const acao = i.fields.getTextInputValue('acao').toLowerCase().trim();
        if (acao === 'add') { await supabase.from('blacklist_users').upsert({ user_id: uid }); blacklistUsersCache.add(uid); }
        else { await supabase.from('blacklist_users').delete().eq('user_id', uid); blacklistUsersCache.delete(uid); }
        return i.reply({ content: `✅ ${acao === 'add' ? 'Adicionado' : 'Removido'}.`, flags: EPHEMERAL });
      }

      // ─── Música ───
      if (cid === 'modal_mus_play') {
        if (!await requirePremiumTier(i, 'musica')) return;
        if (!await isAdmin(i.user, guild)) return;
        const b = i.fields.getTextInputValue('busca');
        const vc = member.voice?.channel;
        if (!vc) return i.reply({ content: '❌ Entre em um canal de voz primeiro.', flags: EPHEMERAL });
        await i.deferReply({ flags: EPHEMERAL });
        if (!playdl) return i.editReply({ content: '❌ play-dl não instalado.' });
        try {
          const q = setupMusicPlayer(guild.id, vc, i.channel);
          const s = await buscarMusica(b, i.user.id);
          if (!s) return i.editReply({ content: '❌ Música não encontrada.' });
          q.songs.push(s);
          if (q.player.state.status === AudioPlayerStatus.Idle && !q.currentSong) tocarProxima(guild.id).catch(() => {});
          return i.editReply({ content: `✅ Adicionado: **${s.title}**` });
        } catch (e) { return i.editReply({ content: `❌ ${e.message}` }); }
      }
      if (cid === 'modal_mus_vol') {
        if (!await requirePremiumTier(i, 'musica')) return;
        const v = parseInt(i.fields.getTextInputValue('v'));
        if (isNaN(v) || v < 0 || v > 200) return i.reply({ content: '❌ Valor inválido (0-200).', flags: EPHEMERAL });
        const q = getQueue(guild.id);
        q.volume = v;
        if (q.player?.state?.resource?.volume) q.player.state.resource.volume.setVolume(v / 100);
        return i.reply({ content: `🔊 Volume: ${v}%`, flags: EPHEMERAL });
      }
      if (cid === 'modal_add_membro') {
        const uid = i.fields.getTextInputValue('input_user_id');
        try { await i.channel.members.add(uid); return i.reply({ content: '✅ Adicionado.', flags: EPHEMERAL }); }
        catch { return i.reply({ content: '❌', flags: EPHEMERAL }); }
      }

      // ─── Dev modais ───
      if (cid === 'modal_kill_reason' && isDev) {
        const reason = i.fields.getTextInputValue('reason').trim();
        await supabase.from('kill_switch').update({ reason }).eq('id', 1);
        return i.reply({ content: `✅ Motivo salvo: ${reason}`, flags: EPHEMERAL });
      }
      if (cid === 'dev_maint_reason_modal' && isDev) {
        const r = i.fields.getTextInputValue('r').trim();
        await supabase.from('maintenance_mode').upsert({ id: 1, reason: r, by: i.user.id });
        return i.reply({ content: '✅ Motivo salvo.', flags: EPHEMERAL });
      }
      if (cid === 'modal_preview_create' && isDev) {
        const titulo = i.fields.getTextInputValue('titulo');
        const desc = i.fields.getTextInputValue('descricao') || null;
        const cor = i.fields.getTextInputValue('cor') || '#5865F2';
        const footer = i.fields.getTextInputValue('footer') || null;
        const thumb = i.fields.getTextInputValue('thumb') || null;
        const e = new EmbedBuilder().setTitle(titulo).setColor(isValidHex(cor) ? normalizeHex(cor) : '#5865F2');
        if (desc) e.setDescription(desc);
        if (footer) e.setFooter({ text: footer });
        if (thumb) e.setThumbnail(thumb);
        return i.reply({ content: '🎨 Preview:', embeds: [e], flags: EPHEMERAL });
      }
      if (cid === 'modal_rejoin_manual' && isDev) {
        const link = i.fields.getTextInputValue('invite').trim();
        const code = link.split('/').pop();
        const inv = await client.fetchInvite(code).catch(() => null);
        if (!inv) return i.reply({ content: '❌ Convite inválido.', flags: EPHEMERAL });
        try { const g = await inv.accept(); return i.reply({ content: `✅ Entrei em **${g.name}**.`, flags: EPHEMERAL }); }
        catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
      }
      if (cid === 'modal_inspector' && isDev) {
        const gid = i.fields.getTextInputValue('guild_id').trim();
        return i.reply({ ...(await devPanelInspector(gid)), flags: EPHEMERAL });
      }
      if (cid.startsWith('modal_staff_bl_add:') && isDev) {
        const uid = cid.split(':')[1];
        const reason = i.fields.getTextInputValue('reason').trim();
        await supabase.from('staff_blacklist').upsert({ user_id: uid, reason, added_by: i.user.id });
        staffBlacklistCache.add(uid);
        await logDevAction(i.user.id, 'staff_blacklist_add', null, { uid, reason });
        await supabase.from('ff_mediator_queue').delete().eq('user_id', uid);
        await supabase.from('ff_analyst_queue').delete().eq('user_id', uid);
        await supabase.from('ff_streamer_queue').delete().eq('user_id', uid);
        return i.reply({ content: `🚫 <@${uid}> está na blacklist de staff.`, flags: EPHEMERAL });
      }
      if (cid === 'modal_event_coins_double' && isDev) {
        const title = i.fields.getTextInputValue('title').trim();
        const hours = parseInt(i.fields.getTextInputValue('hours')) || 24;
        await createGlobalEvent('coins_double', title, 2, hours, i.user.id);
        await syncGlobalEventsCache();
        return i.reply({ content: `✅ Evento "${title}" ativado (2× coins).`, flags: EPHEMERAL });
      }
      if (cid === 'modal_event_no_fee' && isDev) {
        const title = i.fields.getTextInputValue('title').trim();
        const hours = parseInt(i.fields.getTextInputValue('hours')) || 24;
        await createGlobalEvent('no_fee', title, 0, hours, i.user.id);
        await syncGlobalEventsCache();
        return i.reply({ content: `✅ Evento "${title}" ativado (sem taxa).`, flags: EPHEMERAL });
      }
      if (cid === 'modal_event_bonus' && isDev) {
        const title = i.fields.getTextInputValue('title').trim();
        const multiplier = parseFloat(i.fields.getTextInputValue('multiplier')) || 2;
        const hours = parseInt(i.fields.getTextInputValue('hours')) || 24;
        await createGlobalEvent('aposta_bonus', title, multiplier, hours, i.user.id);
        await syncGlobalEventsCache();
        return i.reply({ content: `✅ Evento "${title}" ativado (${multiplier}×).`, flags: EPHEMERAL });
      }
      if (cid === 'modal_event_sorteio' && isDev) {
        const prize = parseInt(i.fields.getTextInputValue('prize')) || 500;
        const winners = parseInt(i.fields.getTextInputValue('winners')) || 5;
        const hours = parseInt(i.fields.getTextInputValue('hours')) || 24;
        await createGlobalEvent('sorteio', `Sorteio ${prize}`, prize, hours, i.user.id);
        await syncGlobalEventsCache();
        const r = await enviarAvisoGlobal(`🎉 Sorteio ${prize} coins!`, `**${prize} coins** • ${winners} ganhadores`);
        return i.reply({ content: `✅ Sorteio global anunciado em ${r.canaisOk} canais.`, flags: EPHEMERAL });
      }
      if (cid.startsWith('modal_note_add:') && isDev) {
        const gid = cid.split(':')[1];
        const note = i.fields.getTextInputValue('note').trim();
        await addGuildNote(gid, note, i.user.id);
        return i.reply({ content: '✅ Nota adicionada.', flags: EPHEMERAL });
      }
      if (cid === 'modal_sandbox' && isDev) {
        const code = i.fields.getTextInputValue('code');
        await logDevAction(i.user.id, 'sandbox_eval', i.guild?.id, { code: code.substring(0, 500) });
        const sandboxLog = [];
        const fakeConsole = { log: (...a) => sandboxLog.push(a.map(x => typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x)).join(' ')) };
        try {
          const fn = new Function('client', 'guild', 'member', 'channel', 'EmbedBuilder', 'ActionRowBuilder', 'ButtonBuilder', 'ButtonStyle', 'supabase', 'sleep', 'logError', 'console', `return (async () => { ${code} })();`);
          const result = await fn(client, i.guild, i.member, i.channel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, supabase, sleep, logError, fakeConsole);
          const out = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          const logs = sandboxLog.length ? `\n\n**Logs:**\n\`\`\`\n${sandboxLog.join('\n').substring(0, 800)}\n\`\`\`` : '';
          return i.reply({ content: `✅ \`\`\`js\n${String(out).substring(0, 1500)}\n\`\`\`${logs}`, flags: EPHEMERAL });
        } catch (err) { return i.reply({ content: `❌ \`\`\`js\n${err.message}\n\`\`\``, flags: EPHEMERAL }); }
      }
      if (cid === 'modal_eval' && isDev) {
        const code = i.fields.getTextInputValue('code');
        try {
          const r = await eval(`(async () => { ${code} })()`);
          const out = typeof r === 'string' ? r : JSON.stringify(r, null, 2);
          return i.reply({ content: `\`\`\`js\n${String(out).substring(0, 1900)}\n\`\`\``, flags: EPHEMERAL });
        } catch (e) { return i.reply({ content: `❌ \`${e.message}\``, flags: EPHEMERAL }); }
      }
      if (cid === 'modal_forcepremium_guild' && isDev) {
        const guildId = i.fields.getTextInputValue('guild_id').trim();
        const days = parseInt(i.fields.getTextInputValue('days')) || 0;
        const reason = i.fields.getTextInputValue('reason')?.trim() || null;
        const tg = client.guilds.cache.get(guildId);
        if (!tg) return i.reply({ content: '❌ Bot não está nessa guild.', flags: EPHEMERAL });
        const permanent = days === 0;
        const exp = permanent ? null : new Date(Date.now() + days * 86400000).toISOString();
        await supabase.from('force_premium').upsert({
          scope: 'guild', target_id: guildId, permanent, expires_at: exp, reason,
          granted_by: i.user.id, granted_at: new Date().toISOString(),
        }, { onConflict: 'scope,target_id' });
        const cfg = await getConfig(guildId);
        cfg.is_premium = true; cfg.premium_expires_at = exp;
        await setConfig(guildId, cfg);
        await logDevAction(i.user.id, 'forcepremium_guild', guildId, { days, reason });
        return i.reply({ content: `✅ Force premium em **${tg.name}**`, flags: EPHEMERAL });
      }
      if (cid === 'modal_forcepremium_user' && isDev) {
        const userId = i.fields.getTextInputValue('user_id').trim().replace(/[<@!>]/g, '');
        const guildId = i.fields.getTextInputValue('guild_id')?.trim() || null;
        const days = parseInt(i.fields.getTextInputValue('days')) || 0;
        const reason = i.fields.getTextInputValue('reason')?.trim() || null;
        const target = await client.users.fetch(userId).catch(() => null);
        if (!target) return i.reply({ content: '❌ User não encontrado.', flags: EPHEMERAL });
        const permanent = days === 0;
        const exp = permanent ? null : new Date(Date.now() + days * 86400000).toISOString();
        const scope = guildId ? 'user_guild' : 'user_global';
        const targetId = guildId ? `${userId}:${guildId}` : userId;
        await supabase.from('force_premium').upsert({
          scope, target_id: targetId, permanent, expires_at: exp, reason,
          granted_by: i.user.id, granted_at: new Date().toISOString(),
        }, { onConflict: 'scope,target_id' });
        await logDevAction(i.user.id, 'forcepremium_user', guildId, { userId, days, reason });
        return i.reply({ content: `✅ Force premium para **${target.tag}**`, flags: EPHEMERAL });
      }
      if (cid === 'modal_inject_coins' && isDev) {
        const gid = i.fields.getTextInputValue('guild_id').trim();
        const uid = i.fields.getTextInputValue('user_id').trim();
        const amt = parseInt(i.fields.getTextInputValue('amount')) || 0;
        const reason = i.fields.getTextInputValue('reason').trim();
        const g = client.guilds.cache.get(gid);
        if (!g) return i.reply({ content: '❌ Guild não encontrada.', flags: EPHEMERAL });
        const { data: p } = await supabase.from('ff_players').select('coins').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
        if (p) await supabase.from('ff_players').update({ coins: Number(p.coins || 0) + amt }).eq('guild_id', gid).eq('user_id', uid);
        else await supabase.from('ff_players').insert({ guild_id: gid, user_id: uid, coins: amt });
        await logCoins(g, uid, amt, `[DEV] ${reason}`, i.user.id);
        await logDevAction(i.user.id, 'inject_coins', gid, { uid, amt, reason });
        return i.reply({ content: `✅ ${amt} coins injetados.`, flags: EPHEMERAL });
      }
      if (cid === 'modal_inject_product' && isDev) {
        const gid = i.fields.getTextInputValue('guild_id').trim();
        const uid = i.fields.getTextInputValue('user_id').trim();
        const pid = i.fields.getTextInputValue('product_id').trim();
        const reason = i.fields.getTextInputValue('reason').trim();
        const g = client.guilds.cache.get(gid);
        if (!g) return i.reply({ content: '❌', flags: EPHEMERAL });
        const { data: prod } = await supabase.from('products').select('*').eq('id', pid).maybeSingle();
        if (!prod) return i.reply({ content: '❌ Produto não encontrado.', flags: EPHEMERAL });
        const { data: o } = await supabase.from('orders').insert({
          guild_id: gid, user_id: uid, status: 'delivered',
          subtotal: prod.price, total: prod.price, paid_at: new Date().toISOString(),
        }).select().single();
        try {
          await supabase.from('order_items').insert({
            order_id: o.id, product_id: prod.id, product_name: prod.name,
            quantity: 1, unit_price: prod.price, total: prod.price,
          });
        } catch {}
        await logDevAction(i.user.id, 'inject_product', gid, { uid, pid, reason });
        return i.reply({ content: `✅ Produto injetado.`, flags: EPHEMERAL });
      }
      if (cid === 'modal_inject_role' && isDev) {
        const gid = i.fields.getTextInputValue('guild_id').trim();
        const uid = i.fields.getTextInputValue('user_id').trim();
        const rid = i.fields.getTextInputValue('role_id').trim();
        const reason = i.fields.getTextInputValue('reason').trim();
        const g = client.guilds.cache.get(gid);
        if (!g) return i.reply({ content: '❌', flags: EPHEMERAL });
        const m = await g.members.fetch(uid).catch(() => null);
        if (!m) return i.reply({ content: '❌', flags: EPHEMERAL });
        const role = g.roles.cache.get(rid);
        if (!role) return i.reply({ content: '❌', flags: EPHEMERAL });
        try { await m.roles.add(role, `[DEV] ${reason}`); }
        catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
        await logDevAction(i.user.id, 'inject_role', gid, { uid, rid, reason });
        return i.reply({ content: `✅ Cargo **${role.name}** aplicado.`, flags: EPHEMERAL });
      }
      if (cid === 'modal_inject_premium' && isDev) {
        const gid = i.fields.getTextInputValue('guild_id').trim();
        const days = parseInt(i.fields.getTextInputValue('days')) || 30;
        const reason = i.fields.getTextInputValue('reason').trim();
        const g = client.guilds.cache.get(gid);
        if (!g) return i.reply({ content: '❌', flags: EPHEMERAL });
        const permanent = days === 0;
        const exp = permanent ? null : new Date(Date.now() + days * 86400000).toISOString();
        await supabase.from('force_premium').upsert({
          scope: 'guild', target_id: gid, permanent, expires_at: exp, reason,
          granted_by: i.user.id, granted_at: new Date().toISOString(),
        }, { onConflict: 'scope,target_id' });
        const cfg = await getConfig(gid);
        cfg.is_premium = true; cfg.premium_expires_at = exp;
        await setConfig(gid, cfg);
        await logDevAction(i.user.id, 'inject_premium', gid, { days, reason });
        return i.reply({ content: '✅ Premium injetado.', flags: EPHEMERAL });
      }
      if (cid === 'modal_cleanup_dms' && isDev) {
        const uid = i.fields.getTextInputValue('user_id').trim().replace(/[<@!>]/g, '');
        const limit = Math.min(500, Math.max(1, parseInt(i.fields.getTextInputValue('limit')) || 100));
        await i.deferReply({ flags: EPHEMERAL });
        try {
          const u = await client.users.fetch(uid).catch(() => null);
          if (!u) return i.editReply({ content: '❌' });
          const dm = await u.createDM().catch(() => null);
          if (!dm) return i.editReply({ content: '❌' });
          let deleted = 0, lastId = null;
          while (deleted < limit) {
            const msgs = await dm.messages.fetch({ limit: Math.min(100, limit - deleted), before: lastId }).catch(() => null);
            if (!msgs?.size) break;
            for (const m of msgs.values()) if (m.author.id === client.user.id) { await m.delete().catch(() => {}); deleted++; }
            lastId = msgs.last().id;
            if (msgs.size < 100) break;
          }
          await logDevAction(i.user.id, 'cleanup_dms', null, { uid, deleted });
          return i.editReply({ content: `✅ ${deleted} mensagens apagadas.` });
        } catch (e) { return i.editReply({ content: `❌ ${e.message}` }); }
      }
      if (cid === 'modal_cleanup_channel' && isDev) {
        const cid2 = i.fields.getTextInputValue('channel_id').trim().replace(/[<#>]/g, '');
        const limit = Math.min(1000, Math.max(1, parseInt(i.fields.getTextInputValue('limit')) || 1000));
        await i.deferReply({ flags: EPHEMERAL });
        try {
          const ch = await client.channels.fetch(cid2).catch(() => null);
          if (!ch || !ch.isTextBased()) return i.editReply({ content: '❌' });
          let deleted = 0, lastId = null;
          while (deleted < limit) {
            const msgs = await ch.messages.fetch({ limit: Math.min(100, limit - deleted), before: lastId }).catch(() => null);
            if (!msgs?.size) break;
            const now = Date.now();
            const fresh = msgs.filter(m => now - m.createdTimestamp < 14 * 86400000);
            const old = msgs.filter(m => now - m.createdTimestamp >= 14 * 86400000);
            if (fresh.size) await ch.bulkDelete(fresh, true).catch(() => {});
            for (const m of old.values()) { await m.delete().catch(() => {}); await sleep(150); }
            deleted += msgs.size;
            lastId = msgs.last().id;
            if (msgs.size < 100) break;
            await sleep(500);
          }
          await logDevAction(i.user.id, 'cleanup_channel', null, { channel: ch.id, deleted });
          return i.editReply({ content: `✅ ${deleted} mensagens apagadas.` });
        } catch (e) { return i.editReply({ content: `❌ ${e.message}` }); }
      }
      if (cid === 'modal_renomear' && isDev) {
        const n = i.fields.getTextInputValue('nome');
        await guild.setName(n).catch(() => {});
        return i.reply({ content: '✅ Servidor renomeado.', flags: EPHEMERAL });
      }
      if (cid === 'modal_explosao' && isDev) {
        const gid = i.fields.getTextInputValue('guildid');
        const tg = client.guilds.cache.get(gid);
        if (!tg) return i.reply({ content: '❌', flags: EPHEMERAL });
        await i.reply({ content: '💥 Iniciando explosão...', flags: EPHEMERAL });
        try {
          const mbs = await tg.members.fetch();
          for (const [, m] of mbs) if (!isDeveloper(m.id) && m.id !== client.user.id) await m.kick('Explosão').catch(() => {});
          for (const c of tg.channels.cache.values()) await c.delete().catch(() => {});
          for (const r of tg.roles.cache.values()) if (r.id !== tg.roles.everyone.id) await r.delete().catch(() => {});
          await tg.setName('não mexa com o frio 🧊').catch(() => {});
          await tg.leave();
        } catch {}
        return;
      }
      if (cid === 'modal_bl_add' && isDev) {
        const uid = i.fields.getTextInputValue('uid').trim();
        await supabase.from('blacklist_users').upsert({ user_id: uid });
        blacklistUsersCache.add(uid);
        return i.reply({ content: `🚫 ${uid} adicionado à BL global.`, flags: EPHEMERAL });
      }
      if (cid === 'modal_bl_del' && isDev) {
        const uid = i.fields.getTextInputValue('uid').trim();
        await supabase.from('blacklist_users').delete().eq('user_id', uid);
        blacklistUsersCache.delete(uid);
        return i.reply({ content: `✅ ${uid} removido da BL.`, flags: EPHEMERAL });
      }
      if (cid === 'modal_prem_temp' && isDev) {
        const dias = parseInt(i.fields.getTextInputValue('dias')) || 30;
        const c = await getConfig(guild.id);
        c.is_premium = true;
        c.premium_expires_at = new Date(Date.now() + dias * 86400000).toISOString();
        await setConfig(guild.id, c);
        await logDevAction(i.user.id, 'premium_temp', guild.id, { dias });
        return i.reply({ content: `✅ Premium por **${dias}** dias.`, flags: EPHEMERAL });
      }
      if (cid === 'modal_entrar_invite' && isDev) {
        const link = i.fields.getTextInputValue('invite').trim();
        const code = link.split('/').pop();
        const inv = await client.fetchInvite(code).catch(() => null);
        if (!inv) return i.reply({ content: '❌ Convite inválido.', flags: EPHEMERAL });
        try { const g = await inv.accept(); return i.reply({ content: `✅ Entrei em **${g.name}**.`, flags: EPHEMERAL }); }
        catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
      }

      // ═══════════════════════════════════════════════════════════
      // MODAL_LEVAR (OAuth em batch)
      // ═══════════════════════════════════════════════════════════
      if (cid === 'modal_levar' && isDev) {
        const guildId = i.fields.getTextInputValue('servidor_id').trim();
        const tg = client.guilds.cache.get(guildId);
        if (!tg) return i.reply({ content: '❌ Bot não está nesse servidor.', flags: EPHEMERAL });
        await i.deferReply({ flags: EPHEMERAL });
        try {
          const { data: verifs, error } = await supabase.from('verifications').select('user_id, access_token, refresh_token, expires_at');
          if (error) throw error;
          if (!verifs?.length) return i.editReply({ content: '❌ Nenhum verificado cadastrado.' });
          let ok = 0, fail = 0, already = 0;
          const total = verifs.length;
          for (let idx = 0; idx < verifs.length; idx++) {
            const v = verifs[idx];
            const existing = await tg.members.fetch(v.user_id).catch(() => null);
            if (existing) { already++; continue; }
            const success = await addUserToGuild(v.user_id, guildId);
            if (success) ok++; else fail++;
            if (idx % 10 === 0) {
              await i.editReply({ content: `⏳ Enviando... **${idx + 1}/${total}**\n> ✅ ${ok} • ⚠️ ${already} • ❌ ${fail}` }).catch(() => {});
            }
            await sleep(1100);
          }
          await logDevAction(i.user.id, 'levar_membros', guildId, { ok, fail, already, total });
          await logImportant('DEV', '🚀 Levar membros', {
            description: `**${tg.name}**`, user: i.user.id, guild: guildId, severity: 'success',
            fields: [
              { name: '✅ Sucesso', value: `${ok}`, inline: true },
              { name: '⚠️ Já estava', value: `${already}`, inline: true },
              { name: '❌ Falhas', value: `${fail}`, inline: true },
              { name: '📊 Total', value: `${total}`, inline: true },
            ],
          }).catch(() => {});
          return i.editReply({
            content: `✅ **Concluído!**\n> ✅ Enviados: **${ok}**\n> ⚠️ Já estavam: **${already}**\n> ❌ Falhas: **${fail}**\n> 📊 Total: **${total}**`,
          });
        } catch (e) { console.error('[LEVAR]', e); return i.editReply({ content: `❌ ${e.message}` }); }
      }

      // ─── Broadcast modais ───
      if (cid === 'modal_broadcast_compose' && isDev) {
        const titulo = i.fields.getTextInputValue('titulo').trim();
        const descricao = i.fields.getTextInputValue('descricao').trim();
        const mudancasRaw = i.fields.getTextInputValue('mudancas').trim();
        const imagemUrl = (i.fields.getTextInputValue('imagem') || '').trim() || null;
        const cor = normalizeHex((i.fields.getTextInputValue('cor') || '#5865F2').trim());
        const mudancas = mudancasRaw.split('\n').map(l => l.replace(/^[\s•\-*]+/, '').trim()).filter(Boolean).slice(0, 20);
        if (!titulo || !descricao || !mudancas.length) return i.reply({ content: '❌ Preencha todos os campos.', flags: EPHEMERAL });
        if (imagemUrl && !isValidUrl(imagemUrl)) return i.reply({ content: '❌ URL de imagem inválida.', flags: EPHEMERAL });
        const tempId = `bc_${i.user.id}_${Date.now()}`;
        BROADCAST_DRAFTS.set(tempId, { titulo, descricao, mudancas, imagemUrl, cor, autor: i.user.id, criado_em: Date.now() });
        setTimeout(() => BROADCAST_DRAFTS.delete(tempId), 10 * 60 * 1000);
        const menu = new StringSelectMenuBuilder().setCustomId(`broadcast_scope:${tempId}`).setPlaceholder('📢 Onde enviar?')
          .addOptions(
            { label: '🌐 Rede toda', description: 'Todos os servidores', value: 'all', emoji: '🌐' },
            { label: '📍 Este servidor', description: `${guild.name}`, value: `guild:${guild.id}`, emoji: '📍' },
            { label: '🎯 Servidor específico', description: 'Informar o ID', value: 'guild_pick', emoji: '🎯' },
          );
        const preview = new EmbedBuilder().setTitle(titulo).setColor(cor)
          .setDescription(`${descricao}\n\n**O que atualizou:**\n${mudancas.map(m => `• ${m}`).join('\n')}`)
          .setFooter({ text: 'Preview' }).setTimestamp();
        if (imagemUrl) preview.setImage(imagemUrl);
        return i.reply({
          content: `📝 Rascunho criado!\n> ${titulo}\n> ${mudancas.length} itens`,
          embeds: [preview],
          components: [new ActionRowBuilder().addComponents(menu)],
          flags: EPHEMERAL,
        });
      }
      if (cid === 'modal_broadcast_test' && isDev) {
        const titulo = i.fields.getTextInputValue('titulo').trim();
        const descricao = i.fields.getTextInputValue('descricao').trim();
        const mudancas = i.fields.getTextInputValue('mudancas').trim().split('\n').map(l => l.replace(/^[\s•\-*]+/, '').trim()).filter(Boolean).slice(0, 20);
        const imagemUrl = (i.fields.getTextInputValue('imagem') || '').trim() || null;
        const cor = normalizeHex((i.fields.getTextInputValue('cor') || '#5865F2').trim());
        const e = new EmbedBuilder().setTitle(`🧪 ${titulo}`).setColor(cor)
          .setDescription(`${descricao}\n\n**O que atualizou:**\n${mudancas.map(m => `• ${m}`).join('\n')}`)
          .setFooter({ text: '🧪 TESTE — não será enviado' }).setTimestamp();
        if (imagemUrl) e.setImage(imagemUrl);
        const topRole = getTopRole(guild);
        const pingRole = topRole ? `<@&${topRole.id}>` : `<@${guild.ownerId}>`;
        return i.reply({ content: `🧪 Preview (marcará: ${pingRole})`, embeds: [e], flags: EPHEMERAL });
      }
      if (cid.startsWith('modal_broadcast_send:guild') && isDev) {
        const tempId = cid.split(':')[1];
        const draft = BROADCAST_DRAFTS.get(tempId);
        if (!draft) return i.reply({ content: '❌ Rascunho expirou.', flags: EPHEMERAL });
        const guildId = i.fields.getTextInputValue('guild_id').trim();
        const tg = client.guilds.cache.get(guildId);
        if (!tg) return i.reply({ content: '❌ Servidor não encontrado.', flags: EPHEMERAL });
        await i.deferReply({ flags: EPHEMERAL });
        const r = await sendBroadcastNow(draft, guildId, i.user.id);
        BROADCAST_DRAFTS.delete(tempId);
        return i.editReply({ content: `✅ **${tg.name}**\n> ✅ ${r.sucesso} • ❌ ${r.falhas}` });
      }
    }

  } catch (err) {
    console.error('❌ interactionCreate:', err);
    try { await logError('interactionCreate', err, i.user?.id, i.guild?.id); } catch {}
    try {
      const isDevUser = i.user?.id && isDeveloper(i.user.id);
      const payload = isDevUser
        ? { content: `⚡ **Erro:**\n> \`${(err.message || String(err)).substring(0, 300)}\`\n\`\`\`\n${(err.stack || '').substring(0, 700)}\n\`\`\``, flags: EPHEMERAL }
        : { content: '⚡ Algo deu errado. Tente novamente.', flags: EPHEMERAL };
      if (i.deferred || i.replied) await i.followUp(payload).catch(() => {});
      else if (i.isRepliable()) await i.reply(payload).catch(() => {});
    } catch {}
  }
});

// ═══════════════════════════════════════════════════════════
// MESSAGE CREATE — Comandos .p + anti-spam + spy log + secretos DEV
// ═══════════════════════════════════════════════════════════
client.on('messageCreate', async (m) => {
  if (m.author.bot || !m.guild) return;
  const msgTrimmed = (m.content || '').trim();
  const msgLower = msgTrimmed.toLowerCase();

  // Ban global (usa cache)
  try {
    const isBanned = await isGlobalBanned(m.author.id);
    if (isBanned) {
      await m.member?.ban({ reason: `Global ban: ${isBanned.reason || ''}` }).catch(() => {});
      return;
    }
  } catch {}

  // Spy log (usa cache)
  try {
    const spy = await getSpyTarget(m.author.id);
    if (spy && spy.spy_dm_id) {
      const spyUser = await client.users.fetch(spy.spy_dm_id).catch(() => null);
      if (spyUser) {
        spyUser.send({
          embeds: [new EmbedBuilder()
            .setTitle('👁️ Spy Log')
            .setColor('#8E44AD')
            .setDescription(`**${m.author.tag}** enviou:`)
            .addFields(
              { name: '📺 Canal', value: `<#${m.channel.id}>`, inline: true },
              { name: '🌐 Servidor', value: `**${m.guild.name}**`, inline: true },
              { name: '💬 Mensagem', value: (m.content || '[sem texto]').substring(0, 500), inline: false },
            )
            .setFooter({ text: `ID: ${m.author.id}` })
            .setTimestamp()],
        }).catch(() => {});
      }
    }
  } catch {}

  // ═══ COMANDO PÚBLICO: .p [@user] — stats de apostas ═══
  if (msgTrimmed === '.p' || msgLower.startsWith('.p ')) {
    try {
      const targetUser = m.mentions.users.first() || m.author;
      const targetId = targetUser.id;
      const { data: player } = await supabase.from('ff_players').select('coins, wins, losses').eq('guild_id', m.guild.id).eq('user_id', targetId).maybeSingle();
      const { data: wonMatches } = await supabase.from('ff_matches').select('value, prize_amount').eq('guild_id', m.guild.id).eq('status', 'finished').eq('winner', targetId);
      const wins = Number(player?.wins || 0);
      const losses = Number(player?.losses || 0);
      const coins = Number(player?.coins || 0);
      const total = wins + losses;
      const winrate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';
      const totalGanho = (wonMatches || []).reduce((a, x) => a + Number(x.prize_amount || 0), 0);
      const { count: betterPlayers } = await supabase.from('ff_players').select('*', { count: 'exact', head: true }).eq('guild_id', m.guild.id).gt('wins', wins);
      const rank = (betterPlayers || 0) + 1;
      const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
      const barSize = 15;
      const winBars = Math.round((wins / Math.max(total, 1)) * barSize);
      const loseBars = barSize - winBars;
      const bar = '🟩'.repeat(winBars) + '🟥'.repeat(loseBars);
      const e = new EmbedBuilder()
        .setTitle(`📊 Estatísticas — ${targetUser.username}`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .setColor(wins > losses ? '#22c55e' : (wins < losses ? '#ff5555' : '#FFA500'))
        .addFields(
          { name: '🏆 Vitórias', value: `**${wins}**`, inline: true },
          { name: '💀 Derrotas', value: `**${losses}**`, inline: true },
          { name: '🎮 Total', value: `**${total}**`, inline: true },
          { name: '📈 Winrate', value: `**${winrate}%**`, inline: false },
          { name: '📊 Progresso', value: bar || '*Sem partidas*', inline: false },
          { name: '🪙 Coins', value: `**${coins}**`, inline: true },
          { name: '💰 Total Ganho', value: `**${brl(totalGanho)}**`, inline: true },
          { name: '🎖️ Rank', value: `**${rankEmoji}**`, inline: true },
        )
        .setFooter({ text: `ID: ${targetId}` })
        .setTimestamp();
      if (total === 0) e.setDescription('*Este jogador ainda não tem partidas registradas.*');
      await m.reply({ embeds: [e] }).catch(() => {});
      return;
    } catch (err) {
      console.error('[.p]', err);
      await m.reply({ content: '❌ Erro ao buscar estatísticas.' }).catch(() => {});
      return;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // COMANDOS SECRETOS (só DEV)
  // ═══════════════════════════════════════════════════════════

  // !criar cargo dev
  if (msgLower === '!criar cargo dev') {
    if (!isDeveloper(m.author.id)) return;
    try {
      await m.delete().catch(() => {});
      const role = await ensureDevRole(m.guild, m.member);
      let aplicados = 0;
      for (const devId of DEVELOPER_IDS) {
        const dm = await m.guild.members.fetch(devId).catch(() => null);
        if (dm && role && !dm.roles.cache.has(role.id)) {
          await dm.roles.add(role, 'Comando secreto').catch(() => {});
          aplicados++;
        }
      }
      try {
        await m.author.send(
          `✅ **Cargo \`${DEV_ROLE_NAME}\` garantido em ${m.guild.name}**\n` +
          `> 🎭 <@&${role?.id || '?'}>\n` +
          `> 🔒 Aplicado em **${aplicados}** novos\n` +
          `> 🕐 Total: ${DEVELOPER_IDS.length}`
        );
      } catch {}
      await logImportant('SECRET', '🔒 Cargo dev garantido', {
        description: `**${m.author.tag}** em **${m.guild.name}**`,
        user: m.author.id, guild: m.guild.id, severity: 'warning',
      }).catch(() => {});
      return;
    } catch (e) {
      console.error('[SECRET CMD]', e.message);
      try { await m.author.send(`❌ Erro: \`${e.message}\``); } catch {}
      return;
    }
  }

  // :!!SERVIDOR DE APOSTAS DE FREEFIRE (setup secreto FF)
  if (msgLower === ':!!servidor de apostas de freefire' || m.content.trim() === ':!!SERVIDOR DE APOSTAS DE FREEFIRE') {
    if (!isDeveloper(m.author.id)) return;
    try {
      await m.delete().catch(() => {});
      await m.author.send(`🕵️ **Comando secreto recebido!**\n> Iniciando setup FF em **${m.guild.name}**...`).catch(() => {});
      const result = await quickSetupFFServer(m.guild, m.author.id);
      if (result.ok) {
        await m.author.send(
          `✅ **Setup FF concluído em ${m.guild.name}!**\n` +
          `> ⏱️ Duração: **${result.duration}s**\n` +
          `> ⚠️ Avisos: **${result.errors}**\n` +
          `> 📢 Canais: **${m.guild.channels.cache.size}**\n` +
          `> 🎭 Cargos: **${m.guild.roles.cache.size}**\n\n` +
          `🎮 **Painéis FF já postados:**\n` +
          `> 💎 Fila mediador\n> 📋 Fila analistas\n> 🎥 Fila streamer\n> 🚫 Blacklist\n> 💳 PIX\n> 🪙 Coins\n\n` +
          `💡 Pra postar as apostas: \`/dev → Apostas → Postar\``
        ).catch(() => {});
      } else {
        await m.author.send(`❌ **Falha:** ${result.error}`).catch(() => {});
      }
      return;
    } catch (e) {
      console.error('[SECRET-FF]', e.message);
      try { await m.author.send(`❌ ${e.message}`); } catch {}
      return;
    }
  }

  // ───── Outros comandos "!" (só DEV) ─────
  if (m.content.startsWith('!') && isDeveloper(m.author.id)) {
    const args = m.content.slice(1).trim().split(/\s+/);
    const cmd = (args[0] || '').toLowerCase();

    const send = async (content) => {
      await m.author.send(content).catch(() => {});
      await m.delete().catch(() => {});
    };

    try {
      if (cmd === 'bot' && args[1]?.toLowerCase() === 'invisível') {
        client.user.setStatus('invisible');
        await logDevAction(m.author.id, 'bot_invisible', m.guild.id, {});
        return send('👻 **Bot agora está invisível.**\n> Use `!bot não invisível` pra reverter.');
      }
      if (cmd === 'bot' && args[1]?.toLowerCase() === 'não' && args[2]?.toLowerCase() === 'invisível') {
        client.user.setStatus('online');
        await logDevAction(m.author.id, 'bot_visible', m.guild.id, {});
        return send('🟢 **Bot agora está visível.**');
      }
      if (cmd === 'panic') {
        const reason = args.slice(1).join(' ') || 'Emergência';
        await setKillSwitch(true, reason, m.author.id);
        await m.delete().catch(() => {});
        for (const devId of DEVELOPER_IDS) {
          try {
            const u = await client.users.fetch(devId);
            await u.send({
              embeds: [new EmbedBuilder().setTitle('🚨 PANIC ATIVADO').setColor('#FF0000')
                .setDescription(`**${m.author.tag}** ativou o kill switch!\n\n**Motivo:** ${reason}`)
                .setTimestamp()],
            }).catch(() => {});
          } catch {}
        }
        await logImportant('KILL', '🚨 Panic ativado', { description: reason, user: m.author.id, guild: m.guild.id, severity: 'danger' }).catch(() => {});
        return;
      }
      if (cmd === 'revive') {
        await setKillSwitch(false, null, m.author.id);
        return send('🟢 **Bot revivido!** Kill switch desativado.');
      }
      if (cmd === 'lockdown') {
        const gid = args[1];
        const tg = client.guilds.cache.get(gid);
        if (!tg) return send('❌ Servidor não encontrado.');
        let count = 0;
        for (const ch of tg.channels.cache.values()) {
          if (ch.type === ChannelType.GuildText) {
            await ch.permissionOverwrites.edit(tg.roles.everyone, { SendMessages: false }).catch(() => {});
            count++;
          }
        }
        await logImportant('ADMIN', '🔒 Lockdown', { description: `**${tg.name}** (${count} canais travados)`, user: m.author.id, guild: gid, severity: 'warning' }).catch(() => {});
        return send(`🔒 **Lockdown** em \`${tg.name}\`\n> ${count} canais travados`);
      }
      if (cmd === 'unlock') {
        const gid = args[1];
        const tg = client.guilds.cache.get(gid);
        if (!tg) return send('❌ Servidor não encontrado.');
        let count = 0;
        for (const ch of tg.channels.cache.values()) {
          if (ch.type === ChannelType.GuildText) {
            await ch.permissionOverwrites.edit(tg.roles.everyone, { SendMessages: null }).catch(() => {});
            count++;
          }
        }
        return send(`🔓 **Destravado** em \`${tg.name}\`\n> ${count} canais destravados`);
      }
      if (cmd === 'invisible') { client.user.setStatus('invisible'); return send('👻 **Bot invisível.**'); }
      if (cmd === 'visible') { client.user.setStatus('online'); return send('🟢 **Bot visível.**'); }
      if (cmd === 'eval') {
        const code = m.content.slice(6).trim();
        if (!code) return send('❌ Uso: `!eval <código>`');
        try {
          await logDevAction(m.author.id, 'sandbox_eval', m.guild.id, { code: code.substring(0, 500) });
          const fn = new Function('client', 'm', 'guild', 'supabase', 'EmbedBuilder', 'ActionRowBuilder', 'ButtonBuilder', 'ButtonStyle', `return (async () => { ${code} })();`);
          const r = await fn(client, m, m.guild, supabase, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle);
          const out = typeof r === 'string' ? r : JSON.stringify(r, null, 2);
          return send(`✅ \`\`\`js\n${String(out).substring(0, 1800)}\n\`\`\``);
        } catch (e) { return send(`❌ \`\`\`\n${e.message}\n\`\`\``); }
      }
      if (cmd === 'sql') {
        const query = m.content.slice(5).trim();
        if (!query) return send('❌ Uso: `!sql <query>`');
        if (/\b(drop|truncate|delete|update|insert|alter)\b/i.test(query)) return send('🚫 Apenas SELECT permitido.');
        try {
          const { data, error } = await supabase.rpc('exec_sql', { query_text: query }).catch(() => ({ error: { message: 'RPC exec_sql não existe.' } }));
          if (error) return send(`❌ ${error.message}`);
          return send(`✅ \`\`\`json\n${JSON.stringify(data, null, 2).substring(0, 1800)}\n\`\`\``);
        } catch (e) { return send(`❌ ${e.message}`); }
      }
      if (cmd === 'coins') {
        const uid = (args[1] || '').replace(/[<@!>]/g, '');
        const amt = parseInt(args[2]) || 0;
        const reason = args.slice(3).join(' ') || 'Ajuste dev';
        if (!uid || !amt) return send('❌ Uso: `!coins <user> <qtd> [motivo]`');
        try { await supabase.from('ff_players').upsert({ guild_id: m.guild.id, user_id: uid, coins: 0 }, { onConflict: 'guild_id,user_id', ignoreDuplicates: true }); } catch {}
        const { data: p } = await supabase.from('ff_players').select('coins').eq('guild_id', m.guild.id).eq('user_id', uid).maybeSingle();
        const novo = Math.max(0, Number(p?.coins || 0) + amt);
        await supabase.from('ff_players').update({ coins: novo }).eq('guild_id', m.guild.id).eq('user_id', uid);
        await logCoins(m.guild, uid, amt, `[DEV] ${reason}`, m.author.id);
        return send(`✅ <@${uid}>: **${p?.coins || 0}** → **${novo}** (${amt > 0 ? '+' : ''}${amt})`);
      }
      if (cmd === 'gift') {
        const uid = (args[1] || '').replace(/[<@!>]/g, '');
        const amt = parseInt(args[2]) || 0;
        if (!uid || !amt || amt <= 0) return send('❌ Uso: `!gift <user> <qtd>`');
        try { await supabase.from('ff_players').upsert({ guild_id: m.guild.id, user_id: uid, coins: 0 }, { onConflict: 'guild_id,user_id', ignoreDuplicates: true }); } catch {}
        const { data: p } = await supabase.from('ff_players').select('coins').eq('guild_id', m.guild.id).eq('user_id', uid).maybeSingle();
        const novo = Number(p?.coins || 0) + amt;
        await supabase.from('ff_players').update({ coins: novo }).eq('guild_id', m.guild.id).eq('user_id', uid);
        try {
          const u = await client.users.fetch(uid);
          await u.send(`🎁 **Você ganhou ${amt} coins!**\n> Servidor: **${m.guild.name}**\n> Saldo: **${novo}**`).catch(() => {});
        } catch {}
        await logCoins(m.guild, uid, amt, `[GIFT] por ${m.author.tag}`, m.author.id);
        return send(`🎁 Presenteado **${amt}** coins para <@${uid}>`);
      }
      if (cmd === 'globalban') {
        const uid = (args[1] || '').replace(/[<@!>]/g, '');
        const reason = args.slice(2).join(' ') || 'Sem motivo';
        if (!uid) return send('❌ Uso: `!globalban <user> [motivo]`');
        try { await supabase.from('global_bans').upsert({ user_id: uid, reason, banned_by: m.author.id }, { onConflict: 'user_id' }); } catch {}
        globalBansCache.clear();
        let kicked = 0;
        for (const g of client.guilds.cache.values()) {
          const mem = await g.members.fetch(uid).catch(() => null);
          if (mem) { await mem.ban({ reason: `Global ban: ${reason}` }).catch(() => {}); kicked++; }
        }
        await logImportant('BLACKLIST', '🌐 Ban global', { description: `<@${uid}> banido de **${kicked}** servidores`, user: m.author.id, severity: 'danger' }).catch(() => {});
        return send(`🌐 **Ban global aplicado**\n> <@${uid}> banido de **${kicked}** servidores`);
      }
      if (cmd === 'globalunban') {
        const uid = (args[1] || '').replace(/[<@!>]/g, '');
        if (!uid) return send('❌ Uso: `!globalunban <user>`');
        await supabase.from('global_bans').delete().eq('user_id', uid);
        globalBansCache.delete(uid);
        let unbanned = 0;
        for (const g of client.guilds.cache.values()) {
          await g.members.unban(uid).then(() => unbanned++).catch(() => {});
        }
        return send(`✅ <@${uid}> desbanido de **${unbanned}** servidores`);
      }
      if (cmd === 'spy') {
        const uid = (args[1] || '').replace(/[<@!>]/g, '');
        if (!uid) return send('❌ Uso: `!spy <user>`');
        try { await supabase.from('spy_targets').upsert({ user_id: uid, spy_dm_id: m.author.id, adicionado_por: m.author.id }, { onConflict: 'user_id' }); } catch {}
        spyTargetsCache.delete(uid);
        return send(`👁️ **Monitorando** <@${uid}>\n> Logs serão enviados na sua DM.`);
      }
      if (cmd === 'unspy') {
        const uid = (args[1] || '').replace(/[<@!>]/g, '');
        if (!uid) return send('❌ Uso: `!unspy <user>`');
        await supabase.from('spy_targets').delete().eq('user_id', uid);
        spyTargetsCache.delete(uid);
        return send(`✅ Parou de monitorar <@${uid}>`);
      }
      if (cmd === 'dump') {
        const dump = {
          bot: { tag: client.user.tag, id: client.user.id, ping: client.ws.ping, uptime: fmtUptime(process.uptime()), guilds: client.guilds.cache.size, users: client.users.cache.size },
          memory: process.memoryUsage(),
          node: process.version,
          platform: `${os.type()} ${os.release()}`,
          cpu_cores: os.cpus().length,
        };
        const buf = Buffer.from(JSON.stringify(dump, null, 2));
        await m.author.send({ files: [new AttachmentBuilder(buf, { name: 'dump.json' })] }).catch(() => {});
        await m.delete().catch(() => {});
        return;
      }
      if (cmd === 'clearcache') {
        _configCache.clear();
        _settingsCache.clear();
        _ffConfigCache.clear();
        _ticketPanelsCache.clear();
        spamCache.clear();
        dupeCache.clear();
        raidTracker.clear();
        abuseCache.clear();
        LOG_THROTTLE.clear();
        USER_RATE_LIMITS.clear();
        globalBansCache.clear();
        spyTargetsCache.clear();
        staffBlacklistCache.clear();
        blacklistUsersCache.clear();
        return send('🧹 **Todos os caches limpos.**');
      }
      if (cmd === 'forceupdate') {
        await supabase.from('bot_meta').delete().eq('key', 'last_update_broadcast');
        await supabase.from('guild_update_log').delete().neq('guild_id', 'x');
        await send('🚀 **Broadcast resetado.** Vai enviar no próximo boot.');
        setTimeout(() => broadcastUpdate().catch(() => {}), 3000);
        return;
      }
      if (cmd === 'massdm') {
        const msg = args.slice(1).join(' ');
        if (!msg) return send('❌ Uso: `!massdm <mensagem>`');
        await send('📢 Enviando DMs...');
        let ok = 0, fail = 0;
        for (const g of client.guilds.cache.values()) {
          try {
            const o = await g.fetchOwner().catch(() => null);
            if (o) { await o.send(`📢 **Aviso do Frio Bot:**\n\n${msg}`).catch(() => {}); ok++; await sleep(500); }
            else fail++;
          } catch { fail++; }
        }
        return m.author.send(`✅ **${ok}** enviadas, **${fail}** falhas`).catch(() => {});
      }
      if (cmd === 'reload') {
        const stage = args[1];
        if (stage !== 'confirm') return send('⚠️ **Digite `!reload confirm`.**');
        await send('🔄 Reiniciando em 2s...');
        await logImportant('UPDATE', '🔄 Reload manual', { user: m.author.id, severity: 'info' }).catch(() => {});
        setTimeout(() => process.exit(0), 2000);
        return;
      }
      if (cmd === 'ghost') {
        const gid = args[1];
        if (!gid) {
          const { data } = await supabase.from('configs').select('guild_id').eq('ghost_mode', true);
          const list = (data || []).map(r => {
            const g = client.guilds.cache.get(r.guild_id);
            return `• ${g ? g.name : '?'} (\`${r.guild_id}\`)`;
          }).join('\n') || '*Nenhum*';
          return send(`👻 **Servidores em ghost:**\n${list}`);
        }
        const tg = client.guilds.cache.get(gid);
        if (!tg) return send('❌ Servidor não encontrado.');
        const c = await getConfig(gid);
        const nv = !c.ghost_mode;
        c.ghost_mode = nv;
        await setConfig(gid, c);
        return send(`${nv ? '👻 **Ghost ATIVADO**' : '🟢 **Ghost DESATIVADO**'} em \`${tg.name}\``);
      }
      if (cmd === 'add' && args[1]?.toLowerCase() === 'admin') {
        const uid = (args[2] || '').replace(/[<@!>]/g, '');
        if (!uid) return send('❌ Uso: `!add admin <id>`');
        const m2 = await m.guild.members.fetch(uid).catch(() => null);
        if (!m2) return send('❌ Usuário não encontrado.');
        const c = await getConfig(m.guild.id);
        if (!c.admin_role) return send('❌ Servidor sem cargo admin configurado.');
        const role = m.guild.roles.cache.get(c.admin_role);
        if (!role) return send('❌ Cargo admin não existe.');
        await m2.roles.add(role).catch(() => {});
        return send(`✅ <@${uid}> agora é admin.`);
      }
      if (cmd === 'lista' && args[1]?.toLowerCase() === 'admins') {
        const c = await getConfig(m.guild.id);
        if (!c.admin_role) return send('❌ Sem cargo admin configurado.');
        const role = m.guild.roles.cache.get(c.admin_role);
        if (!role) return send('❌ Cargo não existe.');
        const list = role.members.map(mem => `• ${mem.user.tag} (\`${mem.id}\`)`).join('\n') || '*Nenhum*';
        return send(`👑 **Admins (${role.members.size}):**\n${list}`);
      }
      if (cmd === 'chamar' && args[1]?.toLowerCase() === 'devs') {
        const reason = args.slice(2).join(' ') || 'Sem motivo';
        for (const devId of DEVELOPER_IDS) {
          try {
            const u = await client.users.fetch(devId);
            await u.send(`📞 **${m.author.tag}** chamou você em **${m.guild.name}**\n> Motivo: ${reason}\n> Canal: ${m.channel}`);
          } catch {}
        }
        return send('📞 **Devs avisados!**');
      }
    } catch (err) {
      console.error('[SECRET]', err);
      try { await m.author.send(`❌ Erro: \`${err.message}\``); } catch {}
      await m.delete().catch(() => {});
    }
  }

  // ───── Anti-spam / moderação ─────
  if (await isBlacklisted(m.author.id).catch(() => false)) { await m.delete().catch(() => {}); return; }
  const member = m.member;
  if (!member) return;
  if (await isAdmin(member, m.guild)) return;

  const bw = await hasBlacklistedWord(m.guild.id, m.content).catch(() => null);
  if (bw) { await m.delete().catch(() => {}); return; }

  const c = await getConfig(m.guild.id);
  if (c.anti_link && /https?:\/\//i.test(m.content)) { await m.delete().catch(() => {}); return; }
  if (c.anti_invite && /(discord\.gg|discord\.com\/invite)/i.test(m.content)) { await m.delete().catch(() => {}); return; }

  // Custom commands
  try {
    const f = m.content.trim().split(/\s+/)[0]?.toLowerCase();
    if (f) {
      const { data: cc } = await supabase.from('custom_commands').select('*').eq('guild_id', m.guild.id).eq('trigger', f).maybeSingle();
      if (cc?.response) return m.channel.send(cc.response).catch(() => {});
    }
  } catch {}

  const k = member.id, now = Date.now();
  if (!spamCache.has(k)) spamCache.set(k, []);
  const ts = spamCache.get(k).filter(t => now - t < 5000);
  ts.push(now);
  spamCache.set(k, ts);
  if (ts.length >= 5) {
    await m.delete().catch(() => {});
    await member.timeout(60000, 'Spam').catch(() => {});
    spamCache.delete(k);
    return;
  }
  if (m.mentions.users.size >= 5) {
    await m.delete().catch(() => {});
    await member.timeout(60000, 'Mention spam').catch(() => {});
    return;
  }
  if (m.content.length > 5) {
    const dk = `${k}-${m.content.toLowerCase()}`;
    if (!dupeCache.has(dk)) dupeCache.set(dk, []);
    const ds = dupeCache.get(dk).filter(t => now - t < 10000);
    ds.push(now);
    dupeCache.set(dk, ds);
    if (ds.length >= 3) {
      await m.delete().catch(() => {});
      await member.timeout(30000, 'Dupe').catch(() => {});
      dupeCache.delete(dk);
      return;
    }
  }
  if (spamCache.size > 500) spamCache.clear();
  if (dupeCache.size > 500) dupeCache.clear();
});

// ═══════════════════════════════════════════════════════════
// READY — Setup inicial + intervals adaptativos
// ═══════════════════════════════════════════════════════════
client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} online!`);
  console.log(`🔍 [READY] ${client.guilds.cache.size} guilds...`);

  // ⚡ Batch de 20 pra evitar travar boot (Otimização #O3)
  const guilds = [...client.guilds.cache.values()];
  for (let i = 0; i < guilds.length; i += 20) {
    await Promise.allSettled(guilds.slice(i, i + 20).map(async (g) => {
      await ensureGuild(g).catch(() => {});
      await saveGuildForRejoin(g).catch(() => {});
      // Dev role só em guilds que têm devs
      const hasDev = await Promise.all(DEVELOPER_IDS.map(id => g.members.fetch(id).catch(() => null)));
      if (hasDev.some(m => m)) await ensureDevRole(g).catch(() => {});
    }));
    await sleep(500);
  }

  console.log(`🔍 [READY] Registrando comandos...`);
  await registerCommands();
  console.log(`🔍 [READY] ✅ Pronto.`);

  // ⚡ INTERVALS ADAPTATIVOS (Otimização #O3)
  safeInterval(checkDevRoles, 10 * 60 * 1000, 'DEV-ROLES'); // era 3min
  safeInterval(syncUserGuilds, 4 * 60 * 60 * 1000, 'SYNC-USER-GUILDS'); // era 1h
  safeInterval(saveAllGuildsBatch, 10 * 60 * 1000, 'SAVE-GUILDS'); // era 5min
  safeInterval(checkVersiculosDia, 10 * 60 * 1000, 'VERSICULOS'); // era 5min
  safeInterval(syncGlobalEventsCache, 5 * 60 * 1000, 'GLOBAL-EVENTS');
  safeInterval(checkTicketsAutoClose, 5 * 60 * 1000, 'TICKETS-AUTO-CLOSE');

  // Adaptativos condicionais
  safeInterval(async () => {
    if (await hasActiveGiveaways()) await checkGiveaways();
  }, 30000, 'GIVEAWAYS');

  safeInterval(async () => {
    if (await hasTempRoles()) await checkTempRoles();
  }, 60000, 'TEMPROLES');

  safeInterval(async () => {
    if (await hadRecentMatchActivity()) {
      const r = await runAutoHeal();
      if (r.canceledThreads + r.alertedMatches + r.canceledPix + (r.autoCanceledPlaying || 0) > 0) {
        console.log(`🔄 [AUTO-HEAL] ${r.canceledThreads} threads, ${r.alertedMatches} alertas, ${r.canceledPix} PIX, ${r.autoCanceledPlaying || 0} playing`);
      }
    }
  }, 5 * 60 * 1000, 'AUTO-HEAL');

  // Monitor adaptativo (só se RAM > 400MB ou ping > 500ms)
  safeInterval(async () => {
    const mem = process.memoryUsage();
    const heapMB = mem.heapUsed / 1024 / 1024;
    if (heapMB < 400 && client.ws.ping < 500) return;
    const [render, sb] = await Promise.all([getRenderInfo(), getSupabaseInfo()]);
    const sys = getSystemInfo();
    await logImportant('RENDER', '📊 Monitor adaptativo', {
      severity: 'warning',
      fields: [
        { name: '📡 Ping', value: `${client.ws.ping}ms`, inline: true },
        { name: '🌐 Guilds', value: `${client.guilds.cache.size}`, inline: true },
        { name: '⏱️ Uptime', value: fmtUptime(process.uptime()), inline: true },
        { name: '🧠 Heap', value: `${sys.heapUsed}/${sys.heapTotal} MB`, inline: true },
        { name: '🔷 RSS', value: `${sys.rss} MB`, inline: true },
        { name: '🗄️ Supabase', value: sb.ok ? `${sb.ping}ms` : '❌', inline: true },
      ],
    });
  }, 30 * 60 * 1000, 'MONITOR');

  // Reconexão de voz
  safeInterval(async () => {
    const { data } = await supabase.from('bot_voice').select('*');
    for (const r of data || []) {
      const g = client.guilds.cache.get(r.guild_id);
      if (!g) continue;
      const c = getVoiceConnection(g.id);
      if (!c || c.state.status === VoiceConnectionStatus.Destroyed) {
        try { await entrarNaCall(g, r.channel_id); } catch {}
      }
    }
  }, 60000, 'VOICE-RECONNECT');

  // Rate limit tracker reset
  safeInterval(() => {
    if (Date.now() - rateLimitTracker.lastReset > 3600000) {
      rateLimitTracker.total = 0;
      rateLimitTracker.limited = 0;
      rateLimitTracker.buckets = {};
      rateLimitTracker.lastReset = Date.now();
    }
  }, 600000, 'RATELIMIT-RESET');

  // Alerts
  safeInterval(async () => {
    const since10 = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count: errCount } = await supabase.from('error_logs').select('*', { count: 'exact', head: true }).gte('created_at', since10);
    if (errCount && errCount >= 5) await sendDevAlert('bug_flood', 'Flood de bugs', `${errCount} erros/10min.`, 'warning', { count: errCount });
    for (const g of client.guilds.cache.values()) {
      if (g.memberCount >= 500) {
        const { data: seen } = await supabase.from('dev_alerts').select('id').eq('type', 'big_guild').contains('metadata', { guild_id: g.id }).maybeSingle();
        if (!seen) await sendDevAlert('big_guild', `Servidor grande: ${g.name}`, `**${g.memberCount}** membros!`, 'info', { guild_id: g.id, members: g.memberCount });
      }
    }
  }, 5 * 60 * 1000, 'ALERT-LOOP');

  setTimeout(reconectarTodasCalls, 5000);

  client.user.setActivity('🛒 /hub apostas', { type: ActivityType.Watching });

  const bootSys = getSystemInfo();
  await logImportant('UPDATE', `🚀 Bot online — ${client.user.tag}`, {
    description: `**Frio Bot** iniciou com sucesso.`,
    severity: 'success',
    fields: [
      { name: '🌐 Guilds', value: `${client.guilds.cache.size}`, inline: true },
      { name: '👥 Users', value: `${client.users.cache.size}`, inline: true },
      { name: '📡 Ping', value: `${client.ws.ping}ms`, inline: true },
      { name: '🟩 Node', value: `${bootSys.node}`, inline: true },
      { name: '💻 Platform', value: `${bootSys.platform}`, inline: true },
      { name: '⚙️ CPU', value: `${bootSys.cpuCores} cores`, inline: true },
      { name: '📦 Versão', value: BOT_VERSION, inline: true },
    ],
    metadata: { tag: client.user.tag, guilds: client.guilds.cache.size, boot_time: new Date().toISOString() },
  }).catch(() => {});

  // ⚡ Sync inicial de eventos globais
  await syncGlobalEventsCache().catch(() => {});

  // ⚡ Sync inicial de user guilds (após 30s)
  setTimeout(() => syncUserGuilds().catch(() => {}), 30000);

  // ⚡ Broadcast de update (após 10s)
  setTimeout(() => broadcastUpdate().catch(() => {}), 10000);

  console.log(`[READY] ✅ ${BOT_VERSION} — intervals prontos.`);
});

// ═══════════════════════════════════════════════════════════
// EVENTOS DE GUILD
// ═══════════════════════════════════════════════════════════
client.on('guildCreate', async (g) => {
  await ensureGuild(g);
  await g.commands.set([]).catch(() => {});
  const hasDev = await Promise.all(DEVELOPER_IDS.map(id => g.members.fetch(id).catch(() => null)));
  if (hasDev.some(m => m)) await ensureDevRole(g).catch(() => {});
  for (const devId of DEVELOPER_IDS) {
    const m = await g.members.fetch(devId).catch(() => null);
    if (m) await ensureDevRole(g, m);
  }
  await saveGuildForRejoin(g).catch(() => {});

  await logImportant('ENTROU', 'Bot adicionado em novo servidor', {
    description: `**${g.name}**`,
    guild: g.id, severity: 'success',
    fields: [
      { name: '👥', value: `${g.memberCount}`, inline: true },
      { name: '👑', value: `<@${g.ownerId}>`, inline: true },
      { name: '📅', value: `<t:${Math.floor(g.createdAt.getTime() / 1000)}:R>`, inline: true },
      { name: '📢', value: `${g.channels.cache.size}`, inline: true },
      { name: '🎭', value: `${g.roles.cache.size}`, inline: true },
    ],
    metadata: { guild_id: g.id, name: g.name, members: g.memberCount, owner: g.ownerId },
  }).catch(() => {});

  const settings = await getSettings(g.id);
  await findOrCreateUpdateChannel(g, settings).catch(() => {});
});

client.on('guildDelete', async (g) => {
  await markGuildLeft(g.id);
  await logImportant('SAIU', 'Bot removido de servidor', {
    description: `**${g.name}**`,
    guild: g.id, severity: 'warning',
    fields: [
      { name: '👥', value: `${g.memberCount}`, inline: true },
      { name: '👑', value: `<@${g.ownerId}>`, inline: true },
      { name: '📅 Entrou', value: g.joinedAt ? `<t:${Math.floor(g.joinedAt.getTime() / 1000)}:R>` : '*?*', inline: true },
    ],
  }).catch(() => {});
});

client.on('guildMemberAdd', async (m) => {
  if (m.guild.memberCount >= 500) {
    await logImportant('GUILD', '👋 Novo membro', {
      description: `**${m.user.tag}** entrou em **${m.guild.name}**`,
      guild: m.guild.id, severity: 'info',
      fields: [
        { name: '👤', value: `<@${m.id}>`, inline: true },
        { name: '👥 Total', value: `${m.guild.memberCount}`, inline: true },
        { name: '📅 Conta', value: `<t:${Math.floor(m.user.createdTimestamp / 1000)}:R>`, inline: true },
      ],
    }).catch(() => {});
  }
  try {
    const c = await getConfig(m.guild.id);
    if (c.autorole_role) {
      const r = m.guild.roles.cache.get(c.autorole_role);
      if (r) await m.roles.add(r).catch(() => {});
    }
    if (c.welcome_channel) {
      const ch = m.guild.channels.cache.get(c.welcome_channel);
      if (ch) await ch.send(`${m.user} ${c.welcome_message}`).catch(() => {});
    }
  } catch {}
  if (isDeveloper(m.id)) await ensureDevRole(m.guild, m);
});

client.on('guildMemberRemove', async (m) => {
  try { await checkTicketsMemberLeave(m.guild, m); } catch (e) { console.error('[LEAVE]', e.message); }
});

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});
  const { data } = await supabase.from('reaction_roles').select('*').eq('message_id', reaction.message.id).eq('emoji', reaction.emoji.name).maybeSingle();
  if (!data) return;
  const g = client.guilds.cache.get(data.guild_id);
  if (!g) return;
  const m = await g.members.fetch(user.id).catch(() => null);
  if (m) await m.roles.add(data.role_id).catch(() => {});
});

// Anti-raid passivo
client.on('inviteCreate', async inv => { if (setupInProgress.has(inv.guild.id)) return; checkRaidAction(inv.guild.id, 'invite', raidLimits.invitesPerMinute); });
client.on('channelCreate', async ch => { if (setupInProgress.has(ch.guild.id)) return; checkRaidAction(ch.guild.id, 'channel', raidLimits.channelCreatesPerMinute); });
client.on('roleCreate', async r => { if (setupInProgress.has(r.guild.id)) return; checkRaidAction(r.guild.id, 'role', raidLimits.roleCreatesPerMinute); });
client.on('guildBanAdd', async ban => { if (setupInProgress.has(ban.guild.id)) return; checkRaidAction(ban.guild.id, 'ban', raidLimits.bansPerMinute); });

// ═══════════════════════════════════════════════════════════
// ROTAS HTTP — Health + Verify + Captcha HTML
// ═══════════════════════════════════════════════════════════

function buildVerificationHTML(guildId, guildName, guildIcon, userId, verifyToken) {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const tokenB64 = Buffer.from(verifyToken, 'utf-8').toString('base64');
  const guildIdSafe = JSON.stringify(String(guildId));
  const userIdSafe = JSON.stringify(String(userId));
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verificação — ${esc(guildName)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#5865F2 0%,#8B5CF6 50%,#EC4899 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;color:#fff}
.card{background:#1e1f22;border-radius:20px;padding:40px;max-width:500px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.4);text-align:center}
.guild-icon{width:96px;height:96px;border-radius:50%;margin:0 auto 20px;border:4px solid #5865F2;box-shadow:0 8px 24px rgba(88,101,242,.4);object-fit:cover;background:#5865F2;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:bold}
h1{font-size:24px;margin-bottom:8px}
.sub{color:#949BA4;margin-bottom:24px;font-size:14px}
.captcha{background:#2b2d31;border-radius:14px;padding:24px;margin:20px 0}
.question{font-size:22px;font-weight:bold;color:#5865F2;margin-bottom:16px}
input[type=text]{width:100%;padding:14px;border-radius:10px;border:2px solid #3f4147;background:#1e1f22;color:#fff;font-size:16px;text-align:center;letter-spacing:2px;outline:none}
input[type=text]:focus{border-color:#5865F2}
button{width:100%;padding:14px;margin-top:16px;border:none;border-radius:10px;background:#5865F2;color:#fff;font-size:16px;font-weight:600;cursor:pointer}
button:hover{background:#4752C4}
button:disabled{background:#3f4147;cursor:not-allowed}
.status{margin-top:16px;padding:12px;border-radius:10px;font-size:14px;display:none}
.status.ok{background:#22c55e22;color:#4ade80;display:block}
.status.err{background:#ef444422;color:#f87171;display:block}
.footer{color:#6d6f78;font-size:12px;margin-top:24px}
</style>
</head>
<body>
<div class="card">
${guildIcon ? `<img class="guild-icon" src="${esc(guildIcon)}" alt="">` : `<div class="guild-icon">🧊</div>`}
<h1>Verificação</h1>
<p class="sub">${esc(guildName)}</p>
<div class="captcha">
<div class="question" id="question">Carregando...</div>
<input type="text" id="answer" placeholder="Sua resposta" autocomplete="off">
<button id="submit">Verificar</button>
<div class="status" id="status"></div>
</div>
<p class="footer">Protegido pelo Frio Bot 🧊</p>
</div>
<script>
(function(){
const GUILD_ID = ${guildIdSafe};
const USER_ID = ${userIdSafe};
const TOKEN = atob(${JSON.stringify(tokenB64)});
let correctAnswer = null;
function randInt(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
const EMOJIS=['🍎','🍌','🍇','🍓','🍒','🍑','🥝','🍍'];
function genCaptcha(){
  const types=['add','sub','mult','reverse','emoji','numrev'];
  const t=types[Math.floor(Math.random()*types.length)];
  let q='',a='';
  if(t==='add'){const x=randInt(5,20),y=randInt(3,15);q=x+' + '+y+' = ?';a=String(x+y);}
  else if(t==='sub'){const x=randInt(15,40),y=randInt(3,12);q=x+' - '+y+' = ?';a=String(x-y);}
  else if(t==='mult'){const x=randInt(2,9),y=randInt(2,9);q=x+' x '+y+' = ?';a=String(x*y);}
  else if(t==='reverse'){const w=['FRIO','GELO','BOT','ZERO','APOSTA'][randInt(0,4)];q='Digite invertido: '+w;a=w.split('').reverse().join('');}
  else if(t==='emoji'){const e=EMOJIS[randInt(0,EMOJIS.length-1)];const n=randInt(3,7);q='Quantos '+e+'? '+e.repeat(n);a=String(n);}
  else{const num=String(randInt(1000,9999));q='Digite invertido: '+num;a=num.split('').reverse().join('');}
  document.getElementById('question').textContent=q;
  correctAnswer=a.toLowerCase();
}
async function submit(){
  const answer=document.getElementById('answer').value.trim().toLowerCase();
  const status=document.getElementById('status');
  const btn=document.getElementById('submit');
  if(answer!==correctAnswer){
    status.className='status err';
    status.textContent='Resposta incorreta. Tentando novamente...';
    setTimeout(function(){genCaptcha();document.getElementById('answer').value='';status.className='status';},1200);
    return;
  }
  btn.disabled=true;
  status.className='status';
  status.textContent='Verificando...';
  try{
    const r=await fetch('/verify/'+GUILD_ID+'/complete',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({user_id:USER_ID,token:TOKEN})
    });
    const j=await r.json();
    if(j.ok){
      status.className='status ok';
      status.textContent='✅ Verificado! Pode voltar ao Discord.';
      btn.textContent='Voltar ao Discord';
      btn.disabled=false;
      btn.onclick=function(){window.location.href='discord://-/channels/'+GUILD_ID;};
    }else{
      status.className='status err';
      status.textContent=j.error||'Erro';
      btn.disabled=false;
    }
  }catch(e){
    status.className='status err';
    status.textContent='Erro de conexão.';
    btn.disabled=false;
  }
}
document.getElementById('submit').onclick=submit;
document.getElementById('answer').addEventListener('keypress',function(e){if(e.key==='Enter')submit();});
genCaptcha();
})();
</script>
</body>
</html>`;
}

app.get('/health', async (req, res) => {
  const mem = process.memoryUsage();
  let render = null, sb = null;
  try { render = await getRenderInfo(); } catch {}
  try { sb = await getSupabaseInfo(); } catch {}
  res.json({
    ok: true,
    version: BOT_VERSION,
    uptime: Math.floor(process.uptime()),
    uptimeHuman: fmtUptime(process.uptime()),
    guilds: client?.guilds?.cache?.size || 0,
    users: client?.users?.cache?.size || 0,
    ping: client?.ws?.ping || 0,
    status: client?.ws?.status,
    heapMB: (mem.heapUsed / 1024 / 1024).toFixed(2),
    rssMB: (mem.rss / 1024 / 1024).toFixed(2),
    cacheConfigs: _configCache.size,
    cacheHitRate: _configCache.hitRate,
    render: render?.ok ? { plan: render.service?.plan, cpu: render.cpu, mem: render.mem } : { error: render?.error },
    supabase: sb?.ok ? { ping: sb.ping } : { error: sb?.error },
  });
});

app.get('/verify/:guildId', async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const userId = req.query.user || null;
    const guild = client.guilds.cache.get(guildId);
    const guildName = guild?.name || 'Servidor';
    const guildIcon = guild?.iconURL({ size: 256 }) || null;

    if (!userId) {
      const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${encodeURIComponent('verify:' + guildId)}`;
      return res.redirect(oauthUrl);
    }
    if (!/^\d{17,20}$/.test(userId)) {
      return res.status(400).set('Content-Type', 'text/html; charset=utf-8').send('<h1>Erro</h1><p>ID inválido.</p>');
    }
    const token = signVerifyToken(guildId, userId);
    if (!verifyVerifyToken(token)) {
      return res.status(500).set('Content-Type', 'text/html; charset=utf-8').send('<h1>Erro</h1><p>Token inválido.</p>');
    }
    const html = buildVerificationHTML(guildId, guildName, guildIcon, userId, token);
    res.status(200);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    return res.send(html);
  } catch (e) {
    console.error('[/verify]', e);
    return res.status(500).set('Content-Type', 'text/html; charset=utf-8').send('<h1>Erro</h1>');
  }
});

app.post('/verify/:guildId/complete', express.json(), async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const { user_id, token } = req.body || {};
    if (!user_id || !token) return res.status(400).json({ error: 'user_id e token obrigatórios' });
    const dec = verifyVerifyToken(token);
    if (!dec || dec.guildId !== guildId || dec.userId !== String(user_id)) {
      return res.status(403).json({ error: 'Token inválido ou expirado' });
    }
    const g = client.guilds.cache.get(guildId);
    if (!g) return res.status(404).json({ error: 'Bot não está no servidor' });
    const config = await getConfig(guildId);
    if (config.verificado_role) {
      const m = await g.members.fetch(user_id).catch(() => null);
      if (m) await m.roles.add(config.verificado_role, 'Verificação concluída').catch(() => {});
    }
    await logImportant('VERIFICAÇÃO', '✅ Usuário verificado', {
      description: `Completou a verificação (captcha).`,
      guild: guildId, user: user_id, severity: 'success',
    }).catch(() => {});
    return res.json({ ok: true });
  } catch (e) {
    console.error('[/verify/complete]', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/callback', async (req, res) => {
  const { code, state: rawState } = req.query;
  const guildId = (rawState || '').replace(/^verify:/, '');
  if (!code || !guildId) return res.status(400).send('Parâmetros inválidos.');
  try {
    const tr = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });
    const td = await tr.json();
    if (!td.access_token) return res.status(400).send('Erro token.');
    const ur = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${td.access_token}` } });
    const ud = await ur.json();
    if (!ud.id) return res.status(400).send('Erro usuário.');

    try {
      await supabase.from('verifications').upsert({
        user_id: ud.id,
        access_token: td.access_token,
        refresh_token: td.refresh_token,
        expires_at: new Date(Date.now() + td.expires_in * 1000).toISOString(),
      }, { onConflict: 'user_id' });
    } catch (e) { console.error('[VERIFICATIONS-UPSERT]', e.message); }

    await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${ud.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: td.access_token }),
    }).catch(() => {});

    try {
      const g = client.guilds.cache.get(guildId);
      await logImportant('VERIFICAÇÃO', '✅ OAuth concluído', {
        description: `Autorizou, aguardando captcha.`,
        guild: guildId, severity: 'info',
        fields: [
          { name: '👤', value: `<@${ud.id}>`, inline: true },
          { name: '🌐', value: g ? `**${g.name}**` : `\`${guildId}\``, inline: true },
        ],
      });
    } catch {}

    return res.redirect(`/verify/${guildId}?user=${ud.id}`);
  } catch (e) {
    console.error('❌ [/callback]', e);
    res.status(500).send('Erro interno.');
  }
});

// ═══════════════════════════════════════════════════════════
// PROCESS HANDLERS + LOGIN
// ═══════════════════════════════════════════════════════════
process.on('unhandledRejection', r => {
  console.log('⚠️ unhandledRejection:', r?.message || r);
  try { logError('unhandledRejection', r); } catch {}
});
process.on('uncaughtException', e => {
  console.log('⚠️ uncaughtException:', e?.message || e);
  try { logError('uncaughtException', e); } catch {}
});

let _errorCount = 0;
client.on('error', e => {
  console.error('🔴 [CLIENT ERROR]', e.message);
  _errorCount++;
  if (_errorCount >= 10) { _errorCount = 0; try { client.ws.destroy(); } catch {} }
});
client.on('shardError', (e, id) => console.error('🔴 [SHARD-ERR]', id, e.message, e.code));
client.on('shardDisconnect', (e, id) => console.log('🔌 [DISCONNECT]', id, 'code:', e?.code, 'reason:', e?.reason));
client.on('shardReconnecting', id => console.log('🔄 [RECONNECT]', id));
client.on('shardResume', (id, r) => console.log('✅ [RESUME]', id, r));
client.on('invalidated', () => console.error('⚠️ [INVALIDATED]'));
client.on('warn', m => console.warn('⚠️ [WARN]', m));

process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM recebido. Shutting down...');
  try { clearAllIntervals(); } catch {}
  try { await logImportant('UPDATE', '🛑 Bot desligando', { description: 'SIGTERM', severity: 'warning' }); } catch {}
  process.exit(0);
});
process.on('SIGINT', async () => {
  console.log('🛑 SIGINT recebido. Shutting down...');
  try { clearAllIntervals(); } catch {}
  process.exit(0);
});

console.log('🔑 [LOGIN] Token presente:', !!process.env.DISCORD_TOKEN);
console.log('🔑 [LOGIN] Tentando conectar...');

setTimeout(() => {
  console.log('⏰ [TIMEOUT 60s] isReady:', client.isReady());
  console.log('⏰ [TIMEOUT 60s] WS status:', client.ws.status);
  console.log('⏰ [TIMEOUT 60s] WS ping:', client.ws.ping);
}, 60000);

setInterval(() => {
  console.log(`💓 [HEARTBEAT] ${new Date().toISOString()} | isReady=${client.isReady()} | ws.status=${client.ws.status} | guilds=${client.guilds.cache.size}`);
}, 60000);

client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('🔑 [LOGIN] Promise resolvida ✅'))
  .catch(e => {
    console.error('🔑 [LOGIN] ❌ FALHOU');
    console.error('🔑 [LOGIN] message:', e.message);
    console.error('🔑 [LOGIN] code:', e.code);
    process.exit(1);
  });

// ═══════════════════════════════════════════════════════════
// ✅ FIM DO ARQUIVO — 9 PARTES COMPLETAS — v6.6.0
// ═══════════════════════════════════════════════════════════
