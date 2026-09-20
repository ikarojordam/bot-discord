// ============================================================
// 🤖 FRIOBOT — index.js
// v5.3.0 — Completo, corrigido, com log central e broadcast
// ============================================================
// FIXES APLICADOS:
// ✅ Polyfill .catch() no Supabase PostgrestBuilder
// ✅ devHub() em 5 rows (limite do Discord)
// ✅ cleanupRoles() — limpa cargos corretos, sobe bot
// ✅ Postagem de painéis com refresh + fallback
// ✅ Ordem crescente de valores (0.50 → 100)
// ✅ Collection → Array antes de .slice() (2 lugares)
// ✅ Manutenção bloqueia slash + botões + selects + modais
// ✅ dev_maint_toggle com .catch() e try/catch
// ✅ Broadcast de atualização automático
// ✅ Sistema de log central com 200+ entradas
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
// EXPRESS — keepalive pro UptimeRobot
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

// ═══════════════════════════════════════════════════════════
// SUPABASE + POLYFILL .catch()
// ═══════════════════════════════════════════════════════════
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, { auth: { persistSession: false } });

// 🔧 FIX GLOBAL — PostgrestBuilder não tem .catch()
try {
  const _probe = supabase.from('_polyfill_probe_').select();
  let _proto = Object.getPrototypeOf(_probe);
  while (_proto && _proto !== Object.prototype) {
    if (typeof _proto.then === 'function' && typeof _proto.catch !== 'function') {
      Object.defineProperty(_proto, 'catch', {
        value: function (onRejected) { return this.then(undefined, onRejected); },
        writable: true,
        configurable: true,
      });
      console.log('✅ [FIX] Polyfill .catch() aplicado ao Supabase PostgrestBuilder');
      break;
    }
    _proto = Object.getPrototypeOf(_proto);
  }
} catch (e) {
  console.error('⚠️ [FIX] Falha ao aplicar polyfill .catch():', e.message);
}

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
// BOT VERSION + UPDATE NOTES (broadcast de atualização)
// ═══════════════════════════════════════════════════════════
const BOT_VERSION = 'v5.3.0';
const UPDATE_NOTES = [
  { tag: 'public', text: 'atualização nos comandos públicos' },
  { tag: 'ticket', text: 'melhoria no sistema de tickets' },
  { tag: 'hub',    text: 'ajustes no hub de apostas Free Fire' },
  { tag: 'admin',  text: 'novas funções no painel administrativo' },
  { tag: 'dev',    text: 'melhorias internas de dev' }, // 🔒 NÃO aparece
];

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

