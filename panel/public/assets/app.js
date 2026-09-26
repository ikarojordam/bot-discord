// ═══════════════════════════════════════════════════════════
// FRIO PANEL — app.js v5.1.3
// Auth + SPA Router + Pages + Modals + Command Palette
// ═══════════════════════════════════════════════════════════
'use strict';

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
const APP = {
  user: null,
  admin: null,
  csrf: null,
  currentPage: 'dashboard',
  notifications: [],
  unread: 0,
  charts: {},
  auditPage: 0,
  auditFilters: {},
  currentServerActions: null,
  currentUserSessions: null,
  cache: {},
};

const ROLES_LABEL = { dev: '👑 DEV', admin: '🛡️ ADMIN', funcionario: '🔧 FUNCIONÁRIO', cliente: '👤 CLIENTE', pending: '⏳ PENDING' };
const PLANS_LABEL = { basic: '🥉 Basic', premium: '🥈 Premium', ultra: '🥇 Ultra', unlimited: '💎 Unlimited', none: '— Sem plano' };

// ═══════════════════════════════════════════════════════════
// HELPERS — DOM
// ═══════════════════════════════════════════════════════════
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);
const createEl = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined) el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
};
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ═══════════════════════════════════════════════════════════
// HELPERS — FORMAT
// ═══════════════════════════════════════════════════════════
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('pt-BR');
}
function fmtDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('pt-BR');
}
function timeAgo(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d atrás`;
  return fmtDateShort(iso);
}
function fmtBRL(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function fmtNumber(v) {
  return Number(v || 0).toLocaleString('pt-BR');
}

// ═══════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════
let _toastTimer = null;
function toast(msg, type = 'ok') {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} active`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('active'), 3500);
}

// ═══════════════════════════════════════════════════════════
// MSG (inline em forms)
// ═══════════════════════════════════════════════════════════
function setMsg(id, text, type = 'error') {
  const el = $(id);
  if (!el) return;
  if (!text) { el.style.display = 'none'; return; }
  el.textContent = text;
  el.className = `msg ${type}`;
  el.style.display = 'block';
}
function clearMsg(...ids) { ids.forEach(id => setMsg(id, '')); }

// ═══════════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════════
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
  document.body.style.overflow = '';
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

// ═══════════════════════════════════════════════════════════
// FETCH com CSRF + credentials
// ═══════════════════════════════════════════════════════════
async function api(path, opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  // CSRF
  if (APP.csrf && ['POST', 'PATCH', 'PUT', 'DELETE'].includes((opts.method || 'GET').toUpperCase())) {
    headers['x-csrf-token'] = APP.csrf;
  }
  const res = await fetch(path, {
    credentials: 'include',
    ...opts,
    headers,
  });
  let data = null;
  try { data = await res.json(); } catch { data = { ok: false, error: 'Resposta inválida' }; }
  if (!res.ok && data && !data.ok) data._status = res.status;
  return data;
}

// ═══════════════════════════════════════════════════════════
// VIEWS (login / register / reset / app)
// ═══════════════════════════════════════════════════════════
function showAuthView(id) {
  ['view-login', 'view-register', 'view-reset'].forEach(x => {
    const el = $(x);
    if (el) el.classList.toggle('active', x === id);
  });
  $('view-app').classList.remove('active');
}
function showApp() {
  ['view-login', 'view-register', 'view-reset'].forEach(x => $(x)?.classList.remove('active'));
  $('view-app').classList.add('active');
}

// ═══════════════════════════════════════════════════════════
// AUTH — LOGIN
// ═══════════════════════════════════════════════════════════
$('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMsg('loginMsg');
  const btn = $('btnLogin');
  const label = btn.querySelector('span');
  const orig = label.textContent;
  btn.disabled = true; label.textContent = '⏳ Entrando...';

  try {
    const r = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: $('loginEmail').value.trim(),
        password: $('loginPassword').value,
      }),
    });

    if (!r.ok) {
      if (r.code === 'EMAIL_NOT_CONFIRMED') {
        setMsg('loginMsg', '⚠️ Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.');
      } else if (r.code === 'PENDING') {
        setMsg('loginMsg', '⏳ Aguarde aprovação do DEV.');
      } else {
        setMsg('loginMsg', r.error || 'Erro ao entrar.');
      }
      btn.disabled = false; label.textContent = orig;
      return;
    }

    APP.user = r.user;
    APP.admin = r.admin;
    APP.csrf = r.csrf;
    sessionStorage.setItem('frio_admin', JSON.stringify(r.admin));

    await bootApp();
  } catch (err) {
    setMsg('loginMsg', 'Erro de conexão.');
    btn.disabled = false; label.textContent = orig;
  }
});

// ═══════════════════════════════════════════════════════════
// AUTH — REGISTER
// ═══════════════════════════════════════════════════════════
$('btnShowRegister')?.addEventListener('click', () => showAuthView('view-register'));
$('linkBackLogin')?.addEventListener('click', () => showAuthView('view-login'));

$('registerForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMsg('registerMsg');

  const p1 = $('regPassword').value;
  const p2 = $('regConfirm').value;
  const discord = ($('regDiscord').value || '').trim();

  if (!discord) return setMsg('registerMsg', '⚠️ ID do Discord é obrigatório.');
  if (!/^\d{15,25}$/.test(discord)) return setMsg('registerMsg', '⚠️ ID do Discord inválido (15-25 dígitos).');
  if (p1 !== p2) return setMsg('registerMsg', '⚠️ As senhas não coincidem.');
  if (p1.length < 8) return setMsg('registerMsg', '⚠️ Senha deve ter pelo menos 8 caracteres.');

  const btn = e.target.querySelector('button[type="submit"]');
  const label = btn.querySelector('span');
  const orig = label.textContent;
  btn.disabled = true; label.textContent = '⏳ Criando...';

  try {
    const r = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: $('regEmail').value.trim(),
        password: p1,
        discord_id: discord,
        username: $('regUsername')?.value.trim() || undefined,
      }),
    });

    if (!r.ok) {
      setMsg('registerMsg', r.error || 'Erro ao criar conta.');
      btn.disabled = false; label.textContent = orig;
      return;
    }

    setMsg('registerMsg', '✅ Conta criada! Verifique seu e-mail para confirmar.', 'ok');
    toast('Conta criada! Verifique o e-mail.', 'ok');
    e.target.reset();
    setTimeout(() => showAuthView('view-login'), 2500);
  } catch {
    setMsg('registerMsg', 'Erro de conexão.');
    btn.disabled = false; label.textContent = orig;
  }
});

// ═══════════════════════════════════════════════════════════
// AUTH — FORGOT
// ═══════════════════════════════════════════════════════════
$('linkForgot')?.addEventListener('click', (e) => {
  e.preventDefault();
  $('forgotEmail').value = $('loginEmail').value;
  openModal('modalForgot');
});
$('btnSendForgot')?.addEventListener('click', async () => {
  const email = $('forgotEmail').value.trim();
  if (!email) return toast('Informe o e-mail', 'error');
  try {
    const r = await api('/api/auth/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    toast(r.message || 'Se o e-mail existir, enviaremos instruções.', 'ok');
    closeModal('modalForgot');
  } catch { toast('Erro de conexão', 'error'); }
});

// ═══════════════════════════════════════════════════════════
// AUTH — LOGOUT
// ═══════════════════════════════════════════════════════════
$('btnLogout')?.addEventListener('click', async () => {
  if (!confirm('Sair da conta?')) return;
  try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
  sessionStorage.clear();
  location.reload();
});

// ═══════════════════════════════════════════════════════════
// BOOT DO APP
// ═══════════════════════════════════════════════════════════
async function bootApp() {
  showApp();

  // Preenche header
  $('userEmail').textContent = APP.user.email;
  $('userRole').textContent = ROLES_LABEL[APP.admin.role] || APP.admin.role;
  $('userPlan').textContent = PLANS_LABEL[APP.admin.plan] || APP.admin.plan || '—';

  // Marca role no body
  document.body.dataset.role = APP.admin.role;
  document.body.dataset.plan = APP.admin.plan || 'none';

  // Esconde itens proibidos
  $$('[data-roles]').forEach(el => {
    const roles = el.dataset.roles.split(',').map(r => r.trim());
    if (!roles.includes(APP.admin.role)) el.style.display = 'none';
  });

  // Setup navegação
  bindNav();
  bindCommandPalette();
  bindNotifications();

  // Carrega dashboard
  await navigate('dashboard');

  // Polling de notificações a cada 30s
  loadNotifications();
  setInterval(loadNotifications, 30000);
}

// ═══════════════════════════════════════════════════════════
// NAVEGAÇÃO (SPA)
// ═══════════════════════════════════════════════════════════
function bindNav() {
  $$('aside.sidebar nav a[data-nav]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const page = a.dataset.nav;
      navigate(page);
    });
  });

  // Hamburger mobile
  $('btnHamburger')?.addEventListener('click', () => {
    $('sidebar')?.classList.add('open');
    $('sidebarOverlay')?.classList.add('active');
  });
  $('sidebarOverlay')?.addEventListener('click', () => {
    $('sidebar')?.classList.remove('open');
    $('sidebarOverlay')?.classList.remove('active');
  });
}

