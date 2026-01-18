import { TestResult } from '../../types';
import { RealtimeEndpoint } from '../dispatcher';

export async function sendToInfluxDB(
  batch: TestResult[],
  config: RealtimeEndpoint,
  batchNumber: number
): Promise<void> {
  const lines = batch.map(result => {
    const tags = [
      `scenario=${result.scenario}`,
      `step=${result.step_name || result.action}`,
      `vu_id=${result.vu_id}`,
      `success=${result.success}`
    ].join(',');

    const fields = [
      `duration=${result.duration}`,
      `success=${result.success ? 'true' : 'false'}`,
      `batch_number=${batchNumber}i`
    ];

    if (result.status) {
      fields.push(`status=${result.status}i`);
    }

    const timestamp = result.timestamp * 1000000; // Convert to nanoseconds

    return `loadtest,${tags} ${fields.join(',')} ${timestamp}`;
  }).join('\n');

  const response = await fetch(`${config.url}/write?db=${config.database}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Content-Type': 'text/plain'
    },
    body: lines
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`InfluxDB write failed: ${response.status} ${errorText}`);
  }
}
