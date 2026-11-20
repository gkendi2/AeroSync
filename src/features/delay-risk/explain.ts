/**
 * Plain-language "Why this risk level" text for a scored flight. Built only
 * from an existing result (probability, triggered rules, hybrid level) and its
 * inputs; nothing here changes how risk is calculated. Pure, unit-tested.
 *
 * The limits quoted in the rule sentences are those of RULES in model.ts
 * (R1: <= 60 min and < 70% bags; R2: <= 90 min and < 50% bags;
 *  R3: < 70% staff and <= 120 min; R4: >= 2 incidents and <= 120 min).
 */
import {
  PROBABILITY_THRESHOLD,
  type DelayRiskInputs,
  type DelayRiskResult,
  type RuleId,
} from './model';

export type RiskExplanation = {
  /** One sentence on why the level is High, Medium or Low. */
  summary: string;
  /** One sentence per triggered rule, with the flight's actual values. */
  rules: { id: RuleId; text: string }[];
};

/** "a 7%" / "an 87%" / "an 8%" / "an 11%". */
function withArticle(percent: number) {
  const an = percent === 8 || percent === 11 || percent === 18 || (percent >= 80 && percent <= 89);
  return `${an ? 'an' : 'a'} ${percent}%`;
}

function ruleCount(count: number) {
  return count === 1 ? '1 rule was' : `${count} rules were`;
}

// Values are rounded down so a triggered rule never reads "70% (below 70%)".
const minutes = (value: number) => Math.floor(value);
const percent = (value: number) => Math.floor(value);

function ruleSentence(id: RuleId, x: DelayRiskInputs): string {
  const time = `${minutes(x.time_remaining_minutes)} minutes to departure`;

  switch (id) {
    case 'R1':
      return `R1: ${time} and only ${percent(x.baggage_progress_pct)}% of bags loaded (below 70%).`;
    case 'R2':
      return `R2: ${time} and only ${percent(x.baggage_progress_pct)}% of bags loaded (below 50%).`;
    case 'R3':
      return `R3: only ${percent(x.staff_availability_pct)}% of assigned staff available (below 70%), with ${time}.`;
    case 'R4':
      return `R4: ${x.unresolved_incidents} unresolved incidents (2 or more), with ${time}.`;
  }
}

export function explainRiskLevel(result: DelayRiskResult, inputs: DelayRiskInputs): RiskExplanation {
  const probability = Math.round(result.delayProbability * 100);
  const threshold = Math.round(PROBABILITY_THRESHOLD * 100);
  const above = result.delayProbability >= PROBABILITY_THRESHOLD;
  const rulesCount = result.triggeredRules.length;

  const chance = `The model estimates ${withArticle(probability)} chance of delay`;
  const position = `(${
    result.delayProbability > PROBABILITY_THRESHOLD ? 'above' : above ? 'at' : 'below'
  } the ${threshold}% threshold)`;

  let summary: string;

  if (result.riskLevel === 'High') {
    summary = `${chance} ${position} and ${ruleCount(rulesCount)} triggered.`;
  } else if (result.riskLevel === 'Medium') {
    if (above && rulesCount === 0) {
      summary = `${chance} ${position}, but no rules were triggered. High also needs at least 2 rules.`;
    } else if (above) {
      summary = `${chance} ${position} and ${ruleCount(rulesCount)} triggered. High needs at least 2 rules.`;
    } else {
      summary = `${chance} ${position}, but ${ruleCount(rulesCount)} triggered.`;
    }
  } else {
    summary = `${chance} and no rules were triggered.`;
  }

  return {
    summary,
    rules: result.triggeredRules.map((id) => ({ id, text: ruleSentence(id, inputs) })),
  };
}