async function navigate(page) {
  APP.currentPage = page;

  // Esconde todas as páginas
  $$('section.page').forEach(s => s.classList.remove('active'));
  const target = $(`page-${page}`);
  if (!target) return;
  target.classList.add('active');

  // Marca link ativo
  $$('aside.sidebar nav a[data-nav]').forEach(a => {
    a.classList.toggle('active', a.dataset.nav === page);
  });

  // Fecha sidebar mobile
  $('sidebar')?.classList.remove('open');
  $('sidebarOverlay')?.classList.remove('active');

  // Scrolla pro topo
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Executa loader da página
  try {
    switch (page) {
      case 'dashboard': await loadDashboard(); break;
      case 'keys': await loadKeys(); break;
      case 'packs': await loadPacks(); break;
      case 'servers': await loadServers(); break;
      case 'my-keys': await loadMyKeys(); break;
      case 'sessions': await loadSessions(); break;
      case 'notifications': await loadNotificationsPage(); break;
      case 'tickets-global': await loadTicketsGlobal(); break;
      case 'financial': await loadFinancial(); break;
      case 'dev-servers': await loadDevServers(); break;
      case 'dev-server-search': break;
      case 'kill-switch': await loadKillSwitch(); break;
      case 'maintenance': await loadMaintenance(); break;
      case 'force-premium': await loadForcePremium(); break;
      case 'broadcast': break;
      case 'backup': break;
      case 'usuarios': await loadUsuarios(); break;
      case 'pending': await loadPending(); break;
      case 'logs': await loadAudit(); break;
    }
  } catch (e) { console.error('[navigate]', page, e); }
}
window.navigate = navigate;

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
async function loadDashboard() {
  const wrap = $('dashStats');
  wrap.innerHTML = '<div class="card">⏳ Carregando...</div>';

  try {
    const r = await api('/api/dashboard/stats');
    if (!r.ok) { wrap.innerHTML = `<div class="card">❌ ${escapeHtml(r.error)}</div>`; return; }
    const s = r.stats;

    const cards = [
      { icon: '🌐', label: 'Servidores', value: fmtNumber(s.guilds || s.servers || 0), color: 'blue' },
      { icon: '👥', label: 'Usuários', value: fmtNumber(s.users || 0), color: 'green' },
      { icon: '🔑', label: 'Keys ativas', value: fmtNumber(s.active_keys || 0), color: 'amber' },
      { icon: '🎁', label: 'Redenções', value: fmtNumber(s.redemptions || 0), color: 'blue' },
      { icon: '⏳', label: 'Pendentes', value: fmtNumber(s.pending || 0), color: 'red' },
      { icon: '👥', label: 'Membros totais', value: fmtNumber(s.total_members || 0), color: 'green' },
    ];
    wrap.innerHTML = cards.map(c => `
      <div class="stat-card">
        <div class="stat-icon ${c.color}">${c.icon}</div>
        <div class="stat-body">
          <div class="stat-value">${escapeHtml(c.value)}</div>
          <div class="stat-label">${escapeHtml(c.label)}</div>
        </div>
      </div>
    `).join('');

    // Charts (só se staff)
    if (['dev', 'admin', 'funcionario'].includes(APP.admin.role)) {
      const rc = await api('/api/dashboard/charts');
      if (rc.ok) renderDashboardCharts(rc.charts);
    }
  } catch (e) {
    wrap.innerHTML = '<div class="card">❌ Erro</div>';
  }
}

function renderDashboardCharts(charts) {
  const wrap = $('dashCharts');
  wrap.innerHTML = `
    <div class="chart-card"><h4>📈 Keys por dia (30d)</h4><canvas id="chartKeysByDay"></canvas></div>
    <div class="chart-card"><h4>🍩 Keys por tier</h4><canvas id="chartKeysByTier"></canvas></div>
    <div class="chart-card"><h4>👥 Usuários por role</h4><canvas id="chartUsersByRole"></canvas></div>
    <div class="chart-card"><h4>📊 Distribuição de planos</h4><canvas id="chartUsersByPlan"></canvas></div>
    <div class="chart-card" style="grid-column:1/-1"><h4>🏆 Top 10 servidores</h4><canvas id="chartTopServers"></canvas></div>
  `;

  const destroy = (id) => { if (APP.charts[id]) { APP.charts[id].destroy(); delete APP.charts[id]; } };

  try {
    // Keys por dia
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
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
      });
    }
    // Keys por tier
    if (charts.keys_by_tier) {
      destroy('chartKeysByTier');
      APP.charts.chartKeysByTier = new Chart($('chartKeysByTier'), {
        type: 'doughnut',
        data: {
          labels: ['Basic', 'Premium', 'Ultra', 'Unlimited'],
          datasets: [{
            data: [charts.keys_by_tier.basic, charts.keys_by_tier.premium, charts.keys_by_tier.ultra, charts.keys_by_tier.unlimited],
            backgroundColor: ['#CD7F32', '#C0C0C0', '#FFD700', '#8B5CF6'],
          }],
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
      });
    }
    // Users por role
    if (charts.users_by_role) {
      destroy('chartUsersByRole');
      APP.charts.chartUsersByRole = new Chart($('chartUsersByRole'), {
        type: 'doughnut',
        data: {
          labels: ['DEV', 'Admin', 'Funcionário', 'Cliente', 'Pending'],
          datasets: [{
            data: [charts.users_by_role.dev, charts.users_by_role.admin, charts.users_by_role.funcionario, charts.users_by_role.cliente, charts.users_by_role.pending],
            backgroundColor: ['#FFD700', '#ED4245', '#9B59B6', '#57F287', '#808080'],
          }],
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
      });
    }
    // Users por plano
    if (charts.users_by_plan) {
      destroy('chartUsersByPlan');
      APP.charts.chartUsersByPlan = new Chart($('chartUsersByPlan'), {
        type: 'bar',
        data: {
          labels: ['Basic', 'Premium', 'Ultra', 'Unlimited', 'Sem plano'],
          datasets: [{
            data: [charts.users_by_plan.basic, charts.users_by_plan.premium, charts.users_by_plan.ultra, charts.users_by_plan.unlimited, charts.users_by_plan.none],
            backgroundColor: ['#CD7F32', '#C0C0C0', '#FFD700', '#8B5CF6', '#6b7280'],
          }],
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
      });
    }
    // Top servers
    if (charts.top_servers?.length) {
      destroy('chartTopServers');
      APP.charts.chartTopServers = new Chart($('chartTopServers'), {
        type: 'bar',
        data: {
          labels: charts.top_servers.map(s => s.name),
          datasets: [{
            label: 'Membros', data: charts.top_servers.map(s => s.member_count),
            backgroundColor: 'rgba(88,101,242,.7)',
          }],
        },
        options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } } },
      });
    }
  } catch (e) { console.error('[charts]', e); }
}

// ═══════════════════════════════════════════════════════════
// KEYS
// ═══════════════════════════════════════════════════════════
async function loadKeys() {
  await Promise.all([loadKeysTable(), loadRedemptions()]);

  // Form de gerar
  $('genForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMsg('genResult');
    const body = {
      tier: $('genTier').value,
      duracao_dias: Number($('genDuracao').value),
      quantidade: Number($('genQtd').value),
      max_usos: Number($('genMaxUsos').value),
      validade_key_dias: Number($('genValidade').value),
      motivo: $('genMotivo').value.trim() || null,
    };
    const r = await api('/api/keys/generate', { method: 'POST', body: JSON.stringify(body) });
    if (!r.ok) return setMsg('genResult', r.error, 'error');
    setMsg('genResult', `✅ ${r.keys.length} keys geradas!`, 'ok');
    toast(`${r.keys.length} keys geradas`, 'ok');
    loadKeysTable();
  }, { once: false });

  $('btnRefreshKeys')?.addEventListener('click', loadKeysTable);
  $('btnEnviarKey')?.addEventListener('click', openSendKeyModal);
}

