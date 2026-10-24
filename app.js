import { cfg } from './firebase-config.js';

const MES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const PAG = ['PIX','Cartão Débito','Cartão Crédito','Dinheiro','Transferência'];
const $ = s => document.querySelector(s);
const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
function wk(i) { let n = 0; for (let d = 1; d <= new Date(2026, i + 1, 0).getDate(); d++) if (new Date(2026, i, d).getDay() === 1) n++; return n; }
function sal(i) {
  const m = S.months?.[i]; if (!m) return 0; const f = x => +x || 0;
  return m.modo === 'quinzenal' ? f(m.q1) + f(m.q2) : m.modo === 'semanal' ? f(m.nsem ?? wk(i)) * f(m.vsem) : f(m.saldo);
}
function ACTM() { let r = new Date().getMonth(); for (let i = 0; i < 12; i++) if (sal(i) > 0) r = i; return r; }
const ERR = e => ({ 'auth/invalid-credential': 'E-mail ou senha incorretos.', 'auth/email-already-in-use': 'Este e-mail já tem conta.', 'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.', 'auth/invalid-email': 'E-mail inválido.' }[e.code] || e.message);
const DEF = () => ({
  cats: [['Alimentação', '#f59e0b'], ['Transporte', '#3b82f6'], ['Reserva', '#22c55e', 1], ['Parcelados', '#8b5cf6'],
    ['Lazer', '#ec4899'], ['Vestuário', '#06b6d4'], ['Contas', '#f97316'], ['Outros', '#94a3b8']]
    .map(([name, color, saving]) => ({ id: uid(), name, color, saving: !!saving })), months: {}
});
const DDASH = () => [
  { id: uid(), title: 'Mês a mês', type: 'bar', metric: 'resumo', cats: [], from: 0, to: 11, wide: 0 },
  { id: uid(), title: 'Gastos por categoria', type: 'donut', metric: 'cats', cats: [], from: 0, to: 11, wide: 0 },
  { id: uid(), title: 'Evolução por categoria', type: 'bar', metric: 'cats', cats: [], from: 0, to: 11, wide: 1 }
];
const uname = u => u.displayName || (u.email || '').split('@')[0];
const fix = s => { s.dash ??= DDASH(); s.pags ??= [...PAG]; s.shareEmails ??= []; s.shareLabels ??= {}; s.months ??= {}; s.res ??= { inicial: 0, saidas: [] }; s.sim ??= { entrada: 0, itens: [] }; return s; };

let S = fix(JSON.parse(localStorage.getItem('fin26') || 'null') || DEF());
let view = 'home', mi = ACTM(), open = false, dedit = null, viewing = null, mine = null, shared = [], curId = 'state', bnames = {}, pform = false, charts = [], post = null, fb = null, user = null, timer;
const M = i => (S.months[i] ??= { saldo: 0, tx: [], inst: [] });
const cat = id => S.cats.find(c => c.id === id);
const sum = (a, f) => a.reduce((s, x) => s + (+f(x) || 0), 0);
const calc = i => {
  const m = M(i), tot = sum(m.tx, x => x.valor), sav = sum(m.tx.filter(x => cat(x.cat)?.saving), x => x.valor);
  const sd = sal(i); return { saldo: sd, tot, sav, g: tot - sav, disp: sd - tot };
};
const catMonth = (c, i) => sum(M(i).tx.filter(x => x.cat === c.id), x => x.valor);
const kpi = (l, v, cls = '') => `<div class="card kpi"><span>${l}</span><b class="${cls}">${brl(v)}</b></div>`;
const sgn = v => v < 0 ? 'neg' : 'pos';
const donut = (id, items) => charts.push(new Chart($(id), {
  type: 'doughnut',
  data: { labels: items.map(x => x.n), datasets: [{ data: items.map(x => x.v), backgroundColor: items.map(x => x.c), borderColor: '#141414' }] },
  options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: innerWidth < 720 ? 'bottom' : 'right' },
    tooltip: { callbacks: { label: t => `${t.label}: ${brl(t.parsed)} (${(t.parsed / t.dataset.data.reduce((a, b) => a + b, 0) * 100).toFixed(1)}%)` } } } }
}));

const status = (t, bad) => { const e = $('#sync'); if (e) { e.textContent = t; e.style.color = bad ? '#f43f5e' : '#22c55e'; } };
function cloud() {
  if (!(fb && user) || viewing) return Promise.resolve();
  status('☁ Salvando…');
  return fb.setDoc(fb.doc(fb.db, 'users', user.uid, 'app', curId), JSON.parse(JSON.stringify(S)))
    .then(() => status('☁ Salvo na nuvem'))
    .catch(e => { status('⚠ Erro ao salvar na nuvem: ' + (e.code || e.message), true); throw e; });
}
function save() {
  if (viewing) return;
  if (curId === 'state') localStorage.setItem('fin26', JSON.stringify(S));
  clearTimeout(timer);
  timer = setTimeout(() => cloud().catch(() => {}), 400);
}
addEventListener('pagehide', () => { if (timer) { clearTimeout(timer); cloud().catch(() => {}); } });

