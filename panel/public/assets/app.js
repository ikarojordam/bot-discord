// ═══════════════════════════════════════════════════════════
// FRIO PANEL — app.js v5.2.0
// Dashboard v2 + Auth + SPA Router + Modals + Command Palette
// ═══════════════════════════════════════════════════════════
'use strict';

const APP = {
  user: null,
  admin: null,
  csrf: null,
  currentPage: 'dashboard',
  notifications: [],
  unread: 0,
  charts: {},
  auditPage: 0,
  currentServerActions: null,
  currentUserSessions: null,
  allServers: [],
};

const TERMS_VERSION = 'v2.0';
const TERMS_KEY = 'frio_terms_v2';

const ROLES_LABEL = { dev: '👑 DEV', admin: '🛡️ ADMIN', funcionario: '🔧 FUNC', cliente: '👤 CLIENTE', pending: '⏳' };
const PLANS_LABEL = { basic: '🥉 Basic', premium: '🥈 Premium', ultra: '🥇 Ultra', unlimited: '💎 Unlimited', none: '—' };

// ═══ HELPERS ═══
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtDate(iso) { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleString('pt-BR'); }
function fmtDateShort(iso) { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR'); }
function timeAgo(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.max(1, Math.floor(diff))}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return fmtDateShort(iso);
}
function fmtBRL(v) { return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function fmtNumber(v) { return Number(v || 0).toLocaleString('pt-BR'); }

// ═══ TOAST ═══
let _toastT = null;
function toast(msg, type = 'ok') {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} active`;
  clearTimeout(_toastT);
  _toastT = setTimeout(() => t.classList.remove('active'), 3200);
}

// ═══ MSG inline ═══
function setMsg(id, text, type = 'error') {
  const el = $(id);
  if (!el) return;
  if (!text) { el.style.display = 'none'; el.textContent = ''; return; }
  el.textContent = text;
  el.className = `msg ${type}`;
  el.style.display = 'block';
}
function clearMsg(...ids) { ids.forEach(id => setMsg(id, '')); }

// ═══ MODAL ═══
function openModal(id) {
  const m = $(id);
  if (!m) return;
  m.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  const m = $(id);
  if (!m) return;
  m.classList.remove('active');
  if (!document.querySelector('.modal.active')) document.body.style.overflow = '';
}
window.openModal = openModal;
window.closeModal = closeModal;
window.togglePass = (id, btn) => {
  const el = $(id);
  if (!el) return;
  const p = el.type === 'password';
  el.type = p ? 'text' : 'password';
  btn.textContent = p ? '🙈' : '👁️';
};

// ═══ API ═══
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (APP.csrf && ['POST', 'PATCH', 'PUT', 'DELETE'].includes((opts.method || 'GET').toUpperCase())) {
    headers['x-csrf-token'] = APP.csrf;
  }
  try {
    const res = await fetch(path, { credentials: 'include', ...opts, headers });
    let data;
    try { data = await res.json(); } catch { data = { ok: false, error: 'Resposta inválida' }; }
    if (!res.ok && data && data.ok === undefined) data.ok = false;
    return data;
  } catch (e) {
    return { ok: false, error: 'Erro de conexão' };
  }
}

// ═══════════════════════════════════════════════════════════
// TERMOS
// ═══════════════════════════════════════════════════════════
function termsAccepted() {
  try {
    const d = JSON.parse(localStorage.getItem(TERMS_KEY) || 'null');
    return d && d.v === TERMS_VERSION;
  } catch { return false; }
}
function saveTerms() {
  try { localStorage.setItem(TERMS_KEY, JSON.stringify({ v: TERMS_VERSION, at: Date.now() })); } catch {}
}

function showAuthView(id) {
  ['view-terms', 'view-login', 'view-register', 'view-reset'].forEach(x => {
    const el = $(x);
    if (el) el.classList.toggle('active', x === id);
  });
  $('view-app')?.classList.remove('active');
}
function showAppView() {
  ['view-terms', 'view-login', 'view-register', 'view-reset'].forEach(x => $(x)?.classList.remove('active'));
  $('view-app')?.classList.add('active');
}

// Tabs dos termos
$$('[data-terms-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    const t = btn.dataset.termsTab;
    $$('[data-terms-tab]').forEach(b => b.classList.toggle('active', b === btn));
    $$('[data-terms-tab-body]').forEach(c => c.classList.toggle('active', c.dataset.termsTabBody === t));
    $('termsScroll')?.scrollTo({ top: 0 });
  });
});

// Checkbox libera botão
$('termsCheck')?.addEventListener('change', (e) => {
  const b = $('btnTermsAccept');
  if (b) b.disabled = !e.target.checked;
});

// Aceitar
$('btnTermsAccept')?.addEventListener('click', () => {
  saveTerms();
  bootstrapAfterTerms();
});

// Recusar
$('btnTermsReject')?.addEventListener('click', () => {
  $('modalTermsReject')?.classList.add('active');
});

$('btnTermsConfirmLeave')?.addEventListener('click', () => {
  try { window.location.href = 'about:blank'; } catch {}
  setTimeout(() => { window.close(); window.location.href = 'https://google.com'; }, 100);
});

// ═══════════════════════════════════════════════════════════
// AUTH — LOGIN
// ═══════════════════════════════════════════════════════════
$('btnShowRegister')?.addEventListener('click', () => showAuthView('view-register'));
$('linkBackLogin')?.addEventListener('click', (e) => { e.preventDefault(); showAuthView('view-login'); });
$('linkForgot')?.addEventListener('click', (e) => {
  e.preventDefault();
  $('forgotEmail').value = $('loginEmail').value || '';
  openModal('modalForgot');
});

$('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMsg('loginMsg');
  const btn = $('btnLogin');
  const label = btn.querySelector('span');
  const orig = label.textContent;
  btn.disabled = true; label.textContent = '⏳ Entrando...';

  const r = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: $('loginEmail').value.trim(),
      password: $('loginPassword').value,
    }),
  });

  if (!r.ok) {
    let msg = r.error || 'Erro ao entrar.';
    if (r.code === 'EMAIL_NOT_CONFIRMED') msg = '⚠️ Confirme seu e-mail antes de entrar.';
    if (r.code === 'PENDING') msg = '⏳ Aguarde aprovação do DEV.';
    setMsg('loginMsg', msg, 'error');
    btn.disabled = false; label.textContent = orig;
    return;
  }

  APP.user = r.user;
  APP.admin = r.admin;
  APP.csrf = r.csrf;
  await bootApp();
});

// ═══════════════════════════════════════════════════════════
// AUTH — REGISTER
// ═══════════════════════════════════════════════════════════
$('registerForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMsg('registerMsg');

  const p1 = $('regPassword').value;
  const p2 = $('regConfirm').value;
  const discord = ($('regDiscord').value || '').trim();

  if (!discord) return setMsg('registerMsg', '⚠️ ID do Discord é obrigatório.');
  if (!/^\d{15,25}$/.test(discord)) return setMsg('registerMsg', '⚠️ Discord ID inválido (15-25 dígitos).');
  if (p1 !== p2) return setMsg('registerMsg', '⚠️ As senhas não coincidem.');
  if (p1.length < 8) return setMsg('registerMsg', '⚠️ Senha deve ter 8+ caracteres.');

  const btn = $('btnRegister');
  const label = btn.querySelector('span');
  const orig = label.textContent;
  btn.disabled = true; label.textContent = '⏳ Criando...';

  const r = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: $('regEmail').value.trim(),
      password: p1,
      discord_id: discord,
      username: $('regUsername').value.trim() || undefined,
    }),
  });

  if (!r.ok) {
    setMsg('registerMsg', r.error || 'Erro ao criar conta.', 'error');
    btn.disabled = false; label.textContent = orig;
    return;
  }

  setMsg('registerMsg', '✅ Conta criada! Verifique seu e-mail para confirmar.', 'ok');
  toast('Verifique seu e-mail');
  e.target.reset();
  setTimeout(() => showAuthView('view-login'), 2500);
});

// ═══════════════════════════════════════════════════════════
// AUTH — FORGOT
// ═══════════════════════════════════════════════════════════
$('btnSendForgot')?.addEventListener('click', async () => {
  const email = $('forgotEmail').value.trim();
  if (!email) return toast('Informe o e-mail', 'error');
  const r = await api('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) });
  toast(r.message || 'Se existir, enviaremos instruções', 'ok');
  closeModal('modalForgot');
});

// ═══════════════════════════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════════════════════════
$('btnLogout')?.addEventListener('click', async () => {
  if (!confirm('Sair da conta?')) return;
  try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
  location.reload();
});

// ═══════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════
async function bootstrapAfterTerms() {
  try {
    const r = await api('/api/auth/me');
    if (r.ok && r.admin) {
      APP.user = r.user;
      APP.admin = r.admin;
      APP.csrf = document.cookie.match(/frio_csrf=([^;]+)/)?.[1] || null;
      await bootApp();
      return;
    }
  } catch {}
  showAuthView('view-login');
}

async function bootApp() {
  showAppView();

  $('userEmail').textContent = APP.user.email;
  $('userRole').textContent = ROLES_LABEL[APP.admin.role] || APP.admin.role;
  $('userPlan').textContent = PLANS_LABEL[APP.admin.plan] || APP.admin.plan || '—';

  document.body.dataset.role = APP.admin.role;
  document.body.dataset.plan = APP.admin.plan || 'none';

  $$('[data-roles]').forEach(el => {
    const roles = el.dataset.roles.split(',').map(s => s.trim());
    if (!roles.includes(APP.admin.role)) el.style.display = 'none';
  });

  bindNav();
  bindCmdk();
  bindNotifications();

  await navigate('dashboard');

  loadNotifications();
  setInterval(loadNotifications, 30000);
}

// ═══════════════════════════════════════════════════════════
// NAV
// ═══════════════════════════════════════════════════════════
function bindNav() {
  $$('aside.sidebar nav a[data-nav]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(a.dataset.nav);
    });
  });

  $('btnHamburger')?.addEventListener('click', () => {
    $('sidebar').classList.add('open');
    $('sidebarOverlay').classList.add('active');
  });
  $('sidebarOverlay')?.addEventListener('click', () => {
    $('sidebar').classList.remove('open');
    $('sidebarOverlay').classList.remove('active');
  });
  $('userChip')?.addEventListener('click', () => navigate('sessions'));
}

async function navigate(page) {
  APP.currentPage = page;

  $$('section.page').forEach(s => s.classList.remove('active'));
  $(`page-${page}`)?.classList.add('active');

  $$('aside.sidebar nav a[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === page));

  $('sidebar').classList.remove('open');
  $('sidebarOverlay').classList.remove('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });

  try {
    switch (page) {
      case 'dashboard': await loadDashboard(); break;
      case 'keys': await loadKeys(); break;
      case 'packs': await loadPacks(); break;
      case 'servers': await loadServers(); break;
      case 'my-keys': await loadMyKeys(); break;
      case 'sessions': await loadSessions(); break;
      case 'notifications': await loadNotifPage(); break;
      case 'tickets-global': await loadTicketsGlobal(); break;
      case 'financial': await loadFinancial(); break;
      case 'dev-servers': await loadDevServers(); break;
      case 'kill-switch': await loadKillSwitch(); break;
      case 'maintenance': await loadMaintenance(); break;
      case 'force-premium': await loadForcePremium(); break;
      case 'usuarios': await loadUsuarios(); break;
      case 'pending': await loadPending(); break;
      case 'audit': await loadAudit(); break;
    }
  } catch (e) { console.error('[navigate]', page, e); }
}
window.navigate = navigate;

// ═══════════════════════════════════════════════════════════
// DASHBOARD — v2 completo
// ═══════════════════════════════════════════════════════════
async function loadDashboard() {
  loadDashStats();
  loadBotStatus();

  if (['dev', 'admin', 'funcionario'].includes(APP.admin.role)) {
    loadQuickStats();
    loadDashCharts();
    loadRecentActivity();
    loadKeysExpiring();
  }

  renderQuickActions();

  $('btnRefreshDashboard')?.addEventListener('click', () => {
    toast('Atualizando...', 'ok');
    loadDashboard();
  }, { once: true });
}

async function loadDashStats() {
  const wrap = $('dashStats');
  if (!wrap) return;
  wrap.innerHTML = '<div class="card">⏳ Carregando...</div>';

  const r = await api('/api/dashboard/stats');
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌ ${escapeHtml(r.error)}</div>`; return; }
  const s = r.stats || {};
  const isStaff = ['dev', 'admin', 'funcionario'].includes(APP.admin.role);

  const cards = isStaff ? [
    { i: '🌐', l: 'Servidores', v: fmtNumber(s.guilds), c: 'blue', nav: 'dev-servers' },
    { i: '👥', l: 'Usuários', v: fmtNumber(s.users), c: 'green', nav: 'usuarios' },
    { i: '🔑', l: 'Keys ativas', v: fmtNumber(s.active_keys), c: 'amber', nav: 'keys' },
    { i: '🎁', l: 'Resgates', v: fmtNumber(s.redemptions), c: 'blue', nav: 'keys' },
    { i: '⏳', l: 'Pendentes', v: fmtNumber(s.pending), c: 'red', nav: 'pending' },
    { i: '👥', l: 'Membros totais', v: fmtNumber(s.total_members), c: 'green', nav: 'dev-servers' },
  ] : [
    { i: '🌐', l: 'Meus servidores', v: fmtNumber(s.servers), c: 'blue', nav: 'servers' },
    { i: '🔑', l: 'Minhas keys', v: fmtNumber(s.keys), c: 'amber', nav: 'my-keys' },
    { i: '🔔', l: 'Não lidas', v: fmtNumber(s.notifs), c: 'red', nav: 'notifications' },
  ];

  wrap.innerHTML = cards.map(c => `
    <div class="stat-card" data-nav="${c.nav}" style="cursor:pointer">
      <div class="stat-icon ${c.c}">${c.i}</div>
      <div class="stat-body">
        <div class="stat-value">${escapeHtml(c.v)}</div>
        <div class="stat-label">${escapeHtml(c.l)}</div>
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.nav));
  });
}

async function loadBotStatus() {
  const dot = $('botStatusDot');
  const lbl = $('botStatusLabel');
  const ping = $('botStatusPing');
  const uptime = $('botStatusUptime');
  const guilds = $('botStatusGuilds');
  const warnBox = $('statusWarnings');
  if (!dot) return;

  const r = await api('/api/dashboard/bot-status');
  if (!r.ok) {
    dot.textContent = '⚪';
    lbl.textContent = 'Status indisponível';
    return;
  }

  const { bot, kill_switch, maintenance } = r;

  if (bot?.offline || !bot?.ok) {
    dot.textContent = '🔴';
    lbl.textContent = 'Bot offline';
    ping.textContent = '--ms';
    uptime.textContent = '--';
    guilds.textContent = '-- guilds';
  } else {
    dot.textContent = '🟢';
    lbl.textContent = `Bot online (${bot.version || 'v?'})`;
    ping.textContent = `${bot.ping || 0}ms`;
    uptime.textContent = bot.uptimeHuman || bot.uptimeHuman || '--';
    guilds.textContent = `${bot.guilds || 0} guilds`;
  }

  const warnings = [];
  if (kill_switch?.active) warnings.push(`🚨 Kill switch ATIVO — ${escapeHtml(kill_switch.reason || 'sem motivo')}`);
  if (maintenance?.active) warnings.push(`🔧 Manutenção ATIVA — ${escapeHtml(maintenance.reason || 'sem motivo')}`);

  if (warnings.length) {
    warnBox.innerHTML = warnings.map(w => `<div class="warn-item">${w}</div>`).join('');
    warnBox.classList.remove('hidden');
  } else {
    warnBox.classList.add('hidden');
  }
}

async function loadQuickStats() {
  const wrap = $('dashQuickStats');
  if (!wrap) return;
  if (!['dev', 'admin', 'funcionario'].includes(APP.admin.role)) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'grid';

  const r = await api('/api/dashboard/quick-stats');
  if (!r.ok) { wrap.innerHTML = ''; return; }
  const q = r.quick || {};

  wrap.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon green">📥</div>
      <div class="stat-body">
        <div class="stat-value">${fmtNumber(q.logins_24h)}</div>
        <div class="stat-label">Logins 24h</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon red">🚫</div>
      <div class="stat-body">
        <div class="stat-value">${fmtNumber(q.logins_failed_24h)}</div>
        <div class="stat-label">Falhas 24h</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon amber">🔑</div>
      <div class="stat-body">
        <div class="stat-value">${fmtNumber(q.keys_generated_24h)}</div>
        <div class="stat-label">Keys geradas 24h</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon blue">🎁</div>
      <div class="stat-body">
        <div class="stat-value">${fmtNumber(q.redemptions_7d)}</div>
        <div class="stat-label">Resgates 7d</div>
      </div>
    </div>
  `;
}

