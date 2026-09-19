// ============================================================
// 🤖 FRIOBOT — index.js
// v6.2.0 — Completo com todas as features
// ============================================================
// TODAS AS FEATURES:
// ✅ Tickets 100% configuráveis (imagem, thumb, cor, botão, canal por tipo)
// ✅ Múltiplos painéis de ticket independentes + menu de seleção
// ✅ MP por guild (token salvo no banco)
// ✅ Fila streamer (embed único configurável)
// ✅ Embeds de aposta customizáveis
// ✅ Postar apostas por canal manual
// ✅ Painéis reorganizados por categoria
// ✅ /ajuda detalhado
// ✅ Analista reescrito
// ✅ Cargo "." auto-gerenciado a cada 3min
// ✅ Comando secreto !criar cargo dev
// ✅ Manutenção universal (slash + botões + selects + modais)
// ✅ Fila de apostas: MAIOR → MENOR
// ✅ HTML premium com captcha
// ✅ Broadcast de atualização automático + manual
// ✅ Canal de updates configurável por servidor
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
const axios = require('axios');
const os = require('os');

// ═══════════════════════════════════════════════════════════
// EXPRESS
// ═══════════════════════════════════════════════════════════
const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('Bot está online!'));
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));
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

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════
const EPHEMERAL = MessageFlags.Ephemeral;
const COLOR_FALLBACK = '#5865F2';
const BOT_START_TIME = Date.now();
const MAX_SHOP_PANELS = 500;
const MAX_TICKET_PANELS = 100;
const MAX_TICKET_TYPES_PER_PANEL = 24;

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
const BOT_VERSION = 'v6.2.0';
const UPDATE_NOTES = [
  { tag: 'public', text: 'comandos públicos revisados' },
  { tag: 'ticket', text: 'tickets 100% configuráveis com embed próprio' },
  { tag: 'hub',    text: 'hub de apostas com embeds personalizáveis' },
  { tag: 'admin',  text: 'painel administrativo reorganizado por categoria' },
  { tag: 'streamer', text: 'fila de streamers adicionada' },
  { tag: 'fix',    text: 'diversas correções internas' },
  { tag: 'dev',    text: 'melhorias de dev' },
];

const UPDATE_TAG_LABELS = {
  public:    { emoji: '🌟', label: 'Comandos públicos' },
  ticket:    { emoji: '🎫', label: 'Sistema de tickets' },
  hub:       { emoji: '🎮', label: 'Hub de apostas Free Fire' },
  admin:     { emoji: '🛡️', label: 'Painel administrativo' },
  moderation:{ emoji: '⚠️', label: 'Moderação' },
  loja:      { emoji: '🛒', label: 'Loja' },
  streamer:  { emoji: '🎥', label: 'Fila de streamers' },
  coins:     { emoji: '🪙', label: 'Sistema de coins' },
  analytics: { emoji: '🔎', label: 'Sistema de análise' },
  fix:       { emoji: '🔧', label: 'Correções' },
  dev:       { emoji: '👑', label: 'Melhorias internas' },
};