async function initFb() {
  if (!cfg.apiKey) { $('#user').textContent = 'Modo local (sem nuvem)'; return; }
  const u = n => import(`https://www.gstatic.com/firebasejs/10.12.2/firebase-${n}.js`);
  const [a, au, fs] = await Promise.all([u('app'), u('auth'), u('firestore')]);
  const app = a.initializeApp(cfg), auth = au.getAuth(app);
  fb = { db: fs.getFirestore(app), doc: fs.doc, setDoc: fs.setDoc, getDoc: fs.getDoc, collection: fs.collection, getDocs: fs.getDocs, deleteDoc: fs.deleteDoc, deleteField: fs.deleteField, au, auth };
  au.onAuthStateChanged(auth, async us => {
    viewing = null; mine = null; curId = 'state'; user = us;
    if (us) {
      try {
        const s = await fb.getDoc(fb.doc(fb.db, 'users', us.uid, 'app', 'state'));
        if (s.exists()) { S = load(s.data(), 'state'); bnames.state = S.nome; mi = ACTM(); localStorage.setItem('fin26', JSON.stringify(S)); status('☁ Dados carregados da nuvem'); }
        else { S.nome ??= 'Base 1'; bnames.state = S.nome; await cloud(); }
      } catch (e) { status('⚠ Erro ao acessar a nuvem: ' + (e.code || e.message), true); }
      userBox();
      loadShared().then(render);
    } else $('#user').textContent = '';
    render();
  });
}

// ---------- menu ----------
function side() {
  document.querySelectorAll('.bn').forEach(e => e.textContent = viewing ? viewing.label + ' · somente leitura' : S.nome || '');
  const it = (v, l, i) => `<button data-v="${v}" class="${view === v ? 'on' : ''}">${i} <span>${l}</span></button>`;
  $('#nav').innerHTML = it('home', 'Início', '🏠') + it('dash', 'Dashboard', '📊') +
    `<button data-t="1" class="${view === 'mes' ? 'on' : ''}">🗓️ <span>Mês</span><i>${open ? '▾' : '▸'}</i></button>` +
    (open ? `<div class="sub">${MES.map((n, i) => `<button data-m="${i}" class="${view === 'mes' && mi === i ? 'on' : ''} ${i === ACTM() ? 'now' : ''}">${n}</button>`).join('')}</div>` : '') +
    it('cg', 'Controle Geral', '📋') + it('res', 'Reserva', '💰') + it('sim', 'Simulação', '🧮') + it('cats', 'Categorias', '🏷️') + (viewing ? '' : it('share', 'Compartilhar', '🤝'));
}

// ---------- telas ----------
const mv = (id, k) => { const a = S.dash, i = a.findIndex(g => g.id === id), j = i + k; if (j >= 0 && j < a.length) [a[i], a[j]] = [a[j], a[i]]; };
const LAB = { id: 'lab', afterDatasetsDraw(ch) {
  const x = ch.ctx; ch.data.datasets.forEach((d, i) => ch.getDatasetMeta(i).data.forEach((b, j) => {
    const v = d.data[j]; if (!v) return;
    x.save(); x.fillStyle = Chart.defaults.color; x.font = '11px sans-serif'; x.textAlign = 'left'; x.textBaseline = 'middle';
    x.translate(b.x, b.y - 6); x.rotate(-Math.PI / 2); x.fillText(Math.round(v).toLocaleString('pt-BR'), 0, 0); x.restore();
  }));
} };
function drawChart(g) {
  const ms = MES.map((_, i) => i).filter(i => i >= g.from && i <= g.to), id = '#ch_' + g.id;
  const cs = S.cats.filter(k => g.cats.length ? g.cats.includes(k.id) : !k.saving);
  if (g.type === 'donut') return donut(id, cs.map(k => ({ n: k.name, c: k.color, v: sum(ms, i => catMonth(k, i)) })).filter(x => x.v > 0));
  const res = g.metric === 'resumo', bar = g.type !== 'line', all = ms.map(i => calc(i));
  const ds = res ? [['Salário', 'saldo', '#525252'], ['Gastos', 'g', '#f43f5e'], ['Reserva', 'sav', '#22c55e']].map(([label, k, c]) => ({ label, data: all.map(x => x[k]), backgroundColor: c, borderColor: c }))
    : cs.map(k => ({ label: k.name, data: ms.map(i => catMonth(k, i)), backgroundColor: k.color, borderColor: k.color }));
  charts.push(new Chart($(id), { type: bar ? 'bar' : 'line', data: { labels: ms.map(i => MES[i].slice(0, 3)), datasets: ds },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: { x: { stacked: bar && !res }, y: { stacked: bar && !res, grace: '15%', ticks: { callback: v => brl(v) } } },
      plugins: { legend: { position: res ? 'top' : innerWidth < 720 ? 'bottom' : 'right' }, tooltip: { callbacks: { label: c => (c.parsed.y || res) ? `${c.dataset.label}: ${brl(c.parsed.y)}` : null } } },
      onClick: (e, els) => { if (res && els.length) { mi = ms[els[0].index]; view = 'mes'; open = true; render(); } } }, plugins: res ? [LAB] : [] }));
}
function dash() {
  const all = MES.map((_, i) => calc(i)), t = k => sum(all, x => x[k]), act = all.filter(x => x.g > 0);
  const resTot = (+S.res.inicial || 0) + t('sav') - sum(S.res.saidas, x => x.valor);
  post = () => S.dash.forEach(drawChart);
  const opt = (arr, v) => arr.map(([k, l]) => `<option value="${k}" ${String(v) === String(k) ? 'selected' : ''}>${l}</option>`).join('');
  const mo = MES.map((m, i) => [i, m]);
  const panel = g => `<div class="gs"><div class="row"><input data-f="gtitle" data-id="${g.id}" value="${esc(g.title)}" placeholder="Título do gráfico" style="flex:1;min-width:140px">
    <select data-f="gtype" data-id="${g.id}">${opt([['bar', 'Barras'], ['line', 'Linhas'], ['donut', 'Rosca']], g.type)}</select>
    ${g.type !== 'donut' ? `<select data-f="gmetric" data-id="${g.id}">${opt([['resumo', 'Salário × Gastos × Reserva'], ['cats', 'Por categoria']], g.metric)}</select>` : ''}</div>
    <div class="row"><label>De <select data-f="gfrom" data-id="${g.id}">${opt(mo, g.from)}</select></label><label>até <select data-f="gto" data-id="${g.id}">${opt(mo, g.to)}</select></label>
    <label><input type="checkbox" data-f="gwide" data-id="${g.id}" ${g.wide ? 'checked' : ''}> Largura total</label></div>
    ${g.type === 'donut' || g.metric === 'cats' ? `<div class="row">${S.cats.map(k => `<label class="chip"><input type="checkbox" data-f="gcat" data-id="${g.id}" data-c="${k.id}" ${g.cats.includes(k.id) ? 'checked' : ''}><i style="background:${k.color}"></i>${esc(k.name)}</label>`).join('')}</div><small>Nenhuma categoria marcada = todas, exceto as de reserva.</small>` : ''}
    <div class="row" style="margin:10px 0 0"><button class="x" data-act="gdel" data-id="${g.id}">🗑 Remover gráfico</button></div></div>`;
  const card = g => `<div class="card gc ${g.wide ? 'wide' : ''}" data-id="${g.id}"><div class="gh"><span class="grip" draggable="true" title="Arraste para mover">⠿</span><h2>${esc(g.title)}</h2>
    <button class="x" data-act="gup" data-id="${g.id}" title="Mover para cima">▲</button><button class="x" data-act="gdn" data-id="${g.id}" title="Mover para baixo">▼</button><button class="x" data-ui="gedit" data-id="${g.id}" title="Configurar">⚙</button></div>
    ${dedit === g.id ? panel(g) : ''}<div class="chart"><canvas id="ch_${g.id}"></canvas></div></div>`;
  return `<h1>Dashboard</h1><div class="grid">${kpi('Salário no ano', t('saldo'))}${kpi('Gastos no ano', t('g'))}${kpi('Reservado em 2026', t('sav'))}${kpi('Reserva total', resTot)}${kpi('Média mensal de gastos', act.length ? t('g') / act.length : 0)}${kpi('Disponível no ano', t('disp'), sgn(t('disp')))}</div>
  <div class="bar"><span style="color:var(--mut)">Arraste ⠿ ou use ▲▼ para reordenar · ⚙ para editar e filtrar</span><button class="b" data-act="gadd">+ Gráfico</button></div>
  <div class="charts">${S.dash.map(card).join('')}</div>`;
}

