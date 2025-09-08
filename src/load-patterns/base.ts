import { VirtualUser } from '../core/virtual-user';
import { MetricsCollector } from '../metrics/collector';

export interface LoadPattern {
  execute(config: any, vuFactory: VUFactory): Promise<void>;
}

export interface VUFactory {
  create: (id: number) => VirtualUser | Promise<VirtualUser>; // Support both sync and async
  getMetrics: () => MetricsCollector;
}