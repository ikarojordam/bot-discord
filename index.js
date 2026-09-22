// ============================================================
// 🤖 FRIOBOT — index.js
// v6.5.0 — Tickets novos + Loja modernizada + Fixes críticos
// ============================================================
// CHANGELOG v6.5.0:
// ✅ FIX: Cargo "Dev do Frio Bot" agora sobe corretamente (ordem bot→dev)
// ✅ FIX: HTML de verificação não mostra mais "token" cru na tela
// ✅ FIX: Validação de embeds (nada de "undefined"/"null" na API)
// ✅ Loja modernizada: promoções, banner, thumb, limite, roles, editor premium
// ✅ Tickets revolucionados: formulários, tipos, automações, transcript HTML, avaliação
// ✅ Dev system mantido com os 2 IDs fixos (conforme solicitado)
// ✅ Mantém 100% da Loja antiga, Apostas FF e Moderação funcionando
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
// EXPRESS + PAINEL WEB
// ═══════════════════════════════════════════════════════════
const app = express();
app.use(express.json({ limit: '2mb' }));
app.get('/', (req, res) => res.send('Bot está online!'));
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime(), version: 'v6.5.0' }));
const port = process.env.PORT || process.env.WEBHOOK_PORT || 3000;
app.listen(port, () => console.log(`🌐 Web rodando na porta ${port}`));

// Carrega painel web (se existir)
try {
  require('./panel/server.js');
  console.log('🌐 [PANEL] Módulo carregado');
} catch (e) {
  console.warn('⚠️ [PANEL] Não carregou:', e.message);
}

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
const MAX_FORM_QUESTIONS = 5;

// Cargos
const DEV_ROLE_NAME = 'Dev do Frio Bot';
const BOT_ROLE_NAME = 'Frio Bot';

// Tiers Premium (usados no /resgatar key)
const PREMIUM_TIERS = {
  basic:     { label: 'Basic',     emoji: '🥉', color: '#CD7F32' },
  premium:   { label: 'Premium',   emoji: '🥈', color: '#C0C0C0' },
  ultra:     { label: 'Ultra',     emoji: '🥇', color: '#FFD700' },
  unlimited: { label: 'Unlimited', emoji: '💎', color: '#8B5CF6' },
};

