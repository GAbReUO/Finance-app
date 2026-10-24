import { cfg } from './firebase-config.js';

const MES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const PAG = ['PIX','Cartão Débito','Cartão Crédito','Dinheiro','Transferência'];
const $ = s => document.querySelector(s);
const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const NOW = new Date().getMonth();
const DEF = () => ({
  cats: [['Alimentação', '#f59e0b'], ['Transporte', '#3b82f6'], ['Reserva', '#22c55e', 1], ['Parcelados', '#8b5cf6'],
    ['Lazer', '#ec4899'], ['Vestuário', '#06b6d4'], ['Contas', '#f97316'], ['Outros', '#94a3b8']]
    .map(([name, color, saving]) => ({ id: uid(), name, color, saving: !!saving })), months: {}
});
const fix = s => { s.months ??= {}; s.res ??= { inicial: 0, saidas: [] }; s.sim ??= { entrada: 0, itens: [] }; return s; };

let S = fix(JSON.parse(localStorage.getItem('fin26') || 'null') || DEF());
let view = 'dash', mi = NOW, open = false, charts = [], post = null, fb = null, user = null, timer;
const M = i => (S.months[i] ??= { saldo: 0, tx: [], inst: [] });
const cat = id => S.cats.find(c => c.id === id);
const sum = (a, f) => a.reduce((s, x) => s + (+f(x) || 0), 0);
const calc = i => {
  const m = M(i), tot = sum(m.tx, x => x.valor), sav = sum(m.tx.filter(x => cat(x.cat)?.saving), x => x.valor);
  return { saldo: +m.saldo || 0, tot, sav, g: tot - sav, disp: (+m.saldo || 0) - tot };
};
const catMonth = (c, i) => sum(M(i).tx.filter(x => x.cat === c.id), x => x.valor);
const kpi = (l, v, cls = '') => `<div class="card kpi"><span>${l}</span><b class="${cls}">${brl(v)}</b></div>`;
const sgn = v => v < 0 ? 'neg' : 'pos';
const donut = (id, items) => charts.push(new Chart($(id), {
  type: 'doughnut',
  data: { labels: items.map(x => x.n), datasets: [{ data: items.map(x => x.v), backgroundColor: items.map(x => x.c), borderColor: '#141414' }] },
  options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right' },
    tooltip: { callbacks: { label: t => `${t.label}: ${brl(t.parsed)} (${(t.parsed / t.dataset.data.reduce((a, b) => a + b, 0) * 100).toFixed(1)}%)` } } } }
}));

const status = (t, bad) => { const e = $('#sync'); if (e) { e.textContent = t; e.style.color = bad ? '#f43f5e' : '#22c55e'; } };
function cloud() {
  if (!(fb && user)) return Promise.resolve();
  status('☁ Salvando…');
  return fb.setDoc(fb.doc(fb.db, 'users', user.uid, 'app', 'state'), JSON.parse(JSON.stringify(S)))
    .then(() => status('☁ Salvo na nuvem'))
    .catch(e => { status('⚠ Erro ao salvar na nuvem: ' + (e.code || e.message), true); throw e; });
}
function save() {
  localStorage.setItem('fin26', JSON.stringify(S));
  clearTimeout(timer);
  timer = setTimeout(() => cloud().catch(() => {}), 400);
}
addEventListener('pagehide', () => { if (timer) { clearTimeout(timer); cloud().catch(() => {}); } });

async function initFb() {
  if (!cfg.apiKey) { $('#user').textContent = 'Modo local (sem nuvem)'; return; }
  const u = n => import(`https://www.gstatic.com/firebasejs/10.12.2/firebase-${n}.js`);
  const [a, au, fs] = await Promise.all([u('app'), u('auth'), u('firestore')]);
  const app = a.initializeApp(cfg), auth = au.getAuth(app);
  fb = { db: fs.getFirestore(app), doc: fs.doc, setDoc: fs.setDoc, getDoc: fs.getDoc, au, auth };
  au.onAuthStateChanged(auth, async us => {
    user = us;
    if (us) {
      try {
        const s = await fb.getDoc(fb.doc(fb.db, 'users', us.uid, 'app', 'state'));
        if (s.exists()) { S = fix(s.data()); localStorage.setItem('fin26', JSON.stringify(S)); status('☁ Dados carregados da nuvem'); }
        else await cloud();
      } catch (e) { status('⚠ Erro ao acessar a nuvem: ' + (e.code || e.message), true); }
      $('#user').innerHTML = `${esc(us.email)}<br><button class="x" id="out">Sair</button>`;
      $('#out').onclick = () => au.signOut(auth);
    } else $('#user').textContent = '';
    render();
  });
}

