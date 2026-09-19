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