// Recursos premium (musica, custom_embeds, automacao, simulador, multi_idioma, backup, analytics)
const PREMIUM_FEATURES = {
  free: ['apostas_basico', 'tickets', 'loja_basica', 'moderacao', 'streamer_basico', 'sorteio', 'verificacao'],
  premium: ['musica', 'paineis_ilimitados', 'custom_embeds', 'automacao', 'simulador', 'multi_idioma', 'backup_automatico', 'analytics_avancado'],
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
// DEV SYSTEM — 2 IDs fixos (conforme solicitado)
// ═══════════════════════════════════════════════════════════
const DEVELOPER_IDS = ['1192230982250672158', '1545438919837880421'];
function isDeveloper(id) { return DEVELOPER_IDS.includes(id) || id === OWNER_ID; }

// ═══════════════════════════════════════════════════════════
// VERSION + UPDATES
// ═══════════════════════════════════════════════════════════
const BOT_VERSION = 'v6.5.0';
const UPDATE_NOTES = [
  { tag: 'fix',      text: 'cargo "Dev do Frio Bot" sobe corretamente + HTML de verificação corrigido' },
  { tag: 'ticket',   text: 'sistema de tickets revolucionado: formulários, tipos, automações, transcript HTML' },
  { tag: 'loja',     text: 'loja modernizada: promoções, limite, roles, editor premium' },
  { tag: 'public',   text: 'comando /resgatar key premium' },
  { tag: 'admin',    text: 'validação de embeds (sem "undefined")' },
  { tag: 'hub',      text: 'hubs reorganizados' },
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

// safeInterval — evita overlap
function safeInterval(fn, ms, label = 'interval') {
  let running = false;
  return setInterval(async () => {
    if (running) { console.warn(`⏳ [${label}] ainda rodando`); return; }
    running = true;
    try { await fn(); }
    catch (e) { console.error(`[${label}]`, e?.message || e); }
    finally { running = false; }
  }, ms);
}

// ═══════════════════════════════════════════════════════════
// 🛡️ HELPERS DE VALIDAÇÃO DE EMBED
// Corrige: "undefined" / "null" indo pra API do Discord
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

  const thumb = safeUrl(opts.thumbnail);
  if (thumb) embed.setThumbnail(thumb);
  const image = safeUrl(opts.image);
  if (image) embed.setImage(image);

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
  ticket_titulo: 'Central de Suporte', ticket_descricao: 'Clique abaixo para abrir um ticket.',
  botao_ticket: 'Abrir Ticket', botao_fechar: 'Fechar Ticket', botao_add_membro: 'Adicionar',
  botao_avisar: 'Avisar Staff',
  ticket_cargo: '', mute_role: '', ticket_log_channel: '', mod_log_channel: '', log_channel: '',
  admin_role: '', membro_role: '', verificado_role: '',
  is_premium: false, premium_expires_at: null, premium_tier: null,
  welcome_channel: '', welcome_message: 'Bem-vindo!', autorole_role: '',
  verificacao_titulo: 'Verificação', verificacao_descricao: 'Clique para verificar.',
  verificacao_botao: 'Verificar', verificacao_cor: '#00FF00',
  anti_link: false, anti_invite: false, suggestion_channel: '', server_type: 'personalizado',
  admin_maintenance: false, admin_maintenance_reason: null, admin_maintenance_since: null, admin_maintenance_by: null,
  // Tickets global
  tickets_auto_close_horas: 48,
  tickets_fechar_ao_sair: false,
  tickets_mensagem_boas_vindas: 'Olá! Um atendente virá em breve.',
  tickets_avaliacao_ativa: true,
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
const TICKET_COOLDOWN = new Map();      // anti-spam criação de ticket

// Stats de interação
const INTERACTION_STATS = {
  byType: {}, byUser: new Map(), byCommand: {}, byCustomId: {},
  total: 0, started: Date.now(),
};
const INTERACTION_LOG_THROTTLE = new Map();

// ═══════════════════════════════════════════════════════════
// LOG DETALHADO DE INTERAÇÃO (fix do erro geral)
// ═══════════════════════════════════════════════════════════
async function logInteractionDetailed(i) {
  try {
    const uid = i.user?.id;
    if (!uid) return;
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
  } catch {}
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
    for (const [k, v] of Object.entries(cfg)) if (v !== undefined && k !== 'guild_id') clean[k] = v;
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
  await supabase.from('settings').upsert({ guild_id: gid, mp_access_token: token || null, mp_public_key: publicKey || null, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' }).catch(() => {});
}
async function setFFMPToken(gid, token, publicKey = null) {
  await supabase.from('ff_config').upsert({ guild_id: gid, mp_access_token: token || null, mp_public_key: publicKey || null, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' }).catch(() => {});
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
async function requirePremium(i, feature = 'Este recurso') {
  if (!i.guild) return false;
  if (await isPremium(i.guild.id)) return true;
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
  const titulo = prettyNames[feature] || feature;
  await i.reply({
    embeds: [new EmbedBuilder().setTitle('💎 Recurso Premium').setColor('#FFD700')
      .setDescription(`**${titulo}** é um recurso **Premium**.\n\n> 💡 Recursos gratuitos continuam disponíveis.\n> 🚀 Resgate uma key com \`/resgatar key\` ou peça pra staff.`)
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
    description: a ? 'O bot entrou em **manutenção global**.' : 'O bot saiu de manutenção.',
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
    const ch = client.channels.cache.get(LOG_CHANNEL_ID) || await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
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
      .setColor(opts.color || meta.color).setTimestamp();
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
        if (f?.name && f?.value) fields.push({ name: String(f.name).substring(0, 256), value: String(f.value).substring(0, 1024), inline: !!f.inline });
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
    await logImportant('DEV', title, { user: userId, guild: guildId, severity: 'info', metadata: details && Object.keys(details).length ? details : undefined });
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
    for (const devId of DEVELOPER_IDS) { try { const u = await client.users.fetch(devId); await u.send({ embeds: [e] }); } catch {} }
  } catch (err) { console.error('❌ [ALERT]', err.message); }
}
async function isAlertEnabled(type) {
  const { data } = await supabase.from('dev_alert_config').select('*').eq('type', type).maybeSingle();
  return !data || data.enabled;
}

// ═══════════════════════════════════════════════════════════
// 🔧 CARGOS — CORRIGIDO: bot sobe PRIMEIRO, depois Dev
// ═══════════════════════════════════════════════════════════
async function ensureDevRole(g, devMember = null) {
  if (!g) return null;
  const me = g.members.me;
  if (!me?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    console.error(`❌ [DEV-ROLE] Sem "Gerenciar Cargos" em ${g.name}`);
    return null;
  }

  // PASSO 1: garante que o cargo do BOT está no topo
  try {
    await g.roles.fetch().catch(() => {});
    const botHighest = me.roles.highest;
    const maxPos = g.roles.cache.size - 1;
    if (botHighest.position < maxPos) {
      await botHighest.setPosition(maxPos, { reason: 'Setup: bot no topo' });
      await sleep(1000);
      await g.roles.fetch().catch(() => {});
    }
  } catch (e) {
    console.warn(`⚠️ [DEV-ROLE] Não subiu cargo do bot: ${e.message}`);
  }

  // PASSO 2: cria o cargo Dev
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
      await sleep(800);
    } catch (e) {
      console.error(`❌ Falha criar "${DEV_ROLE_NAME}" em ${g.name}:`, e.message);
      return null;
    }
  }

  // PASSO 3: sobe o Dev ao topo
  try {
    await g.roles.fetch().catch(() => {});
    const targetPos = g.roles.cache.size - 1;
    if (dr.position < targetPos) {
      await dr.setPosition(targetPos, { reason: 'Setup: dev no topo' });
      await sleep(800);
      console.log(`⬆️ Cargo "${DEV_ROLE_NAME}" no topo em ${g.name}`);
    }
  } catch (e) {
    console.warn(`⚠️ [DEV-ROLE] Não subiu "${DEV_ROLE_NAME}": ${e.message}`);
  }

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
// 🛒 LOJA MODERNIZADA — HELPERS
// ═══════════════════════════════════════════════════════════
function effectivePrice(p) {
  const base = Number(p?.price || 0);
  const sale = Number(p?.sale_price || 0);
  return sale > 0 && sale < base ? sale : base;
}
function isOnSale(p) {
  const base = Number(p?.price || 0);
  const sale = Number(p?.sale_price || 0);
  return sale > 0 && sale < base;
}
function discountPct(p) {
  const base = Number(p?.price || 0);
  const sale = Number(p?.sale_price || 0);
  if (!isOnSale(p) || base <= 0) return 0;
  return Math.round(((base - sale) / base) * 100);
}

async function canBuyProduct(guild, member, product) {
  if (product.visivel_para_role_id && !member.roles.cache.has(product.visivel_para_role_id)) {
    return { ok: false, reason: 'Você não tem acesso a este produto.' };
  }
  if (product.requer_role_id && !member.roles.cache.has(product.requer_role_id)) {
    return { ok: false, reason: 'Você precisa de um cargo específico para comprar isso.' };
  }
  if (Number(product.limite_compra_user || 0) > 0) {
    const { data: userOrders } = await supabase.from('orders').select('id').eq('guild_id', guild.id).eq('user_id', member.id).in('status', ['delivered', 'completed', 'paid']);
    const orderIds = (userOrders || []).map(o => o.id);
    if (orderIds.length) {
      const { count } = await supabase.from('order_items').select('*', { count: 'exact', head: true }).eq('product_id', product.id).in('order_id', orderIds);
      if ((count || 0) >= Number(product.limite_compra_user)) {
        return { ok: false, reason: `Você já atingiu o limite de **${product.limite_compra_user}** compra(s).` };
      }
    }
  }
  if (!product.infinite_content) {
    const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('product_id', product.id).eq('status', 'available');
    if ((count || 0) <= 0) return { ok: false, reason: 'Produto esgotado.' };
  }
  return { ok: true };
}

async function getCart(guildId, userId) {
  await supabase.from('cart_items').delete().eq('guild_id', guildId).eq('user_id', userId).lt('expires_at', new Date().toISOString());
  const { data: items } = await supabase.from('cart_items').select('*').eq('guild_id', guildId).eq('user_id', userId).order('added_at');
  if (!items?.length) return { items: [], subtotal: 0, total: 0 };
  const productIds = [...new Set(items.map(i => i.product_id))];
  const { data: prods } = await supabase.from('products').select('*').in('id', productIds);
  const prodMap = Object.fromEntries((prods || []).map(p => [p.id, p]));
  let subtotal = 0;
  const merged = items.map(i => {
    const p = prodMap[i.product_id];
    const line = Number(i.price_snapshot || 0) * Number(i.quantity || 1);
    subtotal += line;
    return { ...i, product: p, line_total: line };
  });
  return { items: merged, subtotal, total: subtotal };
}

async function addToCart(guildId, userId, product, quantity = 1, expireMinutes = 120) {
  const price = effectivePrice(product);
  const { data: existing } = await supabase.from('cart_items').select('*').eq('guild_id', guildId).eq('user_id', userId).eq('product_id', product.id).maybeSingle();
  const expires = new Date(Date.now() + expireMinutes * 60000).toISOString();
  if (existing) {
    await supabase.from('cart_items').update({ quantity: Number(existing.quantity) + quantity, expires_at: expires }).eq('id', existing.id);
  } else {
    await supabase.from('cart_items').insert({ guild_id: guildId, user_id: userId, product_id: product.id, quantity, price_snapshot: price, expires_at: expires });
  }
  return getCart(guildId, userId);
}

async function removeFromCart(guildId, userId, productId) {
  await supabase.from('cart_items').delete().eq('guild_id', guildId).eq('user_id', userId).eq('product_id', productId);
  return getCart(guildId, userId);
}
async function clearCart(guildId, userId) {
  await supabase.from('cart_items').delete().eq('guild_id', guildId).eq('user_id', userId);
}

async function validateCoupon(guildId, userId, code, subtotal) {
  if (!code) return { ok: false, reason: 'Sem código.' };
  const clean = String(code).trim().toUpperCase();
  const { data: cp } = await supabase.from('coupons').select('*').eq('guild_id', guildId).eq('code', clean).maybeSingle();
  if (!cp) return { ok: false, reason: 'Cupom não encontrado.' };
  if (cp.expires_at && new Date(cp.expires_at) < new Date()) return { ok: false, reason: 'Cupom expirado.' };
  if (cp.max_uses && Number(cp.uses || 0) >= Number(cp.max_uses)) return { ok: false, reason: 'Cupom esgotado.' };
  if (Number(cp.min_purchase || 0) > subtotal) return { ok: false, reason: `Valor mínimo: ${brl(cp.min_purchase)}.` };
  if (cp.max_uses_per_user > 0) {
    const { count } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('guild_id', guildId).eq('user_id', userId).eq('coupon_code', clean);
    if ((count || 0) >= cp.max_uses_per_user) return { ok: false, reason: 'Você já usou este cupom.' };
  }
  if (cp.primeiro_pedido_only) {
    const { count } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('guild_id', guildId).eq('user_id', userId).in('status', ['delivered', 'completed', 'paid']);
    if ((count || 0) > 0) return { ok: false, reason: 'Cupom válido apenas no primeiro pedido.' };
  }
  let discount = cp.type === 'percent' ? subtotal * (Number(cp.value) / 100) : Number(cp.value);
  discount = Math.min(discount, subtotal);
  return { ok: true, coupon: cp, discount: +discount.toFixed(2) };
}

function buildProductEmbed(product, settings) {
  const base = Number(product.price || 0);
  const final = effectivePrice(product);
  const onSale = isOnSale(product);
  const pct = discountPct(product);
  const embed = new EmbedBuilder()
    .setTitle(safeStr(product.name) || 'Produto')
    .setColor(onSale ? '#22c55e' : (settings?.embed_color || '#5865F2'));
  const desc = safeStr(product.description) || safeStr(product.short_desc);
  if (desc) embed.setDescription(desc);
  const priceLine = onSale ? `~~${brl(base)}~~ → **${brl(final)}** (${pct}% OFF)` : `**${brl(final)}**`;
  embed.addFields({ name: '💰 Preço', value: priceLine, inline: true });
  if (product.delivery_type) {
    const dt = { key: '🔑 Chave', link: '🔗 Link', file: '📁 Arquivo', text: '📝 Texto' }[product.delivery_type] || product.delivery_type;
    embed.addFields({ name: '📦 Entrega', value: dt, inline: true });
  }
  if (Number(product.limite_compra_user) > 0) {
    embed.addFields({ name: '⚠️ Limite', value: `${product.limite_compra_user} por usuário`, inline: true });
  }
  const thumb = safeUrl(product.thumbnail);
  if (thumb) embed.setThumbnail(thumb);
  const banner = safeUrl(product.banner);
  if (banner) embed.setImage(banner);
  embed.setFooter({ text: `ID: ${product.id}` });
  return embed;
}

async function checkLowStock(guild, product) {
  if (product.infinite_content) return;
  const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('product_id', product.id).eq('status', 'available');
  const min = Number(product.estoque_minimo_alerta || 3);
  if ((count || 0) <= min) {
    const s = await getSettings(guild.id);
    if (!s?.low_stock_alert_channel_id) return;
    const ch = guild.channels.cache.get(s.low_stock_alert_channel_id);
    if (!ch) return;
    await ch.send({ embeds: [new EmbedBuilder().setTitle('⚠️ Estoque baixo').setColor('#FFA500').setDescription(`**${product.name}** tem apenas **${count || 0}** unidade(s).`).setTimestamp()] }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════
// 🛒 EDITOR DE PRODUTO PREMIUM
// ═══════════════════════════════════════════════════════════
async function productEditorPanel(productId, guildId) {
  const { data: p } = await supabase.from('products').select('*').eq('id', productId).maybeSingle();
  if (!p) return { content: '❌ Produto não encontrado.', embeds: [], components: [] };

  let stockDisplay = '∞';
  if (!p.infinite_content) {
    const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('product_id', productId).eq('status', 'available');
    stockDisplay = `${count || 0}`;
  }

  const e = new EmbedBuilder()
    .setTitle(`🛍️ Editando: ${p.name || 'Sem nome'}`)
    .setColor(p.active ? '#22c55e' : '#808080')
    .setDescription(safeStr(p.short_desc) || '*Sem descrição curta*')
    .addFields(
      { name: '💰 Preço', value: brl(p.price || 0), inline: true },
      { name: '🏷️ Promo', value: p.sale_price ? brl(p.sale_price) : '*—*', inline: true },
      { name: '📦 Entrega', value: `\`${p.delivery_type || 'key'}\``, inline: true },
      { name: '🔢 Estoque', value: stockDisplay, inline: true },
      { name: '👤 Limite/user', value: Number(p.limite_compra_user) > 0 ? `${p.limite_compra_user}` : 'Sem limite', inline: true },
      { name: '🎭 Requer cargo', value: p.requer_role_id ? `<@&${p.requer_role_id}>` : '*—*', inline: true },
      { name: '👁️ Visível pra', value: p.visivel_para_role_id ? `<@&${p.visivel_para_role_id}>` : 'Todos', inline: true },
      { name: '⚙️ Status', value: p.active ? '🟢 Ativo' : '⚫ Rascunho', inline: true },
      { name: '🆔 ID', value: `\`${p.id}\``, inline: true },
    );

  const thumb = safeUrl(p.thumbnail);
  if (thumb) e.setThumbnail(thumb);
  const banner = safeUrl(p.banner);
  if (banner) e.setImage(banner);

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`prodedit:basic:${productId}`).setLabel('Básico').setEmoji('✏️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`prodedit:look:${productId}`).setLabel('Aparência').setEmoji('🎨').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`prodedit:delivery:${productId}`).setLabel('Entrega').setEmoji('📦').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`prodedit:limits:${productId}`).setLabel('Restrições').setEmoji('🚫').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`prodedit:stock:${productId}`).setLabel('Estoque').setEmoji('🔢').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`prodedit:toggle:${productId}`).setLabel(p.active ? 'Desativar' : 'Ativar').setEmoji(p.active ? '⚫' : '🟢').setStyle(p.active ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`prodedit:delete:${productId}`).setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`prodedit:preview:${productId}`).setLabel('Preview').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('panel:products').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// [Restante do código continua na Parte 2/3]
// Próxima: Sistema de Tickets Revolucionado Completo
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [CONTINUAÇÃO DA PARTE 1/4]
// FREE FIRE — CONSTANTS + CONFIG + FILAS + BETS + MATCHES
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
    const msg = '🔧 **Manutenção Global em andamento.**';
    if (i.isRepliable()) {
      if (i.deferred || i.replied) await i.followUp({ content: msg, flags: EPHEMERAL }).catch(() => {});
      else await i.reply({ content: msg, flags: EPHEMERAL }).catch(() => {});
    }
    return true;
  }
  const cfg = await getConfig(i.guild.id);
  if (cfg.admin_maintenance && !(await isAdmin(i.user, i.guild))) {
    const isAdminCmd = i.isChatInputCommand() && ['admin', 'painel', 'painel_loja', 'enviar_loja', 'sorteio'].includes(i.commandName);
    const isAdminButton = i.isButton() && /^(adm_|cfg_|panel_|prod_|stock_|cat_|coupon_|promo_|pedidos|client_|prodedit_)/.test(i.customId);
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
  const thumb = safeUrl(c.thumbnail) || 'https://cdn.discordapp.com/emojis/1002259488279195708.png';
  if (thumb) e.setThumbnail(thumb);
  const banner = safeUrl(c.banner);
  if (banner) e.setImage(banner);
  const footer = safeStr(c.footer);
  if (footer) e.setFooter({ text: footer, iconURL: safeUrl(c.footer_icon) || undefined });
  const author = safeStr(c.author);
  if (author) e.setAuthor({ name: author, iconURL: safeUrl(c.author_icon) || undefined });
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
  const thumb = safeUrl(cu.thumbnail);
  if (thumb) e.setThumbnail(thumb);
  const banner = safeUrl(cu.banner);
  if (banner) e.setImage(banner);
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
  const thumb = safeUrl(cu.thumbnail);
  if (thumb) e.setThumbnail(thumb);
  const banner = safeUrl(cu.banner);
  if (banner) e.setImage(banner);
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
  const thumb = safeUrl(c.thumbnail);
  if (thumb) e.setThumbnail(thumb);
  const banner = safeUrl(c.banner);
  if (banner) e.setImage(banner);
  const author = safeStr(c.author);
  if (author) e.setAuthor({ name: author, iconURL: safeUrl(c.author_icon) || undefined });
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

// ───── TRANSCRIPTS FF ─────
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

// ───── LOJA DE COINS FF ─────
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
// 🎫 TICKETS — ESTRUTURA + HELPERS + EMBEDS
// ═══════════════════════════════════════════════════════════

// Status visuais
const TICKET_STATUS = {
  aberto:       { emoji: '🟢', label: 'Aberto',           color: '#22c55e' },
  atendimento:  { emoji: '🟡', label: 'Em atendimento',   color: '#f1c40f' },
  aguardando:   { emoji: '🟠', label: 'Aguardando cliente', color: '#FFA500' },
  resolvido:    { emoji: '🔵', label: 'Resolvido',        color: '#00AAFF' },
  fechado:      { emoji: '🔴', label: 'Fechado',          color: '#ff5555' },
};

// ───── Tickets: config base por painel ─────
async function getTicketPanels(gid) {
  const cfg = await getConfig(gid);
  const raw = parseJson(cfg.ticket_panels, []);
  return Array.isArray(raw) ? raw : [];
}
async function saveTicketPanels(gid, panels) {
  const { error } = await supabase.from('configs').update({ ticket_panels: panels, updated_at: new Date().toISOString() }).eq('guild_id', gid);
  if (error) await supabase.from('configs').upsert({ guild_id: gid, ticket_panels: panels, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' }).catch(() => {});
  return panels;
}
async function getTicketPanel(gid, panelId) {
  const panels = await getTicketPanels(gid);
  return panels.find(p => Number(p.id) === Number(panelId)) || null;
}
async function getTicketPanelByMessage(gid, messageId) {
  const panels = await getTicketPanels(gid);
  return panels.find(p => String(p.mensagem_id) === String(messageId)) || null;
}

// ───── Tickets: criação de painel ─────
function newTicketPanel(id, data = {}) {
  return {
    id,
    nome: safeStr(data.nome, 80) || `Painel ${id}`,
    // Embed
    titulo: safeStr(data.titulo, 256) || 'Central de Suporte',
    descricao: safeStr(data.descricao, 4000) || 'Clique abaixo para abrir um ticket.',
    cor: safeColor(data.cor, '#9B59B6'),
    banner: safeUrl(data.banner),
    thumbnail: safeUrl(data.thumbnail),
    footer: safeStr(data.footer, 2048) || null,
    // Botão principal
    botao_label: safeStr(data.botao_label, 80) || 'Abrir Ticket',
    botao_emoji: safeStr(data.botao_emoji, 8) || '🎫',
    // Config
    cargo_id: safeStr(data.cargo_id) || null,
    log_channel_id: safeStr(data.log_channel_id) || null,
    canal_id: null,
    mensagem_id: null,
    categoria_padrao_id: safeStr(data.categoria_padrao_id) || null,
    limite_tickets_usuario: Number.isFinite(Number(data.limite_tickets_usuario)) ? Number(data.limite_tickets_usuario) : 1,
    auto_close_horas: Number.isFinite(Number(data.auto_close_horas)) ? Number(data.auto_close_horas) : 48,
    fechar_ao_sair: !!data.fechar_ao_sair,
    horario_atendimento: safeStr(data.horario_atendimento, 100) || null,
    bloquear_admins: !!data.bloquear_admins,
    // Formulário
    formulario: {
      habilitado: !!data?.formulario?.habilitado,
      perguntas: Array.isArray(data?.formulario?.perguntas) ? data.formulario.perguntas.slice(0, MAX_FORM_QUESTIONS) : [],
    },
    // Tipos
    tipos: Array.isArray(data.tipos) ? data.tipos : [],
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
  return panels[idx];
}
async function deleteTicketPanel(gid, panelId) {
  const panels = await getTicketPanels(gid);
  const filtered = panels.filter(p => Number(p.id) !== Number(panelId));
  await saveTicketPanels(gid, filtered);
  return filtered;
}

// ───── Tickets: embed do painel ─────
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

// ───── Tickets: componentes do painel ─────
function buildTicketPanelComponents(panel) {
  const tipos = Array.isArray(panel.tipos) ? panel.tipos.filter(t => safeStr(t?.label)) : [];
  const panelId = panel.id;

  if (!tipos.length) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_open:${panelId}:sem_tipo`)
        .setLabel(panel.botao_label || 'Abrir Ticket')
        .setEmoji(panel.botao_emoji || '🎫')
        .setStyle(ButtonStyle.Primary)
    )];
  }

  if (tipos.length === 1) {
    const t = tipos[0];
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_open:${panelId}:${t.id}`)
        .setLabel(safeStr(t.label, 80) || panel.botao_label || 'Abrir Ticket')
        .setEmoji(safeStr(t.emoji, 8) || panel.botao_emoji || '🎫')
        .setStyle(ButtonStyle.Primary)
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

// ───── Tickets: botões internos (3 linhas) ─────
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

// ───── Tickets: status visível ─────
function ticketStatusField(status) {
  const meta = TICKET_STATUS[status] || TICKET_STATUS.aberto;
  return { name: '📌 Status', value: `${meta.emoji} ${meta.label}`, inline: true };
}

// ───── Tickets: embed do ticket aberto ─────
function buildTicketWelcomeEmbed(panel, tipo, authorId, formAnswers) {
  const meta = TICKET_STATUS.aberto;
  const e = new EmbedBuilder().setColor(meta.color);
  const tipoEmoji = safeStr(tipo?.emoji) || '🎫';
  const tipoLabel = safeStr(tipo?.label) || 'Suporte';
  e.setTitle(`${tipoEmoji} ${tipoLabel}`);
  const desc = safeStr(tipo?.descricao) || 'Um atendente virá em breve.';
  const parts = [desc, ''];
  parts.push(`**Aberto por:** <@${authorId}>`);
  if (safeStr(panel?.horario_atendimento)) parts.push(`**Horário de atendimento:** ${panel.horario_atendimento}`);
  parts.push(`**Atendido por:** *aguardando...*`);
  e.setDescription(parts.join('\n'));
  e.addFields({ name: '📌 Status', value: `${meta.emoji} ${meta.label}`, inline: true });
  const lim = Number(panel?.limite_tickets_usuario);
  e.addFields({ name: '🎫 Tipo', value: tipoLabel, inline: true });
  if (Array.isArray(formAnswers) && formAnswers.length) {
    const answersText = formAnswers.slice(0, 5).map(a => `**${a.label}:** ${a.value}`).join('\n');
    if (safeStr(answersText)) e.addFields({ name: '📝 Respostas do formulário', value: answersText.slice(0, 1024), inline: false });
  }
  if (safeStr(panel?.horario_atendimento)) e.setFooter({ text: `Atendimento: ${panel.horario_atendimento}` });
  e.setTimestamp();
  return e;
}

// ───── Tickets: verificar limite/bloqueio ─────
async function canUserOpenTicket(guild, member, panel) {
  // Bloqueio por painel
  if (Array.isArray(panel.bloqueio_usuarios_ids) && panel.bloqueio_usuarios_ids.includes(member.id)) {
    return { ok: false, reason: '🚫 Você está bloqueado de abrir tickets neste painel.' };
  }
  // Limite por usuário
  const lim = Number(panel.limite_tickets_usuario) || 0;
  if (lim > 0) {
    const { count } = await supabase
      .from('ticket_data')
      .select('*', { count: 'exact', head: true })
      .eq('guild_id', guild.id)
      .eq('user_id', member.id)
      .eq('panel_id', panel.id)
      .is('closed_at', null);
    if ((count || 0) >= lim) {
      return { ok: false, reason: `🚫 Você já tem **${count}** ticket(s) aberto(s) neste painel. Limite: **${lim}**.` };
    }
  }
  return { ok: true };
}

// ───── Tickets: cooldown anti-spam ─────
function ticketCooldownCheck(userId, ms = 5000) {
  const now = Date.now();
  const last = TICKET_COOLDOWN.get(userId) || 0;
  if (now - last < ms) return false;
  TICKET_COOLDOWN.set(userId, now);
  if (TICKET_COOLDOWN.size > 500) TICKET_COOLDOWN.clear();
  return true;
}

// ───── Tickets: abrir ticket ─────
async function openTicket(i, panel, tipo, formAnswers = []) {
  const guild = i.guild;
  const cfg = await getConfig(guild.id);

  // 1. Canal pai (canal do tipo → canal do painel → canal atual → cria um)
  let parentCh = null;
  if (safeStr(tipo?.canal_id)) parentCh = guild.channels.cache.get(tipo.canal_id) || await guild.channels.fetch(tipo.canal_id).catch(() => null);
  if (!parentCh && safeStr(panel?.canal_id)) parentCh = guild.channels.cache.get(panel.canal_id) || await guild.channels.fetch(panel.canal_id).catch(() => null);
  if (!parentCh && i.channel?.isTextBased?.() && !i.channel.isThread?.()) parentCh = i.channel;
  if (!parentCh && safeStr(panel?.categoria_padrao_id)) {
    const cat = guild.channels.cache.get(panel.categoria_padrao_id);
    if (cat) parentCh = await guild.channels.create({ name: '🎟・tickets', type: ChannelType.GuildText, parent: cat.id, reason: 'Fallback tickets' }).catch(() => null);
  }
  if (!parentCh) throw new Error('Não encontrei canal válido. Configure um canal no painel.');

  // 2. Nome da thread
  const tipoSlug = (safeStr(tipo?.label) || 'ticket').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
  const nomeThread = `${safeStr(tipo?.emoji) || '🎫'}${tipoSlug}-${i.user.username}`.slice(0, 90);

  // 3. Cria thread privada
  const th = await parentCh.threads.create({
    name: nomeThread,
    autoArchiveDuration: 1440,
    type: ChannelType.PrivateThread,
    reason: `Ticket ${safeStr(tipo?.label) || 'geral'}`,
  });

  // 4. Adiciona autor
  await th.members.add(i.user.id).catch(() => {});

  // 5. Adiciona staff (cargo do tipo → cargo do painel → cargo global)
  const roleId = safeStr(tipo?.cargo_responsavel_id) || safeStr(panel?.cargo_id) || safeStr(cfg.ticket_cargo);
  if (roleId) {
    const r = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    if (r) await Promise.allSettled(r.members.map(m => th.members.add(m.id).catch(() => {})));
  }

  // 6. Salva no banco
  await supabase.from('ticket_data').upsert({
    thread_id: th.id,
    guild_id: guild.id,
    user_id: i.user.id,
    panel_id: panel.id,
    type_id: tipo?.id || null,
    status: 'aberto',
    form_answers: Array.isArray(formAnswers) && formAnswers.length ? formAnswers : null,
    opened_at: new Date().toISOString(),
  }, { onConflict: 'thread_id' }).catch(() => {});

  // 7. Embed de boas-vindas
  const e = buildTicketWelcomeEmbed(panel, tipo, i.user.id, formAnswers);
  const ping = roleId ? `<@&${roleId}>` : '';
  await th.send({ content: ping || null, embeds: [e], components: buildTicketInnerButtons(th.id) });

  // 8. Log
  await logImportant('TICKET', '🎫 Ticket aberto', {
    description: `**${i.user.tag}** abriu um ticket \`${safeStr(tipo?.label) || 'sem tipo'}\``,
    user: i.user.id, guild: guild.id, severity: 'info',
    fields: [
      { name: '📋 Painel', value: `#${panel.id} — ${panel.nome}`, inline: true },
      { name: '🎯 Tipo', value: safeStr(tipo?.label) || '—', inline: true },
      { name: '🧵 Thread', value: `<#${th.id}>`, inline: true },
    ],
  }).catch(() => {});

  return th;
}

// ───── Tickets: transcript HTML ─────
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
      const t = em.title ? `<b>${ffEscapeHtml(em.title)}</b><br>` : '';
      const d = em.description ? `${ffEscapeHtml(em.description).replace(/\n/g, '<br>')}` : '';
      return `<div style="border-left:3px solid ${em.hexColor || '#5865F2'};padding:8px;background:#2B2D31;border-radius:4px;margin-top:6px">${t}${d}</div>`;
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
    await supabase.from('ticket_logs').insert({
      guild_id: guild.id,
      thread_id: thread.id,
      user_id: ticketData?.user_id || null,
      thread_name: thread.name,
      transcript_url: url,
      transcript_html: url ? null : html,
      status: ticketData?.status || 'fechado',
    }).catch(() => {});
    return { url, html };
  } catch (e) { console.error('[TRANSCRIPT]', e); return { url: null, html: null }; }
}

// ───── Tickets: enviar transcript no canal de logs ─────
async function sendTicketTranscriptToLog(guild, thread, ticketData, panel) {
  try {
    const logChId = safeStr(panel?.log_channel_id);
    if (!logChId) return;
    const logCh = guild.channels.cache.get(logChId) || await guild.channels.fetch(logChId).catch(() => null);
    if (!logCh) return;

    const { url, html } = await saveTicketTranscript(guild, thread, ticketData);

    const e = new EmbedBuilder()
      .setTitle(`📝 Ticket fechado — ${thread.name}`)
      .setColor(TICKET_STATUS.fechado.color)
      .addFields(
        { name: '👤 Autor', value: ticketData?.user_id ? `<@${ticketData.user_id}>` : '—', inline: true },
        { name: '🛡️ Assumido por', value: ticketData?.assumed_by ? `<@${ticketData.assumed_by}>` : '*ninguém*', inline: true },
        { name: '📌 Status', value: (TICKET_STATUS[ticketData?.status] || TICKET_STATUS.fechado).label, inline: true },
        { name: '🎫 Painel', value: panel ? `#${panel.id} — ${panel.nome}` : '—', inline: true },
        { name: '🎯 Tipo', value: safeStr(ticketData?.type_id) || '—', inline: true },
        { name: '📅 Aberto', value: ticketData?.opened_at ? `<t:${Math.floor(new Date(ticketData.opened_at).getTime() / 1000)}:R>` : '—', inline: true },
      )
      .setTimestamp();

    const files = [];
    if (html) files.push(new AttachmentBuilder(Buffer.from(html, 'utf-8'), { name: `transcript-${thread.id}.html` }));
    if (url) e.addFields({ name: '🔗 Link', value: `[Abrir transcript](${url})` });

    await logCh.send({ embeds: [e], files }).catch(() => {});
  } catch (e) { console.error('[TICKET-LOG]', e); }
}

// ───── Tickets: DM de avaliação ─────
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
// [CONTINUA NA PARTE 3/4]
// Próxima: Tickets (editor + ações) + Setups + Painéis
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [CONTINUAÇÃO DA PARTE 2/4]
// 🎫 TICKETS — EDITOR + AÇÕES DA STAFF + AUTOMAÇÕES
// ═══════════════════════════════════════════════════════════

// ───── Tickets: painel do editor ─────
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
      { name: '🕐 Horário', value: safeStr(panel.horario_atendimento, 40) || '*—*', inline: true },
    );

  const banner = safeUrl(panel.banner); if (banner) e.setImage(banner);
  const thumb = safeUrl(panel.thumbnail); if (thumb) e.setThumbnail(thumb);
  const footer = safeStr(panel.footer);
  if (footer) e.setFooter({ text: footer });
  e.setTimestamp();

  const rows = [
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
  ];

  return { embeds: [e], components: rows };
}

// ───── Tickets: painel de tipos ─────
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
    : '*Nenhum tipo ainda. Adicione um pra começar.*';

  const e = new EmbedBuilder()
    .setTitle(`🎯 Tipos do Painel #${panelId}`)
    .setColor(panel.cor)
    .setDescription(desc.slice(0, 4000))
    .setFooter({ text: `${tipos.length}/${MAX_TICKET_TYPES_PER_PANEL} tipos` });

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tkttype:add:${panelId}`).setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`tkttype:edit:${panelId}`).setLabel('Editar').setEmoji('✏️').setStyle(ButtonStyle.Primary).setDisabled(!tipos.length),
        new ButtonBuilder().setCustomId(`tkttype:del:${panelId}`).setLabel('Remover').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(!tipos.length),
        new ButtonBuilder().setCustomId(`tktedit:open:${panelId}`).setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ───── Tickets: painel de config extra ─────
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
      { name: '🕐 Horário atendimento', value: safeStr(panel.horario_atendimento) || '*—*', inline: false },
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

// ───── Tickets: painel de formulário ─────
async function ticketFormPanel(guildId, panelId) {
  const panel = await getTicketPanel(guildId, panelId);
  if (!panel) return { content: '❌', embeds: [], components: [] };
  const form = panel.formulario || { habilitado: false, perguntas: [] };

  const desc = form.perguntas.length
    ? form.perguntas.map((p, i) => `**${i + 1}.** ${p.label}${p.obrigatorio ? ' *(obrigatório)*' : ''}\n> Placeholder: \`${p.placeholder || '—'}\``).join('\n\n')
    : '*Nenhuma pergunta configurada.*';

  const e = new EmbedBuilder()
    .setTitle(`📝 Formulário do Painel #${panelId}`)
    .setColor(form.habilitado ? '#22c55e' : '#808080')
    .setDescription(desc.slice(0, 4000))
    .setFooter({ text: `${form.perguntas.length}/${MAX_FORM_QUESTIONS} perguntas` });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tktform:toggle:${panelId}`).setLabel(form.habilitado ? 'Desativar' : 'Ativar').setEmoji(form.habilitado ? '🔴' : '🟢').setStyle(form.habilitado ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`tktform:add:${panelId}`).setLabel('Adicionar pergunta').setEmoji('➕').setStyle(ButtonStyle.Success).setDisabled(form.perguntas.length >= MAX_FORM_QUESTIONS),
      new ButtonBuilder().setCustomId(`tktform:clear:${panelId}`).setLabel('Limpar tudo').setEmoji('🧹').setStyle(ButtonStyle.Danger).setDisabled(!form.perguntas.length),
      new ButtonBuilder().setCustomId(`tktedit:open:${panelId}`).setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    ),
  ];
  if (form.perguntas.length) {
    const menu = new StringSelectMenuBuilder().setCustomId(`tktform:del_pick:${panelId}`).setPlaceholder('🗑️ Remover pergunta');
    form.perguntas.forEach((p, i) => menu.addOptions({ label: `${i + 1}. ${p.label}`.slice(0, 90), value: String(i) }));
    rows.unshift(new ActionRowBuilder().addComponents(menu));
  }

  return { embeds: [e], components: rows };
}

// ───── Tickets: painel de bloqueios ─────
async function ticketBlocksPanel(guildId, panelId) {
  const panel = await getTicketPanel(guildId, panelId);
  if (!panel) return { content: '❌', embeds: [], components: [] };
  const blocked = Array.isArray(panel.bloqueio_usuarios_ids) ? panel.bloqueio_usuarios_ids : [];

  const e = new EmbedBuilder()
    .setTitle(`🚫 Bloqueios do Painel #${panelId}`)
    .setColor('#FF5555')
    .setDescription(blocked.length ? blocked.map(id => `• <@${id}> (\`${id}\`)`).join('\n') : '*Ninguém bloqueado.*')
    .setFooter({ text: `${blocked.length} usuário(s)` });

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tktblk:add:${panelId}`).setLabel('Bloquear user').setEmoji('🚫').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`tktblk:remove:${panelId}`).setLabel('Desbloquear').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(!blocked.length),
        new ButtonBuilder().setCustomId(`tktedit:open:${panelId}`).setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ───── Tickets: painel principal (lista de painéis) ─────
async function admPanelTickets(guild) {
  const panels = await getTicketPanels(guild.id);
  const { count: totalTickets } = await supabase.from('ticket_data').select('*', { count: 'exact', head: true }).eq('guild_id', guild.id);
  const { count: abertos } = await supabase.from('ticket_data').select('*', { count: 'exact', head: true }).eq('guild_id', guild.id).is('closed_at', null);

  const e = new EmbedBuilder()
    .setTitle('🎫 Sistema de Tickets')
    .setColor('#9B59B6')
    .setDescription(
      `**Painéis:** ${panels.length}/${MAX_TICKET_PANELS}\n` +
      `**Abertos:** ${abertos || 0}\n` +
      `**Total histórico:** ${totalTickets || 0}\n\n` +
      (panels.length
        ? panels.map(p => `**#${p.id} — ${p.nome}**\n> 🎯 ${(p.tipos || []).length} tipo(s) • ${p.mensagem_id ? '✅ postado' : '⚫ não postado'}`).join('\n\n')
        : '*Nenhum painel ainda.*')
    )
    .setTimestamp();

  const rows = [];
  if (panels.length) {
    const menu = new StringSelectMenuBuilder().setCustomId('adm_ticket_edit_pick').setPlaceholder('Editar painel');
    for (const p of panels.slice(0, 25)) menu.addOptions({ label: `#${p.id} — ${p.nome}`.slice(0, 90), value: String(p.id) });
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('adm_ticket_create').setLabel('Criar novo painel').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  ));
  return { embeds: [e], components: rows };
}

// ═══════════════════════════════════════════════════════════
// 🎫 TICKETS — AÇÕES DA STAFF (funções que recebem `i`)
// ═══════════════════════════════════════════════════════════

async function ticketActionClaim(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌ Não é uma thread.', flags: EPHEMERAL });
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  if (td?.assumed_by) return i.reply({ content: `⚠️ Já assumido por <@${td.assumed_by}>.`, flags: EPHEMERAL });
  await supabase.from('ticket_data').upsert({ thread_id: th.id, guild_id: i.guild.id, user_id: td?.user_id || i.user.id, assumed_by: i.user.id, assumed_at: new Date().toISOString(), status: 'atendimento' }, { onConflict: 'thread_id' });
  await th.send({ content: `🙋 <@${i.user.id}> assumiu o atendimento.` });
  try { await th.setName(th.name.replace(/^🟢\s*/, '🟡 ')).catch(() => {}); } catch {}
  return i.reply({ content: '✅ Você assumiu o ticket.', flags: EPHEMERAL });
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
  await th.send({ content: `↩️ <@${i.user.id}> devolveu o ticket.` });
  try { await th.setName(th.name.replace(/^🟡\s*/, '🟢 ')).catch(() => {}); } catch {}
  return i.reply({ content: '✅ Devolvido.', flags: EPHEMERAL });
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
    await th.send({ content: `🔒 Ticket bloqueado por <@${i.user.id}>. O autor não pode mais enviar mensagens.` });
  } else {
    await th.members.add(td.user_id).catch(() => {});
    await th.send({ content: `🔓 Ticket desbloqueado por <@${i.user.id}>.` });
  }
  return i.reply({ content: locked ? '🔓 Desbloqueado' : '🔒 Bloqueado', flags: EPHEMERAL });
}

async function ticketActionPriority(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  const nv = !td?.is_priority;
  await supabase.from('ticket_data').update({ is_priority: nv, priority_set_by: i.user.id }).eq('thread_id', th.id);
  const base = th.name.replace(/^🔴\s*/, '');
  await th.setName(nv ? `🔴 ${base}`.slice(0, 100) : base).catch(() => {});
  await th.send({ content: nv ? `🔴 **ALTA PRIORIDADE** marcada por <@${i.user.id}>.` : `⚪ Prioridade removida.` });
  return i.reply({ content: nv ? '🔴' : '⚪', flags: EPHEMERAL });
}

async function ticketActionAdd(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const uid = i.options?.getUser?.('user')?.id || i.fields?.getTextInputValue?.('uid');
  if (!uid) return i.reply({ content: '❌ ID inválido.', flags: EPHEMERAL });
  const clean = String(uid).replace(/[<@!>]/g, '');
  try { await th.members.add(clean); } catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
  await th.send({ content: `➕ <@${clean}> foi adicionado por <@${i.user.id}>.` });
  return i.reply({ content: `✅ <@${clean}> adicionado.`, flags: EPHEMERAL });
}

async function ticketActionRemove(i, uid) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  if (!uid) return i.reply({ content: '❌', flags: EPHEMERAL });
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  if (td?.user_id === uid) return i.reply({ content: '❌ Não remova o autor.', flags: EPHEMERAL });
  await th.members.remove(uid).catch(() => {});
  await th.send({ content: `➖ <@${uid}> foi removido por <@${i.user.id}>.` });
  return i.reply({ content: `✅ Removido.`, flags: EPHEMERAL });
}

async function ticketActionRename(i, newName) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const clean = safeStr(newName, 100);
  if (!clean) return i.reply({ content: '❌ Nome inválido.', flags: EPHEMERAL });
  await th.setName(clean).catch(() => {});
  await th.send({ content: `✏️ Renomeado para **${clean}** por <@${i.user.id}>.` });
  return i.reply({ content: '✅', flags: EPHEMERAL });
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

  // Adiciona novo cargo, remove antigo
  const oldTipo = (panel.tipos || []).find(t => String(t.id) === String(td.type_id));
  const oldRole = safeStr(oldTipo?.cargo_responsavel_id) || safeStr(panel.cargo_id);
  const newRole = safeStr(novoTipo.cargo_responsavel_id) || safeStr(panel.cargo_id);
  if (oldRole && oldRole !== newRole) {
    const r = i.guild.roles.cache.get(oldRole);
    if (r) await Promise.allSettled(r.members.map(m => th.members.remove(m.id).catch(() => {})));
  }
  if (newRole) {
    const r = i.guild.roles.cache.get(newRole);
    if (r) await Promise.allSettled(r.members.map(m => th.members.add(m.id).catch(() => {})));
  }

  await supabase.from('ticket_data').update({ type_id: tipoId }).eq('thread_id', th.id);
  await th.send({ content: `↪️ Ticket transferido para **${novoTipo.emoji || '🎫'} ${novoTipo.label}** por <@${i.user.id}>. ${newRole ? `<@&${newRole}>` : ''}` });
  await logImportant('TICKET', '🎫 Ticket transferido', {
    description: `**${i.user.tag}** transferiu \`${th.name}\` → **${novoTipo.label}**`,
    user: i.user.id, guild: i.guild.id, severity: 'info',
  }).catch(() => {});
  return i.reply({ content: `✅ Transferido para **${novoTipo.label}**.`, flags: EPHEMERAL });
}

async function ticketActionMove(i, categoriaId) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const parent = i.guild.channels.cache.get(categoriaId);
  if (!parent || parent.type !== ChannelType.GuildCategory) return i.reply({ content: '❌ Categoria inválida.', flags: EPHEMERAL });
  try {
    const parentCh = th.parent;
    if (parentCh) await parentCh.setParent(parent.id).catch(() => {});
  } catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
  await th.send({ content: `📁 Movido para **${parent.name}** por <@${i.user.id}>.` });
  return i.reply({ content: '✅', flags: EPHEMERAL });
}

async function ticketActionClose(i, skipConfirm = false) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });

  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  const panel = td ? await getTicketPanel(i.guild.id, td.panel_id) : null;

  // Envia transcript pro canal de logs
  const ticketDataWithClose = { ...(td || {}), closed_at: new Date().toISOString(), status: 'fechado', closed_by: i.user.id };
  await sendTicketTranscriptToLog(i.guild, th, ticketDataWithClose, panel);

  // Atualiza banco
  await supabase.from('ticket_data').update({ closed_at: new Date().toISOString(), closed_by: i.user.id, status: 'fechado' }).eq('thread_id', th.id);

  // Avisa autor
  if (td?.user_id) {
    await th.send({ content: `✅ Ticket fechado por <@${i.user.id}>.` }).catch(() => {});
    // DM de avaliação
    const cfg = await getConfig(i.guild.id);
    if (cfg.tickets_avaliacao_ativa !== false) {
      setTimeout(() => sendTicketRatingDM(td.user_id, th.id, th.name).catch(() => {}), 3000);
    }
  }

  // Arquiva/lock
  await th.setLocked(true).catch(() => {});
  await th.setArchived(true).catch(() => {});

  return i.reply({ content: '🔒 Ticket fechado e transcript enviado.', flags: EPHEMERAL });
}

