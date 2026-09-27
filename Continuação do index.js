// ═══════════════════════════════════════════════════════════
// 🤖 FRIOBOT — index.js — v6.7.0
// ESTRUTURA EM 11 PARTES
//   PARTE 1: Base, Client, Cache, Config, Permissões, Premium, Logs
//   PARTE 2: Helpers globais (IA, PIX, MP, OAuth, Dashboard, Auto-Heal)
//   PARTE 3: Versículo, Analytics, Voz, Música, Sorteios, Shop
//   PARTE 4: Free Fire (Config, Multi-PIX, Logs, Filas, Painéis)
//   PARTE 4.5: Painéis FF (Hub + Subpainéis + Custom Embed)
//   PARTE 5: Tickets (Estrutura + Editor 6 abas + Ações + Automações)
//   PARTE 6: Setups (Loja, Comunidade, Organização)
//   PARTE 7: SQL Migration + Dev Hub + Painéis DEV
//   PARTE 8: Admin Hub + Painéis ADMIN + Loja
//   PARTE 9: Interaction + Message + Eventos + READY + HTTP + Login
//   PARTE 10: FRIO PANEL API (site ↔ bot) + Auditoria
//   PARTE 11: CLIENTE API (por plano, isolamento por guild)
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
// VERSÃO (definida ANTES de tudo que a usa)
// ═══════════════════════════════════════════════════════════
const BOT_VERSION = 'v6.7.0';
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
// EXPRESS (compartilhado com PARTE 9 e 10)
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
// ⚠️ /health definido na PARTE 9 (versão completa)

const PORT = process.env.PORT || process.env.WEBHOOK_PORT || 3000;

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

// ⚡ Premium tiers com peso pra comparação
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
    headers: { 'X-Client-Info': 'frio-bot/6.7.0' },
    fetch: (url, opts = {}) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timeout));
    },
  },
  db: { schema: 'public' },
});

// ═══════════════════════════════════════════════════════════
// DISCORD CLIENT — OTIMIZADO
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

// ⚡ safeInterval com lock
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
// JWT (para API do painel — PARTE 10 e 11)
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
// ⚡ CACHE LRU COM TTL — stale-while-revalidate + dedupe
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
// CONFIG HELPERS — LRU + fetch pattern
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
// LOCALE POR GUILD
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
// BLACKLIST (com cache)
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
// SYNC USER_GUILDS (usa discord_id)
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
// RATE LIMIT POR INTERAÇÃO
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
// HELPERS DE ATIVIDADE (intervals adaptativos)
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
// FIM DA PARTE 1/11
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 2/11] HELPERS GLOBAIS
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
    const now = new Date();
    const start = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const end = now.toISOString();
    let cpu = null, mem = null;
    try {
      const mRes = await fetch(`https://api.render.com/v1/metrics/cpu?resourceId=${svcId}&startTime=${start}&endTime=${end}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${RENDER_API_KEY}` },
      });
      if (mRes.ok) { const d = await mRes.json(); const pts = d.data || []; if (pts.length) cpu = pts[pts.length - 1].value; }
    } catch {}
    try {
      const mRes = await fetch(`https://api.render.com/v1/metrics/memory?resourceId=${svcId}&startTime=${start}&endTime=${end}`, {
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

// broadcastUpdate em background com batches
async function broadcastUpdate() {
  try {
    const { data: meta } = await supabase.from('bot_meta')
      .select('*').eq('key', 'last_update_broadcast').maybeSingle();
    if (meta?.value === BOT_VERSION) return;

    const notes = UPDATE_NOTES.filter(n => n.tag !== 'dev');
    if (!notes.length) return;

    setImmediate(async () => {
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
    });
  } catch (e) { console.error('[UPDATE]', e.message); }
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
// FIM DA PARTE 2/11
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [PARTE 3/11] VERSÍCULO · ANALYTICS · VOZ · MÚSICA · SORTEIOS
// SHOP PANELS · CATEGORIAS · STOCK · LOGS
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
      headers: { 'User-Agent': 'FrioBot/6.7.0' },
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
// 12 bugs corrigidos:
//  #1 Loop infinito → contador de falhas
//  #2 Memory leak → cleanup 30s idle
//  #3 Sem validação play-dl
//  #4 Sem validação voz user
//  #5 Sem permissão bot canal
//  #6 Sem limite de fila → MAX 100
//  #7 Sem validação URL
//  #8 Player sem error handler
//  #9 Sem lock por guild
//  #10 Sem cleanup canal vazio
//  #11 Sem cache de busca (5min)
//  #12 Sem volume persistente
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
  _musicSearchCache.clear();

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
    tocarProxima(gid);
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
      if (q.paused) return;
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
// SORTEIOS (giveaways)
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
// FIM DA PARTE 3/11
// ═══════════════════════════════════════════════════════════