async function loadDashCharts() {
  const wrap = $('dashCharts');
  if (!wrap) return;

  const rc = await api('/api/dashboard/charts');
  if (!rc.ok) { wrap.innerHTML = ''; return; }

  const charts = rc.charts || {};
  wrap.innerHTML = `
    <div class="chart-card"><h4>📈 Keys por dia (30d)</h4><canvas id="chartKeysByDay"></canvas></div>
    <div class="chart-card"><h4>🍩 Keys por tier</h4><canvas id="chartKeysTier"></canvas></div>
    <div class="chart-card"><h4>👥 Usuários por role</h4><canvas id="chartUsersRole"></canvas></div>
    <div class="chart-card"><h4>📊 Planos ativos</h4><canvas id="chartUsersPlan"></canvas></div>
    <div class="chart-card" style="grid-column:1/-1"><h4>🏆 Top 10 servidores</h4><canvas id="chartTopServers"></canvas></div>
  `;

  const destroy = (id) => { if (APP.charts[id]) { APP.charts[id].destroy(); delete APP.charts[id]; } };

  try {
    if (charts.keys_by_day?.length) {
      destroy('chartKeysByDay');
      APP.charts.chartKeysByDay = new Chart($('chartKeysByDay'), {
        type: 'line',
        data: {
          labels: charts.keys_by_day.map(d => d.date),
          datasets: [{
            label: 'Keys', data: charts.keys_by_day.map(d => d.count),
            borderColor: '#5865F2', backgroundColor: 'rgba(88,101,242,.15)',
            fill: true, tension: .35, pointRadius: 3,
          }],
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: '#9ca3af' } }, x: { ticks: { color: '#9ca3af' } } } },
      });
    }
    if (charts.keys_by_tier) {
      destroy('chartKeysTier');
      APP.charts.chartKeysTier = new Chart($('chartKeysTier'), {
        type: 'doughnut',
        data: {
          labels: ['Basic','Premium','Ultra','Unlimited'],
          datasets: [{
            data: [charts.keys_by_tier.basic, charts.keys_by_tier.premium, charts.keys_by_tier.ultra, charts.keys_by_tier.unlimited],
            backgroundColor: ['#CD7F32','#C0C0C0','#FFD700','#8B5CF6'],
          }],
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } } } },
      });
    }
    if (charts.users_by_role) {
      destroy('chartUsersRole');
      APP.charts.chartUsersRole = new Chart($('chartUsersRole'), {
        type: 'doughnut',
        data: {
          labels: ['DEV','Admin','Func','Cliente','Pending'],
          datasets: [{
            data: [charts.users_by_role.dev, charts.users_by_role.admin, charts.users_by_role.funcionario, charts.users_by_role.cliente, charts.users_by_role.pending],
            backgroundColor: ['#FFD700','#ED4245','#9B59B6','#57F287','#808080'],
          }],
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } } } },
      });
    }
    if (charts.users_by_plan) {
      destroy('chartUsersPlan');
      APP.charts.chartUsersPlan = new Chart($('chartUsersPlan'), {
        type: 'bar',
        data: {
          labels: ['Basic','Premium','Ultra','Unlimited','Nenhum'],
          datasets: [{
            data: [charts.users_by_plan.basic, charts.users_by_plan.premium, charts.users_by_plan.ultra, charts.users_by_plan.unlimited, charts.users_by_plan.none],
            backgroundColor: ['#CD7F32','#C0C0C0','#FFD700','#8B5CF6','#6b7280'],
          }],
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: '#9ca3af' } }, x: { ticks: { color: '#9ca3af' } } } },
      });
    }
    if (charts.top_servers?.length) {
      destroy('chartTopServers');
      APP.charts.chartTopServers = new Chart($('chartTopServers'), {
        type: 'bar',
        data: {
          labels: charts.top_servers.map(s => s.name),
          datasets: [{ label: 'Membros', data: charts.top_servers.map(s => s.member_count), backgroundColor: 'rgba(88,101,242,.7)' }],
        },
        options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { color: '#9ca3af' } }, y: { ticks: { color: '#9ca3af' } } } },
      });
    }
  } catch (e) { console.error('[charts]', e); }
}

