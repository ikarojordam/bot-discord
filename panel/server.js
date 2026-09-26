// ═══════════════════════════════════════════════════════════
// 🔑 FRIO PANEL — Backend v5.1.0
// Full audit (sem senha) · Sessions · Notify · Dev Tools
// ═══════════════════════════════════════════════════════════
try { require('dotenv').config(); } catch {}

const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PANEL_PORT || process.env.PORT || 10000;
const NODE_ENV = process.env.NODE_ENV || 'production';
const IS_PROD = NODE_ENV === 'production';

// ═══ ENV ═══
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const BOT_API_URL = process.env.BOT_API_URL || 'https://frio-bot.onrender.com';
const PANEL_API_TOKEN = process.env.PANEL_API_TOKEN;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

// ═══ VALIDAÇÕES DE BOOT ═══
function fatal(msg) { console.error(`❌ [BOOT] ${msg}`); process.exit(1); }
if (!SUPABASE_URL) fatal('SUPABASE_URL ausente');
if (!SUPABASE_ANON) fatal('SUPABASE_ANON_KEY ausente');
if (!SUPABASE_SERVICE) fatal('SUPABASE_SERVICE_ROLE_KEY ausente');
if (!PANEL_API_TOKEN || PANEL_API_TOKEN.length < 24) console.warn('⚠️ [SECURITY] PANEL_API_TOKEN curto ou ausente — auditoria no bot desabilitada');
if (!DISCORD_TOKEN) console.warn('⚠️ DISCORD_TOKEN ausente — ações Discord desabilitadas');

// ═══ SUPABASE CLIENTS ═══
const supaPublic = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'X-Client-Info': 'frio-panel/5.1.0' } },
});
const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'X-Client-Info': 'frio-panel/5.1.0-admin' } },
});

// ═══ CONSTANTES ═══
const ROLES = ['dev', 'admin', 'funcionario', 'cliente', 'pending'];
const PLANS = ['none', 'basic', 'premium', 'ultra', 'unlimited'];
const TIERS = ['basic', 'premium', 'ultra', 'unlimited'];
const COOKIE_NAME = 'sb_token';
const CSRF_COOKIE = 'frio_csrf';
const CSRF_HEADER = 'x-csrf-token';

// ═══ HELPERS GERAIS ═══
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function cleanId(s) { return String(s || '').replace(/[<@!>]/g, '').trim(); }
function safeStr(v, max = 500) {
  if (v === null || v === undefined) return null;
  return String(v).trim().slice(0, max) || null;
}
function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '')) && String(e).length <= 254;
}
function isValidDiscordId(id) { return /^\d{15,25}$/.test(String(id || '')); }
function genPassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
function baseUrl() {
  return process.env.PANEL_URL
    || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : `http://localhost:${PORT}`);
}
function genKeyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `FRIO-${seg(4)}-${seg(4)}-${seg(4)}`;
}
function clientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}
function genericError(res, status = 500, msg = 'Erro interno.') {
  return res.status(status).json({ ok: false, error: msg });
}

// ═══ SECURITY HEADERS ═══
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' " + (BOT_API_URL || ''),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '));
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false, lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  },
}));