function home() {
  const T = [['dash', '📊', 'Dashboard', 'O ano em gráficos que você monta e filtra.'], ['mes', '🗓️', 'Mês', 'Gastos, saldo e parcelas do mês.'], ['cg', '📋', 'Controle Geral', 'Todos os meses lado a lado, por categoria.'],
    ['res', '💰', 'Reserva', 'Quanto você guardou e o que já saiu.'], ['sim', '🧮', 'Simulação', 'Teste contas e veja quanto sobra.'], ['cats', '🏷️', 'Categorias', 'Crie categorias e escolha as cores.'], ['share', '🤝', 'Compartilhar', 'Deixe outras pessoas verem a sua base.']];
  return `<h1>Olá${user ? ', ' + esc(uname(user)) : ''} 👋</h1>
  <div class="card hero"><p>O <b>Oliveira Finance App</b> reúne o controle financeiro da família: registre os gastos de cada mês, acompanhe a reserva, simule as contas do próximo mês e veja tudo em gráficos. Os dados ficam salvos na nuvem, na sua conta.</p></div>
  <div class="tiles">${T.map(([v, i, n, d]) => `<button class="card tile" data-ui="go" data-v="${v}"><span class="ti">${i}</span><b>${n}</b><small>${d}</small></button>`).join('')}</div>`;
}

