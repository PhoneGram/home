/* =============================================
   الكاشير - نظام إدارة المطابع
   app.js - المنطق الكامل للتطبيق
============================================= */

// ── Storage Helpers ──────────────────────────
const LS = {
  get: (k, def = null) => {
    try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : def; }
    catch { return def; }
  },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} },
};

// ── Data Getters ─────────────────────────────
const getInvoices   = () => LS.get('kash_invoices', []);
const getCustomers  = () => LS.get('kash_customers', []);
const getMovements  = () => LS.get('kash_movements', []);
const getSettings   = () => LS.get('kash_settings', { printPrice: 0, workerPrice: 0 });

const saveInvoices  = v => LS.set('kash_invoices', v);
const saveCustomers = v => LS.set('kash_customers', v);
const saveMovements = v => LS.set('kash_movements', v);
const saveSettingsData = v => LS.set('kash_settings', v);

// ── Page Navigation ──────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-' + id);
  if (pg) {
    pg.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  closeDrawer();

  // Refresh page data
  switch(id) {
    case 'home':          renderHomeSummary(); break;
    case 'new-invoice':   initNewInvoice(); break;
    case 'invoices':      renderInvoices(); break;
    case 'stats':         initStats(); break;
    case 'customers':     renderCustomers(); break;
    case 'wallet':        renderWallet(); break;
    case 'movements':     renderMovements(); break;
    case 'settings':      loadSettings(); break;
  }
}

// ── Drawer ────────────────────────────────────
function openDrawer() {
  document.getElementById('sideDrawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
}
function closeDrawer() {
  document.getElementById('sideDrawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}
document.getElementById('hamburgerBtn').addEventListener('click', openDrawer);
document.getElementById('drawerClose').addEventListener('click', closeDrawer);
document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);

// ── Toast ─────────────────────────────────────
let toastTimer;
function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

// ── Modal ─────────────────────────────────────
function openModal(title, body, actions) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = body;
  const act = document.getElementById('modalActions');
  act.innerHTML = '';
  actions.forEach(a => {
    const btn = document.createElement('button');
    btn.className = a.cls || 'btn-secondary';
    btn.textContent = a.label;
    btn.onclick = () => { closeModal(); a.fn(); };
    act.appendChild(btn);
  });
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
});

// ── Number Format ─────────────────────────────
function fmt(n) {
  return Number(n || 0).toLocaleString('ar-IQ') + ' د.ع';
}
function fmtNum(n) {
  return Number(n || 0).toLocaleString('ar-IQ');
}

// ── Date Helpers ──────────────────────────────
function todayISO() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}
function formatDate(iso) {
  if (!iso) return '-';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                   'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

// ── HOME SUMMARY ──────────────────────────────
function renderHomeSummary() {
  const invs = getInvoices();
  const mvs  = getMovements();
  const totalRev = invs.reduce((s, i) => s + (i.total || 0), 0);
  const totalWithdrawMain = mvs.filter(m => m.account === 'main').reduce((s,m) => s + m.amount, 0);
  const balance = totalRev - totalWithdrawMain;
  const unpaid  = invs.filter(i => i.status === 'unpaid').length;

  document.getElementById('heroStats').innerHTML = `
    <div class="hero-stat">
      <span class="val">${fmtNum(invs.length)}</span>
      <span class="lbl">فاتورة</span>
    </div>
    <div class="hero-stat">
      <span class="val">${fmtNum(unpaid)}</span>
      <span class="lbl">غير مدفوعة</span>
    </div>
  `;
}

// ── NEW INVOICE ───────────────────────────────
function initNewInvoice() {
  const invs = getInvoices();
  const nextNum = String(invs.length + 1).padStart(6, '0');
  document.getElementById('invNumber').value = nextNum;

  // Populate customers
  const customers = getCustomers();
  const sel = document.getElementById('invCustomer');
  sel.innerHTML = '<option value="">-- اختر زبوناً --</option>';
  customers.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name} (#${c.id})`;
    sel.appendChild(opt);
  });

  // Date
  document.getElementById('manualDateToggle').checked = false;
  document.getElementById('invDate').readOnly = true;
  document.getElementById('invDate').value = todayISO();

  // Clear fields
  document.getElementById('invPrints').value = '';
  document.getElementById('invNotes').value = '';
  document.querySelector('input[name="invStatus"][value="unpaid"]').checked = true;

  calcInvoice();
}