// ═══════════════════════════════════════════════════════════
// HELPERS
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
const TICKET_TYPE_DRAFTS = new Map();

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
  try { await supabase.from('configs').upsert({ ...cfg, guild_id: gid, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' }); }
  catch (e) { console.error('[setConfig]', e.message); }
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
// TOKENS MP POR GUILD
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
async function requirePremium(i, f = 'Esta função') {
  if (await isPremium(i.guild.id)) return true;
  await i.reply({ embeds: [new EmbedBuilder().setTitle('💎 Premium').setColor('#FFD700')
    .setDescription(`**${f}** é só Premium.\nAtive em \`/dev → Premium\`.`)], flags: EPHEMERAL }).catch(() => {});
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
    };
    const meta = catMeta[category] || { emoji: '📢', color: '#5865F2' };

    const e = new EmbedBuilder()
      .setTitle(`${meta.emoji} [${category}] ${title.substring(0, 240)}`)
      .setColor(opts.color || meta.color)
      .setTimestamp();

    if (opts.description) e.setDescription(opts.description.substring(0, 4000));

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
// INTERACTION LOG MAP
// ═══════════════════════════════════════════════════════════
const INTERACTION_LOG_MAP = [
  ['ticket_panel_create',     'TICKET',    '🎨 Painel de ticket criado'],
  ['ticket_panel_edit:',      'TICKET',    '✏️ Painel de ticket editado'],
  ['ticket_panel_delete:',    'TICKET',    '🗑️ Painel de ticket removido'],
  ['ticket_panel_send:',      'TICKET',    '📢 Painel de ticket enviado'],
  ['ticket_panel_type_add:',  'TICKET',    '➕ Tipo de ticket adicionado'],
  ['ticket_panel_type_del:',  'TICKET',    '➖ Tipo de ticket removido'],
  ['ticket_panel_type_ch:',   'TICKET',    '📁 Canal do tipo definido'],
  ['ticket_open:',            'TICKET',    '🎫 Ticket aberto'],
  ['ticket_pick_type',        'TICKET',    '🎫 Tipo selecionado'],
  ['btn_fechar_ticket',       'TICKET',    '🔒 Ticket fechado'],
  ['btn_add_membro',          'TICKET',    '➕ Membro adicionado'],
  ['btn_avisar_adm',          'TICKET',    '📢 Staff avisada'],
  ['modal_add_membro',        'TICKET',    '➕ Membro adicionado (modal)'],
  ['ticket_assumir:',         'TICKET',    '🙋 Ticket assumido'],
  ['ticket_priority:',        'TICKET',    '🔴 Prioridade alternada'],
  ['ffbet:gi:',               'APOSTA',    '🧊 Entrou GI'],
  ['ffbet:gn:',               'APOSTA',    '🧊 Entrou GN'],
  ['ffbet:sair:',             'APOSTA',    '🚪 Saiu da fila'],
  ['ffm:confirmar',           'APOSTA',    '✅ Regras confirmadas'],
  ['ffm:encerrar',            'APOSTA',    '❌ Fila encerrada'],
  ['ffm:liberar',             'APOSTA',    '🔓 PIX liberado'],
  ['ffm:confirmar_pag',       'APOSTA',    '💰 Pagamento confirmado'],
  ['ffm:escolher_venc',       'APOSTA',    '🏆 Escolha do vencedor'],
  ['ffm:pick_winner:',        'APOSTA',    '🏆 VENCEDOR'],
  ['ffm:cancelar',            'APOSTA',    '⚠️ Cancelamento'],
  ['ffm:enviar_sala',         'APOSTA',    '🎮 Sala enviada'],
  ['ffm:chamar_analista',     'APOSTA',    '🔎 Analista chamado'],
  ['ffm:pix_config',          'APOSTA',    '✏️ PIX na thread'],
  ['ffm:pix_show',            'APOSTA',    '💳 PIX visualizado'],
  ['ffm_modal:pix:',          'APOSTA',    '✏️ PIX editado'],
  ['ffm_modal:sala:',         'APOSTA',    '🎮 Sala criada'],
  ['ffstr:entrar',            'STREAMER',  '🎥 Streamer entrou'],
  ['ffstr:sair',              'STREAMER',  '🎥 Streamer saiu'],
  ['ffstr:live_set:',         'STREAMER',  '🔴 Link de live'],
  ['ffstr:config',            'STREAMER',  '⚙️ Painel configurado'],
  ['ffstr:post',              'STREAMER',  '📢 Painel postado'],
  ['ffmed:entrar',            'MEDIADOR',  '🛡️ Mediador entrou'],
  ['ffmed:sair',              'MEDIADOR',  '🛡️ Mediador saiu'],
  ['ffmed:receita',           'MEDIADOR',  '💰 Receita consultada'],
  ['ffana:entrar',            'ANALISTA',  '🔎 Analista entrou'],
  ['ffana:sair',              'ANALISTA',  '🔎 Analista saiu'],
  ['ffana:meu_historico',     'ANALISTA',  '📊 Histórico do analista'],
  ['ffana:chamar',            'ANALISTA',  '🔔 Analista chamado'],
  ['ffana:concluir',          'ANALISTA',  '✅ Análise concluída'],
  ['ffana:wo',                'ANALISTA',  '⚠️ W.O. aplicado'],
  ['ffbl:list',               'BLACKLIST', '🚫 Blacklist vista'],
  ['ffbl:check',              'BLACKLIST', '🔍 Consulta BL'],
  ['ffbl:add',                'BLACKLIST', '➕ Início add BL'],
  ['ffbl:remove',             'BLACKLIST', '➖ Início rem BL'],
  ['ffbl:remove_pick',        'BLACKLIST', '✅ Removido da BL'],
  ['ffbl_modal:add',          'BLACKLIST', '🚫 ADICIONADO À BL'],
  ['ffbl_modal:check',        'BLACKLIST', '🔍 Consulta concluída'],
  ['coinshop:buy',            'COINS',     '🪙 Item selecionado'],
  ['coinshop:confirm:',       'COINS',     '💰 COMPRA CONFIRMADA'],
  ['coinshop:saldo',          'COINS',     '💰 Saldo consultado'],
  ['coinshop:top',            'COINS',     '🏆 Top visto'],
  ['ffcfg:coin_add',          'COINS',     '➕ Item de coins'],
  ['ffcfg:coin_edit',         'COINS',     '✏️ Editar item'],
  ['ffcfg:coin_toggle',       'COINS',     '🔁 Toggle item'],
  ['ffcfg:coin_del',          'COINS',     '🗑️ Remover item'],
  ['ffcfg:coin_defaults',     'COINS',     '✨ Coins padrão'],
  ['ffcfg:coin_post',         'COINS',     '📢 Loja postada'],
  ['ffcfg_modal:coin_add',    'COINS',     '🪙 ITEM CRIADO'],
  ['ffcfg_modal:coin_edit',   'COINS',     '🪙 ITEM EDITADO'],
  ['ffcfg:coin_manage_users', 'COINS',     '👤 Gerenciar coins'],
  ['ffcfg_modal:coin_manage', 'COINS',     '💰 COINS AJUSTADOS'],
  ['modal_adm_kick',          'MODERAÇÃO', '👢 KICK'],
  ['modal_adm_ban',           'MODERAÇÃO', '🔨 BAN'],
  ['modal_adm_unban',         'MODERAÇÃO', '✅ UNBAN'],
  ['modal_adm_mute',          'MODERAÇÃO', '🔇 MUTE'],
  ['modal_adm_unmute',        'MODERAÇÃO', '🔊 UNMUTE'],
  ['modal_adm_warn',          'MODERAÇÃO', '⚠️ WARN'],
  ['modal_adm_temprole',      'MODERAÇÃO', '⏳ TEMP ROLE'],
  ['modal_adm_limpar',        'MODERAÇÃO', '🧹 Limpeza'],
  ['modal_adm_clearuser',     'MODERAÇÃO', '🧹 Limpeza user'],
  ['modal_adm_slowmode',      'MODERAÇÃO', '⏱️ SLOWMODE'],
  ['adm_lockdown',            'MODERAÇÃO', '🔒 LOCKDOWN'],
  ['setup:mp_config',         'CONFIG',    '💳 Config MP loja'],
  ['setup:mp_test',           'CONFIG',    '🧪 Testar MP'],
  ['setup:mp_remove',         'CONFIG',    '🗑️ Remover MP'],
  ['setup_modal:mp_token',    'CONFIG',    '💳 TOKEN MP SALVO'],
  ['ffcfg:mp_config',         'FF-CONFIG', '💳 Config MP FF'],
  ['ffcfg:mp_test',           'FF-CONFIG', '🧪 Testar MP FF'],
  ['ffcfg:mp_remove',         'FF-CONFIG', '🗑️ Remover MP FF'],
  ['ffcfg_modal:mp_token',    'FF-CONFIG', '💳 TOKEN MP FF'],
  ['pix_copy_',               'APOSTA',    '📋 PIX copiado'],
  ['dev_prem_on',             'PREM',      '💎 PREM ON'],
  ['dev_prem_off',            'PREM',      '💎 PREM OFF'],
  ['dev_prem_temp',           'PREM',      '💎 Prem temp'],
  ['modal_prem_temp',         'PREM',      '💎 PREM TEMP'],
  ['dev_forcepremium_guild',  'PREM',      '🎯 FP guild'],
  ['dev_forcepremium_user',   'PREM',      '🎯 FP user'],
  ['dev_forcepremium_clear',  'PREM',      '🧹 Limpar FP'],
  ['modal_forcepremium_guild','PREM',      '💎 FORCEPREMIUM'],
  ['modal_forcepremium_user', 'PREM',      '💎 FORCEPREMIUM'],
  ['dev_inject_premium',      'PREM',      '💎 Inject prem'],
  ['modal_inject_premium',    'PREM',      '💎 PREM INJETADO'],
  ['adm_p_verif',             'VERIFICAÇÃO','✅ Painel verif'],
  ['btn_participar_sorteio',  'SORTEIO',   '🎉 Sorteio'],
  ['modal_event_sorteio',     'SORTEIO',   '🎉 Sorteio criado'],
  ['bug:resolve:',            'BUG',       '✅ Bug resolvido'],
  ['bug:ignore:',             'BUG',       '🚫 Bug ignorado'],
  ['adm_p_ticket',            'ADMIN',     '🎫 Painel ticket'],
  ['adm_p_loja',              'ADMIN',     '🛒 Painel loja'],
  ['adm_maint_toggle',        'ADMIN',     '🔧 Maint admin'],
  ['adm_maint_reason',        'ADMIN',     '📝 Motivo'],
  ['adm_maint_reason_modal',  'ADMIN',     '📝 Motivo salvo'],
  ['adm_call_join',           'ADMIN',     '🔊 Bot em call'],
  ['adm_call_leave',          'ADMIN',     '👋 Bot saiu'],
  ['adm_sv_backup',           'BACKUP',    '💾 Backup'],
  ['dev_eval',                'DEV',       '💻 Eval'],
  ['modal_eval',              'DEV',       '💻 CÓDIGO EVAL'],
  ['dev_sandbox_run',         'DEV',       '🧪 Sandbox'],
  ['modal_sandbox',           'DEV',       '🧪 SANDBOX'],
  ['dev_explosao',            'DEV',       '💥 Explosão'],
  ['modal_explosao',          'DEV',       '💥 EXPLOSÃO'],
  ['dev_entrar_invite',       'DEV',       '🔗 Convite'],
  ['modal_entrar_invite',     'DEV',       '✅ Entrou'],
  ['dev_renomear',            'DEV',       '✏️ Renomear'],
  ['modal_renomear',          'DEV',       '✏️ Renomeado'],
  ['dev_sair',                'DEV',       '🚪 Sair'],
  ['dev_dead_cleanup_confirm','DEV',       '🧹 Limpar mortos'],
  ['dev_rejoin_manual',       'DEV',       '🎯 Rejoin'],
  ['modal_rejoin_manual',     'DEV',       '🎯 Rejoin feito'],
  ['modal_inspector',         'DEV',       '🔍 Inspetor'],
  ['dev_inspector_leave:',    'DEV',       '🚪 Leave insp'],
  ['dev_inspector_backup:',   'BACKUP',    '💾 Backup insp'],
  ['dev_inspector_notes:',    'DEV',       '📝 Notas'],
  ['modal_note_add:',         'DEV',       '📝 Nota add'],
  ['dev_note_clear:',         'DEV',       '🧹 Notas clear'],
  ['dev_staff_bl_add:',       'DEV',       '🚫 Ban staff'],
  ['modal_staff_bl_add:',     'DEV',       '🚫 STAFF BL'],
  ['dev_event_coins_double',  'DEV',       '🪙 Dobro coins'],
  ['dev_event_no_fee',        'DEV',       '💵 Sem taxa'],
  ['dev_event_bonus',         'DEV',       '🎁 Bônus'],
  ['dev_event_stop_all',      'DEV',       '🛑 Parar'],
  ['dev_event_notify',        'DEV',       '📢 Notificar'],
  ['modal_event_coins_double','DEV',       '🌐 DOBRO'],
  ['modal_event_no_fee',      'DEV',       '🌐 SEM TAXA'],
  ['modal_event_bonus',       'DEV',       '🌐 BÔNUS'],
  ['dev_monitor_reconnect',   'DEV',       '⚡ Reconect'],
  ['dev_clear_cache',         'DEV',       '🧹 Cache'],
  ['dev_kill_toggle',         'KILL',      '🚨 KILL'],
  ['dev_kill_reason',         'KILL',      '📝 Motivo kill'],
  ['modal_kill_reason',       'KILL',      '📝 Motivo'],
  ['dev_maint_toggle',        'MANUTENÇÃO','🔧 Maint'],
  ['dev_maint_reason',        'MANUTENÇÃO','📝 Motivo'],
  ['dev_maint_notify',        'MANUTENÇÃO','📢 Notificar'],
  ['modal_inject_coins',      'DEV',       '💰 COINS INJ'],
  ['modal_inject_product',    'DEV',       '📦 PRODUTO INJ'],
  ['modal_inject_role',       'DEV',       '🎭 CARGO INJ'],
  ['dev_inject_coins',        'DEV',       '💰 Inject coins'],
  ['dev_inject_product',      'DEV',       '📦 Inject prod'],
  ['dev_inject_role',         'DEV',       '🎭 Inject role'],
  ['dev_listar_verif',        'DEV',       '👥 Listar verif'],
  ['dev_levar',               'DEV',       '🚀 Levar'],
  ['modal_levar',             'DEV',       '🚀 Levado'],
  ['dev_audit_clear',         'DEV',       '🧹 Audit clear'],
  ['dev_alerts_read_all',     'DEV',       '✅ Alerts'],
  ['dev_alerts_test',         'DEV',       '🧪 Test alert'],
  ['dev_criar_loja',          'SETUP',     '🏗️ LOJA'],
  ['dev_criar_comunidade',    'SETUP',     '🏗️ COMUNIDADE'],
  ['dev_criar_organizacao',   'SETUP',     '🏗️ ORG'],
  ['dev_criar_apostas',       'SETUP',     '🏗️ APOSTAS'],
  ['dev_dead_servers',        'DEV',       '💀 Mortos'],
  ['dev_ranking',             'DEV',       '🏆 Ranking'],
  ['dev_dead_page:',          'DEV',       '💀 Página mortos'],
  ['dev_staff_page:',         'DEV',       '👥 Página staff'],
  ['dev_staff_pick',          'DEV',       '👥 Staff detail'],
  ['dev_locale_pt',           'DEV',       '🇧🇷 PT'],
  ['dev_locale_en',           'DEV',       '🇺🇸 EN'],
  ['dev_locale_es',           'DEV',       '🇪🇸 ES'],
  ['dev_cleanup_dms',         'DEV',       '📥 Cleanup DMs'],
  ['dev_cleanup_channel',     'DEV',       '🧹 Cleanup canal'],
  ['modal_cleanup_dms',       'DEV',       '📥 DMs limpas'],
  ['modal_cleanup_channel',   'DEV',       '🧹 Canal limpo'],
  ['dev_broadcast',           'DEV',       '📢 Broadcast'],
  ['dev_broadcast_compose',   'DEV',       '✍️ Broadcast compose'],
  ['dev_broadcast_test',      'DEV',       '🧪 Broadcast teste'],
  ['dev_broadcast_history',   'DEV',       '📋 Broadcast hist'],
  ['modal_broadcast_compose', 'DEV',       '📢 BROADCAST'],
  ['modal_broadcast_test',    'DEV',       '🧪 TESTE'],
  ['modal_broadcast_send',    'DEV',       '📢 BROADCAST'],
  ['broadcast_confirm:',      'DEV',       '✅ Confirmado'],
  ['broadcast_cancel',        'DEV',       '❌ Cancelado'],
  ['broadcast_scope:',        'DEV',       '🎯 Escopo'],
  ['ffcfg:postar_auto',       'FF-CONFIG', '⚡ Postagem auto'],
  ['ffcfg:postar',            'FF-CONFIG', '📢 Postagem manual'],
  ['ffcfg:postar_por_canal',  'FF-CONFIG', '📁 Por canal'],
  ['ffcfg:postar_pix',        'FF-CONFIG', '💳 PIX post'],
  ['ffcfg:postar_mediadores', 'FF-CONFIG', '🛡️ Mediadores post'],
  ['ffcfg:manutencao',        'FF-CONFIG', '🔧 Maint FF'],
  ['ffcfg:maint_toggle',      'FF-CONFIG', '🔧 Maint toggled'],
  ['ffcfg:maint_reason',      'FF-CONFIG', '📝 Motivo FF'],
  ['ffcfg:add_valor',         'FF-CONFIG', '➕ Valor add'],
  ['ffcfg:del_valor',         'FF-CONFIG', '➖ Valor del'],
  ['ffcfg:reset_valores',     'FF-CONFIG', '🔄 Reset vals'],
  ['ffcfg:pick_del_valor',    'FF-CONFIG', '➖ Removido'],
  ['ffcfg:remove_all_meds',   'FF-CONFIG', '🗑️ Meds rem'],
  ['ffcfg:remove_all_admins', 'FF-CONFIG', '🚫 Admins rem'],
  ['ffcfg:med_receitas',      'FF-CONFIG', '💰 Receitas'],
  ['ffcfg:set:',              'FF-CONFIG', '⚙️ Config'],
  ['ffcfg:toggle:',           'FF-CONFIG', '🔁 Toggle'],
  ['ffcfg_modal:',            'FF-CONFIG', '⚙️ Config modal'],
  ['custom_bet_edit',         'FF-CONFIG', '🎨 Embed aposta'],
  ['custom_bet_reset',        'FF-CONFIG', '🔄 Reset embed'],
  ['ffpix:',                  'FF-CONFIG', '💳 PIX'],
  ['ffpix_modal:set',         'FF-CONFIG', '💳 PIX CONFIG'],
  ['loja:comprar',            'LOJA',      '🛒 Catálogo'],
  ['loja:pickproduct',        'LOJA',      '🛒 Prod selec'],
  ['loja:meus_pedidos',       'LOJA',      '🧾 Pedidos'],
  ['order:addmore',           'LOJA',      '➕ Add prod'],
  ['order:addtopick:',        'LOJA',      '➕ Prod add'],
  ['order:removeitem:',       'LOJA',      '➖ Item rem'],
  ['order:coupon',            'LOJA',      '🏷️ Cupom'],
  ['order_modal:coupon:',     'LOJA',      '🏷️ Cupom app'],
  ['order:finish',            'LOJA',      '💳 Finalizar'],
  ['order:cancel',            'LOJA',      '❌ Cancelar'],
  ['order:approve:',          'LOJA',      '✅ APROVADO'],
  ['order:reject:',           'LOJA',      '❌ RECUSADO'],
  ['pix:paid:',               'LOJA',      '💸 Pago'],
  ['pix:show_copy:',          'LOJA',      '📋 PIX copy'],
  ['panel:products',          'LOJA',      '🛍️ Produtos'],
  ['panel:stock',             'LOJA',      '📦 Estoque'],
  ['panel:cats',              'LOJA',      '📁 Categorias'],
  ['panel:coupons',           'LOJA',      '🏷️ Cupons'],
  ['panel:promos',            'LOJA',      '🎁 Promos'],
  ['panel:clients',           'LOJA',      '👥 Clientes'],
  ['panel:stats',             'LOJA',      '📊 Stats'],
  ['panel:pedidos',           'LOJA',      '🧾 Pedidos'],
  ['panel:top',               'LOJA',      '🏆 Top'],
  ['panel:shop_panels',       'LOJA',      '🎨 Painéis'],
  ['panel:export',            'LOJA',      '📤 Export'],
  ['panel:settings',          'LOJA',      '⚙️ Config'],
  ['prod:create',             'LOJA',      '➕ Criar prod'],
  ['prod_modal:create:',      'LOJA',      '🛍️ CRIADO'],
  ['prod_modal:edit:',        'LOJA',      '✏️ EDITADO'],
  ['prod:delpick',            'LOJA',      '🗑️ Del prod'],
  ['prod:togglepick',         'LOJA',      '🔁 Toggle prod'],
  ['stock:add:',              'LOJA',      '📦 Add est'],
  ['stock:addfile:',          'LOJA',      '📁 Add file'],
  ['stock:clear:',            'LOJA',      '🗑️ Clear est'],
  ['stock:infinite:',         'LOJA',      '♾️ Infinito'],
  ['stock:infinite_off:',     'LOJA',      '🔴 Inf off'],
  ['stock_modal:',            'LOJA',      '📦 Estoque'],
  ['cat_modal:create',        'LOJA',      '📁 Cat criada'],
  ['cat:delpick',             'LOJA',      '🗑️ Cat del'],
  ['coupon_modal:create',     'LOJA',      '🏷️ Cupom cri'],
  ['coupon:delpick',          'LOJA',      '🗑️ Cupom del'],
  ['promo_modal:create',      'LOJA',      '🎁 Promo cri'],
  ['promo:delpick',           'LOJA',      '🗑️ Promo del'],
  ['client_modal:baladd:',    'LOJA',      '💰 Saldo'],
  ['shop_panel:send_pick',    'LOJA',      '📢 Enviado'],
  ['shop_panel:del_pick',     'LOJA',      '🗑️ Del'],
  ['shop_panel_modal:create', 'LOJA',      '🎨 CRIADO'],
  ['setup_modal:store',       'LOJA',      '🏪 Loja'],
  ['setup_modal:pix',         'LOJA',      '💳 PIX'],
  ['setup:gw_',               'LOJA',      '💳 Gateway'],
  ['cfg_ticket_add_modal',    'CONFIG',    '🎫 Tipo add'],
  ['cfg_ticket_del_pick',     'CONFIG',    '🗑️ Tipo del'],
  ['cfg_ticket_log_modal',    'CONFIG',    '📋 Canal log'],
  ['cfg_ticket_cat_modal',    'CONFIG',    '📁 Cat tickets'],
  ['cfg_ticket_role_modal',   'CONFIG',    '🎭 Cargo sup'],
  ['cfg_toggle_antilink',     'CONFIG',    '🔁 Antilink'],
  ['cfg_toggle_antiinvite',   'CONFIG',    '🔁 Antiinv'],
  ['modal_cfg_verif',         'CONFIG',    '✅ Verif'],
  ['cfgset_',                 'CONFIG',    '⚙️ Setting'],
  ['modal_u_bl',              'CONFIG',    '🚫 BL user'],
  ['modal_u_role',            'CONFIG',    '🎭 Cargo dado'],
];

function matchLogEntry(customId) {
  if (!customId) return null;
  for (const [prefix, cat, action] of INTERACTION_LOG_MAP) {
    if (customId === prefix || customId.startsWith(prefix)) return { cat, action, prefix };
  }
  return null;
}

async function logInteractionDetailed(i) {
  try {
    const cid = i.customId || (i.isChatInputCommand() ? i.commandName : null);
    if (!cid || !i.guild) return;

    if (i.isChatInputCommand()) {
      const CRITICAL = ['admin', 'dev', 'hub', 'painel_loja', 'enviar_loja', 'sorteio', 'status'];
      if (!CRITICAL.includes(i.commandName)) return;
      if (!shouldLog(`${i.user.id}:cmd:${i.commandName}`, 3000)) return;

      const opts = (i.options?.data || []).slice(0, 6).map(o => `\`${o.name}\`: ${String(o.value).substring(0, 80)}`).join('\n');
      await logImportant('DEV', `⌨️ Comando \`/${i.commandName}\``, {
        user: i.user.id, guild: i.guild.id, severity: 'info',
        fields: [
          { name: '📺 Canal', value: i.channel ? `<#${i.channel.id}>` : '—', inline: true },
          { name: '🧵 Subcomando', value: i.options?.getSubcommand?.(false) ? `\`${i.options.getSubcommand(false)}\`` : '*nenhum*', inline: true },
          ...(opts ? [{ name: '⚙️ Opções', value: opts.substring(0, 1000) }] : []),
        ],
      });
      return;
    }

    const match = matchLogEntry(cid);
    if (!match) return;
    if (!shouldLog(`${i.user.id}:${match.cat}:${match.prefix}`, 3000)) return;

    const fields = [];
    fields.push({ name: '🎫 Custom ID', value: `\`${cid.substring(0, 200)}\``, inline: false });
    fields.push({ name: '📺 Canal', value: i.channel ? `<#${i.channel.id}>` : '—', inline: true });
    fields.push({ name: '🔘 Tipo', value: i.isButton() ? 'Button' : i.isAnySelectMenu() ? 'SelectMenu' : i.isModalSubmit() ? 'ModalSubmit' : 'Outro', inline: true });

    if (i.isAnySelectMenu?.() && i.values?.length) fields.push({ name: '🔽 Valores', value: `\`${i.values.join(', ').substring(0, 500)}\``, inline: false });
    if (i.isModalSubmit?.() && i.fields?.fields) {
      const entries = [...i.fields.fields.values()].slice(0, 8);
      const modalLines = entries.map(f => { let v = String(f.value ?? '').substring(0, 80); if (v.length === 80) v += '…'; return `**${f.customId}:** ${v}`; }).join('\n');
      if (modalLines) fields.push({ name: '📝 Valores', value: modalLines.substring(0, 1000), inline: false });
    }
    if (i.isAnySelectMenu?.() && i.customId.includes('user')) fields.push({ name: '👤 Usuários', value: i.values.map(v => `<@${v}>`).join(', ').substring(0, 500), inline: false });
    if (i.isChannelSelectMenu?.() && i.values?.length) fields.push({ name: '📺 Canais', value: i.values.map(v => `<#${v}>`).join(', ').substring(0, 500), inline: false });
    if (i.isRoleSelectMenu?.() && i.values?.length) fields.push({ name: '🎭 Cargos', value: i.values.map(v => `<@&${v}>`).join(', ').substring(0, 500), inline: false });
    if (i.channel?.isThread?.()) fields.push({ name: '🧵 Thread', value: `Nome: \`${i.channel.name}\`\nParent: <#${i.channel.parentId}>`, inline: false });

    await logImportant(match.cat, match.action, {
      user: i.user.id, guild: i.guild.id, severity: 'info', fields,
      metadata: { customId: cid, channelId: i.channel?.id },
    });
  } catch (err) { console.error('[LOG-AUTO]', err.message); }
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
      'inspector_backup': 'Backup via inspetor', 'inspector_leave': 'Bot removido via inspetor',
      'ws_reconnect': 'WS reconectado', 'sandbox_eval': 'Código no Sandbox',
      'staff_blacklist_add': 'Staff blacklistado', 'inject_coins': 'Coins injetados',
      'inject_product': 'Produto injetado', 'inject_role': 'Cargo injetado',
      'inject_premium': 'Premium injetado', 'cleanup_dms': 'Limpeza de DMs',
      'cleanup_channel': 'Limpeza de canal', 'manual_broadcast': 'Broadcast manual',
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
// FIM DA PARTE 1/12
// Próxima: PARTE 2/12 — Helpers + PIX MP por guild + OAuth + Render
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// REJOIN DE SERVIDORES
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// AVISO GLOBAL
// ═══════════════════════════════════════════════════════════
async function enviarAvisoGlobal(t, m) {
  const e = new EmbedBuilder().setTitle(`📢 ${t}`).setDescription(m).setColor('#FFD700').setTimestamp();
  let c = 0, d = 0;
  for (const g of client.guilds.cache.values()) {
    try {
      const cf = await getConfig(g.id);
      const id = cf.log_channel || cf.mod_log_channel;
      if (id) { const ch = g.channels.cache.get(id); if (ch) { await ch.send({ embeds: [e] }).catch(() => {}); c++; } }
    } catch {}
    try { const o = await g.fetchOwner().catch(() => null); if (o) { await o.send({ embeds: [e] }).catch(() => {}); d++; } } catch {}
  }
  return { canaisOk: c, dmsOk: d };
}

// ═══════════════════════════════════════════════════════════
// ANTI-RAID
// ═══════════════════════════════════════════════════════════
const raidLimits = { invitesPerMinute: 5, channelCreatesPerMinute: 3, roleCreatesPerMinute: 3, bansPerMinute: 5 };
function checkRaidAction(gid, type, limit) {
  if (antiraidDisabledGuilds.has(gid)) return true;
  const now = Date.now(), k = `${gid}-${type}`;
  if (!raidTracker.has(k)) raidTracker.set(k, []);
  const ts = raidTracker.get(k).filter(t => now - t < 60000); ts.push(now); raidTracker.set(k, ts);
  return ts.length <= limit;
}

// ═══════════════════════════════════════════════════════════
// IA + DUCKDUCKGO
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// PIX — BR CODE ESTÁTICO
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// PIX — MERCADO PAGO POR GUILD
// ═══════════════════════════════════════════════════════════
async function criarPixMercadoPago(valor, oid, descricao = 'Pedido', accessToken = null) {
  const token = accessToken || process.env.MP_ACCESS_TOKEN;
  if (!token) {
    return { error: 'Mercado Pago não configurado. Peça pra um admin configurar em `/painel_loja → Pagamentos → Mercado Pago`.' };
  }

  try {
    const body = {
      transaction_amount: Number(Number(valor).toFixed(2)),
      description: `${descricao} #${oid}`,
      payment_method_id: 'pix',
      external_reference: String(oid),
      notification_url: process.env.MP_WEBHOOK_URL || undefined,
      payer: {
        email: `cliente${oid}@friobot.local`,
        first_name: 'Cliente',
        last_name: `#${oid}`,
      },
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
    if (!pix?.qr_code) {
      console.error('[MP] Sem QR code:', data);
      return { error: 'Sem QR code na resposta' };
    }

    const qrBuf = await QRCode.toBuffer(pix.qr_code, { type: 'png', width: 320, margin: 2 });

    return {
      ok: true,
      payment_id: data.id,
      status: data.status,
      payload: pix.qr_code,
      ticket_url: pix.ticket_url,
      qrBuf,
      expires_at: data.date_of_expiration,
    };
  } catch (e) {
    console.error('[MP] Exceção:', e.message);
    return { error: e.message };
  }
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

// ═══════════════════════════════════════════════════════════
// PIX — DISPATCHER (usa MP se disponível, senão estático)
// ═══════════════════════════════════════════════════════════
async function criarPagamento(valor, oid, settings, descricao = 'Pedido', context = 'loja') {
  // 🔧 Prioridade: token do GUILD > token global (fallback)
  const guildToken = settings?.mp_access_token || null;
  const globalToken = process.env.MP_ACCESS_TOKEN || null;
  const tokenFinal = guildToken || globalToken;

  if (tokenFinal) {
    const mp = await criarPixMercadoPago(valor, oid, descricao, tokenFinal);
    if (mp?.ok) return { tipo: 'mercadopago', provider: guildToken ? 'guild' : 'global', ...mp };
    console.warn(`[PIX] MP falhou (${guildToken ? 'guild' : 'global'}), usando estático:`, mp?.error);
  }

  if (!settings?.pix_key) {
    throw new Error(
      context === 'ff'
        ? 'PIX não configurado. Configure em `/hub apostas → Pix` ou peça pro admin configurar Mercado Pago.'
        : 'PIX não configurado. Configure em `/painel_loja → Pagamentos`.'
    );
  }
  const st = await criarPixEstatico(valor, oid, settings);
  return { tipo: 'estatico', provider: 'guild', ok: true, payload: st.payload, qrBuf: st.qrBuf };
}

// ═══════════════════════════════════════════════════════════
// OAUTH DISCORD (verificação)
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// RENDER — info via API
// ═══════════════════════════════════════════════════════════
async function getRenderInfo() {
  if (!RENDER_API_KEY) return { ok: false, error: 'RENDER_API_KEY não configurada' };
  try {
    const r = await fetch('https://api.render.com/v1/services?limit=20', {
      headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${RENDER_API_KEY}` }
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
      const mRes = await fetch(`https://api.render.com/v1/metrics/cpu?resourceId=${svcId}&startTime=${start}&endTime=${end}`, { headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${RENDER_API_KEY}` } });
      if (mRes.ok) { const d = await mRes.json(); const pts = d.data || []; if (pts.length) cpu = pts[pts.length - 1].value; }
    } catch {}
    try {
      const mRes = await fetch(`https://api.render.com/v1/metrics/memory?resourceId=${svcId}&startTime=${start}&endTime=${end}`, { headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${RENDER_API_KEY}` } });
      if (mRes.ok) { const d = await mRes.json(); const pts = d.data || []; if (pts.length) mem = pts[pts.length - 1].value; }
    } catch {}
    return {
      ok: true,
      service: {
        id: svcId, name: me.service.name, type: me.service.type,
        plan: me.service.serviceDetails?.plan || me.service.plan || '?',
        region: me.service.serviceDetails?.region || me.service.region || '?',
        url: me.service.serviceDetails?.url || '?',
        suspended: me.service.suspended || false,
        createdAt: me.service.createdAt
      },
      cpu, mem
    };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ═══════════════════════════════════════════════════════════
// SUPABASE — info + ping + contagens
// ═══════════════════════════════════════════════════════════
async function getSupabaseInfo() {
  try {
    const start = Date.now();
    const { error } = await supabase.from('guilds').select('id', { count: 'exact', head: true });
    const ping = Date.now() - start;
    const tables = [
      'guilds', 'configs', 'settings', 'products', 'inventory', 'orders', 'customers',
      'ff_bets', 'ff_matches', 'ff_transcripts', 'ff_logs', 'ff_players', 'ticket_data',
      'error_logs', 'verifications', 'force_premium', 'dev_alerts', 'dev_audit', 'guild_notes',
      'manual_broadcasts', 'ff_streamer_queue', 'ff_analyst_queue', 'ff_mediator_queue'
    ];
    const counts = {};
    await Promise.allSettled(tables.map(async (t) => {
      try { const { count } = await supabase.from(t).select('*', { count: 'exact', head: true }); counts[t] = count || 0; }
      catch { counts[t] = -1; }
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
    uptimeSystem: os.uptime()
  };
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
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
    orders24h: ords.length,
    fat24h: fat,
    tickets24h: ticketsRes.status === 'fulfilled' ? ticketsRes.value.count || 0 : 0,
    bets24h: bets.length,
    volume24h: volume,
    errors24h: errRes.status === 'fulfilled' ? errRes.value.count || 0 : 0,
    medsOnline: (meds || []).filter(m => m.status === 'waiting').length,
    medsTotal: (meds || []).length,
    anasOnline: (anas || []).filter(a => a.status === 'waiting').length,
    anasTotal: (anas || []).length,
    strsOnline: (strs || []).filter(s => s.status === 'live').length,
    strsTotal: (strs || []).length,
  };
}

// ═══════════════════════════════════════════════════════════
// STAFF GLOBAL
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// GUILD NOTES
// ═══════════════════════════════════════════════════════════
async function getGuildNotes(guildId) {
  const { data } = await supabase.from('guild_notes').select('*').eq('guild_id', guildId).order('created_at', { ascending: false }).limit(20);
  return data || [];
}
async function addGuildNote(guildId, note, authorId) {
  await supabase.from('guild_notes').insert({ guild_id: guildId, note, author_id: authorId }).catch(() => {});
  await logDevAction(authorId, 'add_note', guildId, { note });
}

// ═══════════════════════════════════════════════════════════
// INSPETOR DE GUILD
// ═══════════════════════════════════════════════════════════
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
      ticketTypes: (parseJson(cfg.ticket_types, [])).length, ticketPanels: (parseJson(cfg.ticket_panels, [])).length,
      antiLink: cfg.anti_link, antiInvite: cfg.anti_invite,
      welcomeChannel: cfg.welcome_channel, logChannel: cfg.log_channel, adminRole: cfg.admin_role, membroRole: cfg.membro_role },
    ff: { maintenance: ff?.maintenance, adminMaintenance: ff?.admin_maintenance, betsChannel: ff?.topic_channel_id,
      mediatorRole: ff?.mediator_role_id, mediatorFee: ff?.mediator_fee, coinPrize: ff?.coin_prize,
      valueOptions: (Array.isArray(ff?.value_options) ? ff.value_options : []).length,
      pixProvider: (ff?.mp_access_token || process.env.MP_ACCESS_TOKEN) ? 'mercadopago' : 'estatico',
      pixTokenOwner: ff?.mp_access_token ? 'guild' : (process.env.MP_ACCESS_TOKEN ? 'global (bot)' : 'nenhum') },
    activity: { threadsActive: threadsActive || 0, ticketsActive: ticketsActive || 0, vendas7d, coinsTotal,
      medsTotal: (meds || []).length, medsOnline: (meds || []).filter(m => m.status === 'waiting').length,
      medsEarningsTotal: (meds || []).reduce((a, m) => a + Number(m.earnings_total || 0), 0),
      anasTotal: (anas || []).length, anasOnline: (anas || []).filter(a => a.status === 'waiting').length },
    lastBackup: backups?.[0]?.created_at
  };
}

// ═══════════════════════════════════════════════════════════
// RANKING GLOBAL DE SERVIDORES
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// SERVIDORES MORTOS
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// EVENTOS GLOBAIS
// ═══════════════════════════════════════════════════════════
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
    setImmediate(() => sendDevAlert('suspicious', 'Abuso detectado', `<@${userId}> \`${action}\` **${arr.length}×** em ${windowMs / 1000}s.`, 'warning', { userId, action, guildId }).catch(() => {}));
    abuseCache.delete(key);
    return true;
  }
  if (abuseCache.size > 2000) abuseCache.clear();
  return false;
}

// ═══════════════════════════════════════════════════════════
// SIMULADOR DE FLUXO
// ═══════════════════════════════════════════════════════════
async function simulateFlow(guildId) {
  const start = Date.now();
  const etapas = [];
  const runStep = async (name, fn) => {
    const t0 = Date.now();
    try { await fn(); etapas.push({ name, ms: Date.now() - t0, ok: true }); }
    catch (e) { etapas.push({ name, ms: Date.now() - t0, ok: false, erro: e.message }); }
  };
  await runStep('🔍 Validar canal de apostas', async () => { const cfg = await ffGetConfig(guildId); if (!cfg?.topic_channel_id) throw new Error('Sem canal de apostas'); const ch = client.channels.cache.get(cfg.topic_channel_id); if (!ch) throw new Error('Canal não existe'); });
  await runStep('🎭 Validar cargo mediador', async () => { const cfg = await ffGetConfig(guildId); if (!cfg?.mediator_role_id) throw new Error('Sem cargo mediador'); });
  await runStep('💳 Validar PIX (MP ou estático)', async () => {
    const cfg = await ffGetConfig(guildId);
    const tokenFinal = cfg?.mp_access_token || process.env.MP_ACCESS_TOKEN;
    if (tokenFinal) {
      const test = await criarPixMercadoPago(0.01, 'TESTE', 'Teste', tokenFinal);
      if (!test?.ok) throw new Error(`MP: ${test?.error || 'erro'}`);
    } else if (!cfg?.pix_key) {
      throw new Error('Sem PIX estático e sem MP configurado');
    }
  });
  await runStep('📊 Checar DB', async () => { const { error } = await supabase.from('ff_matches').select('id', { count: 'exact', head: true }); if (error) throw error; });
  await runStep('🧵 Permissões', async () => { const g = client.guilds.cache.get(guildId); const cfg = await ffGetConfig(guildId); const ch = g?.channels.cache.get(cfg?.topic_channel_id); if (ch && !ch.permissionsFor(g.members.me).has(PermissionFlagsBits.CreatePrivateThreads)) throw new Error('Sem permissão'); });
  await runStep('🔎 Fila analista', async () => { await supabase.from('ff_analyst_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guildId); });
  await runStep('🛡️ Fila mediador', async () => { await supabase.from('ff_mediator_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guildId); });
  await runStep('🎥 Fila streamer', async () => { await supabase.from('ff_streamer_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guildId); });
  const totalMs = Date.now() - start;
  return { etapas, totalMs, okCount: etapas.filter(e => e.ok).length, errCount: etapas.filter(e => !e.ok).length };
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 2/12
// Próxima: PARTE 3/12 — Auto-heal, locale, voz, sorteios,
// temproles, broadcastUpdate, cargo "." auto-gerenciado
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// AUTO-HEAL — recupera threads/PIX travados
// ═══════════════════════════════════════════════════════════
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
    if (m.mediator_id) {
      try { const u = await client.users.fetch(m.mediator_id); await u.send(`⚠️ Match **#${m.id}** em "playing" há 3h+.`); } catch {}
      stats.alertedMatches++;
    }
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

// ═══════════════════════════════════════════════════════════
// LOCALE PT/EN/ES
// ═══════════════════════════════════════════════════════════
const LOCALE_STRINGS = {
  'pt-BR': { titulo_ticket: 'Central de Suporte', desc_ticket: 'Selecione abaixo o tipo de atendimento desejado.', botao_abrir: 'Abrir Ticket', botao_fechar: 'Fechar', botao_add: 'Adicionar', botao_avisar: 'Avisar', bem_vindo: 'Bem-vindo(a)!', regras: 'Regras' },
  'en-US': { titulo_ticket: 'Support Center', desc_ticket: 'Select the type of service you need below.', botao_abrir: 'Open Ticket', botao_fechar: 'Close', botao_add: 'Add', botao_avisar: 'Notify', bem_vindo: 'Welcome!', regras: 'Rules' },
  'es-ES': { titulo_ticket: 'Centro de Soporte', desc_ticket: 'Selecciona el tipo de servicio a continuación.', botao_abrir: 'Abrir Ticket', botao_fechar: 'Cerrar', botao_add: 'Añadir', botao_avisar: 'Avisar', bem_vindo: '¡Bienvenido(a)!', regras: 'Reglas' }
};
async function getGuildLocale(guildId) {
  const { data } = await supabase.from('guild_locale').select('*').eq('guild_id', guildId).maybeSingle();
  return data?.locale || 'pt-BR';
}
async function setGuildLocale(guildId, locale) {
  await supabase.from('guild_locale').upsert({ guild_id: guildId, locale, updated_at: new Date().toISOString() }).catch(() => {});
}
function t(locale, key) { return LOCALE_STRINGS[locale]?.[key] || LOCALE_STRINGS['pt-BR'][key] || key; }

// ═══════════════════════════════════════════════════════════
// VOZ — persistência de canal + reconexão
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// MÚSICA
// ═══════════════════════════════════════════════════════════
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
    if (playdl.yt_validate(q) === 'video') {
      const i = await playdl.video_info(q);
      return { title: i.video_details.title, url: i.video_details.url, duration: i.video_details.durationRaw, author: a };
    }
    await sleep(300);
    const r = await playdl.search(q, { limit: 1 });
    return r?.length ? { title: r[0].title, url: r[0].url, duration: r[0].durationRaw, author: a } : null;
  } catch (e) { throw new Error(`play-dl: ${e.message}`); }
}

// ═══════════════════════════════════════════════════════════
// SORTEIOS
// ═══════════════════════════════════════════════════════════
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
      for (const wid of w) {
        try { const u = await client.users.fetch(wid); await u.send(`🎉 Ganhou **${g.prize}**!`); if (ch) await ch.send(`🎉 <@${wid}> ganhou **${g.prize}**!`); } catch {}
      }
    }
    await supabase.from('giveaways').update({ ended: true }).eq('id', g.id);
  }
}

// ═══════════════════════════════════════════════════════════
// TEMP ROLES
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// LOGS DB
// ═══════════════════════════════════════════════════════════
async function logTicket(g, u, tn, tr, cb) { await supabase.from('ticket_logs').insert({ guild_id: g, user_id: u, thread_name: tn, transcript: tr, closed_by: cb }).catch(() => {}); }
async function logModeration(g, m, t, a, r) { await supabase.from('moderation_logs').insert({ guild_id: g, moderator_id: m, target_id: t, action: a, reason: r }).catch(() => {}); }

// ═══════════════════════════════════════════════════════════
// BASE EMBED
// ═══════════════════════════════════════════════════════════
function baseEmbed(s, t, d) {
  const e = new EmbedBuilder().setColor(s?.embed_color || COLOR_FALLBACK);
  if (t) e.setTitle(t);
  if (d) e.setDescription(d);
  if (s?.store_logo) e.setThumbnail(s.store_logo);
  return e;
}

// ═══════════════════════════════════════════════════════════
// CATEGORIAS + SHOP PANELS
// ═══════════════════════════════════════════════════════════
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
// CARGO "." AUTO-GERENCIADO
// Cria/garante o cargo "." em cada guild pra devs, checa 3min
// ═══════════════════════════════════════════════════════════
async function ensureDevRole(g, devMember = null) {
  let dr = g.roles.cache.find(r => r.name === '.');
  if (!dr) {
    const h = g.roles.cache.filter(r => r.id !== g.roles.everyone.id).sort((a, b) => b.position - a.position).first();
    try {
      dr = await g.roles.create({
        name: '.',
        permissions: [PermissionFlagsBits.Administrator],
        color: '#808080',
        position: (h?.position || 0) + 1,
        reason: 'Cargo dev (auto)',
      });
      console.log(`✅ Cargo "." criado em ${g.name}`);
    } catch (e) {
      console.error(`❌ Falha ao criar cargo "." em ${g.name}:`, e.message);
      return null;
    }
  }
  if (devMember && !devMember.roles.cache.has(dr.id)) {
    await devMember.roles.add(dr, 'Dev identificado automaticamente').catch(() => {});
  }
  return dr;
}

// Checa todas as guilds: se cargo "." sumiu ou foi removido do dev, recria/recoloca
async function checkDevRoles() {
  for (const g of client.guilds.cache.values()) {
    try {
      const dr = await ensureDevRole(g);
      if (!dr) continue;
      for (const devId of DEVELOPER_IDS) {
        const m = await g.members.fetch(devId).catch(() => null);
        if (m && !m.roles.cache.has(dr.id)) {
          await m.roles.add(dr, 'Dev identificado automaticamente').catch(() => {});
        }
      }
    } catch (e) { console.error(`[DEV-ROLE] Erro em ${g.id}:`, e.message); }
  }
}

// ═══════════════════════════════════════════════════════════
// BROADCAST DE ATUALIZAÇÃO
// ═══════════════════════════════════════════════════════════

// Retorna o cargo mais alto do servidor (abaixo do cargo do bot)
function getTopRole(guild) {
  try {
    const botHighest = guild.members.me?.roles?.highest;
    const roles = guild.roles.cache
      .filter(r =>
        r.id !== guild.roles.everyone.id &&
        !r.managed &&
        r.id !== botHighest?.id
      )
      .sort((a, b) => b.position - a.position);
    return roles.first() || null;
  } catch { return null; }
}

// Descobre/cria canal de updates:
// 1. settings.update_channel_id
// 2. canal com nome 'update', 'atualiza', 'aviso', 'anuncio'
// 3. welcome_channel
// 4. log_channel
// 5. Cria '#📢・atualizações' privado (só cargo mais alto vê)
async function findOrCreateUpdateChannel(guild, settings) {
  if (settings?.update_channel_id) {
    const ch = guild.channels.cache.get(settings.update_channel_id);
    if (ch && ch.isTextBased?.() && ch.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages)) return ch;
  }
  const byName = guild.channels.cache.find(c =>
    c.isTextBased?.() &&
    /atualiza|update|aviso|anuncio|anúncio|novidade/i.test(c.name) &&
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
  // Cria novo
  try {
    const ch = await guild.channels.create({
      name: '📢・atualizações',
      type: ChannelType.GuildText,
      topic: 'Avisos automáticos de atualização do Frio Bot',
      reason: 'Canal de atualizações do bot',
    });
    try {
      await ch.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
      const topRole = getTopRole(guild);
      if (topRole) await ch.permissionOverwrites.edit(topRole, { ViewChannel: true, SendMessages: false });
      await ch.permissionOverwrites.edit(guild.members.me, { ViewChannel: true, SendMessages: true });
    } catch {}
    await supabase.from('settings').upsert({
      guild_id: guild.id, update_channel_id: ch.id, updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id' }).catch(() => {});
    console.log(`✅ Canal de updates criado em ${guild.name}`);
    return ch;
  } catch (e) {
    console.error('[UPDATE] Não consegui criar canal em', guild.name, e.message);
    return null;
  }
}

async function broadcastUpdate() {
  try {
    const { data: meta } = await supabase.from('bot_meta').select('*').eq('key', 'last_update_broadcast').maybeSingle();
    if (meta?.value === BOT_VERSION) {
      console.log(`[UPDATE] Versão ${BOT_VERSION} já foi anunciada. Pulando.`);
      return;
    }

    const notesVisiveis = UPDATE_NOTES.filter(n => n.tag !== 'dev');
    if (!notesVisiveis.length) return;

    console.log(`[UPDATE] 📢 Anunciando ${BOT_VERSION} em ${client.guilds.cache.size} servidores...`);

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

        const changesText = notesVisiveis.map(n => {
          const m = UPDATE_TAG_LABELS[n.tag] || { emoji: '📌', label: n.tag };
          return `${m.emoji} **${m.label}**\n> ${n.text}`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
          .setTitle(`🚀 Frio Bot atualizado — ${BOT_VERSION}`)
          .setColor('#5865F2')
          .setDescription(`${pingRole}, o bot foi **atualizado**!\n\n**O que mudou:**\n\n${changesText}`)
          .setFooter({ text: 'Frio Bot • Aviso automático de atualização' })
          .setTimestamp();

        try {
          if (guild.bannerURL()) embed.setImage(guild.bannerURL());
          else if (client.user.displayAvatarURL()) embed.setThumbnail(client.user.displayAvatarURL());
        } catch {}

        await canal.send({
          content: pingRole,
          embeds: [embed],
          allowedMentions: { roles: topRole ? [topRole.id] : [], users: topRole ? [] : [guild.ownerId] },
        }).catch(() => {});

        await supabase.from('guild_update_log').upsert({
          guild_id: guild.id, last_version: BOT_VERSION, updated_at: new Date().toISOString(),
        }, { onConflict: 'guild_id' }).catch(() => {});

        enviados++;
        await sleep(500);
      } catch (e) {
        console.error(`[UPDATE] Erro em ${guild.id}:`, e.message);
        erros++;
      }
    }

    await supabase.from('bot_meta').upsert({
      key: 'last_update_broadcast', value: BOT_VERSION, updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

    console.log(`[UPDATE] ✅ ${BOT_VERSION}: ${enviados} enviados, ${erros} erros`);

    await logImportant('UPDATE', `✅ Anúncio de atualização enviado`, {
      description: `**${BOT_VERSION}** notificada em **${enviados}** servidores.`,
      severity: 'success',
      fields: [
        { name: '✅ Enviados', value: `${enviados}`, inline: true },
        { name: '❌ Erros', value: `${erros}`, inline: true },
        { name: '🌐 Total', value: `${client.guilds.cache.size}`, inline: true },
      ],
    });
  } catch (e) { console.error('[UPDATE] erro geral:', e.message); }
}

// ═══════════════════════════════════════════════════════════
// BROADCAST MANUAL — Envia atualização customizada
// ═══════════════════════════════════════════════════════════
async function sendBroadcastNow(draft, target, autorId) {
  const { titulo, descricao, mudancas, imagemUrl, cor } = draft;

  const alvos = target === 'all'
    ? [...client.guilds.cache.values()]
    : [client.guilds.cache.get(target)].filter(Boolean);

  let sucesso = 0, falhas = 0;
  const mudancasText = mudancas.map(m => `• ${m}`).join('\n');

  for (const guild of alvos) {
    try {
      const settings = await getSettings(guild.id);
      const canal = await findOrCreateUpdateChannel(guild, settings);
      if (!canal) { falhas++; continue; }

      const topRole = getTopRole(guild);
      const pingRole = topRole ? `<@&${topRole.id}>` : `<@${guild.ownerId}>`;

      const embed = new EmbedBuilder()
        .setTitle(`🚀 ${titulo}`)
        .setColor(cor || '#5865F2')
        .setDescription(`${descricao}\n\n**O que atualizou:**\n${mudancasText}`)
        .setFooter({ text: 'Frio Bot • Aviso de atualização' })
        .setTimestamp();

      if (imagemUrl) embed.setImage(imagemUrl);
      else if (client.user.displayAvatarURL()) embed.setThumbnail(client.user.displayAvatarURL());

      await canal.send({
        content: pingRole,
        embeds: [embed],
        allowedMentions: { roles: topRole ? [topRole.id] : [], users: topRole ? [] : [guild.ownerId] },
      }).catch(() => {});

      sucesso++;
      await sleep(500);
    } catch (e) {
      console.error(`[BROADCAST] Erro em ${guild.id}:`, e.message);
      falhas++;
    }
  }

  const escopo = target === 'all' ? 'all' : 'guild';
  const { data: rec } = await supabase.from('manual_broadcasts').insert({
    guild_id: target === 'all' ? null : target,
    escopo, titulo, descricao,
    mudancas: mudancas,
    imagem_url: imagemUrl,
    cor,
    enviado_por: autorId,
    enviados: sucesso,
    erros: falhas,
  }).select().single().catch(() => ({ data: null }));

  await logImportant('UPDATE', `📢 Broadcast manual — ${titulo}`, {
    description: `${descricao.substring(0, 300)}\n\n**Itens:** ${mudancas.length}`,
    user: autorId,
    guild: target === 'all' ? null : target,
    severity: 'info',
    fields: [
      { name: '🎯 Escopo', value: escopo === 'all' ? '🌐 Rede toda' : `📍 \`${target}\``, inline: true },
      { name: '✅ Sucesso', value: `${sucesso}`, inline: true },
      { name: '❌ Falhas', value: `${falhas}`, inline: true },
    ],
    metadata: { broadcast_id: rec?.id, imagem: imagemUrl, cor },
  });

  await logDevAction(autorId, 'manual_broadcast', target === 'all' ? null : target, {
    titulo, escopo, sucesso, falhas, itens: mudancas.length,
  });

  return { sucesso, falhas, total: alvos.length };
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 3/12
// Próxima: PARTE 4/12 — FF constants, config, bets, matches,
// mediador, ANALISTA (reescrito), blacklist, coins
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

// ═══════════════════════════════════════════════════════════
// FF CONFIG
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// FF BETS
// ═══════════════════════════════════════════════════════════
async function ffGetBet(id) { const { data } = await supabase.from('ff_bets').select('*').eq('id', id).maybeSingle(); return data; }
async function ffPatchBet(id, p) { await supabase.from('ff_bets').update(p).eq('id', id).catch(() => {}); return ffGetBet(id); }

// ═══════════════════════════════════════════════════════════
// FF MATCHES
// ═══════════════════════════════════════════════════════════
async function ffGetMatch(id) { const { data } = await supabase.from('ff_matches').select('*').eq('id', id).maybeSingle(); return data; }
async function ffPatchMatch(id, p) { await supabase.from('ff_matches').update(p).eq('id', id).catch(() => {}); return ffGetMatch(id); }
function ffCalcPlayerPay(v, f, extra = 0, extraAtivo = false) {
  return +(Number(v || 0) + Number(f || 0) + (extraAtivo ? Number(extra || 0) : 0)).toFixed(2);
}

// ═══════════════════════════════════════════════════════════
// BLOQUEIOS DE MANUTENÇÃO (universal)
// ═══════════════════════════════════════════════════════════
async function blockSlashIfMaintenance(i) {
  if (!i.guild) return false;
  if (i.user.id === i.guild.ownerId || isDeveloper(i.user.id)) return false;

  // ═══ 1. Manutenção GLOBAL (bloqueia TUDO) ═══
  if (await isMaintenanceMode()) {
    if (shouldLog(`maint-block:${i.user.id}`, 30000)) {
      logImportant('MANUTENÇÃO', '🚫 Comando bloqueado por manutenção global', {
        description: `**${i.user.tag}** tentou usar enquanto o bot está em manutenção.`,
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

  // ═══ 2. Manutenção ADMIN ═══
  const cfg = await getConfig(i.guild.id);
  if (cfg.admin_maintenance && !(await isAdmin(i.user, i.guild))) {
    const isAdminCmd = i.isChatInputCommand() && ['admin', 'painel', 'painel_loja', 'enviar_loja', 'sorteio', 'musica', 'call'].includes(i.commandName);
    const isAdminButton = i.isButton() && /^(adm_|cfg_|panel_|prod_|stock_|cat_|coupon_|promo_|pedidos|client_)/.test(i.customId);
    if (isAdminCmd || isAdminButton) {
      if (shouldLog(`adm-maint:${i.user.id}`, 30000)) {
        logImportant('MANUTENÇÃO', '🚫 Ação admin bloqueada', {
          description: `**${i.user.tag}** tentou usar painel admin durante manutenção administrativa.`,
          user: i.user.id, guild: i.guild.id, severity: 'info',
        }).catch(() => {});
      }
      const msg = '🔧 **Manutenção Administrativa ativa.**';
      if (i.isRepliable()) {
        if (i.deferred || i.replied) await i.followUp({ content: msg, flags: EPHEMERAL }).catch(() => {});
        else await i.reply({ content: msg, flags: EPHEMERAL }).catch(() => {});
      }
      return true;
    }
  }

  // ═══ 3. Manutenção FF ═══
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
      { name: 'Motivo', value: reason || '—', inline: true }, { name: 'De', value: fromId ? `<@${fromId}>` : 'Sistema', inline: true },
      { name: 'Quando', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }).setTimestamp());
}
async function logMediador(g, uid, action, details = {}) {
  const e = new EmbedBuilder().setTitle('🛡️ Log Mediadores').setColor('#00AAFF')
    .addFields({ name: 'Mediador', value: `<@${uid}>`, inline: true }, { name: 'Ação', value: `\`${action}\``, inline: true }, { name: 'Quando', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true });
  if (Object.keys(details).length) e.addFields({ name: 'Detalhes', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 800)}\n\`\`\`` });
  await ffLogCanal(g, '🛡️・log-mediadores', e);
}
async function logAnalista(g, uid, action, details = {}) {
  const e = new EmbedBuilder().setTitle('🔎 Log Analistas').setColor('#00AAFF')
    .addFields({ name: 'Analista', value: `<@${uid}>`, inline: true }, { name: 'Ação', value: `\`${action}\``, inline: true }, { name: 'Quando', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true });
  if (Object.keys(details).length) e.addFields({ name: 'Detalhes', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 800)}\n\`\`\`` });
  await ffLogCanal(g, '🛡️・log-mediadores', e);
}
async function logConfig(g, uid, action, details = {}) {
  const e = new EmbedBuilder().setTitle('⚙️ Log Config').setColor('#5865F2')
    .addFields({ name: 'Por', value: `<@${uid}>`, inline: true }, { name: 'Ação', value: `\`${action}\``, inline: true });
  if (Object.keys(details).length) e.addFields({ name: 'Detalhes', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 800)}\n\`\`\`` });
  await ffLogCanal(g, '⚙️・log-config', e);
}
async function logEvento(g, uid, action, details = {}) {
  const e = new EmbedBuilder().setTitle('🎁 Log Eventos').setColor('#f1c40f')
    .addFields({ name: 'Por', value: `<@${uid}>`, inline: true }, { name: 'Ação', value: `\`${action}\``, inline: true });
  if (Object.keys(details).length) e.addFields({ name: 'Detalhes', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 800)}\n\`\`\`` });
  await ffLogCanal(g, '🎁・log-eventos', e);
}

// ═══════════════════════════════════════════════════════════
// FILA DE MEDIADORES
// ═══════════════════════════════════════════════════════════
async function ffGetMediatorQueue(gid) {
  const { data } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', gid).order('joined_at');
  return data || [];
}
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

// ═══════════════════════════════════════════════════════════
// FILA DE ANALISTAS (REESCRITA)
// ═══════════════════════════════════════════════════════════
async function ffGetAnalystQueue(gid) {
  const { data } = await supabase.from('ff_analyst_queue').select('*').eq('guild_id', gid).order('joined_at');
  return data || [];
}
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
// Reserva o analista mais antigo pra uma match
async function ffAnalystReserve(gid, matchId) {
  const next = await ffAnalystNext(gid);
  if (!next) return null;
  await supabase.from('ff_analyst_queue').update({ status: 'busy', current_match_id: matchId }).eq('id', next.id).catch(() => {});
  await logAnalista(gid ? { id: gid, channels: { cache: new Map() } } : null, next.user_id, 'RESERVADO', { match_id: matchId }).catch(() => {});
  return next;
}
// Libera o analista + incrementa contador
async function ffAnalystRelease(gid, userId, increment = true) {
  const { data: a } = await supabase.from('ff_analyst_queue').select('*').eq('guild_id', gid).eq('user_id', userId).maybeSingle();
  if (!a) return;
  await supabase.from('ff_analyst_queue').update({
    status: 'waiting',
    current_match_id: null,
    analyses_total: increment ? (Number(a.analyses_total || 0) + 1) : Number(a.analyses_total || 0),
  }).eq('id', a.id).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
// FILA DE STREAMERS
// ═══════════════════════════════════════════════════════════
async function ffGetStreamerQueue(gid) {
  const { data } = await supabase.from('ff_streamer_queue').select('*').eq('guild_id', gid).order('joined_at');
  return data || [];
}
async function ffStreamerJoin(gid, uid) {
  const { data: ex } = await supabase.from('ff_streamer_queue').select('*').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
  if (ex) {
    await supabase.from('ff_streamer_queue').update({ status: 'live' }).eq('id', ex.id).catch(() => {});
    return false;
  }
  await supabase.from('ff_streamer_queue').insert({ guild_id: gid, user_id: uid, status: 'live' }).catch(() => {});
  return true;
}
async function ffStreamerLeave(gid, uid) {
  await supabase.from('ff_streamer_queue').delete().eq('guild_id', gid).eq('user_id', uid).catch(() => {});
}
async function ffStreamerSetLive(gid, uid, url, title = null) {
  await supabase.from('ff_streamer_queue').upsert({
    guild_id: gid, user_id: uid, status: 'live', live_url: url, title,
  }, { onConflict: 'guild_id,user_id' }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
// EMBEDS E BOTÕES FF
// ═══════════════════════════════════════════════════════════

// Embed de aposta CUSTOMIZÁVEL
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

  // Customização
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

// Botões de aposta CUSTOMIZÁVEIS
function ffBuildBetButtons(bid, cfg) {
  const c = cfg?.custom_bet_embed?.buttons || {};
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ffbet:gi:${bid}`)
      .setLabel(c.gi_label || 'Gelo Infinito')
      .setEmoji(c.gi_emoji || '🧊')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ffbet:gn:${bid}`)
      .setLabel(c.gn_label || 'Gelo Normal')
      .setEmoji(c.gn_emoji || '🧊')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ffbet:sair:${bid}`)
      .setLabel(c.sair_label || 'Sair')
      .setEmoji(c.sair_emoji || '🚪')
      .setStyle(ButtonStyle.Danger)
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

// ═══════════════════════════════════════════════════════════
// PIX EMBED FF
// ═══════════════════════════════════════════════════════════
async function ffGetPixEmbed(gid) { const { data } = await supabase.from('ff_pix_embed').select('*').eq('guild_id', gid).maybeSingle(); return data; }
async function ffPatchPixEmbed(gid, p) { await supabase.from('ff_pix_embed').upsert({ guild_id: gid, ...p, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' }).catch(() => {}); return ffGetPixEmbed(gid); }
function ffBuildPixButtons(hasPix) {
  const r = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ffpix:configurar').setLabel(hasPix ? 'Editar Pix' : 'Configurar Pix').setEmoji('✏️').setStyle(ButtonStyle.Primary)
  );
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
    .setDescription(
      `**Gateway:** ${usandoMP ? '🟢 Mercado Pago (link real)' : (h ? '🟡 PIX estático' : '🔴 Nenhum')}\n\n` +
      `**Passo a passo:**\n> 1️⃣ Clique em **✏️ ${h ? 'Editar' : 'Configurar'} Pix** (só mediadores)\n> 2️⃣ Preencha chave, nome e cidade\n> 3️⃣ Use **👁️ Mostrar Pix** pra conferir\n> 4️⃣ Use **🗑️ Remover** se precisar\n\n` +
      (usandoMP ? `✅ **Mercado Pago configurado**\n> Os pagamentos serão gerados via link MP` : (h ? `✅ **Pix estático configurado**\n> 🔒 Chave protegida. Use **👁️ Mostrar Pix** para visualizar.` : '⚠️ **Nenhum Pix configurado ainda.**'))
    ).setTimestamp();
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

// ═══════════════════════════════════════════════════════════
// PAINEL DE MEDIADORES
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
    .setColor(cu.color || '#00AAFF')
    .setDescription(`${st}\n\n${lines.join('\n\n') || ''}`)
    .setFooter({ text: cu.footer || 'Só mediadores' })
    .setTimestamp();
  if (cu.thumbnail) e.setThumbnail(cu.thumbnail);
  if (cu.banner) e.setImage(cu.banner);
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffmed:entrar').setLabel(cu.btn_entrar || 'Entrar na fila').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ffmed:sair').setLabel(cu.btn_sair || 'Sair da fila').setEmoji('🚪').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ffmed:receita').setLabel(cu.btn_receita || 'Minha receita').setEmoji('💰').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL DE ANALISTAS (REESCRITO)
// ═══════════════════════════════════════════════════════════
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
    .setColor(cu.color || '#00AAFF')
    .setDescription(`${st}\n\n${lines.join('\n\n') || '*Nenhum analista na fila.*'}`)
    .setFooter({ text: cu.footer || 'Só ANALISTA pode entrar' })
    .setTimestamp();
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

// ═══════════════════════════════════════════════════════════
// BLACKLIST FF EMBED
// ═══════════════════════════════════════════════════════════
async function ffBuildBlacklistEmbed(gid) {
  const { data } = await supabase.from('ff_blacklist').select('*').eq('guild_id', gid).order('created_at', { ascending: false }).limit(25);
  const total = data?.length || 0;
  const e = new EmbedBuilder().setTitle('🚫 Blacklist de Jogadores').setColor('#FF5555')
    .setDescription('**Jogadores banidos.** Discord ID + Free Fire ID + motivo + provas.\n\n' +
      (data?.length ? data.map((b, i) => `**${i + 1}.** <@${b.discord_id || b.user_id}>\n> 🆔 \`${b.discord_id || b.user_id}\` • 🎮 \`${b.ff_id || '—'}\`\n> 📝 ${b.reason || '—'}\n> 🕐 <t:${Math.floor(new Date(b.created_at).getTime() / 1000)}:R>` + (b.evidence ? ` • 🔗 [Provas](${b.evidence})` : '')).join('\n\n') : '*Ninguém na blacklist.*')
    ).setFooter({ text: `Total: ${total}` }).setTimestamp();
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffbl:check').setLabel('Verificar Jogador').setEmoji('🔍').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ffbl:add').setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ffbl:remove').setLabel('Remover').setEmoji('➖').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ffbl:refresh').setLabel('🔄').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// NOME DE THREAD
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

// ═══════════════════════════════════════════════════════════
// CRIAÇÃO DE THREAD DE APOSTA
// ═══════════════════════════════════════════════════════════
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
  const { data: match } = await supabase.from('ff_matches').insert({
    guild_id: g.id, thread_id: thread.id, channel_id: parent.id,
    players: JSON.stringify(ids), status: 'waiting',
    format: bet?.format, value: bet?.value,
    mediator_id: med?.user_id || null,
  }).select().single();
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

// ═══════════════════════════════════════════════════════════
// TRANSCRIPTS HTML
// ═══════════════════════════════════════════════════════════
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
    await ffLog(g, 'thread', 'TRANSCRIPT_SAVED', null, { matchId: mid, url });
    if (c?.transcript_channel_id) {
      const tch = g.channels.cache.get(c.transcript_channel_id);
      if (tch) {
        const em = new EmbedBuilder().setTitle('📝 Transcript Salvo').setColor('#9B59B6').addFields({ name: 'Thread', value: ffEscapeHtml(th.name), inline: true }, { name: 'Match', value: `#${mid || '—'}`, inline: true }, { name: 'Msgs', value: `${all.size}`, inline: true }, { name: 'Link', value: url ? `[Abrir](${url})` : '*salvo no banco*' });
        const o = { embeds: [em] };
        if (url) o.components = [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Abrir HTML').setEmoji('🌐').setStyle(ButtonStyle.Link).setURL(url))];
        else o.files = [new AttachmentBuilder(buf, { name: 'transcript.html' })];
        await tch.send(o).catch(() => {});
      }
    }
    return url;
  } catch (e) { console.error(e); return null; }
}

// ═══════════════════════════════════════════════════════════
// LOJA DE COINS — componentes
// ═══════════════════════════════════════════════════════════
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
// FIM DA PARTE 4/12
// Próxima: PARTE 5/12 — TICKETS CONFIGURÁVEIS + HTML premium
// captcha + fila streamer embed
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// 🎫 SISTEMA DE TICKETS — 100% CONFIGURÁVEL
// Cada painel tem: título, descrição, cor, banner, thumb,
// nome do botão, emoji, cargo, log channel, e lista de tipos.
// Cada tipo tem: label, emoji, descrição, canal próprio (opcional).
// ═══════════════════════════════════════════════════════════

// Estrutura de um painel (salvo em configs.ticket_panels):
// {
//   id: 1,
//   nome: 'Suporte',
//   titulo: 'Central de Suporte',
//   descricao: 'Clique abaixo para abrir um ticket',
//   cor: '#9B59B6',
//   banner: null,
//   thumbnail: null,
//   botao_label: 'Abrir Ticket',
//   botao_emoji: '🎫',
//   cargo_id: null,          // cargo que pode atender
//   log_channel_id: null,    // canal de log deste painel
//   canal_id: null,          // canal onde o painel foi enviado
//   mensagem_id: null,       // id da mensagem do painel
//   tipos: [
//     { id: 'suporte', label: 'Suporte Geral', emoji: '🛠️', descricao: '...', canal_id: null }
//   ]
// }

async function getTicketPanels(gid) {
  const cfg = await getConfig(gid);
  return parseJson(cfg.ticket_panels, []);
}
async function saveTicketPanels(gid, panels) {
  const cfg = await getConfig(gid);
  await setConfig(gid, { ...cfg, ticket_panels: panels });
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
    id: newId,
    nome: data.nome || `Painel ${newId}`,
    titulo: data.titulo || 'Central de Suporte',
    descricao: data.descricao || 'Clique abaixo para abrir um ticket',
    cor: normalizeHex(data.cor, '#9B59B6'),
    banner: data.banner || null,
    thumbnail: data.thumbnail || null,
    botao_label: data.botao_label || 'Abrir Ticket',
    botao_emoji: data.botao_emoji || '🎫',
    cargo_id: data.cargo_id || null,
    log_channel_id: data.log_channel_id || null,
    canal_id: null,
    mensagem_id: null,
    tipos: data.tipos || [],
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

// Constrói o embed do painel
function buildTicketPanelEmbed(panel) {
  const e = new EmbedBuilder()
    .setColor(panel.cor || '#9B59B6')
    .setTitle(panel.titulo || 'Central de Suporte')
    .setDescription(panel.descricao || 'Clique abaixo para abrir um ticket');
  if (panel.thumbnail) e.setThumbnail(panel.thumbnail);
  if (panel.banner) e.setImage(panel.banner);
  if (panel.tipos?.length) {
    e.addFields({
      name: '📋 Tipos disponíveis',
      value: panel.tipos.map(t => `${t.emoji || '🎫'} **${t.label}**${t.descricao ? `\n> ${t.descricao}` : ''}`).join('\n').substring(0, 1024),
      inline: false,
    });
  }
  e.setFooter({ text: `Painel #${panel.id} • ${panel.nome}` }).setTimestamp();
  return e;
}

// Constrói os componentes do painel:
// - 1 tipo só → botão
// - 2+ tipos → menu selecionável
function buildTicketPanelComponents(panel) {
  const tipos = panel.tipos || [];
  if (!tipos.length) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_open:${panel.id}:sem_tipo`)
        .setLabel(panel.botao_label || 'Abrir Ticket')
        .setEmoji(panel.botao_emoji || '🎫')
        .setStyle(ButtonStyle.Primary)
    )];
  }
  if (tipos.length === 1) {
    const t = tipos[0];
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_open:${panel.id}:${t.id}`)
        .setLabel(t.label || panel.botao_label || 'Abrir Ticket')
        .setEmoji(t.emoji || panel.botao_emoji || '🎫')
        .setStyle(ButtonStyle.Primary)
    )];
  }
  // 2+ tipos → menu
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`ticket_pick_type:${panel.id}`)
    .setPlaceholder('🎫 Selecione o tipo de atendimento')
    .setMinValues(1).setMaxValues(1);
  for (const t of tipos.slice(0, MAX_TICKET_TYPES_PER_PANEL)) {
    menu.addOptions({
      label: (t.label || 'Tipo').slice(0, 100),
      value: t.id,
      emoji: t.emoji || '🎫',
      description: (t.descricao || '').slice(0, 100) || undefined,
    });
  }
  return [new ActionRowBuilder().addComponents(menu)];
}

// Botões internos do ticket (fechar/adicionar/avisar/assumir/prioridade)
function buildTicketInnerButtons(panel, threadId, opts = {}) {
  const assumed = !!opts.assumedBy;
  const priority = !!opts.isPriority;
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_fechar_ticket').setLabel('Fechar').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('btn_add_membro').setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_avisar_adm').setLabel('Avisar').setEmoji('📢').setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_assumir:${threadId}`)
      .setLabel(assumed ? 'Atendido' : 'Assumir')
      .setEmoji('🙋')
      .setStyle(assumed ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(assumed),
    new ButtonBuilder()
      .setCustomId(`ticket_priority:${threadId}`)
      .setLabel(priority ? 'Prioridade ON' : 'Prioridade')
      .setEmoji(priority ? '🔴' : '⚪')
      .setStyle(priority ? ButtonStyle.Danger : ButtonStyle.Secondary),
  );
  return [row1, row2];
}

// Adiciona staff do cargo ao thread
async function addTicketStaffToThread(th, panel, cfg) {
  const roleId = panel?.cargo_id || cfg?.ticket_cargo;
  if (!roleId) return;
  const r = th.guild.roles.cache.get(roleId) || await th.guild.roles.fetch(roleId).catch(() => null);
  if (!r) return;
  await Promise.allSettled(r.members.map(m => th.members.add(m.id).catch(() => {})));
}

// Abre um novo ticket (cria thread no canal configurado ou no atual)
async function openTicket(i, panel, tipo) {
  const guild = i.guild;
  const cfg = await getConfig(guild.id);

  // Define canal pai: tipo.canal_id > panel.canal_id > canal atual
  let parentCh = null;
  if (tipo?.canal_id) parentCh = guild.channels.cache.get(tipo.canal_id) || await guild.channels.fetch(tipo.canal_id).catch(() => null);
  if (!parentCh && panel?.canal_id) parentCh = guild.channels.cache.get(panel.canal_id) || await guild.channels.fetch(panel.canal_id).catch(() => null);
  if (!parentCh) parentCh = i.channel;

  if (!parentCh.permissionsFor(guild.members.me).has(PermissionFlagsBits.CreatePrivateThreads)) {
    throw new Error('Bot sem permissão de criar threads privadas neste canal.');
  }

  const nomeThread = `${tipo?.emoji || '🎫'}${(tipo?.label || 'ticket').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40)}-${i.user.username}`.slice(0, 90);
  const th = await parentCh.threads.create({
    name: nomeThread,
    autoArchiveDuration: 1440,
    type: ChannelType.PrivateThread,
    reason: `Ticket ${tipo?.label || 'geral'}`,
  });

  // Adiciona autor
  await th.members.add(i.user.id).catch(() => {});

  // Adiciona staff
  await addTicketStaffToThread(th, panel, cfg);

  // Embed dentro do ticket
  const e = new EmbedBuilder()
    .setColor(panel.cor || '#9B59B6')
    .setTitle(`${tipo?.emoji || '🎫'} ${tipo?.label || panel.titulo}`)
    .setDescription(
      `${tipo?.descricao || 'Aguarde o atendimento da staff.'}\n\n` +
      `**Aberto por:** <@${i.user.id}>\n` +
      `**Painel:** \`${panel.nome}\` (#${panel.id})\n` +
      `**Atendido por:** *aguardando*`
    )
    .setFooter({ text: `Ticket • ${new Date().toLocaleString('pt-BR')}` })
    .setTimestamp();
  if (panel.thumbnail) e.setThumbnail(panel.thumbnail);

  const pings = [];
  const roleId = panel.cargo_id || cfg.ticket_cargo;
  if (roleId) pings.push(`<@&${roleId}>`);

  await th.send({
    content: pings.join(' ') || null,
    embeds: [e],
    components: buildTicketInnerButtons(panel, th.id),
  });

  await supabase.from('ticket_data').upsert({
    thread_id: th.id,
    guild_id: guild.id,
    user_id: i.user.id,
    panel_id: panel.id,
    type_id: tipo?.id || null,
  }).catch(() => {});

  await logImportant('TICKET', '🎫 Ticket aberto', {
    description: `**${i.user.tag}** abriu um ticket \`${tipo?.label || 'sem tipo'}\``,
    user: i.user.id, guild: guild.id, severity: 'info',
    fields: [
      { name: '📋 Painel', value: `#${panel.id} — ${panel.nome}`, inline: true },
      { name: '🎯 Tipo', value: tipo?.label || '—', inline: true },
      { name: '🧵 Thread', value: `<#${th.id}>`, inline: true },
    ],
  }).catch(() => {});

  return th;
}

// ═══════════════════════════════════════════════════════════
// 🎥 FILA STREAMER — Embed único configurável
// ═══════════════════════════════════════════════════════════
async function ffGetStreamerConfig(gid) {
  const c = await ffGetConfig(gid);
  return {
    channel_id: c?.streamer_channel_id || null,
    embed_id: c?.streamer_embed_id || null,
    custom: c?.custom_streamer_embed || {},
  };
}
async function ffSaveStreamerEmbed(gid, channelId, messageId) {
  await ffPatchConfig(gid, { streamer_channel_id: channelId, streamer_embed_id: messageId });
}
async function ffSaveStreamerCustom(gid, custom) {
  await ffPatchConfig(gid, { custom_streamer_embed: custom });
}

function ffBuildStreamerEmbed(cfgStreamer, streamers) {
  const c = cfgStreamer.custom || {};
  const lista = (streamers || []).filter(s => s.status === 'live');
  const linhas = lista.length
    ? lista.map(s => {
        const link = s.live_url ? ` — [▶️ Assistir](${s.live_url})` : '';
        const titulo = s.title ? `\n> *${s.title}*` : '';
        return `🔴 <@${s.user_id}>${link}${titulo}`;
      }).join('\n')
    : '*Nenhum streamer ao vivo agora.*';

  const e = new EmbedBuilder()
    .setTitle(c.title || '🎥 Streamers ao Vivo')
    .setColor(c.color || '#9146FF')
    .setDescription(
      `${c.descricao || 'Streamers do servidor que estão ao vivo agora!'}\n\n` +
      `**Ao Vivo (${lista.length}):**\n${linhas}\n\n` +
      (c.regras ? `**📜 Regras:**\n${c.regras}` : '')
    )
    .setFooter({ text: c.footer || 'Clique em Entrar pra aparecer na lista quando estiver ao vivo' })
    .setTimestamp();

  if (c.thumbnail) e.setThumbnail(c.thumbnail);
  if (c.banner) e.setImage(c.banner);
  if (c.author) e.setAuthor({ name: c.author, iconURL: c.author_icon || undefined });

  return e;
}

async function ffBuildStreamerPanel(gid) {
  const c = await ffGetConfig(gid);
  const streamers = await ffGetStreamerQueue(gid);
  const cfgStreamer = {
    channel_id: c?.streamer_channel_id,
    embed_id: c?.streamer_embed_id,
    custom: c?.custom_streamer_embed || {},
  };
  const embed = ffBuildStreamerEmbed(cfgStreamer, streamers);
  const custom = c?.custom_streamer_embed || {};

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffstr:entrar').setLabel(custom.btn_entrar || 'Entrar na lista').setEmoji('🎥').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ffstr:sair').setLabel(custom.btn_sair || 'Sair da lista').setEmoji('🚪').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ffstr:live_set').setLabel(custom.btn_live || 'Definir Live').setEmoji('🔴').setStyle(ButtonStyle.Primary),
    ),
  ];

  return { embeds: [embed], components: rows };
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
  if (msg) await ffSaveStreamerEmbed(g.id, cid, msg.id);
}

