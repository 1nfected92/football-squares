import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import './style.css';

const endpoint = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const client: SupabaseClient | null = endpoint && key ? createClient(endpoint, key) : null;
const app = document.querySelector<HTMLDivElement>('#app')!;
type Game = {id:string;season:number;season_type:number;week:number;home_team:string;away_team:string;kickoff_at:string|null;status:string;period:number;home_score:number;away_score:number;clock:string|null};
type Board = {id:string;game_id:string;status:string;price_cents:number;sold_count:number;home_digits:number[]|null;away_digits:number[]|null;commission_bps:number};
type Square = {id:string;board_id:string;row_index:number;col_index:number;owner_id:string};
type Profile = {id:string;display_name:string;role:'player'|'agent'|'admin'};
let userId:string|null=null, profile:Profile|null=null, games:Game[]=[], boards:Board[]=[], squares:Square[]=[], selected:string|null=null, view='games', notice='', balance=0;
let selectedWeek:number|null=null;
let lastSync=0;
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
const date=(d:string|null)=>d?new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short'}).format(new Date(d)):'Kickoff TBD';
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const id=()=>crypto.randomUUID();
function message(s:string){notice=s;render();}
async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T|null>{
 if(!client)return null; const {data,error}=await client.rpc(name,args); if(error){message(error.message);return null;} await refresh(); return data as T;
}
async function refresh(){
 if(!client)return render();
 const {data:{user}}=await client.auth.getUser(); userId=user?.id??null;
 if(userId){
  const [p,g,b,s,l]=await Promise.all([
   client.from('profiles').select('id,display_name,role').eq('id',userId).single(),
   client.from('games').select('id,season,season_type,week,home_team,away_team,kickoff_at,status,period,home_score,away_score,clock').order('kickoff_at',{ascending:true}).limit(300),
   client.from('boards').select('id,game_id,status,price_cents,sold_count,home_digits,away_digits,commission_bps').limit(500),
   client.from('squares').select('id,board_id,row_index,col_index,owner_id').limit(5000),
   client.from('ledger').select('amount_cents').eq('user_id',userId)
  ]);
  profile=p.data as Profile|null; games=g.data??[];boards=b.data??[];squares=s.data??[];
  balance=(l.data??[]).reduce((n,x)=>n+Number(x.amount_cents),0);
  for(const result of [p,g,b,s,l])if(result.error)notice=result.error.message;
 } else {profile=null;games=[];boards=[];squares=[];balance=0;}
 if(selectedWeek===null&&games.length){selectedWeek=games.filter(g=>g.season_type===2&&g.kickoff_at&&Date.parse(g.kickoff_at)>Date.now()).sort((a,b)=>Date.parse(a.kickoff_at!)-Date.parse(b.kickoff_at!))[0]?.week??1;}
 render();
}
function visibleGames(){return games.filter(g=>g.season_type===2&&g.week===selectedWeek).filter(g=>!teamFilter||`${g.home_team} ${g.away_team}`.toLowerCase().includes(teamFilter));}
let teamFilter='';
async function syncCurrent(){
 if(!client||!userId||Date.now()-lastSync<30000)return;
 const current=games.filter(g=>g.season_type===2&&g.kickoff_at).sort((a,b)=>Math.abs(Date.parse(a.kickoff_at!)-Date.now())-Math.abs(Date.parse(b.kickoff_at!)-Date.now()))[0];
 if(!current)return;
 lastSync=Date.now();
 const {error}=await client.functions.invoke('sync-scores',{body:{season:current.season,type:current.season_type,week:current.week}});
 if(error)console.warn('Score refresh unavailable',error.message);
}
function gameCard(g:Game){
 const b=boards.filter(x=>x.game_id===g.id);
 return `<article class="game"><div class="game-top"><span class="status ${esc(g.status)}">${esc(g.status)}</span><span>${esc(date(g.kickoff_at))}</span></div><div class="match"><div>${esc(g.away_team)}<small>AWAY</small></div><strong>${g.status==='scheduled'?'VS':`${g.away_score} : ${g.home_score}`}</strong><div>${esc(g.home_team)}<small>HOME</small></div></div><p class="secondary">${g.status==='live'?`Q${g.period} · ${esc(g.clock||'Clock unavailable')}`:`${b.length} board${b.length===1?'':'s'}`}</p><div class="tiers">${b.map(x=>`<button data-board="${esc(x.id)}">${money(x.price_cents)} · ${x.sold_count}/100 <span>${esc(x.status)}</span></button>`).join('')||'<span class="secondary">No boards open</span>'}</div></article>`;
}
function boardView(b:Board){
 const g=games.find(x=>x.id===b.game_id); if(!g)return '<p>Game unavailable.</p>';
 const owned=squares.filter(x=>x.board_id===b.id), mine=owned.filter(x=>x.owner_id===userId);
 const ended=g.status==='final'||g.status==='cancelled';
 return `<button class="back" data-view="games">← Games</button><header class="board-head"><div><span class="status ${esc(b.status.toLowerCase())}">${esc(b.status)}</span><h1>${esc(g.away_team)} <em>at</em> ${esc(g.home_team)}</h1><p>${esc(date(g.kickoff_at))} · ${esc(g.status)} ${g.status==='live'?`Q${g.period} ${esc(g.clock||'')}`:''}</p></div><div class="score">${g.away_score}<span>:</span>${g.home_score}</div></header><section class="summary"><div><small>PRICE</small><strong>${money(b.price_cents)}</strong></div><div><small>FILLED</small><strong>${b.sold_count}/100</strong></div><div><small>YOUR SQUARES</small><strong>${mine.length}</strong></div><div><small>POT</small><strong>${money(b.price_cents*100)}</strong></div></section><p class="hint">Rows: home last digit · Columns: away last digit. Numbers reveal after sellout.</p><div class="grid-wrap"><div class="grid" role="grid" aria-label="Football squares board"><div class="corner">HOME ↓<br>AWAY →</div>${Array.from({length:10},(_,c)=>`<div class="axis">${b.away_digits?.[c]??'?'}</div>`).join('')}${Array.from({length:10},(_,r)=>`<div class="axis">${b.home_digits?.[r]??'?'}</div>${Array.from({length:10},(_,c)=>{const sq=owned.find(x=>x.row_index===r&&x.col_index===c);return `<button class="cell ${sq?'taken':''} ${sq?.owner_id===userId?'mine':''}" ${sq||b.status!=='OPEN'||ended||profile?.role!=='player'?'disabled':''} data-row="${r}" data-col="${c}" data-buy="${esc(b.id)}" aria-label="Row ${r+1}, column ${c+1}: ${sq?(sq.owner_id===userId?'yours':'occupied'):'available'}">${sq?(sq.owner_id===userId?'★':'•'):r*10+c+1}</button>`}).join('')}`).join('')}</div></div>${ended?'<div class="ended">GAME OVER · SALES CLOSED</div>':''}<p class="hint">${mine.length?`Invested: ${money(mine.length*b.price_cents)}. Select My Squares for refund eligibility.`:'Choose an available square to purchase with test funds.'}</p>`;
}
function walletView(){return `<h1>Wallet</h1><section class="summary"><div><small>AVAILABLE</small><strong>${money(balance)}</strong></div></section><h2>Request cashout</h2><form id="cashout"><label>Amount in dollars<input name="amount" type="number" min="0.01" step="0.01" required></label><button type="submit">Reserve withdrawal</button></form><p class="hint">Demo/test funds only. Withdrawal requests require agent or admin resolution.</p>`;}
function mineView(){const mine=squares.filter(x=>x.owner_id===userId);return `<h1>My Squares</h1><p>${mine.length} squares · ${new Set(mine.map(x=>x.board_id)).size} boards</p><div class="cards">${mine.map(s=>{const b=boards.find(x=>x.id===s.board_id),g=games.find(x=>x.id===b?.game_id);return `<article class="game"><strong>${esc(g?.away_team)} at ${esc(g?.home_team)}</strong><p>Square ${s.row_index+1}, ${s.col_index+1} · ${money(b?.price_cents??0)}</p><button data-board="${esc(s.board_id)}">View board</button> <button data-forfeit="${esc(s.id)}" ${b?.status==='OPEN'&&g?.status==='scheduled'?'':'disabled'}>Forfeit & refund</button></article>`}).join('')||'<p>No squares purchased.</p>'}</div>`;}
function adminView(){return `<h1>Admin control center</h1><p class="hint">Boards, deposits, withdrawals and checkpoint settlement require admin authorization.</p><section class="panel"><h2>Create board</h2><form id="board-create"><label>Game<select name="game">${games.filter(g=>g.status==='scheduled').map(g=>`<option value="${esc(g.id)}">${esc(g.away_team)} at ${esc(g.home_team)}</option>`).join('')}</select></label><label>Price ($)<input name="price" type="number" min="0.01" step="0.01" required></label><label>Commission (%)<input name="fee" type="number" min="0" max="100" step="0.01" value="10" required></label><button>Create draft</button></form></section><section class="panel"><h2>Boards</h2>${boards.map(b=>{const g=games.find(x=>x.id===b.game_id);return `<div class="admin-row"><span>${esc(g?.away_team)} at ${esc(g?.home_team)} · ${money(b.price_cents)} · ${b.sold_count}/100 · ${esc(b.status)}</span><span><button data-board="${esc(b.id)}">View</button> ${b.status==='DRAFT'?`<button data-open="${esc(b.id)}">Open</button>`:''}${b.status==='SOLD_OUT'?`<button data-draw="${esc(b.id)}">Draw digits</button>`:''}${b.status==='OPEN'&&(g?.period??0)>1?`<button data-cancel="${esc(b.id)}">Cancel & refund</button>`:''}</span></div>`}).join('')}</section><section class="panel"><h2>Settle checkpoint</h2><form id="settle"><label>Board<select name="board">${boards.filter(b=>['LOCKED','LIVE','FINAL'].includes(b.status)).map(b=>`<option value="${esc(b.id)}">${esc(b.id)} · ${esc(games.find(g=>g.id===b.game_id)?.home_team)}</option>`).join('')}</select></label><label>Checkpoint<select name="checkpoint"><option>Q1</option><option>Q2</option><option>Q3</option><option>FINAL</option></select></label><label>Home cumulative<input name="home" type="number" min="0" required></label><label>Away cumulative<input name="away" type="number" min="0" required></label><button>Confirm settlement</button></form></section><section class="panel"><h2>Pending deposits & withdrawals</h2><div id="pending">Loading…</div></section>`;}
function agentView(){return `<h1>Agent desk</h1><section class="panel"><h2>Record cash deposit</h2><form id="deposit"><label>Player ID<input name="player" type="text" required></label><label>Amount ($)<input name="amount" type="number" min="0.01" step="0.01" required></label><button>Submit for admin review</button></form></section><section class="panel"><h2>Pending withdrawals</h2><div id="pending">Loading…</div></section>`;}
function render(){
 app.innerHTML=`<div class="shell"><nav><div class="brand">◆ <span>FOOTBALL</span> SQUARES</div>${userId?`<div class="navlinks">${profile?.role==='player'?'<button data-view="games">Games</button><button data-view="mine">My Squares</button><button data-view="wallet">Wallet</button>':''}${profile?.role==='admin'?'<button data-view="admin">Admin</button>':''}${profile?.role==='agent'?'<button data-view="agent">Agent Desk</button>':''}<span>${esc(profile?.display_name||'Account')}</span><button id="signout">Sign out</button></div>`:''}</nav>${notice?`<div class="notice" role="status">${esc(notice)} <button id="dismiss" aria-label="Dismiss">×</button></div>`:''}<main>${!client?'<div class="hero"><h1>Football Squares</h1><p>Configuration required. Connect a dedicated Supabase project to enable the dashboard.</p></div>':!userId?`<div class="hero"><h1>Football Squares</h1><p>Follow the NFL schedule and join a board with test funds.</p><form id="signin"><label>Email<input name="email" type="email" required autocomplete="email"></label><label>Password<input name="password" type="password" minlength="8" required autocomplete="current-password"></label><button name="action" value="signin">Sign in</button><button name="action" value="signup">Create player account</button></form><p class="hint">Demo/test funds only. New player accounts receive $500 in test funds.</p></div>`:!profile?'<p>Account profile pending. Contact the operator.</p>':selected?boardView(boards.find(b=>b.id===selected)!):profile.role==='admin'?adminView():profile.role==='agent'?agentView():view==='wallet'?walletView():view==='mine'?mineView():`<div class="heading"><div><p class="eyebrow">2026 SEASON · WEEK ${selectedWeek}</p><h1>Games & Boards</h1></div><input id="search" type="search" value="${esc(teamFilter)}" placeholder="Search team" aria-label="Search team"></div><div class="week-tabs" aria-label="NFL week">${Array.from({length:18},(_,i)=>`<button data-week="${i+1}" class="${selectedWeek===i+1?'active':''}">Week ${i+1}</button>`).join('')}</div><div class="cards" id="games">${visibleGames().map(gameCard).join('')||'<p>No games match.</p>'}</div>`}</main><footer>Demo/test funds only · Scores from ESPN public feed · © Football Squares</footer></div>`;
 if(userId&&profile?.role==='admin'||userId&&profile?.role==='agent')void pending();
}
async function pending(){if(!client)return;const [d,w]=await Promise.all([client.from('deposits').select('id,player_id,amount_cents,status').eq('status','PENDING'),client.from('withdrawals').select('id,player_id,amount_cents,status').eq('status','PENDING')]);const el=document.querySelector('#pending');if(!el)return;el.innerHTML=`${profile?.role==='admin'?`<h3>Deposits</h3>${(d.data??[]).map(x=>`<div class="admin-row">${esc(x.player_id)} · ${money(x.amount_cents)} <span><button data-deposit-id="${esc(x.id)}" data-decision="true">Approve</button><button data-deposit-id="${esc(x.id)}" data-decision="false">Reject</button></span></div>`).join('')||'<p>None pending.</p>'}`:''}<h3>Withdrawals</h3>${(w.data??[]).map(x=>`<div class="admin-row">${esc(x.player_id)} · ${money(x.amount_cents)} <span><button data-withdrawal-id="${esc(x.id)}" data-decision="true">Mark paid</button><button data-withdrawal-id="${esc(x.id)}" data-decision="false">Reject</button></span></div>`).join('')||'<p>None pending.</p>'}`;}
function cents(value:string){const n=Number(value);if(!Number.isFinite(n)||n<=0||!Number.isSafeInteger(Math.round(n*100)))throw new Error('Invalid amount');return Math.round(n*100);}
app.addEventListener('click',async e=>{const t=(e.target as HTMLElement).closest<HTMLElement>('button');if(!t)return;
 if(t.id==='dismiss'){notice='';render();return;} if(t.id==='signout'){await client?.auth.signOut();selected=null;await refresh();return;}
 if(t.dataset.view){selected=null;view=t.dataset.view;render();return;}
 if(t.dataset.week){selectedWeek=Number(t.dataset.week);teamFilter='';render();return;}
 if(t.dataset.board){selected=t.dataset.board;render();return;}
 if(t.dataset.buy){if(!confirm(`Purchase square for ${money(boards.find(b=>b.id===t.dataset.buy)!.price_cents)} in test funds?`))return;await rpc('purchase_square',{p_board:t.dataset.buy,p_row:Number(t.dataset.row),p_col:Number(t.dataset.col),p_key:id()});return;}
 if(t.dataset.forfeit){if(confirm('Forfeit this square and refund the full price?'))await rpc('forfeit_square',{p_square:t.dataset.forfeit});return;}
 if(t.dataset.open){await rpc('open_board',{p_board:t.dataset.open});return;}
 if(t.dataset.draw){await rpc('draw_numbers',{p_board:t.dataset.draw});return;}
 if(t.dataset.cancel){if(confirm('Cancel the board and refund every square?'))await rpc('cancel_board',{p_board:t.dataset.cancel});return;}
 if(t.dataset.depositId){await rpc('resolve_deposit',{p_id:t.dataset.depositId,p_approve:t.dataset.decision==='true'});return;}
 if(t.dataset.withdrawalId){await rpc('resolve_withdrawal',{p_id:t.dataset.withdrawalId,p_approve:t.dataset.decision==='true'});return;}
});
app.addEventListener('submit',async e=>{e.preventDefault();const form=e.target as HTMLFormElement, data=new FormData(form);try{
 if(form.id==='signin'){const credentials={email:String(data.get('email')),password:String(data.get('password'))};const action=(e as SubmitEvent).submitter as HTMLButtonElement;if(action.value==='signup'){const {error}=await client!.auth.signUp({...credentials,options:{emailRedirectTo:new URL(import.meta.env.BASE_URL,location.origin).href}});if(error)throw error;message('Account created. Check your email if confirmation is required.');}else{const {error}=await client!.auth.signInWithPassword(credentials);if(error)throw error;await refresh();}}
 if(form.id==='cashout')await rpc('request_withdrawal',{p_amount:cents(String(data.get('amount'))),p_key:id()});
 if(form.id==='deposit')await rpc('record_deposit',{p_player:String(data.get('player')),p_amount:cents(String(data.get('amount')))});
 if(form.id==='board-create')await rpc('create_board',{p_game:String(data.get('game')),p_price:cents(String(data.get('price'))),p_commission:Math.round(Number(data.get('fee'))*100)});
 if(form.id==='settle')await rpc('settle_checkpoint',{p_board:String(data.get('board')),p_checkpoint:String(data.get('checkpoint')),p_home:Number(data.get('home')),p_away:Number(data.get('away'))});
 }catch(error){message(error instanceof Error?error.message:'Request failed');}});
app.addEventListener('input',e=>{const t=e.target as HTMLInputElement;if(t.id==='search'){teamFilter=t.value.trim().toLowerCase();document.querySelector('#games')!.innerHTML=visibleGames().map(gameCard).join('')||'<p>No games match.</p>';}});
if(client){client.auth.onAuthStateChange(()=>{setTimeout(()=>void refresh(),0)});setInterval(()=>{if(userId)void syncCurrent().then(refresh)},60000);} void refresh();
