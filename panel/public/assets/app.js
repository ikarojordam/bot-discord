// ═══════════════════════════════════════════════════════════
// 🔑 FRIO PANEL — Frontend
// ═══════════════════════════════════════════════════════════

const api = async (url, opts = {}) => {
  const r = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
};

const showMsg = (el, text, type = 'error') => {
  el.textContent = text;
  el.className = `msg ${type}`;
  el.style.display = 'block';
  if (type === 'ok') setTimeout(() => { el.style.display = 'none'; }, 4000);
};

// ═══ LOGIN ═══
if (document.getElementById('loginForm')) {
  const form = document.getElementById('loginForm');
  const msg = document.getElementById('msg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnLogin');
    btn.disabled = true;
    try {
      await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('email').value,
          password: document.getElementById('password').value,
        }),
      });
      window.location.href = '/dashboard.html';
    } catch (err) {
      showMsg(msg, err.message);
      btn.disabled = false;
    }
  });

  document.getElementById('linkForgot').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('modalForgot').style.display = 'flex';
  });
  document.getElementById('btnCancelForgot').addEventListener('click', () => {
    document.getElementById('modalForgot').style.display = 'none';
  });
  document.getElementById('btnSendForgot').addEventListener('click', async () => {
    const email = document.getElementById('forgotEmail').value;
    if (!email) return alert('Digite o e-mail');
    try {
      await api('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) });
      alert('Se o e-mail existir, enviaremos instruções.');
      document.getElementById('modalForgot').style.display = 'none';
    } catch (err) { alert(err.message); }
  });

  // Registro
  document.getElementById('btnRegister').addEventListener('click', async () => {
    const email = prompt('Digite seu e-mail:');
    if (!email) return;
    const password = prompt('Digite uma senha (mín. 8 caracteres):');
    if (!password || password.length < 8) return alert('Senha muito curta');
    try {
      const cfg = await fetch('/api/public-config').then(r => r.json());
      const supa = window.supabase.createClient(cfg.supabase_url, cfg.supabase_anon);
      const { error } = await supa.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin + '/index.html' },
      });
      if (error) throw error;
      alert('Conta criada! Verifique seu e-mail e depois peça acesso ao owner.');
    } catch (err) { alert('Erro: ' + err.message); }
  });
}

// ═══ RESET ═══
if (document.getElementById('resetForm')) {
  const form = document.getElementById('resetForm');
  const msg = document.getElementById('msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = document.getElementById('newPassword').value;
    const p2 = document.getElementById('confirmPassword').value;
    if (p1 !== p2) return showMsg(msg, 'As senhas não coincidem');
    if (!window.__RESET_TOKEN__) return showMsg(msg, 'Token ausente. Solicite novo link.');
    try {
      await api('/api/auth/update-password', {
        method: 'POST',
        body: JSON.stringify({ token: window.__RESET_TOKEN__, new_password: p1 }),
      });
      showMsg(msg, 'Senha atualizada! Redirecionando…', 'ok');
      setTimeout(() => window.location.href = '/index.html', 2000);
    } catch (err) { showMsg(msg, err.message); }
  });
}