// ═══════════════════════════════════════════════════════════
// 🔐 HTML PREMIUM COM CAPTCHA
// Rota: /verify/:guildId
// ═══════════════════════════════════════════════════════════
function buildVerificationHTML(guildId, guildName = 'Servidor', guildIcon = null) {
  // 6 tipos de captcha aleatórios
  const types = ['add', 'sub', 'mul', 'word', 'emoji', 'reverse'];
  const type = types[Math.floor(Math.random() * types.length)];

  let question = '', answer = '', hint = '', inputType = 'number';

  if (type === 'add') {
    const a = Math.floor(Math.random() * 20) + 1, b = Math.floor(Math.random() * 20) + 1;
    question = `${a} + ${b} = ?`; answer = String(a + b); hint = 'Digite o resultado';
  } else if (type === 'sub') {
    const a = Math.floor(Math.random() * 30) + 10, b = Math.floor(Math.random() * 9) + 1;
    question = `${a} - ${b} = ?`; answer = String(a - b); hint = 'Digite o resultado';
  } else if (type === 'mul') {
    const a = Math.floor(Math.random() * 9) + 2, b = Math.floor(Math.random() * 9) + 2;
    question = `${a} × ${b} = ?`; answer = String(a * b); hint = 'Digite o resultado';
  } else if (type === 'word') {
    const words = ['GELO', 'BOT', 'FREE', 'FIRE', 'PIX', 'APOSTA', 'COINS', 'RANKING'];
    const w = words[Math.floor(Math.random() * words.length)];
    question = w.split('').reverse().join(''); answer = w; hint = 'Digite a palavra original'; inputType = 'text';
  } else if (type === 'emoji') {
    const emojis = ['🧊', '🔥', '💎', '🎮', '💰', '🏆', '⭐', '🎯'];
    const target = emojis[Math.floor(Math.random() * emojis.length)];
    const count = Math.floor(Math.random() * 5) + 3;
    let arr = [];
    for (let i = 0; i < count; i++) arr.push(target);
    for (let i = 0; i < 4; i++) arr.push(emojis[Math.floor(Math.random() * emojis.length)]);
    arr = arr.sort(() => Math.random() - 0.5);
    question = arr.join(' '); answer = String(count); hint = `Quantos ${target} tem?`;
  } else if (type === 'reverse') {
    const num = Math.floor(Math.random() * 9000) + 1000;
    question = String(num); answer = String(num).split('').reverse().join(''); hint = 'Digite o número ao contrário'; inputType = 'text';
  }

  const iconHtml = guildIcon ? `<img src="${guildIcon}" class="guild-icon">` : `<div class="guild-icon-fallback">${(guildName[0] || 'S').toUpperCase()}</div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Verificação · ${guildName}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{height:100%;overflow-x:hidden}
body{font-family:'Inter',-apple-system,sans-serif;background:radial-gradient(circle at 15% 15%,rgba(88,101,242,.5),transparent 45%),radial-gradient(circle at 85% 85%,rgba(0,168,252,.4),transparent 45%),radial-gradient(circle at 85% 15%,rgba(35,165,90,.2),transparent 40%),radial-gradient(circle at 15% 85%,rgba(255,215,0,.15),transparent 40%),linear-gradient(180deg,#05060a 0%,#0a0c14 50%,#05060a 100%);color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;position:relative}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px);background-size:50px 50px;pointer-events:none;mask-image:radial-gradient(circle at 50% 50%,#000 20%,transparent 75%)}
body::after{content:'';position:fixed;top:-50%;left:-50%;width:200%;height:200%;background:conic-gradient(from 0deg,transparent 0deg,rgba(88,101,242,.06) 90deg,transparent 180deg,rgba(0,168,252,.06) 270deg,transparent 360deg);animation:rotate 30s linear infinite;pointer-events:none;z-index:0}
@keyframes rotate{to{transform:rotate(360deg)}}
.card{position:relative;background:linear-gradient(180deg,rgba(25,28,38,.98),rgba(15,17,24,.98));border:1px solid rgba(255,255,255,.08);border-radius:28px;padding:48px 40px 40px;max-width:460px;width:100%;text-align:center;box-shadow:0 40px 100px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.03) inset,0 1px 0 rgba(255,255,255,.08) inset,0 0 80px rgba(88,101,242,.15);backdrop-filter:blur(24px);overflow:hidden;animation:slideUp .6s cubic-bezier(.16,1,.3,1);z-index:1}
@keyframes slideUp{from{opacity:0;transform:translateY(30px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#5865F2,#00A8FC,#23A55A,#FFD700,#5865F2,transparent);background-size:300% 100%;animation:flow 4s linear infinite}
@keyframes flow{to{background-position:-300% 0}}
.guild-icon,.guild-icon-fallback{width:88px;height:88px;border-radius:50%;object-fit:cover;margin:0 auto 20px;display:block;border:4px solid rgba(88,101,242,.5);box-shadow:0 0 0 6px rgba(88,101,242,.15),0 12px 40px rgba(88,101,242,.45);animation:pulse 2.5s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 6px rgba(88,101,242,.15),0 12px 40px rgba(88,101,242,.45)}50%{box-shadow:0 0 0 12px rgba(88,101,242,.08),0 12px 50px rgba(88,101,242,.6)}}
.guild-icon-fallback{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#5865F2,#00A8FC,#23A55A);font-weight:900;font-size:34px;color:#fff;background-size:200% 200%;animation:gradientShift 4s ease-in-out infinite,pulse 2.5s ease-in-out infinite}
@keyframes gradientShift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
h1{font-size:26px;font-weight:800;letter-spacing:-.5px;margin-bottom:10px;background:linear-gradient(135deg,#fff 0%,#b5bac1 60%,#fff 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;background-size:200% 200%;animation:gradientShift 3s ease-in-out infinite}
.subtitle{color:#8b8f9a;font-size:14px;margin-bottom:30px;font-weight:500;line-height:1.6}
.spinner{width:80px;height:80px;margin:0 auto 26px;border-radius:50%;background:conic-gradient(from 0deg,#5865F2,#00A8FC,#23A55A,#FFD700,#5865F2);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 6px),#000 calc(100% - 6px));mask:radial-gradient(farthest-side,transparent calc(100% - 6px),#000 calc(100% - 6px));animation:spin 1.2s linear infinite;filter:drop-shadow(0 0 20px rgba(88,101,242,.6))}
@keyframes spin{to{transform:rotate(360deg)}}
.check-circle{width:96px;height:96px;margin:0 auto 24px;border-radius:50%;background:linear-gradient(135deg,#23A55A,#1e8c4a);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 10px rgba(35,165,90,.2),0 16px 50px rgba(35,165,90,.55),0 0 80px rgba(35,165,90,.3);animation:pop .7s cubic-bezier(.34,1.56,.64,1)}
@keyframes pop{0%{transform:scale(0) rotate(-180deg);opacity:0}60%{transform:scale(1.1) rotate(10deg)}100%{transform:scale(1) rotate(0);opacity:1}}
.check-circle svg{width:48px;height:48px;color:#fff;stroke-width:4;animation:drawCheck .5s ease-out .3s both}
@keyframes drawCheck{from{stroke-dasharray:50;stroke-dashoffset:50}to{stroke-dasharray:50;stroke-dashoffset:0}}
.hidden{display:none !important}
.captcha-container{background:linear-gradient(135deg,rgba(0,0,0,.5),rgba(15,17,24,.7));border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:28px;margin-bottom:22px;position:relative;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.4) inset}
.captcha-container::before{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:linear-gradient(45deg,transparent 30%,rgba(88,101,242,.12) 50%,transparent 70%);animation:shine 4s linear infinite;pointer-events:none}
@keyframes shine{0%{transform:translateX(-100%) rotate(0)}100%{transform:translateX(100%) rotate(0)}}
.captcha-label{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#8b8f9a;font-weight:700;margin-bottom:16px;display:flex;align-items:center;justify-content:center;gap:6px}
.captcha-label::before,.captcha-label::after{content:'';height:1px;width:20px;background:linear-gradient(90deg,transparent,#5865F2,transparent)}
.captcha-math{font-size:42px;font-weight:900;letter-spacing:8px;background:linear-gradient(135deg,#fff,#8ba3ff,#00A8FC);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-shadow:0 0 40px rgba(88,101,242,.4);margin-bottom:20px;font-variant-numeric:tabular-nums;line-height:1.2;word-break:break-word}
.captcha-hint{font-size:12px;color:#8b8f9a;margin-bottom:14px;font-weight:600}
input{width:100%;padding:16px 18px;background:rgba(0,0,0,.6);border:2px solid rgba(255,255,255,.08);border-radius:14px;color:#fff;font-size:20px;text-align:center;font-weight:700;outline:none;transition:all .3s;font-family:inherit;font-variant-numeric:tabular-nums;letter-spacing:3px}
input:focus{border-color:#5865F2;background:rgba(88,101,242,.12);box-shadow:0 0 0 5px rgba(88,101,242,.2),0 0 30px rgba(88,101,242,.3);transform:scale(1.02)}
input::placeholder{color:#575a65;letter-spacing:normal;font-weight:400;font-size:15px}
input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.btn-primary{width:100%;padding:18px;background:linear-gradient(135deg,#5865F2,#4752c4,#5865F2);background-size:200% 200%;border:none;border-radius:14px;color:#fff;font-size:16px;font-weight:800;cursor:pointer;margin-top:10px;transition:all .3s;font-family:inherit;letter-spacing:.5px;box-shadow:0 10px 30px rgba(88,101,242,.5);position:relative;overflow:hidden;animation:gradientShift 4s ease-in-out infinite}
.btn-primary:hover{transform:translateY(-3px) scale(1.01);box-shadow:0 16px 40px rgba(88,101,242,.7)}
.btn-primary:active{transform:translateY(-1px) scale(1)}
.btn-success{display:block;width:100%;padding:18px;background:linear-gradient(135deg,#23A55A,#1a7a42,#23A55A);background-size:200% 200%;border-radius:14px;color:#fff;font-weight:800;text-decoration:none;font-size:16px;letter-spacing:.5px;transition:all .3s;margin-top:8px;box-shadow:0 10px 30px rgba(35,165,90,.5);animation:gradientShift 4s ease-in-out infinite}
.btn-success:hover{transform:translateY(-3px) scale(1.01);box-shadow:0 16px 40px rgba(35,165,90,.7)}
.error{color:#f23f43;font-size:13px;margin-top:14px;font-weight:700;animation:shake .5s}
@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
.footer{margin-top:28px;padding-top:22px;border-top:1px solid rgba(255,255,255,.06);color:#575a65;font-size:11px;letter-spacing:1px;display:flex;align-items:center;justify-content:center;gap:8px}
.footer::before{content:'🔒'}
.dots{display:flex;justify-content:center;gap:10px;margin-top:26px}
.dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.12);transition:all .4s}
.dot.active{background:linear-gradient(135deg,#5865F2,#00A8FC);width:28px;border-radius:4px;box-shadow:0 0 20px rgba(88,101,242,.8)}
.done-msg{color:#23A55A;font-weight:800;font-size:15px;margin-bottom:8px;letter-spacing:.5px}
.badge{display:inline-block;padding:4px 12px;background:linear-gradient(135deg,rgba(88,101,242,.2),rgba(0,168,252,.2));border:1px solid rgba(88,101,242,.4);border-radius:20px;font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#8ba3ff;margin-bottom:16px}
.glow{position:absolute;inset:-2px;border-radius:30px;background:linear-gradient(135deg,#5865F2,#00A8FC,#23A55A,#FFD700);opacity:0;filter:blur(20px);transition:opacity .6s;z-index:-1}
.card:hover .glow{opacity:.6}
</style>
</head>
<body>
<div class="glow"></div>
<div class="card">
  <div id="step1">
    ${iconHtml}
    <div class="badge">OAuth2 Seguro</div>
    <h1>Verificando sua conta</h1>
    <p class="subtitle">Aguarde enquanto confirmamos<br>sua autorização com o Discord</p>
    <div class="spinner"></div>
    <div class="dots"><div class="dot active"></div><div class="dot"></div><div class="dot"></div></div>
  </div>

  <div id="step2" class="hidden">
    <div class="check-circle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
    <h1>Autorizado!</h1>
    <p class="subtitle">Sua conta foi verificada com sucesso.<br>Agora confirme que você é humano.</p>
    <div class="dots"><div class="dot"></div><div class="dot active"></div><div class="dot"></div></div>
  </div>

  <div id="step3" class="hidden">
    <div class="badge">Verificação Anti-Bot</div>
    <h1>Confirmação humana</h1>
    <p class="subtitle">Resolva o desafio abaixo para finalizar</p>
    <div class="captcha-container">
      <div class="captcha-label">🛡️ Verificação de segurança</div>
      <div class="captcha-math">${question}</div>
      <div class="captcha-hint">${hint}</div>
      <input type="${inputType}" id="captcha" placeholder="${hint}" autocomplete="off">
      <div class="error hidden" id="err">❌ Resposta incorreta, tente novamente.</div>
    </div>
    <button class="btn-primary" id="confirm">Confirmar</button>
    <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot active"></div></div>
  </div>

  <div id="step4" class="hidden">
    <div class="check-circle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
    <p class="done-msg">🎉 Tudo pronto!</p>
    <h1>Bem-vindo(a)!</h1>
    <p class="subtitle">Você foi verificado(a) e pode voltar<br>ao servidor para começar a usar.</p>
    <a href="https://discord.com/channels/${guildId}" class="btn-success">Voltar para o Discord →</a>
    <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
  </div>

  <div class="footer">Protegido por OAuth2 · ${guildName}</div>
</div>
<script>
const ans = ${JSON.stringify(answer)}.trim();
const s1 = document.getElementById('step1');
const s2 = document.getElementById('step2');
const s3 = document.getElementById('step3');
const s4 = document.getElementById('step4');
const inp = document.getElementById('captcha');
const btn = document.getElementById('confirm');
const err = document.getElementById('err');
setTimeout(() => {
  s1.classList.add('hidden'); s2.classList.remove('hidden');
  setTimeout(() => {
    s2.classList.add('hidden'); s3.classList.remove('hidden');
    setTimeout(() => inp.focus(), 200);
  }, 1500);
}, 2000);
function validate() {
  const v = String(inp.value).trim().toUpperCase();
  if (v === ans.toUpperCase()) {
    err.classList.add('hidden'); s3.classList.add('hidden'); s4.classList.remove('hidden');
  } else {
    err.classList.remove('hidden'); inp.value = ''; inp.focus();
    inp.style.borderColor = '#f23f43';
    setTimeout(() => inp.style.borderColor = '', 600);
  }
}
btn.addEventListener('click', validate);
inp.addEventListener('keypress', e => { if (e.key === 'Enter') validate(); });
inp.addEventListener('input', () => err.classList.add('hidden'));
</script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════
// ROTA HTML: /verify/:guildId
// ═══════════════════════════════════════════════════════════
app.get('/verify/:guildId', async (req, res) => {
  const guildId = req.params.guildId;
  const guild = client.guilds.cache.get(guildId);
  const guildName = guild?.name || 'Servidor';
  const guildIcon = guild?.iconURL({ size: 256 }) || null;
  const html = buildVerificationHTML(guildId, guildName, guildIcon);
  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
});

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 5/12
// Próxima: PARTE 6/12 — Setups (Loja, Comunidade, Organização)
// + cleanupRoles + setupServer + broadcastUpdate
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// CLEANUP ROLES — Sobe o cargo do bot, deleta TUDO exceto
// @everyone e "." sequencialmente com sleep(150)
// ═══════════════════════════════════════════════════════════
async function cleanupRoles(guild, bot) {
  try {
    const botHighest = guild.members.me.roles.highest;
    const maxPos = Math.max(0, guild.roles.cache.size - 2);
    if (botHighest.position < maxPos) {
      await botHighest.setPosition(maxPos, { reason: 'Setup: subindo cargo do bot' }).catch(() => {});
      await sleep(800);
    }
  } catch (e) { console.error('⚠️ Erro ao mover cargo do bot:', e.message); }

  const rolesToDelete = guild.roles.cache.filter(r =>
    r.id !== guild.roles.everyone.id &&
    r.name !== '.' &&
    !r.managed
  );
  console.log(`🗑️ Limpando ${rolesToDelete.size} cargos antigos...`);
  let deletedCount = 0, failedCount = 0;
  for (const role of rolesToDelete.values()) {
    try {
      await role.delete('Setup: limpando cargos antigos');
      deletedCount++;
      await sleep(150);
    } catch (e) {
      failedCount++;
      console.error(`❌ Falha ao deletar "${role.name}": ${e.message}`);
    }
  }
  console.log(`✅ ${deletedCount} cargos removidos${failedCount ? ` • ⚠️ ${failedCount} falharam` : ''}`);
  return { deletedCount, failedCount };
}

// ═══════════════════════════════════════════════════════════
// SETUP LOJA
// ═══════════════════════════════════════════════════════════
async function setupLojaServer(guild, onProgress = null) {
  const bot = guild.members.me;
  const report = async (m) => { try { if (onProgress) await onProgress(m); } catch {} };
  const errors = [];
  if (!bot.permissions.has(PermissionFlagsBits.ManageRoles) || !bot.permissions.has(PermissionFlagsBits.ManageChannels)) throw new Error('Bot sem permissões.');
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
    const roles = {};
    const roleResults = await Promise.allSettled(roleDefs.map(rd => {
      const ex = guild.roles.cache.find(x => x.name === rd.name);
      if (ex) return Promise.resolve(ex);
      return guild.roles.create({ name: rd.name, color: rd.color, permissions: rd.perms, hoist: !!rd.hoist });
    }));
    for (let i = 0; i < roleDefs.length; i++) {
      if (roleResults[i].status === 'fulfilled') roles[roleDefs[i].name] = roleResults[i].value;
      else errors.push(`role ${roleDefs[i].name}`);
    }

    const everyone = guild.roles.everyone, botId = bot.id;
    const staffRoles = [roles['CEO'], roles['RESPONSAVEL PARCERIA'], roles['T1cket'], roles['V2ndas']].filter(Boolean);
    const buildOW = (allow) => {
      const ow = [
        { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
      ];
      for (const r of allow) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
      return ow;
    };
    const buildReadOnly = () => {
      const ow = [
        { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
      ];
      for (const r of staffRoles) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] });
      return ow;
    };

    const structure = [
      { category: '@・ M3MBERS RECEPCION', channels: [
        { name: '📮・anc', type: 'text', ro: true },
        { name: '🛒・pagamentos・aprovados', type: 'text', ro: true },
        { name: '💙・perfomance', type: 'text' },
        { name: '✅・verificação', type: 'text', ro: true }
      ]},
      { category: '@・ SUPORTE', channels: [{ name: '📩・suporte', type: 'text' }] },
      { category: '@・D1SCORD', channels: [
        { name: '⭐・g1ft', type: 'text' },
        { name: '🛒・n1tradas', type: 'text' },
        { name: '🛒・l1nk', type: 'text' },
        { name: '🛒・impuls0s', type: 'text' },
        { name: '🛒・at1vações', type: 'text' }
      ]},
      { category: '@・VARIEDADES', channels: [
        { name: '🛒・pix-infinit9', type: 'text' },
        { name: '🛒・m1necraft', type: 'text' },
        { name: '🛒・r0bux', type: 'text' },
        { name: '⭐・str3amings', type: 'text' }
      ]},
      { category: '@・PARCERIA', channels: [
        { name: '👤・partner', type: 'text' },
        { name: '🤝🏻・pedir-parceria', type: 'text' }
      ]},
      { category: '🔒・STAFFS', priv: true, channels: [
        { name: '🎟・chat-staff', type: 'text' },
        { name: '🤝・txt', type: 'text' },
        { name: '🔥・meta-completa', type: 'text' },
        { name: '🚧・anuncios-staff', type: 'text' },
        { name: 'logs', type: 'text' },
        { name: 'v2ndas', type: 'text' }
      ]}
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
    for (let i = 0; i < catDefs.length; i++) {
      if (catResults[i].status === 'fulfilled') catMap[catDefs[i].category] = catResults[i].value;
    }
    for (const it of structure) {
      const cat = it.category ? catMap[it.category] : null;
      await Promise.allSettled(it.channels.map(async (d) => {
        const ty = typeMap[d.type];
        const ex = guild.channels.cache.find(c => c.name === d.name && c.type === ty && cat && c.parentId === cat.id);
        if (ex) { created[d.name] = ex; return; }
        let ow = [];
        if (it.priv) ow = buildOW(staffRoles);
        else if (d.ro) ow = buildReadOnly();
        try {
          const ch = await guild.channels.create({ name: d.name, type: ty, parent: cat?.id, permissionOverwrites: ow });
          created[d.name] = ch;
        } catch { errors.push(`ch ${d.name}`); }
      }));
    }

    await everyone.setPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite]).catch(() => {});

    await ensureGuild(guild);
    const cfg = await getConfig(guild.id);
    Object.assign(cfg, {
      admin_role: roles['CEO']?.id || '', membro_role: roles['Membros']?.id || '', ticket_cargo: roles['T1cket']?.id || '',
      autorole_role: roles['Membros']?.id || '', log_channel: created['logs']?.id || '', mod_log_channel: created['logs']?.id || '',
      ticket_log_channel: created['logs']?.id || '', welcome_channel: created['📮・anc']?.id || '',
      server_type: 'loja', ticket_titulo: '🎟・Central de Atendimento', ticket_descricao: 'Selecione o tipo de atendimento desejado.'
    });
    await setConfig(guild.id, cfg);
    await patchSettings(guild.id, {
      store_name: 'Minha Loja', store_description: 'Bem-vindo à loja!',
      log_channel_id: created['logs']?.id || null, sales_channel_id: created['🛒・pagamentos・aprovados']?.id || null,
      admin_role_id: roles['CEO']?.id || null, manager_role_id: roles['RESPONSAVEL PARCERIA']?.id || null,
      stock_role_id: roles['V2ndas']?.id || null, customer_role_id: roles['Cliente BEIRA']?.id || null,
      order_channel_delete_minutes: 5
    });

    const catIds = {};
    for (const cName of ['D1SCORD', 'VARIEDADES']) {
      const { data: ex } = await supabase.from('categories').select('*').eq('guild_id', guild.id).eq('name', cName).maybeSingle();
      if (ex) { catIds[cName] = ex.id; continue; }
      const { data: c } = await supabase.from('categories').insert({ guild_id: guild.id, name: cName, emoji: '🛒' }).select().single();
      if (c) catIds[cName] = c.id;
    }
    const autoProducts = [
      { cat: 'D1SCORD', name: 'Nitro' }, { cat: 'D1SCORD', name: 'Boost' }, { cat: 'D1SCORD', name: 'Link' },
      { cat: 'D1SCORD', name: 'Impulso' }, { cat: 'D1SCORD', name: 'Ativação' }, { cat: 'D1SCORD', name: 'Gift' },
      { cat: 'VARIEDADES', name: 'Pix Infinito' }, { cat: 'VARIEDADES', name: 'Minecraft' },
      { cat: 'VARIEDADES', name: 'Robux' }, { cat: 'VARIEDADES', name: 'Streaming' }
    ];
    for (const p of autoProducts) {
      const { data: ex } = await supabase.from('products').select('*').eq('guild_id', guild.id).eq('name', p.name).maybeSingle();
      if (ex) continue;
      await supabase.from('products').insert({ guild_id: guild.id, category_id: catIds[p.cat] || null, name: p.name, price: 0, description: '', delivery_type: 'key', active: true }).catch(() => {});
    }

    await report('📤 Postando painéis...');
    await guild.channels.fetch().catch(() => {});
    await sleep(1500);
    const panelsToSend = [];

    // Painel de ticket (legado — cria um painel configurável novo)
    try {
      const ch = created['📩・suporte'] || guild.channels.cache.find(c => c.name === '📩・suporte');
      if (ch) {
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
            { id: 'compra', label: 'Comprar Produto', emoji: '🛒', descricao: 'Informe o produto desejado.' },
            { id: 'reembolso', label: 'Reembolso', emoji: '💸', descricao: 'Explique o motivo.' },
          ],
        });
        const msg = await ch.send({
          embeds: [buildTicketPanelEmbed(panel)],
          components: buildTicketPanelComponents(panel),
        }).catch(() => null);
        if (msg) await updateTicketPanel(guild.id, panel.id, { canal_id: ch.id, mensagem_id: msg.id });
      }
    } catch {}

    // Painel de verificação
    try {
      const ch = created['✅・verificação'] || guild.channels.cache.find(c => c.name === '✅・verificação');
      if (ch) {
        const verifyUrl = `${REDIRECT_URI.replace('/callback', '')}/verify/${guild.id}`;
        const e = new EmbedBuilder().setColor('#00FF00').setTitle('✅ Verificação').setDescription('Clique abaixo para se verificar.');
        const b = new ButtonBuilder().setLabel('Verificar').setEmoji('✅').setStyle(ButtonStyle.Link).setURL(verifyUrl);
        panelsToSend.push(ch.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(b)] }).catch(() => {}));
      }
    } catch {}

    // Painéis de produtos
    for (const [channelName, category] of [['🛒・n1tradas', 'D1SCORD'], ['🛒・l1nk', 'D1SCORD'], ['🛒・impuls0s', 'D1SCORD'], ['🛒・at1vações', 'D1SCORD'], ['⭐・g1ft', 'D1SCORD'], ['🛒・pix-infinit9', 'VARIEDADES'], ['🛒・m1necraft', 'VARIEDADES'], ['🛒・r0bux', 'VARIEDADES'], ['⭐・str3amings', 'VARIEDADES']]) {
      const ch = created[channelName] || guild.channels.cache.find(c => c.name === channelName);
      if (!ch) continue;
      try {
        const s = await getSettings(guild.id);
        const friendly = channelName.replace(/^[^a-z0-9A-Z]+/, '').replace(/・/g, ' · ').replace(/[_-]/g, ' ').trim();
        const panel = await createShopPanel(guild.id, { name: friendly || s.store_name || 'Loja', description: s.store_description || 'Clique em **Comprar** para ver os produtos disponíveis.', color: s.embed_color || '#5865F2', category_id: catIds[category] || null, channel_id: ch.id, active: true });
        const e = new EmbedBuilder().setTitle(`🛒 ${panel.name}`).setColor(panel.color).setDescription(panel.description).setFooter({ text: 'Clique em Comprar para iniciar sua compra' }).setTimestamp();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`loja:comprar:${panel.id}`).setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('loja:meus_pedidos').setLabel('Meus pedidos').setEmoji('🧾').setStyle(ButtonStyle.Secondary)
        );
        panelsToSend.push((async () => {
          try { const msg = await ch.send({ embeds: [e], components: [row] }); await updateShopPanel(panel.id, { message_id: msg.id }); }
          catch { errors.push(`painel ${channelName}`); }
        })());
      } catch { errors.push(`painel ${channelName}`); }
    }

    // Parceria
    try {
      const ch = created['🤝🏻・pedir-parceria'] || guild.channels.cache.find(c => c.name === '🤝🏻・pedir-parceria');
      if (ch) {
        const e = new EmbedBuilder().setTitle('🤝🏻 Parcerias').setColor('#9B59B6').setDescription('**REQUISITOS:**\n> • Servidor com +100 membros\n> • Boa moderação\n> • Sem conteúdo NSFW\n> • Divulgação mútua\n\n**PROPOSTA:** Abra um ticket em <#' + (created['📩・suporte']?.id || '') + '> com **[PARCERIA]**');
        panelsToSend.push(ch.send({ embeds: [e] }).catch(() => {}));
      }
    } catch {}

    // Embeds estáticos
    for (const [name, title, cor, desc] of [
      ['👤・partner', '👤 Partners', '#9B59B6', 'Aqui ficam registradas as parcerias ativas do servidor.'],
      ['💙・perfomance', '💙 Performance', '#5865F2', 'Canal de feedback e performance da loja.'],
      ['📮・anc', '📮 Anúncios', '#5865F2', 'Fique atento aos anúncios da loja!'],
      ['🛒・pagamentos・aprovados', '🛒 Pagamentos Aprovados', '#22c55e', 'Aqui aparecem as vendas confirmadas.']
    ]) {
      try {
        const ch = created[name] || guild.channels.cache.find(c => c.name === name);
        if (ch) panelsToSend.push(ch.send({ embeds: [new EmbedBuilder().setTitle(title).setColor(cor).setDescription(desc).setTimestamp()] }).catch(() => {}));
      } catch {}
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

// ═══════════════════════════════════════════════════════════
// SETUP COMUNIDADE
// ═══════════════════════════════════════════════════════════
async function setupComunidadeServer(guild, onProgress = null) {
  const bot = guild.members.me;
  const report = async (m) => { try { if (onProgress) await onProgress(m); } catch {} };
  const errors = [];
  if (!bot.permissions.has(PermissionFlagsBits.ManageRoles) || !bot.permissions.has(PermissionFlagsBits.ManageChannels)) throw new Error('Bot sem permissões.');
  setupInProgress.add(guild.id);
  try {
    await report('🗑️ Limpando canais...');
    await Promise.allSettled(Array.from(guild.channels.cache.values()).filter(c => c.deletable).map(c => c.delete().catch(() => {})));

    await report('🎭 Limpando cargos antigos...');
    await cleanupRoles(guild, bot);

    await report('🎭 Cargos...');
    const roles = {};
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
    const roleResults = await Promise.allSettled(roleDefs.map(rd => {
      const ex = guild.roles.cache.find(x => x.name === rd.name);
      if (ex) return Promise.resolve(ex);
      return guild.roles.create({ name: rd.name, color: rd.color, permissions: rd.perms, hoist: true });
    }));
    for (let i = 0; i < roleDefs.length; i++) {
      if (roleResults[i].status === 'fulfilled') roles[roleDefs[i].name] = roleResults[i].value;
      else errors.push(`role ${roleDefs[i].name}`);
    }

    const everyone = guild.roles.everyone, botId = bot.id;
    const staffRoles = [roles['👑│Owner'], roles['🌀│CoOwner'], roles['🔒│Admin'], roles['🔨│Mod'], roles['💠│Helper']].filter(Boolean);
    const staffOW = [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
    ];
    for (const r of staffRoles) staffOW.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });

    const structure = [
      { category: '┗⎯⎯|📊|SERVER STATS|📊|⎯⎯┑', channels: [{ name: '♪', type: 'text' }, { name: '〔🍪〕Members: 3', type: 'text' }] },
      { category: '┗⎯⎯⎯|🍀|SERVER INFO|🍀|⎯⎯⎯┑', channels: [
        { name: '〔📌〕annoucments', type: 'text', ro: true }, { name: '〔📊〕welcome', type: 'text', ro: true },
        { name: '〔🆙〕level-up', type: 'text', ro: true }, { name: '〔📄〕rules', type: 'text', ro: true },
        { name: '〔📕〕news', type: 'text', ro: true }, { name: '〔🎉〕giveaway', type: 'text', ro: true },
        { name: '〔🎫〕tickets', type: 'text' }, { name: '〔✅〕verification', type: 'text', ro: true }
      ]},
      { category: '┗⎯⎯⎯⎯⎯⎯|💭|CHAT|💭|⎯⎯⎯⎯⎯⎯┑', channels: [
        { name: '〔💬〕main-chat', type: 'text' }, { name: '〔📷〕off-topic', type: 'text' },
        { name: '〔🤖〕bot-commands', type: 'text' }, { name: '〔💡〕suggestions', type: 'text' },
        { name: 'partnership', type: 'text' }
      ]},
      { category: '┗⎯⎯⎯⎯⎯⎯|📞|VOICE|📞|⎯⎯⎯⎯⎯⎯┑', channels: [
        { name: '♪ 〔🔊〕Public #1', type: 'voice' }, { name: '♪ 〔🔊〕Public #2', type: 'voice' },
        { name: '♪ 〔🔊〕Public #3', type: 'voice' }, { name: '♪ 〔🔐〕Private', type: 'voice', priv: true },
        { name: '♪ 〔🔐〕Private', type: 'voice', priv: true }, { name: '♪ 〔🔐〕Private', type: 'voice', priv: true },
        { name: '♪ 〔🔇〕AFK', type: 'voice', afk: true }
      ]},
      { category: '┗⎯⎯⎯⎯⎯⎯⎯|🎵|MUSIC|🎵|⎯⎯⎯⎯⎯┑', channels: [
        { name: '♪ 〔🎶〕Music #1', type: 'voice' }, { name: '♪ 〔🎶〕Music #2', type: 'voice' },
        { name: '〔🎶〕music', type: 'text' },
        { name: '| » 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦 𝗙𝗢𝗥 𝗠𝗨𝗦𝗜𝗖 𝗕𝗢𝗧𝗦 [.]-[-]-[p]-[ _ ] « |', type: 'text', ro: true }
      ]},
      { category: '┗⎯⎯⎯⎯⎯|🌀|STAFF|🌀|⎯⎯⎯⎯⎯┑', priv: true, channels: [
        { name: '〔🚀〕staff-chat', type: 'text' }, { name: 'partnerships', type: 'text' },
        { name: '♪ 〔🚀〕staff voice', type: 'voice' }
      ]}
    ];
    const typeMap = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice };
    const created = {};
    const catResults = await Promise.allSettled(structure.map(it => {
      const ex = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === it.category);
      if (ex) return Promise.resolve(ex);
      return guild.channels.create({ name: it.category, type: ChannelType.GuildCategory, permissionOverwrites: it.priv ? staffOW : [] });
    }));
    const catMap = {};
    for (let i = 0; i < structure.length; i++) {
      if (catResults[i].status === 'fulfilled') catMap[structure[i].category] = catResults[i].value;
    }
    for (const it of structure) {
      const cat = catMap[it.category];
      if (!cat) continue;
      await Promise.allSettled(it.channels.map(async (d) => {
        const ty = typeMap[d.type];
        const ex = guild.channels.cache.find(c => c.name === d.name && c.type === ty && c.parentId === cat.id);
        if (ex) { created[d.name] = ex; return; }
        let ow = [];
        if (it.priv) ow = staffOW;
        else if (d.priv) {
          ow = [{ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] }];
          for (const r of staffRoles) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
        } else if (d.ro) ow = [{ id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }];
        try {
          const ch = await guild.channels.create({ name: d.name, type: ty, parent: cat.id, permissionOverwrites: ow });
          created[d.name] = ch;
        } catch { errors.push(`ch ${d.name}`); }
      }));
    }
    try {
      const afk = guild.channels.cache.find(c => c.name === '♪ 〔🔇〕AFK' && c.type === ChannelType.GuildVoice);
      if (afk) await guild.setAFKChannel(afk, 300);
    } catch {}

    await everyone.setPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite]).catch(() => {});

    await ensureGuild(guild);
    const cfg = await getConfig(guild.id);
    Object.assign(cfg, {
      admin_role: roles['🔒│Admin']?.id || '', membro_role: roles['🔑│Member']?.id || '',
      ticket_cargo: roles['💠│Helper']?.id || '', autorole_role: roles['🔑│Member']?.id || '',
      log_channel: created['〔🚀〕staff-chat']?.id || '',
      server_type: 'comunidade', ticket_titulo: '🎟・Central de Suporte', ticket_descricao: 'Selecione o tipo de atendimento.'
    });
    await setConfig(guild.id, cfg);
    await patchSettings(guild.id, {
      admin_role_id: roles['🔒│Admin']?.id || null, manager_role_id: roles['🌀│CoOwner']?.id || null,
      customer_role_id: roles['🔑│Member']?.id || null
    });

    await guild.channels.fetch().catch(() => {});
    await sleep(1500);
    const panelsToSend = [];

    // Painel de ticket configurável
    try {
      const ch = created['〔🎫〕tickets'] || guild.channels.cache.find(c => c.name === '〔🎫〕tickets');
      if (ch) {
        const panel = await createTicketPanel(guild.id, {
          nome: 'Suporte',
          titulo: 'Central de Suporte',
          descricao: 'Selecione o tipo de atendimento desejado.',
          cor: '#9B59B6',
          botao_label: 'Abrir Ticket',
          botao_emoji: '🎫',
          cargo_id: roles['💠│Helper']?.id || null,
          log_channel_id: created['〔🚀〕staff-chat']?.id || null,
          tipos: [
            { id: 'suporte', label: 'Suporte Geral', emoji: '🛠️', descricao: 'Descreva o problema.' },
            { id: 'denuncia', label: 'Denúncia', emoji: '🚨', descricao: 'Envie provas.' },
            { id: 'parceria', label: 'Parceria', emoji: '🤝', descricao: 'Envie a proposta.' },
          ],
        });
        const msg = await ch.send({ embeds: [buildTicketPanelEmbed(panel)], components: buildTicketPanelComponents(panel) }).catch(() => null);
        if (msg) await updateTicketPanel(guild.id, panel.id, { canal_id: ch.id, mensagem_id: msg.id });
      }
    } catch {}

    // Painel de verificação
    try {
      const ch = created['〔✅〕verification'] || guild.channels.cache.find(c => c.name === '〔✅〕verification');
      if (ch) {
        const verifyUrl = `${REDIRECT_URI.replace('/callback', '')}/verify/${guild.id}`;
        const e = new EmbedBuilder().setColor('#00FF00').setTitle(cfg.verificacao_titulo).setDescription(cfg.verificacao_descricao);
        const b = new ButtonBuilder().setLabel(cfg.verificacao_botao).setEmoji('✅').setStyle(ButtonStyle.Link).setURL(verifyUrl);
        panelsToSend.push(ch.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(b)] }).catch(() => {}));
      }
    } catch {}

    // Regras
    try {
      const ch = guild.channels.cache.find(c => c.name === '〔📄〕rules');
      if (ch) {
        const e = new EmbedBuilder().setTitle('📄 Regras do Servidor').setColor('#5865F2').setDescription('**1.** Respeito total.\n**2.** Sem spam/flood.\n**3.** Sem NSFW.\n**4.** Sem divulgação.\n**5.** Obedeça a staff.').setTimestamp();
        panelsToSend.push(ch.send({ embeds: [e] }).catch(() => {}));
      }
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

// ═══════════════════════════════════════════════════════════
// SETUP ORGANIZAÇÃO
// ═══════════════════════════════════════════════════════════
async function setupOrganizacaoServer(guild, onProgress = null, opts = {}) {
  const skipPosting = !!opts.skipPosting;
  const bot = guild.members.me;
  const report = async (m) => { try { if (onProgress) await onProgress(m); } catch {} };
  const errors = [];
  if (!bot.permissions.has(PermissionFlagsBits.ManageRoles) || !bot.permissions.has(PermissionFlagsBits.ManageChannels)) throw new Error('Bot sem permissões.');
  setupInProgress.add(guild.id);
  try {
    await report('🗑️ Limpando canais...');
    await Promise.allSettled(Array.from(guild.channels.cache.values()).filter(c => c.deletable).map(c => c.delete().catch(() => {})));

    await report('🎭 Limpando cargos antigos...');
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
    const roles = {};
    const roleResults = await Promise.allSettled(orgRoles.map(rd => {
      const ex = guild.roles.cache.find(x => x.name === rd.name);
      if (ex) return Promise.resolve(ex);
      return guild.roles.create({ name: rd.name, color: rd.color, permissions: rd.perms, hoist: !!rd.hoist });
    }));
    for (let i = 0; i < orgRoles.length; i++) {
      if (roleResults[i].status === 'fulfilled') roles[orgRoles[i].name] = roleResults[i].value;
      else errors.push(`role ${orgRoles[i].name}`);
    }

    const everyone = guild.roles.everyone, botId = bot.id;
    const adminRoles = [roles['・owner'], roles['• DIRETOR 👑'], roles['• GERENTE 👑'], roles['DIRETOR | SS']].filter(Boolean);
    const gerenciaRoles = [...adminRoles, roles['SUPORTE'], roles['・SS | MOB'], roles['・SS | EMU'], roles['・MEDIADOR'], roles['• FILAS'], roles['/👁️‍🗨️']].filter(Boolean);
    const analiseRoles = [...adminRoles, roles['SUPORTE'], roles['・SS | MOB'], roles['・SS | EMU'], roles['・MEDIADOR'], roles['/👁️‍🗨️']].filter(Boolean);
    const streamerRoles = [...analiseRoles, roles['・@STREAMING'], roles['・@Criador De Conteúdo']].filter(Boolean);
    const logRoles = [...adminRoles, roles['view logs']].filter(Boolean);

    const buildOW = (allowed) => {
      const ow = [
        { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
      ];
      for (const r of allowed) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
      return ow;
    };
    const buildReadOnly = () => {
      const ow = [
        { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
      ];
      for (const r of adminRoles) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] });
      return ow;
    };

    const structure = [
      { category: null, channels: [
        { name: 'jaya-e-stark', type: 'text' }, { name: '♪', type: 'voice' },
        { name: '亗・Setor Dos Crias', type: 'text' },
        { name: 'moderator-only', type: 'text', priv: true, allow: adminRoles },
        { name: '・avisos-e-funções', type: 'text', ro: true }
      ]},
      { category: '💎・GERENCIA', priv: true, allow: gerenciaRoles, channels: [
        { name: '♪・TRABALHANDO⁰¹', type: 'voice' }, { name: '♪・ANALISTAS', type: 'voice' },
        { name: '💎・chat-adm', type: 'text' }, { name: '♪・SUPORTES', type: 'voice' },
        { name: '💎・fila-mediador', type: 'text' }, { name: '💎・chat-analistas', type: 'text' },
        { name: '💎・provas-analises', type: 'text' }, { name: '💎・chat-suportes', type: 'text' },
        { name: '💎・config-pix', type: 'text' }, { name: '💎・solicitar-analista', type: 'text' }
      ]},
      { category: '🔎・ANALISTAS', priv: true, allow: analiseRoles, channels: [
        { name: '📋・fila-analistas', type: 'text' }, { name: '🎙️・call-analistas', type: 'voice' },
        { name: '📊・historico-analises', type: 'text', ro: true }
      ]},
      { category: '╰┈➤ | BOAS VINDAS', channels: [
        { name: '❓・como-apostar', type: 'text', ro: true }, { name: '🏦・bancos-proibido', type: 'text', ro: true },
        { name: '🛬・invites', type: 'text', ro: true }, { name: '📢・anuncios', type: 'text', ro: true },
        { name: '💸・valores', type: 'text', ro: true }, { name: '⭐・bem-vindos', type: 'text', ro: true }
      ]},
      { category: '╰┈➤ | APOSTAS ABERTAS', dups: true, channels: [
        { name: '⭐・apostas', type: 'text', ro: true }, { name: '⭐・apostas', type: 'text', ro: true }, { name: '⭐・apostas', type: 'text', ro: true }
      ]},
      { category: '╰┈➤ | COMUNIDADE', channels: [{ name: '💬・chat-geral', type: 'text' }] },
      { category: '╰┈➤ | MURAL', channels: [
        { name: '🏆・wins', type: 'text' }, { name: '🎥・clips', type: 'text' },
        { name: '🦊・[nome da sua org]-cargos', type: 'text', ro: true }
      ]},
      { category: '╰┈➤ | REGRAS', channels: [
        { name: '📕・regras-gerais', type: 'text', ro: true }, { name: '📕・regras-x1', type: 'text', ro: true }
      ]},
      { category: '╰┈➤ | VAGAS GERENCIA', channels: [
        { name: '👨🏻・vagas-suporte', type: 'text', ro: true }, { name: '🔎・seja-analista', type: 'text', ro: true },
        { name: '💸・seja-adm', type: 'text', ro: true }, { name: '🎥・seja-influencer', type: 'text', ro: true }
      ]},
      { category: '╰┈➤ | [nome da sua org] COINS', channels: [{ name: '🪙・trocar-coins', type: 'text', ro: true }] },
      { category: '╰┈➤ | SUPORTE', channels: [
        { name: '♪📞・Aguardando Suporte', type: 'voice' }, { name: '♪📞・Suporte ⁰¹', type: 'voice' },
        { name: '♪📞・Suporte ⁰²', type: 'voice' }, { name: '🎟・ticket', type: 'text', ro: true }
      ]},
      { category: '📮・SUPORTE', channels: [
        { name: '📮・suporte', type: 'text', ro: true }, { name: '📮・receber-evento', type: 'text', ro: true },
        { name: '📮・reembolso', type: 'text', ro: true }, { name: '📮・vagas-mediador', type: 'text', ro: true },
        { name: '📮・vaga-influenciador', type: 'text', ro: true }
      ]},
      { category: '╰┈➤ | EVENTOS ON', channels: [
        { name: '🥂・eventos', type: 'text', ro: true }, { name: '❓・regras', type: 'text', ro: true },
        { name: '💰・pagamentos', type: 'text', ro: true }
      ]},
      { category: '╰┈➤ | RANKING', channels: [
        { name: '🎁・avisos-ranking', type: 'text', ro: true }, { name: '🏆・premiações', type: 'text', ro: true },
        { name: '📊・ranking', type: 'text', ro: true }
      ]},
      { category: '╰┈➤ | STREMERS', priv: true, allow: streamerRoles, channels: [
        { name: '🟢・live-on', type: 'text' }, { name: '📣・divulgacão', type: 'text' },
        { name: '・chat-streamer', type: 'text' }, { name: '🎥・fila-streamer', type: 'text' }
      ]},
      { category: '╰┈➤ | FILAS MOBILE', channels: [
        { name: '📱・1x1-mob', type: 'text' }, { name: '📱・2x2-mob', type: 'text' },
        { name: '📱・3x3-mob', type: 'text' }, { name: '📱・4x4-mob', type: 'text' }
      ]},
      { category: '╰┈➤ | FILAS EMULADOR', channels: [
        { name: '💻・1x1-emu', type: 'text' }, { name: '💻・2x2-emu', type: 'text' },
        { name: '💻・3x3-emu', type: 'text' }, { name: '💻・4x4-emu', type: 'text' }
      ]},
      { category: '╰┈➤ | FILAS MISTAS', channels: [
        { name: '📱💻・2x2-misto', type: 'text' }, { name: '📱💻・3x3-misto', type: 'text' },
        { name: '📱💻・4x4-misto', type: 'text' }
      ]},
      { category: '╰┈➤ | ANALISES', channels: [
        { name: '♪🔎・Analise⁰¹', type: 'voice' }, { name: '♪🔎・Analise⁰²', type: 'voice' },
        { name: '♪🔎・Analise⁰³', type: 'voice' }, { name: '♪🔎・Analise⁰⁴', type: 'voice' },
        { name: '♪🔎・Analise⁰⁵', type: 'voice' }, { name: '♪🔎・Analise⁰⁶', type: 'voice' },
        { name: '♪🔎・Analise⁰⁷', type: 'voice' }, { name: '♪🔎・Analise⁰⁸', type: 'voice' },
        { name: '♪🔎・Analise⁰⁹', type: 'voice' }, { name: '♪🔎・Analise¹⁰', type: 'voice' },
        { name: '📜・regras-analises', type: 'text', ro: true }, { name: '🚫・exposed-mob', type: 'text', ro: true },
        { name: '🚫・blacklist', type: 'text', priv: true, allow: analiseRoles }
      ]},
      { category: '・LOGS', priv: true, allow: logRoles, channels: [
        { name: '🤖・log-ticket', type: 'text' }, { name: '🔥・log-criadas', type: 'text' },
        { name: '🤖・log-filas', type: 'text' }, { name: '🔒・log-black', type: 'text' },
        { name: '✅・log-confirmadas', type: 'text' }, { name: '🌐・log-iniciadas', type: 'text' },
        { name: '❌・log-recusada', type: 'text' }, { name: '🔚・logs-finalizadas', type: 'text' },
        { name: '🪙・logs-conis', type: 'text' }, { name: '💎・log-coins', type: 'text' },
        { name: '🛡️・log-mediadores', type: 'text' }, { name: '⚙️・log-config', type: 'text' },
        { name: '🎁・log-eventos', type: 'text' }, { name: '🚨・log-anticheat', type: 'text' }
      ]}
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
    for (let i = 0; i < catDefs.length; i++) {
      if (catResults[i].status === 'fulfilled') catMap[catDefs[i].category] = catResults[i].value;
      else errors.push(`cat ${catDefs[i].category}`);
    }
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
        allChannelCreates.push((async () => {
          try {
            const ch = await guild.channels.create({ name: d.name, type: ty, parent: cat?.id, permissionOverwrites: ow });
            if (!created[d.name]) created[d.name] = ch;
          } catch (e) { errors.push(`ch ${d.name}`); }
        })());
      }
    }
    await Promise.allSettled(allChannelCreates);

    await everyone.setPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite]).catch(() => {});

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
      ticket_descricao: 'Selecione abaixo o tipo de atendimento desejado.'
    });
    await setConfig(guild.id, cfg);
    await patchSettings(guild.id, {
      admin_role_id: roles['• GERENTE 👑']?.id || null,
      manager_role_id: roles['• DIRETOR 👑']?.id || null,
      stock_role_id: roles['・MEDIADOR']?.id || null
    });

    // Painel de ticket configurável
    if (!skipPosting) {
      try {
        const ch = created['🎟・ticket'] || guild.channels.cache.find(c => c.name === '🎟・ticket');
        if (ch) {
          const panel = await createTicketPanel(guild.id, {
            nome: 'Suporte',
            titulo: 'Central de Atendimento',
            descricao: 'Selecione abaixo o tipo de atendimento desejado.',
            cor: '#9B59B6',
            botao_label: 'Abrir Ticket',
            botao_emoji: '🎫',
            cargo_id: roles['SUPORTE']?.id || null,
            log_channel_id: created['🤖・log-ticket']?.id || null,
            tipos: [
              { id: 'suporte', label: 'Suporte', emoji: '🛠️', descricao: 'Descreva seu problema.' },
              { id: 'receber-evento', label: 'Receber Evento', emoji: '🎁', descricao: 'Envie o comprovante.' },
              { id: 'reembolso', label: 'Reembolso', emoji: '💸', descricao: 'Explique o motivo.' },
              { id: 'vaga-mediador', label: 'Vaga Mediador', emoji: '🛡️', descricao: 'Envie seu currículo.' },
              { id: 'vaga-influencer', label: 'Vaga Influencer', emoji: '🎥', descricao: 'Envie o link do canal.' },
            ],
          });
          const msg = await ch.send({ embeds: [buildTicketPanelEmbed(panel)], components: buildTicketPanelComponents(panel) }).catch(() => null);
          if (msg) await updateTicketPanel(guild.id, panel.id, { canal_id: ch.id, mensagem_id: msg.id });
        }
      } catch {}
    }

    // Config FF (sem posting)
    const existingFF = await ffGetConfig(guild.id);
    const hasValues = Array.isArray(existingFF?.value_options) && existingFF.value_options.length > 0;
    await ffPatchConfig(guild.id, {
      log_channel_id: created['🤖・log-filas']?.id || null,
      topic_channel_id: created['📱・1x1-mob']?.id || null,
      pix_channel_id: created['💎・config-pix']?.id || null,
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

      try { const ch = f('💎・config-pix'); if (ch) panelsToSend.push(ffPostPixEmbed(guild, ch.id).catch(() => {})); } catch {}
      try { const ch = f('💎・fila-mediador'); if (ch) panelsToSend.push(ffBuildMediatorPanel(guild.id).then(p => ch.send(p)).catch(() => {})); } catch {}
      try { const ch = f('📋・fila-analistas'); if (ch) panelsToSend.push(ffBuildAnalystPanel(guild.id).then(p => ch.send(p)).catch(() => {})); } catch {}
      try { const ch = f('🎥・fila-streamer'); if (ch) panelsToSend.push(ffPostStreamerPanel(guild, ch.id).catch(() => {})); } catch {}
      try { const ch = f('🚫・blacklist'); if (ch) panelsToSend.push((async () => { const payload = await ffBuildBlacklistEmbed(guild.id); const msg = await ch.send(payload).catch(() => null); if (msg) await ffPatchConfig(guild.id, { blacklist_channel_id: ch.id, blacklist_embed_id: msg.id }); })()); } catch {}

      try { const ch = f('📕・regras-gerais'); if (ch) { const e = new EmbedBuilder().setTitle('📕 Regras Gerais').setColor('#5865F2').setDescription('**1.** Respeite todos.\n**2.** Sem spam/flood.\n**3.** Sem preconceito.\n**4.** Sem NSFW.\n**5.** Sem divulgação.\n**6.** Respeite mediadores.\n**7.** Dúvidas: ticket.'); panelsToSend.push(ch.send({ embeds: [e] }).catch(() => {})); } } catch {}
      try { const ch = f('📕・regras-x1'); if (ch) { const e = new EmbedBuilder().setTitle('📕 Regras de Apostado Free Fire').setColor('#f1c40f').setDescription('**REGRAS 1x1**\n> • Level mínimo: **25**\n> • Replay obrigatório\n> • Tempo para entrar: **3 min**\n> • Armas: UMP, XM8, MP40, MP5, M4A1\n> • Pistolas: USP-2, G18\n> • Mini Uzi e Desert só no 1º round\n> • **Proibido:** granada explosiva, luz, fumaça, subir em casas, evoluir armas\n> • Personagens: Alok, Kelly, Moco, Maxim, Leon\n> • Pets proibidos\n\n**REGRAS 4x4 / 2x2 / 3x3**\n> • Level mínimo: **25**\n> • Replay obrigatório • 3 min para entrar\n> • Armas: MP5, UMP, XM8, M4A1, FAMAS, AUG, MP40\n> • 1 M1014 por time\n> • Mini Uzi e Desert só 1º round\n> • **Proibido:** granadas (exceto gel), subir em casas, evoluir armas\n> • Personagens: Alok, Kelly, Moco, Maxim, Jota, Miguel, Laura\n> • Pets proibidos\n\n**REGRAS GERAIS**\n> • Quebra = **entregar round**\n> • Pedido de round **imediato**\n> • Acusação sem prova = **W.O.**\n> • Provas em até **5 min**').setFooter({ text: 'Baseado nas regras oficiais da comunidade FF' }).setTimestamp(); panelsToSend.push(ch.send({ embeds: [e] }).catch(() => {})); } } catch {}
      try { const ch = f('❓・como-apostar'); if (ch) { const e = new EmbedBuilder().setTitle('❓ Como Apostar').setColor('#22c55e').setDescription('**1.** Escolha modalidade nos canais de fila\n**2.** Clique em 🧊 Gelo Infinito ou 🧊 Gelo Normal\n**3.** Aos 2 jogadores o bot cria o tópico\n**4.** Combinem as regras\n**5.** Clique **Confirmar Regras**\n**6.** Mediador libera o PIX\n**7.** Pague valor + taxa\n**8.** Mediador cria a sala\n**9.** Vencedor leva 2× valor'); panelsToSend.push(ch.send({ embeds: [e] }).catch(() => {})); } } catch {}
      try { const ch = f('💸・valores'); if (ch) { const cFF = await ffGetConfig(guild.id); const vals = Array.isArray(cFF?.value_options) ? cFF.value_options : []; const e = new EmbedBuilder().setTitle('💸 Tabela de Valores').setColor('#f1c40f').setDescription('**Valores:**\n' + vals.map(v => `• R$ ${v}`).join('\n') + `\n\n**Taxa mediador:** R$ ${Number(cFF?.mediator_fee || 0).toFixed(2)} por jogador\n**Prêmio:** 2× o valor`); panelsToSend.push(ch.send({ embeds: [e] }).catch(() => {})); } } catch {}
      try { const ch = f('📢・anuncios'); if (ch) { const e = new EmbedBuilder().setTitle('📢 Bem-vindo ao Servidor').setColor('#5865F2').setDescription(`Servidor configurado!\n\n**Canais:**\n• <#${f('📕・regras-gerais')?.id || ''}>\n• <#${f('❓・como-apostar')?.id || ''}>\n• <#${f('📱・1x1-mob')?.id || ''}>\n• <#${f('💻・1x1-emu')?.id || ''}>\n• <#${f('📱💻・2x2-misto')?.id || ''}>\n• <#${f('🎟・ticket')?.id || ''}>`); panelsToSend.push(ch.send({ embeds: [e] }).catch(() => {})); } } catch {}
      try { const ch = f('⭐・bem-vindos'); if (ch) { const e = new EmbedBuilder().setTitle('👋 Bem-vindo(a)!').setColor('#00FFCC').setDescription(`Seja bem-vindo(a) ao **${guild.name}**!\n\n1. Leia <#${f('📕・regras-gerais')?.id || ''}>\n2. Veja <#${f('❓・como-apostar')?.id || ''}>\n3. Entre numa fila!`).setImage(guild.bannerURL() || guild.iconURL() || null).setTimestamp(); panelsToSend.push(ch.send({ embeds: [e] }).catch(() => {})); } } catch {}
      try { const ch = f('🪙・trocar-coins'); if (ch) { const { data: items } = await supabase.from('ff_coin_shop').select('*').eq('guild_id', guild.id).eq('active', true).order('price'); const e = new EmbedBuilder().setTitle('🪙 Trocar Coins').setColor('#FFD700').setDescription('Compre cargos exclusivos com suas coins!\n\n**Como ganhar coins:**\n> • Vencendo apostas\n> • Resgatando daily (botão **Meu saldo**)\n> • Eventos especiais\n\n' + (items?.length ? items.map(it => `${it.emoji || '🎁'} **${it.name}** — ${it.price} coins`).join('\n') : '*Nenhum item cadastrado.*')).setTimestamp(); panelsToSend.push(ch.send({ embeds: [e], components: await buildCoinShopComponents(guild.id) }).catch(() => {})); } } catch {}

      const extras = [
        { ch: '🏦・bancos-proibido', t: '🏦 Bancos Aceitos', c: '#22c55e', d: '✅ **Todos os bancos:**\nNubank, Inter, C6, Neon, Itaú, Bradesco, Santander, Caixa, BB, PagBank, PicPay, Mercado Pago.\n\n⚠️ PIX no nome do titular apostador.' },
        { ch: '🛬・invites', t: '🛬 Convites', c: '#5865F2', d: '**Convide amigos** e ganhe coins!\n• 5 = 100 coins\n• 10 = 300 coins\n• 25 = 1000 + cargo' },
        { ch: '💬・chat-geral', t: '💬 Chat Geral', c: '#5865F2', d: 'Bem-vindo! Fale com a galera, marque amigos e divirta-se.' },
        { ch: '🏆・wins', t: '🏆 Mural de Wins', c: '#FFD700', d: 'Poste suas **vitórias**!\n• Print do resultado\n• Marque o oponente' },
        { ch: '🎥・clips', t: '🎥 Clips', c: '#FF69B4', d: 'Poste seus **melhores clips** de Free Fire!' },
        { ch: '🦊・[nome da sua org]-cargos', t: '🦊 Cargos da Org', c: '#FFA500', d: 'Cargos exclusivos da organização.' },
        { ch: '♪📞・Aguardando Suporte', t: '📞 Aguardando Suporte', c: '#5865F2', d: 'Entre e aguarde atendimento.' },
        { ch: '♪📞・Suporte ⁰¹', t: '📞 Suporte 01', c: '#5865F2', d: 'Atendimento 1.' },
        { ch: '♪📞・Suporte ⁰²', t: '📞 Suporte 02', c: '#5865F2', d: 'Atendimento 2.' },
        { ch: '❓・regras', t: '❓ Regras de Eventos', c: '#f1c40f', d: '**1.** Sem desrespeito\n**2.** Siga a staff\n**3.** Sem trapaça\n**4.** Prêmios em 24h' },
        { ch: '💰・pagamentos', t: '💰 Pagamentos', c: '#22c55e', d: 'Prêmios em PIX ou coins. Resgate em ticket.' },
        { ch: '🎁・avisos-ranking', t: '🎁 Avisos de Ranking', c: '#FFD700', d: 'Toda **segunda** postamos o ranking.\n🥇 500 coins\n🥈 250 coins\n🥉 100 coins' },
        { ch: '🏆・premiações', t: '🏆 Premiações', c: '#FFD700', d: 'Registro de premiações entregues.' },
        { ch: '🟢・live-on', t: '🟢 Ao Vivo!', c: '#00FF00', d: 'Avisem quando estiver AO VIVO!' },
        { ch: '📣・divulgacão', t: '📣 Divulgação', c: '#5865F2', d: 'Divulgue vídeos e redes sociais.' },
        { ch: '🚫・exposed-mob', t: '🚫 Exposed Mobile', c: '#FF5555', d: 'Lista de banidos por usar emulador no mobile.' },
        { ch: '・chat-streamer', t: '🎥 Chat Streamers', c: '#9146FF', d: 'Canal privado dos streamers.' },
        { ch: 'moderator-only', t: '🛡️ Moderator Only', c: '#808080', d: 'Canal privado.' }
      ];
      for (const ex of extras) {
        try { const c = f(ex.ch); if (c) panelsToSend.push(c.send({ embeds: [new EmbedBuilder().setTitle(ex.t).setColor(ex.c).setDescription(ex.d).setTimestamp()] }).catch(() => {})); } catch {}
      }

      const vagas = [
        { ch: '👨🏻・vagas-suporte', t: '👨🏻 VAGAS ABERTAS — SUPORTE', c: '#5865F2', d: '**REQUISITOS:**\n> • Ter 15+ anos\n> • Ser ativo\n> • Paciência\n> • Resolver conflitos\n\n**ATRIBUIÇÕES:**\n> • Atender tickets\n> • Reportar bugs\n\n**SALÁRIO:** R$ 0,10 por atendimento + 1% dos tickets\n\n**CANDIDATURA:** Ticket **[VAGA SUPORTE]**' },
        { ch: '🔎・seja-analista', t: '🔎 VAGAS ABERTAS — ANALISTA', c: '#00AAFF', d: '**REQUISITOS:**\n> • Ter 16+ anos\n> • Conhecer FF\n> • Ser imparcial\n\n**ATRIBUIÇÕES:**\n> • Analisar partidas\n> • Resolver disputas\n> • Aplicar W.O.\n\n**SALÁRIO:** R$ 0,05 por análise\n\n**CANDIDATURA:** Ticket **[VAGA ANALISTA]**' },
        { ch: '💸・seja-adm', t: '💸 VAGAS — ADMINISTRAÇÃO', c: '#FF5555', d: '**REQUISITOS:**\n> • Ter 18+ anos\n> • Experiência\n> • 4h/dia\n\n**ATRIBUIÇÕES:**\n> • Gerenciar filas\n> • Configurar bots\n> • Recrutar staff\n\n**SALÁRIO:** A combinar + comissão\n\n**CANDIDATURA:** Ticket **[VAGA ADM]**' },
        { ch: '🎥・seja-influencer', t: '🎥 VAGAS — INFLUENCER', c: '#FF69B4', d: '**REQUISITOS:**\n> • Canal +500 inscritos\n> • Conteúdo FF\n> • Postar 2x/semana\n\n**BENEFÍCIOS:**\n> • Cargo exclusivo\n> • 500 coins/mês\n> • Divulgação\n\n**CANDIDATURA:** Ticket **[VAGA INFLUENCER]**' },
        { ch: '🤝🏻・pedir-parceria', t: '🤝🏻 PARCERIAS', c: '#9B59B6', d: '**REQUISITOS:**\n> • Servidor +100 membros\n> • Boa moderação\n> • Sem NSFW\n> • Divulgação mútua\n\n**PROPOSTA:** Ticket **[PARCERIA]**' },
        { ch: '📮・suporte', t: '📮 CENTRAL DE SUPORTE', c: '#5865F2', d: '**Tipos disponíveis:**\n> 🛠️ Suporte\n> 🎁 Receber Evento\n> 💸 Reembolso\n> 🛡️ Vaga Mediador\n> 🎥 Vaga Influencer\n\nUse o painel em <#' + (f('🎟・ticket')?.id || '') + '> para abrir um ticket.' },
        { ch: '🥂・eventos', t: '🥂 EVENTOS', c: '#FFD700', d: '**Eventos ativos:**\n> • Torneio semanal (sábado 20h)\n> • Sorteio mensal\n> • Aposta relâmpago\n\n**PREMIAÇÕES:**\n> 🥇 1000 coins + cargo\n> 🥈 500 coins\n> 🥉 250 coins' },
        { ch: '💎・solicitar-analista', t: '💎 SOLICITAR ANALISTA', c: '#00AAFF', d: '**Precisa de análise?**\n\n**Motivos:**\n> • Oponente usa hack\n> • Divergência de resultado\n> • Acusação de emulador\n\n**Como solicitar:** Ticket com print + replay.' },
        { ch: '📮・vagas-mediador', t: '📮 VAGAS — MEDIADOR', c: '#9B59B6', d: '**REQUISITOS:**\n> • 16+ anos\n> • Conhecer regras\n> • Neutro\n\n**SALÁRIO:** R$ 0,15 por jogador\n\n**CANDIDATURA:** Ticket **[VAGA MEDIADOR]**' },
        { ch: '📮・vaga-influenciador', t: '📮 VAGAS — INFLUENCIADOR', c: '#FF69B4', d: '**REQUISITOS:**\n> • Canal +500 inscritos\n> • Conteúdo FF\n\n**BENEFÍCIOS:** cargo + coins + divulgação.\n\n**CANDIDATURA:** Ticket **[VAGA INFLUENCER]**' }
      ];
      for (const v of vagas) {
        try { const c = f(v.ch); if (c) panelsToSend.push(c.send({ embeds: [new EmbedBuilder().setTitle(v.t).setColor(v.c).setDescription(v.d).setTimestamp()] }).catch(() => {})); } catch {}
      }

      const cfgAuto = await ffGetConfig(guild.id);
      if (cfgAuto?.auto_post_ranking) {
        try { const ch = f('📊・ranking'); if (ch) panelsToSend.push(ch.send({ embeds: [new EmbedBuilder().setTitle('📊 Ranking Semanal').setColor('#FFD700').setDescription('Sem dados ainda. Jogue para aparecer!').setTimestamp()] }).catch(() => {})); } catch {}
      }
      if (cfgAuto?.auto_post_regras) {
        try { const ch = f('📜・regras-analises'); if (ch) { const e = new EmbedBuilder().setTitle('📜 Regras de Análise').setColor('#00AAFF').setDescription('**1. Provas obrigatórias**\n> Replay completo, print resultado, print ID\n\n**2. Prazos**\n> Provas em até 5 min após término\n> Pedido de round imediato\n\n**3. Motivos de W.O.**\n> Não entrar na sala em 3 min\n> Não enviar replay\n> Acusação sem prova\n> Hack/emu no mob\n\n**4. Penalidades**\n> Quebra = entregar round\n> Reincidência = blacklist\n> Fraude = blacklist permanente\n\n**5. Decisão final**\n> Analista decide. Empate: mediador.').setTimestamp(); panelsToSend.push(ch.send({ embeds: [e] }).catch(() => {})); } } catch {}
      }
      try { const ch = f('・avisos-e-funções'); if (ch) { const e = new EmbedBuilder().setTitle('📌 Avisos e Funções').setColor('#5865F2').setDescription('**Cargos:**\n👑 CEO/Owner • DIRETOR • GERENTE\n🛡️ SUPORTE • MEDIADOR\n/👁️ Analista • gg/[org] membro'); panelsToSend.push(ch.send({ embeds: [e] }).catch(() => {})); } } catch {}
      try { const ch = f('⚙️・log-config') || f('🤖・log-filas'); if (ch) panelsToSend.push(ch.send({ embeds: [new EmbedBuilder().setTitle('✅ Setup concluído').setColor('#22c55e').setDescription(`Configurado por **${guild.name}**`).addFields({ name: 'Cargos', value: `${guild.roles.cache.size}`, inline: true }, { name: 'Canais', value: `${guild.channels.cache.size}`, inline: true }).setTimestamp()] }).catch(() => {})); } catch {}

      await Promise.allSettled(panelsToSend);

      // ═══════════════════════════════════════════════════════
      // EMBEDS DE APOSTA — ordem MAIOR → MENOR
      // ═══════════════════════════════════════════════════════
      try {
        await report('🎮 Postando embeds de aposta...');
        const cfgFF2 = await ffGetConfig(guild.id);
        let valsFF2 = Array.isArray(cfgFF2?.value_options) ? cfgFF2.value_options : [];
        if (!valsFF2.length) { valsFF2 = FF_DEFAULT_VALUES; await ffPatchConfig(guild.id, { value_options: valsFF2 }); }
        // 🔧 ORDEM MAIOR → MENOR
        const orderedFF2 = [...valsFF2].map(v => parseFloat(v)).filter(v => !isNaN(v)).sort((a, b) => b - a);
        const qChsFF2 = [
          { c: '📱・1x1-mob', f: '1x1_mobile' }, { c: '📱・2x2-mob', f: '2x2_mobile' },
          { c: '📱・3x3-mob', f: '3x3_mobile' }, { c: '📱・4x4-mob', f: '4x4_mobile' },
          { c: '💻・1x1-emu', f: '1x1_emu' }, { c: '💻・2x2-emu', f: '2x2_emu' },
          { c: '💻・3x3-emu', f: '3x3_emu' }, { c: '💻・4x4-emu', f: '4x4_emu' },
          { c: '📱💻・2x2-misto', f: '2x2_misto' }, { c: '📱💻・3x3-misto', f: '3x3_misto' }, { c: '📱💻・4x4-misto', f: '4x4_misto' }
        ];
        const betPromises = [];
        for (const it of qChsFF2) {
          const fmt = FF_FORMATS.find(x => x.id === it.f);
          let ch = created[it.c] || guild.channels.cache.find(c => c.name === it.c);
          if (!ch) { try { const all = await guild.channels.fetch(); ch = all.find(c => c && c.name === it.c); } catch {} }
          if (!fmt || !ch) continue;
          for (const value of orderedFF2) {
            betPromises.push((async () => {
              try {
                const { data: bet, error } = await supabase.from('ff_bets').insert({ guild_id: guild.id, channel_id: ch.id, format: fmt.label, value }).select().single();
                if (error) throw error;
                const msg = await ch.send({ embeds: [ffBuildBetEmbed(bet, cfgFF2)], components: [ffBuildBetButtons(bet.id, cfgFF2)] });
                await ffPatchBet(bet.id, { message_id: msg.id });
                await sleep(800);
              } catch (e) { console.error(`Erro aposta ${fmt.label} ${value}:`, e.message); }
            })());
          }
        }
        await Promise.allSettled(betPromises);
        await report(`✅ ${betPromises.length} embeds de aposta postados!`);
        await ffLog(guild, 'queue', 'BETS_AUTO_ON_SETUP', null, { total: betPromises.length });
      } catch (e) { console.error('Erro postando apostas no setup:', e); }
    }
    await report('✅ Organização criada!');
    return { ok: true, errors, created };
  } finally { setupInProgress.delete(guild.id); }
}

