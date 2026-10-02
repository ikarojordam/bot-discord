// ═══════════════════════════════════════════════════════════
// 🤖 FRIOBOT — index.js — v6.8.0
// ESTRUTURA EM 12 PARTES
//   PARTE 1: Base, Client, Cache, Config, Permissões, Premium, Logs
//   PARTE 2: Helpers globais (IA, PIX, MP, OAuth, Dashboard, Auto-Heal)
//   PARTE 3: Versículo, Analytics, Voz, Música, Sorteios, Shop
//   PARTE 4: Free Fire (Config, Multi-PIX, Logs, Filas, Painéis)
//   PARTE 4.5: Painéis FF (Hub + Subpainéis + Custom Embed)
//   PARTE 5: Tickets REFATORADO (/config ticket + /solicitar painel ticket)
//   PARTE 6: Setups (Loja, Comunidade, Organização)
//   PARTE 7: SQL Migration + Dev Hub + Painéis DEV
//   PARTE 8: Admin Hub + Painéis ADMIN + Loja
//   PARTE 9: Interaction + Message + Eventos + READY + HTTP + Login
//   PARTE 10: FRIO PANEL API (site ↔ bot) + Auditoria
//   PARTE 11: CLIENTE API (por plano, isolamento por guild)
//   PARTE 12: Sistema de Streamers (/config streamer + /solicitar painel streamer)
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
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder, UserSelectMenuBuilder,
} = require('discord.js');

const {
  joinVoiceChannel, createAudioPlayer, createAudioResource,
  AudioPlayerStatus, VoiceConnectionStatus, getVoiceConnection, entersState,
} = require('@discordjs/voice');

let playdl;
try { playdl = require('play-dl'); } catch { playdl = null; }

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');

// ═══════════════════════════════════════════════════════════
// VERSÃO
// ═══════════════════════════════════════════════════════════
const BOT_VERSION = 'v6.8.0';
const BOT_START_TIME = Date.now();

// ═══════════════════════════════════════════════════════════
// ENV VARS
// ═══════════════════════════════════════════════════════════
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/callback`;
const OWNER_ID = process.env.OWNER_ID ? String(process.env.OWNER_ID) : null;
const RENDER_API_KEY = process.env.RENDER_API_KEY || null;
const VERIFY_SECRET = process.env.VERIFY_SECRET || DISCORD_CLIENT_SECRET || 'frio-verify-fallback-secret';
const PANEL_API_TOKEN = process.env.PANEL_API_TOKEN || null;
const JWT_SECRET = process.env.JWT_SECRET || null;

if (!JWT_SECRET) console.warn('⚠️ [SECURITY] JWT_SECRET ausente — rotas /api/me/* do painel desabilitadas.');
if (!PANEL_API_TOKEN) console.warn('⚠️ [SECURITY] PANEL_API_TOKEN ausente — auditoria do site desabilitada.');

// ═══════════════════════════════════════════════════════════
// EXPRESS
// ═══════════════════════════════════════════════════════════
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

app.get('/', (req, res) => res.send('FrioBot está online! 🧊'));

const PORT = process.env.PORT || process.env.WEBHOOK_PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 [EXPRESS] Web rodando em http://0.0.0.0:${PORT}`);
  console.log(`🌐 [EXPRESS] Health check: http://0.0.0.0:${PORT}/health`);
});

// ═══════════════════════════════════════════════════════════
// CONSTANTES GLOBAIS
// ═══════════════════════════════════════════════════════════
const EPHEMERAL = MessageFlags.Ephemeral;
const COLOR_FALLBACK = '#5865F2';
const MAX_SHOP_PANELS = 500;
const MAX_TICKET_PANELS = 100;
const MAX_TICKET_TYPES_PER_PANEL = 24;
const MAX_FORM_QUESTIONS = 5;

const DEV_ROLE_NAME = 'Dev do Frio Bot';
const BOT_ROLE_NAME = 'Frio Bot';

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
    headers: { 'X-Client-Info': 'frio-bot/6.8.0' },
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
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: ['CHANNEL', 'MESSAGE', 'REACTION'],
  rest: {
    api: 'https://discordapp.com/api',
    version: '9',
    timeout: 30000,
    retries: 3,
    retryAfter: 5000,
  },
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
// 🔬 DIAGNÓSTICO DE REDE
// ═══════════════════════════════════════════════════════════
(async () => {
  const endpoints = [
    'https://discordapp.com/api/v9/gateway/bot',
    'https://discord.com/api/v9/gateway/bot',
  ];
  const token = process.env.DISCORD_TOKEN;

  console.log('🔬 [DIAG] Testando conectividade com Discord API...');
  console.log('🔬 [DIAG] Token presente:', !!token, '| len:', token ? token.length : 0);

  for (const url of endpoints) {
    const t0 = Date.now();
    try {
      const r = await fetch(url, {
        headers: { 'Authorization': `Bot ${token}` },
        signal: AbortSignal.timeout(10000),
      });
      const ms = Date.now() - t0;
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        console.log(`🔬 [DIAG] ✅ ${url} → HTTP ${r.status} em ${ms}ms | gateway: ${d.url || '?'}`);
      } else if (r.status === 401) {
        console.log(`🔬 [DIAG] ❌ ${url} → HTTP 401 (TOKEN INVÁLIDO!)`);
      } else {
        console.log(`🔬 [DIAG] ⚠️ ${url} → HTTP ${r.status} em ${ms}ms`);
      }
    } catch (e) {
      console.log(`🔬 [DIAG] ❌ ${url} → ${e.name} após ${Date.now() - t0}ms`);
    }
  }
})();

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
// UPDATE NOTES
// ═══════════════════════════════════════════════════════════
const UPDATE_NOTES = [
  { tag: 'ticket', text: 'sistema de ticket refatorado: /config ticket + /solicitar painel ticket' },
  { tag: 'streamer', text: 'sistema completo de streamers: fila, canais privados, embed de apostas' },
  { tag: 'fix', text: 'restaurado rest.api discordapp.com/api v9 (fix Cloudflare)' },
  { tag: 'fix', text: 'Express bind 0.0.0.0 + diagnóstico de rede inline' },
  { tag: 'hub', text: 'multi-PIX por mediador com painel dedicado' },
  { tag: 'public', text: 'versículo do dia automático + /versiculo' },
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
// HMAC
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
// JWT
// ═══════════════════════════════════════════════════════════
function verifyJWT(token) {
  if (!JWT_SECRET) return null;
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
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
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
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
  embed_color: '#5865F2',
};

// ═══════════════════════════════════════════════════════════
// TTLCache
// ═══════════════════════════════════════════════════════════
class TTLCache {
  constructor(maxSize = 3000, ttlMs = 3 * 60 * 1000) {
    this.max = maxSize;
    this.ttl = ttlMs;
    this.map = new Map();
    this.hits = 0;
    this.misses = 0;
    this._inflight = new Map();
  }
  get(key) {
    const entry = this.map.get(key);
    if (!entry) { this.misses++; return undefined; }
    if (Date.now() > entry.expires) {
      if (entry.value !== undefined && !entry.refreshing) {
        entry.refreshing = true;
        setImmediate(() => { entry.refreshing = false; this.map.delete(key); });
      }
      this.hits++;
      return entry.value;
    }
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
    this.map.set(key, { value, expires: Date.now() + this.ttl, refreshing: false });
    return value;
  }
  async fetch(key, loader) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    if (this._inflight.has(key)) return this._inflight.get(key);
    const p = (async () => {
      try {
        const v = await loader();
        this.set(key, v);
        return v;
      } finally {
        this._inflight.delete(key);
      }
    })();
    this._inflight.set(key, p);
    return p;
  }
  delete(key) { this.map.delete(key); return this._inflight.delete(key); }
  clear() { this.map.clear(); this._inflight.clear(); this.hits = 0; this.misses = 0; }
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
const _localeCache = new TTLCache(2000, 5 * 60 * 1000);

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
const _ticketSaveLocks = new Map();
const _ownerCache = new Map();

// ═══════════════════════════════════════════════════════════
// CONFIG HELPERS
// ═══════════════════════════════════════════════════════════
async function getConfig(gid) {
  return _configCache.fetch(gid, async () => {
    try {
      const { data, error } = await supabase.from('configs').select('*').eq('guild_id', gid).maybeSingle();
      if (error) { console.error('[getConfig]', error.message); return { guild_id: gid, ...defaultConfig }; }
      return data ? { ...defaultConfig, ...data, guild_id: gid } : { guild_id: gid, ...defaultConfig };
    } catch (e) {
      console.error('[getConfig]', e.message);
      return { guild_id: gid, ...defaultConfig };
    }
  });
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

// ═══════════════════════════════════════════════════════════
// LOCALE
// ═══════════════════════════════════════════════════════════
async function getGuildLocale(gid) {
  if (!gid) return 'pt-BR';
  const cached = _localeCache.get(gid);
  if (cached) return cached;
  try {
    const { data } = await supabase.from('guild_locale').select('locale').eq('guild_id', gid).maybeSingle();
    return _localeCache.set(gid, data?.locale || 'pt-BR');
  } catch { return 'pt-BR'; }
}
async function setGuildLocale(gid, locale) {
  const valid = ['pt-BR', 'en-US', 'es-ES'];
  if (!valid.includes(locale)) return false;
  _localeCache.delete(gid);
  try {
    await supabase.from('guild_locale').upsert({
      guild_id: gid, locale, updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id' });
    _localeCache.set(gid, locale);
    return true;
  } catch (e) { console.error('[setGuildLocale]', e.message); return false; }
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
    await supabase.from('ff_config').upsert({
      guild_id: gid, mp_access_token: token || null, mp_public_key: publicKey || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id' });
  } catch {}
}

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
  if (!id) return false;
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
    await supabase.from('kill_switch').upsert({
      id: 1, active, reason,
      enabled_by: userId,
      enabled_at: active ? new Date().toISOString() : null,
    });
  } catch {}
  await logImportant('KILL', active ? '🚨 KILL SWITCH ATIVADO' : '🟢 Kill Switch DESATIVADO', {
    description: active ? 'O bot foi silenciado.' : 'O bot voltou ao normal.',
    user: userId, severity: active ? 'danger' : 'success',
    fields: reason ? [{ name: '📝 Motivo', value: reason }] : [],
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
// BLACKLIST
// ═══════════════════════════════════════════════════════════
async function isBlacklisted(uid) {
  if (blacklistUsersCache.has(uid)) return true;
  const { data } = await supabase.from('blacklist_users').select('user_id').eq('user_id', uid).maybeSingle();
  if (data) blacklistUsersCache.add(uid);
  return !!data;
}

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
  // ✅ FIX: guard para não crashar se o client ainda não estiver pronto
  if (!client?.isReady?.()) {
    // guarda pra tentar de novo depois
    setImmediate(() => { if (client?.isReady?.()) logImportant(category, title, opts).catch(() => {}); });
    return;
  }
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
      'PIX-MED': { emoji: '💳', color: '#22c55e' }, 'PANEL': { emoji: '🖥️', color: '#00AAFF' },
      'AUDIT': { emoji: '🔍', color: '#8B5CF6' },
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
      'panel_guild_leave': 'Saída via painel',
      'panel_guild_nuke': 'Nuke via painel',
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
// SYNC USER_GUILDS
// ═══════════════════════════════════════════════════════════
async function syncUserGuilds() {
  let total = 0, errors = 0;
  const guilds = [...client.guilds.cache.values()];
  for (let i = 0; i < guilds.length; i += 10) {
    await Promise.allSettled(guilds.slice(i, i + 10).map(async (g) => {
      try {
        if (g.ownerId) {
          await supabase.from('user_guilds').upsert({
            discord_id: g.ownerId, guild_id: g.id,
            is_owner: true, is_admin: true,
            guild_name: g.name, guild_icon: g.iconURL({ size: 256 }),
            member_count: g.memberCount, updated_at: new Date().toISOString(),
          }, { onConflict: 'discord_id,guild_id' });
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
// RATE LIMIT
// ═══════════════════════════════════════════════════════════
function checkInteractionRateLimit(userId, key, limitMs) {
  const rlKey = `${userId}:${key}`;
  const now = Date.now();
  const last = USER_RATE_LIMITS.get(rlKey) || 0;
  if (now - last < limitMs) return false;
  USER_RATE_LIMITS.set(rlKey, now);
  if (USER_RATE_LIMITS.size > 5000) {
    // ✅ FIX: reset em bloco em vez de iterar 1 por 1 (evita travada em pico)
    USER_RATE_LIMITS.clear();
  }
  return true;
}

// ═══════════════════════════════════════════════════════════
// HELPERS DE ATIVIDADE
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
// FIM DA PARTE 1/12
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 2/12] HELPERS GLOBAIS (CORRIGIDA)
// Rejoin · Aviso Global · Anti-Raid · IA · PIX · MP · OAuth
// Render · Supabase · System · Dashboard · Ranking · Events
// Abuse · Simulador · Broadcast · Auto-Heal · Auto-Refresh
// ═══════════════════════════════════════════════════════════

// ───── REJOIN (com cache de invites 30min) ─────
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
  } catch (e) { console.error('[REJOIN-SAVE]', e.message); }
}

async function markGuildLeft(id) {
  try { await supabase.from('bot_guilds').update({ in_guild: false }).eq('guild_id', id); } catch {}
}

// Expira tentativa após 7 dias + sleep entre guilds
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
        if (newGuild) {
          await supabase.from('bot_guilds').update({ in_guild: true, updated_at: new Date().toISOString() }).eq('guild_id', r.guild_id);
        }
        await sleep(2000);
      } catch {}
    }
  } catch (e) { console.error('[REJOIN]', e.message); }
}

// ───── AVISO GLOBAL (sem DM, evita 500 DMs) ─────
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

// ═══════════════════════════════════════════════════════════
// IA (Pollinations + DuckDuckGo)
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// PIX — BRCODE
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
  // ✅ FIX: removido `.padStart(3,'0')` (dead code — o campo 54 aceita "5.00" com tamanho em bytes)
  if (a) p += f('54', String(parseFloat(a).toFixed(2)));
  p += f('5802', 'BR') + f('59', n.substring(0, 25)) + f('60', ci.substring(0, 15)) + f('62', f('05', tx.substring(0, 25))) + '6304';
  return p + crc16(p);
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
  if (!token) return { error: 'Mercado Pago não configurado.' };
  try {
    const body = {
      transaction_amount: Number(Number(valor).toFixed(2)),
      description: `${descricao} #${oid}`,
      payment_method_id: 'pix',
      external_reference: String(oid),
      payer: { email: `cliente${oid}@friobot.local`, first_name: 'Cliente', last_name: `#${oid}` },
    };
    // ✅ FIX: só inclui notification_url se existir (MP pode rejeitar undefined/null em algumas configs)
    if (process.env.MP_WEBHOOK_URL) body.notification_url = process.env.MP_WEBHOOK_URL;

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
    if (!r.ok) {
      console.error('[MP] Erro:', data);
      return { error: data.message || data.cause?.[0]?.description || `HTTP ${r.status}` };
    }
    const pix = data.point_of_interaction?.transaction_data;
    if (!pix?.qr_code) return { error: 'Sem QR code na resposta' };
    const qrBuf = await QRCode.toBuffer(pix.qr_code, { type: 'png', width: 320, margin: 2 });
    return {
      ok: true, payment_id: data.id, status: data.status,
      payload: pix.qr_code, ticket_url: pix.ticket_url, qrBuf, expires_at: data.date_of_expiration,
    };
  } catch (e) { console.error('[MP]', e.message); return { error: e.message }; }
}

async function consultarPixMercadoPago(payment_id, accessToken = null) {
  const token = accessToken || process.env.MP_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
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
    throw new Error(context === 'ff'
      ? 'PIX não configurado. Configure em `/hub apostas → PIX`.'
      : 'PIX não configurado. Configure em `/admin → Loja → Pagamentos`.');
  }
  const st = await criarPixEstatico(valor, oid, settings);
  return { tipo: 'estatico', provider: 'guild', ok: true, payload: st.payload, qrBuf: st.qrBuf };
}

// ═══════════════════════════════════════════════════════════
// OAUTH — Discord (retry 3x no refresh)
// ═══════════════════════════════════════════════════════════
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
      headers: {
        Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: t }),
    });
    return r.ok;
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════
// RENDER INFO
// ═══════════════════════════════════════════════════════════
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
    const encSvcId = encodeURIComponent(svcId); // ✅ FIX: encode para URLs
    const now = new Date();
    const start = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const end = now.toISOString();
    let cpu = null, mem = null;
    try {
      const mRes = await fetch(`https://api.render.com/v1/metrics/cpu?resourceId=${encSvcId}&startTime=${encodeURIComponent(start)}&endTime=${encodeURIComponent(end)}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${RENDER_API_KEY}` },
      });
      if (mRes.ok) { const d = await mRes.json(); const pts = d.data || []; if (pts.length) cpu = pts[pts.length - 1].value; }
    } catch {}
    try {
      const mRes = await fetch(`https://api.render.com/v1/metrics/memory?resourceId=${encSvcId}&startTime=${encodeURIComponent(start)}&endTime=${encodeURIComponent(end)}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${RENDER_API_KEY}` },
      });
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

