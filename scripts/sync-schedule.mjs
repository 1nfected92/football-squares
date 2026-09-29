import { writeFile } from 'node:fs/promises';
const season = Number(process.argv[2] || 2026);
const games = [], report=[];
for (const type of [2,3]) for (let week=1; week <= (type===2?18:4); week++) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=${type}&week=${week}&limit=100`;
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`${response.status} ${url}`);
  const data=await response.json();const events=data.events??[];
  report.push({type,week,count:events.length});
  for(const event of events){
    const competitors=event.competitions?.[0]?.competitors??[];
    const home=competitors.find(x=>x.homeAway==='home'),away=competitors.find(x=>x.homeAway==='away');
    if(!home||!away)continue;
    games.push({id:String(event.id),season,season_type:type,week,home_team:home.team?.displayName??'TBD',away_team:away.team?.displayName??'TBD',kickoff_at:event.date??null,status:event.status?.type?.state==='post'?'final':event.status?.type?.state==='in'?'live':'scheduled',period:event.status?.period??0,home_score:Number(home.score??0),away_score:Number(away.score??0),clock:event.status?.displayClock??null,linescores:{home:home.linescores??[],away:away.linescores??[]}});
  }
}
const unique=[...new Map(games.map(g=>[g.id,g])).values()];
await writeFile(new URL('../public/schedule.json',import.meta.url),JSON.stringify({season,generated_at:new Date().toISOString(),source:'ESPN public scoreboard',games:unique,coverage:report},null,2));
console.log(JSON.stringify({total:unique.length,coverage:report}));
