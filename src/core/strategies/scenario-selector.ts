import { Scenario } from '../../config/types/hooks';

export class ScenarioSelector {
  /**
   * Select scenarios based on weights using proportional distribution.
   *
   * Weights determine the probability of a scenario being selected:
   * - scenario1 (weight: 50) + scenario2 (weight: 25) + scenario3 (weight: 25) = 100
   * - 50% of VUs will run scenario1, 25% scenario2, 25% scenario3
   *
   * If weights don't sum to 100, they are normalized proportionally.
   */
  selectScenarios(scenarios: Scenario[]): Scenario[] {
    if (scenarios.length === 0) {
      return [];
    }

    if (scenarios.length === 1) {
      return scenarios;
    }

    // Calculate total weight
    const totalWeight = scenarios.reduce((sum, s) => sum + (s.weight ?? 100), 0);

    // Generate random value between 0 and totalWeight
    const random = Math.random() * totalWeight;

    // Select scenario based on cumulative weight
    let cumulative = 0;
    for (const scenario of scenarios) {
      cumulative += (scenario.weight ?? 100);
      if (random < cumulative) {
        return [scenario];
      }
    }

    // Fallback to last scenario (should not reach here)
    return [scenarios[scenarios.length - 1]];
  }
}