function toggleManualDate() {
  const manual = document.getElementById('manualDateToggle').checked;
  const dateInput = document.getElementById('invDate');
  dateInput.readOnly = !manual;
  if (!manual) dateInput.value = todayISO();
}

function calcInvoice() {
  const settings = getSettings();
  const prints = parseInt(document.getElementById('invPrints').value) || 0;
  const pp = parseFloat(settings.printPrice) || 0;
  const wp = parseFloat(settings.workerPrice) || 0;
  const total = prints * pp;
  const workerTotal = prints * wp;

  document.getElementById('prevPrintPrice').textContent = fmt(pp);
  document.getElementById('prevWorkerPrice').textContent = fmt(wp);
  document.getElementById('prevTotal').textContent = prints > 0 ? fmt(total) : '-';
  document.getElementById('prevWorkerTotal').textContent = prints > 0 ? fmt(workerTotal) : '-';
}

function saveInvoice() {
  const customer = document.getElementById('invCustomer').value;
  const prints   = parseInt(document.getElementById('invPrints').value) || 0;
  const date     = document.getElementById('invDate').value;
  const notes    = document.getElementById('invNotes').value.trim();
  const status   = document.querySelector('input[name="invStatus"]:checked').value;

  if (!customer) { showToast('⚠️ يرجى اختيار زبون'); return; }
  if (prints < 1) { showToast('⚠️ يرجى إدخال عدد المطبوعات'); return; }
  if (!date)      { showToast('⚠️ يرجى تحديد التاريخ'); return; }

  const settings = getSettings();
  const pp = parseFloat(settings.printPrice) || 0;
  const wp = parseFloat(settings.workerPrice) || 0;

  // Snapshot prices at save time
  const invs = getInvoices();
  const num  = String(invs.length + 1).padStart(6, '0');
  const customers = getCustomers();
  const cust = customers.find(c => c.id === customer);

  const inv = {
    id: 'INV-' + Date.now(),
    number: num,
    customerId: customer,
    customerName: cust ? cust.name : customer,
    date,
    prints,
    printPriceSnapshot: pp,
    workerPriceSnapshot: wp,
    total: prints * pp,
    workerTotal: prints * wp,
    status,
    notes,
    createdAt: new Date().toISOString(),
  };

  invs.push(inv);
  saveInvoices(invs);
  showToast('✅ تم حفظ الفاتورة ' + num);
  showPage('invoices');
}