// ═══════════════════════════════════════════════════════════
// SUPABASE INFO
// ═══════════════════════════════════════════════════════════
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
      try {
        const { count } = await supabase.from(t).select('id', { count: 'exact', head: true });
        counts[t] = count || 0;
      } catch { counts[t] = -1; }
    }));

    return { ok: !error, ping, counts, error: error?.message };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ═══════════════════════════════════════════════════════════
// SYSTEM INFO
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// DASHBOARD STATS
// ═══════════════════════════════════════════════════════════
async function getDashboardStats() {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

  const [
    guildsTotal, usersTotal, ordersRes, ticketsRes, betsRes,
    errRes, novosRes, medsRes, anasRes, strsRes,
  ] = await Promise.allSettled([
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

// ═══════════════════════════════════════════════════════════
// STAFF GLOBAL (limit 500 pra evitar travar)
// ═══════════════════════════════════════════════════════════
async function getGlobalStaff() {
  const [medsRes, anasRes, strsRes] = await Promise.allSettled([
    supabase.from('ff_mediator_queue').select('user_id,earnings_total,matches_total,status,guild_id').limit(500),
    supabase.from('ff_analyst_queue').select('user_id,analyses_total,status,guild_id').limit(500),
    // ⚠️ NOTA: PARTE 4 usa `ff_streamer_queue`, PARTE 12 usa `streamer_queue`.
    // Mantido `ff_streamer_queue` aqui por retrocompatibilidade. Se migrar 100% pra
    // PARTE 12, troque por `.from('streamer_queue')`.
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

  for (const m of meds) {
    const x = ensure(m.user_id);
    x.meds++;
    x.medEarn += Number(m.earnings_total || 0);
    x.medMatches += Number(m.matches_total || 0);
    x.guilds.add(m.guild_id);
  }
  for (const a of anas) {
    const x = ensure(a.user_id);
    x.anas++;
    x.anaCount += Number(a.analyses_total || 0);
    x.guilds.add(a.guild_id);
  }
  for (const s of strs) {
    const x = ensure(s.user_id);
    x.strs++;
    x.guilds.add(s.guild_id);
  }

  const arr = Object.values(map).map(x => ({ ...x, guilds: x.guilds.size }));
  arr.sort((a, b) => (b.medEarn + b.anaCount * 10 + b.strs * 5) - (a.medEarn + a.anaCount * 10 + a.strs * 5));
  return arr;
}

// ═══════════════════════════════════════════════════════════
// NOTES
// ═══════════════════════════════════════════════════════════
async function getGuildNotes(guildId) {
  const { data } = await supabase.from('guild_notes')
    .select('*').eq('guild_id', guildId)
    .order('created_at', { ascending: false }).limit(20);
  return data || [];
}

async function addGuildNote(guildId, note, authorId) {
  try {
    await supabase.from('guild_notes').insert({ guild_id: guildId, note, author_id: authorId });
  } catch {}
  await logDevAction(authorId, 'add_note', guildId, { note });
}

// ═══════════════════════════════════════════════════════════
// INSPECTOR
// ═══════════════════════════════════════════════════════════
async function inspectGuild(guildId) {
  const g = client.guilds.cache.get(guildId);
  if (!g) return { ok: false, error: 'Bot não está nesse servidor' };

  const [cfg, ff, threadsRes, ticketsRes, orders7dRes, coinLogsRes, medsRes, anasRes, backupsRes] = await Promise.all([
    getConfig(guildId),
    ffGetConfig(guildId),
    supabase.from('ff_matches').select('id', { count: 'exact', head: true }).eq('guild_id', guildId).in('status', ['waiting','confirmed','pix_released','playing']),
    supabase.from('ticket_data').select('id', { count: 'exact', head: true }).eq('guild_id', guildId).is('closed_at', null),
    (() => {
      const s = new Date(Date.now() - 7 * 86400000).toISOString();
      return supabase.from('orders').select('total').eq('guild_id', guildId).eq('status', 'delivered').gte('created_at', s);
    })(),
    (() => {
      const s = new Date(Date.now() - 7 * 86400000).toISOString();
      return supabase.from('ff_logs').select('details').eq('guild_id', guildId).eq('category', 'coins').gte('created_at', s);
    })(),
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
      id: g.id, name: g.name, icon: g.iconURL({ size: 256 }),
      ownerId: g.ownerId, memberCount: g.memberCount,
      channels: g.channels.cache.size,
      categories: g.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size,
      textChannels: g.channels.cache.filter(c => c.type === ChannelType.GuildText).size,
      voiceChannels: g.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size,
      roles: g.roles.cache.size,
      emojis: g.emojis.cache.size,
      stickers: g.stickers.cache.size,
      boosts: g.premiumSubscriptionCount || 0,
      boostTier: g.premiumTier,
      createdAt: g.createdAt,
      region: g.preferredLocale,
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

// ═══════════════════════════════════════════════════════════
// RANKING
// ═══════════════════════════════════════════════════════════
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
    if (o.status === 'delivered') {
      stats[o.guild_id].fat += Number(o.total || 0);
      stats[o.guild_id].orders++;
    }
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

// ═══════════════════════════════════════════════════════════
// DEAD SERVERS (pré-filtro + 2 queries)
// ═══════════════════════════════════════════════════════════
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
    }).map(g => ({
      guild_id: g.guild_id,
      name: g.name,
      members: g.member_count,
      member_count: g.member_count,
      icon: g.icon,
      created_at: g.created_at,
      reason: g.member_count < 5 ? 'poucos membros (<5)' : 'inativo 30d',
    })).sort((a, b) => a.members - b.members);
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════
// EVENTOS GLOBAIS
// ═══════════════════════════════════════════════════════════
async function getActiveGlobalEvents() {
  const { data } = await supabase.from('dev_global_events')
    .select('*').eq('active', true)
    .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`);
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
  const { data } = await supabase.from('dev_global_events').insert({
    type, title, multiplier, ends_at: endsAt, active: true, created_by: userId,
  }).select().single();
  await logDevAction(userId, 'create_global_event', null, { type, title, multiplier, hours });
  return data;
}

// GLOBAL EVENTS CACHE
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

// ═══════════════════════════════════════════════════════════
// ABUSE TRACKER
// ═══════════════════════════════════════════════════════════
function trackAbuse(userId, action, guildId = null, limit = 200, windowMs = 10000) {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const arr = (abuseCache.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now);
  abuseCache.set(key, arr);

  if (arr.length >= limit) {
    setImmediate(() => sendDevAlert(
      'suspicious', 'Abuso detectado',
      `<@${userId}> \`${action}\` **${arr.length}×** em ${windowMs / 1000}s.`,
      'warning', { userId, action, guildId }
    ).catch(() => {}));
    abuseCache.delete(key);
    return true;
  }
  if (abuseCache.size > 2000) abuseCache.clear();
  return false;
}

// ═══════════════════════════════════════════════════════════
// SIMULADOR
// ═══════════════════════════════════════════════════════════
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
        const r = await fetch('https://api.mercadopago.com/v1/payment_methods', {
          headers: { 'Authorization': `Bearer ${tokenFinal}` },
        });
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
    if (ch && !ch.permissionsFor(g.members.me).has(PermissionFlagsBits.CreatePrivateThreads)) {
      throw new Error('Sem permissão');
    }
  });

  await runStep('🔎 Fila analista', async () => {
    await supabase.from('ff_analyst_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guildId);
  });
  await runStep('🛡️ Fila mediador', async () => {
    await supabase.from('ff_mediator_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guildId);
  });
  await runStep('🎥 Fila streamer', async () => {
    await supabase.from('ff_streamer_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guildId);
  });
  await runStep('💳 PIX mediadores', async () => {
    await supabase.from('ff_mediator_pix').select('id', { count: 'exact', head: true }).eq('guild_id', guildId);
  });

  const totalMs = Date.now() - start;
  return { etapas, totalMs, okCount: etapas.filter(e => e.ok).length, errCount: etapas.filter(e => !e.ok).length };
}

// ═══════════════════════════════════════════════════════════
// BROADCAST
// ═══════════════════════════════════════════════════════════
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
  const byName = guild.channels.cache.find(c =>
    c.isTextBased?.() && /atualiza|update|aviso|anuncio|anúncio|novidade/i.test(c.name) &&
    c.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages)
  );
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
    const ch = await guild.channels.create({
      name: '📢・atualizações',
      type: ChannelType.GuildText,
      topic: 'Avisos de atualização do Frio Bot',
      reason: 'Canal de updates',
    });
    try {
      await ch.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
      const topRole = getTopRole(guild);
      if (topRole) await ch.permissionOverwrites.edit(topRole, { ViewChannel: true, SendMessages: false });
      await ch.permissionOverwrites.edit(guild.members.me, { ViewChannel: true, SendMessages: true });
    } catch {}
    try {
      await supabase.from('settings').upsert({
        guild_id: guild.id, update_channel_id: ch.id, updated_at: new Date().toISOString(),
      }, { onConflict: 'guild_id' });
    } catch {}
    _settingsCache.delete(guild.id);
    return ch;
  } catch (e) { console.error('[UPDATE]', e.message); return null; }
}

// ✅ FIX: lock em memória para evitar double-send em multi-instance
let _broadcastInFlight = false;

async function broadcastUpdate() {
  // ✅ FIX: se já tem um broadcast em execução nesta instância, aborta
  if (_broadcastInFlight) {
    console.log('[UPDATE] ⏳ Broadcast já em execução nesta instância, ignorando.');
    return;
  }
  try {
    const { data: meta } = await supabase.from('bot_meta')
      .select('*').eq('key', 'last_update_broadcast').maybeSingle();
    if (meta?.value === BOT_VERSION) return;

    const notes = UPDATE_NOTES.filter(n => n.tag !== 'dev');
    if (!notes.length) return;

    _broadcastInFlight = true;

    setImmediate(async () => {
      try {
        // ✅ FIX: re-checa o meta dentro do setImmediate (2 boots simultâneos)
        const { data: recheck } = await supabase.from('bot_meta')
          .select('value').eq('key', 'last_update_broadcast').maybeSingle();
        if (recheck?.value === BOT_VERSION) {
          console.log('[UPDATE] Outro nó já enviou. Abortando.');
          return;
        }

        let ok = 0, err = 0;
        const guilds = [...client.guilds.cache.values()];
        for (let i = 0; i < guilds.length; i += 5) {
          await Promise.allSettled(guilds.slice(i, i + 5).map(async (g) => {
            try {
              const { data: glog } = await supabase.from('guild_update_log')
                .select('last_version').eq('guild_id', g.id).maybeSingle();
              if (glog?.last_version === BOT_VERSION) return;

              const settings = await getSettings(g.id);
              const canal = await findOrCreateUpdateChannel(g, settings);
              if (!canal) { err++; return; }

              const topRole = getTopRole(g);
              const pingRole = topRole ? `<@&${topRole.id}>` : `<@${g.ownerId}>`;
              const text = notes.map(n => {
                const m = UPDATE_TAG_LABELS[n.tag] || { emoji: '📌', label: n.tag };
                return `${m.emoji} **${m.label}**\n> ${n.text}`;
              }).join('\n\n');

              const embed = new EmbedBuilder()
                .setTitle(`🚀 Frio Bot atualizado — ${BOT_VERSION}`)
                .setColor('#5865F2')
                .setDescription(`${pingRole}, o bot foi **atualizado**!\n\n**O que mudou:**\n\n${text}`)
                .setFooter({ text: 'Frio Bot • Aviso' })
                .setTimestamp();

              if (g.bannerURL()) embed.setImage(g.bannerURL());

              await canal.send({
                content: pingRole,
                embeds: [embed],
                allowedMentions: { roles: topRole ? [topRole.id] : [], users: topRole ? [] : [g.ownerId] },
              }).catch(() => {});

              await supabase.from('guild_update_log').upsert({
                guild_id: g.id, last_version: BOT_VERSION, updated_at: new Date().toISOString(),
              }, { onConflict: 'guild_id' });
              ok++;
            } catch { err++; }
          }));
          await sleep(1500);
        }

        await supabase.from('bot_meta').upsert({
          key: 'last_update_broadcast', value: BOT_VERSION, updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });

        console.log(`[UPDATE] ✅ ${BOT_VERSION}: ${ok} enviados, ${err} erros`);
        await logImportant('UPDATE', `✅ Anúncio enviado`, {
          description: `**${BOT_VERSION}** em **${ok}** servidores.`,
          severity: 'success',
        });
      } catch (e) {
        console.error('[UPDATE-INNER]', e.message);
      } finally {
        _broadcastInFlight = false;
      }
    });
  } catch (e) {
    _broadcastInFlight = false;
    console.error('[UPDATE]', e.message);
  }
}

async function sendBroadcastNow(draft, target, autorId) {
  const { titulo, descricao, mudancas, imagemUrl, cor } = draft;
  const alvos = target === 'all'
    ? [...client.guilds.cache.values()]
    : [client.guilds.cache.get(target)].filter(Boolean);

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

        await canal.send({
          content: pingRole,
          embeds: [embed],
          allowedMentions: { roles: topRole ? [topRole.id] : [], users: topRole ? [] : [guild.ownerId] },
        }).catch(() => {});
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
    user: autorId,
    guild: target === 'all' ? null : target,
    severity: 'info',
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
// AUTO-HEAL v2 (throttle 2h + auto-cancel 12h)
// ═══════════════════════════════════════════════════════════
async function runAutoHeal() {
  const stats = { canceledThreads: 0, alertedMatches: 0, canceledPix: 0, autoCanceledPlaying: 0 };

  try {
    // 1. Threads "waiting" travadas > 30min → cancela
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

    // 2. Matches "playing" travados > 3h → alerta (throttle 2h)
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

    // 3. Matches "pix_released" travados > 2h → cancela
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
    .eq('guild_id', guildId).eq('active', true).not('message_id', 'is', null);

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

      const { data: items } = await supabase.from('ff_coin_shop')
        .select('*').eq('guild_id', guildId).eq('active', true).order('price');

      const e = new EmbedBuilder()
        .setTitle('🪙 Loja de Coins').setColor('#FFD700')
        .setDescription('Compre cargos com suas coins!').setTimestamp();

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
// FIM DA PARTE 2/12 — v6.8.0
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 3/12] VERSÍCULO · ANALYTICS · VOZ · MÚSICA · SORTEIOS
// SHOP PANELS · CATEGORIAS · STOCK · LOGS (CORRIGIDA)
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
      headers: { 'User-Agent': 'FrioBot/6.8.0' },
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
// ANALYTICS — trackFeatureUsage + relatórios avançados
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
  try {
    await supabase.from('bot_voice').upsert({ guild_id: g, channel_id: c, updated_at: new Date().toISOString() });
  } catch {}
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
// 🎵 MÚSICA — Sistema completo (play-dl + @discordjs/voice)
// ═══════════════════════════════════════════════════════════
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
  // ✅ FIX: NÃO limpar `_musicSearchCache` globalmente aqui.
  // O cache é por query (compartilhado entre guilds) e já tem TTL próprio (5min)
  // + cleanup em `buscarMusica`. Limpar aqui zerava cache de TODAS as outras guilds.

  const timer = _musicCleanupTimers.get(gid);
  if (timer) { clearTimeout(timer); _musicCleanupTimers.delete(gid); }

  if (q.textChannel) {
    q.textChannel.send({
      embeds: [new EmbedBuilder().setColor('#808080').setDescription(`⏹️ Player encerrado (${reason}).`)],
    }).catch(() => {});
  }
}

function scheduleQueueCleanup(gid) {
  const existing = _musicCleanupTimers.get(gid);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    _musicCleanupTimers.delete(gid);
    const q = musicQueues.get(gid);
    if (!q) return;
    if (!q.currentSong && !q.songs.length) {
      await destroyQueue(gid, 'idle');
    }
  }, MUSIC_CLEANUP_MS);

  _musicCleanupTimers.set(gid, timer);
}

async function tocarProxima(gid) {
  const q = getQueue(gid);
  if (!q.player) return;

  // ✅ FIX: se a queue foi destruída entre o player.play() e o Idle, aborta
  if (!musicQueues.has(gid)) return;

  if (q.failed >= 5) {
    if (q.textChannel) {
      q.textChannel.send({
        embeds: [new EmbedBuilder().setColor('#FF5555')
          .setDescription('⚠️ Muitas músicas falharam em sequência. Parando player.')],
      }).catch(() => {});
    }
    q.failed = 0;
    q.songs = [];
    await destroyQueue(gid, 'falhas');
    return;
  }

  if (q.loopMode === 'song' && q.currentSong) q.songs.unshift(q.currentSong);

  if (!q.songs.length) {
    q.currentSong = null;
    scheduleQueueCleanup(gid);
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
      q.textChannel.send({
        embeds: [new EmbedBuilder()
          .setColor('#1DB954')
          .setDescription(`🎵 Tocando: **${song.title}**\n> ⏱️ \`${song.duration || '?'}\` • 👤 ${song.author ? `<@${song.author}>` : '?'}`)],
      }).catch(() => {});
    }
  } catch (e) {
    console.error('[MUSIC]', e.message);
    q.failed++;
    await sleep(1000);
    // ✅ FIX: re-checa se a queue ainda existe antes de recursar
    if (musicQueues.has(gid)) tocarProxima(gid);
  }
}

