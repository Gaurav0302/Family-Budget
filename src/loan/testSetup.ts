import type { Setup } from './types';

/** Example starting values for tests (not anyone's real figures). */
export const TEST_SETUP: Setup = {
  loan: 900000,
  rate: 6,
  term: 30,
  start: '2026-12',
  offset0: 50000,
  inc1: 9000,
  inc2: 7500,
  living: 6000,
  sac1: 350,
  sac2: 350,
  tax: 35,
  growth: 0,
  extra: 2000,
  sweep: false,
  bonus: 0,
  bonusMonth: 7,
  kids: [
    { name: 'Child A', monthly: 300, start: '2026-12', uni: 2034, goal: 0 },
    { name: 'Child B', monthly: 300, start: '2026-12', uni: 2038, goal: 0 },
  ],
  kidsInOffset: true,
  eduRate: 4,
  uniYears: 3,
};