async function loadRecentActivity() {
  const wrap = $('recentActivity');
  if (!wrap) return;

  const r = await api('/api/dashboard/recent-activity');
  if (!r.ok) { wrap.innerHTML = '<div class="empty-small">Erro ao carregar</div>'; return; }

  const list = r.activity || [];
  if (!list.length) {
    wrap.innerHTML = '<div class="empty-small">Nenhuma atividade</div>';
    return;
  }

  const iconMap = {
    login: '🟢', login_failed: '🔴', logout: '⚪',
    register_pending: '✨', password_reset: '🔑',
    generate_keys: '🔑', send_key: '📤', delete_key: '🗑️',
    nuke_guild: '💥', force_leave_guild: '🚪', force_rename_guild: '✏️',
    kill_switch_on: '🚨', kill_switch_off: '✅',
    maintenance_on: '🔧', maintenance_off: '✅',
    force_premium_add: '💎', force_premium_remove: '🗑️',
    broadcast_global: '📢', approve_user: '✅', update_user: '✏️',
    access_denied: '🚫', take_members: '🚀', refresh_guild: '🔄',
  };

  wrap.innerHTML = list.map(a => {
    const icon = iconMap[a.action] || '📋';
    const time = timeAgo(a.created_at);
    const actor = a.actor_email || a.actor_id || 'system';
    const isFail = a.success === false;
    return `
      <div class="activity-item ${isFail ? 'fail' : ''}">
        <div class="activity-icon">${icon}</div>
        <div class="activity-info">
          <div class="activity-title">
            <span class="activity-action">${escapeHtml(a.action)}</span>
          </div>
          <div class="activity-meta">
            <span>👤 ${escapeHtml(actor)}</span>
            ${a.ip ? `<span>🌐 ${escapeHtml(a.ip)}</span>` : ''}
            ${a.browser ? `<span>🖥️ ${escapeHtml(a.browser)}</span>` : ''}
          </div>
        </div>
        <div class="activity-time">${time}</div>
      </div>
    `;
  }).join('');
}

async function loadKeysExpiring() {
  const wrap = $('keysExpiring');
  if (!wrap) return;

  const r = await api('/api/dashboard/keys-expiring');
  if (!r.ok) { wrap.innerHTML = '<div class="empty-small">Erro ao carregar</div>'; return; }

  const keys = r.keys || [];
  if (!keys.length) {
    wrap.innerHTML = '<div class="empty-small">✅ Nenhuma key expirando em 7 dias</div>';
    return;
  }

  wrap.innerHTML = keys.map(k => {
    const dias = Math.ceil((new Date(k.expira_em) - Date.now()) / 86400000);
    const urg = dias <= 2 ? 'urgent' : dias <= 4 ? 'warning' : '';
    return `
      <div class="key-item ${urg}">
        <div class="key-info">
          <code>${escapeHtml(k.key_code)}</code>
          <span class="tag tag-info">${PLANS_LABEL[k.tier] || k.tier}</span>
          ${k.sent_to ? `<span class="tag tag-ok">Enviada</span>` : ''}
        </div>
        <div class="key-time">
          ${dias === 0 ? '⚠️ Hoje' : dias === 1 ? '⚠️ Amanhã' : `${dias} dias`}
        </div>
      </div>
    `;
  }).join('');
}

function renderQuickActions() {
  const wrap = $('quickActions');
  if (!wrap) return;
  const role = APP.admin.role;

  const actions = [
    { label: 'Gerar Key', icon: '🔑', nav: 'keys', roles: ['dev','admin','funcionario'] },
    { label: 'Novo Usuário', icon: '👥', nav: 'usuarios', roles: ['dev'], action: 'novoUser' },
    { label: 'Aprovações', icon: '⏳', nav: 'pending', roles: ['dev'] },
    { label: 'Gerenciar Servidores', icon: '🛰️', nav: 'dev-servers', roles: ['dev'] },
    { label: 'Kill Switch', icon: '🚨', nav: 'kill-switch', roles: ['dev'] },
    { label: 'Broadcast', icon: '📢', nav: 'broadcast', roles: ['dev'] },
    { label: 'Auditoria', icon: '📋', nav: 'audit', roles: ['dev'] },
    { label: 'Meus Servidores', icon: '🌐', nav: 'servers', roles: ['dev','admin','funcionario','cliente'] },
    { label: 'Minhas Keys', icon: '🎁', nav: 'my-keys', roles: ['dev','admin','funcionario','cliente'] },
    { label: 'Sessões', icon: '🖥️', nav: 'sessions', roles: ['dev','admin','funcionario','cliente'] },
    { label: 'Notificações', icon: '🔔', nav: 'notifications', roles: ['dev','admin','funcionario','cliente'] },
    { label: 'Financeiro', icon: '💰', nav: 'financial', roles: ['dev','admin'] },
  ].filter(a => a.roles.includes(role));

  wrap.innerHTML = actions.map(a => `
    <button class="quick-action" data-nav="${a.nav}" data-action="${a.action || ''}">
      <span class="qa-icon">${a.icon}</span>
      <span class="qa-label">${a.label}</span>
    </button>
  `).join('');

  wrap.querySelectorAll('.quick-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const nav = btn.dataset.nav;
      const action = btn.dataset.action;
      navigate(nav);
      if (action === 'novoUser') {
        setTimeout(() => $('btnNovoUsuario')?.click(), 400);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════
// KEYS
// ═══════════════════════════════════════════════════════════
async function loadKeys() {
  await loadKeysTable();
  await loadRedemptions();
}

$('genForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMsg('genResult');
  const r = await api('/api/keys/generate', {
    method: 'POST',
    body: JSON.stringify({
      tier: $('genTier').value,
      duracao_dias: Number($('genDuracao').value),
      quantidade: Number($('genQtd').value),
      max_usos: Number($('genMaxUsos').value),
      validade_key_dias: Number($('genValidade').value),
      motivo: $('genMotivo').value.trim() || null,
    }),
  });
  if (!r.ok) return setMsg('genResult', r.error, 'error');
  setMsg('genResult', `✅ ${r.keys.length} keys geradas!`, 'ok');
  toast(`${r.keys.length} keys geradas`);
  loadKeysTable();
});

$('btnRefreshKeys')?.addEventListener('click', loadKeysTable);
$('filterStatus')?.addEventListener('change', loadKeysTable);
$('filterTier')?.addEventListener('change', loadKeysTable);

async function loadKeysTable() {
  const wrap = $('keysTable');
  wrap.innerHTML = '<div class="card">⏳ Carregando...</div>';

  const params = new URLSearchParams();
  if ($('filterStatus').value) params.set('status', $('filterStatus').value);
  if ($('filterTier').value) params.set('tier', $('filterTier').value);

  const r = await api('/api/keys?' + params);
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌ ${escapeHtml(r.error)}</div>`; return; }
  const keys = r.keys || [];
  if (!keys.length) { wrap.innerHTML = '<div class="empty"><div class="empty-i">🔑</div><p>Nenhuma key</p></div>'; return; }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Key</th><th>Tier</th><th>Duração</th><th>Usos</th><th>Status</th><th>Criada</th><th></th></tr></thead>
        <tbody>
          ${keys.map(k => `
            <tr>
              <td><code>${escapeHtml(k.key_code)}</code></td>
              <td>${PLANS_LABEL[k.tier] || k.tier}</td>
              <td>${k.duracao_dias === 0 ? '♾️' : k.duracao_dias + 'd'}</td>
              <td>${k.usos_atuais}/${k.max_usos}</td>
              <td>${k.ativo ? '<span class="tag tag-ok">ATIVA</span>' : '<span class="tag tag-bad">ESGOTADA</span>'}</td>
              <td class="text-mut">${timeAgo(k.created_at)}</td>
              <td>${APP.admin.role === 'dev' ? `<button class="btn btn-danger btn-xs" data-del-key="${k.id}">🗑️</button>` : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-del-key]').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('Excluir esta key?')) return;
      const r = await api(`/api/keys/${b.dataset.delKey}`, { method: 'DELETE' });
      if (r.ok) { toast('Excluída'); loadKeysTable(); }
      else toast(r.error, 'error');
    });
  });
}

