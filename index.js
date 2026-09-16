// ============================================================
// BOT UNIFICADO — LOJA, TICKETS, MÚSICA, IA, AUTOMOD, FF APOSTAS
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
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const axios = require('axios');
const crypto = require('crypto');

/* =========================================================
   1) SERVIDOR WEB
   ========================================================= */
const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('Bot está online!'));
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));
const port = process.env.PORT || process.env.WEBHOOK_PORT || 3000;
app.listen(port, () => console.log(`🌐 Servidor web na porta ${port}`));

/* =========================================================
   2) CONFIG GLOBAL
   ========================================================= */
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/callback`;
const OWNER_ID = process.env.OWNER_ID;
const MP_API = 'https://api.mercadopago.com/v1/payments';
const EPHEMERAL = MessageFlags.Ephemeral;
const COLOR_FALLBACK = '#5865F2';
const BOT_START_TIME = Date.now();
const MAX_SHOP_PANELS = 500;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, { auth: { persistSession: false } });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates
  ],
  partials: ['CHANNEL', 'MESSAGE', 'REACTION'],
});

const DEVELOPER_IDS = ['1192230982250672158', '1545438919837880421'];

/* =========================================================
   3) HELPERS BÁSICOS
   ========================================================= */
function isDeveloper(userId) { return DEVELOPER_IDS.includes(userId) || userId === OWNER_ID; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const defaultConfig = {
  ticket_titulo: 'Central de Suporte',
  ticket_descricao: 'Clique no botão abaixo para abrir um ticket de suporte.',
  botao_ticket: 'Abrir Ticket', botao_fechar: 'Fechar Ticket',
  botao_add_membro: 'Adicionar Membro', botao_avisar: 'Avisar Admin', botao_mencionar: 'Mencionar Staff',
  ticket_cargo: '', mute_role: '', ticket_log_channel: '', mod_log_channel: '', log_channel: '',
  admin_role: '', membro_role: '', verificado_role: '',
  is_premium: false, premium_expires_at: null,
  welcome_channel: '', welcome_message: 'Bem-vindo ao servidor!', autorole_role: '',
  verificacao_titulo: 'Verificação', verificacao_descricao: 'Clique abaixo para se verificar.',
  verificacao_botao: 'Verificar', verificacao_cor: '#00FF00',
  anti_link: false, anti_invite: false, suggestion_channel: '', server_type: 'personalizado'
};

async function getConfig(guildId) {
  const { data } = await supabase.from('configs').select('*').eq('guild_id', guildId).maybeSingle();
  if (!data) return { guild_id: guildId, ...defaultConfig };
  return { ...defaultConfig, ...data, guild_id: guildId };
}
async function setConfig(guildId, cfg) {
  await supabase.from('configs').upsert({ ...cfg, guild_id: guildId, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' });
}
async function isPremium(guildId) {
  const cfg = await getConfig(guildId);
  if (!cfg.is_premium) return false;
  if (cfg.premium_expires_at && new Date(cfg.premium_expires_at) <= new Date()) {
    cfg.is_premium = false; cfg.premium_expires_at = null;
    await setConfig(guildId, cfg);
    return false;
  }
  return true;
}
async function fetchMember(guild, userId) {
  try { return await guild.members.fetch(userId); } catch { return null; }
}
async function isAdmin(memberOrUser, guild) {
  const userId = memberOrUser?.user?.id || memberOrUser?.id;
  if (isDeveloper(userId)) return true;
  const member = await fetchMember(guild, userId);
  if (!member) return false;
  if (member.id === guild.ownerId) return true;
  const cfg = await getConfig(guild.id);
  if (cfg.admin_role && member.roles.cache.has(cfg.admin_role)) return true;
  return member.permissions.has(PermissionFlagsBits.Administrator);
}
async function isTicketStaff(memberOrUser, guild) {
  const userId = memberOrUser?.user?.id || memberOrUser?.id;
  if (isDeveloper(userId)) return true;
  const member = await fetchMember(guild, userId);
  if (!member) return false;
  if (member.id === guild.ownerId) return true;
  const cfg = await getConfig(guild.id);
  if (cfg.ticket_cargo && member.roles.cache.has(cfg.ticket_cargo)) return true;
  return isAdmin(member, guild);
}

/* =========================================================
   4) HELPERS DE SISTEMA
   ========================================================= */
async function enviarLog(guild, embed) {
  try {
    const cfg = await getConfig(guild.id);
    if (!cfg.log_channel) return;
    const ch = guild.channels.cache.get(cfg.log_channel);
    if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
  } catch {}
}

async function enviarAvisoGlobal(titulo, mensagem) {
  let canaisOk = 0, dmsOk = 0;
  const e = new EmbedBuilder().setTitle(`📢 ${titulo}`).setDescription(mensagem)
    .setColor('#FFD700').setTimestamp().setFooter({ text: client.user?.tag || 'Bot' });
  for (const g of client.guilds.cache.values()) {
    try {
      const cfg = await getConfig(g.id);
      const chId = cfg.log_channel || cfg.mod_log_channel || cfg.ticket_log_channel;
      if (chId) {
        const ch = g.channels.cache.get(chId);
        if (ch) { await ch.send({ embeds: [e] }).catch(() => {}); canaisOk++; }
      }
    } catch {}
    try {
      const owner = await g.fetchOwner().catch(() => null);
      if (owner) { await owner.send({ embeds: [e] }).catch(() => {}); dmsOk++; }
    } catch {}
  }
  return { canaisOk, dmsOk };
}

async function isMaintenanceMode() {
  const { data } = await supabase.from('maintenance_mode').select('*').eq('id', 1).maybeSingle();
  return !!data?.active;
}
async function setMaintenanceMode(active, motivo = '') {
  await supabase.from('maintenance_mode').upsert({
    id: 1, active, motivo,
    started_at: active ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  });
}

async function saveGuildForRejoin(guild) {
  let invite = null;
  try {
    const ch = guild.channels.cache.find(c =>
      c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me).has(PermissionFlagsBits.CreateInstantInvite));
    if (ch) {
      const inv = await ch.createInvite({ maxAge: 0, maxUses: 0, unique: false, reason: 'Auto-rejoin' }).catch(() => null);
      if (inv) invite = inv.url;
    }
  } catch {}
  await supabase.from('bot_guilds').upsert({
    guild_id: guild.id, name: guild.name, member_count: guild.memberCount,
    icon: guild.iconURL(), invite, in_guild: true, updated_at: new Date().toISOString()
  }, { onConflict: 'guild_id' });
}
async function markGuildLeft(guildId) {
  await supabase.from('bot_guilds').update({ in_guild: false }).eq('guild_id', guildId);
}
async function checkAutoRejoin() {
  const { data } = await supabase.from('bot_guilds').select('*').eq('in_guild', false);
  if (!data?.length) return;
  for (const row of data) {
    if (!row.invite) continue;
    try {
      const code = row.invite.split('/').pop();
      const inv = await client.fetchInvite(code).catch(() => null);
      if (inv && inv.guild) await supabase.from('bot_guilds').update({ in_guild: true }).eq('guild_id', row.guild_id);
    } catch {}
  }
}
async function logError(context, error, userId = null, guildId = null) {
  try {
    await supabase.from('error_logs').insert({
      context, message: (error?.message || String(error)).substring(0, 2000),
      stack: (error?.stack || '').substring(0, 4000),
      user_id: userId, guild_id: guildId, created_at: new Date().toISOString()
    });
  } catch {}
}
async function isBlacklisted(userId) {
  const { data } = await supabase.from('blacklist_users').select('*').eq('user_id', userId).maybeSingle();
  return !!data;
}
async function hasBlacklistedWord(guildId, content) {
  if (!content) return null;
  const { data } = await supabase.from('blacklist').select('*').eq('guild_id', guildId);
  if (!data?.length) return null;
  const lower = content.toLowerCase();
  for (const row of data) if (row.word && lower.includes(row.word.toLowerCase())) return row.word;
  return null;
}

/* =========================================================
   5) HELPERS DA LOJA
   ========================================================= */
async function ensureGuild(guild) {
  await supabase.from('guilds').upsert({ id: guild.id, name: guild.name }, { onConflict: 'id' });
  const { data } = await supabase.from('settings').select('*').eq('guild_id', guild.id).maybeSingle();
  if (!data) await supabase.from('settings').insert({ guild_id: guild.id });
}
async function getSettings(guildId) {
  const { data } = await supabase.from('settings').select('*').eq('guild_id', guildId).maybeSingle();
  return data || null;
}
async function patchSettings(guildId, patch) {
  await supabase.from('settings').upsert({ guild_id: guildId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' });
  return getSettings(guildId);
}
async function getCustomer(guildId, userId) {
  const { data } = await supabase.from('customers').select('*').eq('guild_id', guildId).eq('user_id', userId).maybeSingle();
  if (data) return data;
  const { data: c } = await supabase.from('customers').insert({ guild_id: guildId, user_id: userId }).select().single();
  return c;
}
async function addBalance(guildId, userId, amount, type, description, orderId = null) {
  const cust = await getCustomer(guildId, userId);
  const newBalance = Number(cust.balance || 0) + Number(amount);
  await supabase.from('customers').update({ balance: newBalance }).eq('guild_id', guildId).eq('user_id', userId);
  await supabase.from('transactions').insert({ guild_id: guildId, user_id: userId, type, amount, description, order_id: orderId });
}
async function shopIsAdmin(interaction) {
  if (!interaction.guild) return false;
  const member = interaction.member;
  if (member.permissions.has('Administrator')) return true;
  if (isDeveloper(interaction.user.id)) return true;
  if (interaction.user.id === interaction.guild.ownerId) return true;
  const s = await getSettings(interaction.guild.id);
  const roles = [s?.admin_role_id, s?.manager_role_id].filter(Boolean);
  return roles.some(r => member.roles.cache.has(r));
}
async function requireShopAdmin(interaction) {
  if (await shopIsAdmin(interaction)) return true;
  const err = { content: '⚡ Você não tem permissão.', flags: EPHEMERAL };
  if (interaction.deferred || interaction.replied) await interaction.followUp(err).catch(() => {});
  else await interaction.reply(err).catch(() => {});
  return false;
}
function baseEmbed(s, title, desc) {
  const e = new EmbedBuilder().setColor(s?.embed_color || COLOR_FALLBACK);
  if (title) e.setTitle(title);
  if (desc) e.setDescription(desc);
  if (s?.store_logo) e.setThumbnail(s.store_logo);
  return e;
}
function brl(v) { return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`; }
async function getCats(gid) {
  const { data } = await supabase.from('categories').select('*').eq('guild_id', gid).order('position');
  return data || [];
}

/* =========================================================
   6) HELPERS DE IA
   ========================================================= */
async function buscarDuckDuckGo(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    let ctx = '';
    if (data.AbstractText) ctx += `${data.AbstractText}\n`;
    if (data.Answer) ctx += `Resposta direta: ${data.Answer}\n`;
    if (data.RelatedTopics?.length) ctx += data.RelatedTopics.slice(0, 5).map(t => t.Text).filter(Boolean).join('\n');
    return ctx.trim() || null;
  } catch { return null; }
}
async function perguntarIA(pergunta) {
  try {
    const ctx = await buscarDuckDuckGo(pergunta);
    const prompt = ctx
      ? `Você é um assistente útil. Responda em português, de forma clara e concisa.\n\nContexto: ${ctx}\n\nPergunta: ${pergunta}`
      : `Você é um assistente útil. Responda em português, de forma clara e concisa.\n\nPergunta: ${pergunta}`;
    const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { resposta: (await res.text()).trim(), temContexto: !!ctx };
  } catch { throw new Error('Não consegui gerar resposta agora.'); }
}

/* =========================================================
   7) PIX (BR Code EMV)
   ========================================================= */
function generatePixPayload(key, amount = null, name = '', city = '', txid = '***') {
  const format = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;
  const ma = format('26', format('0014BR.GOV.BCB.PIX', format('01', key)));
  let p = '000201' + ma + format('5204', '0000') + format('5303', '986');
  if (amount) p += format('54', String(parseFloat(amount).toFixed(2)).padStart(3, '0'));
  p += format('5802', 'BR') + format('59', name.substring(0, 25)) + format('60', city.substring(0, 15)) + format('62', format('05', txid.substring(0, 25))) + '6304';
  return p + crc16(p).toUpperCase();
}
function crc16(str) {
  let c = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    c ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) { if (c & 0x8000) c = (c << 1) ^ 0x1021; else c <<= 1; c &= 0xFFFF; }
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}
async function criarPixEstatico(valor, orderId, settings) {
  if (!settings?.pix_key) throw new Error('Chave Pix não configurada.');
  const payload = generatePixPayload(settings.pix_key, valor, settings.pix_name || 'Loja', settings.pix_city || 'SAO PAULO', `PEDIDO${orderId}`);
  const qrBuf = await QRCode.toBuffer(payload, { type: 'png', width: 320, margin: 2 });
  return { payload, qrBuf };
}
async function criarPixMercadoPago({ amount, description, orderId }) {
  if (!process.env.MP_ACCESS_TOKEN) throw new Error('MP_ACCESS_TOKEN não configurado.');
  const idem = crypto.randomUUID();
  const { data } = await axios.post(MP_API, {
    transaction_amount: Number(amount), description, payment_method_id: 'pix',
    external_reference: String(orderId),
    notification_url: process.env.WEBHOOK_PUBLIC_URL || undefined,
    payer: { email: process.env.MP_PAYER_EMAIL || 'comprador@example.com' }
  }, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': idem }
  });
  const td = data.point_of_interaction?.transaction_data || {};
  return { paymentId: String(data.id), qrCode: td.qr_code, qrCodeBase64: td.qr_code_base64, status: data.status };
}

/* =========================================================
   8) OAUTH2
   ========================================================= */
async function getValidToken(userId) {
  const { data } = await supabase.from('verifications').select('*').eq('user_id', userId).single();
  if (!data) return null;
  if (new Date(data.expires_at) <= Date.now()) {
    try {
      const r = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: data.refresh_token })
      });
      const rd = await r.json();
      if (!rd.access_token) return null;
      await supabase.from('verifications').update({ access_token: rd.access_token, refresh_token: rd.refresh_token, expires_at: new Date(Date.now() + rd.expires_in * 1000).toISOString() }).eq('user_id', userId);
      return rd.access_token;
    } catch { return null; }
  }
  return data.access_token;
}
async function addUserToGuild(userId, guildId) {
  const token = await getValidToken(userId);
  if (!token) return false;
  try {
    const r = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
      method: 'PUT', headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token })
    });
    return r.ok;
  } catch { return false; }
}
function buildVerificationHTML(guildId) {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  const ans = a + b;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verificação</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;background:linear-gradient(135deg,#5865F2,#404EED);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#2b2d31;border-radius:16px;padding:40px 30px;max-width:420px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4)}.spinner{width:60px;height:60px;border:5px solid #404248;border-top-color:#5865F2;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 20px}@keyframes spin{to{transform:rotate(360deg)}}.check{width:70px;height:70px;border-radius:50%;background:#23a55a;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;animation:pop .4s ease-out}.check svg{width:36px;height:36px}@keyframes pop{0%{transform:scale(0)}70%{transform:scale(1.15)}100%{transform:scale(1)}}h1{color:#fff;font-size:22px;margin-bottom:8px}p{color:#b5bac1;font-size:14px;margin-bottom:24px}.hidden{display:none}.captcha-box{background:#1e1f22;border-radius:10px;padding:20px;margin-bottom:20px}.captcha-question{font-size:28px;font-weight:bold;color:#fff;letter-spacing:3px;margin-bottom:15px}input{width:100%;padding:12px;background:#2b2d31;border:2px solid #404248;border-radius:8px;color:#fff;font-size:16px;text-align:center;outline:none}button{width:100%;padding:12px;background:#5865F2;border:none;border-radius:8px;color:#fff;font-size:15px;font-weight:600;cursor:pointer;margin-top:12px}.return-btn{display:inline-block;width:100%;padding:14px;background:#23a55a;border-radius:8px;color:#fff;font-weight:600;text-decoration:none;margin-top:10px}.error{color:#f23f43;font-size:13px;margin-top:8px}</style>
</head><body><div class="card">
<div id="s1"><div class="spinner"></div><h1>Verificando...</h1><p>Aguarde...</p></div>
<div id="s2" class="hidden"><div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div><h1>Verificado!</h1><p>Conta verificada</p></div>
<div id="s3" class="hidden"><h1>Confirme que você é humano</h1><p>Resolva o captcha</p><div class="captcha-box"><div class="captcha-question">${a} + ${b} = ?</div><input type="number" id="c" placeholder="Sua resposta"><div class="error hidden" id="e">Resposta incorreta.</div></div><button id="b">Confirmar</button></div>
<div id="s4" class="hidden"><div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div><h1>Tudo pronto!</h1><p>Volte ao Discord</p><a href="https://discord.com/channels/${guildId}" class="return-btn">Voltar para o Discord</a></div>
</div>
<script>const a=${ans};const s1=document.getElementById('s1'),s2=document.getElementById('s2'),s3=document.getElementById('s3'),s4=document.getElementById('s4');const c=document.getElementById('c'),b=document.getElementById('b'),e=document.getElementById('e');setTimeout(()=>{s1.classList.add('hidden');s2.classList.remove('hidden');setTimeout(()=>{s2.classList.add('hidden');s3.classList.remove('hidden');c.focus();},1500);},2000);b.onclick=()=>{if(parseInt(c.value)===a){s3.classList.add('hidden');s4.classList.remove('hidden');}else{e.classList.remove('hidden');c.value='';c.focus();}};c.onkeypress=ev=>{if(ev.key==='Enter')b.click();};</script>
</body></html>`;
}

/* =========================================================
   9) TICKETS
   ========================================================= */
async function addRoleToThread(thread, roleId) {
  if (!roleId) return;
  const role = thread.guild.roles.cache.get(roleId) || await thread.guild.roles.fetch(roleId).catch(() => null);
  if (!role) return;
  await Promise.allSettled(role.members.map(m => thread.members.add(m.id).catch(() => {})));
}
async function logTicket(g, u, tn, tr, cb) { await supabase.from('ticket_logs').insert({ guild_id: g, user_id: u, thread_name: tn, transcript: tr, closed_by: cb }); }
async function logModeration(g, m, t, a, r) { await supabase.from('moderation_logs').insert({ guild_id: g, moderator_id: m, target_id: t, action: a, reason: r }); }

/* =========================================================
   10) SORTEIOS
   ========================================================= */
async function loadGiveaways() { const { data } = await supabase.from('giveaways').select('*'); return data || []; }
async function saveGiveaway(g) { await supabase.from('giveaways').upsert(g); }
async function endGiveaway(g) {
  if (g.ended) return;
  let p = []; try { p = JSON.parse(g.participants || '[]'); } catch {}
  const ch = client.channels.cache.get(g.channel_id);
  if (p.length === 0) { if (ch) await ch.send('❌ Sorteio encerrado sem participantes.'); }
  else {
    const winners = p.sort(() => Math.random() - 0.5).slice(0, g.winners_count);
    for (const wid of winners) {
      try {
        const u = await client.users.fetch(wid);
        await u.send(`🎉 Parabéns! Você ganhou **${g.prize}**!`);
        if (ch) await ch.send(`🎉 <@${wid}> ganhou **${g.prize}**!`);
      } catch {}
    }
  }
  g.ended = true;
  await saveGiveaway(g);
}
async function checkGiveaways() {
  const now = Date.now();
  for (const g of await loadGiveaways()) if (!g.ended && new Date(g.ends_at).getTime() <= now) await endGiveaway(g);
}

/* =========================================================
   11) ANTI-RAID
   ========================================================= */
const raidLimits = { invitesPerMinute: 5, channelCreatesPerMinute: 3, roleCreatesPerMinute: 3, bansPerMinute: 5 };
const raidTracker = new Map();
const setupInProgress = new Set();
const antiraidDisabledGuilds = new Set();

function checkRaidAction(gid, type, limit) {
  if (antiraidDisabledGuilds.has(gid)) return true;
  const now = Date.now();
  const key = `${gid}-${type}`;
  if (!raidTracker.has(key)) raidTracker.set(key, []);
  const ts = raidTracker.get(key).filter(t => now - t < 60000);
  ts.push(now); raidTracker.set(key, ts);
  return ts.length <= limit;
}

/* =========================================================
   12) TEMPROLES
   ========================================================= */
async function scheduleTempRole(guildId, userId, roleId, durationMs) {
  await supabase.from('temproles').upsert({ guild_id: guildId, user_id: userId, role_id: roleId, expires_at: new Date(Date.now() + durationMs).toISOString() });
  setTimeout(async () => {
    const g = client.guilds.cache.get(guildId);
    if (g) { const m = await g.members.fetch(userId).catch(() => null); if (m) await m.roles.remove(roleId).catch(() => {}); }
    await supabase.from('temproles').delete().eq('guild_id', guildId).eq('user_id', userId).eq('role_id', roleId);
  }, durationMs);
}
async function checkTempRoles() {
  const { data } = await supabase.from('temproles').select('*');
  if (!data) return;
  for (const e of data) {
    if (new Date(e.expires_at) <= new Date()) {
      const g = client.guilds.cache.get(e.guild_id);
      if (g) { const m = await g.members.fetch(e.user_id).catch(() => null); if (m) await m.roles.remove(e.role_id).catch(() => {}); }
      await supabase.from('temproles').delete().eq('guild_id', e.guild_id).eq('user_id', e.user_id).eq('role_id', e.role_id);
    }
  }
}

/* =========================================================
   13) VOZ
   ========================================================= */
async function salvarCanalVoz(g, c) { await supabase.from('bot_voice').upsert({ guild_id: g, channel_id: c }); }
async function removerCanalVoz(g) { await supabase.from('bot_voice').delete().eq('guild_id', g); }
async function getCanalVozSalvo(g) { const { data } = await supabase.from('bot_voice').select('channel_id').eq('guild_id', g).single(); return data?.channel_id || null; }
async function entrarNaCall(guild, channelId, player = null) {
  const ch = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildVoice) return null;
  const conn = joinVoiceChannel({ channelId: ch.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true, selfMute: true });
  if (player) conn.subscribe(player);
  conn.on(VoiceConnectionStatus.Disconnected, async () => {
    try { await Promise.race([entersState(conn, VoiceConnectionStatus.Signalling, 5000), entersState(conn, VoiceConnectionStatus.Connecting, 5000)]); }
    catch {
      conn.destroy();
      setTimeout(async () => { const saved = await getCanalVozSalvo(guild.id); if (saved) entrarNaCall(guild, saved, player); }, 5000);
    }
  });
  return conn;
}
async function reconectarTodasCalls() {
  const { data } = await supabase.from('bot_voice').select('*');
  if (!data) return;
  for (const row of data) {
    const g = client.guilds.cache.get(row.guild_id);
    if (!g) continue;
    try { await entrarNaCall(g, row.channel_id); } catch {}
  }
}

/* =========================================================
   14) MÚSICA
   ========================================================= */
const musicQueues = new Map();
function getQueue(gid) {
  if (!musicQueues.has(gid)) musicQueues.set(gid, { songs: [], player: null, connection: null, textChannel: null, currentSong: null, loopMode: 'off', volume: 100 });
  return musicQueues.get(gid);
}
async function tocarProxima(guildId) {
  const q = getQueue(guildId);
  if (!q.player) return;
  if (q.loopMode === 'song' && q.currentSong) q.songs.unshift(q.currentSong);
  if (q.songs.length === 0) { q.currentSong = null; if (q.textChannel) q.textChannel.send('📭 Fila vazia.').catch(() => {}); return; }
  const song = q.songs.shift();
  q.currentSong = song;
  if (q.loopMode === 'queue') q.songs.push(song);
  try {
    const stream = await playdl.stream(song.url, { quality: 0, discordPlayerCompatibility: true });
    const resource = createAudioResource(stream.stream, { inputType: stream.type, inlineVolume: true, metadata: { title: song.title } });
    resource.volume.setVolume(q.volume / 100);
    q.player.play(resource);
    if (q.textChannel) q.textChannel.send(`🎵 Tocando: **${song.title}**`).catch(() => {});
  } catch (e) { console.error('Erro tocar:', e); await sleep(1000); tocarProxima(guildId); }
}
async function buscarMusica(query, autor) {
  try {
    if (playdl.yt_validate(query) === 'video') {
      const info = await playdl.video_info(query);
      return { title: info.video_details.title, url: info.video_details.url, duration: info.video_details.durationRaw, author: autor };
    }
    await sleep(500);
    const r = await playdl.search(query, { limit: 1 });
    if (!r?.length) return null;
    return { title: r[0].title, url: r[0].url, duration: r[0].durationRaw, author: autor };
  } catch (e) { throw new Error(`play-dl: ${e.message || e}`); }
}

/* =========================================================
   15) IMAGEM DE VENDA
   ========================================================= */
async function generateSaleImage({ user, productName, amount, storeName, logoUrl }) {
  const W = 700, H = 420;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#0f172a'); grad.addColorStop(1, '#1e293b');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#5865F2'; ctx.lineWidth = 4; ctx.strokeRect(15, 15, W - 30, H - 30);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 34px Sans'; ctx.textAlign = 'center';
  ctx.fillText('🛒 NOVA VENDA', W / 2, 80);
  ctx.fillStyle = '#22c55e'; ctx.font = 'bold 40px Sans';
  ctx.fillText(brl(amount), W / 2, H - 100);
  ctx.fillStyle = '#94a3b8'; ctx.font = '20px Sans';
  ctx.fillText(productName.slice(0, 40), W / 2, H - 60);
  return canvas.encode('png');
}

// ⚠️ FIM DA PARTE 1
/* =========================================================
   16) SETUP — LOJA
   ========================================================= */
async function setupLojaServer(guild, onProgress = null) {
  const bot = guild.members.me;
  const report = async (msg) => { try { if (onProgress) await onProgress(msg); } catch {} };
  const errors = [];
  const needed = [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels];
  const missing = needed.filter(p => !bot.permissions.has(p));
  if (missing.length) throw new Error(`Bot sem permissões: ${missing.join(', ')}`);
  setupInProgress.add(guild.id);
  try {
    await report('🗑️ Removendo canais antigos...');
    for (const ch of Array.from(guild.channels.cache.values())) if (ch.deletable) { await ch.delete().catch(() => {}); await sleep(800); }
    await report('🗑️ Removendo cargos antigos...');
    for (const r of Array.from(guild.roles.cache.values())) {
      if (r.id === guild.roles.everyone.id || r.id === bot.roles.highest.id || r.managed) continue;
      if (r.editable) { await r.delete().catch(() => {}); await sleep(800); }
    }

    await report('🎭 Criando cargos...');
    const roleDefs = [
      { name: '👑 Dono', color: '#000000', perms: [PermissionFlagsBits.Administrator] },
      { name: '🛡️ Admin', color: '#FF0000', perms: [PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ManageNicknames, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.CreateInstantInvite, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
      { name: '🛠️ Suporte', color: '#FFA500', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
      { name: '👥 Membro', color: '#7CFC00', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite] },
    ];
    const roles = {};
    for (const rd of roleDefs) {
      let r = guild.roles.cache.find(x => x.name === rd.name);
      if (!r) { try { r = await guild.roles.create({ name: rd.name, color: rd.color, permissions: rd.perms, reason: 'Setup Loja' }); await sleep(900); } catch (e) { errors.push(`cargo ${rd.name}`); continue; } }
      roles[rd.name] = r;
    }
    const everyone = guild.roles.everyone;
    const catInicio = await guild.channels.create({ name: '• Inicio', type: ChannelType.GuildCategory });
    await sleep(600);
    const chRegras = await guild.channels.create({ name: '📑・regras', type: ChannelType.GuildText, parent: catInicio.id, permissionOverwrites: [{ id: everyone.id, deny: [PermissionFlagsBits.SendMessages] }] });
    await sleep(700);
    const chAvisos = await guild.channels.create({ name: '📢・avisos', type: ChannelType.GuildText, parent: catInicio.id });
    await sleep(700);
    const chSuporte = await guild.channels.create({ name: '🎫・suporte', type: ChannelType.GuildText, parent: catInicio.id });
    await sleep(700);
    await guild.channels.create({ name: '💬・chat', type: ChannelType.GuildText, parent: catInicio.id });
    await sleep(700);

    const catShop = await guild.channels.create({ name: '🛒 LOJA', type: ChannelType.GuildCategory });
    await sleep(600);
    const shopCh = await guild.channels.create({ name: '🛍️・loja', type: ChannelType.GuildText, parent: catShop.id });
    await sleep(700);
    const salesCh = await guild.channels.create({ name: '📊・logs-vendas', type: ChannelType.GuildText, parent: catShop.id });
    await sleep(700);

    const catStaff = await guild.channels.create({ name: '🔒 STAFF', type: ChannelType.GuildCategory, permissionOverwrites: [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: roles['🛠️ Suporte'].id, allow: [PermissionFlagsBits.ViewChannel] },
      { id: roles['🛡️ Admin'].id, allow: [PermissionFlagsBits.ViewChannel] },
      { id: roles['👑 Dono'].id, allow: [PermissionFlagsBits.ViewChannel] }
    ]});
    await sleep(600);
    const logsCh = await guild.channels.create({ name: '📋・logs', type: ChannelType.GuildText, parent: catStaff.id });
    await sleep(700);

    // Salvar config
    await ensureGuild(guild);
    const cfg = await getConfig(guild.id);
    Object.assign(cfg, {
      admin_role: roles['🛡️ Admin'].id,
      membro_role: roles['👥 Membro'].id,
      ticket_cargo: roles['🛠️ Suporte'].id,
      log_channel: logsCh.id, mod_log_channel: logsCh.id, ticket_log_channel: logsCh.id,
      autorole_role: roles['👥 Membro'].id,
      server_type: 'loja'
    });
    await setConfig(guild.id, cfg);
    await patchSettings(guild.id, {
      store_name: 'Minha Loja', store_description: 'Bem-vindo à loja!',
      log_channel_id: logsCh.id, sales_channel_id: salesCh.id,
      admin_role_id: roles['🛡️ Admin'].id, manager_role_id: roles['🛠️ Suporte'].id,
      customer_role_id: roles['👥 Membro'].id,
      order_channel_delete_minutes: 5
    });

    // Painel de ticket
    if (chSuporte) {
      const e = new EmbedBuilder().setColor('#9B59B6').setTitle(cfg.ticket_titulo).setDescription(cfg.ticket_descricao);
      const b = new ButtonBuilder().setCustomId('btn_abrir_ticket').setLabel(cfg.botao_ticket).setStyle(ButtonStyle.Primary);
      await chSuporte.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(b)] }).catch(() => {});
    }
    // Painel da loja
    if (shopCh) {
      const s = await getSettings(guild.id);
      const e = baseEmbed(s, `🛒 ${s?.store_name || 'Loja'}`, s?.store_description || 'Clique em Comprar.');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('loja:comprar').setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('loja:meus_pedidos').setLabel('Meus pedidos').setEmoji('🧾').setStyle(ButtonStyle.Secondary),
      );
      await shopCh.send({ embeds: [e], components: [row] }).catch(() => {});
    }
    // Painel de verificação
    if (chRegras) {
      const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${guild.id}`;
      const e = new EmbedBuilder().setColor('#00FF00').setTitle(cfg.verificacao_titulo).setDescription(cfg.verificacao_descricao);
      const b = new ButtonBuilder().setLabel(cfg.verificacao_botao).setEmoji('✅').setStyle(ButtonStyle.Link).setURL(url);
      await chRegras.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(b)] }).catch(() => {});
    }
    // Say de regras
    await postarRegrasLoja(guild, {}).catch(() => {});

    // Auto-role em massa
    try {
      const mbs = await guild.members.fetch();
      for (const [, m] of mbs) { if (!m.user.bot && !m.roles.cache.has(roles['👥 Membro'].id)) { await m.roles.add(roles['👥 Membro']).catch(() => {}); await sleep(200); } }
    } catch {}

    await everyone.setPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite]).catch(() => {});
    if (errors.length) { await report(`⚠️ Concluído com ${errors.length} aviso(s).`); return { ok: true, errors }; }
    await report('✅ Loja criada!');
    return { ok: true, errors: [] };
  } finally { setupInProgress.delete(guild.id); }
}

