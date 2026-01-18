import * as Handlebars from 'handlebars';

export function registerHandlebarsHelpers(): void {
  // Helper for comparing numbers
  Handlebars.registerHelper('gt', function (a: number, b: number) {
    return a > b;
  });

  // Helper for formatting numbers
  Handlebars.registerHelper('toFixed', function (num: number, digits: number) {
    return typeof num === 'number' ? num.toFixed(digits) : '0';
  });

  // Helper for conditional classes
  Handlebars.registerHelper('statusClass', function (successRate: number) {
    if (successRate >= 95) return 'metric-success';
    if (successRate >= 90) return 'metric-warning';
    return 'metric-error';
  });

  // Helper for accessing numeric properties
  Handlebars.registerHelper('percentile', function (percentiles: Record<string, number>, key: string) {
    return percentiles[key] || 0;
  });

  // Helper for lookup with numeric keys
  Handlebars.registerHelper('lookup', function (obj: any, key: any) {
    return obj[key];
  });
}