async function buscarMusica(query, authorId) {
  if (!playdl) throw new Error('Sistema de música indisponível (play-dl não instalado).');

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

    // ✅ Limpa entradas expiradas quando o cache passar de 200 itens
    if (_musicSearchCache.size > 200) {
      const cutoff = Date.now() - 5 * 60 * 1000;
      for (const [k, v] of _musicSearchCache) {
        if (v.at < cutoff) _musicSearchCache.delete(k);
      }
    }

    return result;
  } catch (e) {
    throw new Error(`Busca falhou: ${e.message}`);
  }
}

function setupMusicPlayer(gid, vc, textCh) {
  const q = getQueue(gid);
  q.textChannel = textCh;

  // ✅ FIX: destruir conexão antiga antes de recriar (evita leak)
  if (q.connection && q.connection.state.status === VoiceConnectionStatus.Destroyed) {
    try { q.connection.destroy(); } catch {}
    q.connection = null;
  }

  if (!q.connection) {
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
      if (q.paused) return;
      if (!q.currentSong) return;
      // ✅ FIX: re-checa se a queue ainda existe antes de continuar
      if (!musicQueues.has(gid)) return;
      tocarProxima(gid).catch(e => console.error('[MUSIC-IDLE]', e.message));
    });

    q.player.on('error', (e) => {
      console.error('[MUSIC-PLAYER-ERR]', e.message);
      q.failed++;
      if (musicQueues.has(gid)) {
        tocarProxima(gid).catch(() => {});
      }
    });
  }

  return q;
}

function checkVoiceEmpty(guild, channelId) {
  // ✅ FIX: captura referência da queue atual; se alguém reconectar <30s,
  // a queue será DIFERENTE e o destroy será evitado.
  const currentQ = musicQueues.get(guild.id);

  setTimeout(() => {
    try {
      const nowQ = musicQueues.get(guild.id);
      if (!nowQ || nowQ !== currentQ) return; // queue trocou, não destrói

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
// SORTEIOS (giveaways)
// ═══════════════════════════════════════════════════════════

// ✅ FIX: Fisher-Yates real (o `.sort(() => Math.random() - 0.5)` é enviesado)
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function checkGiveaways() {
  try {
    const { data } = await supabase.from('giveaways').select('*').eq('ended', false);
    const now = Date.now();

    for (const g of data || []) {
      if (new Date(g.ends_at).getTime() > now) continue;

      let p = [];
      try { p = JSON.parse(g.participants || '[]'); } catch {}

      // ✅ FIX: dedupe + remove quem saiu do servidor
      const ch = client.channels.cache.get(g.channel_id);
      const guild = ch?.guild;
      const validParticipants = [];
      const seen = new Set();
      for (const uid of p) {
        if (seen.has(uid)) continue;
        seen.add(uid);
        if (guild) {
          const mem = await guild.members.fetch(uid).catch(() => null);
          if (!mem) continue;
        }
        validParticipants.push(uid);
      }

      const winnersCount = Math.max(1, Number(g.winners_count) || 1);

      if (!validParticipants.length) {
        if (ch) await ch.send('❌ Sem participantes válidos.').catch(() => {});
      } else {
        const shuffled = shuffleArray(validParticipants);
        const w = shuffled.slice(0, Math.min(winnersCount, shuffled.length));
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
// TEMPROLES (timeout cap 24 dias)
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
    // ✅ FIX: try/catch com await (antes era .catch(() => {}) sem await — podia não completar)
    try {
      await supabase.from('temproles').delete()
        .eq('guild_id', gid).eq('user_id', uid).eq('role_id', rid);
    } catch {}
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
// DB LOGS (tickets + moderação)
// ═══════════════════════════════════════════════════════════
async function logTicket(g, u, tn, tr, cb) {
  try {
    await supabase.from('ticket_logs').insert({
      guild_id: g, user_id: u, thread_name: tn, transcript: tr, closed_by: cb,
    });
  } catch {}
}

async function logModeration(g, m, t, a, r) {
  try {
    await supabase.from('moderation_logs').insert({
      guild_id: g, moderator_id: m, target_id: t, action: a, reason: r,
    });
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// CATEGORIAS / SHOP PANELS
// ═══════════════════════════════════════════════════════════
async function getCats(gid) {
  const { data } = await supabase.from('categories')
    .select('*').eq('guild_id', gid).order('position');
  return data || [];
}

async function countShopPanels(gid) {
  const { count } = await supabase.from('shop_panels')
    .select('id', { count: 'exact', head: true }).eq('guild_id', gid);
  return count || 0;
}

async function getShopPanels(gid) {
  const { data } = await supabase.from('shop_panels')
    .select('*').eq('guild_id', gid).order('id', { ascending: false });
  return data || [];
}

async function getShopPanel(id) {
  const { data } = await supabase.from('shop_panels')
    .select('*').eq('id', id).maybeSingle();
  return data;
}

async function createShopPanel(gid, d) {
  const total = await countShopPanels(gid);
  if (total >= MAX_SHOP_PANELS) throw new Error(`Limite ${MAX_SHOP_PANELS}.`);
  const { data } = await supabase.from('shop_panels')
    .insert({ guild_id: gid, ...d }).select().single();
  return data;
}

async function updateShopPanel(id, p) {
  try {
    await supabase.from('shop_panels').update(p).eq('id', id);
  } catch {}
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
// FIM DA PARTE 3/12 — v6.8.0
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 4/12] FREE FIRE — CONSTANTS · CONFIG · MULTI-PIX · LOGS
// FILAS · EMBEDS · PAINÉIS · THREAD · TRANSCRIPT (CORRIGIDA)
// ⚠️ Sistema de Streamer REMOVIDO daqui — migrado para PARTE 12
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// FF CONSTANTS
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

const FF_DEFAULT_VALUES = [
  '0.50', '0.70', '1.00', '2.00', '3.00', '5.00', '10.00',
  '20.00', '30.00', '40.00', '50.00', '100.00',
];

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
// FF CONFIG — cache LRU + auto-refresh ao editar
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
    await supabase.from('ff_config').upsert(
      { guild_id: gid, ...p, updated_at: new Date().toISOString() },
      { onConflict: 'guild_id' }
    );
    _ffConfigCache.delete(gid);

    // 🔥 AUTO-REFRESH: descobre o que mudou e atualiza o afetado
    const keys = Object.keys(p);
    const affects = (arr) => keys.some(k => arr.includes(k));

    if (affects(['custom_bet_embed'])) {
      scheduleRefresh(`bets:${gid}`, () => refreshBetEmbeds(gid));
    }
    // ⚠️ custom_streamer_embed / streamer_channel_id foram migrados pra tabela
    // `streamers` + `streamer_panel` (PARTE 12). Mantido aqui só por retrocompat
    // caso algum painel antigo ainda escreva nesses campos.
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
// MULTI-PIX POR MEDIADOR — 4 funções + painel + view
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

  // ✅ FIX: garante i.member populado (DMs/partials podem chegar sem member)
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
    const isAdminCmd = i.isChatInputCommand() && ['admin','painel','painel_loja','enviar_loja','sorteio'].includes(i.commandName);
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
    // ⚠️ `ffstr` removido: sistema de streamer migrou pra /config streamer (PARTE 12).
    const isFFButton = i.isButton() && /^(ffbet|ffm|ffcfg|ffmed|ffana|ffbl|coinshop|ffpix|ffpixmed)/.test(i.customId);
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

  if (await isMaintenanceMode()) {
    await i.reply({ content: '🔧 **Manutenção Global.**', flags: EPHEMERAL }).catch(() => {});
    return true;
  }

  const c = await ffGetConfig(i.guild.id);
  if ((c?.admin_maintenance || c?.maintenance) && !(await isAdmin(i.user, i.guild))) {
    await i.reply({ content: '🔧 **Manutenção em andamento.**', flags: EPHEMERAL }).catch(() => {});
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════
// FF LOGS
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
        { name: 'De', value: fromId ? `<@${fromId}>` : 'Sistema', inline: true },
      ).setTimestamp();

    await ch.send({ embeds: [e] }).catch(() => {});
  } catch {}
}

async function logMediador(g, uid, action, details = {}) {
  const e = new EmbedBuilder()
    .setTitle('🛡️ Log Mediadores')
    .setColor('#00AAFF')
    .addFields(
      { name: 'Mediador', value: `<@${uid}>`, inline: true },
      { name: 'Ação', value: `\`${action}\``, inline: true },
    );
  if (Object.keys(details).length) {
    e.addFields({ name: 'Detalhes', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 800)}\n\`\`\`` });
  }
  await ffLogCanal(g, '🛡️・log-mediadores', e);
}

async function logAnalista(g, uid, action, details = {}) {
  const e = new EmbedBuilder()
    .setTitle('🔎 Log Analistas')
    .setColor('#00AAFF')
    .addFields(
      { name: 'Analista', value: `<@${uid}>`, inline: true },
      { name: 'Ação', value: `\`${action}\``, inline: true },
    );
  if (Object.keys(details).length) {
    e.addFields({ name: 'Detalhes', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 800)}\n\`\`\`` });
  }
  await ffLogCanal(g, '🛡️・log-mediadores', e);
}

async function logConfig(g, uid, action, details = {}) {
  const e = new EmbedBuilder()
    .setTitle('⚙️ Log Config')
    .setColor('#5865F2')
    .addFields(
      { name: 'Por', value: `<@${uid}>`, inline: true },
      { name: 'Ação', value: `\`${action}\``, inline: true },
    );
  if (Object.keys(details).length) {
    e.addFields({ name: 'Detalhes', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 800)}\n\`\`\`` });
  }
  await ffLogCanal(g, '⚙️・log-config', e);
}

// ═══════════════════════════════════════════════════════════
// FILAS FF — MEDIADORES E ANALISTAS
// ⚠️ FILA DE STREAMERS MIGROU PARA PARTE 12 (tabela `streamer_queue`)
// ═══════════════════════════════════════════════════════════

// ─── MEDIADORES ───
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

// ─── ANALISTAS ───
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
// COMPAT — aponta pro SISTEMA NOVO de streamers (PARTE 12)
// Essas funções eram do sistema antigo (tabela `ff_streamer_queue`).
// Foram REESCRITAS como shims pra evitar ReferenceError em PARTES 2/6.
// ═══════════════════════════════════════════════════════════

// PARTE 2 chama `refreshFFStreamerPanel` dentro de `refreshAllFFPanels`.
// Esta declaração SOBRESCREVE a de PARTE 2 (function declarations: last wins).
async function refreshFFStreamerPanel(guildId) {
  try {
    // `refreshStreamerMainPanel` está definida em PARTE 12 (hoisted)
    return await refreshStreamerMainPanel(guildId);
  } catch { return false; }
}

// PARTE 6 (setups) chama `ffPostStreamerPanel(g, channelId)`.
// Redireciona pro painel principal da PARTE 12.
async function ffPostStreamerPanel(g, cid) {
  try {
    const ch = g.channels.cache.get(cid) || await g.channels.fetch(cid).catch(() => null);
    if (!ch || !ch.isTextBased?.()) return;

    // `buildStreamerMainEmbed` e `buildStreamerMainButtons` vêm da PARTE 12
    const embed = await buildStreamerMainEmbed(g.id);
    const msg = await ch.send({ embeds: [embed], components: buildStreamerMainButtons() }).catch(() => null);
    if (msg) await saveStreamerPanel(g.id, cid, msg.id);
  } catch (e) { console.error('[ffPostStreamerPanel]', e.message); }
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
    await msg.edit({
      embeds: [ffBuildBetEmbed(bet, cfg)],
      components: [ffBuildBetButtons(bet.id, cfg)],
    }).catch(() => {});
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// PIX FF (guild)
// ═══════════════════════════════════════════════════════════
async function ffGetPixEmbed(gid) {
  const { data } = await supabase.from('ff_pix_embed').select('*').eq('guild_id', gid).maybeSingle();
  return data;
}

async function ffPatchPixEmbed(gid, p) {
  try {
    await supabase.from('ff_pix_embed').upsert(
      { guild_id: gid, ...p, updated_at: new Date().toISOString() },
      { onConflict: 'guild_id' }
    );
  } catch {}
  return ffGetPixEmbed(gid);
}

function ffBuildPixButtons(hasPix) {
  const r = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ffpix:configurar').setLabel(hasPix ? 'Editar Pix' : 'Configurar Pix').setEmoji('✏️').setStyle(ButtonStyle.Primary),
  );
  if (hasPix) {
    r.addComponents(
      new ButtonBuilder().setCustomId('ffpix:ver').setLabel('Mostrar Pix').setEmoji('👁️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ffpix:remover').setLabel('Remover Pix').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    );
  }
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
    e.addFields({
      name: '🟢 Seu PIX (configurado)',
      value: `> 🔑 \`${myPix.pix_key}\`\n> 👤 ${myPix.pix_name}\n> 🏙️ ${myPix.pix_city || '—'}`,
      inline: false,
    });
  } else {
    e.addFields({
      name: '🔴 Seu PIX',
      value: '> *Não configurado ainda.*\n> Clique em **Configurar** abaixo.',
      inline: false,
    });
  }

  if (isAdmin && allPix.length) {
    const list = allPix.slice(0, 10).map(p => {
      const k = p.pix_key.length > 12
        ? `${p.pix_key.substring(0, 6)}...${p.pix_key.substring(p.pix_key.length - 4)}`
        : p.pix_key;
      return `• <@${p.user_id}> — \`${k}\``;
    }).join('\n');
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
// PAINÉIS FF (mediadores, analistas, blacklist)
// ═══════════════════════════════════════════════════════════
async function ffBuildMediatorPanel(gid) {
  const c = await ffGetConfig(gid);
  const meds = await ffGetMediatorQueue(gid);
  const wait = meds.filter(m => m.status === 'waiting');
  const busy = meds.filter(m => m.status === 'busy');

  const st = wait.length === 0
    ? '⚠️ **Nenhum mediador disponível.**'
    : wait.length === 1
      ? `🟢 **<@${wait[0].user_id}>** atende sozinho.`
      : `🟢 **${wait.length} mediadores disponíveis.**`;

  const lines = [];
  if (wait.length) {
    lines.push(`**Disponíveis:**\n${wait.map((m, i) => `\`${i + 1}.\` <@${m.user_id}> • 💰 R$ ${Number(m.earnings_total || 0).toFixed(2)}`).join('\n')}`);
  }
  if (busy.length) {
    lines.push(`**Em partida:**\n${busy.map(m => `• <@${m.user_id}>`).join('\n')}`);
  }

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

  const st = waiting.length === 0
    ? '🔴 **Não tem nenhum analista online.**'
    : waiting.length === 1
      ? `🟢 **<@${waiting[0].user_id}>** é o único disponível.`
      : `🟢 **${waiting.length} analistas disponíveis.**`;

  const lines = [];
  if (waiting.length) {
    lines.push(`**🔎 Disponíveis (${waiting.length}):**\n${waiting.map((a, i) => `\`${i + 1}.\` <@${a.user_id}> • 📊 ${a.analyses_total || 0}`).join('\n')}`);
  }
  if (busy.length) {
    lines.push(`**🟡 Em análise:**\n${busy.map(a => `• <@${a.user_id}>`).join('\n')}`);
  }

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

  const e = new EmbedBuilder()
    .setTitle('🚫 Blacklist de Jogadores')
    .setColor('#FF5555')
    .setDescription('**Jogadores banidos.**\n\n' + (data?.length
      ? data.map((b, i) => {
          const uid = b.discord_id || b.user_id;
          const ts = Math.floor(new Date(b.created_at).getTime() / 1000);
          const evidence = b.evidence ? ` • 🔗 [Provas](${b.evidence})` : '';
          return `**${i + 1}.** <@${uid}>\n> 🆔 \`${uid}\` • 🎮 \`${b.ff_id || '—'}\`\n> 📝 ${b.reason || '—'}\n> 🕐 <t:${ts}:R>${evidence}`;
        }).join('\n\n')
      : '*Ninguém na blacklist.*'))
    .setFooter({ text: `Total: ${total}` })
    .setTimestamp();

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

// ⚠️ REMOVIDO: `ffBuildStreamerEmbed`, `ffBuildStreamerPanel`,
// `ffUpdateStreamerMessage`, `ffPostStreamerPanel`, `ffGetStreamerQueue`,
// `ffStreamerJoin`, `ffStreamerLeave`, `ffStreamerSetLive`.
// O sistema completo de streamers vive agora na PARTE 12 (tabelas `streamers`,
// `streamer_queue`, `streamer_panel` + painéis com filtro de mediador).

// ═══════════════════════════════════════════════════════════
// THREAD DE APOSTA
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