// ── INVOICES LIST ─────────────────────────────
function renderInvoices() {
  const filterStatus = document.getElementById('invFilterStatus').value;
  const search       = (document.getElementById('invSearch').value || '').trim().toLowerCase();
  let invs = getInvoices();

  if (filterStatus !== 'all') invs = invs.filter(i => i.status === filterStatus);
  if (search) invs = invs.filter(i =>
    i.customerName.toLowerCase().includes(search) ||
    i.number.includes(search)
  );

  // Reverse (newest first)
  invs = [...invs].reverse();

  const container = document.getElementById('invoicesList');
  if (invs.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📄</div><p>لا توجد فواتير</p></div>`;
    return;
  }

  container.innerHTML = invs.map(inv => `
    <div class="invoice-item">
      <div class="invoice-top">
        <span class="invoice-num">فاتورة #${inv.number}</span>
        <span class="badge ${inv.status}">${inv.status === 'paid' ? 'مدفوعة' : 'غير مدفوعة'}</span>
      </div>
      <div class="invoice-customer">${inv.customerName}</div>
      <div class="invoice-details">
        <span>📅 ${formatDate(inv.date)}</span>
        <span>🖨️ ${fmtNum(inv.prints)} مطبوعة</span>
      </div>
      <div class="invoice-amount">${fmt(inv.total)}</div>
      ${inv.notes ? `<div style="font-size:.8rem;color:var(--text3);margin-top:.3rem">📝 ${inv.notes}</div>` : ''}
      <div class="invoice-actions">
        ${inv.status === 'unpaid' ? `<button class="action-btn mark-paid" onclick="markInvoicePaid('${inv.id}')">✓ تحديد كمدفوعة</button>` : ''}
        <button class="action-btn delete-inv" onclick="deleteInvoice('${inv.id}')">🗑️ حذف</button>
      </div>
    </div>
  `).join('');
}

function markInvoicePaid(id) {
  openModal(
    'تأكيد الدفع',
    'هل تريد تحديد هذه الفاتورة كمدفوعة؟',
    [
      { label: 'إلغاء', cls: 'btn-secondary', fn: () => {} },
      { label: 'تأكيد', cls: 'btn-primary', fn: () => {
        const invs = getInvoices();
        const inv = invs.find(i => i.id === id);
        if (inv) { inv.status = 'paid'; saveInvoices(invs); }
        renderInvoices();
        showToast('✅ تم تحديث حالة الفاتورة');
      }},
    ]
  );
}

function deleteInvoice(id) {
  openModal(
    'حذف الفاتورة',
    'هل أنت متأكد من حذف هذه الفاتورة؟ لا يمكن التراجع.',
    [
      { label: 'إلغاء', cls: 'btn-secondary', fn: () => {} },
      { label: 'حذف', cls: 'btn-danger', fn: () => {
        const invs = getInvoices().filter(i => i.id !== id);
        saveInvoices(invs);
        renderInvoices();
        showToast('🗑️ تم حذف الفاتورة');
      }},
    ]
  );
}

// ── STATISTICS ────────────────────────────────
function initStats() {
  const invs = getInvoices();
  const years = [...new Set(invs.map(i => i.date ? i.date.split('-')[0] : ''))].filter(Boolean).sort().reverse();
  const curYear = new Date().getFullYear().toString();
  const yearSel = document.getElementById('statsYear');
  yearSel.innerHTML = '<option value="">-- اختر السنة --</option>';
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === curYear) opt.selected = true;
    yearSel.appendChild(opt);
  });
  renderStats();
}

function renderStats() {
  const year  = document.getElementById('statsYear').value;
  const month = document.getElementById('statsMonth').value;
  const invs  = getInvoices();

  const summaryEl = document.getElementById('statsSummary');
  const tableEl   = document.getElementById('statsTableWrap');
  const exportBtn = document.getElementById('statsExportBtn');

  if (!year) {
    summaryEl.innerHTML = '<p style="color:var(--text3);text-align:center;padding:1rem;">اختر السنة لعرض الإحصائيات</p>';
    tableEl.innerHTML = '';
    exportBtn.style.display = 'none';
    return;
  }

  // Filter by year (and optionally month)
  let filtered = invs.filter(i => i.date && i.date.startsWith(year));
  if (month) filtered = filtered.filter(i => i.date.split('-')[1] === month.padStart(2,'0'));

  const totalInv      = filtered.length;
  const totalPrints   = filtered.reduce((s,i) => s + (i.prints||0), 0);
  const totalRevenue  = filtered.reduce((s,i) => s + (i.total||0), 0);
  const totalWorker   = filtered.reduce((s,i) => s + (i.workerTotal||0), 0);
  const paidCount     = filtered.filter(i => i.status === 'paid').length;
  const unpaidCount   = filtered.filter(i => i.status === 'unpaid').length;

  summaryEl.innerHTML = `
    <div class="stat-card">
      <span class="s-val">${fmtNum(totalInv)}</span>
      <span class="s-lbl">إجمالي الفواتير</span>
    </div>
    <div class="stat-card">
      <span class="s-val">${fmtNum(totalPrints)}</span>
      <span class="s-lbl">إجمالي المطبوعات</span>
    </div>
    <div class="stat-card">
      <span class="s-val" style="font-size:1rem;">${fmt(totalRevenue)}</span>
      <span class="s-lbl">إجمالي الإيرادات</span>
    </div>
    <div class="stat-card">
      <span class="s-val" style="font-size:1rem;color:var(--orange);">${fmt(totalWorker)}</span>
      <span class="s-lbl">مستحقات العامل</span>
    </div>
    <div class="stat-card">
      <span class="s-val" style="color:var(--green);">${fmtNum(paidCount)}</span>
      <span class="s-lbl">مدفوعة</span>
    </div>
    <div class="stat-card">
      <span class="s-val" style="color:var(--red);">${fmtNum(unpaidCount)}</span>
      <span class="s-lbl">غير مدفوعة</span>
    </div>
  `;

  if (!month) {
    tableEl.innerHTML = '';
    exportBtn.style.display = 'none';
    return;
  }

  // Monthly day-by-day table
  const y = parseInt(year);
  const m = parseInt(month);
  const days = daysInMonth(y, m);
  const monthName = MONTHS_AR[m - 1];

  let rows = '';
  for (let d = 1; d <= days; d++) {
    const isoDay = `${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayInvs = invs.filter(i => i.date === isoDay);
    const dayPrints = dayInvs.reduce((s,i) => s + (i.prints||0), 0);
    const dayTotal  = dayInvs.reduce((s,i) => s + (i.total||0), 0);
    const paidInvs  = dayInvs.filter(i => i.status === 'paid');
    const unpaidInvs = dayInvs.filter(i => i.status === 'unpaid');

    let statusClass = 'gray';
    let statusTitle = 'لا توجد فواتير';
    if (dayInvs.length > 0) {
      if (unpaidInvs.length === 0) { statusClass = 'green'; statusTitle = 'مدفوع بالكامل'; }
      else if (paidInvs.length === 0) { statusClass = 'red'; statusTitle = 'غير مدفوع'; }
      else { statusClass = 'orange'; statusTitle = 'جزئي'; }
    }

    rows += `
      <tr>
        <td>${d}</td>
        <td>${dayPrints > 0 ? fmtNum(dayPrints) : '-'}</td>
        <td>${dayTotal > 0 ? fmt(dayTotal) : '-'}</td>
        <td><span class="day-status ${statusClass}" title="${statusTitle}"></span></td>
      </tr>
    `;
  }

  tableEl.innerHTML = `
    <div id="statsExportTarget">
      <div style="text-align:center;padding:.75rem 0;font-weight:800;font-size:1rem;color:var(--accent)">
        إحصائيات ${monthName} ${year}
      </div>
      <table class="stats-table">
        <thead>
          <tr>
            <th>اليوم</th>
            <th>المطبوعات</th>
            <th>الإيراد</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  exportBtn.style.display = 'block';
}

function exportStatsImage() {
  showToast('⏳ جاري التحضير...');
  const el = document.getElementById('statsExportTarget');
  if (!el) return;

  // Use html2canvas if available, otherwise inform user
  if (typeof html2canvas !== 'undefined') {
    html2canvas(el, {
      scale: 3,
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--surface') || '#fff',
      useCORS: true,
    }).then(canvas => {
      const link = document.createElement('a');
      link.download = `احصائيات_${document.getElementById('statsYear').value}_${document.getElementById('statsMonth').value}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('✅ تم تصدير الصورة');
    }).catch(() => showToast('❌ خطأ في التصدير'));
  } else {
    // Inline canvas export without library
    exportStatsCanvas(el);
  }
}

