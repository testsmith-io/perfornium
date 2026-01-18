import * as net from 'net';
import { TestResult } from '../../types';
import { RealtimeEndpoint } from '../dispatcher';

export async function sendToGraphite(batch: TestResult[], config: RealtimeEndpoint): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(config.port!, config.host!);

    client.on('connect', () => {
      const metrics = batch.map(result => {
        const timestamp = Math.floor(result.timestamp / 1000);
        const metricName = `loadtest.${result.scenario}.${result.step_name || result.action}`;

        return [
          `${metricName}.duration ${result.duration} ${timestamp}`,
          `${metricName}.success ${result.success ? 1 : 0} ${timestamp}`,
          `${metricName}.count 1 ${timestamp}`
        ].join('\n');
      }).join('\n') + '\n';

      client.write(metrics);
      client.end();
    });

    client.on('close', () => resolve());
    client.on('error', reject);

    setTimeout(() => {
      client.destroy();
      reject(new Error('Graphite connection timeout'));
    }, 5000);
  });
}