async function ffCriarThreadAposta(g, ids, bet) {
  try {
    const c = await ffGetConfig(g.id);
    const med = await ffMediatorNext(g.id);
    const roleOlh = c?.olhinho_role_id ? g.roles.cache.get(c.olhinho_role_id) : null;

    // ✅ FIX: valida que o parent é um canal de TEXTO válido (não categoria/thread)
    const resolveParent = (id) => {
      if (!id) return null;
      const ch = g.channels.cache.get(id);
      if (!ch) return null;
      if (ch.type === ChannelType.GuildCategory) return null;
      if (!ch.isTextBased?.()) return null;
      if (ch.isThread?.()) return null;
      return ch;
    };
    const parent = resolveParent(c?.topic_channel_id) || resolveParent(bet?.channel_id);
    if (!parent) {
      console.error('[FF-THREAD] Nenhum canal de texto válido para criar thread');
      return;
    }

    const fmt = FF_FORMATS.find(f => f.label === bet?.format);
    const thread = await parent.threads.create({
      name: ffThreadName('waiting', bet?.value, ids, null),
      autoArchiveDuration: 1440,
      type: ChannelType.PrivateThread,
      reason: 'Aposta FF',
    });
    await sleep(300);

    for (const uid of ids) await thread.members.add(uid).catch(() => {});

    // Adiciona membros do cargo "olhinho" (max 50)
    if (roleOlh) {
      // ✅ FIX: garantir que a lista de membros esteja atualizada (fetch opcional)
      try { await g.members.fetch({ limit: 100 }); } catch {}
      const members = [...roleOlh.members.values()].slice(0, 50);
      for (const m of members) await thread.members.add(m.id).catch(() => {});
    }

    if (med) {
      await thread.members.add(med.user_id).catch(() => {});
      try {
        await supabase.from('ff_mediator_queue').update({ status: 'busy' }).eq('id', med.id);
      } catch {}
    }

    const { data: match } = await supabase.from('ff_matches').insert({
      guild_id: g.id, thread_id: thread.id, channel_id: parent.id,
      players: JSON.stringify(ids), status: 'waiting',
      format: bet?.format, value: bet?.value,
      mediator_id: med?.user_id || null,
    }).select().single();

    if (med) {
      try {
        await supabase.from('ff_mediator_queue').update({ current_match_id: match.id }).eq('id', med.id);
      } catch {}
    }

    const team = fmt ? `Times de **${fmt.teamSize}** • Total **${fmt.totalPlayers}**` : '';
    const e = new EmbedBuilder()
      .setTitle(`🎮 ${bet?.format || 'Aposta'}`)
      .setColor('#f1c40f')
      .setDescription(
        `<@${ids[0]}> 🆚 <@${ids[1]}>\n\n${team ? `${team}\n\n` : ''}💰 **R$ ${Number(bet?.value || 0).toFixed(2).replace('.', ',')}**\n\nCombinem as regras e cliquem em **Confirmar**.`
      )
      .setFooter({ text: `Match #${match.id}` })
      .setTimestamp();

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
      embeds: [e],
      components: [row1, row2],
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
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

    const { error: er } = await supabase.storage.from('ff-transcripts').upload(fn, buf, {
      contentType: 'text/html', upsert: false,
    });

    let url = null;
    if (!er) {
      const { data: pub } = supabase.storage.from('ff-transcripts').getPublicUrl(fn);
      url = pub?.publicUrl;
    }

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
  for (const i of items) {
    menu.addOptions({
      label: `${i.emoji || '🎁'} ${i.name} — ${i.price}`.slice(0, 90),
      value: String(i.id),
      description: (i.description || 'Comprar com coins').slice(0, 90),
    });
  }

  return [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('coinshop:saldo').setLabel('Meu saldo').setEmoji('💰').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('coinshop:top').setLabel('Mais ricos').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// ═══════════════════════════════════════════════════════════
// COIN LOCK — helper
// ═══════════════════════════════════════════════════════════
async function withCoinLock(k, fn) {
  if (coinLocks.has(k)) throw new Error('Aguarde...');
  coinLocks.add(k);
  try { return await fn(); }
  finally { setTimeout(() => coinLocks.delete(k), 3000); }
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 4/12 — v6.8.0
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 4.5/12] PAINÉIS FF — HUB + SUBPAINÉIS + CUSTOM EMBED
// v6.8.0 — ffPanelStreamer REMOVIDO (migrado para PARTE 12)
// ═══════════════════════════════════════════════════════════

// ───── HUB PRINCIPAL ─────
async function ffConfigPanel(gid) {
  const [c, isPrem, tier] = await Promise.all([
    ffGetConfig(gid),
    isPremium(gid),
    getPremiumTier(gid),
  ]);

  // ✅ FIX: mostra stats de streamers (sistema novo — PARTE 12)
  let streamerStats = { total: 0, online: 0 };
  try {
    const streamers = await getStreamers(gid);
    streamerStats.total = streamers.length;
    streamerStats.online = streamers.filter(s => s.status === 'online').length;
  } catch {}

  const tierMeta = tier ? PREMIUM_TIERS[tier] : null;
  const maint = !!c?.maintenance;
  const valuesLen = Array.isArray(c?.value_options) ? c.value_options.length : 0;

  const e = new EmbedBuilder()
    .setTitle('🎮 Painel Free Fire')
    .setColor(maint ? '#ff5555' : '#f1c40f')
    .setDescription(
      `${maint ? '🔴 **MANUTENÇÃO ATIVA**' : '🟢 **Operacional**'}\n\n` +
      `**Premium:** ${isPrem && tierMeta ? `${tierMeta.emoji} ${tierMeta.label}` : '⚪ Sem premium'}`
    )
    .addFields(
      { name: '📢 Canais', value: c?.topic_channel_id ? '✅' : '❌', inline: true },
      { name: '🎭 Cargos', value: c?.mediator_role_id ? '✅' : '❌', inline: true },
      { name: '💳 PIX', value: (c?.pix_key || c?.mp_access_token) ? '✅' : '❌', inline: true },
      { name: '💰 Valores', value: `${valuesLen}`, inline: true },
      { name: '🛡️ Taxa', value: `R$ ${Number(c?.mediator_fee || 0).toFixed(2)}`, inline: true },
      { name: '💎 Coins', value: `${c?.coin_prize || 1}`, inline: true },
      { name: '🎥 Streamers', value: `${streamerStats.online}🟢 / ${streamerStats.total}`, inline: true },
      { name: '📺 Painel Str.', value: c?.streamer_channel_id ? '✅' : '❌', inline: true },
      { name: '⚙️ Modo', value: maint ? '🔧 Manutenção' : '🟢 Ativo', inline: true },
    )
    .setFooter({ text: `Frio Bot ${BOT_VERSION} • Free Fire` })
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:panel:canais').setLabel('Canais').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:panel:cargos').setLabel('Cargos').setEmoji('🎭').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:panel:pix').setLabel('PIX').setEmoji('💳').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffcfg:panel:apostas').setLabel('Apostas').setEmoji('🎯').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:panel:valores').setLabel('Valores').setEmoji('💰').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:panel:mediadores').setLabel('Mediadores').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:panel:automacoes').setLabel('Automações').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:panel:loja_coins').setLabel('Loja Coins').setEmoji('🪙').setStyle(ButtonStyle.Success),
      ),
      new ActionRowBuilder().addComponents(
        // ✅ FIX: botão direto pro sistema NOVO de streamers (PARTE 12)
        new ButtonBuilder().setCustomId('ffcfg:streamers').setLabel('Streamers').setEmoji('🎥').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:custom_embed').setLabel('Custom Embed').setEmoji('🎨').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:manutencao').setLabel('Manutenção').setEmoji('🔧').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:postar').setLabel('Postar').setEmoji('📢').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffcfg:postar_auto').setLabel('Postar em massa').setEmoji('⚡').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:postar_por_canal').setLabel('Por canal').setEmoji('📁').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ───── CANAIS ─────
async function ffPanelCanais(gid) {
  const c = await ffGetConfig(gid) || {};
  const field = (label, value) => ({ name: label, value: value ? `<#${value}>` : '*não configurado*', inline: true });

  const e = new EmbedBuilder()
    .setTitle('📢 Canais do Sistema FF')
    .setColor('#5865F2')
    .setDescription('Configure os canais onde cada parte do sistema funciona.')
    .addFields(
      field('🎯 Apostas (principal)', c.topic_channel_id),
      field('📋 Logs', c.log_channel_id),
      field('📜 Transcripts', c.transcript_channel_id),
      field('🏆 Resultados', c.resultados_channel_id),
      field('📊 Ranking', c.ranking_channel_id),
      field('📢 Anúncios', c.anuncios_channel_id),
      field('💳 PIX', c.pix_channel_id),
      field('💳 PIX Meds', c.pix_mediator_channel_id),
      field('🎥 Streamer', c.streamer_channel_id),
      field('🔎 Analistas', c.analyst_panel_channel_id),
      field('🚫 Blacklist', c.blacklist_channel_id),
    )
    .setFooter({ text: 'Clique em um botão pra configurar' })
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:set:topic_channel_id').setLabel('Apostas').setEmoji('🎯').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:set:log_channel_id').setLabel('Logs').setEmoji('📋').setStyle(ButtonStyle.Primary),
        // ✅ FIX: botões que estavam faltando
        new ButtonBuilder().setCustomId('ffcfg:set:transcript_channel_id').setLabel('Transcript').setEmoji('📜').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:set:resultados_channel_id').setLabel('Resultados').setEmoji('🏆').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:set:ranking_channel_id').setLabel('Ranking').setEmoji('📊').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:set:anuncios_channel_id').setLabel('Anúncios').setEmoji('📢').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:set:pix_channel_id').setLabel('PIX').setEmoji('💳').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffcfg:set:pix_mediator_channel_id').setLabel('PIX Meds').setEmoji('💳').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffcfg:set:streamer_channel_id').setLabel('Streamer').setEmoji('🎥').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:set:analyst_panel_channel_id').setLabel('Analistas').setEmoji('🔎').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:set:blacklist_channel_id').setLabel('Blacklist').setEmoji('🚫').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ───── CARGOS ─────
async function ffPanelCargos(gid) {
  const c = await ffGetConfig(gid) || {};
  const field = (label, value) => ({ name: label, value: value ? `<@&${value}>` : '*não configurado*', inline: true });

  const e = new EmbedBuilder()
    .setTitle('🎭 Cargos do Sistema FF')
    .setColor('#9B59B6')
    .setDescription('Configure os cargos usados pelo sistema de apostas.')
    .addFields(
      field('🛡️ Mediador', c.mediator_role_id),
      field('👁️ Olhinho', c.olhinho_role_id),
      field('🔎 Analista', c.analyst_role_id),
      field('👑 Admin FF', c.admin_role_id),
      field('🎥 Streamer', c.streamer_role_id),
      field('🚫 Banido', c.banned_role_id),
    )
    .setFooter({ text: 'Clique em um botão pra configurar' })
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:set:mediator_role_id').setLabel('Mediador').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:set:olhinho_role_id').setLabel('Olhinho').setEmoji('👁️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:set:analyst_role_id').setLabel('Analista').setEmoji('🔎').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:set:admin_role_id').setLabel('Admin').setEmoji('👑').setStyle(ButtonStyle.Success),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:set:streamer_role_id').setLabel('Streamer').setEmoji('🎥').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:set:banned_role_id').setLabel('Banido').setEmoji('🚫').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ───── PIX ─────
async function ffPanelPix(gid) {
  const c = await ffGetConfig(gid) || {};
  const usandoMP = !!c.mp_access_token;
  const usandoPix = !!c.pix_key;

  const e = new EmbedBuilder()
    .setTitle('💳 Pagamento PIX')
    .setColor(usandoMP ? '#22c55e' : (usandoPix ? '#FFA500' : '#ff5555'))
    .setDescription(
      `**Gateway atual:** ${usandoMP ? '🟢 Mercado Pago' : (usandoPix ? '🟡 PIX estático' : '🔴 Nenhum')}\n\n` +
      `> Cada mediador pode configurar o **próprio PIX** via painel multi-PIX.\n` +
      `> O PIX abaixo é o **padrão da guild** (fallback).`
    )
    .addFields(
      { name: '🔑 Chave PIX', value: c.pix_key ? `\`${c.pix_key}\`` : '*—*', inline: false },
      { name: '👤 Nome', value: c.pix_name || '—', inline: true },
      { name: '🏙️ Cidade', value: c.pix_city || '—', inline: true },
      { name: '💳 MP Token', value: usandoMP ? `🟢 \`${maskToken(c.mp_access_token)}\`` : '🔴', inline: false },
    )
    .setFooter({ text: 'Mediadores têm PIX próprio via /hub apostas' })
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffcfg:set:pix').setLabel(usandoPix ? 'Editar PIX' : 'Configurar PIX').setEmoji('✏️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ffcfg:mp_config').setLabel(usandoMP ? 'Editar MP' : 'Configurar MP').setEmoji('💳').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ffcfg:mp_test').setLabel('Testar MP').setEmoji('🧪').setStyle(ButtonStyle.Secondary).setDisabled(!usandoMP),
    ),
  ];

  if (usandoMP) {
    rows[0].addComponents(
      new ButtonBuilder().setCustomId('ffcfg:mp_remove').setLabel('Remover MP').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    );
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ffcfg:postar_pix').setLabel('Postar painel PIX').setEmoji('📢').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  ));

  return { embeds: [e], components: rows };
}

// ───── APOSTAS ─────
async function ffPanelApostas(gid) {
  const c = await ffGetConfig(gid) || {};

  const e = new EmbedBuilder()
    .setTitle('🎯 Configuração de Apostas')
    .setColor('#f1c40f')
    .setDescription('Ajustes gerais do fluxo de apostas.')
    .addFields(
      { name: '💰 Valor mín.', value: `R$ ${Number(c.valor_minimo || 0.50).toFixed(2)}`, inline: true },
      { name: '💰 Valor máx.', value: `R$ ${Number(c.valor_maximo || 1000).toFixed(2)}`, inline: true },
      { name: '🛡️ Taxa mediador', value: `R$ ${Number(c.mediator_fee || 0).toFixed(2)}`, inline: true },
      { name: '💎 Coin prêmio', value: `${c.coin_prize || 1}`, inline: true },
      { name: '🧵 Auto-thread', value: c.auto_thread ? '🟢' : '🔴', inline: true },
      { name: '✅ Requer med-confirm', value: c.require_mediator_confirm ? '🟢' : '🔴', inline: true },
      { name: '🚫 Bloquear BL', value: c.block_blacklist ? '🟢' : '🔴', inline: true },
      { name: '💵 Taxa extra', value: c.taxa_extra_ativo ? `R$ ${Number(c.taxa_extra || 0).toFixed(2)}` : '🔴 Desativada', inline: true },
    )
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:set:valor_minimo').setLabel('Mín.').setEmoji('💰').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:set:valor_maximo').setLabel('Máx.').setEmoji('💰').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:set:mediator_fee').setLabel('Taxa Med').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:set:coin_prize').setLabel('Coin prêmio').setEmoji('💎').setStyle(ButtonStyle.Success),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:set:taxa_extra').setLabel('Taxa extra').setEmoji('💵').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:toggle:taxa_extra_ativo').setLabel('Ativar extra').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:toggle:auto_thread').setLabel('Auto-thread').setEmoji('🧵').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:toggle:require_mediator_confirm').setLabel('Med confirm').setEmoji('✅').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:toggle:block_blacklist').setLabel('Bloquear BL').setEmoji('🚫').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ───── VALORES ─────
async function ffPanelValores(gid) {
  const c = await ffGetConfig(gid) || {};
  const vals = Array.isArray(c.value_options) ? c.value_options : [];
  const sorted = [...vals].map(v => parseFloat(v)).filter(v => !isNaN(v)).sort((a, b) => b - a);

  const lines = sorted.length
    ? sorted.map(v => `💵 **R$ ${v.toFixed(2)}**`).join(' • ')
    : '*Nenhum valor configurado.*';

  const e = new EmbedBuilder()
    .setTitle('💰 Valores de Aposta')
    .setColor('#FFD700')
    .setDescription(`**${sorted.length}** valores cadastrados.\n\n${lines.substring(0, 3500)}`)
    .setFooter({ text: 'Cada valor vira um embed de aposta' })
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:add_valor').setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffcfg:del_valor').setLabel('Remover').setEmoji('➖').setStyle(ButtonStyle.Danger).setDisabled(!vals.length),
        new ButtonBuilder().setCustomId('ffcfg:reset_valores').setLabel('Resetar').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:postar').setLabel('Postar').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:postar_auto').setLabel('Postar em massa').setEmoji('⚡').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ───── MEDIADORES ─────
async function ffPanelMediadores(gid) {
  const list = await ffGetMediatorQueue(gid);
  const wait = list.filter(m => m.status === 'waiting').length;
  const busy = list.filter(m => m.status === 'busy').length;
  const totalEarn = list.reduce((a, m) => a + Number(m.earnings_total || 0), 0);
  const totalMatches = list.reduce((a, m) => a + Number(m.matches_total || 0), 0);

  const e = new EmbedBuilder()
    .setTitle('🛡️ Mediadores')
    .setColor('#00AAFF')
    .setDescription(`**Fila atual:** ${list.length} mediadores`)
    .addFields(
      { name: '🟢 Disponíveis', value: `${wait}`, inline: true },
      { name: '🔴 Em partida', value: `${busy}`, inline: true },
      { name: '💰 Receita total', value: `R$ ${totalEarn.toFixed(2)}`, inline: true },
      { name: '🎮 Partidas', value: `${totalMatches}`, inline: true },
    )
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:med_receitas').setLabel('Receitas').setEmoji('💰').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffcfg:postar_mediadores').setLabel('Postar painel').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:remove_all_meds').setLabel('Limpar fila').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        // ✅ FIX: botão destrutivo agora pede confirmação (handler na PARTE 9)
        new ButtonBuilder().setCustomId('ffcfg:remove_all_admins').setLabel('Remover admins').setEmoji('🚫').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ───── AUTOMAÇÕES ─────