async function loadKeysTable() {
  const wrap = $('keysTable');
  wrap.innerHTML = '<div class="card">⏳ Carregando...</div>';
  const params = new URLSearchParams();
  if ($('filterStatus')?.value) params.set('status', $('filterStatus').value);
  if ($('filterTier')?.value) params.set('tier', $('filterTier').value);

  const r = await api('/api/keys?' + params);
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌ ${escapeHtml(r.error)}</div>`; return; }
  const keys = r.keys || [];
  if (!keys.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">🔑</div><p>Nenhuma key encontrada</p></div>'; return; }

  wrap.innerHTML = `
    <table class="audit-table">
      <thead><tr>
        <th>Key</th><th>Tier</th><th>Duração</th><th>Usos</th><th>Status</th><th>Criada</th><th></th>
      </tr></thead>
      <tbody>
        ${keys.map(k => `
          <tr>
            <td><code>${escapeHtml(k.key_code)}</code></td>
            <td>${PLANS_LABEL[k.tier] || k.tier}</td>
            <td>${k.duracao_dias === 0 ? '♾️ Perm' : k.duracao_dias + 'd'}</td>
            <td>${k.usos_atuais}/${k.max_usos}</td>
            <td>${k.ativo ? '<span class="badge badge-ok">ATIVA</span>' : '<span class="badge badge-fail">ESGOTADA</span>'}</td>
            <td class="audit-time">${timeAgo(k.created_at)}</td>
            <td>${APP.admin.role === 'dev' ? `<button class="btn btn-sm btn-danger" data-del-key="${k.id}">🗑️</button>` : ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-del-key]').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('Excluir esta key?')) return;
      const r = await api(`/api/keys/${b.dataset.delKey}`, { method: 'DELETE' });
      if (r.ok) { toast('Key excluída', 'ok'); loadKeysTable(); }
      else toast(r.error || 'Erro', 'error');
    });
  });
}

async function loadRedemptions() {
  const wrap = $('redemptionsTable');
  wrap.innerHTML = '';
  const r = await api('/api/redemptions?limit=30');
  if (!r.ok) return;
  const list = r.redemptions || [];
  if (!list.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">🎁</div><p>Nenhum resgate ainda</p></div>'; return; }
  wrap.innerHTML = `
    <table class="audit-table">
      <thead><tr><th>Key</th><th>Servidor</th><th>Por</th><th>Tier</th><th>Quando</th></tr></thead>
      <tbody>
        ${list.map(r2 => `
          <tr>
            <td><code>${escapeHtml(r2.key_code)}</code></td>
            <td>${escapeHtml(r2.guild_name || r2.guild_id || '—')}</td>
            <td>${escapeHtml(r2.resgatado_por_tag || r2.resgatado_por || '—')}</td>
            <td>${PLANS_LABEL[r2.tier] || r2.tier}</td>
            <td class="audit-time">${timeAgo(r2.created_at)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function openSendKeyModal() {
  const [keysR, usersR] = await Promise.all([
    api('/api/keys?status=active&limit=200'),
    api('/api/dev/usuarios/clientes'),
  ]);
  const keys = keysR.keys || [];
  const users = usersR.clientes || [];
  if (!keys.length) return toast('Nenhuma key ativa', 'error');
  if (!users.length) return toast('Nenhum cliente cadastrado', 'error');

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
  toast('Key enviada', 'ok');
  setTimeout(() => closeModal('modalSendKey'), 1500);
});

// ═══════════════════════════════════════════════════════════
// PACKS
// ═══════════════════════════════════════════════════════════
async function loadPacks() {
  $('btnGerarPack')?.addEventListener('click', async () => {
    const qtd = Number($('packQtd').value) || 1;
    const r = await api('/api/keys/generate-pack', {
      method: 'POST',
      body: JSON.stringify({ quantidade: qtd, motivo: $('packMotivo').value.trim() || null }),
    });
    if (!r.ok) return setMsg('packResult', r.error, 'error');
    setMsg('packResult', `✅ ${r.packs.length} pack(s) gerado(s)`, 'ok');
    toast('Packs gerados', 'ok');
    loadPacksTable();
  });
  $('btnRefreshPacks')?.addEventListener('click', loadPacksTable);
  await loadPacksTable();
}

async function loadPacksTable() {
  const wrap = $('packsTable');
  wrap.innerHTML = '';
  const r = await api('/api/keys/packs');
  if (!r.ok) return;
  const packs = r.packs || [];
  if (!packs.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>Nenhum pack gerado</p></div>'; return; }
  wrap.innerHTML = `
    <table class="audit-table">
      <thead><tr><th>Pack</th><th>Status</th><th>Motivo</th><th>Criado</th><th></th></tr></thead>
      <tbody>
        ${packs.map(p => `
          <tr>
            <td><code>${escapeHtml(p.key_code)}</code></td>
            <td>${p.ativo ? '<span class="badge badge-ok">DISPONÍVEL</span>' : '<span class="badge badge-fail">USADO</span>'}</td>
            <td>${escapeHtml(p.motivo || '—')}</td>
            <td class="audit-time">${timeAgo(p.created_at)}</td>
            <td>${p.ativo ? `<button class="btn btn-sm" data-redeem="${p.id}">🎁 Resgatar</button>` : ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  wrap.querySelectorAll('[data-redeem]').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('Resgatar este pack? Ele vai gerar 60 keys.')) return;
      b.disabled = true;
      const r = await api('/api/keys/redeem-pack', { method: 'POST', body: JSON.stringify({ key_id: Number(b.dataset.redeem) }) });
      if (r.ok) { toast(`${r.total} keys geradas`, 'ok'); loadPacksTable(); }
      else { toast(r.error, 'error'); b.disabled = false; }
    });
  });
}

// ═══════════════════════════════════════════════════════════
// SERVIDORES (cliente)
// ═══════════════════════════════════════════════════════════
async function loadServers() {
  const wrap = $('serversGrid');
  wrap.innerHTML = '<div class="card">⏳ Carregando...</div>';
  const r = await api('/api/me/servers');
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌ ${escapeHtml(r.error)}</div>`; return; }
  const servers = r.servers || [];
  if (!servers.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="icon">🌐</div><p>Nenhum servidor vinculado</p><p class="empty-hint">Você só vê servidores onde é dono ou admin.</p></div>';
    return;
  }
  wrap.innerHTML = servers.map(s => serverCard(s)).join('');
  bindServerClicks(servers);
}

function serverCard(s) {
  const icon = s.icon ? `<img src="${escapeHtml(s.icon)}" alt="">` : '🛰️';
  return `
    <div class="server-card" data-guild="${s.guild_id}">
      <div class="server-icon">${icon}</div>
      <div class="server-info">
        <div class="server-name">${escapeHtml(s.name || 'Sem nome')}</div>
        <div class="server-id mono">${escapeHtml(s.guild_id)}</div>
        <div class="server-meta">
          <span>👥 ${fmtNumber(s.member_count || 0)}</span>
          ${s.is_premium ? '<span class="badge badge-ok">💎 PREMIUM</span>' : ''}
        </div>
      </div>
    </div>
  `;
}

function bindServerClicks(servers) {
  $$('[data-guild]').forEach(el => {
    el.addEventListener('click', () => openServerDetail(el.dataset.guild));
  });
}

async function openServerDetail(gid) {
  const r = await api(`/api/dev/servers/${gid}/full`);
  if (!r.ok) {
    const r2 = await api(`/api/me/servers/${gid}/stats`);
    if (!r2.ok) return toast(r2.error || 'Erro', 'error');
    return openModal('modalServer') || renderSimpleServerDetail(gid, r2);
  }
  const g = r.guild || {};
  const cfg = r.config || {};
  const ff = r.ff || {};
  const fp = r.force_premium || null;
  const c = r.counts || {};

  $('serverDetail').innerHTML = `
    <h2>🛰️ ${escapeHtml(g.name || 'Servidor')}</h2>
    <p class="sub mono">${escapeHtml(g.guild_id || gid)}</p>
    <div class="grid-3" style="margin-top:16px">
      <div class="stat-card"><div class="stat-icon blue">👥</div><div class="stat-body"><div class="stat-value">${fmtNumber(g.member_count||0)}</div><div class="stat-label">Membros</div></div></div>
      <div class="stat-card"><div class="stat-icon green">🎫</div><div class="stat-body"><div class="stat-value">${c.tickets_open||0}</div><div class="stat-label">Tickets abertos</div></div></div>
      <div class="stat-card"><div class="stat-icon amber">🎮</div><div class="stat-body"><div class="stat-value">${c.bets_total||0}</div><div class="stat-label">Apostas</div></div></div>
    </div>
    <div class="detail-row" style="margin-top:16px"><div class="detail-label">Premium</div><div class="detail-value">${fp ? (fp.permanent ? '💎 Permanente' : `💎 Até ${fmtDate(fp.expires_at)}`) : (cfg.is_premium ? '✅ Ativo' : '❌ Não')}</div></div>
    <div class="detail-row"><div class="detail-label">Tipo</div><div class="detail-value">${escapeHtml(cfg.server_type || '—')}</div></div>
    <div class="detail-row"><div class="detail-label">Produtos</div><div class="detail-value">${c.products||0}</div></div>
    <div class="detail-row"><div class="detail-label">Pedidos entregues</div><div class="detail-value">${c.orders_delivered||0}</div></div>
    <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">
      ${APP.admin.role === 'dev' ? `<button class="btn" onclick="closeModal('modalServer');openDevServerActions('${gid}')">⚡ Ações DEV</button>` : ''}
    </div>
  `;
  openModal('modalServer');
}

function renderSimpleServerDetail(gid, r) {
  $('serverDetail').innerHTML = `
    <h2>🛰️ ${escapeHtml(r.guild?.name || 'Servidor')}</h2>
    <p class="sub mono">${escapeHtml(gid)}</p>
    <div class="grid-3" style="margin-top:16px">
      <div class="stat-card"><div class="stat-icon blue">👥</div><div class="stat-body"><div class="stat-value">${r.stats?.members||0}</div><div class="stat-label">Membros</div></div></div>
      <div class="stat-card"><div class="stat-icon green">🎫</div><div class="stat-body"><div class="stat-value">${r.stats?.tickets_open||0}</div><div class="stat-label">Tickets</div></div></div>
      <div class="stat-card"><div class="stat-icon amber">🎮</div><div class="stat-body"><div class="stat-value">${r.stats?.bets_30d||0}</div><div class="stat-label">Apostas 30d</div></div></div>
    </div>
  `;
  openModal('modalServer');
}
window.openDevServerActions = openDevServerActions;

// ═══════════════════════════════════════════════════════════
// MINHAS KEYS
// ═══════════════════════════════════════════════════════════
async function loadMyKeys() {
  const wrap = $('myKeysList');
  wrap.innerHTML = '';
  const r = await api('/api/me/keys-sent');
  if (!r.ok) return;
  const keys = r.keys || [];
  if (!keys.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">🎁</div><p>Nenhuma key recebida</p></div>';
    return;
  }
  wrap.innerHTML = keys.map(k => `
    <div class="session-card">
      <div class="session-icon">🔑</div>
      <div class="session-info">
        <div class="session-title">
          <code>${escapeHtml(k.key_code)}</code>
          <span class="badge ${k.is_pack ? 'badge-info' : 'badge-ok'}">${k.is_pack ? '📦 PACK' : PLANS_LABEL[k.tier] || k.tier}</span>
        </div>
        <div class="session-detail">
          <span>📅 ${fmtDate(k.sent_at)}</span>
          <span>${k.duracao_dias === 0 ? '♾️ Permanente' : `⏱️ ${k.duracao_dias} dias`}</span>
        </div>
      </div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════════
// SESSÕES
// ═══════════════════════════════════════════════════════════
async function loadSessions() {
  const wrap = $('sessionsList');
  wrap.innerHTML = '<div class="card">⏳ Carregando...</div>';

  $('btnRefreshSessions')?.addEventListener('click', () => loadSessions(), { once: true });
  $('btnRevokeAllSessions')?.addEventListener('click', async () => {
    if (!confirm('Revogar todas as outras sessões?')) return;
    const r = await api('/api/me/sessions', { method: 'DELETE' });
    if (r.ok) { toast('Sessões revogadas', 'ok'); loadSessions(); }
    else toast(r.error, 'error');
  }, { once: true });

  const r = await api('/api/me/sessions');
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌ ${escapeHtml(r.error)}</div>`; return; }
  const sessions = r.sessions || [];
  if (!sessions.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">🖥️</div><p>Nenhuma sessão ativa</p></div>'; return; }
  wrap.innerHTML = sessions.map(s => sessionCardHTML(s)).join('');
  wrap.querySelectorAll('[data-revoke]').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('Revogar esta sessão?')) return;
      const r = await api(`/api/me/sessions/${b.dataset.revoke}`, { method: 'DELETE' });
      if (r.ok) { toast('Sessão revogada', 'ok'); loadSessions(); }
      else toast(r.error, 'error');
    });
  });
}

function sessionCardHTML(s, current) {
  const icon = s.device_type === 'mobile' ? '📱' : '🖥️';
  return `
    <div class="session-card ${current ? 'current' : ''}">
      <div class="session-icon ${s.device_type}">${icon}</div>
      <div class="session-info">
        <div class="session-title">
          <span class="badge-device ${s.device_type || 'desktop'}">${escapeHtml(s.device_type || 'desktop')}</span>
          <span class="badge-browser badge-device">${escapeHtml(s.browser || '—')}</span>
          <span class="badge-os badge-device">${escapeHtml(s.os || '—')}</span>
        </div>
        <div class="session-detail">
          <span>🌐 <code>${escapeHtml(s.ip || '—')}</code></span>
          ${s.country ? `<span>📍 ${escapeHtml(s.country)}${s.city ? ' / ' + escapeHtml(s.city) : ''}</span>` : ''}
          <span>🕐 ${timeAgo(s.last_seen || s.created_at)}</span>
        </div>
      </div>
      <div class="session-actions">
        <button class="btn btn-danger btn-sm" data-revoke="${s.id}">🚫 Revogar</button>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
// NOTIFICAÇÕES
// ═══════════════════════════════════════════════════════════
function bindNotifications() {
  $('btnBell')?.addEventListener('click', () => {
    $('notifDrawer')?.classList.add('active');
    renderNotifications();
  });
  $('btnCloseDrawer')?.addEventListener('click', () => $('notifDrawer')?.classList.remove('active'));
  $('btnMarkAllReadDrawer')?.addEventListener('click', markAllRead);
  $('btnMarkAllRead')?.addEventListener('click', markAllRead);
}

async function loadNotifications() {
  try {
    const r = await api('/api/notifications?limit=30');
    if (!r.ok) return;
    APP.notifications = r.notifications || [];
    APP.unread = r.unread || 0;

    const badge = $('bellBadge');
    const navBadge = $('navNotifBadge');
    [badge, navBadge].forEach(b => {
      if (!b) return;
      if (APP.unread > 0) {
        b.textContent = APP.unread > 99 ? '99+' : APP.unread;
        b.classList.remove('hidden');
      } else b.classList.add('hidden');
    });
  } catch {}
}

function renderNotifications() {
  const body = $('drawerBody');
  if (!body) return;
  const list = APP.notifications || [];
  if (!list.length) {
    body.innerHTML = '<div class="empty-state"><div class="empty-icon">🔕</div><p>Sem notificações</p></div>';
    return;
  }
  body.innerHTML = list.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}" style="padding:12px;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer">
      <div style="font-weight:700;font-size:13px">${escapeHtml(n.title)}</div>
      <div style="font-size:12px;opacity:.8;margin-top:4px">${escapeHtml(n.content || '')}</div>
      <div style="font-size:11px;opacity:.6;margin-top:4px">${timeAgo(n.created_at)}</div>
    </div>
  `).join('');

  body.querySelectorAll('[data-id]').forEach(el => {
    el.addEventListener('click', async () => {
      await api(`/api/notifications/${el.dataset.id}/read`, { method: 'PATCH' });
      loadNotifications();
      renderNotifications();
    });
  });
}

