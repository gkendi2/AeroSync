import { describe, expect, it } from '@jest/globals';

import { explainRiskLevel } from '../explain';
import { evaluateDelayRisk, type DelayRiskInputs, type DelayRiskResult } from '../model';

const inputs: DelayRiskInputs = {
  time_remaining_minutes: 45.6,
  baggage_progress_pct: 40.8,
  staff_availability_pct: 55.2,
  unresolved_incidents: 2,
};

function result(delayProbability: number, triggeredRules: DelayRiskResult['triggeredRules'], riskLevel: DelayRiskResult['riskLevel']): DelayRiskResult {
  return { delayProbability, triggeredRules, riskLevel };
}

describe('explainRiskLevel', () => {
  it('High: probability above the threshold and the number of rules', () => {
    const explanation = explainRiskLevel(result(0.8732, ['R1', 'R2', 'R3'], 'High'), inputs);

    expect(explanation.summary).toBe(
      'The model estimates an 87% chance of delay (above the 30% threshold) and 3 rules were triggered.',
    );
    expect(explanation.rules).toEqual([
      { id: 'R1', text: 'R1: 45 minutes to departure and only 40% of bags loaded (below 70%).' },
      { id: 'R2', text: 'R2: 45 minutes to departure and only 40% of bags loaded (below 50%).' },
      { id: 'R3', text: 'R3: only 55% of assigned staff available (below 70%), with 45 minutes to departure.' },
    ]);
  });

  it('Medium (probability only): above the threshold, no rules', () => {
    const explanation = explainRiskLevel(result(0.61, [], 'Medium'), inputs);

    expect(explanation.summary).toBe(
      'The model estimates a 61% chance of delay (above the 30% threshold), but no rules were triggered. High also needs at least 2 rules.',
    );
    expect(explanation.rules).toEqual([]);
  });

  it('Medium (rules only): below the threshold, at least one rule', () => {
    const explanation = explainRiskLevel(result(0.12, ['R4'], 'Medium'), inputs);

    expect(explanation.summary).toBe(
      'The model estimates a 12% chance of delay (below the 30% threshold), but 1 rule was triggered.',
    );
    expect(explanation.rules).toEqual([
      { id: 'R4', text: 'R4: 2 unresolved incidents (2 or more), with 45 minutes to departure.' },
    ]);
  });

  it('Medium (both, one rule): explains why it is not High', () => {
    expect(explainRiskLevel(result(0.45, ['R3'], 'Medium'), inputs).summary).toBe(
      'The model estimates a 45% chance of delay (above the 30% threshold) and 1 rule was triggered. High needs at least 2 rules.',
    );
  });

  it('Low: probability below the threshold and no rules', () => {
    expect(explainRiskLevel(result(0.07, [], 'Low'), inputs).summary).toBe(
      'The model estimates a 7% chance of delay and no rules were triggered.',
    );
  });

  it('describes a real model result consistently', () => {
    const live: DelayRiskInputs = {
      time_remaining_minutes: 50,
      baggage_progress_pct: 30,
      staff_availability_pct: 60,
      unresolved_incidents: 0,
    };
    const evaluated = evaluateDelayRisk(live);
    const explanation = explainRiskLevel(evaluated, live);

    expect(explanation.rules.map((rule) => rule.id)).toEqual(evaluated.triggeredRules);
    expect(explanation.summary).toContain(`${Math.round(evaluated.delayProbability * 100)}% chance`);
  });
});