async function ffPanelAutomacoes(gid) {
  const c = await ffGetConfig(gid) || {};

  const e = new EmbedBuilder()
    .setTitle('⚙️ Automações')
    .setColor('#9B59B6')
    .setDescription('Configure posts automáticos e frequência.')
    .addFields(
      { name: '📊 Auto-post ranking', value: c.auto_post_ranking ? '🟢' : '🔴', inline: true },
      { name: '🚫 Auto-post blacklist', value: c.auto_post_blacklist ? '🟢' : '🔴', inline: true },
      { name: '📜 Auto-post regras', value: c.auto_post_regras ? '🟢' : '🔴', inline: true },
      { name: '🕐 Frequência', value: c.auto_post_frequencia || 'weekly', inline: true },
    )
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:toggle:auto_post_ranking').setLabel('Ranking').setEmoji('📊').setStyle(c.auto_post_ranking ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:toggle:auto_post_blacklist').setLabel('Blacklist').setEmoji('🚫').setStyle(c.auto_post_blacklist ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:toggle:auto_post_regras').setLabel('Regras').setEmoji('📜').setStyle(c.auto_post_regras ? ButtonStyle.Success : ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        // ✅ FIX: id mais claro (antes: freq_ranking)
        new ButtonBuilder().setCustomId('ffcfg:set:auto_post_frequencia').setLabel('Frequência').setEmoji('🕐').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ───── LOJA COINS ─────
async function ffPanelLojaCoins(gid) {
  const { data: items } = await supabase.from('ff_coin_shop')
    .select('*').eq('guild_id', gid).order('price').limit(25);

  const total = items?.length || 0;
  const ativos = items?.filter(i => i.active).length || 0;

  const e = new EmbedBuilder()
    .setTitle('🪙 Loja de Coins')
    .setColor('#FFD700')
    .setDescription(`**${ativos}/${total}** itens ativos.`)
    .setTimestamp();

  if (items?.length) {
    const lines = items.slice(0, 15).map(x =>
      `${x.active ? '🟢' : '🔴'} ${x.emoji || '🎁'} **${x.name}** — 💰 ${x.price}`
    ).join('\n');
    e.addFields({ name: '📋 Itens', value: lines.substring(0, 1024) });
  } else {
    e.addFields({ name: '📋', value: '*Nenhum item cadastrado.*' });
  }

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:coin_add').setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ffcfg:coin_edit').setLabel('Editar').setEmoji('✏️').setStyle(ButtonStyle.Primary).setDisabled(!total),
        new ButtonBuilder().setCustomId('ffcfg:coin_toggle').setLabel('Toggle').setEmoji('🔁').setStyle(ButtonStyle.Secondary).setDisabled(!total),
        new ButtonBuilder().setCustomId('ffcfg:coin_del').setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(!total),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:coin_defaults').setLabel('Itens padrão').setEmoji('📦').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:coin_manage_users').setLabel('Gerenciar users').setEmoji('👥').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ffcfg:coin_hist').setLabel('Histórico').setEmoji('📋').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ffcfg:coin_post').setLabel('Postar').setEmoji('📢').setStyle(ButtonStyle.Success),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ───── CUSTOM EMBED (apostas) ─────
async function ffPanelCustomEmbed(gid) {
  const cfg = await ffGetConfig(gid) || {};
  const c = cfg.custom_bet_embed || {};
  const b = c.buttons || {};
  const isPrem = await isPremium(gid);

  // ✅ FIX: título/descrição deixando claro que é SÓ de embeds de aposta
  const e = new EmbedBuilder()
    .setTitle('🎨 Custom Embed — Apostas')
    .setColor(safeColor(c.color, '#f1c40f'))
    .setDescription(
      isPrem
        ? 'Personalize como os **embeds de aposta** aparecem nos canais.\n> *(Aplicado apenas ao card de aposta — não afeta outros painéis.)*'
        : '💎 **Recurso Premium.** Ative em `/dev → Gerenciamento → Premium`.'
    )
    .addFields(
      { name: '📝 Título extra', value: c.title || '*padrão*', inline: true },
      { name: '🎨 Cor', value: `\`${c.color || '#f1c40f'}\``, inline: true },
      { name: '🖼️ Banner', value: c.banner ? '✅' : '❌', inline: true },
      { name: '📌 Thumb', value: c.thumbnail ? '✅' : '❌', inline: true },
      { name: '🔘 GI', value: `${b.gi_emoji || '🧊'} ${b.gi_label || 'Gelo Infinito'}`, inline: true },
      { name: '🔘 GN', value: `${b.gn_emoji || '🧊'} ${b.gn_label || 'Gelo Normal'}`, inline: true },
    )
    .setFooter({ text: isPrem ? 'Clique em editar' : 'Recurso premium' })
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ffcfg:custom_embed_edit').setLabel('Editar').setEmoji('✏️').setStyle(ButtonStyle.Primary).setDisabled(!isPrem),
        new ButtonBuilder().setCustomId('ffcfg:custom_embed_buttons').setLabel('Botões').setEmoji('🔘').setStyle(ButtonStyle.Primary).setDisabled(!isPrem),
        new ButtonBuilder().setCustomId('custom_bet_preview').setLabel('Preview').setEmoji('👁️').setStyle(ButtonStyle.Secondary).setDisabled(!isPrem),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('custom_bet_reset').setLabel('Resetar').setEmoji('🔄').setStyle(ButtonStyle.Danger).setDisabled(!isPrem),
        new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 4.5/12 — v6.8.0
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 5/12] SISTEMA DE TICKETS — REESCRITO (CORRIGIDO)
// Estrutura + Editor 6 abas + Ações + Automações + Transcripts
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// TICKETS — STATUS
// ═══════════════════════════════════════════════════════════
const TICKET_STATUS = {
  aberto:      { emoji: '🟢', label: 'Aberto',             color: '#22c55e' },
  atendimento: { emoji: '🟡', label: 'Em atendimento',     color: '#f1c40f' },
  aguardando:  { emoji: '🟠', label: 'Aguardando cliente', color: '#FFA500' },
  resolvido:   { emoji: '🔵', label: 'Resolvido',          color: '#00AAFF' },
  fechado:     { emoji: '🔴', label: 'Fechado',            color: '#ff5555' },
  excluido:    { emoji: '⚫', label: 'Excluído',           color: '#808080' },
};

// ═══════════════════════════════════════════════════════════
// HELPERS DE SEGURANÇA
// ═══════════════════════════════════════════════════════════
// ✅ FIX: helper pra garantir `i.member` populado sem crashar
async function ensureMember(i) {
  if (i.member) return i.member;
  if (!i.guild) return null;
  try { i.member = await i.guild.members.fetch(i.user.id); } catch {}
  return i.member;
}

// ✅ FIX: helper pra checar permissões com segurança
function memberHasPerm(member, perm) {
  try { return !!member?.permissions?.has?.(perm); } catch { return false; }
}

// ═══════════════════════════════════════════════════════════
// STORAGE — BLINDADO (save/load com mutex + verificação)
// ═══════════════════════════════════════════════════════════

async function ensureConfigsRow(gid) {
  try {
    const { data } = await supabase.from('configs').select('guild_id').eq('guild_id', gid).maybeSingle();
    if (data) return true;

    const { error } = await supabase.from('configs').insert({ guild_id: gid });
    if (error && error.code !== '23505') {
      console.error('[ensureConfigsRow]', error.message);
      return false;
    }
    return true;
  } catch (e) { console.error('[ensureConfigsRow]', e.message); return false; }
}

async function getTicketPanels(gid) {
  const cached = _ticketPanelsCache.get(gid);
  if (cached) return cached;

  try {
    const { data, error } = await supabase
      .from('configs')
      .select('ticket_panels')
      .eq('guild_id', gid)
      .maybeSingle();

    if (error) {
      console.error('[getTicketPanels]', error.message);
      return [];
    }

    let raw = data?.ticket_panels;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { raw = []; }
    }
    const arr = Array.isArray(raw) ? raw : [];
    return _ticketPanelsCache.set(gid, arr);
  } catch (e) {
    console.error('[getTicketPanels]', e.message);
    return [];
  }
}

async function saveTicketPanels(gid, panels) {
  let waited = 0;
  while (_ticketSaveLocks.get(gid)) {
    await sleep(50);
    waited += 50;
    if (waited > 5000) {
      console.error('[saveTicketPanels] timeout no mutex');
      break;
    }
  }
  _ticketSaveLocks.set(gid, true);

  try {
    await ensureConfigsRow(gid);
    _ticketPanelsCache.delete(gid);
    _configCache.delete(gid);

    const payload = {
      ticket_panels: panels,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error: updErr } = await supabase
      .from('configs')
      .update(payload)
      .eq('guild_id', gid)
      .select('guild_id');

    if (updErr) {
      console.error('[saveTicketPanels/update]', updErr.message);
      const { error: upsErr } = await supabase
        .from('configs')
        .upsert({ guild_id: gid, ...payload }, { onConflict: 'guild_id' });

      if (upsErr) {
        console.error('[saveTicketPanels/upsert]', upsErr.message);
        return { ok: false, error: upsErr.message };
      }
    } else if (!updated || updated.length === 0) {
      const { error: insErr } = await supabase
        .from('configs')
        .insert({ guild_id: gid, ...payload });

      if (insErr) {
        console.error('[saveTicketPanels/insert]', insErr.message);
        return { ok: false, error: insErr.message };
      }
    }

    _ticketPanelsCache.set(gid, panels);

    for (const p of panels) {
      if (p?.canal_id && p?.mensagem_id) {
        scheduleRefresh(`ticket:${gid}:${p.id}`, () => refreshTicketPanelMessage(gid, p.id), 1500);
      }
    }

    return { ok: true };
  } catch (e) {
    console.error('[saveTicketPanels]', e.message);
    return { ok: false, error: e.message };
  } finally {
    _ticketSaveLocks.delete(gid);
  }
}

async function createTicketPanel(gid, data) {
  _ticketPanelsCache.delete(gid);
  const panels = await getTicketPanels(gid);

  if (panels.length >= MAX_TICKET_PANELS) {
    throw new Error(`Limite de ${MAX_TICKET_PANELS} painéis atingido.`);
  }

  const ids = panels.map(p => Number(p.id)).filter(n => Number.isFinite(n));
  const newId = ids.length ? Math.max(...ids) + 1 : 1;

  const panel = newTicketPanel(newId, data);
  panels.push(panel);

  const res = await saveTicketPanels(gid, panels);
  if (!res.ok) throw new Error(`Falha ao salvar: ${res.error}`);

  return panel;
}

async function updateTicketPanel(gid, panelId, patch) {
  const pid = Number(panelId);
  if (!Number.isFinite(pid)) return { ok: false, error: 'ID de painel inválido.' };

  _ticketPanelsCache.delete(gid);
  const panels = await getTicketPanels(gid);

  const idx = panels.findIndex(p => Number(p.id) === pid);
  if (idx === -1) return { ok: false, error: `Painel #${panelId} não encontrado.` };

  panels[idx] = {
    ...panels[idx],
    ...patch,
    updated_at: new Date().toISOString(),
  };

  const res = await saveTicketPanels(gid, panels);
  if (!res.ok) return { ok: false, error: res.error };

  return { ok: true, panel: panels[idx] };
}

async function deleteTicketPanel(gid, panelId) {
  const pid = Number(panelId);
  if (!Number.isFinite(pid)) return { ok: false, error: 'ID inválido.' };

  _ticketPanelsCache.delete(gid);
  const panels = await getTicketPanels(gid);

  const filtered = panels.filter(p => Number(p.id) !== pid);
  if (filtered.length === panels.length) {
    return { ok: false, error: 'Painel não encontrado.' };
  }

  const res = await saveTicketPanels(gid, filtered);
  if (!res.ok) return { ok: false, error: res.error };

  return { ok: true };
}

async function getTicketPanel(gid, panelId) {
  const panels = await getTicketPanels(gid);
  return panels.find(p => Number(p.id) === Number(panelId)) || null;
}

async function getTicketPanelByMessage(gid, messageId) {
  const panels = await getTicketPanels(gid);
  return panels.find(p => String(p.mensagem_id) === String(messageId)) || null;
}

// ═══════════════════════════════════════════════════════════
// FACTORY / PANEL BUILDER
// ═══════════════════════════════════════════════════════════
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
    mensagem_boas_vindas: safeStr(data.mensagem_boas_vindas, 1000) || null,
    formulario: {
      habilitado: !!data?.formulario?.habilitado,
      perguntas: Array.isArray(data?.formulario?.perguntas)
        ? data.formulario.perguntas.slice(0, MAX_FORM_QUESTIONS)
        : [],
    },
    tipos: Array.isArray(data.tipos) ? data.tipos : [],
    bloqueio_usuarios_ids: Array.isArray(data.bloqueio_usuarios_ids) ? data.bloqueio_usuarios_ids : [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
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
        .setLabel(safeStr(panel.botao_label, 80) || 'Abrir Ticket')
        .setEmoji(safeStr(panel.botao_emoji, 8) || '🎫')
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

// ═══════════════════════════════════════════════════════════
// BOTÕES INTERNOS DA THREAD — ESTADO REAL
// ═══════════════════════════════════════════════════════════
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
        assumedBy: td?.assumed_by,
        isPriority: td?.is_priority,
        locked: td?.locked,
      }),
    }).catch(() => {});
  } catch (e) { console.error('[REFRESH-BTN]', e.message); }
}

// ═══════════════════════════════════════════════════════════
// LOG DE TICKET (usa panel.log_channel_id)
// ✅ FIX: era configurado mas nunca usado — agora funciona
// ═══════════════════════════════════════════════════════════
async function logTicketAction(guild, panel, action, opts = {}) {
  if (!panel?.log_channel_id) return;
  try {
    const ch = guild.channels.cache.get(panel.log_channel_id)
      || await guild.channels.fetch(panel.log_channel_id).catch(() => null);
    if (!ch?.isTextBased?.()) return;

    const colors = {
      aberto: '#22c55e', assumido: '#00AAFF', devolvido: '#FFA500',
      fechado: '#ff5555', transferido: '#9B59B6', prioridade: '#FFA500',
      excluido: '#808080', bloqueado: '#808080', desbloqueado: '#22c55e',
      movido: '#5865F2', reaberto: '#22c55e',
    };
    const emojis = {
      aberto: '🎫', assumido: '🙋', devolvido: '↩️',
      fechado: '🔒', transferido: '↪️', prioridade: '🔴',
      excluido: '🗑️', bloqueado: '🔒', desbloqueado: '🔓',
      movido: '📁', reaberto: '🔓',
    };

    const e = new EmbedBuilder()
      .setTitle(`${emojis[action] || '📋'} Ticket • ${action.toUpperCase()}`)
      .setColor(colors[action] || '#5865F2')
      .setTimestamp();

    const fields = [];
    if (panel?.id) fields.push({ name: '🎫 Painel', value: `#${panel.id} — ${panel.nome || '?'}`, inline: true });
    if (opts.threadName) fields.push({ name: '🧵 Thread', value: String(opts.threadName).slice(0, 100), inline: true });
    if (opts.threadId) fields.push({ name: '🆔 Thread ID', value: `\`${opts.threadId}\``, inline: true });
    if (opts.userId) fields.push({ name: '👤 Autor', value: `<@${opts.userId}>`, inline: true });
    if (opts.staffId) fields.push({ name: '🛡️ Staff', value: `<@${opts.staffId}>`, inline: true });
    if (opts.tipoLabel) fields.push({ name: '🎯 Tipo', value: String(opts.tipoLabel).slice(0, 100), inline: true });
    if (opts.reason) fields.push({ name: '📝 Motivo', value: String(opts.reason).slice(0, 500), inline: false });
    if (Array.isArray(opts.extraFields)) fields.push(...opts.extraFields.slice(0, 10));

    if (fields.length) e.addFields(fields.slice(0, 25));

    await ch.send({ embeds: [e] }).catch(() => {});
  } catch (e) { console.error('[TKT-LOG]', e.message); }
}

// ═══════════════════════════════════════════════════════════
// EMBED DE BOAS-VINDAS
// ═══════════════════════════════════════════════════════════
function buildTicketWelcomeEmbed(panel, tipo, authorId, formAnswers, cfg = null) {
  const meta = TICKET_STATUS.aberto;
  const tipoEmoji = safeStr(tipo?.emoji) || '🎫';
  const tipoLabel = safeStr(tipo?.label) || 'Suporte';

  const e = new EmbedBuilder().setColor(meta.color).setTitle(`${tipoEmoji} ${tipoLabel}`);

  const desc = safeStr(tipo?.descricao)
    || safeStr(panel?.mensagem_boas_vindas)
    || safeStr(cfg?.tickets_mensagem_boas_vindas)
    || 'Um atendente virá em breve.';

  const parts = [desc, ''];
  parts.push(`**Aberto por:** <@${authorId}>`);
  if (safeStr(panel?.horario_atendimento)) parts.push(`**Horário:** ${panel.horario_atendimento}`);
  parts.push(`**Atendido por:** *aguardando...*`);
  e.setDescription(parts.join('\n'));

  e.addFields(
    { name: '📌 Status', value: `${meta.emoji} ${meta.label}`, inline: true },
    { name: '🎫 Tipo', value: tipoLabel, inline: true },
  );

  if (Array.isArray(formAnswers) && formAnswers.length) {
    const answersText = formAnswers.slice(0, 5).map(a => `**${a.label}:** ${a.value}`).join('\n');
    if (safeStr(answersText)) e.addFields({ name: '📝 Respostas do formulário', value: answersText.slice(0, 1024), inline: false });
  }

  if (safeStr(panel?.horario_atendimento)) e.setFooter({ text: `Atendimento: ${panel.horario_atendimento}` });
  e.setTimestamp();
  return e;
}

