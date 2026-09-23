// ═══════════════════════════════════════════════════════════
// FRIO PANEL v3.1 — Frontend
// ═══════════════════════════════════════════════════════════

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
}
function fmtDate(d)      { return d ? new Date(d).toLocaleString('pt-BR') : '—'; }
function fmtDateShort(d) { return d ? new Date(d).toLocaleDateString('pt-BR') : '—'; }
function timeAgo(d) {
  if (!d) return '—';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `${Math.floor(s/60)}min`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  if (s < 2592000) return `${Math.floor(s/86400)}d`;
  return fmtDateShort(d);
}

// ═══ API (Bearer + localStorage + fallback cookie) ═══
const api = async (url, opts = {}) => {
  const token = localStorage.getItem('sb_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(opts.headers || {}),
  };
  const r = await fetch(url, { credentials: 'include', ...opts, headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) localStorage.removeItem('sb_token');
    const err = new Error(j.error || `HTTP ${r.status}`);
    err.code = j.code;
    err.hint = j.hint;
    err.status = r.status;
    throw err;
  }
  return j;
};

const state = {
  user: null, admin: null, role: null,
  pollTimer: null, currentPage: 'dashboard',
  notifications: [], unread: 0,
  currentServer: null,
};

// ═══ Helpers UI ═══
function toast(text, type = 'ok', ms = 3200) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = text;
  t.className = `toast ${type} active`;
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('active'), ms);
}
window.closeModal = (id) => $('#' + id)?.classList.remove('active');
function openModal(id) { $('#' + id)?.classList.add('active'); }
function showMsg(el, text, type = 'error') {
  const e = typeof el === 'string' ? $(el) : el;
  if (!e) return;
  e.textContent = text;
  e.className = `msg ${type}`;
  e.style.display = 'block';
  if (type === 'ok') setTimeout(() => { e.style.display = 'none'; }, 4500);
}

// ═══ Views ═══
function showView(name) {
  ['login', 'register', 'reset'].forEach(v => {
    const el = $(`#view-${v}`);
    if (el) el.style.display = v === name ? 'flex' : 'none';
  });
  const app = $('#view-app');
  if (app) app.classList.toggle('active', name === 'app');
}

// ═══ Sidebar ═══
function buildSidebar() {
  const role = state.role;
  $$('#sidebar a[data-nav]').forEach(a => {
    const roles = (a.dataset.roles || '').split(',').filter(Boolean);
    const allowed = !roles.length || roles.includes(role);
    a.classList.toggle('hidden', !allowed);
  });
  $$('#sidebar .section-title').forEach(st => {
    if (st.classList.contains('dev-only')) st.classList.toggle('hidden', role !== 'dev');
  });
}

