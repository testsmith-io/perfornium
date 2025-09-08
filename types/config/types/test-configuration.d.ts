import { GlobalConfig } from './global-config';
import { LoadConfig } from './load-config';
import { Scenario } from './scenario-config';
import { OutputConfig } from './output-config';
import { ReportConfig } from './report-config';
import { WorkerConfig } from './worker-config';
import { DebugConfig } from './global-config';
export interface TestConfiguration {
    name: string;
    description?: string;
    global?: GlobalConfig;
    load: LoadConfig;
    scenarios: Scenario[];
    outputs?: OutputConfig[];
    report?: ReportConfig;
    workers?: WorkerConfig;
    debug?: DebugConfig;
}
