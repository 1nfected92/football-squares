import { mountSchedule } from './schedule';
type Role = 'admin' | 'player' | 'agent';
type Board = { id: number; status: 'DRAFT' | 'OPEN' | 'SOLD_OUT' | 'LOCKED' | 'FINAL' | 'CANCELLED'; price: number; sold: number; digits: boolean; settled: string[] };
type Deposit = { id: number; amount: number; status: 'PENDING' | 'APPROVED' | 'REJECTED' };
type Withdrawal = { id: number; amount: number; status: 'PENDING' | 'PAID' | 'REJECTED' };

const startingBoards = (): Board[] => [
  { id: 1, status: 'OPEN', price: 1000, sold: 0, digits: false, settled: [] },
  { id: 2, status: 'SOLD_OUT', price: 2500, sold: 100, digits: false, settled: [] },
  { id: 3, status: 'DRAFT', price: 5000, sold: 0, digits: false, settled: [] },
];
let boards = startingBoards(), role: Role | null = null, balance = 50000;
let squares: Array<{ board: number; row: number; col: number }> = [];
let deposits: Deposit[] = [], withdrawals: Withdrawal[] = [], nextId = 4, message = '';
let leave: () => void = () => {};
const usd = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const safe = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const boardLabel = (board: Board) => `Kansas City Chiefs at Buffalo Bills · ${usd(board.price)}`;

function boardGrid(board: Board) {
  return `<div class="grid-wrap"><div class="grid" role="grid" aria-label="Demo football squares board"><div class="corner">HOME ↓<br>AWAY →</div>${Array.from({ length: 10 }, (_, i) => `<div class="axis">${board.digits ? (i * 7) % 10 : '?'}</div>`).join('')}${Array.from({ length: 10 }, (_, row) => `<div class="axis">${board.digits ? (row * 3) % 10 : '?'}</div>${Array.from({ length: 10 }, (_, col) => { const mine = squares.some(s => s.board === board.id && s.row === row && s.col === col); const occupied = board.status === 'SOLD_OUT' || board.status === 'LOCKED' || board.status === 'FINAL'; return `<button class="cell ${mine ? 'mine' : occupied ? 'taken' : ''}" data-demo-action="buy" data-board-id="${board.id}" data-row="${row}" data-col="${col}" ${role !== 'player' || board.status !== 'OPEN' || mine || occupied ? 'disabled' : ''} aria-label="Row ${row + 1}, column ${col + 1}: ${mine ? 'yours' : occupied ? 'occupied' : 'available'}">${mine ? '★' : occupied ? '•' : row * 10 + col + 1}</button>`; }).join('')}`).join('')}</div></div>`;
}

function playerView() {
  return `<section class="summary"><div><small>TEST WALLET</small><strong>${usd(balance)}</strong></div><div><small>MY SQUARES</small><strong>${squares.length}</strong></div></section><section class="panel"><h2>Games & Boards</h2><p>Kansas City Chiefs at Buffalo Bills · Demo game</p>${boards.map(b => `<div class="admin-row"><span>${safe(boardLabel(b))} · ${b.sold}/100 · ${b.status}</span><button data-demo-action="view" data-board-id="${b.id}">View board</button></div>`).join('')}</section><section class="panel"><h2>My Squares</h2>${squares.map(s => `<div class="admin-row">Board ${s.board} · row ${s.row + 1}, column ${s.col + 1}<button data-demo-action="forfeit" data-board-id="${s.board}" data-row="${s.row}" data-col="${s.col}" ${boards.find(b => b.id === s.board)?.status !== 'OPEN' ? 'disabled' : ''}>Forfeit & refund</button></div>`).join('') || '<p>No squares yet.</p>'}</section><section class="panel"><h2>Request test withdrawal</h2><form data-demo-form="withdraw"><label>Amount ($)<input name="amount" type="number" min="0.01" step="0.01" required></label><button>Reserve withdrawal</button></form></section>`;
}