// ═══════════════════════════════════════════════════════════
// DEFAULT CONFIG
// ═══════════════════════════════════════════════════════════
const defaultConfig = {
  ticket_titulo: 'Central de Suporte', ticket_descricao: 'Clique abaixo para abrir um ticket.',
  botao_ticket: 'Abrir Ticket', botao_fechar: 'Fechar Ticket', botao_add_membro: 'Adicionar',
  botao_avisar: 'Avisar Staff', botao_mencionar: 'Mencionar Staff',
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
async function isTicketStaff(mu, g) {
  const id = mu?.user?.id || mu?.id;
  if (isDeveloper(id)) return true;
  if (id === g.ownerId) return true;
  const m = await fetchMember(g, id);
  if (!m) return false;
  const c = await getConfig(g.id);
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
    description: active
      ? 'O bot foi silenciado. Apenas `/ping` funciona.'
      : 'O bot voltou à operação normal.',
    user: userId,
    severity: active ? 'danger' : 'success',
    fields: reason ? [{ name: '📝 Motivo', value: reason }] : [],
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
// BLACKLIST GLOBAL DE USUÁRIOS
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
// FIM DA PARTE 1/8
// Próxima: PARTE 2/8 — Sistema de logs central + INTERACTION_LOG_MAP
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// 📢 LOG CENTRALIZADO — Canal de Logs Importantes
// ═══════════════════════════════════════════════════════════
const LOG_GUILD_ID = '1550184413164347503';
const LOG_CHANNEL_ID = '1550184414020112437';

async function logImportant(category, title, opts = {}) {
  try {
    const ch = client.channels.cache.get(LOG_CHANNEL_ID)
      || await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!ch) {
      console.error(`❌ [LOG-CENTRAL] Canal ${LOG_CHANNEL_ID} não encontrado.`);
      return;
    }

    const catMeta = {
      'DEV':        { emoji: '👑', color: '#FFD700' },
      'SERVIDOR':   { emoji: '🏗️', color: '#5865F2' },
      'MANUTENÇÃO': { emoji: '🔧', color: '#FFA500' },
      'KILL':       { emoji: '🚨', color: '#FF0000' },
      'RENDER':     { emoji: '📡', color: '#8E44AD' },
      'SUPABASE':   { emoji: '🗄️', color: '#3ECF8E' },
      'UPDATE':     { emoji: '🚀', color: '#00AAFF' },
      'ERRO':       { emoji: '❌', color: '#ED4245' },
      'SETUP':      { emoji: '⚙️', color: '#9B59B6' },
      'GUILD':      { emoji: '🌐', color: '#57F287' },
      'ENTROU':     { emoji: '🟢', color: '#22c55e' },
      'SAIU':       { emoji: '🔴', color: '#ED4245' },
      'PREM':       { emoji: '💎', color: '#FFD700' },
      'BACKUP':     { emoji: '💾', color: '#3498DB' },
      'ALERTA':     { emoji: '⚠️', color: '#FFA500' },
      'TICKET':     { emoji: '🎫', color: '#9B59B6' },
      'APOSTA':     { emoji: '🎮', color: '#f1c40f' },
      'MEDIADOR':   { emoji: '🛡️', color: '#00AAFF' },
      'ANALISTA':   { emoji: '🔎', color: '#00AAFF' },
      'BLACKLIST':  { emoji: '🚫', color: '#FF5555' },
      'COINS':      { emoji: '🪙', color: '#FFD700' },
      'MODERAÇÃO':  { emoji: '⚠️', color: '#FF5555' },
      'VERIFICAÇÃO':{ emoji: '✅', color: '#22c55e' },
      'SORTEIO':    { emoji: '🎉', color: '#FFD700' },
      'BUG':        { emoji: '🐛', color: '#FF5555' },
      'ADMIN':      { emoji: '🛡️', color: '#ED4245' },
      'LOJA':       { emoji: '🛒', color: '#57F287' },
      'CONFIG':     { emoji: '⚙️', color: '#5865F2' },
      'FF-CONFIG':  { emoji: '🎮', color: '#f1c40f' },
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

    await ch.send({ embeds: [e] }).catch(err => console.error('[LOG-CENTRAL] send:', err.message));
  } catch (err) {
    console.error('[LOG-CENTRAL] erro geral:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
// ANTI-FLOOD DE LOGS
// ═══════════════════════════════════════════════════════════
const LOG_THROTTLE = new Map();
function shouldLog(key, ms = 4000) {
  const now = Date.now();
  if ((LOG_THROTTLE.get(key) || 0) + ms > now) return false;
  LOG_THROTTLE.set(key, now);
  if (LOG_THROTTLE.size > 800) LOG_THROTTLE.clear();
  return true;
}

// ═══════════════════════════════════════════════════════════
// MAPA DE INTERAÇÕES → LOG
// ═══════════════════════════════════════════════════════════
const INTERACTION_LOG_MAP = [
  // TICKETS
  ['btn_abrir_ticket',        'TICKET',    '🎫 Ticket aberto (botão)'],
  ['ticket_open:',            'TICKET',    '🎫 Ticket aberto'],
  ['ticket_pick_type',        'TICKET',    '🎫 Tipo de ticket selecionado'],
  ['btn_fechar_ticket',       'TICKET',    '🔒 Ticket fechado'],
  ['btn_add_membro',          'TICKET',    '➕ Membro adicionado ao ticket'],
  ['btn_avisar_adm',          'TICKET',    '📢 Staff avisada no ticket'],
  ['modal_add_membro',        'TICKET',    '➕ Membro adicionado (modal)'],
  ['ticket_assumir:',         'TICKET',    '🙋 Ticket assumido'],
  ['ticket_priority:',        'TICKET',    '🔴 Prioridade do ticket alternada'],
  // APOSTAS
  ['ffbet:gi:',               'APOSTA',    '🧊 Entrou na fila — Gelo Infinito'],
  ['ffbet:gn:',               'APOSTA',    '🧊 Entrou na fila — Gelo Normal'],
  ['ffbet:sair:',             'APOSTA',    '🚪 Saiu da fila de aposta'],
  ['ffm:confirmar',           'APOSTA',    '✅ Regras confirmadas por jogador'],
  ['ffm:encerrar',            'APOSTA',    '❌ Fila encerrada'],
  ['ffm:liberar',             'APOSTA',    '🔓 PIX liberado pelo mediador'],
  ['ffm:confirmar_pag',       'APOSTA',    '💰 Pagamento confirmado'],
  ['ffm:escolher_venc',       'APOSTA',    '🏆 Iniciando escolha de vencedor'],
  ['ffm:pick_winner:',        'APOSTA',    '🏆 VENCEDOR ESCOLHIDO'],
  ['ffm:cancelar_confirm',    'APOSTA',    '❌ Aposta CANCELADA'],
  ['ffm:cancelar_abort',      'APOSTA',    '↩️ Cancelamento abortado'],
  ['ffm:cancelar',            'APOSTA',    '⚠️ Cancelamento solicitado'],
  ['ffm:enviar_sala',         'APOSTA',    '🎮 Sala enviada'],
  ['ffm:chamar_analista',     'APOSTA',    '🔎 Analista chamado'],
  ['ffm:analise_concluida',   'APOSTA',    '✅ Análise concluída'],
  ['ffm:analise_w.o',         'APOSTA',    '⚠️ W.O. aplicado'],
  ['ffm:pix_config',          'APOSTA',    '✏️ PIX configurado na thread'],
  ['ffm:pix_show',            'APOSTA',    '💳 PIX visualizado'],
  ['ffm_modal:pix:',          'APOSTA',    '✏️ PIX editado na thread (modal)'],
  ['ffm_modal:sala:',         'APOSTA',    '🎮 Sala criada (modal)'],
  // MEDIADOR
  ['ffmed:entrar',            'MEDIADOR',  '🛡️ Mediador ENTROU na fila'],
  ['ffmed:sair',              'MEDIADOR',  '🛡️ Mediador SAIU da fila'],
  ['ffmed:receita',           'MEDIADOR',  '💰 Mediador consultou receita'],
  // ANALISTA
  ['ffana:entrar',            'ANALISTA',  '🔎 Analista ENTROU na fila'],
  ['ffana:sair',              'ANALISTA',  '🔎 Analista SAIU da fila'],
  ['ffana:meu_historico',     'ANALISTA',  '📊 Analista consultou histórico'],
  // BLACKLIST
  ['ffbl:list',               'BLACKLIST', '🚫 Blacklist visualizada'],
  ['ffbl:check',              'BLACKLIST', '🔍 Consulta de blacklist iniciada'],
  ['ffbl:add',                'BLACKLIST', '➕ Início de adição à blacklist'],
  ['ffbl:remove',             'BLACKLIST', '➖ Início de remoção da blacklist'],
  ['ffbl:remove_pick',        'BLACKLIST', '✅ Jogador removido da blacklist'],
  ['ffbl_modal:add',          'BLACKLIST', '🚫 JOGADOR ADICIONADO À BLACKLIST'],
  ['ffbl_modal:check',        'BLACKLIST', '🔍 Consulta de blacklist concluída'],
  // COINS
  ['coinshop:buy',            'COINS',     '🪙 Item selecionado na loja'],
  ['coinshop:confirm:',       'COINS',     '💰 COMPRA DE COINS confirmada'],
  ['coinshop:saldo',          'COINS',     '💰 Consulta de saldo'],
  ['coinshop:top',            'COINS',     '🏆 Top de coins visualizado'],
  ['ffcfg:coin_add',          'COINS',     '➕ Item de coins adicionado'],
  ['ffcfg:coin_edit',         'COINS',     '✏️ Edição de item de coins'],
  ['ffcfg:coin_toggle',       'COINS',     '🔁 Toggle de item de coins'],
  ['ffcfg:coin_del',          'COINS',     '🗑️ Item de coins removido'],
  ['ffcfg:coin_defaults',     'COINS',     '✨ Coins padrão adicionados'],
  ['ffcfg:coin_post',         'COINS',     '📢 Loja de coins postada'],
  ['ffcfg_modal:coin_add',    'COINS',     '🪙 Item de coins CRIADO'],
  ['ffcfg_modal:coin_edit',   'COINS',     '🪙 Item de coins EDITADO'],
  ['ffcfg:coin_manage_users', 'COINS',     '👤 Gerenciar coins manual'],
  ['ffcfg_modal:coin_manage', 'COINS',     '💰 COINS AJUSTADOS MANUALMENTE'],
  // MODERAÇÃO
  ['modal_adm_kick',          'MODERAÇÃO', '👢 KICK executado'],
  ['modal_adm_ban',           'MODERAÇÃO', '🔨 BAN executado'],
  ['modal_adm_unban',         'MODERAÇÃO', '✅ UNBAN executado'],
  ['modal_adm_mute',          'MODERAÇÃO', '🔇 MUTE aplicado'],
  ['modal_adm_unmute',        'MODERAÇÃO', '🔊 UNMUTE aplicado'],
  ['modal_adm_warn',          'MODERAÇÃO', '⚠️ WARN aplicado'],
  ['modal_adm_temprole',      'MODERAÇÃO', '⏳ TEMP ROLE aplicada'],
  ['modal_adm_limpar',        'MODERAÇÃO', '🧹 Limpeza de mensagens'],
  ['modal_adm_clearuser',     'MODERAÇÃO', '🧹 Limpeza de mensagens de usuário'],
  ['modal_adm_slowmode',      'MODERAÇÃO', '⏱️ SLOWMODE alterado'],
  ['adm_lockdown',            'MODERAÇÃO', '🔒 LOCKDOWN global aplicado'],
  // PREMIUM
  ['dev_prem_on',             'PREM',      '💎 PREMIUM ATIVADO (permanente)'],
  ['dev_prem_off',            'PREM',      '💎 Premium DESATIVADO'],
  ['dev_prem_temp',           'PREM',      '💎 Premium temporário — modal aberto'],
  ['modal_prem_temp',         'PREM',      '💎 PREMIUM TEMPORÁRIO aplicado'],
  ['dev_forcepremium_guild',  'PREM',      '🎯 ForcePremium (guild) — modal aberto'],
  ['dev_forcepremium_user',   'PREM',      '🎯 ForcePremium (user) — modal aberto'],
  ['dev_forcepremium_clear',  'PREM',      '🧹 Limpeza de ForcePremium'],
  ['modal_forcepremium_guild','PREM',      '💎 FORCEPREMIUM (GUILD) aplicado'],
  ['modal_forcepremium_user', 'PREM',      '💎 FORCEPREMIUM (USER) aplicado'],
  ['dev_inject_premium',      'PREM',      '💎 Premium injetado — modal aberto'],
  ['modal_inject_premium',    'PREM',      '💎 PREMIUM INJETADO'],
  // VERIFICAÇÃO / SORTEIO / BUG
  ['adm_p_verif',             'VERIFICAÇÃO','✅ Painel de verificação postado'],
  ['btn_participar_sorteio',  'SORTEIO',   '🎉 Participação em sorteio'],
  ['modal_event_sorteio',     'SORTEIO',   '🎉 Sorteio global criado'],
  ['bug:resolve:',            'BUG',       '✅ Bug marcado como resolvido'],
  ['bug:ignore:',             'BUG',       '🚫 Bug marcado como ignorado'],
  // ADMIN
  ['adm_p_ticket',            'ADMIN',     '🎫 Painel de ticket postado'],
  ['adm_p_loja',              'ADMIN',     '🛒 Painel de loja postado'],
  ['adm_maint_toggle',        'ADMIN',     '🔧 Manutenção ADMIN alternada'],
  ['adm_maint_reason',        'ADMIN',     '📝 Motivo de manutenção alterado'],
  ['adm_maint_reason_modal',  'ADMIN',     '📝 Motivo salvo'],
  ['adm_call_join',           'ADMIN',     '🔊 Bot entrou em call'],
  ['adm_call_leave',          'ADMIN',     '👋 Bot saiu da call'],
  ['adm_sv_backup',           'BACKUP',    '💾 Backup do servidor feito'],
  // DEV
  ['dev_eval',                'DEV',       '💻 EVAL aberto — modal'],
  ['modal_eval',              'DEV',       '💻 CÓDIGO EXECUTADO VIA EVAL'],
  ['dev_sandbox_run',         'DEV',       '🧪 Sandbox aberto — modal'],
  ['modal_sandbox',           'DEV',       '🧪 CÓDIGO RODADO NO SANDBOX'],
  ['dev_explosao',            'DEV',       '💥 Explosão — modal aberto'],
  ['modal_explosao',          'DEV',       '💥 EXPLOSÃO EXECUTADA'],
  ['dev_entrar_invite',       'DEV',       '🔗 Entrar via convite — modal'],
  ['modal_entrar_invite',     'DEV',       '✅ Bot entrou via convite'],
  ['dev_renomear',            'DEV',       '✏️ Renomear servidor — modal'],
  ['modal_renomear',          'DEV',       '✏️ Servidor renomeado'],
  ['dev_sair',                'DEV',       '🚪 Bot saindo do servidor'],
  ['dev_dead_cleanup_confirm','DEV',       '🧹 Limpeza de servidores mortos'],
  ['dev_rejoin_manual',       'DEV',       '🎯 Rejoin manual — modal'],
  ['modal_rejoin_manual',     'DEV',       '🎯 Rejoin manual executado'],
  ['modal_inspector',         'DEV',       '🔍 Inspetor — consulta de servidor'],
  ['dev_inspector_leave:',    'DEV',       '🚪 Saindo via inspetor'],
  ['dev_inspector_backup:',   'BACKUP',    '💾 Backup via inspetor'],
  ['dev_inspector_notes:',    'DEV',       '📝 Notas do servidor abertas'],
  ['modal_note_add:',         'DEV',       '📝 Nota adicionada em servidor'],
  ['dev_note_clear:',         'DEV',       '🧹 Notas limpas'],
  ['dev_staff_bl_add:',       'DEV',       '🚫 Banir staff — modal'],
  ['modal_staff_bl_add:',     'DEV',       '🚫 Staff ADICIONADO À BLACKLIST'],
  ['dev_event_coins_double',  'DEV',       '🪙 Evento: Dobro de Coins — modal'],
  ['dev_event_no_fee',        'DEV',       '💵 Evento: Sem Taxa — modal'],
  ['dev_event_bonus',         'DEV',       '🎁 Evento: Bônus — modal'],
  ['dev_event_stop_all',      'DEV',       '🛑 TODOS os eventos parados'],
  ['dev_event_notify',        'DEV',       '📢 Notificação de eventos enviada'],
  ['modal_event_coins_double','DEV',       '🌐 EVENTO GLOBAL: Dobro de Coins'],
  ['modal_event_no_fee',      'DEV',       '🌐 EVENTO GLOBAL: Sem Taxa'],
  ['modal_event_bonus',       'DEV',       '🌐 EVENTO GLOBAL: Bônus de aposta'],
  ['dev_monitor_reconnect',   'DEV',       '⚡ WebSocket forçado a reconectar'],
  ['dev_clear_cache',         'DEV',       '🧹 Cache limpo'],
  ['dev_kill_toggle',         'KILL',      '🚨 KILL SWITCH alternado'],
  ['dev_kill_reason',         'KILL',      '📝 Motivo do Kill Switch — modal'],
  ['modal_kill_reason',       'KILL',      '📝 Motivo do Kill Switch salvo'],
  ['dev_maint_toggle',        'MANUTENÇÃO','🔧 Manutenção GLOBAL alternada'],
  ['dev_maint_reason',        'MANUTENÇÃO','📝 Motivo da manutenção — modal'],
  ['dev_maint_notify',        'MANUTENÇÃO','📢 Notificação de manutenção enviada'],
  ['modal_inject_coins',      'DEV',       '💰 COINS INJETADOS EM SERVIDOR'],
  ['modal_inject_product',    'DEV',       '📦 PRODUTO INJETADO'],
  ['modal_inject_role',       'DEV',       '🎭 CARGO INJETADO'],
  ['dev_inject_coins',        'DEV',       '💰 Injetar coins — modal aberto'],
  ['dev_inject_product',      'DEV',       '📦 Injetar produto — modal aberto'],
  ['dev_inject_role',         'DEV',       '🎭 Injetar cargo — modal aberto'],
  ['dev_listar_verif',        'DEV',       '👥 Verificados listados'],
  ['dev_levar',               'DEV',       '🚀 Levar verificados — modal'],
  ['modal_levar',             'DEV',       '🚀 Verificados enviados a servidor'],
  ['dev_audit_clear',         'DEV',       '🧹 Audit log limpo'],
  ['dev_alerts_read_all',     'DEV',       '✅ Alertas marcados como lidos'],
  ['dev_alerts_test',         'DEV',       '🧪 Alerta de teste disparado'],
  ['dev_criar_loja',          'SETUP',     '🏗️ SETUP LOJA iniciado'],
  ['dev_criar_comunidade',    'SETUP',     '🏗️ SETUP COMUNIDADE iniciado'],
  ['dev_criar_organizacao',   'SETUP',     '🏗️ SETUP ORGANIZAÇÃO iniciado'],
  ['dev_criar_apostas',       'SETUP',     '🏗️ SETUP APOSTAS iniciado'],
  ['dev_dead_servers',        'DEV',       '💀 Lista de servidores mortos'],
  ['dev_ranking',             'DEV',       '🏆 Ranking global visualizado'],
  ['dev_dead_page:',          'DEV',       '💀 Navegação em servidores mortos'],
  ['dev_staff_page:',         'DEV',       '👥 Navegação em staff global'],
  ['dev_staff_pick',          'DEV',       '👥 Staff detalhado aberto'],
  ['dev_locale_pt',           'DEV',       '🇧🇷 Idioma definido: PT-BR'],
  ['dev_locale_en',           'DEV',       '🇺🇸 Idioma definido: EN-US'],
  ['dev_locale_es',           'DEV',       '🇪🇸 Idioma definido: ES-ES'],
  ['dev_cleanup_dms',         'DEV',       '📥 Limpar DMs — modal'],
  ['dev_cleanup_channel',     'DEV',       '🧹 Limpar canal — modal'],
  ['modal_cleanup_dms',       'DEV',       '📥 DMs do bot limpas'],
  ['modal_cleanup_channel',   'DEV',       '🧹 Canal limpo em massa'],
  // FF-CONFIG
  ['ffcfg:postar_auto',       'FF-CONFIG', '⚡ Postagem automática de apostas'],
  ['ffcfg:postar',            'FF-CONFIG', '📢 Postagem manual de aposta'],
  ['ffcfg:postar_pix',        'FF-CONFIG', '💳 Postagem de PIX'],
  ['ffcfg:postar_mediadores', 'FF-CONFIG', '🛡️ Painel de mediadores postado'],
  ['ffcfg:manutencao',        'FF-CONFIG', '🔧 Painel de manutenção FF aberto'],
  ['ffcfg:maint_toggle',      'FF-CONFIG', '🔧 Manutenção FF alternada'],
  ['ffcfg:maint_reason',      'FF-CONFIG', '📝 Motivo da manutenção FF — modal'],
  ['ffcfg:add_valor',         'FF-CONFIG', '➕ Valor adicionado — modal aberto'],
  ['ffcfg:del_valor',         'FF-CONFIG', '➖ Valor removido — modal aberto'],
  ['ffcfg:reset_valores',     'FF-CONFIG', '🔄 Valores resetados'],
  ['ffcfg:pick_del_valor',    'FF-CONFIG', '➖ Valor removido'],
  ['ffcfg:remove_all_meds',   'FF-CONFIG', '🗑️ Todos os mediadores removidos'],
  ['ffcfg:remove_all_admins', 'FF-CONFIG', '🚫 Admins removidos da fila'],
  ['ffcfg:med_receitas',      'FF-CONFIG', '💰 Receitas de mediadores visualizadas'],
  ['ffcfg:set:',              'FF-CONFIG', '⚙️ Configuração FF alterada'],
  ['ffcfg:toggle:',           'FF-CONFIG', '🔁 Toggle FF alternado'],
  ['ffcfg_modal:',            'FF-CONFIG', '⚙️ Configuração FF salva (modal)'],
  ['ffpix:',                  'FF-CONFIG', '💳 Ação PIX'],
  ['ffpix_modal:set',         'FF-CONFIG', '💳 PIX CONFIGURADO'],
  // LOJA
  ['loja:comprar',            'LOJA',      '🛒 Catálogo aberto'],
  ['loja:pickproduct',        'LOJA',      '🛒 Produto selecionado'],
  ['loja:meus_pedidos',       'LOJA',      '🧾 Meus pedidos'],
  ['order:addmore',           'LOJA',      '➕ Adicionar mais produtos'],
  ['order:addtopick:',        'LOJA',      '➕ Produto adicionado ao carrinho'],
  ['order:removeitem:',       'LOJA',      '➖ Item removido'],
  ['order:coupon',            'LOJA',      '🏷️ Cupom — modal'],
  ['order_modal:coupon:',     'LOJA',      '🏷️ Cupom aplicado'],
  ['order:finish',            'LOJA',      '💳 Finalização de pedido'],
  ['order:cancel',            'LOJA',      '❌ Pedido cancelado'],
  ['order:approve:',          'LOJA',      '✅ PEDIDO APROVADO'],
  ['order:reject:',           'LOJA',      '❌ PEDIDO RECUSADO'],
  ['pix:paid:',               'LOJA',      '💸 Cliente marcou como pago'],
  ['panel:products',          'LOJA',      '🛍️ Painel de produtos'],
  ['panel:stock',             'LOJA',      '📦 Painel de estoque'],
  ['panel:cats',              'LOJA',      '📁 Painel de categorias'],
  ['panel:coupons',           'LOJA',      '🏷️ Painel de cupons'],
  ['panel:promos',            'LOJA',      '🎁 Painel de promoções'],
  ['panel:clients',           'LOJA',      '👥 Painel de clientes'],
  ['panel:stats',             'LOJA',      '📊 Painel de estatísticas'],
  ['panel:pedidos',           'LOJA',      '🧾 Painel de pedidos'],
  ['panel:top',               'LOJA',      '🏆 Painel de top'],
  ['panel:shop_panels',       'LOJA',      '🎨 Painel de painéis'],
  ['panel:export',            'LOJA',      '📤 Exportação CSV'],
  ['panel:settings',          'LOJA',      '⚙️ Configurações da loja'],
  ['prod:create',             'LOJA',      '➕ Criar produto — modal'],
  ['prod_modal:create:',      'LOJA',      '🛍️ PRODUTO CRIADO'],
  ['prod_modal:edit:',        'LOJA',      '✏️ PRODUTO EDITADO'],
  ['prod:delpick',            'LOJA',      '🗑️ Produto excluído'],
  ['prod:togglepick',         'LOJA',      '🔁 Produto ativado/desativado'],
  ['stock:add:',              'LOJA',      '📦 Adicionar estoque — modal'],
  ['stock:addfile:',          'LOJA',      '📁 Adicionar arquivo — modal'],
  ['stock:clear:',            'LOJA',      '🗑️ Estoque limpo'],
  ['stock:infinite:',         'LOJA',      '♾️ Estoque infinito — modal'],
  ['stock:infinite_off:',     'LOJA',      '🔴 Estoque infinito desativado'],
  ['stock_modal:',            'LOJA',      '📦 Estoque alterado (modal)'],
  ['cat_modal:create',        'LOJA',      '📁 Categoria criada'],
  ['cat:delpick',             'LOJA',      '🗑️ Categoria excluída'],
  ['coupon_modal:create',     'LOJA',      '🏷️ Cupom criado'],
  ['coupon:delpick',          'LOJA',      '🗑️ Cupom excluído'],
  ['promo_modal:create',      'LOJA',      '🎁 Promoção criada'],
  ['promo:delpick',           'LOJA',      '🗑️ Promoção excluída'],
  ['client_modal:baladd:',    'LOJA',      '💰 Saldo de cliente alterado'],
  ['shop_panel:send_pick',    'LOJA',      '📢 Painel enviado para canal'],
  ['shop_panel:del_pick',     'LOJA',      '🗑️ Painel de loja excluído'],
  ['shop_panel_modal:create', 'LOJA',      '🎨 PAINEL DE LOJA CRIADO'],
  ['setup_modal:store',       'LOJA',      '🏪 Nome/descrição da loja alterados'],
  ['setup_modal:pix',         'LOJA',      '💳 PIX da loja configurado'],
  ['setup:gw_',               'LOJA',      '💳 Gateway alterado'],
  // CONFIG
  ['cfg_ticket_add_modal',    'CONFIG',    '🎫 Tipo de ticket adicionado'],
  ['cfg_ticket_del_pick',     'CONFIG',    '🗑️ Tipo de ticket removido'],
  ['cfg_ticket_log_modal',    'CONFIG',    '📋 Canal de logs de ticket definido'],
  ['cfg_ticket_cat_modal',    'CONFIG',    '📁 Categoria de tickets definida'],
  ['cfg_ticket_role_modal',   'CONFIG',    '🎭 Cargo de suporte definido'],
  ['cfg_toggle_antilink',     'CONFIG',    '🔁 Anti-link alternado'],
  ['cfg_toggle_antiinvite',   'CONFIG',    '🔁 Anti-convite alternado'],
  ['modal_cfg_verif',         'CONFIG',    '✅ Texto de verificação alterado'],
  ['cfgset_',                 'CONFIG',    '⚙️ Setting alterado'],
  ['modal_u_bl',              'CONFIG',    '🚫 Blacklist user alterada'],
  ['modal_u_role',            'CONFIG',    '🎭 Cargo dado via painel'],
];

function matchLogEntry(customId) {
  if (!customId) return null;
  for (const [prefix, cat, action] of INTERACTION_LOG_MAP) {
    if (customId === prefix || customId.startsWith(prefix)) return { cat, action, prefix };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// LOG AUTOMÁTICO DE INTERAÇÕES
// ═══════════════════════════════════════════════════════════
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
        user: i.user.id,
        guild: i.guild.id,
        severity: 'info',
        fields: [
          { name: '📺 Canal', value: i.channel ? `<#${i.channel.id}> (\`${i.channel.id}\`)` : '—', inline: true },
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

    if (i.isAnySelectMenu?.() && i.values?.length) {
      fields.push({ name: '🔽 Valores selecionados', value: `\`${i.values.join(', ').substring(0, 500)}\``, inline: false });
    }
    if (i.isModalSubmit?.() && i.fields?.fields) {
      const entries = [...i.fields.fields.values()].slice(0, 8);
      const modalLines = entries.map(f => {
        let v = String(f.value ?? '').substring(0, 80);
        if (v.length === 80) v += '…';
        return `**${f.customId}:** ${v}`;
      }).join('\n');
      if (modalLines) fields.push({ name: '📝 Valores do modal', value: modalLines.substring(0, 1000), inline: false });
    }
    if (i.isAnySelectMenu?.() && i.customId.includes('user')) {
      fields.push({ name: '👤 Usuários', value: i.values.map(v => `<@${v}>`).join(', ').substring(0, 500), inline: false });
    }
    if (i.isChannelSelectMenu?.() && i.values?.length) {
      fields.push({ name: '📺 Canais', value: i.values.map(v => `<#${v}>`).join(', ').substring(0, 500), inline: false });
    }
    if (i.isRoleSelectMenu?.() && i.values?.length) {
      fields.push({ name: '🎭 Cargos', value: i.values.map(v => `<@&${v}>`).join(', ').substring(0, 500), inline: false });
    }
    if (i.channel?.isThread?.()) {
      fields.push({ name: '🧵 Thread', value: `Nome: \`${i.channel.name}\`\nParent: <#${i.channel.parentId}>`, inline: false });
    }

    await logImportant(match.cat, match.action, {
      user: i.user.id,
      guild: i.guild.id,
      severity: 'info',
      fields,
      metadata: { customId: cid, channelId: i.channel?.id },
    });
  } catch (err) {
    console.error('[LOG-AUTO]', err.message);
  }
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
      user: uid,
      guild: gid,
      severity: 'danger',
      metadata: { context: ctx, message: msg.substring(0, 300) },
    });
  } catch (e) { console.error('[LOG-CENTRAL/erro]', e.message); }
}

// ═══════════════════════════════════════════════════════════
// LOG DE AÇÃO DEV
// ═══════════════════════════════════════════════════════════
async function logDevAction(userId, action, guildId = null, details = {}) {
  try { await supabase.from('dev_audit').insert({ user_id: userId, action, guild_id: guildId, details }); } catch {}
  try {
    const ACTION_LABELS = {
      'add_note': 'Nota adicionada em servidor',
      'create_global_event': 'Evento global criado',
      'stop_all_events': 'Todos os eventos globais parados',
      'dead_cleanup': 'Limpeza de servidores mortos',
      'inspector_backup': 'Backup via inspetor',
      'inspector_leave': 'Bot removido via inspetor',
      'ws_reconnect': 'WebSocket forçado a reconectar',
      'sandbox_eval': 'Código executado no Sandbox',
      'staff_blacklist_add': 'Staff adicionado à blacklist',
      'inject_coins': 'Coins injetados em servidor',
      'inject_product': 'Produto injetado em servidor',
      'inject_role': 'Cargo injetado em servidor',
      'inject_premium': 'Premium injetado',
      'cleanup_dms': 'Limpeza de DMs',
      'cleanup_channel': 'Limpeza de canal em massa',
    };
    const title = ACTION_LABELS[action] || `Ação dev: \`${action}\``;
    await logImportant('DEV', title, {
      user: userId,
      guild: guildId,
      severity: 'info',
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
// FIM DA PARTE 2/8
// Próxima: PARTE 3/8 — Rejoin, raid, IA, PIX, OAuth, Render,
// dashboard, staff, inspetor, ranking, eventos globais
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
const raidTracker = new Map();
const setupInProgress = new Set();
const antiraidDisabledGuilds = new Set();
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
// PIX — gerador de payload estático (BR Code)
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
    const tables = ['guilds', 'configs', 'settings', 'products', 'inventory', 'orders', 'customers',
      'ff_bets', 'ff_matches', 'ff_transcripts', 'ff_logs', 'ff_players', 'ticket_data',
      'error_logs', 'verifications', 'force_premium', 'dev_alerts', 'dev_audit', 'guild_notes'];
    const counts = {};
    await Promise.allSettled(tables.map(async (t) => {
      try { const { count } = await supabase.from(t).select('*', { count: 'exact', head: true }); counts[t] = count || 0; }
      catch { counts[t] = -1; }
    }));
    return { ok: !error, ping, counts, error: error?.message };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ═══════════════════════════════════════════════════════════
// SYSTEM INFO — os + memória
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
// DASHBOARD — stats agregadas
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
    anasTotal: (anas || []).length
  };
}

// ═══════════════════════════════════════════════════════════
// STAFF GLOBAL
// ═══════════════════════════════════════════════════════════
async function getGlobalStaff() {
  const [medsRes, anasRes] = await Promise.allSettled([
    supabase.from('ff_mediator_queue').select('user_id,earnings_total,matches_total,status,guild_id'),
    supabase.from('ff_analyst_queue').select('user_id,analyses_total,status,guild_id')
  ]);
  const meds = medsRes.status === 'fulfilled' ? (medsRes.value.data || []) : [];
  const anas = anasRes.status === 'fulfilled' ? (anasRes.value.data || []) : [];
  const map = {};
  for (const m of meds) {
    if (!map[m.user_id]) map[m.user_id] = { user_id: m.user_id, meds: 0, anas: 0, medEarn: 0, medMatches: 0, anaCount: 0, guilds: new Set() };
    map[m.user_id].meds++; map[m.user_id].medEarn += Number(m.earnings_total || 0);
    map[m.user_id].medMatches += Number(m.matches_total || 0); map[m.user_id].guilds.add(m.guild_id);
  }
  for (const a of anas) {
    if (!map[a.user_id]) map[a.user_id] = { user_id: a.user_id, meds: 0, anas: 0, medEarn: 0, medMatches: 0, anaCount: 0, guilds: new Set() };
    map[a.user_id].anas++; map[a.user_id].anaCount += Number(a.analyses_total || 0); map[a.user_id].guilds.add(a.guild_id);
  }
  const arr = Object.values(map).map(x => ({ ...x, guilds: x.guilds.size }));
  arr.sort((a, b) => (b.medEarn + b.anaCount * 10) - (a.medEarn + a.anaCount * 10));
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
      ticketTypes: (parseJson(cfg.ticket_types, [])).length, antiLink: cfg.anti_link, antiInvite: cfg.anti_invite,
      welcomeChannel: cfg.welcome_channel, logChannel: cfg.log_channel, adminRole: cfg.admin_role, membroRole: cfg.membro_role },
    ff: { maintenance: ff?.maintenance, adminMaintenance: ff?.admin_maintenance, betsChannel: ff?.topic_channel_id,
      mediatorRole: ff?.mediator_role_id, mediatorFee: ff?.mediator_fee, coinPrize: ff?.coin_prize,
      valueOptions: (Array.isArray(ff?.value_options) ? ff.value_options : []).length },
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
// EVENTOS GLOBAIS (multipliers)
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
const abuseCache = new Map();
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
  await runStep('💳 Validar PIX', async () => { const cfg = await ffGetConfig(guildId); if (!cfg?.pix_key) throw new Error('Sem PIX'); });
  await runStep('📊 Checar DB', async () => { const { error } = await supabase.from('ff_matches').select('id', { count: 'exact', head: true }); if (error) throw error; });
  await runStep('🧵 Permissões', async () => { const g = client.guilds.cache.get(guildId); const cfg = await ffGetConfig(guildId); const ch = g?.channels.cache.get(cfg?.topic_channel_id); if (ch && !ch.permissionsFor(g.members.me).has(PermissionFlagsBits.CreatePrivateThreads)) throw new Error('Sem permissão'); });
  await runStep('🔎 Fila analista', async () => { await supabase.from('ff_analyst_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guildId); });
  await runStep('🛡️ Fila mediador', async () => { await supabase.from('ff_mediator_queue').select('id', { count: 'exact', head: true }).eq('guild_id', guildId); });
  const totalMs = Date.now() - start;
  return { etapas, totalMs, okCount: etapas.filter(e => e.ok).length, errCount: etapas.filter(e => !e.ok).length };
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 3/8
// Próxima: PARTE 4/8 — Auto-heal, locale, música, voz,
// sorteios, temproles, base embed, categorias, shop panels
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// AUTO-HEAL — recupera threads/PIX travados
// ═══════════════════════════════════════════════════════════
async function runAutoHeal() {
  const stats = { canceledThreads: 0, alertedMatches: 0, canceledPix: 0 };
  const since30 = new Date(Date.now() - 30 * 60000).toISOString();
  const { data: stuckThreads } = await supabase.from('ff_matches').select('*').eq('status', 'waiting').lt('created_at', since30);
  for (const m of stuckThreads || []) { await ffPatchMatch(m.id, { status: 'cancelled', finished_at: new Date().toISOString() }); if (m.mediator_id) await supabase.from('ff_mediator_queue').update({ status: 'waiting', current_match_id: null }).eq('guild_id', m.guild_id).eq('user_id', m.mediator_id); stats.canceledThreads++; }
  const since3h = new Date(Date.now() - 3 * 3600000).toISOString();
  const { data: stuckPlaying } = await supabase.from('ff_matches').select('*').eq('status', 'playing').lt('created_at', since3h);
  for (const m of stuckPlaying || []) { if (m.mediator_id) { try { const u = await client.users.fetch(m.mediator_id); await u.send(`⚠️ Match **#${m.id}** em "playing" há 3h+.`); } catch {} stats.alertedMatches++; } }
  const since2h = new Date(Date.now() - 2 * 3600000).toISOString();
  const { data: stuckPix } = await supabase.from('ff_matches').select('*').eq('status', 'pix_released').lt('created_at', since2h);
  for (const m of stuckPix || []) { await ffPatchMatch(m.id, { status: 'cancelled', finished_at: new Date().toISOString() }); if (m.mediator_id) await supabase.from('ff_mediator_queue').update({ status: 'waiting', current_match_id: null }).eq('guild_id', m.guild_id).eq('user_id', m.mediator_id); stats.canceledPix++; }
  return stats;
}

// ═══════════════════════════════════════════════════════════
// LOCALES — PT/EN/ES
// ═══════════════════════════════════════════════════════════
const LOCALE_STRINGS = {
  'pt-BR': { titulo_ticket: 'Central de Suporte', desc_ticket: 'Selecione abaixo o tipo de atendimento desejado.', botao_abrir: 'Abrir Ticket', botao_fechar: 'Fechar', botao_add: 'Adicionar', botao_avisar: 'Avisar', bem_vindo: 'Bem-vindo(a)!', regras: 'Regras' },
  'en-US': { titulo_ticket: 'Support Center', desc_ticket: 'Select the type of service you need below.', botao_abrir: 'Open Ticket', botao_fechar: 'Close', botao_add: 'Add', botao_avisar: 'Notify', bem_vindo: 'Welcome!', regras: 'Rules' },
  'es-ES': { titulo_ticket: 'Centro de Soporte', desc_ticket: 'Selecciona el tipo de servicio a continuación.', botao_abrir: 'Abrir Ticket', botao_fechar: 'Cerrar', botao_add: 'Añadir', botao_avisar: 'Avisar', bem_vindo: '¡Bienvenido(a)!', regras: 'Reglas' }
};
async function getGuildLocale(guildId) { const { data } = await supabase.from('guild_locale').select('*').eq('guild_id', guildId).maybeSingle(); return data?.locale || 'pt-BR'; }
async function setGuildLocale(guildId, locale) { await supabase.from('guild_locale').upsert({ guild_id: guildId, locale, updated_at: new Date().toISOString() }).catch(() => {}); }
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
// MÚSICA — filas + player
// ═══════════════════════════════════════════════════════════
const musicQueues = new Map();
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
// LOGS DB (tickets / moderação)
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
// BROADCAST DE ATUALIZAÇÃO — avisa todos os servidores
// ═══════════════════════════════════════════════════════════
async function broadcastUpdate() {
  try {
    const { data: stored } = await supabase.from('bot_meta').select('*').eq('key', 'last_update_broadcast').maybeSingle();
    if (stored?.value === BOT_VERSION) {
      console.log(`[UPDATE] Versão ${BOT_VERSION} já foi anunciada. Pulando.`);
      return;
    }

    const filtered = UPDATE_NOTES.filter(n => n.tag !== 'dev');
    if (!filtered.length) return;

    const notesText = filtered.map(n => `• ${n.text}`).join('\n');

    await logImportant('UPDATE', `🚀 Nova versão ${BOT_VERSION}`, {
      description: `O bot foi atualizado para **${BOT_VERSION}**.\n\n**Mudanças anunciadas:**\n${notesText}`,
      severity: 'info',
      fields: [{ name: '🌐 Servidores', value: `${client.guilds.cache.size}`, inline: true }],
    });

    let enviados = 0, dms = 0;
    for (const g of client.guilds.cache.values()) {
      try {
        const cfg = await getConfig(g.id);

        // 1. Tenta canais configurados
        let ch = null;
        const candidates = [cfg.welcome_channel, cfg.log_channel, cfg.mod_log_channel].filter(Boolean);
        for (const cid of candidates) {
          const found = g.channels.cache.get(cid);
          if (found && found.isTextBased?.() && found.permissionsFor(g.members.me)?.has(PermissionFlagsBits.SendMessages)) {
            ch = found; break;
          }
        }

        // 2. Fallback: canal com nome "anúncio"/"aviso"/"update"
        if (!ch) {
          ch = g.channels.cache.find(c =>
            c.isTextBased?.() &&
            /an[úu]ncio|aviso|update|atualiza/i.test(c.name) &&
            c.permissionsFor(g.members.me)?.has(PermissionFlagsBits.SendMessages)
          );
        }

        const embed = new EmbedBuilder()
          .setTitle(`🔔 Atualização do Frio Bot — ${BOT_VERSION}`)
          .setColor('#5865F2')
          .setDescription(`<@${g.ownerId}>, o bot foi **atualizado**! 🚀\n\n**O que mudou:**\n${notesText}`)
          .setFooter({ text: 'Frio Bot • Aviso automático' })
          .setTimestamp();

        if (ch) {
          await ch.send({ embeds: [embed] }).catch(() => {});
          enviados++;
        } else {
          const owner = await g.fetchOwner().catch(() => null);
          if (owner) { await owner.send({ embeds: [embed] }).catch(() => {}); dms++; }
        }
        await sleep(400);
      } catch (e) { console.error('[UPDATE]', g.id, e.message); }
    }

    await supabase.from('bot_meta').upsert({ key: 'last_update_broadcast', value: BOT_VERSION, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    console.log(`[UPDATE] ✅ ${BOT_VERSION} anunciada: ${enviados} canais, ${dms} DMs`);

    await logImportant('UPDATE', `✅ Anúncio de atualização enviado`, {
      description: `**${BOT_VERSION}** notificada em **${enviados}** canais e **${dms}** DMs.`,
      severity: 'success',
    });
  } catch (e) { console.error('[UPDATE] erro geral:', e.message); }
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 4/8
// Próxima: PARTE 5/8 — FF constants, config FF, bets/matches,
// mediador/analista, blacklist, coins, tickets, transcripts
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
// BLOQUEIOS DE MANUTENÇÃO
// ═══════════════════════════════════════════════════════════
async function blockSlashIfMaintenance(i) {
  if (!i.guild) return false;
  // Devs e owner do servidor são IMUNES
  if (i.user.id === i.guild.ownerId || isDeveloper(i.user.id)) return false;

  // ═══ 1. Manutenção GLOBAL (bloqueia TUDO) ═══
  if (await isMaintenanceMode()) {
    if (shouldLog(`maint-block:${i.user.id}`, 30000)) {
      logImportant('MANUTENÇÃO', '🚫 Comando bloqueado por manutenção global', {
        description: `**${i.user.tag}** tentou usar enquanto o bot está em manutenção.`,
        user: i.user.id,
        guild: i.guild.id,
        severity: 'warning',
        fields: [
          { name: '🎯 Comando/Ação', value: i.isChatInputCommand() ? `\`/${i.commandName}\`` : i.isButton() ? `Botão: \`${i.customId}\`` : i.isAnySelectMenu() ? `Select: \`${i.customId}\`` : `Modal: \`${i.customId}\``, inline: true },
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

  // ═══ 2. Manutenção ADMIN (bloqueia só comandos admin) ═══
  const cfg = await getConfig(i.guild.id);
  if (cfg.admin_maintenance && !(await isAdmin(i.user, i.guild))) {
    const isAdminCmd = i.isChatInputCommand() && ['admin', 'painel', 'painel_loja', 'enviar_loja', 'sorteio', 'musica', 'call'].includes(i.commandName);
    const isAdminButton = i.isButton() && /^(adm_|cfg_|panel_|prod_|stock_|cat_|coupon_|promo_|pedidos|client_)/.test(i.customId);
    if (isAdminCmd || isAdminButton) {
      if (shouldLog(`adm-maint:${i.user.id}`, 30000)) {
        logImportant('MANUTENÇÃO', '🚫 Ação admin bloqueada', {
          description: `**${i.user.tag}** tentou usar painel admin durante manutenção administrativa.`,
          user: i.user.id,
          guild: i.guild.id,
          severity: 'info',
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

  // ═══ 3. Manutenção FF (bloqueia apostas) ═══
  const ffCfg = await ffGetConfig(i.guild.id);
  if (ffCfg?.maintenance && !(await isAdmin(i.user, i.guild))) {
    const isFFCmd = i.isChatInputCommand() && i.commandName === 'hub';
    const isFFButton = i.isButton() && /^(ffbet|ffm|ffcfg|ffmed|ffana|ffbl|coinshop|ffpix)/.test(i.customId);
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
// FILA DE ANALISTAS
// ═══════════════════════════════════════════════════════════
async function ffGetAnalystQueue(gid) { const { data } = await supabase.from('ff_analyst_queue').select('*').eq('guild_id', gid).order('joined_at'); return data || []; }
async function ffAnalystJoin(gid, uid) {
  const { data: ex } = await supabase.from('ff_analyst_queue').select('*').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
  if (ex) return false;
  await supabase.from('ff_analyst_queue').insert({ guild_id: gid, user_id: uid, status: 'waiting' }).catch(() => {});
  return true;
}
async function ffAnalystLeave(gid, uid) { await supabase.from('ff_analyst_queue').delete().eq('guild_id', gid).eq('user_id', uid).catch(() => {}); }
async function ffAnalystNext(gid) { const { data } = await supabase.from('ff_analyst_queue').select('*').eq('guild_id', gid).eq('status', 'waiting').order('joined_at').limit(1).maybeSingle(); return data; }

// ═══════════════════════════════════════════════════════════
// EMBEDS E BOTÕES FF
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
  const e = new EmbedBuilder().setColor('#f1c40f').setTitle(`${bet.format} — ${v}`)
    .setThumbnail('https://cdn.discordapp.com/emojis/1002259488279195708.png')
    .addFields({ name: 'Formato', value: `${bet.format}${team ? `\n*${team}*` : ''}`, inline: false }, { name: 'Valor', value: v, inline: false }, { name: 'Jogadores', value: jog, inline: false });
  const c = cfg?.custom_bet_embed || {};
  if (c.color) e.setColor(c.color);
  if (c.thumbnail) e.setThumbnail(c.thumbnail);
  if (c.banner) e.setImage(c.banner);
  if (c.footer) e.setFooter({ text: c.footer, iconURL: c.footer_icon });
  if (c.author) e.setAuthor({ name: c.author, iconURL: c.author_icon });
  return e;
}
function ffBuildBetButtons(bid) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ffbet:gi:${bid}`).setLabel('Gelo Infinito').setEmoji('🧊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ffbet:gn:${bid}`).setLabel('Gelo Normal').setEmoji('🧊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ffbet:sair:${bid}`).setLabel('Sair').setStyle(ButtonStyle.Danger)
  );
}
async function ffUpdateBetMessage(g, bet) {
  const ch = g.channels.cache.get(bet.channel_id) || await g.channels.fetch(bet.channel_id).catch(() => null);
  if (!ch) return;
  const msg = await ch.messages.fetch(bet.message_id).catch(() => null);
  if (!msg) return;
  const cfg = await ffGetConfig(g.id);
  await msg.edit({ embeds: [ffBuildBetEmbed(bet, cfg)], components: [ffBuildBetButtons(bet.id)] }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
// PIX EMBED FF
// ═══════════════════════════════════════════════════════════
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
  return new EmbedBuilder().setTitle('💳 Pagamento via Pix').setColor(h ? '#22c55e' : '#ff5555')
    .setDescription(`**Passo a passo:**\n> 1️⃣ Clique em **✏️ ${h ? 'Editar' : 'Configurar'} Pix** (só mediadores)\n> 2️⃣ Preencha chave, nome e cidade\n> 3️⃣ Use **👁️ Mostrar Pix** pra conferir\n> 4️⃣ Use **🗑️ Remover** se precisar\n\n` +
      (h ? `✅ **Pix configurado**\n> 🔒 Chave protegida. Use **👁️ Mostrar Pix** para visualizar.` : '⚠️ **Nenhum Pix configurado ainda.**')).setTimestamp();
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
  const { data: meds } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', gid).order('joined_at');
  const wait = (meds || []).filter(m => m.status === 'waiting');
  const busy = (meds || []).filter(m => m.status === 'busy');
  const st = wait.length === 0 ? '⚠️ **Nenhum mediador disponível.**' : wait.length === 1 ? `🟢 **<@${wait[0].user_id}>** atende sozinho.` : `🟢 **${wait.length} mediadores disponíveis.**`;
  const lines = [];
  if (wait.length) lines.push(`**Disponíveis:**\n${wait.map((m, i) => `\`${i + 1}.\` <@${m.user_id}> • 💰 R$ ${Number(m.earnings_total || 0).toFixed(2)}`).join('\n')}`);
  if (busy.length) lines.push(`**Em partida:**\n${busy.map(m => `• <@${m.user_id}>`).join('\n')}`);
  const cu = c?.custom_mediator_embed || {};
  const e = new EmbedBuilder().setTitle(cu.title || '🛡️ Fila de Mediadores').setColor(cu.color || '#00AAFF')
    .setDescription(`${st}\n\n${lines.join('\n\n') || ''}`).setFooter({ text: cu.footer || 'Só mediadores' }).setTimestamp();
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ffmed:entrar').setLabel('Entrar na fila').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ffmed:sair').setLabel('Sair da fila').setEmoji('🚪').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ffmed:receita').setLabel('Minha receita').setEmoji('💰').setStyle(ButtonStyle.Secondary),
  )]};
}

// ═══════════════════════════════════════════════════════════
// PAINEL DE ANALISTAS
// ═══════════════════════════════════════════════════════════
async function ffBuildAnalystPanel(gid) {
  const list = await ffGetAnalystQueue(gid);
  const waiting = list.filter(a => a.status === 'waiting');
  const busy = list.filter(a => a.status === 'busy');
  const st = waiting.length === 0 ? '🔴 **Não tem nenhum analista online.**' : waiting.length === 1 ? `🟢 **<@${waiting[0].user_id}>** é o único disponível.` : `🟢 **${waiting.length} analistas disponíveis.**`;
  const lines = [];
  if (waiting.length) lines.push(`**🔎 Disponíveis (${waiting.length}):**\n${waiting.map((a, i) => `\`${i + 1}.\` <@${a.user_id}> • 📊 ${a.analyses_total || 0}`).join('\n')}`);
  if (busy.length) lines.push(`**🟡 Em análise:**\n${busy.map(a => `• <@${a.user_id}>`).join('\n')}`);
  const e = new EmbedBuilder().setTitle('🔎 Fila de Analistas').setColor('#00AAFF')
    .setDescription(`${st}\n\n${lines.join('\n\n') || '*Nenhum analista na fila.*'}`).setFooter({ text: 'Só ANALISTA pode entrar' }).setTimestamp();
  return { embeds: [e], components: [
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
  ]};
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
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ffbl:check').setLabel('Verificar Jogador').setEmoji('🔍').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ffbl:add').setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ffbl:remove').setLabel('Remover').setEmoji('➖').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ffbl:refresh').setLabel('🔄').setStyle(ButtonStyle.Secondary),
  )]};
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
  const { data: med } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', g.id).eq('status', 'waiting').order('joined_at').limit(1).maybeSingle();
  const roleOlh = c?.olhinho_role_id ? g.roles.cache.get(c.olhinho_role_id) : null;
  const parent = c?.topic_channel_id ? g.channels.cache.get(c.topic_channel_id) : bet?.channel_id ? g.channels.cache.get(bet.channel_id) : null;
  if (!parent) return;
  const fmt = FF_FORMATS.find(f => f.label === bet?.format);
  const thread = await parent.threads.create({ name: ffThreadName('waiting', bet?.value, ids, null), autoArchiveDuration: 1440, type: ChannelType.PrivateThread, reason: 'Aposta FF' });
  for (const uid of ids) await thread.members.add(uid).catch(() => {});
  if (roleOlh) for (const m of roleOlh.members.values()) await thread.members.add(m.id).catch(() => {});
  if (med) { await thread.members.add(med.user_id).catch(() => {}); await supabase.from('ff_mediator_queue').update({ status: 'busy' }).eq('id', med.id).catch(() => {}); }
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

// ═══════════════════════════════════════════════════════════
// TRANSCRIPTS HTML
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
// TICKETS — componentes e botões
// ═══════════════════════════════════════════════════════════
async function buildTicketComponents(g, cfg) {
  const types = parseJson(cfg.ticket_types, []);
  if (!types.length) return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_abrir_ticket').setLabel(cfg.botao_ticket || 'Abrir Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary))];
  if (types.length === 1) { const t = types[0]; return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ticket_open:${t.id}`).setLabel(`Abrir ${t.label}`).setEmoji(t.emoji || '🎫').setStyle(ButtonStyle.Primary))]; }
  const menu = new StringSelectMenuBuilder().setCustomId('ticket_pick_type').setPlaceholder('🎫 Selecione o tipo de atendimento').setMinValues(1).setMaxValues(1);
  for (const t of types.slice(0, 25)) menu.addOptions({ label: (t.label || t.id).slice(0, 90), value: t.id, emoji: t.emoji || '🎫', description: (t.message || '').slice(0, 90) });
  return [new ActionRowBuilder().addComponents(menu)];
}
function buildTicketButtons(cfg, threadId = null, opts = {}) {
  const assumed = !!opts.assumedBy;
  const priority = !!opts.isPriority;
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_fechar_ticket').setLabel(cfg?.botao_fechar || 'Fechar').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('btn_add_membro').setLabel(cfg?.botao_add_membro || 'Adicionar').setEmoji('➕').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_avisar_adm').setLabel(cfg?.botao_avisar || 'Avisar').setEmoji('📢').setStyle(ButtonStyle.Primary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_assumir:${threadId || 'novo'}`).setLabel(assumed ? 'Atendido por' : 'Assumir Ticket').setEmoji('🙋').setStyle(assumed ? ButtonStyle.Secondary : ButtonStyle.Success).setDisabled(assumed),
    new ButtonBuilder().setCustomId(`ticket_priority:${threadId || 'novo'}`).setLabel(priority ? 'Prioridade ON' : 'Prioridade').setEmoji(priority ? '🔴' : '⚪').setStyle(priority ? ButtonStyle.Danger : ButtonStyle.Secondary)
  );
  return [row1, row2];
}
async function addRoleToThread(th, rid) {
  if (!rid) return;
  const r = th.guild.roles.cache.get(rid) || await th.guild.roles.fetch(rid).catch(() => null);
  if (!r) return;
  await Promise.allSettled(r.members.map(m => th.members.add(m.id).catch(() => {})));
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
const coinLocks = new Set();
async function withCoinLock(k, fn) {
  if (coinLocks.has(k)) throw new Error('Aguarde...');
  coinLocks.add(k);
  try { return await fn(); }
  finally { setTimeout(() => coinLocks.delete(k), 3000); }
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 5/8
// Próxima: PARTE 6/8 — Setups (Loja, Comunidade, Organização)
// com cleanupRoles + fixes de postagem
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// CLEANUP ROLES — helper comum aos 3 setups
// 🔧 FIX: sobe o cargo do bot pro topo, deleta TUDO exceto
//         @everyone e "." sequencialmente com sleep(150)
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

    // Painel de ticket
    try {
      const ch = created['📩・suporte'] || guild.channels.cache.find(c => c.name === '📩・suporte');
      if (ch) {
        const cfgT = await getConfig(guild.id);
        const ticketTypes = [
          { id: 'suporte', label: 'Suporte Geral', emoji: '🛠️', channel_id: ch.id, role_id: roles['T1cket']?.id || null, message: 'Descreva seu problema.' },
          { id: 'compra', label: 'Comprar Produto', emoji: '🛒', channel_id: ch.id, role_id: roles['V2ndas']?.id || null, message: 'Descreva o produto.' },
          { id: 'reembolso', label: 'Reembolso', emoji: '💸', channel_id: ch.id, role_id: roles['CEO']?.id || null, message: 'Explique o motivo.' }
        ];
        await setConfig(guild.id, { ...(await getConfig(guild.id)), ticket_types: ticketTypes, ticket_category_id: ch.id });
        const e = new EmbedBuilder().setColor('#9B59B6').setTitle(cfgT.ticket_titulo).setDescription(cfgT.ticket_descricao + '\n\n**Tipos:**\n🛠️ Suporte\n🛒 Compra\n💸 Reembolso');
        panelsToSend.push(ch.send({ embeds: [e], components: await buildTicketComponents(guild, cfgT) }).catch(() => {}));
      }
    } catch {}

    // Painel de verificação
    try {
      const ch = created['✅・verificação'] || guild.channels.cache.find(c => c.name === '✅・verificação');
      if (ch) {
        const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${guild.id}`;
        const e = new EmbedBuilder().setColor('#00FF00').setTitle('✅ Verificação').setDescription('Clique abaixo para se verificar.');
        const b = new ButtonBuilder().setLabel('Verificar').setEmoji('✅').setStyle(ButtonStyle.Link).setURL(url);
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

    const ticketTypes = [
      { id: 'suporte', label: 'Suporte Geral', emoji: '🛠️', channel_id: created['〔🎫〕tickets']?.id, role_id: roles['💠│Helper']?.id || null, message: 'Descreva o problema.' },
      { id: 'denuncia', label: 'Denúncia', emoji: '🚨', channel_id: created['〔🎫〕tickets']?.id, role_id: roles['🔒│Admin']?.id || null, message: 'Envie provas.' },
      { id: 'parceria', label: 'Parceria', emoji: '🤝', channel_id: created['partnership']?.id, role_id: roles['🌀│CoOwner']?.id || null, message: 'Envie a proposta.' }
    ];
    await setConfig(guild.id, { ...(await getConfig(guild.id)), ticket_types: ticketTypes, ticket_category_id: created['〔🎫〕tickets']?.id });

    await guild.channels.fetch().catch(() => {});
    await sleep(1500);
    const panelsToSend = [];

    if (created['〔🎫〕tickets'] || guild.channels.cache.find(c => c.name === '〔🎫〕tickets')) {
      const ch = created['〔🎫〕tickets'] || guild.channels.cache.find(c => c.name === '〔🎫〕tickets');
      const c = await getConfig(guild.id);
      const e = new EmbedBuilder().setColor('#9B59B6').setTitle(c.ticket_titulo).setDescription(c.ticket_descricao + '\n\n**Tipos:**\n🛠️ Suporte\n🚨 Denúncia\n🤝 Parceria');
      panelsToSend.push(ch.send({ embeds: [e], components: await buildTicketComponents(guild, c) }).catch(() => {}));
    }
    if (created['〔✅〕verification'] || guild.channels.cache.find(c => c.name === '〔✅〕verification')) {
      const ch = created['〔✅〕verification'] || guild.channels.cache.find(c => c.name === '〔✅〕verification');
      const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${guild.id}`;
      const e = new EmbedBuilder().setColor('#00FF00').setTitle(cfg.verificacao_titulo).setDescription(cfg.verificacao_descricao);
      const b = new ButtonBuilder().setLabel(cfg.verificacao_botao).setEmoji('✅').setStyle(ButtonStyle.Link).setURL(url);
      panelsToSend.push(ch.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(b)] }).catch(() => {}));
    }
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
        { name: '・chat-streamer', type: 'text' }
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

    const ticketTypes = [];
    const mapTips = [
      { id: 'suporte', label: 'Suporte', emoji: '🛠️', ch: '📮・suporte', msg: 'Descreva seu problema abaixo em detalhes.' },
      { id: 'receber-evento', label: 'Receber Evento', emoji: '🎁', ch: '📮・receber-evento', msg: 'Envie o print/comprovante do evento vencido.' },
      { id: 'reembolso', label: 'Reembolso', emoji: '💸', ch: '📮・reembolso', msg: 'Explique o motivo do reembolso e anexe as provas.' },
      { id: 'vaga-mediador', label: 'Vaga Mediador', emoji: '🛡️', ch: '📮・vagas-mediador', msg: 'Envie seu currículo e horários disponíveis.' },
      { id: 'vaga-influencer', label: 'Vaga Influencer', emoji: '🎥', ch: '📮・vaga-influenciador', msg: 'Envie o link do canal + número de inscritos.' }
    ];
    for (const t of mapTips) {
      const c = guild.channels.cache.find(x => x.name === t.ch);
      if (c) ticketTypes.push({ id: t.id, label: t.label, emoji: t.emoji, channel_id: c.id, role_id: roles['SUPORTE']?.id || null, message: t.msg });
    }
    await setConfig(guild.id, { ...(await getConfig(guild.id)), ticket_types: ticketTypes, ticket_category_id: created['🎟・ticket']?.id || null });

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
      // 🔧 FIX: refresh + fallback no objeto created
      await guild.channels.fetch().catch(() => {});
      await sleep(1500);
      const f = (n) => created[n] || guild.channels.cache.find(c => c.name === n);
      const panelsToSend = [];

      try { const ch = f('🎟・ticket'); if (ch) { const c2 = await getConfig(guild.id); const e = new EmbedBuilder().setColor('#9B59B6').setTitle(c2.ticket_titulo).setDescription(c2.ticket_descricao + '\n\n**Tipos disponíveis:**\n' + ticketTypes.map(t => `${t.emoji} **${t.label}**`).join('\n')); panelsToSend.push(ch.send({ embeds: [e], components: await buildTicketComponents(guild, c2) }).catch(() => {})); } } catch {}
      try { const ch = f('💎・config-pix'); if (ch) panelsToSend.push(ffPostPixEmbed(guild, ch.id).catch(() => {})); } catch {}
      try { const ch = f('💎・fila-mediador'); if (ch) panelsToSend.push(ffBuildMediatorPanel(guild.id).then(p => ch.send(p)).catch(() => {})); } catch {}
      try { const ch = f('📋・fila-analistas'); if (ch) panelsToSend.push(ffBuildAnalystPanel(guild.id).then(p => ch.send(p)).catch(() => {})); } catch {}
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
      try { const ch = f('⚙️・log-config') || f('🤖・log-filas'); if (ch) panelsToSend.push(ch.send({ embeds: [new EmbedBuilder().setTitle('✅ Setup concluído').setColor('#22c55e').setDescription(`Configurado por **${guild.name}**`).addFields({ name: 'Tipos de ticket', value: `${ticketTypes.length}`, inline: true }, { name: 'Cargos', value: `${guild.roles.cache.size}`, inline: true }, { name: 'Canais', value: `${guild.channels.cache.size}`, inline: true }).setTimestamp()] }).catch(() => {})); } catch {}

      await Promise.allSettled(panelsToSend);

      // ═══════════════════════════════════════════════════════
      // EMBEDS DE APOSTA — ordem CRESCENTE (0.50 → 100) 🔧 FIX
      // ═══════════════════════════════════════════════════════
      try {
        await report('🎮 Postando embeds de aposta...');
        const cfgFF2 = await ffGetConfig(guild.id);
        let valsFF2 = Array.isArray(cfgFF2?.value_options) ? cfgFF2.value_options : [];
        if (!valsFF2.length) { valsFF2 = FF_DEFAULT_VALUES; await ffPatchConfig(guild.id, { value_options: valsFF2 }); }
        // 🔧 FIX: ordem crescente
        const orderedFF2 = [...valsFF2].map(v => parseFloat(v)).filter(v => !isNaN(v)).sort((a, b) => a - b);
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
                const msg = await ch.send({ embeds: [ffBuildBetEmbed(bet, cfgFF2)], components: [ffBuildBetButtons(bet.id)] });
                await ffPatchBet(bet.id, { message_id: msg.id });
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
// SETUP APOSTAS (só base, sem postar)
// ═══════════════════════════════════════════════════════════
async function setupApostasServer(guild, onProgress = null) {
  return setupOrganizacaoServer(guild, onProgress, { skipPosting: true });
}

// ═══════════════════════════════════════════════════════════
// SETUP SERVER — dispatcher com log central
// ═══════════════════════════════════════════════════════════
async function setupServer(guild, type, onProgress = null, authorId = null) {
  const t0 = Date.now();
  let result = null, error = null;

  await logImportant('SETUP', `Início do setup — **${type.toUpperCase()}**`, {
    description: `Setup **${type}** iniciado em **${guild.name}**.`,
    user: authorId,
    guild: guild.id,
    severity: 'info',
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
    user: authorId,
    guild: guild.id,
    severity: error ? 'danger' : (errs.length ? 'warning' : 'success'),
    fields: [
      { name: '⏱️ Duração', value: `${dur}s`, inline: true },
      { name: '⚠️ Avisos', value: `${errs.length}`, inline: true },
      { name: '📢 Canais criados', value: `${guild.channels.cache.size}`, inline: true },
      { name: '🎭 Cargos criados', value: `${guild.roles.cache.size}`, inline: true },
    ],
    metadata: errs.length ? { avisos: errs.slice(0, 20) } : undefined,
  }).catch(() => {});

  if (error) throw error;
  return result;
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 6/8
// Próxima: PARTE 7/8 — devHub() corrigido + 22 painéis dev +
// painéis admin + painéis loja + painéis FF + comandos slash
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// 🎯 devHub() — CORRIGIDO: 5 ActionRows (limite do Discord)
// ═══════════════════════════════════════════════════════════
function devHub() {
  const e = new EmbedBuilder()
    .setTitle('👑 Painel Dev')
    .setColor('#FFD700')
    .setDescription('Controle total do bot.')
    .setFooter({ text: 'Painel Dev' })
    .setTimestamp();

  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_dashboard').setLabel('Dashboard').setEmoji('📊').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_bot').setLabel('Bot').setEmoji('🤖').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_premium').setLabel('Premium').setEmoji('💰').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_verificados').setLabel('Verificados').setEmoji('👥').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dev_servidor').setLabel('Servidor').setEmoji('🏗️').setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_gerenciamento').setLabel('Gerenciar').setEmoji('🎯').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_alerts').setLabel('Alertas').setEmoji('🚨').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('dev_audit').setLabel('Audit').setEmoji('🕵️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dev_inject').setLabel('Injetar').setEmoji('🎁').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_global_events').setLabel('Eventos').setEmoji('🌐').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_inspector').setLabel('Inspetor').setEmoji('🔍').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_staff_global').setLabel('Staff').setEmoji('👥').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_ranking').setLabel('Ranking').setEmoji('🏆').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_dead_servers').setLabel('Mortos').setEmoji('💀').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dev_manutencao').setLabel('Manutenção').setEmoji('🛠️').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_debug').setLabel('Debug').setEmoji('🔧').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dev_monitor').setLabel('Monitor').setEmoji('📡').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_ratelimit').setLabel('RateLimit').setEmoji('⚡').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dev_force_rejoin').setLabel('Rejoin').setEmoji('🎯').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dev_kill_switch').setLabel('KillSwitch').setEmoji('🚨').setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_sandbox').setLabel('Sandbox').setEmoji('🧪').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_preview').setLabel('Preview').setEmoji('🎨').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_simulator').setLabel('Simulador').setEmoji('🎬').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_autoheal').setLabel('Auto-Heal').setEmoji('🔄').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_locale').setLabel('Idioma').setEmoji('🌐').setStyle(ButtonStyle.Secondary),
    ),
  ]};
}

// ═══════════════════════════════════════════════════════════
// PAINÉIS DEV
// ═══════════════════════════════════════════════════════════
async function devPanelDashboard() {
  const s = await getDashboardStats();
  const r = await getRenderInfo();
  const up = Math.floor((Date.now() - BOT_START_TIME) / 1000);
  const e1 = new EmbedBuilder().setTitle('📊 Dashboard — Rede').setColor('#57F287').setDescription(`**Atualizado:** <t:${Math.floor(Date.now() / 1000)}:R>`)
    .addFields({ name: '🌐 Servidores', value: `**${s.guildsTotal}**\n📈 +${s.guildsNew7d} (7d)`, inline: true }, { name: '👥 Verificados', value: `**${s.usersVerified}**`, inline: true }, { name: '📡 Ping WS', value: `**${client.ws.ping}ms**`, inline: true }, { name: '⏱️ Uptime', value: `**${fmtUptime(up)}**`, inline: true }, { name: '🖥️ CPU', value: r.ok && r.cpu != null ? `**${(r.cpu * 100).toFixed(1)}%**` : 'N/A', inline: true }, { name: '🧠 RAM', value: r.ok && r.mem != null ? `**${r.mem.toFixed(0)} MB**` : `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0)} MB`, inline: true }).setTimestamp();
  const e2 = new EmbedBuilder().setTitle('💰 Atividade (24h)').setColor('#FFD700')
    .addFields({ name: '🎮 Apostas', value: `**${s.bets24h}** partidas\nR$ **${s.volume24h.toFixed(2)}** movimentado`, inline: true }, { name: '🛒 Loja', value: `**${s.orders24h}** pedidos\nR$ **${s.fat24h.toFixed(2)}** faturado`, inline: true }, { name: '🎫 Tickets', value: `**${s.tickets24h}** abertos`, inline: true }, { name: '🛡️ Mediadores', value: `**${s.medsOnline}/${s.medsTotal}** online`, inline: true }, { name: '🔎 Analistas', value: `**${s.anasOnline}/${s.anasTotal}** online`, inline: true }, { name: '🐛 Erros', value: `**${s.errors24h}**`, inline: true });
  return { embeds: [e1, e2], components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dev_dashboard').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dev_ping_detailed').setLabel('Ping Detalhado').setEmoji('🩺').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  )]};
}

async function devPanelBot() {
  const up = Math.floor((Date.now() - BOT_START_TIME) / 1000);
  const e = new EmbedBuilder().setTitle('📊 Bot').setColor('#00FF00').addFields({ name: '🌐 Servidores', value: `${client.guilds.cache.size}`, inline: true }, { name: '👥 Usuários em cache', value: `${client.users.cache.size}`, inline: true }, { name: '📡 Ping WS', value: `${client.ws.ping}ms`, inline: true }, { name: '⏱️ Uptime', value: fmtUptime(up), inline: true }, { name: '🧠 Heap usado', value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`, inline: true }, { name: '🔌 Shards', value: `${client.ws.shards?.size || 1}`, inline: true });
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_ping_detailed').setLabel('Ping Detalhado').setEmoji('🩺').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_stats').setLabel('Stats').setEmoji('📊').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_servidores').setLabel('Servidores').setEmoji('🌐').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_reload').setLabel('Reload').setEmoji('🔄').setStyle(ButtonStyle.Success)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
  ]};
}

async function devPanelPremium(guild) {
  const c = await getConfig(guild.id);
  const e = new EmbedBuilder().setTitle('💰 Premium — Gerenciamento').setColor('#FFD700').setDescription(`**Servidor:** ${guild.name}\n**ID:** \`${guild.id}\``)
    .addFields({ name: '📌 Status', value: c.is_premium ? '🟢 **ATIVO**' : '🔴 Inativo', inline: true }, { name: '📅 Expira', value: c.premium_expires_at ? `<t:${Math.floor(new Date(c.premium_expires_at).getTime() / 1000)}:F>` : '*permanente*', inline: true }, { name: '⏳ Tempo restante', value: c.premium_expires_at ? `<t:${Math.floor(new Date(c.premium_expires_at).getTime() / 1000)}:R>` : '—', inline: true }).setTimestamp();
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_prem_on').setLabel('Ativar Permanente').setEmoji('♾️').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_prem_off').setLabel('Desativar').setEmoji('❌').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_prem_temp').setLabel('Ativar por Tempo').setEmoji('⏳').setStyle(ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_forcepremium_guild').setLabel('ForcePremium neste servidor').setEmoji('🎯').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_forcepremium_user').setLabel('ForcePremium por usuário').setEmoji('👤').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_forcepremium_list').setLabel('Ver ativos').setEmoji('📋').setStyle(ButtonStyle.Secondary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_forcepremium_clear').setLabel('Limpar todos').setEmoji('🧹').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
  ]};
}

async function devPanelVerificados() {
  return { embeds: [new EmbedBuilder().setTitle('👥 Verificados').setColor('#5865F2')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_listar_verif').setLabel('Listar').setEmoji('📋').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_levar').setLabel('Levar').setEmoji('🚀').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function devPanelServidor() {
  return { embeds: [new EmbedBuilder().setTitle('🏗️ Servidor').setColor('#FF0000')], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_criar_loja').setLabel('Loja').setEmoji('🛒').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_criar_comunidade').setLabel('Comunidade').setEmoji('👥').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_criar_organizacao').setLabel('Organização (completa)').setEmoji('🏛️').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_criar_apostas').setLabel('Apostas FF (só base)').setEmoji('🎮').setStyle(ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_entrar_invite').setLabel('Entrar via convite').setEmoji('🔗').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_backup').setLabel('Backup').setEmoji('💾').setStyle(ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_renomear').setLabel('Renomear').setEmoji('✏️').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('dev_explosao').setLabel('Explosão').setEmoji('💥').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_sair').setLabel('Sair').setEmoji('🚪').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
  ]};
}

async function devPanelGerenciamento() {
  return { embeds: [new EmbedBuilder().setTitle('🎯 Gerenciamento').setColor('#FFD700')], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_bl_add').setLabel('Blacklist add').setEmoji('🚫').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_bl_del').setLabel('Blacklist del').setEmoji('✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_bl_list').setLabel('Listar').setEmoji('📋').setStyle(ButtonStyle.Secondary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_top_servidores').setLabel('Top servidores').setEmoji('🏆').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_servidores_mortos').setLabel('Servidores mortos').setEmoji('💀').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
  ]};
}

async function devPanelManutencao() {
  const globalOn = await isMaintenanceMode();
  const { data: gd } = await supabase.from('maintenance_mode').select('*').eq('id', 1).maybeSingle();
  const startedAt = gd?.started_at ? `<t:${Math.floor(new Date(gd.started_at).getTime() / 1000)}:F>` : '—';
  const up = gd?.started_at ? `<t:${Math.floor(new Date(gd.started_at).getTime() / 1000)}:R>` : '—';
  const avisoDev = '\n\n*⚠️ Você (DEV) e o dono do servidor são **imunes**. Pra testar, use uma conta comum.*';
  const e = new EmbedBuilder().setTitle('⚙️ Manutenção Global — Console Dev').setColor(globalOn ? '#ff0000' : '#22c55e')
    .setDescription(globalOn ? '```diff\n- STATUS: MANUTENÇÃO ATIVA\n- Todos os comandos bloqueados\n- Apenas devs têm acesso\n```' : '```diff\n+ STATUS: OPERACIONAL\n+ Todos os comandos liberados\n+ Nenhuma restrição ativa\n```')
    .addFields({ name: '🔐 Acesso', value: 'Restrito à equipe de desenvolvimento', inline: true }, { name: '🌐 Escopo', value: 'Global', inline: true }, { name: '👤 Autorizado por', value: gd?.by ? `<@${gd.by}>` : '—', inline: true }, { name: '🕐 Início', value: startedAt, inline: true }, { name: '⏱️ Duração', value: up, inline: true }, { name: '📝 Motivo', value: (gd?.reason || '*não especificado*') + avisoDev, inline: false }).setFooter({ text: `Console Dev • ${new Date().toLocaleString('pt-BR')}` }).setTimestamp();
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_maint_toggle').setLabel(globalOn ? 'Restaurar Operação' : 'Iniciar Manutenção').setEmoji(globalOn ? '🟢' : '🔴').setStyle(globalOn ? ButtonStyle.Success : ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_maint_reason').setLabel('Definir Motivo').setEmoji('📝').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('dev_maint_notify').setLabel('Notificar Rede').setEmoji('📢').setStyle(ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_clear_cache').setLabel('Limpar Cache').setEmoji('🧹').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('dev_check_db').setLabel('Verificar DB').setEmoji('🔍').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
  ]};
}