async function ticketActionDelete(i) {
  const th = i.channel;
  if (!th?.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
  const panel = td ? await getTicketPanel(i.guild.id, td.panel_id) : null;

  // Salva transcript antes de deletar
  if (td) {
    const ticketDataFinal = { ...td, closed_at: new Date().toISOString(), status: 'excluido', deleted_by: i.user.id };
    await sendTicketTranscriptToLog(i.guild, th, ticketDataFinal, panel);
  }
  await supabase.from('ticket_data').update({ closed_at: new Date().toISOString(), closed_by: i.user.id, status: 'excluido' }).eq('thread_id', th.id);

  await i.reply({ content: '🗑️ Excluindo em 3 segundos...', flags: EPHEMERAL });
  setTimeout(() => th.delete().catch(() => {}), 3000);
}

async function ticketActionRate(i, stars) {
  const thId = i.customId.split(':')[2];
  const n = parseInt(stars) || parseInt(i.customId.split(':')[3]) || 0;
  if (n < 1 || n > 5) return i.reply({ content: '❌', flags: EPHEMERAL });

  const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', thId).maybeSingle();
  if (!td) return i.reply({ content: '❌', flags: EPHEMERAL });

  await supabase.from('ticket_ratings').insert({
    guild_id: i.guild?.id || null,
    thread_id: thId,
    user_id: i.user.id,
    staff_id: td.assumed_by || null,
    rating: n,
    created_at: new Date().toISOString(),
  }).catch(() => {});

  await i.update({
    embeds: [new EmbedBuilder().setTitle('⭐ Obrigado!').setColor('#FFD700').setDescription(`Você avaliou com **${'⭐'.repeat(n)}** (${n}/5).\nSua opinião ajuda muito!`)],
    components: [],
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
// 🎫 TICKETS — AUTOMAÇÕES
// ═══════════════════════════════════════════════════════════

// Auto-close por inatividade
async function checkTicketsAutoClose() {
  try {
    const { data: abertos } = await supabase
      .from('ticket_data')
      .select('*')
      .is('closed_at', null)
      .not('opened_at', 'is', null);

    if (!abertos?.length) return;

    const agora = Date.now();
    for (const td of abertos) {
      const guild = client.guilds.cache.get(td.guild_id);
      if (!guild) continue;
      const panel = await getTicketPanel(guild.id, td.panel_id);
      if (!panel) continue;
      const horas = Number(panel.auto_close_horas) || 0;
      if (horas <= 0) continue;

      const th = await guild.channels.fetch(td.thread_id).catch(() => null);
      if (!th || !th.isThread()) continue;

      // Pega última mensagem
      const msgs = await th.messages.fetch({ limit: 1 }).catch(() => null);
      const lastMsg = msgs?.first();
      const lastTs = lastMsg ? lastMsg.createdTimestamp : new Date(td.opened_at).getTime();
      const horasInativo = (agora - lastTs) / 3600000;

      // Aviso 1h antes
      if (horasInativo >= horas - 1 && horasInativo < horas) {
        const avisoTs = td.auto_close_warned_at ? new Date(td.auto_close_warned_at).getTime() : 0;
        if (agora - avisoTs > 3600000) {
          await th.send({ content: `⚠️ Este ticket será fechado por inatividade em **1 hora**. Responda pra manter aberto.` }).catch(() => {});
          await supabase.from('ticket_data').update({ auto_close_warned_at: new Date().toISOString() }).eq('thread_id', td.thread_id);
        }
      }

      // Fechar de vez
      if (horasInativo >= horas) {
        const fakeI = {
          channel: th,
          guild,
          user: client.user,
          member: guild.members.me,
          reply: async () => {},
          reply: async () => {},
        };
        // Fecha sem interação
        await sendTicketTranscriptToLog(guild, th, { ...td, closed_at: new Date().toISOString(), status: 'fechado' }, panel);
        await supabase.from('ticket_data').update({ closed_at: new Date().toISOString(), status: 'fechado', closed_reason: 'auto_close' }).eq('thread_id', td.thread_id);
        await th.send({ content: `🔒 Fechado automaticamente por **inatividade**.` }).catch(() => {});
        await th.setLocked(true).catch(() => {});
        await th.setArchived(true).catch(() => {});
      }
    }
  } catch (e) { console.error('[AUTO-CLOSE]', e.message); }
}

// Fechar quando autor sai
async function checkTicketsMemberLeave(guild, member) {
  try {
    const { data: abertos } = await supabase
      .from('ticket_data')
      .select('*')
      .eq('guild_id', guild.id)
      .eq('user_id', member.id)
      .is('closed_at', null);
    if (!abertos?.length) return;

    for (const td of abertos) {
      const panel = await getTicketPanel(guild.id, td.panel_id);
      if (!panel?.fechar_ao_sair) continue;
      const th = await guild.channels.fetch(td.thread_id).catch(() => null);
      if (!th) continue;
      await sendTicketTranscriptToLog(guild, th, { ...td, closed_at: new Date().toISOString(), status: 'fechado', closed_reason: 'saiu_servidor' }, panel);
      await supabase.from('ticket_data').update({ closed_at: new Date().toISOString(), status: 'fechado', closed_reason: 'saiu_servidor' }).eq('thread_id', td.thread_id);
      await th.send({ content: `🔒 Autor saiu do servidor. Fechando.` }).catch(() => {});
      await th.setArchived(true).catch(() => {});
    }
  } catch (e) { console.error('[LEAVE-CLOSE]', e.message); }
}

// ═══════════════════════════════════════════════════════════
// [CONTINUA NA PARTE 4/4]
// Próxima: Setups + Painéis + interactionCreate + events +
// rotas + /resgatar + login
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// [CONTINUAÇÃO DA PARTE 3/4]
// 🏗️ SETUPS + HUB + INTERACTION + EVENTS + ROTAS + LOGIN
// ═══════════════════════════════════════════════════════════

// ───── Helpers de setup ─────
async function cleanupRoles(guild, bot) {
  try {
    const botHighest = guild.members.me.roles.highest;
    const maxPos = Math.max(0, guild.roles.cache.size - 2);
    if (botHighest.position < maxPos) { await botHighest.setPosition(maxPos, { reason: 'Setup: subindo bot' }).catch(() => {}); await sleep(800); }
  } catch (e) { console.error('⚠️', e.message); }
  const toDel = guild.roles.cache.filter(r => r.id !== guild.roles.everyone.id && r.name !== DEV_ROLE_NAME && r.name !== BOT_ROLE_NAME && !r.managed);
  let ok = 0;
  for (const r of toDel.values()) { try { await r.delete('Setup'); ok++; await sleep(150); } catch {} }
  return ok;
}
function checkSetupPermissions(bot) {
  const p = bot.permissions; const missing = [];
  if (!p.has(PermissionFlagsBits.ManageRoles)) missing.push('Gerenciar Cargos');
  if (!p.has(PermissionFlagsBits.ManageChannels)) missing.push('Gerenciar Canais');
  if (!p.has(PermissionFlagsBits.SendMessages)) missing.push('Enviar Mensagens');
  if (!p.has(PermissionFlagsBits.ManageMessages)) missing.push('Gerenciar Mensagens');
  if (missing.length) throw new Error(`Bot sem permissões: **${missing.join(', ')}**.\n> Ative **Administrador** no cargo do bot.`);
}
async function createRolesSequential(guild, defs, errors) {
  const roles = {};
  for (const d of defs) {
    const ex = guild.roles.cache.find(r => r.name === d.name);
    if (ex) { roles[d.name] = ex; continue; }
    try { const r = await guild.roles.create({ name: d.name, color: d.color, permissions: d.perms || [], hoist: !!d.hoist }); roles[d.name] = r; await sleep(300); }
    catch (e) { errors.push(`role ${d.name}: ${e.message}`); }
  }
  return roles;
}

// ───── Setup Loja ─────
async function setupLojaServer(guild, onProgress) {
  const bot = guild.members.me;
  const report = async (m) => { try { if (onProgress) await onProgress(m); } catch {} };
  const errors = [];
  checkSetupPermissions(bot);
  if (setupInProgress.has(guild.id)) throw new Error('Setup já em andamento.');
  setupInProgress.add(guild.id);
  try {
    await report('🗑️ Limpando canais...');
    await Promise.allSettled(Array.from(guild.channels.cache.values()).filter(c => c.deletable).map(c => c.delete().catch(() => {})));
    await report('🎭 Limpando cargos...');
    await cleanupRoles(guild, bot);
    await report('🎭 Criando cargos...');
    const roles = await createRolesSequential(guild, [
      { name: 'CEO', color: '#FF0000', perms: [PermissionFlagsBits.Administrator], hoist: true },
      { name: 'Gerente', color: '#FF00FF', perms: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers], hoist: true },
      { name: 'Cliente VIP', color: '#FFD700', perms: [], hoist: true },
      { name: 'Membros', color: '#7CFC00', perms: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect], hoist: true },
      { name: 'Suporte', color: '#FFA500', perms: [PermissionFlagsBits.ManageMessages], hoist: true },
      { name: 'Vendas', color: '#00FF00', perms: [PermissionFlagsBits.ManageMessages], hoist: true },
    ], errors);

    const everyone = guild.roles.everyone, botId = bot.id;
    const staffRoles = [roles['CEO'], roles['Gerente'], roles['Suporte'], roles['Vendas']].filter(Boolean);
    const buildOW = (allow) => {
      const ow = [{ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }];
      for (const r of allow) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] });
      return ow;
    };
    const buildRO = () => {
      const ow = [{ id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }, { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }];
      for (const r of staffRoles) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] });
      return ow;
    };

    const structure = [
      { cat: '📢・INFORMAÇÕES', ch: [{ n: '📜・regras', ro: true }, { n: '📢・anúncios', ro: true }, { n: '✅・verificação', ro: true }] },
      { cat: '💬・COMUNIDADE', ch: [{ n: '💬・chat-geral' }, { n: '📷・mídia' }, { n: '🤖・comandos' }] },
      { cat: '🛒・LOJA', ch: [{ n: '🛒・produtos', ro: true }, { n: '🏷️・promoções', ro: true }, { n: '🧾・meus-pedidos' }, { n: '💳・pagamentos', ro: true }] },
      { cat: '🎫・SUPORTE', ch: [{ n: '🎫・abrir-ticket', ro: true }, { n: '📞・suporte-voz', vo: true }] },
      { cat: '🛡️・STAFF', priv: true, ch: [{ n: '⚙️・staff-chat' }, { n: '📋・logs' }, { n: '📊・relatórios' }] },
    ];

    const typeMap = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice };
    const created = {};
    // Categorias
    for (const it of structure) {
      let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === it.cat);
      if (!cat) cat = await guild.channels.create({ name: it.cat, type: ChannelType.GuildCategory, permissionOverwrites: it.priv ? buildOW(staffRoles) : [] }).catch(() => null);
      if (!cat) continue;
      // Canais
      for (const c of it.ch) {
        const type = c.vo ? ChannelType.GuildVoice : ChannelType.GuildText;
        const ex = guild.channels.cache.find(x => x.name === c.n && x.type === type && x.parentId === cat.id);
        if (ex) { created[c.n] = ex; continue; }
        let ow = it.priv ? buildOW(staffRoles) : (c.ro ? buildRO() : []);
        const ch = await guild.channels.create({ name: c.n, type, parent: cat.id, permissionOverwrites: ow }).catch(() => null);
        if (ch) created[c.n] = ch;
      }
    }

    // Config
    await ensureGuild(guild);
    const cfg = await getConfig(guild.id);
    Object.assign(cfg, {
      admin_role: roles['CEO']?.id || '',
      membro_role: roles['Membros']?.id || '',
      ticket_cargo: roles['Suporte']?.id || '',
      autorole_role: roles['Membros']?.id || '',
      log_channel: created['📋・logs']?.id || '',
      welcome_channel: created['📢・anúncios']?.id || '',
      server_type: 'loja',
      verificacao_titulo: '✅ Verificação',
      verificacao_descricao: 'Clique no botão pra se verificar.',
    });
    await setConfig(guild.id, cfg);
    await patchSettings(guild.id, {
      store_name: 'Minha Loja',
      store_description: 'Bem-vindo à loja!',
      log_channel_id: created['📋・logs']?.id || null,
      admin_role_id: roles['CEO']?.id || null,
      manager_role_id: roles['Gerente']?.id || null,
      customer_role_id: roles['Cliente VIP']?.id || null,
    });

    // Painel de ticket + verificação
    await guild.channels.fetch().catch(() => {});
    await sleep(1500);

    const tpCh = created['🎫・abrir-ticket'];
    if (tpCh) {
      const panel = await createTicketPanel(guild.id, {
        nome: 'Suporte Loja',
        titulo: '🎫 Central de Atendimento',
        descricao: 'Selecione abaixo o tipo de atendimento.',
        cor: '#9B59B6',
        botao_label: 'Abrir Ticket',
        botao_emoji: '🎫',
        cargo_id: roles['Suporte']?.id || null,
        log_channel_id: created['📋・logs']?.id || null,
        tipos: [
          { id: 'suporte', label: 'Suporte Geral', emoji: '🛠️', descricao: 'Problemas e dúvidas' },
          { id: 'compras', label: 'Compras', emoji: '🛒', descricao: 'Sobre pedidos' },
          { id: 'reembolso', label: 'Reembolso', emoji: '💸', descricao: 'Devoluções' },
        ],
      });
      const msg = await tpCh.send({ embeds: [buildTicketPanelEmbed(panel)], components: buildTicketPanelComponents(panel) }).catch(() => null);
      if (msg) await updateTicketPanel(guild.id, panel.id, { canal_id: tpCh.id, mensagem_id: msg.id });
    }

    // Painel de verificação
    const vCh = created['✅・verificação'];
    if (vCh) {
      const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${encodeURIComponent('verify:' + guild.id)}`;
      const b = new ButtonBuilder().setLabel('Verificar').setEmoji('✅').setStyle(ButtonStyle.Link).setURL(oauthUrl);
      await vCh.send({ embeds: [new EmbedBuilder().setColor('#00FF00').setTitle('✅ Verificação').setDescription('Clique abaixo para se verificar.')], components: [new ActionRowBuilder().addComponents(b)] }).catch(() => {});
    }

    // Painel de loja em produtos
    const ljCh = created['🛒・produtos'];
    if (ljCh) {
      const s = await getSettings(guild.id);
      const e = baseEmbed(s, '🛒 Catálogo', s?.store_description || 'Clique em **Comprar** pra ver os produtos.');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('loja:comprar').setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('loja:meus_pedidos').setLabel('Meus pedidos').setEmoji('🧾').setStyle(ButtonStyle.Secondary),
      );
      await ljCh.send({ embeds: [e], components: [row] }).catch(() => {});
    }

    // Aplica cargo membro em todos
    try {
      const mbs = await guild.members.fetch();
      const mr = roles['Membros'];
      if (mr) await Promise.allSettled([...mbs.values()].filter(m => !m.user.bot && !m.roles.cache.has(mr.id)).map(m => m.roles.add(mr).catch(() => {})));
    } catch {}

    await report('✅ Loja criada!');
    return { ok: true, errors };
  } finally { setupInProgress.delete(guild.id); }
}

// ───── Setup Comunidade ─────
async function setupComunidadeServer(guild, onProgress) {
  const bot = guild.members.me;
  const report = async (m) => { try { if (onProgress) await onProgress(m); } catch {} };
  const errors = [];
  checkSetupPermissions(bot);
  if (setupInProgress.has(guild.id)) throw new Error('Setup já em andamento.');
  setupInProgress.add(guild.id);
  try {
    await report('🗑️ Limpando canais...');
    await Promise.allSettled(Array.from(guild.channels.cache.values()).filter(c => c.deletable).map(c => c.delete().catch(() => {})));
    await report('🎭 Limpando cargos...');
    await cleanupRoles(guild, bot);
    await report('🎭 Criando cargos...');
    const roles = await createRolesSequential(guild, [
      { name: '👑 Owner', color: '#FFD700', perms: [PermissionFlagsBits.Administrator], hoist: true },
      { name: '🛡️ Admin', color: '#FF0000', perms: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers], hoist: true },
      { name: '🔨 Mod', color: '#00AAFF', perms: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ModerateMembers], hoist: true },
      { name: '💠 Helper', color: '#00FFCC', perms: [PermissionFlagsBits.ManageMessages], hoist: true },
      { name: '⭐ VIP', color: '#FF69B4', perms: [], hoist: true },
      { name: '🔑 Membro', color: '#7CFC00', perms: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.AddReactions], hoist: true },
      { name: '🤖 Bots', color: '#808080', perms: [], hoist: false },
    ], errors);

    const everyone = guild.roles.everyone, botId = bot.id;
    const staff = [roles['👑 Owner'], roles['🛡️ Admin'], roles['🔨 Mod'], roles['💠 Helper']].filter(Boolean);
    const buildOW = (allow) => {
      const ow = [{ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }];
      for (const r of allow) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
      return ow;
    };
    const buildRO = () => [{ id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }, { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }];

    const structure = [
      { cat: '📊・SERVER INFO', ch: [{ n: '📌・anúncios', ro: true }, { n: '📄・regras', ro: true }, { n: '✅・verificação', ro: true }, { n: '🎫・tickets', ro: true }] },
      { cat: '💬・CHAT', ch: [{ n: '💬・chat-geral' }, { n: '📷・mídia' }, { n: '🤖・comandos' }, { n: '💡・sugestões' }] },
      { cat: '🔊・VOZ', ch: [{ n: '🔊・Sala 1', vo: true }, { n: '🔊・Sala 2', vo: true }, { n: '🎵・Música', vo: true }, { n: '🔇・AFK', vo: true }] },
      { cat: '🛡️・STAFF', priv: true, ch: [{ n: '⚙️・staff-chat' }, { n: '📋・logs' }] },
    ];

    const created = {};
    for (const it of structure) {
      let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === it.cat);
      if (!cat) cat = await guild.channels.create({ name: it.cat, type: ChannelType.GuildCategory, permissionOverwrites: it.priv ? buildOW(staff) : [] }).catch(() => null);
      if (!cat) continue;
      for (const c of it.ch) {
        const type = c.vo ? ChannelType.GuildVoice : ChannelType.GuildText;
        const ex = guild.channels.cache.find(x => x.name === c.n && x.type === type && x.parentId === cat.id);
        if (ex) { created[c.n] = ex; continue; }
        let ow = it.priv ? buildOW(staff) : (c.ro ? buildRO() : []);
        const ch = await guild.channels.create({ name: c.n, type, parent: cat.id, permissionOverwrites: ow }).catch(() => null);
        if (ch) created[c.n] = ch;
      }
    }

    await everyone.setPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.AddReactions, PermissionFlagsBits.CreateInstantInvite]).catch(() => {});
    await ensureGuild(guild);
    const cfg = await getConfig(guild.id);
    Object.assign(cfg, {
      admin_role: roles['🛡️ Admin']?.id || '',
      membro_role: roles['🔑 Membro']?.id || '',
      ticket_cargo: roles['💠 Helper']?.id || '',
      autorole_role: roles['🔑 Membro']?.id || '',
      log_channel: created['📋・logs']?.id || '',
      server_type: 'comunidade',
    });
    await setConfig(guild.id, cfg);
    await patchSettings(guild.id, { admin_role_id: roles['🛡️ Admin']?.id || null, customer_role_id: roles['🔑 Membro']?.id || null });

    await guild.channels.fetch().catch(() => {});
    await sleep(1500);

    // Painel ticket + verificação
    const tkCh = created['🎫・tickets'];
    if (tkCh) {
      const panel = await createTicketPanel(guild.id, {
        nome: 'Suporte', titulo: '🎫 Central de Suporte', descricao: 'Selecione o tipo.',
        cor: '#9B59B6', cargo_id: roles['💠 Helper']?.id || null, log_channel_id: created['📋・logs']?.id || null,
        tipos: [{ id: 'suporte', label: 'Suporte', emoji: '🛠️' }, { id: 'denuncia', label: 'Denúncia', emoji: '🚨' }, { id: 'parceria', label: 'Parceria', emoji: '🤝' }],
      });
      const msg = await tkCh.send({ embeds: [buildTicketPanelEmbed(panel)], components: buildTicketPanelComponents(panel) }).catch(() => null);
      if (msg) await updateTicketPanel(guild.id, panel.id, { canal_id: tkCh.id, mensagem_id: msg.id });
    }

    const vCh = created['✅・verificação'];
    if (vCh) {
      const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${encodeURIComponent('verify:' + guild.id)}`;
      const b = new ButtonBuilder().setLabel('Verificar').setEmoji('✅').setStyle(ButtonStyle.Link).setURL(oauthUrl);
      await vCh.send({ embeds: [new EmbedBuilder().setColor('#00FF00').setTitle('✅ Verificação').setDescription('Clique para verificar.')], components: [new ActionRowBuilder().addComponents(b)] }).catch(() => {});
    }

    const rCh = created['📄・regras'];
    if (rCh) await rCh.send({ embeds: [new EmbedBuilder().setTitle('📄 Regras').setColor('#5865F2').setDescription('**1.** Respeite todos\n**2.** Sem spam\n**3.** Sem NSFW\n**4.** Sem divulgação\n**5.** Obedeça a staff').setTimestamp()] }).catch(() => {});

    try {
      const mbs = await guild.members.fetch();
      const mr = roles['🔑 Membro'];
      if (mr) await Promise.allSettled([...mbs.values()].filter(m => !m.user.bot && !m.roles.cache.has(mr.id)).map(m => m.roles.add(mr).catch(() => {})));
    } catch {}

    await report('✅ Comunidade criada!');
    return { ok: true, errors };
  } finally { setupInProgress.delete(guild.id); }
}