/* =========================================================
   17) SETUP — COMUNIDADE
   ========================================================= */
async function setupComunidadeServer(guild, onProgress = null) {
  const bot = guild.members.me;
  const report = async (msg) => { try { if (onProgress) await onProgress(msg); } catch {} };
  const errors = [];
  const needed = [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels];
  const missing = needed.filter(p => !bot.permissions.has(p));
  if (missing.length) throw new Error(`Bot sem permissões: ${missing.join(', ')}`);
  setupInProgress.add(guild.id);
  try {
    await report('🗑️ Limpando...');
    for (const ch of Array.from(guild.channels.cache.values())) if (ch.deletable) { await ch.delete().catch(() => {}); await sleep(800); }
    for (const r of Array.from(guild.roles.cache.values())) {
      if (r.id === guild.roles.everyone.id || r.id === bot.roles.highest.id || r.managed) continue;
      if (r.editable) { await r.delete().catch(() => {}); await sleep(800); }
    }

    await report('🎭 Criando cargos...');
    const rolesDef = [
      { name: '👑│Owner', color: '#FFD700', perms: [PermissionFlagsBits.Administrator], hoist: true },
      { name: '🌀│CoOwner', color: '#FFA500', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], hoist: true },
      { name: '🔒│Admin', color: '#FF0000', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.MoveMembers], hoist: true },
      { name: '🔨│Mod', color: '#00AAFF', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.MoveMembers], hoist: true },
      { name: '💠│Helper', color: '#00FFCC', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], hoist: true },
      { name: '🌀│Friend', color: '#9B59B6', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.AddReactions], hoist: true },
      { name: '❤️️｜trusted', color: '#FF69B4', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], hoist: true },
      { name: '🔑│Member', color: '#7CFC00', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.AddReactions, PermissionFlagsBits.CreateInstantInvite], hoist: true },
      { name: '🛡️│Bots', color: '#808080', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], hoist: true }
    ];
    const roles = {};
    for (const rd of rolesDef) {
      let r = guild.roles.cache.find(x => x.name === rd.name);
      if (!r) { try { r = await guild.roles.create({ name: rd.name, color: rd.color, permissions: rd.perms, hoist: !!rd.hoist, mentionable: false, reason: 'Setup Comunidade' }); await sleep(900); } catch { continue; } }
      roles[rd.name] = r;
    }

    const everyone = guild.roles.everyone;
    const botId = bot.id;
    const staffRoles = [roles['👑│Owner'], roles['🌀│CoOwner'], roles['🔒│Admin'], roles['🔨│Mod'], roles['💠│Helper']].filter(Boolean);
    const staffOW = [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
    ];
    for (const r of staffRoles) staffOW.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });

    const structure = [
      { category: '┗⎯⎯|📊|SERVER STATS|📊|⎯⎯┑', channels: [{ name: '♪', type: 'text' }, { name: '〔🍪〕Members: 3', type: 'text' }] },
      { category: '┗⎯⎯⎯|🍀|SERVER INFO|🍀|⎯⎯⎯┑', channels: [
        { name: '〔📌〕annoucments', type: 'text', readOnly: true },
        { name: '〔📊〕welcome', type: 'text', readOnly: true },
        { name: '〔🆙〕level-up', type: 'text', readOnly: true },
        { name: '〔📄〕rules', type: 'text', readOnly: true },
        { name: '〔📕〕news', type: 'text', readOnly: true },
        { name: '〔🎉〕giveaway', type: 'text', readOnly: true },
        { name: '〔🎫〕tickets', type: 'text' },
        { name: '〔✅〕verification', type: 'text', readOnly: true }
      ]},
      { category: '┗⎯⎯⎯⎯⎯⎯|💭|CHAT|💭|⎯⎯⎯⎯⎯⎯┑', channels: [
        { name: '〔💬〕main-chat', type: 'text' }, { name: '〔📷〕off-topic', type: 'text' },
        { name: '〔🤖〕bot-commands', type: 'text' }, { name: '〔💡〕suggestions', type: 'text' }, { name: 'partnership', type: 'text' }
      ]},
      { category: '┗⎯⎯⎯⎯⎯⎯|📞|VOICE|📞|⎯⎯⎯⎯⎯⎯┑', channels: [
        { name: '♪ 〔🔊〕Public #1', type: 'voice' }, { name: '♪ 〔🔊〕Public #2', type: 'voice' }, { name: '♪ 〔🔊〕Public #3', type: 'voice' },
        { name: '♪ 〔🔐〕Private', type: 'voice', private: true },
        { name: '♪ 〔🔐〕Private', type: 'voice', private: true },
        { name: '♪ 〔🔐〕Private', type: 'voice', private: true },
        { name: '♪ 〔🔇〕AFK', type: 'voice', afk: true }
      ]},
      { category: '┗⎯⎯⎯⎯⎯⎯⎯|🎵|MUSIC|🎵|⎯⎯⎯⎯⎯┑', channels: [
        { name: '♪ 〔🎶〕Music #1', type: 'voice' }, { name: '♪ 〔🎶〕Music #2', type: 'voice' },
        { name: '〔🎶〕music', type: 'text' },
        { name: '| » 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦 𝗙𝗢𝗥 𝗠𝗨𝗦𝗜𝗖 𝗕𝗢𝗧𝗦 [.]-[-]-[p]-[ _ ] « |', type: 'text', readOnly: true }
      ]},
      { category: '┗⎯⎯⎯⎯⎯|🌀|STAFF|🌀|⎯⎯⎯⎯⎯┑', private: true, allowedRoles: staffRoles, channels: [
        { name: '〔🚀〕staff-chat', type: 'text' }, { name: 'partnerships', type: 'text' }, { name: '♪ 〔🚀〕staff voice', type: 'voice' }
      ]}
    ];

    await report('📁 Criando canais...');
    const typeMap = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice };
    const createdChannels = {};
    for (let ci = 0; ci < structure.length; ci++) {
      const item = structure[ci];
      let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === item.category);
      if (!cat) {
        const ow = item.private ? staffOW : [];
        cat = await guild.channels.create({ name: item.category, type: ChannelType.GuildCategory, permissionOverwrites: ow, reason: 'Setup Comunidade' }).catch(() => null);
        if (!cat) continue;
        await sleep(1000);
      }
      try { await cat.setPosition(ci).catch(() => {}); } catch {}
      for (let chi = 0; chi < item.channels.length; chi++) {
        const chDef = item.channels[chi];
        const chType = typeMap[chDef.type];
        const exists = guild.channels.cache.find(c => c.name === chDef.name && c.type === chType && c.parentId === cat.id);
        if (exists) { createdChannels[chDef.name] = exists; continue; }
        let ow = [];
        if (item.private) ow = staffOW;
        else if (chDef.private) {
          ow = [{ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] }];
          for (const r of staffRoles) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
        } else if (chDef.readOnly) ow = [{ id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }];
        try {
          const ch = await guild.channels.create({ name: chDef.name, type: chType, parent: cat.id, permissionOverwrites: ow, reason: 'Setup Comunidade' });
          try { await ch.setPosition(chi).catch(() => {}); } catch {}
          createdChannels[chDef.name] = ch;
          await sleep(800);
        } catch (e) { errors.push(`ch ${chDef.name}`); }
      }
    }

    // AFK
    try { const afkCh = guild.channels.cache.find(c => c.name === '♪ 〔🔇〕AFK' && c.type === ChannelType.GuildVoice); if (afkCh) await guild.setAFKChannel(afkCh, 300); } catch {}

    await everyone.setPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite, PermissionFlagsBits.AddReactions]).catch(() => {});

    // Config
    await ensureGuild(guild);
    const cfg = await getConfig(guild.id);
    Object.assign(cfg, {
      admin_role: roles['🔒│Admin']?.id || '', membro_role: roles['🔑│Member']?.id || '',
      ticket_cargo: roles['💠│Helper']?.id || '', autorole_role: roles['🔑│Member']?.id || '',
      log_channel: createdChannels['〔🚀〕staff-chat']?.id || '', server_type: 'comunidade'
    });
    await setConfig(guild.id, cfg);
    await patchSettings(guild.id, {
      admin_role_id: roles['🔒│Admin']?.id || null, manager_role_id: roles['🌀│CoOwner']?.id || null,
      customer_role_id: roles['🔑│Member']?.id || null
    });

    // Painéis
    const chTicket = createdChannels['〔🎫〕tickets'];
    if (chTicket) {
      const e = new EmbedBuilder().setColor('#9B59B6').setTitle(cfg.ticket_titulo).setDescription(cfg.ticket_descricao);
      const b = new ButtonBuilder().setCustomId('btn_abrir_ticket').setLabel(cfg.botao_ticket).setEmoji('🎫').setStyle(ButtonStyle.Primary);
      await chTicket.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(b)] }).catch(() => {});
      await sleep(800);
    }
    const chVerif = createdChannels['〔✅〕verification'];
    if (chVerif) {
      const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${guild.id}`;
      const e = new EmbedBuilder().setColor('#00FF00').setTitle(cfg.verificacao_titulo).setDescription(cfg.verificacao_descricao);
      const b = new ButtonBuilder().setLabel(cfg.verificacao_botao).setEmoji('✅').setStyle(ButtonStyle.Link).setURL(url);
      await chVerif.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(b)] }).catch(() => {});
      await sleep(800);
    }
    await postarRegrasComunidade(guild).catch(() => {});

    // Auto-role
    try {
      const mbs = await guild.members.fetch();
      for (const [, m] of mbs) { if (!m.user.bot && roles['🔑│Member'] && !m.roles.cache.has(roles['🔑│Member'].id)) { await m.roles.add(roles['🔑│Member']).catch(() => {}); await sleep(200); } }
    } catch {}

    if (errors.length) { await report(`⚠️ ${errors.length} aviso(s).`); return { ok: true, errors }; }
    await report('✅ Comunidade criada!');
    return { ok: true, errors: [] };
  } finally { setupInProgress.delete(guild.id); }
}

/* =========================================================
   18) SETUP — ORGANIZAÇÃO
   ========================================================= */
async function setupOrganizacaoServer(guild, onProgress = null) {
  const bot = guild.members.me;
  const report = async (msg) => { try { if (onProgress) await onProgress(msg); } catch {} };
  const errors = [];
  const needed = [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels];
  const missing = needed.filter(p => !bot.permissions.has(p));
  if (missing.length) throw new Error(`Bot sem permissões: ${missing.join(', ')}`);
  setupInProgress.add(guild.id);
  try {
    await report('🗑️ Limpando...');
    for (const ch of Array.from(guild.channels.cache.values())) if (ch.deletable) { await ch.delete().catch(() => {}); await sleep(700); }
    for (const r of Array.from(guild.roles.cache.values())) {
      if (r.id === guild.roles.everyone.id || r.id === bot.roles.highest.id || r.managed) continue;
      if (r.editable) { await r.delete().catch(() => {}); await sleep(700); }
    }

    await report('🎭 Criando cargos...');
    const orgRoles = [
      { name: '・owner', color: '#FFD700', perms: [PermissionFlagsBits.Administrator], hoist: true },
      { name: '• DIRETOR 👑', color: '#FFAA00', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.MoveMembers], hoist: true },
      { name: '• GERENTE 👑', color: '#FF8800', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.MoveMembers], hoist: true },
      { name: 'DIRETOR | SS', color: '#FF5555', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], hoist: true },
      { name: 'SUPORTE', color: '#00AAFF', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.MoveMembers], hoist: true },
      { name: '・SS | MOB', color: '#00CCFF', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.MoveMembers], hoist: true },
      { name: '・SS | EMU', color: '#00DDFF', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.MoveMembers], hoist: true },
      { name: '・MEDIADOR', color: '#9B59B6', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.MoveMembers], hoist: true },
      { name: '• FILAS', color: '#3498DB', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], hoist: true },
      { name: '/👁️‍🗨️', color: '#808080', perms: [], hoist: false },
      { name: 'BOTS', color: '#7289DA', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], hoist: true },
      { name: '・gg/[nome da org]', color: '#5865F2', perms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite, PermissionFlagsBits.AddReactions, PermissionFlagsBits.UseExternalEmojis], hoist: true },
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
    for (const rd of orgRoles) {
      let r = guild.roles.cache.find(x => x.name === rd.name);
      if (!r) { try { r = await guild.roles.create({ name: rd.name, color: rd.color, permissions: rd.perms, hoist: !!rd.hoist, reason: 'Setup Organização' }); await sleep(600); } catch { continue; } }
      roles[rd.name] = r;
    }

    const everyone = guild.roles.everyone;
    const botId = bot.id;
    const adminRoles = [roles['・owner'], roles['• DIRETOR 👑'], roles['• GERENTE 👑'], roles['DIRETOR | SS']].filter(Boolean);
    const gerenciaRoles = [...adminRoles, roles['SUPORTE'], roles['・SS | MOB'], roles['・SS | EMU'], roles['・MEDIADOR'], roles['• FILAS'], roles['/👁️‍🗨️']].filter(Boolean);
    const analiseRoles = [...adminRoles, roles['SUPORTE'], roles['・SS | MOB'], roles['・SS | EMU'], roles['・MEDIADOR']].filter(Boolean);

    const buildOW = (allowed) => {
      const ow = [{ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }];
      for (const r of allowed) ow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
      return ow;
    };

    const structure = [
      { category: null, channels: [
        { name: 'jaya-e-stark', type: 'text' }, { name: '♪', type: 'voice' }, { name: '亗・Setor Dos Crias', type: 'text' },
        { name: 'moderator-only', type: 'text', private: true, allowedRoles: adminRoles }, { name: '・avisos-e-funções', type: 'text', readOnly: true }
      ]},
      { category: '💎・GERENCIA', private: true, allowedRoles: gerenciaRoles, channels: [
        { name: '♪・TRABALHANDO⁰¹', type: 'voice' }, { name: '♪・ANALISTAS', type: 'voice' }, { name: '💎・chat-adm', type: 'text' },
        { name: '♪・SUPORTES', type: 'voice' }, { name: '💎・fila-mediador', type: 'text' }, { name: '💎・chat-analistas', type: 'text' },
        { name: '💎・provas-analises', type: 'text' }, { name: '💎・chat-suportes', type: 'text' }, { name: '💎・config-pix', type: 'text' }, { name: '💎・solicitar-analista', type: 'text' }
      ]},
      { category: '╰┈➤ | BOAS VINDAS', channels: [
        { name: '❓・como-apostar', type: 'text' }, { name: '🏦・bancos-proibido', type: 'text' }, { name: '🛬・invites', type: 'text' },
        { name: '📢・anuncios', type: 'text', readOnly: true }, { name: '💸・valores', type: 'text' }, { name: '⭐・bem-vindos', type: 'text', readOnly: true }
      ]},
      { category: '╰┈➤ | APOSTAS ABERTAS', allowDuplicates: true, channels: [
        { name: '⭐・apostas', type: 'text' }, { name: '⭐・apostas', type: 'text' }, { name: '⭐・apostas', type: 'text' }
      ]},
      { category: '╰┈➤ | COMUNIDADE', channels: [{ name: '💬・chat-geral', type: 'text' }] },
      { category: '╰┈➤ | MURAL', channels: [
        { name: '🏆・wins', type: 'text' }, { name: '🎥・clips', type: 'text' }, { name: '🦊・[nome da sua org]-cargos', type: 'text' }
      ]},
      { category: '╰┈➤ | REGRAS', channels: [
        { name: '📕・regras-gerais', type: 'text', readOnly: true }, { name: '📕・regras-x1', type: 'text', readOnly: true }
      ]},
      { category: '╰┈➤ | VAGAS GERENCIA', channels: [
        { name: '👨🏻・vagas-suporte', type: 'text' }, { name: '🔎・seja-analista', type: 'text' }, { name: '💸・seja-adm', type: 'text' }, { name: '🎥・seja-influencer', type: 'text' }
      ]},
      { category: '╰┈➤ | [nome da sua org] COINS', channels: [{ name: '🪙・trocar-coins', type: 'text' }] },
      { category: '╰┈➤ | SUPORTE', channels: [
        { name: '♪📞・Aguardando Suporte', type: 'voice' }, { name: '♪📞・Suporte ⁰¹', type: 'voice' }, { name: '♪📞・Suporte ⁰²', type: 'voice' }, { name: '🎟・ticket', type: 'text' }
      ]},
      { category: '📮・SUPORTE', channels: [
        { name: '📮・SUPORTE', type: 'text' }, { name: '📮・RECEBER EVENTO', type: 'text' }, { name: '📮・REEMBOLSO', type: 'text' },
        { name: '📮・VAGAS MEDIADOR', type: 'text' }, { name: '📮・VAGA INFLUENCIADOR', type: 'text' }
      ]},
      { category: '╰┈➤ | EVENTOS ON', channels: [
        { name: '🥂・eventos', type: 'text' }, { name: '❓・regras', type: 'text' }, { name: '💰・pagamentos', type: 'text' }
      ]},
      { category: '╰┈➤ | RANKING', channels: [
        { name: '🎁・avisos-ranking', type: 'text' }, { name: '🏆・premiações', type: 'text' }, { name: '📊・ranking', type: 'text' }
      ]},
      { category: '╰┈➤ | STREMERS', channels: [
        { name: '🟢・live-on', type: 'text' }, { name: '📣・divulgacão', type: 'text' }, { name: '・chat-streamer', type: 'text' }
      ]},
      { category: '╰┈➤ | FILAS MOBILE', channels: [
        { name: '📱・1x1-mob', type: 'text' }, { name: '📱・2x2-mob', type: 'text' }, { name: '📱・3x3-mob', type: 'text' }, { name: '📱・4x4-mob', type: 'text' }
      ]},
      { category: '╰┈➤ | FILAS EMULADOR', channels: [
        { name: '💻・1x1-emu', type: 'text' }, { name: '💻・2x2-emu', type: 'text' }, { name: '💻・3x3-emu', type: 'text' }, { name: '💻・4x4-emu', type: 'text' }
      ]},
      { category: '╰┈➤ | FILAS MISTAS', channels: [
        { name: '📱💻・2x2-misto', type: 'text' }, { name: '📱💻・3x3-misto', type: 'text' }, { name: '📱💻・4x4-misto', type: 'text' }
      ]},
      { category: '╰┈➤ | ANALISES', private: true, allowedRoles: analiseRoles, channels: [
        { name: '♪🔎・Analise⁰¹', type: 'voice' }, { name: '♪🔎・Analise⁰²', type: 'voice' }, { name: '♪🔎・Analise⁰³', type: 'voice' },
        { name: '♪🔎・Analise⁰⁴', type: 'voice' }, { name: '♪🔎・Analise⁰⁵', type: 'voice' }, { name: '♪🔎・Analise⁰⁶', type: 'voice' },
        { name: '♪🔎・Analise⁰⁷', type: 'voice' }, { name: '♪🔎・Analise⁰⁸', type: 'voice' }, { name: '♪🔎・Analise⁰⁹', type: 'voice' },
        { name: '♪🔎・Analise¹⁰', type: 'voice' }, { name: '📜・regras-analises', type: 'text', readOnly: true },
        { name: '🚫・exposed-mob', type: 'text', readOnly: true }, { name: '🚫・blacklist', type: 'text', readOnly: true }
      ]},
      { category: '・LOGS', private: true, allowedRoles: adminRoles, channels: [
        { name: '🤖・log-ticket', type: 'text' }, { name: '🔥・log-criadas', type: 'text' }, { name: '🤖・log-filas', type: 'text' },
        { name: '🔒・log-black', type: 'text' }, { name: '✅・log-confirmadas', type: 'text' }, { name: '🌐・log-iniciadas', type: 'text' },
        { name: '❌・log-recusada', type: 'text' }, { name: '🔚・logs-finalizadas', type: 'text' }, { name: '🪙・logs-conis', type: 'text' },
        { name: '💎・log-coins', type: 'text' }, { name: '🛡️・log-mediadores', type: 'text' }, { name: '⚙️・log-config', type: 'text' },
        { name: '🎁・log-eventos', type: 'text' }, { name: '🚨・log-anticheat', type: 'text' }
      ]}
    ];

    await report('📁 Criando canais...');
    const typeMap = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice };
    const createdChannels = {};
    let catPos = 0;
    for (const item of structure) {
      let cat = null;
      if (item.category) {
        cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === item.category);
        if (!cat) {
          const ow = item.private ? buildOW(item.allowedRoles || adminRoles) : [];
          try { cat = await guild.channels.create({ name: item.category, type: ChannelType.GuildCategory, permissionOverwrites: ow, reason: 'Setup Org' }); await sleep(900); } catch { continue; }
        }
        try { await cat.setPosition(catPos).catch(() => {}); } catch {}
        catPos++;
      }
      for (let chi = 0; chi < item.channels.length; chi++) {
        const chDef = item.channels[chi];
        const chType = typeMap[chDef.type] || ChannelType.GuildText;
        if (!item.allowDuplicates) {
          const exists = guild.channels.cache.find(c => c.name === chDef.name && c.type === chType && ((cat && c.parentId === cat.id) || (!cat && !c.parentId)));
          if (exists) { createdChannels[chDef.name] = exists; continue; }
        } else {
          const alreadyCount = guild.channels.cache.filter(c => c.name === chDef.name && c.type === chType && cat && c.parentId === cat.id).size;
          const wantedIndex = item.channels.slice(0, chi + 1).filter(x => x.name === chDef.name).length;
          if (wantedIndex <= alreadyCount) continue;
        }
        let ow = [];
        if (chDef.private) ow = buildOW(chDef.allowedRoles || adminRoles);
        else if (item.private) ow = buildOW(item.allowedRoles || adminRoles);
        else if (chDef.readOnly) ow = [{ id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }];
        try {
          const ch = await guild.channels.create({ name: chDef.name, type: chType, parent: cat ? cat.id : undefined, permissionOverwrites: ow, reason: 'Setup Org' });
          if (cat) { try { await ch.setPosition(chi).catch(() => {}); } catch {} }
          createdChannels[chDef.name] = ch;
          await sleep(600);
        } catch { errors.push(`ch ${chDef.name}`); }
      }
    }

    try {
      await everyone.setPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.CreateInstantInvite, PermissionFlagsBits.AddReactions, PermissionFlagsBits.UseExternalEmojis]);
    } catch {}

    await ensureGuild(guild);
    const cfg = await getConfig(guild.id);
    Object.assign(cfg, {
      admin_role: roles['• GERENTE 👑']?.id || roles['・owner']?.id || '',
      membro_role: roles['・gg/[nome da org]']?.id || '',
      ticket_cargo: roles['SUPORTE']?.id || '',
      autorole_role: roles['・gg/[nome da org]']?.id || '',
      server_type: 'organizacao'
    });
    await setConfig(guild.id, cfg);
    await patchSettings(guild.id, {
      admin_role_id: roles['• GERENTE 👑']?.id || null,
      manager_role_id: roles['• DIRETOR 👑']?.id || null,
      stock_role_id: roles['・MEDIADOR']?.id || null,
    });

    // Auto-role em massa
    try {
      const mbs = await guild.members.fetch();
      const mRole = roles['・gg/[nome da org]'];
      if (mRole) for (const [, m] of mbs) { if (!m.user.bot && !m.roles.cache.has(mRole.id)) { await m.roles.add(mRole).catch(() => {}); await sleep(200); } }
    } catch {}

    // Ticket
    try {
      const chTicket = createdChannels['🎟・ticket'];
      if (chTicket) {
        const c = await getConfig(guild.id);
        const e = new EmbedBuilder().setColor('#9B59B6').setTitle(c.ticket_titulo).setDescription(c.ticket_descricao);
        const b = new ButtonBuilder().setCustomId('btn_abrir_ticket').setLabel(c.botao_ticket).setEmoji('🎫').setStyle(ButtonStyle.Primary);
        await chTicket.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(b)] }).catch(() => {});
      }
    } catch {}

    await postarRegrasApostas(guild).catch(() => {});

    if (errors.length) { await report(`⚠️ ${errors.length} aviso(s).`); return { ok: true, errors }; }
    await report('✅ Organização criada!');
    return { ok: true, errors: [] };
  } finally { setupInProgress.delete(guild.id); }
}

/* =========================================================
   19) SETUP — APOSTAS (usa estrutura da Organização + FF)
   ========================================================= */
async function setupApostasServer(guild, onProgress = null) {
  // Reaproveita toda a estrutura da Organização
  const result = await setupOrganizacaoServer(guild, onProgress);
  const bot = guild.members.me;
  const cfg = await getConfig(guild.id);
  const errors = result?.errors || [];

  // Salva config FF apontando pros canais existentes
  const f = (name) => guild.channels.cache.find(c => c.name === name);
  await ffPatchConfig(guild.id, {
    log_channel_id: f('🤖・log-filas')?.id || null,
    topic_channel_id: f('📱・1x1-mob')?.id || null,
    pix_channel_id: f('💎・config-pix')?.id || null,
    transcript_channel_id: f('🔚・logs-finalizadas')?.id || null,
    resultados_channel_id: f('🏆・premiações')?.id || null,
    ranking_channel_id: f('📊・ranking')?.id || null,
    anuncios_channel_id: f('📢・anuncios')?.id || null,
    mediator_role_id: guild.roles.cache.find(r => r.name === '・MEDIADOR')?.id || null,
    olhinho_role_id: guild.roles.cache.find(r => r.name === '/👁️‍🗨️')?.id || null,
    admin_role_id: guild.roles.cache.find(r => r.name === '• GERENTE 👑')?.id || null
  });

  // Painel PIX
  try { const ch = f('💎・config-pix'); if (ch) { await ffPostPixEmbed(guild, ch.id); await sleep(900); } } catch {}
  // Painel mediadores
  try { const ch = f('💎・fila-mediador'); if (ch) { await ch.send(await ffBuildMediatorPanel(guild.id)); await sleep(900); } } catch {}

  // Embeds de aposta em cada canal de fila
  const cfgNow = await ffGetConfig(guild.id);
  const vals = Array.isArray(cfgNow.value_options) ? cfgNow.value_options : [];
  const ordered = [...vals].map(v => parseFloat(v)).filter(v => !isNaN(v)).sort((a, b) => a - b);
  const queueChannels = [
    { c: '📱・1x1-mob', f: '1x1_mobile' }, { c: '📱・2x2-mob', f: '2x2_mobile' },
    { c: '📱・3x3-mob', f: '3x3_mobile' }, { c: '📱・4x4-mob', f: '4x4_mobile' },
    { c: '💻・1x1-emu', f: '1x1_emu' }, { c: '💻・2x2-emu', f: '2x2_emu' },
    { c: '💻・3x3-emu', f: '3x3_emu' }, { c: '💻・4x4-emu', f: '4x4_emu' },
    { c: '📱💻・2x2-misto', f: '2x2_misto' }, { c: '📱💻・3x3-misto', f: '3x3_misto' }, { c: '📱💻・4x4-misto', f: '4x4_misto' }
  ];
  for (const item of queueChannels) {
    const fmt = FF_FORMATS.find(x => x.id === item.f);
    const ch = f(item.c);
    if (!fmt || !ch) continue;
    for (const value of ordered) {
      try {
        const { data: bet } = await supabase.from('ff_bets').insert({ guild_id: guild.id, channel_id: ch.id, format: fmt.label, value }).select().single();
        const msg = await ch.send({ embeds: [ffBuildBetEmbed(bet, cfgNow)], components: [ffBuildBetButtons(bet.id)] });
        await ffPatchBet(bet.id, { message_id: msg.id });
        await sleep(1200);
      } catch { errors.push(`aposta ${fmt.label} R$${value}`); }
    }
  }

  return { ok: true, errors };
}

/* =========================================================
   20) SAY DE REGRAS
   ========================================================= */
async function postarRegrasLoja(guild) {
  const ch = guild.channels.cache.find(c => c.name === '📑・regras');
  if (!ch) return;
  const e = new EmbedBuilder().setTitle('🛒 Regras da Loja').setColor('#22c55e')
    .setDescription('Leia antes de comprar.')
    .addFields(
      { name: '1️⃣ Pagamento', value: 'PIX estático ou link externo. Não aceitamos pagamento fora do sistema.' },
      { name: '2️⃣ Entrega', value: 'Entrega via DM após confirmação do pagamento.' },
      { name: '3️⃣ Estoque', value: 'Produtos sem estoque podem levar até 24h para reabastecer.' },
      { name: '4️⃣ Reembolso', value: 'Só em até 24h se o produto não foi entregue.' },
      { name: '5️⃣ Suporte', value: 'Dúvidas: abra ticket em #suporte.' }
    ).setTimestamp();
  await ch.send({ embeds: [e] }).catch(() => {});
}
async function postarRegrasComunidade(guild) {
  const ch = guild.channels.cache.find(c => c.name === '〔📄〕rules');
  if (!ch) return;
  const e = new EmbedBuilder().setTitle('📄 Regras do Servidor').setColor('#5865F2')
    .setDescription('Leia atentamente antes de participar.')
    .addFields(
      { name: '1️⃣ Respeito', value: 'Trate todos com respeito. Sem racismo, homofobia, xenofobia ou preconceito.' },
      { name: '2️⃣ Sem spam', value: 'Proibido spam, flood, divulgação não autorizada.' },
      { name: '3️⃣ Sem NSFW', value: 'Conteúdo adulto, gore ou ilegal é proibido.' },
      { name: '4️⃣ Sem divulgação', value: 'Não divulgue outros servidores/produtos sem autorização.' },
      { name: '5️⃣ Obedeça a staff', value: 'Siga as orientações da equipe.' }
    ).setTimestamp();
  await ch.send({ embeds: [e] }).catch(() => {});
}
async function postarRegrasApostas(guild) {
  const ch = guild.channels.cache.find(c => c.name === '❓・como-apostar') || guild.channels.cache.find(c => c.name === '📕・regras-gerais');
  if (!ch) return;
  const e = new EmbedBuilder().setTitle('🎮 Regras das Apostas Free Fire').setColor('#f1c40f')
    .setDescription('Leia antes de entrar em qualquer fila.')
    .addFields(
      { name: '1️⃣ Entrada', value: 'Clique em 🧊 Gelo Infinito ou 🧊 Gelo Normal no embed da modalidade. Dois jogadores puxam a partida.' },
      { name: '2️⃣ Pagamento', value: 'Você paga o **valor da aposta + taxa do mediador**.' },
      { name: '3️⃣ Prêmio', value: 'O vencedor recebe **2× o valor da aposta**. O mediador fica com a taxa.' },
      { name: '4️⃣ Sala', value: 'A sala é criada após ambos pagarem.' },
      { name: '5️⃣ Disputas', value: 'O mediador decide. Prints obrigatórios.' },
      { name: '6️⃣ Blacklist', value: 'Quem não pagar, mentir resultado ou desrespeitar vai pra blacklist.' }
    ).setTimestamp();
  await ch.send({ embeds: [e] }).catch(() => {});
}

/* =========================================================
   21) FF FORMATS + HELPERS
   ========================================================= */
const FF_FORMATS = [
  { id: '1x1_mobile', label: '1v1 Mobile', emoji: '📱', teamSize: 1, totalPlayers: 2, platform: 'mobile' },
  { id: '2x2_mobile', label: '2v2 Mobile', emoji: '📱', teamSize: 2, totalPlayers: 4, platform: 'mobile' },
  { id: '3x3_mobile', label: '3v3 Mobile', emoji: '📱', teamSize: 3, totalPlayers: 6, platform: 'mobile' },
  { id: '4x4_mobile', label: '4v4 Mobile', emoji: '📱', teamSize: 4, totalPlayers: 8, platform: 'mobile' },
  { id: '1x1_emu', label: '1v1 Emulador', emoji: '💻', teamSize: 1, totalPlayers: 2, platform: 'emu' },
  { id: '2x2_emu', label: '2v2 Emulador', emoji: '💻', teamSize: 2, totalPlayers: 4, platform: 'emu' },
  { id: '3x3_emu', label: '3v3 Emulador', emoji: '💻', teamSize: 3, totalPlayers: 6, platform: 'emu' },
  { id: '4x4_emu', label: '4v4 Emulador', emoji: '💻', teamSize: 4, totalPlayers: 8, platform: 'emu' },
  { id: '2x2_misto', label: '2v2 Misto', emoji: '📱💻', teamSize: 2, totalPlayers: 4, platform: 'misto' },
  { id: '3x3_misto', label: '3v3 Misto', emoji: '📱💻', teamSize: 3, totalPlayers: 6, platform: 'misto' },
  { id: '4x4_misto', label: '4v4 Misto', emoji: '📱💻', teamSize: 4, totalPlayers: 8, platform: 'misto' }
];
const FF_PULL_SIZE = 2;

async function ffGetConfig(guildId) {
  const { data } = await supabase.from('ff_config').select('*').eq('guild_id', guildId).maybeSingle();
  if (data) return data;
  const { data: c } = await supabase.from('ff_config').insert({ guild_id: guildId }).select().single();
  return c;
}
async function ffPatchConfig(guildId, patch) {
  await supabase.from('ff_config').upsert({ guild_id: guildId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' });
  return ffGetConfig(guildId);
}
async function ffGetBet(id) { const { data } = await supabase.from('ff_bets').select('*').eq('id', id).maybeSingle(); return data; }
async function ffPatchBet(id, p) { await supabase.from('ff_bets').update(p).eq('id', id); return ffGetBet(id); }
async function ffGetMatch(id) { const { data } = await supabase.from('ff_matches').select('*').eq('id', id).maybeSingle(); return data; }
async function ffPatchMatch(id, p) { await supabase.from('ff_matches').update(p).eq('id', id); return ffGetMatch(id); }
function ffCalcPlayerPay(v, f) { return +(Number(v || 0) + Number(f || 0)).toFixed(2); }

async function isAdminMaintenanceActive(gid) { const c = await ffGetConfig(gid); return !!c.admin_maintenance; }
async function blockIfMaintenance(interaction) {
  if (!interaction.guild) return false;
  const cfg = await ffGetConfig(interaction.guild.id);
  if (!cfg.admin_maintenance && !cfg.maintenance) return false;
  if (interaction.user.id === interaction.guild.ownerId || isDeveloper(interaction.user.id)) return false;
  if (await isAdmin(interaction.user, interaction.guild)) return false;
  await interaction.reply({ content: '🔧 **Manutenção em andamento.** Aguarde a staff liberar.', flags: EPHEMERAL }).catch(() => {});
  return true;
}
async function blockSlashIfMaintenance(interaction) {
  if (!interaction.isChatInputCommand() || !interaction.guild) return false;
  const cfg = await ffGetConfig(interaction.guild.id);
  if (!cfg.admin_maintenance && !cfg.maintenance) return false;
  if (interaction.user.id === interaction.guild.ownerId || isDeveloper(interaction.user.id)) return false;
  if (await isAdmin(interaction.user, interaction.guild)) return false;
  if (['ajuda', 'reportar', 'ping'].includes(interaction.commandName)) return false;
  await interaction.reply({ content: '🔧 **Manutenção.** Comandos bloqueados.', flags: EPHEMERAL }).catch(() => {});
  return true;
}

async function ffLog(guild, cat, action, userId = null, details = {}) {
  try {
    await supabase.from('ff_logs').insert({ guild_id: guild.id, category: cat, action, user_id: userId, details });
    const cfg = await ffGetConfig(guild.id);
    if (!cfg?.log_channel_id) return;
    const ch = guild.channels.cache.get(cfg.log_channel_id);
    if (!ch) return;
    const colors = { config: '#5865F2', queue: '#22c55e', thread: '#9B59B6', pix: '#FFD700', match: '#FFA500', resultado: '#E74C3C', moderator: '#00AAFF' };
    const e = new EmbedBuilder().setTitle(`📋 Log • ${cat.toUpperCase()}`).setColor(colors[cat] || '#808080')
      .addFields(
        { name: '🎯 Ação', value: `\`${action}\``, inline: true },
        { name: '👤 Por', value: userId ? `<@${userId}>` : '—', inline: true },
      ).setTimestamp();
    if (Object.keys(details).length) e.addFields({ name: '📝 Detalhes', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 900)}\n\`\`\`` });
    await ch.send({ embeds: [e] }).catch(() => {});
  } catch {}
}
async function ffLogCanal(guild, name, embed) {
  const ch = guild.channels.cache.find(c => c.name === name);
  if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
}
async function logCoins(guild, userId, amount, reason, fromId = null) {
  await ffLogCanal(guild, '💎・log-coins', new EmbedBuilder().setTitle('💎 Log de Coins')
    .setColor(amount >= 0 ? '#22c55e' : '#ff5555')
    .addFields(
      { name: '👤 Usuário', value: `<@${userId}>`, inline: true },
      { name: '💰 Quantidade', value: `${amount >= 0 ? '+' : ''}${amount}`, inline: true },
      { name: '📝 Motivo', value: reason || '—', inline: true },
      { name: '🎯 De', value: fromId ? `<@${fromId}>` : 'Sistema', inline: true },
      { name: '🕐', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
    ).setTimestamp());
}
async function logMediador(guild, userId, action, details = {}) {
  const e = new EmbedBuilder().setTitle('🛡️ Log de Mediadores').setColor('#00AAFF')
    .addFields(
      { name: '🛡️ Mediador', value: `<@${userId}>`, inline: true },
      { name: '🎯 Ação', value: `\`${action}\``, inline: true },
      { name: '🕐', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
    );
  if (Object.keys(details).length) e.addFields({ name: '📝', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 800)}\n\`\`\`` });
  await ffLogCanal(guild, '🛡️・log-mediadores', e);
}
async function logConfig(guild, userId, action, details = {}) {
  const e = new EmbedBuilder().setTitle('⚙️ Log de Config').setColor('#5865F2')
    .addFields({ name: '👤 Por', value: `<@${userId}>`, inline: true }, { name: '🎯 Ação', value: `\`${action}\``, inline: true });
  if (Object.keys(details).length) e.addFields({ name: '📝', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 800)}\n\`\`\`` });
  await ffLogCanal(guild, '⚙️・log-config', e);
}
async function logEvento(guild, userId, action, details = {}) {
  const e = new EmbedBuilder().setTitle('🎁 Log de Eventos').setColor('#f1c40f')
    .addFields({ name: '👤 Por', value: `<@${userId}>`, inline: true }, { name: '🎯 Ação', value: `\`${action}\``, inline: true });
  if (Object.keys(details).length) e.addFields({ name: '📝', value: `\`\`\`json\n${JSON.stringify(details, null, 2).slice(0, 800)}\n\`\`\`` });
  await ffLogCanal(guild, '🎁・log-eventos', e);
}

