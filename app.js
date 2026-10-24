import { cfg } from './firebase-config.js';

const MES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const PAG = ['PIX','Cartão Débito','Cartão Crédito','Dinheiro','Transferência'];
const $ = s => document.querySelector(s);
const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const DEF = () => ({
  cats: [['Alimentação', '#f59e0b'], ['Transporte', '#3b82f6'], ['Reserva', '#22c55e', 1], ['Parcelados', '#8b5cf6'],
    ['Lazer', '#ec4899'], ['Vestuário', '#06b6d4'], ['Contas', '#f97316'], ['Outros', '#94a3b8']]
    .map(([name, color, saving]) => ({ id: uid(), name, color, saving: !!saving })),
  months: {}
});

let S = JSON.parse(localStorage.getItem('fin26') || 'null') || DEF();
let view = 'dash', mi = new Date().getMonth(), charts = [], post = null, fb = null, user = null, timer;
const M = i => (S.months[i] ??= { saldo: 0, tx: [], inst: [] });
const cat = id => S.cats.find(c => c.id === id);
const calc = i => {
  const m = M(i); let tot = 0, sav = 0;
  m.tx.forEach(x => { tot += +x.valor || 0; if (cat(x.cat)?.saving) sav += +x.valor || 0; });
  return { saldo: +m.saldo || 0, tot, sav, g: tot - sav, disp: (+m.saldo || 0) - tot };
};
const kpi = (l, v, cls = '') => `<div class="card kpi g"><span>${l}</span><b class="${cls}">${brl(v)}</b></div>`;

function save() {
  localStorage.setItem('fin26', JSON.stringify(S));
  if (fb && user) {
    clearTimeout(timer);
    timer = setTimeout(() => fb.setDoc(fb.doc(fb.db, 'users', user.uid, 'app', 'state'), JSON.parse(JSON.stringify(S))), 600);
  }
}

async function initFb() {
  if (!cfg.apiKey) { $('#user').textContent = 'Modo local (sem nuvem)'; return; }
  const u = n => import(`https://www.gstatic.com/firebasejs/10.12.2/firebase-${n}.js`);
  const [a, au, fs] = await Promise.all([u('app'), u('auth'), u('firestore')]);
  const app = a.initializeApp(cfg), auth = au.getAuth(app);
  fb = { db: fs.getFirestore(app), doc: fs.doc, setDoc: fs.setDoc, getDoc: fs.getDoc };
  au.onAuthStateChanged(auth, async us => {
    user = us;
    if (us) {
      const s = await fb.getDoc(fb.doc(fb.db, 'users', us.uid, 'app', 'state'));
      if (s.exists()) S = s.data(); else save();
      $('#user').innerHTML = `${esc(us.email)}<br><button class="x" id="out">Sair</button>`;
      $('#out').onclick = () => au.signOut(auth);
    } else {
      $('#user').innerHTML = '<button class="b" id="in">Entrar com Google</button>';
      $('#in').onclick = () => au.signInWithPopup(auth, new au.GoogleAuthProvider());
    }
    render();
  });
}