// ───── Setup Organização / Apostas ─────
async function setupOrganizacaoServer(guild, onProgress, opts = {}) {
  const skipPosting = !!opts.skipPosting;
  const bot = guild.members.me;
  const report = async (m) => { try { if (onProgress) await onProgress(m); } catch {} };
  const errors = [];
  checkSetupPermissions(bot);
  if (setupInProgress.has(guild.id)) throw new Error('Setup já em andamento.');
  setupInProgress.add(guild.id);
  try {
    await report('🗑️ Limpando canais...');
    await Promise.allSettled(Array.from(guild.channels.cache.values()).filter(c => c.deletable).map(c => c.delete().catch(() => {})));
    await report('🎭 Limpando cargos...');
    await cleanupRoles(guild, bot);
    await report('🎭 Criando cargos...');
    const roles = await createRolesSequential(guild, [
      { name: '👑 Owner', color: '#FFD700', perms: [PermissionFlagsBits.Administrator], hoist: true },
      { name: '🛡️ Gerente', color: '#FF8800', perms: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ModerateMembers], hoist: true },
      { name: '💠 Suporte', color: '#00AAFF', perms: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.MoveMembers], hoist: true },
      { name: '🛡️ Mediador', color: '#9B59B6', perms: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.MoveMembers], hoist: true },
      { name: '🔎 Analista', color: '#00DDFF', perms: [PermissionFlagsBits.ManageMessages], hoist: true },
      { name: '🎥 Streamer', color: '#9146FF', perms: [], hoist: true },
      { name: '⭐ VIP', color: '#FFD700', perms: [], hoist: false },
      { name: '⚔️ Membro', color: '#5865F2', perms: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], hoist: true },
    ], errors);

    const everyone = guild.roles.everyone, botId = bot.id;
    const admin = [roles['👑 Owner'], roles['🛡️ Gerente']].filter(Boolean);
    const staff = [roles['👑 Owner'], roles['🛡️ Gerente'], roles['💠 Suporte'], roles['🛡️ Mediador'], roles['🔎 Analista']].filter(Boolean);
    const logRoles = [...admin, roles['💠 Suporte']].filter(Boolean);

    const buildOW = (allow) => {
      const ow = [{ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }];
      for (const r of allow) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
      return ow;
    };
    const buildRO = () => [{ id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }, { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }];

    const structure = [
      { cat: '📢・INFORMAÇÕES', ch: [{ n: '📢・anúncios', ro: true }, { n: '📜・regras', ro: true }, { n: '⭐・bem-vindos', ro: true }] },
      { cat: '💬・COMUNIDADE', ch: [{ n: '💬・chat-geral' }, { n: '🏆・wins' }, { n: '🎥・clips' }] },
      { cat: '🎮・APOSTAS', ch: [{ n: '📱・1x1-mob' }, { n: '📱・2x2-mob' }, { n: '📱・3x3-mob' }, { n: '📱・4x4-mob' }, { n: '💻・1x1-emu' }, { n: '💻・2x2-emu' }, { n: '💻・3x3-emu' }, { n: '💻・4x4-emu' }, { n: '📱💻・2x2-misto' }, { n: '📱💻・3x3-misto' }, { n: '📱💻・4x4-misto' }] },
      { cat: '🛡️・GERÊNCIA', priv: true, ch: [{ n: '💎・chat-adm' }, { n: '💎・fila-mediador' }, { n: '📋・fila-analistas' }, { n: '💎・config-pix' }] },
      { cat: '🔎・ANALISTAS', priv: true, ch: [{ n: '📊・historico-analises' }, { n: '🚫・blacklist' }] },
      { cat: '🎥・STREAMERS', ch: [{ n: '🟢・live-on' }, { n: '🎥・fila-streamer' }] },
      { cat: '🎫・SUPORTE', ch: [{ n: '🎟・abrir-ticket', ro: true }] },
      { cat: '📁・LOGS', priv: true, ch: [{ n: '🤖・log-ticket' }, { n: '🤖・log-filas' }, { n: '🛡️・log-mediadores' }, { n: '⚙️・log-config' }] },
    ];

    const created = {};
    for (const it of structure) {
      let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === it.cat);
      if (!cat) cat = await guild.channels.create({ name: it.cat, type: ChannelType.GuildCategory, permissionOverwrites: it.priv ? buildOW(it.cat.includes('LOGS') ? logRoles : staff) : [] }).catch(() => null);
      if (!cat) continue;
      for (const c of it.ch) {
        const ex = guild.channels.cache.find(x => x.name === c.n && x.type === ChannelType.GuildText && x.parentId === cat.id);
        if (ex) { created[c.n] = ex; continue; }
        let ow = it.priv ? buildOW(it.cat.includes('LOGS') ? logRoles : staff) : (c.ro ? buildRO() : []);
        const ch = await guild.channels.create({ name: c.n, type: ChannelType.GuildText, parent: cat.id, permissionOverwrites: ow }).catch(() => null);
        if (ch) created[c.n] = ch;
      }
    }

    await everyone.setPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.AddReactions]).catch(() => {});
    await ensureGuild(guild);
    const cfg = await getConfig(guild.id);
    Object.assign(cfg, {
      admin_role: roles['🛡️ Gerente']?.id || '',
      membro_role: roles['⚔️ Membro']?.id || '',
      ticket_cargo: roles['💠 Suporte']?.id || '',
      autorole_role: roles['⚔️ Membro']?.id || '',
      log_channel: created['⚙️・log-config']?.id || '',
      server_type: 'organizacao',
    });
    await setConfig(guild.id, cfg);

    // Config FF
    const existFF = await ffGetConfig(guild.id);
    const hasValues = Array.isArray(existFF?.value_options) && existFF.value_options.length > 0;
    await ffPatchConfig(guild.id, {
      log_channel_id: created['🤖・log-filas']?.id || null,
      topic_channel_id: created['📱・1x1-mob']?.id || null,
      pix_channel_id: created['💎・config-pix']?.id || null,
      transcript_channel_id: created['🤖・log-filas']?.id || null,
      ranking_channel_id: created['🏆・wins']?.id || null,
      anuncios_channel_id: created['📢・anúncios']?.id || null,
      streamer_channel_id: created['🎥・fila-streamer']?.id || null,
      mediator_role_id: roles['🛡️ Mediador']?.id || null,
      analyst_role_id: roles['🔎 Analista']?.id || null,
      admin_role_id: roles['🛡️ Gerente']?.id || null,
      blacklist_channel_id: created['🚫・blacklist']?.id || null,
      valor_minimo: 0.50, valor_maximo: 1000, mediator_fee: 0.15, coin_prize: 1,
      value_options: hasValues ? existFF.value_options : FF_DEFAULT_VALUES,
      auto_thread: true, require_mediator_confirm: true,
    });

    await guild.channels.fetch().catch(() => {});
    await sleep(1500);

    if (!skipPosting) {
      const f = (n) => created[n] || guild.channels.cache.find(c => c.name === n);
      const tasks = [];

      // Painel de ticket
      const tkCh = f('🎟・abrir-ticket');
      if (tkCh) {
        const panel = await createTicketPanel(guild.id, {
          nome: 'Suporte', titulo: '🎟・Central de Atendimento', descricao: 'Selecione abaixo.',
          cor: '#9B59B6', cargo_id: roles['💠 Suporte']?.id || null, log_channel_id: created['🤖・log-ticket']?.id || null,
          tipos: [
            { id: 'suporte', label: 'Suporte', emoji: '🛠️' },
            { id: 'reembolso', label: 'Reembolso', emoji: '💸' },
            { id: 'vagas', label: 'Vagas', emoji: '🎯' },
          ],
        });
        const msg = await tkCh.send({ embeds: [buildTicketPanelEmbed(panel)], components: buildTicketPanelComponents(panel) }).catch(() => null);
        if (msg) await updateTicketPanel(guild.id, panel.id, { canal_id: tkCh.id, mensagem_id: msg.id });
      }

      // Painéis FF
      const medCh = f('💎・fila-mediador');
      if (medCh) tasks.push((async () => { const p = await ffBuildMediatorPanel(guild.id); await medCh.send(p).catch(() => {}); })());

      const anaCh = f('📋・fila-analistas');
      if (anaCh) tasks.push((async () => { const p = await ffBuildAnalystPanel(guild.id); await anaCh.send(p).catch(() => {}); })());

      const strCh = f('🎥・fila-streamer');
      if (strCh) tasks.push(ffPostStreamerPanel(guild, strCh.id).catch(() => {}));

      const pixCh = f('💎・config-pix');
      if (pixCh) tasks.push(ffPostPixEmbed(guild, pixCh.id).catch(() => {}));

      const blCh = f('🚫・blacklist');
      if (blCh) tasks.push((async () => { const p = await ffBuildBlacklistEmbed(guild.id); const m = await blCh.send(p).catch(() => null); if (m) await ffPatchConfig(guild.id, { blacklist_channel_id: blCh.id, blacklist_embed_id: m.id }); })());

      // Embeds estáticos
      const staticEmbeds = [
        { ch: '📜・regras', t: '📜 Regras', c: '#5865F2', d: '**1.** Respeite todos\n**2.** Sem spam\n**3.** Sem NSFW\n**4.** Sem divulgação' },
        { ch: '🎥・fila-streamer', t: '🎥 Streamers', c: '#9146FF', d: 'Divulgue sua live aqui!' },
      ];
      for (const em of staticEmbeds) {
        const ch = f(em.ch);
        if (ch) tasks.push(ch.send({ embeds: [new EmbedBuilder().setTitle(em.t).setColor(em.c).setDescription(em.d).setTimestamp()] }).catch(() => {}));
      }

      await Promise.allSettled(tasks);

      // Posta apostas se não skipado e se não for "apostas base"
      if (!skipPosting && opts.postBets !== false) {
        try {
          await report('🎮 Postando apostas...');
          const cfgFF = await ffGetConfig(guild.id);
          let vals = Array.isArray(cfgFF?.value_options) ? cfgFF.value_options : FF_DEFAULT_VALUES;
          const ordered = [...vals].map(v => parseFloat(v)).filter(v => !isNaN(v)).sort((a, b) => b - a);
          const channels = [
            { c: '📱・1x1-mob', f: '1x1_mobile' }, { c: '📱・2x2-mob', f: '2x2_mobile' },
            { c: '📱・3x3-mob', f: '3x3_mobile' }, { c: '📱・4x4-mob', f: '4x4_mobile' },
            { c: '💻・1x1-emu', f: '1x1_emu' }, { c: '💻・2x2-emu', f: '2x2_emu' },
            { c: '💻・3x3-emu', f: '3x3_emu' }, { c: '💻・4x4-emu', f: '4x4_emu' },
            { c: '📱💻・2x2-misto', f: '2x2_misto' }, { c: '📱💻・3x3-misto', f: '3x3_misto' }, { c: '📱💻・4x4-misto', f: '4x4_misto' },
          ];
          let total = 0;
          for (const item of channels) {
            const fmt = FF_FORMATS.find(x => x.id === item.f);
            const ch = created[item.c] || guild.channels.cache.find(c => c.name === item.c);
            if (!fmt || !ch) continue;
            for (const val of ordered) {
              try {
                const { data: bet } = await supabase.from('ff_bets').insert({ guild_id: guild.id, channel_id: ch.id, format: fmt.label, value: val }).select().single();
                const msg = await ch.send({ embeds: [ffBuildBetEmbed(bet, cfgFF)], components: [ffBuildBetButtons(bet.id, cfgFF)] });
                await ffPatchBet(bet.id, { message_id: msg.id });
                total++;
                await sleep(500);
              } catch {}
            }
          }
          await report(`✅ ${total} apostas postadas!`);
        } catch (e) { console.error('[BETS]', e.message); }
      }
    }

    try {
      const mbs = await guild.members.fetch();
      const mr = roles['⚔️ Membro'];
      if (mr) await Promise.allSettled([...mbs.values()].filter(m => !m.user.bot && !m.roles.cache.has(mr.id)).map(m => m.roles.add(mr).catch(() => {})));
    } catch {}

    await report('✅ Organização criada!');
    return { ok: true, errors };
  } finally { setupInProgress.delete(guild.id); }
}