function mes() {
  const m = M(mi), c = calc(mi), md = m.modo || 'mensal', num = (f, v) => `<input type="number" step="0.01" data-f="${f}" value="${v || ''}" placeholder="0,00">`;
  const rc = md === 'quinzenal' ? `<label>1ª quinzena (R$) ${num('q1', m.q1)}</label><label>2ª quinzena (R$) ${num('q2', m.q2)}</label>`
    : md === 'semanal' ? `<label>Semanas no mês <input type="number" min="1" max="6" data-f="nsem" value="${m.nsem ?? wk(mi)}" style="width:80px"></label><label>Valor por semana (R$) ${num('vsem', m.vsem)}</label>`
    : `<label>Saldo inicial (R$) ${num('saldo', m.saldo)}</label>`;
  post = () => {
    donut('#cm', S.cats.map(k => ({ n: k.name, c: k.color, v: catMonth(k, mi) })).filter(x => x.v > 0));
    const p2 = n => String(n).padStart(2, '0'), nd = new Date(2026, mi + 1, 0).getDate();
    const dl = [...new Set([...Array.from({ length: nd }, (_, i) => `2026-${p2(mi + 1)}-${p2(i + 1)}`), ...m.tx.map(x => x.date).filter(Boolean)])].sort();
    const ds = S.cats.filter(k => !k.saving).map(k => ({ label: k.name, backgroundColor: k.color, data: dl.map(d => sum(m.tx.filter(x => x.cat === k.id && x.date === d), x => x.valor)) })).filter(d => d.data.some(v => v));
    charts.push(new Chart($('#cd'), { type: 'bar', data: { labels: dl.map(d => d.slice(8) + '/' + d.slice(5, 7)), datasets: ds }, options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: { x: { stacked: true, title: { display: true, text: 'Data' } }, y: { stacked: true, ticks: { callback: v => brl(v) } } },
      plugins: { legend: { position: innerWidth < 720 ? 'bottom' : 'right' }, tooltip: { callbacks: { label: c => c.parsed.y ? `${c.dataset.label}: ${brl(c.parsed.y)}` : null, footer: it => 'Total: ' + brl(sum(it, i => i.parsed.y)) } } } } }));
  };
  const copt = S.cats.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join(''), popt = S.pags.map(p => `<option>${esc(p)}</option>`).join('');
  const srt = [...m.tx].sort((p, q) => (p.date || '9999').localeCompare(q.date || '9999'));
  const rows = srt.map((x, i) => {
    const k = cat(x.cat), d = x.date || '', first = i === 0 || (srt[i - 1].date || '') !== d, last = i === srt.length - 1 || (srt[i + 1].date || '') !== d, e = f => `data-e="tx:${f}:${x.id}"`;
    return `<tr><td ${e('date')} class="${last ? '' : 'dm'}">${first && d ? d.split('-').reverse().join('/') : ''}</td><td ${e('valor')} class="n">${brl(x.valor)}</td><td ${e('pag')}>${esc(x.pag)}</td><td ${e('cat')}><span class="tag" style="background:${k?.color || '#94a3b8'}">${esc(k?.name || '—')}</span></td><td ${e('desc')} title="${esc(x.note)}">${esc(x.desc)}${x.note ? ' 💬' : ''}</td><td><button class="x" data-act="deltx" data-id="${x.id}">✕</button></td></tr>`;
  }).join('');
  const inst = m.inst.map(x => `<tr class="${x.pago ? 'paid' : ''}"><td><input type="checkbox" data-f="pago" data-id="${x.id}" ${x.pago ? 'checked' : ''}></td><td class="n" data-e="inst:valor:${x.id}">${brl(x.valor)}</td><td data-e="inst:pag:${x.id}">${esc(x.pag)}</td><td data-e="inst:desc:${x.id}" title="${esc(x.note)}">${esc(x.desc)}${x.note ? ' 💬' : ''}</td><td><button class="x" data-act="delinst" data-id="${x.id}">✕</button></td></tr>`).join('');
  const aPagar = sum(m.inst.filter(x => !x.pago), x => x.valor);
  const pfm = pform ? `<div class="gs"><div class="row"><input id="pv" type="number" step="0.01" placeholder="Valor" style="width:110px"><select id="pt"><option value="cada">de cada parcela</option><option value="total">total (dividir)</option></select><select id="pg2">${popt}</select><input id="pn" type="number" min="1" max="12" placeholder="Parcelas" style="width:100px"></div>
    <div class="row"><input id="pd" placeholder="Descrição (ex.: Viagem)" style="flex:1;min-width:140px"><button class="b" data-act="addparc">Criar parcelas</button></div><small>Começa em ${MES[mi]} e segue pelos meses seguintes, até dezembro.</small></div>` : '';
  return `<h1>${MES[mi]} 2026</h1>
  <div class="row top"><div class="row" style="margin:0">${rc}</div><div class="seg">${[['mensal', 'Mensal'], ['quinzenal', 'Quinzenal'], ['semanal', 'Semanal']].map(([k, l]) => `<button data-act="modo" data-m="${k}" class="${md === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
  <div class="grid">${kpi('Saldo inicial', c.saldo)}${kpi('Gastos do mês', c.g)}${kpi('Disponível', c.disp, sgn(c.disp))}${kpi('Reservado', c.sav)}${kpi('Parcelas a pagar mês seguinte', aPagar, 'warn')}</div>
  <div class="cols"><div class="card"><h2>Despesas do mês</h2>
  <div><button class="x" data-act="pullprev">+ Puxar parcelas mês anterior</button></div>
  <div class="row"><input id="nd" type="date" value="${new Date().toISOString().slice(0, 10)}"><input id="nv" type="number" step="0.01" placeholder="Valor" style="width:110px"><select id="np">${popt}</select><select id="nc">${copt}</select><input id="ni" placeholder="Descrição" style="flex:1;min-width:140px"><button class="b" data-act="addtx">Adicionar</button></div>
  <div class="scroll"><table><tr><th>Data</th><th class="n">Valor</th><th>Pagamento</th><th>Categoria</th><th>Descrição</th><th></th></tr>${rows}</table></div></div>
  <div><div class="card" style="margin-bottom:14px"><h2>Por categoria</h2><div class="chart" style="height:260px"><canvas id="cm"></canvas></div></div>
  <div class="card"><h2>Próximo mês · parcelas</h2>
  <div><button class="x" data-ui="pf">${pform ? '✕ Fechar' : '+ Adicionar parcelamento'}</button></div>${pfm}
  <div class="row"><input id="iv" type="number" step="0.01" placeholder="Valor" style="width:100px"><select id="ip">${popt}</select><input id="id" placeholder="Descrição" style="flex:1;min-width:100px"><button class="b" data-act="addinst">Adicionar</button></div>
  <div class="scroll"><table><tr><th>Pago</th><th class="n">Valor</th><th>Pagamento</th><th>Descrição</th><th></th></tr>${inst}</table></div></div></div></div>
  <div class="card" style="margin-top:14px"><h2>Gastos por dia</h2><div class="chart"><canvas id="cd"></canvas></div></div>`;
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
  <div class="scroll"><table><tr><th>Data</th><th class="n">Valor</th><th>Descrição</th><th></th></tr>${rows}</table></div></div></div>`;
}