// ═══════════════════════════════════════════════════════════
// VALIDAÇÕES
// ═══════════════════════════════════════════════════════════
async function canUserOpenTicket(guild, member, panel) {
  if (!member) return { ok: false, reason: '❌ Não consegui te identificar.' };

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
// OPEN TICKET — resolve categoria/canal robusto
// ═══════════════════════════════════════════════════════════
async function openTicket(i, panel, tipo, formAnswers = []) {
  const guild = i.guild;
  const cfg = await getConfig(guild.id);

  if (!guild.members.me) {
    try { await guild.members.fetchMe(); } catch {}
  }
  if (!guild.members.me) throw new Error('Bot não conseguiu se identificar. Tente novamente.');

  const me = guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.CreatePrivateThreads)) {
    throw new Error('Bot sem permissão **Criar Tópicos Privados**.');
  }
  if (!me.permissions.has(PermissionFlagsBits.ManageThreads)) {
    throw new Error('Bot sem permissão **Gerenciar Tópicos**.');
  }

  const resolveParent = (id) => {
    if (!id) return null;
    const ch = guild.channels.cache.get(id);
    if (!ch) return null;
    if (ch.type === ChannelType.GuildCategory) return null;
    if (!ch.isTextBased?.()) return null;
    if (ch.isThread?.()) return null;
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
        reason: 'Fallback tickets (categoria padrão)',
      }).catch(() => null);
    }
  }

  if (!parentCh) throw new Error('Não encontrei canal de TEXTO válido. Configure um canal no painel.');

  const tipoSlug = (safeStr(tipo?.label) || 'ticket').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
  // ✅ FIX: nome da thread truncado em 90 pra não estourar o limite de 100 do Discord
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
    if (r) {
      await Promise.allSettled([...r.members.values()].slice(0, 50).map(m => th.members.add(m.id).catch(() => {})));
    }
  }

  try {
    await supabase.from('ticket_data').upsert({
      thread_id: th.id,
      guild_id: guild.id,
      user_id: i.user.id,
      panel_id: panel.id,
      type_id: tipo?.id || null,
      status: 'aberto',
      form_answers: Array.isArray(formAnswers) && formAnswers.length ? formAnswers : null,
      opened_at: new Date().toISOString(),
      locked: false,
      is_priority: false,
      assumed_by: null,
    }, { onConflict: 'thread_id' });
  } catch (e) { console.error('[OPEN-TICKET-DB]', e.message); }

  const e = buildTicketWelcomeEmbed(panel, tipo, i.user.id, formAnswers, cfg);
  const ping = roleId ? `<@&${roleId}>` : '';
  await th.send({ content: ping || null, embeds: [e], components: buildTicketInnerButtons(th.id, {}) });

  // ✅ FIX: log via painel (antes era ignorado)
  await logTicketAction(guild, panel, 'aberto', {
    threadName: th.name,
    threadId: th.id,
    userId: i.user.id,
    tipoLabel: safeStr(tipo?.label) || 'Geral',
  });

  // Também loga no canal central do bot
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
// TRANSCRIPT — HTML robusto
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
      const de = em.description ? ffEscapeHtml(em.description).replace(/\n/g, '<br>') : '';
      return `<div style="border-left:3px solid ${em.hexColor || '#5865F2'};padding:8px;background:#2B2D31;border-radius:4px;margin-top:6px">${ti}${de}</div>`;
    }).join('');
    const c = m.content ? ffEscapeHtml(m.content).replace(/\n/g, '<br>') : '';
    return `<div style="padding:8px;margin-bottom:4px"><img src="${av}" style="width:32px;height:32px;border-radius:50%"><b style="margin-left:8px;color:${m.author.bot ? '#5865F2' : '#57F287'}">${ffEscapeHtml(m.author.tag)}</b><span style="color:#949BA4;font-size:11px;margin-left:8px">${date}</span><div>${c}${embs}${att}</div></div>`;
  }).join('');

  const meta = ticketData || {};
  const guildNameEsc = ffEscapeHtml(guild?.name || '?');
  const threadNameEsc = ffEscapeHtml(thread.name);
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Ticket — ${threadNameEsc}</title><style>body{font-family:Arial;background:#313338;color:#DBDEE1;padding:20px;max-width:900px;margin:0 auto}h1{color:#9B59B6}.meta{background:#1e1f22;padding:16px;border-radius:10px;margin-bottom:20px;border-left:4px solid #9B59B6}.meta b{color:#9B59B6}</style></head><body><h1>🎫 ${threadNameEsc}</h1><div class="meta"><b>Servidor:</b> ${guildNameEsc}<br><b>Aberto por:</b> ${ffEscapeHtml(meta.user_id || '—')}<br><b>Painel:</b> #${ffEscapeHtml(String(meta.panel_id || '—'))}<br><b>Tipo:</b> ${ffEscapeHtml(meta.type_id || '—')}<br><b>Status final:</b> ${ffEscapeHtml(meta.status || '—')}<br><b>Assumido por:</b> ${ffEscapeHtml(meta.assumed_by || '—')}<br><b>Aberto em:</b> ${ffEscapeHtml(meta.opened_at || '—')}<br><b>Fechado em:</b> ${ffEscapeHtml(meta.closed_at || '—')}<br><b>Motivo fech.:</b> ${ffEscapeHtml(meta.closed_reason || '—')}<br><b>Mensagens:</b> ${list.length}</div>${body}</body></html>`;
}

async function saveTicketTranscript(guild, thread, ticketData) {
  try {
    const html = await buildTicketTranscriptHtml(thread, ticketData, guild);
    const fn = `tickets/${guild.id}/${thread.id}-${Date.now()}.html`;
    const buf = Buffer.from(html, 'utf-8');

    // ✅ FIX: tenta bucket `tickets` primeiro, fallback pro `ff-transcripts`
    let bucket = 'tickets';
    let { error } = await supabase.storage.from(bucket).upload(fn, buf, {
      contentType: 'text/html',
      upsert: false,
    });

    if (error && /bucket|not found/i.test(error.message || '')) {
      bucket = 'ff-transcripts';
      ({ error } = await supabase.storage.from(bucket).upload(fn, buf, {
        contentType: 'text/html',
        upsert: false,
      }));
    }

    let url = null;
    if (!error) {
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(fn);
      url = pub?.publicUrl;
    }

    try {
      await supabase.from('ticket_logs').insert({
        guild_id: guild.id,
        thread_id: thread.id,
        user_id: ticketData?.user_id || null,
        thread_name: thread.name,
        transcript_url: url,
        transcript_html: url ? null : html,
        status: ticketData?.status || 'fechado',
      });
    } catch {}

    return { url, html };
  } catch (e) { console.error('[TRANSCRIPT]', e); return { url: null, html: null }; }
}

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

// ✅ FIX: rating token pra evitar spoofing (user X avaliando ticket do Y)
const RATING_TOKENS = new Map(); // threadId -> { userId, expiresAt }

async function sendTicketRatingDM(userId, threadId, threadName) {
  try {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;

    // Registra o token (válido por 24h)
    RATING_TOKENS.set(threadId, { userId, expiresAt: Date.now() + 24 * 3600 * 1000 });
    setTimeout(() => RATING_TOKENS.delete(threadId), 24 * 3600 * 1000);

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
// EDITOR — MENU PRINCIPAL (6 abas + preview + postar)
// ═══════════════════════════════════════════════════════════
async function ticketEditorPanel(guildId, panelId) {
  const panel = await getTicketPanel(guildId, panelId);
  if (!panel) {
    return { content: '❌ Painel não encontrado.', embeds: [], components: [] };
  }

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
      { name: '🚫 Bloqueados', value: `${panel.bloqueio_usuarios_ids.length}`, inline: true },
      { name: '📢 Postado', value: panel.canal_id && panel.mensagem_id ? `<#${panel.canal_id}>` : '*não postado*', inline: true },
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

// ═══════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════
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
    : '*Nenhum tipo ainda. Clique em **Adicionar** para começar.*';

  const e = new EmbedBuilder()
    .setTitle(`🎯 Tipos do Painel #${panelId}`)
    .setColor(panel.cor)
    .setDescription(desc.slice(0, 4000))
    .setFooter({ text: `${tipos.length}/${MAX_TICKET_TYPES_PER_PANEL} tipos` });

  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tkttype:add:${panelId}`).setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success).setDisabled(tipos.length >= MAX_TICKET_TYPES_PER_PANEL),
      new ButtonBuilder().setCustomId(`tkttype:edit:${panelId}`).setLabel('Editar').setEmoji('✏️').setStyle(ButtonStyle.Primary).setDisabled(!tipos.length),
      new ButtonBuilder().setCustomId(`tkttype:del:${panelId}`).setLabel('Remover').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(!tipos.length),
      new ButtonBuilder().setCustomId(`tktedit:open:${panelId}`).setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════
async function ticketConfigPanel(guildId, panelId) {
  const panel = await getTicketPanel(guildId, panelId);
  if (!panel) return { content: '❌', embeds: [], components: [] };

  const e = new EmbedBuilder()
    .setTitle(`⚙️ Configurações do Painel #${panelId}`)
    .setColor(panel.cor)
    .addFields(
      { name: '👤 Limite por usuário', value: `${panel.limite_tickets_usuario}`, inline: true },
      { name: '⏰ Auto-close', value: panel.auto_close_horas ? `${panel.auto_close_horas}h` : 'Off', inline: true },
      { name: '🚪 Fechar ao sair', value: panel.fechar_ao_sair ? '✅' : '❌', inline: true },
      { name: '🕐 Horário', value: safeStr(panel.horario_atendimento) || '*—*', inline: false },
      { name: '🎭 Categoria padrão', value: panel.categoria_padrao_id ? `<#${panel.categoria_padrao_id}>` : '*—*', inline: true },
      { name: '💬 Msg boas-vindas', value: safeStr(panel.mensagem_boas_vindas, 200) || '*padrão*', inline: false },
    );

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tktcfg:limite:${panelId}`).setLabel('Limite').setEmoji('👤').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tktcfg:autoclose:${panelId}`).setLabel('Auto-close').setEmoji('⏰').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tktcfg:sair:${panelId}`).setLabel(panel.fechar_ao_sair ? 'Desativar sair' : 'Fechar ao sair').setEmoji('🚪').setStyle(panel.fechar_ao_sair ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`tktcfg:horario:${panelId}`).setLabel('Horário').setEmoji('🕐').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tktcfg:categoria:${panelId}`).setLabel('Categoria padrão').setEmoji('📁').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tktcfg:mensagem:${panelId}`).setLabel('Msg boas-vindas').setEmoji('💬').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tktedit:open:${panelId}`).setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// FORMULÁRIO
// ═══════════════════════════════════════════════════════════
async function ticketFormPanel(guildId, panelId) {
  const panel = await getTicketPanel(guildId, panelId);
  if (!panel) return { content: '❌', embeds: [], components: [] };
  const form = panel.formulario || { habilitado: false, perguntas: [] };

  const desc = form.perguntas.length
    ? form.perguntas.map((p, i) =>
        `**${i + 1}.** ${p.label}${p.obrigatorio ? ' *(obrigatório)*' : ''}\n> Placeholder: \`${p.placeholder || '—'}\``
      ).join('\n\n')
    : '*Nenhuma pergunta configurada.*';

  const e = new EmbedBuilder()
    .setTitle(`📝 Formulário do Painel #${panelId}`)
    .setColor(form.habilitado ? '#22c55e' : '#808080')
    .setDescription(desc.slice(0, 4000))
    .setFooter({ text: `${form.perguntas.length}/${MAX_FORM_QUESTIONS} perguntas • ${form.habilitado ? 'ATIVO' : 'INATIVO'}` });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tktform:toggle:${panelId}`).setLabel(form.habilitado ? 'Desativar' : 'Ativar').setEmoji(form.habilitado ? '🔴' : '🟢').setStyle(form.habilitado ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`tktform:add:${panelId}`).setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success).setDisabled(form.perguntas.length >= MAX_FORM_QUESTIONS),
      new ButtonBuilder().setCustomId(`tktform:clear:${panelId}`).setLabel('Limpar').setEmoji('🧹').setStyle(ButtonStyle.Danger).setDisabled(!form.perguntas.length),
      new ButtonBuilder().setCustomId(`tktedit:open:${panelId}`).setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    ),
  ];

  if (form.perguntas.length) {
    const menu = new StringSelectMenuBuilder().setCustomId(`tktform:del_pick:${panelId}`).setPlaceholder('🗑️ Remover uma pergunta');
    form.perguntas.forEach((p, i) => menu.addOptions({ label: `${i + 1}. ${p.label}`.slice(0, 90), value: String(i) }));
    rows.unshift(new ActionRowBuilder().addComponents(menu));
  }
  return { embeds: [e], components: rows };
}

// ═══════════════════════════════════════════════════════════
// BLOQUEIOS
// ═══════════════════════════════════════════════════════════
async function ticketBlocksPanel(guildId, panelId) {
  const panel = await getTicketPanel(guildId, panelId);
  if (!panel) return { content: '❌', embeds: [], components: [] };
  const blocked = Array.isArray(panel.bloqueio_usuarios_ids) ? panel.bloqueio_usuarios_ids : [];

  const e = new EmbedBuilder()
    .setTitle(`🚫 Bloqueios do Painel #${panelId}`)
    .setColor('#FF5555')
    .setDescription(blocked.length
      ? blocked.map(id => `• <@${id}> (\`${id}\`)`).join('\n')
      : '*Ninguém bloqueado.*')
    .setFooter({ text: `${blocked.length} usuário(s) bloqueado(s)` });

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
// AÇÕES INTERNAS
// ═══════════════════════════════════════════════════════════
async function ticketActionClaim(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌ Use dentro de uma thread.', flags: EPHEMERAL });

  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  if (td?.assumed_by) return i.reply({ content: `⚠️ Já assumido por <@${td.assumed_by}>.`, flags: EPHEMERAL });

  try {
    await supabase.from('ticket_data').upsert({
      thread_id: th.id, guild_id: i.guild.id,
      user_id: td?.user_id || i.user.id,
      assumed_by: i.user.id, assumed_at: new Date().toISOString(),
      status: 'atendimento',
    }, { onConflict: 'thread_id' });
  } catch (e) { console.error('[CLAIM]', e.message); }

  await th.send({ content: `🙋 <@${i.user.id}> assumiu o ticket.` });
  const { data: newTd } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  await refreshTicketButtons(th, newTd);

  const panel = td?.panel_id ? await getTicketPanel(i.guild.id, td.panel_id) : null;
  await logTicketAction(i.guild, panel, 'assumido', {
    threadName: th.name, threadId: th.id,
    staffId: i.user.id, userId: td?.user_id,
  });

  return i.reply({ content: '✅ Assumido.', flags: EPHEMERAL });
}

async function ticketActionUnclaim(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  if (!td?.assumed_by) return i.reply({ content: '⚠️ Ninguém assumiu.', flags: EPHEMERAL });

  // ✅ FIX: garante i.member populado (crashava em partial/DM)
  const mem = await ensureMember(i);
  const isOwner = td.assumed_by === i.user.id;
  const isStaff = isDeveloper(i.user.id)
    || i.user.id === i.guild.ownerId
    || memberHasPerm(mem, PermissionFlagsBits.Administrator);
  if (!isOwner && !isStaff) return i.reply({ content: '❌ Só quem assumiu (ou staff) pode devolver.', flags: EPHEMERAL });

  await supabase.from('ticket_data').update({ assumed_by: null, assumed_at: null, status: 'aberto' }).eq('thread_id', th.id);
  await th.send({ content: `↩️ <@${i.user.id}> devolveu o ticket.` });
  const { data: newTd } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  await refreshTicketButtons(th, newTd);

  const panel = td.panel_id ? await getTicketPanel(i.guild.id, td.panel_id) : null;
  await logTicketAction(i.guild, panel, 'devolvido', {
    threadName: th.name, threadId: th.id, staffId: i.user.id,
  });

  return i.reply({ content: '✅ Devolvido.', flags: EPHEMERAL });
}

async function ticketActionLock(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  if (!td) return i.reply({ content: '❌', flags: EPHEMERAL });

  const wasLocked = !!td.locked;
  await supabase.from('ticket_data').update({ locked: !wasLocked }).eq('thread_id', th.id);

  if (!wasLocked) {
    await th.members.remove(td.user_id).catch(() => {});
    await th.send({ content: `🔒 Bloqueado por <@${i.user.id}>. O autor não pode mais responder.` });
  } else {
    await th.members.add(td.user_id).catch(() => {});
    await th.send({ content: `🔓 Desbloqueado por <@${i.user.id}>.` });
  }

  const { data: newTd } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  await refreshTicketButtons(th, newTd);

  const panel = td.panel_id ? await getTicketPanel(i.guild.id, td.panel_id) : null;
  await logTicketAction(i.guild, panel, wasLocked ? 'desbloqueado' : 'bloqueado', {
    threadName: th.name, threadId: th.id, staffId: i.user.id,
  });

  return i.reply({ content: wasLocked ? '🔓 Desbloqueado.' : '🔒 Bloqueado.', flags: EPHEMERAL });
}

async function ticketActionPriority(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  const nv = !td?.is_priority;

  await supabase.from('ticket_data').update({ is_priority: nv, priority_set_by: i.user.id }).eq('thread_id', th.id);

  const base = th.name.replace(/^🔴\s*/, '');
  await th.setName(nv ? `🔴 ${base}`.slice(0, 100) : base).catch(() => {});
  await th.send({ content: nv ? `🔴 Marcado como **ALTA PRIORIDADE** por <@${i.user.id}>.` : `⚪ Prioridade removida.` });

  const { data: newTd } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  await refreshTicketButtons(th, newTd);

  if (nv) {
    const panel = td?.panel_id ? await getTicketPanel(i.guild.id, td.panel_id) : null;
    await logTicketAction(i.guild, panel, 'prioridade', { threadName: th.name, threadId: th.id, staffId: i.user.id });
  }

  return i.reply({ content: nv ? '🔴 Prioridade ativada.' : '⚪ Prioridade removida.', flags: EPHEMERAL });
}

async function ticketActionTransfer(i, tipoId) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  if (!td) return i.reply({ content: '❌', flags: EPHEMERAL });

  const panel = await getTicketPanel(i.guild.id, td.panel_id);
  if (!panel) return i.reply({ content: '❌ Painel não encontrado.', flags: EPHEMERAL });

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

  await logTicketAction(i.guild, panel, 'transferido', {
    threadName: th.name, threadId: th.id, staffId: i.user.id,
    reason: `→ ${novoTipo.label}`,
  });

  return i.reply({ content: `✅ Transferido para ${novoTipo.label}.`, flags: EPHEMERAL });
}