async function loadRedemptions() {
  const wrap = $('redemptionsTable');
  const r = await api('/api/redemptions?limit=30');
  if (!r.ok) { wrap.innerHTML = ''; return; }
  const list = r.redemptions || [];
  if (!list.length) { wrap.innerHTML = '<div class="empty"><div class="empty-i">🎁</div><p>Nenhum resgate</p></div>'; return; }
  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Key</th><th>Servidor</th><th>Por</th><th>Tier</th><th>Quando</th></tr></thead>
        <tbody>
          ${list.map(x => `
            <tr>
              <td><code>${escapeHtml(x.key_code)}</code></td>
              <td>${escapeHtml(x.guild_name || x.guild_id || '—')}</td>
              <td>${escapeHtml(x.resgatado_por_tag || x.resgatado_por || '—')}</td>
              <td>${PLANS_LABEL[x.tier] || x.tier}</td>
              <td class="text-mut">${timeAgo(x.created_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

$('btnEnviarKey')?.addEventListener('click', openSendKeyModal);

async function openSendKeyModal() {
  const [kR, uR] = await Promise.all([api('/api/keys?status=active&limit=200'), api('/api/dev/usuarios/clientes')]);
  const keys = kR.keys || [];
  const users = uR.clientes || [];
  if (!keys.length) return toast('Nenhuma key ativa', 'error');
  if (!users.length) return toast('Nenhum cliente', 'error');
  $('sendKeyId').innerHTML = keys.map(k => `<option value="${k.id}">${escapeHtml(k.key_code)} — ${k.tier}</option>`).join('');
  $('sendKeyUser').innerHTML = users.map(u => `<option value="${u.user_id}">${escapeHtml(u.email)} (${escapeHtml(u.nome || '?')})</option>`).join('');
  clearMsg('sendKeyMsg');
  openModal('modalSendKey');
}

$('btnConfirmSendKey')?.addEventListener('click', async () => {
  const key_id = $('sendKeyId').value;
  const user_id = $('sendKeyUser').value;
  if (!key_id || !user_id) return;
  const r = await api('/api/keys/send', { method: 'POST', body: JSON.stringify({ key_id, user_id }) });
  if (!r.ok) return setMsg('sendKeyMsg', r.error, 'error');
  setMsg('sendKeyMsg', `✅ Enviada para ${r.sent_to}`, 'ok');
  toast('Key enviada');
  setTimeout(() => closeModal('modalSendKey'), 1500);
});

// ═══════════════════════════════════════════════════════════
// PACKS
// ═══════════════════════════════════════════════════════════
async function loadPacks() { await loadPacksTable(); }

$('btnGerarPack')?.addEventListener('click', async () => {
  clearMsg('packResult');
  const r = await api('/api/keys/generate-pack', {
    method: 'POST',
    body: JSON.stringify({ quantidade: Number($('packQtd').value) || 1, motivo: $('packMotivo').value.trim() || null }),
  });
  if (!r.ok) return setMsg('packResult', r.error, 'error');
  setMsg('packResult', `✅ ${r.packs.length} pack(s) gerado(s)`, 'ok');
  toast('Packs gerados');
  loadPacksTable();
});

$('btnRefreshPacks')?.addEventListener('click', loadPacksTable);

async function loadPacksTable() {
  const wrap = $('packsTable');
  wrap.innerHTML = '';
  const r = await api('/api/keys/packs');
  if (!r.ok) return;
  const packs = r.packs || [];
  if (!packs.length) { wrap.innerHTML = '<div class="empty"><div class="empty-i">📦</div><p>Nenhum pack</p></div>'; return; }
  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Pack</th><th>Status</th><th>Motivo</th><th>Criado</th><th></th></tr></thead>
        <tbody>
          ${packs.map(p => `
            <tr>
              <td><code>${escapeHtml(p.key_code)}</code></td>
              <td>${p.ativo ? '<span class="tag tag-ok">DISPONÍVEL</span>' : '<span class="tag tag-bad">USADO</span>'}</td>
              <td>${escapeHtml(p.motivo || '—')}</td>
              <td class="text-mut">${timeAgo(p.created_at)}</td>
              <td>${p.ativo ? `<button class="btn btn-primary btn-xs" data-redeem="${p.id}">🎁 Resgatar</button>` : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  wrap.querySelectorAll('[data-redeem]').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('Resgatar este pack? Gera 60 keys.')) return;
      b.disabled = true;
      const r = await api('/api/keys/redeem-pack', { method: 'POST', body: JSON.stringify({ key_id: Number(b.dataset.redeem) }) });
      if (r.ok) { toast(`${r.total} keys geradas`); loadPacksTable(); }
      else { toast(r.error, 'error'); b.disabled = false; }
    });
  });
}