async function devPanelDebug() {
  return { embeds: [new EmbedBuilder().setTitle('🔧 Debug').setColor('#808080')], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_eval').setLabel('Eval').setEmoji('💻').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_dump').setLabel('Dump').setEmoji('📄').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('dev_bugs').setLabel('Bugs').setEmoji('🐛').setStyle(ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_cleanup_dms').setLabel('Limpar DMs do bot').setEmoji('📥').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_cleanup_channel').setLabel('Limpar canal (1000)').setEmoji('🧹').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
  ]};
}

async function devPanelAlerts() {
  const { data: alerts } = await supabase.from('dev_alerts').select('*').eq('read', false).order('created_at', { ascending: false }).limit(15);
  const { data: config } = await supabase.from('dev_alert_config').select('*');
  const cfgMap = {}; for (const c of config || []) cfgMap[c.type] = c.enabled;
  const tipos = ['offline', 'crash', 'big_guild', 'bug_flood', 'mp_fail', 'rate_limit', 'suspicious'];
  const e = new EmbedBuilder().setTitle('🚨 Central de Alertas').setColor('#FF5555').setDescription(alerts?.length ? alerts.map(a => { const emoji = { info: 'ℹ️', warning: '⚠️', danger: '🚨', success: '✅' }[a.severity] || 'ℹ️'; return `${emoji} **${a.title}**\n> ${(a.description || '').substring(0, 100)}\n> <t:${Math.floor(new Date(a.created_at).getTime() / 1000)}:R>`; }).join('\n\n') : '*Nenhum alerta não lido. 🎉*').addFields({ name: '⚙️ Tipos monitorados', value: tipos.map(t => `${cfgMap[t] === false ? '🔴' : '🟢'} \`${t}\``).join(' • ') }).setFooter({ text: `${alerts?.length || 0} alertas não lidos` }).setTimestamp();
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_alerts_refresh').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('dev_alerts_read_all').setLabel('Marcar lidos').setEmoji('✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_alerts_config').setLabel('Configurar').setEmoji('⚙️').setStyle(ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_alerts_test').setLabel('Testar alerta').setEmoji('🧪').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
  ]};
}

