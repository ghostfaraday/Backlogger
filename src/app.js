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
  currentChallenge: null, // { strategy, pair, weekId, trades: [] }
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
  return { name: current.name, progressToNext };
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

  const { name, progressToNext } = deriveLevel(state.stats.mpi);
  $('#levelName').textContent = name;
  $('#rankBadge .rank-title').textContent = name;
  $('#levelProgress').style.width = `${Math.round(progressToNext * 100)}%`;

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
  const trades = state.currentChallenge?.trades || [];
  trades.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(t.time).toLocaleDateString()}</td>
      <td>${t.pair}</td>
      <td>${fmt2(t.rMultiple)}</td>
      <td>${signFmt(t.pl)}</td>
      <td>${t.grade}</td>
      <td>${t.ruleFollowed ? 'Yes' : 'No'}</td>
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
  const ul = $('#recordsList');
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
}

// ---------- Actions ----------
function startChallenge() {
  const strategy = $('#strategySelect').value;
  const pair = $('#pairSelect').value;
  const weekId = Math.floor(Math.random() * 9000) + 1000;
  state.currentChallenge = { strategy, pair, weekId, trades: [] };
  $('#challengeInfo').textContent = `Week ${weekId} • ${strategy} on ${pair}`;
  switchView('challenge');
  persistAndRender();
}

function endWeek() {
  if (!state.currentChallenge) return;
  const trades = state.currentChallenge.trades;
  const weekPL = trades.reduce((a, t) => a + t.pl, 0);
  const wins = trades.filter(t => t.pl > 0).length;
  const losses = trades.filter(t => t.pl < 0).length;
  const sumProfit = trades.filter(t => t.pl > 0).reduce((a, t) => a + t.pl, 0);
  const sumLossAbs = Math.abs(trades.filter(t => t.pl < 0).reduce((a, t) => a + t.pl, 0));
  const pf = calcProfitFactor(sumProfit, sumLossAbs);
  const wr = (wins + losses) ? (wins / (wins + losses)) * 100 : 0;
  
  // Calculate additional weekly metrics
  const avgRMultiple = trades.length ? trades.reduce((a, t) => a + t.rMultiple, 0) / trades.length : 0;
  const gradeDistribution = {
    A: trades.filter(t => t.grade === 'A').length,
    B: trades.filter(t => t.grade === 'B').length,
    C: trades.filter(t => t.grade === 'C').length,
  };
  const ruleAdherence = trades.length ? (trades.filter(t => t.ruleFollowed).length / trades.length) * 100 : 0;
  const bestTrade = trades.reduce((best, t) => t.pl > best.pl ? t : best, { pl: -Infinity });
  const worstTrade = trades.reduce((worst, t) => t.pl < worst.pl ? t : worst, { pl: Infinity });
  
  state.reports.unshift({
    weekId: state.currentChallenge.weekId,
    strategy: state.currentChallenge.strategy,
    pair: state.currentChallenge.pair,
    weekPL,
    winRate: wr,
    pf,
    avgRMultiple,
    gradeDistribution,
    ruleAdherence,
    bestTrade: bestTrade.pl > -Infinity ? bestTrade : null,
    worstTrade: worstTrade.pl < Infinity ? worstTrade : null,
    totalTrades: trades.length,
  });
  
  // Reset weekly tracking
  state.account.weeklyPL = 0;
  if (weekPL > state.account.bestWeek) {
    state.account.bestWeek = weekPL;
    awardBadge('newBestWeek');
  }
  
  state.currentChallenge = null;
  $('#challengeInfo').textContent = 'No active challenge';
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
  const ruleFollowed = !!formData.get('ruleFollowed');
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

  // Win streak tracking (simplified - would need proper streak counter)
  if (pl > 0 && state.currentChallenge.trades.length >= 2) {
    const lastTwo = state.currentChallenge.trades.slice(0, 2);
    if (lastTwo.every(t => t.pl > 0)) awardBadge('winStreak3');
  }

  // Rule violations penalty
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
    rMultiple: parseFloat(rMultiple.toFixed(2)),
    pl,
  };
  state.currentChallenge.trades.unshift(trade);
  renderTrades();
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
}

// ---------- Events ----------
$('#startChallenge').addEventListener('click', startChallenge);
$('#endWeek').addEventListener('click', endWeek);

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
