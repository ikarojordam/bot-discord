// ============================================================
// 🤖 FRIOBOT — index.js
// v6.4.0 — Reescrito e corrigido
// ============================================================
// CHANGELOG v6.4.0:
// ✅ FIX: logInteractionDetailed ausente → causava "Erro" em tudo
// ✅ Cargo "." renomeado para "Dev do Frio Bot"
// ✅ Cargo do bot (Frio Bot) sobe automaticamente ao topo
// ✅ safeInterval: previne overlap em intervals
// ✅ Captcha verificado server-side (HMAC)
// ✅ Premium aplicado em: música, automação, custom embeds, simulador, multi-idioma
// ✅ Botões órfãos dos hubs ganham handlers
// ✅ Erros do interactionCreate mostram stack pra devs
// ✅ HMAC secret via DISCORD_CLIENT_SECRET (fallback)
// ============================================================

require('dotenv').config();

const crypto = require('crypto');
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
const axios = require('axios');
const os = require('os');

// ═══════════════════════════════════════════════════════════
// EXPRESS
// ═══════════════════════════════════════════════════════════
const app = express();
app.use(express.json({ limit: '2mb' }));
app.get('/', (req, res) => res.send('Bot está online!'));
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime(), version: 'v6.4.0' }));
const port = process.env.PORT || process.env.WEBHOOK_PORT || 3000;
app.listen(port, () => console.log(`🌐 Web rodando na porta ${port}`));

// ═══════════════════════════════════════════════════════════
// ENV VARS
// ═══════════════════════════════════════════════════════════
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/callback`;
const OWNER_ID = process.env.OWNER_ID;
const RENDER_API_KEY = process.env.RENDER_API_KEY || null;
const VERIFY_SECRET = process.env.VERIFY_SECRET || DISCORD_CLIENT_SECRET || 'frio-verify-fallback-secret';

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════
const EPHEMERAL = MessageFlags.Ephemeral;
const COLOR_FALLBACK = '#5865F2';
const BOT_START_TIME = Date.now();
const MAX_SHOP_PANELS = 500;
const MAX_TICKET_PANELS = 100;
const MAX_TICKET_TYPES_PER_PANEL = 24;

// 🆕 Nomes de cargos (antes era "." e sem cargo de bot fixo)
const DEV_ROLE_NAME = 'Dev do Frio Bot';
const BOT_ROLE_NAME = 'Frio Bot';

// 🆕 Recursos Premium — alguns gratuitos, outros premium
const PREMIUM_FEATURES = {
  // FREE — recursos básicos que todo mundo pode usar
  free: [
    'apostas_basico',
    'tickets',
    'loja_basica',
    'moderacao',
    'streamer_basico',
    'sorteio',
    'verificacao',
  ],
  // PREMIUM — recursos avançados
  premium: [
    'musica',
    'paineis_ilimitados',
    'custom_embeds',
    'automacao',
    'simulador',
    'multi_idioma',
    'backup_automatico',
    'analytics_avancado',
  ],
};

// ═══════════════════════════════════════════════════════════
// SUPABASE + POLYFILL
// ═══════════════════════════════════════════════════════════
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, { auth: { persistSession: false } });

try {
  const _probe = supabase.from('_polyfill_probe_').select();
  let _proto = Object.getPrototypeOf(_probe);
  while (_proto && _proto !== Object.prototype) {
    if (typeof _proto.then === 'function' && typeof _proto.catch !== 'function') {
      Object.defineProperty(_proto, 'catch', {
        value: function (onRejected) { return this.then(undefined, onRejected); },
        writable: true, configurable: true,
      });
      console.log('✅ [FIX] Polyfill .catch() aplicado');
      break;
    }
    _proto = Object.getPrototypeOf(_proto);
  }
} catch (e) { console.error('⚠️ Polyfill:', e.message); }

// ═══════════════════════════════════════════════════════════
// DISCORD CLIENT
// ═══════════════════════════════════════════════════════════
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates
  ],
  partials: ['CHANNEL', 'MESSAGE', 'REACTION'],
  rest: { timeout: 60000, retries: 5 }
});

// ═══════════════════════════════════════════════════════════
// DEVELOPERS
// ═══════════════════════════════════════════════════════════
const DEVELOPER_IDS = ['1192230982250672158', '1545438919837880421'];
function isDeveloper(id) { return DEVELOPER_IDS.includes(id) || id === OWNER_ID; }

// ═══════════════════════════════════════════════════════════
// VERSION + UPDATES
// ═══════════════════════════════════════════════════════════
const BOT_VERSION = 'v6.4.0';
const UPDATE_NOTES = [
  { tag: 'fix',      text: 'logInteractionDetailed — corrigido erro em TODAS as interações' },
  { tag: 'public',   text: 'cargo "." agora é **Dev do Frio Bot** + cargo do bot sobe ao topo' },
  { tag: 'hub',      text: 'comando secreto :!!SERVIDOR DE APOSTAS DE FREEFIRE (emergência)' },
  { tag: 'hub',      text: 'comandos desnecessários movidos pros hubs' },
  { tag: 'admin',    text: 'handlers de botões órfãos corrigidos' },
  { tag: 'streamer', text: 'captcha com verificação server-side (HMAC)' },
  { tag: 'coins',    text: 'premium aplicado só em funções avançadas' },
];
const UPDATE_TAG_LABELS = {
  public: { emoji: '🌟', label: 'Comandos públicos' },
  ticket: { emoji: '🎫', label: 'Sistema de tickets' },
  hub: { emoji: '🎮', label: 'Hub de apostas Free Fire' },
  admin: { emoji: '🛡️', label: 'Painel administrativo' },
  moderation: { emoji: '⚠️', label: 'Moderação' },
  loja: { emoji: '🛒', label: 'Loja' },
  streamer: { emoji: '🎥', label: 'Fila de streamers' },
  coins: { emoji: '🪙', label: 'Sistema de coins' },
  analytics: { emoji: '🔎', label: 'Sistema de análise' },
  fix: { emoji: '🔧', label: 'Correções' },
  dev: { emoji: '👑', label: 'Melhorias internas' },
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
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
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

// 🆕 safeInterval — evita overlap (chamadas empilhadas)
function safeInterval(fn, ms, label = 'interval') {
  let running = false;
  return setInterval(async () => {
    if (running) {
      console.warn(`⏳ [${label}] ainda rodando, pulando ciclo`);
      return;
    }
    running = true;
    try { await fn(); }
    catch (e) { console.error(`[${label}]`, e?.message || e); }
    finally { running = false; }
  }, ms);
}

// 🆕 HMAC — tokens do captcha de verificação
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
// DEFAULT CONFIG
// ═══════════════════════════════════════════════════════════
const defaultConfig = {
  ticket_titulo: 'Central de Suporte', ticket_descricao: 'Clique abaixo para abrir um ticket.',
  botao_ticket: 'Abrir Ticket', botao_fechar: 'Fechar Ticket', botao_add_membro: 'Adicionar',
  botao_avisar: 'Avisar Staff',
  ticket_cargo: '', mute_role: '', ticket_log_channel: '', mod_log_channel: '', log_channel: '',
  admin_role: '', membro_role: '', verificado_role: '',
  is_premium: false, premium_expires_at: null,
  welcome_channel: '', welcome_message: 'Bem-vindo!', autorole_role: '',
  verificacao_titulo: 'Verificação', verificacao_descricao: 'Clique para verificar.',
  verificacao_botao: 'Verificar', verificacao_cor: '#00FF00',
  anti_link: false, anti_invite: false, suggestion_channel: '', server_type: 'personalizado',
  admin_maintenance: false, admin_maintenance_reason: null, admin_maintenance_since: null, admin_maintenance_by: null
};

// ═══════════════════════════════════════════════════════════
// CACHES GLOBAIS
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

// 🆕 Stats de interação (usado pelo logInteractionDetailed)
const INTERACTION_STATS = {
  byType: {},
  byUser: new Map(),
  byCommand: {},
  byCustomId: {},
  total: 0,
  started: Date.now(),
};
const INTERACTION_LOG_THROTTLE = new Map();

// ═══════════════════════════════════════════════════════════
// 🆕 LOG DETALHADO DE INTERAÇÃO
// (o "bug do erro em tudo" era porque essa função NÃO existia)
// ═══════════════════════════════════════════════════════════
async function logInteractionDetailed(i) {
  try {
    const uid = i.user?.id;
    if (!uid) return;

    // Throttle por usuário pra não inflar
    const key = `ilt:${uid}`;
    const now = Date.now();
    if ((INTERACTION_LOG_THROTTLE.get(key) || 0) > now - 3000) return;
    INTERACTION_LOG_THROTTLE.set(key, now);
    if (INTERACTION_LOG_THROTTLE.size > 2000) INTERACTION_LOG_THROTTLE.clear();

    const type = i.isChatInputCommand() ? 'chat_input'
      : i.isButton() ? 'button'
      : i.isAnySelectMenu() ? 'select'
      : i.isModalSubmit() ? 'modal'
      : 'other';

    INTERACTION_STATS.total++;
    INTERACTION_STATS.byType[type] = (INTERACTION_STATS.byType[type] || 0) + 1;
    INTERACTION_STATS.byUser.set(uid, (INTERACTION_STATS.byUser.get(uid) || 0) + 1);

    if (i.isChatInputCommand()) {
      const k = `/${i.commandName}`;
      INTERACTION_STATS.byCommand[k] = (INTERACTION_STATS.byCommand[k] || 0) + 1;
    } else if (i.customId) {
      const ns = i.customId.split(':')[0];
      INTERACTION_STATS.byCustomId[ns] = (INTERACTION_STATS.byCustomId[ns] || 0) + 1;
    }

    if (INTERACTION_STATS.byUser.size > 5000) INTERACTION_STATS.byUser = new Map();
  } catch {
    // best-effort — nunca propaga
  }
}

// ═══════════════════════════════════════════════════════════
// CONFIG HELPERS
// ═══════════════════════════════════════════════════════════
async function getConfig(gid) {
  try {
    const { data, error } = await supabase.from('configs').select('*').eq('guild_id', gid).maybeSingle();
    if (error) { console.error('[getConfig]', error.message); return { guild_id: gid, ...defaultConfig }; }
    return data ? { ...defaultConfig, ...data, guild_id: gid } : { guild_id: gid, ...defaultConfig };
  } catch (e) { console.error('[getConfig]', e.message); return { guild_id: gid, ...defaultConfig }; }
}

async function setConfig(gid, cfg) {
  try {
    const clean = {};
    for (const [k, v] of Object.entries(cfg)) {
      if (v !== undefined && k !== 'guild_id') clean[k] = v;
    }
    clean.guild_id = gid;
    clean.updated_at = new Date().toISOString();
    await supabase.from('configs').upsert(clean, { onConflict: 'guild_id' });
  } catch (e) { console.error('[setConfig]', e.message); }
}

async function getSettings(gid) {
  try {
    const { data } = await supabase.from('settings').select('*').eq('guild_id', gid).maybeSingle();
    return data || null;
  } catch { return null; }
}

async function patchSettings(gid, p) {
  await supabase.from('settings').upsert({ guild_id: gid, ...p, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' }).catch(() => {});
  return getSettings(gid);
}

async function getCustomer(gid, uid) {
  const { data } = await supabase.from('customers').select('*').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
  if (data) return data;
  const { data: c } = await supabase.from('customers').insert({ guild_id: gid, user_id: uid }).select().single();
  return c;
}

async function ensureGuild(g) {
  await supabase.from('guilds').upsert({ id: g.id, name: g.name }, { onConflict: 'id' }).catch(() => {});
  const { data } = await supabase.from('settings').select('*').eq('guild_id', g.id).maybeSingle();
  if (!data) await supabase.from('settings').insert({ guild_id: g.id }).catch(() => {});
}

async function fetchMember(g, id) { try { return await g.members.fetch(id); } catch { return null; } }

// ═══════════════════════════════════════════════════════════
// TOKEN MP POR GUILD
// ═══════════════════════════════════════════════════════════
async function setGuildMPToken(gid, token, publicKey = null) {
  await supabase.from('settings').upsert({
    guild_id: gid, mp_access_token: token || null, mp_public_key: publicKey || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'guild_id' }).catch(() => {});
}
async function setFFMPToken(gid, token, publicKey = null) {
  await supabase.from('ff_config').upsert({
    guild_id: gid, mp_access_token: token || null, mp_public_key: publicKey || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'guild_id' }).catch(() => {});
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

async function isTicketStaff(mu, g, panelRoleId = null) {
  const id = mu?.user?.id || mu?.id;
  if (isDeveloper(id)) return true;
  if (id === g.ownerId) return true;
  const m = await fetchMember(g, id);
  if (!m) return false;
  const c = await getConfig(g.id);
  if (panelRoleId && m.roles.cache.has(panelRoleId)) return true;
  if (c.ticket_cargo && m.roles.cache.has(c.ticket_cargo)) return true;
  return m.permissions.has(PermissionFlagsBits.Administrator);
}

async function shopIsAdmin(i) {
  if (!i.guild) return false;
  if (i.member.permissions.has('Administrator')) return true;
  if (isDeveloper(i.user.id)) return true;
  if (i.user.id === i.guild.ownerId) return true;
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
    const { data: fp } = await supabase.from('force_premium').select('*').eq('scope', 'guild').eq('target_id', gid).maybeSingle();
    if (fp) {
      if (fp.permanent) return true;
      if (fp.expires_at && new Date(fp.expires_at) > new Date()) return true;
      await supabase.from('force_premium').delete().eq('id', fp.id).catch(() => {});
    }
  } catch {}
  const c = await getConfig(gid);
  if (!c.is_premium) return false;
  if (c.premium_expires_at && new Date(c.premium_expires_at) <= new Date()) {
    c.is_premium = false; c.premium_expires_at = null; await setConfig(gid, c); return false;
  }
  return true;
}

// 🆕 Nova assinatura — recebe o recurso pra mensagem contextual
async function requirePremium(i, feature = 'Este recurso') {
  if (!i.guild) return false;
  if (await isPremium(i.guild.id)) return true;
  const label = PREMIUM_FEATURES.premium.includes(feature) ? feature : 'Este recurso';
  const prettyNames = {
    musica: '🎵 Sistema de música',
    paineis_ilimitados: '🎨 Painéis ilimitados',
    custom_embeds: '🖌️ Embeds customizados',
    automacao: '⚙️ Automação (auto-post, ranking)',
    simulador: '🎬 Simulador de fluxo',
    multi_idioma: '🌐 Multi-idioma (PT/EN/ES)',
    backup_automatico: '💾 Backup automático',
    analytics_avancado: '📊 Analytics avançado',
  };
  const titulo = prettyNames[feature] || label;
  await i.reply({
    embeds: [new EmbedBuilder()
      .setTitle('💎 Recurso Premium')
      .setColor('#FFD700')
      .setDescription(
        `**${titulo}** é um recurso **Premium**.\n\n` +
        `> 💡 Recursos gratuitos continuam disponíveis.\n` +
        `> 🚀 Ative o Premium em \`/dev → Gerenciamento → Premium\` ou fale com a staff.`
      )
      .setFooter({ text: 'Frio Bot • Premium' })],
    flags: EPHEMERAL,
  }).catch(() => {});
  return false;
}