function adminView() {
  return `<section class="panel"><h2>Create board</h2><form data-demo-form="board"><label>Price ($)<input name="amount" type="number" min="0.01" step="0.01" required></label><button>Create draft</button></form></section><section class="panel"><h2>Boards</h2>${boards.map(b => `<div class="admin-row"><span>${safe(boardLabel(b))} · ${b.sold}/100 · ${b.status}</span><span><button data-demo-action="view" data-board-id="${b.id}">View</button> ${b.status === 'DRAFT' ? `<button data-demo-action="open" data-board-id="${b.id}">Open</button>` : ''} ${b.status === 'SOLD_OUT' ? `<button data-demo-action="draw" data-board-id="${b.id}">Draw digits</button>` : ''} ${b.status === 'OPEN' ? `<button data-demo-action="cancel" data-board-id="${b.id}">Cancel & refund</button>` : ''}</span></div>`).join('')}</section><section class="panel"><h2>Settle demo checkpoint</h2><form data-demo-form="settle"><label>Board<select name="board">${boards.filter(b => b.status === 'LOCKED').map(b => `<option value="${b.id}">Board ${b.id}</option>`).join('')}</select></label><label>Checkpoint<select name="checkpoint"><option>Q1</option><option>Q2</option><option>Q3</option><option>FINAL</option></select></label><label>Home score<input name="home" type="number" min="0" required></label><label>Away score<input name="away" type="number" min="0" required></label><button>Settle</button></form></section><section class="panel"><h2>Pending deposits</h2>${deposits.filter(d => d.status === 'PENDING').map(d => `<div class="admin-row">Player · ${usd(d.amount)}<span><button data-demo-action="deposit-approve" data-item-id="${d.id}">Approve</button> <button data-demo-action="deposit-reject" data-item-id="${d.id}">Reject</button></span></div>`).join('') || '<p>None pending.</p>'}<h2>Pending withdrawals</h2>${withdrawals.filter(w => w.status === 'PENDING').map(w => `<div class="admin-row">Player · ${usd(w.amount)}<span><button data-demo-action="withdraw-pay" data-item-id="${w.id}">Mark paid</button> <button data-demo-action="withdraw-reject" data-item-id="${w.id}">Reject</button></span></div>`).join('') || '<p>None pending.</p>'}</section>`;
}

function agentView() {
  return `<section class="panel"><h2>Record test deposit</h2><form data-demo-form="deposit"><label>Amount ($)<input name="amount" type="number" min="0.01" step="0.01" required></label><button>Send for admin approval</button></form></section><section class="panel"><h2>Pending withdrawals</h2>${withdrawals.filter(w => w.status === 'PENDING').map(w => `<div class="admin-row">Player · ${usd(w.amount)}<span><button data-demo-action="withdraw-pay" data-item-id="${w.id}">Mark paid</button> <button data-demo-action="withdraw-reject" data-item-id="${w.id}">Reject</button></span></div>`).join('') || '<p>None pending.</p>'}</section>`;
}

let selectedBoard: number | null = null;
export function renderDemo(app: HTMLDivElement, onLeave: () => void) {
  leave = onLeave;
  const selected = boards.find(b => b.id === selectedBoard);
  app.innerHTML = `<div class="shell"><nav><div class="brand">◆ <span>FOOTBALL</span> SQUARES</div><button data-demo-action="login">Live account sign in</button></nav><main><div class="heading"><div><p class="eyebrow">INTERACTIVE TEST MODE · NO LOGIN</p><h1>Football Squares</h1><p>Choose a role to explore. Actions use disposable test data in this browser.</p></div><button data-demo-action="reset">Reset demo</button></div><div class="role-picker">${(['admin', 'player', 'agent'] as const).map(r => `<button data-demo-action="role" data-role="${r}" class="${role === r ? 'active' : ''}">${r.toUpperCase()}</button>`).join('')}</div><div id="schedule-hub"></div>${message ? `<div class="notice" role="status">${safe(message)}</div>` : ''}${selected ? `<button class="back" data-demo-action="back">← Back</button><h2>${safe(boardLabel(selected))}</h2><p>${selected.status} · ${selected.sold}/100 sold · ${selected.settled.length} checkpoints settled</p>${boardGrid(selected)}` : role === 'player' ? playerView() : role === 'admin' ? adminView() : role === 'agent' ? agentView() : '<section class="panel"><h2>Select ADMIN, PLAYER, or AGENT</h2><p>Switch roles at any time to test the full demo flow.</p></section>'}</main><footer>Role actions use simulation data · Game center uses the ESPN score feed</footer></div>`;
  mountSchedule();
}

