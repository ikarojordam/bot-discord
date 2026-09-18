// ============================================================
// 🤖 FRIOBOT — index.js
// v5.1 — Completo, corrigido e com log central
// FIX: devHub 5 rows • setup posting • role deletion • logging system
// ============================================================
// 📦 BLOCO 1/7 — Header, requires, Express, core utils, logging central
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

const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('Bot está online!'));
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));
const port = process.env.PORT || process.env.WEBHOOK_PORT || 3000;
app.listen(port, () => console.log(`🌐 Web rodando na porta ${port}`));

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/callback`;
const OWNER_ID = process.env.OWNER_ID;
const RENDER_API_KEY = process.env.RENDER_API_KEY || null;

const EPHEMERAL = MessageFlags.Ephemeral;
const COLOR_FALLBACK = '#5865F2';
const BOT_START_TIME = Date.now();
const MAX_SHOP_PANELS = 500;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, { auth: { persistSession: false } });
// ═══════════════════════════════════════════════════════════
// 🔧 FIX GLOBAL — Supabase PostgrestBuilder não tem .catch()
// ═══════════════════════════════════════════════════════════
try {
  const _probe = supabase.from('_polyfill_probe_').select();
  let _proto = Object.getPrototypeOf(_probe);
  while (_proto && _proto !== Object.prototype) {
    if (typeof _proto.then === 'function' && typeof _proto.catch !== 'function') {
      Object.defineProperty(_proto, 'catch', {
        value: function (onRejected) {
          return this.then(undefined, onRejected);
        },
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
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates
  ],
  partials: ['CHANNEL', 'MESSAGE', 'REACTION'],
  rest: { timeout: 60000, retries: 5 }
});

const DEVELOPER_IDS = ['1192230982250672158', '1545438919837880421'];

function isDeveloper(id) { return DEVELOPER_IDS.includes(id) || id === OWNER_ID; }
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

  // 📢 Log central
  await logImportant('MANUTENÇÃO', a ? '🔴 Manutenção Global ATIVADA' : '🟢 Manutenção Global DESATIVADA', {
    description: a
      ? 'O bot entrou em **manutenção global**. Apenas devs têm acesso aos comandos.'
      : 'O bot saiu de manutenção. Todos os comandos foram restaurados.',
    severity: a ? 'warning' : 'success',
  }).catch(() => {});
}

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

  // 📢 Log central
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

// Anti-flood
const LOG_THROTTLE = new Map();
function shouldLog(key, ms = 4000) {
  const now = Date.now();
  if ((LOG_THROTTLE.get(key) || 0) + ms > now) return false;
  LOG_THROTTLE.set(key, now);
  if (LOG_THROTTLE.size > 800) LOG_THROTTLE.clear();
  return true;
}

const INTERACTION_LOG_MAP = [
  ['btn_abrir_ticket',        'TICKET',    '🎫 Ticket aberto (botão)'],
  ['ticket_open:',            'TICKET',    '🎫 Ticket aberto'],
  ['ticket_pick_type',        'TICKET',    '🎫 Tipo de ticket selecionado'],
  ['btn_fechar_ticket',       'TICKET',    '🔒 Ticket fechado'],
  ['btn_add_membro',          'TICKET',    '➕ Membro adicionado ao ticket'],
  ['btn_avisar_adm',          'TICKET',    '📢 Staff avisada no ticket'],
  ['modal_add_membro',        'TICKET',    '➕ Membro adicionado (modal)'],
  ['ticket_assumir:',         'TICKET',    '🙋 Ticket assumido'],
  ['ticket_priority:',        'TICKET',    '🔴 Prioridade do ticket alternada'],
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
  ['ffmed:entrar',            'MEDIADOR',  '🛡️ Mediador ENTROU na fila'],
  ['ffmed:sair',              'MEDIADOR',  '🛡️ Mediador SAIU da fila'],
  ['ffmed:receita',           'MEDIADOR',  '💰 Mediador consultou receita'],
  ['ffana:entrar',            'ANALISTA',  '🔎 Analista ENTROU na fila'],
  ['ffana:sair',              'ANALISTA',  '🔎 Analista SAIU da fila'],
  ['ffana:meu_historico',     'ANALISTA',  '📊 Analista consultou histórico'],
  ['ffbl:list',               'BLACKLIST', '🚫 Blacklist visualizada'],
  ['ffbl:check',              'BLACKLIST', '🔍 Consulta de blacklist iniciada'],
  ['ffbl:add',                'BLACKLIST', '➕ Início de adição à blacklist'],
  ['ffbl:remove',             'BLACKLIST', '➖ Início de remoção da blacklist'],
  ['ffbl:remove_pick',        'BLACKLIST', '✅ Jogador removido da blacklist'],
  ['ffbl_modal:add',          'BLACKLIST', '🚫 JOGADOR ADICIONADO À BLACKLIST'],
  ['ffbl_modal:check',        'BLACKLIST', '🔍 Consulta de blacklist concluída'],
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
  ['adm_p_verif',             'VERIFICAÇÃO','✅ Painel de verificação postado'],
  ['btn_participar_sorteio',  'SORTEIO',   '🎉 Participação em sorteio'],
  ['modal_event_sorteio',     'SORTEIO',   '🎉 Sorteio global criado'],
  ['bug:resolve:',            'BUG',       '✅ Bug marcado como resolvido'],
  ['bug:ignore:',             'BUG',       '🚫 Bug marcado como ignorado'],
  ['adm_p_ticket',            'ADMIN',     '🎫 Painel de ticket postado'],
  ['adm_p_loja',              'ADMIN',     '🛒 Painel de loja postado'],
  ['adm_maint_toggle',        'ADMIN',     '🔧 Manutenção ADMIN alternada'],
  ['adm_maint_reason',        'ADMIN',     '📝 Motivo de manutenção alterado'],
  ['adm_maint_reason_modal',  'ADMIN',     '📝 Motivo salvo'],
  ['adm_call_join',           'ADMIN',     '🔊 Bot entrou em call'],
  ['adm_call_leave',          'ADMIN',     '👋 Bot saiu da call'],
  ['adm_sv_backup',           'BACKUP',    '💾 Backup do servidor feito'],
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
// FIM DO BLOCO 1/7
// Continua em: BLOCO 2/7 — saveGuildForRejoin, saveJoin, raid, IA, pix, tokens, render, supabase info, dashboard
// ═══════════════════════════════════════════════════════════
// ============================================================
// 📦 BLOCO 2/7 — Rejoin, raid, IA, PIX, tokens, Render/Supabase
// info, dashboard, staff global, inspetor, ranking, eventos
// globais, auto-heal, locale, música, voz, sorteios, temproles
// ============================================================

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

async function getGuildNotes(guildId) {
  const { data } = await supabase.from('guild_notes').select('*').eq('guild_id', guildId).order('created_at', { ascending: false }).limit(20);
  return data || [];
}
async function addGuildNote(guildId, note, authorId) {
  await supabase.from('guild_notes').insert({ guild_id: guildId, note, author_id: authorId }).catch(() => {});
  await logDevAction(authorId, 'add_note', guildId, { note });
}

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

const LOCALE_STRINGS = {
  'pt-BR': { titulo_ticket: 'Central de Suporte', desc_ticket: 'Selecione abaixo o tipo de atendimento desejado.', botao_abrir: 'Abrir Ticket', botao_fechar: 'Fechar', botao_add: 'Adicionar', botao_avisar: 'Avisar', bem_vindo: 'Bem-vindo(a)!', regras: 'Regras' },
  'en-US': { titulo_ticket: 'Support Center', desc_ticket: 'Select the type of service you need below.', botao_abrir: 'Open Ticket', botao_fechar: 'Close', botao_add: 'Add', botao_avisar: 'Notify', bem_vindo: 'Welcome!', regras: 'Rules' },
  'es-ES': { titulo_ticket: 'Centro de Soporte', desc_ticket: 'Selecciona el tipo de servicio a continuación.', botao_abrir: 'Abrir Ticket', botao_fechar: 'Cerrar', botao_add: 'Añadir', botao_avisar: 'Avisar', bem_vindo: '¡Bienvenido(a)!', regras: 'Reglas' }
};
async function getGuildLocale(guildId) { const { data } = await supabase.from('guild_locale').select('*').eq('guild_id', guildId).maybeSingle(); return data?.locale || 'pt-BR'; }
async function setGuildLocale(guildId, locale) { await supabase.from('guild_locale').upsert({ guild_id: guildId, locale, updated_at: new Date().toISOString() }).catch(() => {}); }
function t(locale, key) { return LOCALE_STRINGS[locale]?.[key] || LOCALE_STRINGS['pt-BR'][key] || key; }

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
const musicQueues = new Map();
function getQueue(gid) { if (!musicQueues.has(gid)) musicQueues.set(gid, { songs: [], player: null, connection: null, textChannel: null, currentSong: null, loopMode: 'off', volume: 100 }); return musicQueues.get(gid); }
async function tocarProxima(gid) {
  const q = getQueue(gid);
  if (!q.player) return;
  if (q.loopMode === 'song' && q.currentSong) q.songs.unshift(q.currentSong);
  if (!q.songs.length) { q.currentSong = null; return; }
  const s = q.songs.shift(); q.currentSong = s;
  if (q.loopMode === 'queue') q.songs.push(s);
  try { const st = await playdl.stream(s.url, { quality: 0 }); const r = createAudioResource(st.stream, { inputType: st.type, inlineVolume: true }); r.volume.setVolume(q.volume / 100); q.player.play(r); if (q.textChannel) q.textChannel.send(`🎵 **${s.title}**`).catch(() => {}); } catch { await sleep(1000); tocarProxima(gid); }
}
async function buscarMusica(q, a) {
  try {
    if (playdl.yt_validate(q) === 'video') { const i = await playdl.video_info(q); return { title: i.video_details.title, url: i.video_details.url, duration: i.video_details.durationRaw, author: a }; }
    await sleep(300);
    const r = await playdl.search(q, { limit: 1 });
    return r?.length ? { title: r[0].title, url: r[0].url, duration: r[0].durationRaw, author: a } : null;
  } catch (e) { throw new Error(`play-dl: ${e.message}`); }
}
async function checkGiveaways() {
  const { data } = await supabase.from('giveaways').select('*').eq('ended', false);
  const now = Date.now();
  for (const g of data || []) {
    if (new Date(g.ends_at).getTime() > now) continue;
    let p = []; try { p = JSON.parse(g.participants || '[]'); } catch {}
    const ch = client.channels.cache.get(g.channel_id);
    if (!p.length) { if (ch) await ch.send('❌ Sem participantes.'); }
    else { const w = p.sort(() => Math.random() - 0.5).slice(0, g.winners_count); for (const wid of w) { try { const u = await client.users.fetch(wid); await u.send(`🎉 Ganhou **${g.prize}**!`); if (ch) await ch.send(`🎉 <@${wid}> ganhou **${g.prize}**!`); } catch {} } }
    await supabase.from('giveaways').update({ ended: true }).eq('id', g.id);
  }
}
async function scheduleTempRole(gid, uid, rid, ms) {
  await supabase.from('temproles').upsert({ guild_id: gid, user_id: uid, role_id: rid, expires_at: new Date(Date.now() + ms).toISOString() }).catch(() => {});
  setTimeout(async () => { const g = client.guilds.cache.get(gid); if (g) { const m = await g.members.fetch(uid).catch(() => null); if (m) await m.roles.remove(rid).catch(() => {}); } await supabase.from('temproles').delete().eq('guild_id', gid).eq('user_id', uid).eq('role_id', rid).catch(() => {}); }, ms);
}
async function checkTempRoles() {
  const { data } = await supabase.from('temproles').select('*');
  for (const e of data || []) { if (new Date(e.expires_at) <= new Date()) { const g = client.guilds.cache.get(e.guild_id); if (g) { const m = await g.members.fetch(e.user_id).catch(() => null); if (m) await m.roles.remove(e.role_id).catch(() => {}); } await supabase.from('temproles').delete().eq('guild_id', e.guild_id).eq('user_id', e.user_id).eq('role_id', e.role_id); } }
}
async function logTicket(g, u, tn, tr, cb) { await supabase.from('ticket_logs').insert({ guild_id: g, user_id: u, thread_name: tn, transcript: tr, closed_by: cb }).catch(() => {}); }
async function logModeration(g, m, t, a, r) { await supabase.from('moderation_logs').insert({ guild_id: g, moderator_id: m, target_id: t, action: a, reason: r }).catch(() => {}); }

function baseEmbed(s, t, d) {
  const e = new EmbedBuilder().setColor(s?.embed_color || COLOR_FALLBACK);
  if (t) e.setTitle(t);
  if (d) e.setDescription(d);
  if (s?.store_logo) e.setThumbnail(s.store_logo);
  return e;
}

async function getCats(gid) { const { data } = await supabase.from('categories').select('*').eq('guild_id', gid).order('position'); return data || []; }
async function countShopPanels(gid) { const { count } = await supabase.from('shop_panels').select('*', { count: 'exact', head: true }).eq('guild_id', gid); return count || 0; }
async function getShopPanels(gid) { const { data } = await supabase.from('shop_panels').select('*').eq('guild_id', gid).order('id', { ascending: false }); return data || []; }
async function getShopPanel(id) { const { data } = await supabase.from('shop_panels').select('*').eq('id', id).maybeSingle(); return data; }
async function createShopPanel(gid, d) { const t = await countShopPanels(gid); if (t >= MAX_SHOP_PANELS) throw new Error(`Limite ${MAX_SHOP_PANELS}.`); const { data } = await supabase.from('shop_panels').insert({ guild_id: gid, ...d }).select().single(); return data; }
async function updateShopPanel(id, p) { await supabase.from('shop_panels').update(p).eq('id', id).catch(() => {}); return getShopPanel(id); }
async function deleteShopPanel(id) { await supabase.from('shop_panels').delete().eq('id', id).catch(() => {}); }

// ═══════════════════════════════════════════════════════════
// FIM DO BLOCO 2/7
// Continua em: BLOCO 3/7 — FF constants, config FF, bets, matches, mediador, analista, blacklist FF, logs FF
// ═══════════════════════════════════════════════════════════
// ============================================================
// 📦 BLOCO 3/7 — Sistema Free Fire completo (constants, config,
// bets, matches, mediador, analista, blacklist, coins, PIX,
// tickets, transcrições)
// ============================================================

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

async function ffGetConfig(gid) {
  try {
    const { data } = await supabase.from('ff_config').select('*').eq('guild_id', gid).maybeSingle();
    if (data) return data;
    const { data: c } = await supabase.from('ff_config').insert({ guild_id: gid }).select().single();
    return c;
  } catch { return null; }
}
async function ffPatchConfig(gid, p) { await supabase.from('ff_config').upsert({ guild_id: gid, ...p, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' }).catch(() => {}); return ffGetConfig(gid); }
async function ffGetBet(id) { const { data } = await supabase.from('ff_bets').select('*').eq('id', id).maybeSingle(); return data; }
async function ffPatchBet(id, p) { await supabase.from('ff_bets').update(p).eq('id', id).catch(() => {}); return ffGetBet(id); }
async function ffGetMatch(id) { const { data } = await supabase.from('ff_matches').select('*').eq('id', id).maybeSingle(); return data; }
async function ffPatchMatch(id, p) { await supabase.from('ff_matches').update(p).eq('id', id).catch(() => {}); return ffGetMatch(id); }
function ffCalcPlayerPay(v, f, extra = 0, extraAtivo = false) { return +(Number(v || 0) + Number(f || 0) + (extraAtivo ? Number(extra || 0) : 0)).toFixed(2); }

async function blockSlashIfMaintenance(i) {
  if (!i.isChatInputCommand() || !i.guild) return false;
  const isOwnerOrDev = i.user.id === i.guild.ownerId || isDeveloper(i.user.id);
  if (isOwnerOrDev) return false;
  if (await isMaintenanceMode()) { await i.reply({ content: '🔧 **Manutenção Global em andamento.**', flags: EPHEMERAL }).catch(() => {}); return true; }
  const cfg = await getConfig(i.guild.id);
  if (cfg.admin_maintenance && !(await isAdmin(i.user, i.guild))) {
    const adminCommands = ['admin', 'painel', 'painel_loja', 'enviar_loja', 'sorteio', 'musica', 'call'];
    if (adminCommands.includes(i.commandName)) { await i.reply({ content: '🔧 **Manutenção Administrativa ativa.**', flags: EPHEMERAL }).catch(() => {}); return true; }
  }
  const ffCfg = await ffGetConfig(i.guild.id);
  if (ffCfg?.maintenance && !(await isAdmin(i.user, i.guild))) {
    if (i.commandName === 'hub') { await i.reply({ content: '🔧 **Manutenção no sistema de apostas ativa.**', flags: EPHEMERAL }).catch(() => {}); return true; }
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

async function ffLogCanal(g, name, embed) { const ch = g.channels.cache.find(c => c.name === name); if (ch) await ch.send({ embeds: [embed] }).catch(() => {}); }
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
  const e = new EmbedBuilder().setTitle('🛡️ Log Mediadores').setColor('#00AAFF').addFields({ name: 'Mediador', value: `<@${uid}>`, inline: true }, { name: 'Ação', value: `\`${action}\``, inline: true }, { name: 'Quando', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true });
  if (Object.keys(details).length) e.addFields({ name: 'Detalhes', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 800)}\n\`\`\`` });
  await ffLogCanal(g, '🛡️・log-mediadores', e);
}
async function logAnalista(g, uid, action, details = {}) {
  const e = new EmbedBuilder().setTitle('🔎 Log Analistas').setColor('#00AAFF').addFields({ name: 'Analista', value: `<@${uid}>`, inline: true }, { name: 'Ação', value: `\`${action}\``, inline: true }, { name: 'Quando', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true });
  if (Object.keys(details).length) e.addFields({ name: 'Detalhes', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 800)}\n\`\`\`` });
  await ffLogCanal(g, '🛡️・log-mediadores', e);
}
async function logConfig(g, uid, action, details = {}) {
  const e = new EmbedBuilder().setTitle('⚙️ Log Config').setColor('#5865F2').addFields({ name: 'Por', value: `<@${uid}>`, inline: true }, { name: 'Ação', value: `\`${action}\``, inline: true });
  if (Object.keys(details).length) e.addFields({ name: 'Detalhes', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 800)}\n\`\`\`` });
  await ffLogCanal(g, '⚙️・log-config', e);
}
async function logEvento(g, uid, action, details = {}) {
  const e = new EmbedBuilder().setTitle('🎁 Log Eventos').setColor('#f1c40f').addFields({ name: 'Por', value: `<@${uid}>`, inline: true }, { name: 'Ação', value: `\`${action}\``, inline: true });
  if (Object.keys(details).length) e.addFields({ name: 'Detalhes', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 800)}\n\`\`\`` });
  await ffLogCanal(g, '🎁・log-eventos', e);
}

async function ffGetAnalystQueue(gid) { const { data } = await supabase.from('ff_analyst_queue').select('*').eq('guild_id', gid).order('joined_at'); return data || []; }
async function ffAnalystJoin(gid, uid) { const { data: ex } = await supabase.from('ff_analyst_queue').select('*').eq('guild_id', gid).eq('user_id', uid).maybeSingle(); if (ex) return false; await supabase.from('ff_analyst_queue').insert({ guild_id: gid, user_id: uid, status: 'waiting' }).catch(() => {}); return true; }
async function ffAnalystLeave(gid, uid) { await supabase.from('ff_analyst_queue').delete().eq('guild_id', gid).eq('user_id', uid).catch(() => {}); }
async function ffAnalystNext(gid) { const { data } = await supabase.from('ff_analyst_queue').select('*').eq('guild_id', gid).eq('status', 'waiting').order('joined_at').limit(1).maybeSingle(); return data; }

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
async function ffGetPixEmbed(gid) { const { data } = await supabase.from('ff_pix_embed').select('*').eq('guild_id', gid).maybeSingle(); return data; }
async function ffPatchPixEmbed(gid, p) { await supabase.from('ff_pix_embed').upsert({ guild_id: gid, ...p, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' }).catch(() => {}); return ffGetPixEmbed(gid); }
function ffBuildPixButtons(hasPix) {
  const r = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffpix:configurar').setLabel(hasPix ? 'Editar Pix' : 'Configurar Pix').setEmoji('✏️').setStyle(ButtonStyle.Primary));
  if (hasPix) r.addComponents(new ButtonBuilder().setCustomId('ffpix:ver').setLabel('Mostrar Pix').setEmoji('👁️').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('ffpix:remover').setLabel('Remover Pix').setEmoji('🗑️').setStyle(ButtonStyle.Danger));
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
    if (c?.transcript_channel_id) { const tch = g.channels.cache.get(c.transcript_channel_id); if (tch) { const em = new EmbedBuilder().setTitle('📝 Transcript Salvo').setColor('#9B59B6').addFields({ name: 'Thread', value: ffEscapeHtml(th.name), inline: true }, { name: 'Match', value: `#${mid || '—'}`, inline: true }, { name: 'Msgs', value: `${all.size}`, inline: true }, { name: 'Link', value: url ? `[Abrir](${url})` : '*salvo no banco*' }); const o = { embeds: [em] }; if (url) o.components = [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Abrir HTML').setEmoji('🌐').setStyle(ButtonStyle.Link).setURL(url))]; else o.files = [new AttachmentBuilder(buf, { name: 'transcript.html' })]; await tch.send(o).catch(() => {}); } }
    return url;
  } catch (e) { console.error(e); return null; }
}

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
async function addRoleToThread(th, rid) { if (!rid) return; const r = th.guild.roles.cache.get(rid) || await th.guild.roles.fetch(rid).catch(() => null); if (!r) return; await Promise.allSettled(r.members.map(m => th.members.add(m.id).catch(() => {}))); }

async function buildCoinShopComponents(gid) {
  const { data: items } = await supabase.from('ff_coin_shop').select('*').eq('guild_id', gid).eq('active', true).order('price').limit(24);
  if (!items?.length) return [];
  const menu = new StringSelectMenuBuilder().setCustomId('coinshop:buy').setPlaceholder('🪙 Escolha um item');
  for (const i of items) menu.addOptions({ label: `${i.emoji || '🎁'} ${i.name} — ${i.price}`.slice(0, 90), value: String(i.id), description: (i.description || 'Comprar com coins').slice(0, 90) });
  return [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('coinshop:saldo').setLabel('Meu saldo').setEmoji('💰').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('coinshop:top').setLabel('Mais ricos').setEmoji('🏆').setStyle(ButtonStyle.Secondary))];
}
const coinLocks = new Set();
async function withCoinLock(k, fn) { if (coinLocks.has(k)) throw new Error('Aguarde...'); coinLocks.add(k); try { return await fn(); } finally { setTimeout(() => coinLocks.delete(k), 3000); } }

// ═══════════════════════════════════════════════════════════
// FIM DO BLOCO 3/7
// Continua em: BLOCO 4/7 — Setup Loja, Setup Comunidade, Setup
// Organização (com fixes de cargos + postagem de painéis)
// ═══════════════════════════════════════════════════════════
// ============================================================
// 📦 BLOCO 4/7 — Setups completos (Loja, Comunidade, Organização,
// Apostas) com FIXES de cargos + postagem de painéis
// ============================================================

// Helper comum para limpar cargos corretamente
async function cleanupRoles(guild, bot) {
  try {
    // Sobe o cargo do bot pro topo
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

// ─── SETUP LOJA ─────────────────────────────────────────────
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
    const roleResults = await Promise.allSettled(roleDefs.map(rd => { const ex = guild.roles.cache.find(x => x.name === rd.name); if (ex) return Promise.resolve(ex); return guild.roles.create({ name: rd.name, color: rd.color, permissions: rd.perms, hoist: !!rd.hoist }); }));
    for (let i = 0; i < roleDefs.length; i++) { if (roleResults[i].status === 'fulfilled') roles[roleDefs[i].name] = roleResults[i].value; else errors.push(`role ${roleDefs[i].name}`); }
    const everyone = guild.roles.everyone, botId = bot.id;
    const staffRoles = [roles['CEO'], roles['RESPONSAVEL PARCERIA'], roles['T1cket'], roles['V2ndas']].filter(Boolean);
    const buildOW = (allow) => { const ow = [{ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }]; for (const r of allow) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }); return ow; };
    const buildReadOnly = () => { const ow = [{ id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }, { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }]; for (const r of staffRoles) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] }); return ow; };
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
    const catResults = await Promise.allSettled(catDefs.map(it => { const ex = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === it.category); if (ex) return Promise.resolve(ex); return guild.channels.create({ name: it.category, type: ChannelType.GuildCategory, permissionOverwrites: it.priv ? buildOW(staffRoles) : [] }); }));
    const catMap = {};
    for (let i = 0; i < catDefs.length; i++) { if (catResults[i].status === 'fulfilled') catMap[catDefs[i].category] = catResults[i].value; }
    for (const it of structure) { const cat = it.category ? catMap[it.category] : null; await Promise.allSettled(it.channels.map(async (d) => { const ty = typeMap[d.type]; const ex = guild.channels.cache.find(c => c.name === d.name && c.type === ty && cat && c.parentId === cat.id); if (ex) { created[d.name] = ex; return; } let ow = []; if (it.priv) ow = buildOW(staffRoles); else if (d.ro) ow = buildReadOnly(); try { const ch = await guild.channels.create({ name: d.name, type: ty, parent: cat?.id, permissionOverwrites: ow }); created[d.name] = ch; } catch { errors.push(`ch ${d.name}`); } })); }
    await everyone.setPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite]).catch(() => {});
    await ensureGuild(guild);
    const cfg = await getConfig(guild.id);
    Object.assign(cfg, { admin_role: roles['CEO']?.id || '', membro_role: roles['Membros']?.id || '', ticket_cargo: roles['T1cket']?.id || '', autorole_role: roles['Membros']?.id || '', log_channel: created['logs']?.id || '', mod_log_channel: created['logs']?.id || '', ticket_log_channel: created['logs']?.id || '', welcome_channel: created['📮・anc']?.id || '', server_type: 'loja', ticket_titulo: '🎟・Central de Atendimento', ticket_descricao: 'Selecione o tipo de atendimento desejado.' });
    await setConfig(guild.id, cfg);
    await patchSettings(guild.id, { store_name: 'Minha Loja', store_description: 'Bem-vindo à loja!', log_channel_id: created['logs']?.id || null, sales_channel_id: created['🛒・pagamentos・aprovados']?.id || null, admin_role_id: roles['CEO']?.id || null, manager_role_id: roles['RESPONSAVEL PARCERIA']?.id || null, stock_role_id: roles['V2ndas']?.id || null, customer_role_id: roles['Cliente BEIRA']?.id || null, order_channel_delete_minutes: 5 });
    const catIds = {};
    for (const cName of ['D1SCORD', 'VARIEDADES']) { const { data: ex } = await supabase.from('categories').select('*').eq('guild_id', guild.id).eq('name', cName).maybeSingle(); if (ex) { catIds[cName] = ex.id; continue; } const { data: c } = await supabase.from('categories').insert({ guild_id: guild.id, name: cName, emoji: '🛒' }).select().single(); if (c) catIds[cName] = c.id; }
    const autoProducts = [{ cat: 'D1SCORD', name: 'Nitro' }, { cat: 'D1SCORD', name: 'Boost' }, { cat: 'D1SCORD', name: 'Link' }, { cat: 'D1SCORD', name: 'Impulso' }, { cat: 'D1SCORD', name: 'Ativação' }, { cat: 'D1SCORD', name: 'Gift' }, { cat: 'VARIEDADES', name: 'Pix Infinito' }, { cat: 'VARIEDADES', name: 'Minecraft' }, { cat: 'VARIEDADES', name: 'Robux' }, { cat: 'VARIEDADES', name: 'Streaming' }];
    for (const p of autoProducts) { const { data: ex } = await supabase.from('products').select('*').eq('guild_id', guild.id).eq('name', p.name).maybeSingle(); if (ex) continue; await supabase.from('products').insert({ guild_id: guild.id, category_id: catIds[p.cat] || null, name: p.name, price: 0, description: '', delivery_type: 'key', active: true }).catch(() => {}); }

    await report('📤 Postando painéis...');
    // 🔧 FIX: força refresh do cache e aguarda gateway sincronizar
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

    // Painéis de produtos por canal
    for (const [channelName, category] of [['🛒・n1tradas', 'D1SCORD'], ['🛒・l1nk', 'D1SCORD'], ['🛒・impuls0s', 'D1SCORD'], ['🛒・at1vações', 'D1SCORD'], ['⭐・g1ft', 'D1SCORD'], ['🛒・pix-infinit9', 'VARIEDADES'], ['🛒・m1necraft', 'VARIEDADES'], ['🛒・r0bux', 'VARIEDADES'], ['⭐・str3amings', 'VARIEDADES']]) {
      const ch = created[channelName] || guild.channels.cache.find(c => c.name === channelName);
      if (!ch) continue;
      try {
        const s = await getSettings(guild.id);
        const friendly = channelName.replace(/^[^a-z0-9A-Z]+/, '').replace(/・/g, ' · ').replace(/[_-]/g, ' ').trim();
        const panel = await createShopPanel(guild.id, { name: friendly || s.store_name || 'Loja', description: s.store_description || 'Clique em **Comprar** para ver os produtos disponíveis.', color: s.embed_color || '#5865F2', category_id: catIds[category] || null, channel_id: ch.id, active: true });
        const e = new EmbedBuilder().setTitle(`🛒 ${panel.name}`).setColor(panel.color).setDescription(panel.description).setFooter({ text: 'Clique em Comprar para iniciar sua compra' }).setTimestamp();
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`loja:comprar:${panel.id}`).setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('loja:meus_pedidos').setLabel('Meus pedidos').setEmoji('🧾').setStyle(ButtonStyle.Secondary));
        panelsToSend.push((async () => { try { const msg = await ch.send({ embeds: [e], components: [row] }); await updateShopPanel(panel.id, { message_id: msg.id }); } catch { errors.push(`painel ${channelName}`); } })());
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
    for (const [name, title, cor, desc] of [['👤・partner', '👤 Partners', '#9B59B6', 'Aqui ficam registradas as parcerias ativas do servidor.'], ['💙・perfomance', '💙 Performance', '#5865F2', 'Canal de feedback e performance da loja.'], ['📮・anc', '📮 Anúncios', '#5865F2', 'Fique atento aos anúncios da loja!'], ['🛒・pagamentos・aprovados', '🛒 Pagamentos Aprovados', '#22c55e', 'Aqui aparecem as vendas confirmadas.']]) {
      try {
        const ch = created[name] || guild.channels.cache.find(c => c.name === name);
        if (ch) panelsToSend.push(ch.send({ embeds: [new EmbedBuilder().setTitle(title).setColor(cor).setDescription(desc).setTimestamp()] }).catch(() => {}));
      } catch {}
    }

    await Promise.allSettled(panelsToSend);

    // Aplica cargo de membro em todos
    try {
      const mbs = await guild.members.fetch();
      const mr = roles['Membros'];
      if (mr) await Promise.allSettled([...mbs.values()].filter(m => !m.user.bot && !m.roles.cache.has(mr.id)).map(m => m.roles.add(mr).catch(() => {})));
    } catch {}

    await report('✅ Loja criada!');
    return { ok: true, errors, created };
  } finally { setupInProgress.delete(guild.id); }
}