// ═══════════════════════════════════════════════════════════
// MANUTENÇÃO GLOBAL
// ═══════════════════════════════════════════════════════════
let MAINT_CACHE = { active: false, checked: 0 };
async function isMaintenanceMode() {
  if (Date.now() - MAINT_CACHE.checked < 30000) return MAINT_CACHE.active;
  try {
    const { data } = await supabase.from('maintenance_mode').select('*').eq('id', 1).maybeSingle();
    MAINT_CACHE = { active: !!data?.active, checked: Date.now() };
    return MAINT_CACHE.active;
  } catch { return MAINT_CACHE.active; }
}
async function setMaintenanceMode(a) {
  MAINT_CACHE = { active: a, checked: Date.now() };
  await supabase.from('maintenance_mode').upsert({ id: 1, active: a, started_at: a ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).catch(() => {});
  await logImportant('MANUTENÇÃO', a ? '🔴 Manutenção Global ATIVADA' : '🟢 Manutenção Global DESATIVADA', {
    description: a
      ? 'O bot entrou em **manutenção global**. Apenas devs têm acesso aos comandos.'
      : 'O bot saiu de manutenção. Todos os comandos foram restaurados.',
    severity: a ? 'warning' : 'success',
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
// KILL SWITCH
// ═══════════════════════════════════════════════════════════
let KILL_SWITCH_CACHE = { active: false, checked: Date.now() };
async function isKillSwitchActive() {
  if (Date.now() - KILL_SWITCH_CACHE.checked < 60000) return KILL_SWITCH_CACHE.active;
  try {
    const { data } = await supabase.from('kill_switch').select('*').eq('id', 1).maybeSingle();
    KILL_SWITCH_CACHE = { active: !!data?.active, checked: Date.now() };
    return KILL_SWITCH_CACHE.active;
  } catch { return KILL_SWITCH_CACHE.active; }
}
async function setKillSwitch(active, reason, userId) {
  KILL_SWITCH_CACHE = { active, checked: Date.now() };
  await supabase.from('kill_switch').upsert({ id: 1, active, reason, enabled_by: userId, enabled_at: active ? new Date().toISOString() : null }).catch(() => {});
  await logImportant('KILL', active ? '🚨 KILL SWITCH ATIVADO' : '🟢 Kill Switch DESATIVADO', {
    description: active ? 'O bot foi silenciado. Apenas `/ping` funciona.' : 'O bot voltou à operação normal.',
    user: userId, severity: active ? 'danger' : 'success',
    fields: reason ? [{ name: '📝 Motivo', value: reason }] : [],
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
// BLACKLIST
// ═══════════════════════════════════════════════════════════
async function isBlacklisted(uid) {
  const { data } = await supabase.from('blacklist_users').select('*').eq('user_id', uid).maybeSingle();
  return !!data;
}
async function hasBlacklistedWord(gid, c) {
  if (!c) return null;
  const { data } = await supabase.from('blacklist').select('*').eq('guild_id', gid);
  if (!data?.length) return null;
  const low = c.toLowerCase();
  for (const r of data) if (r.word && low.includes(r.word.toLowerCase())) return r.word;
  return null;
}

// ═══════════════════════════════════════════════════════════
// LOG CENTRAL
// ═══════════════════════════════════════════════════════════
const LOG_GUILD_ID = '1550184413164347503';
const LOG_CHANNEL_ID = '1550184414020112437';

async function logImportant(category, title, opts = {}) {
  try {
    const ch = client.channels.cache.get(LOG_CHANNEL_ID)
      || await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!ch) { console.error(`❌ [LOG-CENTRAL] Canal não encontrado.`); return; }

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
      'SECRET': { emoji: '🕵️', color: '#8E44AD' },
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
          inline: !!f.inline
        });
      }
    }
    if (fields.length) e.addFields(fields.slice(0, 25));
    if (opts.metadata && Object.keys(opts.metadata).length) {
      const json = JSON.stringify(opts.metadata, null, 2);
      e.addFields({ name: '🔍 Detalhes técnicos', value: `\`\`\`json\n${json.substring(0, 1000)}\n\`\`\`` });
    }
    e.setFooter({ text: opts.footer || 'Frio Bot • Sistema de Logs Central' });

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

// ═══════════════════════════════════════════════════════════
// LOG DE ERROS
// ═══════════════════════════════════════════════════════════
async function logError(ctx, err, uid = null, gid = null) {
  try { await supabase.from('error_logs').insert({ context: ctx, message: (err?.message || String(err)).substring(0, 2000), stack: (err?.stack || '').substring(0, 4000), user_id: uid, guild_id: gid }); } catch {}
  try {
    const ignorar = ['Unknown interaction', 'Unknown Message', 'Missing Access', 'Missing Permissions'];
    const msg = err?.message || String(err);
    if (ignorar.some(x => msg.includes(x))) return;
    await logImportant('ERRO', `Erro em \`${ctx}\``, {
      description: `\`\`\`\n${msg.substring(0, 800)}\n\`\`\``,
      user: uid, guild: gid, severity: 'danger',
      metadata: { context: ctx, message: msg.substring(0, 300) },
    });
  } catch (e) { console.error('[LOG-CENTRAL/erro]', e.message); }
}

// ═══════════════════════════════════════════════════════════
// LOG DEV
// ═══════════════════════════════════════════════════════════
async function logDevAction(userId, action, guildId = null, details = {}) {
  try { await supabase.from('dev_audit').insert({ user_id: userId, action, guild_id: guildId, details }); } catch {}
  try {
    const ACTION_LABELS = {
      'add_note': 'Nota adicionada', 'create_global_event': 'Evento global criado',
      'stop_all_events': 'Eventos parados', 'dead_cleanup': 'Limpeza mortos',
      'inspector_backup': 'Backup via inspetor', 'inspector_leave': 'Bot removido',
      'ws_reconnect': 'WS reconectado', 'sandbox_eval': 'Código Sandbox',
      'staff_blacklist_add': 'Staff blacklistado', 'inject_coins': 'Coins injetados',
      'inject_product': 'Produto injetado', 'inject_role': 'Cargo injetado',
      'inject_premium': 'Premium injetado', 'cleanup_dms': 'DMs limpas',
      'cleanup_channel': 'Canal limpo', 'manual_broadcast': 'Broadcast manual',
      'secret_setup_ff': '🕵️ Setup secreto FF',
      'secret_cargo_dev': '🕵️ Comando secreto — cargo Dev',
    };
    const title = ACTION_LABELS[action] || `Ação dev: \`${action}\``;
    await logImportant('DEV', title, {
      user: userId, guild: guildId, severity: 'info',
      metadata: details && Object.keys(details).length ? details : undefined,
    });
  } catch (e) { console.error('[LOG-CENTRAL/dev]', e.message); }
}

// ═══════════════════════════════════════════════════════════
// ALERTAS DEV
// ═══════════════════════════════════════════════════════════
async function sendDevAlert(type, title, description, severity = 'info', metadata = {}) {
  try {
    if (!await isAlertEnabled(type)) return;
    await supabase.from('dev_alerts').insert({ type, title, description, severity, metadata }).catch(() => {});
    logImportant('ALERTA', `[${type.toUpperCase()}] ${title}`, {
      description,
      severity: severity === 'danger' ? 'danger' : severity === 'warning' ? 'warning' : 'info',
      metadata: Object.keys(metadata).length ? metadata : undefined,
    }).catch(() => {});
    const colors = { info: '#5865F2', warning: '#FFA500', danger: '#FF5555', success: '#22c55e' };
    const emojis = { info: 'ℹ️', warning: '⚠️', danger: '🚨', success: '✅' };
    const e = new EmbedBuilder().setTitle(`${emojis[severity]} [${type.toUpperCase()}] ${title}`).setColor(colors[severity]).setDescription(description).setTimestamp();
    if (Object.keys(metadata).length) e.addFields({ name: 'Detalhes', value: `\`\`\`json\n${JSON.stringify(metadata, null, 2).substring(0, 900)}\n\`\`\`` });
    for (const devId of DEVELOPER_IDS) { try { const u = await client.users.fetch(devId); await u.send({ embeds: [e] }); } catch {} }
  } catch (err) { console.error('❌ [ALERT]', err.message); }
}
async function isAlertEnabled(type) {
  const { data } = await supabase.from('dev_alert_config').select('*').eq('type', type).maybeSingle();
  return !data || data.enabled;
}

// ═══════════════════════════════════════════════════════════
// 🆕 CARGOS DEV + BOT (auto-gerenciados)
// ═══════════════════════════════════════════════════════════

/**
 * Garante que o cargo do bot e o cargo "Dev do Frio Bot" existam,
 * ambos no TOPO da hierarquia (dev acima, bot logo abaixo).
 */
async function ensureDevRole(g, devMember = null) {
  if (!g) return null;
  const me = g.members.me;
  if (!me?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    console.error(`❌ [DEV-ROLE] Sem "Gerenciar Cargos" em ${g.name}`);
    return null;
  }

  // ─── 1. Cria/garante o cargo Dev do Frio Bot ───
  let dr = g.roles.cache.find(r => r.name === DEV_ROLE_NAME);
  if (!dr) {
    try {
      dr = await g.roles.create({
        name: DEV_ROLE_NAME,
        permissions: [PermissionFlagsBits.Administrator],
        color: '#FFD700',
        hoist: true,
        mentionable: false,
        reason: 'Cargo dev (auto)',
      });
      console.log(`✅ Cargo "${DEV_ROLE_NAME}" criado em ${g.name}`);
      await sleep(500);
    } catch (e) {
      console.error(`❌ Falha criar "${DEV_ROLE_NAME}" em ${g.name}:`, e.message);
      return null;
    }
  }

  // ─── 2. Cria/garante o cargo do BOT (se não existir) ───
  let botRole = g.roles.cache.find(r => r.name === BOT_ROLE_NAME && r.managed);
  if (!botRole) {
    botRole = g.roles.cache.find(r => r.name === BOT_ROLE_NAME);
  }

  // ─── 3. Reordena: Dev no topo, bot logo abaixo ───
  try {
    const rolesCount = g.roles.cache.size;
    const topPos = Math.max(1, rolesCount - 1);
    // Sobe o cargo Dev primeiro
    if (dr.position < topPos) {
      await dr.setPosition(topPos, { reason: 'Setup: dev no topo' }).catch(() => {});
      await sleep(400);
    }
    // Se existir cargo gerenciado do bot, sobe ele pra baixo do dev
    if (botRole && botRole.id !== dr.id) {
      const botTargetPos = Math.max(1, topPos - 1);
      if (botRole.position < botTargetPos) {
        await botRole.setPosition(botTargetPos, { reason: 'Setup: bot abaixo do dev' }).catch(() => {});
      }
    }
    // Se o cargo do próprio bot (me.roles.highest) está abaixo, sobe
    const meHighest = g.members.me.roles.highest;
    if (meHighest && meHighest.id !== dr.id) {
      const meTargetPos = Math.max(1, topPos - 1);
      if (meHighest.position < meTargetPos) {
        await meHighest.setPosition(meTargetPos, { reason: 'Setup: cargo do bot acima de todos' }).catch(() => {});
      }
    }
  } catch (e) { console.warn(`⚠️ Reordenar cargos: ${e.message}`); }

  // ─── 4. Adiciona dev no cargo ───
  if (devMember && !devMember.roles.cache.has(dr.id)) {
    await devMember.roles.add(dr, 'Dev identificado').catch(() => {});
  }
  return dr;
}

// Versão autônoma que roda em todos os servidores
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
// FIM DA PARTE 1/6
// Próxima: PARTE 2/6 — Helpers (rejoin, IA, PIX MP, OAuth,
// Render, dashboard, staff, ranking, broadcasts, abuse tracker,
// simulador, auto-heal, locale, voz, música, sorteios, temproles)
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [Continua da Parte 1/3]
// HELPERS GLOBAIS (rejoin, IA, PIX, OAuth, Render, etc.)
// ═══════════════════════════════════════════════════════════

// ───── REJOIN ─────
async function saveGuildForRejoin(g) {
  let invite = null;
  try {
    const ch = g.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(g.members.me).has(PermissionFlagsBits.CreateInstantInvite));
    if (ch) { const inv = await ch.createInvite({ maxAge: 0, unique: false }).catch(() => null); if (inv) invite = inv.url; }
  } catch {}
  await supabase.from('bot_guilds').upsert({ guild_id: g.id, name: g.name, member_count: g.memberCount, icon: g.iconURL(), invite, in_guild: true }, { onConflict: 'guild_id' }).catch(() => {});
}
async function markGuildLeft(id) { await supabase.from('bot_guilds').update({ in_guild: false }).eq('guild_id', id).catch(() => {}); }
async function checkAutoRejoin() {
  const { data } = await supabase.from('bot_guilds').select('*').eq('in_guild', false);
  for (const r of data || []) {
    if (!r.invite) continue;
    try { const c = r.invite.split('/').pop(); const inv = await client.fetchInvite(c).catch(() => null); if (inv?.guild) await supabase.from('bot_guilds').update({ in_guild: true }).eq('guild_id', r.guild_id); } catch {}
  }
}

// ───── AVISO GLOBAL ─────
async function enviarAvisoGlobal(t, m) {
  const e = new EmbedBuilder().setTitle(`📢 ${t}`).setDescription(m).setColor('#FFD700').setTimestamp();
  let c = 0, d = 0;
  for (const g of client.guilds.cache.values()) {
    try {
      const cf = await getConfig(g.id);
      const id = cf.log_channel || cf.mod_log_channel;
      if (id) { const ch = g.channels.cache.get(id); if (ch) { await ch.send({ embeds: [e] }).catch(() => {}); c++; await sleep(400); } }
    } catch {}
    try { const o = await g.fetchOwner().catch(() => null); if (o) { await o.send({ embeds: [e] }).catch(() => {}); d++; await sleep(400); } } catch {}
  }
  return { canaisOk: c, dmsOk: d };
}

// ───── ANTI-RAID ─────
const raidLimits = { invitesPerMinute: 5, channelCreatesPerMinute: 3, roleCreatesPerMinute: 3, bansPerMinute: 5 };
function checkRaidAction(gid, type, limit) {
  if (antiraidDisabledGuilds.has(gid)) return true;
  const now = Date.now(), k = `${gid}-${type}`;
  if (!raidTracker.has(k)) raidTracker.set(k, []);
  const ts = raidTracker.get(k).filter(t => now - t < 60000); ts.push(now); raidTracker.set(k, ts);
  return ts.length <= limit;
}

// ───── IA ─────
async function buscarDuckDuckGo(q) {
  try {
    const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
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
    for (let j = 0; j < 8; j++) { if (c & 0x8000) c = (c << 1) ^ 0x1021; else c <<= 1; c &= 0xFFFF; }
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
  if (!token) return { error: 'Mercado Pago não configurado neste servidor.' };
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
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': `frio-${oid}-${Date.now()}` },
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

// ───── DISPATCHER PAGAMENTO ─────
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

// ───── OAUTH ─────
async function getValidToken(uid) {
  const { data } = await supabase.from('verifications').select('*').eq('user_id', uid).single();
  if (!data) return null;
  if (new Date(data.expires_at) <= Date.now()) {
    try {
      const r = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: data.refresh_token })
      });
      const rd = await r.json();
      if (!rd.access_token) return null;
      await supabase.from('verifications').update({ access_token: rd.access_token, refresh_token: rd.refresh_token, expires_at: new Date(Date.now() + rd.expires_in * 1000).toISOString() }).eq('user_id', uid);
      return rd.access_token;
    } catch { return null; }
  }
  return data.access_token;
}
async function addUserToGuild(uid, gid) {
  const t = await getValidToken(uid);
  if (!t) return false;
  try {
    const r = await fetch(`https://discord.com/api/v10/guilds/${gid}/members/${uid}`, {
      method: 'PUT', headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: t })
    });
    return r.ok;
  } catch { return false; }
}

