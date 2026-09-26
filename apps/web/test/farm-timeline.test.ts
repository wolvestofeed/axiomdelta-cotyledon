/**
 * MicroFarm — the timeline primitives' arithmetic (scheduler build plan §5.1, W2).
 */

import { describe, it, expect } from 'vitest';
import { hhmm, laneRows, spanOf, timeScale } from '@/app/(farm)/farm/_components/timeline/scale';

describe('farm timeline — the time scale', () => {
  it('rounds the span out to whole hours and ticks every hour', () => {
    const s = timeScale(475, 1105, 'hour');
    expect([s.startMin, s.endMin, s.minutes]).toEqual([420, 1140, 720]);
    expect(s.ticks[0]).toBe(420);
    expect(s.ticks[s.ticks.length - 1]).toBe(1140);
    expect(s.ticks).toHaveLength(13);
  });

  it('places a minute as a percent across the track and clamps outside it', () => {
    const s = timeScale(420, 1140, 'hour');
    expect(s.pos(420)).toBe(0);
    expect(s.pos(1140)).toBe(100);
    expect(s.pos(780)).toBeCloseTo(50, 9);
    expect(s.pos(60)).toBe(0);
    expect(s.pos(1400)).toBe(100);
  });

  it('a width is never negative and never runs past the track', () => {
    const s = timeScale(420, 1140, 'hour');
    expect(s.width(420, 780)).toBeCloseTo(50, 9);
    expect(s.width(780, 420)).toBe(0);
    expect(s.width(1100, 1600)).toBeCloseTo((40 / 720) * 100, 9);
  });

  it('a quarter-hour scale ticks every 15 minutes; an empty span is still one step wide', () => {
    expect(timeScale(420, 480, '15min').ticks).toEqual([420, 435, 450, 465, 480]);
    expect(timeScale(600, 600, 'hour')).toMatchObject({ startMin: 600, endMin: 660, minutes: 60 });
  });
});

describe('farm timeline — the span and the lanes', () => {
  it('the span covers the operating day and anything placed outside it', () => {
    expect(spanOf([], { startMin: 420, endMin: 1140 })).toEqual({ startMin: 420, endMin: 1140 });
    expect(spanOf([{ startMin: 300, endMin: 1200 }], { startMin: 420, endMin: 1140 })).toEqual({ startMin: 300, endMin: 1200 });
  });

  it('packs overlapping blocks onto separate rows, touching blocks on one', () => {
    const rows = laneRows([
      { id: 'a', startMin: 420, endMin: 480 },
      { id: 'b', startMin: 450, endMin: 500 },
      { id: 'c', startMin: 480, endMin: 540 },
    ]);
    expect(rows.map((r) => r.map((b) => b.id))).toEqual([['a', 'c'], ['b']]);
    expect(laneRows([])).toEqual([]);
  });

  it('minutes read as HH:MM', () => {
    expect([hhmm(0), hhmm(475), hhmm(1140)]).toEqual(['00:00', '07:55', '19:00']);
  });
});