async function loadNotificationsPage() {
  await loadNotifications();
  const wrap = $('notifList');
  const list = APP.notifications || [];
  if (!list.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">🔕</div><p>Sem notificações</p></div>';
    return;
  }
  wrap.innerHTML = list.map(n => `
    <div class="session-card ${n.read ? '' : 'current'}">
      <div class="session-icon">${n.type === 'key_received' ? '🔑' : n.type === 'alert' ? '⚠️' : '📢'}</div>
      <div class="session-info">
        <div class="session-title">${escapeHtml(n.title)}</div>
        <div class="session-detail"><span>${escapeHtml(n.content || '')}</span></div>
        <div class="session-detail"><span>🕐 ${timeAgo(n.created_at)}</span></div>
      </div>
    </div>
  `).join('');
}

async function markAllRead() {
  await api('/api/notifications/read-all', { method: 'POST' });
  loadNotifications();
  renderNotifications();
  if (APP.currentPage === 'notifications') loadNotificationsPage();
}

// ═══════════════════════════════════════════════════════════
// TICKETS GLOBAL
// ═══════════════════════════════════════════════════════════
async function loadTicketsGlobal() {
  const wrap = $('ticketsGlobalTable');
  wrap.innerHTML = '';
  const r = await api('/api/admin/tickets-global');
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌ ${escapeHtml(r.error)}</div>`; return; }
  const tickets = r.tickets || [];
  if (!tickets.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">🎫</div><p>Nenhum ticket aberto</p></div>'; return; }
  wrap.innerHTML = `
    <table class="audit-table">
      <thead><tr><th>Thread</th><th>Servidor</th><th>User</th><th>Tipo</th><th>Aberto</th></tr></thead>
      <tbody>
        ${tickets.map(t => `
          <tr>
            <td class="mono">${escapeHtml(t.thread_id?.slice(0,10) || '—')}...</td>
            <td class="mono">${escapeHtml(t.guild_id)}</td>
            <td class="mono">${escapeHtml(t.user_id)}</td>
            <td>${escapeHtml(t.type_id || '—')}</td>
            <td class="audit-time">${timeAgo(t.opened_at)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ═══════════════════════════════════════════════════════════
// FINANCEIRO
// ═══════════════════════════════════════════════════════════
async function loadFinancial() {
  const stats = $('financialStats');
  stats.innerHTML = '<div class="card">⏳</div>';
  const r = await api('/api/admin/financial');
  if (!r.ok) { stats.innerHTML = `<div class="card">❌ ${escapeHtml(r.error)}</div>`; return; }
  stats.innerHTML = `
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
        datasets: [{
          label: 'R$', data: r.daily.map(d => d.value),
          borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,.15)',
          fill: true, tension: .35,
        }],
      },
      options: { responsive: true, plugins: { legend: { display: false } } },
    });
  }
}