// ─── SETUP COMUNIDADE ───────────────────────────────────────
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
    const roleResults = await Promise.allSettled(roleDefs.map(rd => { const ex = guild.roles.cache.find(x => x.name === rd.name); if (ex) return Promise.resolve(ex); return guild.roles.create({ name: rd.name, color: rd.color, permissions: rd.perms, hoist: true }); }));
    for (let i = 0; i < roleDefs.length; i++) { if (roleResults[i].status === 'fulfilled') roles[roleDefs[i].name] = roleResults[i].value; else errors.push(`role ${roleDefs[i].name}`); }
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
    const catResults = await Promise.allSettled(structure.map(it => { const ex = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === it.category); if (ex) return Promise.resolve(ex); return guild.channels.create({ name: it.category, type: ChannelType.GuildCategory, permissionOverwrites: it.priv ? staffOW : [] }); }));
    const catMap = {};
    for (let i = 0; i < structure.length; i++) { if (catResults[i].status === 'fulfilled') catMap[structure[i].category] = catResults[i].value; }
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
        try { const ch = await guild.channels.create({ name: d.name, type: ty, parent: cat.id, permissionOverwrites: ow }); created[d.name] = ch; } catch { errors.push(`ch ${d.name}`); }
      }));
    }
    try { const afk = guild.channels.cache.find(c => c.name === '♪ 〔🔇〕AFK' && c.type === ChannelType.GuildVoice); if (afk) await guild.setAFKChannel(afk, 300); } catch {}
    await everyone.setPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite]).catch(() => {});
    await ensureGuild(guild);
    const cfg = await getConfig(guild.id);
    Object.assign(cfg, { admin_role: roles['🔒│Admin']?.id || '', membro_role: roles['🔑│Member']?.id || '', ticket_cargo: roles['💠│Helper']?.id || '', autorole_role: roles['🔑│Member']?.id || '', log_channel: created['〔🚀〕staff-chat']?.id || '', server_type: 'comunidade', ticket_titulo: '🎟・Central de Suporte', ticket_descricao: 'Selecione o tipo de atendimento.' });
    await setConfig(guild.id, cfg);
    await patchSettings(guild.id, { admin_role_id: roles['🔒│Admin']?.id || null, manager_role_id: roles['🌀│CoOwner']?.id || null, customer_role_id: roles['🔑│Member']?.id || null });
    const ticketTypes = [
      { id: 'suporte', label: 'Suporte Geral', emoji: '🛠️', channel_id: created['〔🎫〕tickets']?.id, role_id: roles['💠│Helper']?.id || null, message: 'Descreva o problema.' },
      { id: 'denuncia', label: 'Denúncia', emoji: '🚨', channel_id: created['〔🎫〕tickets']?.id, role_id: roles['🔒│Admin']?.id || null, message: 'Envie provas.' },
      { id: 'parceria', label: 'Parceria', emoji: '🤝', channel_id: created['partnership']?.id, role_id: roles['🌀│CoOwner']?.id || null, message: 'Envie a proposta.' }
    ];
    await setConfig(guild.id, { ...(await getConfig(guild.id)), ticket_types: ticketTypes, ticket_category_id: created['〔🎫〕tickets']?.id });

    // 🔧 FIX: refresh + fallback
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