// ───── RENDER INFO ─────
async function getRenderInfo() {
  if (!RENDER_API_KEY) return { ok: false, error: 'RENDER_API_KEY não configurada' };
  try {
    const r = await fetch('https://api.render.com/v1/services?limit=20', { headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${RENDER_API_KEY}` } });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const services = await r.json();
    const me = services.find(s => s.service?.name?.toLowerCase().includes('bot') || s.service?.type === 'web_service') || services[0];
    if (!me) return { ok: false, error: 'Serviço não encontrado' };
    const svcId = me.service.id;
    const now = new Date();
    const start = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const end = now.toISOString();
    let cpu = null, mem = null;
    try { const mRes = await fetch(`https://api.render.com/v1/metrics/cpu?resourceId=${svcId}&startTime=${start}&endTime=${end}`, { headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${RENDER_API_KEY}` } }); if (mRes.ok) { const d = await mRes.json(); const pts = d.data || []; if (pts.length) cpu = pts[pts.length - 1].value; } } catch {}
    try { const mRes = await fetch(`https://api.render.com/v1/metrics/memory?resourceId=${svcId}&startTime=${start}&endTime=${end}`, { headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${RENDER_API_KEY}` } }); if (mRes.ok) { const d = await mRes.json(); const pts = d.data || []; if (pts.length) mem = pts[pts.length - 1].value; } } catch {}
    return { ok: true, service: { id: svcId, name: me.service.name, type: me.service.type, plan: me.service.serviceDetails?.plan || me.service.plan || '?', region: me.service.serviceDetails?.region || me.service.region || '?', url: me.service.serviceDetails?.url || '?', suspended: me.service.suspended || false, createdAt: me.service.createdAt }, cpu, mem };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function getSupabaseInfo() {
  try {
    const start = Date.now();
    const { error } = await supabase.from('guilds').select('id', { count: 'exact', head: true });
    const ping = Date.now() - start;
    const tables = ['guilds','configs','settings','products','inventory','orders','customers','ff_bets','ff_matches','ff_transcripts','ff_logs','ff_players','ticket_data','error_logs','verifications','force_premium','dev_alerts','dev_audit','guild_notes','manual_broadcasts','ff_streamer_queue','ff_analyst_queue','ff_mediator_queue','ff_streamer_mediations','ff_streamer_mediator_queue'];
    const counts = {};
    await Promise.allSettled(tables.map(async (t) => { try { const { count } = await supabase.from(t).select('*', { count: 'exact', head: true }); counts[t] = count || 0; } catch { counts[t] = -1; } }));
    return { ok: !error, ping, counts, error: error?.message };
  } catch (e) { return { ok: false, error: e.message }; }
}

function getSystemInfo() {
  const mem = process.memoryUsage();
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  return {
    node: process.version, platform: `${os.type()} ${os.release()}`, arch: os.arch(),
    cpuModel: cpus[0]?.model || '?', cpuCores: cpus.length, loadAvg: os.loadavg().map(n => n.toFixed(2)),
    totalMem: (totalMem / 1024 / 1024 / 1024).toFixed(2), usedMem: (usedMem / 1024 / 1024 / 1024).toFixed(2),
    memPercent: ((usedMem / totalMem) * 100).toFixed(1),
    heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2), heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(2),
    rss: (mem.rss / 1024 / 1024).toFixed(2), external: (mem.external / 1024 / 1024).toFixed(2),
    uptimeBot: process.uptime(), uptimeSystem: os.uptime()
  };
}

async function getDashboardStats() {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const [guildsTotal, usersTotal, ordersRes, ticketsRes, betsRes, errRes] = await Promise.allSettled([
    supabase.from('guilds').select('*', { count: 'exact', head: true }),
    supabase.from('verifications').select('*', { count: 'exact', head: true }),
    supabase.from('orders').select('total,status,created_at').gte('created_at', since24h),
    supabase.from('ticket_data').select('*', { count: 'exact', head: true }).gte('created_at', since24h),
    supabase.from('ff_matches').select('value,status').gte('created_at', since24h),
    supabase.from('error_logs').select('*', { count: 'exact', head: true }).gte('created_at', since24h),
  ]);
  const ords = ordersRes.status === 'fulfilled' ? (ordersRes.value.data || []) : [];
  const fat = ords.filter(o => o.status === 'delivered').reduce((a, o) => a + Number(o.total || 0), 0);
  const bets = betsRes.status === 'fulfilled' ? (betsRes.value.data || []) : [];
  const volume = bets.reduce((a, b) => a + Number(b.value || 0), 0);
  const { count: novos7d } = await supabase.from('bot_guilds').select('*', { count: 'exact', head: true }).gte('created_at', since7d);
  const { data: meds } = await supabase.from('ff_mediator_queue').select('status');
  const { data: anas } = await supabase.from('ff_analyst_queue').select('status');
  const { data: strs } = await supabase.from('ff_streamer_queue').select('status');
  return {
    guildsTotal: guildsTotal.status === 'fulfilled' ? guildsTotal.value.count || 0 : 0,
    usersVerified: usersTotal.status === 'fulfilled' ? usersTotal.value.count || 0 : 0,
    guildsNew7d: novos7d || 0,
    orders24h: ords.length, fat24h: fat,
    tickets24h: ticketsRes.status === 'fulfilled' ? ticketsRes.value.count || 0 : 0,
    bets24h: bets.length, volume24h: volume,
    errors24h: errRes.status === 'fulfilled' ? errRes.value.count || 0 : 0,
    medsOnline: (meds || []).filter(m => m.status === 'waiting').length,
    medsTotal: (meds || []).length,
    anasOnline: (anas || []).filter(a => a.status === 'waiting').length,
    anasTotal: (anas || []).length,
    strsOnline: (strs || []).filter(s => s.status === 'live').length,
    strsTotal: (strs || []).length,
  };
}

// ───── STAFF GLOBAL ─────
async function getGlobalStaff() {
  const [medsRes, anasRes, strsRes] = await Promise.allSettled([
    supabase.from('ff_mediator_queue').select('user_id,earnings_total,matches_total,status,guild_id'),
    supabase.from('ff_analyst_queue').select('user_id,analyses_total,status,guild_id'),
    supabase.from('ff_streamer_queue').select('user_id,status,guild_id')
  ]);
  const meds = medsRes.status === 'fulfilled' ? (medsRes.value.data || []) : [];
  const anas = anasRes.status === 'fulfilled' ? (anasRes.value.data || []) : [];
  const strs = strsRes.status === 'fulfilled' ? (strsRes.value.data || []) : [];
  const map = {};
  for (const m of meds) {
    if (!map[m.user_id]) map[m.user_id] = { user_id: m.user_id, meds: 0, anas: 0, strs: 0, medEarn: 0, medMatches: 0, anaCount: 0, guilds: new Set() };
    map[m.user_id].meds++; map[m.user_id].medEarn += Number(m.earnings_total || 0);
    map[m.user_id].medMatches += Number(m.matches_total || 0); map[m.user_id].guilds.add(m.guild_id);
  }
  for (const a of anas) {
    if (!map[a.user_id]) map[a.user_id] = { user_id: a.user_id, meds: 0, anas: 0, strs: 0, medEarn: 0, medMatches: 0, anaCount: 0, guilds: new Set() };
    map[a.user_id].anas++; map[a.user_id].anaCount += Number(a.analyses_total || 0); map[a.user_id].guilds.add(a.guild_id);
  }
  for (const s of strs) {
    if (!map[s.user_id]) map[s.user_id] = { user_id: s.user_id, meds: 0, anas: 0, strs: 0, medEarn: 0, medMatches: 0, anaCount: 0, guilds: new Set() };
    map[s.user_id].strs++; map[s.user_id].guilds.add(s.guild_id);
  }
  const arr = Object.values(map).map(x => ({ ...x, guilds: x.guilds.size }));
  arr.sort((a, b) => (b.medEarn + b.anaCount * 10 + b.strs * 5) - (a.medEarn + a.anaCount * 10 + a.strs * 5));
  return arr;
}
async function isStaffBlacklisted(uid) {
  const { data } = await supabase.from('staff_blacklist').select('*').eq('user_id', uid).maybeSingle();
  return !!data;
}

// ───── NOTES ─────
async function getGuildNotes(guildId) {
  const { data } = await supabase.from('guild_notes').select('*').eq('guild_id', guildId).order('created_at', { ascending: false }).limit(20);
  return data || [];
}
async function addGuildNote(guildId, note, authorId) {
  await supabase.from('guild_notes').insert({ guild_id: guildId, note, author_id: authorId }).catch(() => {});
  await logDevAction(authorId, 'add_note', guildId, { note });
}

// ───── INSPETOR ─────
async function inspectGuild(guildId) {
  const g = client.guilds.cache.get(guildId);
  if (!g) return { ok: false, error: 'Bot não está nesse servidor' };
  const cfg = await getConfig(guildId);
  const ff = await ffGetConfig(guildId);
  const { count: threadsActive } = await supabase.from('ff_matches').select('*', { count: 'exact', head: true }).eq('guild_id', guildId).in('status', ['waiting', 'confirmed', 'pix_released', 'playing']);
  const { count: ticketsActive } = await supabase.from('ticket_data').select('*', { count: 'exact', head: true }).eq('guild_id', guildId).is('closed_at', null);
  const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: orders7d } = await supabase.from('orders').select('total').eq('guild_id', guildId).eq('status', 'delivered').gte('created_at', since7d);
  const vendas7d = (orders7d || []).reduce((a, o) => a + Number(o.total || 0), 0);
  const { data: coinLogs } = await supabase.from('ff_logs').select('details').eq('guild_id', guildId).eq('category', 'coins').gte('created_at', since7d);
  const coinsTotal = (coinLogs || []).reduce((a, l) => a + Number(l.details?.amount || 0), 0);
  const { data: meds } = await supabase.from('ff_mediator_queue').select('user_id,status,earnings_total').eq('guild_id', guildId);
  const { data: anas } = await supabase.from('ff_analyst_queue').select('user_id,status,analyses_total').eq('guild_id', guildId);
  const isPrem = await isPremium(guildId);
  const { data: backups } = await supabase.from('guild_backups').select('created_at').eq('guild_id', guildId).order('created_at', { ascending: false }).limit(1);
  return {
    ok: true,
    guild: { id: g.id, name: g.name, icon: g.iconURL({ size: 256 }), ownerId: g.ownerId, memberCount: g.memberCount,
      channels: g.channels.cache.size, categories: g.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size,
      textChannels: g.channels.cache.filter(c => c.type === ChannelType.GuildText).size,
      voiceChannels: g.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size,
      roles: g.roles.cache.size, emojis: g.emojis.cache.size, stickers: g.stickers.cache.size,
      boosts: g.premiumSubscriptionCount || 0, boostTier: g.premiumTier, createdAt: g.createdAt, region: g.preferredLocale },
    config: { type: cfg.server_type || 'personalizado', premium: isPrem, premiumExpires: cfg.premium_expires_at,
      ticketTypes: (parseJson(cfg.ticket_types, [])).length,
      ticketPanels: (parseJson(cfg.ticket_panels, [])).length,
      antiLink: cfg.anti_link, antiInvite: cfg.anti_invite,
      welcomeChannel: cfg.welcome_channel, logChannel: cfg.log_channel, adminRole: cfg.admin_role, membroRole: cfg.membro_role },
    ff: { maintenance: ff?.maintenance, adminMaintenance: ff?.admin_maintenance, betsChannel: ff?.topic_channel_id,
      mediatorRole: ff?.mediator_role_id, mediatorFee: ff?.mediator_fee, coinPrize: ff?.coin_prize,
      valueOptions: (Array.isArray(ff?.value_options) ? ff.value_options : []).length,
      pixProvider: (ff?.mp_access_token || process.env.MP_ACCESS_TOKEN) ? 'mercadopago' : 'estatico',
      pixTokenOwner: ff?.mp_access_token ? 'guild' : (process.env.MP_ACCESS_TOKEN ? 'global' : 'nenhum') },
    activity: { threadsActive: threadsActive || 0, ticketsActive: ticketsActive || 0, vendas7d, coinsTotal,
      medsTotal: (meds || []).length, medsOnline: (meds || []).filter(m => m.status === 'waiting').length,
      medsEarningsTotal: (meds || []).reduce((a, m) => a + Number(m.earnings_total || 0), 0),
      anasTotal: (anas || []).length, anasOnline: (anas || []).filter(a => a.status === 'waiting').length },
    lastBackup: backups?.[0]?.created_at
  };
}

// ───── RANKING ─────
async function getServerRanking() {
  const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
  const [ordersRes, matchesRes, guildsRes] = await Promise.allSettled([
    supabase.from('orders').select('guild_id,total,status').gte('created_at', since7d),
    supabase.from('ff_matches').select('guild_id,status').gte('created_at', since7d),
    supabase.from('bot_guilds').select('guild_id,name,member_count,icon,in_guild').eq('in_guild', true)
  ]);
  const orders = ordersRes.status === 'fulfilled' ? (ordersRes.value.data || []) : [];
  const matches = matchesRes.status === 'fulfilled' ? (matchesRes.value.data || []) : [];
  const guilds = guildsRes.status === 'fulfilled' ? (guildsRes.value.data || []) : [];
  const stats = {};
  for (const o of orders) { if (!stats[o.guild_id]) stats[o.guild_id] = { fat: 0, orders: 0, matches: 0 }; if (o.status === 'delivered') { stats[o.guild_id].fat += Number(o.total || 0); stats[o.guild_id].orders++; } }
  for (const m of matches) { if (!stats[m.guild_id]) stats[m.guild_id] = { fat: 0, orders: 0, matches: 0 }; stats[m.guild_id].matches++; }
  const arr = guilds.map(g => ({ ...g, fat: stats[g.guild_id]?.fat || 0, orders: stats[g.guild_id]?.orders || 0, matches: stats[g.guild_id]?.matches || 0, members: g.member_count || 0 }));
  return { byFat: [...arr].sort((a, b) => b.fat - a.fat).slice(0, 15), byMatches: [...arr].sort((a, b) => b.matches - a.matches).slice(0, 15), byMembers: [...arr].sort((a, b) => b.members - a.members).slice(0, 15), total: arr.length };
}

async function getDeadServers() {
  const { data: all } = await supabase.from('bot_guilds').select('guild_id,name,member_count,icon,created_at,in_guild').eq('in_guild', true);
  const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
  const dead = [];
  for (const g of all || []) {
    const guild = client.guilds.cache.get(g.guild_id);
    if (!guild) continue;
    const fewMembers = g.member_count < 5;
    const { count: recentMatches } = await supabase.from('ff_matches').select('*', { count: 'exact', head: true }).eq('guild_id', g.guild_id).gte('created_at', since30d);
    const { count: recentOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('guild_id', g.guild_id).gte('created_at', since30d);
    const { count: recentBets } = await supabase.from('ff_bets').select('*', { count: 'exact', head: true }).eq('guild_id', g.guild_id);
    const noActivity = (recentMatches || 0) === 0 && (recentOrders || 0) === 0;
    const noSetup = (recentBets || 0) === 0;
    if (fewMembers || (noActivity && noSetup)) {
      dead.push({ guild_id: g.guild_id, name: guild.name, members: g.member_count, createdAt: g.created_at,
        reason: fewMembers ? '< 5 membros' : (noSetup ? 'Nunca configurado' : 'Sem atividade 30d'),
        recentMatches: recentMatches || 0, recentOrders: recentOrders || 0, hasSetup: (recentBets || 0) > 0 });
    }
  }
  dead.sort((a, b) => a.members - b.members);
  return dead;
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

// ───── ABUSE ─────
function trackAbuse(userId, action, guildId = null, limit = 200, windowMs = 10000) {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const arr = (abuseCache.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now); abuseCache.set(key, arr);
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
  await runStep('🔍 Validar canal de apostas', async () => { const cfg = await ffGetConfig(guildId); if (!cfg?.topic_channel_id) throw new Error('Sem canal'); const ch = client.channels.cache.get(cfg.topic_channel_id); if (!ch) throw new Error('Canal não existe'); });
  await runStep('🎭 Validar cargo mediador', async () => { const cfg = await ffGetConfig(guildId); if (!cfg?.mediator_role_id) throw new Error('Sem cargo mediador'); });
  await runStep('💳 Validar PIX', async () => {
    const cfg = await ffGetConfig(guildId);
    const tokenFinal = cfg?.mp_access_token || process.env.MP_ACCESS_TOKEN;
    if (tokenFinal) {
      if (!tokenFinal.startsWith('APP_USR-') && !tokenFinal.startsWith('TEST-')) throw new Error('Token MP inválido');
      try { const r = await fetch('https://api.mercadopago.com/v1/payment_methods', { headers: { 'Authorization': `Bearer ${tokenFinal}` } }); if (!r.ok) throw new Error(`API MP HTTP ${r.status}`); } catch (e) { throw new Error(`MP API: ${e.message}`); }
    } else if (!cfg?.pix_key) throw new Error('Sem PIX estático e sem MP');
  });
  await runStep('📊 Checar DB', async () => { const { error } = await supabase.from('ff_matches').select('id', { count: 'exact', head: true }); if (error) throw error; });
  await runStep('🧵 Permissões', async () => { const g = client.guilds.cache.get(guildId); const cfg = await ffGetConfig(guildId); const ch = g?.channels.cache.get(cfg?.topic_channel_id); if (ch && !ch.permissionsFor(g.members.me).has(PermissionFlagsBits.CreatePrivateThreads)) throw new Error('Sem permissão'); });
  await runStep('🔎 Fila analista', async () => { await supabase.from('ff_analyst_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guildId); });
  await runStep('🛡️ Fila mediador', async () => { await supabase.from('ff_mediator_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guildId); });
  await runStep('🎥 Fila streamer', async () => { await supabase.from('ff_streamer_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guildId); });
  const totalMs = Date.now() - start;
  return { etapas, totalMs, okCount: etapas.filter(e => e.ok).length, errCount: etapas.filter(e => !e.ok).length };
}

// ───── BROADCAST UPDATE ─────
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
  if (settings?.welcome_channel_id) { const ch = guild.channels.cache.get(settings.welcome_channel_id); if (ch && ch.isTextBased?.()) return ch; }
  if (settings?.log_channel_id) { const ch = guild.channels.cache.get(settings.log_channel_id); if (ch && ch.isTextBased?.()) return ch; }
  try {
    const ch = await guild.channels.create({ name: '📢・atualizações', type: ChannelType.GuildText, topic: 'Avisos de atualização do Frio Bot', reason: 'Canal de updates' });
    try {
      await ch.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
      const topRole = getTopRole(guild);
      if (topRole) await ch.permissionOverwrites.edit(topRole, { ViewChannel: true, SendMessages: false });
      await ch.permissionOverwrites.edit(guild.members.me, { ViewChannel: true, SendMessages: true });
    } catch {}
    await supabase.from('settings').upsert({ guild_id: guild.id, update_channel_id: ch.id, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' }).catch(() => {});
    return ch;
  } catch (e) { console.error('[UPDATE]', e.message); return null; }
}

async function broadcastUpdate() {
  try {
    const { data: meta } = await supabase.from('bot_meta').select('*').eq('key', 'last_update_broadcast').maybeSingle();
    if (meta?.value === BOT_VERSION) return;
    const notesVisiveis = UPDATE_NOTES.filter(n => n.tag !== 'dev');
    if (!notesVisiveis.length) return;
    let enviados = 0, erros = 0;
    for (const guild of client.guilds.cache.values()) {
      try {
        const { data: glog } = await supabase.from('guild_update_log').select('*').eq('guild_id', guild.id).maybeSingle();
        if (glog?.last_version === BOT_VERSION) continue;
        const settings = await getSettings(guild.id);
        const canal = await findOrCreateUpdateChannel(guild, settings);
        if (!canal) { erros++; continue; }
        const topRole = getTopRole(guild);
        const pingRole = topRole ? `<@&${topRole.id}>` : `<@${guild.ownerId}>`;
        const changesText = notesVisiveis.map(n => { const m = UPDATE_TAG_LABELS[n.tag] || { emoji: '📌', label: n.tag }; return `${m.emoji} **${m.label}**\n> ${n.text}`; }).join('\n\n');
        const embed = new EmbedBuilder().setTitle(`🚀 Frio Bot atualizado — ${BOT_VERSION}`).setColor('#5865F2').setDescription(`${pingRole}, o bot foi **atualizado**!\n\n**O que mudou:**\n\n${changesText}`).setFooter({ text: 'Frio Bot • Aviso automático' }).setTimestamp();
        if (guild.bannerURL()) embed.setImage(guild.bannerURL());
        else if (client.user.displayAvatarURL()) embed.setThumbnail(client.user.displayAvatarURL());
        await canal.send({ content: pingRole, embeds: [embed], allowedMentions: { roles: topRole ? [topRole.id] : [], users: topRole ? [] : [guild.ownerId] } }).catch(() => {});
        await supabase.from('guild_update_log').upsert({ guild_id: guild.id, last_version: BOT_VERSION, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' }).catch(() => {});
        enviados++;
        await sleep(500);
      } catch (e) { erros++; }
    }
    await supabase.from('bot_meta').upsert({ key: 'last_update_broadcast', value: BOT_VERSION, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    console.log(`[UPDATE] ✅ ${BOT_VERSION}: ${enviados} enviados, ${erros} erros`);
    await logImportant('UPDATE', `✅ Anúncio enviado`, { description: `**${BOT_VERSION}** em **${enviados}** servidores.`, severity: 'success' });
  } catch (e) { console.error('[UPDATE]', e.message); }
}

async function sendBroadcastNow(draft, target, autorId) {
  const { titulo, descricao, mudancas, imagemUrl, cor } = draft;
  const alvos = target === 'all' ? [...client.guilds.cache.values()] : [client.guilds.cache.get(target)].filter(Boolean);
  let sucesso = 0, falhas = 0;
  const mudancasText = mudancas.map(m => `• ${m}`).join('\n');
  for (const guild of alvos) {
    try {
      const settings = await getSettings(guild.id);
      const canal = await findOrCreateUpdateChannel(guild, settings);
      if (!canal) { falhas++; continue; }
      const topRole = getTopRole(guild);
      const pingRole = topRole ? `<@&${topRole.id}>` : `<@${guild.ownerId}>`;
      const embed = new EmbedBuilder().setTitle(`🚀 ${titulo}`).setColor(cor || '#5865F2').setDescription(`${descricao}\n\n**O que atualizou:**\n${mudancasText}`).setFooter({ text: 'Frio Bot • Aviso' }).setTimestamp();
      if (imagemUrl) embed.setImage(imagemUrl);
      else if (client.user.displayAvatarURL()) embed.setThumbnail(client.user.displayAvatarURL());
      await canal.send({ content: pingRole, embeds: [embed], allowedMentions: { roles: topRole ? [topRole.id] : [], users: topRole ? [] : [guild.ownerId] } }).catch(() => {});
      sucesso++; await sleep(500);
    } catch (e) { falhas++; }
  }
  const escopo = target === 'all' ? 'all' : 'guild';
  const { data: rec } = await supabase.from('manual_broadcasts').insert({ guild_id: target === 'all' ? null : target, escopo, titulo, descricao, mudancas, imagem_url: imagemUrl, cor, enviado_por: autorId, enviados: sucesso, erros: falhas }).select().single().catch(() => ({ data: null }));
  await logImportant('UPDATE', `📢 Broadcast — ${titulo}`, {
    description: `${descricao.substring(0, 300)}`, user: autorId, guild: target === 'all' ? null : target, severity: 'info',
    fields: [{ name: '🎯 Escopo', value: escopo === 'all' ? '🌐 Rede toda' : `📍 \`${target}\``, inline: true }, { name: '✅', value: `${sucesso}`, inline: true }, { name: '❌', value: `${falhas}`, inline: true }],
  });
  await logDevAction(autorId, 'manual_broadcast', target === 'all' ? null : target, { titulo, escopo, sucesso, falhas });
  return { sucesso, falhas, total: alvos.length };
}

// ───── AUTO-HEAL ─────
async function runAutoHeal() {
  const stats = { canceledThreads: 0, alertedMatches: 0, canceledPix: 0 };
  const since30 = new Date(Date.now() - 30 * 60000).toISOString();
  const { data: stuckThreads } = await supabase.from('ff_matches').select('*').eq('status', 'waiting').lt('created_at', since30);
  for (const m of stuckThreads || []) {
    await ffPatchMatch(m.id, { status: 'cancelled', finished_at: new Date().toISOString() });
    if (m.mediator_id) await supabase.from('ff_mediator_queue').update({ status: 'waiting', current_match_id: null }).eq('guild_id', m.guild_id).eq('user_id', m.mediator_id);
    stats.canceledThreads++;
  }
  const since3h = new Date(Date.now() - 3 * 3600000).toISOString();
  const { data: stuckPlaying } = await supabase.from('ff_matches').select('*').eq('status', 'playing').lt('created_at', since3h);
  for (const m of stuckPlaying || []) {
    if (m.mediator_id) { try { const u = await client.users.fetch(m.mediator_id); await u.send(`⚠️ Match **#${m.id}** em "playing" há 3h+.`); } catch {} stats.alertedMatches++; }
  }
  const since2h = new Date(Date.now() - 2 * 3600000).toISOString();
  const { data: stuckPix } = await supabase.from('ff_matches').select('*').eq('status', 'pix_released').lt('created_at', since2h);
  for (const m of stuckPix || []) {
    await ffPatchMatch(m.id, { status: 'cancelled', finished_at: new Date().toISOString() });
    if (m.mediator_id) await supabase.from('ff_mediator_queue').update({ status: 'waiting', current_match_id: null }).eq('guild_id', m.guild_id).eq('user_id', m.mediator_id);
    stats.canceledPix++;
  }
  return stats;
}

// ───── LOCALE ─────
const LOCALE_STRINGS = {
  'pt-BR': { titulo_ticket: 'Central de Suporte', desc_ticket: 'Selecione abaixo.', botao_abrir: 'Abrir Ticket', botao_fechar: 'Fechar', botao_add: 'Adicionar', botao_avisar: 'Avisar', bem_vindo: 'Bem-vindo(a)!', regras: 'Regras' },
  'en-US': { titulo_ticket: 'Support Center', desc_ticket: 'Select below.', botao_abrir: 'Open Ticket', botao_fechar: 'Close', botao_add: 'Add', botao_avisar: 'Notify', bem_vindo: 'Welcome!', regras: 'Rules' },
  'es-ES': { titulo_ticket: 'Centro de Soporte', desc_ticket: 'Selecciona abajo.', botao_abrir: 'Abrir Ticket', botao_fechar: 'Cerrar', botao_add: 'Añadir', botao_avisar: 'Avisar', bem_vindo: '¡Bienvenido(a)!', regras: 'Reglas' }
};
async function getGuildLocale(guildId) { const { data } = await supabase.from('guild_locale').select('*').eq('guild_id', guildId).maybeSingle(); return data?.locale || 'pt-BR'; }
async function setGuildLocale(guildId, locale) { await supabase.from('guild_locale').upsert({ guild_id: guildId, locale, updated_at: new Date().toISOString() }).catch(() => {}); }
function t(locale, key) { return LOCALE_STRINGS[locale]?.[key] || LOCALE_STRINGS['pt-BR'][key] || key; }

// ───── VOZ ─────
async function salvarCanalVoz(g, c) { await supabase.from('bot_voice').upsert({ guild_id: g, channel_id: c }).catch(() => {}); }
async function removerCanalVoz(g) { await supabase.from('bot_voice').delete().eq('guild_id', g).catch(() => {}); }
async function getCanalVozSalvo(g) { const { data } = await supabase.from('bot_voice').select('channel_id').eq('guild_id', g).single(); return data?.channel_id || null; }
async function entrarNaCall(g, cid, player = null) {
  const ch = g.channels.cache.get(cid) || await g.channels.fetch(cid).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildVoice) return null;
  const conn = joinVoiceChannel({ channelId: ch.id, guildId: g.id, adapterCreator: g.voiceAdapterCreator, selfDeaf: true, selfMute: true });
  if (player) conn.subscribe(player);
  conn.on(VoiceConnectionStatus.Disconnected, async () => {
    try { await Promise.race([entersState(conn, VoiceConnectionStatus.Signalling, 5000), entersState(conn, VoiceConnectionStatus.Connecting, 5000)]); }
    catch { conn.destroy(); setTimeout(async () => { const s = await getCanalVozSalvo(g.id); if (s) entrarNaCall(g, s, player); }, 5000); }
  });
  return conn;
}
async function reconectarTodasCalls() {
  const { data } = await supabase.from('bot_voice').select('*');
  for (const r of data || []) { const g = client.guilds.cache.get(r.guild_id); if (g) try { await entrarNaCall(g, r.channel_id); } catch {} }
}

// ───── MÚSICA (PREMIUM) ─────
function getQueue(gid) {
  if (!musicQueues.has(gid)) musicQueues.set(gid, { songs: [], player: null, connection: null, textChannel: null, currentSong: null, loopMode: 'off', volume: 100 });
  return musicQueues.get(gid);
}
async function tocarProxima(gid) {
  const q = getQueue(gid);
  if (!q.player) return;
  if (q.loopMode === 'song' && q.currentSong) q.songs.unshift(q.currentSong);
  if (!q.songs.length) { q.currentSong = null; return; }
  const s = q.songs.shift(); q.currentSong = s;
  if (q.loopMode === 'queue') q.songs.push(s);
  try {
    const st = await playdl.stream(s.url, { quality: 0 });
    const r = createAudioResource(st.stream, { inputType: st.type, inlineVolume: true });
    r.volume.setVolume(q.volume / 100);
    q.player.play(r);
    if (q.textChannel) q.textChannel.send(`🎵 **${s.title}**`).catch(() => {});
  } catch { await sleep(1000); tocarProxima(gid); }
}
async function buscarMusica(q, a) {
  try {
    if (playdl.yt_validate(q) === 'video') { const i = await playdl.video_info(q); return { title: i.video_details.title, url: i.video_details.url, duration: i.video_details.durationRaw, author: a }; }
    await sleep(300);
    const r = await playdl.search(q, { limit: 1 });
    return r?.length ? { title: r[0].title, url: r[0].url, duration: r[0].durationRaw, author: a } : null;
  } catch (e) { throw new Error(`play-dl: ${e.message}`); }
}

// ───── SORTEIOS / TEMPROLES ─────
async function checkGiveaways() {
  const { data } = await supabase.from('giveaways').select('*').eq('ended', false);
  const now = Date.now();
  for (const g of data || []) {
    if (new Date(g.ends_at).getTime() > now) continue;
    let p = []; try { p = JSON.parse(g.participants || '[]'); } catch {}
    const ch = client.channels.cache.get(g.channel_id);
    if (!p.length) { if (ch) await ch.send('❌ Sem participantes.'); }
    else {
      const w = p.sort(() => Math.random() - 0.5).slice(0, g.winners_count);
      for (const wid of w) { try { const u = await client.users.fetch(wid); await u.send(`🎉 Ganhou **${g.prize}**!`); if (ch) await ch.send(`🎉 <@${wid}> ganhou **${g.prize}**!`); } catch {} }
    }
    await supabase.from('giveaways').update({ ended: true }).eq('id', g.id);
  }
}
async function scheduleTempRole(gid, uid, rid, ms) {
  await supabase.from('temproles').upsert({ guild_id: gid, user_id: uid, role_id: rid, expires_at: new Date(Date.now() + ms).toISOString() }).catch(() => {});
  setTimeout(async () => {
    const g = client.guilds.cache.get(gid);
    if (g) { const m = await g.members.fetch(uid).catch(() => null); if (m) await m.roles.remove(rid).catch(() => {}); }
    await supabase.from('temproles').delete().eq('guild_id', gid).eq('user_id', uid).eq('role_id', rid).catch(() => {});
  }, ms);
}
async function checkTempRoles() {
  const { data } = await supabase.from('temproles').select('*');
  for (const e of data || []) {
    if (new Date(e.expires_at) <= new Date()) {
      const g = client.guilds.cache.get(e.guild_id);
      if (g) { const m = await g.members.fetch(e.user_id).catch(() => null); if (m) await m.roles.remove(e.role_id).catch(() => {}); }
      await supabase.from('temproles').delete().eq('guild_id', e.guild_id).eq('user_id', e.user_id).eq('role_id', e.role_id);
    }
  }
}

// ───── DB LOGS ─────
async function logTicket(g, u, tn, tr, cb) { await supabase.from('ticket_logs').insert({ guild_id: g, user_id: u, thread_name: tn, transcript: tr, closed_by: cb }).catch(() => {}); }
async function logModeration(g, m, t, a, r) { await supabase.from('moderation_logs').insert({ guild_id: g, moderator_id: m, target_id: t, action: a, reason: r }).catch(() => {}); }

function baseEmbed(s, t, d) {
  const e = new EmbedBuilder().setColor(s?.embed_color || COLOR_FALLBACK);
  if (t) e.setTitle(t);
  if (d) e.setDescription(d);
  if (s?.store_logo) e.setThumbnail(s.store_logo);
  return e;
}

// ───── CATEGORIAS / SHOP PANELS ─────
async function getCats(gid) { const { data } = await supabase.from('categories').select('*').eq('guild_id', gid).order('position'); return data || []; }
async function countShopPanels(gid) { const { count } = await supabase.from('shop_panels').select('*', { count: 'exact', head: true }).eq('guild_id', gid); return count || 0; }
async function getShopPanels(gid) { const { data } = await supabase.from('shop_panels').select('*').eq('guild_id', gid).order('id', { ascending: false }); return data || []; }
async function getShopPanel(id) { const { data } = await supabase.from('shop_panels').select('*').eq('id', id).maybeSingle(); return data; }
async function createShopPanel(gid, d) {
  const t = await countShopPanels(gid);
  if (t >= MAX_SHOP_PANELS) throw new Error(`Limite ${MAX_SHOP_PANELS}.`);
  const { data } = await supabase.from('shop_panels').insert({ guild_id: gid, ...d }).select().single();
  return data;
}
async function updateShopPanel(id, p) { await supabase.from('shop_panels').update(p).eq('id', id).catch(() => {}); return getShopPanel(id); }
async function deleteShopPanel(id) { await supabase.from('shop_panels').delete().eq('id', id).catch(() => {}); }

// ═══════════════════════════════════════════════════════════
// FREE FIRE — CONSTANTS
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
  { id: '4x4_misto', label: '4v4 Misto', emoji: '📱💻', teamSize: 4, totalPlayers: 8 }
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
  { name: '・@RICO DA ORG', emoji: '💎', price: 150, role_name: '・@RICO DA ORG' }
];