// ═══════════════════════════════════════════════════════════
// DEV — GERENCIAR SERVIDORES
// ═══════════════════════════════════════════════════════════
async function loadDevServers() {
  const wrap = $('devServersList');
  const stats = $('devServersStats');
  wrap.innerHTML = '<div class="card">⏳ Carregando...</div>';

  const params = new URLSearchParams();
  if ($('devServersSearch')?.value) params.set('search', $('devServersSearch').value);
  if ($('devServersMinMembers')?.value) params.set('min_members', $('devServersMinMembers').value);
  if ($('devServersPremium')?.value) params.set('has_premium', $('devServersPremium').value);

  const r = await api('/api/dev/servers?' + params);
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌ ${escapeHtml(r.error)}</div>`; return; }
  const servers = r.servers || [];
  const premiumCount = servers.filter(s => s.is_premium).length;

  stats.innerHTML = `
    <div class="stat-card"><div class="stat-icon blue">🌐</div><div class="stat-body"><div class="stat-value">${r.total || servers.length}</div><div class="stat-label">Servidores</div></div></div>
    <div class="stat-card"><div class="stat-icon green">💎</div><div class="stat-body"><div class="stat-value">${premiumCount}</div><div class="stat-label">Premium</div></div></div>
    <div class="stat-card"><div class="stat-icon amber">👥</div><div class="stat-body"><div class="stat-value">${fmtNumber(servers.reduce((a,s)=>a+(s.member_count||0),0))}</div><div class="stat-label">Membros totais</div></div></div>
  `;

  if (!servers.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">🛰️</div><p>Nenhum servidor encontrado</p></div>'; return; }
  wrap.innerHTML = servers.map(s => `
    <div class="server-card" data-dev-server="${escapeHtml(s.guild_id)}">
      <div class="server-icon">${s.icon ? `<img src="${escapeHtml(s.icon)}" alt="">` : '🛰️'}</div>
      <div class="server-info">
        <div class="server-name">${escapeHtml(s.name || 'Sem nome')}</div>
        <div class="server-id mono">${escapeHtml(s.guild_id)}</div>
        <div class="server-meta">
          <span>👥 ${fmtNumber(s.member_count || 0)}</span>
          ${s.is_premium ? '<span class="badge badge-ok">💎</span>' : ''}
        </div>
      </div>
      <div class="server-actions">
        <button class="btn btn-sm" data-action-btn="${escapeHtml(s.guild_id)}">⚡</button>
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-dev-server]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-action-btn]')) return;
      openServerDetail(el.dataset.devServer);
    });
  });
  wrap.querySelectorAll('[data-action-btn]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDevServerActions(btn.dataset.actionBtn);
    });
  });

  $('btnRefreshDevServers')?.addEventListener('click', loadDevServers, { once: true });
  $('devServersSearch')?.addEventListener('input', debounce(loadDevServers, 400), { once: true });
  $('devServersMinMembers')?.addEventListener('input', debounce(loadDevServers, 400), { once: true });
  $('devServersPremium')?.addEventListener('change', loadDevServers, { once: true });
  $('btnForceSyncAll')?.addEventListener('click', async () => {
    const r = await api('/api/dev/sync-servers', { method: 'POST' });
    if (r.ok) toast(r.message, 'ok'); else toast(r.error, 'error');
  }, { once: true });
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ═══════════════════════════════════════════════════════════
// DEV — BUSCAR SERVIDOR
// ═══════════════════════════════════════════════════════════
$('btnDevServerLookup')?.addEventListener('click', async () => {
  const gid = $('devServerLookupId').value.trim();
  if (!/^\d{15,25}$/.test(gid)) return toast('ID inválido', 'error');
  const wrap = $('devServerLookupResult');
  wrap.innerHTML = '<div class="card">⏳ Buscando...</div>';
  const r = await api(`/api/dev/servers/${gid}/full`);
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌ ${escapeHtml(r.error)}</div>`; return; }
  const g = r.guild || {};
  const cfg = r.config || {};
  const c = r.counts || {};
  wrap.innerHTML = `
    <div class="card card-highlight">
      <h3>🛰️ ${escapeHtml(g.name || 'Servidor')}</h3>
      <p class="hint mono">${escapeHtml(g.guild_id || gid)}</p>
      <div class="grid-3" style="margin-top:14px">
        <div class="stat-card"><div class="stat-icon blue">👥</div><div class="stat-body"><div class="stat-value">${fmtNumber(g.member_count||0)}</div><div class="stat-label">Membros</div></div></div>
        <div class="stat-card"><div class="stat-icon green">🎫</div><div class="stat-body"><div class="stat-value">${c.tickets_open||0}</div><div class="stat-label">Tickets</div></div></div>
        <div class="stat-card"><div class="stat-icon amber">🎮</div><div class="stat-body"><div class="stat-value">${c.bets_total||0}</div><div class="stat-label">Apostas</div></div></div>
      </div>
      <div style="margin-top:16px">
        <button class="btn" onclick="openDevServerActions('${gid}')">⚡ Ações</button>
        <button class="btn btn-secondary" onclick="navigate('dev-servers')">Voltar</button>
      </div>
    </div>
  `;
});

// ═══════════════════════════════════════════════════════════
// DEV — AÇÕES DO SERVIDOR
// ═══════════════════════════════════════════════════════════
function openDevServerActions(gid) {
  APP.currentServerActions = gid;
  $('devServerActionsTitle').textContent = '🛰️ Ações do Servidor';
  $('devServerActionsId').textContent = gid;
  clearMsg('devServerActionsMsg');
  openModal('modalDevServerActions');
}

$('actRename')?.addEventListener('click', async () => {
  const name = prompt('Novo nome do servidor (máx 100):');
  if (!name) return;
  const r = await api(`/api/dev/servers/${APP.currentServerActions}/rename`, {
    method: 'POST', body: JSON.stringify({ name }),
  });
  if (r.ok) { setMsg('devServerActionsMsg', '✅ Renomeado!', 'ok'); toast('Renomeado', 'ok'); }
  else setMsg('devServerActionsMsg', r.error, 'error');
});

$('actRefresh')?.addEventListener('click', async () => {
  const r = await api(`/api/dev/servers/${APP.currentServerActions}/refresh`, { method: 'POST' });
  if (r.ok) { setMsg('devServerActionsMsg', '✅ Atualizado!', 'ok'); toast('Dados atualizados', 'ok'); }
  else setMsg('devServerActionsMsg', r.error, 'error');
});

$('actForcePremium')?.addEventListener('click', async () => {
  const days = Number(prompt('Dias (0 = permanente):', '30'));
  const r = await api('/api/dev/force-premium', {
    method: 'POST',
    body: JSON.stringify({ scope: 'guild', target_id: APP.currentServerActions, days, reason: 'Ação DEV painel' }),
  });
  if (r.ok) { setMsg('devServerActionsMsg', '✅ Premium aplicado!', 'ok'); toast('Premium aplicado', 'ok'); }
  else setMsg('devServerActionsMsg', r.error, 'error');
});

$('actSyncMembers')?.addEventListener('click', async () => {
  if (!confirm('Levar membros via OAuth? Máx 50 por vez.')) return;
  const r = await api(`/api/me/servers/${APP.currentServerActions}/take-members`, {
    method: 'POST', body: JSON.stringify({ limit: 50 }),
  });
  if (r.ok) { setMsg('devServerActionsMsg', `✅ ${r.added} sucesso, ${r.failed} falha`, 'ok'); toast('Membros sincronizados', 'ok'); }
  else setMsg('devServerActionsMsg', r.error, 'error');
});

$('actLeave')?.addEventListener('click', async () => {
  if (!confirm('Fazer o bot sair deste servidor? Isso é irreversível.')) return;
  const r = await api(`/api/dev/servers/${APP.currentServerActions}/leave`, { method: 'POST' });
  if (r.ok) { toast('Bot saiu', 'ok'); closeModal('modalDevServerActions'); }
  else setMsg('devServerActionsMsg', r.error, 'error');
});

$('actNuke')?.addEventListener('click', async () => {
  const c = prompt('Digite CONFIRMAR para apagar TODOS os canais e cargos:');
  if (c !== 'CONFIRMAR') return;
  const r = await api(`/api/dev/servers/${APP.currentServerActions}/nuke`, {
    method: 'POST', body: JSON.stringify({ confirm: 'CONFIRMAR' }),
  });
  if (r.ok) { setMsg('devServerActionsMsg', `💥 ${r.deletedChannels} canais, ${r.deletedRoles} cargos apagados`, 'ok'); toast('Nuke completo', 'ok'); }
  else setMsg('devServerActionsMsg', r.error, 'error');
});

// ═══════════════════════════════════════════════════════════
// KILL SWITCH
// ═══════════════════════════════════════════════════════════
async function loadKillSwitch() {
  const r = await api('/api/dev/kill-switch');
  if (!r.ok) return;
  $('ksStatus').innerHTML = r.active
    ? `<div style="padding:12px;background:rgba(239,68,68,.15);border-radius:10px;color:#fca5a5">🔴 ATIVO — ${escapeHtml(r.reason || 'sem motivo')}</div>`
    : '<div style="padding:12px;background:rgba(34,197,94,.15);border-radius:10px;color:#86efac">🟢 Normal</div>';

  $('btnKillOn')?.addEventListener('click', async () => {
    const reason = $('ksReason').value.trim();
    if (!reason) return toast('Informe o motivo', 'error');
    const r = await api('/api/dev/kill-switch', { method: 'POST', body: JSON.stringify({ active: true, reason }) });
    if (r.ok) { toast('Kill switch ATIVADO', 'ok'); loadKillSwitch(); }
  }, { once: true });
  $('btnKillOff')?.addEventListener('click', async () => {
    const r = await api('/api/dev/kill-switch', { method: 'POST', body: JSON.stringify({ active: false }) });
    if (r.ok) { toast('Kill switch desativado', 'ok'); loadKillSwitch(); }
  }, { once: true });
}

// ═══════════════════════════════════════════════════════════
// MANUTENÇÃO
// ═══════════════════════════════════════════════════════════
async function loadMaintenance() {
  const r = await api('/api/dev/maintenance');
  if (!r.ok) return;
  $('mtStatus').innerHTML = r.active
    ? `<div style="padding:12px;background:rgba(239,68,68,.15);border-radius:10px;color:#fca5a5">🔴 ATIVA — ${escapeHtml(r.reason || 'sem motivo')}</div>`
    : '<div style="padding:12px;background:rgba(34,197,94,.15);border-radius:10px;color:#86efac">🟢 Normal</div>';

  $('btnMtOn')?.addEventListener('click', async () => {
    const reason = $('mtReason').value.trim();
    const r = await api('/api/dev/maintenance', { method: 'POST', body: JSON.stringify({ active: true, reason }) });
    if (r.ok) { toast('Manutenção ativada', 'ok'); loadMaintenance(); }
  }, { once: true });
  $('btnMtOff')?.addEventListener('click', async () => {
    const r = await api('/api/dev/maintenance', { method: 'POST', body: JSON.stringify({ active: false }) });
    if (r.ok) { toast('Manutenção desativada', 'ok'); loadMaintenance(); }
  }, { once: true });
}

// ═══════════════════════════════════════════════════════════
// FORCE PREMIUM
// ═══════════════════════════════════════════════════════════
async function loadForcePremium() {
  const wrap = $('fpList');
  wrap.innerHTML = '';
  const r = await api('/api/dev/force-premium');
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌</div>`; return; }
  const list = r.items || [];
  if (!list.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">💎</div><p>Nenhum ativo</p></div>'; return; }
  wrap.innerHTML = `
    <table class="audit-table">
      <thead><tr><th>Scope</th><th>Target</th><th>Expira</th><th>Motivo</th><th></th></tr></thead>
      <tbody>
        ${list.map(f => `
          <tr>
            <td><span class="badge badge-info">${escapeHtml(f.scope)}</span></td>
            <td class="mono">${escapeHtml(f.target_id)}</td>
            <td>${f.permanent ? '♾️' : (f.expires_at ? timeAgo(f.expires_at) : '—')}</td>
            <td>${escapeHtml(f.reason || '—')}</td>
            <td><button class="btn btn-sm btn-danger" data-del-fp="${f.id}">🗑️</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  wrap.querySelectorAll('[data-del-fp]').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('Remover?')) return;
      const r = await api(`/api/dev/force-premium/${b.dataset.delFp}`, { method: 'DELETE' });
      if (r.ok) loadForcePremium();
    });
  });

  $('btnFpAdd')?.addEventListener('click', async () => {
    const body = {
      scope: $('fpScope').value,
      target_id: $('fpTarget').value.trim(),
      days: Number($('fpDays').value) || 0,
      reason: $('fpReason').value.trim() || null,
    };
    if (!body.target_id) return toast('Informe o ID', 'error');
    const r = await api('/api/dev/force-premium', { method: 'POST', body: JSON.stringify(body) });
    if (r.ok) { toast('Adicionado', 'ok'); loadForcePremium(); }
    else toast(r.error, 'error');
  }, { once: true });
}