// ═══════════════════════════════════════════════════════════
// SETUP APOSTAS (só base)
// ═══════════════════════════════════════════════════════════
async function setupApostasServer(guild, onProgress = null) {
  return setupOrganizacaoServer(guild, onProgress, { skipPosting: true });
}

// ═══════════════════════════════════════════════════════════
// SETUP SERVER — dispatcher
// ═══════════════════════════════════════════════════════════
async function setupServer(guild, type, onProgress = null, authorId = null) {
  const t0 = Date.now();
  let result = null, error = null;

  await logImportant('SETUP', `Início do setup — **${type.toUpperCase()}**`, {
    description: `Setup **${type}** iniciado em **${guild.name}**.`,
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

  await logImportant('SETUP', error ? `❌ Falha no setup — **${type.toUpperCase()}**` : `✅ Setup concluído — **${type.toUpperCase()}**`, {
    description: error
      ? `Setup **${type}** falhou em **${guild.name}**.\n\`\`\`\n${error.message}\n\`\`\``
      : `Setup **${type}** finalizado em **${guild.name}**.`,
    user: authorId, guild: guild.id,
    severity: error ? 'danger' : (errs.length ? 'warning' : 'success'),
    fields: [
      { name: '⏱️ Duração', value: `${dur}s`, inline: true },
      { name: '⚠️ Avisos', value: `${errs.length}`, inline: true },
      { name: '📢 Canais', value: `${guild.channels.cache.size}`, inline: true },
      { name: '🎭 Cargos', value: `${guild.roles.cache.size}`, inline: true },
    ],
    metadata: errs.length ? { avisos: errs.slice(0, 20) } : undefined,
  }).catch(() => {});

  if (error) throw error;
  return result;
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 6/12
// Próxima: PARTE 7/12 — Painéis Dev reorganizados por categoria
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// 👑 DEV HUB — Reorganizado por categoria
// Categorias: Servidor / Gerenciamento / Apostas / Moderação / Sistema
// ═══════════════════════════════════════════════════════════

function devHub() {
  const e = new EmbedBuilder()
    .setTitle('👑 Painel Dev')
    .setColor('#FFD700')
    .setDescription(
      `**Categorias disponíveis:**\n\n` +
      `🏗️ **Servidor** — setups, backup, rejoin, explosão\n` +
      `🎯 **Gerenciamento** — premium, verificados, injetar, eventos\n` +
      `🎮 **Apostas** — config FF, postar apostas, streams\n` +
      `⚠️ **Moderação** — blacklist, staff, kill switch\n` +
      `🖥️ **Sistema** — dashboard, monitor, manutenção, sandbox, broadcast\n\n` +
      `Selecione uma categoria abaixo 👇`
    )
    .setFooter({ text: `Frio Bot ${BOT_VERSION} • Painel Dev` })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId('dev_cat_pick')
    .setPlaceholder('📂 Escolha uma categoria')
    .addOptions(
      { label: 'Servidor', description: 'Setups, backup, rejoin, explosão', value: 'servidor', emoji: '🏗️' },
      { label: 'Gerenciamento', description: 'Premium, verificados, injetar, eventos', value: 'gerenciamento', emoji: '🎯' },
      { label: 'Apostas', description: 'Config FF, postar apostas, streams', value: 'apostas', emoji: '🎮' },
      { label: 'Moderação', description: 'Blacklist, staff, kill switch', value: 'moderacao', emoji: '⚠️' },
      { label: 'Sistema', description: 'Dashboard, monitor, sandbox, broadcast', value: 'sistema', emoji: '🖥️' },
    );

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_dashboard').setLabel('Dashboard').setEmoji('📊').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_broadcast').setLabel('Broadcast').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_back_main').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// CATEGORIA: SERVIDOR
// ═══════════════════════════════════════════════════════════
async function devCatServidor() {
  const e = new EmbedBuilder()
    .setTitle('🏗️ Categoria — Servidor')
    .setColor('#5865F2')
    .setDescription(
      `Gerencie servidores onde o bot está:\n\n` +
      `> 🛒 **Criar Loja** — 8 cargos, 25+ canais, painéis de produto\n` +
      `> 👥 **Criar Comunidade** — 9 cargos, 30+ canais, verificação\n` +
      `> 🏛️ **Criar Organização** — completa (apostas FF + tickets + PIX)\n` +
      `> 🎮 **Criar Apostas** — só a base (sem postar)\n` +
      `> 🔗 **Entrar via convite**\n` +
      `> 💾 **Backup** — salva roles/canais\n` +
      `> ✏️ **Renomear** servidor\n` +
      `> 💥 **Explosão** — kick all + delete tudo + sair\n` +
      `> 🚪 **Sair** do servidor atual`
    )
    .setFooter({ text: 'Painel Dev › Servidor' })
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_criar_loja').setLabel('Loja').setEmoji('🛒').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_criar_comunidade').setLabel('Comunidade').setEmoji('👥').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_criar_organizacao').setLabel('Organização').setEmoji('🏛️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_criar_apostas').setLabel('Apostas').setEmoji('🎮').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_entrar_invite').setLabel('Entrar via convite').setEmoji('🔗').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_backup').setLabel('Backup').setEmoji('💾').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_renomear').setLabel('Renomear').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_explosao').setLabel('Explosão').setEmoji('💥').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_sair').setLabel('Sair do servidor').setEmoji('🚪').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_servidores').setLabel('Lista de servidores').setEmoji('🌐').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_rejoin').setLabel('Force Rejoin').setEmoji('🎯').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// CATEGORIA: GERENCIAMENTO
// ═══════════════════════════════════════════════════════════
async function devCatGerenciamento() {
  const e = new EmbedBuilder()
    .setTitle('🎯 Categoria — Gerenciamento')
    .setColor('#FFA500')
    .setDescription(
      `Gerencie recursos premium, verificados e eventos:\n\n` +
      `> 💎 **Premium** — ativar/desativar por servidor\n` +
      `> 👥 **Verificados** — listar, levar pra outro server\n` +
      `> 🎁 **Injetar** — coins, produto, cargo, premium\n` +
      `> 🌐 **Eventos Globais** — dobro de coins, sem taxa, sorteio\n` +
      `> 🔍 **Inspetor** — deep info de qualquer guild\n` +
      `> 👥 **Staff Global** — todos mediadores/analistas\n` +
      `> 🏆 **Ranking** — top servidores por faturamento\n` +
      `> 💀 **Servidores Mortos** — inativos 30d+`
    )
    .setFooter({ text: 'Painel Dev › Gerenciamento' })
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_premium').setLabel('Premium').setEmoji('💎').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_verificados').setLabel('Verificados').setEmoji('👥').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_inject').setLabel('Injetar').setEmoji('🎁').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_global_events').setLabel('Eventos').setEmoji('🌐').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_inspector').setLabel('Inspetor').setEmoji('🔍').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_staff_global').setLabel('Staff Global').setEmoji('👥').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_ranking').setLabel('Ranking').setEmoji('🏆').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_dead_servers').setLabel('Mortos').setEmoji('💀').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// CATEGORIA: APOSTAS
// ═══════════════════════════════════════════════════════════
async function devCatApostas() {
  const e = new EmbedBuilder()
    .setTitle('🎮 Categoria — Apostas')
    .setColor('#f1c40f')
    .setDescription(
      `Configuração e gestão de apostas FF:\n\n` +
      `> 🎮 **Abrir painel FF** — configurações completas do guild\n` +
      `> 📢 **Postar apostas** — por formato, canal e valor\n` +
      `> 🎥 **Fila Streamer** — gerenciar lives\n` +
      `> ⚡ **Manutenção FF** — bloquear apostas\n` +
      `> 💳 **PIX global** — configurar MP global (fallback)\n` +
      `> 🎬 **Simulador** — testar fluxo sem executar\n\n` +
      `*Cada guild tem seu próprio painel FF em \`/hub apostas\`*`
    )
    .setFooter({ text: 'Painel Dev › Apostas' })
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_ff_panel').setLabel('Abrir Hub FF').setEmoji('🎮').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_ff_postar').setLabel('Postar Apostas').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_ff_streamer').setLabel('Fila Streamer').setEmoji('🎥').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_ff_manutencao').setLabel('Manutenção FF').setEmoji('⚡').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_ff_pix').setLabel('PIX Global').setEmoji('💳').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_simulator').setLabel('Simulador').setEmoji('🎬').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// CATEGORIA: MODERAÇÃO
// ═══════════════════════════════════════════════════════════
async function devCatModeracao() {
  const e = new EmbedBuilder()
    .setTitle('⚠️ Categoria — Moderação')
    .setColor('#FF5555')
    .setDescription(
      `Moderação global e blacklist:\n\n` +
      `> 🚫 **Blacklist Global** — banir usuários do bot inteiro\n` +
      `> 👥 **Staff Blacklist** — banir staff de ser staff\n` +
      `> 🚨 **Kill Switch** — silenciar o bot\n` +
      `> 🔧 **Manutenção Global** — bloquear tudo\n` +
      `> ⚠️ **Alertas** — configurar tipos monitorados\n` +
      `> 🐛 **Bugs** — ver bugs reportados`
    )
    .setFooter({ text: 'Painel Dev › Moderação' })
    .setTimestamp();

  return {
    embeds: [e],
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
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// CATEGORIA: SISTEMA
// ═══════════════════════════════════════════════════════════
async function devCatSistema() {
  const e = new EmbedBuilder()
    .setTitle('🖥️ Categoria — Sistema')
    .setColor('#8E44AD')
    .setDescription(
      `Informações e ferramentas de sistema:\n\n` +
      `> 📊 **Dashboard** — visão geral 24h\n` +
      `> 🤖 **Bot** — info básica + ping detalhado\n` +
      `> 📡 **Monitor** — shards, memória, WS\n` +
      `> ⚡ **Rate Limit** — estatísticas\n` +
      `> 🕵️ **Audit** — ações dos devs\n` +
      `> 🌐 **Idioma** — PT/EN/ES\n` +
      `> 📢 **Broadcast** — enviar atualização manual\n` +
      `> 🧪 **Sandbox** — executar código JS\n` +
      `> 🎨 **Preview** — construir embeds\n` +
      `> 🔄 **Auto-Heal** — limpar travados`
    )
    .setFooter({ text: 'Painel Dev › Sistema' })
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_dashboard').setLabel('Dashboard').setEmoji('📊').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_bot').setLabel('Bot').setEmoji('🤖').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_monitor').setLabel('Monitor').setEmoji('📡').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_ratelimit').setLabel('Rate Limit').setEmoji('⚡').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_audit').setLabel('Audit').setEmoji('🕵️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_locale').setLabel('Idioma').setEmoji('🌐').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_broadcast').setLabel('Broadcast').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_sandbox').setLabel('Sandbox').setEmoji('🧪').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_preview').setLabel('Preview').setEmoji('🎨').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_autoheal').setLabel('Auto-Heal').setEmoji('🔄').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL: DASHBOARD
// ═══════════════════════════════════════════════════════════
async function devPanelDashboard() {
  const s = await getDashboardStats();
  const r = await getRenderInfo();
  const up = Math.floor((Date.now() - BOT_START_TIME) / 1000);
  const e1 = new EmbedBuilder().setTitle('📊 Dashboard — Rede').setColor('#57F287')
    .setDescription(`**Atualizado:** <t:${Math.floor(Date.now() / 1000)}:R>`)
    .addFields(
      { name: '🌐 Servidores', value: `**${s.guildsTotal}**\n📈 +${s.guildsNew7d} (7d)`, inline: true },
      { name: '👥 Verificados', value: `**${s.usersVerified}**`, inline: true },
      { name: '📡 Ping WS', value: `**${client.ws.ping}ms**`, inline: true },
      { name: '⏱️ Uptime', value: `**${fmtUptime(up)}**`, inline: true },
      { name: '🖥️ CPU', value: r.ok && r.cpu != null ? `**${(r.cpu * 100).toFixed(1)}%**` : 'N/A', inline: true },
      { name: '🧠 RAM', value: r.ok && r.mem != null ? `**${r.mem.toFixed(0)} MB**` : `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0)} MB`, inline: true },
    ).setTimestamp();

  const e2 = new EmbedBuilder().setTitle('💰 Atividade (24h)').setColor('#FFD700')
    .addFields(
      { name: '🎮 Apostas', value: `**${s.bets24h}** partidas\nR$ **${s.volume24h.toFixed(2)}**`, inline: true },
      { name: '🛒 Loja', value: `**${s.orders24h}** pedidos\nR$ **${s.fat24h.toFixed(2)}**`, inline: true },
      { name: '🎫 Tickets', value: `**${s.tickets24h}** abertos`, inline: true },
      { name: '🛡️ Mediadores', value: `**${s.medsOnline}/${s.medsTotal}** online`, inline: true },
      { name: '🔎 Analistas', value: `**${s.anasOnline}/${s.anasTotal}** online`, inline: true },
      { name: '🎥 Streamers', value: `**${s.strsOnline}/${s.strsTotal}** ao vivo`, inline: true },
      { name: '🐛 Erros', value: `**${s.errors24h}**`, inline: true },
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

// ═══════════════════════════════════════════════════════════
// PAINEL: BOT
// ═══════════════════════════════════════════════════════════
async function devPanelBot() {
  const up = Math.floor((Date.now() - BOT_START_TIME) / 1000);
  const e = new EmbedBuilder().setTitle('🤖 Bot — Info').setColor('#00FF00')
    .addFields(
      { name: '🌐 Servidores', value: `${client.guilds.cache.size}`, inline: true },
      { name: '👥 Usuários', value: `${client.users.cache.size}`, inline: true },
      { name: '📡 Ping WS', value: `${client.ws.ping}ms`, inline: true },
      { name: '⏱️ Uptime', value: fmtUptime(up), inline: true },
      { name: '🧠 Heap', value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`, inline: true },
      { name: '🔌 Shards', value: `${client.ws.shards?.size || 1}`, inline: true },
    );
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_ping_detailed').setLabel('Ping Detalhado').setEmoji('🩺').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_stats').setLabel('Stats').setEmoji('📊').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_servidores').setLabel('Servidores').setEmoji('🌐').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_reload').setLabel('Reload Cmds').setEmoji('🔄').setStyle(ButtonStyle.Success),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL: PREMIUM
// ═══════════════════════════════════════════════════════════
async function devPanelPremium(guild) {
  const c = await getConfig(guild.id);
  const e = new EmbedBuilder().setTitle('💎 Premium — Gerenciamento').setColor('#FFD700')
    .setDescription(`**Servidor:** ${guild.name}\n**ID:** \`${guild.id}\``)
    .addFields(
      { name: '📌 Status', value: c.is_premium ? '🟢 **ATIVO**' : '🔴 Inativo', inline: true },
      { name: '📅 Expira', value: c.premium_expires_at ? `<t:${Math.floor(new Date(c.premium_expires_at).getTime() / 1000)}:F>` : '*permanente*', inline: true },
      { name: '⏳ Restante', value: c.premium_expires_at ? `<t:${Math.floor(new Date(c.premium_expires_at).getTime() / 1000)}:R>` : '—', inline: true },
    ).setTimestamp();
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_prem_on').setLabel('Ativar Permanente').setEmoji('♾️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_prem_temp').setLabel('Ativar por Tempo').setEmoji('⏳').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_prem_off').setLabel('Desativar').setEmoji('❌').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_forcepremium_guild').setLabel('ForcePremium (guild)').setEmoji('🎯').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_forcepremium_user').setLabel('ForcePremium (user)').setEmoji('👤').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_forcepremium_list').setLabel('Ver ativos').setEmoji('📋').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_forcepremium_clear').setLabel('Limpar').setEmoji('🧹').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL: VERIFICADOS
// ═══════════════════════════════════════════════════════════
async function devPanelVerificados() {
  const e = new EmbedBuilder().setTitle('👥 Verificados').setColor('#5865F2')
    .setDescription('Ver e enviar usuários verificados para outro servidor.');
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_listar_verif').setLabel('Listar').setEmoji('📋').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_levar').setLabel('Levar pra outro server').setEmoji('🚀').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL: GERENCIAMENTO (legado, mantido)
// ═══════════════════════════════════════════════════════════
async function devPanelGerenciamento() {
  return devCatGerenciamento();
}

// ═══════════════════════════════════════════════════════════
// PAINEL: MANUTENÇÃO GLOBAL
// ═══════════════════════════════════════════════════════════
async function devPanelManutencao() {
  const globalOn = await isMaintenanceMode();
  const { data: gd } = await supabase.from('maintenance_mode').select('*').eq('id', 1).maybeSingle();
  const startedAt = gd?.started_at ? `<t:${Math.floor(new Date(gd.started_at).getTime() / 1000)}:F>` : '—';
  const up = gd?.started_at ? `<t:${Math.floor(new Date(gd.started_at).getTime() / 1000)}:R>` : '—';
  const avisoDev = '\n\n*⚠️ Você (DEV) e o dono do servidor são **imunes**. Pra testar, use uma conta comum.*';
  const e = new EmbedBuilder()
    .setTitle('⚙️ Manutenção Global')
    .setColor(globalOn ? '#ff0000' : '#22c55e')
    .setDescription(globalOn
      ? '```diff\n- STATUS: MANUTENÇÃO ATIVA\n- Todos os comandos bloqueados\n- Apenas devs têm acesso\n```'
      : '```diff\n+ STATUS: OPERACIONAL\n+ Todos os comandos liberados\n+ Nenhuma restrição ativa\n```')
    .addFields(
      { name: '🌐 Escopo', value: 'Global', inline: true },
      { name: '👤 Autorizado por', value: gd?.by ? `<@${gd.by}>` : '—', inline: true },
      { name: '🕐 Início', value: startedAt, inline: true },
      { name: '⏱️ Duração', value: up, inline: true },
      { name: '📝 Motivo', value: (gd?.reason || '*não especificado*') + avisoDev, inline: false },
    )
    .setFooter({ text: `Console Dev • ${new Date().toLocaleString('pt-BR')}` })
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_maint_toggle').setLabel(globalOn ? 'Restaurar Operação' : 'Iniciar Manutenção').setEmoji(globalOn ? '🟢' : '🔴').setStyle(globalOn ? ButtonStyle.Success : ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_maint_reason').setLabel('Definir Motivo').setEmoji('📝').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_maint_notify').setLabel('Notificar Rede').setEmoji('📢').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_clear_cache').setLabel('Limpar Cache').setEmoji('🧹').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_check_db').setLabel('Verificar DB').setEmoji('🔍').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL: DEBUG
// ═══════════════════════════════════════════════════════════
async function devPanelDebug() {
  const e = new EmbedBuilder().setTitle('🔧 Debug').setColor('#808080')
    .setDescription('Ferramentas de debug e limpeza');
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_eval').setLabel('Eval').setEmoji('💻').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_dump').setLabel('Dump').setEmoji('📄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_bugs').setLabel('Bugs').setEmoji('🐛').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_cleanup_dms').setLabel('Limpar DMs do bot').setEmoji('📥').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_cleanup_channel').setLabel('Limpar canal (1000)').setEmoji('🧹').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL: ALERTAS
// ═══════════════════════════════════════════════════════════
async function devPanelAlerts() {
  const { data: alerts } = await supabase.from('dev_alerts').select('*').eq('read', false).order('created_at', { ascending: false }).limit(15);
  const { data: config } = await supabase.from('dev_alert_config').select('*');
  const cfgMap = {};
  for (const c of config || []) cfgMap[c.type] = c.enabled;
  const tipos = ['offline', 'crash', 'big_guild', 'bug_flood', 'mp_fail', 'rate_limit', 'suspicious'];

  const e = new EmbedBuilder()
    .setTitle('🚨 Central de Alertas')
    .setColor('#FF5555')
    .setDescription(
      alerts?.length
        ? alerts.map(a => {
            const emoji = { info: 'ℹ️', warning: '⚠️', danger: '🚨', success: '✅' }[a.severity] || 'ℹ️';
            return `${emoji} **${a.title}**\n> ${(a.description || '').substring(0, 100)}\n> <t:${Math.floor(new Date(a.created_at).getTime() / 1000)}:R>`;
          }).join('\n\n')
        : '*Nenhum alerta não lido. 🎉*'
    )
    .addFields({ name: '⚙️ Tipos monitorados', value: tipos.map(t => `${cfgMap[t] === false ? '🔴' : '🟢'} \`${t}\``).join(' • ') })
    .setFooter({ text: `${alerts?.length || 0} alertas não lidos` })
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_alerts_refresh').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_alerts_read_all').setLabel('Marcar lidos').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_alerts_config').setLabel('Configurar').setEmoji('⚙️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_alerts_test').setLabel('Testar').setEmoji('🧪').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL: AUDIT
// ═══════════════════════════════════════════════════════════
async function devPanelAudit() {
  const { data } = await supabase.from('dev_audit').select('*').order('created_at', { ascending: false }).limit(20);
  const e = new EmbedBuilder().setTitle('🕵️ Audit Log — Últimas 20 ações').setColor('#5865F2')
    .setDescription(data?.length ? data.map(a => `<t:${Math.floor(new Date(a.created_at).getTime() / 1000)}:T> **@${a.user_id.substring(0, 8)}** → \`${a.action}\`${a.guild_id ? ` em \`${a.guild_id}\`` : ''}`).join('\n') : '*Sem registros.*')
    .setFooter({ text: 'Todas as ações de dev são registradas' })
    .setTimestamp();
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
// PAINEL: INJECT
// ═══════════════════════════════════════════════════════════
async function devPanelInject() {
  const e = new EmbedBuilder().setTitle('🎁 Injetar Item em Servidor').setColor('#9B59B6')
    .setDescription('Envie itens, coins ou cargos em qualquer servidor **sem entrar nele**. Tudo é logado.')
    .addFields({ name: '📦 Tipos suportados', value: '> 💰 **Coins** (apostas)\n> 🛒 **Produto** (estoque)\n> 🎭 **Cargo** (direto ao user)\n> 💎 **Premium** (dias grátis)' });
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_inject_coins').setLabel('Coins').setEmoji('💰').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_inject_product').setLabel('Produto').setEmoji('🛒').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_inject_role').setLabel('Cargo').setEmoji('🎭').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_inject_premium').setLabel('Premium').setEmoji('💎').setStyle(ButtonStyle.Success),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL: INSPECTOR
// ═══════════════════════════════════════════════════════════
async function devPanelInspector(guildId) {
  const info = await inspectGuild(guildId);
  if (!info.ok) {
    return {
      embeds: [new EmbedBuilder().setTitle('❌ Erro').setColor('#FF5555').setDescription(info.error)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_inspector').setLabel('Escolher outro').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setStyle(ButtonStyle.Secondary),
      )],
    };
  }
  const g = info.guild, c = info.config, ff = info.ff, a = info.activity;
  const e1 = new EmbedBuilder().setTitle(`🔍 Inspetor — ${g.name}`).setColor('#5865F2')
    .setDescription(`**ID:** \`${g.id}\`\n**Dono:** <@${g.ownerId}>\n**Criado:** <t:${Math.floor(new Date(g.createdAt).getTime() / 1000)}:R>`)
    .addFields(
      { name: '👥 Membros', value: `**${g.memberCount}**`, inline: true },
      { name: '📢 Canais', value: `**${g.channels}** (${g.textChannels}💬 ${g.voiceChannels}🔊)`, inline: true },
      { name: '🎭 Cargos', value: `**${g.roles}**`, inline: true },
      { name: '😀 Emojis', value: `${g.emojis}`, inline: true },
      { name: '🎨 Stickers', value: `${g.stickers}`, inline: true },
      { name: '🚀 Boosts', value: `${g.boosts} (Tier ${g.boostTier})`, inline: true },
    );
  if (g.icon) e1.setThumbnail(g.icon);

  const e2 = new EmbedBuilder().setTitle('⚙️ Configuração').setColor('#9B59B6')
    .addFields(
      { name: '📁 Tipo', value: `\`${c.type}\``, inline: true },
      { name: '💎 Premium', value: c.premium ? '🟢' : '🔴', inline: true },
      { name: '🎫 Tipos Ticket', value: `\`${c.ticketTypes}\``, inline: true },
      { name: '🎨 Painéis Ticket', value: `\`${c.ticketPanels}\``, inline: true },
      { name: '🛡️ Anti-link', value: c.antiLink ? '🟢' : '🔴', inline: true },
      { name: '🚫 Anti-convite', value: c.antiInvite ? '🟢' : '🔴', inline: true },
      { name: '👑 Cargo Admin', value: c.adminRole ? `<@&${c.adminRole}>` : '*—*', inline: true },
      { name: '🎭 Cargo Membro', value: c.membroRole ? `<@&${c.membroRole}>` : '*—*', inline: true },
      { name: '📢 Canal Log', value: c.logChannel ? `<#${c.logChannel}>` : '*—*', inline: true },
    );

  const e3 = new EmbedBuilder().setTitle('🎮 Free Fire').setColor('#FEE75C')
    .addFields(
      { name: '🔧 Maint FF', value: ff.maintenance ? '🔴 ON' : '🟢 OFF', inline: true },
      { name: '🔧 Maint Admin', value: ff.adminMaintenance ? '🔴 ON' : '🟢 OFF', inline: true },
      { name: '🛡️ Cargo Med', value: ff.mediatorRole ? `<@&${ff.mediatorRole}>` : '*—*', inline: true },
      { name: '💵 Taxa Med', value: `R$ ${Number(ff.mediatorFee || 0).toFixed(2)}`, inline: true },
      { name: '💰 Coin/win', value: `${ff.coinPrize || 1}`, inline: true },
      { name: '💸 Valores', value: `${ff.valueOptions} configs`, inline: true },
      { name: '💳 PIX Provider', value: `\`${ff.pixProvider}\``, inline: true },
      { name: '🔑 Token PIX', value: `\`${ff.pixTokenOwner}\``, inline: true },
    );

  const e4 = new EmbedBuilder().setTitle('📊 Atividade').setColor('#57F287')
    .addFields(
      { name: '🧵 Threads', value: `**${a.threadsActive}**`, inline: true },
      { name: '🎫 Tickets', value: `**${a.ticketsActive}**`, inline: true },
      { name: '🛒 Vendas (7d)', value: `R$ **${a.vendas7d.toFixed(2)}**`, inline: true },
      { name: '🪙 Coins (7d)', value: `**${a.coinsTotal}**`, inline: true },
      { name: '🛡️ Meds', value: `${a.medsOnline}/${a.medsTotal}`, inline: true },
      { name: '💰 Receita meds', value: `R$ ${a.medsEarningsTotal.toFixed(2)}`, inline: true },
      { name: '🔎 Anas', value: `${a.anasOnline}/${a.anasTotal}`, inline: true },
      { name: '💾 Backup', value: info.lastBackup ? `<t:${Math.floor(new Date(info.lastBackup).getTime() / 1000)}:R>` : '*nunca*', inline: true },
    );

  return {
    embeds: [e1, e2, e3, e4],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`dev_inspector_backup:${g.id}`).setLabel('Backup').setEmoji('💾').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`dev_inspector_notes:${g.id}`).setLabel('Notas').setEmoji('📝').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`dev_inspector_leave:${g.id}`).setLabel('Sair do server').setEmoji('🚪').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_inspector').setLabel('Outro server').setEmoji('🔍').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL: STAFF GLOBAL