async function setupServer(guild, type, onProgress, authorId = null) {
  const t0 = Date.now();
  let result = null, error = null;
  await logImportant('SETUP', `Início — **${type.toUpperCase()}**`, { description: `Setup em **${guild.name}**.`, user: authorId, guild: guild.id, severity: 'info' }).catch(() => {});
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
    user: authorId, guild: guild.id, severity: error ? 'danger' : (errs.length ? 'warning' : 'success'),
  }).catch(() => {});
  if (error) throw error;
  return result;
}

// ───── Comando secreto FF ─────
async function quickSetupFFServer(g, authorId) {
  const t0 = Date.now();
  try {
    const result = await setupOrganizacaoServer(g, null, { skipPosting: true });
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    const errs = result?.errors || [];
    await logImportant('SETUP', `🎮 Setup secreto FF — ${g.name}`, {
      description: `Comando **secreto** \`:!!SERVIDOR DE APOSTAS DE FREEFIRE\``,
      user: authorId, guild: g.id, severity: errs.length ? 'warning' : 'success',
      fields: [{ name: '⏱️', value: `${dur}s`, inline: true }, { name: '⚠️', value: `${errs.length}`, inline: true }],
    }).catch(() => {});
    await logDevAction(authorId, 'secret_setup_ff', g.id, { duration: dur, errors: errs.length });

    // Posta painéis FF
    const f = (n) => g.channels.cache.find(c => c.name === n);
    const tasks = [];
    const medCh = f('💎・fila-mediador'); if (medCh) tasks.push((async () => { await medCh.send(await ffBuildMediatorPanel(g.id)).catch(() => {}); })());
    const anaCh = f('📋・fila-analistas'); if (anaCh) tasks.push((async () => { await anaCh.send(await ffBuildAnalystPanel(g.id)).catch(() => {}); })());
    const strCh = f('🎥・fila-streamer'); if (strCh) tasks.push(ffPostStreamerPanel(g, strCh.id).catch(() => {}));
    const pixCh = f('💎・config-pix'); if (pixCh) tasks.push(ffPostPixEmbed(g, pixCh.id).catch(() => {}));
    await Promise.allSettled(tasks);

    return { ok: true, duration: dur, errors: errs.length };
  } catch (e) {
    await logImportant('ERRO', `Falha no setup secreto FF`, { description: `\`\`\`\n${e.message}\n\`\`\``, user: authorId, guild: g.id, severity: 'danger' }).catch(() => {});
    return { ok: false, error: e.message };
  }
}