// ═══════════════════════════════════════════════════════════
// BROADCAST
// ═══════════════════════════════════════════════════════════
$('btnBcSend')?.addEventListener('click', async () => {
  const title = $('bcTitle').value.trim();
  const content = $('bcContent').value.trim();
  const role = $('bcRole').value;
  if (!title || !content) return toast('Preencha título e conteúdo', 'error');
  const r = await api('/api/dev/broadcast', {
    method: 'POST', body: JSON.stringify({ title, content, role: role || undefined }),
  });
  if (r.ok) { toast(`${r.sent} notificações enviadas`, 'ok'); $('bcTitle').value = ''; $('bcContent').value = ''; }
  else toast(r.error, 'error');
});

$('btnForceUpdate')?.addEventListener('click', async () => {
  const r = await api('/api/dev/force-update', { method: 'POST' });
  if (r.ok) toast('Resetado', 'ok'); else toast(r.error, 'error');
});

// ═══════════════════════════════════════════════════════════
// BACKUP
// ═══════════════════════════════════════════════════════════
$('btnDownloadBackup')?.addEventListener('click', () => {
  window.open('/api/dev/backup', '_blank');
});
$('btnForceSync')?.addEventListener('click', async () => {
  const r = await api('/api/dev/sync-servers', { method: 'POST' });
  if (r.ok) toast(r.message, 'ok'); else toast(r.error, 'error');
});

