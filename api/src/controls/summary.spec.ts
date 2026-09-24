import { summarize } from './summary.js';

describe('summarize', () => {
  it('counts every status and scores partial as half', () => {
    const s = summarize(['COMPLIANT', 'PARTIAL', 'NON_COMPLIANT', 'NOT_STARTED']);
    expect(s.counts).toEqual({ COMPLIANT: 1, PARTIAL: 1, NON_COMPLIANT: 1, NOT_APPLICABLE: 0, NOT_STARTED: 1 });
    expect(s.score).toBe(38); // 1.5 / 4
  });

  it('leaves not-applicable controls out of the score', () => {
    expect(summarize(['COMPLIANT', 'NOT_APPLICABLE']).score).toBe(100);
  });

  it('has no score when nothing applies', () => {
    expect(summarize(['NOT_APPLICABLE']).score).toBeNull();
    expect(summarize([]).score).toBeNull();
  });
});
