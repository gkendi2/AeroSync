import { describe, expect, it } from '@jest/globals';

import modelJson from '../../../../ml/models/aerosync_decision_tree.json';
import parityCases from '../../../../ml/models/aerosync_parity_cases.json';
import {
  evaluateDelayRisk,
  hybridRiskLevel,
  outOfTrainingRange,
  PROBABILITY_THRESHOLD,
  RULES,
  treeProbability,
  triggeredRules,
} from '../model';

const base = {
  time_remaining_minutes: 200,
  baggage_progress_pct: 90,
  staff_availability_pct: 90,
  unresolved_incidents: 0,
};

describe('parity with the exported Python model', () => {
  it('has 200 parity cases', () => {
    expect(parityCases).toHaveLength(200);
  });

  it.each(parityCases.map((c, index) => [index, c] as const))(
    'case %i matches probability, rule count and risk level',
    (_index, c) => {
      const result = evaluateDelayRisk(c);

      expect(Math.abs(result.delayProbability - c.delay_probability)).toBeLessThan(1e-9);
      expect(result.triggeredRules).toHaveLength(c.rule_triggers);
      expect(result.riskLevel).toBe(c.risk_level);
    },
  );
});

describe('model JSON', () => {
  it('uses the 0.30 threshold', () => {
    expect(PROBABILITY_THRESHOLD).toBe(0.3);
  });

  it('still lists the rules exactly as implemented', () => {
    expect(RULES.map((rule) => rule.text)).toEqual(modelJson.rules);
  });
});

describe('treeProbability', () => {
  it('goes left when the value equals the threshold', () => {
    // Root split: time_remaining_minutes <= 130.5; then baggage <= 61.5.
    const left = treeProbability({ ...base, time_remaining_minutes: 130.5, baggage_progress_pct: 61.5 });
    const right = treeProbability({ ...base, time_remaining_minutes: 130.5, baggage_progress_pct: 61.6 });

    expect(left).toBeCloseTo(0.6808510638297872, 12);
    expect(right).toBeCloseTo(0.2392638036809816, 12);
  });

  it('ignores unresolved_incidents', () => {
    expect(treeProbability({ ...base, unresolved_incidents: 3 })).toBe(treeProbability(base));
  });

  it('rejects non-finite inputs', () => {
    expect(() => treeProbability({ ...base, baggage_progress_pct: NaN })).toThrow();
  });
});

describe('triggeredRules', () => {
  it('uses inclusive time limits and strict percentage limits', () => {
    expect(triggeredRules({ ...base, time_remaining_minutes: 60, baggage_progress_pct: 69 })).toEqual(['R1']);
    expect(triggeredRules({ ...base, time_remaining_minutes: 60, baggage_progress_pct: 70 })).toEqual([]);
    expect(triggeredRules({ ...base, time_remaining_minutes: 61, baggage_progress_pct: 69 })).toEqual([]);
    expect(triggeredRules({ ...base, time_remaining_minutes: 120, staff_availability_pct: 69.9 })).toEqual(['R3']);
    expect(triggeredRules({ ...base, time_remaining_minutes: 120, unresolved_incidents: 2 })).toEqual(['R4']);
    expect(triggeredRules({ ...base, time_remaining_minutes: 120, unresolved_incidents: 1 })).toEqual([]);
  });

  it('can trigger all four rules', () => {
    expect(
      triggeredRules({
        time_remaining_minutes: 30,
        baggage_progress_pct: 40,
        staff_availability_pct: 50,
        unresolved_incidents: 2,
      }),
    ).toEqual(['R1', 'R2', 'R3', 'R4']);
  });
});

describe('hybridRiskLevel', () => {
  it('combines probability and rule count', () => {
    expect(hybridRiskLevel(0.3, 2)).toBe('High');
    expect(hybridRiskLevel(0.3, 1)).toBe('Medium');
    expect(hybridRiskLevel(0.3, 0)).toBe('Medium');
    expect(hybridRiskLevel(0.29, 2)).toBe('Medium');
    expect(hybridRiskLevel(0.29, 1)).toBe('Medium');
    expect(hybridRiskLevel(0.29, 0)).toBe('Low');
  });
});

describe('outOfTrainingRange', () => {
  it('flags inputs outside the training ranges', () => {
    expect(outOfTrainingRange(base)).toEqual([]);
    expect(
      outOfTrainingRange({ ...base, time_remaining_minutes: 600, baggage_progress_pct: 0 }),
    ).toEqual(['time_remaining_minutes', 'baggage_progress_pct']);
  });
});