function sim() {
  const s = S.sim, prev = sum(s.itens.filter(x => x.on !== false), x => x.valor), sobra = (+s.entrada || 0) - prev;
  const rows = s.itens.map(x => `<tr><td><input type="checkbox" data-f="son" data-id="${x.id}" ${x.on !== false ? 'checked' : ''}></td><td class="w" data-e="sim:desc:${x.id}">${esc(x.desc)}</td><td class="n" data-e="sim:valor:${x.id}">${brl(x.valor)}</td><td><button class="x" data-act="delsim" data-id="${x.id}">✕</button></td></tr>`).join('');
  return `<h1>Simulação</h1><div class="grid">
  <div class="card kpi"><span>Entrada prevista (salário)</span><input type="number" step="0.01" data-f="sentrada" value="${s.entrada || ''}" style="width:100%;margin-top:6px;font-size:18px;font-weight:700"></div>
  ${kpi('Gastos previstos', prev)}${kpi('Sobra prevista', sobra, sgn(sobra))}</div>
  <div class="card"><h2>Contas e gastos previstos · desmarque para tirar da conta · clique 2 vezes para editar</h2>
  <div class="row"><input id="sd" placeholder="Descrição" style="flex:1;min-width:160px"><input id="sv" type="number" step="0.01" placeholder="Valor" style="width:110px"><button class="b" data-act="addsim">Adicionar</button>
  <button class="x" data-act="simparc">+ Trazer parcelas de ${MES[mi]}</button><button class="x" data-act="simclear">Limpar tudo</button></div>
  <div class="scroll"><table><tr><th>Usar</th><th>Descrição</th><th class="n">Valor</th><th></th></tr>${rows}</table></div></div>`;
}

function catsV() {
  const prow = S.pags.map((p, i) => `<tr><td><input data-f="pname" data-id="${i}" value="${esc(p)}"></td><td><button class="x" data-act="delpag" data-id="${i}">✕</button></td></tr>`).join('');
  const rows = S.cats.map(c => `<tr><td><input type="color" data-f="ccolor" data-id="${c.id}" value="${/^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#94a3b8'}"></td><td><input data-f="cname" data-id="${c.id}" value="${esc(c.name)}"></td>
  <td><label><input type="checkbox" data-f="csave" data-id="${c.id}" ${c.saving ? 'checked' : ''}> É reserva (não conta como gasto)</label></td><td><span class="tag" id="pv_${c.id}" style="background:${c.color}">${esc(c.name)}</span></td><td><button class="x" data-act="delcat" data-id="${c.id}">✕</button></td></tr>`).join('');
  return `<h1>Categorias</h1><div class="card"><div class="row"><input type="color" id="ncc" value="#22c55e"><input id="ncn" placeholder="Nova categoria"><button class="b" data-act="addcat">Adicionar</button></div>
  <div class="scroll"><table><tr><th>Cor</th><th>Nome</th><th>Tipo</th><th>Como aparece no Mês</th><th></th></tr>${rows}</table></div></div>
  <div class="card" style="margin-top:14px"><h2>Formas de pagamento</h2><div class="row"><input id="npg" placeholder="Nova forma de pagamento"><button class="b" data-act="addpag">Adicionar</button></div><div class="scroll"><table><tr><th>Nome</th><th></th></tr>${prow}</table></div></div>`;
}

function loginV() {
  return `<div class="login card"><div class="lg">💰</div><h1>Oliveira <b>Finance</b> App</h1><p>Entre para acessar o controle financeiro da família.</p>
  <input id="nm" placeholder="Seu nome (só para criar conta)" autocomplete="name"><input id="em" type="email" placeholder="E-mail" autocomplete="username"><input id="pw" type="password" placeholder="Senha (mín. 6 caracteres)" autocomplete="current-password">
  <button class="b" data-act="login">Entrar</button><button class="x" data-act="signup">Criar conta com e-mail</button></div>`;
}

