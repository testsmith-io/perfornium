import { TestConfiguration } from '../config/types';
import { RemoteWorker } from './remote-worker';
export type DistributionStrategy = 'even' | 'capacity_based' | 'round_robin' | 'geographic';
export interface WorkerAssignment {
    worker: RemoteWorker;
    config: TestConfiguration;
    virtualUsers: number;
    startDelay?: number;
}
export declare class LoadDistributor {
    distribute(testConfig: TestConfiguration, workers: RemoteWorker[], strategy: DistributionStrategy): WorkerAssignment[];
    private evenDistribution;
    private capacityBasedDistribution;
    private roundRobinDistribution;
    private geographicDistribution;
    private createWorkerConfig;
}