// ═══════════════════════════════════════════════════════════
// RATE LIMIT (in-memory, por IP + rota)
// ═══════════════════════════════════════════════════════════
const _rlBuckets = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = `${clientIp(req)}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const bucket = (_rlBuckets.get(key) || []).filter(t => now - t < windowMs);
    if (bucket.length >= max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ ok: false, error: 'Muitas requisições. Aguarde.' });
    }
    bucket.push(now);
    _rlBuckets.set(key, bucket);
    if (_rlBuckets.size > 5000) {
      for (const [k, v] of _rlBuckets) {
        if (!v.length || now - v[v.length - 1] > windowMs * 2) _rlBuckets.delete(k);
      }
    }
    next();
  };
}

// ═══════════════════════════════════════════════════════════
// CSRF — double-submit cookie
// ═══════════════════════════════════════════════════════════
function setCsrfCookie(res) {
  const token = crypto.randomBytes(24).toString('hex');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, secure: IS_PROD, sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, path: '/',
  });
  return token;
}
function csrfProtect(req, res, next) {
  const m = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(m)) return next();
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.headers[CSRF_HEADER];
  if (!cookie || !header || cookie !== header) {
    return res.status(403).json({ ok: false, error: 'CSRF inválido.' });
  }
  next();
}

// ═══════════════════════════════════════════════════════════
// CONTEXT EXTRACTOR (para auditoria)
// ═══════════════════════════════════════════════════════════
function extractCtx(req) {
  const ua = String(req.headers['user-agent'] || '');
  return {
    ip: clientIp(req),
    user_agent: ua.slice(0, 500),
    referer: safeStr(req.headers.referer, 500),
    origin: safeStr(req.headers.origin, 200),
    accept_language: safeStr(req.headers['accept-language'], 100),
    country: safeStr(req.headers['cf-ipcountry'], 10),
    city: safeStr(req.headers['cf-ipcity'], 100),
    device_type: /mobile|android|iphone|ipad/i.test(ua) ? 'mobile' : 'desktop',
    browser: /edg/i.test(ua) ? 'Edge'
           : /chrome/i.test(ua) ? 'Chrome'
           : /firefox/i.test(ua) ? 'Firefox'
           : /safari/i.test(ua) ? 'Safari'
           : 'Outro',
    os: /windows/i.test(ua) ? 'Windows'
      : /mac/i.test(ua) ? 'macOS'
      : /linux/i.test(ua) ? 'Linux'
      : /android/i.test(ua) ? 'Android'
      : /iphone|ipad/i.test(ua) ? 'iOS'
      : 'Outro',
  };
}

// ═══════════════════════════════════════════════════════════
// AUDITORIA COMPLETA (sem senha, sempre)
// ═══════════════════════════════════════════════════════════
const _AUDIT_WHITELIST = new Set([
  'email','username','role','plan','tier','guild_id','guild_name',
  'target_user_id','product_id','product_name','amount','status',
  'panel_id','ticket_id','reason','metadata','action','success',
  'duration_ms','method','path','error','code','device','browser',
  'os','country','city','ip','user_agent','key_id','key_code','tier_target',
]);

function sanitizeAuditPayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const safe = {};
  for (const k of Object.keys(payload)) {
    if (!_AUDIT_WHITELIST.has(k)) continue;
    const lk = k.toLowerCase();
    if (['password','senha','pwd','token','secret','cookie','authorization'].some(f => lk.includes(f))) continue;
    const v = payload[k];
    if (v === null || v === undefined) continue;
    safe[k] = typeof v === 'object' ? v : String(v).slice(0, 500);
  }
  return safe;
}

async function audit(req, action, opts = {}) {
  try {
    const ctx = extractCtx(req);
    const actorId = req.user?.id || req.admin?.user_id || 'system';
    const actorEmail = req.user?.email || req.admin?.email || null;
    const sessionId = req.sessionId || null;

    const row = {
      actor_id: actorId,
      actor_email: actorEmail,
      action: String(action).slice(0, 80),
      target_id: opts.target_id || null,
      target_role: opts.target_role || null,
      metadata: sanitizeAuditPayload(opts.metadata || {}),
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      device_type: ctx.device_type,
      browser: ctx.browser,
      os: ctx.os,
      country: ctx.country,
      city: ctx.city,
      referer: ctx.referer,
      accept_language: ctx.accept_language,
      session_id: sessionId,
      success: opts.success !== false,
      error_reason: opts.error_reason ? String(opts.error_reason).slice(0, 200) : null,
      duration_ms: Number.isFinite(opts.duration_ms) ? opts.duration_ms : null,
    };

    await supaAdmin.from('site_audit_log').insert(row);

    // Notifica devs em tempo real (best-effort)
    if (isSensitiveAction(action)) {
      setImmediate(() => notifyDevsRealtime(action, row).catch(() => {}));
    }
  } catch (e) { console.error('[AUDIT]', e.message); }
}

function isSensitiveAction(action) {
  return [
    'login_failed', 'access_denied', 'nuke_guild', 'force_leave_guild',
    'kill_switch_on', 'maintenance_on', 'force_premium_add',
    'generate_keys', 'generate_pack', 'broadcast_global',
    'password_reset', 'update_user', 'deactivate_user',
  ].includes(action);
}

async function notifyDevsRealtime(action, data) {
  if (!PANEL_API_TOKEN || !BOT_API_URL) return;
  try {
    await fetch(`${BOT_API_URL}/api/bot/audit/log`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PANEL_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: action,
        user_id: data.actor_id,
        payload: sanitizeAuditPayload({
          email: data.actor_email,
          role: data.target_role,
          reason: data.error_reason,
        }),
        context: {
          ip: data.ip, user_agent: data.user_agent,
          browser: data.browser, os: data.os,
          country: data.country, city: data.city,
          device_type: data.device_type,
        },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// NOTIFICAÇÕES
// ═══════════════════════════════════════════════════════════
async function notify(userId, type, title, content, metadata = null) {
  try {
    await supaAdmin.from('site_notifications').insert({
      user_id: userId, type, title, content, metadata,
    });
  } catch (e) { console.error('[NOTIFY]', e.message); }
}

// ═══════════════════════════════════════════════════════════
// SESSIONS — tracking
// ═══════════════════════════════════════════════════════════
async function createSession(userId, token, req) {
  try {
    const ctx = extractCtx(req);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { data } = await supaAdmin.from('active_sessions').insert({
      user_id: userId,
      token_hash: tokenHash,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      device_type: ctx.device_type,
      browser: ctx.browser,
      os: ctx.os,
      country: ctx.country,
      city: ctx.city,
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    }).select('id').single();
    return data?.id || null;
  } catch (e) { console.error('[createSession]', e.message); return null; }
}

async function touchSession(tokenHash) {
  try {
    await supaAdmin.from('active_sessions')
      .update({ last_seen: new Date().toISOString() })
      .eq('token_hash', tokenHash);
  } catch {}
}

async function deleteSessionByToken(token) {
  try {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await supaAdmin.from('active_sessions').delete().eq('token_hash', hash);
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// AUTH MIDDLEWARES
// ═══════════════════════════════════════════════════════════
async function requireAuth(req, res, next) {
  try {
    let token = req.cookies?.[COOKIE_NAME];
    if (!token) {
      const auth = req.headers.authorization || '';
      if (auth.startsWith('Bearer ')) token = auth.slice(7).trim();
    }
    if (!token) token = req.headers['x-panel-token'] || null;
    if (!token) return res.status(401).json({ ok: false, error: 'Não autenticado' });

    const { data: { user }, error } = await supaPublic.auth.getUser(token);
    if (error || !user) return res.status(401).json({ ok: false, error: 'Sessão inválida' });

    const { data: admin } = await supaAdmin.from('panel_admins').select('*').eq('user_id', user.id).maybeSingle();
    if (!admin) return res.status(403).json({ ok: false, error: 'Sem acesso' });
    if (!admin.ativo) {
      if (admin.role === 'pending') return res.status(403).json({ ok: false, error: 'Aguarde aprovação', code: 'PENDING' });
      return res.status(403).json({ ok: false, error: 'Conta desativada' });
    }

    // Detecta ban
    if (admin.banned) return res.status(403).json({ ok: false, error: 'Conta banida' });

    req.user = user;
    req.admin = admin;
    req.role = admin.role;
    req.token = token;

    // Touch session (best-effort)
    setImmediate(() => touchSession(crypto.createHash('sha256').update(token).digest('hex')));

    next();
  } catch (e) {
    console.error('[requireAuth]', e.message);
    return genericError(res);
  }
}

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.admin) return res.status(401).json({ ok: false, error: 'Não autenticado' });
    if (!allowed.includes(req.admin.role)) {
      return res.status(403).json({ ok: false, error: 'Permissão negada' });
    }
    next();
  };
}
const requireDev = requireRole('dev');
const requireAdmin = requireRole('dev', 'admin');
const requireStaff = requireRole('dev', 'admin', 'funcionario');

// ═══════════════════════════════════════════════════════════
// AUTO-AUDIT — todas as rotas /api/*
// ═══════════════════════════════════════════════════════════
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  const started = Date.now();
  const origJson = res.json.bind(res);
  res.json = function (data) {
    const duration = Date.now() - started;
    const skipAudit = req.method === 'GET' || req.path === '/api/auth/me' || req.path === '/api/public-config';
    if (!skipAudit) {
      setImmediate(() => {
        audit(req, `${req.method}_${req.path}`, {
          success: res.statusCode < 400 && data?.ok !== false,
          error_reason: data?.error || null,
          duration_ms: duration,
          metadata: { path: req.path },
        });
      });
    }
    return origJson(data);
  };
  next();
});

// ═══════════════════════════════════════════════════════════
// PUBLIC
// ═══════════════════════════════════════════════════════════
app.get('/api/public-config', (req, res) => {
  res.json({
    ok: true,
    supabase_url: SUPABASE_URL,
    supabase_anon: SUPABASE_ANON,
    panel_url: baseUrl(),
    discord_client_id: DISCORD_CLIENT_ID || null,
  });
});

app.get('/health', (req, res) => {
  res.json({
    ok: true, service: 'frio-panel', version: '5.1.0',
    uptime: Math.floor(process.uptime()),
    env: NODE_ENV,
  });
});

// ═══════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════

// POST /api/auth/login
app.post('/api/auth/login', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  const started = Date.now();
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ ok: false, error: 'E-mail e senha obrigatórios' });
    if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: 'E-mail inválido' });

    const { data, error } = await supaPublic.auth.signInWithPassword({ email: String(email).toLowerCase().trim(), password });
    if (error) {
      const msg = String(error.message || '').toLowerCase();
      let reason = 'invalid_credentials';
      if (msg.includes('not confirmed')) reason = 'email_not_confirmed';
      if (msg.includes('banned')) reason = 'banned';
      await audit(req, 'login_failed', {
        success: false,
        error_reason: reason,
        metadata: { email: String(email).toLowerCase().trim(), duration_ms: Date.now() - started },
      });
      if (reason === 'email_not_confirmed') return res.status(403).json({ ok: false, error: 'Confirme seu email antes de logar.', code: 'EMAIL_NOT_CONFIRMED' });
      return res.status(401).json({ ok: false, error: 'E-mail ou senha inválidos' });
    }
    if (!data.session) {
      await audit(req, 'login_failed', { success: false, error_reason: 'no_session', metadata: { email } });
      return res.status(401).json({ ok: false, error: 'Sessão não criada' });
    }

    const { data: admin } = await supaAdmin.from('panel_admins').select('*').eq('user_id', data.user.id).maybeSingle();
    if (!admin) {
      await supaPublic.auth.signOut();
      await audit(req, 'login_failed', { success: false, error_reason: 'no_panel_admin', metadata: { email } });
      return res.status(403).json({ ok: false, error: 'Sem acesso' });
    }
    if (admin.banned) {
      await supaPublic.auth.signOut();
      await audit(req, 'login_failed', { success: false, error_reason: 'banned', metadata: { email } });
      return res.status(403).json({ ok: false, error: 'Conta banida' });
    }
    if (!admin.ativo) {
      await supaPublic.auth.signOut();
      if (admin.role === 'pending') {
        await audit(req, 'login_failed', { success: false, error_reason: 'pending_approval', metadata: { email } });
        return res.status(403).json({ ok: false, error: 'Aguarde aprovação', code: 'PENDING' });
      }
      await audit(req, 'login_failed', { success: false, error_reason: 'inactive', metadata: { email } });
      return res.status(403).json({ ok: false, error: 'Conta desativada' });
    }

    // Sessão OK
    res.cookie(COOKIE_NAME, data.session.access_token, {
      httpOnly: true, secure: IS_PROD, sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, path: '/',
    });
    const csrf = setCsrfCookie(res);

    const sessionId = await createSession(data.user.id, data.session.access_token, req);

    req.user = data.user;
    req.admin = admin;
    req.sessionId = sessionId;

    await audit(req, 'login', {
      metadata: { role: admin.role, plan: admin.plan || 'basic' },
    });

    return res.json({
      ok: true,
      csrf,
      session_id: sessionId,
      token: data.session.access_token,
      user: { id: data.user.id, email: data.user.email },
      admin: {
        nome: admin.nome, role: admin.role, plan: admin.plan || 'basic',
        is_owner: admin.role === 'dev',
        pode_gerar_keys: ['dev', 'admin', 'funcionario'].includes(admin.role),
        assigned_guilds: admin.assigned_guilds || [],
        discord_id: admin.discord_id || null,
      },
    });
  } catch (e) {
    console.error('[LOGIN]', e);
    return genericError(res);
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', requireAuth, csrfProtect, async (req, res) => {
  try {
    await deleteSessionByToken(req.token);
    await audit(req, 'logout');
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
    return res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

// GET /api/auth/me
app.get('/api/auth/me', requireAuth, (req, res) => {
  const a = req.admin;
  res.json({
    ok: true,
    user: { id: req.user.id, email: req.user.email },
    admin: {
      nome: a.nome, role: a.role, plan: a.plan || 'basic',
      is_owner: a.role === 'dev',
      pode_gerar_keys: ['dev', 'admin', 'funcionario'].includes(a.role),
      assigned_guilds: a.assigned_guilds || [],
      discord_id: a.discord_id || null,
    },
  });
});

// POST /api/auth/register
app.post('/api/auth/register', rateLimit(5, 60 * 60 * 1000), async (req, res) => {
  try {
    const { email, password, discord_id, username } = req.body || {};
    if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: 'E-mail inválido' });
    if (!password || password.length < 8) return res.status(400).json({ ok: false, error: 'Senha deve ter 8+ caracteres' });
    if (discord_id && !isValidDiscordId(discord_id)) return res.status(400).json({ ok: false, error: 'ID Discord inválido' });

    const emailNorm = String(email).toLowerCase().trim();
    const { data: existing } = await supaAdmin.from('panel_admins').select('user_id, ativo').eq('email', emailNorm).maybeSingle();
    if (existing) {
      if (existing.ativo) return res.status(400).json({ ok: false, error: 'E-mail já cadastrado' });
      return res.status(400).json({ ok: false, error: 'Já existe um cadastro com este e-mail.', code: 'PENDING_EXISTS' });
    }

    const url = baseUrl();
    const { data: signupData, error: signupErr } = await supaPublic.auth.signUp({
      email: emailNorm,
      password,
      options: {
        emailRedirectTo: `${url}/confirm.html`,
        data: { discord_id: discord_id ? cleanId(discord_id) : null },
      },
    });
    if (signupErr) return res.status(400).json({ ok: false, error: signupErr.message });
    if (!signupData?.user) return res.status(500).json({ ok: false, error: 'Falha ao criar conta' });

    const { error: dbErr } = await supaAdmin.from('panel_admins').insert({
      user_id: signupData.user.id,
      email: emailNorm,
      nome: username || emailNorm.split('@')[0],
      role: 'pending', plan: 'basic', ativo: false, is_owner: false,
      discord_id: discord_id ? cleanId(discord_id) : null,
    });
    if (dbErr) {
      await supaAdmin.auth.admin.deleteUser(signupData.user.id).catch(() => {});
      return res.status(500).json({ ok: false, error: dbErr.message });
    }

    req.user = { id: signupData.user.id, email: emailNorm };
    await audit(req, 'register_pending', {
      target_id: signupData.user.id, target_role: 'pending',
      metadata: { email: emailNorm },
    });

    // Notifica devs
    const { data: devs } = await supaAdmin.from('panel_admins').select('user_id').eq('role', 'dev').eq('ativo', true);
    for (const d of devs || []) {
      await notify(d.user_id, 'system', '🆕 Novo cadastro pendente', `${emailNorm} solicitou acesso.`, { user_id: signupData.user.id });
    }

    return res.json({ ok: true, message: 'Cadastro criado! Verifique seu email.' });
  } catch (e) {
    console.error('[REGISTER]', e);
    return genericError(res);
  }
});

// POST /api/auth/resend-confirmation
app.post('/api/auth/resend-confirmation', rateLimit(5, 60 * 60 * 1000), async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: 'E-mail inválido' });
    const url = baseUrl();
    const { error } = await supaPublic.auth.resend({
      type: 'signup',
      email: String(email).toLowerCase().trim(),
      options: { emailRedirectTo: `${url}/confirm.html` },
    });
    if (error) return res.status(400).json({ ok: false, error: error.message });
    return res.json({ ok: true, message: 'Email reenviado!' });
  } catch (e) { return genericError(res); }
});

// POST /api/auth/forgot
app.post('/api/auth/forgot', rateLimit(5, 60 * 60 * 1000), async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: 'E-mail inválido' });
    const url = baseUrl();
    // Anti-enumeração: sempre responde ok
    await supaPublic.auth.resetPasswordForEmail(String(email).toLowerCase().trim(), {
      redirectTo: `${url}/reset.html`,
    }).catch(() => {});
    await audit(req, 'forgot_password_requested', { metadata: { email: String(email).toLowerCase().trim() } });
    return res.json({ ok: true, message: 'Se o e-mail existir, enviaremos instruções.' });
  } catch (e) { return genericError(res); }
});

// POST /api/auth/update-password
app.post('/api/auth/update-password', rateLimit(10, 60 * 60 * 1000), async (req, res) => {
  try {
    const { token, new_password } = req.body || {};
    if (!token || !new_password) return res.status(400).json({ ok: false, error: 'Dados incompletos' });
    if (new_password.length < 8) return res.status(400).json({ ok: false, error: 'Senha muito curta' });

    const { data: { user }, error: uErr } = await supaPublic.auth.getUser(token);
    if (uErr || !user) return res.status(401).json({ ok: false, error: 'Token inválido' });

    const { error: updErr } = await supaAdmin.auth.admin.updateUserById(user.id, { password: new_password });
    if (updErr) return res.status(400).json({ ok: false, error: updErr.message });

    // Revoga todas as sessões ativas
    await supaAdmin.from('active_sessions').delete().eq('user_id', user.id);

    req.user = user;
    await audit(req, 'password_reset', { target_id: user.id });
    return res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
  try {
    const role = req.admin.role;
    const uid = req.user.id;

    if (role === 'cliente' || role === 'funcionario') {
      const [servers, keys, notifs] = await Promise.all([
        supaAdmin.from('user_guilds').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        supaAdmin.from('premium_keys').select('*', { count: 'exact', head: true }).eq('sent_to', uid),
        supaAdmin.from('site_notifications').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('read', false),
      ]);
      return res.json({ ok: true, stats: {
        servers: servers.count || 0,
        keys: keys.count || 0,
        notifs: notifs.count || 0,
      }});
    }

    const [guilds, users, keys, redemptions, notifs, activeKeys, pendingUsers] = await Promise.all([
      supaAdmin.from('bot_guilds').select('*', { count: 'exact', head: true }).eq('in_guild', true),
      supaAdmin.from('panel_admins').select('*', { count: 'exact', head: true }).eq('ativo', true),
      supaAdmin.from('premium_keys').select('*', { count: 'exact', head: true }).eq('is_pack', false),
      supaAdmin.from('premium_redemptions').select('*', { count: 'exact', head: true }),
      supaAdmin.from('site_notifications').select('*', { count: 'exact', head: true }),
      supaAdmin.from('premium_keys').select('*', { count: 'exact', head: true }).eq('is_pack', false).eq('ativo', true),
      supaAdmin.from('panel_admins').select('*', { count: 'exact', head: true }).eq('role', 'pending'),
    ]);

    const { data: gd } = await supaAdmin.from('bot_guilds').select('member_count').eq('in_guild', true);
    const totalMembers = (gd || []).reduce((a, x) => a + (x.member_count || 0), 0);

    res.json({ ok: true, stats: {
      guilds: guilds.count || 0,
      users: users.count || 0,
      keys: keys.count || 0,
      active_keys: activeKeys.count || 0,
      redemptions: redemptions.count || 0,
      notifications: notifs.count || 0,
      pending: pendingUsers.count || 0,
      total_members: totalMembers,
    }});
  } catch (e) { return genericError(res); }
});

app.get('/api/dashboard/charts', requireStaff, async (req, res) => {
  try {
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString();

    const { data: keys } = await supaAdmin.from('premium_keys').select('tier, created_at, ativo').eq('is_pack', false).gte('created_at', since30);
    const byTier = { basic: 0, premium: 0, ultra: 0, unlimited: 0 };
    const byDay = {};
    for (const k of keys || []) {
      if (byTier[k.tier] !== undefined) byTier[k.tier]++;
      const d = k.created_at.substring(0, 10);
      byDay[d] = (byDay[d] || 0) + 1;
    }
    const keysByDay = Object.entries(byDay).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));

    const { data: reds } = await supaAdmin.from('premium_redemptions').select('created_at').gte('created_at', since30);
    const redDay = {};
    for (const r of reds || []) {
      const d = r.created_at.substring(0, 10);
      redDay[d] = (redDay[d] || 0) + 1;
    }
    const redsByDay = Object.entries(redDay).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));

    const { data: users } = await supaAdmin.from('panel_admins').select('role');
    const byRole = { dev: 0, admin: 0, funcionario: 0, cliente: 0, pending: 0 };
    for (const u of users || []) if (byRole[u.role] !== undefined) byRole[u.role]++;

    const { data: usersPlan } = await supaAdmin.from('panel_admins').select('plan').eq('ativo', true);
    const byPlan = { basic: 0, premium: 0, ultra: 0, unlimited: 0, none: 0 };
    for (const u of usersPlan || []) if (byPlan[u.plan || 'basic'] !== undefined) byPlan[u.plan || 'basic']++;

    const { data: top } = await supaAdmin.from('bot_guilds').select('guild_id,name,member_count,icon').eq('in_guild', true).order('member_count', { ascending: false }).limit(10);

    res.json({ ok: true, charts: {
      keys_by_tier: byTier,
      keys_by_day: keysByDay,
      redemptions_by_day: redsByDay,
      users_by_role: byRole,
      users_by_plan: byPlan,
      top_servers: (top || []).map(x => ({ name: x.name, member_count: x.member_count || 0, icon: x.icon })),
    }});
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// SERVIDORES (cliente)
// ═══════════════════════════════════════════════════════════
app.get('/api/me/servers', requireAuth, async (req, res) => {
  try {
    if (['dev', 'admin'].includes(req.admin.role)) {
      const { data } = await supaAdmin.from('bot_guilds').select('*').eq('in_guild', true).order('member_count', { ascending: false }).limit(500);
      return res.json({ ok: true, servers: data || [] });
    }
    const { data: ug } = await supaAdmin.from('user_guilds').select('guild_id').eq('user_id', req.user.id);
    const guildIds = (ug || []).map(x => x.guild_id);
    const assigned = req.admin.assigned_guilds || [];
    const allIds = [...new Set([...guildIds, ...assigned])];
    if (!allIds.length) return res.json({ ok: true, servers: [] });
    const { data } = await supaAdmin.from('bot_guilds').select('*').in('guild_id', allIds).eq('in_guild', true).order('member_count', { ascending: false });
    res.json({ ok: true, servers: data || [] });
  } catch (e) { return genericError(res); }
});

async function canAccessGuild(req, guildId) {
  if (['dev', 'admin'].includes(req.admin.role)) return true;
  const { data: ug } = await supaAdmin.from('user_guilds').select('*').eq('user_id', req.user.id).eq('guild_id', guildId).maybeSingle();
  if (ug) return true;
  if ((req.admin.assigned_guilds || []).includes(guildId)) return true;
  return false;
}

app.get('/api/me/servers/:guildId/stats', requireAuth, async (req, res) => {
  try {
    if (!(await canAccessGuild(req, req.params.guildId))) {
      await audit(req, 'access_denied', { success: false, error_reason: 'no_guild_access', metadata: { guild_id: req.params.guildId } });
      return res.status(403).json({ ok: false, error: 'Sem acesso' });
    }
    const gid = req.params.guildId;
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [ticketsOpen, bets, orders, g] = await Promise.all([
      supaAdmin.from('ticket_data').select('*', { count: 'exact', head: true }).eq('guild_id', gid).is('closed_at', null),
      supaAdmin.from('ff_matches').select('*', { count: 'exact', head: true }).eq('guild_id', gid).gte('created_at', since),
      supaAdmin.from('orders').select('*', { count: 'exact', head: true }).eq('guild_id', gid).eq('status', 'delivered').gte('created_at', since),
      supaAdmin.from('bot_guilds').select('member_count, name, icon').eq('guild_id', gid).maybeSingle(),
    ]);
    res.json({ ok: true, guild: g.data, stats: { members: g.data?.member_count || 0, tickets_open: ticketsOpen.count || 0, bets_30d: bets.count || 0, orders_30d: orders.count || 0 } });
  } catch (e) { return genericError(res); }
});

app.get('/api/me/servers/:guildId/tickets', requireAuth, async (req, res) => {
  try {
    if (!(await canAccessGuild(req, req.params.guildId))) return res.status(403).json({ ok: false, error: 'Sem acesso' });
    const { data } = await supaAdmin.from('ticket_data').select('*').eq('guild_id', req.params.guildId).order('opened_at', { ascending: false }).limit(50);
    res.json({ ok: true, tickets: data || [] });
  } catch (e) { return genericError(res); }
});

app.get('/api/me/servers/:guildId/products', requireAuth, async (req, res) => {
  try {
    if (!(await canAccessGuild(req, req.params.guildId))) return res.status(403).json({ ok: false, error: 'Sem acesso' });
    const { data } = await supaAdmin.from('products').select('*').eq('guild_id', req.params.guildId).order('id', { ascending: false }).limit(100);
    res.json({ ok: true, products: data || [] });
  } catch (e) { return genericError(res); }
});

app.get('/api/me/servers/:guildId/orders', requireAuth, async (req, res) => {
  try {
    if (!(await canAccessGuild(req, req.params.guildId))) return res.status(403).json({ ok: false, error: 'Sem acesso' });
    const { data } = await supaAdmin.from('orders').select('*').eq('guild_id', req.params.guildId).order('id', { ascending: false }).limit(50);
    res.json({ ok: true, orders: data || [] });
  } catch (e) { return genericError(res); }
});

app.post('/api/me/servers/:guildId/take-members', requireAdmin, csrfProtect, rateLimit(5, 60 * 60 * 1000), async (req, res) => {
  try {
    if (!(await canAccessGuild(req, req.params.guildId))) return res.status(403).json({ ok: false, error: 'Sem acesso' });
    if (!DISCORD_TOKEN) return res.status(500).json({ ok: false, error: 'DISCORD_TOKEN não configurado' });
    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) return res.status(500).json({ ok: false, error: 'OAuth não configurado' });

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
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET,
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
          headers: { Authorization: `Bot ${DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: token }),
        });
        if (r.ok || r.status === 204) added++; else failed++;
      } catch { failed++; }
      await sleep(1100);
    }
    await audit(req, 'take_members', { metadata: { guild_id: gid, added, failed, total: vers.length } });
    res.json({ ok: true, added, failed, total: vers.length });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// DEV — GERENCIAR SERVIDORES
