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
  const trades = state.currentChallenge ? state.currentChallenge.days.flatMap(d => d.trades.map(t => ({...t, _dayKey: d.key, _noTrade: d.noTrade}))) : [];
  trades.forEach(t => {
    const tr = document.createElement('tr');
    if (t._noTrade) tr.classList.add('no-trade-day');
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
  // Top-level summary across all completed weeks
  const weeksCount = state.reports.length;
  const totalTrades = state.reports.reduce((a, r) => a + (r.totalTrades || 0), 0);
  const wins = state.reports.reduce((a, r) => a + (r.wins || 0), 0);
  const losses = state.reports.reduce((a, r) => a + (r.losses || 0), 0);
  const netPL = state.reports.reduce((a, r) => a + (r.weekPL || 0), 0);
  const wr = (wins + losses) ? (wins / (wins + losses)) * 100 : 0;
  const avgR = state.reports.length ? (state.reports.reduce((a, r) => a + (r.avgRMultiple || 0), 0) / state.reports.length) : 0;
  const avgRules = state.reports.length ? (state.reports.reduce((a, r) => a + (r.ruleAdherence || 0), 0) / state.reports.length) : 0;
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('logWeeks', fmt(weeksCount));
  setText('logTotalTrades', fmt(totalTrades));
  setText('logWR', `${fmt2(wr)}%`);
  setText('logNetPL', signFmt(netPL));
  setText('logAvgR', fmt2(avgR));
  setText('logAvgRules', `${fmt2(avgRules)}%`);

  state.reports.forEach(r => {
    const li = document.createElement('li');
    li.className = 'report-item';
    const notesCount = Array.isArray(r.trades) ? r.trades.filter(t => (t.notes||'').trim().length).length : 0;
    const avgR = r.avgRMultiple != null ? fmt2(r.avgRMultiple) : '—';
    const pfTxt = r.pf === Infinity ? '∞' : fmt2(r.pf);
    const grades = r.gradeDistribution ? ` • Grades: A${r.gradeDistribution.A} B${r.gradeDistribution.B} C${r.gradeDistribution.C}` : '';
    const recordTag = (r.weekPL != null && r.weekPL === state.account.bestWeek && r.weekPL > 0) ? '<span class="pill small green" style="margin-left:6px;">New Record</span>' : '';
    // Build details section (hidden by default)
    const daysHtml = Array.isArray(r.days) ? r.days.map(d => `
      <li><strong>${(d.key||'').slice(0,3).toUpperCase()}</strong> — ${signFmt(d.pl||0)} • Trades: ${fmt(d.trades||0)} • WR: ${fmt2(d.wr||0)}% ${d.noTrade? '• No Trade':''}</li>
    `).join('') : '';
    const bestHtml = r.bestTrade ? `${new Date(r.bestTrade.time).toLocaleDateString()} • ${r.bestTrade.pair} • R ${fmt2(r.bestTrade.rMultiple)} • ${signFmt(r.bestTrade.pl)}` : '—';
    const worstHtml = r.worstTrade ? `${new Date(r.worstTrade.time).toLocaleDateString()} • ${r.worstTrade.pair} • R ${fmt2(r.worstTrade.rMultiple)} • ${signFmt(r.worstTrade.pl)}` : '—';
    const noteItems = Array.isArray(r.trades) ? r.trades.filter(t => (t.notes||'').trim()).slice(0,3).map(t => `<li>${new Date(t.time).toLocaleDateString()} — ${t.pair}: ${t.notes}</li>`).join('') : '';
    const extraId = `rep-extra-${r.weekId}-${Math.random().toString(36).slice(2,7)}`;
    li.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:8px; align-items:center; flex-wrap:wrap;">
        <div><strong>Week ${r.weekId}</strong> — ${r.strategy} ${r.pair} ${recordTag}</div>
        <button class="secondary small" data-toggle="${extraId}">Details</button>
      </div>
      <div>PL: ${signFmt(r.weekPL)} • WinRate: ${fmt2(r.winRate)}% • PF: ${pfTxt} • Avg R:R: ${avgR}</div>
      <div class="report-details">
        Trades: ${r.totalTrades || 0} • Notes: ${fmt(notesCount)} • Rules: ${fmt2(r.ruleAdherence || 0)}%
        ${grades}
      </div>
      <div id="${extraId}" class="report-extra" style="display:none; margin-top:8px;">
        <div class="muted" style="margin-bottom:6px;">Day-by-day</div>
        <ul class="muted" style="margin:0 0 8px 16px;">${daysHtml || '<li>—</li>'}</ul>
        <div class="muted" style="margin-bottom:4px;">Best Trade</div>
        <div style="margin-bottom:8px;">${bestHtml}</div>
        <div class="muted" style="margin-bottom:4px;">Worst Trade</div>
        <div style="margin-bottom:8px;">${worstHtml}</div>
        <div class="muted" style="margin-bottom:4px;">Notes (preview)</div>
        <ul class="muted" style="margin:0 0 0 16px;">${noteItems || '<li>—</li>'}</ul>
      </div>
    `;
    ul.appendChild(li);

    // Wire toggle for details
    const btn = li.querySelector('[data-toggle]');
    if (btn) {
      btn.addEventListener('click', () => {
        const target = li.querySelector('#' + btn.getAttribute('data-toggle'));
        if (target) target.style.display = target.style.display === 'none' ? '' : 'none';
      });
    }
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

function addTrade(formData) {
  if (!state.currentChallenge) return;

  const entry = parseFloat(formData.get('entry')); 
  const stop = parseFloat(formData.get('stop')); 
  const exit = parseFloat(formData.get('exit')); 
  const riskPct = parseFloat(formData.get('riskPct') || state.settings.baseRiskPct);
  const grade = formData.get('grade');
  const notes = formData.get('notes') || '';
  const ruleStrategyRating = parseInt(formData.get('ruleStrategyRating') || '0', 10);
  const ruleTradeMgmtRating = parseInt(formData.get('ruleTradeMgmtRating') || '0', 10);
  const ruleRiskMgmtRating = parseInt(formData.get('ruleRiskMgmtRating') || '0', 10);
  const rulePlanRating = parseInt(formData.get('rulePlanRating') || '0', 10);
  // Consider 4+ stars as adherence "true"
  const ruleStrategy = ruleStrategyRating >= 4;
  const ruleTradeMgmt = ruleTradeMgmtRating >= 4;
  const ruleRiskMgmt = ruleRiskMgmtRating >= 4;
  const rulePlan = rulePlanRating >= 4;
  const pair = state.currentChallenge.pair; // Use challenge pair, not selector

  // Validation
  if (isNaN(entry) || isNaN(stop) || isNaN(exit) || isNaN(riskPct)) {
    alert('Please enter valid numbers for all price fields');
    return;
  }

  const riskDollars = state.account.balance * (riskPct / 100);
  // Fixed R multiple calculation: properly handle long/short direction
  const isLong = stop < entry; // If stop below entry, it's a long trade
  const riskPerUnit = Math.abs(entry - stop);
  let rMultiple = 0;
  if (riskPerUnit > 0) {
    if (isLong) {
      rMultiple = (exit - entry) / riskPerUnit; // Long: profit when exit > entry
    } else {
      rMultiple = (entry - exit) / riskPerUnit; // Short: profit when exit < entry  
    }
  }
  const pl = Math.round(rMultiple * riskDollars);

  // Update stats and account
  state.account.balance += pl;
  state.account.equity = state.account.balance;
  state.account.dailyPL += pl;
  state.account.weeklyPL += pl;
  if (pl > 0) state.stats.wins += 1; else if (pl < 0) state.stats.losses += 1;
  if (pl > 0) state.stats.sumProfit += pl; else state.stats.sumLossAbs += Math.abs(pl);
  if (pl > state.account.biggestProfit) { state.account.biggestProfit = pl; awardBadge('biggestWinRecord'); }
  if (pl < state.account.biggestLoss) state.account.biggestLoss = pl;
  if (state.account.balance > state.account.highWater) { state.account.highWater = state.account.balance; awardBadge('newHighWater'); }

  // Max drawdown approximation: track distance from highWater
  state.stats.maxDrawdown = Math.max(state.stats.maxDrawdown, state.account.highWater - state.account.balance);

  // Enhanced badge and penalty system
  const oldMPI = state.stats.mpi;
  const newMPI = calcMPI(state.stats);
  
  // Dollar milestones
  if (pl >= 100 && !state.badges.includes('firstWin100')) awardBadge('firstWin100');
  if (pl >= 1000 && !state.badges.includes('firstWin1000')) awardBadge('firstWin1000');
  if (pl >= 5000 && !state.badges.includes('firstWin5000')) awardBadge('firstWin5000');

  // Risk management badges
  const avgWin = state.stats.wins ? state.stats.sumProfit / state.stats.wins : 0;
  if (pl < 0 && avgWin > 0 && Math.abs(pl) < avgWin) awardBadge('controlledLoss');
  
  // Profit factor achievements
  const pf = calcProfitFactor(state.stats.sumProfit, state.stats.sumLossAbs);
  if (pf >= 2 && !state.badges.includes('profitFactor2')) awardBadge('profitFactor2');
  if (pf >= 3 && !state.badges.includes('profitFactor3')) awardBadge('profitFactor3');
  
  // Drawdown control
  const ddPct = state.account.highWater > 0 ? (state.stats.maxDrawdown / state.account.highWater) * 100 : 0;
  if (ddPct < 5 && state.stats.wins + state.stats.losses >= 10) awardBadge('controlledDD5');
  if (ddPct < 2 && state.stats.wins + state.stats.losses >= 20) awardBadge('controlledDD2');

  // Win streak tracking (simplified) — compute from all trades this week safely
  try {
    const flatTrades = state.currentChallenge.days.flatMap(d => d.trades).sort((a,b) => (b.time||0) - (a.time||0));
    if (pl > 0 && flatTrades.length >= 2) {
      const lastTwo = flatTrades.slice(0, 2);
      if (lastTwo.every(t => t.pl > 0)) awardBadge('winStreak3');
    }
  } catch (_) { /* no-op */ }

  // Rule violations penalty
  const ruleFollowed = ruleStrategy && ruleTradeMgmt && ruleRiskMgmt && rulePlan;
  if (!ruleFollowed) {
    // Deduct points or mark violation (placeholder for points system)
  }

  // Over-risking penalty  
  if (riskPct > state.settings.baseRiskPct * 2) {
    // Flag as over-risking (could reduce points later)
  }

  const trade = {
    time: Date.now(),
    pair,
    entry, stop, exit,
    riskPct, grade, notes, ruleFollowed,
  ruleStrategy, ruleTradeMgmt, ruleRiskMgmt, rulePlan,
  ruleStrategyRating, ruleTradeMgmtRating, ruleRiskMgmtRating, rulePlanRating,
    ruleSummary: `${ruleStrategy ? 'S' : 's'}${ruleTradeMgmt ? 'T' : 't'}${ruleRiskMgmt ? 'R' : 'r'}${rulePlan ? 'P' : 'p'}`,
    rMultiple: parseFloat(rMultiple.toFixed(2)),
    pl,
    rText: `1:${(isFinite(rMultiple) && rMultiple>0) ? fmt2(rMultiple) : '0'}`,
  };
  // Insert into current day
  const day = state.currentChallenge.days[state.currentChallenge.dayIndex];
  day.trades.unshift(trade);
  updateDailySummary();
  renderTrades();
}

// ---- Challenge day/week helpers ----
const DAY_KEYS = ['monday','tuesday','wednesday','thursday','friday'];
function getMondayISO(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0..6, where 1 is Monday
  const diff = (day === 0 ? -6 : 1 - day); // move to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d.toISOString().slice(0,10);
}
function buildWeekDays(weekStartISO) {
  const base = new Date(weekStartISO);
  const arr = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    arr.push({ key: DAY_KEYS[i], date: d.toISOString().slice(0,10), trades: [], noTrade: false });
  }
  return arr;
}
function formatWeekRange(weekStartISO) {
  const start = new Date(weekStartISO);
  const end = new Date(weekStartISO);
  end.setDate(end.getDate() + 4);
  return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
}
function updateCurrentDayUI() {
  const el = document.getElementById('currentDay');
  const endBtn = document.getElementById('endWeek');
  const nextBtn = document.getElementById('nextDay');
  if (!state.currentChallenge || !el) return;
  const idx = state.currentChallenge.dayIndex;
  const label = DAY_KEYS[idx]?.charAt(0).toUpperCase() + DAY_KEYS[idx]?.slice(1) || '—';
  el.textContent = label;
  // Show End Week button only on Friday
  const isFriday = idx === 4;
  endBtn.style.display = isFriday ? '' : 'none';
  // On Friday, repurpose Next to return to Monday
  nextBtn.textContent = isFriday ? 'Return to Monday' : 'Next Day';
  nextBtn.dataset.mode = isFriday ? 'return' : 'next';
  nextBtn.disabled = false;
}
function updateDailySummary() {
  const el = document.getElementById('dailySummary');
  if (!el || !state.currentChallenge) return;
  const d = state.currentChallenge.days[state.currentChallenge.dayIndex];
  const dayPL = d.trades.reduce((a, t) => a + t.pl, 0);
  el.textContent = `Today: ${d.trades.length} trades • P/L ${signFmt(dayPL)}`;
}
function markNoTradeToday() {
  if (!state.currentChallenge) return;
  const d = state.currentChallenge.days[state.currentChallenge.dayIndex];
  d.noTrade = true;
  updateDailySummary();
  persistAndRender();
}
function gotoNextDay() {
  if (!state.currentChallenge) return;
  const idx = state.currentChallenge.dayIndex;
  if (idx >= 4) {
    // Friday -> return to Monday
    state.currentChallenge.dayIndex = 0;
  } else {
    state.currentChallenge.dayIndex = idx + 1;
  }
  updateCurrentDayUI();
  updateDailySummary();
  persistAndRender();
}
function calcRuleAdherence(trades) {
  if (!trades.length) return { overall: 0, strategy: 0, tradeMgmt: 0, riskMgmt: 0, plan: 0 };
  const tot = trades.length;
  const strategy = trades.filter(t => t.ruleStrategyRating >= 4).length / tot * 100;
  const tradeMgmt = trades.filter(t => t.ruleTradeMgmtRating >= 4).length / tot * 100;
  const riskMgmt = trades.filter(t => t.ruleRiskMgmtRating >= 4).length / tot * 100;
  const plan = trades.filter(t => t.rulePlanRating >= 4).length / tot * 100;
  const overall = trades.filter(t => t.ruleFollowed).length / tot * 100;
  return { overall, strategy, tradeMgmt, riskMgmt, plan };
}
function summarizeDays(days) {
  return days.map(d => ({
    key: d.key,
    date: d.date,
    noTrade: d.noTrade,
    trades: d.trades.length,
    pl: d.trades.reduce((a, t) => a + t.pl, 0),
    wr: (() => { const w = d.trades.filter(t => t.pl>0).length; const l = d.trades.filter(t=>t.pl<0).length; return (w+l)? (w/(w+l))*100 : 0; })(),
  }));
}

function saveSettings() {
  const startingBalance = parseFloat($('#startingBalance').value) || defaultSettings.startingBalance;
  const baseRiskPct = parseFloat($('#baseRisk').value) || defaultSettings.baseRiskPct;
  state.settings.startingBalance = startingBalance;
  state.settings.baseRiskPct = baseRiskPct;
  
  // Only reset if balance changed significantly and user has no active challenge
  if (Math.abs(startingBalance - state.account.balance) > 1000 && !state.currentChallenge) {
    const shouldReset = confirm('Reset account balance to new starting amount? This will clear your current progress.');
    if (shouldReset) {
      state.account.balance = startingBalance;
      state.account.equity = startingBalance;
      state.account.highWater = startingBalance;
      state.account.dailyPL = 0;
      state.account.weeklyPL = 0;
      state.account.biggestProfit = 0;
      state.account.biggestLoss = 0;
      state.account.bestWeek = 0;
      state.stats.wins = 0;
      state.stats.losses = 0;
      state.stats.sumProfit = 0;
      state.stats.sumLossAbs = 0;
      state.stats.maxDrawdown = 0;
      state.stats.mpi = 0;
      state.badges = [];
    }
  }
  persistAndRender();
}

function persistAndRender() {
  store.save(state);
  renderTop();
  renderDashboard();
  renderBadges();
  renderTrades();
  renderReports();
  renderRecords();
  updateCurrentDayUI();
  updateDailySummary();
  // Enable/disable trade form if no active challenge
  const form = document.getElementById('tradeForm');
  const overlay = document.getElementById('noChallengeOverlay');
  const disable = !state.currentChallenge;
  if (form) {
    Array.from(form.querySelectorAll('input, select, button[type="submit"]')).forEach(el => { el.disabled = disable; });
    if (overlay) overlay.style.display = disable ? '' : 'none';
  }
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
  // default: empty until selected
  const defaultVal = parseInt(group.parentElement.querySelector(`input[name="${name}"]`)?.value || '0', 10);
    sync(defaultVal);
    stars.forEach(star => {
      star.addEventListener('click', () => sync(parseInt(star.dataset.val, 10)));
    });
  });
}
initRatings();