function goToPage(name) {
  state.currentPage = name;
  $$('#sidebar a[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === name));
  $$('.app-main .page').forEach(p => p.classList.toggle('active', p.id === `page-${name}`));
  closeSidebar();
  if (name === 'dashboard')     renderDashboard();
  if (name === 'keys')          { loadKeys(); loadRedemptions(); }
  if (name === 'servers')       loadServers();
  if (name === 'notifications') { renderNotifPage(); loadNotifications(); }
  if (name === 'usuarios')      loadUsers();
  if (name === 'pending')       loadPending();
  if (name === 'logs')          loadLogs();
  if (name === 'kill-switch')   loadKillSwitch();
  if (name === 'maintenance')   loadMaintenance();
  if (name === 'force-premium') loadForcePremium();
  if (name === 'broadcast')     { /* nada pra carregar */ }
}
function openSidebar()  { $('#sidebar')?.classList.add('open'); $('#sidebarOverlay')?.classList.add('active'); }
function closeSidebar() { $('#sidebar')?.classList.remove('open'); $('#sidebarOverlay')?.classList.remove('active'); }

// ═══ Boot ═══
async function boot() {
  const hash = new URLSearchParams(window.location.hash.substring(1));
  const resetToken = hash.get('access_token');
  if (resetToken) { window.__RESET_TOKEN__ = resetToken; showView('reset'); return; }

  const token = localStorage.getItem('sb_token');
  if (!token) { showView('login'); return; }

  try {
    const me = await api('/api/auth/me');
    hydrateApp(me);
  } catch (err) {
    if (err.status === 401) localStorage.removeItem('sb_token');
    showView('login');
  }
}

function hydrateApp({ user, admin }) {
  state.user = user;
  state.admin = admin;
  state.role = admin.role;
  $('#userEmail').textContent = user.email;
  const rl = $('#userRole');
  if (rl) { rl.textContent = admin.role.toUpperCase(); rl.className = `badge ${admin.role}`; }
  const dr = $('#dashRole');
  if (dr) { dr.textContent = admin.role.toUpperCase(); dr.className = `badge ${admin.role}`; }
  buildSidebar();
  showView('app');
  renderDashboard();
  loadNotifications();
  startPolling();
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
async function renderDashboard() {
  const grid = $('#dashStats');
  if (!grid) return;
  grid.innerHTML = '<div class="loading">Carregando…</div>';
  try {
    if (state.role === 'cliente') {
      const { servers } = await api('/api/me/servers');
      grid.innerHTML = `<div class="stat-card"><div class="num">${servers.length}</div><div class="lbl">Meus Servidores</div></div>`;
      return;
    }
    const [keys, reds] = await Promise.all([
      api('/api/keys').catch(() => ({ keys: [] })),
      api('/api/redemptions').catch(() => ({ redemptions: [] })),
    ]);
    const ativas = keys.keys.filter(k => k.ativo).length;
    grid.innerHTML = `
      <div class="stat-card"><div class="num">${keys.keys.length}</div><div class="lbl">Keys Totais</div></div>
      <div class="stat-card"><div class="num">${ativas}</div><div class="lbl">Keys Ativas</div></div>
      <div class="stat-card"><div class="num">${keys.keys.length - ativas}</div><div class="lbl">Esgotadas</div></div>
      <div class="stat-card"><div class="num">${reds.redemptions.length}</div><div class="lbl">Resgates</div></div>
    `;
  } catch (e) {
    grid.innerHTML = `<div class="empty">❌ ${escapeHtml(e.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════
// KEYS
// ═══════════════════════════════════════════════════════════
$('#genForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  if (btn) btn.disabled = true;
  const box = $('#genResult');
  box.innerHTML = '<div class="loading">Gerando…</div>';
  try {
    const r = await api('/api/keys/generate', {
      method: 'POST',
      body: JSON.stringify({
        tier: $('#genTier').value,
        duracao_dias: Number($('#genDuracao').value),
        quantidade: Number($('#genQtd').value),
        max_usos: Number($('#genMaxUsos').value),
        validade_key_dias: Number($('#genValidade').value),
        motivo: $('#genMotivo').value.trim() || null,
      }),
    });
    box.innerHTML = `<p style="margin-bottom:12px;color:#4ade80;font-size:14px">✅ <b>${r.keys.length}</b> key(s) gerada(s)</p>` +
      r.keys.map(k => `
        <div class="key-row">
          <div>
            <span class="code">${escapeHtml(k.key_code)}</span>
            <span class="meta">· ${escapeHtml(k.tier)} · ${k.duracao_dias === 0 ? '♾️' : k.duracao_dias + 'd'}</span>
          </div>
          <button type="button" onclick="copyText(this,'${escapeHtml(k.key_code)}')">📋 Copiar</button>
        </div>`).join('');
    toast(`${r.keys.length} key(s) gerada(s)!`);
    loadKeys();
  } catch (err) {
    box.innerHTML = `<p style="color:#f87171">❌ ${escapeHtml(err.message)}</p>`;
  } finally {
    if (btn) btn.disabled = false;
  }
});

window.copyText = function (btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    const old = btn.textContent;
    btn.textContent = '✅ Copiado!';
    setTimeout(() => { btn.textContent = old; }, 1500);
  });
};

async function loadKeys() {
  const t = $('#keysTable');
  if (!t) return;
  t.innerHTML = '<div class="loading">Carregando…</div>';
  try {
    const params = new URLSearchParams();
    if ($('#filterStatus')?.value) params.set('status', $('#filterStatus').value);
    if ($('#filterTier')?.value)   params.set('tier', $('#filterTier').value);
    const r = await api('/api/keys?' + params);
    if (!r.keys.length) {
      t.innerHTML = '<div class="empty"><span class="icon">📭</span>Nenhuma key encontrada</div>';
      return;
    }
    t.innerHTML = `
      <table>
        <thead><tr>
          <th>Key</th><th>Tier</th><th>Duração</th><th>Usos</th>
          <th>Gerada por</th><th>Status</th><th>Criada</th><th></th>
        </tr></thead>
        <tbody>${r.keys.map(k => `
          <tr>
            <td><code>${escapeHtml(k.key_code)}</code></td>
            <td><span class="badge ${escapeHtml(k.tier)}">${escapeHtml(k.tier)}</span></td>
            <td>${k.duracao_dias === 0 ? '♾️' : k.duracao_dias + 'd'}</td>
            <td>${k.usos_atuais}/${k.max_usos}</td>
            <td class="wrap">${escapeHtml(k.gerado_por_email || '—')}</td>
            <td><span class="badge ${k.ativo ? 'active' : 'used'}">${k.ativo ? 'Ativa' : 'Esgotada'}</span></td>
            <td>${fmtDateShort(k.created_at)}</td>
            <td><button type="button" class="btn btn-sm" onclick="copyText(this,'${escapeHtml(k.key_code)}')">📋</button></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    t.innerHTML = `<div class="empty" style="color:#f87171">❌ ${escapeHtml(err.message)}</div>`;
  }
}

async function loadRedemptions() {
  const t = $('#redemptionsTable');
  if (!t) return;
  t.innerHTML = '<div class="loading">Carregando…</div>';
  try {
    const r = await api('/api/redemptions');
    if (!r.redemptions.length) {
      t.innerHTML = '<div class="empty"><span class="icon">🎁</span>Nenhum resgate ainda</div>';
      return;
    }
    t.innerHTML = `
      <table>
        <thead><tr>
          <th>Key</th><th>Tier</th><th>Servidor</th><th>Resgatado por</th><th>Expira</th><th>Data</th>
        </tr></thead>
        <tbody>${r.redemptions.map(x => `
          <tr>
            <td><code>${escapeHtml(x.key_code)}</code></td>
            <td><span class="badge ${escapeHtml(x.tier)}">${escapeHtml(x.tier)}</span></td>
            <td class="wrap">${escapeHtml(x.guild_name || x.guild_id)}</td>
            <td class="wrap">${escapeHtml(x.resgatado_por_tag || x.resgatado_por)}</td>
            <td>${x.premium_expires_at ? fmtDateShort(x.premium_expires_at) : '♾️'}</td>
            <td>${fmtDateShort(x.created_at)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    t.innerHTML = `<div class="empty" style="color:#f87171">❌ ${escapeHtml(err.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════
// SERVIDORES — lista
// ═══════════════════════════════════════════════════════════
async function loadServers() {
  const g = $('#serversGrid');
  if (!g) return;
  g.innerHTML = '<div class="loading">Carregando…</div>';
  try {
    const { servers } = await api('/api/me/servers');
    if (!servers.length) {
      g.innerHTML = '<div class="empty"><span class="icon">🌐</span>Nenhum servidor atribuído</div>';
      return;
    }
    g.innerHTML = servers.map(s => {
      const gid = s.guild_id || s.id;
      return `
        <div class="server-card" data-guild="${escapeHtml(gid)}">
          <div class="head">
            <div class="ico">${s.icon ? `<img src="${escapeHtml(s.icon)}" alt="">` : '🌐'}</div>
            <div style="min-width:0">
              <div class="name">${escapeHtml(s.name || '—')}</div>
              <div class="meta">${escapeHtml(String(gid))}</div>
            </div>
          </div>
          <div class="stats"><span>👥 ${s.member_count ?? '—'}</span></div>
        </div>`;
    }).join('');
    g.querySelectorAll('[data-guild]').forEach(el => {
      el.addEventListener('click', () => openServerDetail(el.dataset.guild));
    });
  } catch (err) {
    g.innerHTML = `<div class="empty" style="color:#f87171">❌ ${escapeHtml(err.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════
// SERVER DETAIL MODAL
// ═══════════════════════════════════════════════════════════
async function openServerDetail(guildId) {
  state.currentServer = guildId;
  $('#serverDetail').innerHTML = '<div class="loading">Carregando…</div>';
  openModal('modalServer');

  try {
    const [info, stats] = await Promise.all([
      api(`/api/me/servers/${guildId}`),
      api(`/api/me/servers/${guildId}/stats`),
    ]);

    const g = info.guild || {};
    const s = stats.stats || {};

    // 🔒 Só DEV/ADMIN vê a aba "Ações" (Levar membros)
    const canManage = ['dev', 'admin'].includes(state.role);

    const actionsTabBtn = canManage
      ? `<button class="detail-tab" data-tab="actions">⚡ Ações</button>`
      : '';

    const actionsPanel = canManage
      ? `<div class="detail-panel" id="dt-actions">
          <div class="card">
            <h3>🚀 Levar membros</h3>
            <p class="hint">Adiciona usuários verificados (via OAuth) ao servidor. Rate limit: ~1 por segundo.</p>
            <div class="field">
              <label>Quantidade (máx 50)</label>
              <input type="number" id="tmLimit" value="20" min="1" max="50">
            </div>
            <button id="btnTakeMembers" class="btn">🚀 Levar membros</button>
            <div id="tmResult" class="msg"></div>
          </div>
        </div>`
      : '';

    $('#serverDetail').innerHTML = `
      <div class="server-detail-head">
        <div class="icon">${g.icon ? `<img src="${escapeHtml(g.icon)}">` : '🌐'}</div>
        <div>
          <h2>${escapeHtml(g.name || 'Servidor')}</h2>
          <p>${escapeHtml(guildId)}</p>
        </div>
      </div>

      <div class="mini-stats">
        <div class="mini-stat"><div class="num">${s.members || 0}</div><div class="lbl">Membros</div></div>
        <div class="mini-stat"><div class="num">${s.tickets_open || 0}</div><div class="lbl">Tickets Abertos</div></div>
        <div class="mini-stat"><div class="num">${s.bets_30d || 0}</div><div class="lbl">Apostas (30d)</div></div>
        <div class="mini-stat"><div class="num">${s.orders_30d || 0}</div><div class="lbl">Vendas (30d)</div></div>
      </div>

      <div class="detail-tabs">
        <button class="detail-tab active" data-tab="tickets">🎫 Tickets</button>
        <button class="detail-tab" data-tab="products">🛒 Produtos</button>
        <button class="detail-tab" data-tab="orders">🧾 Pedidos</button>
        ${actionsTabBtn}
      </div>

      <div class="detail-panel active" id="dt-tickets"></div>
      <div class="detail-panel" id="dt-products"></div>
      <div class="detail-panel" id="dt-orders"></div>
      ${actionsPanel}
    `;

    // Troca de abas
    $('#serverDetail').querySelectorAll('.detail-tab').forEach(t => {
      t.addEventListener('click', () => {
        $('#serverDetail').querySelectorAll('.detail-tab').forEach(x => x.classList.remove('active'));
        $('#serverDetail').querySelectorAll('.detail-panel').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        $(`#dt-${t.dataset.tab}`).classList.add('active');
        if (t.dataset.tab === 'tickets')  loadServerTickets(guildId);
        if (t.dataset.tab === 'products') loadServerProducts(guildId);
        if (t.dataset.tab === 'orders')   loadServerOrders(guildId);
      });
    });

    // Carrega a primeira aba
    loadServerTickets(guildId);

    // Bind do botão "Levar membros" — só se canManage
    if (canManage) {
      $('#btnTakeMembers')?.addEventListener('click', takeMembers);
    }

  } catch (e) {
    $('#serverDetail').innerHTML = `<div class="empty" style="color:#f87171">❌ ${escapeHtml(e.message)}</div>`;
  }
}

// ─── Sub-abas do server detail ───
async function loadServerTickets(gid) {
  const el = $('#dt-tickets');
  if (!el) return;
  el.innerHTML = '<div class="loading">Carregando…</div>';
  try {
    const { tickets } = await api(`/api/me/servers/${gid}/tickets`);
    if (!tickets.length) { el.innerHTML = '<div class="empty">Sem tickets</div>'; return; }
    el.innerHTML = `
      <table>
        <thead><tr><th>Autor</th><th>Status</th><th>Aberto em</th></tr></thead>
        <tbody>${tickets.map(t => `
          <tr>
            <td class="wrap">${escapeHtml(t.user_id || '—')}</td>
            <td>${t.closed_at ? '🔴 Fechado' : '🟢 Aberto'}</td>
            <td>${fmtDate(t.opened_at || t.created_at)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    el.innerHTML = `<div class="empty" style="color:#f87171">❌ ${escapeHtml(e.message)}</div>`;
  }
}

async function loadServerProducts(gid) {
  const el = $('#dt-products');
  if (!el) return;
  el.innerHTML = '<div class="loading">Carregando…</div>';
  try {
    const { products } = await api(`/api/me/servers/${gid}/products`);
    if (!products.length) { el.innerHTML = '<div class="empty">Sem produtos</div>'; return; }
    el.innerHTML = `
      <table>
        <thead><tr><th>Nome</th><th>Preço</th><th>Estoque</th><th>Ativo</th></tr></thead>
        <tbody>${products.map(p => `
          <tr>
            <td class="wrap">${escapeHtml(p.name)}</td>
            <td>R$ ${Number(p.price || 0).toFixed(2)}</td>
            <td>${p.infinite_content ? '∞' : '—'}</td>
            <td>${p.active ? '✅' : '❌'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    el.innerHTML = `<div class="empty" style="color:#f87171">❌ ${escapeHtml(e.message)}</div>`;
  }
}

async function loadServerOrders(gid) {
  const el = $('#dt-orders');
  if (!el) return;
  el.innerHTML = '<div class="loading">Carregando…</div>';
  try {
    const { orders } = await api(`/api/me/servers/${gid}/orders`);
    if (!orders.length) { el.innerHTML = '<div class="empty">Sem pedidos</div>'; return; }
    el.innerHTML = `
      <table>
        <thead><tr><th>#</th><th>Cliente</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>${orders.map(o => `
          <tr>
            <td>${o.id}</td>
            <td class="wrap">${escapeHtml(o.user_id || '—')}</td>
            <td>R$ ${Number(o.total || 0).toFixed(2)}</td>
            <td>${escapeHtml(o.status || '—')}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    el.innerHTML = `<div class="empty" style="color:#f87171">❌ ${escapeHtml(e.message)}</div>`;
  }
}

// ═══ Levar membros — APENAS DEV/ADMIN ═══
async function takeMembers() {
  // Trava dupla: mesmo se o botão aparecesse, checa a role aqui
  if (!['dev', 'admin'].includes(state.role)) {
    toast('Apenas DEV/ADMIN pode levar membros', 'error');
    return;
  }

  const gid = state.currentServer;
  if (!gid) return toast('Nenhum servidor selecionado', 'error');

  const limit = Number($('#tmLimit').value) || 20;
  const btn = $('#btnTakeMembers');
  const res = $('#tmResult');

  btn.disabled = true;
  btn.textContent = '⏳ Levando...';
  res.className = 'msg info';
  res.textContent = `Processando até ${limit} usuários... (pode levar ~${limit}s)`;
  res.style.display = 'block';

  try {
    const r = await api(`/api/me/servers/${gid}/take-members`, {
      method: 'POST',
      body: JSON.stringify({ limit }),
    });
    res.className = 'msg ok';
    res.textContent = `✅ Adicionados: ${r.added}  |  ❌ Falhas: ${r.failed}  |  Total tentado: ${r.total}`;
    toast(`Levar membros: ${r.added} add, ${r.failed} fail`);
  } catch (e) {
    res.className = 'msg error';
    res.textContent = `❌ ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Levar membros';
  }
}

// ═══════════════════════════════════════════════════════════
// NOTIFICAÇÕES
// ═══════════════════════════════════════════════════════════
async function loadNotifications() {
  try {
    const { notifications, unread } = await api('/api/notifications');
    state.notifications = notifications;
    state.unread = unread;
    updateBell(unread);
    renderNotifDrawer(notifications);
    if (state.currentPage === 'notifications') renderNotifPage();
  } catch {}
}

function updateBell(n) {
  const b = $('#bellBadge');
  const nav = $('#navNotifBadge');
  if (!b) return;
  if (n > 0) {
    b.textContent = n > 99 ? '99+' : n;
    b.classList.remove('hidden');
    if (nav) { nav.textContent = n > 99 ? '99+' : n; nav.classList.remove('hidden'); }
  } else {
    b.classList.add('hidden');
    if (nav) nav.classList.add('hidden');
  }
}

function notifIcon(t) {
  return { key_received: '🔑', system: '📢', alert: '⚠️' }[t] || '🔔';
}

function renderNotifDrawer(list) {
  const b = $('#drawerBody');
  if (!b) return;
  if (!list?.length) {
    b.innerHTML = '<div class="empty"><span class="icon">📭</span>Sem notificações</div>';
    return;
  }
  b.innerHTML = list.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" onclick="markNotifRead(${n.id})">
      <div class="tt">${!n.read ? '<span class="unread-dot"></span>' : ''}${notifIcon(n.type)} ${escapeHtml(n.title || 'Notificação')}</div>
      <div class="ct">${escapeHtml(n.content || '')}</div>
      <div class="time">${timeAgo(n.created_at)}</div>
    </div>`).join('');
}

function renderNotifPage() {
  const el = $('#notifList');
  if (!el) return;
  const list = state.notifications;
  if (!list?.length) {
    el.innerHTML = '<div class="empty"><span class="icon">📭</span>Nada por aqui</div>';
    return;
  }
  el.innerHTML = list.map(n => `
    <div class="card notif-item ${n.read ? '' : 'unread'}" style="margin-bottom:8px;padding:14px" onclick="markNotifRead(${n.id})">
      <div class="tt">${!n.read ? '<span class="unread-dot"></span>' : ''}${notifIcon(n.type)} ${escapeHtml(n.title || '')}</div>
      <div class="ct">${escapeHtml(n.content || '')}</div>
      <div class="time">${timeAgo(n.created_at)}</div>
    </div>`).join('');
}

window.markNotifRead = async function (id) {
  try { await api(`/api/notifications/${id}/read`, { method: 'PATCH' }); loadNotifications(); } catch {}
};

async function markAllRead() {
  try {
    await api('/api/notifications/read-all', { method: 'POST' });
    loadNotifications();
    toast('Todas marcadas como lidas');
  } catch (e) { toast(e.message, 'error'); }
}

function startPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(loadNotifications, 30000);
  loadPendingBadge();
  setInterval(loadPendingBadge, 60000);
}

// ═══════════════════════════════════════════════════════════
// USUÁRIOS (DEV)
// ═══════════════════════════════════════════════════════════
async function loadUsers() {
  const t = $('#usersTable');
  if (!t) return;
  t.innerHTML = '<div class="loading">Carregando…</div>';
  try {
    const params = new URLSearchParams();
    if ($('#userSearch')?.value)      params.set('search', $('#userSearch').value.trim());
    if ($('#userFilterRole')?.value)  params.set('role', $('#userFilterRole').value);
    if ($('#userFilterAtivo')?.value) params.set('ativo', $('#userFilterAtivo').value);
    const r = await api('/api/dev/usuarios?' + params);
    if (!r.usuarios.length) {
      t.innerHTML = '<div class="empty"><span class="icon">👤</span>Nenhum usuário</div>';
      return;
    }
    t.innerHTML = `
      <table>
        <thead><tr>
          <th>Email</th><th>Nome</th><th>Role</th><th>Discord</th>
          <th>Servidores</th><th>Ativo</th><th>Criado</th><th>Ações</th>
        </tr></thead>
        <tbody>${r.usuarios.map(u => `
          <tr>
            <td class="wrap">${escapeHtml(u.email)}</td>
            <td class="wrap">${escapeHtml(u.nome || '—')}</td>
            <td><span class="badge ${escapeHtml(u.role)}">${escapeHtml((u.role || '').toUpperCase())}</span></td>
            <td>${u.discord_id ? `<code>${escapeHtml(u.discord_id)}</code>` : '—'}</td>
            <td>${(u.assigned_guilds || []).length}</td>
            <td>${u.ativo ? '🟢' : '🔴'}</td>
            <td>${fmtDateShort(u.created_at)}</td>
            <td>
              <button type="button" class="btn btn-sm btn-secondary" data-edit="${escapeHtml(u.user_id)}">✏️</button>
              ${u.role !== 'dev' && u.ativo ? `<button type="button" class="btn btn-sm btn-danger" data-deact="${escapeHtml(u.user_id)}">🚫</button>` : ''}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    t.querySelectorAll('[data-edit]').forEach(b => {
      b.addEventListener('click', () => {
        const u = r.usuarios.find(x => x.user_id === b.dataset.edit);
        if (u) editUser(u);
      });
    });
    t.querySelectorAll('[data-deact]').forEach(b => {
      b.addEventListener('click', () => deactivateUser(b.dataset.deact));
    });
  } catch (err) {
    t.innerHTML = `<div class="empty" style="color:#f87171">❌ ${escapeHtml(err.message)}</div>`;
  }
}

async function deactivateUser(uid) {
  if (!confirm('Desativar este usuário?')) return;
  try {
    await api('/api/dev/usuarios/' + uid, { method: 'DELETE' });
    toast('Usuário desativado');
    loadUsers();
  } catch (e) { toast(e.message, 'error'); }
}

function editUser(u) {
  $('#modalUserTitle').textContent = '✏️ Editar Usuário';
  $('#modalUserId').value = u.user_id;
  $('#modalUserEmail').value = u.email;
  $('#modalUserEmail').disabled = true;
  $('#modalUserDiscord').value = u.discord_id || '';
  $('#modalUserNome').value = u.nome || '';
  $('#modalUserRole').value = u.role;
  $('#fieldPassword').style.display = 'none';
  $('#modalUserGuilds').value = (u.assigned_guilds || []).join(', ');
  $('#modalUserNotes').value = u.notes || '';
  $('#btnSaveUser').textContent = 'Salvar alterações';
  $('#userForm').dataset.mode = 'edit';
  openModal('modalUser');
}

$('#btnNovoUsuario')?.addEventListener('click', () => {
  $('#modalUserTitle').textContent = '➕ Novo Usuário';
  $('#userForm').reset();
  $('#modalUserId').value = '';
  $('#modalUserEmail').disabled = false;
  $('#fieldPassword').style.display = '';
  $('#btnSaveUser').textContent = 'Criar usuário';
  $('#userForm').dataset.mode = 'create';
  openModal('modalUser');
});

$('#userForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const mode = e.target.dataset.mode || 'create';
  const btn = $('#btnSaveUser');
  btn.disabled = true;
  try {
    const payload = {
      email: $('#modalUserEmail').value.trim(),
      discord_id: $('#modalUserDiscord').value.trim(),
      nome: $('#modalUserNome').value.trim() || null,
      role: $('#modalUserRole').value,
      assigned_guilds: $('#modalUserGuilds').value.split(',').map(s => s.trim()).filter(Boolean),
      notes: $('#modalUserNotes').value.trim() || null,
    };
    if (mode === 'create') {
      payload.password = $('#modalUserPassword').value.trim() || null;
      const r = await api('/api/dev/usuarios', { method: 'POST', body: JSON.stringify(payload) });
      showMsg('#modalUserMsg', `✅ Criado! Senha: ${r.temp_password}`, 'ok');
      toast('Usuário criado!');
      setTimeout(() => { closeModal('modalUser'); loadUsers(); }, 4000);
    } else {
      const uid = $('#modalUserId').value;
      await api('/api/dev/usuarios/' + uid, { method: 'PATCH', body: JSON.stringify(payload) });
      toast('Usuário atualizado');
      closeModal('modalUser');
      loadUsers();
    }
  } catch (err) {
    showMsg('#modalUserMsg', err.message);
  } finally {
    btn.disabled = false;
  }
});

// ═══════════════════════════════════════════════════════════
// APROVAÇÕES PENDENTES
// ═══════════════════════════════════════════════════════════
async function loadPending() {
  const el = $('#pendingList');
  if (!el) return;
  el.innerHTML = '<div class="loading">Carregando…</div>';
  try {
    const r = await api('/api/dev/usuarios/pending');
    if (!r.pendentes.length) {
      el.innerHTML = '<div class="empty"><span class="icon">✅</span>Nenhum cadastro pendente</div>';
      return;
    }
    el.innerHTML = r.pendentes.map(u => `
      <div class="card" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="font-weight:600;font-size:15px">${escapeHtml(u.email)}</div>
          <div style="font-size:12px;color:var(--txt-2);margin-top:4px">
            ${u.discord_id ? `Discord: <code>${escapeHtml(u.discord_id)}</code>` : 'Sem Discord ID'} · ${timeAgo(u.created_at)}
          </div>
        </div>
        <button type="button" class="btn btn-success btn-sm" data-approve="${escapeHtml(u.user_id)}" data-email="${escapeHtml(u.email)}">✅ Aprovar</button>
      </div>`).join('');
    el.querySelectorAll('[data-approve]').forEach(b => {
      b.addEventListener('click', () => openApprove({ user_id: b.dataset.approve, email: b.dataset.email }));
    });
  } catch (e) {
    el.innerHTML = `<div class="empty" style="color:#f87171">❌ ${escapeHtml(e.message)}</div>`;
  }
}

async function loadPendingBadge() {
  if (state.role !== 'dev') return;
  try {
    const r = await api('/api/dev/usuarios/pending');
    const n = r.pendentes.length;
    const b = $('#navPendingBadge');
    if (!b) return;
    if (n > 0) { b.textContent = n; b.classList.remove('hidden'); }
    else b.classList.add('hidden');
  } catch {}
}

function openApprove(u) {
  $('#approveUserId').value = u.user_id;
  $('#approveEmail').textContent = u.email;
  $('#approveRole').value = 'cliente';
  $('#approveGuilds').value = '';
  $('#approveNotes').value = '';
  openModal('modalApprove');
}

$('#approveForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const uid = $('#approveUserId').value;
  const btn = $('#btnApprove');
  btn.disabled = true;
  try {
    await api(`/api/dev/usuarios/${uid}/approve`, {
      method: 'POST',
      body: JSON.stringify({
        role: $('#approveRole').value,
        assigned_guilds: $('#approveGuilds').value.split(',').map(s => s.trim()).filter(Boolean),
        notes: $('#approveNotes').value.trim() || null,
      }),
    });
    toast('Usuário aprovado!');
    closeModal('modalApprove');
    loadPending();
    loadPendingBadge();
  } catch (err) {
    showMsg('#approveMsg', err.message);
  } finally {
    btn.disabled = false;
  }
});

// ═══════════════════════════════════════════════════════════
// LOGS
// ═══════════════════════════════════════════════════════════
async function loadLogs() {
  const t = $('#logsTable');
  if (!t) return;
  t.innerHTML = '<div class="loading">Carregando…</div>';
  try {
    const params = new URLSearchParams();
    if ($('#logFilterAction')?.value) params.set('action', $('#logFilterAction').value.trim());
    const r = await api('/api/dev/audit?' + params);
    if (!r.logs.length) {
      t.innerHTML = '<div class="empty"><span class="icon">📋</span>Nenhum log</div>';
      return;
    }
    t.innerHTML = `
      <table>
        <thead><tr>
          <th>Quando</th><th>Ator</th><th>Ação</th><th>Alvo</th><th>Role Alvo</th><th>IP</th>
        </tr></thead>
        <tbody>${r.logs.map(l => `
          <tr>
            <td>${fmtDate(l.created_at)}</td>
            <td class="wrap">${escapeHtml(l.actor_email || l.actor_id)}</td>
            <td><code>${escapeHtml(l.action)}</code></td>
            <td class="wrap">${escapeHtml(l.target_id || '—')}</td>
            <td>${l.target_role ? `<span class="badge ${escapeHtml(l.target_role)}">${escapeHtml(l.target_role)}</span>` : '—'}</td>
            <td><code>${escapeHtml(l.ip || '—')}</code></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    t.innerHTML = `<div class="empty" style="color:#f87171">❌ ${escapeHtml(e.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════
// DEV — KILL SWITCH
// ═══════════════════════════════════════════════════════════
async function loadKillSwitch() {
  try {
    const r = await api('/api/dev/kill-switch');
    $('#ksStatus').innerHTML = `<div class="status-indicator ${r.active ? 'on' : 'off'}">${r.active ? `🔴 ATIVO${r.reason ? ` — ${escapeHtml(r.reason)}` : ''}` : '🟢 Normal'}</div>`;
    if (r.reason) $('#ksReason').value = r.reason;
  } catch (e) { $('#ksStatus').innerHTML = `❌ ${escapeHtml(e.message)}`; }
}
$('#btnKillOn')?.addEventListener('click', async () => {
  if (!confirm('Ativar Kill Switch? TODOS os comandos do bot vão parar.')) return;
  try {
    await api('/api/dev/kill-switch', { method: 'POST', body: JSON.stringify({ active: true, reason: $('#ksReason').value }) });
    toast('Kill switch ON'); loadKillSwitch();
  } catch (e) { toast(e.message, 'error'); }
});
$('#btnKillOff')?.addEventListener('click', async () => {
  try {
    await api('/api/dev/kill-switch', { method: 'POST', body: JSON.stringify({ active: false }) });
    toast('Kill switch OFF'); loadKillSwitch();
  } catch (e) { toast(e.message, 'error'); }
});

// ═══════════════════════════════════════════════════════════
// DEV — MANUTENÇÃO
// ═══════════════════════════════════════════════════════════
async function loadMaintenance() {
  try {
    const r = await api('/api/dev/maintenance');
    $('#mtStatus').innerHTML = `<div class="status-indicator ${r.active ? 'on' : 'off'}">${r.active ? `🔴 ATIVA${r.reason ? ` — ${escapeHtml(r.reason)}` : ''}` : '🟢 Operacional'}</div>`;
    if (r.reason) $('#mtReason').value = r.reason;
  } catch (e) { $('#mtStatus').innerHTML = `❌ ${escapeHtml(e.message)}`; }
}
$('#btnMtOn')?.addEventListener('click', async () => {
  if (!confirm('Ativar manutenção global?')) return;
  try {
    await api('/api/dev/maintenance', { method: 'POST', body: JSON.stringify({ active: true, reason: $('#mtReason').value }) });
    toast('Manutenção ON'); loadMaintenance();
  } catch (e) { toast(e.message, 'error'); }
});
$('#btnMtOff')?.addEventListener('click', async () => {
  try {
    await api('/api/dev/maintenance', { method: 'POST', body: JSON.stringify({ active: false }) });
    toast('Manutenção OFF'); loadMaintenance();
  } catch (e) { toast(e.message, 'error'); }
});

// ═══════════════════════════════════════════════════════════
// DEV — FORCE PREMIUM
// ═══════════════════════════════════════════════════════════
async function loadForcePremium() {
  const t = $('#fpList');
  if (!t) return;
  t.innerHTML = '<div class="loading">Carregando…</div>';
  try {
    const r = await api('/api/dev/force-premium');
    if (!r.items.length) { t.innerHTML = '<div class="empty">Nenhum</div>'; return; }
    t.innerHTML = `
      <table>
        <thead><tr><th>Scope</th><th>Target</th><th>Expira</th><th>Por</th><th>Quando</th><th></th></tr></thead>
        <tbody>${r.items.map(f => `
          <tr>
            <td>${escapeHtml(f.scope)}</td>
            <td><code>${escapeHtml(f.target_id)}</code></td>
            <td>${f.permanent ? '♾️' : (f.expires_at ? fmtDateShort(f.expires_at) : '?')}</td>
            <td>${escapeHtml(f.granted_by || '—')}</td>
            <td>${fmtDateShort(f.granted_at)}</td>
            <td><button class="btn btn-sm btn-danger" data-fp-del="${f.id}">🗑️</button></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    t.querySelectorAll('[data-fp-del]').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('Remover?')) return;
        try { await api('/api/dev/force-premium/' + b.dataset.fpDel, { method: 'DELETE' }); loadForcePremium(); }
        catch (e) { toast(e.message, 'error'); }
      });
    });
  } catch (e) {
    t.innerHTML = `<div class="empty" style="color:#f87171">❌ ${escapeHtml(e.message)}</div>`;
  }
}
$('#btnFpAdd')?.addEventListener('click', async () => {
  const scope = $('#fpScope').value;
  const target_id = $('#fpTarget').value.trim();
  const days = Number($('#fpDays').value);
  const reason = $('#fpReason').value.trim();
  if (!target_id) return toast('Digite o ID', 'error');
  try {
    await api('/api/dev/force-premium', { method: 'POST', body: JSON.stringify({ scope, target_id, days, reason }) });
    toast('Adicionado'); $('#fpTarget').value = ''; loadForcePremium();
  } catch (e) { toast(e.message, 'error'); }
});

// ═══════════════════════════════════════════════════════════
// DEV — BROADCAST
// ═══════════════════════════════════════════════════════════
$('#btnBcSend')?.addEventListener('click', async () => {
  const title = $('#bcTitle').value.trim();
  const content = $('#bcContent').value.trim();
  const role = $('#bcRole').value;
  if (!title || !content) return toast('Preencha título e conteúdo', 'error');
  if (!confirm(`Enviar para ${role || 'todos'}?`)) return;
  try {
    const r = await api('/api/dev/broadcast', { method: 'POST', body: JSON.stringify({ title, content, role: role || null }) });
    toast(`Enviado para ${r.sent}`);
    $('#bcTitle').value = '';
    $('#bcContent').value = '';
  } catch (e) { toast(e.message, 'error'); }
});
$('#btnForceUpdate')?.addEventListener('click', async () => {
  if (!confirm('Resetar broadcast de update do bot?')) return;
  try { await api('/api/dev/force-update', { method: 'POST' }); toast('Resetado'); }
  catch (e) { toast(e.message, 'error'); }
});

// ═══════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════
$('#loginForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#btnLogin');
  btn.disabled = true;
  try {
    const r = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: $('#loginEmail').value.trim(), password: $('#loginPassword').value }),
    });
    if (r.token) localStorage.setItem('sb_token', r.token);
    hydrateApp(r);
  } catch (err) {
    showMsg('#loginMsg', err.message);
  } finally {
    btn.disabled = false;
  }
});

$('#btnShowRegister')?.addEventListener('click', () => showView('register'));
$('#linkBackLogin')?.addEventListener('click', e => { e.preventDefault(); showView('login'); });

$('#registerForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#registerMsg');
  const p1 = $('#regPassword').value;
  const p2 = $('#regConfirm').value;
  if (p1 !== p2) return showMsg(msg, 'As senhas não coincidem');
  if (p1.length < 8) return showMsg(msg, 'Senha muito curta');
  try {
    const r = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: $('#regEmail').value.trim(),
        password: p1,
        discord_id: $('#regDiscord').value.trim() || null,
      }),
    });
    showMsg(msg, '✅ ' + (r.message || 'Cadastro enviado!'), 'ok');
    setTimeout(() => showView('login'), 3000);
  } catch (err) {
    showMsg(msg, err.message);
  }
});

$('#linkForgot')?.addEventListener('click', e => { e.preventDefault(); openModal('modalForgot'); });
$('#btnSendForgot')?.addEventListener('click', async () => {
  const email = $('#forgotEmail').value.trim();
  if (!email) return toast('Digite o e-mail', 'error');
  try {
    await api('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) });
    toast('Se o e-mail existir, enviaremos instruções.');
    closeModal('modalForgot');
  } catch (e) { toast(e.message, 'error'); }
});

$('#resetForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#resetMsg');
  const p1 = $('#resetPassword').value;
  const p2 = $('#resetConfirm').value;
  if (p1 !== p2) return showMsg(msg, 'As senhas não coincidem');
  if (!window.__RESET_TOKEN__) return showMsg(msg, 'Token ausente');
  try {
    await api('/api/auth/update-password', {
      method: 'POST',
      body: JSON.stringify({ token: window.__RESET_TOKEN__, new_password: p1 }),
    });
    showMsg(msg, '✅ Senha atualizada! Redirecionando…', 'ok');
    setTimeout(() => { window.location.hash = ''; window.location.reload(); }, 2000);
  } catch (err) { showMsg(msg, err.message); }
});

$('#btnLogout')?.addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  localStorage.removeItem('sb_token');
  window.location.reload();
});

// ═══════════════════════════════════════════════════════════
// LISTENERS GLOBAIS
// ═══════════════════════════════════════════════════════════
$('#btnHamburger')?.addEventListener('click', openSidebar);
$('#sidebarOverlay')?.addEventListener('click', closeSidebar);
$$('#sidebar a[data-nav]').forEach(a => a.addEventListener('click', () => goToPage(a.dataset.nav)));

$('#btnBell')?.addEventListener('click', () => {
  $('#notifDrawer').classList.add('active');
  loadNotifications();
});
$('#btnCloseDrawer')?.addEventListener('click', () => $('#notifDrawer').classList.remove('active'));
$('#btnMarkAllRead')?.addEventListener('click', markAllRead);
$('#btnMarkAllReadDrawer')?.addEventListener('click', markAllRead);

$('#btnRefreshKeys')?.addEventListener('click', loadKeys);
$('#filterStatus')?.addEventListener('change', loadKeys);
$('#filterTier')?.addEventListener('change', loadKeys);

$('#btnRefreshUsers')?.addEventListener('click', loadUsers);
$('#userSearch')?.addEventListener('input', (() => {
  let t;
  return () => { clearTimeout(t); t = setTimeout(loadUsers, 400); };
})());
$('#userFilterRole')?.addEventListener('change', loadUsers);
$('#userFilterAtivo')?.addEventListener('change', loadUsers);

$('#btnRefreshLogs')?.addEventListener('click', loadLogs);

$$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('active'); }));

document.addEventListener('visibilitychange', () => { if (!document.hidden) loadNotifications(); });

// ═══════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════
boot();
