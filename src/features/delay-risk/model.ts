/**
 * Delay-risk scoring: evaluates the exported depth-3 decision tree, counts the
 * rules R1–R4 and combines both into the hybrid risk level.
 *
 * The tree (splits, leaf probabilities, threshold, training ranges) is read
 * from ml/models/aerosync_decision_tree.json — nothing is re-typed here.
 * Pure functions, unit-tested against ml/models/aerosync_parity_cases.json.
 */
import modelJson from '../../../ml/models/aerosync_decision_tree.json';

export type DelayRiskInputs = {
  time_remaining_minutes: number;
  baggage_progress_pct: number;
  staff_availability_pct: number;
  unresolved_incidents: number;
};

export type DelayRiskFeature = keyof DelayRiskInputs;
export type RuleId = 'R1' | 'R2' | 'R3' | 'R4';
export type RiskLevel = 'High' | 'Medium' | 'Low';

export type DelayRiskResult = {
  delayProbability: number;
  triggeredRules: RuleId[];
  riskLevel: RiskLevel;
};

type TreeNode =
  | { id: number; leaf: true; delay_probability: number }
  | { id: number; leaf: false; feature: string; threshold: number; left: number; right: number };

const NODES = new Map<number, TreeNode>(
  (modelJson.nodes as TreeNode[]).map((node) => [node.id, node]),
);

export const PROBABILITY_THRESHOLD: number = modelJson.threshold;

/** Rule conditions as written in the model JSON's `rules` list (a test checks they still match). */
export const RULES: { id: RuleId; text: string; test: (x: DelayRiskInputs) => boolean }[] = [
  {
    id: 'R1',
    text: 'R1: time_remaining_minutes <= 60 and baggage_progress_pct < 70',
    test: (x) => x.time_remaining_minutes <= 60 && x.baggage_progress_pct < 70,
  },
  {
    id: 'R2',
    text: 'R2: time_remaining_minutes <= 90 and baggage_progress_pct < 50',
    test: (x) => x.time_remaining_minutes <= 90 && x.baggage_progress_pct < 50,
  },
  {
    id: 'R3',
    text: 'R3: staff_availability_pct < 70 and time_remaining_minutes <= 120',
    test: (x) => x.staff_availability_pct < 70 && x.time_remaining_minutes <= 120,
  },
  {
    id: 'R4',
    text: 'R4: unresolved_incidents >= 2 and time_remaining_minutes <= 120',
    test: (x) => x.unresolved_incidents >= 2 && x.time_remaining_minutes <= 120,
  },
];

const INPUT_FEATURES: DelayRiskFeature[] = [
  'time_remaining_minutes',
  'baggage_progress_pct',
  'staff_availability_pct',
  'unresolved_incidents',
];

function assertFinite(inputs: DelayRiskInputs) {
  for (const key of INPUT_FEATURES) {
    if (!Number.isFinite(inputs[key])) {
      throw new Error(`Delay-risk input "${key}" is not a finite number.`);
    }
  }
}

/** Walks the tree from the root: go left when value <= threshold, otherwise right. */
export function treeProbability(inputs: DelayRiskInputs): number {
  assertFinite(inputs);

  let node = NODES.get(0);

  while (node && !node.leaf) {
    const value = (inputs as Record<string, number>)[node.feature];
    if (value === undefined) {
      throw new Error(`The tree splits on "${node.feature}", which is not a supported input.`);
    }
    node = NODES.get(value <= node.threshold ? node.left : node.right);
  }

  if (!node) throw new Error('The decision tree JSON is malformed.');
  return node.delay_probability;
}

export function triggeredRules(inputs: DelayRiskInputs): RuleId[] {
  assertFinite(inputs);
  return RULES.filter((rule) => rule.test(inputs)).map((rule) => rule.id);
}

/** High: prob >= threshold and >= 2 rules; Medium: prob >= threshold or >= 1 rule; else Low. */
export function hybridRiskLevel(probability: number, ruleCount: number): RiskLevel {
  const aboveThreshold = probability >= PROBABILITY_THRESHOLD;
  if (aboveThreshold && ruleCount >= 2) return 'High';
  if (aboveThreshold || ruleCount >= 1) return 'Medium';
  return 'Low';
}

export function evaluateDelayRisk(inputs: DelayRiskInputs): DelayRiskResult {
  const delayProbability = treeProbability(inputs);
  const rules = triggeredRules(inputs);

  return {
    delayProbability,
    triggeredRules: rules,
    riskLevel: hybridRiskLevel(delayProbability, rules.length),
  };
}

/** Inputs that fall outside the range the model saw in training (from the JSON). */
export function outOfTrainingRange(inputs: DelayRiskInputs): DelayRiskFeature[] {
  const ranges = modelJson.training_ranges;
  return INPUT_FEATURES.filter(
    (key) => inputs[key] < ranges[key].min || inputs[key] > ranges[key].max,
  );
}
