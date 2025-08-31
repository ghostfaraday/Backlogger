// Backlogger v0.1.0 — Lightweight vanilla JS scaffolding
// Focus: modern UI, levels (including Legend), money-centric metrics, basic local persistence

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------- State ----------
const defaultSettings = {
  startingBalance: 10000,
  baseRiskPct: 1,
};

const levelThresholds = [
  { name: 'Novice', minMPI: 0 },
  { name: 'Apprentice', minMPI: 200 },
  { name: 'Consistent', minMPI: 500 },
  { name: 'Professional', minMPI: 900 },
  { name: 'Elite', minMPI: 1300 },
  { name: 'Master', minMPI: 1800 },
  { name: 'Legend', minMPI: 2400 },
];

const store = {
  load() {
    try {
      const raw = localStorage.getItem('backlogger');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  },
  save(state) {
    localStorage.setItem('backlogger', JSON.stringify(state));
  },
};

const initialState = () => ({
  settings: { ...defaultSettings },
  account: {
    balance: defaultSettings.startingBalance,
    equity: defaultSettings.startingBalance,
    highWater: defaultSettings.startingBalance,
    dailyPL: 0,
    weeklyPL: 0,
    biggestProfit: 0,
    biggestLoss: 0,
    bestWeek: 0,
  },
  stats: {
    wins: 0,
    losses: 0,
    sumProfit: 0,
    sumLossAbs: 0,
    maxDrawdown: 0,
    mpi: 0,
  },
  badges: [],
  reports: [],
  records: [],
  currentChallenge: null, // { strategy, pair, weekId, weekStart, days: [ { key, date, trades: [], noTrade } ], dayIndex }
});

let state = store.load() || initialState();

// ---------- Utils ----------
const fmt = (n) => n == null ? '—' : n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmt2 = (n) => n == null ? '—' : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signFmt = (n) => (n >= 0 ? '+ $' + fmt(n) : '- $' + fmt(Math.abs(n)));

function calcProfitFactor(sumProfit, sumLossAbs) {
  if (sumLossAbs <= 0) return sumProfit > 0 ? Infinity : 0;
  return sumProfit / sumLossAbs;
}

function calcMPI({ sumProfit, sumLossAbs, wins, losses, maxDrawdown }) {
  // Money Performance Index: simple composite metric
  const pf = calcProfitFactor(sumProfit, sumLossAbs);
  const wr = wins + losses > 0 ? wins / (wins + losses) : 0;
  const consistency = 1 - Math.min(maxDrawdown / Math.max(1, state.account.highWater), 1);
  const scaledPF = Math.min(pf, 5) / 5; // cap PF at 5
  return Math.round(1000 * (0.45 * scaledPF + 0.35 * wr + 0.20 * consistency));
}

function deriveLevel(mpi) {
  let current = levelThresholds[0];
  let idx = 0;
  for (let i = 0; i < levelThresholds.length; i++) {
    if (mpi >= levelThresholds[i].minMPI) { current = levelThresholds[i]; idx = i; }
  }
  const progressToNext = (() => {
    const next = levelThresholds[idx + 1];
    if (!next) return 1; // at Legend
    const span = next.minMPI - current.minMPI;
    const rel = Math.max(0, Math.min(1, (mpi - current.minMPI) / span));
    return rel;
  })();
  const nextName = levelThresholds[idx + 1]?.name || null;
  // Cumulative progress across all levels (0..100%) used for marker positioning
  const totalLevels = levelThresholds.length - 1; // segments between levels
  const segmentWidth = 100 / totalLevels;
  const cumulative = Math.min(100, Math.max(0, idx * segmentWidth + (progressToNext * segmentWidth)));
  const nextBoundary = Math.min(100, (idx + 1) * segmentWidth);
  return { name: current.name, progressToNext, nextName, cumulative, nextBoundary };
}

function awardBadge(key, label) {
  if (!state.badges.includes(key)) {
    state.badges.push(key);
    // Visual feedback could be added later (toast)
    renderBadges();
  }
}

// ---------- Routing ----------
function switchView(view) {
  $$('.view').forEach(v => v.classList.remove('is-visible'));
  $(`#view-${view}`).classList.add('is-visible');
  $$('.nav-btn').forEach(b => b.classList.toggle('is-active', b.dataset.view === view));
}

$$('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));

// ---------- Renders ----------
function renderTop() {
  $('#topBalance').textContent = `$${fmt(state.account.balance)}`;
}

function renderDashboard() {
  $('#accountBalance').textContent = `$${fmt(state.account.balance)}`;
  $('#equity').textContent = `$${fmt(state.account.equity)}`;
  $('#dailyPL').textContent = signFmt(state.account.dailyPL);
  $('#dailyPL').classList.toggle('green', state.account.dailyPL >= 0);
  $('#dailyPL').classList.toggle('red', state.account.dailyPL < 0);
  $('#weeklyPL').textContent = `Week: $${fmt(state.account.weeklyPL)}`;

  const pf = calcProfitFactor(state.stats.sumProfit, state.stats.sumLossAbs);
  $('#profitFactor').textContent = pf === Infinity ? '∞' : fmt2(pf);
  const wr = state.stats.wins + state.stats.losses > 0 ? (state.stats.wins / (state.stats.wins + state.stats.losses)) * 100 : 0;
  $('#winRate').textContent = `${fmt2(wr)}%`;
  $('#maxDD').textContent = `$${fmt(state.stats.maxDrawdown)}`;

  state.stats.mpi = calcMPI(state.stats);
  $('#mpi').textContent = fmt(state.stats.mpi);

  const { name, progressToNext, nextName, cumulative } = deriveLevel(state.stats.mpi || 0);
  $('#levelName').textContent = name;
  $('#rankBadge .rank-title').textContent = name;
  // Fill bar proportionally across total levels (so Novice shows first segment growth)
  $('#levelProgress').style.width = `${Math.round(cumulative)}%`;
  const nextEl = document.getElementById('nextLevelName');
  if (nextEl) nextEl.textContent = nextName ? nextName : '—';

  $('#biggestProfit').textContent = `$${fmt(state.account.biggestProfit)}`;
  $('#biggestLoss').textContent = `$${fmt(Math.abs(state.account.biggestLoss))}`;
  $('#bestWeek').textContent = `$${fmt(state.account.bestWeek)}`;
  $('#highWater').textContent = `$${fmt(state.account.highWater)}`;
}

function renderBadges() {
  const badges = $('#badges');
  badges.innerHTML = '';
  const labelMap = {
    firstWin100: '$100 Trade Win',
    firstWin1000: '$1,000 Trade Win',
    firstWin5000: '$5,000 Trade Win',
    profitFactor2: 'Profit Factor > 2',
    profitFactor3: 'Profit Factor > 3',
    controlledDD5: 'Drawdown < 5%',
    controlledDD2: 'Drawdown < 2%',
    controlledLoss: 'Smart Loss Management',
    newHighWater: 'New High Watermark',
    biggestWinRecord: 'New Record Win',
    winStreak3: '3+ Win Streak',
  };
  state.badges.forEach(key => {
    const li = document.createElement('li');
    li.textContent = labelMap[key] || key;
    badges.appendChild(li);
  });
}

function renderTrades() {
  const tbody = $('#tradeTable tbody');
  tbody.innerHTML = '';
  const trades = state.currentChallenge ? state.currentChallenge.days.flatMap(d => d.trades) : [];
  trades.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(t.time).toLocaleDateString()}</td>
      <td>${t.pair}</td>
      <td>${fmt2(t.rMultiple)}</td>
      <td>${signFmt(t.pl)}</td>
      <td>${t.grade}</td>
      <td>${t.ruleSummary || ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderReports() {
  const ul = $('#reports');
  ul.innerHTML = '';
  state.reports.forEach(r => {
    const li = document.createElement('li');
    li.className = 'report-item';
    li.innerHTML = `
      <div><strong>Week ${r.weekId}</strong> — ${r.strategy} ${r.pair}</div>
      <div>PL: ${signFmt(r.weekPL)} • WinRate: ${fmt2(r.winRate)}% • PF: ${r.pf === Infinity ? '∞' : fmt2(r.pf)}</div>
      <div class="report-details">
        Trades: ${r.totalTrades || 0} • Avg R: ${fmt2(r.avgRMultiple || 0)} • Rules: ${fmt2(r.ruleAdherence || 0)}%
        ${r.gradeDistribution ? ` • Grades: A${r.gradeDistribution.A} B${r.gradeDistribution.B} C${r.gradeDistribution.C}` : ''}
      </div>
    `;
    ul.appendChild(li);
  });
}

function renderRecords() {
  const ul = document.getElementById('recordsList');
  if (!ul) return;
  ul.innerHTML = '';
  const items = [
    { k: 'Highest Balance', v: `$${fmt(state.account.highWater)}` },
    { k: 'Biggest Profit (trade)', v: `$${fmt(state.account.biggestProfit)}` },
    { k: 'Biggest Loss (trade)', v: `$${fmt(Math.abs(state.account.biggestLoss))}` },
    { k: 'Best Week', v: `$${fmt(state.account.bestWeek)}` },
    { k: 'MPI High', v: fmt(state.stats.mpi) },
  ];
  items.forEach(({ k, v }) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${k}</strong>: ${v}`;
    ul.appendChild(li);
  });

  // Records analytics rendering
  const rangeSel = document.getElementById('recRange');
  const stratSel = document.getElementById('recStrategy');
  const rangeVal = rangeSel?.value || 'all';
  const stratVal = stratSel?.value || 'all';
  const reports = (state.reports || []).filter(r => stratVal === 'all' || r.strategy === stratVal);
  const scoped = rangeVal === 'all' ? reports : reports.slice(0, parseInt(rangeVal, 10));

  // Totals
  const trades = scoped.reduce((a, r) => a + (r.totalTrades || 0), 0);
  const wins = scoped.reduce((a, r) => a + ((r.wins != null) ? r.wins : 0), 0);
  const losses = scoped.reduce((a, r) => a + ((r.losses != null) ? r.losses : 0), 0);
  const wr = (wins + losses) ? (wins / (wins + losses)) * 100 : 0;
  const elT = document.getElementById('recTotalTrades'); if (elT) elT.textContent = fmt(trades);
  const elW = document.getElementById('recWins'); if (elW) elW.textContent = fmt(wins);
  const elL = document.getElementById('recLosses'); if (elL) elL.textContent = fmt(losses);
  const elWR = document.getElementById('recWinRate'); if (elWR) elWR.textContent = `${fmt2(wr)}%`;

  // Weekly compare table
  const tbody = document.querySelector('#weeklyCompare tbody');
  if (tbody) {
    tbody.innerHTML = '';
    scoped.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.weekRange || r.weekId}</td>
        <td>${signFmt(r.weekPL || 0)}</td>
        <td>${fmt2(r.winRate || 0)}%</td>
        <td>${r.pf === Infinity ? '∞' : fmt2(r.pf || 0)}</td>
        <td>${fmt2(r.avgRMultiple || 0)}</td>
        <td>${fmt(r.totalTrades || 0)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Discipline bars (use average across scoped)
  const discEl = document.getElementById('discBars');
  if (discEl) {
    discEl.innerHTML = '';
    const avg = (key) => {
      const vals = scoped.map(r => r.adherenceByCat?.[key] ?? null).filter(v => v != null);
      if (!vals.length) return 0;
      return vals.reduce((a, v) => a + v, 0) / vals.length;
    };
    const metrics = [
      { key: 'strategy', label: 'Strategy' },
      { key: 'tradeMgmt', label: 'Trade Mgmt' },
      { key: 'riskMgmt', label: 'Risk Mgmt' },
      { key: 'plan', label: 'Plan' },
      { key: 'overall', label: 'Overall' },
    ];
    metrics.forEach(m => {
      const val = avg(m.key);
      const row = document.createElement('div');
      row.className = 'bar';
      row.innerHTML = `
        <div class="bar-label">${m.label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round(val)}%"></div></div>
        <div class="bar-val">${fmt2(val)}%</div>
      `;
      discEl.appendChild(row);
    });
  }

  // Charts (placeholder simple text until charting lib is considered)
  const balEl = document.getElementById('chartBalance');
  if (balEl) {
    balEl.innerHTML = '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', '50'); txt.setAttribute('y', '50'); txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('fill', 'currentColor');
    txt.textContent = 'Balance growth (last ' + (rangeVal==='all'?reports.length:scoped.length) + ' weeks)';
    svg.appendChild(txt); balEl.appendChild(svg);
  }
  const mpiEl = document.getElementById('chartMPI');
  if (mpiEl) {
    mpiEl.innerHTML = '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', '50'); txt.setAttribute('y', '50'); txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('fill', 'currentColor');
    txt.textContent = 'MPI evolution (last ' + (rangeVal==='all'?reports.length:scoped.length) + ' weeks)';
    svg.appendChild(txt); mpiEl.appendChild(svg);
  }

  // Timeline from badges and records events (simple derivation)
  const tl = document.getElementById('timeline');
  if (tl) {
    tl.innerHTML = '';
    const events = [];
    // Best-week events
    scoped.forEach(r => {
      if (r.weekPL === state.account.bestWeek) {
        events.push({ when: r.weekRange || r.weekId, what: `New Best Week: ${signFmt(r.weekPL)}` });
      }
    });
    // High-water inferred (approx) and badge placeholders
    if (state.account.highWater) {
      events.push({ when: '—', what: `High Watermark: $${fmt(state.account.highWater)}` });
    }
    if (state.account.biggestProfit) {
      events.push({ when: '—', what: `Record Win: $${fmt(state.account.biggestProfit)}` });
    }
    if (state.account.biggestLoss) {
      events.push({ when: '—', what: `Record Loss: -$${fmt(Math.abs(state.account.biggestLoss))}` });
    }
    events.slice(0, 10).forEach(e => {
      const li = document.createElement('li');
      li.innerHTML = `<div class="when">${e.when}</div><div class="what">${e.what}</div>`;
      tl.appendChild(li);
    });
  }
}

// Hook up Records filters
['recRange','recStrategy'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', () => { renderRecords(); });
});

// ---------- Actions ----------
function startChallenge() {
  const strategy = $('#strategySelect').value;
  const pair = $('#pairSelect').value;
  const weekId = Math.floor(Math.random() * 9000) + 1000;
  const weekStartInput = $('#weekStart').value;
  const weekStart = getMondayISO(weekStartInput ? new Date(weekStartInput) : new Date());
  const days = buildWeekDays(weekStart);
  state.currentChallenge = { strategy, pair, weekId, weekStart, days, dayIndex: 0 };
  $('#challengeInfo').textContent = `Week ${weekId} • ${strategy} on ${pair} • ${formatWeekRange(weekStart)}`;
  $('#markNoTrade').disabled = false;
  $('#nextDay').disabled = false;
  updateCurrentDayUI();
  updateDailySummary();
  switchView('challenge');
  persistAndRender();
}

function endWeek() {
  if (!state.currentChallenge) return;
  const allTrades = state.currentChallenge.days.flatMap(d => d.trades);
  const weekPL = allTrades.reduce((a, t) => a + t.pl, 0);
  const wins = allTrades.filter(t => t.pl > 0).length;
  const losses = allTrades.filter(t => t.pl < 0).length;
  const sumProfit = allTrades.filter(t => t.pl > 0).reduce((a, t) => a + t.pl, 0);
  const sumLossAbs = Math.abs(allTrades.filter(t => t.pl < 0).reduce((a, t) => a + t.pl, 0));
  const pf = calcProfitFactor(sumProfit, sumLossAbs);
  const wr = (wins + losses) ? (wins / (wins + losses)) * 100 : 0;
  
  // Calculate additional weekly metrics
  const avgRMultiple = allTrades.length ? allTrades.reduce((a, t) => a + t.rMultiple, 0) / allTrades.length : 0;
  const gradeDistribution = {
    A: allTrades.filter(t => t.grade === 'A').length,
    B: allTrades.filter(t => t.grade === 'B').length,
    C: allTrades.filter(t => t.grade === 'C').length,
  };
  const adherenceByCat = calcRuleAdherence(allTrades);
  const ruleAdherence = adherenceByCat.overall;
  const bestTrade = allTrades.reduce((best, t) => t.pl > best.pl ? t : best, { pl: -Infinity });
  const worstTrade = allTrades.reduce((worst, t) => t.pl < worst.pl ? t : worst, { pl: Infinity });
  
  state.reports.unshift({
    weekId: state.currentChallenge.weekId,
    strategy: state.currentChallenge.strategy,
    pair: state.currentChallenge.pair,
    weekRange: formatWeekRange(state.currentChallenge.weekStart),
    weekPL,
    wins,
    losses,
    winRate: wr,
    pf,
    avgRMultiple,
    gradeDistribution,
    ruleAdherence,
    adherenceByCat,
    bestTrade: bestTrade.pl > -Infinity ? bestTrade : null,
    worstTrade: worstTrade.pl < Infinity ? worstTrade : null,
    totalTrades: allTrades.length,
    endBalance: state.account.balance,
    mpiAtEnd: calcMPI(state.stats),
    days: summarizeDays(state.currentChallenge.days),
    trades: allTrades.map(t => ({
      time: t.time,
      pair: t.pair,
      rMultiple: t.rMultiple,
      pl: t.pl,
      grade: t.grade,
      ruleSummary: t.ruleSummary,
      entry: t.entry,
      stop: t.stop,
      exit: t.exit,
      riskPct: t.riskPct,
      ruleStrategyRating: t.ruleStrategyRating,
      ruleTradeMgmtRating: t.ruleTradeMgmtRating,
      ruleRiskMgmtRating: t.ruleRiskMgmtRating,
      rulePlanRating: t.rulePlanRating,
      notes: t.notes || ''
    })),
  });
  
  // Reset weekly tracking
  state.account.weeklyPL = 0;
  if (weekPL > state.account.bestWeek) {
    state.account.bestWeek = weekPL;
    awardBadge('newBestWeek');
  }
  
  state.currentChallenge = null;
  $('#challengeInfo').textContent = 'No active challenge';
  $('#endWeek').style.display = 'none';
  $('#markNoTrade').disabled = true;
  $('#nextDay').disabled = true;
  persistAndRender();
  switchView('log');
}

// Render Trade Log (weekly analyses)
function renderLog() {
  const rangeSel = document.getElementById('logRange');
  const stratSel = document.getElementById('logStrategy');
  const sortSel = document.getElementById('logSort');
  const searchInput = document.getElementById('logSearch');
  if (!rangeSel || !stratSel || !sortSel) return;

  const rangeVal = rangeSel.value;
  const stratVal = stratSel.value;
  const sortVal = sortSel.value;
  const q = (searchInput?.value || '').trim().toLowerCase();

  // Filter
  let reports = [...(state.reports || [])];
  if (stratVal !== 'all') {
    reports = reports.filter(r => r.strategy === stratVal);
  }
  if (q) {
    reports = reports.filter(r => {
      const hay = [r.weekId, r.weekRange, r.pair, r.strategy].join(' ').toLowerCase();
      const notesMatch = Array.isArray(r.trades) && r.trades.some(t => (t.notes || '').toLowerCase().includes(q));
      return hay.includes(q) || notesMatch;
    });
  }

  // Range
  const scoped = rangeVal === 'all' ? reports : reports.slice(0, parseInt(rangeVal, 10));

  // Sort
  const sorted = [...scoped].sort((a, b) => {
    switch (sortVal) {
      case 'pl': return (b.weekPL || 0) - (a.weekPL || 0);
      case 'pf': return (b.pf || 0) - (a.pf || 0);
      case 'wr': return (b.winRate || 0) - (a.winRate || 0);
      case 'trades': return (b.totalTrades || 0) - (a.totalTrades || 0);
      case 'week':
      default: return 0; // already newest first
    }
  });

  // Summary chips
  const weeksCount = sorted.length;
  const totalTrades = sorted.reduce((a, r) => a + (r.totalTrades || 0), 0);
  const wins = sorted.reduce((a, r) => a + (r.wins || 0), 0);
  const losses = sorted.reduce((a, r) => a + (r.losses || 0), 0);
  const netPL = sorted.reduce((a, r) => a + (r.weekPL || 0), 0);
  const wr = (wins + losses) ? (wins / (wins + losses)) * 100 : 0;
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('logWeeks', fmt(weeksCount));
  setText('logTotalTrades', fmt(totalTrades));
  setText('logWins', fmt(wins));
  setText('logLosses', fmt(losses));
  setText('logWR', `${fmt2(wr)}%`);
  setText('logNetPL', signFmt(netPL));

  const cards = document.getElementById('logCards');
  const empty = document.getElementById('logEmpty');
  if (!cards || !empty) return;
  cards.innerHTML = '';
  empty.style.display = sorted.length ? 'none' : '';

  sorted.forEach((r, idx) => {
    const card = document.createElement('div');
    card.className = 'log-card';
    const dayPills = (r.days || []).map(d => `<span class="pill day small">${(d.key||'').slice(0,3).toUpperCase()} • ${signFmt(d.pl||0)} • ${fmt(d.trades||0)}</span>`).join(' ');
    card.innerHTML = `
      <header>
        <div>
          <div><strong>Week ${r.weekId}</strong> • ${r.weekRange || ''}</div>
          <div class="muted">${r.strategy} • ${r.pair}</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <div class="pill ${r.weekPL>=0?'green':'red'}">${signFmt(r.weekPL||0)}</div>
          <button class="secondary small" data-view-week="${idx}">View Details</button>
        </div>
      </header>
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">PF</div><div class="kpi-value">${r.pf===Infinity?'∞':fmt2(r.pf||0)}</div></div>
        <div class="kpi"><div class="kpi-label">Win Rate</div><div class="kpi-value">${fmt2(r.winRate||0)}%</div></div>
        <div class="kpi"><div class="kpi-label">Avg R</div><div class="kpi-value">${fmt2(r.avgRMultiple||0)}</div></div>
        <div class="kpi"><div class="kpi-label">Trades</div><div class="kpi-value">${fmt(r.totalTrades||0)}</div></div>
        <div class="kpi"><div class="kpi-label">Rules</div><div class="kpi-value">${fmt2(r.ruleAdherence||0)}%</div></div>
      </div>
      <div class="pill-row">${dayPills}</div>
    `;
    cards.appendChild(card);
  });

  // Wire detail buttons
  cards.querySelectorAll('[data-view-week]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-view-week'), 10);
      openWeekDrawer(sorted[idx]);
    });
  });
}

function openWeekDrawer(report) {
  const drawer = document.getElementById('logDrawer');
  if (!drawer) return;
  drawer.hidden = false;
  // Header
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('dwTitle', `Week ${report.weekId}`);
  set('dwSub', `${report.weekRange || ''} • ${report.strategy} • ${report.pair}`);
  set('dwPL', signFmt(report.weekPL || 0));
  set('dwPF', report.pf===Infinity?'∞':fmt2(report.pf||0));
  set('dwWR', `${fmt2(report.winRate || 0)}%`);
  set('dwTrades', fmt(report.totalTrades || 0));
  set('dwEndBal', `$${fmt(report.endBalance || state.account.balance)}`);
  set('dwMPI', fmt(report.mpiAtEnd || state.stats.mpi));

  // Overview charts placeholders
  const bc = document.getElementById('dwBalanceChart');
  if (bc) { bc.innerHTML = '<span class="muted">Balance sparkline (Mon–Fri)</span>'; }
  const gr = document.getElementById('dwGrades');
  if (gr) { gr.innerHTML = `<span class="muted">Grades A/B/C: ${report.gradeDistribution?`A${report.gradeDistribution.A} B${report.gradeDistribution.B} C${report.gradeDistribution.C}`:'—'}</span>`; }

  // Days grid
  const daysEl = document.getElementById('dwDays');
  if (daysEl) {
    daysEl.innerHTML = '';
    (report.days || []).forEach(d => {
      const div = document.createElement('div');
      div.className = 'day-card';
      div.innerHTML = `
        <div class="head"><strong>${(d.key||'').charAt(0).toUpperCase()+ (d.key||'').slice(1)}</strong><span class="pill ${d.pl>=0?'green':'red'} small">${signFmt(d.pl||0)}</span></div>
        <div class="muted">${d.date || ''}</div>
        <div class="muted">Trades: ${fmt(d.trades||0)} • WR: ${fmt2(d.wr||0)}%</div>
        ${d.noTrade?'<div class="pill small">No Trade</div>':''}
      `;
      daysEl.appendChild(div);
    });
  }

  // Trades table
  const tBody = document.querySelector('#dwTradesTbl tbody');
  if (tBody) {
    tBody.innerHTML = '';
    if (Array.isArray(report.trades) && report.trades.length) {
      report.trades.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${new Date(t.time).toLocaleDateString()}</td>
          <td>${t.pair}</td>
          <td>${fmt2(t.rMultiple)}</td>
          <td>${signFmt(t.pl)}</td>
          <td>${t.grade}</td>
          <td>${t.ruleSummary || ''}</td>
        `;
        tBody.appendChild(tr);
      });
    } else {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="6" class="muted">Trade details not available for this report.</td>`;
      tBody.appendChild(tr);
    }
  }

  // Rules adherence bars
  const rb = document.getElementById('dwRulesBars');
  if (rb) {
    rb.innerHTML = '';
    const cats = report.adherenceByCat || {};
    const add = (label, val) => {
      const row = document.createElement('div');
      row.className = 'bar';
      const pct = Math.round(val || 0);
      row.innerHTML = `<div class="bar-label">${label}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><div class="bar-val">${fmt2(val||0)}%</div>`;
      rb.appendChild(row);
    };
    add('Strategy', cats.strategy);
    add('Trade Mgmt', cats.tradeMgmt);
    add('Risk Mgmt', cats.riskMgmt);
    add('Plan', cats.plan);
    add('Overall', (report.ruleAdherence || cats.overall));
  }

  // Violations list (simplified: trades with any rating < 4)
  const viol = document.getElementById('dwViolations');
  if (viol) {
    viol.innerHTML = '';
    if (Array.isArray(report.trades)) {
      const bad = report.trades.filter(t => (t.ruleStrategyRating<4)||(t.ruleTradeMgmtRating<4)||(t.ruleRiskMgmtRating<4)||(t.rulePlanRating<4));
      if (!bad.length) {
        viol.innerHTML = '<div class="muted">No rule violations recorded.</div>';
      } else {
        const ul = document.createElement('ul');
        bad.forEach(t => {
          const li = document.createElement('li');
          li.innerHTML = `${new Date(t.time).toLocaleDateString()} — ${t.pair} • ${signFmt(t.pl)} • Ratings S${t.ruleStrategyRating}/T${t.ruleTradeMgmtRating}/R${t.ruleRiskMgmtRating}/P${t.rulePlanRating}`;
          ul.appendChild(li);
        });
        viol.appendChild(ul);
      }
    } else {
      viol.innerHTML = '<div class="muted">No trade-level data available.</div>';
    }
  }

  // Tabs
  const tabs = drawer.querySelectorAll('.tab');
  const panels = drawer.querySelectorAll('.tab-panel');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('is-active'));
      panels.forEach(p => p.classList.remove('is-active'));
      tab.classList.add('is-active');
      const id = tab.getAttribute('data-tab');
      drawer.querySelector(`#tab-${id}`).classList.add('is-active');
    });
  });

  // Close handlers
  drawer.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => { drawer.hidden = true; }));
}

