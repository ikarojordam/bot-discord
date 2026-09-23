// ═══════════════════════════════════════════════════════════
// 🔑 FRIO PANEL — Backend v3.0
// ═══════════════════════════════════════════════════════════
try { require('dotenv').config(); } catch {}
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PANEL_PORT || process.env.PORT || 10000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON || !SUPABASE_SERVICE) {
  console.error('❌ [PANEL] Faltando env vars obrigatórias');
  process.exit(1);
}

const supaPublic = createClient(SUPABASE_URL, SUPABASE_ANON);
const supaAdmin  = createClient(SUPABASE_URL, SUPABASE_SERVICE, { auth: { persistSession: false } });

const ROLES = ['dev', 'admin', 'funcionario', 'cliente'];

function genPassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
function cleanId(s) { return String(s || '').replace(/[<@!>]/g, '').trim(); }

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false, lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  },
}));

// ═══ AUTH ═══
async function requireAuth(req, res, next) {
  try {
    let token = null;
    if (req.cookies?.sb_token) token = req.cookies.sb_token;
    if (!token) {
      const auth = req.headers.authorization || '';
      if (auth.startsWith('Bearer ')) token = auth.slice(7).trim();
    }
    if (!token) token = req.headers['x-panel-token'] || null;
    if (!token) return res.status(401).json({ error: 'Não autenticado', hint: 'sem_token' });

    const { data: { user }, error } = await supaPublic.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Sessão inválida', hint: 'token_invalido' });

    const { data: admin } = await supaAdmin.from('panel_admins').select('*').eq('user_id', user.id).maybeSingle();
    if (!admin) return res.status(403).json({ error: 'Sem acesso ao painel', hint: 'sem_registro' });
    if (!admin.ativo) {
      if (admin.role === 'pending') return res.status(403).json({ error: 'Aguarde aprovação', code: 'PENDING' });
      return res.status(403).json({ error: 'Conta desativada' });
    }

    req.user = user;
    req.admin = admin;
    req.role = admin.role;
    next();
  } catch (e) {
    console.error('[AUTH]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
}

// ⚠️ FIX CRÍTICO: roda requireAuth ANTES de checar role
function requireRole(...allowed) {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      if (!allowed.includes(req.admin.role)) {
        return res.status(403).json({ error: `Permissão negada. Requer: ${allowed.join('/')}` });
      }
      next();
    });
  };
}
const requireDev   = requireRole('dev');
const requireAdmin = requireRole('dev', 'admin');
const requireStaff = requireRole('dev', 'admin', 'funcionario');

async function audit(req, action, opts = {}) {
  try {
    await supaAdmin.from('site_audit_log').insert({
      actor_id: req.user?.id || 'system', actor_email: req.user?.email || null,
      action, target_id: opts.target_id || null, target_role: opts.target_role || null,
      metadata: opts.metadata || null, ip: req.ip,
    });
  } catch (e) { console.error('[AUDIT]', e.message); }
}
async function notify(userId, type, title, content, metadata = null) {
  try { await supaAdmin.from('site_notifications').insert({ user_id: userId, type, title, content, metadata }); }
  catch (e) { console.error('[NOTIFY]', e.message); }
}
function ownsGuild(req, guildId) {
  if (['dev', 'admin'].includes(req.admin.role)) return true;
  return (req.admin.assigned_guilds || []).includes(guildId);
}

// ═══ PUBLIC ═══
app.get('/api/public-config', (req, res) => res.json({ supabase_url: SUPABASE_URL, supabase_anon: SUPABASE_ANON }));