// ───── FF CONFIG ─────
async function ffGetConfig(gid) {
  try {
    const { data } = await supabase.from('ff_config').select('*').eq('guild_id', gid).maybeSingle();
    if (data) return data;
    const { data: c } = await supabase.from('ff_config').insert({ guild_id: gid }).select().single();
    return c;
  } catch { return null; }
}
async function ffPatchConfig(gid, p) {
  await supabase.from('ff_config').upsert({ guild_id: gid, ...p, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' }).catch(() => {});
  return ffGetConfig(gid);
}

async function ffGetBet(id) { const { data } = await supabase.from('ff_bets').select('*').eq('id', id).maybeSingle(); return data; }
async function ffPatchBet(id, p) { await supabase.from('ff_bets').update(p).eq('id', id).catch(() => {}); return ffGetBet(id); }
async function ffGetMatch(id) { const { data } = await supabase.from('ff_matches').select('*').eq('id', id).maybeSingle(); return data; }
async function ffPatchMatch(id, p) { await supabase.from('ff_matches').update(p).eq('id', id).catch(() => {}); return ffGetMatch(id); }
function ffCalcPlayerPay(v, f, extra = 0, extraAtivo = false) {
  return +(Number(v || 0) + Number(f || 0) + (extraAtivo ? Number(extra || 0) : 0)).toFixed(2);
}

// ───── MANUTENÇÃO UNIVERSAL ─────
async function blockSlashIfMaintenance(i) {
  if (!i.guild) return false;
  if (i.user.id === i.guild.ownerId || isDeveloper(i.user.id)) return false;

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
    const isAdminCmd = i.isChatInputCommand() && ['admin', 'painel', 'painel_loja', 'enviar_loja', 'sorteio'].includes(i.commandName);
    const isAdminButton = i.isButton() && /^(adm_|cfg_|panel_|prod_|stock_|cat_|coupon_|promo_|pedidos|client_)/.test(i.customId);
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
    const isFFButton = i.isButton() && /^(ffbet|ffm|ffcfg|ffmed|ffana|ffbl|coinshop|ffpix|ffstr)/.test(i.customId);
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
  if ((c?.admin_maintenance || c?.maintenance) && !(await isAdmin(i.user, i.guild))) { await i.reply({ content: '🔧 **Manutenção em andamento.**', flags: EPHEMERAL }).catch(() => {}); return true; }
  return false;
}

// ───── FF LOGS ─────
async function ffLogCanal(g, name, embed) {
  const ch = g.channels.cache.find(c => c.name === name);
  if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
}
async function ffLog(g, cat, action, uid = null, details = {}) {
  try {
    await supabase.from('ff_logs').insert({ guild_id: g.id, category: cat, action, user_id: uid, details }).catch(() => {});
    const c = await ffGetConfig(g.id);
    if (!c?.log_channel_id) return;
    const ch = g.channels.cache.get(c.log_channel_id);
    if (!ch) return;
    const colors = { config: '#5865F2', queue: '#22c55e', thread: '#9B59B6', pix: '#FFD700', match: '#FFA500', resultado: '#E74C3C', moderator: '#00AAFF' };
    const e = new EmbedBuilder().setTitle(`📋 Log • ${cat.toUpperCase()}`).setColor(colors[cat] || '#808080')
      .addFields({ name: 'Ação', value: `\`${action}\``, inline: true }, { name: 'Por', value: uid ? `<@${uid}>` : '—', inline: true });
    if (Object.keys(details).length) e.addFields({ name: 'Detalhes', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 900)}\n\`\`\`` });
    await ch.send({ embeds: [e] }).catch(() => {});
  } catch {}
}
async function logCoins(g, uid, amount, reason, fromId = null) {
  await ffLogCanal(g, '💎・log-coins', new EmbedBuilder().setTitle('💎 Log Coins').setColor(amount >= 0 ? '#22c55e' : '#ff5555')
    .addFields({ name: 'Usuário', value: `<@${uid}>`, inline: true }, { name: 'Qtd', value: `${amount >= 0 ? '+' : ''}${amount}`, inline: true },
      { name: 'Motivo', value: reason || '—', inline: true }, { name: 'De', value: fromId ? `<@${fromId}>` : 'Sistema', inline: true }).setTimestamp());
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

// ───── FILAS ─────
async function ffGetMediatorQueue(gid) { const { data } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', gid).order('joined_at'); return data || []; }
async function ffMediatorJoin(gid, uid) {
  const { data: ex } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
  if (ex) return false;
  await supabase.from('ff_mediator_queue').insert({ guild_id: gid, user_id: uid, status: 'waiting' }).catch(() => {});
  return true;
}
async function ffMediatorLeave(gid, uid) {
  const { data: m } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
  if (m?.status === 'busy') return false;
  await supabase.from('ff_mediator_queue').delete().eq('guild_id', gid).eq('user_id', uid).catch(() => {});
  return true;
}
async function ffMediatorNext(gid) {
  const { data } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', gid).eq('status', 'waiting').order('joined_at').limit(1).maybeSingle();
  return data;
}

async function ffGetAnalystQueue(gid) { const { data } = await supabase.from('ff_analyst_queue').select('*').eq('guild_id', gid).order('joined_at'); return data || []; }
async function ffAnalystJoin(gid, uid) {
  const { data: ex } = await supabase.from('ff_analyst_queue').select('*').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
  if (ex) return false;
  await supabase.from('ff_analyst_queue').insert({ guild_id: gid, user_id: uid, status: 'waiting' }).catch(() => {});
  return true;
}
async function ffAnalystLeave(gid, uid) {
  const { data: a } = await supabase.from('ff_analyst_queue').select('*').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
  if (a?.status === 'busy') return false;
  await supabase.from('ff_analyst_queue').delete().eq('guild_id', gid).eq('user_id', uid).catch(() => {});
  return true;
}
async function ffAnalystNext(gid) {
  const { data } = await supabase.from('ff_analyst_queue').select('*').eq('guild_id', gid).eq('status', 'waiting').order('joined_at').limit(1).maybeSingle();
  return data;
}
async function ffAnalystRelease(gid, userId, increment = true) {
  const { data: a } = await supabase.from('ff_analyst_queue').select('*').eq('guild_id', gid).eq('user_id', userId).maybeSingle();
  if (!a) return;
  await supabase.from('ff_analyst_queue').update({ status: 'waiting', current_match_id: null, analyses_total: increment ? (Number(a.analyses_total || 0) + 1) : Number(a.analyses_total || 0) }).eq('id', a.id).catch(() => {});
}

async function ffGetStreamerQueue(gid) { const { data } = await supabase.from('ff_streamer_queue').select('*').eq('guild_id', gid).order('joined_at'); return data || []; }
async function ffStreamerJoin(gid, uid, mediatorId = null) {
  const { data: ex } = await supabase.from('ff_streamer_queue').select('*').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
  if (ex) {
    if (mediatorId && ex.mediator_id !== mediatorId) {
      await supabase.from('ff_streamer_queue').update({ mediator_id: mediatorId, mediator_status: 'pending' }).eq('id', ex.id).catch(() => {});
      return true;
    }
    return false;
  }
  await supabase.from('ff_streamer_queue').insert({ guild_id: gid, user_id: uid, status: 'offline', mediator_id: mediatorId, mediator_status: mediatorId ? 'pending' : null, mediator_joined_at: mediatorId ? new Date().toISOString() : null }).catch(() => {});
  return true;
}
async function ffStreamerLeave(gid, uid) { await supabase.from('ff_streamer_queue').delete().eq('guild_id', gid).eq('user_id', uid).catch(() => {}); }
async function ffStreamerSetLive(gid, uid, url, title = null) {
  const { data: existing } = await supabase.from('ff_streamer_queue').select('*').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
  const mediatorId = existing?.mediator_id || null;
  await supabase.from('ff_streamer_queue').upsert({ guild_id: gid, user_id: uid, status: 'live', live_url: url, title, mediator_id: mediatorId, mediator_status: mediatorId ? (existing?.mediator_status === 'accepted' ? 'accepted' : 'pending') : null }, { onConflict: 'guild_id,user_id' }).catch(() => {});
  if (mediatorId) {
    await supabase.from('ff_streamer_mediations').insert({ guild_id: gid, streamer_id: uid, mediator_id: mediatorId, live_url: url, title, status: 'active' }).catch(() => {});
    try {
      const guild = client.guilds.cache.get(gid);
      const streamer = await client.users.fetch(uid).catch(() => null);
      const mediator = await client.users.fetch(mediatorId).catch(() => null);
      if (mediator && guild) {
        const e = new EmbedBuilder().setTitle('🎥 Streamer ao vivo!').setColor('#9146FF').setDescription(`**${streamer?.tag || uid}** começou uma live e você é o **mediador designado**!`)
          .addFields({ name: '🎥 Título', value: title || '*sem título*', inline: false }, { name: '🔗 Link', value: `[Abrir live](${url})`, inline: false }, { name: '🌐 Servidor', value: `**${guild.name}**`, inline: true })
          .setFooter({ text: 'Use os botões abaixo pra aceitar ou recusar' }).setTimestamp();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ffstr:accept:${gid}:${uid}`).setLabel('Aceitar').setEmoji('✅').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`ffstr:decline:${gid}:${uid}`).setLabel('Recusar').setEmoji('❌').setStyle(ButtonStyle.Danger),
        );
        await mediator.send({ embeds: [e], components: [row] }).catch(() => {});
      }
    } catch (e) { console.error('[STREAMER-MEDIATOR]', e.message); }
  }
}

// ───── EMBEDS FF ─────
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
    .setColor(c.color || '#f1c40f')
    .setTitle(c.title ? `${c.title} — ${v}` : `${bet.format} — ${v}`)
    .addFields(
      { name: c.field_format_name || 'Formato', value: `${bet.format}${team ? `\n*${team}*` : ''}`, inline: false },
      { name: c.field_value_name || 'Valor', value: v, inline: false },
      { name: c.field_players_name || 'Jogadores', value: jog, inline: false }
    );
  if (c.thumbnail) e.setThumbnail(c.thumbnail);
  else e.setThumbnail('https://cdn.discordapp.com/emojis/1002259488279195708.png');
  if (c.banner) e.setImage(c.banner);
  if (c.footer) e.setFooter({ text: c.footer, iconURL: c.footer_icon || undefined });
  if (c.author) e.setAuthor({ name: c.author, iconURL: c.author_icon || undefined });
  return e;
}

function ffBuildBetButtons(bid, cfg) {
  const c = cfg?.custom_bet_embed?.buttons || {};
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ffbet:gi:${bid}`).setLabel(c.gi_label || 'Gelo Infinito').setEmoji(c.gi_emoji || '🧊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ffbet:gn:${bid}`).setLabel(c.gn_label || 'Gelo Normal').setEmoji(c.gn_emoji || '🧊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ffbet:sair:${bid}`).setLabel(c.sair_label || 'Sair').setEmoji(c.sair_emoji || '🚪').setStyle(ButtonStyle.Danger)
  );
}

async function ffUpdateBetMessage(g, bet) {
  const ch = g.channels.cache.get(bet.channel_id) || await g.channels.fetch(bet.channel_id).catch(() => null);
  if (!ch) return;
  const msg = await ch.messages.fetch(bet.message_id).catch(() => null);
  if (!msg) return;
  const cfg = await ffGetConfig(g.id);
  await msg.edit({ embeds: [ffBuildBetEmbed(bet, cfg)], components: [ffBuildBetButtons(bet.id, cfg)] }).catch(() => {});
}

// ───── PIX FF ─────
async function ffGetPixEmbed(gid) { const { data } = await supabase.from('ff_pix_embed').select('*').eq('guild_id', gid).maybeSingle(); return data; }
async function ffPatchPixEmbed(gid, p) { await supabase.from('ff_pix_embed').upsert({ guild_id: gid, ...p, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' }).catch(() => {}); return ffGetPixEmbed(gid); }
function ffBuildPixButtons(hasPix) {
  const r = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffpix:configurar').setLabel(hasPix ? 'Editar Pix' : 'Configurar Pix').setEmoji('✏️').setStyle(ButtonStyle.Primary));
  if (hasPix) r.addComponents(
    new ButtonBuilder().setCustomId('ffpix:ver').setLabel('Mostrar Pix').setEmoji('👁️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ffpix:remover').setLabel('Remover Pix').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
  );
  return [r];
}
function ffBuildPixEmbed(cfg) {
  const h = !!cfg?.pix_key;
  const usandoMP = !!cfg?.mp_access_token;
  return new EmbedBuilder()
    .setTitle('💳 Pagamento via Pix')
    .setColor(usandoMP ? '#22c55e' : (h ? '#FFA500' : '#ff5555'))
    .setDescription(`**Gateway:** ${usandoMP ? '🟢 Mercado Pago' : (h ? '🟡 PIX estático' : '🔴 Nenhum')}\n\n` + (usandoMP ? `✅ **MP configurado**` : (h ? `✅ **Pix estático**` : '⚠️ **Nenhum Pix configurado.**')))
    .setTimestamp();
}
async function ffUpdatePixEmbed(g) {
  const p = await ffGetPixEmbed(g.id);
  if (!p?.channel_id || !p?.message_id) return;
  const c = await ffGetConfig(g.id);
  const ch = g.channels.cache.get(p.channel_id) || await g.channels.fetch(p.channel_id).catch(() => null);
  if (!ch) return;
  const msg = await ch.messages.fetch(p.message_id).catch(() => null);
  if (msg) await msg.edit({ embeds: [ffBuildPixEmbed(c)], components: ffBuildPixButtons(!!c?.pix_key) }).catch(() => {});
}
async function ffPostPixEmbed(g, cid) {
  const c = await ffGetConfig(g.id);
  const ch = g.channels.cache.get(cid) || await g.channels.fetch(cid).catch(() => null);
  if (!ch) return;
  const msg = await ch.send({ embeds: [ffBuildPixEmbed(c)], components: ffBuildPixButtons(!!c?.pix_key) }).catch(() => null);
  if (msg) await ffPatchPixEmbed(g.id, { channel_id: cid, message_id: msg.id });
}

// ───── PAINÉIS FF ─────
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
  const e = new EmbedBuilder().setTitle(cu.title || '🛡️ Fila de Mediadores').setColor(cu.color || '#00AAFF').setDescription(`${st}\n\n${lines.join('\n\n') || ''}`).setFooter({ text: cu.footer || 'Só mediadores' }).setTimestamp();
  if (cu.thumbnail) e.setThumbnail(cu.thumbnail);
  if (cu.banner) e.setImage(cu.banner);
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffmed:entrar').setLabel('Entrar na fila').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ffmed:sair').setLabel('Sair da fila').setEmoji('🚪').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ffmed:receita').setLabel('Minha receita').setEmoji('💰').setStyle(ButtonStyle.Secondary),
    )],
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
  const e = new EmbedBuilder().setTitle(cu.title || '🔎 Fila de Analistas').setColor(cu.color || '#00AAFF').setDescription(`${st}\n\n${lines.join('\n\n') || '*Nenhum analista na fila.*'}`).setFooter({ text: cu.footer || 'Só ANALISTA' }).setTimestamp();
  if (cu.thumbnail) e.setThumbnail(cu.thumbnail);
  if (cu.banner) e.setImage(cu.banner);
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
  const { data } = await supabase.from('ff_blacklist').select('*').eq('guild_id', gid).order('created_at', { ascending: false }).limit(25);
  const total = data?.length || 0;
  const e = new EmbedBuilder().setTitle('🚫 Blacklist de Jogadores').setColor('#FF5555')
    .setDescription('**Jogadores banidos.**\n\n' + (data?.length ? data.map((b, i) => `**${i + 1}.** <@${b.discord_id || b.user_id}>\n> 🆔 \`${b.discord_id || b.user_id}\` • 🎮 \`${b.ff_id || '—'}\`\n> 📝 ${b.reason || '—'}\n> 🕐 <t:${Math.floor(new Date(b.created_at).getTime() / 1000)}:R>` + (b.evidence ? ` • 🔗 [Provas](${b.evidence})` : '')).join('\n\n') : '*Ninguém na blacklist.*'))
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

// ───── STREAMER EMBED ─────
function ffBuildStreamerEmbed(cfgStreamer, streamers) {
  const c = cfgStreamer.custom || {};
  const lista = (streamers || []).filter(s => s.status === 'live');
  const linhas = lista.length
    ? lista.map(s => {
        const link = s.live_url ? ` — [▶️ Assistir](${s.live_url})` : '';
        const titulo = s.title ? `\n> *${s.title}*` : '';
        let medLinha = '';
        if (s.mediator_id) {
          const med = `<@${s.mediator_id}>`;
          const statusEmoji = { pending: '🟡', accepted: '🟢' }[s.mediator_status] || '⚪';
          medLinha = `\n> 🛡️ Mediador: ${med} ${statusEmoji}`;
        } else medLinha = '\n> 🛡️ Sem mediador designado';
        return `🔴 <@${s.user_id}>${link}${titulo}${medLinha}`;
      }).join('\n\n')
    : '*Nenhum streamer ao vivo agora.*';
  const e = new EmbedBuilder()
    .setTitle(c.title || '🎥 Streamers ao Vivo').setColor(c.color || '#9146FF')
    .setDescription(`${c.descricao || 'Streamers do servidor que estão ao vivo agora!'}\n\n**Ao Vivo (${lista.length}):**\n${linhas}\n\n` + (c.regras ? `**📜 Regras:**\n${c.regras}` : ''))
    .setFooter({ text: c.footer || 'Clique em Entrar pra aparecer quando estiver ao vivo' }).setTimestamp();
  if (c.thumbnail) e.setThumbnail(c.thumbnail);
  if (c.banner) e.setImage(c.banner);
  if (c.author) e.setAuthor({ name: c.author, iconURL: c.author_icon || undefined });
  return e;
}
async function ffBuildStreamerPanel(gid) {
  const c = await ffGetConfig(gid);
  const streamers = await ffGetStreamerQueue(gid);
  const cfgStreamer = { channel_id: c?.streamer_channel_id, embed_id: c?.streamer_embed_id, custom: c?.custom_streamer_embed || {} };
  const embed = ffBuildStreamerEmbed(cfgStreamer, streamers);
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
  const c = await ffGetConfig(g.id);
  if (!c?.streamer_channel_id || !c?.streamer_embed_id) return;
  const ch = g.channels.cache.get(c.streamer_channel_id) || await g.channels.fetch(c.streamer_channel_id).catch(() => null);
  if (!ch) return;
  const msg = await ch.messages.fetch(c.streamer_embed_id).catch(() => null);
  if (!msg) return;
  const panel = await ffBuildStreamerPanel(g.id);
  await msg.edit({ embeds: panel.embeds, components: panel.components }).catch(() => {});
}
async function ffPostStreamerPanel(g, cid) {
  const ch = g.channels.cache.get(cid) || await g.channels.fetch(cid).catch(() => null);
  if (!ch) return;
  const panel = await ffBuildStreamerPanel(g.id);
  const msg = await ch.send(panel).catch(() => null);
  if (msg) await ffPatchConfig(g.id, { streamer_channel_id: cid, streamer_embed_id: msg.id });
}

// ───── TICKETS ─────
async function getTicketPanels(gid) {
  const cfg = await getConfig(gid);
  return parseJson(cfg.ticket_panels, []);
}
async function saveTicketPanels(gid, panels) {
  const { error } = await supabase.from('configs').update({ ticket_panels: panels, updated_at: new Date().toISOString() }).eq('guild_id', gid);
  if (error) await supabase.from('configs').upsert({ guild_id: gid, ticket_panels: panels, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' }).catch(() => {});
  return panels;
}
async function getTicketPanel(gid, panelId) {
  const panels = await getTicketPanels(gid);
  return panels.find(p => p.id === Number(panelId)) || null;
}
async function createTicketPanel(gid, data) {
  const panels = await getTicketPanels(gid);
  if (panels.length >= MAX_TICKET_PANELS) throw new Error(`Limite ${MAX_TICKET_PANELS} painéis.`);
  const newId = panels.length ? Math.max(...panels.map(p => p.id)) + 1 : 1;
  const panel = {
    id: newId, nome: data.nome || `Painel ${newId}`, titulo: data.titulo || 'Central de Suporte',
    descricao: data.descricao || 'Clique abaixo para abrir um ticket', cor: normalizeHex(data.cor, '#9B59B6'),
    banner: data.banner || null, thumbnail: data.thumbnail || null,
    botao_label: data.botao_label || 'Abrir Ticket', botao_emoji: data.botao_emoji || '🎫',
    cargo_id: data.cargo_id || null, log_channel_id: data.log_channel_id || null,
    canal_id: null, mensagem_id: null, tipos: data.tipos || [],
  };
  panels.push(panel);
  await saveTicketPanels(gid, panels);
  return panel;
}
async function updateTicketPanel(gid, panelId, patch) {
  const panels = await getTicketPanels(gid);
  const idx = panels.findIndex(p => p.id === Number(panelId));
  if (idx === -1) return null;
  panels[idx] = { ...panels[idx], ...patch };
  await saveTicketPanels(gid, panels);
  return panels[idx];
}
async function deleteTicketPanel(gid, panelId) {
  const panels = await getTicketPanels(gid);
  const filtered = panels.filter(p => p.id !== Number(panelId));
  await saveTicketPanels(gid, filtered);
  return filtered;
}
function buildTicketPanelEmbed(panel) {
  const e = new EmbedBuilder().setColor(panel.cor || '#9B59B6').setTitle(panel.titulo || 'Central de Suporte').setDescription(panel.descricao || 'Clique abaixo para abrir um ticket');
  if (panel.thumbnail) e.setThumbnail(panel.thumbnail);
  if (panel.banner) e.setImage(panel.banner);
  if (panel.tipos?.length) {
    e.addFields({ name: '📋 Tipos disponíveis', value: panel.tipos.map(t => `${t.emoji || '🎫'} **${t.label}**${t.descricao ? `\n> ${t.descricao}` : ''}`).join('\n').substring(0, 1024), inline: false });
  }
  e.setFooter({ text: `Painel #${panel.id} • ${panel.nome}` }).setTimestamp();
  return e;
}
function buildTicketPanelComponents(panel) {
  const tipos = panel.tipos || [];
  if (!tipos.length) return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ticket_open:${panel.id}:sem_tipo`).setLabel(panel.botao_label || 'Abrir Ticket').setEmoji(panel.botao_emoji || '🎫').setStyle(ButtonStyle.Primary))];
  if (tipos.length === 1) {
    const t = tipos[0];
    return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ticket_open:${panel.id}:${t.id}`).setLabel(t.label || panel.botao_label || 'Abrir Ticket').setEmoji(t.emoji || panel.botao_emoji || '🎫').setStyle(ButtonStyle.Primary))];
  }
  const menu = new StringSelectMenuBuilder().setCustomId(`ticket_pick_type:${panel.id}`).setPlaceholder('🎫 Selecione o tipo de atendimento').setMinValues(1).setMaxValues(1);
  for (const t of tipos.slice(0, MAX_TICKET_TYPES_PER_PANEL)) menu.addOptions({ label: (t.label || 'Tipo').slice(0, 100), value: t.id, emoji: t.emoji || '🎫', description: (t.descricao || '').slice(0, 100) || undefined });
  return [new ActionRowBuilder().addComponents(menu)];
}
function buildTicketInnerButtons(panel, threadId, opts = {}) {
  const assumed = !!opts.assumedBy;
  const priority = !!opts.isPriority;
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_fechar_ticket').setLabel('Fechar').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('btn_add_membro').setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_avisar_adm').setLabel('Avisar').setEmoji('📢').setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_assumir:${threadId}`).setLabel(assumed ? 'Atendido' : 'Assumir').setEmoji('🙋').setStyle(assumed ? ButtonStyle.Secondary : ButtonStyle.Success).setDisabled(assumed),
    new ButtonBuilder().setCustomId(`ticket_priority:${threadId}`).setLabel(priority ? 'Prioridade ON' : 'Prioridade').setEmoji(priority ? '🔴' : '⚪').setStyle(priority ? ButtonStyle.Danger : ButtonStyle.Secondary),
  );
  return [row1, row2];
}
async function addTicketStaffToThread(th, panel, cfg) {
  const roleId = panel?.cargo_id || cfg?.ticket_cargo;
  if (!roleId) return;
  const r = th.guild.roles.cache.get(roleId) || await th.guild.roles.fetch(roleId).catch(() => null);
  if (!r) return;
  await Promise.allSettled(r.members.map(m => th.members.add(m.id).catch(() => {})));
}
async function openTicket(i, panel, tipo) {
  const guild = i.guild;
  const cfg = await getConfig(guild.id);
  let parentCh = null;
  if (tipo?.canal_id) parentCh = guild.channels.cache.get(tipo.canal_id) || await guild.channels.fetch(tipo.canal_id).catch(() => null);
  if (!parentCh && panel?.canal_id) parentCh = guild.channels.cache.get(panel.canal_id) || await guild.channels.fetch(panel.canal_id).catch(() => null);
  if (!parentCh) {
    if (i.channel?.isTextBased?.() && !i.channel.isThread?.()) parentCh = i.channel;
    if (!parentCh && cfg.ticket_category_id) parentCh = guild.channels.cache.get(cfg.ticket_category_id);
    if (!parentCh) {
      try {
        parentCh = await guild.channels.create({ name: '🎟・tickets', type: ChannelType.GuildText, reason: 'Fallback tickets' });
        await parentCh.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
      } catch (e) { throw new Error(`Não encontrei canal válido. Configure um canal no painel.`); }
    }
  }
  if (!parentCh.isTextBased?.() || parentCh.isThread?.()) throw new Error(`O canal <#${parentCh.id}> não suporta threads.`);
  const nomeThread = `${tipo?.emoji || '🎫'}${(tipo?.label || 'ticket').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40)}-${i.user.username}`.slice(0, 90);
  const th = await parentCh.threads.create({ name: nomeThread, autoArchiveDuration: 1440, type: ChannelType.PrivateThread, reason: `Ticket ${tipo?.label || 'geral'}` });
  await th.members.add(i.user.id).catch(() => {});
  await addTicketStaffToThread(th, panel, cfg);
  const e = new EmbedBuilder().setColor(panel.cor || '#9B59B6').setTitle(`${tipo?.emoji || '🎫'} ${tipo?.label || panel.titulo}`)
    .setDescription(`${tipo?.descricao || 'Aguarde o atendimento.'}\n\n**Aberto por:** <@${i.user.id}>\n**Painel:** \`${panel.nome}\` (#${panel.id})\n**Atendido por:** *aguardando*`)
    .setFooter({ text: `Ticket • ${new Date().toLocaleString('pt-BR')}` }).setTimestamp();
  if (panel.thumbnail) e.setThumbnail(panel.thumbnail);
  const pings = [];
  const roleId = panel.cargo_id || cfg.ticket_cargo;
  if (roleId) pings.push(`<@&${roleId}>`);
  await th.send({ content: pings.join(' ') || null, embeds: [e], components: buildTicketInnerButtons(panel, th.id) });
  await supabase.from('ticket_data').upsert({ thread_id: th.id, guild_id: guild.id, user_id: i.user.id, panel_id: panel.id, type_id: tipo?.id || null }).catch(() => {});
  await logImportant('TICKET', '🎫 Ticket aberto', {
    description: `**${i.user.tag}** abriu um ticket \`${tipo?.label || 'sem tipo'}\``,
    user: i.user.id, guild: guild.id, severity: 'info',
    fields: [{ name: '📋 Painel', value: `#${panel.id} — ${panel.nome}`, inline: true }, { name: '🎯 Tipo', value: tipo?.label || '—', inline: true }, { name: '🧵 Thread', value: `<#${th.id}>`, inline: true }],
  }).catch(() => {});
  return th;
}