// ---------- telas ----------
function dash() {
  const all = MES.map((_, i) => calc(i));
  const sum = k => all.reduce((a, x) => a + x[k], 0);
  const byCat = S.cats.map(c => ({ c, v: MES.reduce((a, _, i) => a + M(i).tx.filter(x => x.cat === c.id).reduce((s, x) => s + (+x.valor || 0), 0), 0) })).filter(x => x.v > 0);
  post = () => {
    charts.push(new Chart($('#c1'), {
      type: 'bar',
      data: { labels: MES.map(m => m.slice(0, 3)), datasets: [
        { label: 'Salário', data: all.map(x => x.saldo), backgroundColor: '#64748b' },
        { label: 'Gastos', data: all.map(x => x.g), backgroundColor: '#f43f5e' },
        { label: 'Reserva', data: all.map(x => x.sav), backgroundColor: '#22c55e' }] },
      options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${brl(c.parsed.y)}` } } },
        scales: { y: { ticks: { callback: v => brl(v) } } },
        onClick: (e, els) => { if (els.length) { mi = els[0].index; view = 'mes'; render(); } } }
    }));
    charts.push(new Chart($('#c2'), {
      type: 'doughnut',
      data: { labels: byCat.map(x => x.c.name), datasets: [{ data: byCat.map(x => x.v), backgroundColor: byCat.map(x => x.c.color), borderColor: '#111b16' }] },
      options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right' },
        tooltip: { callbacks: { label: c => `${c.label}: ${brl(c.parsed)} (${(c.parsed / c.dataset.data.reduce((a, b) => a + b, 0) * 100).toFixed(1)}%)` } } } }
    }));
  };
  return `<h1>Dashboard</h1><div class="grid">${kpi('Salário no ano', sum('saldo'))}${kpi('Gastos no ano', sum('g'))}${kpi('Reservado', sum('sav'))}${kpi('Disponível', sum('disp'), sum('disp') < 0 ? 'neg' : 'pos')}</div>
  <div class="two"><div class="card"><h2>Mês a mês · clique numa barra para abrir o mês</h2><div class="chart"><canvas id="c1"></canvas></div></div>
  <div class="card"><h2>Gastos por categoria · clique na legenda para ocultar</h2><div class="chart"><canvas id="c2"></canvas></div></div></div>`;
}

function mes() {
  const m = M(mi), c = calc(mi);
  const byCat = S.cats.map(k => ({ k, v: m.tx.filter(x => x.cat === k.id).reduce((s, x) => s + (+x.valor || 0), 0) })).filter(x => x.v > 0);
  post = () => charts.push(new Chart($('#cm'), {
    type: 'doughnut',
    data: { labels: byCat.map(x => x.k.name), datasets: [{ data: byCat.map(x => x.v), backgroundColor: byCat.map(x => x.k.color), borderColor: '#111b16' }] },
    options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: t => `${t.label}: ${brl(t.parsed)}` } } } }
  }));
  const copt = S.cats.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  const popt = PAG.map(p => `<option>${p}</option>`).join('');
  const rows = m.tx.map(x => { const k = cat(x.cat); return `<tr><td>${x.date ? x.date.split('-').reverse().join('/') : ''}</td><td>${brl(x.valor)}</td><td>${esc(x.pag)}</td><td><span class="tag" style="background:${k?.color || '#94a3b8'}">${esc(k?.name || '—')}</span></td><td>${esc(x.desc)}</td><td><button class="x" data-act="deltx" data-id="${x.id}">✕</button></td></tr>`; }).join('');
  const inst = m.inst.map(x => `<tr><td><input type="checkbox" data-f="pago" data-id="${x.id}" ${x.pago ? 'checked' : ''}></td><td>${brl(x.valor)}</td><td>${esc(x.pag)}</td><td>${esc(x.desc)}</td><td><button class="x" data-act="delinst" data-id="${x.id}">✕</button></td></tr>`).join('');
  const aPagar = m.inst.filter(x => !x.pago).reduce((s, x) => s + (+x.valor || 0), 0);
  return `<h1>${MES[mi]} 2026</h1>
  <div class="row"><select data-f="mi">${MES.map((n, i) => `<option value="${i}" ${i === mi ? 'selected' : ''}>${n}</option>`).join('')}</select>
  <label>Saldo inicial <input type="number" step="0.01" data-f="saldo" value="${m.saldo || ''}" placeholder="0,00"></label></div>
  <div class="grid">${kpi('Saldo inicial', c.saldo)}${kpi('Gastos do mês', c.g)}${kpi('Reservado', c.sav)}${kpi('Disponível', c.disp, c.disp < 0 ? 'neg' : 'pos')}</div>
  <div class="two"><div class="card"><h2>Despesas do mês</h2>
  <div class="row"><input id="nd" type="date" value="${new Date().toISOString().slice(0, 10)}"><input id="nv" type="number" step="0.01" placeholder="Valor" style="width:100px"><select id="np">${popt}</select><select id="nc">${copt}</select><input id="ni" placeholder="Descrição"><button class="b" data-act="addtx">Adicionar</button></div>
  <table><tr><th>Data</th><th>Valor</th><th>Pagamento</th><th>Categoria</th><th>Descrição</th><th></th></tr>${rows}</table></div>
  <div><div class="card" style="margin-bottom:14px"><h2>Por categoria</h2><div class="chart" style="height:240px"><canvas id="cm"></canvas></div></div>
  <div class="card"><h2>Próximo mês · parcelas (a pagar: ${brl(aPagar)})</h2>
  <div class="row"><input id="iv" type="number" step="0.01" placeholder="Valor" style="width:100px"><select id="ip">${popt}</select><input id="id" placeholder="Descrição"><button class="b" data-act="addinst">Adicionar</button></div>
  <table><tr><th>Pago</th><th>Valor</th><th>Pagamento</th><th>Descrição</th><th></th></tr>${inst}</table></div></div></div>`;
}

function catsV() {
  const rows = S.cats.map(c => `<tr><td><input type="color" data-f="ccolor" data-id="${c.id}" value="${c.color}"></td><td><input data-f="cname" data-id="${c.id}" value="${esc(c.name)}"></td>
  <td><label><input type="checkbox" data-f="csave" data-id="${c.id}" ${c.saving ? 'checked' : ''}> É reserva (não conta como gasto)</label></td><td><button class="x" data-act="delcat" data-id="${c.id}">✕</button></td></tr>`).join('');
  return `<h1>Categorias</h1><div class="card"><div class="row"><input type="color" id="ncc" value="#22c55e"><input id="ncn" placeholder="Nova categoria"><button class="b" data-act="addcat">Adicionar</button></div>
  <table><tr><th>Cor</th><th>Nome</th><th>Tipo</th><th></th></tr>${rows}</table></div>`;
}

function render() {
  charts.forEach(c => c.destroy()); charts = []; post = null;
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
  $('#main').innerHTML = { dash, mes, cats: catsV }[view]();
  post?.();
}

// ---------- eventos ----------
const val = id => $(id)?.value;
const ACT = {
  addtx() { const v = +val('#nv'); if (!v) return; M(mi).tx.push({ id: uid(), date: val('#nd'), valor: v, pag: val('#np'), cat: val('#nc'), desc: val('#ni') }); },
  deltx(d) { M(mi).tx = M(mi).tx.filter(x => x.id !== d.id); },
  addinst() { const v = +val('#iv'); if (!v) return; M(mi).inst.push({ id: uid(), valor: v, pag: val('#ip'), desc: val('#id'), pago: false }); },
  delinst(d) { M(mi).inst = M(mi).inst.filter(x => x.id !== d.id); },
  addcat() { const n = val('#ncn').trim(); if (n) S.cats.push({ id: uid(), name: n, color: val('#ncc'), saving: false }); },
  delcat(d) {
    if (MES.some((_, i) => M(i).tx.some(x => x.cat === d.id))) return alert('Esta categoria tem lançamentos. Mova-os antes de excluir.');
    S.cats = S.cats.filter(c => c.id !== d.id);
  }
};
$('#main').onclick = e => { const a = e.target.closest('[data-act]'); if (!a) return; ACT[a.dataset.act](a.dataset); save(); render(); };
$('#main').onchange = e => {
  const t = e.target, f = t.dataset.f; if (!f) return;
  const c = cat(t.dataset.id), i = M(mi).inst.find(x => x.id === t.dataset.id);
  if (f === 'mi') mi = +t.value;
  else if (f === 'saldo') M(mi).saldo = +t.value;
  else if (f === 'pago') i.pago = t.checked;
  else if (f === 'cname') c.name = t.value;
  else if (f === 'ccolor') c.color = t.value;
  else if (f === 'csave') c.saving = t.checked;
  save(); render();
};
document.querySelector('nav').onclick = e => { const b = e.target.closest('button'); if (b) { view = b.dataset.v; render(); } };

Chart.defaults.color = '#8aa396';
Chart.defaults.borderColor = '#1f2d26';
render();
initFb();