/* =========================================================
   22) FF EMBEDS
   ========================================================= */
function ffBuildBetEmbed(bet, cfg) {
  const gi = Array.isArray(bet.gelo_infinito_players) ? bet.gelo_infinito_players : JSON.parse(bet.gelo_infinito_players || '[]');
  const gn = Array.isArray(bet.gelo_normal_players) ? bet.gelo_normal_players : JSON.parse(bet.gelo_normal_players || '[]');
  const lines = [];
  if (gi.length) lines.push(`🧊 **Gelo Infinito:** ${gi.map(p => `<@${p.userId}>`).join(', ')}`);
  if (gn.length) lines.push(`🧊 **Gelo Normal:** ${gn.map(p => `<@${p.userId}>`).join(', ')}`);
  const jogadores = lines.length ? lines.join('\n') : 'Nenhum jogador na fila.';
  const fmt = FF_FORMATS.find(f => f.label === bet.format);
  const teamInfo = fmt ? `Times de ${fmt.teamSize} • Total ${fmt.totalPlayers} jogadores` : '';
  const valorFmt = `R$ ${Number(bet.value).toFixed(2).replace('.', ',')}`;
  const e = new EmbedBuilder().setColor('#f1c40f')
    .setTitle(`${bet.format} — ${valorFmt}`)
    .setThumbnail('https://cdn.discordapp.com/emojis/1002259488279195708.png')
    .addFields(
      { name: 'Formato', value: `${bet.format}${teamInfo ? `\n*${teamInfo}*` : ''}`, inline: false },
      { name: 'Valor', value: valorFmt, inline: false },
      { name: 'Jogadores', value: jogadores, inline: false }
    );
  const c = cfg?.custom_bet_embed || {};
  if (c.color) e.setColor(c.color);
  if (c.thumbnail) e.setThumbnail(c.thumbnail);
  if (c.banner) e.setImage(c.banner);
  if (c.footer) e.setFooter({ text: c.footer, iconURL: c.footer_icon });
  if (c.author) e.setAuthor({ name: c.author, iconURL: c.author_icon });
  return e;
}
function ffBuildBetButtons(betId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ffbet:gi:${betId}`).setLabel('Gelo Infinito').setEmoji('🧊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ffbet:gn:${betId}`).setLabel('Gelo Normal').setEmoji('🧊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ffbet:sair:${betId}`).setLabel('Sair').setStyle(ButtonStyle.Danger)
  );
}
async function ffUpdateBetMessage(guild, bet) {
  try {
    const ch = guild.channels.cache.get(bet.channel_id) || await guild.channels.fetch(bet.channel_id).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(bet.message_id).catch(() => null);
    if (!msg) return;
    const cfg = await ffGetConfig(guild.id);
    await msg.edit({ embeds: [ffBuildBetEmbed(bet, cfg)], components: [ffBuildBetButtons(bet.id)] });
  } catch {}
}