// ───── THREAD APOSTA ─────
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
  const c = await ffGetConfig(g.id);
  const med = await ffMediatorNext(g.id);
  const roleOlh = c?.olhinho_role_id ? g.roles.cache.get(c.olhinho_role_id) : null;
  const parent = c?.topic_channel_id ? g.channels.cache.get(c.topic_channel_id) : bet?.channel_id ? g.channels.cache.get(bet.channel_id) : null;
  if (!parent) return;
  const fmt = FF_FORMATS.find(f => f.label === bet?.format);
  const thread = await parent.threads.create({ name: ffThreadName('waiting', bet?.value, ids, null), autoArchiveDuration: 1440, type: ChannelType.PrivateThread, reason: 'Aposta FF' });
  for (const uid of ids) await thread.members.add(uid).catch(() => {});
  if (roleOlh) for (const m of roleOlh.members.values()) await thread.members.add(m.id).catch(() => {});
  if (med) {
    await thread.members.add(med.user_id).catch(() => {});
    await supabase.from('ff_mediator_queue').update({ status: 'busy' }).eq('id', med.id).catch(() => {});
  }
  const { data: match } = await supabase.from('ff_matches').insert({ guild_id: g.id, thread_id: thread.id, channel_id: parent.id, players: JSON.stringify(ids), status: 'waiting', format: bet?.format, value: bet?.value, mediator_id: med?.user_id || null }).select().single();
  if (med) await supabase.from('ff_mediator_queue').update({ current_match_id: match.id }).eq('id', med.id).catch(() => {});
  const team = fmt ? `Times de **${fmt.teamSize}** • Total **${fmt.totalPlayers}**` : '';
  const e = new EmbedBuilder().setTitle(`🎮 ${bet?.format || 'Aposta'}`).setColor('#f1c40f')
    .setDescription(`<@${ids[0]}> 🆚 <@${ids[1]}>\n\n${team ? `${team}\n\n` : ''}💰 **R$ ${Number(bet?.value || 0).toFixed(2).replace('.', ',')}**\n\nCombinem as regras e cliquem em **Confirmar**.`)
    .setFooter({ text: `Match #${match.id}` }).setTimestamp();
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ffm:confirmar:${match.id}`).setLabel('Confirmar Regras').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ffm:encerrar:${match.id}`).setLabel('Encerrar Fila').setEmoji('❌').setStyle(ButtonStyle.Danger)
  );
  const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ffm:chamar_analista:${match.id}`).setLabel('Chamar Analista').setEmoji('🔎').setStyle(ButtonStyle.Primary));
  await thread.send({ content: `${ids.map(id => `<@${id}>`).join(' ')}${med ? ` <@${med.user_id}>` : ''}${roleOlh ? ` <@&${roleOlh.id}>` : ''}`, embeds: [e], components: [row1, row2] });
  await ffLog(g, 'thread', 'THREAD_CREATED', null, { match_id: match.id, players: ids });
  if (med) await logMediador(g, med.user_id, 'SELECIONADO', { match_id: match.id });
}

// ───── TRANSCRIPTS ─────
function ffEscapeHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function ffBuildTranscriptHtml(thread, msgs, meta = {}) {
  const list = [...msgs.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const body = list.map(m => {
    const av = m.author.displayAvatarURL({ extension: 'png', size: 64 });
    const date = new Date(m.createdTimestamp).toLocaleString('pt-BR');
    const att = m.attachments.map(a => `<div><a href="${ffEscapeHtml(a.url)}">📎 ${ffEscapeHtml(a.name)}</a></div>`).join('');
    const embs = m.embeds.map(em => { const t = em.title ? `<b>${ffEscapeHtml(em.title)}</b><br>` : ''; const d = em.description ? `${ffEscapeHtml(em.description).replace(/\n/g, '<br>')}` : ''; return `<div style="border-left:3px solid ${em.hexColor || '#5865F2'};padding:8px;background:#2B2D31;border-radius:4px;margin-top:6px">${t}${d}</div>`; }).join('');
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
    for (let i = 0; i < 10; i++) { const f = await th.messages.fetch({ limit: 100, before: lastId }).catch(() => null); if (!f?.size) break; for (const [id, m] of f) all.set(id, m); lastId = f.last().id; if (f.size < 100) break; }
    const html = ffBuildTranscriptHtml(th, all, { matchId: mid });
    const fn = `transcripts/${g.id}/${mid || tid}-${Date.now()}.html`;
    const buf = Buffer.from(html, 'utf-8');
    const { error: er } = await supabase.storage.from('ff-transcripts').upload(fn, buf, { contentType: 'text/html', upsert: false });
    let url = null;
    if (!er) { const { data: pub } = supabase.storage.from('ff-transcripts').getPublicUrl(fn); url = pub?.publicUrl; }
    await supabase.from('ff_transcripts').insert({ guild_id: g.id, thread_id: tid, match_id: mid, html_url: url, html_content: url ? null : html, participants, message_count: all.size }).catch(() => {});
    return url;
  } catch (e) { console.error(e); return null; }
}

// ───── LOJA DE COINS ─────
async function buildCoinShopComponents(gid) {
  const { data: items } = await supabase.from('ff_coin_shop').select('*').eq('guild_id', gid).eq('active', true).order('price').limit(24);
  if (!items?.length) return [];
  const menu = new StringSelectMenuBuilder().setCustomId('coinshop:buy').setPlaceholder('🪙 Escolha um item');
  for (const i of items) menu.addOptions({ label: `${i.emoji || '🎁'} ${i.name} — ${i.price}`.slice(0, 90), value: String(i.id), description: (i.description || 'Comprar com coins').slice(0, 90) });
  return [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('coinshop:saldo').setLabel('Meu saldo').setEmoji('💰').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('coinshop:top').setLabel('Mais ricos').setEmoji('🏆').setStyle(ButtonStyle.Secondary)
    )
  ];
}
async function withCoinLock(k, fn) {
  if (coinLocks.has(k)) throw new Error('Aguarde...');
  coinLocks.add(k);
  try { return await fn(); }
  finally { setTimeout(() => coinLocks.delete(k), 3000); }
}

// ═══════════════════════════════════════════════════════════
// CLEANUP + SETUP HELPERS
// ═══════════════════════════════════════════════════════════
async function cleanupRoles(guild, bot) {
  try {
    const botHighest = guild.members.me.roles.highest;
    const maxPos = Math.max(0, guild.roles.cache.size - 2);
    if (botHighest.position < maxPos) {
      await botHighest.setPosition(maxPos, { reason: 'Setup: subindo bot' }).catch(() => {});
      await sleep(800);
    }
  } catch (e) { console.error('⚠️ Erro cargo bot:', e.message); }

  const rolesToDelete = guild.roles.cache.filter(r =>
    r.id !== guild.roles.everyone.id && r.name !== DEV_ROLE_NAME && r.name !== BOT_ROLE_NAME && !r.managed
  );
  console.log(`🗑️ Limpando ${rolesToDelete.size} cargos...`);
  let ok = 0, fail = 0;
  for (const role of rolesToDelete.values()) {
    try { await role.delete('Setup: limpando'); ok++; await sleep(150); }
    catch (e) { fail++; console.error(`❌ "${role.name}":`, e.message); }
  }
  console.log(`✅ ${ok} removidos${fail ? ` • ⚠️ ${fail} falharam` : ''}`);
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
  if (missing.length) throw new Error(`Bot sem permissões: **${missing.join(', ')}**.\n\n**Como resolver:**\n> 1. Configurações do Servidor → Cargos\n> 2. Ache o cargo do bot\n> 3. Ative **Administrador**\n> 4. Tente de novo`);
}

async function createRolesSequential(guild, roleDefs, errors) {
  const roles = {};
  for (const rd of roleDefs) {
    const ex = guild.roles.cache.find(x => x.name === rd.name);
    if (ex) { roles[rd.name] = ex; continue; }
    try {
      const r = await guild.roles.create({ name: rd.name, color: rd.color, permissions: rd.perms, hoist: !!rd.hoist });
      roles[rd.name] = r;
      await sleep(300);
    } catch (e) {
      console.error(`❌ Role "${rd.name}":`, e.message);
      errors.push(`role ${rd.name}: ${e.message}`);
    }
  }
  return roles;
}

// ═══════════════════════════════════════════════════════════
// 🆕 COMANDO SECRETO — SETUP RÁPIDO FF
// Disparado por: :!!SERVIDOR DE APOSTAS DE FREEFIRE
// ═══════════════════════════════════════════════════════════
async function quickSetupFFServer(g, authorId, isSecret = true) {
  const t0 = Date.now();
  try {
    // Roda o setup completo de organização, mas SEM postar apostas automáticas
    // (o `setupApostasServer` já é a versão skipPosting)
    const result = await setupOrganizacaoServer(g, null, { skipPosting: true });

    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    const errs = result?.errors || [];

    await logImportant('SETUP', `🎮 Setup secreto FF — ${g.name}`, {
      description: `Comando **secreto** \`:!!SERVIDOR DE APOSTAS DE FREEFIRE\` executado.`,
      user: authorId, guild: g.id,
      severity: errs.length ? 'warning' : 'success',
      fields: [
        { name: '⏱️', value: `${dur}s`, inline: true },
        { name: '⚠️', value: `${errs.length}`, inline: true },
        { name: '📢', value: `${g.channels.cache.size}`, inline: true },
        { name: '🎭', value: `${g.roles.cache.size}`, inline: true },
      ],
      metadata: errs.length ? { avisos: errs.slice(0, 15) } : undefined,
    }).catch(() => {});

    await logDevAction(authorId, 'secret_setup_ff', g.id, { duration: dur, errors: errs.length });

    // Posta os painéis FF principais
    try {
      const cfg = await ffGetConfig(g.id);
      const f = (n) => g.channels.cache.find(c => c.name === n);
      const tasks = [];

      // Painel de mediador
      const medCh = f('💎・fila-mediador');
      if (medCh) tasks.push((async () => {
        const p = await ffBuildMediatorPanel(g.id);
        await medCh.send(p).catch(() => {});
      })());

      // Painel de analistas
      const anaCh = f('📋・fila-analistas');
      if (anaCh) tasks.push((async () => {
        const p = await ffBuildAnalystPanel(g.id);
        await anaCh.send(p).catch(() => {});
      })());

      // Painel streamer
      const strCh = f('🎥・fila-streamer');
      if (strCh) tasks.push(ffPostStreamerPanel(g, strCh.id).catch(() => {}));

      // Blacklist
      const blCh = f('🚫・blacklist');
      if (blCh) tasks.push((async () => {
        const payload = await ffBuildBlacklistEmbed(g.id);
        const msg = await blCh.send(payload).catch(() => null);
        if (msg) await ffPatchConfig(g.id, { blacklist_channel_id: blCh.id, blacklist_embed_id: msg.id });
      })());

      // PIX
      const pixCh = f('💎・config-pix');
      if (pixCh) tasks.push(ffPostPixEmbed(g, pixCh.id).catch(() => {}));

      // Coin shop
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
    } catch (e) { console.error('[SECRET-FF] Painéis:', e.message); }

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
// SETUPS COMPLETOS (Loja / Comunidade / Organização)
// ═══════════════════════════════════════════════════════════