export function demoClick(target: HTMLElement, app: HTMLDivElement) {
  const action = target.dataset.demoAction;
  if (!action) return false;
  const board = boards.find(b => b.id === Number(target.dataset.boardId));
  const itemId = Number(target.dataset.itemId);
  message = '';
  if (action === 'login') { leave(); return true; }
  if (action === 'role') { role = target.dataset.role as Role; selectedBoard = null; }
  if (action === 'back') selectedBoard = null;
  if (action === 'view' && board) selectedBoard = board.id;
  if (action === 'reset') { boards = startingBoards(); squares = []; balance = 50000; deposits = []; withdrawals = []; nextId = 4; selectedBoard = null; message = 'Demo reset.'; }
  if (action === 'open' && role === 'admin' && board?.status === 'DRAFT') { board.status = 'OPEN'; message = 'Board opened.'; }
  if (action === 'draw' && role === 'admin' && board?.status === 'SOLD_OUT') { board.status = 'LOCKED'; board.digits = true; message = 'Home and away digits drawn.'; }
  if (action === 'cancel' && role === 'admin' && board?.status === 'OPEN') { board.status = 'CANCELLED'; balance += squares.filter(s => s.board === board.id).length * board.price; squares = squares.filter(s => s.board !== board.id); message = 'Board cancelled; player squares refunded.'; }
  if (action === 'buy' && role === 'player' && board?.status === 'OPEN') { const row = Number(target.dataset.row), col = Number(target.dataset.col); if (balance < board.price) message = 'Insufficient test funds.'; else if (!squares.some(s => s.board === board.id && s.row === row && s.col === col)) { balance -= board.price; board.sold++; squares.push({ board: board.id, row, col }); message = 'Square purchased with test funds.'; } }
  if (action === 'forfeit' && role === 'player' && board?.status === 'OPEN') { const row = Number(target.dataset.row), col = Number(target.dataset.col), before = squares.length; squares = squares.filter(s => !(s.board === board.id && s.row === row && s.col === col)); if (squares.length < before) { balance += board.price; board.sold--; message = 'Square forfeited and refunded.'; } }
  const deposit = deposits.find(d => d.id === itemId), withdrawal = withdrawals.find(w => w.id === itemId);
  if (action.startsWith('deposit-') && role === 'admin' && deposit?.status === 'PENDING') { deposit.status = action === 'deposit-approve' ? 'APPROVED' : 'REJECTED'; if (deposit.status === 'APPROVED') balance += deposit.amount; message = `Deposit ${deposit.status.toLowerCase()}.`; }
  if (action.startsWith('withdraw-') && (role === 'admin' || role === 'agent') && withdrawal?.status === 'PENDING') { withdrawal.status = action === 'withdraw-pay' ? 'PAID' : 'REJECTED'; if (withdrawal.status === 'REJECTED') balance += withdrawal.amount; message = `Withdrawal ${withdrawal.status.toLowerCase()}.`; }
  renderDemo(app, leave); return true;
}

export function demoSubmit(form: HTMLFormElement, app: HTMLDivElement) {
  const kind = form.dataset.demoForm;
  if (!kind) return false;
  const data = new FormData(form), amount = Math.round(Number(data.get('amount')) * 100);
  if (kind !== 'settle' && (!Number.isSafeInteger(amount) || amount <= 0)) { message = 'Enter a valid amount.'; renderDemo(app, leave); return true; }
  if (kind === 'board' && role === 'admin') { boards.push({ id: nextId++, status: 'DRAFT', price: amount, sold: 0, digits: false, settled: [] }); message = 'Draft board created.'; }
  if (kind === 'deposit' && role === 'agent') { deposits.push({ id: nextId++, amount, status: 'PENDING' }); message = 'Deposit sent for admin review.'; }
  if (kind === 'withdraw' && role === 'player') { if (amount > balance) message = 'Insufficient test funds.'; else { balance -= amount; withdrawals.push({ id: nextId++, amount, status: 'PENDING' }); message = 'Withdrawal reserved.'; } }
  if (kind === 'settle' && role === 'admin') { const board = boards.find(b => b.id === Number(data.get('board'))), checkpoint = String(data.get('checkpoint')); if (!board || board.status !== 'LOCKED') message = 'Draw digits on a sold-out board first.'; else if (board.settled.includes(checkpoint)) message = 'Checkpoint already settled.'; else { board.settled.push(checkpoint); if (checkpoint === 'FINAL') board.status = 'FINAL'; message = `${checkpoint} settled at ${data.get('home')}–${data.get('away')}.`; } }
  renderDemo(app, leave); return true;
}