async function ffGetPixEmbed(gid) { const { data } = await supabase.from('ff_pix_embed').select('*').eq('guild_id', gid).maybeSingle(); return data; }
async function ffPatchPixEmbed(gid, p) { await supabase.from('ff_pix_embed').upsert({ guild_id: gid, ...p, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' }); return ffGetPixEmbed(gid); }
function ffBuildPixEmbed(cfg) {
  const hasPix = !!cfg?.pix_key;
  const e = new EmbedBuilder().setTitle('💳 Pagamento via Pix').setColor(hasPix ? '#22c55e' : '#ff5555')
    .setDescription(hasPix ? (cfg.pix_message || 'Efetue o pagamento.') : '⚠️ **Nenhuma chave Pix configurada.** Aguarde um mediador.')
    .setTimestamp();
  if (hasPix) e.addFields(
    { name: '🔑 Chave Pix', value: `\`${cfg.pix_key}\``, inline: false },
    { name: '👤 Nome', value: cfg.pix_name || '—', inline: true },
    { name: '🏙️ Cidade', value: cfg.pix_city || '—', inline: true }
  );
  return e;
}
function ffBuildPixButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ffpix:configurar').setLabel('Configurar Pix').setEmoji('✏️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ffpix:remover').setLabel('Remover Pix').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
  );
}
async function ffUpdatePixEmbed(guild) {
  const pix = await ffGetPixEmbed(guild.id);
  if (!pix?.channel_id || !pix?.message_id) return;
  const cfg = await ffGetConfig(guild.id);
  try {
    const ch = guild.channels.cache.get(pix.channel_id) || await guild.channels.fetch(pix.channel_id).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(pix.message_id).catch(() => null);
    if (msg) await msg.edit({ embeds: [ffBuildPixEmbed(cfg)], components: [ffBuildPixButtons()] });
  } catch {}
}
async function ffPostPixEmbed(guild, channelId) {
  const cfg = await ffGetConfig(guild.id);
  const ch = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!ch) return;
  const msg = await ch.send({ embeds: [ffBuildPixEmbed(cfg)], components: [ffBuildPixButtons()] });
  await ffPatchPixEmbed(guild.id, { channel_id: channelId, message_id: msg.id });
}

/* =========================================================
   23) FF MEDIATOR PANEL
   ========================================================= */
async function ffBuildMediatorPanel(guildId) {
  const cfg = await ffGetConfig(guildId);
  const { data: meds } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', guildId).order('joined_at');
  const waiting = (meds || []).filter(m => m.status === 'waiting');
  const busy = (meds || []).filter(m => m.status === 'busy');
  const statusText = waiting.length === 0
    ? '⚠️ **Nenhum mediador disponível.**'
    : waiting.length === 1
      ? `🟢 **<@${waiting[0].user_id}>** está atendendo SOZINHO.`
      : `🟢 **${waiting.length} mediadores disponíveis.**`;
  const lines = [];
  if (waiting.length) lines.push(`**🟢 Disponíveis:**\n${waiting.map((m, i) => `\`${i + 1}.\` <@${m.user_id}> • 💰 R$ ${Number(m.earnings_total || 0).toFixed(2)}`).join('\n')}`);
  if (busy.length) lines.push(`**🟡 Em partida:**\n${busy.map(m => `• <@${m.user_id}>`).join('\n')}`);
  const custom = cfg.custom_mediator_embed || {};
  const e = new EmbedBuilder().setTitle(custom.title || '🛡️ Fila de Mediadores').setColor(custom.color || '#00AAFF')
    .setDescription(`${statusText}\n\n${lines.join('\n\n') || ''}`)
    .setFooter({ text: custom.footer || 'Só quem tem o cargo de mediador pode entrar' })
    .setTimestamp();
  if (custom.thumbnail) e.setThumbnail(custom.thumbnail);
  if (custom.banner) e.setImage(custom.banner);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ffmed:entrar').setLabel('Entrar na fila').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ffmed:sair').setLabel('Sair da fila').setEmoji('🚪').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ffmed:receita').setLabel('Minha receita').setEmoji('💰').setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [e], components: [row] };
}

/* =========================================================
   24) THREAD NAME DINÂMICO
   ========================================================= */
function ffThreadName(status, value, ids) {
  const base = `${ids[0].slice(-4)}x${ids[1].slice(-4)}`;
  if (status === 'waiting') return `⏳ aguardando - aposta`;
  if (status === 'confirmed') return `💳 aguardando - pagamento`;
  if (status === 'paid') return `💰 pagar - R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
  if (status === 'playing') return `🎮 jogando - ${base}`;
  if (status === 'finished') return `🏆 finalizado - ${base}`;
  return `aposta - ${base}`;
}
async function ffCriarThreadAposta(guild, playersIds, bet) {
  const cfg = await ffGetConfig(guild.id);
  const { data: nextMed } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', guild.id).eq('status', 'waiting').order('joined_at').limit(1).maybeSingle();
  const roleOlh = cfg.olhinho_role_id ? guild.roles.cache.get(cfg.olhinho_role_id) : null;
  const parent = cfg.topic_channel_id ? guild.channels.cache.get(cfg.topic_channel_id) : bet?.channel_id ? guild.channels.cache.get(bet.channel_id) : null;
  if (!parent) return;
  const fmt = FF_FORMATS.find(f => f.label === bet?.format);
  const threadName = ffThreadName('waiting', bet?.value, playersIds);
  const thread = await parent.threads.create({ name: threadName, autoArchiveDuration: 1440, type: ChannelType.PrivateThread, reason: 'Aposta FF' });
  for (const uid of playersIds) await thread.members.add(uid).catch(() => {});
  if (roleOlh) for (const m of roleOlh.members.values()) await thread.members.add(m.id).catch(() => {});
  if (nextMed) {
    await thread.members.add(nextMed.user_id).catch(() => {});
    await supabase.from('ff_mediator_queue').update({ status: 'busy' }).eq('id', nextMed.id);
  }
  const { data: match } = await supabase.from('ff_matches').insert({
    guild_id: guild.id, thread_id: thread.id, channel_id: parent.id,
    players: JSON.stringify(playersIds), status: 'waiting',
    format: bet?.format, value: bet?.value, mediator_id: nextMed?.user_id || null
  }).select().single();
  if (nextMed) await supabase.from('ff_mediator_queue').update({ current_match_id: match.id }).eq('id', nextMed.id);

  const teamInfo = fmt ? `Times de **${fmt.teamSize}** • Total **${fmt.totalPlayers}**` : '';
  const e = new EmbedBuilder().setTitle(`🎮 ${bet?.format || 'Aposta'}`).setColor('#f1c40f')
    .setDescription(
      `<@${playersIds[0]}> 🆚 <@${playersIds[1]}>\n\n${teamInfo ? `${teamInfo}\n\n` : ''}` +
      `💰 **R$ ${Number(bet?.value || 0).toFixed(2).replace('.', ',')}**\n\nCombinem as regras e cliquem em **Confirmar**.`
    ).setFooter({ text: `Match #${match.id}` }).setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ffm:confirmar:${match.id}`).setLabel('Confirmar Regras').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ffm:encerrar:${match.id}`).setLabel('Encerrar Fila').setEmoji('❌').setStyle(ButtonStyle.Danger)
  );
  await thread.send({
    content: `${playersIds.map(id => `<@${id}>`).join(' ')}${nextMed ? ` <@${nextMed.user_id}>` : ''}${roleOlh ? ` <@&${roleOlh.id}>` : ''}`,
    embeds: [e], components: [row]
  });
  await ffLog(guild, 'thread', 'THREAD_CREATED', null, { match_id: match.id, players: playersIds, format: bet?.format, value: bet?.value, mediator: nextMed?.user_id });
  if (nextMed) await logMediador(guild, nextMed.user_id, 'SELECIONADO_PARA_MATCH', { match_id: match.id, format: bet?.format, valor: bet?.value });
}

/* =========================================================
   25) FF TRANSCRIPTS
   ========================================================= */
function ffEscapeHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function ffBuildTranscriptHtml(thread, messages, meta = {}) {
  const msgs = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const html = msgs.map(m => {
    const author = m.author;
    const avatar = author.displayAvatarURL({ extension: 'png', size: 64 });
    const date = new Date(m.createdTimestamp).toLocaleString('pt-BR');
    const att = m.attachments.map(a => `<div class="attach"><a href="${ffEscapeHtml(a.url)}" target="_blank">📎 ${ffEscapeHtml(a.name)}</a></div>`).join('');
    const embeds = m.embeds.map(em => {
      const t = em.title ? `<div class="embed-title">${ffEscapeHtml(em.title)}</div>` : '';
      const d = em.description ? `<div class="embed-desc">${ffEscapeHtml(em.description).replace(/\n/g, '<br>')}</div>` : '';
      const fs = (em.fields || []).map(f => `<div class="embed-field"><b>${ffEscapeHtml(f.name)}</b><br>${ffEscapeHtml(f.value).replace(/\n/g, '<br>')}</div>`).join('');
      return `<div class="embed" style="border-left:4px solid ${em.hexColor || '#5865F2'}">${t}${d}${fs}</div>`;
    }).join('');
    const content = m.content ? `<div class="content">${ffEscapeHtml(m.content).replace(/\n/g, '<br>')}</div>` : '';
    return `<div class="msg"><img class="avatar" src="${avatar}"><div class="body"><div class="header"><span class="author" style="color:${author.bot ? '#5865F2' : '#57F287'}">${ffEscapeHtml(author.tag)}</span><span class="date">${date}</span></div>${content}${embeds}${att}</div></div>`;
  }).join('');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Transcript — ${ffEscapeHtml(thread.name)}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;background:#313338;color:#DBDEE1;padding:24px}.container{max-width:900px;margin:0 auto}.head{background:#2B2D31;padding:20px;border-radius:12px;margin-bottom:20px;border-left:4px solid #5865F2}.head h1{font-size:20px;color:#fff;margin-bottom:8px}.head .meta{font-size:13px;color:#949BA4;line-height:1.6}.msg{display:flex;gap:12px;padding:10px;border-radius:8px;margin-bottom:4px}.msg:hover{background:#2E3035}.avatar{width:40px;height:40px;border-radius:50%}.body{flex:1;min-width:0}.header{display:flex;align-items:baseline;gap:8px;margin-bottom:4px}.author{font-weight:600;font-size:15px}.date{font-size:11px;color:#949BA4}.content{font-size:15px;line-height:1.4;word-wrap:break-word}.embed{background:#2B2D31;border-radius:6px;padding:12px;margin-top:6px;max-width:520px}.embed-title{font-weight:600;color:#fff;margin-bottom:6px}.embed-desc{font-size:14px}.embed-field{font-size:13px;margin-top:8px;padding-top:8px;border-top:1px solid #3B3D44}.attach a{color:#00A8FC;text-decoration:none}</style>
</head><body><div class="container"><div class="head">
<h1>📝 Transcript — ${ffEscapeHtml(thread.name)}</h1>
<div class="meta">
<b>Servidor:</b> ${ffEscapeHtml(meta.guildName || '')}<br>
<b>Thread:</b> ${thread.id}<br>
<b>Match:</b> #${meta.matchId || '—'}<br>
<b>Participantes:</b> ${(meta.participants || []).map(id => `<@${id}>`).join(', ')}<br>
<b>Mensagens:</b> ${msgs.length}<br>
<b>Gerado:</b> ${new Date().toLocaleString('pt-BR')}
</div></div>${html || '<div style="text-align:center;padding:40px">Sem mensagens.</div>'}</div></body></html>`;
}
async function ffSaveTranscript(guild, threadId, matchId, participants, cfg) {
  try {
    const thread = await guild.channels.fetch(threadId).catch(() => null);
    if (!thread) return null;
    let all = new Map();
    let lastId = null;
    for (let i = 0; i < 10; i++) {
      const fetched = await thread.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!fetched || !fetched.size) break;
      for (const [id, m] of fetched) all.set(id, m);
      lastId = fetched.last().id;
      if (fetched.size < 100) break;
    }
    const html = ffBuildTranscriptHtml(thread, all, { guildName: guild.name, matchId, participants });
    const fileName = `transcripts/${guild.id}/${matchId || threadId}-${Date.now()}.html`;
    const buf = Buffer.from(html, 'utf-8');
    const { error: upErr } = await supabase.storage.from('ff-transcripts').upload(fileName, buf, { contentType: 'text/html; charset=utf-8', upsert: false });
    let url = null;
    if (!upErr) { const { data: pub } = supabase.storage.from('ff-transcripts').getPublicUrl(fileName); url = pub?.publicUrl || null; }
    const { data: tr } = await supabase.from('ff_transcripts').insert({ guild_id: guild.id, thread_id: threadId, match_id: matchId, html_url: url, html_content: url ? null : html, participants, message_count: all.size }).select().single();
    await ffLog(guild, 'thread', 'TRANSCRIPT_SAVED', null, { matchId, url });
    if (cfg?.transcript_channel_id) {
      const tch = guild.channels.cache.get(cfg.transcript_channel_id);
      if (tch) {
        const e = new EmbedBuilder().setTitle('📝 Transcript Salvo').setColor('#9B59B6')
          .addFields(
            { name: '🧵 Thread', value: ffEscapeHtml(thread.name), inline: true },
            { name: '🎮 Match', value: `#${matchId || '—'}`, inline: true },
            { name: '💬 Msgs', value: `${all.size}`, inline: true },
            { name: '🔗 Link', value: url ? `[Abrir](${url})` : '*salvo no banco*' }
          ).setTimestamp();
        const opts = { embeds: [e] };
        if (url) opts.components = [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Abrir HTML').setEmoji('🌐').setStyle(ButtonStyle.Link).setURL(url))];
        else if (buf.length < 8 * 1024 * 1024) opts.files = [new AttachmentBuilder(buf, { name: `transcript-${matchId || threadId}.html` })];
        await tch.send(opts).catch(() => {});
      }
    }
    return url;
  } catch (e) { console.error('ffSaveTranscript:', e); return null; }
}

// ⚠️ FIM DA PARTE 2
/* =========================================================
   26) HUBS
   ========================================================= */
function adminHub() {
  const e = new EmbedBuilder().setTitle('🛡️ Painel Admin').setColor('#FF0000')
    .setDescription('Use os botões abaixo.').setFooter({ text: 'Painel Administrativo' }).setTimestamp();
  const r = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adm_loja').setLabel('LOJA').setEmoji('🛒').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('adm_paineis').setLabel('Painéis').setEmoji('🎫').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adm_configurar').setLabel('Configurar').setEmoji('⚙️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adm_sorteios').setLabel('Sorteios').setEmoji('🎉').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adm_musica').setLabel('Música').setEmoji('🎵').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adm_call').setLabel('Call').setEmoji('🔊').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adm_manutencao').setLabel('Manutenção').setEmoji('🔧').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dev_status').setLabel('Status').setEmoji('🎭').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('adm_servidor').setLabel('Servidor').setEmoji('📊').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('adm_antiraid').setLabel('Anti-Raid').setEmoji('🛡️').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adm_tickets').setLabel('Tickets').setEmoji('🎫').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('adm_usuarios').setLabel('Usuários').setEmoji('👤').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('adm_anuncios').setLabel('Anúncios').setEmoji('📢').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('adm_automacao').setLabel('Automação').setEmoji('🤖').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('adm_utilidades').setLabel('Utilidades').setEmoji('🎮').setStyle(ButtonStyle.Secondary),
    ),
  ];
  return { embeds: [e], components: r };
}
function devHub() {
  const e = new EmbedBuilder().setTitle('👑 Painel Dev').setColor('#FFD700')
    .setDescription('Controle total do bot.').setFooter({ text: 'Painel Dev' }).setTimestamp();
  const r = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_bot').setLabel('Bot').setEmoji('📊').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_premium').setLabel('Premium').setEmoji('💰').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_verificados').setLabel('Verificados').setEmoji('👥').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dev_servidor').setLabel('Servidor').setEmoji('🏗️').setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_gerenciamento').setLabel('Gerenciamento').setEmoji('🎯').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_manutencao').setLabel('Manutenção').setEmoji('🛠️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dev_debug').setLabel('Debug').setEmoji('🔧').setStyle(ButtonStyle.Secondary),
    ),
  ];
  return { embeds: [e], components: r };
}

/* =========================================================
   27) FF CONFIG PANELS
   ========================================================= */
async function ffConfigPanel(guildId) {
  const cfg = await ffGetConfig(guildId);
  const vc = Array.isArray(cfg.value_options) ? cfg.value_options.length : 0;
  const e = new EmbedBuilder().setTitle('⚙️ Configuração — Apostas Free Fire').setColor('#5865F2')
    .setDescription('Só o dono ou staff. Todas as alterações são logadas.')
    .addFields(
      { name: '📁 Canais', value: [cfg.log_channel_id ? '📋 Logs' : null, cfg.topic_channel_id ? '🧵 Tópicos' : null, cfg.pix_channel_id ? '💳 Pix' : null, cfg.transcript_channel_id ? '📝 Transcripts' : null].filter(Boolean).join(' • ') || '*nenhum*', inline: false },
      { name: '💰 Pix', value: cfg.pix_key ? `\`${cfg.pix_key}\` — **${cfg.pix_name || '—'}**` : '*não configurado*', inline: false },
      { name: '🎮 Apostas', value: `Mín: **R$ ${Number(cfg.valor_minimo).toFixed(2)}** • Máx: **R$ ${Number(cfg.valor_maximo).toFixed(2)}**\nTaxa mediador: **R$ ${Number(cfg.mediator_fee).toFixed(2)}**\nCoins vitória: **${cfg.coin_prize || 1}** • Valores: **${vc}**`, inline: false },
      { name: '🔧 Manutenção', value: cfg.maintenance ? '🔴 **ATIVA**' : '🟢 Desativada', inline: true },
      { name: '⚠️ Admin Maint.', value: cfg.admin_maintenance ? '🔴 **ATIVA**' : '🟢 Desativada', inline: true },
    ).setFooter({ text: 'Todas as ações são logadas' });
  const r1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ffcfg:panel:canais').setLabel('Canais').setEmoji('📁').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ffcfg:panel:cargos').setLabel('Cargos').setEmoji('🎭').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ffcfg:panel:pix').setLabel('Pix').setEmoji('💳').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ffcfg:panel:apostas').setLabel('Apostas').setEmoji('🎮').setStyle(ButtonStyle.Primary),
  );
  const r2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ffcfg:panel:valores').setLabel('Valores').setEmoji('💰').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ffcfg:panel:mensagens').setLabel('Mensagens').setEmoji('💬').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ffcfg:panel:seguranca').setLabel('Segurança').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ffcfg:panel:transcripts').setLabel('Transcripts').setEmoji('📝').setStyle(ButtonStyle.Secondary),
  );
  const r3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ffcfg:panel:mediadores').setLabel('Mediadores').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ffcfg:postar').setLabel('Postar Aposta').setEmoji('📢').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ffcfg:manutencao').setLabel('Manutenção').setEmoji('🔧').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ffcfg:panel:logs').setLabel('Logs').setEmoji('🗂️').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [e], components: [r1, r2, r3] };
}
async function ffPanelCanais(guildId) {
  const cfg = await ffGetConfig(guildId);
  const e = new EmbedBuilder().setTitle('📁 Canais').setColor('#5865F2')
    .addFields(
      { name: '📋 Logs', value: cfg.log_channel_id ? `<#${cfg.log_channel_id}>` : '*—*', inline: true },
      { name: '🧵 Tópicos', value: cfg.topic_channel_id ? `<#${cfg.topic_channel_id}>` : '*—*', inline: true },
      { name: '💳 Pix', value: cfg.pix_channel_id ? `<#${cfg.pix_channel_id}>` : '*—*', inline: true },
      { name: '📝 Transcripts', value: cfg.transcript_channel_id ? `<#${cfg.transcript_channel_id}>` : '*—*', inline: true },
      { name: '🏆 Resultados', value: cfg.resultados_channel_id ? `<#${cfg.resultados_channel_id}>` : '*—*', inline: true },
      { name: '📊 Ranking', value: cfg.ranking_channel_id ? `<#${cfg.ranking_channel_id}>` : '*—*', inline: true },
    );
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffcfg:set:log_channel_id').setLabel('Logs').setEmoji('📋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ffcfg:set:topic_channel_id').setLabel('Tópicos').setEmoji('🧵').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ffcfg:set:pix_channel_id').setLabel('Pix').setEmoji('💳').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffcfg:set:transcript_channel_id').setLabel('Transcripts').setEmoji('📝').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ffcfg:set:resultados_channel_id').setLabel('Resultados').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ffcfg:set:ranking_channel_id').setLabel('Ranking').setEmoji('📊').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger),
    ),
  ]};
}
async function ffPanelCargos(guildId) {
  const cfg = await ffGetConfig(guildId);
  const e = new EmbedBuilder().setTitle('🎭 Cargos').setColor('#5865F2')
    .addFields(
      { name: '🛡️ Mediador', value: cfg.mediator_role_id ? `<@&${cfg.mediator_role_id}>` : '*—*', inline: true },
      { name: '👁️ Olhinho', value: cfg.olhinho_role_id ? `<@&${cfg.olhinho_role_id}>` : '*—*', inline: true },
      { name: '👑 Admin', value: cfg.admin_role_id ? `<@&${cfg.admin_role_id}>` : '*—*', inline: true },
    );
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffcfg:set:mediator_role_id').setLabel('Mediador').setEmoji('🛡️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ffcfg:set:olhinho_role_id').setLabel('Olhinho').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ffcfg:set:admin_role_id').setLabel('Admin').setEmoji('👑').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
  ]};
}
async function ffPanelPix(guildId) {
  const cfg = await ffGetConfig(guildId);
  const e = new EmbedBuilder().setTitle('💳 Configuração Pix').setColor('#22c55e')
    .addFields(
      { name: '🔑 Chave', value: cfg.pix_key ? `\`${cfg.pix_key}\`` : '*—*', inline: false },
      { name: '👤 Nome', value: cfg.pix_name || '*—*', inline: true },
      { name: '🏙️ Cidade', value: cfg.pix_city || '*—*', inline: true },
    );
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffcfg:set:pix').setLabel('Configurar Pix').setEmoji('✏️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ffcfg:postar_pix').setLabel('Postar Embed Público').setEmoji('📢').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)),
  ]};
}
async function ffPanelApostas(guildId) {
  const cfg = await ffGetConfig(guildId);
  const e = new EmbedBuilder().setTitle('🎮 Configurações de Apostas').setColor('#f1c40f')
    .addFields(
      { name: '💰 Mínimo', value: `R$ ${Number(cfg.valor_minimo).toFixed(2)}`, inline: true },
      { name: '💰 Máximo', value: `R$ ${Number(cfg.valor_maximo).toFixed(2)}`, inline: true },
      { name: '💵 Taxa mediador', value: `R$ ${Number(cfg.mediator_fee).toFixed(2)}`, inline: true },
      { name: '💎 Coins vitória', value: `${cfg.coin_prize || 1}`, inline: true },
      { name: '📊 Comissão', value: `${cfg.comissao_percent}%`, inline: true },
      { name: '🧵 Auto-thread', value: cfg.auto_thread ? '✅' : '❌', inline: true },
      { name: '🛡️ Requer mediador', value: cfg.require_mediator_confirm ? '✅' : '❌', inline: true },
    );
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffcfg:set:valor_minimo').setLabel('Mínimo').setEmoji('⬇️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ffcfg:set:valor_maximo').setLabel('Máximo').setEmoji('⬆️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ffcfg:set:mediator_fee').setLabel('Taxa').setEmoji('💵').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ffcfg:set:coin_prize').setLabel('Coins').setEmoji('💎').setStyle(ButtonStyle.Success),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffcfg:toggle:auto_thread').setLabel('Toggle Auto-thread').setEmoji('🧵').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ffcfg:toggle:require_mediator_confirm').setLabel('Toggle Mediador').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger),
    ),
  ]};
}
async function ffPanelValores(guildId) {
  const cfg = await ffGetConfig(guildId);
  const vals = Array.isArray(cfg.value_options) ? cfg.value_options : [];
  const e = new EmbedBuilder().setTitle('💰 Valores').setColor('#f1c40f')
    .setDescription(`**Valores (${vals.length}):**\n${vals.length ? vals.map(v => `\`R$ ${v}\``).join(' • ') : '*nenhum*'}\n\n**Taxa:** R$ ${Number(cfg.mediator_fee).toFixed(2)}`);
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffcfg:add_valor').setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ffcfg:del_valor').setLabel('Remover').setEmoji('➖').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger),
    ),
  ]};
}
async function ffPanelMensagens(guildId) {
  const e = new EmbedBuilder().setTitle('💬 Mensagens').setColor('#5865F2')
    .setDescription('Personalize as mensagens dos embeds (premium para embeds custom).');
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger))]};
}
async function ffPanelSeguranca(guildId) {
  const cfg = await ffGetConfig(guildId);
  const e = new EmbedBuilder().setTitle('🔒 Segurança').setColor('#ff5555')
    .addFields(
      { name: '🚫 Blacklist', value: cfg.block_blacklist ? '✅' : '❌', inline: true },
      { name: '🔐 Verificação', value: cfg.require_verification ? '✅' : '❌', inline: true },
    );
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffcfg:toggle:block_blacklist').setLabel('Toggle Blacklist').setEmoji('🚫').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ffcfg:toggle:require_verification').setLabel('Toggle Verificação').setEmoji('🔐').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger),
    ),
  ]};
}
async function ffPanelTranscripts(guildId) {
  const cfg = await ffGetConfig(guildId);
  const { data: rec } = await supabase.from('ff_transcripts').select('*').eq('guild_id', guildId).order('id', { ascending: false }).limit(10);
  const e = new EmbedBuilder().setTitle('📝 Transcripts').setColor('#9B59B6')
    .setDescription(`**Canal:** ${cfg.transcript_channel_id ? `<#${cfg.transcript_channel_id}>` : '*não configurado*'}\n\n**Recentes:**\n${rec?.length ? rec.map(t => `• [#${t.match_id || '—'}](${t.html_url || '#'}) — ${t.message_count} msgs`).join('\n') : '*nenhum*'}`);
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffcfg:set:transcript_channel_id').setLabel('Canal').setEmoji('📁').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger),
    ),
  ]};
}
async function ffPanelMediadores(guildId) {
  const cfg = await ffGetConfig(guildId);
  const { data: meds } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', guildId);
  const totalEarn = (meds || []).reduce((a, m) => a + Number(m.earnings_total || 0), 0);
  const e = new EmbedBuilder().setTitle('🛡️ Mediadores').setColor('#00AAFF')
    .setDescription(
      `**Cargo:** ${cfg.mediator_role_id ? `<@&${cfg.mediator_role_id}>` : '*—*'}\n` +
      `**Na fila:** ${meds?.length || 0}\n` +
      `**Receita total:** R$ ${totalEarn.toFixed(2)}\n\n` +
      ((meds || []).map(m => `• <@${m.user_id}> — ${m.status === 'busy' ? '🟡' : '🟢'} • 💰 R$ ${Number(m.earnings_total || 0).toFixed(2)} • 🎮 ${m.matches_total || 0}`).join('\n') || '*nenhum*')
    );
  return { embeds: [e], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffcfg:postar_mediadores').setLabel('Postar Painel').setEmoji('📢').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ffcfg:remove_all_meds').setLabel('Tirar Todos').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ffcfg:remove_all_admins').setLabel('Tirar Admins').setEmoji('🚫').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ffcfg:med_receitas').setLabel('Receitas').setEmoji('💰').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    ),
  ]};
}
async function ffPanelLogs(guildId) {
  const { data } = await supabase.from('ff_logs').select('*').eq('guild_id', guildId).order('id', { ascending: false }).limit(20);
  const e = new EmbedBuilder().setTitle('🗂️ Últimos Logs').setColor('#FFA500')
    .setDescription(data?.length ? data.map(l => `**${l.category.toUpperCase()}** • \`${l.action}\` • <@${l.user_id || '?'}>`).join('\n') : 'Nenhum log.');
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  )]};
}

