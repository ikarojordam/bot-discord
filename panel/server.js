// ═══════════════════════════════════════════════════════════
// 🔑 FRIO PANEL — Backend
// v1.0.0
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
const SUPABASE_SERVICE = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON || !SUPABASE_SERVICE) {
  console.error('❌ [PANEL] Variáveis faltando: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_KEY');
} else {
  const supaPublic = createClient(SUPABASE_URL, SUPABASE_ANON);
  const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE, { auth: { persistSession: false } });

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));

  // ───────── Middleware de auth ─────────
  async function requireAuth(req, res, next) {
    try {
      const token = req.cookies?.sb_token || req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Não autenticado' });
      const { data: { user }, error } = await supaPublic.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Sessão inválida' });
      const { data: admin } = await supaAdmin.from('panel_admins').select('*').eq('user_id', user.id).eq('ativo', true).maybeSingle();
      if (!admin) return res.status(403).json({ error: 'Sem acesso ao painel' });
      req.user = user;
      req.admin = admin;
      next();
    } catch (e) {
      console.error('[AUTH]', e.message);
      res.status(500).json({ error: 'Erro interno' });
    }
  }

  // ───────── Config pública (Supabase) ─────────
  app.get('/api/public-config', (req, res) => {
    res.json({ supabase_url: SUPABASE_URL, supabase_anon: SUPABASE_ANON });
  });

  // ───────── LOGIN ─────────
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'E-mail e senha obrigatórios' });
      const { data, error } = await supaPublic.auth.signInWithPassword({ email, password });
      if (error) return res.status(401).json({ error: 'E-mail ou senha inválidos' });
      if (!data.session) return res.status(401).json({ error: 'Sessão não criada' });
      const { data: admin } = await supaAdmin.from('panel_admins').select('*').eq('user_id', data.user.id).eq('ativo', true).maybeSingle();
      if (!admin) {
        await supaPublic.auth.signOut();
        return res.status(403).json({ error: 'Você não tem acesso ao painel. Contate o administrador.' });
      }
      res.cookie('sb_token', data.session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' || !!process.env.RENDER,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      await supaAdmin.from('panel_audit').insert({ user_id: data.user.id, user_email: data.user.email, acao: 'login', ip: req.ip });
      return res.json({
        ok: true,
        user: { id: data.user.id, email: data.user.email },
        admin: { nome: admin.nome, is_owner: admin.is_owner, pode_gerar_keys: admin.pode_gerar_keys },
      });
    } catch (e) {
      console.error('[LOGIN]', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ───────── LOGOUT ─────────
  app.post('/api/auth/logout', requireAuth, async (req, res) => {
    try {
      await supaAdmin.from('panel_audit').insert({ user_id: req.user.id, user_email: req.user.email, acao: 'logout', ip: req.ip });
      res.clearCookie('sb_token');
      return res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ───────── SESSÃO ATUAL ─────────
  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({
      user: { id: req.user.id, email: req.user.email },
      admin: { nome: req.admin.nome, is_owner: req.admin.is_owner, pode_gerar_keys: req.admin.pode_gerar_keys },
    });
  });

  // ───────── RECUPERAR SENHA ─────────
  app.post('/api/auth/forgot', async (req, res) => {
    try {
      const { email } = req.body || {};
      if (!email) return res.status(400).json({ error: 'E-mail obrigatório' });
      const baseUrl = process.env.PANEL_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` || 'http://localhost:10000';
      const redirectTo = `${baseUrl}/reset.html`;
      await supaPublic.auth.resetPasswordForEmail(email, { redirectTo });
      return res.json({ ok: true, message: 'Se o e-mail existir, enviaremos instruções.' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ───────── NOVA SENHA ─────────
  app.post('/api/auth/update-password', async (req, res) => {
    try {
      const { token, new_password } = req.body || {};
      if (!token || !new_password) return res.status(400).json({ error: 'Dados incompletos' });
      if (new_password.length < 8) return res.status(400).json({ error: 'Senha deve ter 8+ caracteres' });
      const { data: { user }, error: uErr } = await supaPublic.auth.getUser(token);
      if (uErr || !user) return res.status(401).json({ error: 'Token inválido ou expirado' });
      const { error: updErr } = await supaAdmin.auth.admin.updateUserById(user.id, { password: new_password });
      if (updErr) return res.status(400).json({ error: updErr.message });
      await supaAdmin.from('panel_audit').insert({ user_id: user.id, user_email: user.email, acao: 'password_reset', ip: req.ip });
      return res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ───────── TIERS ─────────
  const TIERS = {
    basic:     { label: 'Basic',     emoji: '🥉' },
    premium:   { label: 'Premium',   emoji: '🥈' },
    ultra:     { label: 'Ultra',     emoji: '🥇' },
    unlimited: { label: 'Unlimited', emoji: '💎' },
  };

  // ───────── GERAR KEYS ─────────
  app.post('/api/keys/generate', requireAuth, async (req, res) => {
    try {
      if (!req.admin.pode_gerar_keys && !req.admin.is_owner) return res.status(403).json({ error: 'Sem permissão para gerar keys' });
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
      await supaAdmin.from('panel_audit').insert({
        user_id: req.user.id, user_email: req.user.email, acao: 'generate_keys',
        detalhes: { tier, duracao_dias, quantidade: geradas.length, keys: geradas.map(k => k.key_code) }, ip: req.ip,
      });
      return res.json({ ok: true, keys: geradas });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ───────── LISTAR KEYS ─────────
  app.get('/api/keys', requireAuth, async (req, res) => {
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

  // ───────── DELETAR KEY ─────────
  app.delete('/api/keys/:id', requireAuth, async (req, res) => {
    try {
      if (!req.admin.is_owner) return res.status(403).json({ error: 'Só owner' });
      const { error } = await supaAdmin.from('premium_keys').delete().eq('id', req.params.id);
      if (error) return res.status(500).json({ error: error.message });
      await supaAdmin.from('panel_audit').insert({ user_id: req.user.id, user_email: req.user.email, acao: 'delete_key', detalhes: { key_id: req.params.id }, ip: req.ip });
      return res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ───────── RESGATES ─────────
  app.get('/api/redemptions', requireAuth, async (req, res) => {
    try {
      const { limit = 100, offset = 0 } = req.query;
      const { data, error } = await supaAdmin.from('premium_redemptions').select('*').order('created_at', { ascending: false }).range(Number(offset), Number(offset) + Number(limit) - 1);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true, redemptions: data || [] });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ───────── ADMINS (owner) ─────────
  app.get('/api/admins', requireAuth, async (req, res) => {
    try {
      if (!req.admin.is_owner) return res.status(403).json({ error: 'Só owner' });
      const { data, error } = await supaAdmin.from('panel_admins').select('*').order('created_at');
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true, admins: data || [] });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/admins', requireAuth, async (req, res) => {
    try {
      if (!req.admin.is_owner) return res.status(403).json({ error: 'Só owner' });
      const { email, nome, pode_gerar_keys = false } = req.body || {};
      if (!email) return res.status(400).json({ error: 'E-mail obrigatório' });
      const { data: usersData, error: listErr } = await supaAdmin.auth.admin.listUsers();
      if (listErr) return res.status(500).json({ error: listErr.message });
      const user = usersData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (!user) return res.status(404).json({ error: 'Usuário não existe. Peça pra ele se cadastrar primeiro.' });
      const { data, error } = await supaAdmin.from('panel_admins').upsert({
        user_id: user.id, email: user.email, nome: nome || user.email.split('@')[0],
        pode_gerar_keys: !!pode_gerar_keys, is_owner: false, ativo: true, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' }).select().single();
      if (error) return res.status(500).json({ error: error.message });
      await supaAdmin.from('panel_audit').insert({ user_id: req.user.id, user_email: req.user.email, acao: 'add_admin', detalhes: { email, pode_gerar_keys }, ip: req.ip });
      return res.json({ ok: true, admin: data });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/admins/:userId', requireAuth, async (req, res) => {
    try {
      if (!req.admin.is_owner) return res.status(403).json({ error: 'Só owner' });
      const { pode_gerar_keys, ativo, nome } = req.body || {};
      const patch = { updated_at: new Date().toISOString() };
      if (typeof pode_gerar_keys === 'boolean') patch.pode_gerar_keys = pode_gerar_keys;
      if (typeof ativo === 'boolean') patch.ativo = ativo;
      if (nome) patch.nome = nome;
      const { error } = await supaAdmin.from('panel_admins').update(patch).eq('user_id', req.params.userId);
      if (error) return res.status(500).json({ error: error.message });
      await supaAdmin.from('panel_audit').insert({ user_id: req.user.id, user_email: req.user.email, acao: 'update_admin', detalhes: { target: req.params.userId, patch }, ip: req.ip });
      return res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/admins/:userId', requireAuth, async (req, res) => {
    try {
      if (!req.admin.is_owner) return res.status(403).json({ error: 'Só owner' });
      if (req.params.userId === req.user.id) return res.status(400).json({ error: 'Não pode remover a si mesmo' });
      const { error } = await supaAdmin.from('panel_admins').update({ ativo: false }).eq('user_id', req.params.userId);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ───────── START ─────────
  app.listen(PORT, () => {
    console.log(`🌐 [PANEL] Rodando na porta ${PORT}`);
  });
                                                                                  }