// ---------- menu ----------
function side() {
  const it = (v, l, i) => `<button data-v="${v}" class="${view === v ? 'on' : ''}">${i} <span>${l}</span></button>`;
  $('#nav').innerHTML = it('dash', 'Dashboard', '📊') +
    `<button data-t="1" class="${view === 'mes' ? 'on' : ''}">🗓️ <span>Mês</span><i>${open ? '▾' : '▸'}</i></button>` +
    (open ? `<div class="sub">${MES.map((n, i) => `<button data-m="${i}" class="${view === 'mes' && mi === i ? 'on' : ''} ${i === NOW ? 'now' : ''}">${n}</button>`).join('')}</div>` : '') +
    it('cg', 'Controle Geral', '📋') + it('res', 'Reserva', '💰') + it('sim', 'Simulação', '🧮') + it('cats', 'Categorias', '🏷️');
}

// ---------- telas ----------
function dash() {
  const all = MES.map((_, i) => calc(i)), t = k => sum(all, x => x[k]);
  const byCat = S.cats.map(c => ({ n: c.name, c: c.color, v: sum(MES, (_, i) => 0) + MES.reduce((a, _, i) => a + catMonth(c, i), 0) })).filter(x => x.v > 0);
  const resTot = (+S.res.inicial || 0) + t('sav') - sum(S.res.saidas, x => x.valor);
  post = () => {
    charts.push(new Chart($('#c1'), { type: 'bar',
      data: { labels: MES.map(m => m.slice(0, 3)), datasets: [
        { label: 'Salário', data: all.map(x => x.saldo), backgroundColor: '#525252' },
        { label: 'Gastos', data: all.map(x => x.g), backgroundColor: '#f43f5e' },
        { label: 'Reserva', data: all.map(x => x.sav), backgroundColor: '#22c55e' }] },
      options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${brl(c.parsed.y)}` } } },
        scales: { y: { ticks: { callback: v => brl(v) } } },
        onClick: (e, els) => { if (els.length) { mi = els[0].index; view = 'mes'; open = true; render(); } } } }));
    donut('#c2', byCat);
    charts.push(new Chart($('#c3'), { type: 'bar',
      data: { labels: MES.map(m => m.slice(0, 3)), datasets: S.cats.filter(c => !c.saving).map(c => ({ label: c.name, data: MES.map((_, i) => catMonth(c, i)), backgroundColor: c.color })) },
      options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: v => brl(v) } } },
        plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: c => c.parsed.y ? `${c.dataset.label}: ${brl(c.parsed.y)}` : null } } } } }));
  };
  const act = all.filter(x => x.g > 0);
  return `<h1>Dashboard</h1><div class="grid">${kpi('Salário no ano', t('saldo'))}${kpi('Gastos no ano', t('g'))}${kpi('Reservado em 2026', t('sav'))}${kpi('Reserva total', resTot)}${kpi('Média mensal de gastos', act.length ? t('g') / act.length : 0)}${kpi('Disponível no ano', t('disp'), sgn(t('disp')))}</div>
  <div class="two"><div class="card"><h2>Mês a mês · clique numa barra para abrir o mês</h2><div class="chart"><canvas id="c1"></canvas></div></div>
  <div class="card"><h2>Gastos por categoria · clique na legenda para ocultar</h2><div class="chart"><canvas id="c2"></canvas></div></div></div>
  <div class="card"><h2>Evolução por categoria (sem reserva)</h2><div class="chart"><canvas id="c3"></canvas></div></div>`;
}

function mes() {
  const m = M(mi), c = calc(mi);
  post = () => donut('#cm', S.cats.map(k => ({ n: k.name, c: k.color, v: catMonth(k, mi) })).filter(x => x.v > 0));
  const copt = S.cats.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join(''), popt = PAG.map(p => `<option>${p}</option>`).join('');
  const rows = m.tx.map(x => { const k = cat(x.cat); return `<tr><td>${x.date ? x.date.split('-').reverse().join('/') : ''}</td><td class="n">${brl(x.valor)}</td><td>${esc(x.pag)}</td><td><span class="tag" style="background:${k?.color || '#94a3b8'}">${esc(k?.name || '—')}</span></td><td title="${esc(x.note)}">${esc(x.desc)}${x.note ? ' 💬' : ''}</td><td><button class="x" data-act="deltx" data-id="${x.id}">✕</button></td></tr>`; }).join('');
  const inst = m.inst.map(x => `<tr><td><input type="checkbox" data-f="pago" data-id="${x.id}" ${x.pago ? 'checked' : ''}></td><td class="n">${brl(x.valor)}</td><td>${esc(x.pag)}</td><td title="${esc(x.note)}">${esc(x.desc)}${x.note ? ' 💬' : ''}</td><td><button class="x" data-act="delinst" data-id="${x.id}">✕</button></td></tr>`).join('');
  const aPagar = sum(m.inst.filter(x => !x.pago), x => x.valor);
  return `<h1>${MES[mi]} 2026</h1>
  <div class="row"><label>Saldo inicial <input type="number" step="0.01" data-f="saldo" value="${m.saldo || ''}" placeholder="0,00"></label></div>
  <div class="grid">${kpi('Saldo inicial', c.saldo)}${kpi('Gastos do mês', c.g)}${kpi('Reservado', c.sav)}${kpi('Disponível', c.disp, sgn(c.disp))}${kpi('Parcelas a pagar', aPagar)}</div>
  <div class="cols"><div class="card"><h2>Despesas do mês</h2>
  <div class="row"><input id="nd" type="date" value="${new Date().toISOString().slice(0, 10)}"><input id="nv" type="number" step="0.01" placeholder="Valor" style="width:110px"><select id="np">${popt}</select><select id="nc">${copt}</select><input id="ni" placeholder="Descrição" style="flex:1;min-width:140px"><button class="b" data-act="addtx">Adicionar</button></div>
  <div class="scroll"><table><tr><th>Data</th><th class="n">Valor</th><th>Pagamento</th><th>Categoria</th><th>Descrição</th><th></th></tr>${rows}</table></div></div>
  <div><div class="card" style="margin-bottom:14px"><h2>Por categoria</h2><div class="chart" style="height:260px"><canvas id="cm"></canvas></div></div>
  <div class="card"><h2>Próximo mês · parcelas</h2>
  <div class="row"><input id="iv" type="number" step="0.01" placeholder="Valor" style="width:100px"><select id="ip">${popt}</select><input id="id" placeholder="Descrição" style="flex:1;min-width:100px"><button class="b" data-act="addinst">Adicionar</button></div>
  <div class="scroll"><table><tr><th>Pago</th><th class="n">Valor</th><th>Pagamento</th><th>Descrição</th><th></th></tr>${inst}</table></div></div></div></div>`;
}

function cg() {
  const row = (l, f, cls = '', dot = '') => { const v = MES.map((_, i) => f(i)); return `<tr class="${cls}"><td>${dot}${esc(l)}</td>${v.map(x => `<td class="n">${x ? brl(x) : '–'}</td>`).join('')}<td class="n"><b>${brl(sum(v, x => x))}</b></td></tr>`; };
  return `<h1>Controle Geral</h1><div class="card scroll"><table><tr><th>Resumo</th>${MES.map(m => `<th class="n">${m.slice(0, 3)}</th>`).join('')}<th class="n">Total</th></tr>
  ${row('Salário', i => calc(i).saldo)}${row('Gastos', i => calc(i).g)}${row('Reserva', i => calc(i).sav)}${row('Disponível', i => calc(i).disp, 'sum')}
  <tr class="h"><td colspan="14">GASTOS POR CATEGORIA</td></tr>
  ${S.cats.map(c => row(c.name, i => catMonth(c, i), '', `<span class="tag" style="background:${c.color};margin-right:8px">&nbsp;</span>`)).join('')}
  ${row('Total saídas', i => calc(i).tot, 'sum')}</table></div>`;
}

function res() {
  const r = S.res, sav = MES.map((_, i) => calc(i).sav), tot = sum(sav, x => x), sai = sum(r.saidas, x => x.valor);
  let a = +r.inicial || 0; const acc = sav.map(v => (a += v));
  post = () => charts.push(new Chart($('#cr'), { type: 'line',
    data: { labels: MES.map(m => m.slice(0, 3)), datasets: [{ label: 'Reserva acumulada', data: acc, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,.15)', fill: true, tension: .3 }] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => brl(c.parsed.y) } } }, scales: { y: { ticks: { callback: v => brl(v) } } } } }));
  const rows = r.saidas.map(x => `<tr><td>${x.date ? x.date.split('-').reverse().join('/') : ''}</td><td class="n">${brl(x.valor)}</td><td>${esc(x.desc)}</td><td><button class="x" data-act="delres" data-id="${x.id}">✕</button></td></tr>`).join('');
  return `<h1>Reserva</h1><div class="grid">
  <div class="card kpi"><span>Saldo inicial</span><input type="number" step="0.01" data-f="rinicial" value="${r.inicial || ''}" style="width:100%;margin-top:6px;font-size:18px;font-weight:700"></div>
  ${kpi('Guardado em 2026', tot)}${kpi('Saídas da reserva', sai, 'neg')}${kpi('Total atual', (+r.inicial || 0) + tot - sai, 'pos')}</div>
  <div class="cols"><div class="card"><h2>Reserva acumulada · passe o mouse nos pontos</h2><div class="chart"><canvas id="cr"></canvas></div></div>
  <div class="card"><h2>Saídas da reserva</h2><div class="row"><input id="rd" type="date"><input id="rv" type="number" step="0.01" placeholder="Valor" style="width:100px"><input id="rn" placeholder="Descrição" style="flex:1;min-width:100px"><button class="b" data-act="addres">Adicionar</button></div>
  <table><tr><th>Data</th><th class="n">Valor</th><th>Descrição</th><th></th></tr>${rows}</table></div></div>`;
}

function sim() {
  const s = S.sim, prev = sum(s.itens.filter(x => x.on !== false), x => x.valor), sobra = (+s.entrada || 0) - prev;
  const rows = s.itens.map(x => `<tr><td><input type="checkbox" data-f="son" data-id="${x.id}" ${x.on !== false ? 'checked' : ''}></td><td>${esc(x.desc)}</td><td class="n">${brl(x.valor)}</td><td><button class="x" data-act="delsim" data-id="${x.id}">✕</button></td></tr>`).join('');
  return `<h1>Simulação</h1><div class="grid">
  <div class="card kpi"><span>Entrada prevista (salário)</span><input type="number" step="0.01" data-f="sentrada" value="${s.entrada || ''}" style="width:100%;margin-top:6px;font-size:18px;font-weight:700"></div>
  ${kpi('Gastos previstos', prev)}${kpi('Sobra prevista', sobra, sgn(sobra))}</div>
  <div class="card"><h2>Contas e gastos previstos · desmarque para tirar da conta</h2>
  <div class="row"><input id="sd" placeholder="Descrição" style="flex:1;min-width:160px"><input id="sv" type="number" step="0.01" placeholder="Valor" style="width:110px"><button class="b" data-act="addsim">Adicionar</button>
  <button class="x" data-act="simparc">+ Trazer parcelas de ${MES[mi]}</button><button class="x" data-act="simclear">Limpar tudo</button></div>
  <table><tr><th>Usar</th><th>Descrição</th><th class="n">Valor</th><th></th></tr>${rows}</table></div>`;
}

function catsV() {
  const rows = S.cats.map(c => `<tr><td><input type="color" data-f="ccolor" data-id="${c.id}" value="${c.color}"></td><td><input data-f="cname" data-id="${c.id}" value="${esc(c.name)}"></td>
  <td><label><input type="checkbox" data-f="csave" data-id="${c.id}" ${c.saving ? 'checked' : ''}> É reserva (não conta como gasto)</label></td><td><button class="x" data-act="delcat" data-id="${c.id}">✕</button></td></tr>`).join('');
  return `<h1>Categorias</h1><div class="card"><div class="row"><input type="color" id="ncc" value="#22c55e"><input id="ncn" placeholder="Nova categoria"><button class="b" data-act="addcat">Adicionar</button></div>
  <table><tr><th>Cor</th><th>Nome</th><th>Tipo</th><th></th></tr>${rows}</table></div>`;
}

function loginV() {
  return `<h1>Entrar</h1><div class="card" style="max-width:360px"><div class="row" style="flex-direction:column;align-items:stretch">
  <input id="em" type="email" placeholder="E-mail"><input id="pw" type="password" placeholder="Senha (mín. 6 caracteres)">
  <button class="b" data-act="login">Entrar</button><button class="x" data-act="signup">Criar conta com e-mail</button><button class="x" data-act="google">Entrar com Google</button></div></div>`;
}

function render() {
  charts.forEach(c => c.destroy()); charts = []; post = null; side();
  if (fb && !user) { $('#main').innerHTML = loginV(); return; }
  $('#main').innerHTML = { dash, mes, cg, res, sim, cats: catsV }[view]();
  post?.();
}

// ---------- eventos ----------
const val = id => $(id)?.value;
const ACT = {
  login() { fb.au.signInWithEmailAndPassword(fb.auth, val('#em'), val('#pw')).catch(e => alert(e.message)); },
  signup() { fb.au.createUserWithEmailAndPassword(fb.auth, val('#em'), val('#pw')).catch(e => alert(e.message)); },
  google() { fb.au.signInWithPopup(fb.auth, new fb.au.GoogleAuthProvider()).catch(e => alert(e.message)); },
  addtx() { const v = +val('#nv'); if (v) M(mi).tx.push({ id: uid(), date: val('#nd'), valor: v, pag: val('#np'), cat: val('#nc'), desc: val('#ni') }); },
  deltx(d) { M(mi).tx = M(mi).tx.filter(x => x.id !== d.id); },
  addinst() { const v = +val('#iv'); if (v) M(mi).inst.push({ id: uid(), valor: v, pag: val('#ip'), desc: val('#id'), pago: false }); },
  delinst(d) { M(mi).inst = M(mi).inst.filter(x => x.id !== d.id); },
  addres() { const v = +val('#rv'); if (v) S.res.saidas.push({ id: uid(), date: val('#rd'), valor: v, desc: val('#rn') }); },
  delres(d) { S.res.saidas = S.res.saidas.filter(x => x.id !== d.id); },
  addsim() { const v = +val('#sv'); if (v) S.sim.itens.push({ id: uid(), desc: val('#sd'), valor: v, on: true }); },
  delsim(d) { S.sim.itens = S.sim.itens.filter(x => x.id !== d.id); },
  simparc() { M(mi).inst.forEach(x => S.sim.itens.push({ id: uid(), desc: x.desc, valor: +x.valor, on: true })); },
  simclear() { if (confirm('Limpar toda a simulação?')) S.sim.itens = []; },
  addcat() { const n = val('#ncn').trim(); if (n) S.cats.push({ id: uid(), name: n, color: val('#ncc'), saving: false }); },
  delcat(d) {
    if (MES.some((_, i) => M(i).tx.some(x => x.cat === d.id))) return alert('Esta categoria tem lançamentos. Mova-os antes de excluir.');
    S.cats = S.cats.filter(c => c.id !== d.id);
  }
};
$('#main').onclick = e => { const a = e.target.closest('[data-act]'); if (!a) return; ACT[a.dataset.act](a.dataset); save(); render(); };
$('#main').onchange = e => {
  const t = e.target, f = t.dataset.f; if (!f) return;
  const c = cat(t.dataset.id), i = M(mi).inst.find(x => x.id === t.dataset.id), s = S.sim.itens.find(x => x.id === t.dataset.id);
  if (f === 'saldo') M(mi).saldo = +t.value;
  else if (f === 'pago') i.pago = t.checked;
  else if (f === 'cname') c.name = t.value;
  else if (f === 'ccolor') c.color = t.value;
  else if (f === 'csave') c.saving = t.checked;
  else if (f === 'rinicial') S.res.inicial = +t.value;
  else if (f === 'sentrada') S.sim.entrada = +t.value;
  else if (f === 'son') s.on = t.checked;
  save(); render();
};
$('#nav').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.m !== undefined) { mi = +b.dataset.m; view = 'mes'; }
  else if (b.dataset.t) { open = !open; if (open) view = 'mes'; }
  else view = b.dataset.v;
  render();
};
$('#imp').onclick = async () => {
  try {
    const d = await (await fetch('dados-2026.json')).json();
    if (!confirm('Importar os dados da planilha? Isso SUBSTITUI os dados atuais do app.')) return;
    S = fix(d); localStorage.setItem('fin26', JSON.stringify(S)); render();
    try { await cloud(); alert('Dados importados e salvos na nuvem!'); }
    catch (e) { alert('Importado só neste navegador. A nuvem recusou a gravação: ' + (e.code || e.message) + '\nVerifique as regras do Firestore.'); }
  } catch (e) { alert('Não consegui ler dados-2026.json: ' + e.message); }
};

Chart.defaults.color = '#8a8a8a';
Chart.defaults.borderColor = '#262626';
render();
initFb();