// ═══════════════════════════════════════════════════════════
app.get('/api/dev/servers', requireDev, async (req, res) => {
  try {
    const { search, min_members, has_premium, limit = 100, offset = 0 } = req.query;
    let q = supaAdmin.from('bot_guilds').select('*', { count: 'exact' }).eq('in_guild', true);
    if (search) q = q.or(`name.ilike.%${search}%,guild_id.eq.${search}`);
    if (min_members) q = q.gte('member_count', Number(min_members));
    q = q.order('member_count', { ascending: false });
    const { data, error, count } = await q.range(Number(offset), Number(offset) + Number(limit) - 1);
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const ids = (data || []).map(g => g.guild_id);
    let premiumIds = new Set();
    if (ids.length) {
      const { data: fps } = await supaAdmin.from('force_premium').select('target_id').eq('scope', 'guild').in('target_id', ids);
      const { data: cfgs } = await supaAdmin.from('configs').select('guild_id,is_premium,premium_tier').in('guild_id', ids).eq('is_premium', true);
      for (const f of fps || []) premiumIds.add(f.target_id);
      for (const c of cfgs || []) premiumIds.add(c.guild_id);
    }

    const enriched = (data || []).map(g => ({ ...g, is_premium: premiumIds.has(g.guild_id) }));
    const filtered = has_premium === 'true' ? enriched.filter(g => g.is_premium)
                   : has_premium === 'false' ? enriched.filter(g => !g.is_premium)
                   : enriched;

    res.json({ ok: true, servers: filtered, total: count || 0 });
  } catch (e) { return genericError(res); }
});

