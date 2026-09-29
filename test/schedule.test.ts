import { describe, it, expect } from 'vitest';
import { parseMatches, localDay } from '../src/schedule';
const competitor = (homeAway: string, score: string) => ({homeAway,score,team:{displayName:homeAway,abbreviation:homeAway,color:'004c54',alternateColor:'123abc',logo:'https://a.espncdn.com/i/teamlogos/nfl/500/phi.png'},linescores:[{value:7}]});
describe('score provider normalization',()=>{
 it('uses the competition clock and correct home/away scores',()=>{const [game]=parseMatches({events:[{id:'1',date:'2026-09-29T00:15:00Z',status:{type:{state:'pre'}},competitions:[{competitors:[competitor('home','14'),competitor('away','7')],status:{type:{state:'in',shortDetail:'2nd'},displayClock:'11:55',period:2}}]}]});expect(game.home.score).toBe('14');expect(game.away.score).toBe('7');expect(game.clock).toBe('11:55');expect(game.state).toBe('in');expect(game.home.quarters).toEqual(['7']);});
 it('rejects incomplete events and unsupported logo URLs',()=>{expect(parseMatches({events:[{id:'1',competitions:[{competitors:[]}]}]})).toEqual([]);const home=competitor('home','0');home.team.logo='javascript:alert(1)';home.team.color='red;display:none';const [g]=parseMatches({events:[{id:'2',competitions:[{competitors:[home,competitor('away','0')]}]}]});expect(g.home.logo).toBe('');expect(g.home.color).toBe('#345574');});
 it('handles off days and invalid dates',()=>{expect(parseMatches({events:[]})).toEqual([]);expect(localDay('invalid')).toBe('');expect(localDay('2026-09-29T12:00:00')).toBe('2026-09-29');});
});