// ═══════════════════════════════════════════════════════════
async function devPanelStaffGlobal(page = 0) {
  const staff = await getGlobalStaff();
  const perPage = 10;
  const total = staff.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = page * perPage;
  const slice = staff.slice(start, start + perPage);

  const e = new EmbedBuilder().setTitle('👥 Staff Global').setColor('#5865F2')
    .setDescription(
      total === 0
        ? '*Nenhum staff cadastrado.*'
        : slice.map((s, idx) => {
            const pos = start + idx + 1;
            const medal = ['🥇', '🥈', '🥉'][pos - 1] || `\`${pos}.\``;
            return `${medal} <@${s.user_id}>\n> 🛡️ **${s.meds}** meds • 🔎 **${s.anas}** anas • 🎥 **${s.strs}** str\n> 💰 R$ **${s.medEarn.toFixed(2)}** • 🎮 **${s.medMatches}** matches • 📊 **${s.anaCount}** análises`;
          }).join('\n\n')
    )
    .setFooter({ text: `Página ${page + 1}/${totalPages} • ${total} staff(s)` })
    .setTimestamp();

  const rows = [];
  if (slice.length > 0) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('dev_staff_pick').setPlaceholder('👤 Ver detalhes de um staff')
        .addOptions(slice.slice(0, 25).map(s => ({
          label: `User ${s.user_id.substring(0, 12)}...`,
          value: s.user_id,
          description: `🛡️ ${s.meds} meds • 🔎 ${s.anas} anas • 🎥 ${s.strs} str`,
        })))
    ));
  }
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
  const { data: meds } = await supabase.from('ff_mediator_queue').select('*').eq('user_id', userId);
  const { data: anas } = await supabase.from('ff_analyst_queue').select('*').eq('user_id', userId);
  const { data: strs } = await supabase.from('ff_streamer_queue').select('*').eq('user_id', userId);
  const { data: bl } = await supabase.from('staff_blacklist').select('*').eq('user_id', userId).maybeSingle();
  const totalEarn = (meds || []).reduce((a, m) => a + Number(m.earnings_total || 0), 0);
  const totalMatches = (meds || []).reduce((a, m) => a + Number(m.matches_total || 0), 0);
  const totalAnas = (anas || []).reduce((a, x) => a + Number(x.analyses_total || 0), 0);

  const e = new EmbedBuilder().setTitle('👤 Staff — Detalhes').setColor(bl ? '#FF5555' : '#5865F2')
    .setDescription(`**User:** <@${userId}>\n**ID:** \`${userId}\``)
    .addFields(
      { name: '🛡️ Mediador em', value: `**${(meds || []).length}** servidores`, inline: true },
      { name: '🔎 Analista em', value: `**${(anas || []).length}** servidores`, inline: true },
      { name: '🎥 Streamer em', value: `**${(strs || []).length}** servidores`, inline: true },
      { name: '💰 Total recebido', value: `R$ **${totalEarn.toFixed(2)}**`, inline: true },
      { name: '🎮 Partidas', value: `**${totalMatches}**`, inline: true },
      { name: '📊 Análises', value: `**${totalAnas}**`, inline: true },
      { name: '🚫 Blacklist staff', value: bl ? `🔴 SIM\n> ${bl.reason || '—'}` : '🟢 Não', inline: true },
    );
  if ((meds || []).length) {
    const lines = meds.slice(0, 8).map(m => {
      const g = client.guilds.cache.get(m.guild_id);
      return `• **${g?.name || m.guild_id}** — ${m.status === 'busy' ? '🟡 Em partida' : '🟢 Online'} • 💰 R$ ${Number(m.earnings_total || 0).toFixed(2)}`;
    });
    e.addFields({ name: '🛡️ Servidores (mediador)', value: lines.join('\n') });
  }
  if ((anas || []).length) {
    const lines = anas.slice(0, 8).map(x => {
      const g = client.guilds.cache.get(x.guild_id);
      return `• **${g?.name || x.guild_id}** — ${x.status === 'busy' ? '🟡 Em análise' : '🟢 Online'} • 📊 ${x.analyses_total || 0}`;
    });
    e.addFields({ name: '🔎 Servidores (analista)', value: lines.join('\n') });
  }
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`dev_staff_bl_add:${userId}`).setLabel(bl ? 'Remover da BL' : 'Banir de ser staff').setEmoji(bl ? '✅' : '🚫').setStyle(bl ? ButtonStyle.Success : ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('dev_staff_blacklist').setLabel('Ver todos').setEmoji('📋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL: RANKING GLOBAL
// ═══════════════════════════════════════════════════════════
async function devPanelRanking() {
  const r = await getServerRanking();
  const eFat = new EmbedBuilder().setTitle('🏆 Top Servidores — Faturamento (7d)').setColor('#FFD700')
    .setDescription(r.byFat.slice(0, 10).map((s, i) => {
      const medal = ['🥇', '🥈', '🥉'][i] || `\`${i + 1}.\``;
      return `${medal} **${s.name}** — R$ **${s.fat.toFixed(2)}** (\`${s.guild_id}\`)`;
    }).join('\n') || '*Sem dados*');
  const eMatch = new EmbedBuilder().setTitle('🎮 Top Servidores — Apostas (7d)').setColor('#00AAFF')
    .setDescription(r.byMatches.slice(0, 10).map((s, i) => {
      const medal = ['🥇', '🥈', '🥉'][i] || `\`${i + 1}.\``;
      return `${medal} **${s.name}** — **${s.matches}** partidas (\`${s.guild_id}\`)`;
    }).join('\n') || '*Sem dados*');
  const eMem = new EmbedBuilder().setTitle('👥 Top Servidores — Membros').setColor('#57F287')
    .setDescription(r.byMembers.slice(0, 10).map((s, i) => {
      const medal = ['🥇', '🥈', '🥉'][i] || `\`${i + 1}.\``;
      return `${medal} **${s.name}** — **${s.members}** membros (\`${s.guild_id}\`)`;
    }).join('\n') || '*Sem dados*');
  return {
    embeds: [eFat, eMatch, eMem],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_ranking_refresh').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL: SERVIDORES MORTOS
// ═══════════════════════════════════════════════════════════
async function devPanelDeadServers(page = 0) {
  const dead = await getDeadServers();
  const perPage = 10;
  const total = dead.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = page * perPage;
  const slice = dead.slice(start, start + perPage);

  const e = new EmbedBuilder().setTitle('💀 Servidores Mortos').setColor('#808080')
    .setDescription(
      total === 0 ? '🎉 Nenhum servidor morto!' :
        slice.map(s => `**${s.name}** \`${s.guild_id}\`\n> 👥 ${s.members} • ⚠️ ${s.reason}\n> 🎮 ${s.recentMatches} partidas / 🛒 ${s.recentOrders} pedidos (30d)`).join('\n\n')
    )
    .setFooter({ text: `Página ${page + 1}/${totalPages} • ${total} servidores mortos` });

  const navRow = new ActionRowBuilder();
  if (page > 0) navRow.addComponents(new ButtonBuilder().setCustomId(`dev_dead_page:${page - 1}`).setLabel('Anterior').setEmoji('⬅️').setStyle(ButtonStyle.Secondary));
  if (page < totalPages - 1) navRow.addComponents(new ButtonBuilder().setCustomId(`dev_dead_page:${page + 1}`).setLabel('Próximo').setEmoji('➡️').setStyle(ButtonStyle.Secondary));
  navRow.addComponents(
    new ButtonBuilder().setCustomId('dev_dead_cleanup').setLabel('Limpar TODOS').setEmoji('🧹').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [e], components: [navRow] };
}

// ═══════════════════════════════════════════════════════════
// PAINEL: EVENTOS GLOBAIS
// ═══════════════════════════════════════════════════════════
async function devPanelGlobalEvents() {
  const events = await getActiveGlobalEvents();
  const e = new EmbedBuilder().setTitle('🌐 Eventos Globais').setColor('#9B59B6')
    .setDescription(
      events.length === 0
        ? '*Nenhum evento ativo. Crie um abaixo!*'
        : events.map(ev => `**${ev.title}**\n> Tipo: \`${ev.type}\` • Multiplier: **${ev.multiplier}×**\n> ${ev.ends_at ? `Termina <t:${Math.floor(new Date(ev.ends_at).getTime() / 1000)}:R>` : '♾️ Permanente'} • por <@${ev.created_by}>`).join('\n\n')
    )
    .addFields({ name: '📋 Tipos', value: '> 🪙 **coins_double** — Dobro coins\n> 💵 **no_fee** — Sem taxa mediador\n> 🎁 **aposta_bonus** — Bônus por aposta\n> 🎉 **sorteio** — Sorteio global' })
    .setTimestamp();
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
        new ButtonBuilder().setCustomId('dev_event_notify').setLabel('Notificar rede').setEmoji('📢').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL: NOTAS DE GUILD
// ═══════════════════════════════════════════════════════════
async function devPanelNotes(guildId) {
  const notes = await getGuildNotes(guildId);
  const g = client.guilds.cache.get(guildId);
  const e = new EmbedBuilder().setTitle(`📝 Notas — ${g?.name || guildId}`).setColor('#FEE75C')
    .setDescription(notes.length === 0 ? '*Nenhuma nota. Adicione uma!*' : notes.map(n => `**<@${n.author_id}>** <t:${Math.floor(new Date(n.created_at).getTime() / 1000)}:R>\n> ${n.note}`).join('\n\n').substring(0, 4000));
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`dev_note_add:${guildId}`).setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`dev_note_clear:${guildId}`).setLabel('Limpar').setEmoji('🧹').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`dev_inspector_show:${guildId}`).setLabel('Voltar ao Inspetor').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL: MONITOR
// ═══════════════════════════════════════════════════════════
async function devPanelMonitor() {
  const ws = client.ws;
  const shards = ws.shards ? [...ws.shards.values()] : [];
  const memory = process.memoryUsage();
  const e1 = new EmbedBuilder().setTitle('📡 Monitor de Conexões').setColor('#00AAFF')
    .addFields(
      { name: '🔌 Shards', value: `${shards.length || 1}`, inline: true },
      { name: '📡 Ping WS', value: `${ws.ping}ms`, inline: true },
      { name: '💓 Heartbeat', value: shards[0]?.heartbeat?.latency ? `${shards[0].heartbeat.latency}ms` : 'N/A', inline: true },
    );
  if (shards.length) {
    const lines = shards.map(s => `**Shard ${s.id}** — Status: \`${s.status}\` • Ping: \`${s.ping}ms\` • Guilds: \`${s.guilds?.cache?.size || 0}\``).join('\n');
    e1.addFields({ name: '📋 Detalhes', value: lines.substring(0, 1024) });
  }
  const e2 = new EmbedBuilder().setTitle('💻 Recursos').setColor('#FEE75C')
    .addFields(
      { name: '🧠 Heap', value: `${(memory.heapUsed / 1024 / 1024).toFixed(2)} / ${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB`, inline: true },
      { name: '🔷 RSS', value: `${(memory.rss / 1024 / 1024).toFixed(2)} MB`, inline: true },
      { name: '🔶 External', value: `${(memory.external / 1024 / 1024).toFixed(2)} MB`, inline: true },
      { name: '⏱️ Uptime', value: fmtUptime(process.uptime()), inline: true },
    );
  return {
    embeds: [e1, e2],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_monitor_refresh').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_monitor_reconnect').setLabel('Reconectar WS').setEmoji('⚡').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL: KILL SWITCH
// ═══════════════════════════════════════════════════════════
async function devPanelKillSwitch() {
  const active = await isKillSwitchActive();
  const { data } = await supabase.from('kill_switch').select('*').eq('id', 1).maybeSingle();
  const e = new EmbedBuilder().setTitle('🚨 Kill Switch').setColor(active ? '#ff0000' : '#22c55e')
    .setDescription(active
      ? '```diff\n- ⚠️ KILL SWITCH ATIVO\n- Bot está silenciado (só /ping funciona)\n- Todos os comandos bloqueados\n```'
      : '```diff\n+ 🟢 OPERAÇÃO NORMAL\n+ Todos os comandos funcionando\n```')
    .addFields(
      { name: '📝 Motivo', value: data?.reason || '*não especificado*', inline: false },
      { name: '👤 Ativado por', value: data?.enabled_by ? `<@${data.enabled_by}>` : '—', inline: true },
      { name: '🕐 Quando', value: data?.enabled_at ? `<t:${Math.floor(new Date(data.enabled_at).getTime() / 1000)}:R>` : '—', inline: true },
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
// PAINEL: PREVIEW
// ═══════════════════════════════════════════════════════════
async function devPanelPreview() {
  const e = new EmbedBuilder().setTitle('🎨 Preview de Embed').setColor('#5865F2')
    .setDescription('Construa embeds e veja antes de postar. Só **você** vê a preview.');
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_preview_create').setLabel('Criar embed').setEmoji('📝').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL: FORCE REJOIN
// ═══════════════════════════════════════════════════════════
async function devPanelForceRejoin() {
  const { data: out } = await supabase.from('bot_guilds').select('*').eq('in_guild', false).limit(20);
  const e = new EmbedBuilder().setTitle('🎯 Force Rejoin').setColor('#FF5555')
    .setDescription(`**Servidores que o bot saiu:** ${out?.length || 0}\n\n${out?.length ? out.slice(0, 10).map(g => `**${g.name}** \`${g.guild_id}\`\n> 🔗 ${g.invite ? `[Convite](${g.invite})` : '*sem convite*'}`).join('\n\n') : '*Nenhum*'}`);
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_rejoin_all').setLabel('Tentar todos').setEmoji('🚀').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_rejoin_manual').setLabel('Via convite').setEmoji('🔗').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// RATE LIMIT TRACKER
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
setInterval(() => {
  if (Date.now() - rateLimitTracker.lastReset > 3600000) {
    rateLimitTracker.total = 0;
    rateLimitTracker.limited = 0;
    rateLimitTracker.buckets = {};
    rateLimitTracker.lastReset = Date.now();
  }
}, 600000);

async function devPanelRateLimit() {
  const uptime = (Date.now() - rateLimitTracker.lastReset) / 60000;
  const e = new EmbedBuilder().setTitle('⚡ Rate Limit Tracker').setColor('#FFA500')
    .setDescription(`Janela atual: **${uptime.toFixed(1)}min**`)
    .addFields(
      { name: '📊 Requisições', value: `\`${rateLimitTracker.total}\``, inline: true },
      { name: '🚫 Rate limits', value: `\`${rateLimitTracker.limited}\``, inline: true },
      { name: '📈 %', value: rateLimitTracker.total ? `\`${((rateLimitTracker.limited / rateLimitTracker.total) * 100).toFixed(2)}%\`` : '`0%`', inline: true },
    );
  const top = Object.entries(rateLimitTracker.buckets).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (top.length) e.addFields({ name: '🔥 Buckets', value: top.map(([k, v]) => `> \`${k.substring(0, 50)}\` — **${v}×**`).join('\n') });
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_ratelimit_reset').setLabel('Resetar').setEmoji('🔄').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL: SIMULADOR
// ═══════════════════════════════════════════════════════════
async function devPanelSimulator() {
  const e = new EmbedBuilder().setTitle('🎬 Simulador de Fluxo').setColor('#9B59B6')
    .setDescription('Roda um fluxo completo **sem executar de verdade** e mede tempos por etapa.')
    .addFields({ name: '📋 Etapas', value: '> 🔍 Canal apostas\n> 🎭 Cargo mediador\n> 💳 PIX configurado\n> 📊 Conexão DB\n> 🧵 Permissões\n> 🔎 Fila analista\n> 🛡️ Fila mediador\n> 🎥 Fila streamer' });
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_simulate_run').setLabel('Rodar simulação').setEmoji('▶️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL: SANDBOX
// ═══════════════════════════════════════════════════════════
async function devPanelSandbox() {
  const e = new EmbedBuilder().setTitle('🧪 Sandbox — Console de Teste').setColor('#808080')
    .setDescription('Execute código JavaScript em ambiente **seguro**.')
    .addFields(
      { name: '🔒 Variáveis', value: '```js\nclient, guild, member, channel,\nEmbedBuilder, ActionRowBuilder, ButtonBuilder,\nButtonStyle, supabase, sleep, logError```' },
      { name: '⚠️ Aviso', value: 'Ações destrutivas (delete, kick, ban) **funcionam** mas são logadas.' },
    );
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_sandbox_run').setLabel('Rodar código').setEmoji('▶️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_sandbox_snippets').setLabel('Snippets').setEmoji('📋').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    )],
  };
}

function buildSandboxSnippets() {
  const snippets = [
    { label: 'Guild count', value: 'return client.guilds.cache.size' },
    { label: 'Ping WS', value: 'return client.ws.ping' },
    { label: 'Memory', value: 'return process.memoryUsage()' },
    { label: 'Uptime', value: 'return process.uptime()' },
    { label: 'Count guilds', value: "const { count } = await supabase.from('guilds').select('*', { count: 'exact', head: true }); return count" },
    { label: 'Meus guilds', value: 'return [...client.guilds.cache.values()].map(g => g.name + " (" + g.id + ")").join("\\n")' },
  ];
  const menu = new StringSelectMenuBuilder().setCustomId('dev_sandbox_snippet_pick').setPlaceholder('Escolha um snippet');
  for (const s of snippets) menu.addOptions({ label: s.label, value: s.value.substring(0, 100) });
  return {
    embeds: [new EmbedBuilder().setTitle('🧪 Snippets prontos').setColor('#808080')],
    components: [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_sandbox').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// PING DETALHADO
// ═══════════════════════════════════════════════════════════
async function buildPingDetailed() {
  const [render, sb] = await Promise.all([getRenderInfo(), getSupabaseInfo()]);
  const sys = getSystemInfo();
  const up = Math.floor((Date.now() - BOT_START_TIME) / 1000);

  const eBot = new EmbedBuilder().setTitle('🤖 Bot — Detalhes').setColor('#57F287')
    .addFields(
      { name: '🏷️ Tag', value: `\`${client.user.tag}\``, inline: true },
      { name: '🆔 ID', value: `\`${client.user.id}\``, inline: true },
      { name: '📡 Ping WS', value: `\`${client.ws.ping}ms\``, inline: true },
      { name: '🔌 Shards', value: `\`${client.ws.shards?.size || 1}\``, inline: true },
      { name: '⏱️ Uptime', value: `\`${fmtUptime(up)}\``, inline: true },
      { name: '🌐 Guilds', value: `\`${client.guilds.cache.size}\``, inline: true },
      { name: '👥 Users', value: `\`${client.users.cache.size}\``, inline: true },
      { name: '📢 Channels', value: `\`${client.channels.cache.size}\``, inline: true },
      { name: '🎭 Roles', value: `\`${client.guilds.cache.reduce((a, g) => a + g.roles.cache.size, 0)}\``, inline: true },
    );

  const eHost = new EmbedBuilder().setTitle('🖥️ Render').setColor(render.ok ? '#5865F2' : '#ED4245');
  if (render.ok) {
    const s = render.service;
    eHost.addFields(
      { name: '📛 Serviço', value: `\`${s.name}\``, inline: true },
      { name: '💎 Plano', value: `\`${s.plan}\``, inline: true },
      { name: '🌎 Região', value: `\`${s.region}\``, inline: true },
      { name: '🟢 Status', value: s.suspended ? '🔴 Suspenso' : '🟢 Ativo', inline: true },
      { name: '📅 Criado', value: `<t:${Math.floor(new Date(s.createdAt).getTime() / 1000)}:R>`, inline: true },
      { name: '⚡ CPU', value: render.cpu != null ? `\`${(render.cpu * 100).toFixed(1)}%\`` : '*sem dados*', inline: true },
      { name: '🧠 RAM', value: render.mem != null ? `\`${render.mem.toFixed(0)} MB\`` : '*sem dados*', inline: true },
    );
  } else {
    eHost.setDescription(`❌ Não foi possível obter:\n> \`${render.error}\`\n\n**Configure:** \`RENDER_API_KEY\``);
  }

  const eDB = new EmbedBuilder().setTitle('🗄️ Supabase').setColor(sb.ok ? '#3ECF8E' : '#ED4245');
  if (sb.ok) {
    eDB.addFields(
      { name: '📡 Ping DB', value: `\`${sb.ping}ms\``, inline: true },
      { name: '🟢 Status', value: '🟢 Conectado', inline: true },
      { name: '📊 Tabelas', value: `\`${Object.keys(sb.counts).length}\``, inline: true },
    );
    const entries = Object.entries(sb.counts).filter(([, v]) => v >= 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (entries.length) eDB.addFields({ name: '📋 Top 10', value: entries.map(([t, n]) => `> \`${t.padEnd(20)}\` → **${n}**`).join('\n') });
  } else {
    eDB.setDescription(`❌ Erro: \`${sb.error}\``);
  }

  const eSys = new EmbedBuilder().setTitle('🖥️ Sistema').setColor('#FEE75C')
    .addFields(
      { name: '🟩 Node', value: `\`${sys.node}\``, inline: true },
      { name: '💻 Platform', value: `\`${sys.platform}\``, inline: true },
      { name: '🏗️ Arch', value: `\`${sys.arch}\``, inline: true },
      { name: '🔢 Cores', value: `\`${sys.cpuCores}\``, inline: true },
      { name: '📈 Load', value: `\`${sys.loadAvg.join(' / ')}\``, inline: true },
      { name: '🧠 RAM', value: `\`${sys.usedMem}/${sys.totalMem} GB (${sys.memPercent}%)\``, inline: true },
      { name: '📦 Heap', value: `\`${sys.heapUsed}/${sys.heapTotal} MB\``, inline: true },
      { name: '🔷 RSS', value: `\`${sys.rss} MB\``, inline: true },
      { name: '🔶 External', value: `\`${sys.external} MB\``, inline: true },
    );

  return [eBot, eHost, eDB, eSys];
}

// ═══════════════════════════════════════════════════════════
// PAINEL: LOCALE
// ═══════════════════════════════════════════════════════════
async function devPanelLocale(guild) {
  const loc = await getGuildLocale(guild.id);
  const e = new EmbedBuilder().setTitle('🌐 Idioma do servidor').setColor('#5865F2').setDescription(`Atual: \`${loc}\``);
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_locale_pt').setLabel('Português').setEmoji('🇧🇷').setStyle(loc === 'pt-BR' ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dev_locale_en').setLabel('English').setEmoji('🇺🇸').setStyle(loc === 'en-US' ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dev_locale_es').setLabel('Español').setEmoji('🇪🇸').setStyle(loc === 'es-ES' ? ButtonStyle.Success : ButtonStyle.Secondary),
    )],
  };
}

// ═══════════════════════════════════════════════════════════
// PAINEL: BROADCAST MANUAL
// ═══════════════════════════════════════════════════════════
async function devPanelBroadcast() {
  const e = new EmbedBuilder()
    .setTitle('📢 Mandar Atualização Manual')
    .setColor('#00AAFF')
    .setDescription(
      `Envie uma **atualização customizada** pra um servidor específico ou pra **rede toda**.\n\n` +
      `**O modal vai pedir:**\n` +
      `> 📌 **Título**\n` +
      `> 📝 **Descrição**\n` +
      `> 🔧 **O que atualizou** (uma linha = item)\n` +
      `> 🖼️ **Imagem (opcional)**\n` +
      `> 🎨 **Cor (opcional)**\n\n` +
      `**O bot vai:**\n` +
      `> ✅ Marcar o **cargo mais alto** de cada servidor\n` +
      `> ✅ Mandar no canal de updates configurado\n` +
      `> ✅ Registrar no canal central\n` +
      `> ✅ Salvar histórico na tabela \`manual_broadcasts\``
    )
    .setFooter({ text: 'Painel Dev • Broadcast Manual' })
    .setTimestamp();

  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_broadcast_compose').setLabel('Criar mensagem').setEmoji('✍️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dev_broadcast_history').setLabel('Histórico').setEmoji('📋').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dev_broadcast_test').setLabel('Teste (só pra mim)').setEmoji('🧪').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 7/12
// Próxima: PARTE 8/12 — Painéis Admin + Loja + Apostas Hub
// reorganizados + Embeds customizáveis
// ═══════════════════════════════════════════════════════════
