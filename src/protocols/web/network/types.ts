import { Request } from 'playwright';
import { CapturedNetworkCall } from '../../../metrics/types';

export interface PendingRequest {
  call: Partial<CapturedNetworkCall>;
  vuId: number;
}

export interface CurrentContext {
  scenario?: string;
  step_name?: string;
}

export interface CapturedBody {
  body: string;
  headers: Record<string, string>;
}
