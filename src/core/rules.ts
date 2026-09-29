export type Checkpoint = 'Q1' | 'Q2' | 'Q3' | 'FINAL';
export type Allocation = { checkpoint: Checkpoint; gross: number; commission: number; net: number };
export const CHECKPOINTS: readonly Checkpoint[] = ['Q1', 'Q2', 'Q3', 'FINAL'];

export function allocate(potCents: number, commissionBps: number): Allocation[] {
  if (!Number.isSafeInteger(potCents) || potCents < 0 || !Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10000) throw new RangeError('Invalid pot or commission');
  const gross = [0, 1, 2].map(() => Math.floor(potCents / 5));
  gross.push(potCents - gross.reduce((a, b) => a + b, 0));
  return CHECKPOINTS.map((checkpoint, i) => {
    const commission = Math.floor(gross[i] * commissionBps / 10000);
    return { checkpoint, gross: gross[i], commission, net: gross[i] - commission };
  });
}

export function drawDigits(): { home: number[]; away: number[] } {
  const shuffle = () => {
    const digits = Array.from({ length: 10 }, (_, i) => i);
    for (let i = 9; i > 0; i--) {
      const range = 0x100000000;
      const limit = range - (range % (i + 1));
      const bytes = new Uint32Array(1);
      let random: number;
      do { crypto.getRandomValues(bytes); random = bytes[0]; } while (random >= limit);
      const j = random % (i + 1);
      [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    return digits;
  };
  return { home: shuffle(), away: shuffle() };
}

export function winningCell(score: {home:number; away:number}, home: readonly number[], away: readonly number[]) {
  if (![score.home, score.away].every(x => Number.isSafeInteger(x) && x >= 0)) throw new RangeError('Invalid score');
  const row = home.indexOf(score.home % 10), col = away.indexOf(score.away % 10);
  if (row < 0 || col < 0) throw new Error('Digits missing');
  return { row, col };
}

export function canPurchase(board: string, game: string, period: number, sold: number): boolean {
  return board === 'OPEN' && sold < 100 && (game === 'scheduled' || game === 'live' && period === 1);
}
