(() => {
  'use strict';

  // ==================== CONFIGURACIÓN ====================
  // Cambiá esta URL cuando despliegues el backend en otro host.
  const API_BASE = '/api';
  const TOKEN_KEY = 'piggy_token';
  const USER_KEY = 'piggy_user';

  // ==================== HELPERS DE DOM Y FORMATO ====================
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
  const money = (n) => fmt.format(n || 0);
  const today = () => new Date().toISOString().slice(0, 10);
  const dateStr = (d) => new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  const escapeHtml = (s) => String(s).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ==================== CLIENTE DE LA API ====================
  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setSession(token, usuario) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(usuario));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  }

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } catch {
      throw new Error('No se pudo conectar con el servidor. ¿Está corriendo el backend?');
    }

    let data = null;
    try { data = await res.json(); } catch { /* respuesta sin body */ }

    if (res.status === 401) {
      clearSession();
      setAuth();
      throw new Error('Tu sesión expiró. Iniciá sesión nuevamente.');
    }
    if (!res.ok) {
      throw new Error(data?.error || 'Ocurrió un error inesperado.');
    }
    return data;
  }

  const Api = {
    register: (body) => api('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
    login: (body) => api('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

    movimientos: (params = {}) => api(`/movimientos?${new URLSearchParams(params)}`),
    movimientosRecientes: (limit = 5) => api(`/movimientos/recientes?limit=${limit}`),
    crearMovimiento: (body) => api('/movimientos', { method: 'POST', body: JSON.stringify(body) }),
    eliminarMovimiento: (id) => api(`/movimientos/${id}`, { method: 'DELETE' }),

    categorias: (tipo) => api(`/categorias${tipo ? `?tipo=${tipo}` : ''}`),
    formasPago: () => api('/formas-pago'),

    chanchitos: () => api('/chanchitos'),
    crearChanchito: (body) => api('/chanchitos', { method: 'POST', body: JSON.stringify(body) }),
    eliminarChanchito: (id) => api(`/chanchitos/${id}`, { method: 'DELETE' }),
    depositarChanchito: (id, body) => api(`/chanchitos/${id}/depositar`, { method: 'POST', body: JSON.stringify(body) }),
    retirarChanchito: (id, body) => api(`/chanchitos/${id}/retirar`, { method: 'POST', body: JSON.stringify(body) }),
  };

  // ==================== ESTADO LOCAL ====================
  let register = false;
  let categoriasCache = [];
  let formasPagoCache = [];
  let piggyMoveContext = null; // { id_chanchito, modo: 'depositar'|'retirar' }

  // ==================== AUTENTICACIÓN ====================
  function setAuth() {
    const u = getUser();
    $('#authView').hidden = !!u;
    $('#appView').hidden = !u;
    if (u) {
      $('#profileName').textContent = u.nombre;
      $('#greetingName').textContent = u.nombre.split(' ')[0];
      bootstrapApp();
    }
  }

  function toggleAuth() {
    register = !register;
    $('#authTitle').textContent = register ? 'Creá tu cuenta' : 'Bienvenido';
    $('#authText').textContent = register ? 'Empezá a llevar el control de tu dinero.' : 'Ingresá para ordenar tus finanzas.';
    $('#nameField').hidden = !register;
    $('#authSubmit').textContent = register ? 'Crear cuenta' : 'Ingresar';
    $('#toggleLead').textContent = register ? '¿Ya tenés una cuenta?' : '¿Primera vez?';
    $('#toggleAuth').textContent = register ? 'Ingresar' : 'Crear cuenta';
  }

  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mail = $('#authEmail').value.trim().toLowerCase();
    const password = $('#authPassword').value;
    try {
      let data;
      if (register) {
        const nombre = $('#authName').value.trim();
        data = await Api.register({ nombre, mail, password });
        toast('Cuenta creada correctamente');
      } else {
        data = await Api.login({ mail, password });
      }
      setSession(data.token, data.usuario);
      setAuth();
    } catch (err) {
      toast(err.message);
    }
  });

  $('#toggleAuth').onclick = toggleAuth;
  $('#logoutBtn').onclick = () => { clearSession(); setAuth(); };

  // ==================== CARGA INICIAL DE CATÁLOGOS ====================
  async function bootstrapApp() {
    try {
      const [categorias, formasPago] = await Promise.all([Api.categorias(), Api.formasPago()]);
      categoriasCache = categorias;
      formasPagoCache = formasPago;
      fillPaymentSelect($('#formPayment'));
      fillPaymentSelect($('#piggyMovePayment'));
      updateCategories();
      renderAll();
    } catch (err) {
      toast(err.message);
    }
  }

  function fillPaymentSelect(select) {
    select.innerHTML = formasPagoCache.map((f) => `<option value="${f.id_forma_pago}">${escapeHtml(f.descripcion)}</option>`).join('');
  }

  function updateCategories() {
    const tipo = $('#formType').value;
    const opciones = categoriasCache.filter((c) => c.tipo === tipo);
    $('#formCategory').innerHTML = opciones.map((c) => `<option value="${c.id_categoria}">${escapeHtml(c.descripcion)}</option>`).join('');
  }

  // ==================== NAVEGACIÓN ====================
  function go(page) {
    $$('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
    $$('.page').forEach((p) => p.classList.toggle('active', p.id === page + 'Page'));
    if (page === 'stats') renderStats();
    if (page === 'movements') renderMovements();
    if (page === 'piggies') renderPiggies();
    if (page === 'home') renderHome();
  }
  $$('.nav button').forEach((b) => (b.onclick = () => go(b.dataset.page)));
  $$('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));

  function renderAll() {
    renderHome();
  }

  // ==================== HOME ====================
  function totals(arr) {
    return {
      income: arr.filter((m) => m.tipo === 'Ingreso').reduce((s, m) => s + Number(m.monto), 0),
      expense: arr.filter((m) => m.tipo === 'Gasto').reduce((s, m) => s + Number(m.monto), 0),
    };
  }

  async function renderHome() {
    try {
      const all = await Api.movimientos(); // ya excluye movimientos de chanchito
      const now = new Date();
      const month = all.filter((m) => {
        const d = new Date(m.fecha);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      const t = totals(all);
      const mt = totals(month);
      const net = t.income - t.expense;

      $('#sidebarBalance').innerHTML = money(net).replace(',', '<small>,') + '</small>';
      $('#totalBalance').textContent = money(net);
      $('#monthIncome').textContent = money(mt.income);
      $('#monthExpense').textContent = money(mt.expense);
      $('#incomeCount').textContent = month.filter((m) => m.tipo === 'Ingreso').length + ' movimientos';
      $('#expenseCount').textContent = month.filter((m) => m.tipo === 'Gasto').length + ' movimientos';
      $('#sidebarPeriod').textContent = all.length ? all.length + ' movimientos registrados' : 'Sin movimientos todavía';

      const recent = all.slice(0, 5);
      $('#recentList').innerHTML = recent.map((m) => `
        <div class="movement">
          <div class="movement-icon ${m.tipo === 'Ingreso' ? 'income' : 'expense'}"><i class="fa-solid fa-${m.tipo === 'Ingreso' ? 'arrow-down' : 'arrow-up'}"></i></div>
          <div><div class="movement-title">${escapeHtml(m.descripcion)}</div><div class="movement-sub">${escapeHtml(m.categoria || '')} · ${dateStr(m.fecha)}</div></div>
          <div class="movement-amount ${m.tipo === 'Ingreso' ? 'income' : 'expense'}">${m.tipo === 'Ingreso' ? '+' : '-'} ${money(m.monto)}</div>
        </div>`).join('') || '<div class="empty">Todavía no registraste movimientos.</div>';
    } catch (err) {
      toast(err.message);
    }
  }

  // ==================== MOVIMIENTOS ====================
  function getMovFilters() {
    const f = { desde: $('#movFrom').value, hasta: $('#movTo').value, tipo: $('#movType').value };
    Object.keys(f).forEach((k) => !f[k] && delete f[k]);
    return f;
  }

  async function renderMovements() {
    try {
      const arr = await Api.movimientos(getMovFilters());
      $('#movementTable').innerHTML = arr.map((m) => `
        <tr>
          <td>${dateStr(m.fecha)}</td>
          <td><strong>${escapeHtml(m.descripcion)}</strong><br><small style="color:#98a4c4">${escapeHtml(m.forma_pago || '—')}</small></td>
          <td>${escapeHtml(m.categoria || '—')}</td>
          <td><span class="badge ${m.tipo === 'Ingreso' ? 'income' : 'expense'}">${m.tipo}</span></td>
          <td class="movement-amount ${m.tipo === 'Ingreso' ? 'income' : 'expense'}">${m.tipo === 'Ingreso' ? '+' : '-'} ${money(m.monto)}</td>
          <td><button class="delete" data-delete="${m.id_movimiento}" title="Eliminar"><i class="fa-solid fa-trash"></i></button></td>
        </tr>`).join('') || '<tr><td colspan="6"><div class="empty">No hay movimientos para estos filtros.</div></td></tr>';
    } catch (err) {
      toast(err.message);
    }
  }

  ['#movFrom', '#movTo', '#movType'].forEach((s) => ($(s).onchange = renderMovements));
  $('#clearMovFilters').onclick = () => { $('#movFrom').value = $('#movTo').value = $('#movType').value = ''; renderMovements(); };
  $('#movementTable').onclick = async (e) => {
    const b = e.target.closest('[data-delete]');
    if (!b) return;
    if (!confirm('¿Eliminar este movimiento?')) return;
    try {
      await Api.eliminarMovimiento(b.dataset.delete);
      toast('Movimiento eliminado');
      renderMovements();
      renderHome();
    } catch (err) {
      toast(err.message);
    }
  };

  // ==================== MODAL: NUEVO MOVIMIENTO ====================
  function openModal(type) {
    $('#movementForm').reset();
    $('#formDate').value = today();
    $('#formType').value = type || 'Gasto';
    updateCategories();
    $('#movementModal').classList.add('show');
    $('#formAmount').focus();
  }
  function closeModal() { $('#movementModal').classList.remove('show'); }

  $$('.open-movement').forEach((b) => (b.onclick = () => openModal(b.dataset.type)));
  $('#closeModal').onclick = $('#cancelModal').onclick = closeModal;
  $('#movementModal').onclick = (e) => { if (e.target === e.currentTarget) closeModal(); };
  $('#formType').onchange = updateCategories;

  $('#movementForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await Api.crearMovimiento({
        tipo: $('#formType').value,
        monto: Number($('#formAmount').value),
        id_categoria: Number($('#formCategory').value) || null,
        id_forma_pago: Number($('#formPayment').value) || null,
        descripcion: $('#formDescription').value.trim(),
        fecha: $('#formDate').value,
      });
      closeModal();
      toast('Movimiento guardado');
      renderHome();
      if ($('#movementsPage').classList.contains('active')) renderMovements();
      if ($('#statsPage').classList.contains('active')) renderStats();
    } catch (err) {
      toast(err.message);
    }
  };

  // ==================== CHANCHITO ====================
  async function renderPiggies() {
    try {
      const chanchitos = await Api.chanchitos();
      $('#piggyCards').innerHTML = chanchitos.map((c) => `
        <article class="card piggy-card">
          <div class="card-label">${escapeHtml(c.nombre)} <i class="fa-solid fa-piggy-bank"></i></div>
          <div class="card-amount">${money(c.saldo)}</div>
          <div class="card-delta">${escapeHtml(c.descripcion || 'Sin descripción')}</div>
          <div class="piggy-actions">
            <button class="btn btn-dark" data-piggy-deposit="${c.id_chanchito}">Depositar</button>
            <button class="btn btn-dark" data-piggy-withdraw="${c.id_chanchito}">Retirar</button>
            <button class="btn btn-danger" data-piggy-delete="${c.id_chanchito}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
          </div>
        </article>`).join('') || '<div class="empty">Todavía no creaste ningún chanchito.</div>';
    } catch (err) {
      toast(err.message);
    }
  }

  function openPiggyModal() { $('#piggyForm').reset(); $('#piggyModal').classList.add('show'); $('#piggyName').focus(); }
  function closePiggyModal() { $('#piggyModal').classList.remove('show'); }

  $('#openPiggyModal').onclick = openPiggyModal;
  $('#closePiggyModal').onclick = $('#cancelPiggyModal').onclick = closePiggyModal;
  $('#piggyModal').onclick = (e) => { if (e.target === e.currentTarget) closePiggyModal(); };

  $('#piggyForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await Api.crearChanchito({ nombre: $('#piggyName').value.trim(), descripcion: $('#piggyDescription').value.trim() });
      closePiggyModal();
      toast('Chanchito creado');
      renderPiggies();
    } catch (err) {
      toast(err.message);
    }
  };

  function openPiggyMoveModal(id_chanchito, modo) {
    piggyMoveContext = { id_chanchito, modo };
    $('#piggyMoveForm').reset();
    $('#piggyMoveTitle').textContent = modo === 'depositar' ? 'Depositar en el chanchito' : 'Retirar del chanchito';
    $('#piggyMoveSubmit').textContent = modo === 'depositar' ? 'Depositar' : 'Retirar';
    $('#piggyMoveModal').classList.add('show');
    $('#piggyMoveAmount').focus();
  }
  function closePiggyMoveModal() { $('#piggyMoveModal').classList.remove('show'); piggyMoveContext = null; }

  $('#closePiggyMoveModal').onclick = $('#cancelPiggyMoveModal').onclick = closePiggyMoveModal;
  $('#piggyMoveModal').onclick = (e) => { if (e.target === e.currentTarget) closePiggyMoveModal(); };

  $('#piggyCards').onclick = (e) => {
    const dep = e.target.closest('[data-piggy-deposit]');
    const ret = e.target.closest('[data-piggy-withdraw]');
    const del = e.target.closest('[data-piggy-delete]');
    if (dep) openPiggyMoveModal(dep.dataset.piggyDeposit, 'depositar');
    if (ret) openPiggyMoveModal(ret.dataset.piggyWithdraw, 'retirar');
    if (del) eliminarChanchitoUI(del.dataset.piggyDelete);
  };

  async function eliminarChanchitoUI(id) {
    if (!confirm('¿Eliminar este chanchito? Solo se puede si el saldo es $0.')) return;
    try {
      await Api.eliminarChanchito(id);
      toast('Chanchito eliminado');
      renderPiggies();
    } catch (err) {
      toast(err.message);
    }
  }

  $('#piggyMoveForm').onsubmit = async (e) => {
    e.preventDefault();
    if (!piggyMoveContext) return;
    const body = {
      monto: Number($('#piggyMoveAmount').value),
      id_forma_pago: Number($('#piggyMovePayment').value) || null,
    };
    try {
      if (piggyMoveContext.modo === 'depositar') {
        await Api.depositarChanchito(piggyMoveContext.id_chanchito, body);
        toast('Depósito realizado');
      } else {
        await Api.retirarChanchito(piggyMoveContext.id_chanchito, body);
        toast('Retiro realizado');
      }
      closePiggyMoveModal();
      renderPiggies();
      renderHome();
    } catch (err) {
      toast(err.message);
    }
  };

  // ==================== ESTADÍSTICAS ====================
  function statFilters() {
    const f = { desde: $('#statsFrom').value, hasta: $('#statsTo').value };
    Object.keys(f).forEach((k) => !f[k] && delete f[k]);
    return f;
  }

  async function renderStats() {
    try {
      const f = statFilters();
      const arr = await Api.movimientos(f); // Ingreso + Gasto del período filtrado
      const t = totals(arr);
      const net = t.income - t.expense;

      $('#statsIncome').textContent = money(t.income);
      $('#statsExpense').textContent = money(t.expense);
      $('#statsNet').textContent = money(net);
      $('#statsNet').style.color = net < 0 ? 'var(--red)' : 'var(--text)';
      $('#reportPeriod').textContent = (f.desde || f.hasta)
        ? (f.desde ? dateStr(f.desde) : 'Inicio') + ' — ' + (f.hasta ? dateStr(f.hasta) : 'Hoy')
        : 'Todos los registros';

      const by = {};
      arr.filter((m) => m.tipo === 'Gasto').forEach((m) => { by[m.categoria] = (by[m.categoria] || 0) + Number(m.monto); });
      const top = Object.entries(by).sort((a, b) => b[1] - a[1]);

      $('#reportList').innerHTML = [
        ['Movimientos registrados', arr.length, 'En el período seleccionado'],
        ['Categoría principal', top[0]?.[0] || 'Sin gastos', top[0] ? money(top[0][1]) : ''],
        ['Tasa de ahorro', t.income ? Math.max(0, (net / t.income) * 100).toFixed(0) + '%' : '—', t.income ? 'Del total de ingresos' : 'Registrá ingresos para calcularla'],
      ].map((r) => `<div class="report-item"><div>${r[0]}<small>${r[2]}</small></div><strong>${r[1]}</strong></div>`).join('');

      drawMonthly(arr);
      drawCategories(top);
    } catch (err) {
      toast(err.message);
    }
  }

  function canvas(id) {
    const c = $(id);
    const r = c.getBoundingClientRect();
    const d = devicePixelRatio || 1;
    c.width = r.width * d;
    c.height = r.height * d;
    const x = c.getContext('2d');
    x.scale(d, d);
    return [x, r.width, r.height];
  }

  function drawMonthly(arr) {
    const [x, w, h] = canvas('#monthlyChart');
    x.clearRect(0, 0, w, h);
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push({ key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), name: d.toLocaleDateString('es-AR', { month: 'short' }) });
    }
    const data = months.map((o) => {
      const a = arr.filter((m) => String(m.fecha).slice(0, 7) === o.key);
      return { ...o, ...totals(a) };
    });
    const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
    x.font = '12px DM Sans';
    x.textAlign = 'center';
    data.forEach((d, i) => {
      const cx = (i + 0.5) * w / 6;
      const bw = Math.min(22, w / 20);
      const hi = (d.income / max) * (h - 35);
      const he = (d.expense / max) * (h - 35);
      x.fillStyle = '#5ed7aa'; x.fillRect(cx - bw - 3, h - 23 - hi, bw, hi);
      x.fillStyle = '#fb858d'; x.fillRect(cx + 3, h - 23 - he, bw, he);
      x.fillStyle = '#98a4c4'; x.fillText(d.name, cx, h - 6);
    });
    x.textAlign = 'left';
    x.fillStyle = '#5ed7aa'; x.fillRect(8, 4, 9, 9);
    x.fillStyle = '#c5cee8'; x.fillText('Ingresos', 23, 13);
    x.fillStyle = '#fb858d'; x.fillRect(92, 4, 9, 9);
    x.fillStyle = '#c5cee8'; x.fillText('Gastos', 107, 13);
  }

  function drawCategories(top) {
    const [x, w, h] = canvas('#categoryChart');
    x.clearRect(0, 0, w, h);
    const colors = ['#829bff', '#5ed7aa', '#ffca79', '#fb858d', '#bf8cff', '#59c5e8'];
    const sum = top.reduce((s, e) => s + e[1], 0);
    const cx = w / 2, cy = h / 2 - 5, r = Math.min(w, h) / 3.2;
    let angle = -Math.PI / 2;

    if (!sum) {
      x.fillStyle = '#273149';
      x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    } else {
      top.slice(0, 6).forEach((a, i) => {
        const next = angle + (a[1] / sum) * Math.PI * 2;
        x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, r, angle, next); x.closePath();
        x.fillStyle = colors[i]; x.fill();
        angle = next;
      });
    }
    x.beginPath(); x.arc(cx, cy, r * 0.58, 0, Math.PI * 2); x.fillStyle = '#111724'; x.fill();
    x.fillStyle = '#f5f7ff'; x.font = '600 14px Outfit'; x.textAlign = 'center';
    x.fillText(sum ? money(sum) : 'Sin gastos', cx, cy + 5);

    $('#categoryLegend').innerHTML = top.slice(0, 6).map((a, i) => `
      <div class="legend-row"><div class="legend-left"><span class="dot" style="background:${colors[i]}"></span>${escapeHtml(a[0])}</div><strong>${money(a[1])}</strong></div>
    `).join('') || '<div class="empty">No hay gastos en el período.</div>';
  }

  ['#statsFrom', '#statsTo'].forEach((s) => ($(s).onchange = renderStats));
  $('#currentMonth').onclick = () => {
    const d = new Date();
    $('#statsFrom').value = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
    $('#statsTo').value = today();
    renderStats();
  };
  $('#clearStatsFilters').onclick = () => { $('#statsFrom').value = $('#statsTo').value = ''; renderStats(); };

  window.addEventListener('resize', () => {
    if (getUser() && $('#statsPage').classList.contains('active')) renderStats();
  });

  // ==================== INICIO ====================
  setAuth();
})();