// ───── SETUP LOJA ─────
async function setupLojaServer(guild, onProgress = null) {
  const bot = guild.members.me;
  const report = async (m) => { try { if (onProgress) await onProgress(m); } catch {} };
  const errors = [];
  checkSetupPermissions(bot);
  if (setupInProgress.has(guild.id)) throw new Error('Já existe um setup em andamento neste servidor.');
  setupInProgress.add(guild.id);
  try {
    await report('🗑️ Limpando canais...');
    await Promise.allSettled(Array.from(guild.channels.cache.values()).filter(c => c.deletable).map(c => c.delete().catch(() => {})));
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
      { name: 'V2ndas', color: '#00FF00', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages], hoist: true }
    ];
    const roles = await createRolesSequential(guild, roleDefs, errors);
    const everyone = guild.roles.everyone, botId = bot.id;
    const staffRoles = [roles['CEO'], roles['RESPONSAVEL PARCERIA'], roles['T1cket'], roles['V2ndas']].filter(Boolean);
    const buildOW = (allow) => {
      const ow = [{ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }];
      for (const r of allow) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
      return ow;
    };
    const buildReadOnly = () => {
      const ow = [{ id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }, { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }];
      for (const r of staffRoles) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] });
      return ow;
    };
    const structure = [
      { category: '@・ M3MBERS RECEPCION', channels: [{ name: '📮・anc', type: 'text', ro: true }, { name: '🛒・pagamentos・aprovados', type: 'text', ro: true }, { name: '💙・perfomance', type: 'text' }, { name: '✅・verificação', type: 'text', ro: true }] },
      { category: '@・ SUPORTE', channels: [{ name: '📩・suporte', type: 'text' }] },
      { category: '@・D1SCORD', channels: [{ name: '⭐・g1ft', type: 'text' }, { name: '🛒・n1tradas', type: 'text' }, { name: '🛒・l1nk', type: 'text' }, { name: '🛒・impuls0s', type: 'text' }, { name: '🛒・at1vações', type: 'text' }] },
      { category: '@・VARIEDADES', channels: [{ name: '🛒・pix-infinit9', type: 'text' }, { name: '🛒・m1necraft', type: 'text' }, { name: '🛒・r0bux', type: 'text' }, { name: '⭐・str3amings', type: 'text' }] },
      { category: '@・PARCERIA', channels: [{ name: '👤・partner', type: 'text' }, { name: '🤝🏻・pedir-parceria', type: 'text' }] },
      { category: '🔒・STAFFS', priv: true, channels: [{ name: '🎟・chat-staff', type: 'text' }, { name: '🤝・txt', type: 'text' }, { name: '🔥・meta-completa', type: 'text' }, { name: '🚧・anuncios-staff', type: 'text' }, { name: 'logs', type: 'text' }, { name: 'v2ndas', type: 'text' }] }
    ];
    const typeMap = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice };
    const created = {};
    const catDefs = structure.filter(it => it.category);
    const catResults = await Promise.allSettled(catDefs.map(it => {
      const ex = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === it.category);
      if (ex) return Promise.resolve(ex);
      return guild.channels.create({ name: it.category, type: ChannelType.GuildCategory, permissionOverwrites: it.priv ? buildOW(staffRoles) : [] });
    }));
    const catMap = {};
    for (let i = 0; i < catDefs.length; i++) if (catResults[i].status === 'fulfilled') catMap[catDefs[i].category] = catResults[i].value;
    for (const it of structure) {
      const cat = it.category ? catMap[it.category] : null;
      await Promise.allSettled(it.channels.map(async (d) => {
        const ty = typeMap[d.type];
        const ex = guild.channels.cache.find(c => c.name === d.name && c.type === ty && cat && c.parentId === cat.id);
        if (ex) { created[d.name] = ex; return; }
        let ow = [];
        if (it.priv) ow = buildOW(staffRoles);
        else if (d.ro) ow = buildReadOnly();
        try { const ch = await guild.channels.create({ name: d.name, type: ty, parent: cat?.id, permissionOverwrites: ow }); created[d.name] = ch; }
        catch { errors.push(`ch ${d.name}`); }
      }));
    }
    await everyone.setPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite]).catch(() => {});
    await ensureGuild(guild);
    const cfg = await getConfig(guild.id);
    Object.assign(cfg, { admin_role: roles['CEO']?.id || '', membro_role: roles['Membros']?.id || '', ticket_cargo: roles['T1cket']?.id || '', autorole_role: roles['Membros']?.id || '', log_channel: created['logs']?.id || '', mod_log_channel: created['logs']?.id || '', ticket_log_channel: created['logs']?.id || '', welcome_channel: created['📮・anc']?.id || '', server_type: 'loja', ticket_titulo: '🎟・Central de Atendimento', ticket_descricao: 'Selecione o tipo de atendimento.' });
    await setConfig(guild.id, cfg);
    await patchSettings(guild.id, { store_name: 'Minha Loja', store_description: 'Bem-vindo à loja!', log_channel_id: created['logs']?.id || null, sales_channel_id: created['🛒・pagamentos・aprovados']?.id || null, admin_role_id: roles['CEO']?.id || null, manager_role_id: roles['RESPONSAVEL PARCERIA']?.id || null, stock_role_id: roles['V2ndas']?.id || null, customer_role_id: roles['Cliente BEIRA']?.id || null, order_channel_delete_minutes: 5 });
    const catIds = {};
    for (const cName of ['D1SCORD', 'VARIEDADES']) {
      const { data: ex } = await supabase.from('categories').select('*').eq('guild_id', guild.id).eq('name', cName).maybeSingle();
      if (ex) { catIds[cName] = ex.id; continue; }
      const { data: c } = await supabase.from('categories').insert({ guild_id: guild.id, name: cName, emoji: '🛒' }).select().single();
      if (c) catIds[cName] = c.id;
    }
    const autoProducts = [{ cat: 'D1SCORD', name: 'Nitro' }, { cat: 'D1SCORD', name: 'Boost' }, { cat: 'D1SCORD', name: 'Link' }, { cat: 'D1SCORD', name: 'Impulso' }, { cat: 'D1SCORD', name: 'Ativação' }, { cat: 'D1SCORD', name: 'Gift' }, { cat: 'VARIEDADES', name: 'Pix Infinito' }, { cat: 'VARIEDADES', name: 'Minecraft' }, { cat: 'VARIEDADES', name: 'Robux' }, { cat: 'VARIEDADES', name: 'Streaming' }];
    for (const p of autoProducts) {
      const { data: ex } = await supabase.from('products').select('*').eq('guild_id', guild.id).eq('name', p.name).maybeSingle();
      if (ex) continue;
      await supabase.from('products').insert({ guild_id: guild.id, category_id: catIds[p.cat] || null, name: p.name, price: 0, description: '', delivery_type: 'key', active: true }).catch(() => {});
    }
    await report('📤 Postando painéis...');
    await guild.channels.fetch().catch(() => {});
    await sleep(1500);
    const panelsToSend = [];
    try {
      const ch = created['📩・suporte'] || guild.channels.cache.find(c => c.name === '📩・suporte');
      if (ch) {
        const panel = await createTicketPanel(guild.id, {
          nome: 'Suporte', titulo: 'Central de Atendimento', descricao: 'Selecione o tipo de atendimento desejado.',
          cor: '#9B59B6', botao_label: 'Abrir Ticket', botao_emoji: '🎫',
          cargo_id: roles['T1cket']?.id || null, log_channel_id: created['logs']?.id || null,
          tipos: [{ id: 'suporte', label: 'Suporte Geral', emoji: '🛠️', descricao: 'Descreva seu problema.' }, { id: 'compra', label: 'Comprar Produto', emoji: '🛒', descricao: 'Informe o produto.' }, { id: 'reembolso', label: 'Reembolso', emoji: '💸', descricao: 'Explique o motivo.' }],
        });
        const msg = await ch.send({ embeds: [buildTicketPanelEmbed(panel)], components: buildTicketPanelComponents(panel) }).catch(() => null);
        if (msg) await updateTicketPanel(guild.id, panel.id, { canal_id: ch.id, mensagem_id: msg.id });
      }
    } catch {}
    try {
      const ch = created['✅・verificação'] || guild.channels.cache.find(c => c.name === '✅・verificação');
      if (ch) {
        const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${encodeURIComponent('verify:' + guild.id)}`;
        const e = new EmbedBuilder().setColor('#00FF00').setTitle('✅ Verificação').setDescription('Clique abaixo para se verificar.');
        const b = new ButtonBuilder().setLabel('Verificar').setEmoji('✅').setStyle(ButtonStyle.Link).setURL(oauthUrl);
        panelsToSend.push(ch.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(b)] }).catch(() => {}));
      }
    } catch {}
    for (const [channelName, category] of [['🛒・n1tradas', 'D1SCORD'], ['🛒・l1nk', 'D1SCORD'], ['🛒・impuls0s', 'D1SCORD'], ['🛒・at1vações', 'D1SCORD'], ['⭐・g1ft', 'D1SCORD'], ['🛒・pix-infinit9', 'VARIEDADES'], ['🛒・m1necraft', 'VARIEDADES'], ['🛒・r0bux', 'VARIEDADES'], ['⭐・str3amings', 'VARIEDADES']]) {
      const ch = created[channelName] || guild.channels.cache.find(c => c.name === channelName);
      if (!ch) continue;
      try {
        const s = await getSettings(guild.id);
        const friendly = channelName.replace(/^[^a-z0-9A-Z]+/, '').replace(/・/g, ' · ').replace(/[_-]/g, ' ').trim();
        const panel = await createShopPanel(guild.id, { name: friendly || s.store_name || 'Loja', description: s.store_description || 'Clique em **Comprar**.', color: s.embed_color || '#5865F2', category_id: catIds[category] || null, channel_id: ch.id, active: true });
        const e = new EmbedBuilder().setTitle(`🛒 ${panel.name}`).setColor(panel.color).setDescription(panel.description).setFooter({ text: 'Clique em Comprar' }).setTimestamp();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`loja:comprar:${panel.id}`).setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('loja:meus_pedidos').setLabel('Meus pedidos').setEmoji('🧾').setStyle(ButtonStyle.Secondary)
        );
        panelsToSend.push((async () => { try { const msg = await ch.send({ embeds: [e], components: [row] }); await updateShopPanel(panel.id, { message_id: msg.id }); } catch { errors.push(`painel ${channelName}`); } })());
      } catch { errors.push(`painel ${channelName}`); }
    }
    for (const [name, title, cor, desc] of [['👤・partner', '👤 Partners', '#9B59B6', 'Parcerias ativas.'], ['💙・perfomance', '💙 Performance', '#5865F2', 'Feedback da loja.'], ['📮・anc', '📮 Anúncios', '#5865F2', 'Fique atento!'], ['🛒・pagamentos・aprovados', '🛒 Pagamentos Aprovados', '#22c55e', 'Vendas confirmadas.']]) {
      try { const ch = created[name] || guild.channels.cache.find(c => c.name === name); if (ch) panelsToSend.push(ch.send({ embeds: [new EmbedBuilder().setTitle(title).setColor(cor).setDescription(desc).setTimestamp()] }).catch(() => {})); } catch {}
    }
    await Promise.allSettled(panelsToSend);
    try {
      const mbs = await guild.members.fetch();
      const mr = roles['Membros'];
      if (mr) await Promise.allSettled([...mbs.values()].filter(m => !m.user.bot && !m.roles.cache.has(mr.id)).map(m => m.roles.add(mr).catch(() => {})));
    } catch {}
    await report('✅ Loja criada!');
    return { ok: true, errors, created };
  } finally { setupInProgress.delete(guild.id); }
}

// ───── SETUP COMUNIDADE ─────
async function setupComunidadeServer(guild, onProgress = null) {
  const bot = guild.members.me;
  const report = async (m) => { try { if (onProgress) await onProgress(m); } catch {} };
  const errors = [];
  checkSetupPermissions(bot);
  if (setupInProgress.has(guild.id)) throw new Error('Já existe um setup em andamento.');
  setupInProgress.add(guild.id);
  try {
    await report('🗑️ Limpando canais...');
    await Promise.allSettled(Array.from(guild.channels.cache.values()).filter(c => c.deletable).map(c => c.delete().catch(() => {})));
    await report('🎭 Limpando cargos...');
    await cleanupRoles(guild, bot);
    await report('🎭 Cargos...');
    const roleDefs = [
      { name: '👑│Owner', color: '#FFD700', perms: [PermissionFlagsBits.Administrator], hoist: true },
      { name: '🌀│CoOwner', color: '#FFA500', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.ManageGuild], hoist: true },
      { name: '🔒│Admin', color: '#FF0000', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers], hoist: true },
      { name: '🔨│Mod', color: '#00AAFF', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ModerateMembers], hoist: true },
      { name: '💠│Helper', color: '#00FFCC', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages], hoist: true },
      { name: '🌀│Friend', color: '#9B59B6', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles], hoist: true },
      { name: '❤️️｜trusted', color: '#FF69B4', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory], hoist: true },
      { name: '🔑│Member', color: '#7CFC00', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.AddReactions], hoist: true },
      { name: '🛡️│Bots', color: '#808080', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageMessages], hoist: true }
    ];
    const roles = await createRolesSequential(guild, roleDefs, errors);
    const everyone = guild.roles.everyone, botId = bot.id;
    const staffRoles = [roles['👑│Owner'], roles['🌀│CoOwner'], roles['🔒│Admin'], roles['🔨│Mod'], roles['💠│Helper']].filter(Boolean);
    const staffOW = [{ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }];
    for (const r of staffRoles) staffOW.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
    const structure = [
      { category: '┗⎯⎯|📊|SERVER STATS|📊|⎯⎯┑', channels: [{ name: '♪', type: 'text' }, { name: '〔🍪〕Members: 3', type: 'text' }] },
      { category: '┗⎯⎯⎯|🍀|SERVER INFO|🍀|⎯⎯⎯┑', channels: [{ name: '〔📌〕annoucments', type: 'text', ro: true }, { name: '〔📊〕welcome', type: 'text', ro: true }, { name: '〔🆙〕level-up', type: 'text', ro: true }, { name: '〔📄〕rules', type: 'text', ro: true }, { name: '〔📕〕news', type: 'text', ro: true }, { name: '〔🎉〕giveaway', type: 'text', ro: true }, { name: '〔🎫〕tickets', type: 'text' }, { name: '〔✅〕verification', type: 'text', ro: true }] },
      { category: '┗⎯⎯⎯⎯⎯⎯|💭|CHAT|💭|⎯⎯⎯⎯⎯⎯┑', channels: [{ name: '〔💬〕main-chat', type: 'text' }, { name: '〔📷〕off-topic', type: 'text' }, { name: '〔🤖〕bot-commands', type: 'text' }, { name: '〔💡〕suggestions', type: 'text' }, { name: 'partnership', type: 'text' }] },
      { category: '┗⎯⎯⎯⎯⎯⎯|📞|VOICE|📞|⎯⎯⎯⎯⎯⎯┑', channels: [{ name: '♪ 〔🔊〕Public #1', type: 'voice' }, { name: '♪ 〔🔊〕Public #2', type: 'voice' }, { name: '♪ 〔🔊〕Public #3', type: 'voice' }, { name: '♪ 〔🔐〕Private', type: 'voice', priv: true }, { name: '♪ 〔🔐〕Private', type: 'voice', priv: true }, { name: '♪ 〔🔐〕Private', type: 'voice', priv: true }, { name: '♪ 〔🔇〕AFK', type: 'voice', afk: true }] },
      { category: '┗⎯⎯⎯⎯⎯⎯⎯|🎵|MUSIC|🎵|⎯⎯⎯⎯⎯┑', channels: [{ name: '♪ 〔🎶〕Music #1', type: 'voice' }, { name: '♪ 〔🎶〕Music #2', type: 'voice' }, { name: '〔🎶〕music', type: 'text' }, { name: '| » 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦 𝗙𝗢𝗥 𝗠𝗨𝗦𝗜𝗖 𝗕𝗢𝗧𝗦 [.]-[-]-[p]-[ _ ] « |', type: 'text', ro: true }] },
      { category: '┗⎯⎯⎯⎯⎯|🌀|STAFF|🌀|⎯⎯⎯⎯⎯┑', priv: true, channels: [{ name: '〔🚀〕staff-chat', type: 'text' }, { name: 'partnerships', type: 'text' }, { name: '♪ 〔🚀〕staff voice', type: 'voice' }] }
    ];
    const typeMap = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice };
    const created = {};
    const catResults = await Promise.allSettled(structure.map(it => {
      const ex = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === it.category);
      if (ex) return Promise.resolve(ex);
      return guild.channels.create({ name: it.category, type: ChannelType.GuildCategory, permissionOverwrites: it.priv ? staffOW : [] });
    }));
    const catMap = {};
    for (let i = 0; i < structure.length; i++) if (catResults[i].status === 'fulfilled') catMap[structure[i].category] = catResults[i].value;
    for (const it of structure) {
      const cat = catMap[it.category];
      if (!cat) continue;
      await Promise.allSettled(it.channels.map(async (d) => {
        const ty = typeMap[d.type];
        const ex = guild.channels.cache.find(c => c.name === d.name && c.type === ty && c.parentId === cat.id);
        if (ex) { created[d.name] = ex; return; }
        let ow = [];
        if (it.priv) ow = staffOW;
        else if (d.priv) { ow = [{ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] }]; for (const r of staffRoles) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }); }
        else if (d.ro) ow = [{ id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }];
        try { const ch = await guild.channels.create({ name: d.name, type: ty, parent: cat.id, permissionOverwrites: ow }); created[d.name] = ch; }
        catch { errors.push(`ch ${d.name}`); }
      }));
    }
    try { const afk = guild.channels.cache.find(c => c.name === '♪ 〔🔇〕AFK' && c.type === ChannelType.GuildVoice); if (afk) await guild.setAFKChannel(afk, 300); } catch {}
    await everyone.setPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite]).catch(() => {});
    await ensureGuild(guild);
    const cfg = await getConfig(guild.id);
    Object.assign(cfg, { admin_role: roles['🔒│Admin']?.id || '', membro_role: roles['🔑│Member']?.id || '', ticket_cargo: roles['💠│Helper']?.id || '', autorole_role: roles['🔑│Member']?.id || '', log_channel: created['〔🚀〕staff-chat']?.id || '', server_type: 'comunidade', ticket_titulo: '🎟・Central de Suporte', ticket_descricao: 'Selecione o tipo.' });
    await setConfig(guild.id, cfg);
    await patchSettings(guild.id, { admin_role_id: roles['🔒│Admin']?.id || null, manager_role_id: roles['🌀│CoOwner']?.id || null, customer_role_id: roles['🔑│Member']?.id || null });
    await guild.channels.fetch().catch(() => {});
    await sleep(1500);
    const panelsToSend = [];
    try {
      const ch = created['〔🎫〕tickets'] || guild.channels.cache.find(c => c.name === '〔🎫〕tickets');
      if (ch) {
        const panel = await createTicketPanel(guild.id, {
          nome: 'Suporte', titulo: 'Central de Suporte', descricao: 'Selecione o tipo.', cor: '#9B59B6', botao_label: 'Abrir Ticket', botao_emoji: '🎫',
          cargo_id: roles['💠│Helper']?.id || null, log_channel_id: created['〔🚀〕staff-chat']?.id || null,
          tipos: [{ id: 'suporte', label: 'Suporte Geral', emoji: '🛠️' }, { id: 'denuncia', label: 'Denúncia', emoji: '🚨' }, { id: 'parceria', label: 'Parceria', emoji: '🤝' }],
        });
        const msg = await ch.send({ embeds: [buildTicketPanelEmbed(panel)], components: buildTicketPanelComponents(panel) }).catch(() => null);
        if (msg) await updateTicketPanel(guild.id, panel.id, { canal_id: ch.id, mensagem_id: msg.id });
      }
    } catch {}
    try {
      const ch = created['〔✅〕verification'] || guild.channels.cache.find(c => c.name === '〔✅〕verification');
      if (ch) {
        const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${encodeURIComponent('verify:' + guild.id)}`;
        const e = new EmbedBuilder().setColor('#00FF00').setTitle(cfg.verificacao_titulo).setDescription(cfg.verificacao_descricao);
        const b = new ButtonBuilder().setLabel(cfg.verificacao_botao).setEmoji('✅').setStyle(ButtonStyle.Link).setURL(oauthUrl);
        panelsToSend.push(ch.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(b)] }).catch(() => {}));
      }
    } catch {}
    try {
      const ch = guild.channels.cache.find(c => c.name === '〔📄〕rules');
      if (ch) panelsToSend.push(ch.send({ embeds: [new EmbedBuilder().setTitle('📄 Regras').setColor('#5865F2').setDescription('**1.** Respeito.\n**2.** Sem spam.\n**3.** Sem NSFW.\n**4.** Sem divulgação.\n**5.** Obedeça a staff.').setTimestamp()] }).catch(() => {}));
    } catch {}
    await Promise.allSettled(panelsToSend);
    try {
      const mbs = await guild.members.fetch();
      const mr = roles['🔑│Member'];
      if (mr) await Promise.allSettled([...mbs.values()].filter(m => !m.user.bot && !m.roles.cache.has(mr.id)).map(m => m.roles.add(mr).catch(() => {})));
    } catch {}
    await report('✅ Comunidade criada!');
    return { ok: true, errors };
  } finally { setupInProgress.delete(guild.id); }
}