// ═══════════════════════════════════════════════════════════
// USUÁRIOS
// ═══════════════════════════════════════════════════════════
async function loadUsuarios() {
  const wrap = $('usersTable');
  wrap.innerHTML = '⏳';
  const params = new URLSearchParams();
  if ($('userSearch')?.value) params.set('search', $('userSearch').value);
  if ($('userFilterRole')?.value) params.set('role', $('userFilterRole').value);
  if ($('userFilterPlan')?.value) params.set('plan', $('userFilterPlan').value);
  if ($('userFilterAtivo')?.value) params.set('ativo', $('userFilterAtivo').value);

  const r = await api('/api/dev/usuarios?' + params);
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌ ${escapeHtml(r.error)}</div>`; return; }
  const users = r.usuarios || [];
  if (!users.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p>Nenhum usuário</p></div>'; return; }
  wrap.innerHTML = `
    <table class="audit-table">
      <thead><tr><th>E-mail</th><th>Discord</th><th>Role</th><th>Plano</th><th>Status</th><th>Criado</th><th></th></tr></thead>
      <tbody>
        ${users.map(u => `
          <tr>
            <td>${escapeHtml(u.email)}</td>
            <td class="mono">${escapeHtml(u.discord_id || '—')}</td>
            <td>${ROLES_LABEL[u.role] || u.role}</td>
            <td>${PLANS_LABEL[u.plan] || u.plan || '—'}</td>
            <td>${u.ativo ? '<span class="badge badge-ok">ATIVO</span>' : '<span class="badge badge-fail">INATIVO</span>'}</td>
            <td class="audit-time">${timeAgo(u.created_at)}</td>
            <td>
              <button class="btn btn-sm" data-sessions="${u.user_id}" data-email="${escapeHtml(u.email)}">🖥️</button>
              <button class="btn btn-sm btn-danger" data-del-user="${u.user_id}">🚫</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-sessions]').forEach(b => {
    b.addEventListener('click', () => openUserSessions(b.dataset.sessions, b.dataset.email));
  });
  wrap.querySelectorAll('[data-del-user]').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('Desativar este usuário?')) return;
      const r = await api(`/api/dev/usuarios/${b.dataset.delUser}`, { method: 'DELETE' });
      if (r.ok) { toast('Desativado', 'ok'); loadUsuarios(); }
      else toast(r.error, 'error');
    });
  });

  $('btnNovoUsuario')?.addEventListener('click', () => {
    $('modalUserId').value = '';
    $('modalUserEmail').value = '';
    $('modalUserDiscord').value = '';
    $('modalUserNome').value = '';
    $('modalUserRole').value = 'cliente';
    $('modalUserPlan').value = 'basic';
    $('modalUserPassword').value = '';
    $('modalUserGuilds').value = '';
    $('modalUserNotes').value = '';
    $('modalUserTitle').textContent = '➕ Novo Usuário';
    $('btnSaveUser').textContent = 'Criar';
    clearMsg('modalUserMsg');
    openModal('modalUser');
  }, { once: true });

  $('btnRefreshUsers')?.addEventListener('click', loadUsuarios, { once: true });
  $('userSearch')?.addEventListener('input', debounce(loadUsuarios, 400), { once: true });
  $('userFilterRole')?.addEventListener('change', loadUsuarios, { once: true });
  $('userFilterPlan')?.addEventListener('change', loadUsuarios, { once: true });
  $('userFilterAtivo')?.addEventListener('change', loadUsuarios, { once: true });
}

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
  toast('Usuário salvo', 'ok');
  loadUsuarios();
  if (!r.temp_password) setTimeout(() => closeModal('modalUser'), 1200);
});

// ═══════════════════════════════════════════════════════════
// APROVAÇÕES
// ═══════════════════════════════════════════════════════════
async function loadPending() {
  const wrap = $('pendingList');
  wrap.innerHTML = '';
  const r = await api('/api/dev/usuarios/pending');
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌</div>`; return; }
  const pend = r.pendentes || [];
  if (!pend.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>Nenhum pendente</p></div>'; return; }
  wrap.innerHTML = pend.map(u => `
    <div class="session-card">
      <div class="session-icon">⏳</div>
      <div class="session-info">
        <div class="session-title">${escapeHtml(u.email)}</div>
        <div class="session-detail">
          <span>🎮 <code>${escapeHtml(u.discord_id || '—')}</code></span>
          <span>🕐 ${timeAgo(u.created_at)}</span>
        </div>
      </div>
      <div class="session-actions">
        <button class="btn btn-success btn-sm" data-approve="${u.user_id}" data-email="${escapeHtml(u.email)}">✅ Aprovar</button>
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-approve]').forEach(b => {
    b.addEventListener('click', () => {
      $('approveUserId').value = b.dataset.approve;
      $('approveEmail').textContent = b.dataset.email;
      $('approveRole').value = 'cliente';
      $('approvePlan').value = 'basic';
      $('approveGuilds').value = '';
      $('approveNotes').value = '';
      clearMsg('approveMsg');
      openModal('modalApprove');
    });
  });
}

$('approveForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const userId = $('approveUserId').value;
  const body = {
    role: $('approveRole').value,
    plan: $('approvePlan').value,
    assigned_guilds: $('approveGuilds').value.split(',').map(x => x.trim()).filter(Boolean),
    notes: $('approveNotes').value.trim() || null,
  };
  const r = await api(`/api/dev/usuarios/${userId}/approve`, { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) return setMsg('approveMsg', r.error, 'error');
  toast('Aprovado!', 'ok');
  closeModal('modalApprove');
  loadPending();
});

// ═══════════════════════════════════════════════════════════
// AUDITORIA
// ═══════════════════════════════════════════════════════════
async function loadAudit() {
  // Stats
  const stats = $('auditStats');
  const rs = await api('/api/dev/audit/stats');
  if (rs.ok) {
    stats.innerHTML = `
      <div class="stat-card"><div class="stat-icon blue">📋</div><div class="stat-body"><div class="stat-value">${fmtNumber(rs.stats.total)}</div><div class="stat-label">Total</div></div></div>
      <div class="stat-card"><div class="stat-icon red">❌</div><div class="stat-body"><div class="stat-value">${fmtNumber(rs.stats.failed)}</div><div class="stat-label">Falhas</div></div></div>
      <div class="stat-card"><div class="stat-icon green">✅</div><div class="stat-body"><div class="stat-value">${fmtNumber(rs.stats.logins_7d)}</div><div class="stat-label">Logins 7d</div></div></div>
      <div class="stat-card"><div class="stat-icon amber">⚠️</div><div class="stat-body"><div class="stat-value">${fmtNumber(rs.stats.logins_failed_7d)}</div><div class="stat-label">Falhas 7d</div></div></div>
      <div class="stat-card"><div class="stat-icon red">🚫</div><div class="stat-body"><div class="stat-value">${fmtNumber(rs.stats.access_denied_7d)}</div><div class="stat-label">Access denied 7d</div></div></div>
    `;
  }

  APP.auditPage = 0;
  await loadAuditTable();

  $('btnAuditFilter')?.addEventListener('click', () => { APP.auditPage = 0; loadAuditTable(); }, { once: true });
  $('btnAuditRefresh')?.addEventListener('click', () => { loadAudit(); }, { once: true });
  $('btnAuditClear')?.addEventListener('click', () => {
    ['auditFilterAction','auditFilterActor','auditFilterTarget','auditFilterIp','auditFilterFrom','auditFilterTo'].forEach(id => $(id).value = '');
    $('auditFilterSuccess').value = '';
    loadAudit();
  }, { once: true });
  $('btnAuditExport')?.addEventListener('click', () => {
    const p = new URLSearchParams();
    if ($('auditFilterAction')?.value) p.set('action', $('auditFilterAction').value);
    if ($('auditFilterFrom')?.value) p.set('from', new Date($('auditFilterFrom').value).toISOString());
    if ($('auditFilterTo')?.value) p.set('to', new Date($('auditFilterTo').value).toISOString());
    window.open('/api/dev/audit/export?' + p, '_blank');
  }, { once: true });
  $('btnAuditPrev')?.addEventListener('click', () => {
    if (APP.auditPage > 0) { APP.auditPage--; loadAuditTable(); }
  }, { once: true });
  $('btnAuditNext')?.addEventListener('click', () => {
    APP.auditPage++; loadAuditTable();
  }, { once: true });
}

async function loadAuditTable() {
  const wrap = $('auditTable');
  wrap.innerHTML = '<div class="card">⏳</div>';

  const params = new URLSearchParams();
  if ($('auditFilterAction')?.value) params.set('action', $('auditFilterAction').value);
  if ($('auditFilterActor')?.value) params.set('actor_id', $('auditFilterActor').value);
  if ($('auditFilterTarget')?.value) params.set('target_id', $('auditFilterTarget').value);
  if ($('auditFilterIp')?.value) params.set('ip', $('auditFilterIp').value);
  if ($('auditFilterFrom')?.value) params.set('from', new Date($('auditFilterFrom').value).toISOString());
  if ($('auditFilterTo')?.value) params.set('to', new Date($('auditFilterTo').value).toISOString());
  if ($('auditFilterSuccess')?.value) params.set('success', $('auditFilterSuccess').value);
  const limit = Number($('auditFilterLimit')?.value) || 100;
  params.set('limit', limit);
  params.set('offset', APP.auditPage * limit);

  const r = await api('/api/dev/audit?' + params);
  if (!r.ok) { wrap.innerHTML = `<div class="card">❌ ${escapeHtml(r.error)}</div>`; return; }
  const logs = r.logs || [];
  if (!logs.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Nenhum evento</p></div>'; return; }

  const totalPages = Math.ceil(r.total / limit);
  $('auditPaginationInfo').textContent = `Página ${APP.auditPage + 1} de ${totalPages || 1} • ${fmtNumber(r.total)} eventos`;
  $('btnAuditPrev').disabled = APP.auditPage === 0;
  $('btnAuditNext').disabled = APP.auditPage >= totalPages - 1;

  wrap.innerHTML = `
    <table class="audit-table">
      <thead><tr>
        <th>Data</th><th>Ação</th><th>Actor</th><th>IP</th><th>Device</th><th>Status</th>
      </tr></thead>
      <tbody>
        ${logs.map(l => `
          <tr class="${l.success === false ? 'fail' : 'success'}" data-audit-id="${l.id}">
            <td class="audit-time">${timeAgo(l.created_at)}</td>
            <td><span class="audit-action">${escapeHtml(l.action)}</span></td>
            <td class="audit-actor">${escapeHtml(l.actor_email || l.actor_id || '—')}</td>
            <td><span class="audit-ip">${escapeHtml(l.ip || '—')}</span></td>
            <td>
              <div class="audit-device">
                <span class="badge-device ${l.device_type || 'desktop'}">${escapeHtml(l.device_type || '?')}</span>
                <span class="badge-browser badge-device">${escapeHtml(l.browser || '?')}</span>
                <span class="badge-os badge-device">${escapeHtml(l.os || '?')}</span>
              </div>
            </td>
            <td>${l.success !== false ? '<span class="badge badge-ok">OK</span>' : `<span class="badge badge-fail">${escapeHtml(l.error_reason || 'FAIL')}</span>`}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-audit-id]').forEach(tr => {
    tr.addEventListener('click', () => {
      const log = logs.find(x => String(x.id) === tr.dataset.auditId);
      if (log) showAuditDetail(log);
    });
  });
}

function showAuditDetail(log) {
  const body = $('auditDetailBody');
  const row = (label, value, isCode) => `
    <div class="detail-row">
      <div class="detail-label">${escapeHtml(label)}</div>
      <div class="detail-value">${isCode ? `<code>${escapeHtml(value)}</code>` : escapeHtml(value || '—')}</div>
    </div>
  `;
  body.innerHTML = `
    <div class="detail-section-title">Identificação</div>
    ${row('ID', log.id, true)}
    ${row('Ação', log.action, true)}
    ${row('Data', fmtDate(log.created_at))}
    ${row('Sucesso', log.success !== false ? '✅ Sim' : '❌ Não')}
    ${log.error_reason ? row('Motivo do erro', log.error_reason) : ''}

    <div class="detail-section-title">Usuário</div>
    ${row('Actor ID', log.actor_id, true)}
    ${row('Actor Email', log.actor_email || '—')}
    ${log.target_id ? row('Target ID', log.target_id, true) : ''}
    ${log.target_role ? row('Target Role', log.target_role) : ''}

    <div class="detail-section-title">Rede</div>
    ${row('IP', log.ip || '—', true)}
    ${log.country ? row('País', log.country) : ''}
    ${log.city ? row('Cidade', log.city) : ''}
    ${row('Device', log.device_type || '—')}
    ${row('Browser', log.browser || '—')}
    ${row('OS', log.os || '—')}
    ${row('User Agent', log.user_agent || '—')}
    ${log.referer ? row('Referer', log.referer) : ''}
    ${log.accept_language ? row('Idioma', log.accept_language) : ''}

    ${log.duration_ms ? `<div class="detail-section-title">Performance</div>${row('Duração', log.duration_ms + 'ms')}` : ''}

    ${log.metadata && Object.keys(log.metadata).length ? `
      <div class="detail-section-title">Metadata</div>
      <pre>${escapeHtml(JSON.stringify(log.metadata, null, 2))}</pre>
    ` : ''}
  `;
  openModal('modalAuditDetail');
}

// ═══════════════════════════════════════════════════════════
// USER SESSIONS (dev vê outro user)
// ═══════════════════════════════════════════════════════════
async function openUserSessions(userId, email) {
  APP.currentUserSessions = userId;
  $('userSessionsTarget').textContent = email;
  openModal('modalUserSessions');
  await loadUserSessions();

  $('btnRefreshUserSessions')?.addEventListener('click', loadUserSessions, { once: true });
  $('btnRevokeAllUserSessions')?.addEventListener('click', async () => {
    if (!confirm('Revogar TODAS as sessões deste usuário?')) return;
    const r = await api(`/api/dev/user/${userId}/sessions`, { method: 'DELETE' });
    if (r.ok) { toast('Sessões revogadas', 'ok'); loadUserSessions(); }
  }, { once: true });
}

async function loadUserSessions() {
  const wrap = $('userSessionsList');
  wrap.innerHTML = '⏳';
  const r = await api(`/api/dev/user/${APP.currentUserSessions}/sessions`);
  if (!r.ok) { wrap.innerHTML = `❌ ${escapeHtml(r.error)}`; return; }
  const sessions = r.sessions || [];
  if (!sessions.length) { wrap.innerHTML = '<div class="empty-state"><p>Nenhuma sessão ativa</p></div>'; return; }
  wrap.innerHTML = sessions.map(s => sessionCardHTML(s)).join('');
}

// ═══════════════════════════════════════════════════════════
// COMMAND PALETTE
// ═══════════════════════════════════════════════════════════
const CMD_ITEMS = [
  { label: 'Dashboard', icon: '📊', nav: 'dashboard', roles: ['dev','admin','funcionario','cliente'] },
  { label: 'Keys', icon: '🔑', nav: 'keys', roles: ['dev','admin','funcionario'] },
  { label: 'Packs', icon: '📦', nav: 'packs', roles: ['dev'] },
  { label: 'Meus Servidores', icon: '🌐', nav: 'servers', roles: ['dev','admin','funcionario','cliente'] },
  { label: 'Minhas Keys', icon: '🎁', nav: 'my-keys', roles: ['dev','admin','funcionario','cliente'] },
  { label: 'Minhas Sessões', icon: '🖥️', nav: 'sessions', roles: ['dev','admin','funcionario','cliente'] },
  { label: 'Notificações', icon: '🔔', nav: 'notifications', roles: ['dev','admin','funcionario','cliente'] },
  { label: 'Tickets Global', icon: '🎫', nav: 'tickets-global', roles: ['dev','admin'] },
  { label: 'Financeiro', icon: '💰', nav: 'financial', roles: ['dev','admin'] },
  { label: 'Gerenciar Servidores', icon: '🛰️', nav: 'dev-servers', roles: ['dev'] },
  { label: 'Buscar Servidor', icon: '🔎', nav: 'dev-server-search', roles: ['dev'] },
  { label: 'Kill Switch', icon: '🚨', nav: 'kill-switch', roles: ['dev'] },
  { label: 'Manutenção', icon: '🔧', nav: 'maintenance', roles: ['dev'] },
  { label: 'Force Premium', icon: '💎', nav: 'force-premium', roles: ['dev'] },
  { label: 'Broadcast', icon: '📢', nav: 'broadcast', roles: ['dev'] },
  { label: 'Backup', icon: '💾', nav: 'backup', roles: ['dev'] },
  { label: 'Usuários', icon: '👥', nav: 'usuarios', roles: ['dev'] },
  { label: 'Aprovações', icon: '⏳', nav: 'pending', roles: ['dev'] },
  { label: 'Auditoria', icon: '📋', nav: 'logs', roles: ['dev'] },
];

let _cmdkIndex = 0;
let _cmdkFiltered = [];

function bindCommandPalette() {
  $('btnCmdTrigger')?.addEventListener('click', openCmdk);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCmdk();
    }
    if (e.key === 'Escape' && $('cmdPalette')?.classList.contains('active')) {
      closeCmdk();
    }
  });

  const input = $('cmdInput');
  input?.addEventListener('input', () => renderCmdkResults(input.value));
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); _cmdkIndex = Math.min(_cmdkIndex + 1, _cmdkFiltered.length - 1); renderCmdkHighlight(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); _cmdkIndex = Math.max(_cmdkIndex - 1, 0); renderCmdkHighlight(); }
    if (e.key === 'Enter') { e.preventDefault(); const item = _cmdkFiltered[_cmdkIndex]; if (item) { closeCmdk(); navigate(item.nav); } }
  });

  $('cmdPalette')?.addEventListener('click', (e) => {
    if (e.target.id === 'cmdPalette') closeCmdk();
  });
}

function openCmdk() {
  $('cmdPalette')?.classList.add('active');
  $('cmdInput').value = '';
  renderCmdkResults('');
  setTimeout(() => $('cmdInput').focus(), 50);
}
function closeCmdk() { $('cmdPalette')?.classList.remove('active'); }

function renderCmdkResults(query) {
  const role = APP.admin?.role || 'cliente';
  const q = String(query || '').toLowerCase();
  _cmdkFiltered = CMD_ITEMS
    .filter(it => it.roles.includes(role))
    .filter(it => !q || it.label.toLowerCase().includes(q));
  _cmdkIndex = 0;

  const wrap = $('cmdResults');
  if (!_cmdkFiltered.length) {
    wrap.innerHTML = '<div style="padding:20px;text-align:center;opacity:.5">Nada encontrado</div>';
    return;
  }
  wrap.innerHTML = _cmdkFiltered.map((it, i) => `
    <div class="cmd-item ${i === 0 ? 'active' : ''}" data-idx="${i}">
      <span style="font-size:18px">${it.icon}</span>
      <span>${escapeHtml(it.label)}</span>
    </div>
  `).join('');
  wrap.querySelectorAll('.cmd-item').forEach(el => {
    el.addEventListener('click', () => {
      const item = _cmdkFiltered[Number(el.dataset.idx)];
      if (item) { closeCmdk(); navigate(item.nav); }
    });
    el.addEventListener('mouseenter', () => { _cmdkIndex = Number(el.dataset.idx); renderCmdkHighlight(); });
  });
}

function renderCmdkHighlight() {
  $$('#cmdResults .cmd-item').forEach((el, i) => el.classList.toggle('active', i === _cmdkIndex));
  const el = $(`#cmdResults .cmd-item[data-idx="${_cmdkIndex}"]`);
  if (el) el.scrollIntoView({ block: 'nearest' });
}

// ═══════════════════════════════════════════════════════════
// BOOT INICIAL
// ═══════════════════════════════════════════════════════════
(async function boot() {
  // Tenta sessão existente
  try {
    const r = await api('/api/auth/me');
    if (r.ok && r.admin) {
      APP.user = r.user;
      APP.admin = r.admin;
      // CSRF é regerado só ao logar, então aqui usa o cookie atual
      APP.csrf = document.cookie.match(/frio_csrf=([^;]+)/)?.[1] || null;
      await bootApp();
      return;
    }
  } catch {}

  // Sem sessão — mostra login
  showAuthView('view-login');
})();

// Atalhos extras
document.addEventListener('click', (e) => {
  // Fechar modais clicando fora
  if (e.target.classList?.contains('modal') && e.target.classList.contains('active')) {
    e.target.classList.remove('active');
    document.body.style.overflow = '';
  }
});