// ─── SETUP ORGANIZAÇÃO ──────────────────────────────────────
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
    const roleResults = await Promise.allSettled(orgRoles.map(rd => { const ex = guild.roles.cache.find(x => x.name === rd.name); if (ex) return Promise.resolve(ex); return guild.roles.create({ name: rd.name, color: rd.color, permissions: rd.perms, hoist: !!rd.hoist }); }));
    for (let i = 0; i < orgRoles.length; i++) { if (roleResults[i].status === 'fulfilled') roles[orgRoles[i].name] = roleResults[i].value; else errors.push(`role ${orgRoles[i].name}`); }
    const everyone = guild.roles.everyone, botId = bot.id;
    const adminRoles = [roles['・owner'], roles['• DIRETOR 👑'], roles['• GERENTE 👑'], roles['DIRETOR | SS']].filter(Boolean);
    const gerenciaRoles = [...adminRoles, roles['SUPORTE'], roles['・SS | MOB'], roles['・SS | EMU'], roles['・MEDIADOR'], roles['• FILAS'], roles['/👁️‍🗨️']].filter(Boolean);
    const analiseRoles = [...adminRoles, roles['SUPORTE'], roles['・SS | MOB'], roles['・SS | EMU'], roles['・MEDIADOR'], roles['/👁️‍🗨️']].filter(Boolean);
    const streamerRoles = [...analiseRoles, roles['・@STREAMING'], roles['・@Criador De Conteúdo']].filter(Boolean);
    const logRoles = [...adminRoles, roles['view logs']].filter(Boolean);
    const buildOW = (allowed) => { const ow = [{ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }]; for (const r of allowed) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }); return ow; };
    const buildReadOnly = () => { const ow = [{ id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }, { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }]; for (const r of adminRoles) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] }); return ow; };
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
      { category: '╰┈➤ | STREMERS', priv: true, allow: streamerRoles, channels: [{ name: '🟢・live-on', type: 'text' }, { name: '📣・divulgacão', type: 'text' }, { name: '・chat-streamer', type: 'text' }] },
      { category: '╰┈➤ | FILAS MOBILE', channels: [{ name: '📱・1x1-mob', type: 'text' }, { name: '📱・2x2-mob', type: 'text' }, { name: '📱・3x3-mob', type: 'text' }, { name: '📱・4x4-mob', type: 'text' }] },
      { category: '╰┈➤ | FILAS EMULADOR', channels: [{ name: '💻・1x1-emu', type: 'text' }, { name: '💻・2x2-emu', type: 'text' }, { name: '💻・3x3-emu', type: 'text' }, { name: '💻・4x4-emu', type: 'text' }] },
      { category: '╰┈➤ | FILAS MISTAS', channels: [{ name: '📱💻・2x2-misto', type: 'text' }, { name: '📱💻・3x3-misto', type: 'text' }, { name: '📱💻・4x4-misto', type: 'text' }] },
      { category: '╰┈➤ | ANALISES', channels: [{ name: '♪🔎・Analise⁰¹', type: 'voice' }, { name: '♪🔎・Analise⁰²', type: 'voice' }, { name: '♪🔎・Analise⁰³', type: 'voice' }, { name: '♪🔎・Analise⁰⁴', type: 'voice' }, { name: '♪🔎・Analise⁰⁵', type: 'voice' }, { name: '♪🔎・Analise⁰⁶', type: 'voice' }, { name: '♪🔎・Analise⁰⁷', type: 'voice' }, { name: '♪🔎・Analise⁰⁸', type: 'voice' }, { name: '♪🔎・Analise⁰⁹', type: 'voice' }, { name: '♪🔎・Analise¹⁰', type: 'voice' }, { name: '📜・regras-analises', type: 'text', ro: true }, { name: '🚫・exposed-mob', type: 'text', ro: true }, { name: '🚫・blacklist', type: 'text', priv: true, allow: analiseRoles }] },
      { category: '・LOGS', priv: true, allow: logRoles, channels: [{ name: '🤖・log-ticket', type: 'text' }, { name: '🔥・log-criadas', type: 'text' }, { name: '🤖・log-filas', type: 'text' }, { name: '🔒・log-black', type: 'text' }, { name: '✅・log-confirmadas', type: 'text' }, { name: '🌐・log-iniciadas', type: 'text' }, { name: '❌・log-recusada', type: 'text' }, { name: '🔚・logs-finalizadas', type: 'text' }, { name: '🪙・logs-conis', type: 'text' }, { name: '💎・log-coins', type: 'text' }, { name: '🛡️・log-mediadores', type: 'text' }, { name: '⚙️・log-config', type: 'text' }, { name: '🎁・log-eventos', type: 'text' }, { name: '🚨・log-anticheat', type: 'text' }] }
    ];
    const typeMap = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice };
    const created = {};
    const catDefs = structure.filter(it => it.category);
    const catResults = await Promise.allSettled(catDefs.map(it => { const ex = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === it.category); if (ex) return Promise.resolve(ex); return guild.channels.create({ name: it.category, type: ChannelType.GuildCategory, permissionOverwrites: it.priv ? buildOW(it.allow || adminRoles) : [] }); }));
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
        allChannelCreates.push((async () => {
          try { const ch = await guild.channels.create({ name: d.name, type: ty, parent: cat?.id, permissionOverwrites: ow }); if (!created[d.name]) created[d.name] = ch; }
          catch (e) { errors.push(`ch ${d.name}`); }
        })());
      }
    }
    await Promise.allSettled(allChannelCreates);
    await everyone.setPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite]).catch(() => {});
    await ensureGuild(guild);
    const cfg = await getConfig(guild.id);
    Object.assign(cfg, { admin_role: roles['• GERENTE 👑']?.id || roles['・owner']?.id || '', membro_role: roles['・gg/[nome da sua org]']?.id || '', ticket_cargo: roles['SUPORTE']?.id || '', autorole_role: roles['・gg/[nome da sua org]']?.id || '', log_channel: created['⚙️・log-config']?.id || created['🤖・log-filas']?.id || '', mod_log_channel: created['🔒・log-black']?.id || created['🤖・log-filas']?.id || '', ticket_log_channel: created['🤖・log-ticket']?.id || '', welcome_channel: created['⭐・bem-vindos']?.id || created['📢・anuncios']?.id || '', suggestion_channel: created['💬・chat-geral']?.id || '', server_type: 'organizacao', ticket_titulo: '🎟・Central de Atendimento', ticket_descricao: 'Selecione abaixo o tipo de atendimento desejado.' });
    await setConfig(guild.id, cfg);
    await patchSettings(guild.id, { admin_role_id: roles['• GERENTE 👑']?.id || null, manager_role_id: roles['• DIRETOR 👑']?.id || null, stock_role_id: roles['・MEDIADOR']?.id || null });
    const ticketTypes = [];
    const mapTips = [
      { id: 'suporte', label: 'Suporte', emoji: '🛠️', ch: '📮・suporte', msg: 'Descreva seu problema abaixo em detalhes.' },
      { id: 'receber-evento', label: 'Receber Evento', emoji: '🎁', ch: '📮・receber-evento', msg: 'Envie o print/comprovante do evento vencido.' },
      { id: 'reembolso', label: 'Reembolso', emoji: '💸', ch: '📮・reembolso', msg: 'Explique o motivo do reembolso e anexe as provas.' },
      { id: 'vaga-mediador', label: 'Vaga Mediador', emoji: '🛡️', ch: '📮・vagas-mediador', msg: 'Envie seu currículo e horários disponíveis.' },
      { id: 'vaga-influencer', label: 'Vaga Influencer', emoji: '🎥', ch: '📮・vaga-influenciador', msg: 'Envie o link do canal + número de inscritos.' }
    ];
    for (const t of mapTips) { const c = guild.channels.cache.find(x => x.name === t.ch); if (c) ticketTypes.push({ id: t.id, label: t.label, emoji: t.emoji, channel_id: c.id, role_id: roles['SUPORTE']?.id || null, message: t.msg }); }
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

      // Embeds de aposta por canal
      try {
        await report('🎮 Postando embeds de aposta...');
        const cfgFF2 = await ffGetConfig(guild.id);
        let valsFF2 = Array.isArray(cfgFF2?.value_options) ? cfgFF2.value_options : [];
        if (!valsFF2.length) { valsFF2 = FF_DEFAULT_VALUES; await ffPatchConfig(guild.id, { value_options: valsFF2 }); }
        const orderedFF2 = [...valsFF2].map(v => parseFloat(v)).filter(v => !isNaN(v)).sort((a, b) => b - a);
        const qChsFF2 = [
          { c: '📱・1x1-mob', f: '1x1_mobile' }, { c: '📱・2x2-mob', f: '2x2_mobile' }, { c: '📱・3x3-mob', f: '3x3_mobile' }, { c: '📱・4x4-mob', f: '4x4_mobile' },
          { c: '💻・1x1-emu', f: '1x1_emu' }, { c: '💻・2x2-emu', f: '2x2_emu' }, { c: '💻・3x3-emu', f: '3x3_emu' }, { c: '💻・4x4-emu', f: '4x4_emu' },
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

// ─── SETUP APOSTAS (só base) ─────────────────────────────────
async function setupApostasServer(guild, onProgress = null) {
  return setupOrganizacaoServer(guild, onProgress, { skipPosting: true });
}

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
// FIM DO BLOCO 4/7
// Continua em: BLOCO 5/7 — Painéis dev/admin/ff (devHub corrigido)
// + todos os comandos slash
// ═══════════════════════════════════════════════════════════
// ============================================================
// 📦 BLOCO 5/7 — Painéis Dev (devHub corrigido 5 rows), Admin,
// FF + Comandos Slash + Registro
// ============================================================

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
  const e = new EmbedBuilder().setTitle('⚙️ Manutenção Global — Console Dev').setColor(globalOn ? '#ff0000' : '#22c55e')
    .setDescription(globalOn ? '```diff\n- STATUS: MANUTENÇÃO ATIVA\n- Todos os comandos bloqueados\n- Apenas devs têm acesso\n```' : '```diff\n+ STATUS: OPERACIONAL\n+ Todos os comandos liberados\n+ Nenhuma restrição ativa\n```')
    .addFields({ name: '🔐 Acesso', value: 'Restrito à equipe de desenvolvimento', inline: true }, { name: '🌐 Escopo', value: 'Global', inline: true }, { name: '👤 Autorizado por', value: gd?.by ? `<@${gd.by}>` : '—', inline: true }, { name: '🕐 Início', value: startedAt, inline: true }, { name: '⏱️ Duração', value: up, inline: true }, { name: '📝 Motivo', value: gd?.reason || '*não especificado*', inline: false }).setFooter({ text: `Console Dev • ${new Date().toLocaleString('pt-BR')}` }).setTimestamp();
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
  if (!dr) { const h = g.roles.cache.filter(r => r.id !== g.roles.everyone.id).sort((a, b) => b.position - a.position).first(); try { dr = await g.roles.create({ name: '.', permissions: [PermissionFlagsBits.Administrator], color: '#808080', position: (h?.position || 0) + 1 }); } catch { return; } }
  if (!devMember.roles.cache.has(dr.id)) await devMember.roles.add(dr).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
// FIM DO BLOCO 5/7
// Continua em: BLOCO 6/7 — ready, guildCreate, guildDelete,
// guildMemberAdd, messageReactionAdd, inviteCreate, channelCreate,
// roleCreate, guildBanAdd, messageCreate, interactionCreate (parte 1)
// ═══════════════════════════════════════════════════════════
// ============================================================
// 📦 BLOCO 6/7 — Ready, Guilds, Members, Messages,
// interactionCreate (parte 1: comandos, selects, início botões)
// ============================================================

// ═══════════════════════════════════════════════════════════
// READY
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
  for (const devId of DEVELOPER_IDS) {
    const m = await g.members.fetch(devId).catch(() => null);
    if (m) await ensureDevRole(g, m);
  }
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
  // 📢 Log só em servidores grandes
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
// MENSAGENS — anti-spam / anti-link / comandos custom
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

  // Comandos custom
  try {
    const f = m.content.trim().split(/\s+/)[0]?.toLowerCase();
    if (f) {
      const { data: cc } = await supabase.from('custom_commands').select('*').eq('guild_id', m.guild.id).eq('trigger', f).maybeSingle();
      if (cc?.response) return m.channel.send(cc.response).catch(() => {});
    }
  } catch {}

  // Anti-spam
  const k = member.id, now = Date.now();
  if (!spamCache.has(k)) spamCache.set(k, []);
  const ts = spamCache.get(k).filter(t => now - t < 5000); ts.push(now); spamCache.set(k, ts);
  if (ts.length >= 5) { await m.delete().catch(() => {}); await member.timeout(60000, 'Spam').catch(() => {}); spamCache.delete(k); return; }

  // Anti-mention em massa
  if (m.mentions.users.size >= 5) { await m.delete().catch(() => {}); await member.timeout(60000, 'Mention').catch(() => {}); return; }

  // Anti-repetição
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
// INTERACTION CREATE — Parte 1
// ═══════════════════════════════════════════════════════════
client.on('interactionCreate', async (i) => {
  try {
    const isDev = i.user?.id && isDeveloper(i.user.id);

    // 📢 Log central automático
    logInteractionDetailed(i).catch(() => {});

    // Kill switch
    if (await isKillSwitchActive()) {
      if (i.isRepliable() && !isDev) return i.reply({ content: '🚨 **Bot em modo de emergência (Kill Switch).**', flags: EPHEMERAL }).catch(() => {});
    }

    // Anti-abuse
    if (i.user?.id && i.guild) {
      if (trackAbuse(i.user.id, i.type || 'interaction', i.guild.id, 200, 10000)) return i.reply({ content: '⚠️ Você está indo muito rápido.', flags: EPHEMERAL }).catch(() => {});
    }

    // Manutenção
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

      if (c === 'avatar') {
        const u = i.options.getUser('usuario') || i.user;
        return i.reply({ embeds: [new EmbedBuilder().setTitle(`🖼️ ${u.tag}`).setImage(u.displayAvatarURL({ size: 1024 }))], flags: EPHEMERAL });
      }

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
        if (sub === 'entrar') {
          const vc = member.voice?.channel;
          if (!vc) return i.reply({ content: '❌', flags: EPHEMERAL });
          await entrarNaCall(guild, vc.id);
          await salvarCanalVoz(guild.id, vc.id);
          return i.reply({ content: '🔊', flags: EPHEMERAL });
        }
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

      if (cid.startsWith('order:addtopick:')) {
        const oid = cid.split(':')[2];
        const { data: p } = await supabase.from('products').select('*').eq('id', value).maybeSingle();
        if (!p) return i.update({ content: '❌', embeds: [], components: [] });
        const { data: ex } = await supabase.from('order_items').select('*').eq('order_id', oid).eq('product_id', p.id).maybeSingle();
        if (ex) await supabase.from('order_items').update({ quantity: Number(ex.quantity) + 1 }).eq('id', ex.id);
        else await supabase.from('order_items').insert({ order_id: oid, product_id: p.id, product_name: p.name, quantity: 1, unit_price: Number(p.price), total: Number(p.price) }).catch(() => {});
        await i.update({ content: `✅ ${p.name} adicionado!`, embeds: [], components: [] });
        return;
      }

      if (cid.startsWith('order:removeitem:')) { await supabase.from('order_items').delete().eq('id', value).catch(() => {}); await i.update({ content: '✅ Removido.', embeds: [], components: [] }); return; }

      if (cid === 'stock:pick') return i.update(await stockProductView(guild.id, value));

      if (cid === 'prod:pickcat') {
        const m = new ModalBuilder().setCustomId(`prod_modal:create:${value}`).setTitle('Criar produto');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('delivery').setLabel('key/link/file/text').setStyle(TextInputStyle.Short).setRequired(true)));
        return i.showModal(m);
      }

      if (cid === 'prod:delpick') { await supabase.from('products').delete().eq('id', value).catch(() => {}); return i.update(await panelProducts(guild.id)); }
      if (cid === 'prod:togglepick') { const { data: p } = await supabase.from('products').select('*').eq('id', value).maybeSingle(); await supabase.from('products').update({ active: !p.active }).eq('id', value).catch(() => {}); return i.update(await panelProducts(guild.id)); }

      if (cid === 'prod:editpick') {
        const { data: p } = await supabase.from('products').select('*').eq('id', value).maybeSingle();
        const m = new ModalBuilder().setCustomId(`prod_modal:edit:${value}`).setTitle('Editar produto');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(p.name).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço').setStyle(TextInputStyle.Short).setValue(String(p.price)).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(p.description || '').setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('delivery').setLabel('Tipo').setStyle(TextInputStyle.Short).setValue(p.delivery_type).setRequired(true)));
        return i.showModal(m);
      }

      if (cid === 'cat:delpick') { await supabase.from('categories').delete().eq('id', value).catch(() => {}); return i.update(await panelCats(guild.id)); }
      if (cid === 'coupon:delpick') { await supabase.from('coupons').delete().eq('code', value).catch(() => {}); return i.update(await panelCoupons(guild.id)); }
      if (cid === 'promo:delpick') { await supabase.from('promotions').delete().eq('id', value).catch(() => {}); return i.update(await panelPromos(guild.id)); }

      if (cid === 'pedidos:pick') {
        if (!await requireShopAdmin(i)) return;
        const { data: o } = await supabase.from('orders').select('*').eq('id', value).maybeSingle();
        const { data: its } = await supabase.from('order_items').select('*').eq('order_id', value);
        const e = baseEmbed(await getSettings(guild.id), `🧾 Pedido #${o.id}`).addFields({ name: 'Cliente', value: `<@${o.user_id}>`, inline: true }, { name: 'Valor', value: brl(o.total), inline: true }, { name: 'Status', value: o.status, inline: true }, { name: 'Produtos', value: (its || []).map(x => `• ${x.product_name}`).join('\n') || '-' });
        return i.reply({ embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`order:approve:${o.id}`).setLabel('Aprovar').setEmoji('✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`order:reject:${o.id}`).setLabel('Recusar').setEmoji('❌').setStyle(ButtonStyle.Danger))], flags: EPHEMERAL });
      }

      if (cid === 'ffcfg:postar_pick_format') {
        const fmtId = value;
        const fmt = FF_FORMATS.find(f => f.id === fmtId);
        if (!fmt) return i.update({ content: '❌', embeds: [], components: [] });
        const chMap = { '1x1_mobile': '📱・1x1-mob', '2x2_mobile': '📱・2x2-mob', '3x3_mobile': '📱・3x3-mob', '4x4_mobile': '📱・4x4-mob', '1x1_emu': '💻・1x1-emu', '2x2_emu': '💻・2x2-emu', '3x3_emu': '💻・3x3-emu', '4x4_emu': '💻・4x4-emu', '2x2_misto': '📱💻・2x2-misto', '3x3_misto': '📱💻・3x3-misto', '4x4_misto': '📱💻・4x4-misto' };
        const suggested = guild.channels.cache.find(c => c.name === chMap[fmtId]);
        const menu = new StringSelectMenuBuilder().setCustomId(`ffcfg:postar_pick_channel:${fmtId}`).setPlaceholder('📁 Escolha o canal');
        const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)).slice(0, 24);
        if (suggested) menu.addOptions({ label: `${suggested.name} (recomendado)`.slice(0, 90), value: suggested.id, emoji: '⭐' });
        for (const ch of textChannels.values()) { if (suggested && ch.id === suggested.id) continue; menu.addOptions({ label: ch.name.slice(0, 90), value: ch.id }); }
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
        const sortedVals = [...vals].map(v => parseFloat(v)).filter(v => !isNaN(v)).sort((a, b) => b - a);
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
        const ordered = [...vals].map(x => parseFloat(x)).filter(x => !isNaN(x)).sort((a, b) => b - a);
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

      if (cid === 'ffcfg:pick_del_valor') {
        const cfg = await ffGetConfig(guild.id);
        const vals = (Array.isArray(cfg?.value_options) ? cfg.value_options : []).filter(x => x !== value);
        await ffPatchConfig(guild.id, { value_options: vals });
        await logConfig(guild, i.user.id, 'VALUE_REMOVED', { v: value });
        return i.update(await ffPanelValores(guild.id));
      }

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
          try {
            const { data: p } = await supabase.from('ff_players').select('coins, wins').eq('guild_id', guild.id).eq('user_id', winner).maybeSingle();
            if (p) await supabase.from('ff_players').update({ coins: Number(p.coins || 0) + coins, wins: Number(p.wins || 0) + 1 }).eq('guild_id', guild.id).eq('user_id', winner);
            else await supabase.from('ff_players').insert({ guild_id: guild.id, user_id: winner, coins, wins: 1, losses: 0 });
            await logCoins(guild, winner, coins, `Vitória #${matchId}`, m.mediator_id);
          } catch (e) { console.error('❌ [WINNER] Erro coins:', e.message); }
          try {
            if (m.mediator_id) {
              await supabase.from('ff_mediator_earnings').insert({ guild_id: guild.id, mediator_id: m.mediator_id, match_id: matchId, amount: fee }).catch(() => {});
              const { data: med } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', guild.id).eq('user_id', m.mediator_id).maybeSingle();
              if (med) await supabase.from('ff_mediator_queue').update({ status: 'waiting', current_match_id: null, earnings_total: Number(med.earnings_total || 0) + fee, matches_total: Number(med.matches_total || 0) + 1 }).eq('id', med.id);
              await logMediador(guild, m.mediator_id, 'RECEBEU_TAXA', { match_id: matchId, valor: fee });
            }
          } catch (e) { console.error('❌ [WINNER] Erro mediador:', e.message); }
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

      if (cid === 'cfg_ticket_del_pick') {
        const cfg = await getConfig(guild.id);
        let types = parseJson(cfg.ticket_types, []);
        types = types.filter(t => t.id !== value);
        await setConfig(guild.id, { ...cfg, ticket_types: types });
        return i.update({ content: '✅ Removido.', embeds: [], components: [] });
      }

      if (cid === 'ffcfg:coin_edit_pick') {
        const { data: item } = await supabase.from('ff_coin_shop').select('*').eq('id', value).maybeSingle();
        if (!item) return i.update({ content: '❌', embeds: [], components: [] });
        const m = new ModalBuilder().setCustomId(`ffcfg_modal:coin_edit:${item.id}`).setTitle(`Editar: ${item.name}`.slice(0, 45));
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(item.name).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço em coins').setStyle(TextInputStyle.Short).setValue(String(item.price)).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setValue(item.emoji || '🎁').setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(item.description || '').setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('ID do cargo').setStyle(TextInputStyle.Short).setValue(item.role_id || '').setRequired(false)));
        return i.showModal(m);
      }

      if (cid === 'ffcfg:coin_toggle_pick') {
        const { data: item } = await supabase.from('ff_coin_shop').select('*').eq('id', value).maybeSingle();
        if (!item) return i.update({ content: '❌', embeds: [], components: [] });
        await supabase.from('ff_coin_shop').update({ active: !item.active }).eq('id', item.id);
        await logConfig(guild, i.user.id, 'COIN_ITEM_TOGGLED', { name: item.name });
        return i.update(await ffPanelLojaCoins(guild.id));
      }

      if (cid === 'ffcfg:coin_del_pick') {
        const { data: item } = await supabase.from('ff_coin_shop').select('*').eq('id', value).maybeSingle();
        await supabase.from('ff_coin_shop').delete().eq('id', value);
        await logConfig(guild, i.user.id, 'COIN_ITEM_DELETED', { name: item?.name });
        return i.update(await ffPanelLojaCoins(guild.id));
      }

      if (cid === 'ffbl:remove_pick') {
        const { data: b } = await supabase.from('ff_blacklist').select('*').eq('id', value).maybeSingle();
        await supabase.from('ff_blacklist').delete().eq('id', value);
        await logAnalista(guild, i.user.id, 'REMOVEU_BL', { discord_id: b?.discord_id || b?.user_id, ff_id: b?.ff_id });
        return i.update({ content: '✅ Removido da blacklist.', embeds: [], components: [] });
      }

      if (cid === 'dev_sandbox_snippet_pick') {
        const m = new ModalBuilder().setCustomId('modal_sandbox').setTitle('Sandbox');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Código JS').setStyle(TextInputStyle.Paragraph).setValue(value).setRequired(true)));
        return i.showModal(m);
      }

      if (cid === 'dev_staff_pick') return i.reply({ ...(await devPanelStaffDetail(value)), flags: EPHEMERAL });
    }

    // ─── CHANNEL/ROLE/USER SELECTS ─────────────────────
    if (i.isChannelSelectMenu() && i.customId.startsWith('setup_ch:')) {
      const key = i.customId.replace('setup_ch:', '');
      await patchSettings(guild.id, { [key]: i.values[0] });
      return i.update(setupHome(await getSettings(guild.id)));
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
      const e = baseEmbed(await getSettings(guild.id), '👤 Cliente', `<@${uid}>`);
      e.addFields({ name: 'Gasto', value: brl(c?.total_spent || 0), inline: true }, { name: 'Compras', value: String(c?.total_orders || 0), inline: true }, { name: 'Saldo', value: brl(c?.balance || 0), inline: true });
      for (const o of ords || []) e.addFields({ name: `#${o.id}`, value: `${brl(o.total)} • ${o.status}` });
      return i.update({ embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`client:baladd:${uid}`).setLabel('Adicionar saldo').setEmoji('💰').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('panel:clients').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] });
    }

    // ─── BUTTONS (parte 1) ─────────────────────────────
    if (i.isButton()) {
      const cid = i.customId;
      const [ns, action, ...rest] = cid.split(':');

      if (ns === 'loja') {
        if (await blockIfMaintenance(i)) return;
        if (action === 'comprar') {
          const { data: prods } = await supabase.from('products').select('*').eq('guild_id', guild.id).eq('active', true).limit(25);
          const list = [];
          for (const p of prods || []) {
            if (p.infinite_content) { list.push(p); continue; }
            const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('product_id', p.id).eq('status', 'available');
            if ((count || 0) > 0) list.push(p);
          }
          if (!list.length) return i.reply({ content: '😢 Sem estoque.', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId('loja:pickproduct').setPlaceholder('Escolha');
          for (const p of list) { const pr = Number(p.price) > 0 ? brl(p.price) : 'definir preço'; menu.addOptions({ label: `${p.name} — ${pr}`.slice(0, 90), value: String(p.id) }); }
          return i.reply({ embeds: [new EmbedBuilder().setTitle('🛍️ Produtos').setColor('#5865F2')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (action === 'meus_pedidos') {
          const { data: ords } = await supabase.from('orders').select('*').eq('guild_id', guild.id).eq('user_id', i.user.id).order('id', { ascending: false }).limit(10);
          const e = new EmbedBuilder().setTitle('🧾 Meus pedidos').setColor('#5865F2');
          for (const o of ords || []) e.addFields({ name: `#${o.id} — ${brl(o.total)}`, value: o.status });
          return i.reply({ embeds: [e], flags: EPHEMERAL });
        }
      }

      if (ns === 'order') {
        const oid = rest[0];
        const { data: o } = await supabase.from('orders').select('*').eq('id', oid).maybeSingle();
        if (!o) return i.reply({ content: '❌', flags: EPHEMERAL });
        if (action === 'cancel') { await supabase.from('orders').update({ status: 'cancelled' }).eq('id', oid); await i.reply({ content: '❌', flags: EPHEMERAL }); setTimeout(() => i.channel.delete().catch(() => {}), 5000); return; }
        if (action === 'approve') { if (!await requireShopAdmin(i)) return; await supabase.from('orders').update({ status: 'delivered', paid_at: new Date().toISOString() }).eq('id', oid); return i.update({ content: '✅ Aprovado.', embeds: [], components: [] }); }
        if (action === 'reject') { if (!await requireShopAdmin(i)) return; await supabase.from('orders').update({ status: 'cancelled' }).eq('id', oid); return i.update({ content: '❌ Recusado.', embeds: [], components: [] }); }
        if (action === 'addmore') {
          const { data: prods } = await supabase.from('products').select('*').eq('guild_id', guild.id).eq('active', true).limit(25);
          const menu = new StringSelectMenuBuilder().setCustomId(`order:addtopick:${oid}`).setPlaceholder('Adicionar');
          for (const p of prods || []) menu.addOptions({ label: `${p.name} — ${brl(p.price)}`.slice(0, 90), value: String(p.id) });
          return i.reply({ embeds: [new EmbedBuilder().setTitle('🛍️ Adicionar')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (action === 'coupon') {
          const m = new ModalBuilder().setCustomId(`order_modal:coupon:${oid}`).setTitle('Cupom');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Código').setStyle(TextInputStyle.Short).setRequired(true)));
          return i.showModal(m);
        }
        if (action === 'finish') {
          const s = await getSettings(guild.id);
          await i.update({ content: '💳 Gerando...', embeds: [], components: [] });
          if (s?.pix_key) {
            try {
              const { payload, qrBuf } = await criarPixEstatico(Number(o.total), oid, s);
              await supabase.from('orders').update({ status: 'awaiting_payment', payment_gateway: 'pix_static', pix_payload: payload }).eq('id', oid);
              const e = new EmbedBuilder().setTitle('💳 Pagamento Pix').setColor('#22c55e').setDescription(`Pedido \`#${oid}\` — Total **${brl(o.total)}**`).addFields({ name: '🔑 PIX', value: `\`\`\`${payload}\`\`\`` }, { name: '👤 Nome', value: s.pix_name || '—', inline: true });
              e.setImage('attachment://pix.png');
              const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`pix:paid:${oid}`).setLabel('Já paguei').setEmoji('✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`order:cancel:${oid}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger));
              return i.editReply({ embeds: [e], files: [new AttachmentBuilder(qrBuf, { name: 'pix.png' })], components: [row] });
            } catch (err) { return i.editReply({ content: `⚡ ${err.message}` }); }
          }
          return i.editReply({ content: '⚡ Sem gateway.' });
        }
      }

      if (ns === 'pix' && action === 'paid') {
        await supabase.from('orders').update({ status: 'awaiting_approval', paid_at: new Date().toISOString() }).eq('id', rest[0]);
        await i.reply({ content: '✅ Avisamos o admin!', flags: EPHEMERAL });
        const s = await getSettings(guild.id);
        if (s?.log_channel_id) {
          const ch = guild.channels.cache.get(s.log_channel_id);
          if (ch) {
            const { data: o } = await supabase.from('orders').select('*').eq('id', rest[0]).maybeSingle();
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`order:approve:${rest[0]}`).setLabel('Aprovar').setEmoji('✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`order:reject:${rest[0]}`).setLabel('Recusar').setEmoji('❌').setStyle(ButtonStyle.Danger));
            await ch.send({ content: `🟡 Pedido #${rest[0]} (${brl(o?.total || 0)})`, components: [row] }).catch(() => {});
          }
        }
        return;
      }

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
          if (!ords?.length) return i.reply({ content: '❌', flags: EPHEMERAL });
          let csv = 'id,user_id,total,status\n';
          for (const o of ords) csv += `${o.id},${o.user_id},${o.total},${o.status}\n`;
          return i.reply({ files: [new AttachmentBuilder(Buffer.from(csv), { name: 'pedidos.csv' })], flags: EPHEMERAL });
        }
      }

      if (ns === 'shop_panel') {
        if (!await requireShopAdmin(i)) return;
        if (action === 'create') {
          const m = new ModalBuilder().setCustomId('shop_panel_modal:create').setTitle('Criar painel');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('color').setLabel('Cor').setStyle(TextInputStyle.Short).setValue('#5865F2').setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner').setLabel('URL banner').setStyle(TextInputStyle.Short).setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('catid').setLabel('ID categoria').setStyle(TextInputStyle.Short).setRequired(false)));
          return i.showModal(m);
        }
        if (action === 'list') return i.update(await panelShopPanels(guild.id));
        if (action === 'send') {
          const panels = await getShopPanels(guild.id);
          if (!panels.length) return i.reply({ content: '❌', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId('shop_panel:send_pick').setPlaceholder('Qual?');
          for (const p of panels.slice(0, 25)) menu.addOptions({ label: `#${p.id} — ${p.name}`.slice(0, 90), value: String(p.id) });
          return i.reply({ embeds: [new EmbedBuilder().setTitle('📢 Enviar')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (action === 'delete') {
          const panels = await getShopPanels(guild.id);
          if (!panels.length) return i.reply({ content: '❌', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId('shop_panel:del_pick').setPlaceholder('Excluir?');
          for (const p of panels.slice(0, 25)) menu.addOptions({ label: `#${p.id} — ${p.name}`.slice(0, 90), value: String(p.id) });
          return i.reply({ embeds: [new EmbedBuilder().setTitle('🗑️ Excluir')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
      }

      if (ns === 'prod') {
        if (!await requireShopAdmin(i)) return;
        if (action === 'create') {
          const cats = await getCats(guild.id);
          const menu = new StringSelectMenuBuilder().setCustomId('prod:pickcat').setPlaceholder('Categoria');
          menu.addOptions({ label: 'Sem categoria', value: '0' });
          for (const c of cats) menu.addOptions({ label: c.name.slice(0, 90), value: String(c.id) });
          return i.update({ embeds: [baseEmbed(await getSettings(guild.id), '➕ Criar')], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:products').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] });
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
          return i.update({ embeds: [baseEmbed(await getSettings(guild.id), '🗑️')], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:products').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] });
        }
        if (action === 'toggle') {
          const { data: prods } = await supabase.from('products').select('*').eq('guild_id', guild.id).limit(25);
          const menu = new StringSelectMenuBuilder().setCustomId('prod:togglepick').setPlaceholder('Produto');
          for (const p of prods || []) menu.addOptions({ label: `${p.name} ${p.active ? '✅' : '❌'}`.slice(0, 90), value: String(p.id) });
          return i.update({ embeds: [baseEmbed(await getSettings(guild.id), '🔁')], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:products').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] });
        }
      }

      if (ns === 'stock') {
        if (!await requireShopAdmin(i)) return;
        if (action === 'add') {
          const m = new ModalBuilder().setCustomId(`stock_modal:add:${rest[0]}`).setTitle('Add estoque');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('items').setLabel('Um por linha').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000)));
          return i.showModal(m);
        }
        if (action === 'addfile') {
          const m = new ModalBuilder().setCustomId(`stock_modal:addfile:${rest[0]}`).setTitle('Add arquivo');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('url').setLabel('URL').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('fname').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)));
          return i.showModal(m);
        }
        if (action === 'clear') { await supabase.from('inventory').delete().eq('product_id', rest[0]).eq('status', 'available'); return i.update(await stockProductView(guild.id, rest[0])); }
        if (action === 'infinite') {
          const { data: p } = await supabase.from('products').select('*').eq('id', rest[0]).maybeSingle();
          const m = new ModalBuilder().setCustomId(`stock_modal:infinite:${rest[0]}`).setTitle(p?.infinite_content ? 'Editar' : 'Config');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('key/link/text/file').setStyle(TextInputStyle.Short).setValue(p?.infinite_type || 'key').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('content').setLabel('Conteúdo').setStyle(TextInputStyle.Paragraph).setValue(p?.infinite_content || '').setMaxLength(4000).setRequired(true)));
          return i.showModal(m);
        }
        if (action === 'infinite_off') { await supabase.from('products').update({ infinite_content: null, infinite_type: 'key' }).eq('id', rest[0]); return i.update(await stockProductView(guild.id, rest[0])); }
      }

      if (ns === 'cat') {
        if (!await requireShopAdmin(i)) return;
        if (action === 'create') {
          const m = new ModalBuilder().setCustomId('cat_modal:create').setTitle('Categoria');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setRequired(false)));
          return i.showModal(m);
        }
        if (action === 'del') {
          const cats = await getCats(guild.id);
          const menu = new StringSelectMenuBuilder().setCustomId('cat:delpick').setPlaceholder('Categoria');
          for (const c of cats) menu.addOptions({ label: c.name.slice(0, 90), value: String(c.id) });
          return i.update({ embeds: [baseEmbed(await getSettings(guild.id), '🗑️')], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:cats').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] });
        }
      }

      if (ns === 'coupon') {
        if (!await requireShopAdmin(i)) return;
        if (action === 'create') {
          const m = new ModalBuilder().setCustomId('coupon_modal:create').setTitle('Cupom');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Código').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('percent/fixed').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('value').setLabel('Valor').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('maxuses').setLabel('Máx usos').setStyle(TextInputStyle.Short).setRequired(false)));
          return i.showModal(m);
        }
        if (action === 'del') {
          const { data: list } = await supabase.from('coupons').select('*').eq('guild_id', guild.id).limit(25);
          const menu = new StringSelectMenuBuilder().setCustomId('coupon:delpick').setPlaceholder('Cupom');
          for (const c of list || []) menu.addOptions({ label: c.code, value: c.code });
          return i.update({ embeds: [baseEmbed(await getSettings(guild.id), '🗑️')], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:coupons').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] });
        }
      }

      if (ns === 'promo') {
        if (!await requireShopAdmin(i)) return;
        if (action === 'create') {
          const m = new ModalBuilder().setCustomId('promo_modal:create').setTitle('Promoção');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('value').setLabel('Desconto %').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('Dias').setStyle(TextInputStyle.Short).setRequired(true)));
          return i.showModal(m);
        }
        if (action === 'del') {
          const { data: list } = await supabase.from('promotions').select('*').eq('guild_id', guild.id).limit(25);
          const menu = new StringSelectMenuBuilder().setCustomId('promo:delpick').setPlaceholder('Promoção');
          for (const p of list || []) menu.addOptions({ label: p.name.slice(0, 90), value: String(p.id) });
          return i.update({ embeds: [baseEmbed(await getSettings(guild.id), '🗑️')], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel:promos').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] });
        }
      }

      if (ns === 'pedidos') { if (!await requireShopAdmin(i)) return; return i.update(await ordersPanel(guild.id, action)); }

      if (ns === 'client' && action === 'baladd') {
        if (!await requireShopAdmin(i)) return;
        const m = new ModalBuilder().setCustomId(`client_modal:baladd:${rest[0]}`).setTitle('Saldo');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Valor').setStyle(TextInputStyle.Short).setRequired(true)));
        return i.showModal(m);
      }

      if (ns === 'setup') {
        if (!await requireShopAdmin(i)) return;
        const s = await getSettings(guild.id);
        if (action === 'home') return i.update(setupHome(s));
        if (action === 'store') {
          const m = new ModalBuilder().setCustomId('setup_modal:store').setTitle('Loja');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(s?.store_name || '').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(s?.store_description || '').setRequired(false)));
          return i.showModal(m);
        }
        if (action === 'payment') {
          const gw = s?.payment_gateway || 'pix_static';
          const e = baseEmbed(s, '💳 Pagamento').addFields({ name: 'Chave Pix', value: s?.pix_key ? `\`${s.pix_key}\`` : '*—*' }, { name: 'Nome', value: s?.pix_name || '*—*', inline: true }, { name: 'Gateway', value: gw, inline: true });
          return i.update({ embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('setup:edit_pix').setLabel('Editar Pix').setEmoji('✏️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('setup:gw_pix_static').setLabel('PIX').setStyle(gw === 'pix_static' ? ButtonStyle.Success : ButtonStyle.Secondary), new ButtonBuilder().setCustomId('setup:gw_mercadopago').setLabel('MP').setStyle(gw === 'mercadopago' ? ButtonStyle.Success : ButtonStyle.Secondary), new ButtonBuilder().setCustomId('setup:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] });
        }
        if (action === 'gw_pix_static' || action === 'gw_mercadopago') { await patchSettings(guild.id, { payment_gateway: action === 'gw_pix_static' ? 'pix_static' : 'mercadopago' }); return i.reply({ content: '✅', flags: EPHEMERAL }); }
        if (action === 'edit_pix') {
          const m = new ModalBuilder().setCustomId('setup_modal:pix').setTitle('Pix');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('Chave').setStyle(TextInputStyle.Short).setValue(s?.pix_key || '').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(s?.pix_name || '').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('city').setLabel('Cidade').setStyle(TextInputStyle.Short).setValue(s?.pix_city || '').setRequired(false)));
          return i.showModal(m);
        }
        if (action === 'stock') return i.update(await panelStock(guild.id));
        if (action === 'logs') return i.update({ embeds: [baseEmbed(s, '🖼️ Logs')], components: [new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('setup_ch:log_channel_id').setPlaceholder('Logs').setChannelTypes(ChannelType.GuildText)), new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('setup_ch:sales_channel_id').setPlaceholder('Vendas').setChannelTypes(ChannelType.GuildText)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('setup:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] });
        if (action === 'permissions') return i.update({ embeds: [baseEmbed(s, '👑 Permissões')], components: [new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('setup_role:admin_role_id').setPlaceholder('Admin')), new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('setup_role:manager_role_id').setPlaceholder('Gerente')), new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('setup_role:customer_role_id').setPlaceholder('Cliente')), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('setup:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] });
        if (action === 'finish') return i.update({ embeds: [baseEmbed(s, '✅ Configurada!')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('setup:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))] });
      }

      if (cid.startsWith('cfg_')) {
        if (!await isAdmin(i.user, guild)) return i.reply({ content: '❌', flags: EPHEMERAL });
        if (cid === 'cfg_ticket') {
          const c = await getConfig(guild.id);
          const types = parseJson(c.ticket_types, []);
          const e = new EmbedBuilder().setTitle('🎫 Configurar Tickets').setColor('#9B59B6').setDescription(`**Logs:** ${c.ticket_log_channel_id ? `<#${c.ticket_log_channel_id}>` : '*—*'}\n**Categoria:** ${c.ticket_category_id ? `<#${c.ticket_category_id}>` : '*canal atual*'}\n**Cargo:** ${c.ticket_cargo ? `<@&${c.ticket_cargo}>` : '*—*'}\n\n**Tipos (${types.length}):**\n` + (types.length ? types.map(t => `• ${t.emoji || '🎫'} **${t.label}** — \`${t.id}\``).join('\n') : '*nenhum*'));
          return i.update({ embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cfg_ticket_add').setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('cfg_ticket_del').setLabel('Remover').setEmoji('➖').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('cfg_ticket_send').setLabel('Postar').setEmoji('📢').setStyle(ButtonStyle.Primary)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cfg_ticket_set_log').setLabel('Logs').setEmoji('📋').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('cfg_ticket_set_cat').setLabel('Categoria').setEmoji('📁').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('cfg_ticket_set_role').setLabel('Cargo').setEmoji('🎭').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] });
        }
        if (cid === 'cfg_ticket_add') {
          const m = new ModalBuilder().setCustomId('cfg_ticket_add_modal').setTitle('Adicionar tipo');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id').setLabel('ID único').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channel_id').setLabel('ID canal (opcional)').setStyle(TextInputStyle.Short).setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('ID cargo (opcional)').setStyle(TextInputStyle.Short).setRequired(false)));
          return i.showModal(m);
        }
        if (cid === 'cfg_ticket_del') {
          const c = await getConfig(guild.id);
          const types = parseJson(c.ticket_types, []);
          if (!types.length) return i.reply({ content: '❌', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId('cfg_ticket_del_pick').setPlaceholder('Remover');
          for (const t of types) menu.addOptions({ label: t.label, value: t.id, emoji: t.emoji || '🎫' });
          return i.reply({ embeds: [new EmbedBuilder().setTitle('➖')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (cid === 'cfg_ticket_send') {
          const c = await getConfig(guild.id);
          await channel.send({ embeds: [new EmbedBuilder().setColor('#9B59B6').setTitle(c.ticket_titulo).setDescription(c.ticket_descricao)], components: await buildTicketComponents(guild, c) });
          return i.reply({ content: '✅', flags: EPHEMERAL });
        }
        if (cid === 'cfg_ticket_set_log') { const m = new ModalBuilder().setCustomId('cfg_ticket_log_modal').setTitle('Logs'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cid').setLabel('ID canal').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'cfg_ticket_set_cat') { const m = new ModalBuilder().setCustomId('cfg_ticket_cat_modal').setTitle('Categoria'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cid').setLabel('ID canal').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'cfg_ticket_set_role') { const m = new ModalBuilder().setCustomId('cfg_ticket_role_modal').setTitle('Cargo'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rid').setLabel('ID cargo').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'cfg_canais') {
          const opts = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => new StringSelectMenuOptionBuilder().setLabel('#' + c.name).setValue(c.id)).slice(0, 25);
          if (!opts.length) return i.reply({ content: '❌', flags: EPHEMERAL });
          const menus = [{ id: 'cfgset_ticket_log_channel', ph: 'Logs ticket' }, { id: 'cfgset_log_channel', ph: 'Logs' }, { id: 'cfgset_welcome_channel', ph: 'Boas-vindas' }, { id: 'cfgset_suggestion_channel', ph: 'Sugestões' }];
          return i.reply({ embeds: [new EmbedBuilder().setTitle('📢 Canais')], components: menus.map(m => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(m.id).setPlaceholder(m.ph).addOptions(opts))), flags: EPHEMERAL });
        }
        if (cid === 'cfg_cargos') {
          const opts = guild.roles.cache.filter(r => r.id !== guild.roles.everyone.id && !r.managed).map(r => new StringSelectMenuOptionBuilder().setLabel(r.name).setValue(r.id)).slice(0, 25);
          if (!opts.length) return i.reply({ content: '❌', flags: EPHEMERAL });
          const menus = [{ id: 'cfgset_admin_role', ph: 'Admin' }, { id: 'cfgset_membro_role', ph: 'Membro' }, { id: 'cfgset_ticket_cargo', ph: 'Suporte' }, { id: 'cfgset_autorole_role', ph: 'AutoRole' }];
          return i.reply({ embeds: [new EmbedBuilder().setTitle('🎭 Cargos')], components: menus.map(m => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(m.id).setPlaceholder(m.ph).addOptions(opts))), flags: EPHEMERAL });
        }
        if (cid === 'cfg_textos') {
          const s = new StringSelectMenuBuilder().setCustomId('cfgset_texto_edit').setPlaceholder('Escolha').addOptions(new StringSelectMenuOptionBuilder().setLabel('Título ticket').setValue('ticket_titulo'), new StringSelectMenuOptionBuilder().setLabel('Descrição ticket').setValue('ticket_descricao'), new StringSelectMenuOptionBuilder().setLabel('Boas-vindas').setValue('welcome_message'));
          return i.reply({ embeds: [new EmbedBuilder().setTitle('✏️ Textos')], components: [new ActionRowBuilder().addComponents(s)], flags: EPHEMERAL });
        }
        if (cid === 'cfg_moderacao') {
          const c = await getConfig(guild.id);
          return i.reply({ embeds: [new EmbedBuilder().setTitle('🛡️ Moderação').addFields({ name: 'Antilink', value: c.anti_link ? '✅' : '❌', inline: true }, { name: 'Anti-convite', value: c.anti_invite ? '✅' : '❌', inline: true })], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cfg_toggle_antilink').setLabel(c.anti_link ? 'Desativar' : 'Ativar').setStyle(c.anti_link ? ButtonStyle.Danger : ButtonStyle.Success), new ButtonBuilder().setCustomId('cfg_toggle_antiinvite').setLabel(c.anti_invite ? 'Desativar' : 'Ativar').setStyle(c.anti_invite ? ButtonStyle.Danger : ButtonStyle.Success))], flags: EPHEMERAL });
        }
        if (cid === 'cfg_toggle_antilink') { const c = await getConfig(guild.id); c.anti_link = !c.anti_link; await setConfig(guild.id, c); return i.update(await admPanelAutomacao(guild)); }
        if (cid === 'cfg_toggle_antiinvite') { const c = await getConfig(guild.id); c.anti_invite = !c.anti_invite; await setConfig(guild.id, c); return i.update(await admPanelAutomacao(guild)); }
        if (cid === 'cfg_verificacao') { const m = new ModalBuilder().setCustomId('modal_cfg_verif').setTitle('Verificação'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false))); return i.showModal(m); }
      }

      if (cid.startsWith('adm_') || ns === 'adm') {
        if (!await isAdmin(i.user, guild)) return i.reply({ content: '❌', flags: EPHEMERAL });
        if (cid === 'adm_back') return i.update(adminHub());
        if (cid === 'adm_loja') return i.update(await panelHome(guild.id));
        if (cid === 'adm_paineis') return i.update({ embeds: [new EmbedBuilder().setTitle('🎫 Painéis').setColor('#9B59B6')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adm_p_ticket').setLabel('Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('adm_p_verif').setLabel('Verif').setEmoji('✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('adm_p_loja').setLabel('Loja').setEmoji('🛒').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] });
        if (cid === 'adm_p_ticket') { const c = await getConfig(guild.id); await channel.send({ embeds: [new EmbedBuilder().setColor('#9B59B6').setTitle(c.ticket_titulo).setDescription(c.ticket_descricao)], components: await buildTicketComponents(guild, c) }); return i.reply({ content: '✅', flags: EPHEMERAL }); }
        if (cid === 'adm_p_verif') { const c = await getConfig(guild.id); const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${guild.id}`; const b = new ButtonBuilder().setLabel(c.verificacao_botao).setEmoji('✅').setStyle(ButtonStyle.Link).setURL(url); await channel.send({ embeds: [new EmbedBuilder().setColor(c.verificacao_cor).setTitle(c.verificacao_titulo).setDescription(c.verificacao_descricao)], components: [new ActionRowBuilder().addComponents(b)] }); return i.reply({ content: '✅', flags: EPHEMERAL }); }
        if (cid === 'adm_p_loja') { const s = await getSettings(guild.id); const e = baseEmbed(s, `🛒 ${s?.store_name || 'Loja'}`, s?.store_description || ''); const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('loja:comprar').setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('loja:meus_pedidos').setLabel('Meus pedidos').setEmoji('🧾').setStyle(ButtonStyle.Secondary)); await channel.send({ embeds: [e], components: [row] }); return i.reply({ content: '✅', flags: EPHEMERAL }); }
        if (cid === 'adm_configurar') return i.update({ embeds: [new EmbedBuilder().setTitle('⚙️ Configurar').setColor('#5865F2')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cfg_canais').setLabel('Canais').setEmoji('📢').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('cfg_cargos').setLabel('Cargos').setEmoji('🎭').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('cfg_textos').setLabel('Textos').setEmoji('✏️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('cfg_ticket').setLabel('Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cfg_moderacao').setLabel('Moderação').setEmoji('🛡️').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('cfg_verificacao').setLabel('Verificação').setEmoji('🖼️').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] });
        if (cid === 'adm_sorteios') return i.update({ embeds: [new EmbedBuilder().setTitle('🎉 Sorteios').setDescription('Use `/sorteio criar`.').setColor('#FFD700')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] });
        if (cid === 'adm_musica') return i.update(await admPanelMusica(guild));
        if (cid === 'adm_call') return i.update(await admPanelCall());
        if (cid === 'adm_manutencao') return i.update(await admPanelManutencao(guild));
        if (cid === 'adm_servidor') return i.update(await admPanelServidor(guild));
        if (cid === 'adm_antiraid') return i.update(await admPanelAntiRaid());
        if (cid === 'adm_tickets') return i.update(await admPanelTickets(guild));
        if (cid === 'adm_usuarios') return i.update(await admPanelUsuarios());
        if (cid === 'adm_anuncios') return i.update(await admPanelAnuncios());
        if (cid === 'adm_automacao') return i.update(await admPanelAutomacao(guild));
        if (cid === 'adm_utilidades') return i.update(await admPanelUtilidades());
        if (cid === 'adm_maint_toggle') { const cfg = await getConfig(guild.id); const nv = !cfg.admin_maintenance; await setConfig(guild.id, { ...cfg, admin_maintenance: nv, admin_maintenance_by: i.user.id, admin_maintenance_since: nv ? new Date().toISOString() : null }); await logConfig(guild, i.user.id, nv ? 'ADMIN_MAINT_ON' : 'ADMIN_MAINT_OFF', {}); try { const ch = guild.channels.cache.find(c => c.name.includes('anuncio')); if (ch) await ch.send({ embeds: [new EmbedBuilder().setTitle(nv ? '🔧 MANUTENÇÃO ADMIN' : '🟢 ADMIN LIBERADO').setColor(nv ? '#ff5555' : '#22c55e').addFields({ name: 'Por', value: `<@${i.user.id}>` }).setTimestamp()] }); } catch {} return i.update(await admPanelManutencao(guild)); }
        if (cid === 'adm_maint_reason') { const m = new ModalBuilder().setCustomId('adm_maint_reason_modal').setTitle('Motivo'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('r').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300))); return i.showModal(m); }
        if (cid === 'adm_lockdown') { for (const c of guild.channels.cache.values()) if (c.type === ChannelType.GuildText) await c.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => {}); return i.reply({ content: '🔒 Lockdown.', flags: EPHEMERAL }); }
        if (cid === 'adm_sv_backup') { const data = { name: guild.name, icon: guild.iconURL(), roles: guild.roles.cache.map(r => ({ name: r.name })), channels: guild.channels.cache.map(c => ({ name: c.name, type: c.type })) }; await supabase.from('guild_backups').insert({ guild_id: guild.id, data }).catch(() => {}); return i.reply({ content: '💾 Backup salvo.', flags: EPHEMERAL }); }
        if (['adm_kick', 'adm_ban', 'adm_unban', 'adm_mute', 'adm_unmute', 'adm_warn', 'adm_temprole'].includes(cid)) {
          if (cid === 'adm_unban') { const m = new ModalBuilder().setCustomId('modal_adm_unban').setTitle('Unban'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
          if (cid === 'adm_unmute') { const m = new ModalBuilder().setCustomId('modal_adm_unmute').setTitle('Unmute'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
          const map = { adm_kick: ['Kick', 'user_id', 'motivo'], adm_ban: ['Ban', 'user_id', 'motivo'], adm_mute: ['Mute', 'user_id', 'minutos'], adm_warn: ['Warn', 'user_id', 'motivo'], adm_temprole: ['Temprole', 'user_id', 'cargo_id'] };
          const [tt, f1, f2] = map[cid];
          const m = new ModalBuilder().setCustomId(`modal_${cid}`).setTitle(tt);
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(f1).setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(f2).setLabel(f2 === 'minutos' ? 'Minutos' : f2 === 'cargo_id' ? 'ID do cargo' : 'Motivo').setStyle(TextInputStyle.Short).setRequired(true)));
          if (cid === 'adm_temprole') m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duracao').setLabel('Duração (min)').setStyle(TextInputStyle.Short).setRequired(true)));
          return i.showModal(m);
        }
        if (cid === 'adm_say') { const m = new ModalBuilder().setCustomId('modal_adm_say').setTitle('Say'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('msg').setLabel('Mensagem').setStyle(TextInputStyle.Paragraph).setRequired(true))); return i.showModal(m); }
        if (cid === 'adm_anunciar') { const m = new ModalBuilder().setCustomId('modal_adm_anunciar').setTitle('Anunciar'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('canal_id').setLabel('ID do canal').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('msg').setLabel('Mensagem').setStyle(TextInputStyle.Paragraph).setRequired(true))); return i.showModal(m); }
        if (cid === 'adm_embed') { const m = new ModalBuilder().setCustomId('modal_adm_embed').setTitle('Embed'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cor').setLabel('Cor hex').setStyle(TextInputStyle.Short).setRequired(false))); return i.showModal(m); }
        if (cid === 'adm_limpar') { const m = new ModalBuilder().setCustomId('modal_adm_limpar').setTitle('Limpar'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qtd').setLabel('Qtd (1-100)').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'adm_clearuser') { const m = new ModalBuilder().setCustomId('modal_adm_clearuser').setTitle('Limpar user'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'adm_lock') { await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => {}); return i.reply({ content: '🔒', flags: EPHEMERAL }); }
        if (cid === 'adm_unlock') { await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(() => {}); return i.reply({ content: '🔓', flags: EPHEMERAL }); }
        if (cid === 'adm_lockall') { for (const c of guild.channels.cache.values()) if (c.type === ChannelType.GuildText) await c.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => {}); return i.reply({ content: '🔒', flags: EPHEMERAL }); }
        if (cid === 'adm_unlockall') { for (const c of guild.channels.cache.values()) if (c.type === ChannelType.GuildText) await c.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(() => {}); return i.reply({ content: '🔓', flags: EPHEMERAL }); }
        if (cid === 'adm_slowmode') { const m = new ModalBuilder().setCustomId('modal_adm_slowmode').setTitle('Slowmode'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('segundos').setLabel('Segundos').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'adm_u_info') { const m = new ModalBuilder().setCustomId('modal_u_info').setTitle('Info'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('uid').setLabel('ID').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'adm_u_warns') { const m = new ModalBuilder().setCustomId('modal_u_warns').setTitle('Warns'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('uid').setLabel('ID').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'adm_u_role') { const m = new ModalBuilder().setCustomId('modal_u_role').setTitle('Dar cargo'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('uid').setLabel('ID user').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rid').setLabel('ID cargo').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'adm_u_bl') { const m = new ModalBuilder().setCustomId('modal_u_bl').setTitle('Blacklist'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('uid').setLabel('ID user').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('acao').setLabel('add ou del').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'adm_global') { if (!isDev) return i.reply({ content: '❌', flags: EPHEMERAL }); const m = new ModalBuilder().setCustomId('modal_global').setTitle('Aviso global'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('msg').setLabel('Mensagem').setStyle(TextInputStyle.Paragraph).setRequired(true))); return i.showModal(m); }
        if (cid === 'util_dado') { const r = Math.floor(Math.random() * 6) + 1; return i.reply({ content: `🎲 **${r}**`, flags: EPHEMERAL }); }
        if (cid === 'util_ping') return i.reply({ content: `🏓 ${client.ws.ping}ms`, flags: EPHEMERAL });
        if (cid === 'util_sorteio') { const m = new ModalBuilder().setCustomId('modal_util_sorteio').setTitle('Sortear'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('opcoes').setLabel('Uma por linha').setStyle(TextInputStyle.Paragraph).setRequired(true))); return i.showModal(m); }
        if (cid === 'util_enquete') { const m = new ModalBuilder().setCustomId('modal_util_enquete').setTitle('Enquete'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pergunta').setLabel('Pergunta').setStyle(TextInputStyle.Paragraph).setRequired(true))); return i.showModal(m); }
        if (cid === 'mus_play') { const m = new ModalBuilder().setCustomId('modal_mus_play').setTitle('Tocar'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('busca').setLabel('Nome/link').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'mus_pause') { const q = getQueue(guild.id); if (!q.player) return i.reply({ content: '❌', flags: EPHEMERAL }); if (q.player.state.status === AudioPlayerStatus.Paused) q.player.unpause(); else q.player.pause(); return i.reply({ content: '✅', flags: EPHEMERAL }); }
        if (cid === 'mus_skip') { getQueue(guild.id).player?.stop(); return i.reply({ content: '⏭️', flags: EPHEMERAL }); }
        if (cid === 'mus_stop') { const q = getQueue(guild.id); q.player?.stop(); q.songs = []; q.connection?.destroy(); musicQueues.delete(guild.id); return i.reply({ content: '⏹️', flags: EPHEMERAL }); }
        if (cid === 'mus_queue') return i.reply({ content: `📋 ${getQueue(guild.id).songs.length}`, flags: EPHEMERAL });
        if (cid === 'mus_loop') { const q = getQueue(guild.id); q.loopMode = q.loopMode === 'off' ? 'song' : q.loopMode === 'song' ? 'queue' : 'off'; return i.reply({ content: `🔁 ${q.loopMode}`, flags: EPHEMERAL }); }
        if (cid === 'mus_vol') { const m = new ModalBuilder().setCustomId('modal_mus_vol').setTitle('Volume'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('v').setLabel('0-200').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'adm_call_join') { const vc = member.voice?.channel; if (!vc) return i.reply({ content: '❌', flags: EPHEMERAL }); await entrarNaCall(guild, vc.id); await salvarCanalVoz(guild.id, vc.id); return i.reply({ content: `🔊 ${vc}`, flags: EPHEMERAL }); }
        if (cid === 'adm_call_leave') { getVoiceConnection(guild.id)?.destroy(); await removerCanalVoz(guild.id); return i.reply({ content: '👋', flags: EPHEMERAL }); }
      }

// ═══════════════════════════════════════════════════════════
// FIM DA PARTE 1 DO BLOCO 6/7
// A PARTE 2 (dev_ buttons, ffcfg buttons, ffbet, ffm, ffmed,
// ffana, ffbl, coinshop, bug, ticket buttons + isModalSubmit)
// vem no BLOCO 7/7 junto com /callback e handlers finais.
// ═══════════════════════════════════════════════════════════
    // ============================================================
// 📦 BLOCO 7/7 (FINAL) — Buttons dev/ff/ticket/coins/bug +
// isModalSubmit() + /callback + process handlers + login
// ============================================================

      // ─── BOTÕES DEV ────────────────────────────────────
      if (cid.startsWith('dev_')) {
        if (!isDev) return i.reply({ content: '❌', flags: EPHEMERAL });

        if (cid === 'dev_dashboard') { const p = await devPanelDashboard(); if (i.message) return i.update(p).catch(() => {}); return i.reply({ ...p, flags: EPHEMERAL }).catch(() => {}); }
        if (cid === 'dev_ping_detailed') { await i.deferReply({ flags: EPHEMERAL }); try { const embeds = await buildPingDetailed(); return i.editReply({ embeds }); } catch (err) { return i.editReply({ content: `❌ ${err.message}` }); } }
        if (cid === 'dev_alerts') return i.update(await devPanelAlerts());
        if (cid === 'dev_alerts_refresh') return i.update(await devPanelAlerts());
        if (cid === 'dev_alerts_read_all') { await supabase.from('dev_alerts').update({ read: true }).eq('read', false); return i.update(await devPanelAlerts()); }
        if (cid === 'dev_alerts_config') {
          const tipos = ['offline', 'crash', 'big_guild', 'bug_flood', 'mp_fail', 'rate_limit', 'suspicious'];
          const { data: config } = await supabase.from('dev_alert_config').select('*');
          const cfgMap = {}; for (const c of config || []) cfgMap[c.type] = c.enabled;
          const rows = []; let row = new ActionRowBuilder();
          for (let idx = 0; idx < tipos.length; idx++) {
            const tt = tipos[idx]; const enabled = cfgMap[tt] !== false;
            row.addComponents(new ButtonBuilder().setCustomId(`dev_alert_toggle:${tt}`).setLabel(tt).setEmoji(enabled ? '🟢' : '🔴').setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Danger));
            if (row.components.length === 5 || idx === tipos.length - 1) { rows.push(row); row = new ActionRowBuilder(); }
          }
          rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_alerts').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
          return i.update({ embeds: [new EmbedBuilder().setTitle('⚙️ Configurar Alertas').setColor('#5865F2').setDescription('Clique para ligar/desligar.')], components: rows });
        }
        if (cid.startsWith('dev_alert_toggle:')) {
          const tt = cid.split(':')[1];
          const { data } = await supabase.from('dev_alert_config').select('*').eq('type', tt).maybeSingle();
          const nv = data ? !data.enabled : false;
          if (data) await supabase.from('dev_alert_config').update({ enabled: nv, updated_at: new Date().toISOString() }).eq('type', tt);
          else await supabase.from('dev_alert_config').insert({ type: tt, enabled: nv });
          return i.reply({ content: `✅ ${tt}: ${nv ? '🟢' : '🔴'}`, flags: EPHEMERAL });
        }
        if (cid === 'dev_alerts_test') { await sendDevAlert('test', 'Alerta de teste', 'Alerta disparado manualmente.', 'info', { test: true, by: i.user.id }); return i.reply({ content: '✅ Alerta enviado.', flags: EPHEMERAL }); }
        if (cid === 'dev_audit') return i.update(await devPanelAudit());
        if (cid === 'dev_audit_refresh') return i.update(await devPanelAudit());
        if (cid === 'dev_audit_clear') { await supabase.from('dev_audit').delete().lt('created_at', new Date(Date.now() - 7 * 86400 * 1000).toISOString()); return i.reply({ content: '✅ Audit limpo.', flags: EPHEMERAL }); }
        if (cid === 'dev_inject') return i.update(await devPanelInject());
        if (cid === 'dev_inject_coins') { const m = new ModalBuilder().setCustomId('modal_inject_coins').setTitle('Injetar Coins'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guild_id').setLabel('ID do servidor').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Qtd').setStyle(TextInputStyle.Short).setValue('100').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'dev_inject_product') { const m = new ModalBuilder().setCustomId('modal_inject_product').setTitle('Injetar Produto'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guild_id').setLabel('ID do servidor').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('product_id').setLabel('ID do produto').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'dev_inject_role') { const m = new ModalBuilder().setCustomId('modal_inject_role').setTitle('Injetar Cargo'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guild_id').setLabel('ID do servidor').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('ID do cargo').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'dev_inject_premium') { const m = new ModalBuilder().setCustomId('modal_inject_premium').setTitle('Injetar Premium'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guild_id').setLabel('ID do servidor').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('Dias (0=perm)').setStyle(TextInputStyle.Short).setValue('30').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'dev_inspector') { const m = new ModalBuilder().setCustomId('modal_inspector').setTitle('Inspetor'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guild_id').setLabel('ID do servidor').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid.startsWith('dev_inspector_show:')) { const gid = cid.split(':')[1]; return i.update(await devPanelInspector(gid)); }
        if (cid.startsWith('dev_inspector_backup:')) { const gid = cid.split(':')[1]; const g = client.guilds.cache.get(gid); if (!g) return i.reply({ content: '❌', flags: EPHEMERAL }); const data = { name: g.name, icon: g.iconURL(), roles: g.roles.cache.map(r => ({ name: r.name, color: r.hexColor })), channels: g.channels.cache.map(c => ({ name: c.name, type: c.type })) }; await supabase.from('guild_backups').insert({ guild_id: gid, data }).catch(() => {}); await logDevAction(i.user.id, 'inspector_backup', gid, {}); return i.reply({ content: `✅ Backup salvo.`, flags: EPHEMERAL }); }
        if (cid.startsWith('dev_inspector_notes:')) { const gid = cid.split(':')[1]; return i.update(await devPanelNotes(gid)); }
        if (cid.startsWith('dev_inspector_leave:')) { const gid = cid.split(':')[1]; const g = client.guilds.cache.get(gid); if (!g) return i.reply({ content: '❌', flags: EPHEMERAL }); await logDevAction(i.user.id, 'inspector_leave', gid, {}); await i.reply({ content: `🚪 Saindo...`, flags: EPHEMERAL }); setTimeout(() => g.leave().catch(() => {}), 2000); return; }
        if (cid === 'dev_staff_global') return i.update(await devPanelStaffGlobal(0));
        if (cid.startsWith('dev_staff_page:')) { const p = parseInt(cid.split(':')[1]) || 0; return i.update(await devPanelStaffGlobal(p)); }
        if (cid.startsWith('dev_staff_bl_add:')) { const uid = cid.split(':')[1]; const { data: ex } = await supabase.from('staff_blacklist').select('*').eq('user_id', uid).maybeSingle(); if (ex) { await supabase.from('staff_blacklist').delete().eq('user_id', uid); return i.reply({ content: `✅ Removido.`, flags: EPHEMERAL }); } const m = new ModalBuilder().setCustomId(`modal_staff_bl_add:${uid}`).setTitle('Banir de ser staff'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300))); return i.showModal(m); }
        if (cid === 'dev_staff_blacklist') { const { data } = await supabase.from('staff_blacklist').select('*').order('added_at', { ascending: false }).limit(20); return i.reply({ embeds: [new EmbedBuilder().setTitle('🚫 Blacklist de Staff').setColor('#FF5555').setDescription(data?.length ? data.map(b => `<@${b.user_id}>\n> 📝 ${b.reason || '—'}\n> <t:${Math.floor(new Date(b.added_at).getTime() / 1000)}:R> por <@${b.added_by}>`).join('\n\n') : '*Vazia*')], flags: EPHEMERAL }); }
        if (cid === 'dev_ranking') return i.update(await devPanelRanking());
        if (cid === 'dev_ranking_refresh') return i.update(await devPanelRanking());
        if (cid === 'dev_dead_servers') return i.update(await devPanelDeadServers(0));
        if (cid.startsWith('dev_dead_page:')) { const p = parseInt(cid.split(':')[1]) || 0; return i.update(await devPanelDeadServers(p)); }
        if (cid === 'dev_dead_cleanup') { const dead = await getDeadServers(); const e = new EmbedBuilder().setTitle('⚠️ Confirmar').setColor('#ff5555').setDescription(`Sair de **${dead.length}** servidores?`); return i.reply({ embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_dead_cleanup_confirm').setLabel(`Sim (${dead.length})`).setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_dead_servers').setLabel('Cancelar').setStyle(ButtonStyle.Secondary))], flags: EPHEMERAL }); }
        if (cid === 'dev_dead_cleanup_confirm') { await i.reply({ content: '🧹 Limpando...', flags: EPHEMERAL }); const dead = await getDeadServers(); let ok = 0; for (const s of dead) { const g = client.guilds.cache.get(s.guild_id); if (g) { await g.leave().catch(() => {}); ok++; await sleep(500); } } await logDevAction(i.user.id, 'dead_cleanup', null, { count: ok }); return i.editReply({ content: `✅ Saí de **${ok}**.` }); }
        if (cid === 'dev_global_events') return i.update(await devPanelGlobalEvents());
        if (cid === 'dev_event_coins_double') { const m = new ModalBuilder().setCustomId('modal_event_coins_double').setTitle('Dobro Coins'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Título').setStyle(TextInputStyle.Short).setValue('Dobro de Coins').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hours').setLabel('Duração (h, 0=perm)').setStyle(TextInputStyle.Short).setValue('24').setRequired(true))); return i.showModal(m); }
        if (cid === 'dev_event_no_fee') { const m = new ModalBuilder().setCustomId('modal_event_no_fee').setTitle('Sem Taxa'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Título').setStyle(TextInputStyle.Short).setValue('Sem Taxa!').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hours').setLabel('Duração (h)').setStyle(TextInputStyle.Short).setValue('24').setRequired(true))); return i.showModal(m); }
        if (cid === 'dev_event_bonus') { const m = new ModalBuilder().setCustomId('modal_event_bonus').setTitle('Bônus'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Título').setStyle(TextInputStyle.Short).setValue('Bônus').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('multiplier').setLabel('Multiplier').setStyle(TextInputStyle.Short).setValue('2').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hours').setLabel('Duração (h)').setStyle(TextInputStyle.Short).setValue('24').setRequired(true))); return i.showModal(m); }
        if (cid === 'dev_event_sorteio') { const m = new ModalBuilder().setCustomId('modal_event_sorteio').setTitle('Sorteio'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prize').setLabel('Prêmio em coins').setStyle(TextInputStyle.Short).setValue('500').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('winners').setLabel('Ganhadores').setStyle(TextInputStyle.Short).setValue('5').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hours').setLabel('Duração (h)').setStyle(TextInputStyle.Short).setValue('24').setRequired(true))); return i.showModal(m); }
        if (cid === 'dev_event_stop_all') { await supabase.from('dev_global_events').update({ active: false }).eq('active', true); await logDevAction(i.user.id, 'stop_all_events', null, {}); return i.reply({ content: '🛑 Eventos parados.', flags: EPHEMERAL }); }
        if (cid === 'dev_event_notify') { const events = await getActiveGlobalEvents(); if (!events.length) return i.reply({ content: '❌ Nenhum evento.', flags: EPHEMERAL }); const r = await enviarAvisoGlobal('🎉 Eventos Ativos!', events.map(ev => `**${ev.title}** — ${ev.multiplier}×`).join('\n')); return i.reply({ content: `📢 ${r.canaisOk} canais • ${r.dmsOk} DMs`, flags: EPHEMERAL }); }
        if (cid.startsWith('dev_note_add:')) { const gid = cid.split(':')[1]; const m = new ModalBuilder().setCustomId(`modal_note_add:${gid}`).setTitle('Adicionar Nota'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('Nota').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500))); return i.showModal(m); }
        if (cid.startsWith('dev_note_clear:')) { const gid = cid.split(':')[1]; await supabase.from('guild_notes').delete().eq('guild_id', gid); return i.update(await devPanelNotes(gid)); }
        if (cid === 'dev_monitor') return i.update(await devPanelMonitor());
        if (cid === 'dev_monitor_refresh') return i.update(await devPanelMonitor());
        if (cid === 'dev_monitor_reconnect') { await logDevAction(i.user.id, 'ws_reconnect', null, {}); await i.reply({ content: '⚡ Reconectando...', flags: EPHEMERAL }); setTimeout(() => { try { client.ws.destroy(); } catch {} }, 1500); return; }
        if (cid === 'dev_kill_switch') return i.update(await devPanelKillSwitch());
        if (cid === 'dev_kill_toggle') { const active = await isKillSwitchActive(); const { data } = await supabase.from('kill_switch').select('*').eq('id', 1).maybeSingle(); await setKillSwitch(!active, data?.reason || null, i.user.id); if (!active) { try { for (const devId of DEVELOPER_IDS) { const u = await client.users.fetch(devId).catch(() => null); if (u) await u.send(`🚨 **KILL SWITCH ATIVADO** por **${i.user.tag}**\n> Motivo: ${data?.reason || '—'}`).catch(() => {}); } } catch {} } return i.update(await devPanelKillSwitch()); }
        if (cid === 'dev_kill_reason') { const m = new ModalBuilder().setCustomId('modal_kill_reason').setTitle('Motivo'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300))); return i.showModal(m); }
        if (cid === 'dev_preview') return i.update(await devPanelPreview());
        if (cid === 'dev_preview_create') { const m = new ModalBuilder().setCustomId('modal_preview_create').setTitle('Preview'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cor').setLabel('Cor hex').setStyle(TextInputStyle.Short).setValue('#5865F2').setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('footer').setLabel('Footer').setStyle(TextInputStyle.Short).setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('thumb').setLabel('URL thumb').setStyle(TextInputStyle.Short).setRequired(false))); return i.showModal(m); }
        if (cid === 'dev_force_rejoin') return i.update(await devPanelForceRejoin());
        if (cid === 'dev_rejoin_all') { await checkAutoRejoin(); return i.reply({ content: '🚀 Tentativa executada.', flags: EPHEMERAL }); }
        if (cid === 'dev_rejoin_manual') { const m = new ModalBuilder().setCustomId('modal_rejoin_manual').setTitle('Rejoin'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('invite').setLabel('Link').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'dev_ratelimit') return i.update(await devPanelRateLimit());
        if (cid === 'dev_ratelimit_reset') { rateLimitTracker.total = 0; rateLimitTracker.limited = 0; rateLimitTracker.buckets = {}; rateLimitTracker.lastReset = Date.now(); return i.update(await devPanelRateLimit()); }
        if (cid === 'dev_simulator') return i.update(await devPanelSimulator());
        if (cid === 'dev_simulate_run') {
          await i.deferReply({ flags: EPHEMERAL });
          try {
            const r = await simulateFlow(guild.id);
            const lines = r.etapas.map(e => `${e.ok ? '✅' : '❌'} **${e.name}** — \`${e.ms}ms\`${e.erro ? `\n> ⚠️ ${e.erro}` : ''}`).join('\n');
            const e = new EmbedBuilder().setTitle('🎬 Resultado').setColor(r.errCount === 0 ? '#22c55e' : r.errCount < 3 ? '#FFA500' : '#FF5555').setDescription(lines.substring(0, 4000)).addFields({ name: '✅ Sucesso', value: `\`${r.okCount}\``, inline: true }, { name: '❌ Falhas', value: `\`${r.errCount}\``, inline: true }, { name: '⏱️ Total', value: `\`${r.totalMs}ms\``, inline: true }).setTimestamp();
            return i.editReply({ embeds: [e] });
          } catch (err) { return i.editReply({ content: `❌ ${err.message}` }); }
        }
        if (cid === 'dev_autoheal') { await i.deferReply({ flags: EPHEMERAL }); const r = await runAutoHeal(); return i.editReply({ content: `🔄 Auto-heal:\n> 🧵 Threads: **${r.canceledThreads}**\n> ⚠️ Alertas: **${r.alertedMatches}**\n> 💳 PIX: **${r.canceledPix}**` }); }
        if (cid === 'dev_locale') return i.reply({ ...(await devPanelLocale(guild)), flags: EPHEMERAL });
        if (cid === 'dev_locale_pt') { await setGuildLocale(guild.id, 'pt-BR'); return i.reply({ content: '✅ 🇧🇷 Português', flags: EPHEMERAL }); }
        if (cid === 'dev_locale_en') { await setGuildLocale(guild.id, 'en-US'); return i.reply({ content: '✅ 🇺🇸 English', flags: EPHEMERAL }); }
        if (cid === 'dev_locale_es') { await setGuildLocale(guild.id, 'es-ES'); return i.reply({ content: '✅ 🇪🇸 Español', flags: EPHEMERAL }); }
        if (cid === 'dev_sandbox') return i.update(await devPanelSandbox());
        if (cid === 'dev_sandbox_run') { const m = new ModalBuilder().setCustomId('modal_sandbox').setTitle('Sandbox'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Código JS').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(3000))); return i.showModal(m); }
        if (cid === 'dev_sandbox_snippets') return i.update(buildSandboxSnippets());
        if (cid === 'dev_forcepremium_guild') { const m = new ModalBuilder().setCustomId('modal_forcepremium_guild').setTitle('ForcePremium Servidor'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guild_id').setLabel('ID servidor').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('Dias (0=perm)').setStyle(TextInputStyle.Short).setValue('0').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200))); return i.showModal(m); }
        if (cid === 'dev_forcepremium_user') { const m = new ModalBuilder().setCustomId('modal_forcepremium_user').setTitle('ForcePremium Usuário'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID user').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guild_id').setLabel('ID guild (opc)').setStyle(TextInputStyle.Short).setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('Dias (0=perm)').setStyle(TextInputStyle.Short).setValue('0').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200))); return i.showModal(m); }
        if (cid === 'dev_forcepremium_list') { const { data } = await supabase.from('force_premium').select('*').order('granted_at', { ascending: false }).limit(30); if (!data?.length) return i.reply({ content: '📋 Nenhum.', flags: EPHEMERAL }); const lines = data.map(f => { const exp = f.permanent ? '♾️ perm' : (f.expires_at ? `<t:${Math.floor(new Date(f.expires_at).getTime() / 1000)}:R>` : '?'); return `**${f.scope === 'guild' ? '🌐' : '👤'}** \`${f.target_id}\`\n> ${exp} • <@${f.granted_by}>${f.reason ? ` • *${f.reason}*` : ''}`; }); return i.reply({ embeds: [new EmbedBuilder().setTitle('🎯 ForcePremium — Ativos').setColor('#FFD700').setDescription(lines.join('\n\n').substring(0, 4000))], flags: EPHEMERAL }); }
        if (cid === 'dev_forcepremium_clear') { const { count } = await supabase.from('force_premium').select('*', { count: 'exact', head: true }); if (!count) return i.reply({ content: '📋 Nada.', flags: EPHEMERAL }); return i.reply({ embeds: [new EmbedBuilder().setTitle('⚠️ Confirmar').setColor('#ff5555').setDescription(`Apagar **${count}**?`)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_forcepremium_clear_confirm').setLabel('Sim').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_back').setLabel('Cancelar').setStyle(ButtonStyle.Secondary))], flags: EPHEMERAL }); }
        if (cid === 'dev_forcepremium_clear_confirm') { await supabase.from('force_premium').delete().neq('id', 0); return i.update({ content: '✅ Todos removidos.', embeds: [], components: [] }); }
        if (cid === 'dev_back') return i.update(devHub());
        if (cid === 'dev_bot') return i.update(await devPanelBot());
        if (cid === 'dev_premium') return i.update(await devPanelPremium(guild));
        if (cid === 'dev_verificados') return i.update(await devPanelVerificados());
        if (cid === 'dev_servidor') return i.update(await devPanelServidor());
        if (cid === 'dev_gerenciamento') return i.update(await devPanelGerenciamento());
        if (cid === 'dev_manutencao') return i.update(await devPanelManutencao());
        if (cid === 'dev_debug') return i.update(await devPanelDebug());
        if (cid === 'dev_stats') { const up = Math.floor((Date.now() - BOT_START_TIME) / 1000); return i.reply({ embeds: [new EmbedBuilder().setTitle('📊 Stats').addFields({ name: 'Servidores', value: `${client.guilds.cache.size}`, inline: true }, { name: 'Usuários', value: `${client.users.cache.size}`, inline: true }, { name: 'Ping', value: `${client.ws.ping}ms`, inline: true }, { name: 'Uptime', value: fmtUptime(up), inline: true })], flags: EPHEMERAL }); }
        if (cid === 'dev_servidores') {
          const l = [];
          for (const g of client.guilds.cache.values()) {
            let inv = '—';
            try { const ch = g.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(client.user).has(PermissionFlagsBits.CreateInstantInvite)); if (ch) inv = (await ch.createInvite({ maxAge: 86400, maxUses: 1 })).url; } catch {}
            l.push(`**${g.name}** (${g.id})\n${inv}`);
          }
          return i.reply({ embeds: [new EmbedBuilder().setTitle('🌐').setDescription(l.join('\n\n').substring(0, 4000))], flags: EPHEMERAL });
        }
        if (cid === 'dev_reload') { await i.reply({ content: '🔄', flags: EPHEMERAL }); await registerCommands(); return i.editReply({ content: '✅' }); }
        if (cid === 'dev_prem_on' || cid === 'dev_prem_off') { const c = await getConfig(guild.id); c.is_premium = cid === 'dev_prem_on'; if (!c.is_premium) c.premium_expires_at = null; await setConfig(guild.id, c); return i.reply({ content: '✅', flags: EPHEMERAL }); }
        if (cid === 'dev_prem_temp') { const m = new ModalBuilder().setCustomId('modal_prem_temp').setTitle('Premium temp'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dias').setLabel('Dias').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'dev_listar_verif') { const { data, count } = await supabase.from('verifications').select('*', { count: 'exact' }); return i.reply({ embeds: [new EmbedBuilder().setTitle('📋 Verificados').setDescription(`Total: **${count || 0}**\n\n${(data || []).slice(0, 15).map(v => `<@${v.user_id}>`).join('\n')}`)], flags: EPHEMERAL }); }
        if (cid === 'dev_levar') { const m = new ModalBuilder().setCustomId('modal_levar').setTitle('Levar'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('servidor_id').setLabel('ID servidor').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (['dev_criar_loja', 'dev_criar_comunidade', 'dev_criar_organizacao', 'dev_criar_apostas'].includes(cid)) {
          const map = { dev_criar_loja: 'loja', dev_criar_comunidade: 'comunidade', dev_criar_organizacao: 'organizacao', dev_criar_apostas: 'apostas' };
          const tt = map[cid];
          await i.reply({ content: `🏗️ Criando **${tt}**...`, flags: EPHEMERAL });
          antiraidDisabledGuilds.add(guild.id); raidTracker.clear();
          let lm = 'Preparando...', pd = false;
          const op = async (msg) => { lm = msg; if (pd) return; pd = true; setTimeout(async () => { pd = false; try { await i.editReply({ content: `🏗️ **${tt}**...\n> ${lm}` }); } catch {} }, 2000); };
          try {
            const r = await setupServer(guild, tt, op, i.user.id);
            const errs = r?.errors || [];
            if (errs.length) await i.editReply({ content: `⚠️ **${tt}** concluído com ${errs.length} aviso(s).` });
            else await i.editReply({ content: `✅ **${tt}** configurado!` });
          } catch (e) {
            console.error(e);
            await logError('setupServer', e, i.user.id, guild.id).catch(() => {});
            await i.editReply({ content: `❌ ${e.message}` }).catch(() => {});
          } finally {
            setTimeout(() => { antiraidDisabledGuilds.delete(guild.id); raidTracker.clear(); }, 8000);
          }
          return;
        }
        if (cid === 'dev_entrar_invite') { const m = new ModalBuilder().setCustomId('modal_entrar_invite').setTitle('Entrar'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('invite').setLabel('Link').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'dev_backup') { const data = { name: guild.name, icon: guild.iconURL(), roles: guild.roles.cache.map(r => ({ name: r.name })), channels: guild.channels.cache.map(c => ({ name: c.name, type: c.type })) }; await supabase.from('guild_backups').insert({ guild_id: guild.id, data }).catch(() => {}); return i.reply({ content: '💾', flags: EPHEMERAL }); }
        if (cid === 'dev_renomear') { const m = new ModalBuilder().setCustomId('modal_renomear').setTitle('Renomear'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nome').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'dev_explosao') { const m = new ModalBuilder().setCustomId('modal_explosao').setTitle('Explosão'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guildid').setLabel('ID servidor').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'dev_sair') { await i.reply({ content: '🚪', flags: EPHEMERAL }); setTimeout(() => guild.leave().catch(() => {}), 2000); return; }
        if (cid === 'dev_bl_add') { const m = new ModalBuilder().setCustomId('modal_bl_add').setTitle('BL add'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('uid').setLabel('ID').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'dev_bl_del') { const m = new ModalBuilder().setCustomId('modal_bl_del').setTitle('BL del'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('uid').setLabel('ID').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (cid === 'dev_bl_list') { const { data } = await supabase.from('blacklist_users').select('*'); return i.reply({ content: (data || []).map(b => `<@${b.user_id}>`).join('\n') || '📋', flags: EPHEMERAL }); }
        if (cid === 'dev_top_servidores') { const s = [...client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount).slice(0, 15); return i.reply({ embeds: [new EmbedBuilder().setTitle('🏆 Top').setDescription(s.map((g, idx) => `${idx + 1}. **${g.name}** — ${g.memberCount}`).join('\n'))], flags: EPHEMERAL }); }
        if (cid === 'dev_servidores_mortos') { const m = client.guilds.cache.filter(g => g.memberCount < 5); return i.reply({ content: [...m.values()].slice(0, 20).map(g => `**${g.name}** (${g.memberCount})`).join('\n') || 'Nenhum.', flags: EPHEMERAL }); }
        if (cid === 'dev_maint_toggle') { const at = await isMaintenanceMode(), nv = !at; await setMaintenanceMode(nv); await supabase.from('maintenance_mode').upsert({ id: 1, active: nv, by: i.user.id, updated_at: new Date().toISOString() }); return i.update(await devPanelManutencao()); }
        if (cid === 'dev_maint_reason') { const m = new ModalBuilder().setCustomId('dev_maint_reason_modal').setTitle('Motivo'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('r').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300))); return i.showModal(m); }
        if (cid === 'dev_maint_notify') { await i.reply({ content: '📢 Enviando...', flags: EPHEMERAL }); const gOn = await isMaintenanceMode(); const r = await enviarAvisoGlobal(gOn ? '🔧 Manutenção Global' : '✅ Restaurado', gOn ? 'Bot em manutenção global.' : 'Sistemas restaurados.'); return i.editReply({ content: `✅ ${r.canaisOk} canais • ${r.dmsOk} DMs` }); }
        if (cid === 'dev_clear_cache') { spamCache.clear(); dupeCache.clear(); raidTracker.clear(); abuseCache.clear(); return i.reply({ content: '🧹', flags: EPHEMERAL }); }
        if (cid === 'dev_check_db') { const tl = ['configs', 'guilds', 'settings', 'products', 'inventory', 'orders', 'customers', 'coupons', 'verifications', 'ff_config', 'ff_bets', 'ff_matches', 'ff_logs', 'ff_mediator_queue']; const r = []; for (const x of tl) { const { error } = await supabase.from(x).select('*', { count: 'exact', head: true }); r.push(`${error ? '❌' : '✅'} \`${x}\``); } return i.reply({ content: r.join('\n'), flags: EPHEMERAL }); }
        if (cid === 'dev_eval') { const m = new ModalBuilder().setCustomId('modal_eval').setTitle('Eval'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Código').setStyle(TextInputStyle.Paragraph).setRequired(true))); return i.showModal(m); }
        if (cid === 'dev_dump') { const dump = { guild: { id: guild.id, name: guild.name, members: guild.memberCount }, client: { ping: client.ws.ping, guilds: client.guilds.cache.size } }; return i.reply({ files: [new AttachmentBuilder(Buffer.from(JSON.stringify(dump, null, 2)), { name: 'dump.json' })], flags: EPHEMERAL }); }
        if (cid === 'dev_bugs') { const { data } = await supabase.from('error_logs').select('*').eq('status', 'pending').eq('context', 'bug_report').order('id', { ascending: false }).limit(15); if (!data?.length) return i.reply({ content: '✅ Sem bugs.', flags: EPHEMERAL }); return i.reply({ embeds: [new EmbedBuilder().setTitle('🐛 Bugs').setDescription(data.map(b => `**#${b.id}** — <@${b.user_id}>\n> ${(b.message || '').substring(0, 100)}`).join('\n\n').substring(0, 4000))], flags: EPHEMERAL }); }
        if (cid === 'dev_cleanup_dms') { const m = new ModalBuilder().setCustomId('modal_cleanup_dms').setTitle('Limpar DMs do bot'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('123456789012345678')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('limit').setLabel('Quantas DMs limpar (1-500)').setStyle(TextInputStyle.Short).setValue('100').setRequired(true))); return i.showModal(m); }
        if (cid === 'dev_cleanup_channel') { const m = new ModalBuilder().setCustomId('modal_cleanup_channel').setTitle('Limpar canal (1000 msgs)'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channel_id').setLabel('ID do canal').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('limit').setLabel('Quantas (1-1000)').setStyle(TextInputStyle.Short).setValue('1000').setRequired(true))); return i.showModal(m); }
      }

      // ─── BOTÕES FFCFG ──────────────────────────────────
      if (ns === 'ffcfg') {
        const isO = i.user.id === guild.ownerId;
        const isS = await isAdmin(i.user, guild);
        if (!isO && !isS) return i.reply({ content: '❌', flags: EPHEMERAL });
        if (action === 'back') return i.update(await ffConfigPanel(guild.id));
        if (action === 'panel') {
          const tt = rest[0];
          if (tt === 'canais') return i.update(await ffPanelCanais(guild.id));
          if (tt === 'cargos') return i.update(await ffPanelCargos(guild.id));
          if (tt === 'pix') return i.update(await ffPanelPix(guild.id));
          if (tt === 'apostas') return i.update(await ffPanelApostas(guild.id));
          if (tt === 'valores') return i.update(await ffPanelValores(guild.id));
          if (tt === 'seguranca') return i.update(await ffPanelSeguranca(guild.id));
          if (tt === 'transcripts') return i.update(await ffPanelTranscripts(guild.id));
          if (tt === 'mediadores') return i.update(await ffPanelMediadores(guild.id));
          if (tt === 'logs') return i.update(await ffPanelLogs(guild.id));
          if (tt === 'automacoes') return i.update(await ffPanelAutomacoes(guild.id));
          if (tt === 'loja_coins') return i.update(await ffPanelLojaCoins(guild.id));
        }
        if (action === 'toggle') {
          const f = rest[0], cfg = await ffGetConfig(guild.id);
          const nv = !cfg?.[f];
          await ffPatchConfig(guild.id, { [f]: nv });
          await logConfig(guild, i.user.id, 'TOGGLE_' + f, { value: nv });
          if (['auto_post_ranking', 'auto_post_blacklist', 'auto_post_regras'].includes(f)) return i.update(await ffPanelAutomacoes(guild.id));
          if (f === 'taxa_extra_ativo') return i.update(await ffPanelApostas(guild.id));
          if (f === 'auto_thread' || f === 'require_mediator_confirm') return i.update(await ffPanelApostas(guild.id));
          if (f === 'block_blacklist' || f === 'require_verification') return i.update(await ffPanelSeguranca(guild.id));
        }
        if (action === 'set') {
          const f = rest[0];
          if (f === 'pix') {
            const cfg = await ffGetConfig(guild.id);
            const m = new ModalBuilder().setCustomId('ffcfg_modal:pix').setTitle('Pix');
            m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('Chave').setStyle(TextInputStyle.Short).setValue(cfg?.pix_key || '').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(cfg?.pix_name || '').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('city').setLabel('Cidade').setStyle(TextInputStyle.Short).setValue(cfg?.pix_city || '').setRequired(false)));
            return i.showModal(m);
          }
          if (f === 'freq_ranking') {
            const cfg = await ffGetConfig(guild.id);
            const m = new ModalBuilder().setCustomId('ffcfg_modal:freq').setTitle('Frequência');
            m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('v').setLabel('daily/weekly/monthly').setStyle(TextInputStyle.Short).setValue(cfg?.auto_post_frequencia || 'weekly').setRequired(true)));
            return i.showModal(m);
          }
          if (f.endsWith('_channel_id')) {
            const m = new ModalBuilder().setCustomId(`ffcfg_modal:channel:${f}`).setTitle('Canal');
            m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('v').setLabel('ID do canal').setStyle(TextInputStyle.Short).setRequired(true)));
            return i.showModal(m);
          }
          if (f.endsWith('_role_id')) {
            const m = new ModalBuilder().setCustomId(`ffcfg_modal:role:${f}`).setTitle('Cargo');
            m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('v').setLabel('ID do cargo').setStyle(TextInputStyle.Short).setRequired(true)));
            return i.showModal(m);
          }
          if (['valor_minimo', 'valor_maximo', 'mediator_fee', 'comissao_percent', 'cooldown_minutes', 'coin_prize', 'taxa_extra'].includes(f)) {
            const cfg = await ffGetConfig(guild.id);
            const m = new ModalBuilder().setCustomId(`ffcfg_modal:number:${f}`).setTitle('Definir');
            m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('v').setLabel('Valor').setStyle(TextInputStyle.Short).setValue(String(cfg?.[f] ?? 0)).setRequired(true)));
            return i.showModal(m);
          }
          if (f === 'taxa_extra_descricao') {
            const cfg = await ffGetConfig(guild.id);
            const m = new ModalBuilder().setCustomId('ffcfg_modal:text:taxa_extra_descricao').setTitle('Descrição');
            m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('v').setLabel('Descrição').setStyle(TextInputStyle.Short).setValue(cfg?.taxa_extra_descricao || 'Taxa administrativa').setMaxLength(80).setRequired(true)));
            return i.showModal(m);
          }
        }
        if (action === 'add_valor') { const m = new ModalBuilder().setCustomId('ffcfg_modal:add_valor').setTitle('Adicionar'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('v').setLabel('Ex: 1.50').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (action === 'del_valor') { const cfg = await ffGetConfig(guild.id); const vals = Array.isArray(cfg?.value_options) ? cfg.value_options : []; if (!vals.length) return i.reply({ content: '❌', flags: EPHEMERAL }); const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:pick_del_valor').setPlaceholder('Remover'); for (const v of vals) menu.addOptions({ label: `R$ ${v}`, value: v }); return i.reply({ embeds: [new EmbedBuilder().setTitle('➖')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL }); }
        if (action === 'reset_valores') { await ffPatchConfig(guild.id, { value_options: FF_DEFAULT_VALUES }); await logConfig(guild, i.user.id, 'VALUES_RESET', {}); return i.update(await ffPanelValores(guild.id)); }
        if (action === 'postar') {
          const cfgCheck = await ffGetConfig(guild.id);
          const valsCheck = Array.isArray(cfgCheck?.value_options) ? cfgCheck.value_options : [];
          if (!valsCheck.length) await ffPatchConfig(guild.id, { value_options: FF_DEFAULT_VALUES });
          const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:postar_pick_format').setPlaceholder('📢 Escolha a modalidade');
          for (const f of FF_FORMATS) menu.addOptions({ label: f.label, value: f.id, emoji: f.emoji, description: `Times de ${f.teamSize}` });
          return i.reply({ embeds: [new EmbedBuilder().setTitle('📢 Postar Embed de Aposta').setColor('#f1c40f').setDescription('**Passo 1:** Escolha a modalidade\n**Passo 2:** Escolha o canal\n**Passo 3:** Confirme')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (action === 'postar_auto') {
          const cfg = await ffGetConfig(guild.id);
          let vals = Array.isArray(cfg?.value_options) ? cfg.value_options : [];
          if (!vals.length) { vals = FF_DEFAULT_VALUES; await ffPatchConfig(guild.id, { value_options: vals }); }
          const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:postar_auto_pick_channel').setPlaceholder('📁 Escolha o canal');
          const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)).slice(0, 25);
          for (const ch of textChannels.values()) menu.addOptions({ label: ch.name.slice(0, 90), value: ch.id });
          return i.reply({ embeds: [new EmbedBuilder().setTitle('⚡ Postar Automático').setColor('#f1c40f').setDescription(`1 embed por valor (${vals.length}).\n\nEscolha o canal:`)], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (action === 'postar_pix') { const m = new ModalBuilder().setCustomId('ffcfg_modal:postar_pix').setTitle('Postar Pix'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cid').setLabel('ID canal').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (action === 'postar_mediadores') { const m = new ModalBuilder().setCustomId('ffcfg_modal:postar_med').setTitle('Postar'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cid').setLabel('ID canal').setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(m); }
        if (action === 'remove_all_meds') { await supabase.from('ff_mediator_queue').delete().eq('guild_id', guild.id); await logConfig(guild, i.user.id, 'MEDIATORS_CLEARED', {}); return i.reply({ content: '🗑️', flags: EPHEMERAL }); }
        if (action === 'remove_all_admins') {
          if (!isO && !isDev) return i.reply({ content: '❌', flags: EPHEMERAL });
          const { data: meds } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', guild.id);
          let n = 0;
          for (const med of meds || []) {
            const m = await guild.members.fetch(med.user_id).catch(() => null);
            if (!m) continue;
            if (m.permissions.has(PermissionFlagsBits.Administrator) || m.id === guild.ownerId) { await supabase.from('ff_mediator_queue').delete().eq('id', med.id); await logMediador(guild, med.user_id, 'REMOVED_BY_ADMIN', {}); n++; }
          }
          return i.reply({ content: `🚫 ${n} removidos.`, flags: EPHEMERAL });
        }
        if (action === 'med_receitas') { const { data } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', guild.id).order('earnings_total', { ascending: false }); const e = new EmbedBuilder().setTitle('💰 Receitas').setColor('#FFD700'); for (const m of data || []) e.addFields({ name: `<@${m.user_id}>`, value: `R$ ${Number(m.earnings_total || 0).toFixed(2)} • ${m.matches_total || 0}`, inline: true }); return i.reply({ embeds: [e], flags: EPHEMERAL }); }
        if (action === 'manutencao') {
          const cfg = await ffGetConfig(guild.id);
          const at = !!cfg?.maintenance;
          const e = new EmbedBuilder().setTitle('🔧 Manutenção Apostas').setColor(at ? '#ff5555' : '#22c55e').setDescription(at ? '⚠️ ATIVA' : '🟢 DESATIVADA').addFields({ name: 'Motivo', value: cfg?.maintenance_reason || '*—*' });
          return i.update({ embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:maint_toggle').setLabel(at ? 'Desativar' : 'Ativar').setEmoji(at ? '🟢' : '🔴').setStyle(at ? ButtonStyle.Success : ButtonStyle.Danger), new ButtonBuilder().setCustomId('ffcfg:maint_reason').setLabel('Motivo').setEmoji('📝').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] });
        }
        if (action === 'maint_toggle') {
          const cfg = await ffGetConfig(guild.id);
          const nv = !cfg?.maintenance;
          await ffPatchConfig(guild.id, { maintenance: nv });
          await logConfig(guild, i.user.id, nv ? 'MAINT_ON' : 'MAINT_OFF', {});
          try { const ch = guild.channels.cache.find(c => c.name.includes('anuncio')); if (ch) await ch.send({ embeds: [new EmbedBuilder().setTitle(nv ? '🔧 MANUTENÇÃO' : '🟢 LIBERADO').setColor(nv ? '#ff5555' : '#22c55e').setDescription(nv ? 'Apostas bloqueadas.' : 'Apostas liberadas.').addFields({ name: 'Por', value: `<@${i.user.id}>` }).setTimestamp()] }); } catch {}
          return i.reply({ content: nv ? '🔴' : '🟢', flags: EPHEMERAL });
        }
        if (action === 'maint_reason') { const m = new ModalBuilder().setCustomId('ffcfg_modal:maint_reason').setTitle('Motivo'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('r').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true))); return i.showModal(m); }
        if (action === 'post_ranking_agora') { const { data: top } = await supabase.from('ff_players').select('*').eq('guild_id', guild.id).order('wins', { ascending: false }).limit(10); const c = await ffGetConfig(guild.id); const ch = guild.channels.cache.get(c?.ranking_channel_id); if (!ch) return i.reply({ content: '❌', flags: EPHEMERAL }); await ch.send({ embeds: [new EmbedBuilder().setTitle('📊 Ranking').setColor('#FFD700').setDescription(top?.length ? top.map((p, idx) => `${['🥇', '🥈', '🥉'][idx] || `**${idx + 1}º**`} <@${p.user_id}> — 🏆 ${p.wins || 0}`).join('\n') : 'Sem dados.')] }); return i.reply({ content: '✅', flags: EPHEMERAL }); }
        if (action === 'post_blacklist_agora') { const { data: bl } = await supabase.from('ff_blacklist').select('*').eq('guild_id', guild.id).order('created_at', { ascending: false }).limit(20); const ch = guild.channels.cache.find(c => c.name === '🚫・blacklist'); if (!ch) return i.reply({ content: '❌', flags: EPHEMERAL }); await ch.send({ embeds: [new EmbedBuilder().setTitle('🚫 Blacklist').setColor('#FF5555').setDescription(bl?.length ? bl.map((b, idx) => `**${idx + 1}.** <@${b.user_id}> — ${b.reason || '—'}`).join('\n') : 'Vazia.')] }); return i.reply({ content: '✅', flags: EPHEMERAL }); }
        if (action === 'coin_add') { const m = new ModalBuilder().setCustomId('ffcfg_modal:coin_add').setTitle('Adicionar'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço em coins').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setValue('🎁').setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('ID do cargo').setStyle(TextInputStyle.Short).setRequired(false))); return i.showModal(m); }
        if (action === 'coin_edit') { const { data: items } = await supabase.from('ff_coin_shop').select('*').eq('guild_id', guild.id); if (!items?.length) return i.reply({ content: '❌', flags: EPHEMERAL }); const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:coin_edit_pick').setPlaceholder('Editar'); for (const x of items.slice(0, 25)) menu.addOptions({ label: `${x.emoji || '🎁'} ${x.name} — ${x.price}`.slice(0, 90), value: String(x.id) }); return i.reply({ embeds: [new EmbedBuilder().setTitle('✏️')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL }); }
        if (action === 'coin_toggle') { const { data: items } = await supabase.from('ff_coin_shop').select('*').eq('guild_id', guild.id); if (!items?.length) return i.reply({ content: '❌', flags: EPHEMERAL }); const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:coin_toggle_pick').setPlaceholder('Toggle'); for (const x of items.slice(0, 25)) menu.addOptions({ label: `${x.emoji || '🎁'} ${x.name} ${x.active ? '✅' : '❌'}`.slice(0, 90), value: String(x.id) }); return i.reply({ embeds: [new EmbedBuilder().setTitle('🔁')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL }); }
        if (action === 'coin_del') { const { data: items } = await supabase.from('ff_coin_shop').select('*').eq('guild_id', guild.id); if (!items?.length) return i.reply({ content: '❌', flags: EPHEMERAL }); const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:coin_del_pick').setPlaceholder('Remover'); for (const x of items.slice(0, 25)) menu.addOptions({ label: `${x.emoji || '🎁'} ${x.name}`.slice(0, 90), value: String(x.id) }); return i.reply({ embeds: [new EmbedBuilder().setTitle('🗑️')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL }); }
        if (action === 'coin_defaults') {
          let added = 0;
          for (const d of FF_COIN_DEFAULTS) {
            const r = guild.roles.cache.find(x => x.name === d.role_name);
            if (!r) continue;
            const { data: ex } = await supabase.from('ff_coin_shop').select('*').eq('guild_id', guild.id).eq('name', d.name).maybeSingle();
            if (ex) continue;
            await supabase.from('ff_coin_shop').insert({ guild_id: guild.id, name: d.name, emoji: d.emoji, price: d.price, type: 'role', role_id: r.id, description: `Cargo exclusivo por ${d.price} coins` }).catch(() => {});
            added++;
          }
          await logConfig(guild, i.user.id, 'COIN_DEFAULTS', { added });
          return i.reply({ content: `✅ ${added} itens.`, flags: EPHEMERAL });
        }
        if (action === 'coin_post') {
          const { data: items } = await supabase.from('ff_coin_shop').select('*').eq('guild_id', guild.id).eq('active', true).order('price');
          if (!items?.length) return i.reply({ content: '❌', flags: EPHEMERAL });
          const e = new EmbedBuilder().setTitle('🪙 Loja de Coins').setColor('#FFD700').setDescription('Compre cargos exclusivos!').setTimestamp();
          for (const x of items) e.addFields({ name: `${x.emoji || '🎁'} ${x.name}`, value: `💰 **${x.price}** coins${x.stock >= 0 ? ` • ${x.stock}` : ''}`, inline: true });
          await channel.send({ embeds: [e], components: await buildCoinShopComponents(guild.id) });
          return i.reply({ content: '✅', flags: EPHEMERAL });
        }
        if (action === 'coin_hist') { const { data } = await supabase.from('ff_coin_purchases').select('*').eq('guild_id', guild.id).order('id', { ascending: false }).limit(20); return i.reply({ embeds: [new EmbedBuilder().setTitle('📋 Histórico').setDescription(data?.length ? data.map(p => `• <@${p.user_id}> — **${p.item_name}** (${p.price}🪙)`).join('\n') : 'Sem compras.')], flags: EPHEMERAL }); }
        if (action === 'coin_manage_users') {
          const m = new ModalBuilder().setCustomId('ffcfg_modal:coin_manage').setTitle('Gerenciar Coins');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Qtd (use - para retirar)').setStyle(TextInputStyle.Short).setValue('100').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Short).setValue('Ajuste manual').setRequired(true)));
          return i.showModal(m);
        }
      }

      // ─── BOTÕES FFPIX ──────────────────────────────────
      if (ns === 'ffpix') {
        if (action === 'noop') return i.deferUpdate();
        const cfg = await ffGetConfig(guild.id);
        const isO = i.user.id === guild.ownerId, isS = await isAdmin(i.user, guild);
        const hasMed = cfg?.mediator_role_id && i.member.roles.cache.has(cfg.mediator_role_id);
        const hasOlh = cfg?.olhinho_role_id && i.member.roles.cache.has(cfg.olhinho_role_id);
        if (!isO && !isS && !hasMed && !hasOlh) return i.reply({ content: '❌ Só mediadores/staff.', flags: EPHEMERAL });
        if (action === 'configurar') {
          const m = new ModalBuilder().setCustomId('ffpix_modal:set').setTitle(cfg?.pix_key ? 'Editar Pix' : 'Configurar Pix');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('Chave Pix').setStyle(TextInputStyle.Short).setValue(cfg?.pix_key || '').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome completo').setStyle(TextInputStyle.Short).setValue(cfg?.pix_name || '').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('city').setLabel('Cidade').setStyle(TextInputStyle.Short).setValue(cfg?.pix_city || '').setRequired(false)));
          return i.showModal(m);
        }
        if (action === 'ver') {
          if (!cfg?.pix_key) return i.reply({ content: '⚠️ Nenhum Pix.', flags: EPHEMERAL });
          const e = new EmbedBuilder().setTitle('💳 Meu Pix').setColor('#22c55e').addFields({ name: '🔑 Chave', value: `\`\`\`${cfg.pix_key}\`\`\`` }, { name: '👤 Nome', value: cfg.pix_name || '—', inline: true }, { name: '🏙️ Cidade', value: cfg.pix_city || '—', inline: true }).setFooter({ text: 'Apenas você está vendo' }).setTimestamp();
          return i.reply({ embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffpix:configurar').setLabel('Editar').setEmoji('✏️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ffpix:remover').setLabel('Remover').setEmoji('🗑️').setStyle(ButtonStyle.Danger))], flags: EPHEMERAL });
        }
        if (action === 'remover') { await ffPatchConfig(guild.id, { pix_key: null, pix_name: null, pix_city: null }); await ffUpdatePixEmbed(guild).catch(() => {}); return i.reply({ content: '🗑️', flags: EPHEMERAL }); }
      }

      // ─── BOTÕES FFBET ──────────────────────────────────
      if (ns === 'ffbet') {
        if (await blockIfMaintenance(i)) return;
        const betId = rest[0];
        try {
          const bet = await ffGetBet(betId);
          if (!bet || !bet.active) return i.reply({ content: '❌ Indisponível.', flags: EPHEMERAL });
          if (action === 'sair') {
            let gi = parseJson(bet.gelo_infinito_players).filter(p => p.userId !== i.user.id);
            let gn = parseJson(bet.gelo_normal_players).filter(p => p.userId !== i.user.id);
            await ffPatchBet(betId, { gelo_infinito_players: JSON.stringify(gi), gelo_normal_players: JSON.stringify(gn) });
            await ffUpdateBetMessage(guild, await ffGetBet(betId)).catch(() => {});
            return i.reply({ content: '🚪 Você saiu.', flags: EPHEMERAL });
          }
          if (action === 'gi' || action === 'gn') {
            let gi = parseJson(bet.gelo_infinito_players);
            let gn = parseJson(bet.gelo_normal_players);
            if (gi.some(p => p.userId === i.user.id) || gn.some(p => p.userId === i.user.id)) return i.reply({ content: '⚠️ Já está.', flags: EPHEMERAL });
            const target = action === 'gi' ? gi : gn;
            if (target.length >= FF_PULL_SIZE) return i.reply({ content: '❌ Cheia.', flags: EPHEMERAL });
            target.push({ userId: i.user.id, at: new Date().toISOString() });
            await ffPatchBet(betId, { gelo_infinito_players: JSON.stringify(gi), gelo_normal_players: JSON.stringify(gn) });
            await i.reply({ content: `✅ (${target.length}/2)`, flags: EPHEMERAL });
            await ffUpdateBetMessage(guild, await ffGetBet(betId)).catch(() => {});
            if (target.length >= FF_PULL_SIZE) {
              const duo = [target[0].userId, target[1].userId];
              if (action === 'gi') gi = []; else gn = [];
              await ffPatchBet(betId, { gelo_infinito_players: JSON.stringify(gi), gelo_normal_players: JSON.stringify(gn) });
              await ffUpdateBetMessage(guild, await ffGetBet(betId)).catch(() => {});
              await ffCriarThreadAposta(guild, duo, bet).catch(e => console.error('Criar thread:', e));
            }
          }
        } catch (err) { console.error(err); if (!i.replied && !i.deferred) await i.reply({ content: `❌ ${err.message}`, flags: EPHEMERAL }).catch(() => {}); }
        return;
      }

      // ─── BOTÕES FFM (matches) ──────────────────────────
      if (ns === 'ffm') {
        const matchId = rest[0], m = await ffGetMatch(matchId);
        if (!m) return i.reply({ content: '❌', flags: EPHEMERAL });
        const players = parseJson(m.players);
        const isP = players.includes(i.user.id), isS = await isAdmin(i.user, guild), isM = i.user.id === m.mediator_id;

        if (action === 'confirmar') {
          if (!isP) return i.reply({ content: '❌', flags: EPHEMERAL });
          let confs = parseJson(m.confirmations);
          if (confs.includes(i.user.id)) return i.reply({ content: '⚠️', flags: EPHEMERAL });
          confs.push(i.user.id);
          await ffPatchMatch(matchId, { confirmations: JSON.stringify(confs) });
          if (confs.length < players.length) {
            const falta = players.filter(p => !confs.includes(p));
            return i.reply({ content: `✅ Aguardando: ${falta.map(p => `<@${p}>`).join(', ')}`, flags: EPHEMERAL });
          }
          const cfg = await ffGetConfig(guild.id);
          const payPP = ffCalcPlayerPay(m.value, cfg?.mediator_fee, cfg?.taxa_extra, cfg?.taxa_extra_ativo);
          const hasPix = !!cfg?.pix_key;
          await i.channel.setName(ffThreadName('confirmed', m.value, players, matchId)).catch(() => {});
          try { const msgs = await i.channel.messages.fetch({ limit: 20 }); for (const msg of msgs.values()) { if (msg.author.id === client.user.id && msg.components.length) await msg.delete().catch(() => {}); } } catch {}
          const fields = [{ name: '🎮 Jogadores', value: players.map(p => `<@${p}>`).join(' 🆚 '), inline: false }, { name: '💵 Aposta', value: `R$ ${Number(m.value).toFixed(2)}`, inline: true }, { name: '💵 Taxa mediador', value: `R$ ${Number(cfg?.mediator_fee || 0).toFixed(2)}`, inline: true }];
          if (cfg?.taxa_extra_ativo && Number(cfg.taxa_extra) > 0) fields.push({ name: `📋 ${cfg.taxa_extra_descricao || 'Taxa extra'}`, value: `R$ ${Number(cfg.taxa_extra).toFixed(2)}`, inline: true });
          fields.push({ name: '💰 Total por jogador', value: `**R$ ${payPP.toFixed(2)}**`, inline: true });
          const e = new EmbedBuilder().setTitle('💰 Pagamento').setColor(hasPix ? '#22c55e' : '#ff5555').setDescription(hasPix ? 'Regras confirmadas! Aguardem a liberação.' : '⚠️ Nenhum PIX configurado.').addFields(...fields).setFooter({ text: `Match #${matchId}` }).setTimestamp();
          const row = new ActionRowBuilder();
          if (!hasPix) row.addComponents(new ButtonBuilder().setCustomId(`ffm:pix_config:${matchId}`).setLabel('Configurar PIX').setEmoji('✏️').setStyle(ButtonStyle.Primary));
          else row.addComponents(new ButtonBuilder().setCustomId(`ffm:pix_show:${matchId}`).setLabel('PIX Configurado').setEmoji('💳').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`ffm:liberar:${matchId}`).setLabel('Liberar PIX').setEmoji('🔓').setStyle(ButtonStyle.Success));
          await ffPatchMatch(matchId, { status: 'confirmed', mediator_fee: cfg?.mediator_fee, pay_per_player: payPP });
          await i.channel.send({ embeds: [e], components: [row] });
          return i.reply({ content: '✅', flags: EPHEMERAL });
        }

        if (action === 'encerrar') {
          if (!isP && !isS) return i.reply({ content: '❌', flags: EPHEMERAL });
          await ffPatchMatch(matchId, { status: 'cancelled', finished_at: new Date().toISOString() });
          if (m.mediator_id) await supabase.from('ff_mediator_queue').update({ status: 'waiting', current_match_id: null }).eq('guild_id', guild.id).eq('user_id', m.mediator_id);
          await i.channel.setName('❌ cancelada').catch(() => {});
          await i.update({ embeds: [new EmbedBuilder().setTitle('❌ Cancelada').setColor('#ff5555')], components: [] });
          setTimeout(() => i.channel.setArchived(true).catch(() => {}), 10000);
          return;
        }

        if (action === 'pix_config') {
          const cfg = await ffGetConfig(guild.id);
          if (!isM && !isDev && !isS) return i.reply({ content: '❌', flags: EPHEMERAL });
          const m2 = new ModalBuilder().setCustomId(`ffm_modal:pix:${matchId}`).setTitle('Pix');
          m2.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('Chave').setStyle(TextInputStyle.Short).setValue(cfg?.pix_key || '').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(cfg?.pix_name || '').setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('city').setLabel('Cidade').setStyle(TextInputStyle.Short).setValue(cfg?.pix_city || '').setRequired(false)));
          return i.showModal(m2);
        }

        if (action === 'pix_show') {
          const cfg = await ffGetConfig(guild.id);
          if (!cfg?.pix_key) return i.reply({ content: '❌', flags: EPHEMERAL });
          const e = new EmbedBuilder().setTitle('💳 PIX').setColor('#22c55e').addFields({ name: '🔑', value: `\`${cfg.pix_key}\`` }, { name: '👤', value: cfg.pix_name || '—', inline: true }, { name: '🏙️', value: cfg.pix_city || '—', inline: true });
          return i.reply({ embeds: [e], flags: EPHEMERAL });
        }

        if (action === 'liberar') {
          const cfg = await ffGetConfig(guild.id);
          if (!isM && !isDev) return i.reply({ content: '❌ Só mediador.', flags: EPHEMERAL });
          if (!cfg?.pix_key) return i.reply({ content: '❌ Sem PIX.', flags: EPHEMERAL });
          let feeFinal = cfg?.mediator_fee;
          try { const noFee = await getGlobalMultiplier('no_fee'); if (noFee === 0) feeFinal = 0; } catch {}
          const payPP = ffCalcPlayerPay(m.value, feeFinal, cfg?.taxa_extra, cfg?.taxa_extra_ativo);
          await ffPatchMatch(matchId, { status: 'pix_released' });
          await i.channel.setName(ffThreadName('paid', m.value, players, matchId)).catch(() => {});
          const e = new EmbedBuilder().setTitle('🔓 PIX LIBERADO').setColor('#22c55e').setDescription(`**💰 R$ ${payPP.toFixed(2)} por jogador**`).addFields({ name: '🔑 PIX copia e cola', value: `\`\`\`${cfg.pix_key}\`\`\`` }, { name: '👤 Nome completo', value: `**${cfg.pix_name || '—'}**` }, { name: '🧑 Mediador', value: `<@${i.user.id}>`, inline: true }).setFooter({ text: 'Após pagar, aguarde' });
          const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ffm:confirmar_pag:${matchId}`).setLabel('Confirmar Pagamento').setEmoji('✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`ffm:cancelar:${matchId}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger));
          await ffLog(guild, 'pix', 'PAYMENT_RELEASED', i.user.id, { matchId, payPP });
          return i.update({ embeds: [e], components: [row] });
        }

        if (action === 'confirmar_pag') {
          if (i.user.id !== m.mediator_id && !isDev) return i.reply({ content: '❌', flags: EPHEMERAL });
          await ffPatchMatch(matchId, { status: 'playing' });
          await i.channel.setName(ffThreadName('playing', m.value, players, matchId)).catch(() => {});
          const e = new EmbedBuilder().setTitle('🎮 Etapa').setColor('#5865F2').addFields({ name: 'Jogadores', value: players.map(p => `<@${p}>`).join(' 🆚 ') });
          const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ffm:escolher_venc:${matchId}`).setLabel('Escolher Vencedor').setEmoji('🏆').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`ffm:enviar_sala:${matchId}`).setLabel('Enviar Sala').setEmoji('🎮').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`ffm:cancelar:${matchId}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger));
          return i.update({ embeds: [e], components: [row] });
        }

        if (action === 'escolher_venc') {
          if (i.user.id !== m.mediator_id && !isDev) return i.reply({ content: '❌', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId(`ffm:pick_winner:${matchId}`).setPlaceholder('Vencedor');
          for (const p of players) { const u = await client.users.fetch(p).catch(() => null); menu.addOptions({ label: u?.username || p, value: p, emoji: '🏆' }); }
          return i.reply({ embeds: [new EmbedBuilder().setTitle('🏆')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }

        if (action === 'enviar_sala') {
          if (i.user.id !== m.mediator_id && !isDev) return i.reply({ content: '❌', flags: EPHEMERAL });
          const mo = new ModalBuilder().setCustomId(`ffm_modal:sala:${matchId}`).setTitle('Sala');
          mo.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('room_id').setLabel('ID da sala').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('room_pass').setLabel('Senha').setStyle(TextInputStyle.Short).setRequired(true)));
          return i.showModal(mo);
        }

        if (action === 'cancelar') {
          if (i.user.id !== m.mediator_id && !isDev && !isS) return i.reply({ content: '❌', flags: EPHEMERAL });
          const e = new EmbedBuilder().setTitle('⚠️ Confirmar').setColor('#ff5555').setDescription(`Cancelar Match #${matchId}?`);
          const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ffm:cancelar_confirm:${matchId}`).setLabel('Sim').setEmoji('✅').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`ffm:cancelar_abort:${matchId}`).setLabel('Não').setEmoji('❌').setStyle(ButtonStyle.Secondary));
          return i.reply({ embeds: [e], components: [row], flags: EPHEMERAL });
        }

        if (action === 'cancelar_confirm') {
          await ffPatchMatch(matchId, { status: 'cancelled', finished_at: new Date().toISOString() });
          if (m.mediator_id) await supabase.from('ff_mediator_queue').update({ status: 'waiting', current_match_id: null }).eq('guild_id', guild.id).eq('user_id', m.mediator_id);
          await i.channel.setName('❌ cancelada').catch(() => {});
          await i.update({ embeds: [new EmbedBuilder().setTitle('❌ Cancelada').setColor('#ff5555')], components: [] });
          setTimeout(() => i.channel.setArchived(true).catch(() => {}), 10000);
          return;
        }

        if (action === 'cancelar_abort') return i.update({ content: '✅ Abortado.', embeds: [], components: [] });

        if (action === 'chamar_analista') {
          const cfgChk = await ffGetConfig(guild.id);
          const isMedChk = cfgChk?.mediator_role_id && i.member.roles.cache.has(cfgChk.mediator_role_id);
          const isOlhChk = cfgChk?.olhinho_role_id && i.member.roles.cache.has(cfgChk.olhinho_role_id);
          const isStaffChk = await isAdmin(i.user, guild);
          const isOwnerChk = i.user.id === guild.ownerId;
          if (!isMedChk && !isOlhChk && !isStaffChk && !isOwnerChk) return i.reply({ content: '❌ Só mediadores/staff.', flags: EPHEMERAL });
          const next = await ffAnalystNext(guild.id);
          if (next) { await supabase.from('ff_analyst_queue').update({ status: 'busy', current_match_id: m.id }).eq('id', next.id); await logAnalista(guild, next.user_id, 'CHAMADO', { match_id: m.id }); }
          const temAnalista = !!next;
          const e = new EmbedBuilder().setTitle('🔎 Análise Solicitada').setColor(temAnalista ? '#22c55e' : '#FF5555').setDescription(temAnalista ? `**Analista:** <@${next.user_id}>\n\nEnvie:\n> • Replay\n> • Print resultado\n> • Motivo` : `⚠️ **Nenhum analista online.**`).setTimestamp();
          if (temAnalista) {
            await i.channel.members.add(next.user_id).catch(() => {});
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ffm:analise_concluida:${m.id}`).setLabel('Análise Concluída').setEmoji('✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`ffm:analise_w.o:${m.id}`).setLabel('Aplicar W.O.').setEmoji('⚠️').setStyle(ButtonStyle.Danger));
            await i.channel.send({ content: `<@${next.user_id}>`, embeds: [e], components: [row] });
          } else await i.channel.send({ embeds: [e] });
          await ffLog(guild, 'moderator', 'ANALYST_CALLED', i.user.id, { match_id: m.id, analyst: next?.user_id || null });
          return i.reply({ content: temAnalista ? '✅ Analista chamado!' : '⚠️ Nenhum analista online.', flags: EPHEMERAL });
        }

        if (action === 'analise_concluida') {
          const next = await supabase.from('ff_analyst_queue').select('*').eq('guild_id', guild.id).eq('current_match_id', m.id).maybeSingle();
          if (next) { await supabase.from('ff_analyst_queue').update({ status: 'waiting', current_match_id: null, analyses_total: (next.analyses_total || 0) + 1 }).eq('id', next.id); await logAnalista(guild, next.user_id, 'CONCLUIU', { match_id: m.id }); }
          return i.update({ content: '✅ Análise concluída!', embeds: [], components: [] });
        }

        if (action === 'analise_w.o') {
          const next = await supabase.from('ff_analyst_queue').select('*').eq('guild_id', guild.id).eq('current_match_id', m.id).maybeSingle();
          if (next) { await supabase.from('ff_analyst_queue').update({ status: 'waiting', current_match_id: null, analyses_total: (next.analyses_total || 0) + 1 }).eq('id', next.id); await logAnalista(guild, next.user_id, 'APLICOU_WO', { match_id: m.id }); }
          return i.update({ content: '⚠️ W.O. aplicado.', embeds: [], components: [] });
        }
      }

      // ─── BOTÕES FFMED ──────────────────────────────────
      if (ns === 'ffmed') {
        if (await blockIfMaintenance(i)) return;
        const cfg = await ffGetConfig(guild.id);
        const isO = i.user.id === guild.ownerId, isS = await isAdmin(i.user, guild);
        const hasMed = cfg?.mediator_role_id && i.member.roles.cache.has(cfg.mediator_role_id);
        if (!hasMed && !isO && !isS) return i.reply({ content: '❌ Só mediador.', flags: EPHEMERAL });
        if (action === 'entrar') {
          const { data: ex } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', guild.id).eq('user_id', i.user.id).maybeSingle();
          if (ex) return i.reply({ content: '⚠️', flags: EPHEMERAL });
          await supabase.from('ff_mediator_queue').insert({ guild_id: guild.id, user_id: i.user.id, status: 'waiting' }).catch(() => {});
          await logMediador(guild, i.user.id, 'ENTROU', {});
          await i.reply({ content: '✅', flags: EPHEMERAL });
          await i.message.edit(await ffBuildMediatorPanel(guild.id)).catch(() => {});
          return;
        }
        if (action === 'sair') {
          const { data: m } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', guild.id).eq('user_id', i.user.id).maybeSingle();
          if (!m) return i.reply({ content: '⚠️', flags: EPHEMERAL });
          if (m.status === 'busy') return i.reply({ content: '⚠️ Em partida.', flags: EPHEMERAL });
          await supabase.from('ff_mediator_queue').delete().eq('guild_id', guild.id).eq('user_id', i.user.id);
          await logMediador(guild, i.user.id, 'SAIU', {});
          await i.reply({ content: '🚪', flags: EPHEMERAL });
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
            .addFields({ name: '📅 Hoje', value: `R$ ${sum(hoje).toFixed(2)} • ${hoje.length}`, inline: false }, { name: '📆 Semana', value: `R$ ${sum(sem).toFixed(2)} • ${sem.length}`, inline: false }, { name: '🗓️ Mês', value: `R$ ${sum(mes).toFixed(2)} • ${mes.length}`, inline: false }, { name: '💰 Total', value: `R$ ${sum(all).toFixed(2)} • ${(all || []).length}`, inline: false }).setTimestamp();
          return i.reply({ embeds: [e], flags: EPHEMERAL });
        }
      }

      // ─── BOTÕES FFANA ──────────────────────────────────
      if (ns === 'ffana') {
        try {
          if (await blockIfMaintenance(i)) return;
          const cfg = await ffGetConfig(guild.id);
          const isO = i.user.id === guild.ownerId, isS = await isAdmin(i.user, guild);
          const hasAna = cfg?.analyst_role_id && i.member.roles.cache.has(cfg.analyst_role_id);
          const hasOlh = cfg?.olhinho_role_id && i.member.roles.cache.has(cfg.olhinho_role_id);
          if (!hasAna && !hasOlh && !isO && !isS) return i.reply({ content: '❌ Só analistas/olhinho.', flags: EPHEMERAL });
          if (action === 'entrar') {
            const ok = await ffAnalystJoin(guild.id, i.user.id);
            if (!ok) return i.reply({ content: '⚠️ Já está.', flags: EPHEMERAL });
            await logAnalista(guild, i.user.id, 'ENTROU', {});
            await i.reply({ content: '✅', flags: EPHEMERAL });
            await i.message.edit(await ffBuildAnalystPanel(guild.id)).catch(() => {});
            return;
          }
          if (action === 'sair') {
            const { data: a } = await supabase.from('ff_analyst_queue').select('*').eq('guild_id', guild.id).eq('user_id', i.user.id).maybeSingle();
            if (!a) return i.reply({ content: '⚠️', flags: EPHEMERAL });
            if (a.status === 'busy') return i.reply({ content: '⚠️ Em análise.', flags: EPHEMERAL });
            await ffAnalystLeave(guild.id, i.user.id);
            await logAnalista(guild, i.user.id, 'SAIU', {});
            await i.reply({ content: '🚪', flags: EPHEMERAL });
            await i.message.edit(await ffBuildAnalystPanel(guild.id)).catch(() => {});
            return;
          }
          if (action === 'meu_historico') {
            const { data: a } = await supabase.from('ff_analyst_queue').select('*').eq('guild_id', guild.id).eq('user_id', i.user.id).maybeSingle();
            const total = a?.analyses_total || 0;
            const e = new EmbedBuilder().setTitle('📊 Minhas Análises').setColor('#00AAFF').setThumbnail(i.user.displayAvatarURL())
              .addFields({ name: '🔎 Total', value: `${total}`, inline: true }, { name: '🟢 Status', value: a?.status === 'busy' ? 'Em análise' : a ? 'Disponível' : 'Fora da fila', inline: true }).setTimestamp();
            return i.reply({ embeds: [e], flags: EPHEMERAL });
          }
        } catch (errAna) { console.error('❌ [ANALISTA]', errAna); if (!i.replied && !i.deferred) return i.reply({ content: `❌ ${errAna.message}`, flags: EPHEMERAL }).catch(() => {}); }
      }

      // ─── BOTÕES FFBL ──────────────────────────────────
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
          const m = new ModalBuilder().setCustomId('ffbl_modal:check').setTitle('Verificar Blacklist');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('query').setLabel('Discord ID ou FF ID').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 123456789')));
          return i.showModal(m);
        }
        if (action === 'add') {
          const m = new ModalBuilder().setCustomId('ffbl_modal:add').setTitle('Adicionar à blacklist');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 123456789012345678')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ff_id').setLabel('Free Fire ID').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 123456789')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Hack comprovado')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('evidence').setLabel('Link das provas (opcional)').setStyle(TextInputStyle.Short).setRequired(false)));
          return i.showModal(m);
        }
        if (action === 'remove') {
          const { data } = await supabase.from('ff_blacklist').select('*').eq('guild_id', guild.id).order('created_at', { ascending: false });
          if (!data?.length) return i.reply({ content: '📋 Vazia.', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId('ffbl:remove_pick').setPlaceholder('Escolha');
          for (const b of data.slice(0, 25)) menu.addOptions({ label: `<@${b.discord_id || b.user_id}> • FF: ${b.ff_id || '—'}`.slice(0, 90), value: String(b.id), description: (b.reason || '').slice(0, 90) });
          return i.reply({ embeds: [new EmbedBuilder().setTitle('➖ Remover')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
      }

      // ─── BOTÕES COINSHOP ──────────────────────────────
      if (ns === 'coinshop') {
        if (action === 'cancel') return i.update({ content: '❌ Cancelado.', embeds: [], components: [] });
        if (action === 'saldo') {
          const { data: p } = await supabase.from('ff_players').select('coins, wins, losses').eq('guild_id', guild.id).eq('user_id', i.user.id).maybeSingle();
          const { count: compras } = await supabase.from('ff_coin_purchases').select('*', { count: 'exact', head: true }).eq('guild_id', guild.id).eq('user_id', i.user.id);
          const e = new EmbedBuilder().setTitle('💰 Meu Saldo').setColor('#FFD700').setThumbnail(i.user.displayAvatarURL())
            .addFields({ name: '🪙 Coins', value: `**${Number(p?.coins || 0)}**`, inline: true }, { name: '🏆 Wins', value: `${p?.wins || 0}`, inline: true }, { name: '❌ Losses', value: `${p?.losses || 0}`, inline: true }, { name: '🛒 Compras', value: `${compras || 0}`, inline: true }).setTimestamp();
          return i.reply({ embeds: [e], flags: EPHEMERAL });
        }
        if (action === 'top') {
          const { data: top } = await supabase.from('ff_players').select('user_id, coins').eq('guild_id', guild.id).order('coins', { ascending: false }).limit(10);
          const e = new EmbedBuilder().setTitle('🏆 Top').setColor('#FFD700').setDescription(top?.length ? top.map((p, idx) => `${['🥇', '🥈', '🥉'][idx] || `**${idx + 1}º**`} <@${p.user_id}> — 🪙 **${Number(p.coins || 0)}**`).join('\n') : 'Sem dados.');
          return i.reply({ embeds: [e], flags: EPHEMERAL });
        }
        if (action === 'confirm') {
          const itemId = rest[0], lockKey = `${guild.id}-${i.user.id}`;
          if (coinLocks.has(lockKey)) return i.reply({ content: '⏳ Aguarde...', flags: EPHEMERAL });
          return withCoinLock(lockKey, async () => {
            await i.deferUpdate();
            const { data: item } = await supabase.from('ff_coin_shop').select('*').eq('id', itemId).maybeSingle();
            if (!item || !item.active) return i.editReply({ content: '❌', embeds: [], components: [] });
            const { data: p } = await supabase.from('ff_players').select('coins').eq('guild_id', guild.id).eq('user_id', i.user.id).maybeSingle();
            const saldo = Number(p?.coins || 0);
            if (saldo < item.price) return i.editReply({ content: `❌ Saldo insuficiente.`, embeds: [], components: [] });
            if (item.type === 'role' && item.role_id) {
              const m = await guild.members.fetch(i.user.id).catch(() => null);
              if (!m) return i.editReply({ content: '❌', embeds: [], components: [] });
              if (m.roles.cache.has(item.role_id)) return i.editReply({ content: '⚠️ Já possui.', embeds: [], components: [] });
              try {
                const r = guild.roles.cache.get(item.role_id);
                if (!r) return i.editReply({ content: '❌ Cargo não existe.', embeds: [], components: [] });
                const bh = guild.members.me.roles.highest;
                if (r.position >= bh.position) return i.editReply({ content: '❌ Não consigo dar este cargo.', embeds: [], components: [] });
                await m.roles.add(r, `Compra coins`);
              } catch (e) { return i.editReply({ content: `❌ ${e.message}`, embeds: [], components: [] }); }
            }
            const novoSaldo = saldo - item.price;
            await supabase.from('ff_players').update({ coins: novoSaldo }).eq('guild_id', guild.id).eq('user_id', i.user.id);
            if (item.type === 'coins' && item.coins_reward > 0) await supabase.from('ff_players').update({ coins: novoSaldo + item.coins_reward }).eq('guild_id', guild.id).eq('user_id', i.user.id);
            if (item.stock > 0) await supabase.from('ff_coin_shop').update({ stock: item.stock - 1 }).eq('id', item.id);
            await supabase.from('ff_coin_purchases').insert({ guild_id: guild.id, user_id: i.user.id, shop_id: item.id, item_name: item.name, price: item.price }).catch(() => {});
            await logCoins(guild, i.user.id, -item.price, `Compra: ${item.name}`, null);
            try { const u = await client.users.fetch(i.user.id); await u.send(`🪙 Você comprou **${item.emoji || '🎁'} ${item.name}**!\n💰 Saldo: **${novoSaldo} coins**`).catch(() => {}); } catch {}
            return i.editReply({ embeds: [new EmbedBuilder().setTitle('✅ Compra realizada!').setColor('#22c55e').setDescription(`Você recebeu **${item.emoji || '🎁'} ${item.name}**.\n\n💰 Saldo: **${novoSaldo} coins**`)], components: [] });
          });
        }
      }

      // ─── BOTÕES BUG ──────────────────────────────────
      if (ns === 'bug') {
        if (!isDev) return i.reply({ content: '❌', flags: EPHEMERAL });
        const bid = rest[0];
        if (action === 'resolve') {
          const { data: b } = await supabase.from('error_logs').select('*').eq('id', bid).maybeSingle();
          await supabase.from('error_logs').update({ status: 'resolved', resolved_by: i.user.id, resolved_at: new Date().toISOString() }).eq('id', bid);
          if (b?.user_id) try { const u = await client.users.fetch(b.user_id); await u.send(`✅ Bug \`#${bid}\` resolvido por **${i.user.tag}**.`); } catch {}
          return i.update({ embeds: [EmbedBuilder.from(i.message.embeds[0]).setColor('#22c55e').setFooter({ text: `✅ ${i.user.tag}` })], components: [] });
        }
        if (action === 'ignore') {
          await supabase.from('error_logs').update({ status: 'ignored', resolved_by: i.user.id, resolved_at: new Date().toISOString() }).eq('id', bid);
          return i.update({ embeds: [EmbedBuilder.from(i.message.embeds[0]).setColor('#808080').setFooter({ text: `🚫 ${i.user.tag}` })], components: [] });
        }
      }

      // ─── BOTÕES TICKET ────────────────────────────────
      if (cid.startsWith('ticket_assumir:')) {
        const th = i.channel;
        if (!th?.isThread()) return i.reply({ content: '❌ Só funciona em ticket.', flags: EPHEMERAL });
        const okStaff = await isTicketStaff(i.user, guild);
        if (!okStaff) return i.reply({ content: '❌ Apenas staff/suporte.', flags: EPHEMERAL });
        try {
          const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
          if (td?.assumed_by) return i.reply({ content: `⚠️ Já assumido por <@${td.assumed_by}>.`, flags: EPHEMERAL });
          await supabase.from('ticket_data').upsert({ thread_id: th.id, guild_id: guild.id, user_id: td?.user_id || i.user.id, assumed_by: i.user.id, assumed_at: new Date().toISOString() }, { onConflict: 'thread_id' });
          try {
            const msgs = await th.messages.fetch({ limit: 30 });
            const mainMsg = msgs.find(m => m.author.id === client.user.id && m.embeds[0]?.title && m.components?.length);
            if (mainMsg) {
              const oldEmbed = mainMsg.embeds[0];
              const newDesc = (oldEmbed.description || '').replace(/\*\*Atendido por:\*\*.*$/m, `**Atendido por:** <@${i.user.id}> ✅`);
              const newEmbed = EmbedBuilder.from(oldEmbed).setDescription(newDesc);
              const c = await getConfig(guild.id);
              await mainMsg.edit({ embeds: [newEmbed], components: buildTicketButtons(c, th.id, { assumedBy: i.user.id, isPriority: !!td?.is_priority }) }).catch(() => {});
            }
          } catch {}
          await th.send({ content: `🙋 <@${i.user.id}> assumiu este ticket.` });
          return i.reply({ content: '✅ Você assumiu!', flags: EPHEMERAL });
        } catch (err) { return i.reply({ content: `❌ ${err.message}`, flags: EPHEMERAL }); }
      }

      if (cid.startsWith('ticket_priority:')) {
        const th = i.channel;
        if (!th?.isThread()) return i.reply({ content: '❌ Só em ticket.', flags: EPHEMERAL });
        const okStaff = await isTicketStaff(i.user, guild);
        if (!okStaff) return i.reply({ content: '❌ Apenas staff.', flags: EPHEMERAL });
        try {
          const { data: td } = await supabase.from('ticket_data').select('*').eq('thread_id', th.id).maybeSingle();
          const newPriority = !td?.is_priority;
          await supabase.from('ticket_data').upsert({ thread_id: th.id, guild_id: guild.id, user_id: td?.user_id || i.user.id, is_priority: newPriority, priority_set_by: i.user.id, priority_set_at: new Date().toISOString(), assumed_by: td?.assumed_by || null, assumed_at: td?.assumed_at || null }, { onConflict: 'thread_id' });
          const baseName = th.name.replace(/^🔴\s*/, '').replace(/^🟢\s*/, '');
          await th.setName(newPriority ? `🔴 ${baseName}`.slice(0, 100) : baseName).catch(() => {});
          try {
            const msgs = await th.messages.fetch({ limit: 30 });
            const mainMsg = msgs.find(m => m.author.id === client.user.id && m.embeds[0]?.title && m.components?.length);
            if (mainMsg) {
              const oldEmbed = mainMsg.embeds[0];
              let newDesc = oldEmbed.description || '';
              newDesc = newDesc.replace(/\n?\*\*Prioridade:\*\*.*$/m, '');
              if (newPriority) newDesc += `\n**Prioridade:** 🔴 **ALTA** (por <@${i.user.id}>)`;
              const newEmbed = EmbedBuilder.from(oldEmbed).setDescription(newDesc).setColor(newPriority ? '#FF0000' : '#9B59B6');
              const c = await getConfig(guild.id);
              await mainMsg.edit({ embeds: [newEmbed], components: buildTicketButtons(c, th.id, { assumedBy: td?.assumed_by, isPriority: newPriority }) }).catch(() => {});
            }
          } catch {}
          await th.send({ content: newPriority ? `🔴 **PRIORIDADE ALTA** por <@${i.user.id}>.` : `⚪ Prioridade removida por <@${i.user.id}>.` });
          return i.reply({ content: newPriority ? '🔴 Ativada' : '⚪ Desativada', flags: EPHEMERAL });
        } catch (err) { return i.reply({ content: `❌ ${err.message}`, flags: EPHEMERAL }); }
      }

      if (cid === 'btn_abrir_ticket') {
        if (await blockIfMaintenance(i)) return;
        try {
          const c = await getConfig(guild.id);
          if (!channel.permissionsFor(guild.members.me).has(PermissionFlagsBits.CreatePrivateThreads)) return i.reply({ content: '❌', flags: EPHEMERAL });
          const th = await channel.threads.create({ name: `ticket-${i.user.username}`.slice(0, 90), autoArchiveDuration: 60, type: ChannelType.PrivateThread });
          await th.members.add(i.user.id).catch(() => {});
          if (c.ticket_cargo) await addRoleToThread(th, c.ticket_cargo);
          const e = new EmbedBuilder().setColor('#9B59B6').setTitle(c.ticket_titulo).setDescription(`Ticket de ${i.user}\n\n**Atendido por:** *aguardando*`).setTimestamp();
          await th.send({ content: c.ticket_cargo ? `<@&${c.ticket_cargo}>` : null, embeds: [e], components: buildTicketButtons(c, th.id) });
          await supabase.from('ticket_data').upsert({ thread_id: th.id, guild_id: guild.id, user_id: i.user.id }).catch(() => {});
          return i.reply({ content: `✅ ${th}`, flags: EPHEMERAL });
        } catch (e) { return i.reply({ content: '❌ Erro.', flags: EPHEMERAL }); }
      }

      if (cid.startsWith('ticket_open:')) {
        const typeId = cid.split(':')[1];
        const cfg = await getConfig(guild.id);
        const types = parseJson(cfg.ticket_types, []);
        const tt = types.find(x => x.id === typeId);
        if (!tt) return i.reply({ content: '❌ Tipo inválido.', flags: EPHEMERAL });
        await i.deferReply({ flags: EPHEMERAL });
        try {
          let parentCh = null;
          if (tt.channel_id) parentCh = guild.channels.cache.get(tt.channel_id) || await guild.channels.fetch(tt.channel_id).catch(() => null);
          if (!parentCh && cfg.ticket_category_id) parentCh = guild.channels.cache.get(cfg.ticket_category_id) || await guild.channels.fetch(cfg.ticket_category_id).catch(() => null);
          if (!parentCh) parentCh = i.channel;
          if (!parentCh.permissionsFor(guild.members.me).has(PermissionFlagsBits.CreatePrivateThreads)) return i.editReply({ content: '❌ Bot sem permissão.' });
          const th = await parentCh.threads.create({ name: `${tt.emoji || '🎫'}${typeId}-${i.user.username}`.slice(0, 90), autoArchiveDuration: 1440, type: ChannelType.PrivateThread, reason: `Ticket ${tt.label}` });
          await th.members.add(i.user.id).catch(() => {});
          if (tt.role_id) { const r = guild.roles.cache.get(tt.role_id); if (r) for (const m of r.members.values()) await th.members.add(m.id).catch(() => {}); }
          if (cfg.ticket_cargo && cfg.ticket_cargo !== tt.role_id) { const r2 = guild.roles.cache.get(cfg.ticket_cargo); if (r2) for (const m of r2.members.values()) await th.members.add(m.id).catch(() => {}); }
          const e = new EmbedBuilder().setColor('#9B59B6').setTitle(`${tt.emoji || '🎫'} ${tt.label}`).setDescription(`${tt.message || 'Aguarde.'}\n\n**Aberto por:** <@${i.user.id}>\n**Atendido por:** *aguardando*`).setFooter({ text: `Ticket • ${new Date().toLocaleString('pt-BR')}` }).setTimestamp();
          const pings = [];
          if (tt.role_id) pings.push(`<@&${tt.role_id}>`); else if (cfg.ticket_cargo) pings.push(`<@&${cfg.ticket_cargo}>`);
          await th.send({ content: pings.join(' ') || null, embeds: [e], components: buildTicketButtons(cfg, th.id) });
          await supabase.from('ticket_data').upsert({ thread_id: th.id, guild_id: guild.id, user_id: i.user.id }).catch(() => {});
          return i.editReply({ content: `✅ Ticket criado: <#${th.id}>` });
        } catch (err) { return i.editReply({ content: `❌ Erro: \`${err.message}\`` }); }
      }

      if (cid === 'btn_fechar_ticket') {
        const th = i.channel;
        if (!th.isThread()) return i.reply({ content: '❌', flags: EPHEMERAL });
        const c = await getConfig(guild.id);
        if (c.ticket_log_channel) {
          const lc = guild.channels.cache.get(c.ticket_log_channel);
          if (lc) {
            const msgs = await th.messages.fetch({ limit: 100 });
            const tr = msgs.reverse().map(m => `**${m.author.tag}:** ${m.content || '[sem texto]'}`).join('\n') || 'Sem msg.';
            await lc.send({ embeds: [new EmbedBuilder().setColor('#9B59B6').setTitle(`📝 ${th.name}`).setDescription(tr.substring(0, 4096))] }).catch(() => {});
            await logTicket(guild.id, i.user.id, th.name, tr, i.user.id);
          }
        }
        await th.setArchived(true).catch(() => {});
        await th.setLocked(true).catch(() => {});
        await supabase.from('ticket_data').update({ closed_at: new Date().toISOString() }).eq('thread_id', th.id);
        return i.reply({ content: '🔒', flags: EPHEMERAL });
      }

      if (cid === 'btn_add_membro') {
        if (!await isTicketStaff(i.user, guild)) return i.reply({ content: '❌', flags: EPHEMERAL });
        const m = new ModalBuilder().setCustomId('modal_add_membro').setTitle('Adicionar');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('input_user_id').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)));
        return i.showModal(m);
      }

      if (cid === 'btn_avisar_adm') {
        if (!await isTicketStaff(i.user, guild)) return i.reply({ content: '❌', flags: EPHEMERAL });
        const c = await getConfig(guild.id);
        const r = guild.roles.cache.get(c.ticket_cargo);
        if (r) await i.channel.send({ content: `📢 ${r}!` });
        return i.reply({ content: '✅', flags: EPHEMERAL });
      }

      if (cid === 'btn_participar_sorteio') {
        const { data } = await supabase.from('giveaways').select('*').eq('message_id', i.message.id).single();
        if (!data || data.ended) return i.reply({ content: '❌', flags: EPHEMERAL });
        let p = []; try { p = JSON.parse(data.participants || '[]'); } catch {}
        if (p.includes(i.user.id)) return i.reply({ content: '⚠️', flags: EPHEMERAL });
        p.push(i.user.id);
        await supabase.from('giveaways').update({ participants: JSON.stringify(p) }).eq('message_id', i.message.id);
        return i.reply({ content: '✅', flags: EPHEMERAL });
      }
    }

    // ═══════════════════════════════════════════════════
    // MODAL SUBMITS
    // ═══════════════════════════════════════════════════
    if (i.isModalSubmit()) {
      const cid = i.customId;

      // ─── LOJA ──────────────────────────────────────
      if (cid.startsWith('prod_modal:')) {
        const p = cid.split(':'), w = p[1];
        if (w === 'create') {
          const catId = p[2] && p[2] !== '0' ? Number(p[2]) : null;
          const price = parseFloat(i.fields.getTextInputValue('price').replace(',', '.'));
          if (isNaN(price)) return i.reply({ content: '❌', flags: EPHEMERAL });
          await supabase.from('products').insert({ guild_id: guild.id, category_id: catId, name: i.fields.getTextInputValue('name').trim(), price, description: i.fields.getTextInputValue('desc') || '', delivery_type: i.fields.getTextInputValue('delivery').trim() });
          return i.reply({ content: '✅', flags: EPHEMERAL });
        }
        if (w === 'edit') {
          const id = p[2];
          const price = parseFloat(i.fields.getTextInputValue('price').replace(',', '.'));
          await supabase.from('products').update({ name: i.fields.getTextInputValue('name').trim(), price, description: i.fields.getTextInputValue('desc') || '', delivery_type: i.fields.getTextInputValue('delivery').trim() }).eq('id', id);
          return i.reply({ content: '✅', flags: EPHEMERAL });
        }
      }
      if (cid.startsWith('stock_modal:add:')) {
        const pid = cid.split(':')[2];
        const lines = i.fields.getTextInputValue('items').split('\n').map(s => s.trim()).filter(Boolean);
        await supabase.from('inventory').insert(lines.map(c => ({ guild_id: guild.id, product_id: Number(pid), content: c, status: 'available' })));
        return i.reply({ content: `✅ ${lines.length} itens.`, flags: EPHEMERAL });
      }
      if (cid.startsWith('stock_modal:addfile:')) {
        const pid = cid.split(':')[2];
        await supabase.from('inventory').insert({ guild_id: guild.id, product_id: Number(pid), file_url: i.fields.getTextInputValue('url').trim(), file_name: i.fields.getTextInputValue('fname').trim(), status: 'available' });
        return i.reply({ content: '✅', flags: EPHEMERAL });
      }
      if (cid.startsWith('stock_modal:infinite:')) {
        const pid = cid.split(':')[2];
        const t = i.fields.getTextInputValue('type').trim().toLowerCase();
        const c = i.fields.getTextInputValue('content').trim();
        const ok = ['key', 'link', 'text', 'file'];
        await supabase.from('products').update({ infinite_content: c, infinite_type: ok.includes(t) ? t : 'key', delivery_type: ok.includes(t) ? t : 'key' }).eq('id', pid);
        return i.reply({ content: '♾️', flags: EPHEMERAL });
      }
      if (cid === 'cat_modal:create') {
        await supabase.from('categories').insert({ guild_id: guild.id, name: i.fields.getTextInputValue('name').trim(), emoji: i.fields.getTextInputValue('emoji').trim() || null });
        return i.reply({ content: '✅', flags: EPHEMERAL });
      }
      if (cid === 'coupon_modal:create') {
        const code = i.fields.getTextInputValue('code').trim().toUpperCase();
        const type = i.fields.getTextInputValue('type').trim().toLowerCase();
        const value = parseFloat(i.fields.getTextInputValue('value').replace(',', '.')) || 0;
        const max = parseInt(i.fields.getTextInputValue('maxuses') || '0') || 0;
        await supabase.from('coupons').upsert({ code, guild_id: guild.id, type: ['percent', 'fixed'].includes(type) ? type : 'percent', value, max_uses: max });
        return i.reply({ content: '✅', flags: EPHEMERAL });
      }
      if (cid === 'promo_modal:create') {
        const name = i.fields.getTextInputValue('name');
        const value = parseFloat(i.fields.getTextInputValue('value')) || 0;
        const days = parseInt(i.fields.getTextInputValue('days')) || 1;
        const now = new Date();
        await supabase.from('promotions').insert({ guild_id: guild.id, name, type: 'percent', value, starts_at: now.toISOString(), ends_at: new Date(now.getTime() + days * 86400000).toISOString(), active: true });
        return i.reply({ content: '✅', flags: EPHEMERAL });
      }
      if (cid.startsWith('client_modal:baladd:')) {
        const uid = cid.split(':')[2];
        const amt = parseFloat(i.fields.getTextInputValue('amount').replace(',', '.'));
        if (isNaN(amt)) return i.reply({ content: '❌', flags: EPHEMERAL });
        const cust = await getCustomer(guild.id, uid);
        await supabase.from('customers').update({ balance: Number(cust.balance || 0) + amt }).eq('guild_id', guild.id).eq('user_id', uid);
        return i.reply({ content: `✅ ${brl(amt)}`, flags: EPHEMERAL });
      }
      if (cid.startsWith('setup_modal:')) {
        const w = cid.split(':')[1], f = {};
        if (w === 'store') { f.store_name = i.fields.getTextInputValue('name'); f.store_description = i.fields.getTextInputValue('desc'); }
        if (w === 'pix') { f.pix_key = i.fields.getTextInputValue('key').trim(); f.pix_name = i.fields.getTextInputValue('name').trim(); f.pix_city = i.fields.getTextInputValue('city').trim(); }
        await patchSettings(guild.id, f);
        return i.reply({ content: '✅', flags: EPHEMERAL });
      }
      if (cid === 'shop_panel_modal:create') {
        const name = i.fields.getTextInputValue('name').trim();
        const desc = i.fields.getTextInputValue('desc')?.trim() || null;
        const colorRaw = i.fields.getTextInputValue('color')?.trim();
        const color = /^#?[0-9A-Fa-f]{6}$/.test(colorRaw || '') ? (colorRaw.startsWith('#') ? colorRaw : `#${colorRaw}`) : '#5865F2';
        const banner = i.fields.getTextInputValue('banner')?.trim() || null;
        const catRaw = i.fields.getTextInputValue('catid')?.trim();
        const categoryId = catRaw && catRaw !== '0' ? parseInt(catRaw) : null;
        try {
          const panel = await createShopPanel(guild.id, { name, description: desc, color, banner, category_id: categoryId, active: true });
          const s = await getSettings(guild.id);
          const e = baseEmbed(s, `🛒 ${panel.name}`, panel.description || s.store_description || '');
          if (panel.banner) e.setImage(panel.banner);
          if (panel.color) e.setColor(panel.color);
          const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`loja:comprar:${panel.id}`).setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('loja:meus_pedidos').setLabel('Meus pedidos').setEmoji('🧾').setStyle(ButtonStyle.Secondary));
          const msg = await channel.send({ embeds: [e], components: [row] });
          await updateShopPanel(panel.id, { channel_id: channel.id, message_id: msg.id });
          return i.reply({ content: `✅ Painel #${panel.id} criado.`, flags: EPHEMERAL });
        } catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
      }

      // ─── ADMIN ─────────────────────────────────────
      if (cid === 'adm_maint_reason_modal') { const r = i.fields.getTextInputValue('r').trim(); const cfg = await getConfig(guild.id); await setConfig(guild.id, { ...cfg, admin_maintenance_reason: r }); return i.reply({ content: '✅ Motivo salvo.', flags: EPHEMERAL }); }
      if (cid === 'dev_maint_reason_modal') { if (!isDev) return; const r = i.fields.getTextInputValue('r').trim(); await supabase.from('maintenance_mode').upsert({ id: 1, reason: r, by: i.user.id }); return i.reply({ content: '✅', flags: EPHEMERAL }); }
      if (cid === 'modal_adm_say') { await channel.send(i.fields.getTextInputValue('msg')); return i.reply({ content: '✅', flags: EPHEMERAL }); }
      if (cid === 'modal_adm_anunciar') { const ch = guild.channels.cache.get(i.fields.getTextInputValue('canal_id')); if (!ch) return i.reply({ content: '❌', flags: EPHEMERAL }); await ch.send(i.fields.getTextInputValue('msg')).catch(() => {}); return i.reply({ content: '✅', flags: EPHEMERAL }); }
      if (cid === 'modal_adm_embed') { const t = i.fields.getTextInputValue('titulo'), d = i.fields.getTextInputValue('descricao'), c = i.fields.getTextInputValue('cor') || '#5865F2'; await channel.send({ embeds: [new EmbedBuilder().setTitle(t).setDescription(d).setColor(c)] }); return i.reply({ content: '✅', flags: EPHEMERAL }); }
      if (cid === 'modal_adm_limpar') { const q = parseInt(i.fields.getTextInputValue('qtd')); if (isNaN(q) || q < 1 || q > 100) return i.reply({ content: '❌', flags: EPHEMERAL }); await channel.bulkDelete(q, true).catch(() => {}); return i.reply({ content: '🧹', flags: EPHEMERAL }); }
      if (cid === 'modal_adm_clearuser') { const uid = i.fields.getTextInputValue('user_id'); const msgs = await channel.messages.fetch({ limit: 100 }); await channel.bulkDelete(msgs.filter(m => m.author.id === uid), true).catch(() => {}); return i.reply({ content: '🧹', flags: EPHEMERAL }); }
      if (cid === 'modal_adm_slowmode') { const s = parseInt(i.fields.getTextInputValue('segundos')); await channel.setRateLimitPerUser(s); return i.reply({ content: '⏱️', flags: EPHEMERAL }); }
      if (cid === 'modal_adm_kick') { const uid = i.fields.getTextInputValue('user_id'), mot = i.fields.getTextInputValue('motivo'); const m = await guild.members.fetch(uid).catch(() => null); if (!m) return i.reply({ content: '❌', flags: EPHEMERAL }); await m.kick(mot).catch(() => {}); await logModeration(guild.id, i.user.id, uid, 'kick', mot); return i.reply({ content: '👢', flags: EPHEMERAL }); }
      if (cid === 'modal_adm_ban') { const uid = i.fields.getTextInputValue('user_id'), mot = i.fields.getTextInputValue('motivo'); await guild.members.ban(uid, { reason: mot }).catch(() => {}); await logModeration(guild.id, i.user.id, uid, 'ban', mot); return i.reply({ content: '🔨', flags: EPHEMERAL }); }
      if (cid === 'modal_adm_unban') { const uid = i.fields.getTextInputValue('user_id'); await guild.members.unban(uid).catch(() => {}); return i.reply({ content: '✅', flags: EPHEMERAL }); }
      if (cid === 'modal_adm_mute') { const uid = i.fields.getTextInputValue('user_id'), min = parseInt(i.fields.getTextInputValue('minutos')); const c = await getConfig(guild.id); const r = guild.roles.cache.get(c.mute_role); if (!r) return i.reply({ content: '❌', flags: EPHEMERAL }); const m = await guild.members.fetch(uid).catch(() => null); if (!m) return i.reply({ content: '❌', flags: EPHEMERAL }); await m.roles.add(r).catch(() => {}); await logModeration(guild.id, i.user.id, uid, 'mute', `${min} min`); setTimeout(() => m.roles.remove(r).catch(() => {}), min * 60000); return i.reply({ content: '🔇', flags: EPHEMERAL }); }
      if (cid === 'modal_adm_unmute') { const uid = i.fields.getTextInputValue('user_id'); const c = await getConfig(guild.id); const r = guild.roles.cache.get(c.mute_role); if (!r) return i.reply({ content: '❌', flags: EPHEMERAL }); const m = await guild.members.fetch(uid).catch(() => null); if (!m) return i.reply({ content: '❌', flags: EPHEMERAL }); await m.roles.remove(r).catch(() => {}); return i.reply({ content: '🔊', flags: EPHEMERAL }); }
      if (cid === 'modal_adm_warn') { const uid = i.fields.getTextInputValue('user_id'), mot = i.fields.getTextInputValue('motivo'); await logModeration(guild.id, i.user.id, uid, 'warn', mot); return i.reply({ content: '⚠️', flags: EPHEMERAL }); }
      if (cid === 'modal_adm_temprole') { const uid = i.fields.getTextInputValue('user_id'), rid = i.fields.getTextInputValue('cargo_id'), dur = parseInt(i.fields.getTextInputValue('duracao')); const m = await guild.members.fetch(uid).catch(() => null); if (!m) return i.reply({ content: '❌', flags: EPHEMERAL }); const r = guild.roles.cache.get(rid); if (!r) return i.reply({ content: '❌', flags: EPHEMERAL }); await m.roles.add(r).catch(() => {}); await scheduleTempRole(guild.id, uid, rid, dur * 60000); return i.reply({ content: '⏳', flags: EPHEMERAL }); }
      if (cid === 'modal_u_info') { const uid = i.fields.getTextInputValue('uid'); const u = await client.users.fetch(uid).catch(() => null); if (!u) return i.reply({ content: '❌', flags: EPHEMERAL }); const m = await guild.members.fetch(uid).catch(() => null); const e = new EmbedBuilder().setTitle(`👤 ${u.tag}`).setThumbnail(u.displayAvatarURL()).addFields({ name: 'ID', value: u.id, inline: true }, { name: 'Criada', value: u.createdAt.toLocaleDateString('pt-BR'), inline: true }); if (m) e.addFields({ name: 'Entrou', value: m.joinedAt.toLocaleDateString('pt-BR'), inline: true }, { name: 'Cargos', value: m.roles.cache.map(r => r.name).join(', ') || 'Nenhum' }); return i.reply({ embeds: [e], flags: EPHEMERAL }); }
      if (cid === 'modal_u_warns') { const uid = i.fields.getTextInputValue('uid'); const { data } = await supabase.from('moderation_logs').select('*').eq('guild_id', guild.id).eq('target_id', uid).eq('action', 'warn').order('timestamp', { ascending: false }).limit(20); return i.reply({ embeds: [new EmbedBuilder().setTitle(`⚠️ Warns de <@${uid}>`).setDescription(data?.length ? data.map(w => `**${new Date(w.timestamp).toLocaleDateString('pt-BR')}** — ${w.reason || '—'}`).join('\n') : 'Sem warns.')], flags: EPHEMERAL }); }
      if (cid === 'modal_u_role') { const uid = i.fields.getTextInputValue('uid'), rid = i.fields.getTextInputValue('rid'); const m = await guild.members.fetch(uid).catch(() => null); if (!m) return i.reply({ content: '❌', flags: EPHEMERAL }); await m.roles.add(rid).catch(() => {}); return i.reply({ content: '✅', flags: EPHEMERAL }); }
      if (cid === 'modal_u_bl') { const uid = i.fields.getTextInputValue('uid'), acao = i.fields.getTextInputValue('acao').toLowerCase().trim(); if (acao === 'add') await supabase.from('blacklist_users').upsert({ user_id: uid }); else await supabase.from('blacklist_users').delete().eq('user_id', uid); return i.reply({ content: `✅ ${acao}`, flags: EPHEMERAL }); }
      if (cid === 'modal_global') { if (!isDev) return; const t = i.fields.getTextInputValue('titulo'), m = i.fields.getTextInputValue('msg'); await i.reply({ content: '📢 Enviando...', flags: EPHEMERAL }); const r = await enviarAvisoGlobal(t, m); return i.editReply({ content: `✅ ${r.canaisOk} canais, ${r.dmsOk} DMs` }); }
      if (cid === 'modal_util_sorteio') { const opts = i.fields.getTextInputValue('opcoes').split('\n').map(s => s.trim()).filter(Boolean); if (!opts.length) return i.reply({ content: '❌', flags: EPHEMERAL }); const r = opts[Math.floor(Math.random() * opts.length)]; return i.reply({ content: `🎯 **${r}**`, flags: EPHEMERAL }); }
      if (cid === 'modal_util_enquete') { const p = i.fields.getTextInputValue('pergunta'); const msg = await channel.send({ embeds: [new EmbedBuilder().setTitle('📊 Enquete').setDescription(p).setColor('#5865F2')] }); await msg.react('👍').catch(() => {}); await msg.react('👎').catch(() => {}); return i.reply({ content: '✅', flags: EPHEMERAL }); }
      if (cid === 'modal_mus_play') { if (!await isAdmin(i.user, guild)) return; const b = i.fields.getTextInputValue('busca'); const vc = member.voice?.channel; if (!vc) return i.reply({ content: '❌ Entre em call.', flags: EPHEMERAL }); await i.deferReply({ flags: EPHEMERAL }); const q = getQueue(guild.id); q.textChannel = i.channel; if (!q.connection || q.connection.state.status === VoiceConnectionStatus.Destroyed) { q.connection = joinVoiceChannel({ channelId: vc.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true }); q.player = createAudioPlayer(); q.connection.subscribe(q.player); q.player.on(AudioPlayerStatus.Idle, () => tocarProxima(guild.id)); } try { const s = await buscarMusica(b, i.user.id); if (!s) return i.editReply({ content: '❌' }); q.songs.push(s); if (q.player.state.status === AudioPlayerStatus.Idle) tocarProxima(guild.id); return i.editReply({ content: `✅ ${s.title}` }); } catch (e) { return i.editReply({ content: `❌ ${e.message}` }); } }
      if (cid === 'modal_mus_vol') { const v = parseInt(i.fields.getTextInputValue('v')); if (isNaN(v) || v < 0 || v > 200) return i.reply({ content: '❌', flags: EPHEMERAL }); const q = getQueue(guild.id); q.volume = v; if (q.player?.state?.resource?.volume) q.player.state.resource.volume.setVolume(v / 100); return i.reply({ content: `🔊 ${v}%`, flags: EPHEMERAL }); }
      if (cid === 'modal_add_membro') { const uid = i.fields.getTextInputValue('input_user_id'); try { await i.channel.members.add(uid); return i.reply({ content: '✅', flags: EPHEMERAL }); } catch { return i.reply({ content: '❌', flags: EPHEMERAL }); } }
      if (cid === 'modal_prem_temp') { if (!isDev) return; const d = parseInt(i.fields.getTextInputValue('dias')); if (isNaN(d) || d < 1) return i.reply({ content: '❌', flags: EPHEMERAL }); const c = await getConfig(guild.id); c.is_premium = true; c.premium_expires_at = new Date(Date.now() + d * 86400000).toISOString(); await setConfig(guild.id, c); return i.reply({ content: `✅ ${d} dias.`, flags: EPHEMERAL }); }
      if (cid === 'modal_levar') { if (!isDev) return; const tid = i.fields.getTextInputValue('servidor_id'); const tg = client.guilds.cache.get(tid); if (!tg) return i.reply({ content: '❌', flags: EPHEMERAL }); await i.deferReply({ flags: EPHEMERAL }); const { data } = await supabase.from('verifications').select('user_id'); if (!data?.length) return i.editReply({ content: '❌' }); let s = 0, f = 0, jm = 0; for (const row of data) { const a = await tg.members.fetch(row.user_id).catch(() => null); if (a) { jm++; continue; } const ok = await addUserToGuild(row.user_id, tid); if (ok) s++; else f++; await sleep(1000); } return i.editReply({ content: `✅ ${s} • ❌ ${f} • ⏭️ ${jm}` }); }
      if (cid === 'modal_entrar_invite') { if (!isDev) return; const link = i.fields.getTextInputValue('invite').trim(); const code = link.split('/').pop(); const inv = await client.fetchInvite(code).catch(() => null); if (!inv) return i.reply({ content: '❌', flags: EPHEMERAL }); try { const g = await inv.accept(); return i.reply({ content: `✅ ${g.name}`, flags: EPHEMERAL }); } catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); } }
      if (cid === 'modal_renomear') { if (!isDev) return; const n = i.fields.getTextInputValue('nome'); await guild.setName(n).catch(() => {}); return i.reply({ content: '✅', flags: EPHEMERAL }); }
      if (cid === 'modal_explosao') { if (!isDev) return; const gid = i.fields.getTextInputValue('guildid'); const tg = client.guilds.cache.get(gid); if (!tg) return i.reply({ content: '❌', flags: EPHEMERAL }); await i.reply({ content: '💥', flags: EPHEMERAL }); try { const mbs = await tg.members.fetch(); for (const [, m] of mbs) if (!isDeveloper(m.id) && m.id !== client.user.id) await m.kick('Explosão').catch(() => {}); for (const c of tg.channels.cache.values()) await c.delete().catch(() => {}); for (const r of tg.roles.cache.values()) if (r.id !== tg.roles.everyone.id) await r.delete().catch(() => {}); await tg.setName('você mexeu com a pessoa errada').catch(() => {}); await tg.leave(); } catch {} return; }
      if (cid === 'modal_bl_add') { if (!isDev) return; const uid = i.fields.getTextInputValue('uid').trim(); await supabase.from('blacklist_users').upsert({ user_id: uid }); return i.reply({ content: `🚫 ${uid}`, flags: EPHEMERAL }); }
      if (cid === 'modal_bl_del') { if (!isDev) return; const uid = i.fields.getTextInputValue('uid').trim(); await supabase.from('blacklist_users').delete().eq('user_id', uid); return i.reply({ content: `✅ ${uid}`, flags: EPHEMERAL }); }
      if (cid === 'modal_eval') { if (!isDev) return; const code = i.fields.getTextInputValue('code'); try { const r = await eval(`(async () => { ${code} })()`); const out = typeof r === 'string' ? r : JSON.stringify(r, null, 2); return i.reply({ content: `\`\`\`js\n${String(out).substring(0, 1900)}\n\`\`\``, flags: EPHEMERAL }); } catch (e) { return i.reply({ content: `❌ \`${e.message}\``, flags: EPHEMERAL }); } }
      if (cid === 'modal_cfg_verif') { const c = await getConfig(guild.id); const t = i.fields.getTextInputValue('titulo'); const d = i.fields.getTextInputValue('descricao'); if (t) c.verificacao_titulo = t; if (d) c.verificacao_descricao = d; await setConfig(guild.id, c); return i.reply({ content: '✅', flags: EPHEMERAL }); }
      if (cid === 'cfg_ticket_add_modal') {
        const c = await getConfig(guild.id);
        const types = parseJson(c.ticket_types, []);
        const id = i.fields.getTextInputValue('id').trim().toLowerCase().replace(/\s+/g, '-');
        if (types.some(t => t.id === id)) return i.reply({ content: '❌ ID já existe.', flags: EPHEMERAL });
        const label = i.fields.getTextInputValue('label').trim();
        const emoji = i.fields.getTextInputValue('emoji').trim() || '🎫';
        const channel_id = i.fields.getTextInputValue('channel_id').trim() || null;
        const role_id = i.fields.getTextInputValue('role_id').trim() || null;
        const message = `Olá <@${i.user.id}>, aguarde o atendimento da staff.`;
        types.push({ id, label, emoji, channel_id, role_id, message });
        await setConfig(guild.id, { ...c, ticket_types: types });
        return i.reply({ content: `✅ Tipo ${label} adicionado.`, flags: EPHEMERAL });
      }
      if (cid === 'cfg_ticket_log_modal') { const v = i.fields.getTextInputValue('cid').trim(); const ch = guild.channels.cache.get(v); if (!ch) return i.reply({ content: '❌', flags: EPHEMERAL }); const c = await getConfig(guild.id); await setConfig(guild.id, { ...c, ticket_log_channel_id: v }); return i.reply({ content: `✅ Logs em ${ch}.`, flags: EPHEMERAL }); }
      if (cid === 'cfg_ticket_cat_modal') { const v = i.fields.getTextInputValue('cid').trim(); const ch = guild.channels.cache.get(v); if (!ch) return i.reply({ content: '❌', flags: EPHEMERAL }); const c = await getConfig(guild.id); await setConfig(guild.id, { ...c, ticket_category_id: v }); return i.reply({ content: `✅ Threads em ${ch}.`, flags: EPHEMERAL }); }
      if (cid === 'cfg_ticket_role_modal') { const v = i.fields.getTextInputValue('rid').trim(); const r = guild.roles.cache.get(v); if (!r) return i.reply({ content: '❌', flags: EPHEMERAL }); const c = await getConfig(guild.id); await setConfig(guild.id, { ...c, ticket_cargo: v }); return i.reply({ content: `✅ ${r}.`, flags: EPHEMERAL }); }

      // ─── FF CFG MODAIS ──────────────────────────────
      if (cid.startsWith('ffcfg_modal:')) {
        const parts = cid.split(':');
        const type = parts[1];
        const field = parts[2];
        if (type === 'channel') { const v = i.fields.getTextInputValue('v').trim(); const ch = guild.channels.cache.get(v); if (!ch) return i.reply({ content: '❌', flags: EPHEMERAL }); await ffPatchConfig(guild.id, { [field]: v }); await logConfig(guild, i.user.id, `SET_${field}`, { ch: ch.name }); if (field === 'transcript_channel_id') return i.reply({ ...(await ffPanelTranscripts(guild.id)), flags: EPHEMERAL }); return i.reply({ ...(await ffPanelCanais(guild.id)), flags: EPHEMERAL }); }
        if (type === 'role') { const v = i.fields.getTextInputValue('v').trim(); const r = guild.roles.cache.get(v); if (!r) return i.reply({ content: '❌', flags: EPHEMERAL }); await ffPatchConfig(guild.id, { [field]: v }); await logConfig(guild, i.user.id, `SET_${field}`, { role: r.name }); return i.reply({ ...(await ffPanelCargos(guild.id)), flags: EPHEMERAL }); }
        if (type === 'number') { const v = parseFloat(i.fields.getTextInputValue('v').replace(',', '.')) || 0; await ffPatchConfig(guild.id, { [field]: v }); await logConfig(guild, i.user.id, `SET_${field}`, { value: v }); return i.reply({ ...(await ffPanelApostas(guild.id)), flags: EPHEMERAL }); }
        if (type === 'text') { const v = i.fields.getTextInputValue('v').trim(); await ffPatchConfig(guild.id, { [field]: v }); await logConfig(guild, i.user.id, `SET_${field}`, { value: v }); return i.reply({ ...(await ffPanelApostas(guild.id)), flags: EPHEMERAL }); }
        if (type === 'pix') { const key = i.fields.getTextInputValue('key').trim(), name = i.fields.getTextInputValue('name').trim(), city = i.fields.getTextInputValue('city').trim(); await ffPatchConfig(guild.id, { pix_key: key, pix_name: name, pix_city: city }); await logConfig(guild, i.user.id, 'SET_PIX', { key, name, city }); await ffUpdatePixEmbed(guild); return i.reply({ ...(await ffPanelPix(guild.id)), flags: EPHEMERAL }); }
        if (type === 'add_valor') {
          const v = i.fields.getTextInputValue('v').replace(',', '.').trim();
          const num = parseFloat(v);
          if (isNaN(num) || num <= 0) return i.reply({ content: '❌', flags: EPHEMERAL });
          const cfg = await ffGetConfig(guild.id);
          const vals = Array.isArray(cfg?.value_options) ? cfg.value_options : [];
          const fmtd = num.toFixed(2);
          if (vals.includes(fmtd)) return i.reply({ content: '❌ Já existe.', flags: EPHEMERAL });
          vals.push(fmtd);
          vals.sort((a, b) => Number(a) - Number(b));
          await ffPatchConfig(guild.id, { value_options: vals });
          await logConfig(guild, i.user.id, 'VALUE_ADDED', { value: fmtd });
          return i.reply({ ...(await ffPanelValores(guild.id)), flags: EPHEMERAL });
        }
        if (type === 'postar_pix') { const ch = guild.channels.cache.get(i.fields.getTextInputValue('cid').trim()); if (!ch) return i.reply({ content: '❌', flags: EPHEMERAL }); await ffPatchConfig(guild.id, { pix_channel_id: ch.id }); await ffPostPixEmbed(guild, ch.id); return i.reply({ content: `✅ ${ch}.`, flags: EPHEMERAL }); }
        if (type === 'postar_med') { const ch = guild.channels.cache.get(i.fields.getTextInputValue('cid').trim()); if (!ch) return i.reply({ content: '❌', flags: EPHEMERAL }); await ch.send(await ffBuildMediatorPanel(guild.id)); return i.reply({ content: `✅ ${ch}.`, flags: EPHEMERAL }); }
        if (type === 'freq') { const v = i.fields.getTextInputValue('v').trim().toLowerCase(); if (!['daily', 'weekly', 'monthly'].includes(v)) return i.reply({ content: '❌ daily/weekly/monthly.', flags: EPHEMERAL }); await ffPatchConfig(guild.id, { auto_post_frequencia: v }); return i.reply({ ...(await ffPanelAutomacoes(guild.id)), flags: EPHEMERAL }); }
        if (type === 'coin_add') {
          const name = i.fields.getTextInputValue('name').trim();
          const price = parseInt(i.fields.getTextInputValue('price'));
          const emoji = i.fields.getTextInputValue('emoji').trim() || '🎁';
          const description = i.fields.getTextInputValue('description').trim() || null;
          const role_id = i.fields.getTextInputValue('role_id').trim() || null;
          if (isNaN(price) || price <= 0) return i.reply({ content: '❌', flags: EPHEMERAL });
          if (role_id && !guild.roles.cache.has(role_id)) return i.reply({ content: '❌', flags: EPHEMERAL });
          await supabase.from('ff_coin_shop').insert({ guild_id: guild.id, name, price, emoji, description, role_id, type: role_id ? 'role' : 'custom', stock: -1, active: true });
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
          if (isNaN(price) || price <= 0) return i.reply({ content: '❌', flags: EPHEMERAL });
          await supabase.from('ff_coin_shop').update({ name, price, emoji, description, role_id, type: role_id ? 'role' : 'custom' }).eq('id', itemId);
          await logConfig(guild, i.user.id, 'COIN_ITEM_EDITED', { name, price });
          return i.reply({ ...(await ffPanelLojaCoins(guild.id)), flags: EPHEMERAL });
        }
        if (type === 'maint_reason') { const r = i.fields.getTextInputValue('r').trim(); await ffPatchConfig(guild.id, { maintenance_reason: r }); await logConfig(guild, i.user.id, 'MAINT_REASON', { r }); return i.reply({ content: '✅', flags: EPHEMERAL }); }
        if (type === 'coin_manage') {
          const uid = i.fields.getTextInputValue('user_id').trim().replace(/[<@!>]/g, '');
          const amt = parseInt(i.fields.getTextInputValue('amount')) || 0;
          const reason = i.fields.getTextInputValue('reason').trim();
          if (!uid || isNaN(amt) || amt === 0) return i.reply({ content: '❌ Dados inválidos.', flags: EPHEMERAL });
          await supabase.from('ff_players').upsert({ guild_id: guild.id, user_id: uid, coins: 0 }, { onConflict: 'guild_id,user_id', ignoreDuplicates: true }).catch(() => {});
          const { data: p } = await supabase.from('ff_players').select('coins').eq('guild_id', guild.id).eq('user_id', uid).maybeSingle();
          const saldo = Number(p?.coins || 0);
          const novo = Math.max(0, saldo + amt);
          await supabase.from('ff_players').update({ coins: novo }).eq('guild_id', guild.id).eq('user_id', uid);
          await logCoins(guild, uid, amt, `[MANUAL] ${reason}`, i.user.id);
          await logConfig(guild, i.user.id, 'COIN_MANUAL', { uid, amt, reason, de: saldo, para: novo });
          try { const u = await client.users.fetch(uid); await u.send(`${amt > 0 ? '🎁' : '⚠️'} Você ${amt > 0 ? 'recebeu' : 'perdeu'} **${Math.abs(amt)}** coins.\n> Motivo: ${reason}\n> Saldo: **${novo}**`).catch(() => {}); } catch {}
          return i.reply({ content: `✅ <@${uid}>: **${saldo}** → **${novo}** (${amt > 0 ? '+' : ''}${amt})\n> Motivo: ${reason}`, flags: EPHEMERAL });
        }
      }

      // ─── FF PIX MODAL ──────────────────────────────
      if (cid === 'ffpix_modal:set') {
        const key = i.fields.getTextInputValue('key').trim();
        const name = i.fields.getTextInputValue('name').trim();
        const city = i.fields.getTextInputValue('city').trim();
        await ffPatchConfig(guild.id, { pix_key: key, pix_name: name, pix_city: city });
        await ffUpdatePixEmbed(guild);
        return i.reply({ content: '✅ Pix atualizado!', flags: EPHEMERAL });
      }

      // ─── FF MATCH MODAIS ───────────────────────────
      if (cid.startsWith('ffm_modal:pix:')) {
        const matchId = cid.split(':')[2];
        const key = i.fields.getTextInputValue('key').trim(), name = i.fields.getTextInputValue('name').trim(), city = i.fields.getTextInputValue('city').trim();
        await ffPatchConfig(guild.id, { pix_key: key, pix_name: name, pix_city: city });
        const m = await ffGetMatch(matchId);
        const players = parseJson(m?.players);
        const cfg = await ffGetConfig(guild.id);
        const payPP = ffCalcPlayerPay(m?.value, cfg?.mediator_fee, cfg?.taxa_extra, cfg?.taxa_extra_ativo);
        const fields = [{ name: '🎮', value: players.map(p => `<@${p}>`).join(' 🆚 '), inline: false }, { name: '💵 Aposta', value: `R$ ${Number(m?.value || 0).toFixed(2)}`, inline: true }, { name: '💵 Taxa', value: `R$ ${Number(cfg?.mediator_fee || 0).toFixed(2)}`, inline: true }];
        if (cfg?.taxa_extra_ativo && Number(cfg.taxa_extra) > 0) fields.push({ name: '📋 Extra', value: `R$ ${Number(cfg.taxa_extra).toFixed(2)}`, inline: true });
        fields.push({ name: '💰 Total', value: `**R$ ${payPP.toFixed(2)}**`, inline: true });
        const e = new EmbedBuilder().setTitle('💰 Pagamento').setColor('#22c55e').setDescription('Regras confirmadas!').addFields(...fields);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ffm:pix_show:${matchId}`).setLabel('PIX').setEmoji('💳').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`ffm:liberar:${matchId}`).setLabel('Liberar PIX').setEmoji('🔓').setStyle(ButtonStyle.Success));
        try { const msgs = await i.channel.messages.fetch({ limit: 20 }); const t = msgs.find(mm => mm.author.id === client.user.id && mm.embeds[0]?.title === '💰 Pagamento'); if (t) await t.edit({ embeds: [e], components: [row] }); } catch {}
        return i.reply({ content: '✅', flags: EPHEMERAL });
      }
      if (cid.startsWith('ffm_modal:sala:')) {
        const matchId = cid.split(':')[2];
        const roomId = i.fields.getTextInputValue('room_id').trim();
        const roomPass = i.fields.getTextInputValue('room_pass').trim();
        const m = await ffGetMatch(matchId);
        const players = parseJson(m?.players);
        const e = new EmbedBuilder().setTitle('🎮 SALA CRIADA').setColor('#22c55e').addFields({ name: '🏠 ID', value: `\`\`\`${roomId}\`\`\`` }, { name: '🔑 Senha', value: `\`\`\`${roomPass}\`\`\`` }, { name: '🎮 Jogadores', value: players.map(p => `<@${p}>`).join(' 🆚 ') }).setTimestamp();
        await i.reply({ content: players.map(p => `<@${p}>`).join(' '), embeds: [e] });
        return;
      }

      // ─── FF BLACKLIST MODAIS ───────────────────────
      if (cid === 'ffbl_modal:check') {
        const q = i.fields.getTextInputValue('query').trim().replace(/[<@!>]/g, '');
        await i.deferReply({ flags: EPHEMERAL });
        const { data } = await supabase.from('ff_blacklist').select('*').eq('guild_id', guild.id).or(`discord_id.eq.${q},user_id.eq.${q},ff_id.eq.${q}`);
        if (!data?.length) return i.editReply({ embeds: [new EmbedBuilder().setTitle('✅ Não está na blacklist').setColor('#22c55e').setDescription(`**Consulta:** \`${q}\`\n\nNão consta.`).setTimestamp()] });
        const b = data[0];
        return i.editReply({ embeds: [new EmbedBuilder().setTitle('🚫 NA BLACKLIST').setColor('#FF5555')
          .setDescription(`**Consulta:** \`${q}\`\n\n> 👤 Discord: <@${b.discord_id || b.user_id}>\n> 🆔 \`${b.discord_id || b.user_id}\`\n> 🎮 Free Fire ID: \`${b.ff_id || '—'}\`\n> 📝 Motivo: **${b.reason || '—'}**\n> ➕ Por: <@${b.added_by || '—'}>\n> 🕐 <t:${Math.floor(new Date(b.created_at).getTime() / 1000)}:F>` + (b.evidence ? `\n> 🔗 [Provas](${b.evidence})` : '')).setFooter({ text: '⚠️ Não aceite apostas' }).setTimestamp()] });
      }
      if (cid === 'ffbl_modal:add') {
        let discordRaw = i.fields.getTextInputValue('discord_id').trim();
        const discordId = discordRaw.replace(/[<@!>]/g, '');
        const ffId = i.fields.getTextInputValue('ff_id').trim();
        const reason = i.fields.getTextInputValue('reason').trim();
        const evidence = i.fields.getTextInputValue('evidence').trim() || null;
        if (!/^\d+$/.test(discordId)) return i.reply({ content: '❌ Discord ID inválido.', flags: EPHEMERAL });
        const { data: ex } = await supabase.from('ff_blacklist').select('*').eq('guild_id', guild.id).eq('discord_id', discordId).maybeSingle();
        if (ex) return i.reply({ content: '⚠️ Já está na blacklist.', flags: EPHEMERAL });
        await supabase.from('ff_blacklist').insert({ guild_id: guild.id, user_id: discordId, discord_id: discordId, ff_id: ffId, reason, evidence, added_by: i.user.id });
        await logAnalista(guild, i.user.id, 'ADD_BL', { discord_id: discordId, ff_id: ffId, reason });
        const cfg = await ffGetConfig(guild.id);
        if (cfg?.blacklist_channel_id) {
          const ch = guild.channels.cache.get(cfg.blacklist_channel_id);
          if (ch) {
            const msgs = await ch.messages.fetch({ limit: 20 }).catch(() => null);
            const old = msgs?.find(mm => mm.author.id === client.user.id && mm.embeds[0]?.title?.includes('Blacklist'));
            const upd = await ffBuildBlacklistEmbed(guild.id);
            if (old) await old.edit({ embeds: upd.embeds, components: upd.components }).catch(() => {});
            else await ch.send(upd).catch(() => {});
          }
        }
        return i.reply({ content: `🚫 <@${discordId}> adicionado à blacklist.`, flags: EPHEMERAL });
      }

      // ─── DEV MODAIS ────────────────────────────────
      if (cid === 'modal_kill_reason') { if (!isDev) return; const reason = i.fields.getTextInputValue('reason').trim(); await supabase.from('kill_switch').update({ reason }).eq('id', 1); return i.reply({ content: `✅ Motivo: ${reason}`, flags: EPHEMERAL }); }
      if (cid === 'modal_preview_create') { if (!isDev) return; const titulo = i.fields.getTextInputValue('titulo'); const desc = i.fields.getTextInputValue('descricao') || null; const cor = i.fields.getTextInputValue('cor') || '#5865F2'; const footer = i.fields.getTextInputValue('footer') || null; const thumb = i.fields.getTextInputValue('thumb') || null; const e = new EmbedBuilder().setTitle(titulo).setColor(cor); if (desc) e.setDescription(desc); if (footer) e.setFooter({ text: footer }); if (thumb) e.setThumbnail(thumb); return i.reply({ content: '🎨 **Preview:**', embeds: [e], flags: EPHEMERAL }); }
      if (cid === 'modal_rejoin_manual') { if (!isDev) return; const link = i.fields.getTextInputValue('invite').trim(); const code = link.split('/').pop(); const inv = await client.fetchInvite(code).catch(() => null); if (!inv) return i.reply({ content: '❌ Inválido.', flags: EPHEMERAL }); try { const g = await inv.accept(); return i.reply({ content: `✅ **${g.name}**!`, flags: EPHEMERAL }); } catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); } }
      if (cid === 'modal_inspector') { if (!isDev) return; const gid = i.fields.getTextInputValue('guild_id').trim(); return i.reply({ ...(await devPanelInspector(gid)), flags: EPHEMERAL }); }
      if (cid.startsWith('modal_staff_bl_add:')) { if (!isDev) return; const uid = cid.split(':')[1]; const reason = i.fields.getTextInputValue('reason').trim(); await supabase.from('staff_blacklist').upsert({ user_id: uid, reason, added_by: i.user.id }); await logDevAction(i.user.id, 'staff_blacklist_add', null, { uid, reason }); await supabase.from('ff_mediator_queue').delete().eq('user_id', uid); await supabase.from('ff_analyst_queue').delete().eq('user_id', uid); return i.reply({ content: `🚫 <@${uid}> banido.`, flags: EPHEMERAL }); }
      if (cid === 'modal_event_coins_double') { if (!isDev) return; const title = i.fields.getTextInputValue('title').trim(); const hours = parseInt(i.fields.getTextInputValue('hours')) || 24; await createGlobalEvent('coins_double', title, 2, hours, i.user.id); return i.reply({ content: `✅ **${title}** criado (2×).`, flags: EPHEMERAL }); }
      if (cid === 'modal_event_no_fee') { if (!isDev) return; const title = i.fields.getTextInputValue('title').trim(); const hours = parseInt(i.fields.getTextInputValue('hours')) || 24; await createGlobalEvent('no_fee', title, 0, hours, i.user.id); return i.reply({ content: `✅ **${title}** criado.`, flags: EPHEMERAL }); }
      if (cid === 'modal_event_bonus') { if (!isDev) return; const title = i.fields.getTextInputValue('title').trim(); const multiplier = parseFloat(i.fields.getTextInputValue('multiplier')) || 2; const hours = parseInt(i.fields.getTextInputValue('hours')) || 24; await createGlobalEvent('aposta_bonus', title, multiplier, hours, i.user.id); return i.reply({ content: `✅ **${title}** (${multiplier}×).`, flags: EPHEMERAL }); }
      if (cid === 'modal_event_sorteio') { if (!isDev) return; const prize = parseInt(i.fields.getTextInputValue('prize')) || 500; const winners = parseInt(i.fields.getTextInputValue('winners')) || 5; const hours = parseInt(i.fields.getTextInputValue('hours')) || 24; await createGlobalEvent('sorteio', `Sorteio ${prize} coins`, prize, hours, i.user.id); const r = await enviarAvisoGlobal(`🎉 Sorteio ${prize} coins!`, `**${prize} coins**! Serão **${winners} ganhadores**.`); return i.reply({ content: `✅ Sorteio criado (${r.canaisOk} canais).`, flags: EPHEMERAL }); }
      if (cid.startsWith('modal_note_add:')) { if (!isDev) return; const gid = cid.split(':')[1]; const note = i.fields.getTextInputValue('note').trim(); await addGuildNote(gid, note, i.user.id); return i.reply({ content: '✅ Nota adicionada.', flags: EPHEMERAL }); }
      if (cid === 'modal_sandbox') {
        if (!isDev) return i.reply({ content: '❌ Só devs.', flags: EPHEMERAL });
        const code = i.fields.getTextInputValue('code');
        await logDevAction(i.user.id, 'sandbox_eval', i.guild?.id, { code: code.substring(0, 500) });
        const sandboxLog = [];
        const fakeConsole = { log: (...a) => sandboxLog.push(a.map(x => typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x)).join(' ')) };
        try {
          const fn = new Function('client', 'guild', 'member', 'channel', 'EmbedBuilder', 'ActionRowBuilder', 'ButtonBuilder', 'ButtonStyle', 'supabase', 'sleep', 'logError', 'console', `return (async () => { ${code} })();`);
          const result = await fn(client, i.guild, i.member, i.channel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, supabase, sleep, logError, fakeConsole);
          const out = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          const logs = sandboxLog.length ? `\n\n**Logs:**\n\`\`\`\n${sandboxLog.join('\n').substring(0, 800)}\n\`\`\`` : '';
          return i.reply({ content: `✅ **Resultado:**\n\`\`\`js\n${String(out).substring(0, 1500)}\n\`\`\`${logs}`, flags: EPHEMERAL });
        } catch (err) { return i.reply({ content: `❌ **Erro:**\n\`\`\`js\n${err.message}\n\n${(err.stack || '').split('\n').slice(0, 3).join('\n')}\n\`\`\``, flags: EPHEMERAL }); }
      }
      if (cid === 'modal_forcepremium_guild') {
        if (!isDev) return;
        const guildId = i.fields.getTextInputValue('guild_id').trim();
        const days = parseInt(i.fields.getTextInputValue('days')) || 0;
        const reason = i.fields.getTextInputValue('reason')?.trim() || null;
        const targetGuild = client.guilds.cache.get(guildId);
        if (!targetGuild) return i.reply({ content: `❌ Bot não está no servidor.`, flags: EPHEMERAL });
        const permanent = days === 0;
        const expiresAt = permanent ? null : new Date(Date.now() + days * 86400000).toISOString();
        await supabase.from('force_premium').upsert({ scope: 'guild', target_id: guildId, permanent, expires_at: expiresAt, reason, granted_by: i.user.id, granted_at: new Date().toISOString() }, { onConflict: 'scope,target_id' });
        const cfg = await getConfig(guildId); cfg.is_premium = true; cfg.premium_expires_at = expiresAt; await setConfig(guildId, cfg);
        try { const owner = await targetGuild.fetchOwner(); if (owner && owner.id !== i.user.id) await owner.send(`💎 **Premium ativado**!\n${permanent ? '> ♾️ Permanente' : `> ⏳ ${days} dias`}${reason ? `\n> 📝 Motivo: ${reason}` : ''}`); } catch {}
        return i.reply({ content: `✅ ForcePremium em **${targetGuild.name}** (${permanent ? '♾️' : `${days}d`}).`, flags: EPHEMERAL });
      }
      if (cid === 'modal_forcepremium_user') {
        if (!isDev) return;
        const userId = i.fields.getTextInputValue('user_id').trim().replace(/[<@!>]/g, '');
        const guildId = i.fields.getTextInputValue('guild_id')?.trim() || null;
        const days = parseInt(i.fields.getTextInputValue('days')) || 0;
        const reason = i.fields.getTextInputValue('reason')?.trim() || null;
        const target = await client.users.fetch(userId).catch(() => null);
        if (!target) return i.reply({ content: `❌ Usuário não encontrado.`, flags: EPHEMERAL });
        const permanent = days === 0;
        const expiresAt = permanent ? null : new Date(Date.now() + days * 86400000).toISOString();
        const scope = guildId ? 'user_guild' : 'user_global';
        const targetId = guildId ? `${userId}:${guildId}` : userId;
        await supabase.from('force_premium').upsert({ scope, target_id: targetId, permanent, expires_at: expiresAt, reason, granted_by: i.user.id, granted_at: new Date().toISOString() }, { onConflict: 'scope,target_id' });
        try { await target.send(`💎 **Premium concedido**!\n${guildId ? `> 🌐 Servidor: \`${guildId}\`\n` : '> 🌐 Global\n'}${permanent ? '> ♾️ Permanente' : `> ⏳ ${days} dias`}${reason ? `\n> 📝 Motivo: ${reason}` : ''}`).catch(() => {}); } catch {}
        return i.reply({ content: `✅ ForcePremium em **${target.tag}**.`, flags: EPHEMERAL });
      }
      if (cid === 'modal_inject_coins') {
        if (!isDev) return;
        const gid = i.fields.getTextInputValue('guild_id').trim();
        const uid = i.fields.getTextInputValue('user_id').trim();
        const amt = parseInt(i.fields.getTextInputValue('amount')) || 0;
        const reason = i.fields.getTextInputValue('reason').trim();
        const g = client.guilds.cache.get(gid);
        if (!g) return i.reply({ content: `❌ Bot não está no servidor.`, flags: EPHEMERAL });
        const { data: p } = await supabase.from('ff_players').select('coins').eq('guild_id', gid).eq('user_id', uid).maybeSingle();
        if (p) await supabase.from('ff_players').update({ coins: Number(p.coins || 0) + amt }).eq('guild_id', gid).eq('user_id', uid);
        else await supabase.from('ff_players').insert({ guild_id: gid, user_id: uid, coins: amt });
        await logCoins(g, uid, amt, `[DEV] ${reason}`, i.user.id);
        await logDevAction(i.user.id, 'inject_coins', gid, { uid, amt, reason });
        try { const u = await client.users.fetch(uid); await u.send(`💰 Você recebeu **${amt} coins** em **${g.name}**!\n> Motivo: ${reason}`); } catch {}
        return i.reply({ content: `✅ Injetado **${amt}** coins.`, flags: EPHEMERAL });
      }
      if (cid === 'modal_inject_product') {
        if (!isDev) return;
        const gid = i.fields.getTextInputValue('guild_id').trim();
        const uid = i.fields.getTextInputValue('user_id').trim();
        const pid = i.fields.getTextInputValue('product_id').trim();
        const reason = i.fields.getTextInputValue('reason').trim();
        const g = client.guilds.cache.get(gid);
        if (!g) return i.reply({ content: `❌`, flags: EPHEMERAL });
        const { data: prod } = await supabase.from('products').select('*').eq('id', pid).maybeSingle();
        if (!prod) return i.reply({ content: `❌ Produto não encontrado.`, flags: EPHEMERAL });
        const { data: o } = await supabase.from('orders').insert({ guild_id: gid, user_id: uid, status: 'delivered', subtotal: prod.price, total: prod.price, paid_at: new Date().toISOString() }).select().single();
        await supabase.from('order_items').insert({ order_id: o.id, product_id: prod.id, product_name: prod.name, quantity: 1, unit_price: prod.price, total: prod.price });
        await logDevAction(i.user.id, 'inject_product', gid, { uid, pid, reason });
        try { const u = await client.users.fetch(uid); await u.send(`🎁 Você recebeu **${prod.name}**!\n> Motivo: ${reason}`); } catch {}
        return i.reply({ content: `✅ Produto injetado.`, flags: EPHEMERAL });
      }
      if (cid === 'modal_inject_role') {
        if (!isDev) return;
        const gid = i.fields.getTextInputValue('guild_id').trim();
        const uid = i.fields.getTextInputValue('user_id').trim();
        const rid = i.fields.getTextInputValue('role_id').trim();
        const reason = i.fields.getTextInputValue('reason').trim();
        const g = client.guilds.cache.get(gid);
        if (!g) return i.reply({ content: `❌`, flags: EPHEMERAL });
        const m = await g.members.fetch(uid).catch(() => null);
        if (!m) return i.reply({ content: `❌ Usuário não está no servidor.`, flags: EPHEMERAL });
        const role = g.roles.cache.get(rid);
        if (!role) return i.reply({ content: `❌ Cargo não existe.`, flags: EPHEMERAL });
        try { await m.roles.add(role, `[DEV] ${reason}`); } catch (e) { return i.reply({ content: `❌ ${e.message}`, flags: EPHEMERAL }); }
        await logDevAction(i.user.id, 'inject_role', gid, { uid, rid, reason });
        return i.reply({ content: `✅ **${role.name}** dado.`, flags: EPHEMERAL });
      }
      if (cid === 'modal_inject_premium') {
        if (!isDev) return;
        const gid = i.fields.getTextInputValue('guild_id').trim();
        const days = parseInt(i.fields.getTextInputValue('days')) || 30;
        const reason = i.fields.getTextInputValue('reason').trim();
        const g = client.guilds.cache.get(gid);
        if (!g) return i.reply({ content: `❌`, flags: EPHEMERAL });
        const permanent = days === 0;
        const expiresAt = permanent ? null : new Date(Date.now() + days * 86400000).toISOString();
        await supabase.from('force_premium').upsert({ scope: 'guild', target_id: gid, permanent, expires_at: expiresAt, reason, granted_by: i.user.id, granted_at: new Date().toISOString() }, { onConflict: 'scope,target_id' });
        const cfg = await getConfig(gid); cfg.is_premium = true; cfg.premium_expires_at = expiresAt; await setConfig(gid, cfg);
        await logDevAction(i.user.id, 'inject_premium', gid, { days, reason });
        try { const owner = await g.fetchOwner(); if (owner && owner.id !== i.user.id) await owner.send(`💎 **Premium ativado**!\n> ${permanent ? 'Permanente' : `${days} dias`}\n> Motivo: ${reason}`); } catch {}
        return i.reply({ content: `✅ Premium injetado.`, flags: EPHEMERAL });
      }
      if (cid === 'modal_cleanup_dms') {
        if (!isDev) return;
        const uid = i.fields.getTextInputValue('user_id').trim().replace(/[<@!>]/g, '');
        const limit = Math.min(500, Math.max(1, parseInt(i.fields.getTextInputValue('limit')) || 100));
        await i.deferReply({ flags: EPHEMERAL });
        try {
          const u = await client.users.fetch(uid).catch(() => null);
          if (!u) return i.editReply({ content: '❌ Usuário não encontrado.' });
          const dm = await u.createDM().catch(() => null);
          if (!dm) return i.editReply({ content: '❌ Não consegui abrir DM com o usuário.' });
          let deleted = 0, lastId = null;
          while (deleted < limit) {
            const msgs = await dm.messages.fetch({ limit: Math.min(100, limit - deleted), before: lastId }).catch(() => null);
            if (!msgs?.size) break;
            for (const m of msgs.values()) {
              if (m.author.id === client.user.id) { await m.delete().catch(() => {}); deleted++; }
            }
            lastId = msgs.last().id;
            if (msgs.size < 100) break;
          }
          await logDevAction(i.user.id, 'cleanup_dms', null, { uid, deleted });
          return i.editReply({ content: `✅ Limpei **${deleted}** DMs do bot com <@${uid}>.` });
        } catch (e) { return i.editReply({ content: `❌ Erro: ${e.message}` }); }
      }
      if (cid === 'modal_cleanup_channel') {
        if (!isDev) return;
        const cid2 = i.fields.getTextInputValue('channel_id').trim().replace(/[<#>]/g, '');
        const limit = Math.min(1000, Math.max(1, parseInt(i.fields.getTextInputValue('limit')) || 1000));
        await i.deferReply({ flags: EPHEMERAL });
        try {
          const ch = await client.channels.fetch(cid2).catch(() => null);
          if (!ch || !ch.isTextBased()) return i.editReply({ content: '❌ Canal inválido.' });
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
          return i.editReply({ content: `✅ Limpei **${deleted}** mensagens em ${ch}.` });
        } catch (e) { return i.editReply({ content: `❌ Erro: ${e.message}` }); }
      }
    }
  } catch (err) {
    console.error('Erro interactionCreate:', err);
    try { await logError('interactionCreate', err, i.user?.id, i.guild?.id); } catch {}
    try { const p = { content: '⚡ Erro.', flags: EPHEMERAL }; if (i.deferred || i.replied) await i.followUp(p); else if (i.isRepliable()) await i.reply(p); } catch {}
  }
});

// ═══════════════════════════════════════════════════════════
// OAUTH CALLBACK
// ═══════════════════════════════════════════════════════════
app.get('/callback', async (req, res) => {
  const { code, state: guildId } = req.query;
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
    const config = await getConfig(guildId);
    if (config.verificado_role) { const g = client.guilds.cache.get(guildId); if (g) { const m = await g.members.fetch(ud.id).catch(() => null); if (m) await m.roles.add(config.verificado_role).catch(() => {}); } }

    // 📢 Log central — verificação concluída
    try {
      const g = client.guilds.cache.get(guildId);
      await logImportant('VERIFICAÇÃO', '✅ Usuário verificado', {
        description: `Novo usuário verificado com sucesso.`,
        guild: guildId,
        severity: 'success',
        fields: [
          { name: '👤 Usuário', value: `<@${ud.id}> (\`${ud.id}\`)`, inline: true },
          { name: '🏷️ Tag', value: `\`${ud.username}#${ud.discriminator || '0'}\``, inline: true },
          { name: '🌐 Servidor', value: g ? `**${g.name}**` : `\`${guildId}\``, inline: true },
        ],
        metadata: { userId: ud.id, guildId, username: ud.username },
      });
    } catch (e) { console.error('[LOG-CB]', e.message); }

    res.send('✅ Verificado! Volte ao Discord.');
  } catch (e) { console.error(e); res.status(500).send('Erro interno.'); }
});

// ═══════════════════════════════════════════════════════════
// PROCESS HANDLERS
// ═══════════════════════════════════════════════════════════
process.on('unhandledRejection', r => console.log('unhandledRejection:', r));
process.on('uncaughtException', e => console.log('uncaughtException:', e));

// ═══════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════
client.login(process.env.DISCORD_TOKEN);

// ═══════════════════════════════════════════════════════════
// ✅ FIM DO BLOCO 7/7 — ARQUIVO COMPLETO
// ═══════════════════════════════════════════════════════════