const dref = (uid, id) => fb.doc(fb.db, 'users', uid, 'app', id);
const load = (d, id) => { const x = fix(d); x.cats ??= DEF().cats; x.nome ??= id === 'state' ? 'Base 1' : 'Base 2'; return x; };
function userBox() {
  $('#user').innerHTML = `<div class="uc"><span class="av">${user.photoURL ? `<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer">` : esc((uname(user)[0] || '?').toUpperCase())}</span><span class="ui"><b>${esc(uname(user))}</b><small>${esc(user.email)}</small></span><button class="x" id="ed" title="Editar meu nome">✎</button></div><button class="b out" id="out">Sair</button>`;
  $('#out').onclick = () => fb.au.signOut(fb.auth);
  $('#ed').onclick = () => { const n = (prompt('Seu nome:', uname(user)) || '').trim(); if (n) fb.au.updateProfile(user, { displayName: n }).then(() => { userBox(); render(); }).catch(e => alert(ERR(e))); };
}
async function flush() { if (timer) { clearTimeout(timer); timer = null; await cloud().catch(() => {}); } }
async function openOwn(id) {
  if (viewing) { S = mine; viewing = null; mine = null; } else await flush();
  if (id !== curId) {
    try { const r = await fb.getDoc(dref(user.uid, id)); S = load(r.exists() ? r.data() : {}, id); curId = id; bnames[id] = S.nome; if (!r.exists()) await cloud(); }
    catch (e) { alert('Não foi possível abrir a base: ' + (e.code || e.message)); }
  }
  view = 'home'; mi = ACTM(); render();
}
async function openShared(x) {
  if (!viewing) await flush();
  try { const r = await fb.getDoc(dref(x.uid, x.bid)); if (!r.exists()) return alert('Esta base está vazia.'); if (!viewing) mine = S; S = load(r.data(), x.bid); viewing = x; view = 'home'; mi = ACTM(); }
  catch (er) { alert('Sem permissão para abrir esta base: ' + (er.code || er.message)); }
  render();
}
async function loadShared() {
  shared = [];
  try {
    const q = await fb.getDocs(fb.collection(fb.db, 'shared', (user.email || '').toLowerCase(), 'from'));
    q.docs.forEach(d => { const v = d.data(); Object.entries(v.bases ?? { state: 'Base 1' }).forEach(([bid, label]) => shared.push({ uid: d.id, bid, label, email: v.ownerEmail, owner: v.ownerName || v.ownerEmail })); });
  } catch (e) { shared = null; }
}
async function bmenu(btn) {
  const m = $('#bmenu'); if (!m.hidden) { m.hidden = true; return; } if (!(fb && user)) return;
  for (const id of ['state', 'state2']) if (!(id in bnames)) { const d = id === 'state' ? 'Base 1' : 'Base 2'; try { const r = await fb.getDoc(dref(user.uid, id)); bnames[id] = (r.exists() && r.data().nome) || d; } catch (e) { bnames[id] = d; } }
  await loadShared();
  const own = ['state', 'state2'].map(id => `<div class="bi ${!viewing && curId === id ? 'on' : ''}"><button data-own="${id}">${esc(bnames[id])}</button><button class="x" data-ren="${id}" title="Renomear">✎</button></div>`).join('');
  const sh = shared === null ? '<small>Não foi possível carregar.</small>' : shared.length ? shared.map((x, i) => `<div class="bi ${viewing && viewing.uid === x.uid && viewing.bid === x.bid ? 'on' : ''}"><button data-sh="${i}">${esc(x.label)} <small>· ${esc(x.owner)}</small></button></div>`).join('') : '<small>Nada compartilhado com você.</small>';
  m.innerHTML = `<h2>Minhas bases</h2>${own}<h2>Compartilhadas comigo</h2>${sh}`;
  const r = btn.getBoundingClientRect(); m.style.top = r.bottom + 6 + 'px'; m.style.left = Math.max(8, Math.min(r.left, innerWidth - 300)) + 'px'; m.hidden = false;
}
const ban = () => `<div class="ban"><span>👁 Você está vendo <b>${esc(viewing.label)}</b> de ${esc(viewing.owner)} · somente leitura</span><button class="b" data-act="backmine">Voltar para minha base</button></div>`;
function shareV() {
  if (!(fb && user)) return '<h1>Compartilhar</h1><div class="card">Disponível apenas com login na nuvem.</div>';
  const mineL = S.shareEmails.map((e, i) => `<tr><td>${esc(e)}</td><td>${esc(S.shareLabels[e] || '')}</td><td><button class="x" data-act="delshare" data-id="${i}">✕</button></td></tr>`).join('');
  const sh = shared === null ? '<p style="color:var(--red)">Não foi possível carregar. Verifique se seu e-mail está verificado.</p>'
    : shared.length ? `<div class="scroll"><table><tr><th>Base</th><th>Compartilhada por</th><th></th></tr>${shared.map((x, i) => `<tr><td>${esc(x.label)}</td><td>${esc(x.owner)}</td><td class="n"><button class="b" data-act="openshare" data-i="${i}">Abrir</button></td></tr>`).join('')}</table></div>` : '<p style="color:var(--mut)">Ninguém compartilhou uma base com você ainda.</p>';
  return `<h1>Compartilhar</h1>
  ${user.emailVerified ? '' : `<div class="card" style="margin-bottom:14px"><h2>Verifique seu e-mail</h2><p>Para ver bases compartilhadas com você, seu e-mail precisa estar verificado.</p><div class="row"><button class="b" data-act="verify">Enviar e-mail de verificação</button><button class="x" data-act="verified">Já verifiquei</button></div></div>`}
  <div class="card" style="margin-bottom:14px"><h2>Base atual: ${esc(S.nome || '')} · quem pode ver (somente leitura)</h2><div class="row"><input id="shr" type="email" placeholder="E-mail da pessoa" style="flex:1;min-width:170px"><input id="shl" placeholder="Nome que ela verá (ex.: Dados 1)" style="flex:1;min-width:170px"><button class="b" data-act="addshare">Compartilhar</button></div>
  <div class="scroll"><table>${mineL}</table></div></div>
  <div class="card"><h2>Bases compartilhadas comigo</h2>${sh}</div>`;
}

function render() {
  charts.forEach(c => c.destroy()); charts = []; post = null; side(); document.body.classList.toggle('lock', !!(fb && !user));
  if (fb && !user) { $('#main').innerHTML = loginV(); return; }
  if (viewing && view === 'share') view = 'home';
  $('#main').innerHTML = (viewing ? ban() : '') + { home, dash, mes, cg, res, sim, cats: catsV, share: shareV }[view]();
  post?.();
  if (viewing) $('#main').querySelectorAll('input,select,[data-act]').forEach(el => { if (el.dataset.act !== 'backmine') el.disabled = true; });
}

