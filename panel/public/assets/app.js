// ═══════════════════════════════════════════════════════════
// FRIO PANEL v2.1 — Frontend (usa Bearer + localStorage)
// ═══════════════════════════════════════════════════════════

const $  = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

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
    err.code = j.code; err.hint = j.hint; err.status = r.status;
    throw err;
  }
  return j;
};

const state = {
  user: null, admin: null, role: null,
  pollTimer: null, currentPage: 'dashboard',
  notifications: [], unread: 0,
};

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

function showView(name) {
  ['login', 'register', 'reset'].forEach(v => {
    const el = $(`#view-${v}`);
    if (el) el.style.display = v === name ? 'flex' : 'none';
  });
  const app = $('#view-app');
  if (app) app.classList.toggle('active', name === 'app');
}

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
}
function openSidebar()  { $('#sidebar')?.classList.add('open'); $('#sidebarOverlay')?.classList.add('active'); }
function closeSidebar() { $('#sidebar')?.classList.remove('open'); $('#sidebarOverlay')?.classList.remove('active'); }

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

$('#genForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#btnGerar');
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
          <div><span class="code">${escapeHtml(k.key_code)}</span><span class="meta">· ${escapeHtml(k.tier)} · ${k.duracao_dias === 0 ? '♾️' : k.duracao_dias + 'd'}</span></div>
          <button type="button" onclick="copyText(this,'${escapeHtml(k.key_code)}')">📋 Copiar</button>
        </div>`).join('');
    toast(`${r.keys.length} key(s) gerada(s)!`);
    loadKeys();
  } catch (err) {
    box.innerHTML = `<p style="color:#f87171">❌ ${escapeHtml(err.message)}</p>`;
  } finally { if (btn) btn.disabled = false; }
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
    if (!r.keys.length) { t.innerHTML = '<div class="empty"><span class="icon">📭</span>Nenhuma key encontrada</div>'; return; }
    t.innerHTML = `
      <table>
        <thead><tr><th>Key</th><th>Tier</th><th>Duração</th><th>Usos</th><th>Gerada por</th><th>Status</th><th>Criada</th><th></th></tr></thead>
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
    if (!r.redemptions.length) { t.innerHTML = '<div class="empty"><span class="icon">🎁</span>Nenhum resgate ainda</div>'; return; }
    t.innerHTML = `
      <table>
        <thead><tr><th>Key</th><th>Tier</th><th>Servidor</th><th>Resgatado por</th><th>Expira</th><th>Data</th></tr></thead>
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

async function loadServers() {
  const g = $('#serversGrid');
  if (!g) return;
  g.innerHTML = '<div class="loading">Carregando…</div>';
  try {
    const { servers } = await api('/api/me/servers');
    if (!servers.length) { g.innerHTML = '<div class="empty"><span class="icon">🌐</span>Nenhum servidor atribuído</div>'; return; }
    g.innerHTML = servers.map(s => `
      <div class="server-card">
        <div class="head">
          <div class="ico">${s.icon ? `<img src="${escapeHtml(s.icon)}" alt="">` : '🌐'}</div>
          <div style="min-width:0">
            <div class="name">${escapeHtml(s.name || '—')}</div>
            <div class="meta">${escapeHtml(String(s.id))}</div>
          </div>
        </div>
        <div class="stats"><span>👥 ${s.member_count ?? '—'}</span></div>
      </div>`).join('');
  } catch (err) {
    g.innerHTML = `<div class="empty" style="color:#f87171">❌ ${escapeHtml(err.message)}</div>`;
  }
}

async function loadNotifications() {
  try {
    const { notifications, unread } = await api('/api/notifications');
    state.notifications = notifications;
    state.unread = unread;
    updateBell(unread);
    renderNotifDrawer(notifications);
    if (state.currentPage === 'notifications') renderNotifPage();
  } catch (e) { /* silencioso */ }
}

function updateBell(n) {
  const badge = $('#bellBadge');
  const nav = $('#navNotifBadge');
  if (n > 0) {
    badge.textContent = n > 99 ? '99+' : n;
    badge.classList.remove('hidden');
    if (nav) { nav.textContent = n > 99 ? '99+' : n; nav.classList.remove('hidden'); }
  } else {
    badge.classList.add('hidden');
    if (nav) nav.classList.add('hidden');
  }
}

function notifIcon(type) {
  return { key_received: '🔑', system: '📢', alert: '⚠️' }[type] || '🔔';
}

function renderNotifDrawer(list) {
  const body = $('#drawerBody');
  if (!body) return;
  if (!list?.length) { body.innerHTML = '<div class="empty"><span class="icon">📭</span>Sem notificações</div>'; return; }
  body.innerHTML = list.map(n => `
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
  if (!list?.length) { el.innerHTML = '<div class="empty"><span class="icon">📭</span>Nada por aqui</div>'; return; }
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
    if (!r.usuarios.length) { t.innerHTML = '<div class="empty"><span class="icon">👤</span>Nenhum usuário</div>'; return; }
    t.innerHTML = `
      <table>
        <thead><tr><th>Email</th><th>Nome</th><th>Role</th><th>Discord</th><th>Servidores</th><th>Ativo</th><th>Criado</th><th>Ações</th></tr></thead>
        <tbody>${r.usuarios.map(u => `
          <tr>
            <td class="wrap">${escapeHtml(u.email)}</td>
            <td class="wrap">${escapeHtml(u.nome || '—')}</td>
            <td><span class="badge ${escapeHtml(u.role)}">${escapeHtml(u.role.toUpperCase())}</span></td>
            <td>${u.discord_id ? `<code>${escapeHtml(u.discord_id)}</code>` : '—'}</td>
            <td>${(u.assigned_guilds || []).length}</td>
            <td>${u.ativo ? '🟢' : '🔴'}</td>
            <td>${fmtDateShort(u.created_at)}</td>
            <td>
              <button type="button" class="btn btn-sm btn-secondary" data-edit-uid="${escapeHtml(u.user_id)}">✏️</button>
              ${u.role !== 'dev' && u.ativo ? `<button type="button" class="btn btn-sm btn-danger" data-deact-uid="${escapeHtml(u.user_id)}">🚫</button>` : ''}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    t.querySelectorAll('[data-edit-uid]').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = r.usuarios.find(x => x.user_id === btn.dataset.editUid);
        if (u) editUser(u);
      });
    });
    t.querySelectorAll('[data-deact-uid]').forEach(btn => {
      btn.addEventListener('click', () => deactivateUser(btn.dataset.deactUid));
    });
  } catch (err) {
    t.innerHTML = `<div class="empty" style="color:#f87171">❌ ${escapeHtml(err.message)}</div>`;
  }
}

