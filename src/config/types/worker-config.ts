export interface DistributedWorkerConfig {
  enabled: boolean;
  workers: string[];
  coordinator_port?: number;
  load_balancing?: 'round_robin' | 'least_loaded' | 'random';
}

export interface WorkerConfig extends DistributedWorkerConfig {
  host?: string;
  port?: number;
  capacity?: number;
  region?: string;
}