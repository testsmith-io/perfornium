import { WebSocket } from 'ws';
import { TestResult } from '../../types';
import { RealtimeEndpoint } from '../dispatcher';

export async function sendToWebSocket(
  batch: TestResult[],
  config: RealtimeEndpoint,
  batchNumber: number,
  startTime: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(config.url!);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'metrics_batch',
        timestamp: new Date().toISOString(),
        batch_number: batchNumber,
        test_start_time: new Date(startTime).toISOString(),
        data: batch
      }));
      ws.close();
      resolve();
    });

    ws.on('error', reject);

    setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timeout'));
    }, 5000);
  });
}