async function ticketActionMove(i, categoriaId) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });

  const cat = i.guild.channels.cache.get(categoriaId);
  if (!cat || cat.type !== ChannelType.GuildCategory) return i.reply({ content: '❌ Categoria inválida.', flags: EPHEMERAL });

  try {
    const parentCh = th.parent;
    if (parentCh) await parentCh.setParent(cat.id, { lockPermissions: false });
  } catch (e) {
    return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL });
  }

  await th.send({ content: `📁 Movido para **${cat.name}** por <@${i.user.id}>.` });

  const { data: td } = await supabase.from('ticket_data').select('panel_id').eq('thread_id', th.id).maybeSingle();
  const panel = td?.panel_id ? await getTicketPanel(i.guild.id, td.panel_id) : null;
  await logTicketAction(i.guild, panel, 'movido', { threadName: th.name, threadId: th.id, staffId: i.user.id, reason: cat.name });

  return i.reply({ content: '✅ Movido.', flags: EPHEMERAL });
}

async function ticketActionClose(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  if (TICKET_CLOSING.has(th.id)) return i.reply({ content: '⏳ Fechando...', flags: EPHEMERAL });
  TICKET_CLOSING.add(th.id);

  try {
    const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
    const panel = td?.panel_id ? await getTicketPanel(i.guild.id, td.panel_id) : null;

    const ticketDataWithClose = {
      ...(td || {}),
      closed_at: new Date().toISOString(),
      status: 'fechado',
      closed_by: i.user.id,
      closed_reason: 'manual',
    };

    await sendTicketTranscriptToLog(i.guild, th, ticketDataWithClose, panel);
    await supabase.from('ticket_data').update({
      closed_at: ticketDataWithClose.closed_at,
      closed_by: i.user.id,
      status: 'fechado',
      closed_reason: 'manual',
    }).eq('thread_id', th.id);

    if (td?.user_id) {
      await th.send({ content: `✅ Fechado por <@${i.user.id}>.` }).catch(() => {});
      const cfg = await getConfig(i.guild.id);
      if (cfg.tickets_avaliacao_ativa !== false) {
        setTimeout(() => sendTicketRatingDM(td.user_id, th.id, th.name).catch(() => {}), 3000);
      }
    }

    await logTicketAction(i.guild, panel, 'fechado', {
      threadName: th.name, threadId: th.id,
      staffId: i.user.id, userId: td?.user_id,
    });

    // ✅ FIX: timeout de segurança em caso de rate limit/trava
    await Promise.race([
      (async () => {
        await th.setLocked(true).catch(() => {});
        await th.setArchived(true).catch(() => {});
      })(),
      sleep(5000),
    ]);

    return i.reply({ content: '🔒 Ticket fechado.', flags: EPHEMERAL });
  } finally {
    setTimeout(() => TICKET_CLOSING.delete(th.id), 60000);
  }
}

async function ticketActionDelete(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });

  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  const panel = td ? await getTicketPanel(i.guild.id, td.panel_id) : null;

  if (td) {
    await sendTicketTranscriptToLog(i.guild, th, {
      ...td, closed_at: new Date().toISOString(), status: 'excluido',
    }, panel);
  }

  await supabase.from('ticket_data').update({
    closed_at: new Date().toISOString(),
    status: 'excluido',
  }).eq('thread_id', th.id);

  await logTicketAction(i.guild, panel, 'excluido', {
    threadName: th.name, threadId: th.id, staffId: i.user.id, userId: td?.user_id,
  });

  await i.reply({ content: '🗑️ Excluindo thread em 3s...', flags: EPHEMERAL });
  setTimeout(() => th.delete().catch(() => {}), 3000);
}

async function ticketActionRate(i, stars) {
  try {
    const parts = i.customId.split(':');
    const thId = parts[2];
    const n = parseInt(stars, 10) || parseInt(parts[3], 10) || 0;
    if (!thId || n < 1 || n > 5) {
      return i.reply({ content: '❌ Nota inválida.', flags: EPHEMERAL });
    }

    // ✅ FIX: valida que o user que está avaliando é o autor do ticket
    const token = RATING_TOKENS.get(thId);
    if (token && token.userId !== i.user.id) {
      return i.reply({ content: '❌ Esta avaliação não é sua.', flags: EPHEMERAL }).catch(() => {});
    }

    const { data: td } = await supabase.from('ticket_data').select('assumed_by').eq('thread_id', thId).maybeSingle();

    try {
      // ✅ FIX: i.guild pode ser null em DM — usa optional chaining
      await supabase.from('ticket_ratings').insert({
        guild_id: i.guild?.id || null,
        thread_id: thId,
        user_id: i.user.id,
        staff_id: td?.assumed_by || null,
        rating: n,
      });
    } catch (e) { console.error('[RATE-DB]', e.message); }

    RATING_TOKENS.delete(thId);

    await i.update({
      embeds: [new EmbedBuilder()
        .setTitle('⭐ Obrigado!')
        .setColor('#FFD700')
        .setDescription(`Você avaliou com **${'⭐'.repeat(n)}** (${n}/5).`)],
      components: [],
    }).catch(() => {});
  } catch (e) { console.error('[RATE]', e); }
}