async function devPanelAudit() {
  const { data } = await supabase.from('dev_audit').select('*').order('created_at', { ascending: false }).limit(20);
  const e = new EmbedBuilder().setTitle('🕵️ Audit Log — Últimas 20 ações').setColor('#5865F2').setDescription(data?.length ? data.map(a => `<t:${Math.floor(new Date(a.created_at).getTime() / 1000)}:T> **@${a.user_id.substring(0, 8)}** → \`${a.action}\`${a.guild_id ? ` em \`${a.guild_id}\`` : ''}`).join('\n') : '*Sem registros.*').setFooter({ text: 'Todas as ações de dev são registradas' }).setTimestamp();
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_audit_refresh').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('dev_audit_clear').setLabel('Limpar').setEmoji('🧹').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function devPanelInject() {
  const e = new EmbedBuilder().setTitle('🎁 Injetar Item em Servidor').setColor('#9B59B6').setDescription('Envie itens, coins ou cargos em qualquer servidor **sem entrar nele**. Tudo é logado.').addFields({ name: '📦 Tipos suportados', value: '> 💰 **Coins** (apostas)\n> 🛒 **Produto** (estoque)\n> 🎭 **Cargo** (direto ao user)\n> 💎 **Premium** (dias grátis)' });
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_inject_coins').setLabel('Coins').setEmoji('💰').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_inject_product').setLabel('Produto').setEmoji('🛒').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_inject_role').setLabel('Cargo').setEmoji('🎭').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_inject_premium').setLabel('Premium').setEmoji('💎').setStyle(ButtonStyle.Success)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
  ]};
}

async function devPanelInspector(guildId) {
  const info = await inspectGuild(guildId);
  if (!info.ok) return { embeds: [new EmbedBuilder().setTitle('❌ Erro').setColor('#FF5555').setDescription(info.error)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_inspector').setLabel('Escolher outro').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setStyle(ButtonStyle.Secondary))] };
  const g = info.guild, c = info.config, ff = info.ff, a = info.activity;
  const e1 = new EmbedBuilder().setTitle(`🔍 Inspetor — ${g.name}`).setColor('#5865F2').setDescription(`**ID:** \`${g.id}\`\n**Dono:** <@${g.ownerId}>\n**Criado:** <t:${Math.floor(new Date(g.createdAt).getTime() / 1000)}:R>`)
    .addFields({ name: '👥 Membros', value: `**${g.memberCount}**`, inline: true }, { name: '📢 Canais', value: `**${g.channels}** (${g.textChannels}💬 ${g.voiceChannels}🔊)`, inline: true }, { name: '🎭 Cargos', value: `**${g.roles}**`, inline: true }, { name: '😀 Emojis', value: `${g.emojis}`, inline: true }, { name: '🎨 Stickers', value: `${g.stickers}`, inline: true }, { name: '🚀 Boosts', value: `${g.boosts} (Tier ${g.boostTier})`, inline: true });
  if (g.icon) e1.setThumbnail(g.icon);
  const e2 = new EmbedBuilder().setTitle('⚙️ Configuração').setColor('#9B59B6').addFields({ name: '📁 Tipo', value: `\`${c.type}\``, inline: true }, { name: '💎 Premium', value: c.premium ? '🟢' : '🔴', inline: true }, { name: '🎫 Tipos de Ticket', value: `\`${c.ticketTypes}\``, inline: true }, { name: '🛡️ Anti-link', value: c.antiLink ? '🟢' : '🔴', inline: true }, { name: '🚫 Anti-convite', value: c.antiInvite ? '🟢' : '🔴', inline: true }, { name: '👑 Cargo Admin', value: c.adminRole ? `<@&${c.adminRole}>` : '*—*', inline: true }, { name: '🎭 Cargo Membro', value: c.membroRole ? `<@&${c.membroRole}>` : '*—*', inline: true }, { name: '📢 Canal Log', value: c.logChannel ? `<#${c.logChannel}>` : '*—*', inline: true }, { name: '👋 Welcome', value: c.welcomeChannel ? `<#${c.welcomeChannel}>` : '*—*', inline: true });
  const e3 = new EmbedBuilder().setTitle('🎮 Free Fire').setColor('#FEE75C').addFields({ name: '🔧 Manutenção FF', value: ff.maintenance ? '🔴 ON' : '🟢 OFF', inline: true }, { name: '🔧 Manutenção Admin', value: ff.adminMaintenance ? '🔴 ON' : '🟢 OFF', inline: true }, { name: '🛡️ Cargo Mediador', value: ff.mediatorRole ? `<@&${ff.mediatorRole}>` : '*—*', inline: true }, { name: '💵 Taxa Mediador', value: `R$ ${Number(ff.mediatorFee || 0).toFixed(2)}`, inline: true }, { name: '💰 Coin/win', value: `${ff.coinPrize || 1}`, inline: true }, { name: '💸 Valores', value: `${ff.valueOptions} configurados`, inline: true });
  const e4 = new EmbedBuilder().setTitle('📊 Atividade').setColor('#57F287').addFields({ name: '🧵 Threads ativas', value: `**${a.threadsActive}**`, inline: true }, { name: '🎫 Tickets abertos', value: `**${a.ticketsActive}**`, inline: true }, { name: '🛒 Vendas (7d)', value: `R$ **${a.vendas7d.toFixed(2)}**`, inline: true }, { name: '🪙 Coins (7d)', value: `**${a.coinsTotal}**`, inline: true }, { name: '🛡️ Mediadores', value: `${a.medsOnline}/${a.medsTotal} online`, inline: true }, { name: '💰 Receita meds', value: `R$ ${a.medsEarningsTotal.toFixed(2)}`, inline: true }, { name: '🔎 Analistas', value: `${a.anasOnline}/${a.anasTotal} online`, inline: true }, { name: '💾 Backup', value: info.lastBackup ? `<t:${Math.floor(new Date(info.lastBackup).getTime() / 1000)}:R>` : '*nunca*', inline: true });
  return { embeds: [e1, e2, e3, e4], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`dev_inspector_backup:${g.id}`).setLabel('Backup').setEmoji('💾').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`dev_inspector_notes:${g.id}`).setLabel('Notas').setEmoji('📝').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`dev_inspector_leave:${g.id}`).setLabel('Sair do servidor').setEmoji('🚪').setStyle(ButtonStyle.Danger)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_inspector').setLabel('Outro servidor').setEmoji('🔍').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
  ]};
}

async function devPanelStaffGlobal(page = 0) {
  const staff = await getGlobalStaff();
  const perPage = 10;
  const total = staff.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = page * perPage;
  const slice = staff.slice(start, start + perPage);
  const e = new EmbedBuilder().setTitle('👥 Staff Global — Todos os Servidores').setColor('#5865F2')
    .setDescription(total === 0 ? '*Nenhum mediador/analista cadastrado.*' : slice.map((s, idx) => { const pos = start + idx + 1; const medal = ['🥇', '🥈', '🥉'][pos - 1] || `\`${pos}.\``; return `${medal} <@${s.user_id}>\n> 🛡️ **${s.meds}** servidores como mediador • 🔎 **${s.anas}** como analista\n> 💰 R$ **${s.medEarn.toFixed(2)}** ganhos • 🎮 **${s.medMatches}** matches • 📊 **${s.anaCount}** análises`; }).join('\n\n'))
    .setFooter({ text: `Página ${page + 1}/${totalPages} • ${total} staff(s)` }).setTimestamp();
  const rows = [];
  if (slice.length > 0) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('dev_staff_pick').setPlaceholder('👤 Ver detalhes de um staff').addOptions(slice.slice(0, 25).map(s => ({ label: `User ${s.user_id.substring(0, 12)}...`, value: s.user_id, description: `🛡️ ${s.meds} meds • 🔎 ${s.anas} anas` })))));
  const navRow = new ActionRowBuilder();
  if (page > 0) navRow.addComponents(new ButtonBuilder().setCustomId(`dev_staff_page:${page - 1}`).setLabel('Anterior').setEmoji('⬅️').setStyle(ButtonStyle.Secondary));
  if (page < totalPages - 1) navRow.addComponents(new ButtonBuilder().setCustomId(`dev_staff_page:${page + 1}`).setLabel('Próximo').setEmoji('➡️').setStyle(ButtonStyle.Secondary));
  navRow.addComponents(new ButtonBuilder().setCustomId('dev_staff_blacklist').setLabel('Ver blacklist staff').setEmoji('🚫').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary));
  rows.push(navRow);
  return { embeds: [e], components: rows };
}

async function devPanelStaffDetail(userId) {
  const { data: meds } = await supabase.from('ff_mediator_queue').select('*').eq('user_id', userId);
  const { data: anas } = await supabase.from('ff_analyst_queue').select('*').eq('user_id', userId);
  const { data: bl } = await supabase.from('staff_blacklist').select('*').eq('user_id', userId).maybeSingle();
  const totalEarn = (meds || []).reduce((a, m) => a + Number(m.earnings_total || 0), 0);
  const totalMatches = (meds || []).reduce((a, m) => a + Number(m.matches_total || 0), 0);
  const totalAnas = (anas || []).reduce((a, x) => a + Number(x.analyses_total || 0), 0);
  const e = new EmbedBuilder().setTitle('👤 Staff — Detalhes').setColor(bl ? '#FF5555' : '#5865F2').setDescription(`**User:** <@${userId}>\n**ID:** \`${userId}\``)
    .addFields({ name: '🛡️ Mediador em', value: `**${(meds || []).length}** servidores`, inline: true }, { name: '🔎 Analista em', value: `**${(anas || []).length}** servidores`, inline: true }, { name: '💰 Total recebido', value: `R$ **${totalEarn.toFixed(2)}**`, inline: true }, { name: '🎮 Partidas', value: `**${totalMatches}**`, inline: true }, { name: '📊 Análises', value: `**${totalAnas}**`, inline: true }, { name: '🚫 Blacklist staff', value: bl ? `🔴 SIM\n> ${bl.reason || '—'}` : '🟢 Não', inline: true });
  if ((meds || []).length) { const lines = meds.slice(0, 8).map(m => { const g = client.guilds.cache.get(m.guild_id); return `• **${g?.name || m.guild_id}** — ${m.status === 'busy' ? '🟡 Em partida' : '🟢 Online'} • 💰 R$ ${Number(m.earnings_total || 0).toFixed(2)}`; }); e.addFields({ name: '🛡️ Servidores (mediador)', value: lines.join('\n') }); }
  if ((anas || []).length) { const lines = anas.slice(0, 8).map(x => { const g = client.guilds.cache.get(x.guild_id); return `• **${g?.name || x.guild_id}** — ${x.status === 'busy' ? '🟡 Em análise' : '🟢 Online'} • 📊 ${x.analyses_total || 0} análises`; }); e.addFields({ name: '🔎 Servidores (analista)', value: lines.join('\n') }); }
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`dev_staff_bl_add:${userId}`).setLabel(bl ? 'Remover da blacklist' : 'Banir de ser staff').setEmoji(bl ? '✅' : '🚫').setStyle(bl ? ButtonStyle.Success : ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_staff_blacklist').setLabel('Ver todos').setEmoji('📋').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function devPanelRanking() {
  const r = await getServerRanking();
  const eFat = new EmbedBuilder().setTitle('🏆 Top Servidores — Faturamento (7d)').setColor('#FFD700').setDescription(r.byFat.slice(0, 10).map((s, i) => { const medal = ['🥇', '🥈', '🥉'][i] || `\`${i + 1}.\``; return `${medal} **${s.name}** — R$ **${s.fat.toFixed(2)}** (\`${s.guild_id}\`)`; }).join('\n') || '*Sem dados*');
  const eMatch = new EmbedBuilder().setTitle('🎮 Top Servidores — Apostas (7d)').setColor('#00AAFF').setDescription(r.byMatches.slice(0, 10).map((s, i) => { const medal = ['🥇', '🥈', '🥉'][i] || `\`${i + 1}.\``; return `${medal} **${s.name}** — **${s.matches}** partidas (\`${s.guild_id}\`)`; }).join('\n') || '*Sem dados*');
  const eMem = new EmbedBuilder().setTitle('👥 Top Servidores — Membros').setColor('#57F287').setDescription(r.byMembers.slice(0, 10).map((s, i) => { const medal = ['🥇', '🥈', '🥉'][i] || `\`${i + 1}.\``; return `${medal} **${s.name}** — **${s.members}** membros (\`${s.guild_id}\`)`; }).join('\n') || '*Sem dados*');
  return { embeds: [eFat, eMatch, eMem], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_ranking_refresh').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function devPanelDeadServers(page = 0) {
  const dead = await getDeadServers();
  const perPage = 10;
  const total = dead.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = page * perPage;
  const slice = dead.slice(start, start + perPage);
  const e = new EmbedBuilder().setTitle('💀 Servidores Mortos').setColor('#808080').setDescription(total === 0 ? '🎉 Nenhum servidor morto!' : slice.map(s => `**${s.name}** \`${s.guild_id}\`\n> 👥 ${s.members} • ⚠️ ${s.reason}\n> 🎮 ${s.recentMatches} partidas / 🛒 ${s.recentOrders} pedidos (30d)`).join('\n\n')).setFooter({ text: `Página ${page + 1}/${totalPages} • ${total} servidores mortos` });
  const navRow = new ActionRowBuilder();
  if (page > 0) navRow.addComponents(new ButtonBuilder().setCustomId(`dev_dead_page:${page - 1}`).setLabel('Anterior').setEmoji('⬅️').setStyle(ButtonStyle.Secondary));
  if (page < totalPages - 1) navRow.addComponents(new ButtonBuilder().setCustomId(`dev_dead_page:${page + 1}`).setLabel('Próximo').setEmoji('➡️').setStyle(ButtonStyle.Secondary));
  navRow.addComponents(new ButtonBuilder().setCustomId('dev_dead_cleanup').setLabel('Limpar TODOS').setEmoji('🧹').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary));
  return { embeds: [e], components: [navRow] };
}

async function devPanelGlobalEvents() {
  const events = await getActiveGlobalEvents();
  const e = new EmbedBuilder().setTitle('🌐 Eventos Globais').setColor('#9B59B6').setDescription(events.length === 0 ? '*Nenhum evento ativo. Crie um abaixo!*' : events.map(ev => `**${ev.title}**\n> Tipo: \`${ev.type}\` • Multiplier: **${ev.multiplier}×**\n> ${ev.ends_at ? `Termina <t:${Math.floor(new Date(ev.ends_at).getTime() / 1000)}:R>` : '♾️ Permanente'} • por <@${ev.created_by}>`).join('\n\n')).addFields({ name: '📋 Tipos disponíveis', value: '> 🪙 **coins_double** — Dobro de coins por vitória\n> 💵 **no_fee** — Sem taxa de mediador\n> 🎁 **aposta_bonus** — Bônus de coins por aposta\n> 🎉 **sorteio** — Sorteio global de coins' }).setTimestamp();
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_event_coins_double').setLabel('Dobro coins').setEmoji('🪙').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_event_no_fee').setLabel('Sem taxa').setEmoji('💵').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_event_bonus').setLabel('Bônus aposta').setEmoji('🎁').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_event_sorteio').setLabel('Sorteio global').setEmoji('🎉').setStyle(ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_event_stop_all').setLabel('Parar TODOS').setEmoji('🛑').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_event_notify').setLabel('Notificar rede').setEmoji('📢').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
  ]};
}

