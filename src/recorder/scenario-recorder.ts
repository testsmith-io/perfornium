import { EventEmitter } from 'events';
import { writeFileSync } from 'fs';
import * as yaml from 'yaml';
import { logger } from '../utils/logger';

export interface RecordedRequest {
  timestamp: number;
  method: string;
  url: string;
  path: string;
  headers?: Record<string, string>;
  params?: Record<string, any>;
  body?: any;
  response?: {
    status: number;
    statusText: string;
    headers?: Record<string, string>;
    data?: any;
    duration: number;
  };
}

export interface RecordedScenario {
  name: string;
  description?: string;
  baseURL?: string;
  steps: RecordedRequest[];
  variables?: Record<string, any>;
  extractions?: Array<{
    from: string;
    name: string;
    expression: string;
    type: 'json_path' | 'regex' | 'header' | 'cookie';
  }>;
}

export type OutputFormat = 'yaml' | 'typescript' | 'json';

export class ScenarioRecorder extends EventEmitter {
  private recording: boolean = false;
  private currentScenario: RecordedScenario | null = null;
  private recordedRequests: RecordedRequest[] = [];
  private startTime: number = 0;
  private extractionRules: Map<string, any> = new Map();

  startRecording(scenarioName: string, description?: string): void {
    if (this.recording) {
      throw new Error('Recording already in progress');
    }

    this.recording = true;
    this.startTime = Date.now();
    this.recordedRequests = [];
    this.currentScenario = {
      name: scenarioName,
      description,
      steps: []
    };

    logger.info(`🔴 Started recording scenario: ${scenarioName}`);
    this.emit('recording:started', scenarioName);
  }

  recordRequest(request: RecordedRequest): void {
    if (!this.recording) {
      return;
    }

    request.timestamp = Date.now() - this.startTime;
    this.recordedRequests.push(request);
    
    this.detectVariables(request);
    this.detectExtractions(request);
    
    this.emit('request:recorded', request);
    logger.debug(`📝 Recorded ${request.method} ${request.path}`);
  }

  private detectVariables(request: RecordedRequest): void {
    if (!this.currentScenario) return;

    const variables: Record<string, any> = {};
    
    const urlPattern = /\{([^}]+)\}/g;
    let match;
    while ((match = urlPattern.exec(request.path)) !== null) {
      variables[match[1]] = `{{${match[1]}}}`;
    }
    
    if (request.headers?.['Authorization']) {
      variables['auth_token'] = request.headers['Authorization'];
    }
    
