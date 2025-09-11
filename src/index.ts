// src/index.ts (builds to dist/index.js)

// Export everything from test-builder
export { test, testData, TestBuilder, ScenarioBuilder, LoadBuilder, load } from './dsl/test-builder';
export type { ScenarioContext } from './dsl/test-builder';

// Export TestRunner and ConfigParser
export { TestRunner } from './core/test-runner';
export { ConfigParser } from './config/parser';

// Export types
export type { TestConfiguration, Scenario, Step, VUContext } from './config/types';