// ═══ AUTH ═══
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'E-mail e senha obrigatórios' });
    const { data, error } = await supaPublic.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: 'E-mail ou senha inválidos' });
    if (!data.session) return res.status(401).json({ error: 'Sessão não criada' });

    const { data: admin } = await supaAdmin.from('panel_admins').select('*').eq('user_id', data.user.id).maybeSingle();
    if (!admin) { await supaPublic.auth.signOut(); return res.status(403).json({ error: 'Sem acesso ao painel' }); }
    if (!admin.ativo) {
      await supaPublic.auth.signOut();
      if (admin.role === 'pending') return res.status(403).json({ error: 'Aguarde aprovação do DEV', code: 'PENDING' });
      return res.status(403).json({ error: 'Conta desativada' });
    }

    res.cookie('sb_token', data.session.access_token, {
      httpOnly: false, secure: true, sameSite: 'none', path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    await audit({ user: data.user, ip: req.ip }, 'login');
    return res.json({
      ok: true,
      token: data.session.access_token,
      user: { id: data.user.id, email: data.user.email },
      admin: {
        nome: admin.nome, role: admin.role, is_owner: admin.role === 'dev',
        pode_gerar_keys: ['dev', 'admin', 'funcionario'].includes(admin.role),
        assigned_guilds: admin.assigned_guilds || [],
        discord_id: admin.discord_id || null,
      },
    });
  } catch (e) { console.error('[LOGIN]', e); res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try { await audit(req, 'logout'); res.clearCookie('sb_token'); return res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const a = req.admin;
  res.json({
    user: { id: req.user.id, email: req.user.email },
    admin: {
      nome: a.nome, role: a.role, is_owner: a.role === 'dev',
      pode_gerar_keys: ['dev', 'admin', 'funcionario'].includes(a.role),
      assigned_guilds: a.assigned_guilds || [],
      discord_id: a.discord_id || null,
    },
  });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, discord_id } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'E-mail e senha obrigatórios' });
    if (password.length < 8) return res.status(400).json({ error: 'Senha muito curta' });
    const { data: existing } = await supaAdmin.from('panel_admins').select('user_id, ativo').eq('email', email).maybeSingle();
    if (existing) return res.status(400).json({ error: existing.ativo ? 'E-mail já cadastrado' : 'Aguarde aprovação' });
    const { data: authData, error: authErr } = await supaAdmin.auth.admin.createUser({ email, password, email_confirm: true });
    if (authErr) return res.status(400).json({ error: authErr.message });
    const { error: dbErr } = await supaAdmin.from('panel_admins').insert({
      user_id: authData.user.id, email, nome: email.split('@')[0],
      role: 'pending', ativo: false, is_owner: false,
      discord_id: discord_id ? cleanId(discord_id) : null,
    });
    if (dbErr) { await supaAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {}); return res.status(500).json({ error: dbErr.message }); }
    await supaAdmin.from('site_audit_log').insert({ actor_id: authData.user.id, actor_email: email, action: 'register_pending', target_role: 'pending', ip: req.ip });
    const { data: devs } = await supaAdmin.from('panel_admins').select('user_id').eq('role', 'dev').eq('ativo', true);
    for (const d of devs || []) await notify(d.user_id, 'system', '🆕 Novo cadastro pendente', `${email} solicitou acesso.`, { user_id: authData.user.id });
    return res.json({ ok: true, message: 'Cadastro enviado! Aguarde aprovação.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/forgot', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'E-mail obrigatório' });
    const baseUrl = process.env.PANEL_URL || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : 'http://localhost:10000');
    await supaPublic.auth.resetPasswordForEmail(email, { redirectTo: `${baseUrl}/reset.html` });
    return res.json({ ok: true, message: 'Se o e-mail existir, enviaremos instruções.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/update-password', async (req, res) => {
  try {
    const { token, new_password } = req.body || {};
    if (!token || !new_password) return res.status(400).json({ error: 'Dados incompletos' });
    if (new_password.length < 8) return res.status(400).json({ error: 'Senha muito curta' });
    const { data: { user }, error: uErr } = await supaPublic.auth.getUser(token);
    if (uErr || !user) return res.status(401).json({ error: 'Token inválido' });
    const { error: updErr } = await supaAdmin.auth.admin.updateUserById(user.id, { password: new_password });
    if (updErr) return res.status(400).json({ error: updErr.message });
    await supaAdmin.from('site_audit_log').insert({ actor_id: user.id, actor_email: user.email, action: 'password_reset', ip: req.ip });
    return res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ DEV — USUÁRIOS ═══
app.get('/api/dev/usuarios', requireDev, async (req, res) => {
  try {
    const { role, ativo, search, limit = 100, offset = 0 } = req.query;
    let q = supaAdmin.from('panel_admins').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (role) q = q.eq('role', role);
    if (ativo === 'true') q = q.eq('ativo', true);
    if (ativo === 'false') q = q.eq('ativo', false);
    if (search) q = q.or(`email.ilike.%${search}%,nome.ilike.%${search}%,discord_id.eq.${search}`);
    const { data, error, count } = await q.range(Number(offset), Number(offset) + Number(limit) - 1);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, usuarios: data || [], total: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dev/usuarios/pending', requireDev, async (req, res) => {
  try {
    const { data } = await supaAdmin.from('panel_admins').select('*').eq('role', 'pending').order('created_at', { ascending: false });
    res.json({ ok: true, pendentes: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dev/usuarios', requireDev, async (req, res) => {
  try {
    const { email, discord_id, password, role, assigned_guilds, notes, nome } = req.body || {};
    if (!email || !role) return res.status(400).json({ error: 'Email e role obrigatórios' });
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Role inválido' });
    if (!discord_id) return res.status(400).json({ error: 'Discord ID obrigatório' });
    const { data: existing } = await supaAdmin.from('panel_admins').select('user_id').eq('email', email).maybeSingle();
    if (existing) return res.status(400).json({ error: 'E-mail já cadastrado' });
    const finalPassword = password && password.length >= 8 ? password : genPassword(12);
    const { data: authData, error: authErr } = await supaAdmin.auth.admin.createUser({ email, password: finalPassword, email_confirm: true });
    if (authErr) return res.status(400).json({ error: authErr.message });
    const { error: dbErr } = await supaAdmin.from('panel_admins').insert({
      user_id: authData.user.id, email, nome: nome || email.split('@')[0],
      role, ativo: true, is_owner: false,
      pode_gerar_keys: ['dev', 'admin', 'funcionario'].includes(role),
      discord_id: cleanId(discord_id),
      assigned_guilds: Array.isArray(assigned_guilds) ? assigned_guilds : [],
      notes: notes || null, approved_at: new Date().toISOString(), approved_by: req.user.email,
    });
    if (dbErr) { await supaAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {}); return res.status(500).json({ error: dbErr.message }); }
    await audit(req, `add_${role}`, { target_id: authData.user.id, target_role: role, metadata: { email } });
    await notify(authData.user.id, 'system', '👋 Bem-vindo!', `Conta (${role}) criada. Senha: ${finalPassword}`, { role });
    res.json({ ok: true, user_id: authData.user.id, temp_password: finalPassword });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dev/usuarios/:userId/approve', requireDev, async (req, res) => {
  try {
    const { role, assigned_guilds, notes } = req.body || {};
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Role inválido' });
    const { error } = await supaAdmin.from('panel_admins').update({
      role, ativo: true,
      pode_gerar_keys: ['dev', 'admin', 'funcionario'].includes(role),
      assigned_guilds: Array.isArray(assigned_guilds) ? assigned_guilds : [],
      notes: notes || null,
      approved_at: new Date().toISOString(), approved_by: req.user.email,
      updated_at: new Date().toISOString(),
    }).eq('user_id', req.params.userId);
    if (error) return res.status(500).json({ error: error.message });
    await audit(req, 'approve_user', { target_id: req.params.userId, target_role: role });
    await notify(req.params.userId, 'system', '✅ Aprovado!', `Você é ${role}.`, { role });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/dev/usuarios/:userId', requireDev, async (req, res) => {
  try {
    const { role, ativo, nome, discord_id, assigned_guilds, notes } = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    if (role && ROLES.includes(role)) { patch.role = role; patch.pode_gerar_keys = ['dev', 'admin', 'funcionario'].includes(role); }
    if (typeof ativo === 'boolean') patch.ativo = ativo;
    if (nome) patch.nome = nome;
    if (discord_id !== undefined) patch.discord_id = discord_id ? cleanId(discord_id) : null;
    if (Array.isArray(assigned_guilds)) patch.assigned_guilds = assigned_guilds;
    if (notes !== undefined) patch.notes = notes || null;
    const { error } = await supaAdmin.from('panel_admins').update(patch).eq('user_id', req.params.userId);
    if (error) return res.status(500).json({ error: error.message });
    await audit(req, 'update_user', { target_id: req.params.userId });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/dev/usuarios/:userId', requireDev, async (req, res) => {
  try {
    if (req.params.userId === req.user.id) return res.status(400).json({ error: 'Não pode remover a si mesmo' });
    const { data: target } = await supaAdmin.from('panel_admins').select('role').eq('user_id', req.params.userId).maybeSingle();
    if (target?.role === 'dev') return res.status(400).json({ error: 'Não pode remover outro DEV' });
    const { error } = await supaAdmin.from('panel_admins').update({ ativo: false }).eq('user_id', req.params.userId);
    if (error) return res.status(500).json({ error: error.message });
    await audit(req, 'deactivate_user', { target_id: req.params.userId });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ KEYS ═══
const TIERS = { basic: 1, premium: 1, ultra: 1, unlimited: 1 };

app.post('/api/keys/generate', requireStaff, async (req, res) => {
  try {
    const { tier, duracao_dias, quantidade = 1, max_usos = 1, motivo, validade_key_dias } = req.body || {};
    if (!TIERS[tier]) return res.status(400).json({ error: 'Tier inválido' });
    if (![7, 15, 30, 90, 180, 365, 0].includes(Number(duracao_dias))) return res.status(400).json({ error: 'Duração inválida' });
    const qty = Math.min(Math.max(parseInt(quantidade) || 1, 1), 50);
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const seg = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const geradas = [];
    for (let i = 0; i < qty; i++) {
      const keyCode = `FRIO-${seg(4)}-${seg(4)}-${seg(4)}`;
      const expiresKey = validade_key_dias > 0 ? new Date(Date.now() + validade_key_dias * 86400000).toISOString() : null;
      const { data, error } = await supaAdmin.from('premium_keys').insert({
        key_code: keyCode, tier, duracao_dias: Number(duracao_dias),
        max_usos: Number(max_usos), usos_atuais: 0,
        gerado_por: req.user.id, gerado_por_email: req.user.email,
        motivo: motivo || null, expira_em: expiresKey, ativo: true,
      }).select().single();
      if (error) return res.status(500).json({ error: error.message });
      geradas.push(data);
    }
    await audit(req, 'generate_keys', { metadata: { tier, quantidade: geradas.length } });
    res.json({ ok: true, keys: geradas });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/keys', requireStaff, async (req, res) => {
  try {
    const { status, tier, limit = 100, offset = 0 } = req.query;
    let q = supaAdmin.from('premium_keys').select('*').order('created_at', { ascending: false });
    if (status === 'active') q = q.eq('ativo', true);
    if (status === 'used') q = q.eq('ativo', false);
    if (tier) q = q.eq('tier', tier);
    const { data, error } = await q.range(Number(offset), Number(offset) + Number(limit) - 1);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, keys: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/keys/:id', requireDev, async (req, res) => {
  try {
    await supaAdmin.from('premium_keys').delete().eq('id', req.params.id);
    await audit(req, 'delete_key', { metadata: { key_id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/redemptions', requireStaff, async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const { data } = await supaAdmin.from('premium_redemptions').select('*').order('created_at', { ascending: false }).range(Number(offset), Number(offset) + Number(limit) - 1);
    res.json({ ok: true, redemptions: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ SERVIDORES (lista) ═══
app.get('/api/me/servers', requireAuth, async (req, res) => {
  try {
    if (['cliente', 'funcionario'].includes(req.admin.role)) {
      const ids = req.admin.assigned_guilds || [];
      if (!ids.length) return res.json({ ok: true, servers: [] });
      const { data } = await supaAdmin.from('bot_guilds').select('*').in('guild_id', ids);
      return res.json({ ok: true, servers: data || [] });
    }
    const { data } = await supaAdmin.from('bot_guilds').select('*').eq('in_guild', true).order('member_count', { ascending: false }).limit(500);
    res.json({ ok: true, servers: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ SERVIDOR — detalhes + stats ═══
app.get('/api/me/servers/:guildId', requireAuth, async (req, res) => {
  if (!ownsGuild(req, req.params.guildId)) return res.status(403).json({ error: 'Sem acesso' });
  const gid = req.params.guildId;
  const [g, cfg, st, ff] = await Promise.all([
    supaAdmin.from('bot_guilds').select('*').eq('guild_id', gid).maybeSingle(),
    supaAdmin.from('configs').select('*').eq('guild_id', gid).maybeSingle(),
    supaAdmin.from('settings').select('*').eq('guild_id', gid).maybeSingle(),
    supaAdmin.from('ff_config').select('*').eq('guild_id', gid).maybeSingle(),
  ]);
  res.json({ ok: true, guild: g.data, config: cfg.data, settings: st.data, ff: ff.data });
});

app.get('/api/me/servers/:guildId/stats', requireAuth, async (req, res) => {
  if (!ownsGuild(req, req.params.guildId)) return res.status(403).json({ error: 'Sem acesso' });
  const gid = req.params.guildId;
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [ticketsOpen, bets, orders, g] = await Promise.all([
    supaAdmin.from('ticket_data').select('*', { count: 'exact', head: true }).eq('guild_id', gid).is('closed_at', null),
    supaAdmin.from('ff_matches').select('*', { count: 'exact', head: true }).eq('guild_id', gid).gte('created_at', since),
    supaAdmin.from('orders').select('*', { count: 'exact', head: true }).eq('guild_id', gid).eq('status', 'delivered').gte('created_at', since),
    supaAdmin.from('bot_guilds').select('member_count').eq('guild_id', gid).maybeSingle(),
  ]);
  res.json({
    ok: true,
    stats: {
      members: g.data?.member_count || 0,
      tickets_open: ticketsOpen.count || 0,
      bets_30d: bets.count || 0,
      orders_30d: orders.count || 0,
    },
  });
});

app.get('/api/me/servers/:guildId/tickets', requireAuth, async (req, res) => {
  if (!ownsGuild(req, req.params.guildId)) return res.status(403).json({ error: 'Sem acesso' });
  const { data } = await supaAdmin.from('ticket_data').select('*').eq('guild_id', req.params.guildId).order('opened_at', { ascending: false }).limit(50);
  res.json({ ok: true, tickets: data || [] });
});

app.get('/api/me/servers/:guildId/products', requireAuth, async (req, res) => {
  if (!ownsGuild(req, req.params.guildId)) return res.status(403).json({ error: 'Sem acesso' });
  const { data } = await supaAdmin.from('products').select('*').eq('guild_id', req.params.guildId).order('id', { ascending: false }).limit(100);
  res.json({ ok: true, products: data || [] });
});

app.get('/api/me/servers/:guildId/orders', requireAuth, async (req, res) => {
  if (!ownsGuild(req, req.params.guildId)) return res.status(403).json({ error: 'Sem acesso' });
  const { data } = await supaAdmin.from('orders').select('*').eq('guild_id', req.params.guildId).order('id', { ascending: false }).limit(50);
  res.json({ ok: true, orders: data || [] });
});

// ═══ Levar membros — APENAS DEV/ADMIN ═══
app.post('/api/me/servers/:guildId/take-members', requireAdmin, async (req, res) => {
  if (!ownsGuild(req, req.params.guildId)) return res.status(403).json({ error: 'Sem acesso' });
  if (!process.env.DISCORD_TOKEN) return res.status(500).json({ error: 'DISCORD_TOKEN não configurado' });
  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
    return res.status(500).json({ error: 'DISCORD_CLIENT_ID/SECRET não configurados' });
  }

  const limit = Math.min(Number(req.body?.limit) || 20, 50);
  const gid = req.params.guildId;

  const { data: vers } = await supaAdmin
    .from('verifications')
    .select('user_id, access_token, refresh_token, expires_at')
    .limit(limit);

  if (!vers?.length) return res.json({ ok: true, added: 0, failed: 0, total: 0 });

  let added = 0, failed = 0;

  for (const v of vers) {
    let token = v.access_token;

    // Renova token se expirado
    if (v.expires_at && new Date(v.expires_at) <= new Date()) {
      try {
        const r = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: v.refresh_token,
          }),
        });
        const rd = await r.json();
        if (rd.access_token) {
          token = rd.access_token;
          await supaAdmin.from('verifications').update({
            access_token: rd.access_token,
            refresh_token: rd.refresh_token,
            expires_at: new Date(Date.now() + rd.expires_in * 1000).toISOString(),
          }).eq('user_id', v.user_id);
        } else {
          failed++;
          continue;
        }
      } catch {
        failed++;
        continue;
      }
    }

    // Adiciona ao servidor
    try {
      const r = await fetch(`https://discord.com/api/v10/guilds/${gid}/members/${v.user_id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_token: token }),
      });
      if (r.ok || r.status === 204) added++;
      else failed++;
    } catch {
      failed++;
    }

    // Rate limit: 1 por segundo
    await new Promise(r => setTimeout(r, 1100));
  }

  await audit(req, 'take_members', {
    metadata: { guild_id: gid, added, failed, total: vers.length },
  });

  res.json({ ok: true, added, failed, total: vers.length });
});
  if (!process.env.DISCORD_TOKEN) return res.status(500).json({ error: 'DISCORD_TOKEN não configurado' });
  const limit = Math.min(Number(req.body?.limit) || 20, 50);
  const gid = req.params.guildId;

  const { data: vers } = await supaAdmin.from('verifications').select('user_id, access_token, refresh_token, expires_at').limit(limit);
  if (!vers?.length) return res.json({ ok: true, added: 0, failed: 0, total: 0 });

  let added = 0, failed = 0;
  for (const v of vers) {
    let token = v.access_token;
    if (v.expires_at && new Date(v.expires_at) <= new Date()) {
      try {
        const r = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'refresh_token', refresh_token: v.refresh_token,
          }),
        });
        const rd = await r.json();
        if (rd.access_token) {
          token = rd.access_token;
          await supaAdmin.from('verifications').update({
            access_token: rd.access_token, refresh_token: rd.refresh_token,
            expires_at: new Date(Date.now() + rd.expires_in * 1000).toISOString(),
          }).eq('user_id', v.user_id);
        } else { failed++; continue; }
      } catch { failed++; continue; }
    }
    try {
      const r = await fetch(`https://discord.com/api/v10/guilds/${gid}/members/${v.user_id}`, {
        method: 'PUT',
        headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: token }),
      });
      if (r.ok || r.status === 204) added++; else failed++;
    } catch { failed++; }
    await new Promise(r => setTimeout(r, 1100));
  }
  await audit(req, 'take_members', { metadata: { guild_id: gid, added, failed, total: vers.length } });
  res.json({ ok: true, added, failed, total: vers.length });
});

// ═══ DEV TOOLS ═══

// Kill Switch
app.get('/api/dev/kill-switch', requireDev, async (req, res) => {
  const { data } = await supaAdmin.from('kill_switch').select('*').eq('id', 1).maybeSingle();
  res.json({ ok: true, active: !!data?.active, reason: data?.reason, enabled_by: data?.enabled_by, enabled_at: data?.enabled_at });
});
app.post('/api/dev/kill-switch', requireDev, async (req, res) => {
  const { active, reason } = req.body || {};
  await supaAdmin.from('kill_switch').upsert({
    id: 1, active: !!active, reason: reason || null,
    enabled_by: req.user.id, enabled_at: active ? new Date().toISOString() : null,
  });
  await audit(req, active ? 'kill_switch_on' : 'kill_switch_off', { metadata: { reason } });
  res.json({ ok: true });
});

// Manutenção Global
app.get('/api/dev/maintenance', requireDev, async (req, res) => {
  const { data } = await supaAdmin.from('maintenance_mode').select('*').eq('id', 1).maybeSingle();
  res.json({ ok: true, active: !!data?.active, reason: data?.reason, by: data?.by, started_at: data?.started_at });
});
app.post('/api/dev/maintenance', requireDev, async (req, res) => {
  const { active, reason } = req.body || {};
  await supaAdmin.from('maintenance_mode').upsert({
    id: 1, active: !!active, reason: reason || null, by: req.user.id,
    started_at: active ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  await audit(req, active ? 'maintenance_on' : 'maintenance_off', { metadata: { reason } });
  res.json({ ok: true });
});

// Force Premium
app.get('/api/dev/force-premium', requireDev, async (req, res) => {
  const { data } = await supaAdmin.from('force_premium').select('*').order('granted_at', { ascending: false }).limit(200);
  res.json({ ok: true, items: data || [] });
});
app.post('/api/dev/force-premium', requireDev, async (req, res) => {
  const { scope, target_id, days, reason } = req.body || {};
  if (!scope || !target_id) return res.status(400).json({ error: 'scope e target_id obrigatórios' });
  const permanent = !days || Number(days) === 0;
  const expires_at = permanent ? null : new Date(Date.now() + Number(days) * 86400000).toISOString();
  await supaAdmin.from('force_premium').upsert({
    scope, target_id, permanent, expires_at, reason: reason || null,
    granted_by: req.user.id, granted_at: new Date().toISOString(),
  }, { onConflict: 'scope,target_id' });
  await audit(req, 'force_premium_add', { metadata: { scope, target_id, days } });
  res.json({ ok: true });
});
app.delete('/api/dev/force-premium/:id', requireDev, async (req, res) => {
  await supaAdmin.from('force_premium').delete().eq('id', req.params.id);
  await audit(req, 'force_premium_remove', { metadata: { id: req.params.id } });
  res.json({ ok: true });
});

// Broadcast global notification
app.post('/api/dev/broadcast', requireDev, async (req, res) => {
  const { title, content, role } = req.body || {};
  if (!title || !content) return res.status(400).json({ error: 'title e content obrigatórios' });
  let q = supaAdmin.from('panel_admins').select('user_id').eq('ativo', true);
  if (role) q = q.eq('role', role);
  const { data: users } = await q;
  for (const u of users || []) await notify(u.user_id, 'system', title, content);
  await audit(req, 'broadcast_global', { metadata: { title, role, count: (users || []).length } });
  res.json({ ok: true, sent: (users || []).length });
});

// Force update broadcast
app.post('/api/dev/force-update', requireDev, async (req, res) => {
  await supaAdmin.from('bot_meta').delete().eq('key', 'last_update_broadcast');
  await supaAdmin.from('guild_update_log').delete().neq('guild_id', 'x');
  await audit(req, 'force_update_reset', {});
  res.json({ ok: true });
});

// ═══ NOTIFICAÇÕES ═══
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const { limit = 30 } = req.query;
    const { data, error } = await supaAdmin.from('site_notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(Number(limit));
    if (error) return res.status(500).json({ error: error.message });
    const { count: unread } = await supaAdmin.from('site_notifications').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id).eq('read', false);
    res.json({ ok: true, notifications: data || [], unread: unread || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch('/api/notifications/:id/read', requireAuth, async (req, res) => {
  await supaAdmin.from('site_notifications').update({ read: true }).eq('id', req.params.id).eq('user_id', req.user.id);
  res.json({ ok: true });
});
app.post('/api/notifications/read-all', requireAuth, async (req, res) => {
  await supaAdmin.from('site_notifications').update({ read: true }).eq('user_id', req.user.id).eq('read', false);
  res.json({ ok: true });
});
app.post('/api/dev/notifications', requireStaff, async (req, res) => {
  const { user_id, type = 'system', title, content, broadcast_to_role } = req.body || {};
  if (broadcast_to_role) {
    const { data: targets } = await supaAdmin.from('panel_admins').select('user_id').eq('role', broadcast_to_role).eq('ativo', true);
    for (const t of targets || []) await notify(t.user_id, type, title, content);
    await audit(req, 'broadcast_notification', { target_role: broadcast_to_role });
    return res.json({ ok: true, sent: (targets || []).length });
  }
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });
  await notify(user_id, type, title, content);
  res.json({ ok: true });
});

// ═══ AUDIT ═══
app.get('/api/dev/audit', requireDev, async (req, res) => {
  const { limit = 100, offset = 0, action } = req.query;
  let q = supaAdmin.from('site_audit_log').select('*').order('created_at', { ascending: false });
  if (action) q = q.eq('action', action);
  const { data, error } = await q.range(Number(offset), Number(offset) + Number(limit) - 1);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, logs: data || [] });
});

app.listen(PORT, () => console.log(`🌐 [PANEL v3.0] Rodando na porta ${PORT}`));
