import { TestResult } from '../../types';
import { RealtimeEndpoint } from '../dispatcher';

export async function sendToWebhook(
  batch: TestResult[],
  config: RealtimeEndpoint,
  batchNumber: number,
  startTime: number
): Promise<void> {
  const response = await fetch(config.url!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...config.headers
    },
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      batch_number: batchNumber,
      batch_size: batch.length,
      test_start_time: new Date(startTime).toISOString(),
      results: batch
    })
  });

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
  }
}