// ---------- eventos ----------
const val = id => $(id)?.value;
const ACT = {
  login() { fb.au.signInWithEmailAndPassword(fb.auth, val('#em'), val('#pw')).catch(e => alert(ERR(e))); },
  signup() { const n = val('#nm').trim(); if (!n) return alert('Informe seu nome para criar a conta.'); fb.au.createUserWithEmailAndPassword(fb.auth, val('#em'), val('#pw')).then(c => fb.au.updateProfile(c.user, { displayName: n })).then(() => { userBox(); render(); }).catch(e => alert(ERR(e))); },
  addtx() { const v = +val('#nv'); if (v) M(mi).tx.push({ id: uid(), date: val('#nd'), valor: v, pag: val('#np'), cat: val('#nc'), desc: val('#ni') }); },
  deltx(d) { M(mi).tx = M(mi).tx.filter(x => x.id !== d.id); },
  addinst() { const v = +val('#iv'); if (v) M(mi).inst.push({ id: uid(), valor: v, pag: val('#ip'), desc: val('#id'), pago: false }); },
  delinst(d) {
    const it = M(mi).inst.find(x => x.id === d.id);
    if (it?.g && confirm('Remover também as parcelas seguintes deste parcelamento?')) MES.forEach((_, i) => { if (i >= mi) M(i).inst = M(i).inst.filter(x => x.g !== it.g); });
    else M(mi).inst = M(mi).inst.filter(x => x.id !== d.id);
  },
  addparc() {
    const v = +val('#pv'), n = Math.max(1, Math.min(12, parseInt(val('#pn')) || 1)), ds = (val('#pd') || '').trim(), tot = val('#pt') === 'total';
    if (!v || !ds) return alert('Informe o valor e a descrição.');
    const per = tot ? Math.floor(v / n * 100) / 100 : v, g = uid(), pag = val('#pg2'); let lost = 0;
    for (let k = 0; k < n; k++) {
      if (mi + k > 11) { lost++; continue; }
      const vl = tot && k === n - 1 ? Math.round((v - per * (n - 1)) * 100) / 100 : per;
      M(mi + k).inst.push({ id: uid(), valor: vl, pag, desc: `${k + 1}/${n} - ${ds}`, pago: false, g });
    }
    if (lost) alert(`${lost} parcela(s) passariam de dezembro e não foram criadas.`);
    pform = false;
  },
  pullprev() {
    if (mi === 0) return alert('Não há mês anterior.');
    const m = M(mi), pv = M(mi - 1).inst, ct = S.cats.find(c => c.name === 'Parcelados') || S.cats.find(c => !c.saving), p2 = n => String(n).padStart(2, '0'), t = new Date();
    const d = t.getMonth() === mi ? `${t.getFullYear()}-${p2(mi + 1)}-${p2(t.getDate())}` : `2026-${p2(mi + 1)}-01`, novos = pv.filter(x => !m.tx.some(y => y.from === x.id));
    if (!novos.length) return alert(pv.length ? 'As parcelas do mês anterior já foram puxadas.' : 'O mês anterior não tem parcelas planejadas.');
    novos.forEach(x => m.tx.push({ id: uid(), date: d, valor: x.valor, pag: x.pag, cat: ct?.id, desc: x.desc, from: x.id }));
  },
  addres() { const v = +val('#rv'); if (v) S.res.saidas.push({ id: uid(), date: val('#rd'), valor: v, desc: val('#rn') }); },
  delres(d) { S.res.saidas = S.res.saidas.filter(x => x.id !== d.id); },
  addsim() { const v = +val('#sv'); if (v) S.sim.itens.push({ id: uid(), desc: val('#sd'), valor: v, on: true }); },
  delsim(d) { S.sim.itens = S.sim.itens.filter(x => x.id !== d.id); },
  simparc() { M(mi).inst.forEach(x => S.sim.itens.push({ id: uid(), desc: x.desc, valor: +x.valor, on: true })); },
  simclear() { if (confirm('Limpar toda a simulação?')) S.sim.itens = []; },
  gadd() { const g = { id: uid(), title: 'Novo gráfico', type: 'bar', metric: 'cats', cats: [], from: 0, to: 11, wide: 0 }; S.dash.push(g); dedit = g.id; },
  gdel(d) { if (confirm('Remover este gráfico?')) S.dash = S.dash.filter(g => g.id !== d.id); },
  gup(d) { mv(d.id, -1); }, gdn(d) { mv(d.id, 1); },
  modo(d) { M(mi).modo = d.m; },
  addpag() { const n = val('#npg').trim(); if (n && !S.pags.includes(n)) S.pags.push(n); },
  delpag(d) { const n = S.pags[+d.id]; if (MES.some((_, i) => [...M(i).tx, ...M(i).inst].some(x => x.pag === n))) return alert('Esta forma de pagamento tem lançamentos. Altere-os antes de excluir.'); S.pags.splice(+d.id, 1); },
  addshare() { const e = val('#shr').trim().toLowerCase(), lb = val('#shl').trim() || S.nome; if (!e.includes('@') || e === user.email.toLowerCase() || S.shareEmails.includes(e)) return alert('Informe um e-mail válido, diferente do seu e ainda não compartilhado.'); S.shareEmails.push(e); S.shareLabels[e] = lb; fb.setDoc(fb.doc(fb.db, 'shared', e, 'from', user.uid), { ownerEmail: user.email, ownerName: uname(user), bases: { [curId]: lb } }, { merge: true }).catch(er => alert(ERR(er))); },
  delshare(d) { const e = S.shareEmails.splice(+d.id, 1)[0]; delete S.shareLabels[e]; fb.setDoc(fb.doc(fb.db, 'shared', e, 'from', user.uid), { bases: { [curId]: fb.deleteField() } }, { merge: true }).catch(() => {}); },
  verify() { fb.au.sendEmailVerification(user).then(() => alert('E-mail de verificação enviado. Confira também o spam.')).catch(er => alert(ERR(er))); },
  verified() { user.reload().then(() => user.getIdToken(true)).then(loadShared).then(render).catch(er => alert(ERR(er))); },
  openshare(d) { openShared(shared[+d.i]); },
  backmine() { S = mine; viewing = null; mine = null; mi = ACTM(); view = 'home'; },
  addcat() { const n = val('#ncn').trim(); if (n) S.cats.push({ id: uid(), name: n, color: val('#ncc'), saving: false }); },
  delcat(d) {
    if (MES.some((_, i) => M(i).tx.some(x => x.cat === d.id))) return alert('Esta categoria tem lançamentos. Mova-os antes de excluir.');
    S.cats = S.cats.filter(c => c.id !== d.id);
  }
};
const goto = v => { if (v === 'mes') { open = true; mi = ACTM(); } view = v; if (v === 'share' && user) loadShared().then(render); };
const UI = { go: d => goto(d.v), gedit: d => { dedit = dedit === d.id ? null : d.id; }, pf: () => { pform = !pform; } };
let drag = null;
$('#main').ondragstart = e => { drag = e.target.classList?.contains('grip') ? e.target.closest('.gc').dataset.id : null; };
$('#main').ondragover = e => { if (drag) e.preventDefault(); };
$('#main').ondrop = e => {
  const to = e.target.closest('.gc')?.dataset.id; if (viewing || !drag || !to || to === drag) return;
  const a = S.dash, i = a.findIndex(x => x.id === drag), j = a.findIndex(x => x.id === to); a.splice(j, 0, a.splice(i, 1)[0]); drag = null; save(); render();
};
$('#main').onclick = e => {
  const u = e.target.closest('[data-ui]'); if (u) { UI[u.dataset.ui](u.dataset); render(); return; }
  const a = e.target.closest('[data-act]'); if (!a || (viewing && a.dataset.act !== 'backmine')) return; ACT[a.dataset.act](a.dataset); save(); render(); };