// ═══════════════════════════════════════════════════════════
// AUTOMAÇÕES
// ═══════════════════════════════════════════════════════════
async function checkTicketsAutoClose() {
  try {
    const { data: abertos } = await supabase
      .from('ticket_data')
      .select('thread_id,guild_id,panel_id,opened_at')
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

      // ✅ FIX: aviso de 1h antes — envolvido em try/catch silencioso
      // (a coluna `auto_close_warned_at` pode não existir em DBs antigos)
      if (horasInativo >= horas - 1 && horasInativo < horas) {
        try {
          const { data: full } = await supabase
            .from('ticket_data')
            .select('auto_close_warned_at')
            .eq('thread_id', td.thread_id)
            .maybeSingle();
          const avisoTs = full?.auto_close_warned_at ? new Date(full.auto_close_warned_at).getTime() : 0;
          if (agora - avisoTs > 3600000) {
            await th.send({ content: `⚠️ Este ticket será fechado em **1 hora** por inatividade. Responda pra manter aberto.` }).catch(() => {});
            await supabase.from('ticket_data').update({ auto_close_warned_at: new Date().toISOString() }).eq('thread_id', td.thread_id);
          }
        } catch { /* coluna não existe — ignora */ }
      }

      if (horasInativo >= horas) {
        TICKET_CLOSING.add(td.thread_id);
        try {
          const { data: fullTd } = await supabase.from('ticket_data').select('*').eq('thread_id', td.thread_id).maybeSingle();
          await sendTicketTranscriptToLog(guild, th, {
            ...fullTd,
            closed_at: new Date().toISOString(),
            status: 'fechado',
            closed_reason: 'auto_close',
          }, panel);

          await supabase.from('ticket_data').update({
            closed_at: new Date().toISOString(),
            status: 'fechado',
            closed_reason: 'auto_close',
          }).eq('thread_id', td.thread_id);

          await th.send({ content: `🔒 Fechado automaticamente por inatividade (${horas}h).` }).catch(() => {});
          await th.setLocked(true).catch(() => {});
          await th.setArchived(true).catch(() => {});

          await logTicketAction(guild, panel, 'fechado', {
            threadName: th.name, threadId: th.id,
            reason: `Auto-close após ${horas}h inativo`,
          });
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
        await sendTicketTranscriptToLog(guild, th, {
          ...fullTd,
          closed_at: new Date().toISOString(),
          status: 'fechado',
          closed_reason: 'saiu_servidor',
        }, panel);

        await supabase.from('ticket_data').update({
          closed_at: new Date().toISOString(),
          status: 'fechado',
          closed_reason: 'saiu_servidor',
        }).eq('thread_id', td.thread_id);

        await th.send({ content: `🔒 Autor saiu do servidor. Fechando ticket.` }).catch(() => {});
        await th.setArchived(true).catch(() => {});

        await logTicketAction(guild, panel, 'fechado', {
          threadName: th.name, threadId: th.id,
          userId: td.user_id, reason: 'Autor saiu do servidor',
        });
      } finally {
        setTimeout(() => TICKET_CLOSING.delete(td.thread_id), 60000);
      }
    }
  } catch (e) { console.error('[LEAVE-CLOSE]', e.message); }
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 5/12 — v6.8.0
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 6/12] SETUPS — LOJA · COMUNIDADE · ORGANIZAÇÃO
// Helpers + Dispatcher + Comando Secreto FF (CORRIGIDO)
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// HELPERS DE SETUP
// ═══════════════════════════════════════════════════════════
async function cleanupRoles(guild, bot) {
  try {
    const me = guild.members.me || bot;
    if (!me) return { deletedCount: 0, failedCount: 0 };

    // ✅ FIX: guard contra botHighest null
    const botHighest = me.roles?.highest;
    if (botHighest) {
      const maxPos = Math.max(0, guild.roles.cache.size - 2);
      if (botHighest.position < maxPos) {
        await botHighest.setPosition(maxPos, { reason: 'Setup: subindo bot' }).catch(() => {});
        await sleep(800);
      }
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
    await Promise.allSettled(roles.slice(i, i + 5).map(r =>
      r.delete('Setup').then(() => ok++).catch(() => fail++)
    ));
    await sleep(500);
  }
  console.log(`✅ ${ok} cargos removidos${fail ? ` • ⚠️ ${fail} falharam` : ''}`);
  return { deletedCount: ok, failedCount: fail };
}

function checkSetupPermissions(bot) {
  // ✅ FIX: guard contra bot null ou permissions null
  if (!bot) throw new Error('Bot não encontrado no servidor.');
  if (!bot.permissions) {
    throw new Error(
      'Não consegui ler as permissões do bot.\n' +
      '**Solução:** dê **Administrador** ao cargo do bot e tente novamente.'
    );
  }

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

// Cria cargos em sequência (evita rate limit + reutiliza existentes)
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

// Cria canal com cache (evita 429)
async function createChannelSafe(guild, opts) {
  try {
    const parentId = opts.parent || null;
    // ✅ FIX: comparação null-safe (parentId era null vs undefined)
    const ex = guild.channels.cache.find(c =>
      c.name === opts.name &&
      c.type === opts.type &&
      (c.parentId || null) === (parentId || null)
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

// Adiciona membros em batch (paginado — funciona em servidores grandes)
async function addAllMembersToRole(guild, role, filterFn = null) {
  if (!role) return 0;
  try {
    // ✅ FIX: paginação real. Antes usava { limit: 100 } e só pegava 100 membros.
    let lastId = '0';
    let processed = 0;
    let ok = 0;

    while (true) {
      const batch = await guild.members.fetch({ limit: 200, after: lastId }).catch(() => null);
      if (!batch?.size) break;

      const toAdd = [...batch.values()].filter(m =>
        !m.user.bot &&
        !m.roles.cache.has(role.id) &&
        (!filterFn || filterFn(m))
      );

      for (let i = 0; i < toAdd.length; i += 5) {
        await Promise.allSettled(toAdd.slice(i, i + 5).map(m =>
          m.roles.add(role).then(() => ok++).catch(() => {})
        ));
        await sleep(700);
      }

      processed += batch.size;
      lastId = batch.last().id;
      if (batch.size < 200) break;
      if (processed > 5000) break; // trava de segurança
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
      for (const r of allow) {
        ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
      }
      return ow;
    };

    const buildRO = () => {
      const ow = [
        { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ];
      for (const r of staffRoles) {
        ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] });
      }
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

        const ch = await createChannelSafe(guild, {
          name: d.name, type: ty, parent: cat.id, permissionOverwrites: ow,
        });
        if (ch) created[d.name] = ch;
        else errors.push(`ch ${d.name}`);
      }
    }

    await everyone.setPermissions([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
      PermissionFlagsBits.CreateInstantInvite,
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
      { cat: 'D1SCORD', name: 'Nitro' },
      { cat: 'D1SCORD', name: 'Boost' },
      { cat: 'D1SCORD', name: 'Link' },
      { cat: 'D1SCORD', name: 'Impulso' },
      { cat: 'D1SCORD', name: 'Ativação' },
      { cat: 'D1SCORD', name: 'Gift' },
      { cat: 'VARIEDADES', name: 'Pix Infinito' },
      { cat: 'VARIEDADES', name: 'Minecraft' },
      { cat: 'VARIEDADES', name: 'Robux' },
      { cat: 'VARIEDADES', name: 'Streaming' },
    ];

    for (const p of autoProducts) {
      const { data: ex } = await supabase.from('products').select('id').eq('guild_id', guild.id).eq('name', p.name).maybeSingle();
      if (ex) continue;
      try {
        await supabase.from('products').insert({
          guild_id: guild.id,
          category_id: catIds[p.cat] || null,
          name: p.name, price: 0, description: '',
          delivery_type: 'key', active: true,
        });
      } catch {}
    }

    await report('📤 Postando painéis...');
    await guild.channels.fetch().catch(() => {});
    await sleep(1500);

    const tasks = [];

    // Ticket panel
    const tpCh = created['📩・suporte'];
    if (tpCh) {
      const panel = await createTicketPanel(guild.id, {
        nome: 'Suporte',
        titulo: 'Central de Atendimento',
        descricao: 'Selecione o tipo de atendimento desejado.',
        cor: '#9B59B6',
        botao_label: 'Abrir Ticket',
        botao_emoji: '🎫',
        cargo_id: roles['T1cket']?.id || null,
        log_channel_id: created['logs']?.id || null,
        tipos: [
          { id: 'suporte', label: 'Suporte Geral', emoji: '🛠️', descricao: 'Descreva seu problema.' },
          { id: 'compra', label: 'Comprar Produto', emoji: '🛒', descricao: 'Informe o produto.' },
          { id: 'reembolso', label: 'Reembolso', emoji: '💸', descricao: 'Explique o motivo.' },
        ],
      });
      const msg = await tpCh.send({
        embeds: [buildTicketPanelEmbed(panel)],
        components: buildTicketPanelComponents(panel),
      }).catch(() => null);
      if (msg) await updateTicketPanel(guild.id, panel.id, { canal_id: tpCh.id, mensagem_id: msg.id });
    }

    // Verificação
    const vCh = created['✅・verificação'];
    if (vCh) {
      const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${encodeURIComponent('verify:' + guild.id)}`;
      const b = new ButtonBuilder().setLabel('Verificar').setEmoji('✅').setStyle(ButtonStyle.Link).setURL(oauthUrl);
      tasks.push(vCh.send({
        embeds: [new EmbedBuilder().setColor('#00FF00').setTitle('✅ Verificação').setDescription('Clique abaixo para se verificar.')],
        components: [new ActionRowBuilder().addComponents(b)],
      }).catch(() => {}));
    }

    // Painéis de loja
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

        const e = new EmbedBuilder()
          .setTitle(`🛒 ${panel.name}`)
          .setColor(panel.color)
          .setDescription(panel.description)
          .setFooter({ text: 'Clique em Comprar' })
          .setTimestamp();

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
  } finally {
    setupInProgress.delete(guild.id);
  }
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
      { name: '👑│Owner',    color: '#FFD700', perms: [PermissionFlagsBits.Administrator], hoist: true },
      { name: '🌀│CoOwner',  color: '#FFA500', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.ManageGuild], hoist: true },
      { name: '🔒│Admin',    color: '#FF0000', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers], hoist: true },
      { name: '🔨│Mod',      color: '#00AAFF', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ModerateMembers], hoist: true },
      { name: '💠│Helper',   color: '#00FFCC', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages], hoist: true },
      { name: '🌀│Friend',   color: '#9B59B6', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles], hoist: true },
      { name: '❤️️｜trusted', color: '#FF69B4', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory], hoist: true },
      { name: '🔑│Member',   color: '#7CFC00', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.AddReactions], hoist: true },
      { name: '🛡️│Bots',     color: '#808080', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageMessages], hoist: true },
    ];
    const roles = await createRolesSequential(guild, roleDefs, errors);

    const everyone = guild.roles.everyone, botId = bot.id;
    const staffRoles = [roles['👑│Owner'], roles['🌀│CoOwner'], roles['🔒│Admin'], roles['🔨│Mod'], roles['💠│Helper']].filter(Boolean);

    const staffOW = [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
    ];
    for (const r of staffRoles) {
      staffOW.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
    }

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
          for (const r of staffRoles) {
            ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
          }
        } else if (d.ro) {
          ow = [
            { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
            { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          ];
        }

        const ch = await createChannelSafe(guild, {
          name: d.name, type: ty, parent: cat.id, permissionOverwrites: ow,
        });
        if (ch) created[d.name] = ch;
        else errors.push(`ch ${d.name}`);

        if (d.afk && ch) await guild.setAFKChannel(ch, 300).catch(() => {});
      }
    }

    await everyone.setPermissions([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
      PermissionFlagsBits.CreateInstantInvite,
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
        nome: 'Suporte',
        titulo: 'Central de Suporte',
        descricao: 'Selecione o tipo.',
        cor: '#9B59B6',
        botao_label: 'Abrir Ticket',
        botao_emoji: '🎫',
        cargo_id: roles['💠│Helper']?.id || null,
        log_channel_id: created['〔🚀〕staff-chat']?.id || null,
        tipos: [
          { id: 'suporte', label: 'Suporte Geral', emoji: '🛠️' },
          { id: 'denuncia', label: 'Denúncia', emoji: '🚨' },
          { id: 'parceria', label: 'Parceria', emoji: '🤝' },
        ],
      });
      const msg = await tkCh.send({
        embeds: [buildTicketPanelEmbed(panel)],
        components: buildTicketPanelComponents(panel),
      }).catch(() => null);
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
  } finally {
    setupInProgress.delete(guild.id);
  }
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
      for (const r of allowed) {
        ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
      }
      return ow;
    };

    const buildRO = () => {
      const ow = [
        { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ];
      for (const r of adminRoles) {
        ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] });
      }
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

        const ch = await createChannelSafe(guild, {
          name: d.name, type: ty, parent: cat?.id, permissionOverwrites: ow,
        });
        if (ch) created[d.name] = ch;
        else errors.push(`ch ${d.name}`);
      }
    }

    await everyone.setPermissions([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
      PermissionFlagsBits.CreateInstantInvite,
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
      valor_minimo: 0.50,
      valor_maximo: 1000,
      mediator_fee: 0.15,
      coin_prize: 1,
      value_options: hasValues ? existingFF.value_options : FF_DEFAULT_VALUES,
      auto_thread: true,
      require_mediator_confirm: true,
      block_blacklist: true,
      auto_post_ranking: true,
      auto_post_blacklist: true,
      auto_post_regras: true,
    });

    const mr = roles['・gg/[nome da sua org]'];
    if (mr) await addAllMembersToRole(guild, mr);

    if (!skipPosting) {
      await report('📤 Postando painéis...');
      await guild.channels.fetch().catch(() => {});
      await sleep(1500);

      const f = (n) => created[n] || guild.channels.cache.find(c => c.name === n);
      const tasks = [];

      // Ticket panel
      const tkCh = f('🎟・ticket');
      if (tkCh) {
        const panel = await createTicketPanel(guild.id, {
          nome: 'Suporte',
          titulo: 'Central de Atendimento',
          descricao: 'Selecione o tipo.',
          cor: '#9B59B6',
          botao_label: 'Abrir Ticket',
          botao_emoji: '🎫',
          cargo_id: roles['SUPORTE']?.id || null,
          log_channel_id: created['🤖・log-ticket']?.id || null,
          tipos: [
            { id: 'suporte', label: 'Suporte', emoji: '🛠️' },
            { id: 'receber-evento', label: 'Receber Evento', emoji: '🎁' },
            { id: 'reembolso', label: 'Reembolso', emoji: '💸' },
            { id: 'vaga-mediador', label: 'Vaga Mediador', emoji: '🛡️' },
            { id: 'vaga-influencer', label: 'Vaga Influencer', emoji: '🎥' },
          ],
        });
        const msg = await tkCh.send({
          embeds: [buildTicketPanelEmbed(panel)],
          components: buildTicketPanelComponents(panel),
        }).catch(() => null);
        if (msg) await updateTicketPanel(guild.id, panel.id, { canal_id: tkCh.id, mensagem_id: msg.id });
      }

      // Pix
      const pixCh = f('💎・config-pix');
      if (pixCh) tasks.push(ffPostPixEmbed(guild, pixCh.id).catch(() => {}));

      // Mediador
      const medCh = f('💎・fila-mediador');
      if (medCh) tasks.push((async () => {
        const p = await ffBuildMediatorPanel(guild.id);
        await medCh.send(p).catch(() => {});
      })());

      // Analista
      const anaCh = f('📋・fila-analistas');
      if (anaCh) tasks.push((async () => {
        const p = await ffBuildAnalystPanel(guild.id);
        await anaCh.send(p).catch(() => {});
      })());

      // Streamer — usa shim novo (PARTE 4 → PARTE 12)
      const strCh = f('🎥・fila-streamer');
      if (strCh) tasks.push(ffPostStreamerPanel(guild, strCh.id).catch(() => {}));

      // Blacklist
      const blCh = f('🚫・blacklist');
      if (blCh) tasks.push((async () => {
        const p = await ffBuildBlacklistEmbed(guild.id);
        const m = await blCh.send(p).catch(() => null);
        if (m) await ffPatchConfig(guild.id, { blacklist_channel_id: blCh.id, blacklist_embed_id: m.id });
      })());

      // PIX Meds panel
      const pixMedCh = f('💎・pix-mediadores');
      if (pixMedCh) tasks.push((async () => {
        const p = await ffBuildMediatorPixPanel(guild.id);
        await pixMedCh.send(p).catch(() => {});
      })());

      // Static embeds
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
            const e = new EmbedBuilder()
              .setTitle(emb.t).setColor(emb.c)
              .setDescription(emb.d).setTimestamp();
            const extra = emb.ch === '🪙・trocar-coins'
              ? { components: await buildCoinShopComponents(guild.id) }
              : {};
            tasks.push(ch.send({ embeds: [e], ...extra }).catch(() => {}));
          }
        } catch {}
      }

      await Promise.allSettled(tasks);

      // Postar apostas
      try {
        await report('🎮 Postando apostas...');
        const cfgFF2 = await ffGetConfig(guild.id);
        let valsFF2 = Array.isArray(cfgFF2?.value_options) ? cfgFF2.value_options : [];
        if (!valsFF2.length) {
          valsFF2 = FF_DEFAULT_VALUES;
          await ffPatchConfig(guild.id, { value_options: valsFF2 });
        }
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
              const { data: bet, error } = await supabase.from('ff_bets').insert({
                guild_id: guild.id, channel_id: ch.id,
                format: fmt.label, value,
              }).select().single();
              if (error) throw error;

              const msg = await ch.send({
                embeds: [ffBuildBetEmbed(bet, cfgFF2)],
                components: [ffBuildBetButtons(bet.id, cfgFF2)],
              });
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
  } finally {
    setupInProgress.delete(guild.id);
  }
}

// ═══════════════════════════════════════════════════════════
// SETUP DISPATCHER
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

  // ✅ FIX: reportar progresso no DM se demorar muito (>30s)
  const dmProgress = setTimeout(async () => {
    try {
      const u = await client.users.fetch(authorId);
      await u.send('⏳ Setup ainda rodando... aguarde mais um pouco. 🦊');
    } catch {}
  }, 30000);

  try {
    const result = await setupOrganizacaoServer(g, null, { skipPosting: true });
    clearTimeout(dmProgress);
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

    // Streamer — shim novo
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
    clearTimeout(dmProgress);
    await logImportant('ERRO', `Falha no setup secreto FF`, {
      description: `\`\`\`\n${e.message}\n\`\`\``,
      user: authorId, guild: g.id, severity: 'danger',
    }).catch(() => {});
    return { ok: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 6/12 — v6.8.0
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 7/12] SQL MIGRATION + DEV HUB + PAINÉIS DEV (CORRIGIDA)
// v6.8.0 — sistema de streamer migrado para PARTE 12
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// DEV HUB
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
      .setDescription(
        `> 🎮 Hub FF do servidor\n` +
        `> 📢 Postar apostas\n` +
        `> 🎥 **Streamers** *(painel dedicado)*\n` +
        `> ⚡ Manutenção FF\n` +
        `> 💳 PIX\n` +
        `> 💳 PIX Mediadores (admin)\n` +
        `> 🎬 Simulador *(premium)*`
      )],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_ff_panel').setLabel('Abrir FF').setEmoji('🎮').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_ff_postar').setLabel('Postar').setEmoji('📢').setStyle(ButtonStyle.Primary),
        // ✅ FIX: abre o painel dedicado de streamers (stats + botão pra /config streamer)
        new ButtonBuilder().setCustomId('dev_ff_streamer').setLabel('Streamers').setEmoji('🎥').setStyle(ButtonStyle.Primary),
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
// DEV PAINÉIS
// ═══════════════════════════════════════════════════════════
async function devPanelDashboard() {
  // ⚙️ getDashboardStats() já lê a tabela nova `streamer_queue` (PARTE 2)
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
      // ✅ FIX: "strsOnline/strsTotal" agora vem da tabela nova
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

async function devPanelPremium(guild) {
  const c = await getConfig(guild.id);
  const { data: fp } = await supabase.from('force_premium').select('*').eq('scope', 'guild').eq('target_id', guild.id).maybeSingle();
  const isForce = !!fp;
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
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
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

  // ✅ FIX: stats de streamer do sistema NOVO
  let streamerInfo = { total: 0, online: 0, queue: 0 };
  try {
    const streamers = await getStreamers(guildId);
    streamerInfo.total = streamers.length;
    streamerInfo.online = streamers.filter(s => s.status === 'online').length;
    const { count } = await supabase.from('streamer_queue')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .in('status', ['waiting', 'in_thread']);
    streamerInfo.queue = count || 0;
  } catch {}

  const e4 = new EmbedBuilder().setTitle('📊 Atividade').setColor('#57F287')
    .addFields(
      { name: '🧵', value: `${a.threadsActive}`, inline: true },
      { name: '🎫', value: `${a.ticketsActive}`, inline: true },
      { name: '🛒', value: `R$ ${a.vendas7d.toFixed(2)}`, inline: true },
      { name: '🪙', value: `${a.coinsTotal}`, inline: true },
      { name: '🛡️', value: `${a.medsOnline}/${a.medsTotal}`, inline: true },
      { name: '🔎', value: `${a.anasOnline}/${a.anasTotal}`, inline: true },
      // ✅ FIX: linha nova com sistema NOVO de streamers
      { name: '🎥 Streamers', value: `**${streamerInfo.online}🟢 / ${streamerInfo.total}**`, inline: true },
      { name: '⏳ Fila Str.', value: `${streamerInfo.queue}`, inline: true },
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
  // ⚙️ getGlobalStaff() já lê a tabela nova `streamer_queue` (PARTE 2)
  const staff = await getGlobalStaff();
  const perPage = 10;
  const total = staff.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = page * perPage;
  const slice = staff.slice(start, start + perPage);

  const e = new EmbedBuilder().setTitle('👥 Staff Global').setColor('#5865F2')
    .setDescription(total === 0
      ? '*Nenhum.*'
      : slice.map((s, idx) => {
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
  const [medsRes, anasRes, blRes, strsRes] = await Promise.all([
    supabase.from('ff_mediator_queue').select('earnings_total,matches_total').eq('user_id', userId),
    supabase.from('ff_analyst_queue').select('analyses_total').eq('user_id', userId),
    supabase.from('staff_blacklist').select('reason').eq('user_id', userId).maybeSingle(),
    // ✅ FIX: tabela nova
    supabase.from('streamer_queue').select('user_id').eq('user_id', userId),
  ]);
  const meds = medsRes.data || [], anas = anasRes.data || [], bl = blRes.data;
  const totalEarn = meds.reduce((a, m) => a + Number(m.earnings_total || 0), 0);
  const strsCount = (strsRes.data || []).length;

  const e = new EmbedBuilder().setTitle('👤 Staff').setColor(bl ? '#FF5555' : '#5865F2')
    .setDescription(`<@${userId}>\n\`${userId}\``)
    .addFields(
      { name: '🛡️ Meds', value: `${meds.length}`, inline: true },
      { name: '🔎 Anas', value: `${anas.length}`, inline: true },
      { name: '🎥 Streams', value: `${strsCount}`, inline: true },
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
      // ✅ FIX: handler `dev_inspector_show:${guildId}` já existe em PARTE 9
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
// RATE LIMIT TRACKER — ✅ FIX: cap no buckets + auto-reset
// ═══════════════════════════════════════════════════════════
const rateLimitTracker = { total: 0, limited: 0, lastReset: Date.now(), buckets: {} };
if (client.rest) {
  client.rest.on('rateLimited', (info) => {
    rateLimitTracker.total++;
    rateLimitTracker.limited++;
    const key = info.route || 'unknown';
    rateLimitTracker.buckets[key] = (rateLimitTracker.buckets[key] || 0) + 1;

    // ✅ FIX: cap em 500 buckets (antes crescia infinito em produção)
    if (Object.keys(rateLimitTracker.buckets).length > 500) {
      // mantém só os 50 mais frequentes
      const entries = Object.entries(rateLimitTracker.buckets)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50);
      rateLimitTracker.buckets = Object.fromEntries(entries);
    }
  });
}

async function devPanelRateLimit() {
  const uptime = (Date.now() - rateLimitTracker.lastReset) / 60000;
  const topBuckets = Object.entries(rateLimitTracker.buckets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const e = new EmbedBuilder().setTitle('⚡ Rate Limit').setColor('#FFA500')
    .setDescription(`Janela: **${uptime.toFixed(1)}min**`)
    .addFields(
      { name: '📊', value: `\`${rateLimitTracker.total}\``, inline: true },
      { name: '🚫', value: `\`${rateLimitTracker.limited}\``, inline: true },
      { name: '📈', value: rateLimitTracker.total ? `\`${((rateLimitTracker.limited / rateLimitTracker.total) * 100).toFixed(2)}%\`` : '`0%`', inline: true },
    );

  // ✅ FIX: mostra os top 5 buckets mais afetados
  if (topBuckets.length) {
    e.addFields({
      name: '🔥 Top rotas',
      value: topBuckets.map(([k, v]) => `> \`${k.slice(0, 40)}\` → **${v}**`).join('\n'),
      inline: false,
    });
  }

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
    { label: 'Streamers (novo)', value: "const { data } = await supabase.from('streamers').select('user_id,status').limit(10); return data" },
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
// ✅ NOVO PAINEL — Streamers (substitui referência ao sistema antigo)
// ═══════════════════════════════════════════════════════════
async function devPanelFFStreamer(guildId) {
  const streamers = await getStreamers(guildId, false); // inclui inativos
  const online = streamers.filter(s => s.status === 'online');
  const offline = streamers.filter(s => s.status === 'offline');
  const panel = await getStreamerPanel(guildId);

  // Fila global
  let queueCount = 0;
  try {
    const { count } = await supabase.from('streamer_queue')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .in('status', ['waiting', 'in_thread']);
    queueCount = count || 0;
  } catch {}

  // Top 5 mais ativos (por panel_id ou por quantidade na fila)
  const top5 = streamers.slice(0, 5).map(s =>
    `• <@${s.user_id}> — \`#${s.panel_id}\` ${s.status === 'online' ? '🟢' : '⚪'}`
  ).join('\n') || '*nenhum*';

  const e = new EmbedBuilder()
    .setTitle('🎥 Sistema de Streamers')
    .setColor('#9146FF')
    .setDescription(
      `**Servidor:** ${client.guilds.cache.get(guildId)?.name || guildId}\n\n` +
      `> 🎙️ **Cadastrados:** ${streamers.length}/50\n` +
      `> 🟢 **Online agora:** ${online.length}\n` +
      `> ⚪ **Offline:** ${offline.length}\n` +
      `> ⏳ **Na fila:** ${queueCount}\n` +
      `> 📢 **Painel principal:** ${panel?.canal_id ? `<#${panel.canal_id}>` : '*não postado*'}`
    )
    .addFields(
      { name: '🎙️ Top 5 Streamers', value: top5.slice(0, 1024), inline: false },
    )
    .setFooter({ text: 'Frio Bot • Streamers (PARTE 12)' })
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        // ✅ FIX: botão direto pro gerenciamento (/config streamer)
        new ButtonBuilder().setCustomId('dev_ff_streamer_manage').setLabel('Gerenciar Streamers').setEmoji('⚙️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_ff_streamer_refresh').setLabel('Refresh painel').setEmoji('🔄').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_ff_streamer_post').setLabel('Postar painel').setEmoji('📢').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_ff_streamer_refresh_all').setLabel('Refresh todos').setEmoji('⚡').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_ff_streamer_clean').setLabel('Limpar filas').setEmoji('🧹').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 7/12 — v6.8.0
// ═══════════════════════════════════════════════════════════