    if (Object.keys(variables).length > 0) {
      this.currentScenario.variables = {
        ...this.currentScenario.variables,
        ...variables
      };
    }
  }

  private detectExtractions(request: RecordedRequest): void {
    if (!request.response?.data || !this.currentScenario) return;

    const extractions: typeof this.currentScenario.extractions = [];
    
    const commonFields = [
      'id', 'token', 'access_token', 'refresh_token',
      'session_id', 'sessionId', 'user_id', 'userId'
    ];
    
    if (typeof request.response.data === 'object') {
      for (const field of commonFields) {
        if (this.hasNestedField(request.response.data, field)) {
          const path = this.findJsonPath(request.response.data, field);
          if (path) {
            extractions.push({
              from: request.path,
              name: field,
              expression: path,
              type: 'json_path'
            });
          }
        }
      }
    }
    
    if (request.response.headers?.['set-cookie']) {
      extractions.push({
        from: request.path,
        name: 'session_cookie',
        expression: 'set-cookie',
        type: 'cookie'
      });
    }
    
    if (extractions.length > 0) {
      this.currentScenario.extractions = [
        ...(this.currentScenario.extractions || []),
        ...extractions
      ];
    }
  }

  private hasNestedField(obj: any, field: string): boolean {
    if (!obj || typeof obj !== 'object') return false;
    
    if (field in obj) return true;
    
    for (const value of Object.values(obj)) {
      if (this.hasNestedField(value, field)) return true;
    }
    
    return false;
  }

  private findJsonPath(obj: any, field: string, path: string = '$'): string | null {
    if (!obj || typeof obj !== 'object') return null;
    
    if (field in obj) {
      return `${path}.${field}`;
    }
    
    for (const [key, value] of Object.entries(obj)) {
      const result = this.findJsonPath(value, field, `${path}.${key}`);
      if (result) return result;
    }
    
    return null;
  }

  stopRecording(): RecordedScenario | null {
    if (!this.recording || !this.currentScenario) {
      return null;
    }

    this.recording = false;
    this.currentScenario.steps = this.optimizeSteps(this.recordedRequests);
    
    const scenario = this.currentScenario;
    this.currentScenario = null;
    
    logger.info(`⏹️ Stopped recording. Captured ${scenario.steps.length} steps`);
    this.emit('recording:stopped', scenario);
    
    return scenario;
  }

  private optimizeSteps(requests: RecordedRequest[]): RecordedRequest[] {
    const optimized: RecordedRequest[] = [];
    const seenUrls = new Set<string>();
    
    for (const request of requests) {
      const urlKey = `${request.method}_${request.path}`;
      
      if (!seenUrls.has(urlKey) || this.isImportantRequest(request)) {
        optimized.push(this.cleanRequest(request));
        seenUrls.add(urlKey);
      }
    }
    
    return optimized;
  }

  private isImportantRequest(request: RecordedRequest): boolean {
    const importantMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    return importantMethods.includes(request.method);
  }

  private cleanRequest(request: RecordedRequest): RecordedRequest {
    const cleaned: RecordedRequest = {
      timestamp: request.timestamp,
      method: request.method,
      url: request.url,
      path: request.path
    };
    
    const skipHeaders = [
      'user-agent', 'accept-encoding', 'connection',
      'content-length', 'host', 'cache-control'
    ];
    
    if (request.headers) {
      cleaned.headers = Object.fromEntries(
        Object.entries(request.headers)
          .filter(([key]) => !skipHeaders.includes(key.toLowerCase()))
      );
    }
    
    if (request.params && Object.keys(request.params).length > 0) {
      cleaned.params = request.params;
    }
    
    if (request.body) {
      cleaned.body = request.body;
    }
    
    if (request.response) {
      cleaned.response = {
        status: request.response.status,
        statusText: request.response.statusText,
        duration: request.response.duration
      };
    }
    
    return cleaned;
  }

  exportScenario(scenario: RecordedScenario, format: OutputFormat): string {
    switch (format) {
      case 'yaml':
        return this.exportAsYAML(scenario);
      case 'typescript':
        return this.exportAsTypeScript(scenario);
      case 'json':
        return JSON.stringify(this.convertToTestConfig(scenario), null, 2);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private exportAsYAML(scenario: RecordedScenario): string {
    const config = this.convertToTestConfig(scenario);
    return yaml.stringify(config);
  }

  private exportAsTypeScript(scenario: RecordedScenario): string {
    const config = this.convertToTestConfig(scenario);
    
    return `import { TestConfiguration } from 'perfornium';

export const config: TestConfiguration = ${JSON.stringify(config, null, 2)
  .replace(/"([^"]+)":/g, '$1:')
  .replace(/"/g, "'")};

export default config;`;
  }

  private convertToTestConfig(scenario: RecordedScenario): any {
    const steps = scenario.steps.map(step => ({
      name: `${step.method} ${step.path}`,
      type: 'rest',
      method: step.method,
      path: step.path,
      ...(step.headers && { headers: step.headers }),
      ...(step.params && { params: step.params }),
      ...(step.body && { 
        [typeof step.body === 'object' ? 'json' : 'body']: step.body 
      }),
      ...(scenario.extractions && {
        extract: scenario.extractions
          .filter(e => e.from === step.path)
          .map(e => ({
            name: e.name,
            type: e.type,
            expression: e.expression
          }))
      })
    }));

    return {
      name: scenario.name,
      description: scenario.description,
      ...(scenario.baseURL && {
        global: {
          base_url: scenario.baseURL
        }
      }),
      scenarios: [{
        name: scenario.name,
        ...(scenario.variables && { variables: scenario.variables }),
        steps
      }],
      load: {
        pattern: 'basic',
        vus: 1,
        duration: '1m'
      }
    };
  }

  saveToFile(scenario: RecordedScenario, filename: string, format: OutputFormat): void {
    const content = this.exportScenario(scenario, format);
    const extension = format === 'typescript' ? 'ts' : format;
    const fullPath = filename.endsWith(`.${extension}`) ? filename : `${filename}.${extension}`;
    
    writeFileSync(fullPath, content);
    logger.success(`💾 Saved scenario to ${fullPath}`);
  }

  isRecording(): boolean {
    return this.recording;
  }

  getRecordedRequestsCount(): number {
    return this.recordedRequests.length;
  }
}