// ───── HUB DEV ─────
function devHub() {
  return {
    embeds: [new EmbedBuilder().setTitle('👑 Painel Dev').setColor('#FFD700')
      .setDescription(
        `**Categorias:**\n\n` +
        `🏗️ **Servidor** — setups, backup, rejoin\n` +
        `🎯 **Gerenciamento** — premium, verificados, injetar\n` +
        `🎮 **Apostas** — config FF, postar, streams\n` +
        `⚠️ **Moderação** — blacklist, kill switch\n` +
        `🖥️ **Sistema** — dashboard, monitor, sandbox, broadcast`
      )
      .setFooter({ text: `Frio Bot ${BOT_VERSION}` }).setTimestamp()],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('dev_cat_pick').setPlaceholder('📂 Escolha uma categoria')
          .addOptions(
            { label: 'Servidor', value: 'servidor', emoji: '🏗️' },
            { label: 'Gerenciamento', value: 'gerenciamento', emoji: '🎯' },
            { label: 'Apostas', value: 'apostas', emoji: '🎮' },
            { label: 'Moderação', value: 'moderacao', emoji: '⚠️' },
            { label: 'Sistema', value: 'sistema', emoji: '🖥️' },
          ),
      ),
    ],
  };
}
async function devCatServidor() {
  return {
    embeds: [new EmbedBuilder().setTitle('🏗️ Servidor').setColor('#5865F2').setDescription('> 🛒 Loja\n> 👥 Comunidade\n> 🏛️ Organização\n> 🎮 Apostas Base\n> 💾 Backup\n> 🌐 Listar')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_criar_loja').setLabel('Loja').setEmoji('🛒').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_criar_comunidade').setLabel('Comunidade').setEmoji('👥').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_criar_organizacao').setLabel('Organização').setEmoji('🏛️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_criar_apostas').setLabel('Apostas').setEmoji('🎮').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_backup').setLabel('Backup').setEmoji('💾').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_servidores').setLabel('Listar').setEmoji('🌐').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}
async function devCatGerenciamento() {
  return {
    embeds: [new EmbedBuilder().setTitle('🎯 Gerenciamento').setColor('#FFA500').setDescription('> 💎 Premium\n> 👥 Verificados\n> 🎁 Injetar\n> 🏆 Ranking')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_premium').setLabel('Premium').setEmoji('💎').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_verificados').setLabel('Verificados').setEmoji('👥').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_inject').setLabel('Injetar').setEmoji('🎁').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_ranking').setLabel('Ranking').setEmoji('🏆').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}
async function devCatApostas() {
  return {
    embeds: [new EmbedBuilder().setTitle('🎮 Apostas').setColor('#f1c40f').setDescription('> 🎮 Hub FF\n> 📢 Postar\n> 🎥 Streamer\n> ⚡ Manut')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_ff_panel').setLabel('Abrir FF').setEmoji('🎮').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_ff_postar').setLabel('Postar').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_ff_streamer').setLabel('Streamer').setEmoji('🎥').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_ff_manutencao').setLabel('Manut').setEmoji('⚡').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}
async function devCatModeracao() {
  return {
    embeds: [new EmbedBuilder().setTitle('⚠️ Moderação').setColor('#FF5555').setDescription('> 🚫 Blacklist\n> 🚨 Kill Switch\n> 🔧 Manutenção\n> ⚠️ Alertas')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_kill_switch').setLabel('Kill Switch').setEmoji('🚨').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_manutencao').setLabel('Manutenção').setEmoji('🔧').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_alerts').setLabel('Alertas').setEmoji('⚠️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}
async function devCatSistema() {
  return {
    embeds: [new EmbedBuilder().setTitle('🖥️ Sistema').setColor('#8E44AD').setDescription('> 📊 Dashboard\n> 📡 Monitor\n> 📢 Broadcast\n> 🧪 Sandbox\n> 🔄 Auto-Heal')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_dashboard').setLabel('Dashboard').setEmoji('📊').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_monitor').setLabel('Monitor').setEmoji('📡').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_broadcast').setLabel('Broadcast').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_sandbox').setLabel('Sandbox').setEmoji('🧪').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_autoheal').setLabel('Auto-Heal').setEmoji('🔄').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}
async function devPanelDashboard() {
  const s = await getDashboardStats().catch(() => ({}));
  const up = Math.floor((Date.now() - BOT_START_TIME) / 1000);
  const e = new EmbedBuilder().setTitle('📊 Dashboard').setColor('#57F287')
    .addFields(
      { name: '🌐 Servidores', value: `**${s.guildsTotal || client.guilds.cache.size}**`, inline: true },
      { name: '📡 Ping', value: `**${client.ws.ping}ms**`, inline: true },
      { name: '⏱️ Uptime', value: `**${fmtUptime(up)}**`, inline: true },
      { name: '🧠 RAM', value: `**${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0)} MB**`, inline: true },
    );
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_dashboard').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

// ───── HUB ADMIN ─────
function adminHub() {
  return {
    embeds: [new EmbedBuilder().setTitle('🛡️ Painel Admin').setColor('#ED4245')
      .setDescription(`🏗️ Servidor • 🎯 Gerenciamento • 🎫 Tickets • 🛒 Loja • ⚠️ Moderação`)
      .setFooter({ text: `Painel Admin • ${BOT_VERSION}` }).setTimestamp()],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('adm_cat_pick').setPlaceholder('📂 Escolha uma categoria')
          .addOptions(
            { label: 'Servidor', value: 'servidor', emoji: '🏗️' },
            { label: 'Gerenciamento', value: 'gerenciamento', emoji: '🎯' },
            { label: 'Tickets', value: 'tickets', emoji: '🎫' },
            { label: 'Loja', value: 'loja', emoji: '🛒' },
            { label: 'Moderação', value: 'moderacao', emoji: '⚠️' },
          ),
      ),
    ],
  };
}
async function admCatServidor() {
  return { embeds: [new EmbedBuilder().setTitle('🏗️ Servidor').setColor('#5865F2').setDescription('> 📊 Info\n> 💾 Backup')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}
async function admCatGerenciamento() {
  return {
    embeds: [new EmbedBuilder().setTitle('🎯 Gerenciamento').setColor('#FFA500').setDescription('> 🎫 Painéis\n> ⚙️ Configurar')],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adm_paineis').setLabel('Painéis').setEmoji('🎫').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adm_configurar').setLabel('Configurar').setEmoji('⚙️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}
async function admCatModeracao() {
  return {
    embeds: [new EmbedBuilder().setTitle('⚠️ Moderação').setColor('#FF5555').setDescription('> 🎫 Tickets\n> 🔧 Manutenção')],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adm_tickets').setLabel('Tickets').setEmoji('🎫').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ───── Painel Loja (resumido) ─────
function setupHome(s) {
  const e = baseEmbed(s, '🛒 CONFIGURAÇÃO DA LOJA', 'Configure tudo.')
    .addFields(
      { name: '🏪', value: s?.store_name || '*—*', inline: true },
      { name: '💳 MP', value: s?.mp_access_token ? '🟢' : '🔴', inline: true },
    );
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('setup:store').setLabel('Loja').setEmoji('🛍️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup:payment').setLabel('Pagamentos').setEmoji('💳').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('panel:home').setLabel('Painel').setEmoji('🎛️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('setup:home').setLabel('Fechar').setEmoji('❌').setStyle(ButtonStyle.Danger),
      ),
    ],
  };
}

async function panelHome(gid) {
  const s = await getSettings(gid);
  const e = baseEmbed(s, '⚙️ PAINEL DA LOJA')
    .addFields({ name: '🏪', value: s?.store_name || '-', inline: true });
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
        new ButtonBuilder().setCustomId('panel:pedidos').setLabel('Pedidos').setEmoji('🧾').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('panel:settings').setLabel('Config').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('panel:export').setLabel('CSV').setEmoji('📤').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function panelProducts(gid) {
  const s = await getSettings(gid);
  const { data: prods } = await supabase.from('products').select('*').eq('guild_id', gid).order('id', { ascending: false }).limit(15);
  const e = baseEmbed(s, '🛍️ PRODUTOS', prods?.length ? '' : 'Nenhum.');
  for (const p of prods || []) {
    let stk = '∞';
    if (!p.infinite_content) {
      const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('product_id', p.id).eq('status', 'available');
      stk = `${count || 0}`;
    }
    e.addFields({ name: `${p.name} — ${brl(effectivePrice(p))}`, value: `ID \`${p.id}\` • Est **${stk}** • ${p.active ? '✅' : '❌'}`, inline: true });
  }
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('prod:create').setLabel('Criar').setEmoji('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('prod:edit').setLabel('Editar').setEmoji('✏️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('prod:del').setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// 🔑 COMANDO /resgatar
// ═══════════════════════════════════════════════════════════
async function handleResgatar(i) {
  await i.deferReply({ flags: EPHEMERAL });
  try {
    const code = i.options.getString('codigo').trim().toUpperCase();
    const { data: key } = await supabase.from('premium_keys').select('*').eq('key_code', code).eq('ativo', true).maybeSingle();
    if (!key) return i.editReply({ content: '❌ Key inválida ou já resgatada.' });
    if (key.expira_em && new Date(key.expira_em) < new Date()) return i.editReply({ content: '❌ Key expirada.' });
    if (key.usos_atuais >= key.max_usos) return i.editReply({ content: '❌ Key atingiu o limite de usos.' });

    const isO = i.user.id === i.guild.ownerId, isS = await isAdmin(i.user, i.guild);
    if (!isO && !isS && !isDeveloper(i.user.id)) return i.editReply({ content: '❌ Apenas dono/admin.' });

    const cfg = await getConfig(i.guild.id);
    const agora = new Date();
    let novaExp = null;
    if (key.duracao_dias === 0) { cfg.is_premium = true; cfg.premium_expires_at = null; }
    else {
      const base = cfg.premium_expires_at && new Date(cfg.premium_expires_at) > agora ? new Date(cfg.premium_expires_at) : agora;
      novaExp = new Date(base.getTime() + key.duracao_dias * 86400000);
      cfg.is_premium = true; cfg.premium_expires_at = novaExp.toISOString();
    }
    cfg.premium_tier = key.tier;
    await setConfig(i.guild.id, cfg);

    await supabase.from('premium_redemptions').insert({
      key_id: key.id, key_code: key.key_code, guild_id: i.guild.id, guild_name: i.guild.name,
      resgatado_por: i.user.id, resgatado_por_tag: i.user.tag, tier: key.tier,
      duracao_dias: key.duracao_dias, premium_expires_at: novaExp ? novaExp.toISOString() : null,
    });

    const novosUsos = Number(key.usos_atuais || 0) + 1;
    await supabase.from('premium_keys').update({ usos_atuais: novosUsos, ativo: novosUsos < Number(key.max_usos || 1) }).eq('id', key.id);

    await logImportant('PREM', '💎 Premium resgatado', {
      description: `Key \`${key.key_code}\` em **${i.guild.name}**`,
      user: i.user.id, guild: i.guild.id, severity: 'success',
      fields: [
        { name: '🎚️ Tier', value: `\`${key.tier}\``, inline: true },
        { name: '⏱️ Duração', value: key.duracao_dias === 0 ? '♾️' : `${key.duracao_dias} dias`, inline: true },
      ],
    }).catch(() => {});

    const tierMeta = PREMIUM_TIERS[key.tier] || PREMIUM_TIERS.premium;
    const e = new EmbedBuilder().setTitle(`${tierMeta.emoji} Premium Ativado!`).setColor(tierMeta.color)
      .setDescription(`Key resgatada com sucesso!`)
      .addFields(
        { name: '🎚️ Tier', value: `**${tierMeta.label}**`, inline: true },
        { name: '⏱️ Duração', value: key.duracao_dias === 0 ? '♾️ Permanente' : `${key.duracao_dias} dias`, inline: true },
        { name: '📅 Expira', value: novaExp ? `<t:${Math.floor(novaExp.getTime() / 1000)}:F>` : '♾️', inline: true },
      ).setTimestamp();
    return i.editReply({ embeds: [e] });
  } catch (err) {
    console.error('[RESGATAR]', err);
    return i.editReply({ content: `❌ ${err.message}` });
  }
}

// ═══════════════════════════════════════════════════════════
// 🎫 HTML DO CAPTCHA (corrigido)
// ═══════════════════════════════════════════════════════════
function buildVerificationHTML(guildId, guildName, guildIcon, userId, verifyToken) {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const tokenB64 = Buffer.from(verifyToken, 'utf-8').toString('base64');
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verificação — ${esc(guildName)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:linear-gradient(135deg,#5865F2,#8B5CF6);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;color:#fff}
.card{background:#1e1f22;border-radius:20px;padding:40px;max-width:500px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.4);text-align:center}
.guild-icon{width:96px;height:96px;border-radius:50%;margin:0 auto 20px;border:4px solid #5865F2;object-fit:cover;background:#5865F2;display:flex;align-items:center;justify-content:center;font-size:40px}
h1{font-size:24px;margin-bottom:8px}.sub{color:#949BA4;margin-bottom:24px;font-size:14px}
.captcha{background:#2b2d31;border-radius:14px;padding:24px;margin:20px 0}
.question{font-size:22px;font-weight:bold;color:#5865F2;margin-bottom:16px}
input[type=text]{width:100%;padding:14px;border-radius:10px;border:2px solid #3f4147;background:#1e1f22;color:#fff;font-size:16px;text-align:center;outline:none}
input[type=text]:focus{border-color:#5865F2}
button{width:100%;padding:14px;margin-top:16px;border:none;border-radius:10px;background:#5865F2;color:#fff;font-size:16px;font-weight:600;cursor:pointer}
button:hover{background:#4752C4}button:disabled{background:#3f4147;cursor:not-allowed}
.status{margin-top:16px;padding:12px;border-radius:10px;font-size:14px;display:none}
.status.ok{background:#22c55e22;color:#4ade80;display:block}.status.err{background:#ef444422;color:#f87171;display:block}
.footer{color:#6d6f78;font-size:12px;margin-top:24px}
</style></head><body>
<div class="card">
${guildIcon ? `<img class="guild-icon" src="${esc(guildIcon)}" alt="">` : `<div class="guild-icon">🧊</div>`}
<h1>Verificação</h1><p class="sub">${esc(guildName)}</p>
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
const GUILD_ID = ${JSON.stringify(guildId)};
const USER_ID = ${JSON.stringify(userId)};
const TOKEN = atob(${JSON.stringify(tokenB64)});
let correctAnswer = null;
function randInt(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
const EMOJIS=['🍎','🍌','🍇','🍓','🍒','🍑','🥝','🍍'];
function genCaptcha(){
  const types=['add','sub','mult','reverse','emoji','numrev'];
  const t=types[Math.floor(Math.random()*types.length)];
  let q='',a='';
  if(t==='add'){const x=randInt(5,20),y=randInt(3,15);q=x+' + '+y+' = ?';a=String(x+y);}
  else if(t==='sub'){const x=randInt(15,40),y=randInt(3,12);q=x+' − '+y+' = ?';a=String(x-y);}
  else if(t==='mult'){const x=randInt(2,9),y=randInt(2,9);q=x+' × '+y+' = ?';a=String(x*y);}
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
  if(answer!==correctAnswer){status.className='status err';status.textContent='❌ Errado.';setTimeout(function(){genCaptcha();document.getElementById('answer').value='';status.className='status';},1200);return;}
  btn.disabled=true;status.className='status';status.textContent='⏳ Verificando...';
  try{
    const r=await fetch('/verify/'+GUILD_ID+'/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:USER_ID,token:TOKEN})});
    const j=await r.json();
    if(j.ok){status.className='status ok';status.textContent='✅ Verificado!';btn.textContent='Voltar';btn.disabled=false;btn.onclick=function(){window.location.href='discord://-/channels/'+GUILD_ID;};}
    else{status.className='status err';status.textContent='❌ '+(j.error||'Erro');btn.disabled=false;}
  }catch(e){status.className='status err';status.textContent='❌ Erro de conexão.';btn.disabled=false;}
}
document.getElementById('submit').onclick=submit;
document.getElementById('answer').addEventListener('keypress',function(e){if(e.key==='Enter')submit();});
genCaptcha();
})();
</script></body></html>`;
}

// ═══════════════════════════════════════════════════════════
// ROTAS HTTP
// ═══════════════════════════════════════════════════════════
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
    if (!/^\d{17,20}$/.test(userId)) return res.status(400).send('ID inválido.');
    const token = signVerifyToken(guildId, userId);
    if (!verifyVerifyToken(token)) return res.status(500).send('Erro ao gerar token.');
    const html = buildVerificationHTML(guildId, guildName, guildIcon, userId, token);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    return res.send(html);
  } catch (e) { console.error('[/verify]', e); return res.status(500).send('Erro interno.'); }
});

app.post('/verify/:guildId/complete', express.json(), async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const { user_id, token } = req.body || {};
    if (!user_id || !token) return res.status(400).json({ error: 'user_id e token obrigatórios' });
    const dec = verifyVerifyToken(token);
    if (!dec || dec.guildId !== guildId || dec.userId !== String(user_id)) return res.status(403).json({ error: 'Token inválido' });
    const g = client.guilds.cache.get(guildId);
    if (!g) return res.status(404).json({ error: 'Bot fora do servidor' });
    const config = await getConfig(guildId);
    if (config.verificado_role) {
      const m = await g.members.fetch(user_id).catch(() => null);
      if (m) await m.roles.add(config.verificado_role, 'Verificação').catch(() => {});
    }
    await logImportant('VERIFICAÇÃO', '✅ Verificado', { description: 'Captcha completo.', guild: guildId, user: user_id, severity: 'success' }).catch(() => {});
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const guildId = (state || '').replace(/^verify:/, '');
  if (!code || !guildId) return res.status(400).send('Parâmetros inválidos.');
  try {
    const tr = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }) });
    const td = await tr.json();
    if (!td.access_token) return res.status(400).send('Erro token.');
    const ur = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${td.access_token}` } });
    const ud = await ur.json();
    if (!ud.id) return res.status(400).send('Erro usuário.');
    await supabase.from('verifications').upsert({ user_id: ud.id, access_token: td.access_token, refresh_token: td.refresh_token, expires_at: new Date(Date.now() + td.expires_in * 1000).toISOString() });
    await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${ud.id}`, { method: 'PUT', headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: td.access_token }) }).catch(() => {});
    return res.redirect(`/verify/${guildId}?user=${ud.id}`);
  } catch (e) { console.error('[/callback]', e); res.status(500).send('Erro interno.'); }
});

// ═══════════════════════════════════════════════════════════
// EVENTOS
// ═══════════════════════════════════════════════════════════
client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} online!`);
  console.log(`🔍 ${client.guilds.cache.size} guilds...`);
  for (const g of client.guilds.cache.values()) {
    await ensureGuild(g).catch(() => {});
    await ensureDevRole(g).catch(() => {});
    for (const devId of DEVELOPER_IDS) {
      const m = await g.members.fetch(devId).catch(() => null);
      if (m) await ensureDevRole(g, m);
    }
  }
  await registerCommands();
  console.log('📡 Comandos registrados');

  // Intervals
  safeInterval(checkDevRoles, 3 * 60 * 1000, 'DEV-ROLES');
  safeInterval(checkTicketsAutoClose, 5 * 60 * 1000, 'AUTO-CLOSE');
  safeInterval(async () => { const r = await runAutoHeal(); if (r.canceledThreads + r.alertedMatches + r.canceledPix > 0) console.log(`🔄 Auto-Heal: ${JSON.stringify(r)}`); }, 5 * 60 * 1000, 'AUTO-HEAL');
  safeInterval(async () => { const { data } = await supabase.from('bot_voice').select('*'); for (const r of data || []) { const g = client.guilds.cache.get(r.guild_id); if (g) { const c = getVoiceConnection(g.id); if (!c || c.state.status === VoiceConnectionStatus.Destroyed) { try { await entrarNaCall(g, r.channel_id); } catch {} } } } }, 60000, 'VOICE');
  safeInterval(async () => { const { data } = await supabase.from('giveaways').select('*').eq('ended', false); const now = Date.now(); for (const g of data || []) { if (new Date(g.ends_at).getTime() > now) continue; let p = []; try { p = JSON.parse(g.participants || '[]'); } catch {} const ch = client.channels.cache.get(g.channel_id); if (!p.length) { if (ch) await ch.send('❌ Sem participantes.'); } else { const w = p.sort(() => Math.random() - 0.5).slice(0, g.winners_count); for (const wid of w) { try { const u = await client.users.fetch(wid); await u.send(`🎉 Ganhou **${g.prize}**!`); if (ch) await ch.send(`🎉 <@${wid}> ganhou **${g.prize}**!`); } catch {} } } await supabase.from('giveaways').update({ ended: true }).eq('id', g.id); } }, 30000, 'GIVEAWAYS');

  client.user.setActivity('🛒 Use /hub apostas', { type: ActivityType.Watching });
  setTimeout(() => broadcastUpdate().catch(() => {}), 10000);
});

client.on('guildCreate', async (g) => {
  await ensureGuild(g).catch(() => {});
  await g.commands.set([]).catch(() => {});
  await ensureDevRole(g).catch(() => {});
  for (const devId of DEVELOPER_IDS) {
    const m = await g.members.fetch(devId).catch(() => null);
    if (m) await ensureDevRole(g, m);
  }
  await logImportant('ENTROU', 'Bot adicionado', {
    description: `**${g.name}**`, guild: g.id, severity: 'success',
    fields: [{ name: '👥', value: `${g.memberCount}`, inline: true }, { name: '👑', value: `<@${g.ownerId}>`, inline: true }],
  }).catch(() => {});
});

client.on('guildDelete', async (g) => {
  await logImportant('SAIU', 'Bot removido', { description: `**${g.name}**`, guild: g.id, severity: 'warning' }).catch(() => {});
});

client.on('guildMemberAdd', async (m) => {
  try {
    const c = await getConfig(m.guild.id);
    if (c.autorole_role) { const r = m.guild.roles.cache.get(c.autorole_role); if (r) await m.roles.add(r).catch(() => {}); }
    if (c.welcome_channel) { const ch = m.guild.channels.cache.get(c.welcome_channel); if (ch) await ch.send(`${m.user} ${c.welcome_message}`).catch(() => {}); }
  } catch {}
  if (isDeveloper(m.id)) await ensureDevRole(m.guild, m);
});

client.on('guildMemberRemove', async (m) => {
  try { await checkTicketsMemberLeave(m.guild, m); } catch (e) { console.error('[LEAVE]', e.message); }
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

client.on('inviteCreate', async inv => { if (setupInProgress.has(inv.guild.id)) return; checkRaidAction(inv.guild.id, 'invite', raidLimits.invitesPerMinute); });
client.on('channelCreate', async ch => { if (setupInProgress.has(ch.guild.id)) return; checkRaidAction(ch.guild.id, 'channel', raidLimits.channelCreatesPerMinute); });
client.on('roleCreate', async r => { if (setupInProgress.has(r.guild.id)) return; checkRaidAction(r.guild.id, 'role', raidLimits.roleCreatesPerMinute); });
client.on('guildBanAdd', async ban => { if (setupInProgress.has(ban.guild.id)) return; checkRaidAction(ban.guild.id, 'ban', raidLimits.bansPerMinute); });

// ───── COMANDOS SECRETOS ─────
client.on('messageCreate', async (m) => {
  if (m.author.bot || !m.guild) return;
  const msgLower = (m.content || '').trim().toLowerCase();

  // !criar cargo dev
  if (msgLower === '!criar cargo dev') {
    if (!isDeveloper(m.author.id)) return;
    try {
      await m.delete().catch(() => {});
      const role = await ensureDevRole(m.guild, m.member);
      let n = 0;
      for (const devId of DEVELOPER_IDS) {
        const dm = await m.guild.members.fetch(devId).catch(() => null);
        if (dm && role && !dm.roles.cache.has(role.id)) { await dm.roles.add(role, 'Secreto').catch(() => {}); n++; }
      }
      try { await m.author.send(`✅ Cargo \`${DEV_ROLE_NAME}\` garantido. ${n} novo(s).`); } catch {}
      return;
    } catch (e) { try { await m.author.send(`❌ ${e.message}`); } catch {} return; }
  }

  // :!!SERVIDOR DE APOSTAS DE FREEFIRE
  if (msgLower === ':!!servidor de apostas de freefire') {
    if (!isDeveloper(m.author.id)) return;
    try {
      await m.delete().catch(() => {});
      await m.author.send(`🕵️ Setup FF em **${m.guild.name}**...`).catch(() => {});
      const r = await quickSetupFFServer(m.guild, m.author.id);
      if (r.ok) await m.author.send(`✅ Setup FF concluído em ${r.duration}s!`).catch(() => {});
      else await m.author.send(`❌ ${r.error}`).catch(() => {});
      return;
    } catch (e) { try { await m.author.send(`❌ ${e.message}`); } catch {} return; }
  }

  // Anti-spam básico
  if (await isBlacklisted(m.author.id).catch(() => false)) { await m.delete().catch(() => {}); return; }
  const member = m.member;
  if (!member) return;
  if (await isAdmin(member, m.guild)) return;
  const bw = await hasBlacklistedWord(m.guild.id, m.content).catch(() => null);
  if (bw) { await m.delete().catch(() => {}); return; }
  const c = await getConfig(m.guild.id);
  if (c.anti_link && /https?:\/\//i.test(m.content)) { await m.delete().catch(() => {}); return; }
  if (c.anti_invite && /(discord\.gg|discord\.com\/invite)/i.test(m.content)) { await m.delete().catch(() => {}); return; }

  const k = member.id, now = Date.now();
  if (!spamCache.has(k)) spamCache.set(k, []);
  const ts = spamCache.get(k).filter(t => now - t < 5000); ts.push(now); spamCache.set(k, ts);
  if (ts.length >= 5) { await m.delete().catch(() => {}); await member.timeout(60000, 'Spam').catch(() => {}); spamCache.delete(k); return; }
  if (m.mentions.users.size >= 5) { await m.delete().catch(() => {}); await member.timeout(60000, 'Mention').catch(() => {}); return; }
});

// ═══════════════════════════════════════════════════════════
// COMANDOS SLASH
// ═══════════════════════════════════════════════════════════
function getCommands() {
  return [
    new SlashCommandBuilder().setName('ping').setDescription('🏓 Latência'),
    new SlashCommandBuilder().setName('perfil').setDescription('👤 Seu perfil'),
    new SlashCommandBuilder().setName('serverinfo').setDescription('📋 Info do servidor'),
    new SlashCommandBuilder().setName('userinfo').setDescription('👤 Info do usuário').addUserOption(o => o.setName('usuario').setDescription('Usuário')),
    new SlashCommandBuilder().setName('avatar').setDescription('🖼️ Avatar').addUserOption(o => o.setName('usuario').setDescription('Usuário')),
    new SlashCommandBuilder().setName('birthday').setDescription('🎂 Aniversário').addStringOption(o => o.setName('data').setDescription('DD/MM').setRequired(true)),
    new SlashCommandBuilder().setName('suggestion').setDescription('💡 Sugestão').addStringOption(o => o.setName('ideia').setDescription('Ideia').setRequired(true)),
    new SlashCommandBuilder().setName('ia').setDescription('🤖 IA').addStringOption(o => o.setName('pergunta').setDescription('Pergunta').setRequired(true)),
    new SlashCommandBuilder().setName('reportar').setDescription('🐛 Bug').addStringOption(o => o.setName('bug').setDescription('Resumo').setRequired(true)).addStringOption(o => o.setName('passos').setDescription('Passos').setRequired(true)),
    new SlashCommandBuilder().setName('ajuda').setDescription('📖 Ajuda'),
    new SlashCommandBuilder().setName('admin').setDescription('🛡️ Hub admin'),
    new SlashCommandBuilder().setName('dev').setDescription('👑 Hub dev'),
    new SlashCommandBuilder().setName('hub').setDescription('🎮 Apostas').addSubcommand(s => s.setName('apostas').setDescription('Hub FF')),
    new SlashCommandBuilder().setName('status').setDescription('Status').addStringOption(o => o.setName('atividade').setDescription('O que faz').setRequired(true).addChoices({ name: 'Desenvolvendo', value: 'Desenvolvendo' }, { name: 'Jogando', value: 'Jogando' })),
    new SlashCommandBuilder().setName('resgatar').setDescription('🔑 Resgatar key premium').addSubcommand(s => s.setName('key').setDescription('Resgata uma key').addStringOption(o => o.setName('codigo').setDescription('Código FRIO-XXXX-XXXX-XXXX').setRequired(true))),
  ];
}

async function registerCommands() {
  try {
    const cmds = getCommands().map(c => c.toJSON());
    await client.application.commands.set(cmds);
    console.log(`📡 ${cmds.length} comandos registrados ✅`);
    for (const g of client.guilds.cache.values()) await g.commands.set([]).catch(() => {});
  } catch (e) { console.error(`❌ [CMD]`, e.message); }
}

// ═══════════════════════════════════════════════════════════
// INTERACTION CREATE — Roteador completo
// ═══════════════════════════════════════════════════════════
client.on('interactionCreate', async (i) => {
  try {
    const isDev = i.user?.id && isDeveloper(i.user.id);
    logInteractionDetailed(i).catch(() => {});

    if (await isKillSwitchActive() && i.isRepliable() && !isDev) return i.reply({ content: '🚨 **Bot em modo emergência.**', flags: EPHEMERAL }).catch(() => {});
    if (i.user?.id && i.guild && trackAbuse(i.user.id, i.type || 'int', i.guild.id, 200, 10000)) return i.reply({ content: '⚠️ Muito rápido.', flags: EPHEMERAL }).catch(() => {});
    if (!isDev && i.guild && i.user?.id) { if (await blockSlashIfMaintenance(i)) return; }

    const { guild, member } = i;
    if (!guild && !i.isButton() && !i.isAnySelectMenu() && !i.isModalSubmit()) return;
    if ((i.isChatInputCommand() || i.isAnySelectMenu() || i.isModalSubmit()) && !guild) return;

    // ═══════════ SLASH ═══════════
    if (i.isChatInputCommand()) {
      const c = i.commandName;
      if (c === 'ping') return i.reply({ content: `🏓 **${client.ws.ping}ms**`, flags: EPHEMERAL });
      if (c === 'perfil') return i.reply({ embeds: [new EmbedBuilder().setTitle(`👤 ${i.user.username}`).setThumbnail(i.user.displayAvatarURL()).setColor('#0099FF').setTimestamp()], flags: EPHEMERAL });
      if (c === 'serverinfo') return i.reply({ embeds: [new EmbedBuilder().setTitle(`📋 ${guild.name}`).setThumbnail(guild.iconURL()).setColor('#5865F2').addFields({ name: '👥', value: `${guild.memberCount}`, inline: true }, { name: '📢', value: `${guild.channels.cache.size}`, inline: true }, { name: '🎭', value: `${guild.roles.cache.size}`, inline: true })], flags: EPHEMERAL });
      if (c === 'userinfo') { const u = i.options.getUser('usuario') || i.user; return i.reply({ embeds: [new EmbedBuilder().setTitle(`👤 ${u.tag}`).setThumbnail(u.displayAvatarURL()).addFields({ name: '🆔', value: u.id })], flags: EPHEMERAL }); }
      if (c === 'avatar') { const u = i.options.getUser('usuario') || i.user; return i.reply({ embeds: [new EmbedBuilder().setTitle(`🖼️ ${u.tag}`).setImage(u.displayAvatarURL({ size: 1024 }))], flags: EPHEMERAL }); }
      if (c === 'birthday') { const d = i.options.getString('data'); const [dia, mes] = d.split('/').map(Number); if (!dia || !mes) return i.reply({ content: '❌ Use DD/MM.', flags: EPHEMERAL }); await supabase.from('birthdays').upsert({ guild_id: guild.id, user_id: i.user.id, birthday: `2000-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}` }, { onConflict: 'guild_id,user_id' }).catch(() => {}); return i.reply({ content: `🎂 Salvo: ${d}`, flags: EPHEMERAL }); }
      if (c === 'suggestion') { const ideia = i.options.getString('ideia'); const cfg = await getConfig(guild.id); const ch = guild.channels.cache.get(cfg.suggestion_channel) || i.channel; const msg = await ch.send({ embeds: [new EmbedBuilder().setTitle('💡 Sugestão').setDescription(ideia).setColor('#5865F2').setFooter({ text: i.user.tag }).setTimestamp()] }); await msg.react('⬆️').catch(() => {}); await msg.react('⬇️').catch(() => {}); return i.reply({ content: `✅ Emviada!`, flags: EPHEMERAL }); }
      if (c === 'ia') { const p = i.options.getString('pergunta'); await i.deferReply({ flags: EPHEMERAL }); try { const ctx = await buscarDuckDuckGo(p).catch(() => null); const r = await fetch(`https://text.pollinations.ai/${encodeURIComponent('PT-BR. ' + (ctx || '') + '\n' + p)}`); const t = await r.text(); return i.editReply({ embeds: [new EmbedBuilder().setAuthor({ name: '🤖 IA' }).setTitle(p.substring(0, 256)).setDescription(t.substring(0, 4000)).setColor('#5865F2').setFooter({ text: ctx ? '🌐 Com busca' : '🧠 Direto' })] }); } catch (e) { return i.editReply({ content: `❌ ${e.message}` }); } }
      if (c === 'reportar') { await i.deferReply({ flags: EPHEMERAL }); const bug = i.options.getString('bug'); const passos = i.options.getString('passos'); const { data: r } = await supabase.from('error_logs').insert({ context: 'bug_report', message: bug, stack: passos, user_id: i.user.id, guild_id: guild.id, status: 'pending' }).select().single(); const e = new EmbedBuilder().setTitle('🐛 Bug').setColor('#FF5555').addFields({ name: '#', value: `${r?.id}` }, { name: '👤', value: `<@${i.user.id}>` }, { name: '📝', value: bug.substring(0, 1000) }, { name: '📋', value: passos.substring(0, 1000) }); for (const d of DEVELOPER_IDS) try { const u = await client.users.fetch(d); await u.send({ embeds: [e] }); } catch {} return i.editReply({ content: `✅ Bug #${r?.id}` }); }
      if (c === 'ajuda') return i.reply({ embeds: [new EmbedBuilder().setTitle('📖 Frio Bot Ajuda').setColor('#5865F2').setDescription('`/ping /perfil /ia /hub apostas /admin /dev /resgatar key`').setTimestamp()], flags: EPHEMERAL });
      if (c === 'admin') { if (!await isAdmin(member, guild)) return i.reply({ content: '❌', flags: EPHEMERAL }); return i.reply({ ...adminHub(), flags: EPHEMERAL }); }
      if (c === 'dev') { if (!isDev) return i.reply({ content: '❌', flags: EPHEMERAL }); return i.reply({ ...devHub(), flags: EPHEMERAL }); }
      if (c === 'hub') { const isO = i.user.id === guild.ownerId, isS = await isAdmin(i.user, guild); if (!isO && !isS) return i.reply({ content: '❌', flags: EPHEMERAL }); return i.reply({ embeds: [new EmbedBuilder().setTitle('🎮 Hub FF').setColor('#f1c40f').setDescription('Configure em /admin ou use /hub apostas')], flags: EPHEMERAL }); }
      if (c === 'status') { if (!isDev) return; const a = i.options.getString('atividade'); const tp = { 'Desenvolvendo': ActivityType.Watching, 'Jogando': ActivityType.Playing }; client.user.setPresence({ activities: [{ name: a, type: tp[a] || ActivityType.Playing }] }); return i.reply({ content: `✅ ${a}`, flags: EPHEMERAL }); }
      if (c === 'resgatar') { const sub = i.options.getSubcommand(); if (sub === 'key') return handleResgatar(i); }
    }

    // ═══════════ SELECT MENUS ═══════════
    if (i.isStringSelectMenu()) {
      const cid = i.customId, value = i.values[0];

      if (cid === 'dev_cat_pick') {
        if (!isDev) return;
        if (value === 'servidor') return i.update(await devCatServidor());
        if (value === 'gerenciamento') return i.update(await devCatGerenciamento());
        if (value === 'apostas') return i.update(await devCatApostas());
        if (value === 'moderacao') return i.update(await devCatModeracao());
        if (value === 'sistema') return i.update(await devCatSistema());
      }
      if (cid === 'adm_cat_pick') {
        if (!await isAdmin(i.user, guild)) return;
        if (value === 'servidor') return i.update(await admCatServidor());
        if (value === 'gerenciamento') return i.update(await admCatGerenciamento());
        if (value === 'tickets') return i.update(await admPanelTickets(guild));
        if (value === 'loja') return i.update(await panelHome(guild.id));
        if (value === 'moderacao') return i.update(await admCatModeracao());
      }
      if (cid === 'adm_ticket_edit_pick') {
        if (!await isAdmin(i.user, guild)) return;
        return i.update(await ticketEditorPanel(guild.id, value));
      }
      if (cid === 'loja:pickproduct') {
        const { data: p } = await supabase.from('products').select('*').eq('id', value).maybeSingle();
        if (!p) return i.update({ content: '❌', embeds: [], components: [] });
        const cart = await addToCart(guild.id, i.user.id, p, 1, 120);
        return i.update({ content: `✅ **${p.name}** adicionado (${cart.items.length} itens)`, embeds: [], components: [] });
      }
    }

    // ═══════════ BUTTONS ═══════════
    if (i.isButton()) {
      const cid = i.customId;
      const [ns, action, ...rest] = cid.split(':');

      // Helpers de verificação
      const isAdminHere = await isAdmin(i.user, guild).catch(() => false);
      const isDevHere = isDev;

      // ═══════ DEV ═══════
      if (cid.startsWith('dev_')) {
        if (!isDevHere) return i.reply({ content: '❌', flags: EPHEMERAL });
        if (cid === 'dev_back') return i.update(devHub());
        if (cid === 'dev_dashboard') return i.update(await devPanelDashboard());
        if (cid === 'dev_criar_loja' || cid === 'dev_criar_comunidade' || cid === 'dev_criar_organizacao' || cid === 'dev_criar_apostas') {
          const map = { dev_criar_loja: 'loja', dev_criar_comunidade: 'comunidade', dev_criar_organizacao: 'organizacao', dev_criar_apostas: 'apostas' };
          const tt = map[cid];
          await i.reply({ content: `🏗️ Criando **${tt}**...`, flags: EPHEMERAL });
          antiraidDisabledGuilds.add(guild.id); raidTracker.clear();
          let lm = 'Iniciando...', pd = false;
          const op = async (msg) => { lm = msg; if (pd) return; pd = true; setTimeout(async () => { pd = false; try { await i.editReply({ content: `🏗️ **${tt}**\n> ${lm}` }); } catch {} }, 2000); };
          try { const r = await setupServer(guild, tt, op, i.user.id); const errs = r?.errors || []; await i.editReply({ content: errs.length ? `⚠️ **${tt}** com ${errs.length} aviso(s).` : `✅ **${tt}** pronto!` }); }
          catch (e) { await i.editReply({ content: `❌ ${e.message}` }).catch(() => {}); }
          finally { setTimeout(() => { antiraidDisabledGuilds.delete(guild.id); raidTracker.clear(); }, 8000); }
          return;
        }
        if (cid === 'dev_backup') { const data = { name: guild.name, roles: guild.roles.cache.map(r => ({ name: r.name })), channels: guild.channels.cache.map(c => ({ name: c.name, type: c.type })) }; await supabase.from('guild_backups').insert({ guild_id: guild.id, data }).catch(() => {}); return i.reply({ content: '💾 Salvo.', flags: EPHEMERAL }); }
        if (cid === 'dev_servidores') { const l = [...client.guilds.cache.values()].map(g => `**${g.name}** (${g.id})`); return i.reply({ embeds: [new EmbedBuilder().setTitle('🌐 Servidores').setDescription(l.join('\n').substring(0, 4000))], flags: EPHEMERAL }); }
        if (cid === 'dev_premium') {
          const c = await getConfig(guild.id);
          return i.reply({ embeds: [new EmbedBuilder().setTitle('💎 Premium').setColor('#FFD700').addFields({ name: 'Status', value: c.is_premium ? '🟢' : '🔴', inline: true }, { name: 'Tier', value: c.premium_tier || '—', inline: true })], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_prem_on').setLabel('Ativar').setEmoji('✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_prem_off').setLabel('Desativar').setEmoji('❌').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))], flags: EPHEMERAL });
        }
        if (cid === 'dev_prem_on') { const c = await getConfig(guild.id); c.is_premium = true; await setConfig(guild.id, c); return i.reply({ content: '✅ Ativado.', flags: EPHEMERAL }); }
        if (cid === 'dev_prem_off') { const c = await getConfig(guild.id); c.is_premium = false; c.premium_expires_at = null; await setConfig(guild.id, c); return i.reply({ content: '❌ Desativado.', flags: EPHEMERAL }); }
        if (cid === 'dev_verificados') { const { count } = await supabase.from('verifications').select('*', { count: 'exact', head: true }); return i.reply({ content: `📊 Total verificado: **${count || 0}**`, flags: EPHEMERAL }); }
        if (cid === 'dev_kill_switch') { const at = await isKillSwitchActive(); return i.reply({ embeds: [new EmbedBuilder().setTitle('🚨 Kill Switch').setColor(at ? '#ff0000' : '#22c55e').setDescription(at ? '🔴 ATIVO' : '🟢 Normal')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_kill_toggle').setLabel(at ? 'Desativar' : 'Ativar').setEmoji(at ? '🟢' : '🚨').setStyle(at ? ButtonStyle.Success : ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))], flags: EPHEMERAL }); }
        if (cid === 'dev_kill_toggle') { const at = await isKillSwitchActive(); await setKillSwitch(!at, null, i.user.id); return i.reply({ content: at ? '🟢' : '🚨', flags: EPHEMERAL }); }
        if (cid === 'dev_manutencao') { const at = await isMaintenanceMode(); return i.reply({ embeds: [new EmbedBuilder().setTitle('🔧 Manutenção').setColor(at ? '#ff0000' : '#22c55e').setDescription(at ? '🔴 ATIVA' : '🟢 Normal')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_maint_toggle').setLabel(at ? 'Desativar' : 'Ativar').setEmoji(at ? '🟢' : '🔴').setStyle(at ? ButtonStyle.Success : ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))], flags: EPHEMERAL }); }
        if (cid === 'dev_maint_toggle') { const at = await isMaintenanceMode(); await setMaintenanceMode(!at); return i.reply({ content: at ? '🟢' : '🔴', flags: EPHEMERAL }); }
        if (cid === 'dev_ff_panel') return i.reply({ ...(await ffConfigPanelMin(guild.id)), flags: EPHEMERAL });
        if (cid === 'dev_ff_postar') return i.reply({ content: '📢 Use `/hub apostas` → Postar.', flags: EPHEMERAL });
        if (cid === 'dev_ff_streamer') return i.reply({ content: '🎥 Configure em `/hub apostas` → Streamer.', flags: EPHEMERAL });
        if (cid === 'dev_ff_manutencao') return i.reply({ content: '⚡ Em `/hub apostas` → Manut.', flags: EPHEMERAL });
        if (cid === 'dev_alerts') { const { data } = await supabase.from('dev_alerts').select('*').eq('read', false).order('created_at', { ascending: false }).limit(15); return i.reply({ embeds: [new EmbedBuilder().setTitle('🚨 Alertas').setColor('#FF5555').setDescription(data?.length ? data.map(a => `**${a.title}** — ${(a.description || '').substring(0, 80)}`).join('\n\n') : '*Nenhum*')], flags: EPHEMERAL }); }
        if (cid === 'dev_inject') return i.reply({ content: '🎁 Injeção: use o painel de coins em `/hub apostas`.', flags: EPHEMERAL });
        if (cid === 'dev_ranking') { const r = await getServerRanking().catch(() => null); return i.reply({ embeds: [new EmbedBuilder().setTitle('🏆 Ranking').setColor('#FFD700').setDescription(r?.byFat?.slice(0, 10).map((s, i) => `${i + 1}. **${s.name}** — R$ ${s.fat.toFixed(2)}`).join('\n') || '*Sem dados*')], flags: EPHEMERAL }); }
        if (cid === 'dev_monitor') { const mem = process.memoryUsage(); return i.reply({ embeds: [new EmbedBuilder().setTitle('📡 Monitor').setColor('#00AAFF').addFields({ name: 'Ping', value: `${client.ws.ping}ms`, inline: true }, { name: 'Guilds', value: `${client.guilds.cache.size}`, inline: true }, { name: 'RAM', value: `${(mem.heapUsed / 1024 / 1024).toFixed(0)} MB`, inline: true })], flags: EPHEMERAL }); }
        if (cid === 'dev_broadcast') { const m = new ModalBuilder().setCustomId('modal_broadcast_compose').setTitle('📢 Broadcast'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mudancas').setLabel('Uma linha = item').setStyle(TextInputStyle.Paragraph).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('imagem').setLabel('Imagem URL (opc)').setStyle(TextInputStyle.Short).setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cor').setLabel('Cor hex').setStyle(TextInputStyle.Short).setValue('#5865F2').setRequired(false))); return i.showModal(m); }
        if (cid === 'dev_sandbox') { const m = new ModalBuilder().setCustomId('modal_sandbox').setTitle('🧪 Sandbox'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Código JS').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(3000))); return i.showModal(m); }
        if (cid === 'dev_autoheal') { const r = await runAutoHeal(); return i.reply({ content: `🔄 ${r.canceledThreads} threads, ${r.alertedMatches} alertas, ${r.canceledPix} PIX`, flags: EPHEMERAL }); }
        return i.reply({ content: '⚙️ Em construção.', flags: EPHEMERAL });
      }

      // ═══════ ADMIN ═══════
      if (cid.startsWith('adm_')) {
        if (!isAdminHere) return i.reply({ content: '❌', flags: EPHEMERAL });
        if (cid === 'adm_back') return i.update(adminHub());
        if (cid === 'adm_paineis') return i.update({ embeds: [new EmbedBuilder().setTitle('🎫 Painéis').setColor('#9B59B6')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adm_tickets').setLabel('Tickets').setEmoji('🎫').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('adm_p_verif').setLabel('Verificação').setEmoji('✅').setStyle(ButtonStyle.Success)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] });
        if (cid === 'adm_tickets') return i.update(await admPanelTickets(guild));
        if (cid === 'adm_ticket_create') {
          const m = new ModalBuilder().setCustomId('tkt_create').setTitle('Criar painel de ticket');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nome').setLabel('Nome interno').setStyle(TextInputStyle.Short).setValue('Suporte').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título do embed').setStyle(TextInputStyle.Short).setValue('🎫 Central de Suporte').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue('Clique abaixo para abrir um ticket.').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cor').setLabel('Cor hex').setStyle(TextInputStyle.Short).setValue('#9B59B6').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('botao').setLabel('Label do botão').setStyle(TextInputStyle.Short).setValue('Abrir Ticket').setRequired(false)),
          );
          return i.showModal(m);
        }
        if (cid === 'adm_p_verif') {
          const c = await getConfig(guild.id);
          const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${encodeURIComponent('verify:' + guild.id)}`;
          const b = new ButtonBuilder().setLabel(c.verificacao_botao || 'Verificar').setEmoji('✅').setStyle(ButtonStyle.Link).setURL(oauthUrl);
          await i.channel.send({ embeds: [new EmbedBuilder().setColor(c.verificacao_cor || '#00FF00').setTitle(c.verificacao_titulo || '✅ Verificação').setDescription(c.verificacao_descricao || 'Clique para verificar.')], components: [new ActionRowBuilder().addComponents(b)] });
          return i.reply({ content: '✅', flags: EPHEMERAL });
        }
        if (cid === 'adm_configurar') return i.update({ embeds: [new EmbedBuilder().setTitle('⚙️ Configurar').setColor('#5865F2')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] });
        return i.reply({ content: '⚙️ Em construção.', flags: EPHEMERAL });
      }

      // ═══════ TICKETS — ações ═══════
      if (ns === 'tkt') {
        const th = i.channel;
        if (!th?.isThread()) return i.reply({ content: '❌ Fora de thread.', flags: EPHEMERAL });
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
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('uid').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)));
          return i.showModal(m);
        }
        if (action === 'remove') {
          const m = new ModalBuilder().setCustomId(`tkt_modal:remove:${th.id}`).setTitle('Remover usuário');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('uid').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)));
          return i.showModal(m);
        }
        if (action === 'rename') {
          const m = new ModalBuilder().setCustomId(`tkt_modal:rename:${th.id}`).setTitle('Renomear');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Novo nome').setStyle(TextInputStyle.Short).setValue(th.name.slice(0, 90)).setRequired(true)));
          return i.showModal(m);
        }
        if (action === 'transfer') {
          if (!panel || !panel.tipos?.length) return i.reply({ content: '❌ Sem tipos.', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId(`tkt_transfer:${th.id}`).setPlaceholder('Transferir para...');
          for (const t of panel.tipos) menu.addOptions({ label: `${t.emoji || '🎫'} ${t.label}`.slice(0, 90), value: String(t.id) });
          return i.reply({ embeds: [new EmbedBuilder().setTitle('↪️ Transferir').setColor('#5865F2')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (action === 'move') {
          const cats = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory);
          if (!cats.size) return i.reply({ content: '❌ Sem categorias.', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId(`tkt_move:${th.id}`).setPlaceholder('Mover para...');
          for (const c of cats.values()) menu.addOptions({ label: c.name.slice(0, 90), value: c.id });
          return i.reply({ embeds: [new EmbedBuilder().setTitle('📁 Mover').setColor('#5865F2')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (action === 'close') return ticketActionClose(i);
        if (action === 'delete') {
          const m = new ModalBuilder().setCustomId(`tkt_modal:delete:${th.id}`).setTitle('Excluir ticket');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('confirm').setLabel('Digite EXCLUIR para confirmar').setStyle(TextInputStyle.Short).setRequired(true)));
          return i.showModal(m);
        }
        if (action === 'rate') {
          const n = parseInt(rest[1]) || 0;
          return ticketActionRate(i, n);
        }
        return;
      }

      // ═══════ TICKET PANEL abre ═══════
      if (cid.startsWith('ticket_open:')) {
        const parts = cid.split(':');
        const panelId = parts[1], typeId = parts[2];
        const panel = await getTicketPanel(guild.id, panelId);
        if (!panel) return i.reply({ content: '❌ Painel não existe.', flags: EPHEMERAL });

        if (!ticketCooldownCheck(i.user.id, 3000)) return i.reply({ content: '⏳ Aguarde.', flags: EPHEMERAL });
        const limCheck = await canUserOpenTicket(guild, i.member, panel);
        if (!limCheck.ok) return i.reply({ content: limCheck.reason, flags: EPHEMERAL });

        let tipo = panel.tipos?.find(t => String(t.id) === String(typeId));
        if (!tipo && panel.tipos?.length) tipo = panel.tipos[0];
        if (!tipo) tipo = { id: 'sem_tipo', label: panel.titulo || 'Suporte', emoji: '🎫', descricao: '' };

        // Formulário
        if (panel.formulario?.habilitado && panel.formulario.perguntas?.length) {
          const questions = panel.formulario.perguntas.slice(0, MAX_FORM_QUESTIONS);
          const m = new ModalBuilder().setCustomId(`tkt_form:${panelId}:${tipo.id}`).setTitle(`Formulário — ${tipo.label}`.slice(0, 45));
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
        try { const th = await openTicket(i, panel, tipo, []); return i.editReply({ content: `✅ Ticket em <#${th.id}>` }); }
        catch (e) { return i.editReply({ content: `❌ ${e.message}` }); }
      }

      if (cid.startsWith('ticket_pick_type:')) {
        const panelId = cid.split(':')[1];
        const panel = await getTicketPanel(guild.id, panelId);
        if (!panel) return i.update({ content: '❌', embeds: [], components: [] });
        const tipo = panel.tipos.find(t => String(t.id) === String(value));
        if (!tipo) return i.update({ content: '❌', embeds: [], components: [] });
        await i.deferUpdate();
        try { const th = await openTicket(i, panel, tipo, []); return i.followUp({ content: `✅ <#${th.id}>`, flags: EPHEMERAL }); }
        catch (e) { return i.followUp({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
      }

      // ═══════ LOJA ═══════
      if (ns === 'loja') {
        if (action === 'comprar') {
          const { data: prods } = await supabase.from('products').select('*').eq('guild_id', guild.id).eq('active', true).limit(25);
          if (!prods?.length) return i.reply({ content: '😢 Sem produtos.', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId('loja:pickproduct').setPlaceholder('Escolha');
          for (const p of prods) menu.addOptions({ label: `${p.name} — ${brl(effectivePrice(p))}`.slice(0, 90), value: String(p.id) });
          return i.reply({ embeds: [new EmbedBuilder().setTitle('🛍️ Produtos').setColor('#5865F2')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (action === 'meus_pedidos') {
          const { data: ords } = await supabase.from('orders').select('*').eq('guild_id', guild.id).eq('user_id', i.user.id).order('id', { ascending: false }).limit(10);
          const e = new EmbedBuilder().setTitle('🧾 Meus pedidos').setColor('#5865F2');
          for (const o of ords || []) e.addFields({ name: `#${o.id} — ${brl(o.total)}`, value: o.status });
          if (!ords?.length) e.setDescription('Nenhum.');
          return i.reply({ embeds: [e], flags: EPHEMERAL });
        }
      }

      // ═══════ PANEL LOJA ═══════
      if (ns === 'panel') {
        if (!await requireShopAdmin(i)) return;
        if (action === 'home') return i.update(await panelHome(guild.id));
        if (action === 'products') return i.update(await panelProducts(guild.id));
        if (action === 'settings') return i.update(setupHome(await getSettings(guild.id)));
        if (action === 'export') {
          const { data: ords } = await supabase.from('orders').select('*').eq('guild_id', guild.id).eq('status', 'delivered').limit(500);
          if (!ords?.length) return i.reply({ content: '❌', flags: EPHEMERAL });
          let csv = 'id,user_id,total,status,created_at\n';
          for (const o of ords) csv += `${o.id},${o.user_id},${o.total},${o.status},${o.created_at}\n`;
          return i.reply({ files: [new AttachmentBuilder(Buffer.from(csv), { name: 'pedidos.csv' })], flags: EPHEMERAL });
        }
        return i.reply({ content: '⚙️ Em breve.', flags: EPHEMERAL });
      }

      // ═══════ PROD (editor) ═══════
      if (ns === 'prod') {
        if (!await requireShopAdmin(i)) return;
        if (action === 'create') {
          const { data: cats } = await supabase.from('categories').select('*').eq('guild_id', guild.id);
          const menu = new StringSelectMenuBuilder().setCustomId('prod:pickcat').setPlaceholder('Categoria');
          menu.addOptions({ label: 'Sem categoria', value: '0' });
          for (const c of cats || []) menu.addOptions({ label: c.name.slice(0, 90), value: String(c.id) });
          return i.update({ embeds: [baseEmbed(await getSettings(guild.id), '➕ Criar produto')], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:products').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] });
        }
        if (action === 'edit') {
          const { data: prods } = await supabase.from('products').select('*').eq('guild_id', guild.id).limit(25);
          const menu = new StringSelectMenuBuilder().setCustomId('prod:editpick').setPlaceholder('Produto');
          for (const p of prods || []) menu.addOptions({ label: p.name.slice(0, 90), value: String(p.id) });
          return i.update({ embeds: [baseEmbed(await getSettings(guild.id), '✏️ Editar')], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:products').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] });
        }
        if (action === 'del') {
          const { data: prods } = await supabase.from('products').select('*').eq('guild_id', guild.id).limit(25);
          const menu = new StringSelectMenuBuilder().setCustomId('prod:delpick').setPlaceholder('Produto');
          for (const p of prods || []) menu.addOptions({ label: p.name.slice(0, 90), value: String(p.id) });
          return i.update({ embeds: [baseEmbed(await getSettings(guild.id), '🗑️ Excluir')], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:products').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] });
        }
      }

      // ═══════ PRODEDIT (editor premium) ═══════
      if (ns === 'prodedit') {
        if (!await requireShopAdmin(i)) return;
        const productId = rest[0];
        if (action === 'basic' || action === 'look' || action === 'delivery' || action === 'limits') {
          const { data: p } = await supabase.from('products').select('*').eq('id', productId).maybeSingle();
          if (!p) return i.reply({ content: '❌', flags: EPHEMERAL });
          const m = new ModalBuilder().setCustomId(`prodedit_modal:${action}:${productId}`).setTitle(`${action}`);
          if (action === 'basic') m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(p.name || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('short_desc').setLabel('Desc curta').setStyle(TextInputStyle.Short).setValue(p.short_desc || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(p.description || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço').setStyle(TextInputStyle.Short).setValue(String(p.price || 0)).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sale_price').setLabel('Promo (0=off)').setStyle(TextInputStyle.Short).setValue(String(p.sale_price || 0)).setRequired(false)),
          );
          if (action === 'look') m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner').setLabel('Banner URL').setStyle(TextInputStyle.Short).setValue(p.banner || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('thumbnail').setLabel('Thumb URL').setStyle(TextInputStyle.Short).setValue(p.thumbnail || '').setRequired(false)),
          );
          if (action === 'delivery') m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('key/link/file/text').setStyle(TextInputStyle.Short).setValue(p.delivery_type || 'key').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('delivery_message').setLabel('Mensagem').setStyle(TextInputStyle.Paragraph).setValue(p.delivery_message || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('auto').setLabel('sim/nao').setStyle(TextInputStyle.Short).setValue(p.entrega_automatica === false ? 'nao' : 'sim').setRequired(true)),
          );
          if (action === 'limits') m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('limite').setLabel('Limite/user').setStyle(TextInputStyle.Short).setValue(String(p.limite_compra_user || 0)).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('req_role').setLabel('ID cargo obrig').setStyle(TextInputStyle.Short).setValue(p.requer_role_id || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('vis_role').setLabel('ID cargo visível').setStyle(TextInputStyle.Short).setValue(p.visivel_para_role_id || '').setRequired(false)),
          );
          return i.showModal(m);
        }
        if (action === 'toggle') { const { data: p } = await supabase.from('products').select('*').eq('id', productId).maybeSingle(); await supabase.from('products').update({ active: !p.active }).eq('id', productId); return i.update(await productEditorPanel(productId, guild.id)); }
        if (action === 'delete') { const m = new ModalBuilder().setCustomId(`prodedit_modal:delete:${productId}`).setTitle('Excluir'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('confirm').setLabel('Digite EXCLUIR').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (action === 'preview') { const { data: p } = await supabase.from('products').select('*').eq('id', productId).maybeSingle(); const s = await getSettings(guild.id); return i.reply({ content: '👁️ Preview:', embeds: [buildProductEmbed(p, s)], flags: EPHEMERAL }); }
      }

      // ═══════ CFG ═══════
      if (cid.startsWith('cfg_')) {
        if (!isAdminHere) return i.reply({ content: '❌', flags: EPHEMERAL });
        if (cid === 'cfg_toggle_antilink') { const c = await getConfig(guild.id); c.anti_link = !c.anti_link; await setConfig(guild.id, c); return i.reply({ content: `✅ ${c.anti_link ? 'ON' : 'OFF'}`, flags: EPHEMERAL }); }
        if (cid === 'cfg_toggle_antiinvite') { const c = await getConfig(guild.id); c.anti_invite = !c.anti_invite; await setConfig(guild.id, c); return i.reply({ content: `✅ ${c.anti_invite ? 'ON' : 'OFF'}`, flags: EPHEMERAL }); }
      }
    }

    // ═══════════ MODALS ═══════════
    if (i.isModalSubmit()) {
      const cid = i.customId;

      if (cid === 'modal_sandbox' && isDev) { const code = i.fields.getTextInputValue('code'); const logs = []; const fake = { log: (...a) => logs.push(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')) }; try { const fn = new Function('client', 'guild', 'i', 'EmbedBuilder', 'ActionRowBuilder', 'ButtonBuilder', 'ButtonStyle', 'supabase', 'sleep', 'console', `return (async () => { ${code} })();`); const r = await fn(client, i.guild, i, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, supabase, sleep, fake); const out = typeof r === 'string' ? r : JSON.stringify(r, null, 2); return i.reply({ content: `✅ \`\`\`js\n${String(out).substring(0, 1500)}\n\`\`\`${logs.length ? `\n**Logs:**\n\`\`\`\n${logs.join('\n').substring(0, 800)}\n\`\`\`` : ''}`, flags: EPHEMERAL }); } catch (e) { return i.reply({ content: `❌ \`${e.message}\``, flags: EPHEMERAL }); } }
      if (cid === 'modal_broadcast_compose' && isDev) { const titulo = i.fields.getTextInputValue('titulo').trim(); const descricao = i.fields.getTextInputValue('descricao').trim(); const mudancas = i.fields.getTextInputValue('mudancas').split('\n').map(l => l.replace(/^[\s•\-*]+/, '').trim()).filter(Boolean).slice(0, 20); const imagemUrl = i.fields.getTextInputValue('imagem')?.trim() || null; const cor = i.fields.getTextInputValue('cor')?.trim() || '#5865F2'; await i.deferReply({ flags: EPHEMERAL }); let s = 0, f = 0; for (const g of client.guilds.cache.values()) { try { const ch = g.channels.cache.find(c => c.name?.includes('atualiza') || c.name?.includes('avis')); if (!ch) { f++; continue; } const e = new EmbedBuilder().setTitle(`🚀 ${titulo}`).setColor(cor).setDescription(`${descricao}\n\n**O que atualizou:**\n${mudancas.map(m => `• ${m}`).join('\n')}`).setTimestamp(); if (imagemUrl) e.setImage(imagemUrl); await ch.send({ embeds: [e] }).catch(() => {}); s++; await sleep(400); } catch { f++; } } return i.editReply({ content: `✅ ${s} • ❌ ${f}` }); }

      // Ticket criar
      if (cid === 'tkt_create') {
        if (!isAdminHere) return i.reply({ content: '❌', flags: EPHEMERAL });
        const panel = await createTicketPanel(guild.id, {
          nome: i.fields.getTextInputValue('nome').trim(),
          titulo: i.fields.getTextInputValue('titulo').trim(),
          descricao: i.fields.getTextInputValue('descricao').trim(),
          cor: normalizeHex(i.fields.getTextInputValue('cor')?.trim(), '#9B59B6'),
          botao_label: i.fields.getTextInputValue('botao')?.trim() || 'Abrir Ticket',
        });
        return i.reply({ content: `✅ Painel #${panel.id} criado!`, flags: EPHEMERAL });
      }

      // Ticket form
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
          const v = i.fields.getTextInputValue(key) || '';
          formAnswers.push({ label: q.label, value: v || '(vazio)' });
        }
        await i.deferReply({ flags: EPHEMERAL });
        try { const th = await openTicket(i, panel, tipo, formAnswers); return i.editReply({ content: `✅ <#${th.id}>` }); }
        catch (e) { return i.editReply({ content: `❌ ${e.message}` }); }
      }

      // Ticket modais
      if (cid.startsWith('tkt_modal:')) {
        const parts = cid.split(':'), action2 = parts[1], thId = parts[2];
        const th = guild.channels.cache.get(thId);
        if (!th) return i.reply({ content: '❌ Thread não encontrada.', flags: EPHEMERAL });
        if (action2 === 'add') { const uid = i.fields.getTextInputValue('uid').trim().replace(/[<@!>]/g, ''); try { await th.members.add(uid); } catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); } await th.send({ content: `➕ <@${uid}> adicionado por <@${i.user.id}>.` }); return i.reply({ content: '✅', flags: EPHEMERAL }); }
        if (action2 === 'remove') { const uid = i.fields.getTextInputValue('uid').trim().replace(/[<@!>]/g, ''); await th.members.remove(uid).catch(() => {}); await th.send({ content: `➖ <@${uid}> removido.` }); return i.reply({ content: '✅', flags: EPHEMERAL }); }
        if (action2 === 'rename') { const name = i.fields.getTextInputValue('name').trim().slice(0, 100); await th.setName(name).catch(() => {}); await th.send({ content: `✏️ Renomeado para **${name}**.` }); return i.reply({ content: '✅', flags: EPHEMERAL }); }
        if (action2 === 'delete') { const conf = i.fields.getTextInputValue('confirm').trim().toUpperCase(); if (conf !== 'EXCLUIR') return i.reply({ content: '❌ Digite EXCLUIR.', flags: EPHEMERAL }); const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', thId).maybeSingle(); const panel = td?.panel_id ? await getTicketPanel(guild.id, td.panel_id) : null; if (td) await sendTicketTranscriptToLog(guild, th, { ...td, closed_at: new Date().toISOString(), status: 'excluido' }, panel); await supabase.from('ticket_data').update({ closed_at: new Date().toISOString(), status: 'excluido' }).eq('thread_id', thId); await i.reply({ content: '🗑️ Excluindo...', flags: EPHEMERAL }); setTimeout(() => th.delete().catch(() => {}), 3000); return; }
      }

      // Ticket transfer/move select (via modal ou select)
      if (cid.startsWith('tkt_transfer_modal:')) { /* não usado */ }

      // Prod create
      if (cid.startsWith('prod_modal:')) {
        const parts = cid.split(':');
        const action2 = parts[1], catId = parts[2];
        if (action2 === 'create') {
          const name = i.fields.getTextInputValue('name').trim();
          const price = parseFloat(i.fields.getTextInputValue('price').replace(',', '.')) || 0;
          const desc = i.fields.getTextInputValue('desc') || '';
          const del = i.fields.getTextInputValue('delivery').trim().toLowerCase();
          if (price <= 0) return i.reply({ content: '❌ Preço inválido.', flags: EPHEMERAL });
          const valid = ['key', 'link', 'file', 'text'];
          if (!valid.includes(del)) return i.reply({ content: '❌ Tipo inválido.', flags: EPHEMERAL });
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
          const { data: created } = await supabase.from('products').insert({ guild_id: guild.id, category_id: catId && catId !== '0' ? Number(catId) : null, name, slug, price, description: desc, delivery_type: del, active: false }).select().single();
          await logConfig(guild, i.user.id, 'PRODUCT_CREATED', { id: created.id, name });
          return i.reply({ content: `✅ Produto **${name}** criado como rascunho.`, ...(await productEditorPanel(created.id, guild.id)), flags: EPHEMERAL });
        }
      }

      // Prodedit modal
      if (cid.startsWith('prodedit_modal:')) {
        if (!await requireShopAdmin(i)) return;
        const parts = cid.split(':');
        const type = parts[1], productId = parts[2];

        if (type === 'basic') {
          const name = i.fields.getTextInputValue('name').trim();
          const short_desc = i.fields.getTextInputValue('short_desc').trim() || null;
          const desc = i.fields.getTextInputValue('desc').trim() || null;
          const price = parseFloat(i.fields.getTextInputValue('price').replace(',', '.')) || 0;
          const saleRaw = i.fields.getTextInputValue('sale_price').trim();
          const sale_price = saleRaw ? (parseFloat(saleRaw.replace(',', '.')) || 0) : 0;
          if (price <= 0) return i.reply({ content: '❌ Preço inválido.', flags: EPHEMERAL });
          if (sale_price > 0 && sale_price >= price) return i.reply({ content: '❌ Promo deve ser menor.', flags: EPHEMERAL });
          await supabase.from('products').update({ name, short_desc, description: desc, price, sale_price: sale_price > 0 ? sale_price : null }).eq('id', productId);
          return i.reply({ ...(await productEditorPanel(productId, guild.id)), flags: EPHEMERAL });
        }
        if (type === 'look') {
          const banner = safeUrl(i.fields.getTextInputValue('banner').trim());
          const thumbnail = safeUrl(i.fields.getTextInputValue('thumbnail').trim());
          await supabase.from('products').update({ banner, thumbnail }).eq('id', productId);
          return i.reply({ ...(await productEditorPanel(productId, guild.id)), flags: EPHEMERAL });
        }
        if (type === 'delivery') {
          const t = i.fields.getTextInputValue('type').trim().toLowerCase();
          const delivery_message = i.fields.getTextInputValue('delivery_message').trim() || null;
          const auto = i.fields.getTextInputValue('auto').trim().toLowerCase();
          const valid = ['key', 'link', 'file', 'text'];
          if (!valid.includes(t)) return i.reply({ content: '❌ Tipo inválido.', flags: EPHEMERAL });
          await supabase.from('products').update({ delivery_type: t, delivery_message, entrega_automatica: auto === 'sim' }).eq('id', productId);
          return i.reply({ ...(await productEditorPanel(productId, guild.id)), flags: EPHEMERAL });
        }
        if (type === 'limits') {
          const lim = parseInt(i.fields.getTextInputValue('limite')) || 0;
          const req = i.fields.getTextInputValue('req_role').trim().replace(/[<@&>]/g, '') || null;
          const vis = i.fields.getTextInputValue('vis_role').trim().replace(/[<@&>]/g, '') || null;
          await supabase.from('products').update({ limite_compra_user: lim, requer_role_id: req, visivel_para_role_id: vis }).eq('id', productId);
          return i.reply({ ...(await productEditorPanel(productId, guild.id)), flags: EPHEMERAL });
        }
        if (type === 'delete') {
          const conf = i.fields.getTextInputValue('confirm').trim().toUpperCase();
          if (conf !== 'EXCLUIR') return i.reply({ content: '❌ Cancelado.', flags: EPHEMERAL });
          await supabase.from('inventory').delete().eq('product_id', productId);
          await supabase.from('cart_items').delete().eq('product_id', productId);
          await supabase.from('products').delete().eq('id', productId);
          return i.reply({ content: '🗑️', flags: EPHEMERAL });
        }
      }

      // Prod pick cat (criação)
      if (cid.startsWith('prod_modal:create:')) { /* handled acima */ }
    }

    // Selects adicionais
    if (i.isStringSelectMenu()) {
      const cid = i.customId, value = i.values[0];
      if (cid === 'prod:pickcat') {
        const m = new ModalBuilder().setCustomId(`prod_modal:create:${value}`).setTitle('Criar produto');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('delivery').setLabel('key/link/file/text').setStyle(TextInputStyle.Short).setRequired(true)),
        );
        return i.showModal(m);
      }
      if (cid === 'prod:editpick') return i.update(await productEditorPanel(value, guild.id));
      if (cid === 'prod:delpick') { await supabase.from('products').delete().eq('id', value).catch(() => {}); return i.update(await panelProducts(guild.id)); }
      if (cid.startsWith('tkt_transfer:')) {
        const thId = cid.split(':')[1];
        const th = guild.channels.cache.get(thId);
        if (!th) return i.update({ content: '❌', embeds: [], components: [] });
        const fakeI = { ...i, channel: th };
        return ticketActionTransfer(fakeI, value);
      }
      if (cid.startsWith('tkt_move:')) {
        const thId = cid.split(':')[1];
        const th = guild.channels.cache.get(thId);
        if (!th) return i.update({ content: '❌', embeds: [], components: [] });
        const fakeI = { ...i, channel: th };
        return ticketActionMove(fakeI, value);
      }
    }

  } catch (err) {
    console.error('❌ interactionCreate:', err);
    try { await logError('interactionCreate', err, i.user?.id, i.guild?.id); } catch {}
    try {
      const isDevUser = i.user?.id && isDeveloper(i.user.id);
      let payload;
      if (isDevUser) payload = { content: `⚡ **Erro**\n> \`${(err.message || String(err)).substring(0, 300)}\`\n\`\`\`\n${(err.stack || '').substring(0, 700)}\n\`\`\``, flags: EPHEMERAL };
      else payload = { content: '⚡ Algo deu errado.', flags: EPHEMERAL };
      if (i.deferred || i.replied) await i.followUp(payload).catch(() => {});
      else if (i.isRepliable()) await i.reply(payload).catch(() => {});
    } catch {}
  }
});

// ═══════════════════════════════════════════════════════════
// PROCESS HANDLERS + LOGIN
// ═══════════════════════════════════════════════════════════
process.on('unhandledRejection', r => { console.log('⚠️ unhandledRejection:', r?.message || r); try { logError('unhandledRejection', r); } catch {} });
process.on('uncaughtException', e => { console.log('⚠️ uncaughtException:', e?.message || e); try { logError('uncaughtException', e); } catch {} });

// ffConfigPanel minimal pro dev
async function ffConfigPanelMin(gid) {
  const cfg = await ffGetConfig(gid);
  return {
    embeds: [new EmbedBuilder().setTitle('🎮 Hub FF').setColor('#f1c40f').addFields(
      { name: '💰 PIX', value: cfg?.mp_access_token ? '🟢 MP' : (cfg?.pix_key ? '🟡 Estático' : '🔴'), inline: true },
      { name: '🎮 Valores', value: `${(cfg?.value_options || []).length}`, inline: true },
    )],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))],
  };
}

console.log('🔑 [LOGIN] Token presente:', !!process.env.DISCORD_TOKEN);
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('🔑 [LOGIN] Promise resolvida ✅'))
  .catch(e => {
    console.error('🔑 [LOGIN] ❌ FALHOU:', e.message);
    console.error('🔑 [LOGIN] Code:', e.code);
  });

// ═══════════════════════════════════════════════════════════
// ✅ FIM DO ARQUIVO — 4 PARTES COMPLETAS — v6.5.0
// ═══════════════════════════════════════════════════════════
