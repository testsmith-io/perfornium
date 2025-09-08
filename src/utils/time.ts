export function parseTime(timeStr: string | number): number {
  if (typeof timeStr === 'number') return timeStr;
  
  const units: Record<string, number> = {
    'ms': 1, 's': 1000, 'm': 60 * 1000, 'h': 60 * 60 * 1000
  };
  
  const match = timeStr.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);
  if (!match) throw new Error(`Invalid time format: ${timeStr}`);
  
  const [, value, unit] = match;
  return parseFloat(value) * units[unit];
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}