function exportStatsCanvas(el) {
  // Simple text-based canvas export as fallback
  const rows = el.querySelectorAll('tbody tr');
  const title = el.querySelector('div').textContent.trim();
  const W = 794, H = 1123; // A4 at 96dpi
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const isDark = document.body.classList.contains('dark-mode');

  ctx.fillStyle = isDark ? '#1a1a2e' : '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = '#e63946';
  ctx.font = 'bold 28px Cairo, Arial';
  ctx.textAlign = 'center';
  ctx.fillText(title, W / 2, 60);

  // Table header
  const headers = ['الحالة', 'الإيراد', 'المطبوعات', 'اليوم'];
  const colW = W / 4;
  const rowH = 32;
  let y = 100;
  ctx.fillStyle = '#e63946';
  ctx.fillRect(0, y, W, rowH);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px Cairo, Arial';
  headers.forEach((h, i) => {
    ctx.textAlign = 'center';
    ctx.fillText(h, (i + 0.5) * colW, y + 22);
  });
  y += rowH;

  rows.forEach((row, ri) => {
    const cells = row.querySelectorAll('td');
    ctx.fillStyle = ri % 2 === 0 ? (isDark ? '#16213e' : '#f7f8fa') : (isDark ? '#1a1a2e' : '#ffffff');
    ctx.fillRect(0, y, W, rowH);
    ctx.fillStyle = isDark ? '#e8eaf6' : '#1a202c';
    ctx.font = '16px Cairo, Arial';
    // Get status color from span class
    const span = cells[3]?.querySelector('span');
    const sc = span?.className || '';
    const statusColors = {green:'#38a169', red:'#e53e3e', orange:'#dd6b20', gray:'#a0aec0'};
    const color = Object.entries(statusColors).find(([k]) => sc.includes(k))?.[1] || '#a0aec0';
    // Draw cells
    [cells[0]?.textContent, cells[2]?.textContent, cells[1]?.textContent].forEach((txt, i) => {
      ctx.textAlign = 'center';
      ctx.fillText(txt || '', (i + 0.5) * colW, y + 22);
    });
    // Status dot
    ctx.beginPath();
    ctx.arc(colW * 0.5, y + 16, 8, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    y += rowH;
  });

  // Footer
  ctx.fillStyle = isDark ? '#7986a8' : '#718096';
  ctx.font = '14px Cairo, Arial';
  ctx.textAlign = 'center';
  ctx.fillText('إعداد وتصميم : السيد رضا محمد شاكر الميالي', W / 2, H - 30);

  const link = document.createElement('a');
  link.download = `احصائيات_${document.getElementById('statsYear').value}_${document.getElementById('statsMonth').value}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('✅ تم تصدير الصورة');
}

// ── CUSTOMERS ─────────────────────────────────
function addCustomer() {
  const name = document.getElementById('newCustomerName').value.trim();
  if (!name) { showToast('⚠️ أدخل اسم الزبون'); return; }
  const customers = getCustomers();
  const newId = String(customers.length + 1).padStart(4, '0');
  customers.push({ id: newId, name, createdAt: new Date().toISOString() });
  saveCustomers(customers);
  document.getElementById('newCustomerName').value = '';
  renderCustomers();
  showToast('✅ تم إضافة الزبون');
}

function renderCustomers() {
  const customers = getCustomers();
  const container = document.getElementById('customersList');
  if (customers.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>لا يوجد زبائن بعد</p></div>`;
    return;
  }
  container.innerHTML = [...customers].reverse().map(c => `
    <div class="customer-item">
      <div class="customer-info">
        <div class="customer-avatar">${c.name.charAt(0)}</div>
        <div>
          <div class="customer-name">${c.name}</div>
          <div class="customer-id">#${c.id}</div>
        </div>
      </div>
      <button class="del-btn" onclick="deleteCustomer('${c.id}')">🗑</button>
    </div>
  `).join('');
}

