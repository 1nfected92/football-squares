import './schedule.css';

type Team = { name: string; short: string; color: string; accent: string; logo: string; score: string; record: string; quarters: string[] };
export type Match = { id: string; date: string; home: Team; away: Team; state: string; detail: string; clock: string; period: number; venue: string; broadcast: string; situation: string; lastPlay: string };
const esc = (x: unknown) => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const color = (x: unknown) => typeof x === 'string' && /^[\da-f]{6}$/i.test(x) ? `#${x}` : '#345574';
const logo = (x: unknown) => typeof x === 'string' && /^https:\/\/a\.espncdn\.com\//.test(x) ? x : '';
export function parseMatches(feed: any): Match[] {
  return (Array.isArray(feed?.events) ? feed.events : []).flatMap((e: any) => {
    const c = e.competitions?.[0], competitors = c?.competitors;
    if (!Array.isArray(competitors)) return [];
    const h = competitors.find((x: any) => x.homeAway === 'home'), a = competitors.find((x: any) => x.homeAway === 'away');
    if (!h || !a || !e.id) return [];
    const team = (x: any): Team => ({ name: x.team?.displayName || 'TBD', short: x.team?.abbreviation || 'TBD', color: color(x.team?.color), accent: color(x.team?.alternateColor), logo: logo(x.team?.logo), score: String(x.score ?? '0'), record: x.records?.find((r: any) => r.type === 'total')?.summary || '', quarters: (x.linescores || []).map((q: any) => String(q.displayValue ?? q.value ?? '—')) });
    const status = c.status || e.status || {};
    return [{ id: String(e.id), date: e.date || '', home: team(h), away: team(a), state: status.type?.state || 'pre', detail: status.type?.shortDetail || status.type?.description || 'Scheduled', clock: status.displayClock || '', period: status.period || 0, venue: c.venue?.fullName || 'Venue TBD', broadcast: (c.broadcasts || []).flatMap((b: any) => b.names || []).join(' · '), situation: c.situation?.downDistanceText || '', lastPlay: c.situation?.lastPlay?.text || '' }];
  });
}
export function localDay(date: string) { const d = new Date(date); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function staticMatches(data: any): Match[] {
  return (Array.isArray(data?.games) ? data.games : []).map((g: any) => {
    const team = (name: string, score: unknown, lines: any[]): Team => ({ name, short: name.split(/\s+/).map(x => x[0]).join('').slice(-3).toUpperCase(), color: '#345574', accent: '#c59b4a', logo: '', score: String(score ?? '0'), record: '', quarters: (lines || []).map((q: any) => String(q.displayValue ?? q.value ?? '—')) });
    return { id: String(g.id), date: g.kickoff_at || '', home: team(g.home_team || 'Home', g.home_score, g.linescores?.home), away: team(g.away_team || 'Away', g.away_score, g.linescores?.away), state: g.status === 'final' ? 'post' : g.status === 'live' ? 'in' : 'pre', detail: g.status === 'final' ? 'Final' : g.status === 'live' ? 'In Progress' : 'Scheduled', clock: g.clock || '', period: Number(g.period || 0), venue: 'Venue details unavailable', broadcast: '', situation: '', lastPlay: '' };
  });
}
const when = (value: string) => Number.isNaN(Date.parse(value)) ? 'Time TBD' : new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));
function kickoffCountdown(value: string) {
  const remaining = Date.parse(value) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return 'Starting soon';
  if (remaining >= 24 * 60 * 60 * 1000) { const days = Math.ceil(remaining / (24 * 60 * 60 * 1000)); return `in ${days} day${days === 1 ? '' : 's'}`; }
  const totalSeconds = Math.floor(remaining / 1000), hours = Math.floor(totalSeconds / 3600), minutes = Math.floor((totalSeconds % 3600) / 60), seconds = totalSeconds % 60;
  return `in ${hours ? `${hours}h ` : ''}${String(minutes).padStart(2,'0')}m ${String(seconds).padStart(2,'0')}s`;
}
let year = new Date().getFullYear(), seasonType = 2, week = 1, chosenDate = '', chosenGame = '', search = '', mode = 'current';
let matches: Match[] = [], loading = false, failure = '', updated = '', requestId = 0, started = false;
let controller: AbortController | null = null;
const weekCount = () => seasonType === 2 ? 18 : seasonType === 1 ? 4 : 5;
const weekName = (n: number) => seasonType === 3 ? ['Wild Card','Divisional','Conference','Pro Bowl','Super Bowl'][n-1] : `Week ${n}`;
function helmet(team: Team, side: string) {
  return `<div class="helmet ${side}" style="--team:${team.color};--accent:${team.accent}"><svg viewBox="0 0 230 180" aria-hidden="true"><path class="helmet-shell" d="M25 118C6 53 47 14 104 14c59 0 91 39 88 83l-28 8-5 42-29 12-33-22-45 4Z"/><path class="helmet-shine" d="M35 76C44 27 113 11 158 47"/><path class="helmet-stripe" d="M99 15c45 8 68 38 72 76"/><path class="helmet-mask" d="m172 94 40 11-6 49-57 3-17-19m35-23 40 9m-40 13 40 1m-28-38-1 49"/><circle cx="135" cy="117" r="12" fill="#132238" stroke="#a3b8cc" stroke-width="5"/></svg>${team.logo ? `<img src="${esc(team.logo)}" alt="${esc(team.name)} logo" loading="lazy" referrerpolicy="no-referrer">` : `<span>${esc(team.short)}</span>`}</div>`;
}
function card(g: Match, index: number, expanded = false) {
  const live = g.state === 'in', pre = g.state === 'pre';
  return `<article class="match-card ${live ? 'is-live' : ''} ${expanded ? 'expanded' : ''}" style="--away:${g.away.color};--home:${g.home.color};--delay:${Math.min(index,8)*45}ms"><div class="match-meta"><span class="match-status ${live ? 'live-badge' : ''}">${live ? '● LIVE' : g.state === 'post' ? 'FINAL' : esc(g.detail)}</span><span>${esc(when(g.date))}</span></div><div class="helmet-match"><div class="team-face">${helmet(g.away,'away')}<span class="team-abbr">${esc(g.away.short)}</span><h3>${esc(g.away.name)}</h3><small>AWAY ${esc(g.away.record)}</small></div><div class="match-score">${pre ? '<strong class="versus">VS</strong>' : `<strong>${esc(g.away.score)}<i>:</i>${esc(g.home.score)}</strong>`}<span class="game-clock">${live ? `${g.period > 4 ? 'OT' : `Q${g.period}`} · ${esc(g.clock || 'Clock unavailable')}` : pre ? `<span class="kickoff-label">KICKOFF <b data-kickoff="${esc(g.date)}">${kickoffCountdown(g.date)}</b></span>` : esc(g.detail)}</span>${live && g.situation ? `<small>${esc(g.situation)}</small>` : ''}</div><div class="team-face">${helmet(g.home,'home')}<span class="team-abbr">${esc(g.home.short)}</span><h3>${esc(g.home.name)}</h3><small>HOME ${esc(g.home.record)}</small></div></div><div class="match-foot"><span>${esc(g.venue)}${g.broadcast ? ` · ${esc(g.broadcast)}` : ''}</span><span class="game-actions"><button type="button" data-open-boards="${esc(g.id)}">Open active boards</button><button type="button" data-match="${esc(g.id)}">${expanded ? 'Show all games' : 'Game details'} ↗</button></span></div>${expanded ? `<div class="game-detail"><h3>Score by quarter</h3><div class="quarter-scroll"><table><thead><tr><th>Team</th>${Array.from({length:Math.max(4,g.home.quarters.length,g.away.quarters.length)},(_,i)=>`<th>${i<4?`Q${i+1}`:'OT'}</th>`).join('')}<th>Total</th></tr></thead><tbody>${[g.away,g.home].map(t=>`<tr><th>${esc(t.short)}</th>${Array.from({length:Math.max(4,g.home.quarters.length,g.away.quarters.length)},(_,i)=>`<td>${esc(t.quarters[i] ?? '—')}</td>`).join('')}<td>${pre?'—':esc(t.score)}</td></tr>`).join('')}</tbody></table></div>${g.lastPlay ? `<p><b>Latest play</b> ${esc(g.lastPlay)}</p>` : ''}<p>${pre?'Scores appear when the game starts.':live?'Game clock is reported by the score provider; it may pause or be delayed.':'Completed game.'}</p></div>` : ''}</article>`;
}
function draw() {
  const host = document.querySelector<HTMLElement>('#schedule-hub'); if (!host) return;
  const visible = matches.filter(g => (!chosenDate || localDay(g.date) === chosenDate) && (!search || `${g.home.name} ${g.away.name}`.toLowerCase().includes(search)));
  const filtered = chosenGame ? visible.filter(g => g.id === chosenGame) : visible;
  host.innerHTML = `<section class="schedule-hub" aria-label="NFL schedule and scores"><div class="stadium-glow"></div><header class="schedule-heading"><div><p class="eyebrow">NFL GAME CENTER</p><h2>EVERY GAME.<br><span>EVERY MOMENT.</span></h2><p>Pick your matchup. Follow the action.</p></div><div class="feed-status"><span class="feed-dot ${failure?'offline':''}"></span>${loading ? 'Updating scores…' : failure ? 'Feed unavailable' : updated ? 'ESPN score feed' : 'Connecting…'}<small>${updated ? `Updated ${esc(updated)}` : 'Automatic refresh every 30 seconds'}</small><button type="button" data-schedule-refresh ${loading?'disabled':''}>↻ Refresh</button></div></header><div class="schedule-filters"><label>Season<select data-filter="year">${Array.from({length:Math.max(1,new Date().getFullYear()+2-2020)},(_,i)=>2020+i).map(y=>`<option ${year===y?'selected':''}>${y}</option>`).join('')}</select></label><label>Stage<select data-filter="type"><option value="1" ${seasonType===1?'selected':''}>Preseason</option><option value="2" ${seasonType===2?'selected':''}>Regular season</option><option value="3" ${seasonType===3?'selected':''}>Postseason</option></select></label><label>Week<select data-filter="week">${Array.from({length:weekCount()},(_,i)=>`<option value="${i+1}" ${week===i+1?'selected':''}>${weekName(i+1)}</option>`).join('')}</select></label><label>Choose date<input data-filter="date" type="date" value="${chosenDate}"></label><label>Game<select data-filter="game"><option value="">All games</option>${visible.map(g=>`<option value="${esc(g.id)}" ${g.id===chosenGame?'selected':''}>${esc(g.away.short)} at ${esc(g.home.short)}</option>`).join('')}</select></label><button type="button" data-schedule-current>Current week</button></div><div class="schedule-summary"><span>${chosenDate ? esc(chosenDate) : `${year} · ${weekName(week)}`} <b>${visible.length} games</b></span><span>Times in ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}</span></div>${failure?`<p class="feed-warning" role="status">${esc(failure)}${matches.length?' Showing the last received scores; they may be out of date.':''}</p>`:''}<div class="match-cards ${chosenGame?'single-match':''}">${filtered.map((g,i)=>card(g,i,!!chosenGame)).join('') || `<div class="schedule-empty">${loading?'Loading matchups…':'No games scheduled for this selection. Choose another date or week.'}</div>`}</div><p class="feed-note">ESPN public scoreboard · Refreshes every 30 seconds while this page is visible. Availability and score delays depend on the provider.</p></section>`;
  host.onchange = e => { const t = e.target as HTMLInputElement; const key=t.dataset.filter; if(!key)return; if(key==='game'){chosenGame=t.value;draw();return;} chosenGame='';matches=[]; if(key==='date'){chosenDate=t.value;mode=chosenDate?'date':'week';} else {chosenDate='';mode='week';if(key==='year')year=Number(t.value);if(key==='type'){seasonType=Number(t.value);week=1;}if(key==='week')week=Number(t.value);} void load(); };
  host.onclick = e => { const t=(e.target as HTMLElement).closest<HTMLElement>('button');if(!t)return; if(t.dataset.openBoards){const game=matches.find(g=>g.id===t.dataset.openBoards);if(game)window.dispatchEvent(new CustomEvent('football-game-selected',{detail:{id:game.id,away:game.away.name,home:game.home.name}}));return;}if(t.dataset.match){chosenGame=chosenGame===t.dataset.match?'':t.dataset.match;draw();}if(t.hasAttribute('data-schedule-refresh'))void load();if(t.hasAttribute('data-schedule-current')){mode='current';chosenDate='';chosenGame='';matches=[];void load();} };
}
async function load() {
  const id=++requestId;controller?.abort();controller=new AbortController();const signal=controller.signal;loading=true;failure='';draw();
  const timeout=setTimeout(()=>controller?.signal===signal&&controller.abort(),15000);
  try {
    const query=new URLSearchParams({limit:'100'});
    if(mode==='week'){query.set('dates',String(year));query.set('seasontype',String(seasonType));query.set('week',String(week));}
    if(mode==='date'){query.set('dates',chosenDate.replaceAll('-',''));query.set('limit','100');}
    const res=await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?${query}`,{signal});if(!res.ok)throw new Error('Score provider unavailable');const feed=await res.json();if(!Array.isArray(feed.events))throw new Error('Invalid scoreboard response');if(id!==requestId)return;
    if(mode==='current'){year=feed.season?.year||year;seasonType=Number(feed.season?.type)||2;week=Number(feed.week?.number)||1;mode='week';clearTimeout(timeout);await load();return;}
    matches=parseMatches(feed);updated=new Date().toLocaleTimeString();
  } catch(error) {
    if(id!==requestId)return;
    if(mode==='date') {
      try { const fallback=await fetch(`${import.meta.env.BASE_URL}schedule.json`,{signal}); const data=await fallback.json(); matches=staticMatches(data).filter(g=>localDay(g.date)===chosenDate); failure=matches.length?'Live date feed unavailable; showing the saved schedule.':'No games found for this date.'; }
      catch { failure=error instanceof Error&&error.name==='AbortError'?'Score request timed out. Try Refresh.':'Cannot reach the score provider. Try Refresh.'; }
    } else failure=error instanceof Error&&error.name==='AbortError'?'Score request timed out. Try Refresh.':'Cannot reach the score provider. Try Refresh.';
  }
  finally{clearTimeout(timeout);if(id===requestId){loading=false;draw();}}
}
export function mountSchedule() {
  draw();if(started)return;started=true;void load();setInterval(()=>{if(!document.hidden&&document.querySelector('#schedule-hub')&&!loading)void load();},30000);
  setInterval(()=>{if(document.hidden)return;document.querySelectorAll<HTMLElement>('[data-kickoff]').forEach(el=>{el.textContent=kickoffCountdown(el.dataset.kickoff||'');});},1000);
}