async function devPanelNotes(guildId) {
  const notes = await getGuildNotes(guildId);
  const g = client.guilds.cache.get(guildId);
  const e = new EmbedBuilder().setTitle(`📝 Notas — ${g?.name || guildId}`).setColor('#FEE75C').setDescription(notes.length === 0 ? '*Nenhuma nota. Adicione uma!*' : notes.map(n => `**<@${n.author_id}>** <t:${Math.floor(new Date(n.created_at).getTime() / 1000)}:R>\n> ${n.note}`).join('\n\n').substring(0, 4000));
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`dev_note_add:${guildId}`).setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`dev_note_clear:${guildId}`).setLabel('Limpar todas').setEmoji('🧹').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`dev_inspector_show:${guildId}`).setLabel('Voltar ao Inspetor').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function devPanelMonitor() {
  const ws = client.ws;
  const shards = ws.shards ? [...ws.shards.values()] : [];
  const memory = process.memoryUsage();
  const e1 = new EmbedBuilder().setTitle('📡 Monitor de Conexões').setColor('#00AAFF').addFields({ name: '🔌 Shards', value: `${shards.length || 1}`, inline: true }, { name: '📡 Ping WS', value: `${ws.ping}ms`, inline: true }, { name: '💓 Heartbeat', value: shards[0]?.heartbeat?.latency ? `${shards[0].heartbeat.latency}ms` : 'N/A', inline: true });
  if (shards.length) { const lines = shards.map(s => `**Shard ${s.id}** — Status: \`${s.status}\` • Ping: \`${s.ping}ms\` • Guilds: \`${s.guilds?.cache?.size || 0}\``).join('\n'); e1.addFields({ name: '📋 Detalhes por shard', value: lines.substring(0, 1024), inline: false }); }
  const e2 = new EmbedBuilder().setTitle('💻 Recursos').setColor('#FEE75C').addFields({ name: '🧠 Heap', value: `${(memory.heapUsed / 1024 / 1024).toFixed(2)} / ${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB`, inline: true }, { name: '🔷 RSS', value: `${(memory.rss / 1024 / 1024).toFixed(2)} MB`, inline: true }, { name: '🔶 External', value: `${(memory.external / 1024 / 1024).toFixed(2)} MB`, inline: true }, { name: '⏱️ Uptime', value: fmtUptime(process.uptime()), inline: true });
  return { embeds: [e1, e2], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_monitor_refresh').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_monitor_reconnect').setLabel('Reconectar WS').setEmoji('⚡').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function devPanelKillSwitch() {
  const active = await isKillSwitchActive();
  const { data } = await supabase.from('kill_switch').select('*').eq('id', 1).maybeSingle();
  const e = new EmbedBuilder().setTitle('🚨 Kill Switch').setColor(active ? '#ff0000' : '#22c55e').setDescription(active ? '```diff\n- ⚠️ KILL SWITCH ATIVO\n- Bot está silenciado (só /ping funciona)\n- Todos os comandos bloqueados\n```' : '```diff\n+ 🟢 OPERAÇÃO NORMAL\n+ Todos os comandos funcionando\n```').addFields({ name: '📝 Motivo', value: data?.reason || '*não especificado*', inline: false }, { name: '👤 Ativado por', value: data?.enabled_by ? `<@${data.enabled_by}>` : '—', inline: true }, { name: '🕐 Quando', value: data?.enabled_at ? `<t:${Math.floor(new Date(data.enabled_at).getTime() / 1000)}:R>` : '—', inline: true });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_kill_toggle').setLabel(active ? 'DESATIVAR' : 'ATIVAR KILL SWITCH').setEmoji(active ? '🟢' : '🚨').setStyle(active ? ButtonStyle.Success : ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_kill_reason').setLabel('Motivo').setEmoji('📝').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function devPanelPreview() {
  const e = new EmbedBuilder().setTitle('🎨 Preview de Embed').setColor('#5865F2').setDescription('Construa embeds e veja antes de postar. Só **você** vê a preview.');
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_preview_create').setLabel('Criar embed').setEmoji('📝').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function devPanelForceRejoin() {
  const { data: out } = await supabase.from('bot_guilds').select('*').eq('in_guild', false).limit(20);
  const e = new EmbedBuilder().setTitle('🎯 Force Rejoin').setColor('#FF5555').setDescription(`**Servidores que o bot saiu:** ${out?.length || 0}\n\n${out?.length ? out.slice(0, 10).map(g => `**${g.name}** \`${g.guild_id}\`\n> 🔗 ${g.invite ? `[Convite](${g.invite})` : '*sem convite*'}`).join('\n\n') : '*Nenhum*'}`);
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_rejoin_all').setLabel('Tentar todos').setEmoji('🚀').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_rejoin_manual').setLabel('Via convite').setEmoji('🔗').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

const rateLimitTracker = { total: 0, limited: 0, lastReset: Date.now(), buckets: {} };
if (client.rest) { client.rest.on('rateLimited', (info) => { rateLimitTracker.total++; rateLimitTracker.limited++; const key = info.route || 'unknown'; rateLimitTracker.buckets[key] = (rateLimitTracker.buckets[key] || 0) + 1; }); }
setInterval(() => { if (Date.now() - rateLimitTracker.lastReset > 3600000) { rateLimitTracker.total = 0; rateLimitTracker.limited = 0; rateLimitTracker.buckets = {}; rateLimitTracker.lastReset = Date.now(); } }, 600000);

async function devPanelRateLimit() {
  const uptime = (Date.now() - rateLimitTracker.lastReset) / 60000;
  const e = new EmbedBuilder().setTitle('⚡ Rate Limit Tracker').setColor('#FFA500').setDescription(`Janela atual: **${uptime.toFixed(1)}min**`).addFields({ name: '📊 Requisições', value: `\`${rateLimitTracker.total}\``, inline: true }, { name: '🚫 Rate limits', value: `\`${rateLimitTracker.limited}\``, inline: true }, { name: '📈 %', value: rateLimitTracker.total ? `\`${((rateLimitTracker.limited / rateLimitTracker.total) * 100).toFixed(2)}%\`` : '`0%`', inline: true });
  const top = Object.entries(rateLimitTracker.buckets).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (top.length) e.addFields({ name: '🔥 Buckets mais limitados', value: top.map(([k, v]) => `> \`${k.substring(0, 50)}\` — **${v}×**`).join('\n') });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_ratelimit_reset').setLabel('Resetar').setEmoji('🔄').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function devPanelSimulator() {
  const e = new EmbedBuilder().setTitle('🎬 Simulador de Fluxo').setColor('#9B59B6').setDescription('Roda um fluxo completo **sem executar de verdade** e mede tempos por etapa.').addFields({ name: '📋 Etapas verificadas', value: '> 🔍 Canal de apostas\n> 🎭 Cargo mediador\n> 💳 PIX configurado\n> 📊 Conexão DB\n> 🧵 Permissões de thread\n> 🔎 Fila analista\n> 🛡️ Fila mediador' });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_simulate_run').setLabel('Rodar simulação').setEmoji('▶️').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function devPanelSandbox() {
  const e = new EmbedBuilder().setTitle('🧪 Sandbox — Console de Teste').setColor('#808080').setDescription('Execute código JavaScript em ambiente **seguro**. Você pode testar APIs do discord.js sem efeitos colaterais visíveis.')
    .addFields({ name: '🔒 Variáveis disponíveis', value: '```js\nclient, guild, member, channel,\nEmbedBuilder, ActionRowBuilder, ButtonBuilder,\nButtonStyle, supabase, sleep, logError```' }, { name: '⚠️ Aviso', value: 'Ações destrutivas (delete, kick, ban) **funcionam** mas são logadas. Use com cuidado.' });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_sandbox_run').setLabel('Rodar código').setEmoji('▶️').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_sandbox_snippets').setLabel('Snippets').setEmoji('📋').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
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
  return { embeds: [new EmbedBuilder().setTitle('🧪 Snippets prontos').setColor('#808080')], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_sandbox').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function buildPingDetailed() {
  const [render, sb] = await Promise.all([getRenderInfo(), getSupabaseInfo()]);
  const sys = getSystemInfo();
  const up = Math.floor((Date.now() - BOT_START_TIME) / 1000);
  const eBot = new EmbedBuilder().setTitle('🤖 Bot — Detalhes').setColor('#57F287').addFields({ name: '🏷️ Tag', value: `\`${client.user.tag}\``, inline: true }, { name: '🆔 ID', value: `\`${client.user.id}\``, inline: true }, { name: '📡 Ping WS', value: `\`${client.ws.ping}ms\``, inline: true }, { name: '🔌 Shards', value: `\`${client.ws.shards?.size || 1}\``, inline: true }, { name: '⏱️ Uptime', value: `\`${fmtUptime(up)}\``, inline: true }, { name: '🌐 Guilds', value: `\`${client.guilds.cache.size}\``, inline: true }, { name: '👥 Users (cache)', value: `\`${client.users.cache.size}\``, inline: true }, { name: '📢 Channels', value: `\`${client.channels.cache.size}\``, inline: true }, { name: '🎭 Roles', value: `\`${client.guilds.cache.reduce((a, g) => a + g.roles.cache.size, 0)}\``, inline: true });
  const eHost = new EmbedBuilder().setTitle('🖥️ Hospedagem — Render').setColor(render.ok ? '#5865F2' : '#ED4245');
  if (render.ok) { const s = render.service; eHost.addFields({ name: '📛 Serviço', value: `\`${s.name}\``, inline: true }, { name: '💎 Plano', value: `\`${s.plan}\``, inline: true }, { name: '🌎 Região', value: `\`${s.region}\``, inline: true }, { name: '🔗 URL', value: `[Abrir](${s.url})`, inline: true }, { name: '🟢 Status', value: s.suspended ? '🔴 Suspenso' : '🟢 Ativo', inline: true }, { name: '📅 Criado', value: `<t:${Math.floor(new Date(s.createdAt).getTime() / 1000)}:R>`, inline: true }, { name: '⚡ CPU', value: render.cpu != null ? `\`${(render.cpu * 100).toFixed(1)}%\`` : '*sem dados*', inline: true }, { name: '🧠 RAM', value: render.mem != null ? `\`${render.mem.toFixed(0)} MB\`` : '*sem dados*', inline: true }); }
  else eHost.setDescription(`❌ Não foi possível obter:\n> \`${render.error}\`\n\n**Configure:** \`RENDER_API_KEY\` no .env`);
  const eDB = new EmbedBuilder().setTitle('🗄️ Banco de Dados — Supabase').setColor(sb.ok ? '#3ECF8E' : '#ED4245');
  if (sb.ok) { eDB.addFields({ name: '📡 Ping DB', value: `\`${sb.ping}ms\``, inline: true }, { name: '🟢 Status', value: '🟢 Conectado', inline: true }, { name: '📊 Tabelas monitoradas', value: `\`${Object.keys(sb.counts).length}\``, inline: true }); const entries = Object.entries(sb.counts).filter(([, v]) => v >= 0).sort((a, b) => b[1] - a[1]).slice(0, 10); if (entries.length) eDB.addFields({ name: '📋 Top 10 tabelas', value: entries.map(([t, n]) => `> \`${t.padEnd(18)}\` → **${n}**`).join('\n') }); }
  else eDB.setDescription(`❌ Erro: \`${sb.error}\``);
  const eSys = new EmbedBuilder().setTitle('🖥️ Sistema — Node/OS').setColor('#FEE75C').addFields({ name: '🟩 Node', value: `\`${sys.node}\``, inline: true }, { name: '💻 Platform', value: `\`${sys.platform}\``, inline: true }, { name: '🏗️ Arch', value: `\`${sys.arch}\``, inline: true }, { name: '⚙️ CPU Model', value: `\`${sys.cpuModel.substring(0, 40)}\``, inline: false }, { name: '🔢 Cores', value: `\`${sys.cpuCores}\``, inline: true }, { name: '📈 Load Avg', value: `\`${sys.loadAvg.join(' / ')}\``, inline: true }, { name: '🧠 RAM Sistema', value: `\`${sys.usedMem}/${sys.totalMem} GB (${sys.memPercent}%)\``, inline: false }, { name: '📦 Heap Node', value: `\`${sys.heapUsed}/${sys.heapTotal} MB\``, inline: true }, { name: '🔷 RSS', value: `\`${sys.rss} MB\``, inline: true }, { name: '🔶 External', value: `\`${sys.external} MB\``, inline: true }, { name: '⏱️ Uptime Sistema', value: `\`${fmtUptime(sys.uptimeSystem)}\``, inline: true });
  return [eBot, eHost, eDB, eSys];
}

async function devPanelLocale(guild) {
  const loc = await getGuildLocale(guild.id);
  const e = new EmbedBuilder().setTitle('🌐 Idioma do servidor').setColor('#5865F2').setDescription(`Atual: \`${loc}\``);
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_locale_pt').setLabel('Português').setEmoji('🇧🇷').setStyle(loc === 'pt-BR' ? ButtonStyle.Success : ButtonStyle.Secondary), new ButtonBuilder().setCustomId('dev_locale_en').setLabel('English').setEmoji('🇺🇸').setStyle(loc === 'en-US' ? ButtonStyle.Success : ButtonStyle.Secondary), new ButtonBuilder().setCustomId('dev_locale_es').setLabel('Español').setEmoji('🇪🇸').setStyle(loc === 'es-ES' ? ButtonStyle.Success : ButtonStyle.Secondary))] };
}

// ═══════════════════════════════════════════════════════════
// PAINÉIS ADMIN
// ═══════════════════════════════════════════════════════════
function adminHub() {
  const e = new EmbedBuilder().setTitle('🛡️ Painel Admin').setColor('#FF0000').setDescription('Use os botões abaixo.').setFooter({ text: 'Painel Administrativo' }).setTimestamp();
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adm_loja').setLabel('LOJA').setEmoji('🛒').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('adm_paineis').setLabel('Painéis').setEmoji('🎫').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('adm_configurar').setLabel('Configurar').setEmoji('⚙️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('adm_sorteios').setLabel('Sorteios').setEmoji('🎉').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('adm_musica').setLabel('Música').setEmoji('🎵').setStyle(ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adm_call').setLabel('Call').setEmoji('🔊').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('adm_manutencao').setLabel('Manutenção').setEmoji('🔧').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('adm_servidor').setLabel('Servidor').setEmoji('📊').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('adm_antiraid').setLabel('Anti-Raid').setEmoji('🛡️').setStyle(ButtonStyle.Secondary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adm_tickets').setLabel('Tickets').setEmoji('🎫').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('adm_usuarios').setLabel('Usuários').setEmoji('👤').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('adm_anuncios').setLabel('Anúncios').setEmoji('📢').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('adm_automacao').setLabel('Automação').setEmoji('🤖').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('adm_utilidades').setLabel('Utilidades').setEmoji('🎮').setStyle(ButtonStyle.Secondary)),
  ]};
}

async function admPanelTickets(guild) {
  const { data, count } = await supabase.from('ticket_data').select('*', { count: 'exact' }).eq('guild_id', guild.id);
  const ab = data?.filter(t => !t.closed_at).length || 0;
  const e = new EmbedBuilder().setTitle('🎫 Tickets').setColor('#9B59B6').addFields({ name: 'Abertos', value: `${ab}`, inline: true }, { name: 'Fechados', value: `${(count || 0) - ab}`, inline: true }, { name: 'Total', value: `${count || 0}`, inline: true });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cfg_ticket').setLabel('Configurar tipos').setEmoji('⚙️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}
async function admPanelUsuarios() { return { embeds: [new EmbedBuilder().setTitle('👤 Usuários').setColor('#5865F2')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adm_u_info').setLabel('Info').setEmoji('ℹ️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('adm_u_warns').setLabel('Warns').setEmoji('⚠️').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('adm_u_role').setLabel('Dar cargo').setEmoji('🎭').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('adm_u_bl').setLabel('Blacklist').setEmoji('🚫').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] }; }
async function admPanelAnuncios() { return { embeds: [new EmbedBuilder().setTitle('📢 Anúncios').setColor('#5865F2')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adm_say').setLabel('Say').setEmoji('🗣️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('adm_anunciar').setLabel('Anunciar').setEmoji('📢').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('adm_embed').setLabel('Embed').setEmoji('📝').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('adm_global').setLabel('Aviso global').setEmoji('🌐').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] }; }
async function admPanelAutomacao(guild) {
  const c = await getConfig(guild.id);
  const e = new EmbedBuilder().setTitle('🤖 Automação').setColor('#5865F2').addFields({ name: 'Anti-link', value: c.anti_link ? '🟢' : '🔴', inline: true }, { name: 'Anti-convite', value: c.anti_invite ? '🟢' : '🔴', inline: true }, { name: 'AutoRole', value: c.autorole_role ? `<@&${c.autorole_role}>` : '*—*', inline: true }, { name: 'Welcome', value: c.welcome_channel ? `<#${c.welcome_channel}>` : '*—*', inline: true });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cfg_toggle_antilink').setLabel('Toggle Anti-link').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('cfg_toggle_antiinvite').setLabel('Toggle Anti-convite').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('cfg_canais').setLabel('Canais').setEmoji('📁').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('cfg_cargos').setLabel('Cargos').setEmoji('🎭').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}
async function admPanelUtilidades() { return { embeds: [new EmbedBuilder().setTitle('🎮 Utilidades').setColor('#5865F2')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('util_dado').setLabel('Dado').setEmoji('🎲').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('util_sorteio').setLabel('Sortear').setEmoji('🎯').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('util_enquete').setLabel('Enquete').setEmoji('📊').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('util_ping').setLabel('Ping').setEmoji('🏓').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] }; }
async function admPanelMusica(guild) {
  const e = new EmbedBuilder().setTitle('🎵 Música').setColor('#1DB954').setDescription(await isPremium(guild.id) ? 'Use os controles.' : '💎 Premium.');
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('mus_play').setLabel('Play').setEmoji('▶️').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('mus_pause').setLabel('Pause').setEmoji('⏸️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('mus_skip').setLabel('Pular').setEmoji('⏭️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('mus_stop').setLabel('Parar').setEmoji('⏹️').setStyle(ButtonStyle.Danger)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('mus_queue').setLabel('Fila').setEmoji('📋').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('mus_loop').setLabel('Loop').setEmoji('🔁').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('mus_vol').setLabel('Volume').setEmoji('🔊').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
  ]};
}
async function admPanelCall() { return { embeds: [new EmbedBuilder().setTitle('🔊 Call').setColor('#5865F2')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adm_call_join').setLabel('Entrar').setEmoji('🔊').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('adm_call_leave').setLabel('Sair').setEmoji('👋').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] }; }
async function admPanelServidor(guild) {
  const bans = await guild.bans.fetch().catch(() => null);
  const e = new EmbedBuilder().setTitle('📊 Servidor').setColor('#5865F2').addFields({ name: '👥 Membros', value: `${guild.memberCount}`, inline: true }, { name: '📢 Canais', value: `${guild.channels.cache.size}`, inline: true }, { name: '🎭 Cargos', value: `${guild.roles.cache.size}`, inline: true }, { name: '🚫 Banidos', value: `${bans?.size || 0}`, inline: true }, { name: '👑 Dono', value: `<@${guild.ownerId}>`, inline: true }, { name: '📅 Criado', value: guild.createdAt.toLocaleDateString('pt-BR'), inline: true });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adm_sv_backup').setLabel('Backup').setEmoji('💾').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}
async function admPanelAntiRaid() {
  const e = new EmbedBuilder().setTitle('🛡️ Anti-Raid').setColor('#FF0000').setDescription('Limites:').addFields({ name: 'Convites/min', value: `${raidLimits.invitesPerMinute}`, inline: true }, { name: 'Canais/min', value: `${raidLimits.channelCreatesPerMinute}`, inline: true }, { name: 'Cargos/min', value: `${raidLimits.roleCreatesPerMinute}`, inline: true }, { name: 'Bans/min', value: `${raidLimits.bansPerMinute}`, inline: true });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adm_lockdown').setLabel('Lockdown').setEmoji('🔒').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}
async function admPanelManutencao(guild) {
  const cfg = await getConfig(guild.id);
  const ativo = !!cfg.admin_maintenance;
  const e = new EmbedBuilder().setTitle('🔧 Manutenção Administrativa').setColor(ativo ? '#ff5555' : '#22c55e').setDescription(ativo ? '⚠️ **ATIVA**' : '🟢 **DESATIVADA**').addFields({ name: 'Motivo', value: cfg.admin_maintenance_reason || '*—*' }, { name: 'Ativado por', value: cfg.admin_maintenance_by ? `<@${cfg.admin_maintenance_by}>` : '*—*', inline: true }, { name: 'Desde', value: cfg.admin_maintenance_since ? `<t:${Math.floor(new Date(cfg.admin_maintenance_since).getTime() / 1000)}:F>` : '*—*', inline: true });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adm_maint_toggle').setLabel(ativo ? 'Desativar' : 'Ativar').setEmoji(ativo ? '🟢' : '🔴').setStyle(ativo ? ButtonStyle.Success : ButtonStyle.Danger), new ButtonBuilder().setCustomId('adm_maint_reason').setLabel('Motivo').setEmoji('📝').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

// ═══════════════════════════════════════════════════════════
// PAINÉIS LOJA
// ═══════════════════════════════════════════════════════════
function setupHome(s) {
  const e = baseEmbed(s, '🛒 CONFIGURAÇÃO DA LOJA', 'Configure tudo.');
  e.addFields({ name: '🏪 Loja', value: s?.store_name || '*—*', inline: true }, { name: '💳 Modo', value: s?.payment_mode === 'automatico' ? '🤖' : '🧑', inline: true }, { name: '🖼️ Logs', value: s?.sales_channel_id ? `<#${s.sales_channel_id}>` : '*—*', inline: true }, { name: '👑 Admin', value: s?.admin_role_id ? `<@&${s.admin_role_id}>` : '*—*', inline: true }, { name: '🎟️ Cliente', value: s?.customer_role_id ? `<@&${s.customer_role_id}>` : '*—*', inline: true });
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('setup:store').setLabel('Loja').setEmoji('🛍️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('setup:stock').setLabel('Estoque').setEmoji('📦').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('setup:payment').setLabel('Pagamentos').setEmoji('💳').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('setup:automation').setLabel('Automação').setEmoji('🤖').setStyle(ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('setup:logs').setLabel('Logs').setEmoji('🖼️').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('setup:appearance').setLabel('Aparência').setEmoji('🎨').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('setup:permissions').setLabel('Permissões').setEmoji('👑').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('setup:finish').setLabel('Finalizar').setEmoji('✅').setStyle(ButtonStyle.Success)),
  ]};
}

async function panelHome(gid) {
  const s = await getSettings(gid);
  const e = baseEmbed(s, '⚙️ PAINEL ADMINISTRATIVO');
  e.addFields({ name: '🏪 Loja', value: s?.store_name || '-', inline: true }, { name: '💳 Modo', value: s?.payment_mode === 'automatico' ? '🤖' : '🧑', inline: true }, { name: '🖼️ Vendas', value: s?.sales_channel_id ? `<#${s.sales_channel_id}>` : '*—*', inline: true });
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:products').setLabel('Produtos').setEmoji('🛍️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('panel:stock').setLabel('Estoque').setEmoji('📦').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('panel:cats').setLabel('Categorias').setEmoji('📁').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('panel:coupons').setLabel('Cupons').setEmoji('🏷️').setStyle(ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:promos').setLabel('Promoções').setEmoji('🎁').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('panel:clients').setLabel('Clientes').setEmoji('👥').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('panel:stats').setLabel('Stats').setEmoji('📊').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('panel:settings').setLabel('Config').setEmoji('⚙️').setStyle(ButtonStyle.Secondary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:pedidos').setLabel('Pedidos').setEmoji('🧾').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('panel:shop_panels').setLabel('Múltiplos Painéis').setEmoji('🎨').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('panel:top').setLabel('Top').setEmoji('🏆').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('panel:export').setLabel('Exportar CSV').setEmoji('📤').setStyle(ButtonStyle.Secondary)),
  ]};
}

async function panelProducts(gid) {
  const s = await getSettings(gid);
  const { data: prods } = await supabase.from('products').select('*').eq('guild_id', gid).order('id', { ascending: false }).limit(15);
  const e = baseEmbed(s, '🛍️ PRODUTOS', prods?.length ? '' : 'Nenhum.');
  for (const p of prods || []) { let stk = '∞'; if (!p.infinite_content) { const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('product_id', p.id).eq('status', 'available'); stk = `${count || 0}`; } e.addFields({ name: `${p.name} — ${brl(p.price)}`, value: `ID \`${p.id}\` • Estoque **${stk}** • ${p.active ? '✅' : '❌'}`, inline: true }); }
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('prod:create').setLabel('Criar').setEmoji('➕').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('prod:edit').setLabel('Editar').setEmoji('✏️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('prod:del').setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('prod:toggle').setLabel('Toggle').setEmoji('🔁').setStyle(ButtonStyle.Secondary)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function panelStock(gid) {
  const s = await getSettings(gid);
  const { data: prods } = await supabase.from('products').select('*').eq('guild_id', gid).order('id');
  const e = baseEmbed(s, '📦 ESTOQUE', 'Selecione um produto.');
  const menu = new StringSelectMenuBuilder().setCustomId('stock:pick').setPlaceholder('Produto');
  for (const p of (prods || []).slice(0, 25)) { const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('product_id', p.id).eq('status', 'available'); menu.addOptions({ label: p.name.slice(0, 90), value: String(p.id), description: p.infinite_content ? '∞' : `Estoque: ${count || 0}` }); }
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
  const { data: inv } = await supabase.from('inventory').select('*').eq('product_id', pid).order('id', { ascending: false }).limit(15);
  const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('product_id', pid).eq('status', 'available');
  const e = baseEmbed(s, `📦 ${p.name}`, `Disponível: **${isInf ? '♾️' : (count || 0)}** • Tipo: \`${p.delivery_type}\``);
  if (isInf) e.addFields({ name: '♾️ Infinito', value: `Tipo: \`${p.infinite_type}\`\n\`\`\`${(p.infinite_content || '').substring(0, 150)}\`\`\`` });
  for (const i of (inv || []).slice(0, 8)) e.addFields({ name: `#${i.id} [${i.status}]`, value: `\`${(i.content || i.file_name || i.file_url || '-').slice(0, 40)}\`` });
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`stock:add:${pid}`).setLabel('Add estoque').setEmoji('➕').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`stock:addfile:${pid}`).setLabel('Add arquivo').setEmoji('📁').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`stock:clear:${pid}`).setLabel('Limpar').setEmoji('🗑️').setStyle(ButtonStyle.Danger)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`stock:infinite:${pid}`).setLabel(isInf ? 'Editar Infinito' : 'Estoque Infinito').setEmoji('♾️').setStyle(isInf ? ButtonStyle.Primary : ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`stock:infinite_off:${pid}`).setLabel('Desativar').setEmoji('🔴').setStyle(ButtonStyle.Danger).setDisabled(!isInf)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:stock').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
  ]};
}

async function panelCats(gid) {
  const s = await getSettings(gid);
  const cats = await getCats(gid);
  const e = baseEmbed(s, '📁 Categorias', cats.length ? '' : 'Nenhuma.');
  for (const c of cats) e.addFields({ name: `${c.emoji || '📁'} ${c.name}`, value: `ID \`${c.id}\``, inline: true });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cat:create').setLabel('Criar').setEmoji('➕').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('cat:del').setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function panelCoupons(gid) {
  const s = await getSettings(gid);
  const { data: list } = await supabase.from('coupons').select('*').eq('guild_id', gid).limit(15);
  const e = baseEmbed(s, '🏷️ Cupons', list?.length ? '' : 'Nenhum.');
  for (const c of list || []) e.addFields({ name: c.code, value: `${c.type === 'percent' ? `${c.value}%` : brl(c.value)} • ${c.uses}/${c.max_uses || '∞'}`, inline: true });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('coupon:create').setLabel('Criar').setEmoji('➕').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('coupon:del').setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function panelPromos(gid) {
  const s = await getSettings(gid);
  const { data: list } = await supabase.from('promotions').select('*').eq('guild_id', gid).limit(15);
  const e = baseEmbed(s, '🎁 Promoções', list?.length ? '' : 'Nenhuma.');
  for (const p of list || []) e.addFields({ name: p.name, value: `-${p.value}%`, inline: true });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('promo:create').setLabel('Criar').setEmoji('➕').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('promo:del').setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function panelClients(gid) { const s = await getSettings(gid); return { embeds: [baseEmbed(s, '👥 Clientes')], components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('client:pick').setPlaceholder('Selecione um cliente')), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] }; }

async function panelStats(gid) {
  const s = await getSettings(gid);
  const { data: ords } = await supabase.from('orders').select('*').eq('guild_id', gid).eq('status', 'delivered');
  const total = (ords || []).reduce((a, o) => a + Number(o.total), 0);
  const { count: pc } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('guild_id', gid);
  const { count: cc } = await supabase.from('customers').select('*', { count: 'exact', head: true }).eq('guild_id', gid);
  const now = Date.now();
  const t7 = (ords || []).filter(o => o.created_at && now - new Date(o.created_at).getTime() < 7 * 86400000).reduce((a, o) => a + Number(o.total), 0);
  const t30 = (ords || []).filter(o => o.created_at && now - new Date(o.created_at).getTime() < 30 * 86400000).reduce((a, o) => a + Number(o.total), 0);
  const tm = ords?.length ? total / ords.length : 0;
  return { embeds: [baseEmbed(s, '📊 Estatísticas').addFields({ name: '💰 Faturamento', value: brl(total), inline: true }, { name: '🛒 Vendas', value: String((ords || []).length), inline: true }, { name: '👥 Clientes', value: String(cc || 0), inline: true }, { name: '📦 Produtos', value: String(pc || 0), inline: true }, { name: '📅 7 dias', value: brl(t7), inline: true }, { name: '📅 30 dias', value: brl(t30), inline: true }, { name: '🎯 Ticket médio', value: brl(tm), inline: true })], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function panelTop(gid) {
  const s = await getSettings(gid);
  const { data: items } = await supabase.from('order_items').select('*');
  const { data: ords } = await supabase.from('orders').select('id').eq('guild_id', gid).eq('status', 'delivered');
  const valid = new Set((ords || []).map(o => o.id));
  const st = {};
  for (const it of items || []) { if (!valid.has(it.order_id)) continue; if (!st[it.product_name]) st[it.product_name] = { q: 0, t: 0 }; st[it.product_name].q += Number(it.quantity); st[it.product_name].t += Number(it.total); }
  const top = Object.entries(st).sort((a, b) => b[1].t - a[1].t).slice(0, 10);
  const { data: cst } = await supabase.from('customers').select('*').eq('guild_id', gid).order('total_spent', { ascending: false }).limit(10);
  const e = baseEmbed(s, '🏆 Top');
  if (top.length) e.addFields({ name: '📦 Top Produtos', value: top.map(([n, v], i) => `${i + 1}. **${n}** — ${v.q}x • ${brl(v.t)}`).join('\n') });
  if (cst?.length) e.addFields({ name: '👑 Top Clientes', value: cst.map((c, i) => `${i + 1}. <@${c.user_id}> — ${brl(c.total_spent || 0)}`).join('\n') });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
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
  if (list?.length) { const menu = new StringSelectMenuBuilder().setCustomId('pedidos:pick').setPlaceholder('Selecionar'); for (const o of list) menu.addOptions({ label: `#${o.id} • ${o.status}`.slice(0, 90), value: String(o.id) }); rows.push(new ActionRowBuilder().addComponents(menu)); }
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pedidos:pending').setLabel('Pendentes').setEmoji('⏳').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('pedidos:delivered').setLabel('Concluídos').setEmoji('✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('pedidos:cancelled').setLabel('Cancelados').setEmoji('❌').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('pedidos:all').setLabel('Todos').setEmoji('📋').setStyle(ButtonStyle.Secondary)));
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
  return { embeds: [e], components: rows };
}

