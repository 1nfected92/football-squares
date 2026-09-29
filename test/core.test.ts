import { describe, expect, it } from 'vitest';
import { allocate, drawDigits, winningCell, canPurchase } from '../src/core/rules';

describe('financial and fairness rules', () => {
  it('reconciles every cent for odd pots and commission basis points', () => {
    for (let pot = 1; pot <= 10001; pot += 37) {
      for (let bps = 0; bps <= 5000; bps += 137) {
        const a = allocate(pot, bps);
        expect(a.reduce((n, x) => n + x.gross, 0)).toBe(pot);
        expect(a.reduce((n, x) => n + x.net + x.commission, 0)).toBe(pot);
        expect(a.every(x => Number.isSafeInteger(x.net) && x.net >= 0)).toBe(true);
      }
    }
  });
  it('draws independent permutations', () => {
    for (let i = 0; i < 100; i++) {
      const { home, away } = drawDigits();
      expect([...home].sort()).toEqual([0,1,2,3,4,5,6,7,8,9]);
      expect([...away].sort()).toEqual([0,1,2,3,4,5,6,7,8,9]);
    }
  });
  it('uses cumulative last digits with home rows', () => {
    expect(winningCell({home: 27, away: 34}, [0,1,2,3,4,5,6,7,8,9], [0,1,2,3,4,5,6,7,8,9])).toEqual({row:7,col:4});
  });
  it('closes sales after Q1 and for past games', () => {
    expect(canPurchase('OPEN', 'scheduled', 0, 99)).toBe(true);
    expect(canPurchase('OPEN', 'live', 1, 99)).toBe(true);
    expect(canPurchase('OPEN', 'live', 2, 99)).toBe(false);
    expect(canPurchase('OPEN', 'final', 4, 99)).toBe(false);
    expect(canPurchase('LOCKED', 'scheduled', 0, 99)).toBe(false);
    expect(canPurchase('OPEN', 'scheduled', 0, 100)).toBe(false);
  });
});