// ═══ DASHBOARD ═══
if (document.querySelector('.app-page')) {
  const $ = (s) => document.querySelector(s);

  (async () => {
    try {
      const me = await api('/api/auth/me');
      $('#userEmail').textContent = me.user.email;
      if (me.admin.is_owner) $('#tabAdmins').style.display = 'inline-block';
      loadKeys();
      loadRedemptions();
      if (me.admin.is_owner) loadAdmins();
    } catch { window.location.href = '/index.html'; }
  })();

  $('#btnLogout').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/index.html';
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'list') loadKeys();
      if (tab.dataset.tab === 'redemptions') loadRedemptions();
      if (tab.dataset.tab === 'admins') loadAdmins();
    });
  });

  // Gerar
  $('#genForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#btnGerar');
    btn.disabled = true;
    const box = $('#genResult');
    box.innerHTML = '⏳ Gerando…';
    try {
      const r = await api('/api/keys/generate', {
        method: 'POST',
        body: JSON.stringify({
          tier: $('#tier').value,
          duracao_dias: Number($('#duracao').value),
          quantidade: Number($('#qtd').value),
          max_usos: Number($('#maxUsos').value),
          validade_key_dias: Number($('#validade').value),
          motivo: $('#motivo').value,
        }),
      });
      box.innerHTML = `<p style="margin-bottom:12px;color:#4ade80">✅ ${r.keys.length} key(s) gerada(s)</p>` +
        r.keys.map(k => `
          <div class="key-row">
            <span>${k.key_code} — ${k.tier} / ${k.duracao_dias === 0 ? 'permanente' : k.duracao_dias + 'd'}</span>
            <button onclick="navigator.clipboard.writeText('${k.key_code}');this.textContent='Copiado!'">Copiar</button>
          </div>`).join('');
      loadKeys();
    } catch (err) {
      box.innerHTML = `<p style="color:#f87171">❌ ${err.message}</p>`;
    }
    btn.disabled = false;
  });

  async function loadKeys() {
    const table = $('#keysTable');
    table.innerHTML = '⏳ Carregando…';
    try {
      const params = new URLSearchParams();
      if ($('#filterStatus').value) params.set('status', $('#filterStatus').value);
      if ($('#filterTier').value) params.set('tier', $('#filterTier').value);
      const r = await api('/api/keys?' + params.toString());
      if (!r.keys.length) return table.innerHTML = '<p style="padding:20px;color:#949BA4">Nenhuma key.</p>';
      table.innerHTML = `
        <table>
          <thead><tr><th>Key</th><th>Tier</th><th>Duração</th><th>Usos</th><th>Gerada por</th><th>Status</th><th>Criada</th></tr></thead>
          <tbody>
            ${r.keys.map(k => `
              <tr>
                <td><code>${k.key_code}</code></td>
                <td><span class="badge ${k.tier}">${k.tier}</span></td>
                <td>${k.duracao_dias === 0 ? 'Permanente' : k.duracao_dias + ' dias'}</td>
                <td>${k.usos_atuais}/${k.max_usos}</td>
                <td>${k.gerado_por_email || '—'}</td>
                <td><span class="badge ${k.ativo ? 'active' : 'used'}">${k.ativo ? 'Ativa' : 'Esgotada'}</span></td>
                <td>${new Date(k.created_at).toLocaleDateString('pt-BR')}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    } catch (err) { table.innerHTML = `<p style="padding:20px;color:#f87171">❌ ${err.message}</p>`; }
  }

  $('#btnRefresh').addEventListener('click', loadKeys);
  $('#filterStatus').addEventListener('change', loadKeys);
  $('#filterTier').addEventListener('change', loadKeys);

  async function loadRedemptions() {
    const table = $('#redemptionsTable');
    table.innerHTML = '⏳ Carregando…';
    try {
      const r = await api('/api/redemptions');
      if (!r.redemptions.length) return table.innerHTML = '<p style="padding:20px;color:#949BA4">Nenhum resgate.</p>';
      table.innerHTML = `
        <table>
          <thead><tr><th>Key</th><th>Tier</th><th>Servidor</th><th>Resgatado por</th><th>Expira</th><th>Data</th></tr></thead>
          <tbody>
            ${r.redemptions.map(x => `
              <tr>
                <td><code>${x.key_code}</code></td>
                <td><span class="badge ${x.tier}">${x.tier}</span></td>
                <td>${x.guild_name || x.guild_id}</td>
                <td>${x.resgatado_por_tag || x.resgatado_por}</td>
                <td>${x.premium_expires_at ? new Date(x.premium_expires_at).toLocaleDateString('pt-BR') : 'Permanente'}</td>
                <td>${new Date(x.created_at).toLocaleString('pt-BR')}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    } catch (err) { table.innerHTML = `<p style="padding:20px;color:#f87171">❌ ${err.message}</p>`; }
  }

  async function loadAdmins() {
    const table = $('#adminsTable');
    table.innerHTML = '⏳ Carregando…';
    try {
      const r = await api('/api/admins');
      table.innerHTML = `
        <table>
          <thead><tr><th>E-mail</th><th>Nome</th><th>Pode gerar keys</th><th>Owner</th><th>Ativo</th><th>Ações</th></tr></thead>
          <tbody>
            ${r.admins.map(a => `
              <tr>
                <td>${a.email}</td>
                <td>${a.nome || '—'}</td>
                <td>${a.pode_gerar_keys ? '✅' : '❌'}</td>
                <td>${a.is_owner ? '👑' : '—'}</td>
                <td>${a.ativo ? '🟢' : '🔴'}</td>
                <td>
                  ${!a.is_owner ? `
                    <button onclick="toggleKeys('${a.user_id}', ${!a.pode_gerar_keys})">${a.pode_gerar_keys ? 'Remover' : 'Permitir'}</button>
                    <button onclick="toggleActive('${a.user_id}', ${!a.ativo})">${a.ativo ? 'Desativar' : 'Ativar'}</button>
                  ` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    } catch (err) { table.innerHTML = `<p style="padding:20px;color:#f87171">❌ ${err.message}</p>`; }
  }

  window.toggleKeys = async (userId, value) => {
    await api('/api/admins/' + userId, { method: 'PATCH', body: JSON.stringify({ pode_gerar_keys: value }) });
    loadAdmins();
  };
  window.toggleActive = async (userId, value) => {
    await api('/api/admins/' + userId, { method: 'PATCH', body: JSON.stringify({ ativo: value }) });
    loadAdmins();
  };

  $('#addAdminForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admins', {
        method: 'POST',
        body: JSON.stringify({
          email: $('#adminEmail').value,
          nome: $('#adminNome').value,
          pode_gerar_keys: $('#adminPodeGerar').checked,
        }),
      });
      alert('✅ Admin adicionado!');
      $('#addAdminForm').reset();
      loadAdmins();
    } catch (err) { alert('❌ ' + err.message); }
  });
  }