$('#main').onchange = e => {
  const t = e.target, f = t.dataset.f; if (!f) return; if (viewing) return render();
  const g = S.dash.find(x => x.id === t.dataset.id), c = cat(t.dataset.id), i = M(mi).inst.find(x => x.id === t.dataset.id), s = S.sim.itens.find(x => x.id === t.dataset.id);
  if (f === 'saldo') M(mi).saldo = +t.value;
  else if (f === 'pago') i.pago = t.checked;
  else if (f === 'cname') c.name = t.value;
  else if (f === 'ccolor') c.color = t.value;
  else if (f === 'csave') c.saving = t.checked;
  else if (f === 'rinicial') S.res.inicial = +t.value;
  else if (f === 'sentrada') S.sim.entrada = +t.value;
  else if (f === 'son') s.on = t.checked;
  else if (f === 'q1' || f === 'q2' || f === 'vsem') M(mi)[f] = +t.value;
  else if (f === 'nsem') M(mi).nsem = t.value === '' ? undefined : +t.value;
  else if (f === 'pname') { const n = +t.dataset.id, old = S.pags[n], nv = t.value.trim() || old; MES.forEach((_, i) => [...M(i).tx, ...M(i).inst].forEach(x => { if (x.pag === old) x.pag = nv; })); S.pags[n] = nv; }
  else if (f === 'gtitle') g.title = t.value;
  else if (f === 'gtype') g.type = t.value;
  else if (f === 'gmetric') g.metric = t.value;
  else if (f === 'gfrom') { g.from = +t.value; g.to = Math.max(g.to, g.from); }
  else if (f === 'gto') { g.to = +t.value; g.from = Math.min(g.from, g.to); }
  else if (f === 'gwide') g.wide = +t.checked;
  else if (f === 'gcat') g.cats = t.checked ? [...g.cats, t.dataset.c] : g.cats.filter(x => x !== t.dataset.c);
  save(); render();
};
$('#nav').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.m !== undefined) { mi = +b.dataset.m; view = 'mes'; }
  else if (b.dataset.t) { open = !open; if (open) view = 'mes'; }
  else view = b.dataset.v;
  if (view === 'share' && user) loadShared().then(render);
  if (!b.dataset.t) $('#side').classList.remove('show');
  render();
};
$('#main').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'pw') ACT.login(); });
document.querySelectorAll('.bsw').forEach(b => b.onclick = () => bmenu(b));
document.addEventListener('click', e => { if (!e.target.closest('#bmenu,.bsw')) $('#bmenu').hidden = true; });
$('#bmenu').onclick = async e => {
  const o = e.target.closest('[data-own]'), r = e.target.closest('[data-ren]'), x = e.target.closest('[data-sh]'), m = $('#bmenu');
  if (r) {
    const id = r.dataset.ren, n = (prompt('Nome da base:', bnames[id]) || '').trim(); if (!n) return;
    try { await fb.setDoc(dref(user.uid, id), { nome: n }, { merge: true }); bnames[id] = n; if (id === curId) (viewing ? mine : S).nome = n; } catch (er) { alert(ERR(er)); }
    m.hidden = true; side();
  } else if (o || x) { m.hidden = true; $('#side').classList.remove('show'); if (o) openOwn(o.dataset.own); else openShared(shared[+x.dataset.sh]); }
};
$('#burger').onclick = () => $('#side').classList.toggle('show');
$('#bd').onclick = () => $('#side').classList.remove('show');

$('#main').ondblclick = e => {
  const td = e.target.closest('td[data-e]'); if (viewing || !td || td.querySelector('input,select')) return;
  const [kind, k, id] = td.dataset.e.split(':'), x = (kind === 'tx' ? M(mi).tx : kind === 'inst' ? M(mi).inst : S.sim.itens).find(r => r.id === id); if (!x) return;
  const el = document.createElement(k === 'pag' || k === 'cat' ? 'select' : 'input');
  if (k === 'pag') el.innerHTML = S.pags.map(p => `<option>${esc(p)}</option>`).join('');
  else if (k === 'cat') el.innerHTML = S.cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  else { el.type = k === 'date' ? 'date' : k === 'valor' ? 'number' : 'text'; if (k === 'valor') el.step = '0.01'; }
  el.value = x[k] ?? ''; el.style.maxWidth = '100%'; td.textContent = ''; td.append(el); el.focus();
  let fin = false;
  const done = ok => { if (fin) return; fin = true; if (ok) { x[k] = k === 'valor' ? +el.value || 0 : el.value; save(); } render(); };
  el.onblur = () => done(true); el.onchange = () => el.tagName === 'SELECT' && done(true);
  el.onkeydown = ev => { if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); };
};
$('#main').oninput = e => {
  const t = e.target, p = t.dataset.id && $('#pv_' + t.dataset.id); if (!p) return;
  if (t.dataset.f === 'ccolor') p.style.background = t.value; else if (t.dataset.f === 'cname') p.textContent = t.value || '—';
};
Chart.defaults.color = '#8a8a8a';
Chart.defaults.borderColor = '#262626';
render();
initFb();