function deleteCustomer(id) {
  openModal(
    'حذف زبون',
    'هل أنت متأكد من حذف هذا الزبون؟',
    [
      { label: 'إلغاء', cls: 'btn-secondary', fn: () => {} },
      { label: 'حذف', cls: 'btn-danger', fn: () => {
        const customers = getCustomers().filter(c => c.id !== id);
        saveCustomers(customers);
        renderCustomers();
        showToast('🗑️ تم حذف الزبون');
      }},
    ]
  );
}

// ── WALLET ────────────────────────────────────
function renderWallet() {
  const invs = getInvoices();
  const mvs  = getMovements();

  const totalMainIn    = invs.reduce((s,i) => s + (i.total||0), 0);
  const totalWorkerIn  = invs.reduce((s,i) => s + (i.workerTotal||0), 0);
  const withdrawMain   = mvs.filter(m => m.account === 'main').reduce((s,m) => s + (m.amount||0), 0);
  const withdrawWorker = mvs.filter(m => m.account === 'worker').reduce((s,m) => s + (m.amount||0), 0);
  const balMain   = totalMainIn - withdrawMain;
  const balWorker = totalWorkerIn - withdrawWorker;

  document.getElementById('walletCards').innerHTML = `
    <div class="wallet-card main">
      <div class="wc-label">💼 الحساب الرئيسي</div>
      <span class="wc-amount">${fmt(balMain)}</span>
      <div class="wc-sub">الوارد: ${fmt(totalMainIn)} | المسحوب: ${fmt(withdrawMain)}</div>
    </div>
    <div class="wallet-card worker">
      <div class="wc-label">👷 حساب العامل</div>
      <span class="wc-amount">${fmt(balWorker)}</span>
      <div class="wc-sub">المستحق: ${fmt(totalWorkerIn)} | المسحوب: ${fmt(withdrawWorker)}</div>
    </div>
  `;
}