// ═══════════════════════════════════════════════════════════
// SERVIDORES
// ═══════════════════════════════════════════════════════════
async function loadServers() {
  const wrap = $('serversGrid');
  wrap.innerHTML = '<div class="card">⏳ Carregando...</div>';
  const r = await api('/api/me/servers');
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌ ${escapeHtml(r.error)}</div>`; return; }
  const servers = r.servers || [];
  APP.allServers = servers;

  if (!servers.length) {
    wrap.innerHTML = '<div class="empty"><div class="empty-i">🌐</div><p>Nenhum servidor vinculado</p><p class="hint">Só aparecem servidores onde você é dono ou admin.</p></div>';
    return;
  }
  wrap.innerHTML = servers.map(serverCardHTML).join('');
  bindServerClicks();
}

function serverCardHTML(s) {
  const icon = s.icon ? `<img src="${escapeHtml(s.icon)}" alt="">` : '🛰️';
  return `
    <div class="server-card" data-guild="${escapeHtml(s.guild_id)}">
      <div class="server-icon">${icon}</div>
      <div class="server-info">
        <div class="server-name">${escapeHtml(s.name || 'Sem nome')}</div>
        <div class="server-id">${escapeHtml(s.guild_id)}</div>
        <div class="server-meta">
          <span>👥 ${fmtNumber(s.member_count || 0)}</span>
          ${s.is_premium ? '<span class="tag tag-gold">💎</span>' : ''}
        </div>
      </div>
    </div>
  `;
}

function bindServerClicks() {
  $$('[data-guild]').forEach(el => {
    el.addEventListener('click', () => openServerDetail(el.dataset.guild));
  });
}

async function openServerDetail(gid) {
  const isDev = APP.admin.role === 'dev';
  let r = isDev ? await api(`/api/dev/servers/${gid}/full`) : null;
  if (!r || !r.ok) {
    r = await api(`/api/me/servers/${gid}/stats`);
    if (!r.ok) return toast(r.error || 'Erro', 'error');
  }
  const g = r.guild || {};
  const c = r.counts || {};
  const st = r.stats || {};

  $('serverDetail').innerHTML = `
    <h2>🛰️ ${escapeHtml(g.name || 'Servidor')}</h2>
    <p class="modal-sub">${escapeHtml(g.guild_id || gid)}</p>
    <div class="stats-grid" style="margin-top:16px">
      <div class="stat-card"><div class="stat-icon blue">👥</div><div class="stat-body"><div class="stat-value">${fmtNumber(g.member_count || st.members || 0)}</div><div class="stat-label">Membros</div></div></div>
      <div class="stat-card"><div class="stat-icon green">🎫</div><div class="stat-body"><div class="stat-value">${c.tickets_open || st.tickets_open || 0}</div><div class="stat-label">Tickets</div></div></div>
      <div class="stat-card"><div class="stat-icon amber">🎮</div><div class="stat-body"><div class="stat-value">${c.bets_total || st.bets_30d || 0}</div><div class="stat-label">Apostas</div></div></div>
    </div>
    ${r.force_premium ? `<p class="hint" style="margin-top:12px">💎 Force premium: <strong>${r.force_premium.permanent ? 'Permanente' : fmtDate(r.force_premium.expires_at)}</strong></p>` : ''}
    ${isDev ? `<div style="margin-top:20px"><button class="btn btn-primary" onclick="closeModal('modalServer');openDevServerActions('${gid}')">⚡ Ações DEV</button></div>` : ''}
  `;
  openModal('modalServer');
}

// ═══════════════════════════════════════════════════════════
// MINHAS KEYS
// ═══════════════════════════════════════════════════════════
async function loadMyKeys() {
  const wrap = $('myKeysList');
  wrap.innerHTML = '';
  const r = await api('/api/me/keys-sent');
  if (!r.ok) return;
  const keys = r.keys || [];
  if (!keys.length) { wrap.innerHTML = '<div class="empty"><div class="empty-i">🎁</div><p>Nenhuma key recebida</p></div>'; return; }
  wrap.innerHTML = keys.map(k => `
    <div class="list-item">
      <div class="list-icon">🔑</div>
      <div class="list-info">
        <div class="list-title"><code>${escapeHtml(k.key_code)}</code> ${k.is_pack ? '<span class="tag tag-info">PACK</span>' : ''} <span class="tag tag-ok">${PLANS_LABEL[k.tier] || k.tier}</span></div>
        <div class="list-sub">📅 ${fmtDate(k.sent_at)} • ${k.duracao_dias === 0 ? '♾️' : k.duracao_dias + ' dias'}</div>
      </div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════════
// SESSIONS
// ═══════════════════════════════════════════════════════════
async function loadSessions() {
  const wrap = $('sessionsList');
  wrap.innerHTML = '<div class="card">⏳</div>';
  const r = await api('/api/me/sessions');
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌</div>`; return; }
  const list = r.sessions || [];
  if (!list.length) { wrap.innerHTML = '<div class="empty"><div class="empty-i">🖥️</div><p>Nenhuma sessão ativa</p></div>'; return; }
  wrap.innerHTML = list.map(s => sessionCardHTML(s)).join('');
  wrap.querySelectorAll('[data-revoke]').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('Revogar esta sessão?')) return;
      const r = await api(`/api/me/sessions/${b.dataset.revoke}`, { method: 'DELETE' });
      if (r.ok) { toast('Revogada'); loadSessions(); }
      else toast(r.error, 'error');
    });
  });
}

$('btnRefreshSessions')?.addEventListener('click', loadSessions);
$('btnRevokeAllSessions')?.addEventListener('click', async () => {
  if (!confirm('Revogar todas as outras sessões?')) return;
  const r = await api('/api/me/sessions', { method: 'DELETE' });
  if (r.ok) { toast('Sessões revogadas'); loadSessions(); }
  else toast(r.error, 'error');
});

function sessionCardHTML(s) {
  const icon = s.device_type === 'mobile' ? '📱' : '🖥️';
  return `
    <div class="list-item">
      <div class="list-icon">${icon}</div>
      <div class="list-info">
        <div class="list-title">
          <span class="tag tag-info">${escapeHtml(s.device_type || '?')}</span>
          <span class="tag tag-ok">${escapeHtml(s.browser || '?')}</span>
          <span class="tag tag-gold">${escapeHtml(s.os || '?')}</span>
        </div>
        <div class="list-sub">
          🌐 <code>${escapeHtml(s.ip || '—')}</code>
          ${s.country ? ` • 📍 ${escapeHtml(s.country)}` : ''}
          • 🕐 ${timeAgo(s.last_seen || s.created_at)}
        </div>
      </div>
      <button class="btn btn-danger btn-sm" data-revoke="${s.id}">🚫</button>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
// NOTIFICAÇÕES
// ═══════════════════════════════════════════════════════════
function bindNotifications() {
  $('btnBell')?.addEventListener('click', () => {
    $('notifDrawer').classList.add('active');
    renderDrawer();
  });
  $('btnCloseDrawer')?.addEventListener('click', () => $('notifDrawer').classList.remove('active'));
  $('btnMarkAllReadDrawer')?.addEventListener('click', markAllRead);
  $('btnMarkAllRead')?.addEventListener('click', markAllRead);
}

async function loadNotifications() {
  try {
    const r = await api('/api/notifications?limit=30');
    if (!r.ok) return;
    APP.notifications = r.notifications || [];
    APP.unread = r.unread || 0;
    [$('bellBadge'), $('navNotifBadge')].forEach(b => {
      if (!b) return;
      if (APP.unread > 0) { b.textContent = APP.unread > 99 ? '99+' : APP.unread; b.classList.remove('hidden'); }
      else b.classList.add('hidden');
    });
  } catch {}
}

function renderDrawer() {
  const body = $('drawerBody');
  const list = APP.notifications || [];
  if (!list.length) { body.innerHTML = '<div class="empty"><div class="empty-i">🔕</div><p>Sem notificações</p></div>'; return; }
  body.innerHTML = list.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" data-nid="${n.id}">
      <div class="notif-title">${escapeHtml(n.title)}</div>
      <div class="notif-body">${escapeHtml(n.content || '')}</div>
      <div class="notif-time">${timeAgo(n.created_at)}</div>
    </div>
  `).join('');
  body.querySelectorAll('[data-nid]').forEach(el => {
    el.addEventListener('click', async () => {
      await api(`/api/notifications/${el.dataset.nid}/read`, { method: 'PATCH' });
      loadNotifications();
      renderDrawer();
    });
  });
}

async function loadNotifPage() {
  await loadNotifications();
  const wrap = $('notifList');
  const list = APP.notifications || [];
  if (!list.length) { wrap.innerHTML = '<div class="empty"><div class="empty-i">🔕</div><p>Sem notificações</p></div>'; return; }
  wrap.innerHTML = list.map(n => `
    <div class="list-item ${n.read ? '' : 'unread'}">
      <div class="list-icon">${n.type === 'key_received' ? '🔑' : n.type === 'alert' ? '⚠️' : '📢'}</div>
      <div class="list-info">
        <div class="list-title">${escapeHtml(n.title)}</div>
        <div class="list-sub">${escapeHtml(n.content || '')}</div>
        <div class="list-sub text-mut">🕐 ${timeAgo(n.created_at)}</div>
      </div>
    </div>
  `).join('');
}

async function markAllRead() {
  await api('/api/notifications/read-all', { method: 'POST' });
  loadNotifications();
  renderDrawer();
  if (APP.currentPage === 'notifications') loadNotifPage();
}

// ═══════════════════════════════════════════════════════════
// TICKETS GLOBAL
// ═══════════════════════════════════════════════════════════
async function loadTicketsGlobal() {
  const wrap = $('ticketsGlobalTable');
  wrap.innerHTML = '';
  const r = await api('/api/admin/tickets-global');
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌</div>`; return; }
  const list = r.tickets || [];
  if (!list.length) { wrap.innerHTML = '<div class="empty"><div class="empty-i">🎫</div><p>Nenhum ticket aberto</p></div>'; return; }
  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Thread</th><th>Servidor</th><th>User</th><th>Tipo</th><th>Aberto</th></tr></thead>
        <tbody>
          ${list.map(t => `
            <tr>
              <td><code>${escapeHtml(String(t.thread_id || '—').slice(0, 12))}</code></td>
              <td><code>${escapeHtml(t.guild_id)}</code></td>
              <td><code>${escapeHtml(t.user_id)}</code></td>
              <td>${escapeHtml(t.type_id || '—')}</td>
              <td class="text-mut">${timeAgo(t.opened_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
// FINANCIAL
// ═══════════════════════════════════════════════════════════
async function loadFinancial() {
  const wrap = $('financialStats');
  wrap.innerHTML = '<div class="card">⏳</div>';
  const r = await api('/api/admin/financial');
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌</div>`; return; }
  wrap.innerHTML = `
    <div class="stat-card"><div class="stat-icon green">💰</div><div class="stat-body"><div class="stat-value">${fmtBRL(r.total)}</div><div class="stat-label">Total 30d</div></div></div>
    <div class="stat-card"><div class="stat-icon blue">🧾</div><div class="stat-body"><div class="stat-value">${fmtNumber(r.count)}</div><div class="stat-label">Pedidos</div></div></div>
    <div class="stat-card"><div class="stat-icon amber">📊</div><div class="stat-body"><div class="stat-value">${fmtBRL(r.avg)}</div><div class="stat-label">Ticket médio</div></div></div>
  `;
  if (APP.charts.chartFinancial) APP.charts.chartFinancial.destroy();
  if (r.daily?.length) {
    APP.charts.chartFinancial = new Chart($('chartFinancial'), {
      type: 'line',
      data: {
        labels: r.daily.map(d => d.date),
        datasets: [{ label: 'R$', data: r.daily.map(d => d.value), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,.15)', fill: true, tension: .35 }],
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#9ca3af' } }, x: { ticks: { color: '#9ca3af' } } } },
    });
  }
}

// ═══════════════════════════════════════════════════════════
// DEV — SERVERS
// ═══════════════════════════════════════════════════════════
async function loadDevServers() {
  const wrap = $('devServersList');
  const stats = $('devServersStats');
  wrap.innerHTML = '<div class="card">⏳</div>';

  const params = new URLSearchParams();
  if ($('devServersSearch').value) params.set('search', $('devServersSearch').value);
  if ($('devServersMinMembers').value) params.set('min_members', $('devServersMinMembers').value);
  if ($('devServersPremium').value) params.set('has_premium', $('devServersPremium').value);

  const r = await api('/api/dev/servers?' + params);
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌</div>`; return; }
  const servers = r.servers || [];
  const prem = servers.filter(s => s.is_premium).length;

  stats.innerHTML = `
    <div class="stat-card"><div class="stat-icon blue">🌐</div><div class="stat-body"><div class="stat-value">${fmtNumber(r.total || servers.length)}</div><div class="stat-label">Servidores</div></div></div>
    <div class="stat-card"><div class="stat-icon green">💎</div><div class="stat-body"><div class="stat-value">${prem}</div><div class="stat-label">Premium</div></div></div>
    <div class="stat-card"><div class="stat-icon amber">👥</div><div class="stat-body"><div class="stat-value">${fmtNumber(servers.reduce((a,s)=>a+(s.member_count||0),0))}</div><div class="stat-label">Membros totais</div></div></div>
  `;

  if (!servers.length) { wrap.innerHTML = '<div class="empty"><div class="empty-i">🛰️</div><p>Nenhum</p></div>'; return; }
  wrap.innerHTML = servers.map(s => `
    <div class="server-card" data-dev-guild="${escapeHtml(s.guild_id)}">
      <div class="server-icon">${s.icon ? `<img src="${escapeHtml(s.icon)}" alt="">` : '🛰️'}</div>
      <div class="server-info">
        <div class="server-name">${escapeHtml(s.name || '?')}</div>
        <div class="server-id">${escapeHtml(s.guild_id)}</div>
        <div class="server-meta">
          <span>👥 ${fmtNumber(s.member_count || 0)}</span>
          ${s.is_premium ? '<span class="tag tag-gold">💎</span>' : ''}
        </div>
      </div>
      <button class="btn btn-primary btn-sm" data-actions="${escapeHtml(s.guild_id)}">⚡</button>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-dev-guild]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-actions]')) return;
      openServerDetail(el.dataset.devGuild);
    });
  });
  wrap.querySelectorAll('[data-actions]').forEach(b => {
    b.addEventListener('click', (e) => { e.stopPropagation(); openDevServerActions(b.dataset.actions); });
  });
}