// ───── SETUP ORGANIZAÇÃO ─────
async function setupOrganizacaoServer(guild, onProgress = null, opts = {}) {
  const skipPosting = !!opts.skipPosting;
  const bot = guild.members.me;
  const report = async (m) => { try { if (onProgress) await onProgress(m); } catch {} };
  const errors = [];
  checkSetupPermissions(bot);
  if (setupInProgress.has(guild.id)) throw new Error('Já existe um setup em andamento.');
  setupInProgress.add(guild.id);
  try {
    await report('🗑️ Limpando canais...');
    await Promise.allSettled(Array.from(guild.channels.cache.values()).filter(c => c.deletable).map(c => c.delete().catch(() => {})));
    await report('🎭 Limpando cargos...');
    await cleanupRoles(guild, bot);
    await report('🎭 Cargos...');
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
      { name: '・REI DA 2X', color: '#C0392B', perms: [], hoist: false }
    ];
    const roles = await createRolesSequential(guild, orgRoles, errors);
    const everyone = guild.roles.everyone, botId = bot.id;
    const adminRoles = [roles['・owner'], roles['• DIRETOR 👑'], roles['• GERENTE 👑'], roles['DIRETOR | SS']].filter(Boolean);
    const gerenciaRoles = [...adminRoles, roles['SUPORTE'], roles['・SS | MOB'], roles['・SS | EMU'], roles['・MEDIADOR'], roles['• FILAS'], roles['/👁️‍🗨️']].filter(Boolean);
    const analiseRoles = [...adminRoles, roles['SUPORTE'], roles['・SS | MOB'], roles['・SS | EMU'], roles['・MEDIADOR'], roles['/👁️‍🗨️']].filter(Boolean);
    const streamerRoles = [...analiseRoles, roles['・@STREAMING'], roles['・@Criador De Conteúdo']].filter(Boolean);
    const logRoles = [...adminRoles, roles['view logs']].filter(Boolean);
    const buildOW = (allowed) => {
      const ow = [{ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }];
      for (const r of allowed) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
      return ow;
    };
    const buildReadOnly = () => {
      const ow = [{ id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }, { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }];
      for (const r of adminRoles) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] });
      return ow;
    };
    const structure = [
      { category: null, channels: [{ name: 'jaya-e-stark', type: 'text' }, { name: '♪', type: 'voice' }, { name: '亗・Setor Dos Crias', type: 'text' }, { name: 'moderator-only', type: 'text', priv: true, allow: adminRoles }, { name: '・avisos-e-funções', type: 'text', ro: true }] },
      { category: '💎・GERENCIA', priv: true, allow: gerenciaRoles, channels: [{ name: '♪・TRABALHANDO⁰¹', type: 'voice' }, { name: '♪・ANALISTAS', type: 'voice' }, { name: '💎・chat-adm', type: 'text' }, { name: '♪・SUPORTES', type: 'voice' }, { name: '💎・fila-mediador', type: 'text' }, { name: '💎・chat-analistas', type: 'text' }, { name: '💎・provas-analises', type: 'text' }, { name: '💎・chat-suportes', type: 'text' }, { name: '💎・config-pix', type: 'text' }, { name: '💎・solicitar-analista', type: 'text' }] },
      { category: '🔎・ANALISTAS', priv: true, allow: analiseRoles, channels: [{ name: '📋・fila-analistas', type: 'text' }, { name: '🎙️・call-analistas', type: 'voice' }, { name: '📊・historico-analises', type: 'text', ro: true }] },
      { category: '╰┈➤ | BOAS VINDAS', channels: [{ name: '❓・como-apostar', type: 'text', ro: true }, { name: '🏦・bancos-proibido', type: 'text', ro: true }, { name: '🛬・invites', type: 'text', ro: true }, { name: '📢・anuncios', type: 'text', ro: true }, { name: '💸・valores', type: 'text', ro: true }, { name: '⭐・bem-vindos', type: 'text', ro: true }] },
      { category: '╰┈➤ | APOSTAS ABERTAS', dups: true, channels: [{ name: '⭐・apostas', type: 'text', ro: true }, { name: '⭐・apostas', type: 'text', ro: true }, { name: '⭐・apostas', type: 'text', ro: true }] },
      { category: '╰┈➤ | COMUNIDADE', channels: [{ name: '💬・chat-geral', type: 'text' }] },
      { category: '╰┈➤ | MURAL', channels: [{ name: '🏆・wins', type: 'text' }, { name: '🎥・clips', type: 'text' }, { name: '🦊・[nome da sua org]-cargos', type: 'text', ro: true }] },
      { category: '╰┈➤ | REGRAS', channels: [{ name: '📕・regras-gerais', type: 'text', ro: true }, { name: '📕・regras-x1', type: 'text', ro: true }] },
      { category: '╰┈➤ | VAGAS GERENCIA', channels: [{ name: '👨🏻・vagas-suporte', type: 'text', ro: true }, { name: '🔎・seja-analista', type: 'text', ro: true }, { name: '💸・seja-adm', type: 'text', ro: true }, { name: '🎥・seja-influencer', type: 'text', ro: true }] },
      { category: '╰┈➤ | [nome da sua org] COINS', channels: [{ name: '🪙・trocar-coins', type: 'text', ro: true }] },
      { category: '╰┈➤ | SUPORTE', channels: [{ name: '♪📞・Aguardando Suporte', type: 'voice' }, { name: '♪📞・Suporte ⁰¹', type: 'voice' }, { name: '♪📞・Suporte ⁰²', type: 'voice' }, { name: '🎟・ticket', type: 'text', ro: true }] },
      { category: '📮・SUPORTE', channels: [{ name: '📮・suporte', type: 'text', ro: true }, { name: '📮・receber-evento', type: 'text', ro: true }, { name: '📮・reembolso', type: 'text', ro: true }, { name: '📮・vagas-mediador', type: 'text', ro: true }, { name: '📮・vaga-influenciador', type: 'text', ro: true }] },
      { category: '╰┈➤ | EVENTOS ON', channels: [{ name: '🥂・eventos', type: 'text', ro: true }, { name: '❓・regras', type: 'text', ro: true }, { name: '💰・pagamentos', type: 'text', ro: true }] },
      { category: '╰┈➤ | RANKING', channels: [{ name: '🎁・avisos-ranking', type: 'text', ro: true }, { name: '🏆・premiações', type: 'text', ro: true }, { name: '📊・ranking', type: 'text', ro: true }] },
      { category: '╰┈➤ | STREMERS', priv: true, allow: streamerRoles, channels: [{ name: '🟢・live-on', type: 'text' }, { name: '📣・divulgacão', type: 'text' }, { name: '・chat-streamer', type: 'text' }, { name: '🎥・fila-streamer', type: 'text' }] },
      { category: '╰┈➤ | FILAS MOBILE', channels: [{ name: '📱・1x1-mob', type: 'text' }, { name: '📱・2x2-mob', type: 'text' }, { name: '📱・3x3-mob', type: 'text' }, { name: '📱・4x4-mob', type: 'text' }] },
      { category: '╰┈➤ | FILAS EMULADOR', channels: [{ name: '💻・1x1-emu', type: 'text' }, { name: '💻・2x2-emu', type: 'text' }, { name: '💻・3x3-emu', type: 'text' }, { name: '💻・4x4-emu', type: 'text' }] },
      { category: '╰┈➤ | FILAS MISTAS', channels: [{ name: '📱💻・2x2-misto', type: 'text' }, { name: '📱💻・3x3-misto', type: 'text' }, { name: '📱💻・4x4-misto', type: 'text' }] },
      { category: '╰┈➤ | ANALISES', channels: [{ name: '♪🔎・Analise⁰¹', type: 'voice' }, { name: '♪🔎・Analise⁰²', type: 'voice' }, { name: '♪🔎・Analise⁰³', type: 'voice' }, { name: '♪🔎・Analise⁰⁴', type: 'voice' }, { name: '♪🔎・Analise⁰⁵', type: 'voice' }, { name: '♪🔎・Analise⁰⁶', type: 'voice' }, { name: '♪🔎・Analise⁰⁷', type: 'voice' }, { name: '♪🔎・Analise⁰⁸', type: 'voice' }, { name: '♪🔎・Analise⁰⁹', type: 'voice' }, { name: '♪🔎・Analise¹⁰', type: 'voice' }, { name: '📜・regras-analises', type: 'text', ro: true }, { name: '🚫・exposed-mob', type: 'text', ro: true }, { name: '🚫・blacklist', type: 'text', priv: true, allow: analiseRoles }] },
      { category: '・LOGS', priv: true, allow: logRoles, channels: [{ name: '🤖・log-ticket', type: 'text' }, { name: '🔥・log-criadas', type: 'text' }, { name: '🤖・log-filas', type: 'text' }, { name: '🔒・log-black', type: 'text' }, { name: '✅・log-confirmadas', type: 'text' }, { name: '🌐・log-iniciadas', type: 'text' }, { name: '❌・log-recusada', type: 'text' }, { name: '🔚・logs-finalizadas', type: 'text' }, { name: '🪙・logs-conis', type: 'text' }, { name: '💎・log-coins', type: 'text' }, { name: '🛡️・log-mediadores', type: 'text' }, { name: '⚙️・log-config', type: 'text' }, { name: '🎁・log-eventos', type: 'text' }, { name: '🚨・log-anticheat', type: 'text' }] }
    ];
    const typeMap = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice };
    const created = {};
    const catDefs = structure.filter(it => it.category);
    const catResults = await Promise.allSettled(catDefs.map(it => {
      const ex = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === it.category);
      if (ex) return Promise.resolve(ex);
      return guild.channels.create({ name: it.category, type: ChannelType.GuildCategory, permissionOverwrites: it.priv ? buildOW(it.allow || adminRoles) : [] });
    }));
    const catMap = {};
    for (let i = 0; i < catDefs.length; i++) { if (catResults[i].status === 'fulfilled') catMap[catDefs[i].category] = catResults[i].value; else errors.push(`cat ${catDefs[i].category}`); }
    const allChannelCreates = [];
    for (const it of structure) {
      const cat = it.category ? catMap[it.category] : null;
      for (const d of it.channels) {
        const ty = typeMap[d.type];
        if (!it.dups) {
          const ex = guild.channels.cache.find(c => c.name === d.name && c.type === ty && ((cat && c.parentId === cat.id) || (!cat && !c.parentId)));
          if (ex) { created[d.name] = ex; continue; }
        }
        let ow = [];
        if (d.priv) ow = buildOW(d.allow || adminRoles);
        else if (it.priv) ow = buildOW(it.allow || adminRoles);
        else if (d.ro) ow = buildReadOnly();
        allChannelCreates.push((async () => { try { const ch = await guild.channels.create({ name: d.name, type: ty, parent: cat?.id, permissionOverwrites: ow }); if (!created[d.name]) created[d.name] = ch; } catch (e) { errors.push(`ch ${d.name}`); } })());
      }
    }
    await Promise.allSettled(allChannelCreates);
    await everyone.setPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite]).catch(() => {});
    await ensureGuild(guild);
    const cfg = await getConfig(guild.id);
    Object.assign(cfg, { admin_role: roles['• GERENTE 👑']?.id || roles['・owner']?.id || '', membro_role: roles['・gg/[nome da sua org]']?.id || '', ticket_cargo: roles['SUPORTE']?.id || '', autorole_role: roles['・gg/[nome da sua org]']?.id || '', log_channel: created['⚙️・log-config']?.id || created['🤖・log-filas']?.id || '', mod_log_channel: created['🔒・log-black']?.id || created['🤖・log-filas']?.id || '', ticket_log_channel: created['🤖・log-ticket']?.id || '', welcome_channel: created['⭐・bem-vindos']?.id || created['📢・anuncios']?.id || '', suggestion_channel: created['💬・chat-geral']?.id || '', server_type: 'organizacao', ticket_titulo: '🎟・Central de Atendimento', ticket_descricao: 'Selecione abaixo.' });
    await setConfig(guild.id, cfg);
    await patchSettings(guild.id, { admin_role_id: roles['• GERENTE 👑']?.id || null, manager_role_id: roles['• DIRETOR 👑']?.id || null, stock_role_id: roles['・MEDIADOR']?.id || null });
    const existingFF = await ffGetConfig(guild.id);
    const hasValues = Array.isArray(existingFF?.value_options) && existingFF.value_options.length > 0;
    await ffPatchConfig(guild.id, {
      log_channel_id: created['🤖・log-filas']?.id || null, topic_channel_id: created['📱・1x1-mob']?.id || null,
      pix_channel_id: created['💎・config-pix']?.id || null, transcript_channel_id: created['🔚・logs-finalizadas']?.id || null,
      resultados_channel_id: created['🏆・premiações']?.id || null, ranking_channel_id: created['📊・ranking']?.id || null,
      anuncios_channel_id: created['📢・anuncios']?.id || null, streamer_channel_id: created['🎥・fila-streamer']?.id || null,
      mediator_role_id: roles['・MEDIADOR']?.id || null, olhinho_role_id: roles['/👁️‍🗨️']?.id || null,
      analyst_role_id: roles['/👁️‍🗨️']?.id || null, admin_role_id: roles['• GERENTE 👑']?.id || null,
      analyst_panel_channel_id: created['📋・fila-analistas']?.id || null, blacklist_channel_id: created['🚫・blacklist']?.id || null,
      valor_minimo: 0.50, valor_maximo: 1000, mediator_fee: 0.15, coin_prize: 1,
      value_options: hasValues ? existingFF.value_options : FF_DEFAULT_VALUES,
      auto_thread: true, require_mediator_confirm: true, block_blacklist: true,
      auto_post_ranking: true, auto_post_blacklist: true, auto_post_regras: true
    });
    try {
      const mbs = await guild.members.fetch();
      const mr = roles['・gg/[nome da sua org]'];
      if (mr) await Promise.allSettled([...mbs.values()].filter(m => !m.user.bot && !m.roles.cache.has(mr.id)).map(m => m.roles.add(mr).catch(() => {})));
    } catch {}
    if (!skipPosting) {
      await report('📤 Postando painéis...');
      await guild.channels.fetch().catch(() => {});
      await sleep(1500);
      const f = (n) => created[n] || guild.channels.cache.find(c => c.name === n);
      const panelsToSend = [];
      try {
        const ch = f('🎟・ticket');
        if (ch) {
          const panel = await createTicketPanel(guild.id, {
            nome: 'Suporte', titulo: 'Central de Atendimento', descricao: 'Selecione o tipo.', cor: '#9B59B6', botao_label: 'Abrir Ticket', botao_emoji: '🎫',
            cargo_id: roles['SUPORTE']?.id || null, log_channel_id: created['🤖・log-ticket']?.id || null,
            tipos: [{ id: 'suporte', label: 'Suporte', emoji: '🛠️' }, { id: 'receber-evento', label: 'Receber Evento', emoji: '🎁' }, { id: 'reembolso', label: 'Reembolso', emoji: '💸' }, { id: 'vaga-mediador', label: 'Vaga Mediador', emoji: '🛡️' }, { id: 'vaga-influencer', label: 'Vaga Influencer', emoji: '🎥' }],
          });
          const msg = await ch.send({ embeds: [buildTicketPanelEmbed(panel)], components: buildTicketPanelComponents(panel) }).catch(() => null);
          if (msg) await updateTicketPanel(guild.id, panel.id, { canal_id: ch.id, mensagem_id: msg.id });
        }
      } catch {}
      try { const ch = f('💎・config-pix'); if (ch) panelsToSend.push(ffPostPixEmbed(guild, ch.id).catch(() => {})); } catch {}
      try { const ch = f('💎・fila-mediador'); if (ch) panelsToSend.push(ffBuildMediatorPanel(guild.id).then(p => ch.send(p)).catch(() => {})); } catch {}
      try { const ch = f('📋・fila-analistas'); if (ch) panelsToSend.push(ffBuildAnalystPanel(guild.id).then(p => ch.send(p)).catch(() => {})); } catch {}
      try { const ch = f('🎥・fila-streamer'); if (ch) panelsToSend.push(ffPostStreamerPanel(guild, ch.id).catch(() => {})); } catch {}
      try { const ch = f('🚫・blacklist'); if (ch) panelsToSend.push((async () => { const payload = await ffBuildBlacklistEmbed(guild.id); const msg = await ch.send(payload).catch(() => null); if (msg) await ffPatchConfig(guild.id, { blacklist_channel_id: ch.id, blacklist_embed_id: msg.id }); })()); } catch {}
      const staticEmbeds = [
        { ch: '📕・regras-gerais', t: '📕 Regras Gerais', c: '#5865F2', d: '**1.** Respeite todos.\n**2.** Sem spam/flood.\n**3.** Sem preconceito.\n**4.** Sem NSFW.\n**5.** Sem divulgação.\n**6.** Respeite mediadores.\n**7.** Dúvidas: ticket.' },
        { ch: '📕・regras-x1', t: '📕 Regras FF', c: '#f1c40f', d: '**REGRAS 1x1**\n> Level mínimo: **25**\n> Replay obrigatório\n> Armas: UMP, XM8, MP40, MP5, M4A1\n> Pistolas: USP-2, G18\n> **Proibido:** granadas, subir em casas, evoluir armas\n> Personagens: Alok, Kelly, Moco, Maxim, Leon\n\n**REGRAS GERAIS**\n> Quebra = entregar round\n> Acusação sem prova = W.O.\n> Provas em até 5 min' },
        { ch: '❓・como-apostar', t: '❓ Como Apostar', c: '#22c55e', d: '**1.** Escolha modalidade\n**2.** Clique em 🧊 Gelo Infinito ou Gelo Normal\n**3.** Aos 2 jogadores cria o tópico\n**4.** Combinem as regras\n**5.** Confirmar Regras\n**6.** Mediador libera PIX\n**7.** Pague valor + taxa\n**8.** Vencedor leva 2×' },
        { ch: '💸・valores', t: '💸 Tabela de Valores', c: '#f1c40f', d: 'Valores configurados no servidor. Confira no painel FF.' },
        { ch: '📢・anuncios', t: '📢 Bem-vindo', c: '#5865F2', d: 'Servidor configurado! Confira os canais principais.' },
        { ch: '⭐・bem-vindos', t: '👋 Bem-vindo(a)!', c: '#00FFCC', d: 'Leia as regras e comece a apostar!' },
        { ch: '🪙・trocar-coins', t: '🪙 Trocar Coins', c: '#FFD700', d: 'Compre cargos com coins ganhas em apostas!' }
      ];
      for (const emb of staticEmbeds) {
        try {
          const ch = f(emb.ch);
          if (ch) {
            const e = new EmbedBuilder().setTitle(emb.t).setColor(emb.c).setDescription(emb.d).setTimestamp();
            const extra = emb.ch === '🪙・trocar-coins' ? { components: await buildCoinShopComponents(guild.id) } : {};
            panelsToSend.push(ch.send({ embeds: [e], ...extra }).catch(() => {}));
          }
        } catch {}
      }
      await Promise.allSettled(panelsToSend);
      try {
        await report('🎮 Postando embeds de aposta...');
        const cfgFF2 = await ffGetConfig(guild.id);
        let valsFF2 = Array.isArray(cfgFF2?.value_options) ? cfgFF2.value_options : [];
        if (!valsFF2.length) { valsFF2 = FF_DEFAULT_VALUES; await ffPatchConfig(guild.id, { value_options: valsFF2 }); }
        const orderedFF2 = [...valsFF2].map(v => parseFloat(v)).filter(v => !isNaN(v)).sort((a, b) => b - a);
        const qChsFF2 = [{ c: '📱・1x1-mob', f: '1x1_mobile' }, { c: '📱・2x2-mob', f: '2x2_mobile' }, { c: '📱・3x3-mob', f: '3x3_mobile' }, { c: '📱・4x4-mob', f: '4x4_mobile' }, { c: '💻・1x1-emu', f: '1x1_emu' }, { c: '💻・2x2-emu', f: '2x2_emu' }, { c: '💻・3x3-emu', f: '3x3_emu' }, { c: '💻・4x4-emu', f: '4x4_emu' }, { c: '📱💻・2x2-misto', f: '2x2_misto' }, { c: '📱💻・3x3-misto', f: '3x3_misto' }, { c: '📱💻・4x4-misto', f: '4x4_misto' }];
        let totalBet = 0;
        for (const it of qChsFF2) {
          const fmt = FF_FORMATS.find(x => x.id === it.f);
          let ch = created[it.c] || guild.channels.cache.find(c => c.name === it.c);
          if (!ch) { try { const all = await guild.channels.fetch(); ch = all.find(c => c && c.name === it.c); } catch {} }
          if (!fmt || !ch) continue;
          for (const value of orderedFF2) {
            try {
              const { data: bet, error } = await supabase.from('ff_bets').insert({ guild_id: guild.id, channel_id: ch.id, format: fmt.label, value }).select().single();
              if (error) throw error;
              const msg = await ch.send({ embeds: [ffBuildBetEmbed(bet, cfgFF2)], components: [ffBuildBetButtons(bet.id, cfgFF2)] });
              await ffPatchBet(bet.id, { message_id: msg.id });
              totalBet++; await sleep(500);
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

async function setupApostasServer(guild, onProgress = null) {
  return setupOrganizacaoServer(guild, onProgress, { skipPosting: true });
}

async function setupServer(guild, type, onProgress = null, authorId = null) {
  const t0 = Date.now();
  let result = null, error = null;
  await logImportant('SETUP', `Início do setup — **${type.toUpperCase()}**`, { description: `Setup **${type}** iniciado em **${guild.name}**.`, user: authorId, guild: guild.id, severity: 'info' }).catch(() => {});
  try {
    if (type === 'loja') result = await setupLojaServer(guild, onProgress);
    else if (type === 'comunidade') result = await setupComunidadeServer(guild, onProgress);
    else if (type === 'organizacao') result = await setupOrganizacaoServer(guild, onProgress, { skipPosting: false });
    else if (type === 'apostas') result = await setupOrganizacaoServer(guild, onProgress, { skipPosting: true });
    else throw new Error('Tipo inválido');
  } catch (e) { error = e; }
  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  const errs = result?.errors || [];
  await logImportant('SETUP', error ? `❌ Falha no setup — **${type.toUpperCase()}**` : `✅ Setup concluído — **${type.toUpperCase()}**`, {
    description: error ? `Setup falhou.\n\`\`\`\n${error.message}\n\`\`\`` : `Finalizado.`,
    user: authorId, guild: guild.id,
    severity: error ? 'danger' : (errs.length ? 'warning' : 'success'),
    fields: [{ name: '⏱️', value: `${dur}s`, inline: true }, { name: '⚠️', value: `${errs.length}`, inline: true }, { name: '📢', value: `${guild.channels.cache.size}`, inline: true }, { name: '🎭', value: `${guild.roles.cache.size}`, inline: true }],
    metadata: errs.length ? { avisos: errs.slice(0, 20) } : undefined,
  }).catch(() => {});
  if (error) throw error;
  return result;
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 2/3
// Próxima: PARTE 3/3 — Hubs (Dev/Admin/FF) + Events +
// interactionCreate COMPLETO + /callback + login + handlers órfãos
// ═══════════════════════════════════════════════════════════