function withdraw(account) {
  const inputId = account === 'main' ? 'withdrawMain' : 'withdrawWorker';
  const amount  = parseFloat(document.getElementById(inputId).value) || 0;
  if (amount <= 0) { showToast('⚠️ أدخل مبلغاً صحيحاً'); return; }

  const invs = getInvoices();
  const mvs  = getMovements();
  const totalIn    = account === 'main'
    ? invs.reduce((s,i) => s + (i.total||0), 0)
    : invs.reduce((s,i) => s + (i.workerTotal||0), 0);
  const totalOut   = mvs.filter(m => m.account === account).reduce((s,m) => s + (m.amount||0), 0);
  const balance    = totalIn - totalOut;

  if (amount > balance) { showToast(`⚠️ الرصيد غير كافٍ (${fmt(balance)})`); return; }

  openModal(
    'تأكيد السحب',
    `سيتم سحب <strong>${fmt(amount)}</strong> من ${account === 'main' ? 'الحساب الرئيسي' : 'حساب العامل'}. هل تأكد؟`,
    [
      { label: 'إلغاء', cls: 'btn-secondary', fn: () => {} },
      { label: 'تأكيد السحب', cls: 'btn-danger', fn: () => {
        mvs.unshift({
          id: 'MOV-' + Date.now(),
          account,
          amount,
          date: new Date().toISOString(),
          note: `سحب من ${account === 'main' ? 'الحساب الرئيسي' : 'حساب العامل'}`,
        });
        saveMovements(mvs);
        document.getElementById(inputId).value = '';
        renderWallet();
        showToast('✅ تم تسجيل عملية السحب');
      }},
    ]
  );
}