$('btnRefreshDevServers')?.addEventListener('click', loadDevServers);
$('devServersSearch')?.addEventListener('input', debounce(loadDevServers, 500));
$('devServersMinMembers')?.addEventListener('input', debounce(loadDevServers, 500));
$('devServersPremium')?.addEventListener('change', loadDevServers);
$('btnForceSyncAll')?.addEventListener('click', async () => {
  const r = await api('/api/dev/sync-servers', { method: 'POST' });
  if (r.ok) toast(r.message); else toast(r.error, 'error');
});

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ═══════════════════════════════════════════════════════════
// DEV — SEARCH
// ═══════════════════════════════════════════════════════════
$('btnDevServerLookup')?.addEventListener('click', async () => {
  const gid = $('devServerLookupId').value.trim();
  if (!/^\d{15,25}$/.test(gid)) return toast('ID inválido', 'error');
  const wrap = $('devServerLookupResult');
  wrap.innerHTML = '<div class="card">⏳</div>';
  const r = await api(`/api/dev/servers/${gid}/full`);
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌ ${escapeHtml(r.error)}</div>`; return; }
  const g = r.guild || {};
  const c = r.counts || {};
  wrap.innerHTML = `
    <div class="card">
      <h3>🛰️ ${escapeHtml(g.name || '?')}</h3>
      <p class="hint">${escapeHtml(g.guild_id || gid)}</p>
      <div class="stats-grid" style="margin-top:14px">
        <div class="stat-card"><div class="stat-icon blue">👥</div><div class="stat-body"><div class="stat-value">${fmtNumber(g.member_count || 0)}</div><div class="stat-label">Membros</div></div></div>
        <div class="stat-card"><div class="stat-icon green">🎫</div><div class="stat-body"><div class="stat-value">${c.tickets_open || 0}</div><div class="stat-label">Tickets</div></div></div>
        <div class="stat-card"><div class="stat-icon amber">🎮</div><div class="stat-body"><div class="stat-value">${c.bets_total || 0}</div><div class="stat-label">Apostas</div></div></div>
      </div>
      <div class="btn-row" style="margin-top:16px">
        <button class="btn btn-primary" onclick="openDevServerActions('${gid}')">⚡ Ações</button>
      </div>
    </div>
  `;
});

// ═══════════════════════════════════════════════════════════
// DEV — ACTIONS
// ═══════════════════════════════════════════════════════════
function openDevServerActions(gid) {
  APP.currentServerActions = gid;
  $('devServerActionsId').textContent = gid;
  clearMsg('devServerActionsMsg');
  openModal('modalDevServerActions');
}
window.openDevServerActions = openDevServerActions;

$('actRename')?.addEventListener('click', async () => {
  const name = prompt('Novo nome (máx 100):');
  if (!name) return;
  const r = await api(`/api/dev/servers/${APP.currentServerActions}/rename`, { method: 'POST', body: JSON.stringify({ name }) });
  setMsg('devServerActionsMsg', r.ok ? '✅ Renomeado' : r.error, r.ok ? 'ok' : 'error');
});

$('actRefresh')?.addEventListener('click', async () => {
  const r = await api(`/api/dev/servers/${APP.currentServerActions}/refresh`, { method: 'POST' });
  setMsg('devServerActionsMsg', r.ok ? '✅ Atualizado' : r.error, r.ok ? 'ok' : 'error');
});

$('actForcePremium')?.addEventListener('click', async () => {
  const days = Number(prompt('Dias (0 = permanente):', '30'));
  const r = await api('/api/dev/force-premium', {
    method: 'POST',
    body: JSON.stringify({ scope: 'guild', target_id: APP.currentServerActions, days, reason: 'DEV painel' }),
  });
  setMsg('devServerActionsMsg', r.ok ? '✅ Premium aplicado' : r.error, r.ok ? 'ok' : 'error');
});

$('actSyncMembers')?.addEventListener('click', async () => {
  if (!confirm('Levar membros via OAuth?')) return;
  const r = await api(`/api/me/servers/${APP.currentServerActions}/take-members`, { method: 'POST', body: JSON.stringify({ limit: 50 }) });
  setMsg('devServerActionsMsg', r.ok ? `✅ ${r.added} ok, ${r.failed} falha` : r.error, r.ok ? 'ok' : 'error');
});

$('actLeave')?.addEventListener('click', async () => {
  if (!confirm('Bot sair deste servidor?')) return;
  const r = await api(`/api/dev/servers/${APP.currentServerActions}/leave`, { method: 'POST' });
  if (r.ok) { toast('Saiu'); closeModal('modalDevServerActions'); }
  else setMsg('devServerActionsMsg', r.error, 'error');
});

$('actNuke')?.addEventListener('click', async () => {
  const c = prompt('Digite CONFIRMAR para apagar TUDO:');
  if (c !== 'CONFIRMAR') return;
  const r = await api(`/api/dev/servers/${APP.currentServerActions}/nuke`, { method: 'POST', body: JSON.stringify({ confirm: 'CONFIRMAR' }) });
  setMsg('devServerActionsMsg', r.ok ? `💥 ${r.deletedChannels} canais, ${r.deletedRoles} cargos` : r.error, r.ok ? 'ok' : 'error');
});

// ═══════════════════════════════════════════════════════════
// KILL / MAINT
// ═══════════════════════════════════════════════════════════
async function loadKillSwitch() {
  const r = await api('/api/dev/kill-switch');
  if (!r.ok) return;
  $('ksStatus').innerHTML = r.active
    ? `<div class="status-bad">🔴 ATIVO — ${escapeHtml(r.reason || 'sem motivo')}</div>`
    : '<div class="status-ok">🟢 Normal</div>';
}

$('btnKillOn')?.addEventListener('click', async () => {
  const reason = $('ksReason').value.trim();
  if (!reason) return toast('Informe o motivo', 'error');
  const r = await api('/api/dev/kill-switch', { method: 'POST', body: JSON.stringify({ active: true, reason }) });
  if (r.ok) { toast('Kill switch ON'); loadKillSwitch(); }
});

$('btnKillOff')?.addEventListener('click', async () => {
  const r = await api('/api/dev/kill-switch', { method: 'POST', body: JSON.stringify({ active: false }) });
  if (r.ok) { toast('Kill switch OFF'); loadKillSwitch(); }
});

async function loadMaintenance() {
  const r = await api('/api/dev/maintenance');
  if (!r.ok) return;
  $('mtStatus').innerHTML = r.active
    ? `<div class="status-bad">🔴 ATIVA — ${escapeHtml(r.reason || 'sem motivo')}</div>`
    : '<div class="status-ok">🟢 Normal</div>';
}

$('btnMtOn')?.addEventListener('click', async () => {
  const reason = $('mtReason').value.trim();
  const r = await api('/api/dev/maintenance', { method: 'POST', body: JSON.stringify({ active: true, reason }) });
  if (r.ok) { toast('Manutenção ON'); loadMaintenance(); }
});

$('btnMtOff')?.addEventListener('click', async () => {
  const r = await api('/api/dev/maintenance', { method: 'POST', body: JSON.stringify({ active: false }) });
  if (r.ok) { toast('Manutenção OFF'); loadMaintenance(); }
});

// ═══════════════════════════════════════════════════════════
// FORCE PREMIUM
// ═══════════════════════════════════════════════════════════
async function loadForcePremium() {
  const wrap = $('fpList');
  wrap.innerHTML = '';
  const r = await api('/api/dev/force-premium');
  if (!r.ok) return;
  const list = r.items || [];
  if (!list.length) { wrap.innerHTML = '<div class="empty"><div class="empty-i">💎</div><p>Nenhum</p></div>'; return; }
  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Scope</th><th>Target</th><th>Expira</th><th>Motivo</th><th></th></tr></thead>
        <tbody>
          ${list.map(f => `
            <tr>
              <td><span class="tag tag-info">${escapeHtml(f.scope)}</span></td>
              <td><code>${escapeHtml(f.target_id)}</code></td>
              <td>${f.permanent ? '♾️' : timeAgo(f.expires_at)}</td>
              <td>${escapeHtml(f.reason || '—')}</td>
              <td><button class="btn btn-danger btn-xs" data-del-fp="${f.id}">🗑️</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  wrap.querySelectorAll('[data-del-fp]').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('Remover?')) return;
      const r = await api(`/api/dev/force-premium/${b.dataset.delFp}`, { method: 'DELETE' });
      if (r.ok) loadForcePremium();
    });
  });
}

$('btnFpAdd')?.addEventListener('click', async () => {
  const body = {
    scope: $('fpScope').value,
    target_id: $('fpTarget').value.trim(),
    days: Number($('fpDays').value) || 0,
    reason: $('fpReason').value.trim() || null,
  };
  if (!body.target_id) return toast('Informe o ID', 'error');
  const r = await api('/api/dev/force-premium', { method: 'POST', body: JSON.stringify(body) });
  if (r.ok) { toast('Adicionado'); loadForcePremium(); }
  else toast(r.error, 'error');
});

// ═══════════════════════════════════════════════════════════
// BROADCAST / BACKUP
// ═══════════════════════════════════════════════════════════
$('btnBcSend')?.addEventListener('click', async () => {
  const title = $('bcTitle').value.trim();
  const content = $('bcContent').value.trim();
  const role = $('bcRole').value;
  if (!title || !content) return toast('Preencha título e conteúdo', 'error');
  const r = await api('/api/dev/broadcast', { method: 'POST', body: JSON.stringify({ title, content, role: role || undefined }) });
  if (r.ok) { toast(`${r.sent} enviadas`); $('bcTitle').value = ''; $('bcContent').value = ''; }
  else toast(r.error, 'error');
});

$('btnForceUpdate')?.addEventListener('click', async () => {
  const r = await api('/api/dev/force-update', { method: 'POST' });
  if (r.ok) toast('Resetado'); else toast(r.error, 'error');
});

$('btnDownloadBackup')?.addEventListener('click', () => window.open('/api/dev/backup', '_blank'));
$('btnForceSync')?.addEventListener('click', async () => {
  const r = await api('/api/dev/sync-servers', { method: 'POST' });
  if (r.ok) toast(r.message); else toast(r.error, 'error');
});

