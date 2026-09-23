// ═══════════════════════════════════════════════════════════
// 🔑 FRIO PANEL — Backend v2.1
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
  console.error('❌ [PANEL] Faltando: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY');
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
app.use(express.static(path.join(__dirname, 'public')));

// ═══ AUTH MIDDLEWARE (aceita cookie + Bearer + header) ═══
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
      if (admin.role === 'pending') return res.status(403).json({ error: 'Conta aguardando aprovação do DEV', code: 'PENDING' });
      return res.status(403).json({ error: 'Conta desativada', hint: 'inativo' });
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

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.admin) return res.status(401).json({ error: 'Não autenticado' });
    if (!allowed.includes(req.admin.role)) return res.status(403).json({ error: `Permissão negada. Requer: ${allowed.join('/')}` });
    next();
  };
}
const requireDev   = requireRole('dev');
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

// ═══ PUBLIC CONFIG ═══
app.get('/api/public-config', (req, res) => res.json({ supabase_url: SUPABASE_URL, supabase_anon: SUPABASE_ANON }));

// ═══ AUTH ═══
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'E-mail e senha obrigatórios' });

    const { data, error } = await supaPublic.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('[LOGIN-SUPABASE]', error.message);
      return res.status(401).json({ error: error.message || 'E-mail ou senha inválidos' });
    }
    if (!data.session) return res.status(401).json({ error: 'Sessão não criada' });

    const { data: admin } = await supaAdmin.from('panel_admins').select('*').eq('user_id', data.user.id).maybeSingle();
    if (!admin) { await supaPublic.auth.signOut(); return res.status(403).json({ error: 'Você não tem acesso ao painel.' }); }
    if (!admin.ativo) {
      await supaPublic.auth.signOut();
      if (admin.role === 'pending') return res.status(403).json({ error: 'Conta aguardando aprovação do DEV.', code: 'PENDING' });
      return res.status(403).json({ error: 'Conta desativada.' });
    }

    res.cookie('sb_token', data.session.access_token, {
      httpOnly: false,
      secure: true,
      sameSite: 'none',
      path: '/',
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
    if (password.length < 8) return res.status(400).json({ error: 'Senha deve ter 8+ caracteres' });
    const { data: existing } = await supaAdmin.from('panel_admins').select('user_id, ativo').eq('email', email).maybeSingle();
    if (existing) {
      if (existing.ativo) return res.status(400).json({ error: 'Este e-mail já tem uma conta ativa.' });
      return res.status(400).json({ error: 'Já existe um cadastro com este e-mail aguardando aprovação.' });
    }
    const { data: authData, error: authErr } = await supaAdmin.auth.admin.createUser({ email, password, email_confirm: true });
    if (authErr) return res.status(400).json({ error: authErr.message });
    const { error: dbErr } = await supaAdmin.from('panel_admins').insert({
      user_id: authData.user.id, email, nome: email.split('@')[0],
      role: 'pending', ativo: false, pode_gerar_keys: false, is_owner: false,
      discord_id: discord_id ? cleanId(discord_id) : null,
    });
    if (dbErr) { await supaAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {}); return res.status(500).json({ error: dbErr.message }); }
    await supaAdmin.from('site_audit_log').insert({ actor_id: authData.user.id, actor_email: email, action: 'register_pending', target_role: 'pending', ip: req.ip });
    const { data: devs } = await supaAdmin.from('panel_admins').select('user_id').eq('role', 'dev').eq('ativo', true);
    for (const d of devs || []) await notify(d.user_id, 'system', '🆕 Novo cadastro pendente', `${email} solicitou acesso ao painel.`, { user_id: authData.user.id, email });
    return res.json({ ok: true, message: 'Cadastro enviado! Aguarde aprovação do DEV.' });
  } catch (e) { console.error('[REGISTER]', e); res.status(500).json({ error: e.message }); }
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
    if (new_password.length < 8) return res.status(400).json({ error: 'Senha deve ter 8+ caracteres' });
    const { data: { user }, error: uErr } = await supaPublic.auth.getUser(token);
    if (uErr || !user) return res.status(401).json({ error: 'Token inválido ou expirado' });
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
    return res.json({ ok: true, usuarios: data || [], total: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dev/usuarios/pending', requireDev, async (req, res) => {
  try {
    const { data, error } = await supaAdmin.from('panel_admins').select('*').eq('role', 'pending').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, pendentes: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dev/usuarios', requireDev, async (req, res) => {
  try {
    const { email, discord_id, password, role, assigned_guilds, assigned_admin, notes, nome } = req.body || {};
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
      assigned_admin: assigned_admin || null, assigned_by: req.user.email,
      notes: notes || null, approved_at: new Date().toISOString(), approved_by: req.user.email,
    });
    if (dbErr) { await supaAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {}); return res.status(500).json({ error: dbErr.message }); }
    await audit(req, `add_${role}`, { target_id: authData.user.id, target_role: role, metadata: { email, discord_id, assigned_guilds } });
    await notify(authData.user.id, 'system', '👋 Bem-vindo ao Frio Panel!', `Sua conta (${role}) foi criada. Senha inicial: ${finalPassword}`, { role });
    return res.json({ ok: true, user_id: authData.user.id, temp_password: finalPassword });
  } catch (e) { console.error('[DEV-CREATE]', e); res.status(500).json({ error: e.message }); }
});

