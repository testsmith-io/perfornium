import { TestResult } from '../types';
import { logger } from '../../utils/logger';
import { sendToGraphite } from './endpoints/graphite';
import { sendToWebhook } from './endpoints/webhook';
import { sendToInfluxDB } from './endpoints/influxdb';
import { sendToWebSocket } from './endpoints/websocket';

export interface RealtimeEndpoint {
  type: 'graphite' | 'webhook' | 'influxdb' | 'websocket';
  url?: string;
  host?: string;
  port?: number;
  database?: string;
  token?: string;
  headers?: Record<string, string>;
}

export class RealtimeDispatcher {
  private endpoints: RealtimeEndpoint[] = [];
  private startTime: number = 0;

  setEndpoints(endpoints: RealtimeEndpoint[]): void {
    this.endpoints = endpoints;
  }

  setStartTime(time: number): void {
    this.startTime = time;
  }

  async dispatch(batch: TestResult[], batchNumber: number): Promise<void> {
    if (this.endpoints.length === 0) return;

    const promises = this.endpoints.map(endpoint =>
      this.sendToEndpoint(batch, endpoint, batchNumber).catch(error =>
        logger.warn(`Failed to send to ${endpoint.type} endpoint:`, error)
      )
    );

    await Promise.allSettled(promises);
  }

  private async sendToEndpoint(
    batch: TestResult[],
    endpoint: RealtimeEndpoint,
    batchNumber: number
  ): Promise<void> {
    switch (endpoint.type) {
      case 'graphite':
        await sendToGraphite(batch, endpoint);
        break;
      case 'webhook':
        await sendToWebhook(batch, endpoint, batchNumber, this.startTime);
        break;
      case 'influxdb':
        await sendToInfluxDB(batch, endpoint, batchNumber);
        break;
      case 'websocket':
        await sendToWebSocket(batch, endpoint, batchNumber, this.startTime);
        break;
      default:
        logger.warn(`Unknown endpoint type: ${(endpoint as any).type}`);
    }
  }
}