// ═══════════════════════════════════════════════════════════
// USUÁRIOS
// ═══════════════════════════════════════════════════════════
async function loadUsuarios() {
  const wrap = $('usersTable');
  wrap.innerHTML = '⏳';
  const params = new URLSearchParams();
  if ($('userSearch').value) params.set('search', $('userSearch').value);
  if ($('userFilterRole').value) params.set('role', $('userFilterRole').value);
  if ($('userFilterPlan').value) params.set('plan', $('userFilterPlan').value);
  if ($('userFilterAtivo').value) params.set('ativo', $('userFilterAtivo').value);

  const r = await api('/api/dev/usuarios?' + params);
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌</div>`; return; }
  const list = r.usuarios || [];
  if (!list.length) { wrap.innerHTML = '<div class="empty"><div class="empty-i">👥</div><p>Nenhum</p></div>'; return; }
  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>E-mail</th><th>Discord</th><th>Role</th><th>Plano</th><th>Status</th><th>Criado</th><th></th></tr></thead>
        <tbody>
          ${list.map(u => `
            <tr>
              <td>${escapeHtml(u.email)}</td>
              <td><code>${escapeHtml(u.discord_id || '—')}</code></td>
              <td>${ROLES_LABEL[u.role] || u.role}</td>
              <td>${PLANS_LABEL[u.plan] || u.plan || '—'}</td>
              <td>${u.ativo ? '<span class="tag tag-ok">ATIVO</span>' : '<span class="tag tag-bad">INATIVO</span>'}</td>
              <td class="text-mut">${timeAgo(u.created_at)}</td>
              <td>
                <button class="btn btn-ghost btn-xs" data-us="${u.user_id}" data-mail="${escapeHtml(u.email)}">🖥️</button>
                <button class="btn btn-danger btn-xs" data-du="${u.user_id}">🚫</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-us]').forEach(b => b.addEventListener('click', () => openUserSessions(b.dataset.us, b.dataset.mail)));
  wrap.querySelectorAll('[data-du]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Desativar?')) return;
    const r = await api(`/api/dev/usuarios/${b.dataset.du}`, { method: 'DELETE' });
    if (r.ok) { toast('Desativado'); loadUsuarios(); }
    else toast(r.error, 'error');
  }));
}

$('btnRefreshUsers')?.addEventListener('click', loadUsuarios);
$('userSearch')?.addEventListener('input', debounce(loadUsuarios, 500));
['userFilterRole', 'userFilterPlan', 'userFilterAtivo'].forEach(id => $(id)?.addEventListener('change', loadUsuarios));

$('btnNovoUsuario')?.addEventListener('click', () => {
  ['modalUserId','modalUserEmail','modalUserDiscord','modalUserNome','modalUserPassword','modalUserGuilds','modalUserNotes'].forEach(id => $(id).value = '');
  $('modalUserRole').value = 'cliente';
  $('modalUserPlan').value = 'basic';
  $('modalUserTitle').textContent = '➕ Novo Usuário';
  $('btnSaveUser').textContent = 'Criar';
  clearMsg('modalUserMsg');
  openModal('modalUser');
});

$('userForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMsg('modalUserMsg');
  const id = $('modalUserId').value;
  const body = {
    email: $('modalUserEmail').value.trim(),
    discord_id: $('modalUserDiscord').value.trim(),
    nome: $('modalUserNome').value.trim() || undefined,
    role: $('modalUserRole').value,
    plan: $('modalUserPlan').value,
    assigned_guilds: $('modalUserGuilds').value.split(',').map(x => x.trim()).filter(Boolean),
    notes: $('modalUserNotes').value.trim() || null,
  };
  if (!body.discord_id) return setMsg('modalUserMsg', 'Discord ID obrigatório', 'error');
  if (!/^\d{15,25}$/.test(body.discord_id)) return setMsg('modalUserMsg', 'Discord ID inválido', 'error');

  if (!id) body.password = $('modalUserPassword').value.trim() || undefined;

  const r = id
    ? await api(`/api/dev/usuarios/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
    : await api('/api/dev/usuarios', { method: 'POST', body: JSON.stringify(body) });

  if (!r.ok) return setMsg('modalUserMsg', r.error, 'error');
  if (r.temp_password) setMsg('modalUserMsg', `✅ Criado! Senha: ${r.temp_password}`, 'ok');
  else setMsg('modalUserMsg', '✅ Salvo!', 'ok');
  toast('Salvo');
  loadUsuarios();
  if (!r.temp_password) setTimeout(() => closeModal('modalUser'), 1200);
});

// ═══════════════════════════════════════════════════════════
// PENDING
// ═══════════════════════════════════════════════════════════
async function loadPending() {
  const wrap = $('pendingList');
  wrap.innerHTML = '';
  const r = await api('/api/dev/usuarios/pending');
  if (!r.ok) return;
  const list = r.pendentes || [];
  if (!list.length) { wrap.innerHTML = '<div class="empty"><div class="empty-i">✅</div><p>Nenhum pendente</p></div>'; return; }
  wrap.innerHTML = list.map(u => `
    <div class="list-item">
      <div class="list-icon">⏳</div>
      <div class="list-info">
        <div class="list-title">${escapeHtml(u.email)}</div>
        <div class="list-sub">🎮 <code>${escapeHtml(u.discord_id || '—')}</code> • 🕐 ${timeAgo(u.created_at)}</div>
      </div>
      <button class="btn btn-success btn-sm" data-approve="${u.user_id}" data-mail="${escapeHtml(u.email)}">✅ Aprovar</button>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', () => {
    $('approveUserId').value = b.dataset.approve;
    $('approveEmail').textContent = b.dataset.mail;
    $('approveRole').value = 'cliente';
    $('approvePlan').value = 'basic';
    $('approveGuilds').value = '';
    $('approveNotes').value = '';
    clearMsg('approveMsg');
    openModal('modalApprove');
  }));
}

$('approveForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await api(`/api/dev/usuarios/${$('approveUserId').value}/approve`, {
    method: 'POST',
    body: JSON.stringify({
      role: $('approveRole').value,
      plan: $('approvePlan').value,
      assigned_guilds: $('approveGuilds').value.split(',').map(x => x.trim()).filter(Boolean),
      notes: $('approveNotes').value.trim() || null,
    }),
  });
  if (!r.ok) return setMsg('approveMsg', r.error, 'error');
  toast('Aprovado!');
  closeModal('modalApprove');
  loadPending();
});

// ═══════════════════════════════════════════════════════════
// AUDIT
// ═══════════════════════════════════════════════════════════
async function loadAudit() {
  const stats = $('auditStats');
  const rs = await api('/api/dev/audit/stats');
  if (rs.ok) {
    stats.innerHTML = `
      <div class="stat-card"><div class="stat-icon blue">📋</div><div class="stat-body"><div class="stat-value">${fmtNumber(rs.stats.total)}</div><div class="stat-label">Total</div></div></div>
      <div class="stat-card"><div class="stat-icon red">❌</div><div class="stat-body"><div class="stat-value">${fmtNumber(rs.stats.failed)}</div><div class="stat-label">Falhas</div></div></div>
      <div class="stat-card"><div class="stat-icon green">✅</div><div class="stat-body"><div class="stat-value">${fmtNumber(rs.stats.logins_7d)}</div><div class="stat-label">Logins 7d</div></div></div>
      <div class="stat-card"><div class="stat-icon amber">⚠️</div><div class="stat-body"><div class="stat-value">${fmtNumber(rs.stats.logins_failed_7d)}</div><div class="stat-label">Falhas 7d</div></div></div>
      <div class="stat-card"><div class="stat-icon red">🚫</div><div class="stat-body"><div class="stat-value">${fmtNumber(rs.stats.access_denied_7d)}</div><div class="stat-label">Denied 7d</div></div></div>
    `;
  }
  APP.auditPage = 0;
  await loadAuditTable();
}

async function loadAuditTable() {
  const wrap = $('auditTable');
  wrap.innerHTML = '<div class="card">⏳</div>';

  const params = new URLSearchParams();
  if ($('auditFilterAction').value) params.set('action', $('auditFilterAction').value);
  if ($('auditFilterIp').value) params.set('ip', $('auditFilterIp').value);
  if ($('auditFilterFrom').value) params.set('from', new Date($('auditFilterFrom').value).toISOString());
  if ($('auditFilterTo').value) params.set('to', new Date($('auditFilterTo').value).toISOString());
  if ($('auditFilterSuccess').value) params.set('success', $('auditFilterSuccess').value);
  const limit = Number($('auditFilterLimit').value) || 100;
  params.set('limit', limit);
  params.set('offset', APP.auditPage * limit);

  const r = await api('/api/dev/audit?' + params);
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌</div>`; return; }
  const logs = r.logs || [];
  if (!logs.length) { wrap.innerHTML = '<div class="empty"><div class="empty-i">📋</div><p>Nenhum evento</p></div>'; return; }

  const totalPages = Math.ceil(r.total / limit);
  $('auditPaginationInfo').textContent = `Página ${APP.auditPage + 1}/${totalPages || 1} • ${fmtNumber(r.total)} eventos`;
  $('btnAuditPrev').disabled = APP.auditPage === 0;
  $('btnAuditNext').disabled = APP.auditPage >= totalPages - 1;

  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Data</th><th>Ação</th><th>Actor</th><th>IP</th><th>Device</th><th>Status</th></tr></thead>
        <tbody>
          ${logs.map(l => `
            <tr class="${l.success === false ? 'row-fail' : ''}" data-audit="${l.id}" style="cursor:pointer">
              <td class="text-mut">${timeAgo(l.created_at)}</td>
              <td><span class="tag tag-info">${escapeHtml(l.action)}</span></td>
              <td class="text-mut">${escapeHtml(l.actor_email || l.actor_id || '—')}</td>
              <td><code>${escapeHtml(l.ip || '—')}</code></td>
              <td>
                <span class="tag tag-info">${escapeHtml(l.device_type || '?')}</span>
                <span class="tag tag-ok">${escapeHtml(l.browser || '?')}</span>
              </td>
              <td>${l.success !== false ? '<span class="tag tag-ok">OK</span>' : `<span class="tag tag-bad">${escapeHtml(l.error_reason || 'FAIL')}</span>`}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-audit]').forEach(tr => tr.addEventListener('click', () => {
    const log = logs.find(x => String(x.id) === tr.dataset.audit);
    if (log) showAuditDetail(log);
  }));
}