app.get('/api/dev/servers/:guildId/full', requireDev, async (req, res) => {
  try {
    const gid = req.params.guildId;
    const [g, cfg, ff, fps, tickets, bets, orders, products] = await Promise.all([
      supaAdmin.from('bot_guilds').select('*').eq('guild_id', gid).maybeSingle(),
      supaAdmin.from('configs').select('*').eq('guild_id', gid).maybeSingle(),
      supaAdmin.from('ff_config').select('*').eq('guild_id', gid).maybeSingle(),
      supaAdmin.from('force_premium').select('*').eq('scope', 'guild').eq('target_id', gid).maybeSingle(),
      supaAdmin.from('ticket_data').select('*', { count: 'exact', head: true }).eq('guild_id', gid).is('closed_at', null),
      supaAdmin.from('ff_matches').select('*', { count: 'exact', head: true }).eq('guild_id', gid),
      supaAdmin.from('orders').select('*', { count: 'exact', head: true }).eq('guild_id', gid).eq('status', 'delivered'),
      supaAdmin.from('products').select('*', { count: 'exact', head: true }).eq('guild_id', gid),
    ]);
    res.json({
      ok: true,
      guild: g.data, config: cfg.data, ff: ff.data, force_premium: fps.data,
      counts: {
        tickets_open: tickets.count || 0,
        bets_total: bets.count || 0,
        orders_delivered: orders.count || 0,
        products: products.count || 0,
      },
    });
  } catch (e) { return genericError(res); }
});

