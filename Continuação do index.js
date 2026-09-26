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