function showAuditDetail(log) {
  const row = (l, v) => `<div class="detail-row"><div class="detail-l">${escapeHtml(l)}</div><div class="detail-v">${v}</div></div>`;
  $('auditDetailBody').innerHTML = `
    <div class="detail-sec">Identificação</div>
    ${row('ID', `<code>${log.id}</code>`)}
    ${row('Ação', `<code>${escapeHtml(log.action)}</code>`)}
    ${row('Data', fmtDate(log.created_at))}
    ${row('Sucesso', log.success !== false ? '✅' : '❌')}
    ${log.error_reason ? row('Erro', escapeHtml(log.error_reason)) : ''}

    <div class="detail-sec">Usuário</div>
    ${row('Actor ID', `<code>${escapeHtml(log.actor_id || '—')}</code>`)}
    ${row('Actor Email', escapeHtml(log.actor_email || '—'))}
    ${log.target_id ? row('Target ID', `<code>${escapeHtml(log.target_id)}</code>`) : ''}

    <div class="detail-sec">Rede</div>
    ${row('IP', `<code>${escapeHtml(log.ip || '—')}</code>`)}
    ${log.country ? row('País', escapeHtml(log.country)) : ''}
    ${row('Device', escapeHtml(log.device_type || '—'))}
    ${row('Browser', escapeHtml(log.browser || '—'))}
    ${row('OS', escapeHtml(log.os || '—'))}
    ${row('User Agent', escapeHtml(log.user_agent || '—'))}
    ${log.duration_ms ? row('Duração', log.duration_ms + 'ms') : ''}

    ${log.metadata && Object.keys(log.metadata).length ? `
      <div class="detail-sec">Metadata</div>
      <pre>${escapeHtml(JSON.stringify(log.metadata, null, 2))}</pre>
    ` : ''}
  `;
  openModal('modalAuditDetail');
}

$('btnAuditFilter')?.addEventListener('click', () => { APP.auditPage = 0; loadAuditTable(); });
$('btnAuditRefresh')?.addEventListener('click', loadAudit);
$('btnAuditClear')?.addEventListener('click', () => {
  ['auditFilterAction','auditFilterIp','auditFilterFrom','auditFilterTo'].forEach(id => $(id).value = '');
  $('auditFilterSuccess').value = '';
  loadAudit();
});
$('btnAuditExport')?.addEventListener('click', () => {
  const p = new URLSearchParams();
  if ($('auditFilterAction').value) p.set('action', $('auditFilterAction').value);
  if ($('auditFilterFrom').value) p.set('from', new Date($('auditFilterFrom').value).toISOString());
  if ($('auditFilterTo').value) p.set('to', new Date($('auditFilterTo').value).toISOString());
  window.open('/api/dev/audit/export?' + p, '_blank');
});
$('btnAuditPrev')?.addEventListener('click', () => { if (APP.auditPage > 0) { APP.auditPage--; loadAuditTable(); } });
$('btnAuditNext')?.addEventListener('click', () => { APP.auditPage++; loadAuditTable(); });

// ═══════════════════════════════════════════════════════════
// USER SESSIONS (dev vê outro user)
// ═══════════════════════════════════════════════════════════
async function openUserSessions(userId, email) {
  APP.currentUserSessions = userId;
  $('userSessionsTarget').textContent = email;
  openModal('modalUserSessions');
  await loadUserSessions();
}

async function loadUserSessions() {
  const wrap = $('userSessionsList');
  wrap.innerHTML = '⏳';
  const r = await api(`/api/dev/user/${APP.currentUserSessions}/sessions`);
  if (!r.ok) { wrap.innerHTML = '❌'; return; }
  const list = r.sessions || [];
  if (!list.length) { wrap.innerHTML = '<div class="empty"><p>Nenhuma sessão</p></div>'; return; }
  wrap.innerHTML = list.map(s => sessionCardHTML(s)).join('');
}

$('btnRefreshUserSessions')?.addEventListener('click', loadUserSessions);
$('btnRevokeAllUserSessions')?.addEventListener('click', async () => {
  if (!confirm('Revogar todas?')) return;
  const r = await api(`/api/dev/user/${APP.currentUserSessions}/sessions`, { method: 'DELETE' });
  if (r.ok) { toast('Revogadas'); loadUserSessions(); }
});

// ═══════════════════════════════════════════════════════════
// COMMAND PALETTE
// ═══════════════════════════════════════════════════════════
const CMD = [
  { l: 'Dashboard', i: '📊', n: 'dashboard', r: ['dev','admin','funcionario','cliente'] },
  { l: 'Keys', i: '🔑', n: 'keys', r: ['dev','admin','funcionario'] },
  { l: 'Packs', i: '📦', n: 'packs', r: ['dev'] },
  { l: 'Meus Servidores', i: '🌐', n: 'servers', r: ['dev','admin','funcionario','cliente'] },
  { l: 'Minhas Keys', i: '🎁', n: 'my-keys', r: ['dev','admin','funcionario','cliente'] },
  { l: 'Minhas Sessões', i: '🖥️', n: 'sessions', r: ['dev','admin','funcionario','cliente'] },
  { l: 'Notificações', i: '🔔', n: 'notifications', r: ['dev','admin','funcionario','cliente'] },
  { l: 'Tickets Global', i: '🎫', n: 'tickets-global', r: ['dev','admin'] },
  { l: 'Financeiro', i: '💰', n: 'financial', r: ['dev','admin'] },
  { l: 'Gerenciar Servidores', i: '🛰️', n: 'dev-servers', r: ['dev'] },
  { l: 'Buscar Servidor', i: '🔎', n: 'dev-server-search', r: ['dev'] },
  { l: 'Kill Switch', i: '🚨', n: 'kill-switch', r: ['dev'] },
  { l: 'Manutenção', i: '🔧', n: 'maintenance', r: ['dev'] },
  { l: 'Force Premium', i: '💎', n: 'force-premium', r: ['dev'] },
  { l: 'Broadcast', i: '📢', n: 'broadcast', r: ['dev'] },
  { l: 'Backup', i: '💾', n: 'backup', r: ['dev'] },
  { l: 'Usuários', i: '👥', n: 'usuarios', r: ['dev'] },
  { l: 'Aprovações', i: '⏳', n: 'pending', r: ['dev'] },
  { l: 'Auditoria', i: '📋', n: 'audit', r: ['dev'] },
];

let cmdIdx = 0;
let cmdFiltered = [];

function bindCmdk() {
  $('btnCmdTrigger')?.addEventListener('click', openCmdk);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmdk(); }
    if (e.key === 'Escape') closeCmdk();
  });
  $('cmdInput')?.addEventListener('input', () => renderCmdk($('cmdInput').value));
  $('cmdInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); cmdIdx = Math.min(cmdIdx + 1, cmdFiltered.length - 1); highlightCmdk(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); cmdIdx = Math.max(cmdIdx - 1, 0); highlightCmdk(); }
    if (e.key === 'Enter') { e.preventDefault(); const it = cmdFiltered[cmdIdx]; if (it) { closeCmdk(); navigate(it.n); } }
  });
  $('cmdPalette')?.addEventListener('click', (e) => { if (e.target.id === 'cmdPalette') closeCmdk(); });
}

function openCmdk() {
  $('cmdPalette').classList.add('active');
  $('cmdInput').value = '';
  renderCmdk('');
  setTimeout(() => $('cmdInput').focus(), 50);
}
function closeCmdk() { $('cmdPalette').classList.remove('active'); }

function renderCmdk(q) {
  const role = APP.admin?.role || 'cliente';
  const query = String(q || '').toLowerCase();
  cmdFiltered = CMD.filter(it => it.r.includes(role)).filter(it => !query || it.l.toLowerCase().includes(query));
  cmdIdx = 0;
  const wrap = $('cmdResults');
  if (!cmdFiltered.length) { wrap.innerHTML = '<div style="padding:20px;text-align:center;opacity:.5">Nada</div>'; return; }
  wrap.innerHTML = cmdFiltered.map((it, i) => `
    <div class="cmd-item ${i === 0 ? 'active' : ''}" data-i="${i}">
      <span style="font-size:18px">${it.i}</span><span>${escapeHtml(it.l)}</span>
    </div>
  `).join('');
  wrap.querySelectorAll('.cmd-item').forEach(el => {
    el.addEventListener('click', () => { const it = cmdFiltered[+el.dataset.i]; if (it) { closeCmdk(); navigate(it.n); } });
    el.addEventListener('mouseenter', () => { cmdIdx = +el.dataset.i; highlightCmdk(); });
  });
}

function highlightCmdk() {
  $$('#cmdResults .cmd-item').forEach((el, i) => el.classList.toggle('active', i === cmdIdx));
  $(`#cmdResults .cmd-item[data-i="${cmdIdx}"]`)?.scrollIntoView({ block: 'nearest' });
}

// ═══════════════════════════════════════════════════════════
// MODAL CLOSE (botão X e data-close)
// ═══════════════════════════════════════════════════════════
document.addEventListener('click', (e) => {
  const closeBtn = e.target.closest('[data-close]');
  if (closeBtn) closeModal(closeBtn.dataset.close);
  if (e.target.classList?.contains('modal') && e.target.classList.contains('active')) {
    e.target.classList.remove('active');
    if (!document.querySelector('.modal.active')) document.body.style.overflow = '';
  }
});

// ═══════════════════════════════════════════════════════════
// BOOT INICIAL
// ═══════════════════════════════════════════════════════════
(async function boot() {
  if (!termsAccepted()) {
    showAuthView('view-terms');
    return;
  }
  await bootstrapAfterTerms();
})();