// Hook log filters/search
['logRange','logStrategy','logSort'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', renderLog);
});
const logSearch = document.getElementById('logSearch');
if (logSearch) logSearch.addEventListener('input', () => { renderLog(); });

// Extend persist to render log
function persistAndRender() {
  store.save(state);
  renderTop();
  renderDashboard();
  renderBadges();
  renderTrades();
  renderReports();
  renderRecords();
  renderLog();
  updateCurrentDayUI();
  updateDailySummary();
}

// ---------- Events ----------
$('#startChallenge').addEventListener('click', startChallenge);
$('#endWeek').addEventListener('click', endWeek);
$('#markNoTrade').addEventListener('click', markNoTradeToday);
$('#nextDay').addEventListener('click', gotoNextDay);

// Settings icon in header should open Settings view
const settingsBtn = document.getElementById('settingsBtn');
if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    switchView('settings');
  });
}

$('#tradeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  addTrade(fd);
  persistAndRender();
  e.currentTarget.reset();
});

$('#saveSettings').addEventListener('click', saveSettings);

// Initialize UI with persisted state
persistAndRender();

// UX: date input hint visibility
const weekStartInput = document.getElementById('weekStart');
if (weekStartInput) {
  const wrap = weekStartInput.closest('.input-wrap');
  const syncHint = () => {
    if (!wrap) return;
    wrap.classList.toggle('has-value', !!weekStartInput.value);
  };
  weekStartInput.addEventListener('change', syncHint);
  weekStartInput.addEventListener('input', syncHint);
  weekStartInput.addEventListener('blur', syncHint);
  syncHint();
}

// UX: star ratings for rules
function initRatings() {
  document.querySelectorAll('.rating').forEach(group => {
    const name = group.getAttribute('data-name');
    const hidden = document.querySelector(`input[name="${name}"]`) || document.querySelector(`input[name="${name}"]`);
    const stars = Array.from(group.querySelectorAll('.star'));
    const sync = (val) => {
      stars.forEach(s => s.classList.toggle('is-on', parseInt(s.dataset.val, 10) <= val));
      const hiddenInput = group.parentElement.querySelector(`input[name="${name}"]`);
      if (hiddenInput) hiddenInput.value = String(val);
    };
    // default
    const defaultVal = parseInt(group.parentElement.querySelector(`input[name="${name}"]`)?.value || '5', 10);
    sync(defaultVal);
    stars.forEach(star => {
      star.addEventListener('click', () => sync(parseInt(star.dataset.val, 10)));
    });
  });
}
initRatings();