// ── MOVEMENTS ─────────────────────────────────
function renderMovements() {
  const mvs = getMovements();
  const container = document.getElementById('movementsList');
  if (mvs.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>لا توجد حركات بعد</p></div>`;
    return;
  }
  container.innerHTML = mvs.map(m => {
    const d = new Date(m.date);
    const dateStr = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    return `
      <div class="movement-item">
        <div class="mov-info">
          <div class="mov-type">${m.account === 'main' ? '💼 الحساب الرئيسي' : '👷 حساب العامل'}</div>
          <div class="mov-amount">-${fmt(m.amount)}</div>
        </div>
        <div>
          <div class="mov-icon">💸</div>
          <div class="mov-date">${dateStr}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ── SETTINGS ──────────────────────────────────
function loadSettings() {
  const s = getSettings();
  document.getElementById('setPrintPrice').value  = s.printPrice  || '';
  document.getElementById('setWorkerPrice').value = s.workerPrice || '';
  const dark = document.body.classList.contains('dark-mode');
  document.getElementById('darkModeToggle').checked = dark;
}

function saveSettings() {
  const pp = parseFloat(document.getElementById('setPrintPrice').value)  || 0;
  const wp = parseFloat(document.getElementById('setWorkerPrice').value) || 0;
  saveSettingsData({ printPrice: pp, workerPrice: wp });
  showToast('✅ تم حفظ الإعدادات');
}

function toggleDarkMode() {
  const isDark = document.getElementById('darkModeToggle').checked;
  document.body.classList.toggle('dark-mode', isDark);
  LS.set('kash_darkmode', isDark);
}

// ── IMPORT / EXPORT ───────────────────────────
function exportData() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    invoices: getInvoices(),
    customers: getCustomers(),
    movements: getMovements(),
    settings: getSettings(),
    darkMode: LS.get('kash_darkmode', false),
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `الكاشير_نسخة_احتياطية_${new Date().toLocaleDateString('en-CA').replace(/-/g,'')}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ تم تحميل النسخة الاحتياطية');
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      openModal(
        'استيراد البيانات',
        `سيتم استبدال جميع البيانات الحالية بالبيانات الموجودة في الملف.<br><br>
         📄 فواتير: ${data.invoices?.length || 0}<br>
         👥 زبائن: ${data.customers?.length || 0}<br>
         📋 حركات: ${data.movements?.length || 0}<br><br>
         هل أنت متأكد؟`,
        [
          { label: 'إلغاء', cls: 'btn-secondary', fn: () => {} },
          { label: 'استيراد', cls: 'btn-primary', fn: () => {
            if (data.invoices)  saveInvoices(data.invoices);
            if (data.customers) saveCustomers(data.customers);
            if (data.movements) saveMovements(data.movements);
            if (data.settings)  saveSettingsData(data.settings);
            if (typeof data.darkMode === 'boolean') {
              LS.set('kash_darkmode', data.darkMode);
              document.body.classList.toggle('dark-mode', data.darkMode);
            }
            showToast('✅ تم استيراد البيانات بنجاح');
            showPage('home');
          }},
        ]
      );
    } catch {
      showToast('❌ ملف غير صالح');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function resetAllData() {
  openModal(
    '⚠️ حذف كل البيانات',
    'سيتم حذف جميع الفواتير والزبائن والحركات والإعدادات. هذا الإجراء لا يمكن التراجع عنه!',
    [
      { label: 'إلغاء', cls: 'btn-secondary', fn: () => {} },
      { label: 'حذف الكل', cls: 'btn-danger', fn: () => {
        ['kash_invoices','kash_customers','kash_movements','kash_settings'].forEach(k => localStorage.removeItem(k));
        showToast('🗑️ تم حذف كل البيانات');
        showPage('home');
      }},
    ]
  );
}

// ── INIT ──────────────────────────────────────
function init() {
  // Restore dark mode
  const isDark = LS.get('kash_darkmode', false);
  if (isDark) document.body.classList.add('dark-mode');

  // Show home
  showPage('home');

  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