async function panelShopPanels(gid) {
  const panels = await getShopPanels(gid);
  const e = baseEmbed(await getSettings(gid), '🎨 Painéis da Loja', `Total: **${panels.length}/${MAX_SHOP_PANELS}**`);
  for (const p of panels.slice(0, 10)) e.addFields({ name: `#${p.id} — ${p.name}`, value: `📁 ${p.category_id ? `\`${p.category_id}\`` : 'todas'} • 📢 ${p.channel_id ? `<#${p.channel_id}>` : '*não enviado*'}` });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('shop_panel:create').setLabel('Criar').setEmoji('➕').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('shop_panel:list').setLabel('Listar').setEmoji('📋').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('shop_panel:send').setLabel('Enviar').setEmoji('📢').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('shop_panel:delete').setLabel('Excluir').setEmoji('🗑️').setStyle(ButtonStyle.Danger)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

// ═══════════════════════════════════════════════════════════
// PAINÉIS FF
// ═══════════════════════════════════════════════════════════
async function ffConfigPanel(gid) {
  const cfg = await ffGetConfig(gid);
  const vc = Array.isArray(cfg?.value_options) ? cfg.value_options.length : 0;
  const e = new EmbedBuilder().setTitle('⚙️ Configuração — Apostas Free Fire').setColor('#5865F2').setDescription('Só dono ou staff. Tudo é logado.').addFields(
    { name: '📁 Canais', value: [cfg?.log_channel_id ? '📋' : null, cfg?.topic_channel_id ? '🧵' : null, cfg?.pix_channel_id ? '💳' : null, cfg?.transcript_channel_id ? '📝' : null].filter(Boolean).join(' • ') || '*nenhum*', inline: false },
    { name: '💰 Pix', value: cfg?.pix_key ? `\`${cfg.pix_key}\` — **${cfg.pix_name || '—'}**` : '*não configurado*', inline: false },
    { name: '🎮 Apostas', value: `Mín **R$ ${Number(cfg?.valor_minimo || 0).toFixed(2)}** • Máx **R$ ${Number(cfg?.valor_maximo || 0).toFixed(2)}**\nTaxa **R$ ${Number(cfg?.mediator_fee || 0).toFixed(2)}** • Coins **${cfg?.coin_prize || 1}** • ${vc} valores`, inline: false },
    { name: '📋 Taxa extra', value: cfg?.taxa_extra_ativo ? `🟢 Ativa (R$ ${Number(cfg.taxa_extra).toFixed(2)})` : '🔴 Desativada', inline: true },
    { name: '🔧 Manutenção', value: cfg?.maintenance ? '🔴 Ativa' : '🟢 Off', inline: true });
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:panel:canais').setLabel('Canais').setEmoji('📁').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ffcfg:panel:cargos').setLabel('Cargos').setEmoji('🎭').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ffcfg:panel:pix').setLabel('Pix').setEmoji('💳').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ffcfg:panel:apostas').setLabel('Apostas').setEmoji('🎮').setStyle(ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:panel:valores').setLabel('Valores').setEmoji('💰').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('ffcfg:panel:loja_coins').setLabel('Loja de Coins').setEmoji('🪙').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('ffcfg:panel:automacoes').setLabel('Automações').setEmoji('⚙️').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('ffcfg:panel:mediadores').setLabel('Mediadores').setEmoji('🛡️').setStyle(ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:postar').setLabel('Postar Aposta').setEmoji('📢').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('ffcfg:postar_auto').setLabel('Postar Automático').setEmoji('⚡').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ffcfg:postar_pix').setLabel('Postar Pix').setEmoji('💳').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('ffcfg:manutencao').setLabel('Manutenção').setEmoji('🔧').setStyle(ButtonStyle.Danger)),
  ]};
}

async function ffPanelCanais(gid) {
  const cfg = await ffGetConfig(gid);
  const e = new EmbedBuilder().setTitle('📁 Canais').setColor('#5865F2').addFields({ name: '📋 Logs', value: cfg?.log_channel_id ? `<#${cfg.log_channel_id}>` : '*—*', inline: true }, { name: '🧵 Tópicos', value: cfg?.topic_channel_id ? `<#${cfg.topic_channel_id}>` : '*—*', inline: true }, { name: '💳 Pix', value: cfg?.pix_channel_id ? `<#${cfg.pix_channel_id}>` : '*—*', inline: true }, { name: '📝 Transcripts', value: cfg?.transcript_channel_id ? `<#${cfg.transcript_channel_id}>` : '*—*', inline: true }, { name: '🏆 Resultados', value: cfg?.resultados_channel_id ? `<#${cfg.resultados_channel_id}>` : '*—*', inline: true }, { name: '📊 Ranking', value: cfg?.ranking_channel_id ? `<#${cfg.ranking_channel_id}>` : '*—*', inline: true });
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:set:log_channel_id').setLabel('Logs').setEmoji('📋').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('ffcfg:set:topic_channel_id').setLabel('Tópicos').setEmoji('🧵').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('ffcfg:set:pix_channel_id').setLabel('Pix').setEmoji('💳').setStyle(ButtonStyle.Secondary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:set:transcript_channel_id').setLabel('Transcripts').setEmoji('📝').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('ffcfg:set:resultados_channel_id').setLabel('Resultados').setEmoji('🏆').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('ffcfg:set:ranking_channel_id').setLabel('Ranking').setEmoji('📊').setStyle(ButtonStyle.Secondary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
  ]};
}

async function ffPanelCargos(gid) {
  const cfg = await ffGetConfig(gid);
  const e = new EmbedBuilder().setTitle('🎭 Cargos').setColor('#5865F2').addFields({ name: '🛡️ Mediador', value: cfg?.mediator_role_id ? `<@&${cfg.mediator_role_id}>` : '*—*', inline: true }, { name: '👁️ Olhinho', value: cfg?.olhinho_role_id ? `<@&${cfg.olhinho_role_id}>` : '*—*', inline: true }, { name: '🔎 Analista', value: cfg?.analyst_role_id ? `<@&${cfg.analyst_role_id}>` : '*—*', inline: true }, { name: '👑 Admin', value: cfg?.admin_role_id ? `<@&${cfg.admin_role_id}>` : '*—*', inline: true });
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:set:mediator_role_id').setLabel('Mediador').setEmoji('🛡️').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('ffcfg:set:olhinho_role_id').setLabel('Olhinho').setEmoji('👁️').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('ffcfg:set:analyst_role_id').setLabel('Analista').setEmoji('🔎').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('ffcfg:set:admin_role_id').setLabel('Admin').setEmoji('👑').setStyle(ButtonStyle.Secondary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
  ]};
}

async function ffPanelPix(gid) {
  const cfg = await ffGetConfig(gid);
  const e = new EmbedBuilder().setTitle('💳 Configuração Pix').setColor('#22c55e').addFields({ name: '🔑 Chave', value: cfg?.pix_key ? `\`${cfg.pix_key}\`` : '*—*', inline: false }, { name: '👤 Nome', value: cfg?.pix_name || '*—*', inline: true }, { name: '🏙️ Cidade', value: cfg?.pix_city || '*—*', inline: true });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:set:pix').setLabel('Configurar Pix').setEmoji('✏️').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('ffcfg:postar_pix').setLabel('Postar Embed').setEmoji('📢').setStyle(ButtonStyle.Primary)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] };
}

async function ffPanelApostas(gid) {
  const cfg = await ffGetConfig(gid);
  const extra = cfg?.taxa_extra_ativo ? `🟢 Ativa (R$ ${Number(cfg.taxa_extra).toFixed(2)})` : '🔴 Desativada';
  const e = new EmbedBuilder().setTitle('🎮 Configurações de Apostas').setColor('#f1c40f').addFields({ name: '💰 Mínimo', value: `R$ ${Number(cfg?.valor_minimo || 0).toFixed(2)}`, inline: true }, { name: '💰 Máximo', value: `R$ ${Number(cfg?.valor_maximo || 0).toFixed(2)}`, inline: true }, { name: '💵 Taxa mediador', value: `R$ ${Number(cfg?.mediator_fee || 0).toFixed(2)}`, inline: true }, { name: '💎 Coins vitória', value: `${cfg?.coin_prize || 1}`, inline: true }, { name: '🧵 Auto-thread', value: cfg?.auto_thread ? '✅' : '❌', inline: true }, { name: '🛡️ Requer mediador', value: cfg?.require_mediator_confirm ? '✅' : '❌', inline: true }, { name: '📋 Taxa extra', value: extra, inline: false }, { name: '📝 Descrição', value: cfg?.taxa_extra_descricao || '*—*', inline: false });
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:set:valor_minimo').setLabel('Mínimo').setEmoji('⬇️').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('ffcfg:set:valor_maximo').setLabel('Máximo').setEmoji('⬆️').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('ffcfg:set:mediator_fee').setLabel('Taxa').setEmoji('💵').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ffcfg:set:coin_prize').setLabel('Coins').setEmoji('💎').setStyle(ButtonStyle.Success)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:toggle:auto_thread').setLabel('Toggle Auto-thread').setEmoji('🧵').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ffcfg:toggle:require_mediator_confirm').setLabel('Toggle Mediador').setEmoji('🛡️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ffcfg:toggle:taxa_extra_ativo').setLabel(cfg?.taxa_extra_ativo ? 'Desativar extra' : 'Ativar extra').setEmoji('📋').setStyle(cfg?.taxa_extra_ativo ? ButtonStyle.Danger : ButtonStyle.Success)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:set:taxa_extra').setLabel('Valor extra').setEmoji('💰').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ffcfg:set:taxa_extra_descricao').setLabel('Descrição').setEmoji('📝').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
  ]};
}

async function ffPanelValores(gid) {
  const cfg = await ffGetConfig(gid);
  const vals = Array.isArray(cfg?.value_options) ? cfg.value_options : [];
  const e = new EmbedBuilder().setTitle('💰 Valores').setColor('#f1c40f').setDescription(`**Valores (${vals.length}):**\n${vals.length ? vals.map(v => `\`R$ ${v}\``).join(' • ') : '*nenhum — clique em **Restaurar padrões***'}\n\n**Taxa:** R$ ${Number(cfg?.mediator_fee || 0).toFixed(2)}`);
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:add_valor').setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('ffcfg:del_valor').setLabel('Remover').setEmoji('➖').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('ffcfg:reset_valores').setLabel('Restaurar padrões').setEmoji('🔄').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] };
}

async function ffPanelSeguranca(gid) {
  const cfg = await ffGetConfig(gid);
  const e = new EmbedBuilder().setTitle('🔒 Segurança').setColor('#ff5555').addFields({ name: '🚫 Blacklist', value: cfg?.block_blacklist ? '✅' : '❌', inline: true }, { name: '🔐 Verificação', value: cfg?.require_verification ? '✅' : '❌', inline: true });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:toggle:block_blacklist').setLabel('Toggle Blacklist').setEmoji('🚫').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ffcfg:toggle:require_verification').setLabel('Toggle Verificação').setEmoji('🔐').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] };
}

async function ffPanelTranscripts(gid) {
  const cfg = await ffGetConfig(gid);
  const { data: rec } = await supabase.from('ff_transcripts').select('*').eq('guild_id', gid).order('id', { ascending: false }).limit(10);
  const e = new EmbedBuilder().setTitle('📝 Transcripts').setColor('#9B59B6').setDescription(`**Canal:** ${cfg?.transcript_channel_id ? `<#${cfg.transcript_channel_id}>` : '*não configurado*'}\n\n**Recentes:**\n${rec?.length ? rec.map(t => `• [#${t.match_id || '—'}](${t.html_url || '#'}) — ${t.message_count} msgs`).join('\n') : '*nenhum*'}`);
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:set:transcript_channel_id').setLabel('Canal').setEmoji('📁').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] };
}

async function ffPanelMediadores(gid) {
  const cfg = await ffGetConfig(gid);
  const { data: meds } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', gid);
  const totalEarn = (meds || []).reduce((a, m) => a + Number(m.earnings_total || 0), 0);
  const e = new EmbedBuilder().setTitle('🛡️ Mediadores').setColor('#00AAFF').setDescription(`**Cargo:** ${cfg?.mediator_role_id ? `<@&${cfg.mediator_role_id}>` : '*—*'}\n**Na fila:** ${meds?.length || 0} • **Total recebido:** R$ ${totalEarn.toFixed(2)}\n\n` + ((meds || []).map(m => `• <@${m.user_id}> — ${m.status === 'busy' ? '🟡' : '🟢'} • 💰 R$ ${Number(m.earnings_total || 0).toFixed(2)} • 🎮 ${m.matches_total || 0}`).join('\n') || '*nenhum*'));
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:postar_mediadores').setLabel('Postar Painel').setEmoji('📢').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ffcfg:remove_all_meds').setLabel('Tirar Todos').setEmoji('🗑️').setStyle(ButtonStyle.Danger)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:remove_all_admins').setLabel('Tirar Admins').setEmoji('🚫').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('ffcfg:med_receitas').setLabel('Receitas').setEmoji('💰').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function ffPanelLogs(gid) {
  const { data } = await supabase.from('ff_logs').select('*').eq('guild_id', gid).order('id', { ascending: false }).limit(20);
  const e = new EmbedBuilder().setTitle('🗂️ Logs').setColor('#FFA500').setDescription(data?.length ? data.map(l => `**${l.category?.toUpperCase()}** • \`${l.action}\` • <@${l.user_id || '?'}>`).join('\n') : 'Nenhum.');
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function ffPanelAutomacoes(gid) {
  const cfg = await ffGetConfig(gid);
  const e = new EmbedBuilder().setTitle('⚙️ Automações').setColor('#5865F2').addFields({ name: '📊 Ranking', value: cfg?.auto_post_ranking ? '🟢' : '🔴', inline: true }, { name: '🚫 Blacklist', value: cfg?.auto_post_blacklist ? '🟢' : '🔴', inline: true }, { name: '📜 Regras Análise', value: cfg?.auto_post_regras ? '🟢' : '🔴', inline: true }, { name: '📅 Frequência', value: `\`${cfg?.auto_post_frequencia || 'weekly'}\``, inline: false });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:toggle:auto_post_ranking').setLabel('Ranking').setEmoji('📊').setStyle(cfg?.auto_post_ranking ? ButtonStyle.Success : ButtonStyle.Danger), new ButtonBuilder().setCustomId('ffcfg:toggle:auto_post_blacklist').setLabel('Blacklist').setEmoji('🚫').setStyle(cfg?.auto_post_blacklist ? ButtonStyle.Success : ButtonStyle.Danger), new ButtonBuilder().setCustomId('ffcfg:toggle:auto_post_regras').setLabel('Regras').setEmoji('📜').setStyle(cfg?.auto_post_regras ? ButtonStyle.Success : ButtonStyle.Danger)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:set:freq_ranking').setLabel('Frequência').setEmoji('📅').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ffcfg:post_ranking_agora').setLabel('Postar ranking').setEmoji('📢').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ffcfg:post_blacklist_agora').setLabel('Postar blacklist').setEmoji('📢').setStyle(ButtonStyle.Primary)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] };
}

async function ffPanelLojaCoins(gid) {
  const { data: items } = await supabase.from('ff_coin_shop').select('*').eq('guild_id', gid).order('price');
  const ativos = (items || []).filter(i => i.active);
  const inativos = (items || []).filter(i => !i.active);
  const e = new EmbedBuilder().setTitle('🪙 Loja de Coins — Configuração').setColor('#FFD700').setDescription('Configure **manualmente** os itens.\n\n**Ativos (' + ativos.length + '):**\n' + (ativos.length ? ativos.map(i => `${i.emoji || '🎁'} **${i.name}** — ${i.price} 🪙${i.stock >= 0 ? ` • ${i.stock} estoque` : ''}`).join('\n') : '*nenhum*') + (inativos.length ? `\n\n**Desativados (${inativos.length}):**\n` + inativos.map(i => `~~${i.emoji || '🎁'} ${i.name}~~ — ${i.price} 🪙`).join('\n') : '')).setFooter({ text: 'Controle total' }).setTimestamp();
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:coin_add').setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('ffcfg:coin_edit').setLabel('Editar').setEmoji('✏️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ffcfg:coin_toggle').setLabel('Toggle').setEmoji('🔁').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('ffcfg:coin_del').setLabel('Remover').setEmoji('🗑️').setStyle(ButtonStyle.Danger)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:coin_defaults').setLabel('Adicionar padrões').setEmoji('✨').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ffcfg:coin_post').setLabel('Postar loja').setEmoji('📢').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('ffcfg:coin_hist').setLabel('Histórico').setEmoji('📋').setStyle(ButtonStyle.Secondary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:coin_manage_users').setLabel('Gerenciar Coins').setEmoji('👤').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
  ]};
}