app.post('/api/dev/usuarios/:userId/approve', requireDev, async (req, res) => {
  try {
    const { role, assigned_guilds, assigned_admin, notes } = req.body || {};
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Role inválido' });
    const { error } = await supaAdmin.from('panel_admins').update({
      role, ativo: true,
      pode_gerar_keys: ['dev', 'admin', 'funcionario'].includes(role),
      assigned_guilds: Array.isArray(assigned_guilds) ? assigned_guilds : [],
      assigned_admin: assigned_admin || null, notes: notes || null,
      approved_at: new Date().toISOString(), approved_by: req.user.email,
      updated_at: new Date().toISOString(),
    }).eq('user_id', req.params.userId);
    if (error) return res.status(500).json({ error: error.message });
    await audit(req, 'approve_user', { target_id: req.params.userId, target_role: role });
    await notify(req.params.userId, 'system', '✅ Cadastro aprovado!', `Você foi aprovado como ${role}.`, { role });
    return res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/dev/usuarios/:userId', requireDev, async (req, res) => {
  try {
    const { role, ativo, nome, discord_id, assigned_guilds, assigned_admin, notes } = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    if (role && ROLES.includes(role)) { patch.role = role; patch.pode_gerar_keys = ['dev', 'admin', 'funcionario'].includes(role); }
    if (typeof ativo === 'boolean') patch.ativo = ativo;
    if (nome) patch.nome = nome;
    if (discord_id !== undefined) patch.discord_id = discord_id ? cleanId(discord_id) : null;
    if (Array.isArray(assigned_guilds)) patch.assigned_guilds = assigned_guilds;
    if (assigned_admin !== undefined) patch.assigned_admin = assigned_admin || null;
    if (notes !== undefined) patch.notes = notes || null;
    const { error } = await supaAdmin.from('panel_admins').update(patch).eq('user_id', req.params.userId);
    if (error) return res.status(500).json({ error: error.message });
    await audit(req, 'update_user', { target_id: req.params.userId, target_role: patch.role, metadata: patch });
    return res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/dev/usuarios/:userId', requireDev, async (req, res) => {
  try {
    if (req.params.userId === req.user.id) return res.status(400).json({ error: 'Não pode remover a si mesmo' });
    const { data: target } = await supaAdmin.from('panel_admins').select('role').eq('user_id', req.params.userId).maybeSingle();
    if (target?.role === 'dev') return res.status(400).json({ error: 'Não pode remover outro DEV por aqui' });
    const { error } = await supaAdmin.from('panel_admins').update({ ativo: false, updated_at: new Date().toISOString() }).eq('user_id', req.params.userId);
    if (error) return res.status(500).json({ error: error.message });
    await audit(req, 'deactivate_user', { target_id: req.params.userId, target_role: target?.role });
    return res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ KEYS ═══
const TIERS = {
  basic: { label: 'Basic', emoji: '🥉' }, premium: { label: 'Premium', emoji: '🥈' },
  ultra: { label: 'Ultra', emoji: '🥇' }, unlimited: { label: 'Unlimited', emoji: '💎' },
};

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
    await audit(req, 'generate_keys', { metadata: { tier, duracao_dias, quantidade: geradas.length } });
    return res.json({ ok: true, keys: geradas });
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
    return res.json({ ok: true, keys: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/keys/:id', requireDev, async (req, res) => {
  try {
    const { error } = await supaAdmin.from('premium_keys').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    await audit(req, 'delete_key', { metadata: { key_id: req.params.id } });
    return res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/redemptions', requireStaff, async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const { data, error } = await supaAdmin.from('premium_redemptions').select('*').order('created_at', { ascending: false }).range(Number(offset), Number(offset) + Number(limit) - 1);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, redemptions: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ SERVIDORES ═══
app.get('/api/me/servers', requireAuth, async (req, res) => {
  try {
    if (req.admin.role === 'cliente' || req.admin.role === 'funcionario') {
      const guildIds = req.admin.assigned_guilds || [];
      if (!guildIds.length) return res.json({ ok: true, servers: [] });
      const { data, error } = await supaAdmin.from('guilds').select('*').in('id', guildIds);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true, servers: data || [] });
    }
    const { data, error } = await supaAdmin.from('guilds').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, servers: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ NOTIFICAÇÕES ═══
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const { limit = 30, unread_only } = req.query;
    let q = supaAdmin.from('site_notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(Number(limit));
    if (unread_only === 'true') q = q.eq('read', false);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    const { count: unread } = await supaAdmin.from('site_notifications').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id).eq('read', false);
    return res.json({ ok: true, notifications: data || [], unread: unread || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    await supaAdmin.from('site_notifications').update({ read: true }).eq('id', req.params.id).eq('user_id', req.user.id);
    return res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications/read-all', requireAuth, async (req, res) => {
  try {
    await supaAdmin.from('site_notifications').update({ read: true }).eq('user_id', req.user.id).eq('read', false);
    return res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dev/notifications', requireStaff, async (req, res) => {
  try {
    const { user_id, type = 'system', title, content, metadata, broadcast_to_role } = req.body || {};
    if (broadcast_to_role) {
      const { data: targets } = await supaAdmin.from('panel_admins').select('user_id').eq('role', broadcast_to_role).eq('ativo', true);
      for (const t of targets || []) await notify(t.user_id, type, title, content, metadata);
      await audit(req, 'broadcast_notification', { target_role: broadcast_to_role });
      return res.json({ ok: true, sent: (targets || []).length });
    }
    if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });
    await notify(user_id, type, title, content, metadata);
    await audit(req, 'send_notification', { target_id: user_id });
    return res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ AUDITORIA ═══
app.get('/api/dev/audit', requireDev, async (req, res) => {
  try {
    const { limit = 100, offset = 0, action, actor } = req.query;
    let q = supaAdmin.from('site_audit_log').select('*').order('created_at', { ascending: false });
    if (action) q = q.eq('action', action);
    if (actor) q = q.eq('actor_id', actor);
    const { data, error } = await q.range(Number(offset), Number(offset) + Number(limit) - 1);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, logs: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`🌐 [PANEL v2.1] Rodando na porta ${PORT}`));