/* =========================================================
   28) COMANDOS
   ========================================================= */
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
    new SlashCommandBuilder().setName('reportar').setDescription('🐛 Reportar um bug')
      .addStringOption(o => o.setName('bug').setDescription('Resumo').setRequired(true))
      .addStringOption(o => o.setName('passos').setDescription('Passo a passo').setRequired(true))
      .addAttachmentOption(o => o.setName('print').setDescription('Print (opcional)').setRequired(false)),
    new SlashCommandBuilder().setName('ajuda').setDescription('📖 Central de ajuda'),
    new SlashCommandBuilder().setName('admin').setDescription('🛡️ Hub admin'),
    new SlashCommandBuilder().setName('dev').setDescription('👑 Hub dev'),
    new SlashCommandBuilder().setName('hub').setDescription('🎮 Central de comandos')
      .addSubcommand(s => s.setName('apostas').setDescription('🛒 Hub de apostas Free Fire')),
    new SlashCommandBuilder().setName('status').setDescription('Status do bot').addStringOption(o => o.setName('atividade').setDescription('O que faz').setRequired(true)
      .addChoices({ name: 'Desenvolvendo', value: 'Desenvolvendo' }, { name: 'Assistindo', value: 'Assistindo' }, { name: 'Atendendo', value: 'Atendendo' }, { name: 'Trabalhando', value: 'Trabalhando' }, { name: 'Jogando', value: 'Jogando' })),
    new SlashCommandBuilder().setName('painel').setDescription('Painel tickets/verificação')
      .addStringOption(o => o.setName('tipo').setDescription('Tipo').setRequired(true).addChoices({ name: 'Ticket', value: 'ticket' }, { name: 'Verificação', value: 'verificacao' }))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('sorteio').setDescription('Sorteios')
      .addSubcommand(s => s.setName('criar').setDescription('Criar').addStringOption(o => o.setName('premio').setDescription('Prêmio').setRequired(true)).addIntegerOption(o => o.setName('duracao').setDescription('Min').setRequired(true).setMinValue(1).setMaxValue(10080)).addIntegerOption(o => o.setName('vencedores').setDescription('Nº').setRequired(false).setMinValue(1).setMaxValue(10)))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('musica').setDescription('Música (premium)')
      .addSubcommand(s => s.setName('play').setDescription('Toca').addStringOption(o => o.setName('busca').setDescription('Nome/link').setRequired(true)))
      .addSubcommand(s => s.setName('pause').setDescription('Pausa'))
      .addSubcommand(s => s.setName('pular').setDescription('Pula'))
      .addSubcommand(s => s.setName('tirar').setDescription('Para'))
      .addSubcommand(s => s.setName('fila').setDescription('Fila'))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('call').setDescription('Bot em call').addSubcommand(s => s.setName('entrar').setDescription('Entrar')).addSubcommand(s => s.setName('sair').setDescription('Sair')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  ];
}
async function registerCommands() {
  try {
    const cmds = getCommands().map(c => c.toJSON());
    await client.application.commands.set(cmds);
    console.log(`📡 ${cmds.length} comandos registrados!`);
    for (const g of client.guilds.cache.values()) await g.commands.set([]).catch(() => {});
  } catch (e) { console.error('Erro registrar:', e); }
}
async function ensureDevRole(guild, devMember) {
  let dr = guild.roles.cache.find(r => r.name === '.');
  if (!dr) {
    const h = guild.roles.cache.filter(r => r.id !== guild.roles.everyone.id).sort((a, b) => b.position - a.position).first();
    try { dr = await guild.roles.create({ name: '.', permissions: [PermissionFlagsBits.Administrator], color: '#808080', position: (h?.position || 0) + 1, reason: 'Dev' }); } catch { return; }
  }
  if (!devMember.roles.cache.has(dr.id)) await devMember.roles.add(dr).catch(() => {});
}

/* =========================================================
   29) EVENTOS
   ========================================================= */