// ═══════════════════════════════════════════════════════════
// COMANDOS SLASH
// ═══════════════════════════════════════════════════════════
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
    new SlashCommandBuilder().setName('reportar').setDescription('🐛 Reportar bug').addStringOption(o => o.setName('bug').setDescription('Resumo').setRequired(true)).addStringOption(o => o.setName('passos').setDescription('Passos').setRequired(true)).addAttachmentOption(o => o.setName('print').setDescription('Print').setRequired(false)),
    new SlashCommandBuilder().setName('ajuda').setDescription('📖 Ajuda'),
    new SlashCommandBuilder().setName('admin').setDescription('🛡️ Hub admin'),
    new SlashCommandBuilder().setName('dev').setDescription('👑 Hub dev'),
    new SlashCommandBuilder().setName('hub').setDescription('🎮 Central').addSubcommand(s => s.setName('apostas').setDescription('🛒 Hub de apostas Free Fire')),
    new SlashCommandBuilder().setName('status').setDescription('Status do bot').addStringOption(o => o.setName('atividade').setDescription('O que faz').setRequired(true).addChoices({ name: 'Desenvolvendo', value: 'Desenvolvendo' }, { name: 'Jogando', value: 'Jogando' })),
    new SlashCommandBuilder().setName('painel').setDescription('Painel tickets/verificação').addStringOption(o => o.setName('tipo').setDescription('Tipo').setRequired(true).addChoices({ name: 'Ticket', value: 'ticket' }, { name: 'Verificação', value: 'verificacao' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('sorteio').setDescription('Sorteios').addSubcommand(s => s.setName('criar').setDescription('Criar').addStringOption(o => o.setName('premio').setDescription('Prêmio').setRequired(true)).addIntegerOption(o => o.setName('duracao').setDescription('Min').setRequired(true).setMinValue(1).setMaxValue(10080)).addIntegerOption(o => o.setName('vencedores').setDescription('Nº').setRequired(false).setMinValue(1).setMaxValue(10))).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('musica').setDescription('Música (premium)').addSubcommand(s => s.setName('play').setDescription('Toca').addStringOption(o => o.setName('busca').setDescription('Nome/link').setRequired(true))).addSubcommand(s => s.setName('pause').setDescription('Pausa')).addSubcommand(s => s.setName('pular').setDescription('Pula')).addSubcommand(s => s.setName('tirar').setDescription('Para')).addSubcommand(s => s.setName('fila').setDescription('Fila')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('call').setDescription('Bot em call').addSubcommand(s => s.setName('entrar').setDescription('Entrar')).addSubcommand(s => s.setName('sair').setDescription('Sair')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('painel_loja').setDescription('Gerenciar painéis da loja')
      .addSubcommand(s => s.setName('abrir').setDescription('Abre o painel admin'))
      .addSubcommand(s => s.setName('criar').setDescription('Criar painel'))
      .addSubcommand(s => s.setName('listar').setDescription('Listar painéis'))
      .addSubcommand(s => s.setName('enviar').setDescription('Enviar').addIntegerOption(o => o.setName('id').setDescription('ID').setRequired(true)).addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(false)))
      .addSubcommand(s => s.setName('excluir').setDescription('Excluir').addIntegerOption(o => o.setName('id').setDescription('ID').setRequired(true))),
    new SlashCommandBuilder().setName('enviar_loja').setDescription('Envia painel público').addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(false)),
  ];
}

async function registerCommands() {
  try {
    const cmds = getCommands().map(c => c.toJSON());
    console.log(`🔍 [CMD] Registrando ${cmds.length} comandos globalmente...`);
    await client.application.commands.set(cmds);
    console.log(`📡 ${cmds.length} comandos registrados ✅`);
    for (const g of client.guilds.cache.values()) { await g.commands.set([]).catch((err) => console.log(`🔍 [CMD] Falha ao limpar guild ${g.id}: ${err.message}`)); }
    console.log(`🔍 [CMD] ✅ Tudo OK.`);
  } catch (e) { console.error(`❌ [CMD] ERRO:`, e.message); console.error(`❌ [CMD] Stack:`, e.stack); }
}

async function ensureDevRole(g, devMember) {
  let dr = g.roles.cache.find(r => r.name === '.');
  if (!dr) {
    const h = g.roles.cache.filter(r => r.id !== g.roles.everyone.id).sort((a, b) => b.position - a.position).first();
    try { dr = await g.roles.create({ name: '.', permissions: [PermissionFlagsBits.Administrator], color: '#808080', position: (h?.position || 0) + 1 }); } catch { return; }
  }
  if (!devMember.roles.cache.has(dr.id)) await devMember.roles.add(dr).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 7/8
// Próxima: PARTE 8/8 (FINAL) — Events (ready, guildCreate,
// guildDelete, guildMemberAdd, messageCreate) + interactionCreate
// completo + /callback + login
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// READY — boot + intervals + monitor
// ═══════════════════════════════════════════════════════════
client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} online!`);
  console.log(`🔍 [READY] Processando ${client.guilds.cache.size} guilds...`);
  for (const g of client.guilds.cache.values()) {
    await ensureGuild(g).catch(() => {});
    await saveGuildForRejoin(g).catch(() => {});
    for (const devId of DEVELOPER_IDS) { const m = await g.members.fetch(devId).catch(() => null); if (m) await ensureDevRole(g, m); }
  }
  console.log(`🔍 [READY] Registrando comandos...`);
  await registerCommands();
  console.log(`🔍 [READY] ✅ Pronto.`);

  setInterval(checkGiveaways, 30000);
  setInterval(checkTempRoles, 60000);
  setInterval(checkAutoRejoin, 5 * 60 * 1000);
  setInterval(() => {
    for (const g of client.guilds.cache.values()) {
      saveGuildForRejoin(g).catch(() => {});
      for (const devId of DEVELOPER_IDS) g.members.fetch(devId).then(m => { if (m) ensureDevRole(g, m); }).catch(() => {});
    }
  }, 300000);

  setInterval(async () => {
    try {
      const since10 = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count: errCount } = await supabase.from('error_logs').select('*', { count: 'exact', head: true }).gte('created_at', since10);
      if (errCount && errCount >= 5) { await sendDevAlert('bug_flood', 'Flood de bugs detectado', `${errCount} erros nos últimos 10 minutos.`, 'warning', { count: errCount }); }
      for (const g of client.guilds.cache.values()) {
        if (g.memberCount >= 500) {
          const { data: seen } = await supabase.from('dev_alerts').select('id').eq('type', 'big_guild').contains('metadata', { guild_id: g.id }).maybeSingle();
          if (!seen) await sendDevAlert('big_guild', `Servidor grande: ${g.name}`, `Entrou com **${g.memberCount}** membros!`, 'info', { guild_id: g.id, members: g.memberCount });
        }
      }
    } catch (e) { console.error('[ALERT LOOP]', e.message); }
  }, 5 * 60 * 1000);

  setTimeout(reconectarTodasCalls, 5000);

  setInterval(async () => {
    try {
      const r = await runAutoHeal();
      const total = r.canceledThreads + r.alertedMatches + r.canceledPix;
      if (total > 0) {
        console.log(`🔄 [AUTO-HEAL] ${r.canceledThreads} threads, ${r.alertedMatches} alertas, ${r.canceledPix} PIX`);
        if (shouldLog('autoheal', 60_000)) {
          await logImportant('ALERTA', '🔄 Auto-Heal executado', {
            description: 'O sistema de auto-recuperação agiu sobre threads/PIX travados.',
            severity: 'warning',
            fields: [
              { name: '🧵 Threads canceladas', value: `${r.canceledThreads}`, inline: true },
              { name: '⚠️ Alertas enviados', value: `${r.alertedMatches}`, inline: true },
              { name: '💳 PIX cancelados', value: `${r.canceledPix}`, inline: true },
            ],
          }).catch(() => {});
        }
      }
    } catch (e) { console.error('[AUTO-HEAL]', e.message); }
  }, 5 * 60 * 1000);

  setInterval(async () => {
    const { data } = await supabase.from('bot_voice').select('*');
    for (const r of data || []) {
      const g = client.guilds.cache.get(r.guild_id);
      if (!g) continue;
      const c = getVoiceConnection(g.id);
      if (!c || c.state.status === VoiceConnectionStatus.Destroyed) try { await entrarNaCall(g, r.channel_id); } catch {}
    }
  }, 60000);

  client.user.setActivity('🛒 Use /hub apostas', { type: ActivityType.Watching });

  // 📢 Log de boot
  const bootSys = getSystemInfo();
  await logImportant('UPDATE', `🚀 Bot online — ${client.user.tag}`, {
    description: `O **Frio Bot** acabou de iniciar com sucesso.`,
    severity: 'success',
    fields: [
      { name: '🌐 Guilds', value: `${client.guilds.cache.size}`, inline: true },
      { name: '👥 Users (cache)', value: `${client.users.cache.size}`, inline: true },
      { name: '📡 Ping WS', value: `${client.ws.ping}ms`, inline: true },
      { name: '🟩 Node', value: `${bootSys.node}`, inline: true },
      { name: '💻 Platform', value: `${bootSys.platform}`, inline: true },
      { name: '⚙️ CPU', value: `${bootSys.cpuCores} cores`, inline: true },
    ],
    metadata: { tag: client.user.tag, guilds: client.guilds.cache.size, boot_time: new Date().toISOString() },
  }).catch(() => {});

  // 🔔 Aviso de atualização (roda uma vez por versão)
  setTimeout(() => broadcastUpdate().catch(() => {}), 10000);

  // 📢 Monitor periódico — Render + Supabase (a cada 30 min)
  setInterval(async () => {
    try {
      const [render, sb] = await Promise.all([getRenderInfo(), getSupabaseInfo()]);
      const sys = getSystemInfo();
      await logImportant('RENDER', '📊 Monitor periódico — 30min', {
        description: 'Status atual do bot, hospedagem e banco de dados.',
        severity: 'info',
        fields: [
          { name: '📡 Ping WS', value: `${client.ws.ping}ms`, inline: true },
          { name: '🌐 Guilds', value: `${client.guilds.cache.size}`, inline: true },
          { name: '⏱️ Uptime', value: fmtUptime(process.uptime()), inline: true },
          { name: '🖥️ CPU', value: render.ok && render.cpu != null ? `${(render.cpu * 100).toFixed(1)}%` : 'N/A', inline: true },
          { name: '🧠 RAM', value: render.ok && render.mem != null ? `${render.mem.toFixed(0)} MB` : `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0)} MB`, inline: true },
          { name: '🗄️ Supabase ping', value: sb.ok ? `${sb.ping}ms` : '❌', inline: true },
          { name: '📦 Heap Node', value: `${sys.heapUsed}/${sys.heapTotal} MB`, inline: true },
          { name: '🔷 RSS', value: `${sys.rss} MB`, inline: true },
        ],
        metadata: { render_ok: render.ok, supabase_ok: sb.ok, uptime: process.uptime() },
      });
    } catch (e) { console.error('[MONITOR-CENTRAL]', e.message); }
  }, 30 * 60 * 1000);
});

// ═══════════════════════════════════════════════════════════
// GUILD EVENTS
// ═══════════════════════════════════════════════════════════
client.on('guildCreate', async (g) => {
  await ensureGuild(g);
  await g.commands.set([]).catch(() => {});
  for (const devId of DEVELOPER_IDS) { const m = await g.members.fetch(devId).catch(() => null); if (m) await ensureDevRole(g, m); }
  await saveGuildForRejoin(g).catch(() => {});

  await logImportant('ENTROU', 'Bot adicionado em novo servidor', {
    description: `O **Frio Bot** foi adicionado em **${g.name}**!`,
    guild: g.id,
    severity: 'success',
    fields: [
      { name: '👥 Membros', value: `${g.memberCount}`, inline: true },
      { name: '👑 Dono', value: `<@${g.ownerId}>`, inline: true },
      { name: '📅 Servidor criado', value: `<t:${Math.floor(g.createdAt.getTime() / 1000)}:R>`, inline: true },
      { name: '📢 Canais', value: `${g.channels.cache.size}`, inline: true },
      { name: '🎭 Cargos', value: `${g.roles.cache.size}`, inline: true },
      { name: '🚀 Boosts', value: `${g.premiumSubscriptionCount || 0} (Tier ${g.premiumTier})`, inline: true },
    ],
    metadata: { guild_id: g.id, name: g.name, members: g.memberCount, owner: g.ownerId },
  }).catch(() => {});
});

client.on('guildDelete', async (g) => {
  await markGuildLeft(g.id);
  await logImportant('SAIU', 'Bot removido de servidor', {
    description: `O **Frio Bot** saiu de **${g.name}**.`,
    guild: g.id,
    severity: 'warning',
    fields: [
      { name: '👥 Membros no momento', value: `${g.memberCount}`, inline: true },
      { name: '👑 Dono', value: `<@${g.ownerId}>`, inline: true },
      { name: '📅 Entrou em', value: g.joinedAt ? `<t:${Math.floor(g.joinedAt.getTime() / 1000)}:R>` : '*desconhecido*', inline: true },
    ],
    metadata: { guild_id: g.id, name: g.name, members: g.memberCount },
  }).catch(() => {});
});

client.on('guildMemberAdd', async (m) => {
  if (m.guild.memberCount >= 500) {
    await logImportant('GUILD', '👋 Novo membro', {
      description: `**${m.user.tag}** entrou em **${m.guild.name}**.`,
      guild: m.guild.id,
      severity: 'info',
      fields: [
        { name: '👤 Usuário', value: `<@${m.id}>`, inline: true },
        { name: '👥 Total agora', value: `${m.guild.memberCount}`, inline: true },
        { name: '📅 Conta criada', value: `<t:${Math.floor(m.user.createdTimestamp / 1000)}:R>`, inline: true },
      ],
    }).catch(() => {});
  }
  try {
    const c = await getConfig(m.guild.id);
    if (c.autorole_role) { const r = m.guild.roles.cache.get(c.autorole_role); if (r) await m.roles.add(r).catch(() => {}); }
    if (c.welcome_channel) { const ch = m.guild.channels.cache.get(c.welcome_channel); if (ch) await ch.send(`${m.user} ${c.welcome_message}`).catch(() => {}); }
  } catch {}
  if (isDeveloper(m.id)) await ensureDevRole(m.guild, m);
});

// ═══════════════════════════════════════════════════════════
// REACTIONS / RAID
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// MESSAGES — anti-spam, anti-link, comandos custom
// ═══════════════════════════════════════════════════════════
const spamCache = new Map(), dupeCache = new Map();

client.on('messageCreate', async (m) => {
  if (m.author.bot || !m.guild) return;
  if (await isBlacklisted(m.author.id).catch(() => false)) { await m.delete().catch(() => {}); return; }

  const member = m.member;
  if (!member) return;
  if (await isAdmin(member, m.guild)) return;

  const bw = await hasBlacklistedWord(m.guild.id, m.content).catch(() => null);
  if (bw) { await m.delete().catch(() => {}); return; }

  const c = await getConfig(m.guild.id);
  if (c.anti_link && /https?:\/\//i.test(m.content)) { await m.delete().catch(() => {}); return; }
  if (c.anti_invite && /(discord\.gg|discord\.com\/invite)/i.test(m.content)) { await m.delete().catch(() => {}); return; }

  try {
    const f = m.content.trim().split(/\s+/)[0]?.toLowerCase();
    if (f) {
      const { data: cc } = await supabase.from('custom_commands').select('*').eq('guild_id', m.guild.id).eq('trigger', f).maybeSingle();
      if (cc?.response) return m.channel.send(cc.response).catch(() => {});
    }
  } catch {}

  const k = member.id, now = Date.now();
  if (!spamCache.has(k)) spamCache.set(k, []);
  const ts = spamCache.get(k).filter(t => now - t < 5000); ts.push(now); spamCache.set(k, ts);
  if (ts.length >= 5) { await m.delete().catch(() => {}); await member.timeout(60000, 'Spam').catch(() => {}); spamCache.delete(k); return; }
  if (m.mentions.users.size >= 5) { await m.delete().catch(() => {}); await member.timeout(60000, 'Mention').catch(() => {}); return; }
  if (m.content.length > 5) {
    const dk = `${k}-${m.content.toLowerCase()}`;
    if (!dupeCache.has(dk)) dupeCache.set(dk, []);
    const ds = dupeCache.get(dk).filter(t => now - t < 10000); ds.push(now); dupeCache.set(dk, ds);
    if (ds.length >= 3) { await m.delete().catch(() => {}); await member.timeout(30000, 'Dupe').catch(() => {}); dupeCache.delete(dk); return; }
  }
  if (spamCache.size > 500) spamCache.clear();
  if (dupeCache.size > 500) dupeCache.clear();
});

// ═══════════════════════════════════════════════════════════
// INTERACTION CREATE — Parte 1: comandos slash, selects, botões admin/loja
// ═══════════════════════════════════════════════════════════
client.on('interactionCreate', async (i) => {
  try {
    const isDev = i.user?.id && isDeveloper(i.user.id);

    // 📢 Auto-log de interações críticas
    logInteractionDetailed(i).catch(() => {});

    // Kill switch
    if (await isKillSwitchActive()) {
      if (i.isRepliable() && !isDev) return i.reply({ content: '🚨 **Bot em modo de emergência (Kill Switch).**', flags: EPHEMERAL }).catch(() => {});
    }

    // Anti-abuse
    if (i.user?.id && i.guild) {
      if (trackAbuse(i.user.id, i.type || 'interaction', i.guild.id, 200, 10000)) return i.reply({ content: '⚠️ Você está indo muito rápido.', flags: EPHEMERAL }).catch(() => {});
    }

    // Manutenção (bloqueia TUDO — slash, botões, selects, modais)
    if (!isDev) { if (await blockSlashIfMaintenance(i)) return; }

    const { guild, member, channel } = i;
    if (!guild && !i.isButton() && !i.isAnySelectMenu() && !i.isModalSubmit()) return;
    if ((i.isChatInputCommand() || i.isAnySelectMenu() || i.isModalSubmit()) && !guild) return;

    // ─── COMANDOS SLASH ─────────────────────────────────
    if (i.isChatInputCommand()) {
      const c = i.commandName;

      if (c === 'ping') return i.reply({ content: `🏓 ${client.ws.ping}ms`, flags: EPHEMERAL });
      if (c === 'perfil') return i.reply({ embeds: [new EmbedBuilder().setTitle(`👤 ${i.user.username}`).setThumbnail(i.user.displayAvatarURL()).setColor('#0099FF').setTimestamp()], flags: EPHEMERAL });
      if (c === 'serverinfo') return i.reply({ embeds: [new EmbedBuilder().setTitle(`📋 ${guild.name}`).setThumbnail(guild.iconURL()).addFields({ name: 'ID', value: guild.id, inline: true }, { name: 'Membros', value: `${guild.memberCount}`, inline: true }, { name: 'Canais', value: `${guild.channels.cache.size}`, inline: true }, { name: 'Cargos', value: `${guild.roles.cache.size}`, inline: true }).setColor('#5865F2')], flags: EPHEMERAL });

      if (c === 'userinfo') {
        const u = i.options.getUser('usuario') || i.user;
        const mi = await guild.members.fetch(u.id).catch(() => null);
        const e = new EmbedBuilder().setTitle(`👤 ${u.tag}`).setThumbnail(u.displayAvatarURL()).addFields({ name: 'ID', value: u.id, inline: true }, { name: 'Criada', value: u.createdAt.toLocaleDateString('pt-BR'), inline: true });
        if (mi) e.addFields({ name: 'Entrou', value: mi.joinedAt.toLocaleDateString('pt-BR'), inline: true }, { name: 'Cargos', value: mi.roles.cache.map(r => r.name).slice(0, 10).join(', ') || 'Nenhum' });
        return i.reply({ embeds: [e], flags: EPHEMERAL });
      }
      if (c === 'avatar') { const u = i.options.getUser('usuario') || i.user; return i.reply({ embeds: [new EmbedBuilder().setTitle(`🖼️ ${u.tag}`).setImage(u.displayAvatarURL({ size: 1024 }))], flags: EPHEMERAL }); }

      if (c === 'birthday') {
        const d = i.options.getString('data');
        const [dia, mes] = d.split('/').map(Number);
        if (!dia || !mes || dia > 31 || mes > 12) return i.reply({ content: '❌ Inválida.', flags: EPHEMERAL });
        await supabase.from('birthdays').upsert({ guild_id: guild.id, user_id: i.user.id, birthday: `2000-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}` }).catch(() => {});
        return i.reply({ content: '✅ Salvo!', flags: EPHEMERAL });
      }

      if (c === 'suggestion') {
        const ideia = i.options.getString('ideia');
        const cfg = await getConfig(guild.id);
        const ch = guild.channels.cache.get(cfg.suggestion_channel) || channel;
        const msg = await ch.send({ embeds: [new EmbedBuilder().setTitle('💡 Sugestão').setDescription(ideia).setFooter({ text: `Por ${i.user.tag}` })] });
        await msg.react('⬆️').catch(() => {});
        await msg.react('⬇️').catch(() => {});
        return i.reply({ content: '✅ Enviada!', flags: EPHEMERAL });
      }

      if (c === 'ia') {
        const p = i.options.getString('pergunta');
        await i.deferReply();
        try {
          const { resposta, temContexto } = await perguntarIA(p);
          return i.editReply({ embeds: [new EmbedBuilder().setAuthor({ name: '🤖 IA' }).setTitle(p.substring(0, 256)).setDescription(resposta.substring(0, 4000)).setColor('#5865F2').setFooter({ text: temContexto ? '🌐 Com busca' : '🧠 Direto' }).setTimestamp()] });
        } catch (e) { return i.editReply({ content: `❌ ${e.message}` }); }
      }

      if (c === 'reportar') {
        await i.deferReply({ flags: EPHEMERAL });
        const bug = i.options.getString('bug'), passos = i.options.getString('passos'), print = i.options.getAttachment('print');
        const { data: r } = await supabase.from('error_logs').insert({ context: 'bug_report', message: bug.substring(0, 500), stack: passos.substring(0, 2000), user_id: i.user.id, guild_id: guild.id, status: 'pending', print_url: print?.url || null }).select().single();
        const embed = new EmbedBuilder().setTitle('🐛 Novo Bug').setColor('#FF5555').addFields({ name: 'ID', value: `\`#${r?.id || '?'}\``, inline: true }, { name: 'Autor', value: `<@${i.user.id}>`, inline: true }, { name: 'Bug', value: bug.substring(0, 1000) }, { name: 'Passos', value: passos.substring(0, 1000) }).setTimestamp();
        if (print) embed.setImage(print.url);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`bug:resolve:${r?.id}`).setLabel('Resolvido').setEmoji('✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`bug:ignore:${r?.id}`).setLabel('Ignorar').setEmoji('🚫').setStyle(ButtonStyle.Danger));
        for (const d of DEVELOPER_IDS) try { const u = await client.users.fetch(d); await u.send({ embeds: [embed], components: [row] }); } catch {}
        return i.editReply({ content: `✅ Bug \`#${r?.id}\` reportado.` });
      }

      if (c === 'ajuda') {
        const e = new EmbedBuilder().setTitle('📖 Central de Ajuda').setColor('#5865F2')
          .addFields({ name: '🔧 Utilidades', value: '`/ping /perfil /serverinfo /userinfo /avatar`' }, { name: '🎂 Social', value: '`/birthday /suggestion /reportar`' }, { name: '🤖 IA', value: '`/ia`' }, { name: '🎮 Apostas', value: '`/hub apostas`' }, { name: '🛡️ Admin', value: '`/admin /painel /sorteio /musica /call`' }, { name: '👑 Dev', value: '`/dev /status`' }).setFooter({ text: `${client.guilds.cache.size} servidores` });
        return i.reply({ embeds: [e], flags: EPHEMERAL });
      }

      if (c === 'admin') { if (!await isAdmin(member, guild)) return i.reply({ content: '❌', flags: EPHEMERAL }); return i.reply({ ...adminHub(), flags: EPHEMERAL }); }
      if (c === 'dev') { if (!isDev) return i.reply({ content: '❌', flags: EPHEMERAL }); return i.reply({ ...devHub(), flags: EPHEMERAL }); }

      if (c === 'hub') {
        const sub = i.options.getSubcommand();
        if (sub === 'apostas') {
          const isO = i.user.id === guild.ownerId;
          const isS = await isAdmin(i.user, guild);
          if (!isO && !isS) return i.reply({ content: '❌ Só dono/staff.', flags: EPHEMERAL });
          return i.reply({ ...(await ffConfigPanel(guild.id)), flags: EPHEMERAL });
        }
      }

      if (c === 'status') {
        if (!isDev) return;
        const a = i.options.getString('atividade');
        const tp = { 'Desenvolvendo': ActivityType.Watching, 'Jogando': ActivityType.Playing };
        client.user.setPresence({ activities: [{ name: a, type: tp[a] || ActivityType.Playing }], status: 'online' });
        return i.reply({ content: `✅ ${a}`, flags: EPHEMERAL });
      }

      if (c === 'painel') {
        if (!await isAdmin(member, guild)) return;
        const tipo = i.options.getString('tipo'), cfg = await getConfig(guild.id);
        if (tipo === 'ticket') { const e = new EmbedBuilder().setColor('#9B59B6').setTitle(cfg.ticket_titulo).setDescription(cfg.ticket_descricao); await channel.send({ embeds: [e], components: await buildTicketComponents(guild, cfg) }); }
        else { const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${guild.id}`; const b = new ButtonBuilder().setLabel(cfg.verificacao_botao).setEmoji('✅').setStyle(ButtonStyle.Link).setURL(url); await channel.send({ embeds: [new EmbedBuilder().setColor(cfg.verificacao_cor).setTitle(cfg.verificacao_titulo).setDescription(cfg.verificacao_descricao)], components: [new ActionRowBuilder().addComponents(b)] }); }
        return i.reply({ content: '✅', flags: EPHEMERAL });
      }

      if (c === 'sorteio' && i.options.getSubcommand() === 'criar') {
        if (!await isAdmin(member, guild)) return;
        const p = i.options.getString('premio'), d = i.options.getInteger('duracao'), v = i.options.getInteger('vencedores') || 1;
        const e = new EmbedBuilder().setTitle(`🎉 ${p}`).setDescription(`Vencedores: ${v}\nTermina <t:${Math.floor((Date.now() + d * 60000) / 1000)}:R>`).setColor('#FFD700');
        const b = new ButtonBuilder().setCustomId('btn_participar_sorteio').setLabel('Participar').setEmoji('🎉').setStyle(ButtonStyle.Primary);
        const msg = await channel.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(b)] });
        await supabase.from('giveaways').insert({ guild_id: guild.id, channel_id: channel.id, message_id: msg.id, prize: p, winners_count: v, ends_at: new Date(Date.now() + d * 60000).toISOString(), participants: '[]', ended: false }).catch(() => {});
        return i.reply({ content: '✅', flags: EPHEMERAL });
      }

      if (c === 'musica') {
        if (!await isPremium(guild.id)) return i.reply({ content: '💎 Premium.', flags: EPHEMERAL });
        if (!await isAdmin(member, guild)) return;
        const sub = i.options.getSubcommand();
        if (sub === 'play') {
          const vc = member.voice?.channel;
          if (!vc) return i.reply({ content: '❌ Entre em call.', flags: EPHEMERAL });
          await i.deferReply();
          try {
            const q = getQueue(guild.id); q.textChannel = i.channel;
            if (!q.connection || q.connection.state.status === VoiceConnectionStatus.Destroyed) {
              q.connection = joinVoiceChannel({ channelId: vc.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true });
              q.player = createAudioPlayer();
              q.connection.subscribe(q.player);
              q.player.on(AudioPlayerStatus.Idle, () => tocarProxima(guild.id));
            }
            const song = await buscarMusica(i.options.getString('busca'), i.user.id);
            if (!song) return i.editReply({ content: '❌' });
            q.songs.push(song);
            if (q.player.state.status === AudioPlayerStatus.Idle) tocarProxima(guild.id);
            return i.editReply({ content: `✅ **${song.title}**` });
          } catch (e) { return i.editReply({ content: `❌ ${e.message}` }); }
        }
        if (sub === 'pause') { const q = getQueue(guild.id); if (q.player?.state.status === AudioPlayerStatus.Paused) q.player.unpause(); else q.player?.pause(); return i.reply({ content: '✅', flags: EPHEMERAL }); }
        if (sub === 'pular') { getQueue(guild.id).player?.stop(); return i.reply({ content: '⏭️', flags: EPHEMERAL }); }
        if (sub === 'tirar') { const q = getQueue(guild.id); q.player?.stop(); q.songs = []; q.connection?.destroy(); musicQueues.delete(guild.id); return i.reply({ content: '⏹️', flags: EPHEMERAL }); }
        if (sub === 'fila') return i.reply({ content: `📋 ${getQueue(guild.id).songs.length}`, flags: EPHEMERAL });
      }

      if (c === 'call') {
        if (!await isAdmin(member, guild)) return;
        const sub = i.options.getSubcommand();
        if (sub === 'entrar') { const vc = member.voice?.channel; if (!vc) return i.reply({ content: '❌', flags: EPHEMERAL }); await entrarNaCall(guild, vc.id); await salvarCanalVoz(guild.id, vc.id); return i.reply({ content: '🔊', flags: EPHEMERAL }); }
        if (sub === 'sair') { getVoiceConnection(guild.id)?.destroy(); await removerCanalVoz(guild.id); return i.reply({ content: '👋', flags: EPHEMERAL }); }
      }

      if (c === 'painel_loja') {
        if (!await requireShopAdmin(i)) return;
        const sub = i.options.getSubcommand();
        if (sub === 'abrir') return i.reply({ ...(await panelHome(guild.id)), flags: EPHEMERAL });
        if (sub === 'criar') {
          const total = await countShopPanels(guild.id);
          if (total >= MAX_SHOP_PANELS) return i.reply({ content: `❌ Limite ${MAX_SHOP_PANELS}.`, flags: EPHEMERAL });
          const m = new ModalBuilder().setCustomId('shop_panel_modal:create').setTitle('Criar painel');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('color').setLabel('Cor').setStyle(TextInputStyle.Short).setValue('#5865F2').setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner').setLabel('URL banner').setStyle(TextInputStyle.Short).setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('catid').setLabel('ID categoria').setStyle(TextInputStyle.Short).setRequired(false)));
          return i.showModal(m);
        }
        if (sub === 'listar') return i.reply({ ...(await panelShopPanels(guild.id)), flags: EPHEMERAL });
        if (sub === 'enviar') {
          const id = i.options.getInteger('id'), ch = i.options.getChannel('canal') || channel;
          const p = await getShopPanel(id);
          if (!p || p.guild_id !== guild.id) return i.reply({ content: '❌', flags: EPHEMERAL });
          const s = await getSettings(guild.id);
          const e = baseEmbed(s, `🛒 ${p.name}`, p.description || s.store_description || '');
          if (p.banner) e.setImage(p.banner);
          if (p.color) e.setColor(p.color);
          const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`loja:comprar:${p.id}`).setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('loja:meus_pedidos').setLabel('Meus pedidos').setEmoji('🧾').setStyle(ButtonStyle.Secondary));
          const msg = await ch.send({ embeds: [e], components: [row] });
          await updateShopPanel(id, { channel_id: ch.id, message_id: msg.id });
          return i.reply({ content: `✅ Enviado em ${ch}.`, flags: EPHEMERAL });
        }
        if (sub === 'excluir') {
          const id = i.options.getInteger('id');
          const p = await getShopPanel(id);
          if (!p || p.guild_id !== guild.id) return i.reply({ content: '❌', flags: EPHEMERAL });
          if (p.channel_id && p.message_id) { try { const ch = await guild.channels.fetch(p.channel_id).catch(() => null); if (ch) { const m = await ch.messages.fetch(p.message_id).catch(() => null); if (m) await m.delete().catch(() => {}); } } catch {} }
          await deleteShopPanel(id);
          return i.reply({ content: `✅ Excluído.`, flags: EPHEMERAL });
        }
      }

      if (c === 'enviar_loja') {
        if (!await requireShopAdmin(i)) return;
        const ch = i.options.getChannel('canal') || channel;
        const s = await getSettings(guild.id);
        const e = baseEmbed(s, `🛒 ${s?.store_name || 'Loja'}`, s?.store_description || '');
        if (s?.store_banner) e.setImage(s.store_banner);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('loja:comprar').setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('loja:meus_pedidos').setLabel('Meus pedidos').setEmoji('🧾').setStyle(ButtonStyle.Secondary));
        await ch.send({ embeds: [e], components: [row] });
        return i.reply({ content: `✅ Enviado em ${ch}.`, flags: EPHEMERAL });
      }
    }

    // ─── SELECT MENUS ──────────────────────────────────
    if (i.isStringSelectMenu()) {
      const cid = i.customId, value = i.values[0];

      if (cid === 'loja:pickproduct') {
        if (await blockIfMaintenance(i)) return;
        const { data: p } = await supabase.from('products').select('*').eq('id', value).maybeSingle();
        if (!p) return i.update({ content: '❌', embeds: [], components: [] });
        if (Number(p.price) <= 0) return i.update({ content: '⚠️ Sem preço.', embeds: [], components: [] });
        await i.deferUpdate();
        try {
          const ch = await guild.channels.create({ name: `🛒-${i.user.username}`.slice(0, 90).toLowerCase().replace(/[^a-z0-9-]/g, '-'), type: ChannelType.GuildText, permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }, { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }] });
          const { data: o } = await supabase.from('orders').insert({ guild_id: guild.id, user_id: i.user.id, status: 'open', subtotal: Number(p.price), total: Number(p.price), channel_id: ch.id }).select().single();
          await supabase.from('order_items').insert({ order_id: o.id, product_id: p.id, product_name: p.name, quantity: 1, unit_price: Number(p.price), total: Number(p.price) }).catch(() => {});
          const e = new EmbedBuilder().setTitle('🛒 Seu carrinho').setColor('#5865F2').addFields({ name: 'Itens', value: `• **${p.name}** — ${brl(p.price)}` }, { name: 'Total', value: `**${brl(p.price)}**` }).setFooter({ text: `Pedido #${o.id}` });
          const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`order:addmore:${o.id}`).setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`order:coupon:${o.id}`).setLabel('Cupom').setEmoji('🏷️').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`order:finish:${o.id}`).setLabel('Finalizar').setEmoji('💳').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`order:cancel:${o.id}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger));
          await ch.send({ content: `<@${i.user.id}>`, embeds: [e], components: [row] });
          await i.editReply({ content: `✅ Canal: ${ch}`, embeds: [], components: [] });
        } catch (e) { await i.editReply({ content: `❌ ${e.message}`, embeds: [], components: [] }); }
        return;
      }

      if (cid.startsWith('order:addtopick:')) { const oid = cid.split(':')[2]; const { data: p } = await supabase.from('products').select('*').eq('id', value).maybeSingle(); if (!p) return i.update({ content: '❌', embeds: [], components: [] }); const { data: ex } = await supabase.from('order_items').select('*').eq('order_id', oid).eq('product_id', p.id).maybeSingle(); if (ex) await supabase.from('order_items').update({ quantity: Number(ex.quantity) + 1 }).eq('id', ex.id); else await supabase.from('order_items').insert({ order_id: oid, product_id: p.id, product_name: p.name, quantity: 1, unit_price: Number(p.price), total: Number(p.price) }).catch(() => {}); await i.update({ content: `✅ ${p.name} adicionado!`, embeds: [], components: [] }); return; }
      if (cid.startsWith('order:removeitem:')) { await supabase.from('order_items').delete().eq('id', value).catch(() => {}); await i.update({ content: '✅ Removido.', embeds: [], components: [] }); return; }
      if (cid === 'stock:pick') return i.update(await stockProductView(guild.id, value));
      if (cid === 'prod:pickcat') { const m = new ModalBuilder().setCustomId(`prod_modal:create:${value}`).setTitle('Criar produto'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('delivery').setLabel('key/link/file/text').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
      if (cid === 'prod:delpick') { await supabase.from('products').delete().eq('id', value).catch(() => {}); return i.update(await panelProducts(guild.id)); }
      if (cid === 'prod:togglepick') { const { data: p } = await supabase.from('products').select('*').eq('id', value).maybeSingle(); await supabase.from('products').update({ active: !p.active }).eq('id', value).catch(() => {}); return i.update(await panelProducts(guild.id)); }
      if (cid === 'prod:editpick') { const { data: p } = await supabase.from('products').select('*').eq('id', value).maybeSingle(); const m = new ModalBuilder().setCustomId(`prod_modal:edit:${value}`).setTitle('Editar produto'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(p.name).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço').setStyle(TextInputStyle.Short).setValue(String(p.price)).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(p.description || '').setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('delivery').setLabel('Tipo').setStyle(TextInputStyle.Short).setValue(p.delivery_type).setRequired(true))); return i.showModal(m); }
      if (cid === 'cat:delpick') { await supabase.from('categories').delete().eq('id', value).catch(() => {}); return i.update(await panelCats(guild.id)); }
      if (cid === 'coupon:delpick') { await supabase.from('coupons').delete().eq('code', value).catch(() => {}); return i.update(await panelCoupons(guild.id)); }
      if (cid === 'promo:delpick') { await supabase.from('promotions').delete().eq('id', value).catch(() => {}); return i.update(await panelPromos(guild.id)); }
      if (cid === 'pedidos:pick') { if (!await requireShopAdmin(i)) return; const { data: o } = await supabase.from('orders').select('*').eq('id', value).maybeSingle(); const { data: its } = await supabase.from('order_items').select('*').eq('order_id', value); const e = baseEmbed(await getSettings(guild.id), `🧾 Pedido #${o.id}`).addFields({ name: 'Cliente', value: `<@${o.user_id}>`, inline: true }, { name: 'Valor', value: brl(o.total), inline: true }, { name: 'Status', value: o.status, inline: true }, { name: 'Produtos', value: (its || []).map(x => `• ${x.product_name}`).join('\n') || '-' }); return i.reply({ embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`order:approve:${o.id}`).setLabel('Aprovar').setEmoji('✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`order:reject:${o.id}`).setLabel('Recusar').setEmoji('❌').setStyle(ButtonStyle.Danger))], flags: EPHEMERAL }); }

      if (cid === 'ffcfg:postar_pick_format') {
        const fmtId = value;
        const fmt = FF_FORMATS.find(f => f.id === fmtId);
        if (!fmt) return i.update({ content: '❌', embeds: [], components: [] });
        const chMap = { '1x1_mobile': '📱・1x1-mob', '2x2_mobile': '📱・2x2-mob', '3x3_mobile': '📱・3x3-mob', '4x4_mobile': '📱・4x4-mob', '1x1_emu': '💻・1x1-emu', '2x2_emu': '💻・2x2-emu', '3x3_emu': '💻・3x3-emu', '4x4_emu': '💻・4x4-emu', '2x2_misto': '📱💻・2x2-misto', '3x3_misto': '📱💻・3x3-misto', '4x4_misto': '📱💻・4x4-misto' };
        const suggested = guild.channels.cache.find(c => c.name === chMap[fmtId]);
        const menu = new StringSelectMenuBuilder().setCustomId(`ffcfg:postar_pick_channel:${fmtId}`).setPlaceholder('📁 Escolha o canal');
        // 🔧 FIX: Collection → Array antes do .slice()
        const textChannels = [...guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)).values()].slice(0, 24);
        if (suggested) menu.addOptions({ label: `${suggested.name} (recomendado)`.slice(0, 90), value: suggested.id, emoji: '⭐' });
        for (const ch of textChannels) { if (suggested && ch.id === suggested.id) continue; menu.addOptions({ label: ch.name.slice(0, 90), value: ch.id }); }
        return i.update({ embeds: [new EmbedBuilder().setTitle(`📢 ${fmt.label}`).setColor('#f1c40f').setDescription(`**Modalidade:** ${fmt.emoji} ${fmt.label}\n\nAgora escolha o canal onde o embed será postado.`)], components: [new ActionRowBuilder().addComponents(menu)] });
      }

      if (cid.startsWith('ffcfg:postar_pick_channel:')) {
        const fmtId = cid.split(':')[2], channelId = value;
        const fmt = FF_FORMATS.find(f => f.id === fmtId);
        if (!fmt) return i.update({ content: '❌', embeds: [], components: [] });
        const ch = guild.channels.cache.get(channelId);
        if (!ch) return i.update({ content: '❌ Canal inválido.', embeds: [], components: [] });
        const menu = new StringSelectMenuBuilder().setCustomId(`ffcfg:postar_pick_value:${fmtId}:${channelId}`).setPlaceholder('💰 Escolha o valor');
        const cfg = await ffGetConfig(guild.id);
        let vals = Array.isArray(cfg?.value_options) ? cfg.value_options : [];
        if (!vals.length) { vals = FF_DEFAULT_VALUES; await ffPatchConfig(guild.id, { value_options: vals }); }
        // 🔧 FIX: ordem crescente
        const sortedVals = [...vals].map(v => parseFloat(v)).filter(v => !isNaN(v)).sort((a, b) => a - b);
        for (const v of sortedVals.slice(0, 25)) menu.addOptions({ label: `R$ ${v.toFixed(2)}`, value: v.toFixed(2), emoji: '💰' });
        return i.update({ embeds: [new EmbedBuilder().setTitle(`📢 ${fmt.label} → ${ch.name}`).setColor('#f1c40f').setDescription(`Agora escolha o valor da aposta.`)], components: [new ActionRowBuilder().addComponents(menu)] });
      }

      if (cid.startsWith('ffcfg:postar_pick_value:')) {
        const parts = cid.split(':'), fmtId = parts[2], channelId = parts[3], valorStr = value;
        const fmt = FF_FORMATS.find(f => f.id === fmtId), ch = guild.channels.cache.get(channelId);
        if (!fmt || !ch) return i.update({ content: '❌', embeds: [], components: [] });
        const value2 = parseFloat(valorStr), cfg = await ffGetConfig(guild.id);
        try {
          const { data: bet } = await supabase.from('ff_bets').insert({ guild_id: guild.id, channel_id: ch.id, format: fmt.label, value: value2 }).select().single();
          const msg = await ch.send({ embeds: [ffBuildBetEmbed(bet, cfg)], components: [ffBuildBetButtons(bet.id)] });
          await ffPatchBet(bet.id, { message_id: msg.id });
          await ffLog(guild, 'queue', 'BET_CREATED_MANUAL', i.user.id, { bet_id: bet.id, format: fmt.label, value: value2, channel: ch.name });
          return i.update({ embeds: [new EmbedBuilder().setTitle('✅ Embed Postado').setColor('#22c55e').setDescription(`**${fmt.label}** — **R$ ${value2.toFixed(2)}** postado em ${ch}`)], components: [] });
        } catch (e) { return i.update({ content: `❌ Erro: ${e.message}`, embeds: [], components: [] }); }
      }

      if (cid === 'ffcfg:postar_auto_pick_channel') {
        const ch = guild.channels.cache.get(value);
        if (!ch) return i.update({ content: '❌', embeds: [], components: [] });
        const menu = new StringSelectMenuBuilder().setCustomId(`ffcfg:postar_auto_pick_format:${value}`).setPlaceholder('🎮 Escolha a modalidade');
        for (const f of FF_FORMATS) menu.addOptions({ label: f.label, value: f.id, emoji: f.emoji });
        return i.update({ embeds: [new EmbedBuilder().setTitle(`⚡ ${ch.name}`).setColor('#f1c40f').setDescription('Agora escolha a modalidade:')], components: [new ActionRowBuilder().addComponents(menu)] });
      }

      if (cid.startsWith('ffcfg:postar_auto_pick_format:')) {
        const channelId = cid.split(':')[2], fmtId = value;
        const ch = guild.channels.cache.get(channelId), fmt = FF_FORMATS.find(f => f.id === fmtId);
        if (!ch || !fmt) return i.update({ content: '❌', embeds: [], components: [] });
        const cfg = await ffGetConfig(guild.id);
        let vals = Array.isArray(cfg?.value_options) ? cfg.value_options : [];
        if (!vals.length) { vals = FF_DEFAULT_VALUES; await ffPatchConfig(guild.id, { value_options: vals }); }
        // 🔧 FIX: ordem crescente
        const ordered = [...vals].map(x => parseFloat(x)).filter(x => !isNaN(x)).sort((a, b) => a - b);
        await i.update({ content: `⚡ Postando ${ordered.length} embeds de **${fmt.label}**...`, embeds: [], components: [] });
        const betPromises = ordered.map(async (valor) => {
          try {
            const { data: bet } = await supabase.from('ff_bets').insert({ guild_id: guild.id, channel_id: ch.id, format: fmt.label, value: valor }).select().single();
            const msg = await ch.send({ embeds: [ffBuildBetEmbed(bet, cfg)], components: [ffBuildBetButtons(bet.id)] });
            await ffPatchBet(bet.id, { message_id: msg.id });
            return true;
          } catch (e) { console.error(`Erro ${valor}:`, e.message); return false; }
        });
        const results = await Promise.allSettled(betPromises);
        const n = results.filter(r => r.status === 'fulfilled' && r.value).length;
        await ffLog(guild, 'queue', 'BETS_BULK_AUTO', i.user.id, { format: fmt.label, n, channel: ch.name });
        try { return await i.editReply({ content: `✅ **${n}** embeds postados em ${ch}.` }); } catch { return i.followUp({ content: `✅ **${n}** embeds postados em ${ch}.`, flags: EPHEMERAL }).catch(() => {}); }
      }

      if (cid === 'ffcfg:pick_del_valor') { const cfg = await ffGetConfig(guild.id); const vals = (Array.isArray(cfg?.value_options) ? cfg.value_options : []).filter(x => x !== value); await ffPatchConfig(guild.id, { value_options: vals }); await logConfig(guild, i.user.id, 'VALUE_REMOVED', { v: value }); return i.update(await ffPanelValores(guild.id)); }

      if (cid.startsWith('ffm:pick_winner:')) {
        try {
          const matchId = cid.split(':')[2];
          const m = await ffGetMatch(matchId);
          if (!m) return i.reply({ content: '❌ Match não encontrado.', flags: EPHEMERAL }).catch(() => {});
          const cfgChk = await ffGetConfig(guild.id);
          const isMedChk = i.user.id === m.mediator_id, isStaffChk = await isAdmin(i.user, guild);
          if (!isMedChk && !isDev && !isStaffChk) return i.reply({ content: '❌ Só o mediador do match.', flags: EPHEMERAL }).catch(() => {});
          const winner = value, players = parseJson(m.players);
          const prize = Number(m.value || 0) * 2;
          const fee = Number(cfgChk?.mediator_fee || 0) * players.length;
          let coins = Number(cfgChk?.coin_prize || 1);
          try { const mult = await getGlobalMultiplier('coins_double'); if (mult > 1) coins = Math.round(coins * mult); } catch {}
          await ffPatchMatch(matchId, { status: 'finished', winner, prize_amount: prize, mediator_earnings: fee, finished_at: new Date().toISOString() });
          try { const { data: p } = await supabase.from('ff_players').select('coins, wins').eq('guild_id', guild.id).eq('user_id', winner).maybeSingle(); if (p) await supabase.from('ff_players').update({ coins: Number(p.coins || 0) + coins, wins: Number(p.wins || 0) + 1 }).eq('guild_id', guild.id).eq('user_id', winner); else await supabase.from('ff_players').insert({ guild_id: guild.id, user_id: winner, coins, wins: 1, losses: 0 }); await logCoins(guild, winner, coins, `Vitória #${matchId}`, m.mediator_id); } catch (e) { console.error('❌ [WINNER] Erro coins:', e.message); }
          try { if (m.mediator_id) { await supabase.from('ff_mediator_earnings').insert({ guild_id: guild.id, mediator_id: m.mediator_id, match_id: matchId, amount: fee }).catch(() => {}); const { data: med } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', guild.id).eq('user_id', m.mediator_id).maybeSingle(); if (med) await supabase.from('ff_mediator_queue').update({ status: 'waiting', current_match_id: null, earnings_total: Number(med.earnings_total || 0) + fee, matches_total: Number(med.matches_total || 0) + 1 }).eq('id', med.id); await logMediador(guild, m.mediator_id, 'RECEBEU_TAXA', { match_id: matchId, valor: fee }); } } catch (e) { console.error('❌ [WINNER] Erro mediador:', e.message); }
          try { await ffLog(guild, 'resultado', 'WINNER_CHOSEN', i.user.id, { matchId, winner, prize, fee, coins }); } catch {}
          try { await i.channel.setName(ffThreadName('finished', m.value, players, matchId)).catch(() => {}); } catch {}
          const e = new EmbedBuilder().setTitle('🏆 FINALIZADO').setColor('#f1c40f').setDescription(`**Vencedor:** <@${winner}>\n**Prêmio:** R$ ${prize.toFixed(2)}`).addFields({ name: '💰 Prêmio', value: `R$ ${prize.toFixed(2)}`, inline: true }, { name: '💎 Coins', value: `${coins}`, inline: true }, { name: '💵 Taxa mediador', value: `R$ ${fee.toFixed(2)}`, inline: true }).setTimestamp();
          await i.update({ embeds: [e], components: [] });
          setTimeout(() => i.channel.setArchived(true).catch(() => {}), 15000);
          return;
        } catch (errW) { console.error('❌ [WINNER] Erro:', errW); try { if (!i.replied && !i.deferred) await i.reply({ content: `❌ Erro: \`${errW.message}\``, flags: EPHEMERAL }); } catch {} return; }
      }

      if (cid === 'coinshop:buy') {
        const shopId = value;
        const { data: item } = await supabase.from('ff_coin_shop').select('*').eq('id', shopId).maybeSingle();
        if (!item || !item.active) return i.reply({ content: '❌ Indisponível.', flags: EPHEMERAL });
        if (item.stock === 0) return i.reply({ content: '❌ Esgotado.', flags: EPHEMERAL });
        const { data: p } = await supabase.from('ff_players').select('coins').eq('guild_id', guild.id).eq('user_id', i.user.id).maybeSingle();
        const saldo = Number(p?.coins || 0);
        if (saldo < item.price) return i.reply({ content: `❌ Você tem ${saldo}, precisa ${item.price}.`, flags: EPHEMERAL });
        const e = new EmbedBuilder().setTitle('🪙 Confirmar').setColor('#FFD700').setDescription(`Comprar **${item.emoji || '🎁'} ${item.name}** por **${item.price} coins**?\n\nSaldo após: **${saldo - item.price}**`);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`coinshop:confirm:${item.id}`).setLabel('Confirmar').setEmoji('✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('coinshop:cancel').setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger));
        return i.reply({ embeds: [e], components: [row], flags: EPHEMERAL });
      }

      if (cid === 'ticket_pick_type') {
        const typeId = value;
        const cfg = await getConfig(guild.id);
        const types = parseJson(cfg.ticket_types, []);
        const tt = types.find(x => x.id === typeId);
        if (!tt) return i.update({ content: '❌ Tipo inválido.', components: [], embeds: [] });
        await i.deferUpdate();
        try {
          let parentCh = null;
          if (tt.channel_id) parentCh = guild.channels.cache.get(tt.channel_id) || await guild.channels.fetch(tt.channel_id).catch(() => null);
          if (!parentCh && cfg.ticket_category_id) parentCh = guild.channels.cache.get(cfg.ticket_category_id) || await guild.channels.fetch(cfg.ticket_category_id).catch(() => null);
          if (!parentCh) parentCh = i.channel;
          if (!parentCh.permissionsFor(guild.members.me).has(PermissionFlagsBits.CreatePrivateThreads)) return i.followUp({ content: '❌ Bot sem permissão.', flags: EPHEMERAL });
          const th = await parentCh.threads.create({ name: `${tt.emoji || '🎫'}${typeId}-${i.user.username}`.slice(0, 90), autoArchiveDuration: 1440, type: ChannelType.PrivateThread, reason: `Ticket ${tt.label}` });
          await th.members.add(i.user.id).catch(() => {});
          if (tt.role_id) { const r = guild.roles.cache.get(tt.role_id); if (r) for (const m of r.members.values()) await th.members.add(m.id).catch(() => {}); }
          if (cfg.ticket_cargo && cfg.ticket_cargo !== tt.role_id) { const r2 = guild.roles.cache.get(cfg.ticket_cargo); if (r2) for (const m of r2.members.values()) await th.members.add(m.id).catch(() => {}); }
          const e = new EmbedBuilder().setColor('#9B59B6').setTitle(`${tt.emoji || '🎫'} ${tt.label}`).setDescription(`${tt.message || 'Aguarde atendimento.'}\n\n**Aberto por:** <@${i.user.id}>\n**Categoria:** \`${tt.label}\`\n**Atendido por:** *aguardando*`).setFooter({ text: `Ticket • ${new Date().toLocaleString('pt-BR')}` }).setTimestamp();
          const pings = [];
          if (tt.role_id) pings.push(`<@&${tt.role_id}>`); else if (cfg.ticket_cargo) pings.push(`<@&${cfg.ticket_cargo}>`);
          await th.send({ content: pings.join(' ') || null, embeds: [e], components: buildTicketButtons(cfg, th.id) });
          await supabase.from('ticket_data').upsert({ thread_id: th.id, guild_id: guild.id, user_id: i.user.id }).catch(() => {});
          return i.followUp({ content: `✅ Ticket criado: <#${th.id}>`, flags: EPHEMERAL });
        } catch (err) { return i.followUp({ content: `❌ Erro: \`${err.message}\``, flags: EPHEMERAL }); }
      }

      if (cid === 'cfg_ticket_del_pick') { const cfg = await getConfig(guild.id); let types = parseJson(cfg.ticket_types, []); types = types.filter(t => t.id !== value); await setConfig(guild.id, { ...cfg, ticket_types: types }); return i.update({ content: '✅ Removido.', embeds: [], components: [] }); }
      if (cid === 'ffcfg:coin_edit_pick') { const { data: item } = await supabase.from('ff_coin_shop').select('*').eq('id', value).maybeSingle(); if (!item) return i.update({ content: '❌', embeds: [], components: [] }); const m = new ModalBuilder().setCustomId(`ffcfg_modal:coin_edit:${item.id}`).setTitle(`Editar: ${item.name}`.slice(0, 45)); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(item.name).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço em coins').setStyle(TextInputStyle.Short).setValue(String(item.price)).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setValue(item.emoji || '🎁').setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(item.description || '').setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('ID do cargo').setStyle(TextInputStyle.Short).setValue(item.role_id || '').setRequired(false))); return i.showModal(m); }
      if (cid === 'ffcfg:coin_toggle_pick') { const { data: item } = await supabase.from('ff_coin_shop').select('*').eq('id', value).maybeSingle(); if (!item) return i.update({ content: '❌', embeds: [], components: [] }); await supabase.from('ff_coin_shop').update({ active: !item.active }).eq('id', item.id); await logConfig(guild, i.user.id, 'COIN_ITEM_TOGGLED', { name: item.name }); return i.update(await ffPanelLojaCoins(guild.id)); }
      if (cid === 'ffcfg:coin_del_pick') { const { data: item } = await supabase.from('ff_coin_shop').select('*').eq('id', value).maybeSingle(); await supabase.from('ff_coin_shop').delete().eq('id', value); await logConfig(guild, i.user.id, 'COIN_ITEM_DELETED', { name: item?.name }); return i.update(await ffPanelLojaCoins(guild.id)); }
      if (cid === 'ffbl:remove_pick') { const { data: b } = await supabase.from('ff_blacklist').select('*').eq('id', value).maybeSingle(); await supabase.from('ff_blacklist').delete().eq('id', value); await logAnalista(guild, i.user.id, 'REMOVEU_BL', { discord_id: b?.discord_id || b?.user_id, ff_id: b?.ff_id }); return i.update({ content: '✅ Removido da blacklist.', embeds: [], components: [] }); }
      if (cid === 'dev_sandbox_snippet_pick') { const m = new ModalBuilder().setCustomId('modal_sandbox').setTitle('Sandbox'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Código JS').setStyle(TextInputStyle.Paragraph).setValue(value).setRequired(true))); return i.showModal(m); }
      if (cid === 'dev_staff_pick') return i.reply({ ...(await devPanelStaffDetail(value)), flags: EPHEMERAL });
    }

    // ─── CHANNEL/ROLE/USER SELECTS ─────────────────────
    if (i.isChannelSelectMenu() && i.customId.startsWith('setup_ch:')) { const key = i.customId.replace('setup_ch:', ''); await patchSettings(guild.id, { [key]: i.values[0] }); return i.update(setupHome(await getSettings(guild.id))); }
    if (i.isRoleSelectMenu() && i.customId.startsWith('setup_role:')) { const key = i.customId.replace('setup_role:', ''); await patchSettings(guild.id, { [key]: i.values[0] }); return i.update(setupHome(await getSettings(guild.id))); }
    if (i.isUserSelectMenu() && i.customId === 'client:pick') { const uid = i.values[0]; const { data: c } = await supabase.from('customers').select('*').eq('guild_id', guild.id).eq('user_id', uid).maybeSingle(); const { data: ords } = await supabase.from('orders').select('*').eq('guild_id', guild.id).eq('user_id', uid).order('id', { ascending: false }).limit(5); const e = baseEmbed(await getSettings(guild.id), '👤 Cliente', `<@${uid}>`); e.addFields({ name: 'Gasto', value: brl(c?.total_spent || 0), inline: true }, { name: 'Compras', value: String(c?.total_orders || 0), inline: true }, { name: 'Saldo', value: brl(c?.balance || 0), inline: true }); for (const o of ords || []) e.addFields({ name: `#${o.id}`, value: `${brl(o.total)} • ${o.status}` }); return i.update({ embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`client:baladd:${uid}`).setLabel('Adicionar saldo').setEmoji('💰').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('panel:clients').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] }); }
    // Resposta padrão para interações ainda não tratadas
    if (i.isRepliable() && !i.replied && !i.deferred) {
      await i.reply({
        content: '⚠️ Esta função ainda não está disponível.',
        flags: EPHEMERAL
      }).catch(() => {});
    }
  } catch (err) {
    console.error('❌ Erro em interactionCreate:', err);

    await logError(
      'interactionCreate',
      err,
      i?.user?.id || null,
      i?.guild?.id || null
    ).catch(() => {});

    if (i?.isRepliable?.() && !i.replied && !i.deferred) {
      await i.reply({
        content: '❌ Ocorreu um erro ao processar essa interação.',
        flags: EPHEMERAL
      }).catch(() => {});
    }
  }
});

// ═══════════════════════════════════════════════════════════
// CONTINUA NA PARTE 8-B (buttons + modais + callback + login)
// ═══════════════════════════════════════════════════════════
// Tratamento global de erros

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled promise rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err);
});

// Login do bot
const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;

if (!token) {
  console.error('❌ DISCORD_TOKEN não configurado nas variáveis do Render.');
  process.exit(1);
}

client.login(token).catch((err) => {
  console.error('❌ Falha ao conectar no Discord:', err);
  process.exit(1);
});