app.post('/api/dev/servers/:guildId/leave', requireDev, csrfProtect, async (req, res) => {
  try {
    if (!DISCORD_TOKEN) return res.status(500).json({ ok: false, error: 'DISCORD_TOKEN não configurado' });
    const gid = req.params.guildId;
    const r = await fetch(`https://discord.com/api/v10/users/@me/guilds/${gid}`, {
      method: 'DELETE',
      headers: { Authorization: `Bot ${DISCORD_TOKEN}` },
    });
    if (!r.ok && r.status !== 204) {
      const err = await r.json().catch(() => ({}));
      return res.status(400).json({ ok: false, error: err.message || `Discord HTTP ${r.status}` });
    }
    await supaAdmin.from('bot_guilds').update({ in_guild: false }).eq('guild_id', gid);
    await audit(req, 'force_leave_guild', { metadata: { guild_id: gid } });
    res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

app.post('/api/dev/servers/:guildId/rename', requireDev, csrfProtect, async (req, res) => {
  try {
    if (!DISCORD_TOKEN) return res.status(500).json({ ok: false, error: 'DISCORD_TOKEN não configurado' });
    const gid = req.params.guildId;
    const name = String(req.body?.name || '').trim();
    if (!name || name.length > 100) return res.status(400).json({ ok: false, error: 'Nome inválido (1-100 chars)' });
    const r = await fetch(`https://discord.com/api/v10/guilds/${gid}`, {
      method: 'PATCH',
      headers: { Authorization: `Bot ${DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(400).json({ ok: false, error: err.message || `Discord HTTP ${r.status}` });
    }
    await supaAdmin.from('bot_guilds').update({ name }).eq('guild_id', gid);
    await audit(req, 'force_rename_guild', { metadata: { guild_id: gid, name } });
    res.json({ ok: true, name });
  } catch (e) { return genericError(res); }
});

app.post('/api/dev/servers/:guildId/refresh', requireDev, csrfProtect, async (req, res) => {
  try {
    if (!DISCORD_TOKEN) return res.status(500).json({ ok: false, error: 'DISCORD_TOKEN não configurado' });
    const gid = req.params.guildId;
    const r = await fetch(`https://discord.com/api/v10/guilds/${gid}?with_counts=true`, {
      headers: { Authorization: `Bot ${DISCORD_TOKEN}` },
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(400).json({ ok: false, error: err.message || `Discord HTTP ${r.status}` });
    }
    const d = await r.json();
    await supaAdmin.from('bot_guilds').upsert({
      guild_id: d.id,
      name: d.name,
      member_count: d.approximate_member_count || 0,
      icon: d.icon ? `https://cdn.discordapp.com/icons/${d.id}/${d.icon}.png` : null,
      owner_id: d.owner_id,
      in_guild: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id' });
    await audit(req, 'refresh_guild', { metadata: { guild_id: gid } });
    res.json({ ok: true, guild: { id: d.id, name: d.name, member_count: d.approximate_member_count || 0 } });
  } catch (e) { return genericError(res); }
});

app.post('/api/dev/servers/:guildId/nuke', requireDev, csrfProtect, rateLimit(3, 60 * 60 * 1000), async (req, res) => {
  try {
    if (!DISCORD_TOKEN) return res.status(500).json({ ok: false, error: 'DISCORD_TOKEN não configurado' });
    const gid = req.params.guildId;
    const confirmName = String(req.body?.confirm || '').trim();
    if (confirmName !== 'CONFIRMAR') return res.status(400).json({ ok: false, error: 'Digite CONFIRMAR para prosseguir' });

    let deletedChannels = 0, deletedRoles = 0;
    try {
      const chRes = await fetch(`https://discord.com/api/v10/guilds/${gid}/channels`, { headers: { Authorization: `Bot ${DISCORD_TOKEN}` } });
      if (chRes.ok) {
        const channels = await chRes.json();
        for (const ch of channels) {
          const dr = await fetch(`https://discord.com/api/v10/channels/${ch.id}`, { method: 'DELETE', headers: { Authorization: `Bot ${DISCORD_TOKEN}` } });
          if (dr.ok) deletedChannels++;
          await sleep(300);
        }
      }
    } catch {}

    try {
      const roleRes = await fetch(`https://discord.com/api/v10/guilds/${gid}/roles`, { headers: { Authorization: `Bot ${DISCORD_TOKEN}` } });
      if (roleRes.ok) {
        const roles = await roleRes.json();
        for (const role of roles) {
          if (role.name === '@everyone' || role.managed) continue;
          const dr = await fetch(`https://discord.com/api/v10/guilds/${gid}/roles/${role.id}`, { method: 'DELETE', headers: { Authorization: `Bot ${DISCORD_TOKEN}` } });
          if (dr.ok) deletedRoles++;
          await sleep(300);
        }
      }
    } catch {}

    await audit(req, 'nuke_guild', { metadata: { guild_id: gid, deletedChannels, deletedRoles } });
    res.json({ ok: true, deletedChannels, deletedRoles });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// DEV — USUÁRIOS
// ═══════════════════════════════════════════════════════════
app.get('/api/dev/usuarios', requireDev, async (req, res) => {
  try {
    const { role, ativo, plan, search, limit = 100, offset = 0 } = req.query;
    let q = supaAdmin.from('panel_admins').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (role) q = q.eq('role', role);
    if (plan) q = q.eq('plan', plan);
    if (ativo === 'true') q = q.eq('ativo', true);
    if (ativo === 'false') q = q.eq('ativo', false);
    if (search) q = q.or(`email.ilike.%${search}%,nome.ilike.%${search}%,discord_id.eq.${search}`);
    const { data, error, count } = await q.range(Number(offset), Number(offset) + Number(limit) - 1);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, usuarios: data || [], total: count || 0 });
  } catch (e) { return genericError(res); }
});

app.get('/api/dev/usuarios/clientes', requireStaff, async (req, res) => {
  try {
    const { data } = await supaAdmin.from('panel_admins')
      .select('user_id,email,nome,discord_id,role,plan,assigned_guilds')
      .eq('ativo', true).in('role', ['cliente', 'funcionario']).order('nome');
    res.json({ ok: true, clientes: data || [] });
  } catch (e) { return genericError(res); }
});

app.get('/api/dev/usuarios/pending', requireDev, async (req, res) => {
  try {
    const { data } = await supaAdmin.from('panel_admins').select('*').eq('role', 'pending').order('created_at', { ascending: false });
    res.json({ ok: true, pendentes: data || [] });
  } catch (e) { return genericError(res); }
});

app.post('/api/dev/usuarios', requireDev, csrfProtect, async (req, res) => {
  try {
    const { email, discord_id, password, role, plan, assigned_guilds, notes, nome } = req.body || {};
    if (!email || !role) return res.status(400).json({ ok: false, error: 'Email e role obrigatórios' });
    if (!ROLES.includes(role)) return res.status(400).json({ ok: false, error: 'Role inválido' });
    if (plan && !PLANS.includes(plan)) return res.status(400).json({ ok: false, error: 'Plano inválido' });
    if (!discord_id || !isValidDiscordId(discord_id)) return res.status(400).json({ ok: false, error: 'Discord ID obrigatório/válido' });

    const emailNorm = String(email).toLowerCase().trim();
    const { data: existing } = await supaAdmin.from('panel_admins').select('user_id').eq('email', emailNorm).maybeSingle();
    if (existing) return res.status(400).json({ ok: false, error: 'E-mail já cadastrado' });

    const finalPassword = password && password.length >= 8 ? password : genPassword(12);
    const { data: authData, error: authErr } = await supaAdmin.auth.admin.createUser({
      email: emailNorm, password: finalPassword, email_confirm: true,
    });
    if (authErr) return res.status(400).json({ ok: false, error: authErr.message });

    const { error: dbErr } = await supaAdmin.from('panel_admins').insert({
      user_id: authData.user.id, email: emailNorm,
      nome: nome || emailNorm.split('@')[0],
      role, plan: plan || 'basic', ativo: true, is_owner: false,
      pode_gerar_keys: ['dev', 'admin', 'funcionario'].includes(role),
      discord_id: cleanId(discord_id),
      assigned_guilds: Array.isArray(assigned_guilds) ? assigned_guilds : [],
      notes: notes || null,
      approved_at: new Date().toISOString(),
      approved_by: req.user.email,
    });
    if (dbErr) {
      await supaAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
      return res.status(500).json({ ok: false, error: dbErr.message });
    }

    await audit(req, `add_${role}`, {
      target_id: authData.user.id, target_role: role,
      metadata: { email: emailNorm, plan },
    });

    await notify(authData.user.id, 'system', '👋 Bem-vindo!',
      `Conta (${role} · ${plan || 'basic'}) criada. Sua senha temporária: ${finalPassword}`,
      { role, plan });

    res.json({ ok: true, user_id: authData.user.id, temp_password: finalPassword });
  } catch (e) { return genericError(res); }
});

app.post('/api/dev/usuarios/:userId/approve', requireDev, csrfProtect, async (req, res) => {
  try {
    const { role, plan, assigned_guilds, notes } = req.body || {};
    if (!ROLES.includes(role)) return res.status(400).json({ ok: false, error: 'Role inválido' });
    if (plan && !PLANS.includes(plan)) return res.status(400).json({ ok: false, error: 'Plano inválido' });

    const { error } = await supaAdmin.from('panel_admins').update({
      role, plan: plan || 'basic', ativo: true,
      pode_gerar_keys: ['dev', 'admin', 'funcionario'].includes(role),
      assigned_guilds: Array.isArray(assigned_guilds) ? assigned_guilds : [],
      notes: notes || null,
      approved_at: new Date().toISOString(),
      approved_by: req.user.email,
      updated_at: new Date().toISOString(),
    }).eq('user_id', req.params.userId);
    if (error) return res.status(500).json({ ok: false, error: error.message });

    await audit(req, 'approve_user', { target_id: req.params.userId, target_role: role });
    await notify(req.params.userId, 'system', '✅ Aprovado!', `Você é ${role} · ${plan || 'basic'}.`, { role, plan });
    res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

app.patch('/api/dev/usuarios/:userId/plan', requireDev, csrfProtect, async (req, res) => {
  try {
    const { plan } = req.body || {};
    if (!PLANS.includes(plan)) return res.status(400).json({ ok: false, error: 'Plano inválido' });
    const { error } = await supaAdmin.from('panel_admins').update({ plan, updated_at: new Date().toISOString() }).eq('user_id', req.params.userId);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    await audit(req, 'change_plan', { target_id: req.params.userId, metadata: { plan } });
    await notify(req.params.userId, 'system', '💎 Plano alterado!', `Seu plano agora é ${String(plan).toUpperCase()}.`, { plan });
    res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

app.patch('/api/dev/usuarios/:userId', requireDev, csrfProtect, async (req, res) => {
  try {
    const { role, ativo, nome, discord_id, assigned_guilds, notes, plan, banned } = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    if (role && ROLES.includes(role)) {
      patch.role = role;
      patch.pode_gerar_keys = ['dev', 'admin', 'funcionario'].includes(role);
    }
    if (plan && PLANS.includes(plan)) patch.plan = plan;
    if (typeof ativo === 'boolean') patch.ativo = ativo;
    if (typeof banned === 'boolean') patch.banned = banned;
    if (nome) patch.nome = nome;
    if (discord_id !== undefined) patch.discord_id = discord_id ? cleanId(discord_id) : null;
    if (Array.isArray(assigned_guilds)) patch.assigned_guilds = assigned_guilds;
    if (notes !== undefined) patch.notes = notes || null;

    const { error } = await supaAdmin.from('panel_admins').update(patch).eq('user_id', req.params.userId);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    await audit(req, 'update_user', { target_id: req.params.userId, metadata: patch });
    res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

app.delete('/api/dev/usuarios/:userId', requireDev, csrfProtect, async (req, res) => {
  try {
    if (req.params.userId === req.user.id) return res.status(400).json({ ok: false, error: 'Não pode remover a si mesmo' });
    const { data: target } = await supaAdmin.from('panel_admins').select('role').eq('user_id', req.params.userId).maybeSingle();
    if (target?.role === 'dev') return res.status(400).json({ ok: false, error: 'Não pode remover outro DEV' });

    const { error } = await supaAdmin.from('panel_admins').update({ ativo: false, banned: true }).eq('user_id', req.params.userId);
    if (error) return res.status(500).json({ ok: false, error: error.message });

    // Revoga todas as sessões
    await supaAdmin.from('active_sessions').delete().eq('user_id', req.params.userId);

    await audit(req, 'deactivate_user', { target_id: req.params.userId });
    res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// KEYS
// ═══════════════════════════════════════════════════════════
app.post('/api/keys/generate', requireStaff, csrfProtect, rateLimit(20, 60 * 1000), async (req, res) => {
  try {
    const { tier, duracao_dias, quantidade = 1, max_usos = 1, motivo, validade_key_dias } = req.body || {};
    if (!TIERS.includes(tier)) return res.status(400).json({ ok: false, error: 'Tier inválido' });
    if (![7, 15, 30, 90, 180, 365, 0].includes(Number(duracao_dias))) return res.status(400).json({ ok: false, error: 'Duração inválida' });
    const qty = Math.min(Math.max(parseInt(quantidade) || 1, 1), 50);
    const geradas = [];
    for (let i = 0; i < qty; i++) {
      const keyCode = genKeyCode();
      const expiresKey = validade_key_dias > 0 ? new Date(Date.now() + validade_key_dias * 86400000).toISOString() : null;
      const { data, error } = await supaAdmin.from('premium_keys').insert({
        key_code: keyCode, tier, duracao_dias: Number(duracao_dias),
        max_usos: Number(max_usos), usos_atuais: 0,
        gerado_por: req.user.id, gerado_por_email: req.user.email,
        motivo: motivo || null, expira_em: expiresKey, ativo: true, is_pack: false,
      }).select().single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      geradas.push(data);
    }
    await audit(req, 'generate_keys', { metadata: { tier, quantidade: geradas.length } });
    res.json({ ok: true, keys: geradas });
  } catch (e) { return genericError(res); }
});

app.post('/api/keys/generate-pack', requireDev, csrfProtect, rateLimit(10, 60 * 1000), async (req, res) => {
  try {
    const { quantidade = 1, motivo } = req.body || {};
    const qty = Math.min(Math.max(parseInt(quantidade) || 1, 1), 20);
    const gerados = [];
    for (let i = 0; i < qty; i++) {
      const keyCode = genKeyCode();
      const packContents = { tiers: ['basic','premium','ultra','unlimited'], durations: [7,15,30], quantity_each: 5, total: 60 };
      const { data, error } = await supaAdmin.from('premium_keys').insert({
        key_code: keyCode, tier: 'pack', duracao_dias: 0,
        max_usos: 1, usos_atuais: 0,
        gerado_por: req.user.id, gerado_por_email: req.user.email,
        motivo: motivo || null, ativo: true, is_pack: true,
        pack_contents: packContents,
      }).select().single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      gerados.push(data);
    }
    await audit(req, 'generate_pack', { metadata: { quantidade: gerados.length } });
    res.json({ ok: true, packs: gerados });
  } catch (e) { return genericError(res); }
});

app.post('/api/keys/redeem-pack', requireDev, csrfProtect, async (req, res) => {
  try {
    const { key_id } = req.body || {};
    if (!key_id) return res.status(400).json({ ok: false, error: 'key_id obrigatório' });
    const { data: pack } = await supaAdmin.from('premium_keys').select('*').eq('id', key_id).maybeSingle();
    if (!pack) return res.status(404).json({ ok: false, error: 'Pack não encontrado' });
    if (!pack.is_pack) return res.status(400).json({ ok: false, error: 'Não é um pack' });
    if (!pack.ativo) return res.status(400).json({ ok: false, error: 'Pack já resgatado' });

    const tiers = ['basic','premium','ultra','unlimited'];
    const durations = [7, 15, 30];
    const qtyEach = 5;
    const geradas = [];

    for (const tier of tiers) {
      for (const dias of durations) {
        for (let i = 0; i < qtyEach; i++) {
          const keyCode = genKeyCode();
          const { data } = await supaAdmin.from('premium_keys').insert({
            key_code: keyCode, tier, duracao_dias: dias,
            max_usos: 1, usos_atuais: 0,
            gerado_por: req.user.id, gerado_por_email: req.user.email,
            motivo: 'Pack', ativo: true,
            is_pack: false, generated_from_pack: String(pack.id),
          }).select().single();
          if (data) geradas.push(data);
        }
      }
    }

    await supaAdmin.from('premium_keys').update({ ativo: false, usos_atuais: 1 }).eq('id', pack.id);
    await audit(req, 'redeem_pack', { metadata: { pack_id: pack.id, total: geradas.length } });
    res.json({ ok: true, keys: geradas, total: geradas.length });
  } catch (e) { return genericError(res); }
});

app.get('/api/keys', requireStaff, async (req, res) => {
  try {
    const { status, tier, limit = 100, offset = 0, include_packs } = req.query;
    let q = supaAdmin.from('premium_keys').select('*').order('created_at', { ascending: false });
    if (include_packs !== 'true') q = q.eq('is_pack', false);
    if (status === 'active') q = q.eq('ativo', true);
    if (status === 'used') q = q.eq('ativo', false);
    if (tier) q = q.eq('tier', tier);
    const { data, error } = await q.range(Number(offset), Number(offset) + Number(limit) - 1);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, keys: data || [] });
  } catch (e) { return genericError(res); }
});

app.get('/api/keys/packs', requireDev, async (req, res) => {
  try {
    const { data, error } = await supaAdmin.from('premium_keys').select('*').eq('is_pack', true).order('created_at', { ascending: false }).limit(100);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, packs: data || [] });
  } catch (e) { return genericError(res); }
});

app.post('/api/keys/send', requireStaff, csrfProtect, async (req, res) => {
  try {
    const { key_id, user_id } = req.body || {};
    if (!key_id || !user_id) return res.status(400).json({ ok: false, error: 'key_id e user_id obrigatórios' });
    const { data: key } = await supaAdmin.from('premium_keys').select('*').eq('id', key_id).maybeSingle();
    if (!key) return res.status(404).json({ ok: false, error: 'Key não encontrada' });
    const { data: target } = await supaAdmin.from('panel_admins').select('user_id,email,nome,ativo').eq('user_id', user_id).maybeSingle();
    if (!target) return res.status(404).json({ ok: false, error: 'Usuário não encontrado' });
    if (!target.ativo) return res.status(400).json({ ok: false, error: 'Usuário inativo' });

    await supaAdmin.from('premium_keys').update({ sent_to: user_id, sent_at: new Date().toISOString() }).eq('id', key_id);

    const label = key.is_pack ? '📦 Pack de Keys' : `🔑 ${key.tier.toUpperCase()}`;
    await notify(user_id, 'key_received', `${label} recebido!`, `Código: ${key.key_code}`,
      { key_id, key_code: key.key_code, tier: key.tier, is_pack: key.is_pack });

    if (!key.is_pack) await audit(req, 'send_key', { target_id: user_id, metadata: { key_id, key_code: key.key_code } });
    res.json({ ok: true, sent_to: target.email, key_code: key.key_code });
  } catch (e) { return genericError(res); }
});

app.delete('/api/keys/:id', requireDev, csrfProtect, async (req, res) => {
  try {
    await supaAdmin.from('premium_keys').delete().eq('id', req.params.id);
    await audit(req, 'delete_key', { metadata: { key_id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

app.get('/api/redemptions', requireStaff, async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const { data } = await supaAdmin.from('premium_redemptions')
      .select('*').neq('tier', 'pack')
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);
    res.json({ ok: true, redemptions: data || [] });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// CLIENTE — meus dados
// ═══════════════════════════════════════════════════════════
app.get('/api/me/keys-sent', requireAuth, async (req, res) => {
  try {
    const { data } = await supaAdmin.from('premium_keys').select('*').eq('sent_to', req.user.id).order('sent_at', { ascending: false }).limit(100);
    res.json({ ok: true, keys: data || [] });
  } catch (e) { return genericError(res); }
});

app.get('/api/me/orders', requireAuth, async (req, res) => {
  try {
    const { data } = await supaAdmin.from('orders').select('*').eq('user_id', req.user.id).order('id', { ascending: false }).limit(100);
    res.json({ ok: true, orders: data || [] });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// SESSIONS — listar / revogar
// ═══════════════════════════════════════════════════════════
app.get('/api/me/sessions', requireAuth, async (req, res) => {
  try {
    const { data } = await supaAdmin.from('active_sessions')
      .select('id, ip, browser, os, device_type, country, city, created_at, last_seen, expires_at')
      .eq('user_id', req.user.id)
      .gt('expires_at', new Date().toISOString())
      .order('last_seen', { ascending: false });
    res.json({ ok: true, sessions: data || [] });
  } catch (e) { return genericError(res); }
});

app.delete('/api/me/sessions/:sessionId', requireAuth, csrfProtect, async (req, res) => {
  try {
    await supaAdmin.from('active_sessions').delete()
      .eq('id', req.params.sessionId)
      .eq('user_id', req.user.id);
    await audit(req, 'revoke_own_session', { metadata: { session_id: req.params.sessionId } });
    res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

app.get('/api/dev/user/:userId/sessions', requireDev, async (req, res) => {
  try {
    const { data } = await supaAdmin.from('active_sessions')
      .select('*').eq('user_id', req.params.userId)
      .gt('expires_at', new Date().toISOString())
      .order('last_seen', { ascending: false });
    await audit(req, 'view_user_sessions', { target_id: req.params.userId });
    res.json({ ok: true, sessions: data || [] });
  } catch (e) { return genericError(res); }
});

app.delete('/api/dev/user/:userId/sessions', requireDev, csrfProtect, async (req, res) => {
  try {
    await supaAdmin.from('active_sessions').delete().eq('user_id', req.params.userId);
    await audit(req, 'revoke_all_user_sessions', { target_id: req.params.userId });
    res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// DEV — AUDIT COMPLETO
// ═══════════════════════════════════════════════════════════
app.get('/api/dev/audit', requireDev, rateLimit(120, 60 * 1000), async (req, res) => {
  try {
    const {
      limit = 100, offset = 0, action,
      actor_id, target_id, ip, from, to, success,
    } = req.query;

    let q = supaAdmin.from('site_audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (action) q = q.eq('action', action);
    if (actor_id) q = q.eq('actor_id', actor_id);
    if (target_id) q = q.eq('target_id', target_id);
    if (ip) q = q.eq('ip', ip);
    if (success !== undefined) q = q.eq('success', success === 'true');
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);

    const { data, error, count } = await q.range(Number(offset), Number(offset) + Number(limit) - 1);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, logs: data || [], total: count || 0 });
  } catch (e) { return genericError(res); }
});

app.get('/api/dev/audit/export', requireDev, rateLimit(5, 60 * 1000), async (req, res) => {
  try {
    const { from, to, action } = req.query;
    let q = supaAdmin.from('site_audit_log').select('*').order('created_at', { ascending: false }).limit(10000);
    if (action) q = q.eq('action', action);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);
    const { data } = await q;

    const csv = ['id,created_at,actor_id,actor_email,action,target_id,target_role,ip,browser,os,device_type,country,city,success,error_reason'];
    for (const r of data || []) {
      csv.push([
        r.id, r.created_at,
        r.actor_id || '', `"${(r.actor_email || '').replace(/"/g, '""')}"`,
        r.action || '', r.target_id || '', r.target_role || '',
        r.ip || '', r.browser || '', r.os || '', r.device_type || '',
        r.country || '', r.city || '',
        r.success !== false, `"${(r.error_reason || '').replace(/"/g, '""')}"`,
      ].join(','));
    }
    await audit(req, 'export_audit');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-${Date.now()}.csv"`);
    res.send(csv.join('\n'));
  } catch (e) { return genericError(res); }
});

app.get('/api/dev/audit/stats', requireDev, async (req, res) => {
  try {
    const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
    const [total, fails, logins7d, loginsFailed7d, accessDenied7d] = await Promise.all([
      supaAdmin.from('site_audit_log').select('*', { count: 'exact', head: true }),
      supaAdmin.from('site_audit_log').select('*', { count: 'exact', head: true }).eq('success', false),
      supaAdmin.from('site_audit_log').select('*', { count: 'exact', head: true }).eq('action', 'login').gte('created_at', since7d),
      supaAdmin.from('site_audit_log').select('*', { count: 'exact', head: true }).eq('action', 'login_failed').gte('created_at', since7d),
      supaAdmin.from('site_audit_log').select('*', { count: 'exact', head: true }).eq('action', 'access_denied').gte('created_at', since7d),
    ]);
    res.json({ ok: true, stats: {
      total: total.count || 0,
      failed: fails.count || 0,
      logins_7d: logins7d.count || 0,
      logins_failed_7d: loginsFailed7d.count || 0,
      access_denied_7d: accessDenied7d.count || 0,
    }});
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// BACKUP / SYNC
// ═══════════════════════════════════════════════════════════
app.get('/api/dev/backup', requireDev, async (req, res) => {
  try {
    const tables = ['panel_admins','bot_guilds','user_guilds','premium_keys','premium_redemptions','site_notifications','site_audit_log','active_sessions'];
    const dump = { generated_at: new Date().toISOString(), tables: {} };
    for (const t of tables) {
      const { data } = await supaAdmin.from(t).select('*').limit(5000);
      dump.tables[t] = data || [];
    }
    await audit(req, 'export_backup');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="frio-backup-${Date.now()}.json"`);
    res.send(JSON.stringify(dump, null, 2));
  } catch (e) { return genericError(res); }
});

app.post('/api/dev/sync-servers', requireDev, csrfProtect, async (req, res) => {
  try {
    await supaAdmin.from('bot_meta').upsert({
      key: 'force_sync_servers',
      value: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
    await audit(req, 'force_sync_servers');
    res.json({ ok: true, message: 'Sync agendado. O bot vai atualizar em até 1 minuto.' });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════
app.get('/api/admin/tickets-global', requireAdmin, async (req, res) => {
  try {
    const { data } = await supaAdmin.from('ticket_data').select('*').is('closed_at', null).order('opened_at', { ascending: false }).limit(100);
    res.json({ ok: true, tickets: data || [] });
  } catch (e) { return genericError(res); }
});

app.get('/api/admin/financial', requireAdmin, async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: orders } = await supaAdmin.from('orders').select('total,status,created_at').gte('created_at', since);
    const delivered = (orders || []).filter(o => o.status === 'delivered');
    const total = delivered.reduce((a, o) => a + Number(o.total || 0), 0);
    const daily = {};
    for (const o of delivered) {
      const d = o.created_at.substring(0, 10);
      daily[d] = (daily[d] || 0) + Number(o.total || 0);
    }
    res.json({
      ok: true,
      total, count: delivered.length,
      avg: delivered.length ? total / delivered.length : 0,
      daily: Object.entries(daily).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// DEV TOOLS — kill switch / maintenance / force premium / broadcast
// ═══════════════════════════════════════════════════════════
app.get('/api/dev/kill-switch', requireDev, async (req, res) => {
  const { data } = await supaAdmin.from('kill_switch').select('*').eq('id', 1).maybeSingle();
  res.json({ ok: true, active: !!data?.active, reason: data?.reason });
});
app.post('/api/dev/kill-switch', requireDev, csrfProtect, async (req, res) => {
  const { active, reason } = req.body || {};
  await supaAdmin.from('kill_switch').upsert({
    id: 1, active: !!active, reason: reason || null,
    enabled_by: req.user.id,
    enabled_at: active ? new Date().toISOString() : null,
  });
  await audit(req, active ? 'kill_switch_on' : 'kill_switch_off', { metadata: { reason } });
  res.json({ ok: true });
});

app.get('/api/dev/maintenance', requireDev, async (req, res) => {
  const { data } = await supaAdmin.from('maintenance_mode').select('*').eq('id', 1).maybeSingle();
  res.json({ ok: true, active: !!data?.active, reason: data?.reason });
});
app.post('/api/dev/maintenance', requireDev, csrfProtect, async (req, res) => {
  const { active, reason } = req.body || {};
  await supaAdmin.from('maintenance_mode').upsert({
    id: 1, active: !!active, reason: reason || null,
    by: req.user.id,
    started_at: active ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  await audit(req, active ? 'maintenance_on' : 'maintenance_off', { metadata: { reason } });
  res.json({ ok: true });
});

app.get('/api/dev/force-premium', requireDev, async (req, res) => {
  const { data } = await supaAdmin.from('force_premium').select('*').order('granted_at', { ascending: false }).limit(200);
  res.json({ ok: true, items: data || [] });
});
app.post('/api/dev/force-premium', requireDev, csrfProtect, async (req, res) => {
  const { scope, target_id, days, reason } = req.body || {};
  if (!scope || !target_id) return res.status(400).json({ ok: false, error: 'scope e target_id obrigatórios' });
  const permanent = !days || Number(days) === 0;
  const expires_at = permanent ? null : new Date(Date.now() + Number(days) * 86400000).toISOString();
  await supaAdmin.from('force_premium').upsert({
    scope, target_id, permanent, expires_at,
    reason: reason || null,
    granted_by: req.user.id,
    granted_at: new Date().toISOString(),
  }, { onConflict: 'scope,target_id' });
  await audit(req, 'force_premium_add', { metadata: { scope, target_id, days } });
  res.json({ ok: true });
});
app.delete('/api/dev/force-premium/:id', requireDev, csrfProtect, async (req, res) => {
  await supaAdmin.from('force_premium').delete().eq('id', req.params.id);
  await audit(req, 'force_premium_remove', { metadata: { id: req.params.id } });
  res.json({ ok: true });
});

app.post('/api/dev/broadcast', requireDev, csrfProtect, rateLimit(5, 60 * 1000), async (req, res) => {
  const { title, content, role } = req.body || {};
  if (!title || !content) return res.status(400).json({ ok: false, error: 'title e content obrigatórios' });
  let q = supaAdmin.from('panel_admins').select('user_id').eq('ativo', true);
  if (role) q = q.eq('role', role);
  const { data: users } = await q;
  for (const u of users || []) await notify(u.user_id, 'system', title, content);
  await audit(req, 'broadcast_global', { metadata: { title, role, count: (users || []).length } });
  res.json({ ok: true, sent: (users || []).length });
});

app.post('/api/dev/force-update', requireDev, csrfProtect, async (req, res) => {
  await supaAdmin.from('bot_meta').delete().eq('key', 'last_update_broadcast');
  await supaAdmin.from('guild_update_log').delete().neq('guild_id', 'x');
  await audit(req, 'force_update_reset');
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// NOTIFICAÇÕES
// ═══════════════════════════════════════════════════════════
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const { limit = 30 } = req.query;
    const { data, error } = await supaAdmin.from('site_notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(Number(limit));
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const { count: unread } = await supaAdmin.from('site_notifications').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id).eq('read', false);
    res.json({ ok: true, notifications: data || [], unread: unread || 0 });
  } catch (e) { return genericError(res); }
});
app.patch('/api/notifications/:id/read', requireAuth, csrfProtect, async (req, res) => {
  await supaAdmin.from('site_notifications').update({ read: true }).eq('id', req.params.id).eq('user_id', req.user.id);
  res.json({ ok: true });
});
app.post('/api/notifications/read-all', requireAuth, csrfProtect, async (req, res) => {
  await supaAdmin.from('site_notifications').update({ read: true }).eq('user_id', req.user.id).eq('read', false);
  res.json({ ok: true });
});
app.post('/api/dev/notifications', requireStaff, csrfProtect, async (req, res) => {
  try {
    const { user_id, type = 'system', title, content, broadcast_to_role } = req.body || {};
    if (broadcast_to_role) {
      const { data: targets } = await supaAdmin.from('panel_admins').select('user_id').eq('role', broadcast_to_role).eq('ativo', true);
      for (const t of targets || []) await notify(t.user_id, type, title, content);
      await audit(req, 'broadcast_notification', { target_role: broadcast_to_role });
      return res.json({ ok: true, sent: (targets || []).length });
    }
    if (!user_id) return res.status(400).json({ ok: false, error: 'user_id obrigatório' });
    if (!title || !content) return res.status(400).json({ ok: false, error: 'title e content obrigatórios' });
    await notify(user_id, type, title, content);
    await audit(req, 'send_notification', { target_id: user_id, metadata: { title, type } });
    res.json({ ok: true });
  } catch (e) { return genericError(res); }
});

// ═══════════════════════════════════════════════════════════
// SPA FALLBACK + ERRO GLOBAL
// ═══════════════════════════════════════════════════════════
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'Rota não encontrada.' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('❌ [UNCAUGHT]', err);
  if (res.headersSent) return next(err);
  return genericError(res, 500);
});

// ═══════════════════════════════════════════════════════════
// CLEANUP JOBS
// ═══════════════════════════════════════════════════════════
setInterval(async () => {
  try {
    await supaAdmin.rpc('cleanup_expired_data').catch(() => {});
    console.log('🧹 [cleanup] executado');
  } catch (e) { console.error('[cleanup]', e.message); }
}, 24 * 60 * 60 * 1000);

// ═══════════════════════════════════════════════════════════
// PROCESS HANDLERS
// ═══════════════════════════════════════════════════════════
process.on('unhandledRejection', r => console.error('⚠️ unhandledRejection:', r?.message || r));
process.on('uncaughtException', e => console.error('⚠️ uncaughtException:', e?.message || e));

// ═══════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`🌐 [PANEL v5.1.0] Rodando na porta ${PORT}`);
  console.log(`🔒 NODE_ENV=${NODE_ENV}`);
  console.log(`🤖 Bot: ${BOT_API_URL}`);
  console.log(`🔑 Audit token: ${PANEL_API_TOKEN ? 'OK' : 'AUSENTE'}`);
  console.log(`🚀 Pronto.`);
});