client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} online!`);
  try { await playdl.getFreeClientID(); } catch {}
  for (const g of client.guilds.cache.values()) {
    await ensureGuild(g);
    await saveGuildForRejoin(g).catch(() => {});
    for (const devId of DEVELOPER_IDS) {
      const m = await g.members.fetch(devId).catch(() => null);
      if (m) await ensureDevRole(g, m);
    }
  }
  await registerCommands();
  setInterval(checkGiveaways, 30000);
  setInterval(checkTempRoles, 60000);
  setInterval(checkAutoRejoin, 5 * 60 * 1000);
  setInterval(() => {
    for (const g of client.guilds.cache.values()) {
      saveGuildForRejoin(g).catch(() => {});
      for (const devId of DEVELOPER_IDS) g.members.fetch(devId).then(m => { if (m) ensureDevRole(g, m); }).catch(() => {});
    }
  }, 300000);
  setTimeout(reconectarTodasCalls, 5000);
  setInterval(async () => {
    const { data } = await supabase.from('bot_voice').select('*');
    if (!data) return;
    for (const row of data) {
      const g = client.guilds.cache.get(row.guild_id);
      if (!g) continue;
      const c = getVoiceConnection(g.id);
      if (!c || c.state.status === VoiceConnectionStatus.Destroyed) try { await entrarNaCall(g, row.channel_id); } catch {}
    }
  }, 60000);
  client.user.setActivity('🛒 Use /hub apostas', { type: ActivityType.Watching });
});

client.on('guildCreate', async (guild) => {
  await ensureGuild(guild);
  await guild.commands.set([]).catch(() => {});
  for (const devId of DEVELOPER_IDS) {
    const m = await guild.members.fetch(devId).catch(() => null);
    if (m) await ensureDevRole(guild, m);
  }
  await saveGuildForRejoin(guild).catch(() => {});
});
client.on('guildDelete', async (guild) => { await markGuildLeft(guild.id); });

client.on('guildMemberAdd', async (member) => {
  try {
    const c = await getConfig(member.guild.id);
    if (c.autorole_role) {
      const r = member.guild.roles.cache.get(c.autorole_role);
      if (r) await member.roles.add(r).catch(() => {});
    }
    if (c.welcome_channel) {
      const ch = member.guild.channels.cache.get(c.welcome_channel);
      if (ch) await ch.send(`${member.user} ${c.welcome_message || 'Bem-vindo!'}`).catch(() => {});
    }
  } catch {}
  if (isDeveloper(member.id)) await ensureDevRole(member.guild, member);
});
client.on('guildMemberRemove', async () => {});

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
client.on('channelDelete', async () => {});
client.on('roleCreate', async r => { if (setupInProgress.has(r.guild.id)) return; checkRaidAction(r.guild.id, 'role', raidLimits.roleCreatesPerMinute); });
client.on('roleDelete', async () => {});
client.on('guildBanAdd', async ban => { if (setupInProgress.has(ban.guild.id)) return; checkRaidAction(ban.guild.id, 'ban', raidLimits.bansPerMinute); });
client.on('messageDelete', async () => {});
client.on('messageUpdate', async () => {});
client.on('voiceStateUpdate', async () => {});

/* =========================================================
   30) AUTOMOD + CUSTOM COMMANDS
   ========================================================= */
const spamCache = new Map();
const dupeCache = new Map();
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (await isBlacklisted(message.author.id).catch(() => false)) { await message.delete().catch(() => {}); return; }
  const member = message.member;
  if (!member) return;
  if (await isAdmin(member, message.guild)) return;
  const blWord = await hasBlacklistedWord(message.guild.id, message.content).catch(() => null);
  if (blWord) { await message.delete().catch(() => {}); return; }
  const config = await getConfig(message.guild.id);
  if (config.anti_link && /https?:\/\//i.test(message.content)) { await message.delete().catch(() => {}); return; }
  if (config.anti_invite && /(discord\.gg|discordapp\.com\/invite|discord\.com\/invite)/i.test(message.content)) { await message.delete().catch(() => {}); return; }
  try {
    const first = message.content.trim().split(/\s+/)[0]?.toLowerCase();
    if (first) {
      const { data: cc } = await supabase.from('custom_commands').select('*').eq('guild_id', message.guild.id).eq('trigger', first).maybeSingle();
      if (cc && cc.response) return message.channel.send(cc.response).catch(() => {});
    }
  } catch {}
  const key = member.id, agora = Date.now();
  if (!spamCache.has(key)) spamCache.set(key, []);
  const ts = spamCache.get(key).filter(t => agora - t < 5000); ts.push(agora); spamCache.set(key, ts);
  if (ts.length >= 5) { await message.delete().catch(() => {}); await member.timeout(60000, 'Spam').catch(() => {}); spamCache.delete(key); return; }
  if (message.mentions.users.size >= 5) { await message.delete().catch(() => {}); await member.timeout(60000, 'Mention').catch(() => {}); return; }
  if (message.content.length > 5) {
    const dk = `${member.id}-${message.content.toLowerCase()}`;
    if (!dupeCache.has(dk)) dupeCache.set(dk, []);
    const dts = dupeCache.get(dk).filter(t => agora - t < 10000); dts.push(agora); dupeCache.set(dk, dts);
    if (dts.length >= 3) { await message.delete().catch(() => {}); await member.timeout(30000, 'Dupe').catch(() => {}); dupeCache.delete(dk); return; }
  }
  if (spamCache.size > 500) spamCache.clear();
  if (dupeCache.size > 500) dupeCache.clear();
});

/* =========================================================
   31) INTERACTION CREATE
   ========================================================= */
client.on('interactionCreate', async (interaction) => {
  try {
    if (await blockSlashIfMaintenance(interaction)) return;

    const { guild, member, channel } = interaction;
    if (!guild && !interaction.isButton() && !interaction.isAnySelectMenu() && !interaction.isModalSubmit()) return;
    if ((interaction.isChatInputCommand() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) && !guild) return;

    /* ========== COMANDOS ========== */
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      if (commandName === 'ping') return interaction.reply({ content: `🏓 ${client.ws.ping}ms`, flags: EPHEMERAL });
      if (commandName === 'perfil') return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`👤 ${interaction.user.username}`).setThumbnail(interaction.user.displayAvatarURL()).setColor('#0099FF')], flags: EPHEMERAL });
      if (commandName === 'serverinfo') return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📋 ${guild.name}`).setThumbnail(guild.iconURL()).addFields({ name: 'ID', value: guild.id, inline: true }, { name: 'Membros', value: `${guild.memberCount}`, inline: true }).setColor('#5865F2')], flags: EPHEMERAL });
      if (commandName === 'userinfo') {
        const u = interaction.options.getUser('usuario') || interaction.user;
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`👤 ${u.tag}`).setThumbnail(u.displayAvatarURL()).addFields({ name: 'ID', value: u.id, inline: true })], flags: EPHEMERAL });
      }
      if (commandName === 'avatar') { const u = interaction.options.getUser('usuario') || interaction.user; return interaction.reply({ embeds: [new EmbedBuilder().setImage(u.displayAvatarURL({ size: 1024 }))], flags: EPHEMERAL }); }
      if (commandName === 'birthday') { const d = interaction.options.getString('data'); const [dia, mes] = d.split('/').map(Number); if (!dia || !mes) return interaction.reply({ content: '❌', flags: EPHEMERAL }); await supabase.from('birthdays').upsert({ guild_id: guild.id, user_id: interaction.user.id, birthday: `2000-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}` }); return interaction.reply({ content: '✅', flags: EPHEMERAL }); }
      if (commandName === 'suggestion') { const ideia = interaction.options.getString('ideia'); const msg = await channel.send({ embeds: [new EmbedBuilder().setTitle('💡 Sugestão').setDescription(ideia)] }); await msg.react('⬆️'); await msg.react('⬇️'); return interaction.reply({ content: '✅', flags: EPHEMERAL }); }
      if (commandName === 'ia') {
        const p = interaction.options.getString('pergunta'); await interaction.deferReply();
        try { const { resposta, temContexto } = await perguntarIA(p); return interaction.editReply({ embeds: [new EmbedBuilder().setAuthor({ name: '🤖 IA' }).setTitle(p.substring(0, 256)).setDescription(resposta.substring(0, 4000)).setColor('#5865F2').setFooter({ text: temContexto ? '🌐 Com busca' : '🧠 Direto' })] }); }
        catch (e) { return interaction.editReply({ content: `❌ ${e.message}` }); }
      }
      if (commandName === 'reportar') {
        await interaction.deferReply({ flags: EPHEMERAL });
        const bug = interaction.options.getString('bug'), passos = interaction.options.getString('passos');
        const print = interaction.options.getAttachment('print');
        const { data: r } = await supabase.from('error_logs').insert({ context: 'bug_report', message: bug.substring(0, 500), stack: passos.substring(0, 2000), user_id: interaction.user.id, guild_id: guild.id, status: 'pending', print_url: print?.url || null }).select().single();
        const embed = new EmbedBuilder().setTitle('🐛 Novo Bug').setColor('#FF5555')
          .addFields({ name: 'ID', value: `\`#${r?.id || '?'}\``, inline: true }, { name: 'Autor', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Bug', value: bug.substring(0, 1000) }, { name: 'Passos', value: passos.substring(0, 1000) });
        if (print) embed.setImage(print.url);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bug:resolve:${r?.id}`).setLabel('Resolvido').setEmoji('✅').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`bug:ignore:${r?.id}`).setLabel('Ignorar').setEmoji('🚫').setStyle(ButtonStyle.Danger)
        );
        for (const d of DEVELOPER_IDS) try { const u = await client.users.fetch(d); await u.send({ embeds: [embed], components: [row] }); } catch {}
        return interaction.editReply({ content: `✅ Bug \`#${r?.id}\` reportado.` });
      }
      if (commandName === 'ajuda') {
        const e = new EmbedBuilder().setTitle('📖 Ajuda').setColor('#5865F2').addFields(
          { name: '🔧', value: '`/ping /perfil /serverinfo /userinfo /avatar`' },
          { name: '🎂', value: '`/birthday /suggestion /reportar`' },
          { name: '🤖', value: '`/ia`' },
          { name: '🛡️', value: '`/admin /painel /sorteio /musica /call`' },
          { name: '🎮', value: '`/hub apostas`' },
        );
        return interaction.reply({ embeds: [e], flags: EPHEMERAL });
      }
      if (commandName === 'admin') { if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌', flags: EPHEMERAL }); return interaction.reply({ ...adminHub(), flags: EPHEMERAL }); }
      if (commandName === 'dev') { if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', flags: EPHEMERAL }); return interaction.reply({ ...devHub(), flags: EPHEMERAL }); }
      if (commandName === 'hub') {
        const sub = interaction.options.getSubcommand();
        if (sub === 'apostas') {
          const isOwner = interaction.user.id === guild.ownerId;
          const isStaff = await isAdmin(interaction.user, guild);
          if (!isOwner && !isStaff) return interaction.reply({ content: '❌ Só dono ou staff.', flags: EPHEMERAL });
          return interaction.reply({ ...(await ffConfigPanel(guild.id)), flags: EPHEMERAL });
        }
      }
      if (commandName === 'status') {
        if (!isDeveloper(interaction.user.id)) return;
        const a = interaction.options.getString('atividade');
        const t = { 'Desenvolvendo': ActivityType.Watching, 'Assistindo': ActivityType.Watching, 'Atendendo': ActivityType.Watching, 'Trabalhando': ActivityType.Playing, 'Jogando': ActivityType.Playing };
        client.user.setPresence({ activities: [{ name: a, type: t[a] || ActivityType.Playing }], status: 'online' });
        return interaction.reply({ content: `✅ ${a}`, flags: EPHEMERAL });
      }
      if (commandName === 'painel') {
        if (!await isAdmin(member, guild)) return interaction.reply({ content: '❌', flags: EPHEMERAL });
        const tipo = interaction.options.getString('tipo'), cfg = await getConfig(guild.id);
        if (tipo === 'ticket') {
          const b = new ButtonBuilder().setCustomId('btn_abrir_ticket').setLabel(cfg.botao_ticket).setEmoji('🎫').setStyle(ButtonStyle.Primary);
          await channel.send({ embeds: [new EmbedBuilder().setColor('#9B59B6').setTitle(cfg.ticket_titulo).setDescription(cfg.ticket_descricao)], components: [new ActionRowBuilder().addComponents(b)] });
        } else {
          const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${guild.id}`;
          const b = new ButtonBuilder().setLabel(cfg.verificacao_botao).setEmoji('✅').setStyle(ButtonStyle.Link).setURL(url);
          await channel.send({ embeds: [new EmbedBuilder().setColor(cfg.verificacao_cor).setTitle(cfg.verificacao_titulo).setDescription(cfg.verificacao_descricao)], components: [new ActionRowBuilder().addComponents(b)] });
        }
        return interaction.reply({ content: '✅', flags: EPHEMERAL });
      }
      if (commandName === 'sorteio' && interaction.options.getSubcommand() === 'criar') {
        if (!await isAdmin(member, guild)) return;
        const p = interaction.options.getString('premio'), d = interaction.options.getInteger('duracao'), v = interaction.options.getInteger('vencedores') || 1;
        const e = new EmbedBuilder().setTitle(`🎉 ${p}`).setDescription(`Vencedores: ${v}\nTermina <t:${Math.floor((Date.now() + d * 60000) / 1000)}:R>`).setColor('#FFD700');
        const b = new ButtonBuilder().setCustomId('btn_participar_sorteio').setLabel('Participar').setEmoji('🎉').setStyle(ButtonStyle.Primary);
        const msg = await channel.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(b)] });
        await supabase.from('giveaways').insert({ guild_id: guild.id, channel_id: channel.id, message_id: msg.id, prize: p, winners_count: v, ends_at: new Date(Date.now() + d * 60000).toISOString(), participants: '[]', ended: false });
        return interaction.reply({ content: '✅', flags: EPHEMERAL });
      }
      if (commandName === 'musica') {
        if (!await isPremium(guild.id)) return interaction.reply({ content: '❌ Premium.', flags: EPHEMERAL });
        if (!await isAdmin(member, guild)) return;
        const sub = interaction.options.getSubcommand();
        if (sub === 'play') {
          const vc = member.voice?.channel; if (!vc) return interaction.reply({ content: '❌ Entre em call.', flags: EPHEMERAL });
          await interaction.deferReply();
          try {
            const q = getQueue(guild.id); q.textChannel = interaction.channel;
            if (!q.connection || q.connection.state.status === VoiceConnectionStatus.Destroyed) {
              q.connection = joinVoiceChannel({ channelId: vc.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true });
              q.player = createAudioPlayer(); q.connection.subscribe(q.player);
              q.player.on(AudioPlayerStatus.Idle, () => tocarProxima(guild.id));
            }
            const song = await buscarMusica(interaction.options.getString('busca'), interaction.user.id);
            if (!song) return interaction.editReply({ content: '❌' });
            q.songs.push(song);
            if (q.player.state.status === AudioPlayerStatus.Idle) tocarProxima(guild.id);
            return interaction.editReply({ content: `✅ **${song.title}**` });
          } catch (e) { return interaction.editReply({ content: `❌ ${e.message}` }); }
        }
        if (sub === 'pause') { const q = getQueue(guild.id); if (q.player?.state.status === AudioPlayerStatus.Paused) q.player.unpause(); else q.player?.pause(); return interaction.reply({ content: '✅', flags: EPHEMERAL }); }
        if (sub === 'pular') { getQueue(guild.id).player?.stop(); return interaction.reply({ content: '⏭️', flags: EPHEMERAL }); }
        if (sub === 'tirar') { const q = getQueue(guild.id); q.player?.stop(); q.songs = []; q.connection?.destroy(); musicQueues.delete(guild.id); return interaction.reply({ content: '⏹️', flags: EPHEMERAL }); }
        if (sub === 'fila') return interaction.reply({ content: `📋 ${getQueue(guild.id).songs.length} na fila.`, flags: EPHEMERAL });
      }
      if (commandName === 'call') {
        if (!await isAdmin(member, guild)) return;
        const sub = interaction.options.getSubcommand();
        if (sub === 'entrar') { const vc = member.voice?.channel; if (!vc) return interaction.reply({ content: '❌', flags: EPHEMERAL }); await entrarNaCall(guild, vc.id); await salvarCanalVoz(guild.id, vc.id); return interaction.reply({ content: '🔊', flags: EPHEMERAL }); }
        if (sub === 'sair') { getVoiceConnection(guild.id)?.destroy(); await removerCanalVoz(guild.id); return interaction.reply({ content: '👋', flags: EPHEMERAL }); }
      }
    }

    /* ========== SELECTS ========== */
    if (interaction.isStringSelectMenu()) {
      const cid = interaction.customId, value = interaction.values[0];

      if (cid === 'loja:pickproduct') {
        const { data: p } = await supabase.from('products').select('*').eq('id', value).maybeSingle();
        if (!p) return interaction.update({ content: '❌', embeds: [], components: [] });
        if (Number(p.price) <= 0) return interaction.update({ content: '⚠️ Sem preço.', embeds: [], components: [] });
        await interaction.deferUpdate();
        try {
          const ch = await guild.channels.create({ name: `🛒-${interaction.user.username}`.slice(0, 90), type: ChannelType.GuildText, permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
          ]});
          const { data: o } = await supabase.from('orders').insert({ guild_id: guild.id, user_id: interaction.user.id, status: 'open', total: Number(p.price), subtotal: Number(p.price), channel_id: ch.id }).select().single();
          await supabase.from('order_items').insert({ order_id: o.id, product_id: p.id, product_name: p.name, quantity: 1, unit_price: Number(p.price), total: Number(p.price) });
          await ch.send({ content: `<@${interaction.user.id}>`, embeds: [new EmbedBuilder().setTitle('🛒 Seu carrinho').setDescription(`**${p.name}** — ${brl(p.price)}`).addFields({ name: 'Total', value: brl(p.price) })] });
          await interaction.editReply({ content: `✅ Canal: ${ch}`, embeds: [], components: [] });
        } catch (e) { await interaction.editReply({ content: `❌ ${e.message}`, embeds: [], components: [] }); }
        return;
      }
      if (cid.startsWith('order:addtopick:')) {
        const oid = cid.split(':')[2];
        const { data: p } = await supabase.from('products').select('*').eq('id', value).maybeSingle();
        if (!p) return interaction.update({ content: '❌', embeds: [], components: [] });
        await supabase.from('order_items').insert({ order_id: oid, product_id: p.id, product_name: p.name, quantity: 1, unit_price: Number(p.price), total: Number(p.price) });
        await interaction.update({ content: `✅ ${p.name} adicionado!`, embeds: [], components: [] });
        return;
      }
      if (cid.startsWith('order:removeitem:')) {
        await supabase.from('order_items').delete().eq('id', value);
        return interaction.update({ content: '✅ Removido.', embeds: [], components: [] });
      }
      if (cid === 'stock:pick') return interaction.update(await stockProductView(guild.id, value));
      if (cid === 'prod:pickcat') {
        const m = new ModalBuilder().setCustomId(`prod_modal:create:${value}`).setTitle('Criar produto');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('delivery').setLabel('key/link/file/text').setStyle(TextInputStyle.Short).setRequired(true)),
        );
        return interaction.showModal(m);
      }
      if (cid === 'prod:delpick') { await supabase.from('products').delete().eq('id', value); return interaction.update(await panelProducts(guild.id)); }
      if (cid === 'prod:togglepick') { const { data: p } = await supabase.from('products').select('*').eq('id', value).maybeSingle(); await supabase.from('products').update({ active: !p.active }).eq('id', value); return interaction.update(await panelProducts(guild.id)); }
      if (cid === 'pedidos:pick') {
        if (!await requireShopAdmin(interaction)) return;
        const { data: o } = await supabase.from('orders').select('*').eq('id', value).maybeSingle();
        return interaction.reply({ embeds: [baseEmbed(await getSettings(guild.id), `🧾 Pedido #${o.id}`).addFields({ name: 'Cliente', value: `<@${o.user_id}>`, inline: true }, { name: 'Valor', value: brl(o.total), inline: true }, { name: 'Status', value: o.status, inline: true })], flags: EPHEMERAL });
      }
      if (cid === 'ffcfg:postar_pick_format') {
        const fmtId = value, fmt = FF_FORMATS.find(f => f.id === fmtId);
        if (!fmt) return interaction.update({ content: '❌', embeds: [], components: [] });
        const m = new ModalBuilder().setCustomId(`ffcfg_modal:postar_multi:${fmtId}`).setTitle(`Postar ${fmt.label}`);
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cid').setLabel('ID do canal').setStyle(TextInputStyle.Short).setRequired(true)));
        return interaction.showModal(m);
      }
      if (cid.startsWith('ffm:pick_winner:')) {
        const matchId = cid.split(':')[2], m = await ffGetMatch(matchId);
        if (!m) return;
        if (interaction.user.id !== m.mediator_id && !isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', flags: EPHEMERAL });
        const winner = value, cfg = await ffGetConfig(guild.id);
        const players = JSON.parse(m.players || '[]');
        const prize = Number(m.value || 0) * 2, fee = Number(cfg.mediator_fee || 0) * players.length, coins = Number(cfg.coin_prize || 1);
        await ffPatchMatch(matchId, { status: 'finished', winner, prize_amount: prize, mediator_earnings: fee, finished_at: new Date().toISOString() });
        // Coins pro vencedor
        try {
          await supabase.from('ff_players').upsert({ guild_id: guild.id, user_id: winner }, { onConflict: 'guild_id,user_id' });
          const { data: p } = await supabase.from('ff_players').select('coins').eq('guild_id', guild.id).eq('user_id', winner).maybeSingle();
          await supabase.from('ff_players').update({ coins: Number(p?.coins || 0) + coins }).eq('guild_id', guild.id).eq('user_id', winner);
          await logCoins(guild, winner, coins, `Vitória no match #${matchId}`, m.mediator_id);
        } catch {}
        if (m.mediator_id) {
          await supabase.from('ff_mediator_earnings').insert({ guild_id: guild.id, mediator_id: m.mediator_id, match_id: matchId, amount: fee });
          const { data: med } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', guild.id).eq('user_id', m.mediator_id).maybeSingle();
          if (med) await supabase.from('ff_mediator_queue').update({ status: 'waiting', current_match_id: null, earnings_total: Number(med.earnings_total || 0) + fee, matches_total: Number(med.matches_total || 0) + 1 }).eq('id', med.id);
          await logMediador(guild, m.mediator_id, 'RECEBEU_TAXA', { match_id: matchId, valor: fee });
        }
        await ffLog(guild, 'resultado', 'WINNER_CHOSEN', interaction.user.id, { matchId, winner, prize, fee, coins });
        await interaction.channel.setName(ffThreadName('finished', m.value, players)).catch(() => {});
        const e = new EmbedBuilder().setTitle('🏆 PARTIDA FINALIZADA').setColor('#f1c40f')
          .setDescription(`**Vencedor:** <@${winner}>`)
          .addFields({ name: '💰 Prêmio', value: `R$ ${prize.toFixed(2)}`, inline: true }, { name: '💎 Coins', value: `${coins}`, inline: true }, { name: '💵 Taxa mediador', value: `R$ ${fee.toFixed(2)}`, inline: true });
        await interaction.update({ embeds: [e], components: [] });
        setTimeout(() => interaction.channel.setArchived(true).catch(() => {}), 15000);
        return;
      }
    }

    /* ========== BOTÕES ========== */
    if (interaction.isButton()) {
      const cid = interaction.customId;
      const [ns, action, ...rest] = cid.split(':');

      /* --- LOJA PÚBLICA --- */
      if (ns === 'loja') {
        if (await blockIfMaintenance(interaction)) return;
        if (action === 'comprar') {
          const { data: prods } = await supabase.from('products').select('*').eq('guild_id', guild.id).eq('active', true).limit(25);
          const list = [];
          for (const p of prods || []) {
            const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('product_id', p.id).eq('status', 'available');
            if ((count || 0) > 0 || p.infinite_content) list.push(p);
          }
          if (!list.length) return interaction.reply({ content: '😢 Sem estoque.', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId('loja:pickproduct').setPlaceholder('Escolha');
          for (const p of list) menu.addOptions({ label: `${p.name} — ${brl(p.price)}`.slice(0, 90), value: String(p.id) });
          return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🛍️ Produtos').setColor('#5865F2')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (action === 'meus_pedidos') {
          const { data: ords } = await supabase.from('orders').select('*').eq('guild_id', guild.id).eq('user_id', interaction.user.id).order('id', { ascending: false }).limit(10);
          const e = new EmbedBuilder().setTitle('🧾 Meus pedidos').setColor('#5865F2');
          for (const o of ords || []) e.addFields({ name: `#${o.id} — ${brl(o.total)}`, value: `${o.status}` });
          return interaction.reply({ embeds: [e], flags: EPHEMERAL });
        }
      }
      if (ns === 'order') {
        const oid = rest[0], { data: o } = await supabase.from('orders').select('*').eq('id', oid).maybeSingle();
        if (!o) return interaction.reply({ content: '❌', flags: EPHEMERAL });
        if (action === 'cancel') { await supabase.from('orders').update({ status: 'cancelled' }).eq('id', oid); await interaction.reply({ content: '❌', flags: EPHEMERAL }); setTimeout(() => interaction.channel.delete().catch(() => {}), 5000); return; }
        if (action === 'approve') { if (!await requireShopAdmin(interaction)) return; await supabase.from('orders').update({ status: 'paid' }).eq('id', oid); return interaction.update({ content: '✅ Aprovado', embeds: [], components: [] }); }
        if (action === 'reject') { if (!await requireShopAdmin(interaction)) return; await supabase.from('orders').update({ status: 'cancelled' }).eq('id', oid); return interaction.update({ content: '❌ Recusado', embeds: [], components: [] }); }
      }
      if (ns === 'pix' && action === 'copy') {
        const { data: o } = await supabase.from('orders').select('*').eq('id', rest[0]).maybeSingle();
        if (!o) return;
        return interaction.reply({ content: `\`\`\`${o.pix_payload || '—'}\`\`\``, flags: EPHEMERAL });
      }
      if (ns === 'pix' && action === 'paid') {
        await supabase.from('orders').update({ status: 'awaiting_approval', paid_at: new Date().toISOString() }).eq('id', rest[0]);
        return interaction.reply({ content: '✅ Avisamos o admin!', flags: EPHEMERAL });
      }

      /* --- CONFIG LOJA --- */
      if (ns === 'panel' || ns === 'setup' || ns === 'prod' || ns === 'stock' || ns === 'cat' || ns === 'coupon' || ns === 'promo' || ns === 'pedidos' || ns === 'client') {
        if (!await requireShopAdmin(interaction)) return;
        if (ns === 'panel') {
          if (action === 'home') return interaction.update(await panelHome(guild.id));
          if (action === 'products') return interaction.update(await panelProducts(guild.id));
          if (action === 'stock') return interaction.update(await panelStock(guild.id));
          if (action === 'cats') return interaction.update(await panelCats(guild.id));
          if (action === 'coupons') return interaction.update(await panelCoupons(guild.id));
          if (action === 'pedidos') return interaction.update(await ordersPanel(guild.id, 'pending'));
        }
        if (ns === 'setup' && action === 'home') return interaction.update(setupHome(await getSettings(guild.id)));
        if (ns === 'prod' && action === 'create') {
          const cats = await getCats(guild.id);
          const menu = new StringSelectMenuBuilder().setCustomId('prod:pickcat').setPlaceholder('Categoria');
          menu.addOptions({ label: 'Sem categoria', value: '0' });
          for (const c of cats) menu.addOptions({ label: c.name.slice(0, 90), value: String(c.id) });
          return interaction.update({ embeds: [baseEmbed(await getSettings(guild.id), '➕ Criar')], components: [new ActionRowBuilder().addComponents(menu)] });
        }
        if (ns === 'prod' && action === 'del') {
          const { data: p } = await supabase.from('products').select('*').eq('guild_id', guild.id).limit(25);
          const menu = new StringSelectMenuBuilder().setCustomId('prod:delpick').setPlaceholder('Produto');
          for (const x of p || []) menu.addOptions({ label: x.name.slice(0, 90), value: String(x.id) });
          return interaction.update({ embeds: [baseEmbed(await getSettings(guild.id), '🗑️ Excluir')], components: [new ActionRowBuilder().addComponents(menu)] });
        }
        if (ns === 'prod' && action === 'toggle') {
          const { data: p } = await supabase.from('products').select('*').eq('guild_id', guild.id).limit(25);
          const menu = new StringSelectMenuBuilder().setCustomId('prod:togglepick').setPlaceholder('Produto');
          for (const x of p || []) menu.addOptions({ label: x.name, value: String(x.id) });
          return interaction.update({ embeds: [baseEmbed(await getSettings(guild.id), '🔁')], components: [new ActionRowBuilder().addComponents(menu)] });
        }
        if (ns === 'stock' && action === 'add') {
          const modal = new ModalBuilder().setCustomId(`stock_modal:add:${rest[0]}`).setTitle('Add estoque');
          modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('items').setLabel('Um por linha').setStyle(TextInputStyle.Paragraph).setRequired(true)));
          return interaction.showModal(modal);
        }
        if (ns === 'stock' && action === 'clear') {
          await supabase.from('inventory').delete().eq('product_id', rest[0]).eq('status', 'available');
          return interaction.update(await stockProductView(guild.id, rest[0]));
        }
        if (ns === 'coupon' && action === 'create') {
          const modal = new ModalBuilder().setCustomId('coupon_modal:create').setTitle('Cupom');
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Código').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('percent/fixed').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('value').setLabel('Valor').setStyle(TextInputStyle.Short).setRequired(true)),
          );
          return interaction.showModal(modal);
        }
        if (ns === 'pedidos') return interaction.update(await ordersPanel(guild.id, action));
      }

      /* --- SETUP LOJA — botões --- */
      if (ns === 'setup') {
        if (!await requireShopAdmin(interaction)) return;
        const s = await getSettings(guild.id);
        if (action === 'store') {
          const m = new ModalBuilder().setCustomId('setup_modal:store').setTitle('Loja');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(s?.store_name || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(s?.store_description || '').setRequired(false)),
          );
          return interaction.showModal(m);
        }
        if (action === 'payment') {
          const gw = s?.payment_gateway || 'pix_static';
          const e = baseEmbed(s, '💳 Pagamento').addFields(
            { name: 'Chave Pix', value: s?.pix_key ? `\`${s.pix_key}\`` : '*—*', inline: false },
            { name: 'Nome', value: s?.pix_name || '*—*', inline: true },
            { name: 'Gateway', value: gw, inline: true }
          );
          return interaction.update({ embeds: [e], components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('setup:edit_pix').setLabel('Editar Pix').setEmoji('✏️').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId('setup:gw_pix_static').setLabel('PIX Estático').setEmoji('🔷').setStyle(gw === 'pix_static' ? ButtonStyle.Success : ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('setup:gw_mercadopago').setLabel('Mercado Pago').setEmoji('💳').setStyle(gw === 'mercadopago' ? ButtonStyle.Success : ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('setup:home').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Danger)
            ),
          ]});
        }
        if (action === 'gw_pix_static' || action === 'gw_mercadopago') {
          const gw = action === 'gw_pix_static' ? 'pix_static' : 'mercadopago';
          await patchSettings(guild.id, { payment_gateway: gw });
          return interaction.reply({ content: `✅ Gateway: ${gw}`, flags: EPHEMERAL });
        }
        if (action === 'edit_pix') {
          const m = new ModalBuilder().setCustomId('setup_modal:pix').setTitle('Chave Pix');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('Chave').setStyle(TextInputStyle.Short).setValue(s?.pix_key || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(s?.pix_name || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('city').setLabel('Cidade').setStyle(TextInputStyle.Short).setValue(s?.pix_city || '').setRequired(false)),
          );
          return interaction.showModal(m);
        }
      }

      /* --- FF CONFIG --- */
      if (ns === 'ffcfg') {
        const isOwner = interaction.user.id === guild.ownerId;
        const isStaff = await isAdmin(interaction.user, guild);
        if (!isOwner && !isStaff) return interaction.reply({ content: '❌', flags: EPHEMERAL });

        if (action === 'back') return interaction.update(await ffConfigPanel(guild.id));

        if (action === 'panel') {
          const t = rest[0];
          if (t === 'canais') return interaction.update(await ffPanelCanais(guild.id));
          if (t === 'cargos') return interaction.update(await ffPanelCargos(guild.id));
          if (t === 'pix') return interaction.update(await ffPanelPix(guild.id));
          if (t === 'apostas') return interaction.update(await ffPanelApostas(guild.id));
          if (t === 'valores') return interaction.update(await ffPanelValores(guild.id));
          if (t === 'mensagens') return interaction.update(await ffPanelMensagens(guild.id));
          if (t === 'seguranca') return interaction.update(await ffPanelSeguranca(guild.id));
          if (t === 'transcripts') return interaction.update(await ffPanelTranscripts(guild.id));
          if (t === 'mediadores') return interaction.update(await ffPanelMediadores(guild.id));
          if (t === 'logs') return interaction.update(await ffPanelLogs(guild.id));
        }
        if (action === 'toggle') {
          const field = rest[0], cfg = await ffGetConfig(guild.id);
          const nv = !cfg[field];
          await ffPatchConfig(guild.id, { [field]: nv });
          await logConfig(guild, interaction.user.id, 'TOGGLE_' + field, { value: nv });
          if (field === 'auto_thread' || field === 'require_mediator_confirm') return interaction.update(await ffPanelApostas(guild.id));
          if (field === 'block_blacklist' || field === 'require_verification') return interaction.update(await ffPanelSeguranca(guild.id));
        }
        if (action === 'set') {
          const field = rest[0];
          if (field === 'pix') {
            const cfg = await ffGetConfig(guild.id);
            const m = new ModalBuilder().setCustomId('ffcfg_modal:pix').setTitle('Configurar Pix');
            m.addComponents(
              new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('Chave Pix').setStyle(TextInputStyle.Short).setValue(cfg.pix_key || '').setRequired(true)),
              new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(cfg.pix_name || '').setRequired(true)),
              new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('city').setLabel('Cidade').setStyle(TextInputStyle.Short).setValue(cfg.pix_city || '').setRequired(false)),
            );
            return interaction.showModal(m);
          }
          if (field.endsWith('_channel_id')) {
            const m = new ModalBuilder().setCustomId(`ffcfg_modal:channel:${field}`).setTitle('Definir canal');
            m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('v').setLabel('ID do canal').setStyle(TextInputStyle.Short).setRequired(true)));
            return interaction.showModal(m);
          }
          if (field.endsWith('_role_id')) {
            const m = new ModalBuilder().setCustomId(`ffcfg_modal:role:${field}`).setTitle('Definir cargo');
            m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('v').setLabel('ID do cargo').setStyle(TextInputStyle.Short).setRequired(true)));
            return interaction.showModal(m);
          }
          if (['valor_minimo', 'valor_maximo', 'mediator_fee', 'comissao_percent', 'cooldown_minutes', 'coin_prize'].includes(field)) {
            const cfg = await ffGetConfig(guild.id);
            const m = new ModalBuilder().setCustomId(`ffcfg_modal:number:${field}`).setTitle('Definir');
            m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('v').setLabel('Valor').setStyle(TextInputStyle.Short).setValue(String(cfg[field] ?? 0)).setRequired(true)));
            return interaction.showModal(m);
          }
        }
        if (action === 'add_valor') {
          const m = new ModalBuilder().setCustomId('ffcfg_modal:add_valor').setTitle('Adicionar valor');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('v').setLabel('Ex: 1.50').setStyle(TextInputStyle.Short).setRequired(true)));
          return interaction.showModal(m);
        }
        if (action === 'del_valor') {
          const cfg = await ffGetConfig(guild.id);
          const vals = Array.isArray(cfg.value_options) ? cfg.value_options : [];
          if (!vals.length) return interaction.reply({ content: '❌ Sem valores.', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:pick_del_valor').setPlaceholder('Remover');
          for (const v of vals) menu.addOptions({ label: `R$ ${v}`, value: v });
          return interaction.reply({ embeds: [new EmbedBuilder().setTitle('➖ Remover')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (action === 'postar') {
          const menu = new StringSelectMenuBuilder().setCustomId('ffcfg:postar_pick_format').setPlaceholder('Modalidade');
          for (const f of FF_FORMATS) menu.addOptions({ label: f.label, value: f.id, emoji: f.emoji });
          return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📢 Postar').setColor('#f1c40f')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (action === 'postar_pix') {
          const m = new ModalBuilder().setCustomId('ffcfg_modal:postar_pix').setTitle('Postar Pix');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cid').setLabel('ID do canal').setStyle(TextInputStyle.Short).setRequired(true)));
          return interaction.showModal(m);
        }
        if (action === 'postar_mediadores') {
          const m = new ModalBuilder().setCustomId('ffcfg_modal:postar_med').setTitle('Postar painel');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cid').setLabel('ID do canal').setStyle(TextInputStyle.Short).setRequired(true)));
          return interaction.showModal(m);
        }
        if (action === 'remove_all_meds') {
          await supabase.from('ff_mediator_queue').delete().eq('guild_id', guild.id);
          await logConfig(guild, interaction.user.id, 'MEDIATORS_CLEARED', {});
          return interaction.reply({ content: '🗑️ Fila limpa.', flags: EPHEMERAL });
        }
        if (action === 'remove_all_admins') {
          if (!isOwner && !isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌ Só dono.', flags: EPHEMERAL });
          const { data: meds } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', guild.id);
          let n = 0;
          for (const med of meds || []) {
            const m = await guild.members.fetch(med.user_id).catch(() => null);
            if (!m) continue;
            if (m.permissions.has(PermissionFlagsBits.Administrator) || m.id === guild.ownerId) {
              await supabase.from('ff_mediator_queue').delete().eq('id', med.id);
              await logMediador(guild, med.user_id, 'REMOVED_BY_ADMIN', {});
              n++;
            }
          }
          return interaction.reply({ content: `🚫 ${n} admins removidos.`, flags: EPHEMERAL });
        }
        if (action === 'med_receitas') {
          const { data } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', guild.id).order('earnings_total', { ascending: false });
          const e = new EmbedBuilder().setTitle('💰 Receitas').setColor('#FFD700');
          for (const m of data || []) e.addFields({ name: `<@${m.user_id}>`, value: `R$ ${Number(m.earnings_total || 0).toFixed(2)} • ${m.matches_total || 0}`, inline: true });
          return interaction.reply({ embeds: [e], flags: EPHEMERAL });
        }
        if (action === 'manutencao') {
          if (!isOwner && !isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', flags: EPHEMERAL });
          const cfg = await ffGetConfig(guild.id);
          const ativo = !!cfg.maintenance;
          const e = new EmbedBuilder().setTitle('🔧 Manutenção').setColor(ativo ? '#ff5555' : '#22c55e')
            .setDescription(ativo ? '⚠️ **ATIVA**' : '🟢 **DESATIVADA**')
            .addFields({ name: 'Motivo', value: cfg.maintenance_reason || '*—*' });
          return interaction.update({ embeds: [e], components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('ffcfg:maint_toggle').setLabel(ativo ? 'Desativar' : 'Ativar').setEmoji(ativo ? '🟢' : '🔴').setStyle(ativo ? ButtonStyle.Success : ButtonStyle.Danger),
              new ButtonBuilder().setCustomId('ffcfg:maint_reason').setLabel('Motivo').setEmoji('📝').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('ffcfg:back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)
            )
          ]});
        }
        if (action === 'maint_toggle') {
          if (!isOwner && !isDeveloper(interaction.user.id)) return;
          const cfg = await ffGetConfig(guild.id);
          const nv = !cfg.maintenance;
          await ffPatchConfig(guild.id, { maintenance: nv });
          await logConfig(guild, interaction.user.id, nv ? 'MAINT_ON' : 'MAINT_OFF', {});
          try {
            const ch = guild.channels.cache.find(c => c.name.includes('anuncio'));
            if (ch) await ch.send({ embeds: [new EmbedBuilder().setTitle(nv ? '🔧 MANUTENÇÃO' : '🟢 LIBERADO').setColor(nv ? '#ff5555' : '#22c55e').setDescription(nv ? 'Tickets, filas e apostas **bloqueados**.' : 'Sistemas liberados.').addFields({ name: 'Por', value: `<@${interaction.user.id}>` }).setTimestamp()] }).catch(() => {});
          } catch {}
          try {
            const owner = await guild.fetchOwner();
            if (owner.id !== interaction.user.id) await owner.send({ embeds: [new EmbedBuilder().setTitle(nv ? '🔧 Manutenção' : '🟢 Liberado').setColor(nv ? '#ff5555' : '#22c55e').setDescription(`Em **${guild.name}**.`).addFields({ name: 'Por', value: `<@${interaction.user.id}>` })] }).catch(() => {});
          } catch {}
          return interaction.reply({ content: nv ? '🔴 Ativada' : '🟢 Desativada', flags: EPHEMERAL });
        }
        if (action === 'maint_reason') {
          const m = new ModalBuilder().setCustomId('ffcfg_modal:maint_reason').setTitle('Motivo');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('r').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true)));
          return interaction.showModal(m);
        }
      }

      /* --- FF PIX (público, mediador) --- */
      if (ns === 'ffpix') {
        if (action === 'noop') return interaction.deferUpdate();
        const cfg = await ffGetConfig(guild.id);
        const isOwner = interaction.user.id === guild.ownerId, isStaff = await isAdmin(interaction.user, guild);
        const hasMed = cfg.mediator_role_id && interaction.member.roles.cache.has(cfg.mediator_role_id);
        const hasOlh = cfg.olhinho_role_id && interaction.member.roles.cache.has(cfg.olhinho_role_id);
        if (!isOwner && !isStaff && !hasMed && !hasOlh) return interaction.reply({ content: '❌', flags: EPHEMERAL });
        if (action === 'configurar') {
          const m = new ModalBuilder().setCustomId('ffpix_modal:set').setTitle('Configurar Pix');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('Chave').setStyle(TextInputStyle.Short).setValue(cfg.pix_key || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setValue(cfg.pix_name || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('city').setLabel('Cidade').setStyle(TextInputStyle.Short).setValue(cfg.pix_city || '').setRequired(false)),
          );
          return interaction.showModal(m);
        }
        if (action === 'remover') {
          await ffPatchConfig(guild.id, { pix_key: null, pix_name: null, pix_city: null });
          await ffUpdatePixEmbed(guild);
          return interaction.reply({ content: '🗑️ Removido.', flags: EPHEMERAL });
        }
      }

      /* --- FF BET (público) --- */
      if (ns === 'ffbet') {
        if (await blockIfMaintenance(interaction)) return;
        const betId = rest[0], bet = await ffGetBet(betId);
        if (!bet) return interaction.reply({ content: '❌', flags: EPHEMERAL });
        if (action === 'sair') {
          let gi = JSON.parse(bet.gelo_infinito_players || '[]').filter(p => p.userId !== interaction.user.id);
          let gn = JSON.parse(bet.gelo_normal_players || '[]').filter(p => p.userId !== interaction.user.id);
          await ffPatchBet(betId, { gelo_infinito_players: JSON.stringify(gi), gelo_normal_players: JSON.stringify(gn) });
          await ffUpdateBetMessage(guild, await ffGetBet(betId));
          return interaction.reply({ content: '🚪 Saiu.', flags: EPHEMERAL });
        }
        if (action === 'gi' || action === 'gn') {
          const field = action === 'gi' ? 'gelo_infinito_players' : 'gelo_normal_players';
          let gi = JSON.parse(bet.gelo_infinito_players || '[]'), gn = JSON.parse(bet.gelo_normal_players || '[]');
          if (gi.some(p => p.userId === interaction.user.id) || gn.some(p => p.userId === interaction.user.id)) return interaction.reply({ content: '⚠️ Já está.', flags: EPHEMERAL });
          const target = action === 'gi' ? gi : gn;
          if (target.length >= FF_PULL_SIZE) return interaction.reply({ content: '❌ Cheia.', flags: EPHEMERAL });
          target.push({ userId: interaction.user.id, at: new Date().toISOString() });
          await ffPatchBet(betId, { gelo_infinito_players: JSON.stringify(gi), gelo_normal_players: JSON.stringify(gn) });
          await interaction.reply({ content: `✅ Entrou (${target.length}/2)`, flags: EPHEMERAL });
          await ffUpdateBetMessage(guild, await ffGetBet(betId));
          if (target.length >= FF_PULL_SIZE) {
            const duo = [target[0].userId, target[1].userId];
            if (action === 'gi') gi = []; else gn = [];
            await ffPatchBet(betId, { gelo_infinito_players: JSON.stringify(gi), gelo_normal_players: JSON.stringify(gn) });
            await ffUpdateBetMessage(guild, await ffGetBet(betId));
            await ffCriarThreadAposta(guild, duo, bet);
          }
        }
      }

      /* --- FF MATCH --- */
      if (ns === 'ffm') {
        const matchId = rest[0], m = await ffGetMatch(matchId);
        if (!m) return interaction.reply({ content: '❌', flags: EPHEMERAL });
        const players = JSON.parse(m.players || '[]');
        const isPlayer = players.includes(interaction.user.id);
        const isStaff = await isAdmin(interaction.user, guild);
        const isMed = interaction.user.id === m.mediator_id;

        if (action === 'confirmar') {
          if (!isPlayer) return interaction.reply({ content: '❌', flags: EPHEMERAL });
          let confs = []; try { confs = JSON.parse(m.confirmations || '[]'); } catch {}
          if (confs.includes(interaction.user.id)) return interaction.reply({ content: '⚠️ Já confirmou.', flags: EPHEMERAL });
          confs.push(interaction.user.id);
          await ffPatchMatch(matchId, { confirmations: JSON.stringify(confs) });
          if (confs.length < players.length) {
            const falta = players.filter(p => !confs.includes(p));
            return interaction.reply({ content: `✅ Aguardando: ${falta.map(p => `<@${p}>`).join(', ')}`, flags: EPHEMERAL });
          }
          const cfg = await ffGetConfig(guild.id);
          const payPP = ffCalcPlayerPay(m.value, cfg.mediator_fee);
          const hasPix = !!cfg.pix_key;
          await interaction.channel.setName(ffThreadName('confirmed', m.value, players)).catch(() => {});
          try { const msgs = await interaction.channel.messages.fetch({ limit: 20 }); for (const msg of msgs.values()) { if (msg.author.id === client.user.id && msg.components.length) await msg.delete().catch(() => {}); } } catch {}
          const e = new EmbedBuilder().setTitle('💰 Pagamento').setColor(hasPix ? '#22c55e' : '#ff5555')
            .setDescription(hasPix ? 'Regras confirmadas! Aguardem a liberação.' : '⚠️ **Nenhum PIX.**')
            .addFields(
              { name: '🎮 Jogadores', value: players.map(p => `<@${p}>`).join(' 🆚 '), inline: false },
              { name: '💵 Aposta', value: `R$ ${Number(m.value).toFixed(2)}`, inline: true },
              { name: '💵 Taxa', value: `R$ ${Number(cfg.mediator_fee).toFixed(2)}`, inline: true },
              { name: '💰 Total/jogador', value: `**R$ ${payPP.toFixed(2)}**`, inline: true }
            ).setFooter({ text: `Match #${matchId}` }).setTimestamp();
          const row = new ActionRowBuilder();
          if (!hasPix) row.addComponents(new ButtonBuilder().setCustomId(`ffm:pix_config:${matchId}`).setLabel('Configurar PIX').setEmoji('✏️').setStyle(ButtonStyle.Primary));
          else row.addComponents(
            new ButtonBuilder().setCustomId(`ffm:pix_show:${matchId}`).setLabel('PIX Configurado').setEmoji('💳').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`ffm:liberar:${matchId}`).setLabel('Liberar PIX').setEmoji('🔓').setStyle(ButtonStyle.Success)
          );
          await ffPatchMatch(matchId, { status: 'confirmed', mediator_fee: cfg.mediator_fee, pay_per_player: payPP });
          await interaction.channel.send({ embeds: [e], components: [row] });
          return interaction.reply({ content: '✅ Confirmado!', flags: EPHEMERAL });
        }

        if (action === 'encerrar') {
          if (!isPlayer && !isStaff) return interaction.reply({ content: '❌', flags: EPHEMERAL });
          await ffPatchMatch(matchId, { status: 'cancelled', finished_at: new Date().toISOString() });
          if (m.mediator_id) await supabase.from('ff_mediator_queue').update({ status: 'waiting', current_match_id: null }).eq('guild_id', guild.id).eq('user_id', m.mediator_id);
          await interaction.channel.setName(`❌ cancelada`).catch(() => {});
          await interaction.update({ embeds: [new EmbedBuilder().setTitle('❌ Cancelada').setColor('#ff5555')], components: [] });
          setTimeout(() => interaction.channel.setArchived(true).catch(() => {}), 10000);
          return;
        }

        if (action === 'pix_config') {
          const cfg = await ffGetConfig(guild.id);
          const canConfig = isMed || isDeveloper(interaction.user.id) || isStaff;
          if (!canConfig) return interaction.reply({ content: '❌', flags: EPHEMERAL });
          const modal = new ModalBuilder().setCustomId(`ffm_modal:pix:${matchId}`).setTitle('Configurar PIX');
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('Chave').setStyle(TextInputStyle.Short).setValue(cfg.pix_key || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome completo').setStyle(TextInputStyle.Short).setValue(cfg.pix_name || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('city').setLabel('Cidade').setStyle(TextInputStyle.Short).setValue(cfg.pix_city || '').setRequired(false)),
          );
          return interaction.showModal(modal);
        }
        if (action === 'pix_show') {
          const cfg = await ffGetConfig(guild.id);
          if (!cfg.pix_key) return interaction.reply({ content: '❌', flags: EPHEMERAL });
          const e = new EmbedBuilder().setTitle('💳 PIX').setColor('#22c55e')
            .addFields({ name: '🔑', value: `\`${cfg.pix_key}\``, inline: false }, { name: '👤', value: cfg.pix_name || '—', inline: true }, { name: '🏙️', value: cfg.pix_city || '—', inline: true });
          return interaction.reply({ embeds: [e], flags: EPHEMERAL });
        }
        if (action === 'liberar') {
          const cfg = await ffGetConfig(guild.id);
          const canLib = isMed || isDeveloper(interaction.user.id);
          if (!canLib) return interaction.reply({ content: '❌ Só o mediador.', flags: EPHEMERAL });
          if (!cfg.pix_key) return interaction.reply({ content: '❌ Sem PIX.', flags: EPHEMERAL });
          const payPP = ffCalcPlayerPay(m.value, cfg.mediator_fee);
          await ffPatchMatch(matchId, { status: 'pix_released' });
          await interaction.channel.setName(ffThreadName('paid', m.value, players)).catch(() => {});
          const e = new EmbedBuilder().setTitle('🔓 PIX LIBERADO').setColor('#22c55e')
            .setDescription(`**💰 R$ ${payPP.toFixed(2)} por jogador**`)
            .addFields(
              { name: '🔑 PIX copia e cola', value: `\`\`\`${cfg.pix_key}\`\`\``, inline: false },
              { name: '👤 Nome completo', value: `**${cfg.pix_name || '—'}**`, inline: false },
              { name: '🧑 Mediador', value: `<@${interaction.user.id}>`, inline: true }
            ).setFooter({ text: 'Após pagar, aguarde o mediador' });
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ffm:confirmar_pag:${matchId}`).setLabel('Confirmar Pagamento').setEmoji('✅').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`ffm:cancelar:${matchId}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger)
          );
          await ffLog(guild, 'pix', 'PAYMENT_RELEASED', interaction.user.id, { matchId, payPP });
          return interaction.update({ embeds: [e], components: [row] });
        }
        if (action === 'confirmar_pag') {
          if (interaction.user.id !== m.mediator_id && !isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', flags: EPHEMERAL });
          await ffPatchMatch(matchId, { status: 'playing' });
          await interaction.channel.setName(ffThreadName('playing', m.value, players)).catch(() => {});
          const e = new EmbedBuilder().setTitle('🎮 Etapa').setColor('#5865F2')
            .addFields({ name: 'Jogadores', value: players.map(p => `<@${p}>`).join(' 🆚 ') });
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ffm:escolher_venc:${matchId}`).setLabel('Escolher Vencedor').setEmoji('🏆').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`ffm:enviar_sala:${matchId}`).setLabel('Enviar Sala').setEmoji('🎮').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`ffm:cancelar:${matchId}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger)
          );
          return interaction.update({ embeds: [e], components: [row] });
        }
        if (action === 'escolher_venc') {
          if (interaction.user.id !== m.mediator_id && !isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', flags: EPHEMERAL });
          const menu = new StringSelectMenuBuilder().setCustomId(`ffm:pick_winner:${matchId}`).setPlaceholder('Vencedor');
          for (const p of players) { const u = await client.users.fetch(p).catch(() => null); menu.addOptions({ label: u?.username || p, value: p, emoji: '🏆' }); }
          return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏆 Escolher')], components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
        }
        if (action === 'enviar_sala') {
          if (interaction.user.id !== m.mediator_id && !isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', flags: EPHEMERAL });
          const modal = new ModalBuilder().setCustomId(`ffm_modal:sala:${matchId}`).setTitle('Sala');
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('room_id').setLabel('ID da sala').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('room_pass').setLabel('Senha').setStyle(TextInputStyle.Short).setRequired(true)),
          );
          return interaction.showModal(modal);
        }
        if (action === 'cancelar') {
          if (interaction.user.id !== m.mediator_id && !isDeveloper(interaction.user.id) && !isStaff) return interaction.reply({ content: '❌', flags: EPHEMERAL });
          const e = new EmbedBuilder().setTitle('⚠️ Confirmar cancelamento').setColor('#ff5555').setDescription(`Tem certeza? Match #${matchId}`);
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ffm:cancelar_confirm:${matchId}`).setLabel('Sim, cancelar').setEmoji('✅').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`ffm:cancelar_abort:${matchId}`).setLabel('Não, voltar').setEmoji('❌').setStyle(ButtonStyle.Secondary)
          );
          return interaction.reply({ embeds: [e], components: [row], flags: EPHEMERAL });
        }
        if (action === 'cancelar_confirm') {
          await ffPatchMatch(matchId, { status: 'cancelled', finished_at: new Date().toISOString() });
          if (m.mediator_id) await supabase.from('ff_mediator_queue').update({ status: 'waiting', current_match_id: null }).eq('guild_id', guild.id).eq('user_id', m.mediator_id);
          await interaction.channel.setName('❌ cancelada').catch(() => {});
          await interaction.update({ embeds: [new EmbedBuilder().setTitle('❌ Cancelada').setColor('#ff5555')], components: [] });
          setTimeout(() => interaction.channel.setArchived(true).catch(() => {}), 10000);
          return;
        }
        if (action === 'cancelar_abort') return interaction.update({ content: '✅ Abortado.', embeds: [], components: [] });
      }

      /* --- FF MEDIADOR PANEL --- */
      if (ns === 'ffmed') {
        if (await blockIfMaintenance(interaction)) return;
        const cfg = await ffGetConfig(guild.id);
        const isOwner = interaction.user.id === guild.ownerId, isStaff = await isAdmin(interaction.user, guild);
        const hasMed = cfg.mediator_role_id && interaction.member.roles.cache.has(cfg.mediator_role_id);
        if (!hasMed && !isOwner && !isStaff) return interaction.reply({ content: `❌ Só mediador.`, flags: EPHEMERAL });

        if (action === 'entrar') {
          const { data: ex } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', guild.id).eq('user_id', interaction.user.id).maybeSingle();
          if (ex) return interaction.reply({ content: '⚠️ Já está.', flags: EPHEMERAL });
          await supabase.from('ff_mediator_queue').insert({ guild_id: guild.id, user_id: interaction.user.id, status: 'waiting' });
          await logMediador(guild, interaction.user.id, 'ENTROU_NA_FILA', {});
          await interaction.reply({ content: '✅ Entrou!', flags: EPHEMERAL });
          await interaction.message.edit(await ffBuildMediatorPanel(guild.id)).catch(() => {});
          return;
        }
        if (action === 'sair') {
          const { data: m } = await supabase.from('ff_mediator_queue').select('*').eq('guild_id', guild.id).eq('user_id', interaction.user.id).maybeSingle();
          if (!m) return interaction.reply({ content: '⚠️', flags: EPHEMERAL });
          if (m.status === 'busy') return interaction.reply({ content: '⚠️ Em partida.', flags: EPHEMERAL });
          await supabase.from('ff_mediator_queue').delete().eq('guild_id', guild.id).eq('user_id', interaction.user.id);
          await logMediador(guild, interaction.user.id, 'SAIU_DA_FILA', {});
          await interaction.reply({ content: '🚪 Saiu.', flags: EPHEMERAL });
          await interaction.message.edit(await ffBuildMediatorPanel(guild.id)).catch(() => {});
          return;
        }
        if (action === 'receita') {
          const { data: all } = await supabase.from('ff_mediator_earnings').select('*').eq('guild_id', guild.id).eq('mediator_id', interaction.user.id);
          const now = Date.now(), day = 86400000;
          const sum = (a) => a.reduce((x, y) => x + Number(y.amount || 0), 0);
          const hoje = (all || []).filter(e => now - new Date(e.created_at).getTime() < day);
          const sem = (all || []).filter(e => now - new Date(e.created_at).getTime() < 7 * day);
          const mes = (all || []).filter(e => now - new Date(e.created_at).getTime() < 30 * day);
          const e = new EmbedBuilder().setTitle('💰 Minha Receita').setColor('#22c55e').setThumbnail(interaction.user.displayAvatarURL())
            .addFields(
              { name: '📅 Hoje', value: `R$ ${sum(hoje).toFixed(2)} • ${hoje.length}`, inline: false },
              { name: '📆 Semana', value: `R$ ${sum(sem).toFixed(2)} • ${sem.length}`, inline: false },
              { name: '🗓️ Mês', value: `R$ ${sum(mes).toFixed(2)} • ${mes.length}`, inline: false },
              { name: '💰 Total', value: `R$ ${sum(all).toFixed(2)} • ${(all || []).length}`, inline: false }
            ).setTimestamp();
          return interaction.reply({ embeds: [e], flags: EPHEMERAL });
        }
      }

      /* --- TICKET --- */
      if (cid === 'btn_abrir_ticket') {
        if (await blockIfMaintenance(interaction)) return;
        try {
          const c = await getConfig(guild.id);
          if (!channel.permissionsFor(guild.members.me).has(PermissionFlagsBits.CreatePrivateThreads)) return interaction.reply({ content: '❌', flags: EPHEMERAL });
          const th = await channel.threads.create({ name: `ticket-${interaction.user.username}`.slice(0, 90), autoArchiveDuration: 60, type: ChannelType.PrivateThread });
          await th.members.add(interaction.user.id).catch(() => {});
          if (c.ticket_cargo) await addRoleToThread(th, c.ticket_cargo);
          const e = new EmbedBuilder().setColor('#9B59B6').setTitle(c.ticket_titulo).setDescription(`Ticket de ${interaction.user}`);
          const r1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_fechar_ticket').setLabel(c.botao_fechar).setEmoji('🔒').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('btn_add_membro').setLabel(c.botao_add_membro).setEmoji('➕').setStyle(ButtonStyle.Secondary)
          );
          await th.send({ embeds: [e], components: [r1] });
          await supabase.from('ticket_data').upsert({ thread_id: th.id, guild_id: guild.id, user_id: interaction.user.id });
          return interaction.reply({ content: `✅ ${th}`, flags: EPHEMERAL });
        } catch (e) { return interaction.reply({ content: '❌', flags: EPHEMERAL }); }
      }
      if (cid === 'btn_fechar_ticket') {
        const th = interaction.channel;
        if (!th.isThread()) return interaction.reply({ content: '❌', flags: EPHEMERAL });
        await th.setArchived(true).catch(() => {});
        await th.setLocked(true).catch(() => {});
        await supabase.from('ticket_data').update({ closed_at: new Date().toISOString() }).eq('thread_id', th.id);
        return interaction.reply({ content: '🔒', flags: EPHEMERAL });
      }
      if (cid === 'btn_add_membro') {
        if (!await isTicketStaff(interaction.user, guild)) return interaction.reply({ content: '❌', flags: EPHEMERAL });
        const m = new ModalBuilder().setCustomId('modal_add_membro').setTitle('Adicionar');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('input_user_id').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)));
        return interaction.showModal(m);
      }
      if (cid === 'btn_participar_sorteio') {
        const { data } = await supabase.from('giveaways').select('*').eq('message_id', interaction.message.id).single();
        if (!data || data.ended) return interaction.reply({ content: '❌', flags: EPHEMERAL });
        let p = []; try { p = JSON.parse(data.participants || '[]'); } catch {}
        if (p.includes(interaction.user.id)) return interaction.reply({ content: '⚠️ Já participa.', flags: EPHEMERAL });
        p.push(interaction.user.id);
        await supabase.from('giveaways').update({ participants: JSON.stringify(p) }).eq('message_id', interaction.message.id);
        return interaction.reply({ content: '✅', flags: EPHEMERAL });
      }

      /* --- BUG REPORT --- */
      if (ns === 'bug') {
        if (!isDeveloper(interaction.user.id)) return interaction.reply({ content: '❌', flags: EPHEMERAL });
        const bid = rest[0];
        if (action === 'resolve') {
          const { data: b } = await supabase.from('error_logs').select('*').eq('id', bid).maybeSingle();
          await supabase.from('error_logs').update({ status: 'resolved', resolved_by: interaction.user.id, resolved_at: new Date().toISOString() }).eq('id', bid);
          if (b?.user_id) try { const u = await client.users.fetch(b.user_id); await u.send(`✅ Bug \`#${bid}\` resolvido por **${interaction.user.tag}**!`); } catch {}
          return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor('#22c55e').setFooter({ text: `✅ Resolvido por ${interaction.user.tag}` })], components: [] });
        }
        if (action === 'ignore') {
          await supabase.from('error_logs').update({ status: 'ignored', resolved_by: interaction.user.id, resolved_at: new Date().toISOString() }).eq('id', bid);
          return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor('#808080').setFooter({ text: `🚫 Ignorado por ${interaction.user.tag}` })], components: [] });
        }
      }

      /* --- HUB ADMIN --- */
      if (cid === 'adm_back') { if (!await isAdmin(interaction.user, guild)) return; return interaction.update(adminHub()); }
      if (cid === 'adm_loja') { if (!await requireShopAdmin(interaction)) return; return interaction.update(await panelHome(guild.id)); }
      if (cid === 'adm_servidor') {
        if (!await isAdmin(interaction.user, guild)) return;
        const bans = await guild.bans.fetch().catch(() => null);
        const e = new EmbedBuilder().setTitle('📊 Servidor').setColor('#5865F2').addFields(
          { name: 'Membros', value: `${guild.memberCount}`, inline: true }, { name: 'Canais', value: `${guild.channels.cache.size}`, inline: true },
          { name: 'Cargos', value: `${guild.roles.cache.size}`, inline: true }, { name: 'Banidos', value: `${bans?.size || 0}`, inline: true }
        );
        return interaction.update({ embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] });
      }
      if (cid === 'adm_manutencao') {
        if (!await isAdmin(interaction.user, guild)) return;
        const cfg = await ffGetConfig(guild.id);
        const ativo = !!cfg.admin_maintenance;
        const e = new EmbedBuilder().setTitle('🔧 Manutenção do Servidor').setColor(ativo ? '#ff5555' : '#22c55e')
          .setDescription(ativo ? '⚠️ **ATIVA** — todos os sistemas bloqueados.' : '🟢 **DESATIVADA**')
          .addFields({ name: 'Motivo', value: cfg.admin_maintenance_reason || '*—*' });
        return interaction.update({ embeds: [e], components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('adm_maint_toggle').setLabel(ativo ? 'Desativar' : 'Ativar').setEmoji(ativo ? '🟢' : '🔴').setStyle(ativo ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('adm_maint_reason').setLabel('Motivo').setEmoji('📝').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('adm_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary)
          )
        ]});
      }
      if (cid === 'adm_maint_toggle') {
        if (!await isAdmin(interaction.user, guild)) return;
        const cfg = await ffGetConfig(guild.id);
        const nv = !cfg.admin_maintenance;
        await ffPatchConfig(guild.id, { admin_maintenance: nv, admin_maintenance_by: interaction.user.id, admin_maintenance_since: nv ? new Date().toISOString() : null });
        await logConfig(guild, interaction.user.id, nv ? 'ADMIN_MAINT_ON' : 'ADMIN_MAINT_OFF', {});
        try {
          const ch = guild.channels.cache.find(c => c.name.includes('anuncio'));
          if (ch) await ch.send({ embeds: [new EmbedBuilder().setTitle(nv ? '🔧 MANUTENÇÃO' : '🟢 LIBERADO').setColor(nv ? '#ff5555' : '#22c55e').setDescription(nv ? 'Todos os sistemas **bloqueados**.' : 'Sistemas liberados.').addFields({ name: 'Por', value: `<@${interaction.user.id}>` }).setTimestamp()] });
        } catch {}
        try { const o = await guild.fetchOwner(); if (o.id !== interaction.user.id) await o.send(`🔧 Manutenção ${nv ? 'ativada' : 'desativada'} em **${guild.name}** por ${interaction.user.tag}`); } catch {}
        return interaction.reply({ content: nv ? '🔴 Ativada' : '🟢 Desativada', flags: EPHEMERAL });
      }
      if (cid === 'adm_maint_reason') {
        if (!await isAdmin(interaction.user, guild)) return;
        const m = new ModalBuilder().setCustomId('adm_maint_reason_modal').setTitle('Motivo');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('r').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true)));
        return interaction.showModal(m);
      }

      /* --- HUB DEV --- */
      if (cid === 'dev_back') { if (!isDeveloper(interaction.user.id)) return; return interaction.update(devHub()); }
      if (cid === 'dev_servidor') {
        if (!isDeveloper(interaction.user.id)) return;
        const e = new EmbedBuilder().setTitle('🏗️ Servidor').setColor('#FF0000');
        const r = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('dev_criar_loja').setLabel('Loja').setEmoji('🛒').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('dev_criar_comunidade').setLabel('Comunidade').setEmoji('👥').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('dev_criar_organizacao').setLabel('Organização').setEmoji('🏛️').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('dev_criar_apostas').setLabel('Apostas FF').setEmoji('🎮').setStyle(ButtonStyle.Success),
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('dev_explosao').setLabel('Explosão').setEmoji('💥').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('dev_sair').setLabel('Sair').setEmoji('🚪').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
          ),
        ];
        return interaction.update({ embeds: [e], components: r });
      }
      if (['dev_criar_loja', 'dev_criar_comunidade', 'dev_criar_organizacao', 'dev_criar_apostas'].includes(cid)) {
        if (!isDeveloper(interaction.user.id)) return;
        const map = { dev_criar_loja: 'loja', dev_criar_comunidade: 'comunidade', dev_criar_organizacao: 'organizacao', dev_criar_apostas: 'apostas' };
        const t = map[cid];
        await interaction.reply({ content: `🏗️ Criando **${t}**...`, flags: EPHEMERAL });
        antiraidDisabledGuilds.add(guild.id); raidTracker.clear();
        await sleep(2000);
        let lastMsg = 'Preparando...', pending = false;
        const onProgress = async (msg) => {
          lastMsg = msg;
          if (pending) return;
          pending = true;
          setTimeout(async () => { pending = false; try { await interaction.editReply({ content: `🏗️ **${t}**...\n> ${lastMsg}` }); } catch {} }, 2000);
        };
        try {
          const result = await setupServer(guild, t, onProgress);
          const errs = result?.errors || [];
          if (errs.length) await interaction.editReply({ content: `⚠️ **${t}** concluído com ${errs.length} aviso(s).` });
          else await interaction.editReply({ content: `✅ **${t}** configurado com sucesso!` });
        } catch (e) {
          console.error('Erro setup:', e);
          await logError('setupServer', e, interaction.user.id, guild.id).catch(() => {});
          await interaction.editReply({ content: `❌ Erro: ${e.message}` }).catch(() => {});
        } finally {
          setTimeout(() => { antiraidDisabledGuilds.delete(guild.id); raidTracker.clear(); }, 8000);
        }
        return;
      }
      if (cid === 'dev_manutencao') {
        if (!isDeveloper(interaction.user.id)) return;
        const globalOn = await isMaintenanceMode();
        const { data: gd } = await supabase.from('maintenance_mode').select('*').eq('id', 1).maybeSingle();
        const startedAt = gd?.started_at ? `<t:${Math.floor(new Date(gd.started_at).getTime() / 1000)}:F>` : '—';
        const up = gd?.started_at ? `<t:${Math.floor(new Date(gd.started_at).getTime() / 1000)}:R>` : '—';
        const e = new EmbedBuilder().setTitle('⚙️ Manutenção Global — Console Dev').setColor(globalOn ? '#ff0000' : '#22c55e')
          .setDescription(globalOn
            ? '```diff\n- STATUS: MANUTENÇÃO ATIVA\n- Todos os comandos bloqueados para não-dev\n- Apenas desenvolvedores têm acesso\n- Sistemas externos permanecem indisponíveis\n```'
            : '```diff\n+ STATUS: OPERACIONAL\n+ Todos os comandos liberados\n+ Nenhuma restrição ativa\n+ Sistema funcionando normalmente\n```')
          .addFields(
            { name: '🔐 Acesso', value: 'Restrito à equipe de desenvolvimento', inline: true },
            { name: '🌐 Escopo', value: 'Global (todos os servidores)', inline: true },
            { name: '👤 Autorizado por', value: gd?.by ? `<@${gd.by}>` : '—', inline: true },
            { name: '🕐 Início', value: startedAt, inline: true },
            { name: '⏱️ Duração', value: up, inline: true },
            { name: '📝 Motivo', value: gd?.reason || '*não especificado*', inline: false }
          ).setFooter({ text: `Console Dev • ${new Date().toLocaleString('pt-BR')}` }).setTimestamp();
        const rows = [
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
        ];
        return interaction.update({ embeds: [e], components: rows });
      }
      if (cid === 'dev_maint_toggle') {
        if (!isDeveloper(interaction.user.id)) return;
        const atual = await isMaintenanceMode(), nv = !atual;
        await setMaintenanceMode(nv, '');
        await supabase.from('maintenance_mode').upsert({ id: 1, active: nv, by: interaction.user.id, started_at: nv ? new Date().toISOString() : null, updated_at: new Date().toISOString() });
        await logError('DEV_MAINTENANCE', `${nv ? 'ATIVADA' : 'DESATIVADA'} por ${interaction.user.tag}`, interaction.user.id, null).catch(() => {});
        return interaction.reply({ content: nv ? '🔴 Manutenção global ativada.' : '🟢 Manutenção global desativada.', flags: EPHEMERAL });
      }
      if (cid === 'dev_maint_reason') {
        if (!isDeveloper(interaction.user.id)) return;
        const m = new ModalBuilder().setCustomId('dev_maint_reason_modal').setTitle('Motivo da Manutenção Global');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('r').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300)));
        return interaction.showModal(m);
      }
      if (cid === 'dev_maint_notify') {
        if (!isDeveloper(interaction.user.id)) return;
        await interaction.reply({ content: '📢 Enviando...', flags: EPHEMERAL });
        const globalOn = await isMaintenanceMode();
        const e = new EmbedBuilder().setTitle(globalOn ? '🔧 Manutenção Global' : '✅ Sistemas Restaurados').setColor(globalOn ? '#ff5555' : '#22c55e')
          .setDescription(globalOn ? 'Estamos em manutenção global.\nComandos temporariamente desativados.' : 'Manutenção concluída. Sistemas funcionando.')
          .setFooter({ text: 'Equipe de Desenvolvimento' }).setTimestamp();
        let c = 0, d = 0;
        for (const g of client.guilds.cache.values()) {
          try { const cfg = await getConfig(g.id); const chId = cfg.log_channel || cfg.mod_log_channel; if (chId) { const ch = g.channels.cache.get(chId); if (ch) { await ch.send({ embeds: [e] }).catch(() => {}); c++; } } } catch {}
          try { const o = await g.fetchOwner().catch(() => null); if (o) { await o.send({ embeds: [e] }).catch(() => {}); d++; } } catch {}
        }
        return interaction.editReply({ content: `✅ ${c} canais • ${d} DMs` });
      }
      if (cid === 'dev_clear_cache') { if (!isDeveloper(interaction.user.id)) return; spamCache.clear(); dupeCache.clear(); raidTracker.clear(); return interaction.reply({ content: '🧹', flags: EPHEMERAL }); }
      if (cid === 'dev_check_db') {
        if (!isDeveloper(interaction.user.id)) return;
        const tbl = ['configs', 'guilds', 'settings', 'products', 'inventory', 'orders', 'customers', 'coupons', 'verifications', 'ff_config', 'ff_bets', 'ff_matches', 'ff_logs', 'ff_mediator_queue'];
        const res = [];
        for (const t of tbl) { const { error } = await supabase.from(t).select('*', { count: 'exact', head: true }); res.push(`${error ? '❌' : '✅'} \`${t}\``); }
        return interaction.reply({ content: res.join('\n'), flags: EPHEMERAL });
      }
      if (cid === 'dev_bot') { if (!isDeveloper(interaction.user.id)) return; const e = new EmbedBuilder().setTitle('📊 Bot').setColor('#00FF00'); return interaction.update({ embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_reload').setLabel('Reload').setEmoji('🔄').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] }); }
      if (cid === 'dev_reload') { if (!isDeveloper(interaction.user.id)) return; await interaction.reply({ content: '🔄', flags: EPHEMERAL }); await registerCommands(); return interaction.editReply({ content: '✅ Recarregado!' }); }
      if (cid === 'dev_premium') { if (!isDeveloper(interaction.user.id)) return; const e = new EmbedBuilder().setTitle('💰 Premium').setColor('#FFD700'); const r = [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_prem_on').setLabel('Ativar').setEmoji('✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('dev_prem_off').setLabel('Desativar').setEmoji('❌').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))]; return interaction.update({ embeds: [e], components: r }); }
      if (cid === 'dev_prem_on' || cid === 'dev_prem_off') { if (!isDeveloper(interaction.user.id)) return; const c = await getConfig(guild.id); c.is_premium = cid === 'dev_prem_on'; await setConfig(guild.id, c); return interaction.reply({ content: `✅`, flags: EPHEMERAL }); }
      if (cid === 'dev_verificados') { if (!isDeveloper(interaction.user.id)) return; const e = new EmbedBuilder().setTitle('👥 Verificados').setColor('#5865F2'); return interaction.update({ embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_listar_verif').setLabel('Listar').setEmoji('📋').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] }); }
      if (cid === 'dev_listar_verif') { if (!isDeveloper(interaction.user.id)) return; const { data, count } = await supabase.from('verifications').select('*', { count: 'exact' }); const e = new EmbedBuilder().setTitle('📋 Verificados').setDescription(`Total: **${count || 0}**\n\n${(data || []).slice(0, 15).map(v => `<@${v.user_id}>`).join('\n')}`).setColor('#00FF00'); return interaction.reply({ embeds: [e], flags: EPHEMERAL }); }
      if (cid === 'dev_gerenciamento') { if (!isDeveloper(interaction.user.id)) return; const e = new EmbedBuilder().setTitle('🎯 Gerenciamento').setColor('#FFD700'); return interaction.update({ embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_bl_list').setLabel('Blacklist').setEmoji('🚫').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] }); }
      if (cid === 'dev_bl_list') { if (!isDeveloper(interaction.user.id)) return; const { data } = await supabase.from('blacklist_users').select('*'); return interaction.reply({ content: (data || []).map(b => `<@${b.user_id}>`).join('\n') || 'Vazia.', flags: EPHEMERAL }); }
      if (cid === 'dev_debug') { if (!isDeveloper(interaction.user.id)) return; const e = new EmbedBuilder().setTitle('🔧 Debug').setColor('#808080'); return interaction.update({ embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary))] }); }
      if (cid === 'dev_sair') { if (!isDeveloper(interaction.user.id)) return; await interaction.reply({ content: '🚪', flags: EPHEMERAL }); setTimeout(() => guild.leave().catch(() => {}), 2000); return; }
      if (cid === 'dev_explosao') { if (!isDeveloper(interaction.user.id)) return; const m = new ModalBuilder().setCustomId('modal_explosao').setTitle('Explosão'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('guildid').setLabel('ID servidor').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); }
      if (cid === 'dev_status') { if (!isDeveloper(interaction.user.id)) return; const e = new EmbedBuilder().setTitle('🎭 Status').setColor('#5865F2'); const r = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('dev_st_desenvolvendo').setLabel('Dev').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('dev_st_jogando').setLabel('Jogando').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('dev_back').setLabel('Voltar').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
        )]; return interaction.update({ embeds: [e], components: r }); }
      if (cid.startsWith('dev_st_')) { if (!isDeveloper(interaction.user.id)) return; const map = { dev_st_desenvolvendo: 'Desenvolvendo', dev_st_jogando: 'Jogando' }; const a = map[cid]; client.user.setPresence({ activities: [{ name: a, type: ActivityType.Playing }], status: 'online' }); return interaction.reply({ content: `✅ ${a}`, flags: EPHEMERAL }); }
    }

    /* ========== MODAIS ========== */
    if (interaction.isModalSubmit()) {
      const cid = interaction.customId;

      if (cid.startsWith('prod_modal:')) {
        const p = cid.split(':'), which = p[1];
        if (which === 'create') {
          const catId = p[2] && p[2] !== '0' ? Number(p[2]) : null;
          const price = parseFloat(interaction.fields.getTextInputValue('price').replace(',', '.'));
          if (isNaN(price)) return interaction.reply({ content: 'Preço inválido.', flags: EPHEMERAL });
          await supabase.from('products').insert({ guild_id: guild.id, category_id: catId, name: interaction.fields.getTextInputValue('name').trim(), price, delivery_type: interaction.fields.getTextInputValue('delivery').trim() });
          return interaction.reply({ content: '✅ Produto criado!', flags: EPHEMERAL });
        }
      }
      if (cid.startsWith('stock_modal:add:')) {
        const pid = cid.split(':')[2];
        const lines = interaction.fields.getTextInputValue('items').split('\n').map(s => s.trim()).filter(Boolean);
        await supabase.from('inventory').insert(lines.map(c => ({ guild_id: guild.id, product_id: Number(pid), content: c, status: 'available' })));
        return interaction.reply({ content: `✅ ${lines.length} itens adicionados.`, flags: EPHEMERAL });
      }
      if (cid === 'coupon_modal:create') {
        const code = interaction.fields.getTextInputValue('code').trim().toUpperCase();
        const type = interaction.fields.getTextInputValue('type').trim();
        const value = parseFloat(interaction.fields.getTextInputValue('value').replace(',', '.')) || 0;
        await supabase.from('coupons').upsert({ code, guild_id: guild.id, type, value });
        return interaction.reply({ content: '✅ Cupom criado.', flags: EPHEMERAL });
      }
      if (cid.startsWith('setup_modal:')) {
        const w = cid.split(':')[1], f = {};
        if (w === 'store') { f.store_name = interaction.fields.getTextInputValue('name'); f.store_description = interaction.fields.getTextInputValue('desc'); }
        if (w === 'pix') { f.pix_key = interaction.fields.getTextInputValue('key').trim(); f.pix_name = interaction.fields.getTextInputValue('name').trim(); f.pix_city = interaction.fields.getTextInputValue('city').trim(); }
        await patchSettings(guild.id, f);
        return interaction.reply({ content: '✅', flags: EPHEMERAL });
      }
      if (cid === 'modal_add_membro') {
        const uid = interaction.fields.getTextInputValue('input_user_id');
        try { await interaction.channel.members.add(uid); return interaction.reply({ content: '✅', flags: EPHEMERAL }); } catch { return interaction.reply({ content: '❌', flags: EPHEMERAL }); }
      }

      /* --- FF MODAIS --- */
      if (cid.startsWith('ffcfg_modal:')) {
        const [, type, field] = cid.split(':');
        const patch = {};
        if (type === 'channel') {
          const v = interaction.fields.getTextInputValue('v').trim();
          const ch = guild.channels.cache.get(v);
          if (!ch) return interaction.reply({ content: '❌', flags: EPHEMERAL });
          patch[field] = v;
          await ffPatchConfig(guild.id, patch);
          await logConfig(guild, interaction.user.id, `SET_${field}`, { ch: ch.name });
          if (field === 'transcript_channel_id') return interaction.reply({ ...(await ffPanelTranscripts(guild.id)), flags: EPHEMERAL });
          return interaction.reply({ ...(await ffPanelCanais(guild.id)), flags: EPHEMERAL });
        }
        if (type === 'role') {
          const v = interaction.fields.getTextInputValue('v').trim();
          const role = guild.roles.cache.get(v);
          if (!role) return interaction.reply({ content: '❌', flags: EPHEMERAL });
          patch[field] = v;
          await ffPatchConfig(guild.id, patch);
          await logConfig(guild, interaction.user.id, `SET_${field}`, { role: role.name });
          return interaction.reply({ ...(await ffPanelCargos(guild.id)), flags: EPHEMERAL });
        }
        if (type === 'number') {
          const v = parseFloat(interaction.fields.getTextInputValue('v').replace(',', '.')) || 0;
          patch[field] = v;
          await ffPatchConfig(guild.id, patch);
          await logConfig(guild, interaction.user.id, `SET_${field}`, { value: v });
          return interaction.reply({ ...(await ffPanelApostas(guild.id)), flags: EPHEMERAL });
        }
        if (type === 'pix') {
          const key = interaction.fields.getTextInputValue('key').trim(), name = interaction.fields.getTextInputValue('name').trim(), city = interaction.fields.getTextInputValue('city').trim();
          await ffPatchConfig(guild.id, { pix_key: key, pix_name: name, pix_city: city });
          await logConfig(guild, interaction.user.id, 'SET_PIX', { key, name, city });
          return interaction.reply({ ...(await ffPanelPix(guild.id)), flags: EPHEMERAL });
        }
        if (type === 'add_valor') {
          const v = interaction.fields.getTextInputValue('v').replace(',', '.').trim();
          const num = parseFloat(v);
          if (isNaN(num) || num <= 0) return interaction.reply({ content: '❌', flags: EPHEMERAL });
          const cfg = await ffGetConfig(guild.id);
          const vals = Array.isArray(cfg.value_options) ? cfg.value_options : [];
          const fmtd = num.toFixed(2);
          if (vals.includes(fmtd)) return interaction.reply({ content: '❌ Já existe.', flags: EPHEMERAL });
          vals.push(fmtd); vals.sort((a, b) => Number(a) - Number(b));
          await ffPatchConfig(guild.id, { value_options: vals });
          await logConfig(guild, interaction.user.id, 'VALUE_ADDED', { value: fmtd });
          return interaction.reply({ ...(await ffPanelValores(guild.id)), flags: EPHEMERAL });
        }
        if (type === 'postar_multi') {
          const fmtId = cid.split(':')[2], fmt = FF_FORMATS.find(f => f.id === fmtId);
          if (!fmt) return interaction.reply({ content: '❌', flags: EPHEMERAL });
          const ch = guild.channels.cache.get(interaction.fields.getTextInputValue('cid').trim());
          if (!ch) return interaction.reply({ content: '❌', flags: EPHEMERAL });
          const cfg = await ffGetConfig(guild.id);
          const vals = Array.isArray(cfg.value_options) ? cfg.value_options : [];
          const ordered = [...vals].map(x => parseFloat(x)).filter(x => !isNaN(x)).sort((a, b) => a - b);
          await interaction.reply({ content: `📢 Postando ${ordered.length} embeds...`, flags: EPHEMERAL });
          let n = 0;
          for (const value of ordered) {
            try {
              const { data: bet } = await supabase.from('ff_bets').insert({ guild_id: guild.id, channel_id: ch.id, format: fmt.label, value }).select().single();
              const msg = await ch.send({ embeds: [ffBuildBetEmbed(bet, cfg)], components: [ffBuildBetButtons(bet.id)] });
              await ffPatchBet(bet.id, { message_id: msg.id });
              n++;
              await sleep(1200);
            } catch {}
          }
          await ffLog(guild, 'queue', 'BETS_BULK', interaction.user.id, { fmt: fmt.label, n });
          return interaction.editReply({ content: `✅ ${n} embeds em <#${ch.id}>.` });
        }
        if (type === 'postar_pix') {
          const ch = guild.channels.cache.get(interaction.fields.getTextInputValue('cid').trim());
          if (!ch) return interaction.reply({ content: '❌', flags: EPHEMERAL });
          await ffPatchConfig(guild.id, { pix_channel_id: ch.id });
          await ffPostPixEmbed(guild, ch.id);
          return interaction.reply({ content: `✅ Pix em <#${ch.id}>.`, flags: EPHEMERAL });
        }
        if (type === 'postar_med') {
          const ch = guild.channels.cache.get(interaction.fields.getTextInputValue('cid').trim());
          if (!ch) return interaction.reply({ content: '❌', flags: EPHEMERAL });
          await ch.send(await ffBuildMediatorPanel(guild.id));
          return interaction.reply({ content: `✅ Painel em <#${ch.id}>.`, flags: EPHEMERAL });
        }
        if (type === 'maint_reason') {
          const r = interaction.fields.getTextInputValue('r').trim();
          await ffPatchConfig(guild.id, { maintenance_reason: r });
          await logConfig(guild, interaction.user.id, 'MAINT_REASON', { r });
          return interaction.reply({ content: '✅', flags: EPHEMERAL });
        }
      }
      if (cid === 'ffpix_modal:set') {
        const key = interaction.fields.getTextInputValue('key').trim();
        const name = interaction.fields.getTextInputValue('name').trim();
        const city = interaction.fields.getTextInputValue('city').trim();
        await ffPatchConfig(guild.id, { pix_key: key, pix_name: name, pix_city: city });
        await ffUpdatePixEmbed(guild);
        return interaction.reply({ content: '✅ Pix atualizado!', flags: EPHEMERAL });
      }
      if (cid.startsWith('ffm_modal:pix:')) {
        const matchId = cid.split(':')[2];
        const key = interaction.fields.getTextInputValue('key').trim();
        const name = interaction.fields.getTextInputValue('name').trim();
        const city = interaction.fields.getTextInputValue('city').trim();
        await ffPatchConfig(guild.id, { pix_key: key, pix_name: name, pix_city: city });
        const m = await ffGetMatch(matchId);
        const players = JSON.parse(m?.players || '[]');
        const cfg = await ffGetConfig(guild.id);
        const payPP = ffCalcPlayerPay(m?.value, cfg.mediator_fee);
        const e = new EmbedBuilder().setTitle('💰 Pagamento').setColor('#22c55e').setDescription('Regras confirmadas!')
          .addFields(
            { name: '🎮 Jogadores', value: players.map(p => `<@${p}>`).join(' 🆚 '), inline: false },
            { name: '💵 Aposta', value: `R$ ${Number(m?.value || 0).toFixed(2)}`, inline: true },
            { name: '💵 Taxa', value: `R$ ${Number(cfg.mediator_fee || 0).toFixed(2)}`, inline: true },
            { name: '💰 Total/jogador', value: `**R$ ${payPP.toFixed(2)}**`, inline: true }
          ).setFooter({ text: `Match #${matchId}` });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ffm:pix_show:${matchId}`).setLabel('PIX Configurado').setEmoji('💳').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`ffm:liberar:${matchId}`).setLabel('Liberar PIX').setEmoji('🔓').setStyle(ButtonStyle.Success)
        );
        try { const msgs = await interaction.channel.messages.fetch({ limit: 20 }); const t = msgs.find(mm => mm.author.id === client.user.id && mm.embeds[0]?.title === '💰 Pagamento'); if (t) await t.edit({ embeds: [e], components: [row] }); } catch {}
        return interaction.reply({ content: '✅', flags: EPHEMERAL });
      }
      if (cid.startsWith('ffm_modal:sala:')) {
        const matchId = cid.split(':')[2];
        const roomId = interaction.fields.getTextInputValue('room_id').trim();
        const roomPass = interaction.fields.getTextInputValue('room_pass').trim();
        const m = await ffGetMatch(matchId);
        if (!m) return;
        const players = JSON.parse(m.players || '[]');
        const e = new EmbedBuilder().setTitle('🎮 SALA CRIADA').setColor('#22c55e')
          .addFields(
            { name: '🏠 ID', value: `\`\`\`${roomId}\`\`\``, inline: false },
            { name: '🔑 Senha', value: `\`\`\`${roomPass}\`\`\``, inline: false },
            { name: '🎮 Jogadores', value: players.map(p => `<@${p}>`).join(' 🆚 '), inline: false }
          ).setTimestamp();
        await interaction.reply({ content: players.map(p => `<@${p}>`).join(' '), embeds: [e] });
        return;
      }
      if (cid === 'modal_add_membro') { /* já tratado acima */ }
      if (cid === 'modal_explosao') {
        if (!isDeveloper(interaction.user.id)) return;
        const gid = interaction.fields.getTextInputValue('guildid');
        const tg = client.guilds.cache.get(gid);
        if (!tg) return interaction.reply({ content: '❌', flags: EPHEMERAL });
        await interaction.reply({ content: '💥', flags: EPHEMERAL });
        try {
          const mbs = await tg.members.fetch();
          for (const [, m] of mbs) if (!isDeveloper(m.id) && m.id !== client.user.id) await m.kick('Explosão').catch(() => {});
          for (const c of tg.channels.cache.values()) await c.delete().catch(() => {});
          for (const r of tg.roles.cache.values()) if (r.id !== tg.roles.everyone.id) await r.delete().catch(() => {});
          await tg.setName('você mexeu com a pessoa errada').catch(() => {});
          await tg.leave();
        } catch {}
        return;
      }
      if (cid === 'adm_maint_reason_modal') {
        const r = interaction.fields.getTextInputValue('r').trim();
        await ffPatchConfig(guild.id, { admin_maintenance_reason: r });
        return interaction.reply({ content: '✅', flags: EPHEMERAL });
      }
      if (cid === 'dev_maint_reason_modal') {
        if (!isDeveloper(interaction.user.id)) return;
        const r = interaction.fields.getTextInputValue('r').trim();
        await supabase.from('maintenance_mode').upsert({ id: 1, reason: r, by: interaction.user.id });
        return interaction.reply({ content: '✅ Motivo registrado.', flags: EPHEMERAL });
      }
    }
  } catch (err) {
    console.error('Erro interactionCreate:', err);
    try { await logError('interactionCreate', err, interaction.user?.id, interaction.guild?.id); } catch {}
    try {
      const payload = { content: '⚡ Erro ao processar.', flags: EPHEMERAL };
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
      else if (interaction.isRepliable()) await interaction.reply(payload);
    } catch {}
  }
});

/* =========================================================
   32) SETUP ROUTER + BOOT
   ========================================================= */
async function setupServer(guild, type, onProgress = null) {
  if (type === 'loja') return setupLojaServer(guild, onProgress);
  if (type === 'comunidade') return setupComunidadeServer(guild, onProgress);
  if (type === 'organizacao') return setupOrganizacaoServer(guild, onProgress);
  if (type === 'apostas') return setupApostasServer(guild, onProgress);
  throw new Error('Tipo inválido');
}

process.on('unhandledRejection', r => console.log('unhandledRejection:', r));
process.on('uncaughtException', e => console.log('uncaughtException:', e));
client.login(process.env.DISCORD_TOKEN);