async function deactivateUser(uid) {
  if (!confirm('Desativar este usuário?')) return;
  try { await api('/api/dev/usuarios/' + uid, { method: 'DELETE' }); toast('Usuário desativado'); loadUsers(); }
  catch (e) { toast(e.message, 'error'); }
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
  } finally { btn.disabled = false; }
});

async function loadPending() {
  const el = $('#pendingList');
  if (!el) return;
  el.innerHTML = '<div class="loading">Carregando…</div>';
  try {
    const r = await api('/api/dev/usuarios/pending');
    if (!r.pendentes.length) { el.innerHTML = '<div class="empty"><span class="icon">✅</span>Nenhum cadastro pendente</div>'; return; }
    el.innerHTML = r.pendentes.map(u => `
      <div class="card" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="font-weight:600;font-size:15px">${escapeHtml(u.email)}</div>
          <div style="font-size:12px;color:var(--txt-2);margin-top:4px">
            ${u.discord_id ? `Discord: <code>${escapeHtml(u.discord_id)}</code>` : 'Sem Discord ID'} · ${timeAgo(u.created_at)}
          </div>
        </div>
        <button type="button" class="btn btn-success btn-sm" data-approve-uid="${escapeHtml(u.user_id)}" data-approve-email="${escapeHtml(u.email)}">✅ Aprovar</button>
      </div>`).join('');
    el.querySelectorAll('[data-approve-uid]').forEach(b => {
      b.addEventListener('click', () => openApprove({ user_id: b.dataset.approveUid, email: b.dataset.approveEmail }));
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
  } finally { btn.disabled = false; }
});

async function loadLogs() {
  const t = $('#logsTable');
  if (!t) return;
  t.innerHTML = '<div class="loading">Carregando…</div>';
  try {
    const params = new URLSearchParams();
    if ($('#logFilterAction')?.value) params.set('action', $('#logFilterAction').value.trim());
    const r = await api('/api/dev/audit?' + params);
    if (!r.logs.length) { t.innerHTML = '<div class="empty"><span class="icon">📋</span>Nenhum log</div>'; return; }
    t.innerHTML = `
      <table>
        <thead><tr><th>Quando</th><th>Ator</th><th>Ação</th><th>Alvo</th><th>Role Alvo</th><th>IP</th></tr></thead>
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
  } finally { btn.disabled = false; }
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
$('#userSearch')?.addEventListener('input', (() => { let t; return () => { clearTimeout(t); t = setTimeout(loadUsers, 400); }; })());
$('#userFilterRole')?.addEventListener('change', loadUsers);
$('#userFilterAtivo')?.addEventListener('change', loadUsers);
$('#btnRefreshLogs')?.addEventListener('click', loadLogs);

$$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('active'); }));

document.addEventListener('visibilitychange', () => { if (!document.hidden) loadNotifications(); });

boot();
