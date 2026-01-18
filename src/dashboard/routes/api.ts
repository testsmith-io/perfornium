import * as http from 'http';
import { LiveTest, InfrastructureMetrics } from '../types';
import { FileScanner } from '../services/file-scanner';
import { ResultsManager } from '../services/results-manager';
import { TestExecutor, TestRunOptions } from '../services/test-executor';
import { WorkersManager } from '../services/workers-manager';
import { InfluxDBService } from '../services/influxdb-service';
import { InfluxDBWriter, initInfluxDBWriter } from '../../metrics/output/influxdb-writer';
import { logger } from '../../utils/logger';

export class ApiRoutes {
  private fileScanner: FileScanner;
  private resultsManager: ResultsManager;
  private testExecutor: TestExecutor;
  private workersManager: WorkersManager;
  private liveTests: Map<string, LiveTest>;
  private influxService: InfluxDBService;
  private testMetricsWriter: InfluxDBWriter | null = null;
  private onInfraUpdate?: (data: InfrastructureMetrics) => void;

  constructor(
    fileScanner: FileScanner,
    resultsManager: ResultsManager,
    testExecutor: TestExecutor,
    workersManager: WorkersManager,
    liveTests: Map<string, LiveTest>,
    callbacks?: { onInfraUpdate?: (data: InfrastructureMetrics) => void },
    influxService?: InfluxDBService
  ) {
    this.fileScanner = fileScanner;
    this.resultsManager = resultsManager;
    this.testExecutor = testExecutor;
    this.workersManager = workersManager;
    this.liveTests = liveTests;
    this.onInfraUpdate = callbacks?.onInfraUpdate;
    this.influxService = influxService || new InfluxDBService();
  }

  async initialize(): Promise<void> {
    await this.influxService.connect();

    // Initialize test metrics writer for querying stored test data
    this.testMetricsWriter = await initInfluxDBWriter();
  }

  async handleGetResults(res: http.ServerResponse): Promise<void> {
    const results = await this.resultsManager.scanResults();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(results));
  }

  async handleGetResult(res: http.ServerResponse, id: string): Promise<void> {
    // First load the base result from file (for metadata, summary, etc.)
    const fullResult = await this.resultsManager.loadFullResult(id);
    if (!fullResult) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Result not found' }));
      return;
    }

    // Add source metadata
    const sourceInfo: any = {
      summary: 'file',  // Summary/metadata always from file (contains aggregated stats)
      individual_results: 'file',  // Will be updated to 'influxdb' if available
      network_calls: fullResult.network_calls?.length ? 'file' : 'none',
      infrastructure_metrics: fullResult.infrastructure_metrics ? 'file' : 'none'
    };

    // Try to load individual test results from InfluxDB
    if (this.testMetricsWriter?.isEnabled() && fullResult.timestamp && fullResult.duration) {
      try {
        const startTime = new Date(fullResult.timestamp);
        const endTime = new Date(startTime.getTime() + (fullResult.duration * 1000));

        logger.info(`Querying InfluxDB for test: "${fullResult.name}", time range: ${startTime.toISOString()} - ${endTime.toISOString()}`);

        // Query test results from InfluxDB
        const influxResults = await this.testMetricsWriter.queryResults({
          testName: fullResult.name,
          startTime,
          endTime
        });

        logger.info(`InfluxDB returned ${influxResults.length} test results`);

        if (influxResults.length > 0) {
          // Replace file-based results with InfluxDB results
          fullResult.results = influxResults;
          sourceInfo.individual_results = 'influxdb';
          sourceInfo.influxdb_result_count = influxResults.length;
        }

        // Query network calls from InfluxDB
        const influxNetworkCalls = await this.testMetricsWriter.queryNetworkCalls({
          testName: fullResult.name,
          startTime,
          endTime
        });

        logger.info(`InfluxDB returned ${influxNetworkCalls.length} network calls`);

        if (influxNetworkCalls.length > 0) {
          fullResult.network_calls = influxNetworkCalls;
          sourceInfo.network_calls = 'influxdb';
          sourceInfo.influxdb_network_call_count = influxNetworkCalls.length;
        }
      } catch (e: any) {
        logger.error(`Could not fetch test results from InfluxDB: ${e.message}`);
      }
    } else {
      logger.debug(`InfluxDB query skipped: enabled=${this.testMetricsWriter?.isEnabled()}, timestamp=${fullResult.timestamp}, duration=${fullResult.duration}`);
    }

    // Check if we can augment infrastructure from InfluxDB
    if (!fullResult.infrastructure_metrics || Object.keys(fullResult.infrastructure_metrics).length === 0) {
      if (this.influxService.isEnabled() && fullResult.timestamp && fullResult.duration) {
        try {
          const startTime = new Date(fullResult.timestamp);
          const endTime = new Date(startTime.getTime() + (fullResult.duration * 1000));
          const infraFromDB = await this.influxService.queryMetricsByTestRun('', startTime, endTime);
          if (Object.keys(infraFromDB).length > 0) {
            fullResult.infrastructure_metrics = infraFromDB;
            sourceInfo.infrastructure_metrics = 'influxdb';
          }
        } catch (e: any) {
          logger.debug(`Could not fetch infra from InfluxDB: ${e.message}`);
        }
      }
    }

    // Add source info to response
    (fullResult as any)._source = sourceInfo;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(fullResult));
  }

  async handleDeleteResult(res: http.ServerResponse, id: string): Promise<void> {
    try {
      await this.resultsManager.deleteResult(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'deleted', id: decodeURIComponent(id) }));
    } catch (e: any) {
      logger.error(`Failed to delete result ${id}:`, e.message);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Result not found', details: e.message }));
    }
  }

  async handleExportResult(res: http.ServerResponse, id: string, url: URL): Promise<void> {
    try {
      const format = (url.searchParams.get('format') || 'json') as 'json' | 'csv';
      const includeNetworkCalls = url.searchParams.get('includeNetworkCalls') === 'true';
      const fullResult = await this.resultsManager.loadFullResult(id);

      if (!fullResult) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Result not found' }));
        return;
      }

      // Optionally exclude network calls
      const exportData = includeNetworkCalls ? fullResult : { ...fullResult, network_calls: undefined };

      if (format === 'csv') {
        // Export as CSV
        const csv = this.resultToCSV(exportData, includeNetworkCalls);
        res.writeHead(200, {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${fullResult.name}-${new Date(fullResult.timestamp).toISOString().slice(0, 10)}.csv"`
        });
        res.end(csv);
      } else {
        // Export as JSON
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${fullResult.name}-${new Date(fullResult.timestamp).toISOString().slice(0, 10)}.json"`
        });
        res.end(JSON.stringify(exportData, null, 2));
      }
    } catch (e: any) {
      logger.error(`Failed to export result ${id}:`, e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Export failed', details: e.message }));
    }
  }

  async handleImportResult(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const data = JSON.parse(body);

      // Validate required fields
      if (!data.summary) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid result format: missing summary' }));
        return;
      }

      // Generate a unique ID if not present
      const timestamp = data.timestamp || new Date().toISOString();
      const name = data.name || 'Imported Result';
      const timestampStr = new Date(timestamp).toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const id = data.id || `${name}-${timestampStr}`;

      // Save to results directory
      const result = await this.resultsManager.saveResult(id, {
        ...data,
        id,
        name,
        timestamp,
        _imported: true,
        _imported_at: new Date().toISOString()
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'imported', id: result.id, name: result.name }));
    } catch (e: any) {
      logger.error('Failed to import result:', e.message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Import failed', details: e.message }));
    }
  }

  private resultToCSV(result: any, includeNetworkCalls: boolean = false): string {
    const lines: string[] = [];

    // Summary header
    lines.push('# Test Result Summary');
    lines.push(`Name,${result.name}`);
    lines.push(`Timestamp,${result.timestamp}`);
    lines.push(`Duration,${result.duration}`);
    lines.push('');

    // Summary metrics
    lines.push('# Summary Metrics');
    lines.push('Metric,Value');
    lines.push(`Total Requests,${result.summary.total_requests}`);
    lines.push(`Successful Requests,${result.summary.successful_requests}`);
    lines.push(`Failed Requests,${result.summary.failed_requests}`);
    lines.push(`Avg Response Time (ms),${result.summary.avg_response_time}`);
    lines.push(`Min Response Time (ms),${result.summary.min_response_time}`);
    lines.push(`Max Response Time (ms),${result.summary.max_response_time}`);
    lines.push(`P50 Response Time (ms),${result.summary.p50_response_time}`);
    lines.push(`P95 Response Time (ms),${result.summary.p95_response_time}`);
    lines.push(`P99 Response Time (ms),${result.summary.p99_response_time}`);
    lines.push(`Requests per Second,${result.summary.requests_per_second}`);
    lines.push(`Success Rate (%),${result.summary.success_rate}`);
    lines.push(`Error Rate (%),${result.summary.error_rate}`);
    lines.push('');

    // Step statistics if available
    if (result.step_statistics && result.step_statistics.length > 0) {
      lines.push('# Step Statistics');
      lines.push('Step Name,Scenario,Total Requests,Failed Requests,Success Rate,Avg Response Time,Min Response Time,Max Response Time,P50,P95,P99');
      for (const step of result.step_statistics) {
        lines.push([
          step.step_name,
          step.scenario || '',
          step.total_requests || 0,
          step.failed_requests || 0,
          step.success_rate || 0,
          step.avg_response_time || 0,
          step.min_response_time || 0,
          step.max_response_time || 0,
          step.percentiles?.['50'] || 0,
          step.percentiles?.['95'] || 0,
          step.percentiles?.['99'] || 0
        ].join(','));
      }
      lines.push('');
    }

    // Individual results if available
    if (result.results && result.results.length > 0) {
      lines.push('# Individual Results');
      lines.push('Timestamp,Scenario,Action,VU ID,Duration (ms),Success,Status,Error');
      for (const r of result.results) {
        lines.push([
          r.timestamp || '',
          r.scenario || '',
          r.action || '',
          r.vu_id || 0,
          r.duration || 0,
          r.success ? 'true' : 'false',
          r.status || '',
          (r.error || '').replace(/,/g, ';')
        ].join(','));
      }
      lines.push('');
    }

    // Network calls if available and requested
    if (includeNetworkCalls && result.network_calls && result.network_calls.length > 0) {
      lines.push('# Network Calls');
      lines.push('Timestamp,URL,Method,Status,Duration (ms),Size,Success,Error');
      for (const call of result.network_calls) {
        lines.push([
          call.timestamp || '',
          (call.request_url || call.url || '').replace(/,/g, '%2C'),
          call.request_method || call.method || 'GET',
          call.response_status || call.status || 0,
          call.duration || 0,
          call.response_size || call.size || 0,
          call.success ? 'true' : 'false',
          (call.error || '').replace(/,/g, ';')
        ].join(','));
      }
    }

    return lines.join('\n');
  }

  async handleCompare(res: http.ServerResponse, ids: string[]): Promise<void> {
    const results = await Promise.all(ids.map(id => this.resultsManager.loadFullResult(id)));
    const validResults = results.filter(r => r !== null);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      results: validResults,
      comparison: this.resultsManager.generateComparison(validResults)
    }));
  }

  handleGetLive(res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(Array.from(this.liveTests.values())));
  }

  async handleGetTests(res: http.ServerResponse): Promise<void> {
    const tests = await this.fileScanner.scanTestFiles();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(tests));
  }

  async handleRunTest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { testPath, options } = JSON.parse(body);
    const result = this.testExecutor.runTest(testPath, options as TestRunOptions);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  }

  handleStopTest(res: http.ServerResponse, testId: string): void {
    const stopped = this.testExecutor.stopTest(testId);
    if (stopped) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'stopped' }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Test not found' }));
    }
  }

  async handleGetWorkers(res: http.ServerResponse): Promise<void> {
    const workersInfo = await this.workersManager.getWorkers();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(workersInfo));
  }

  async handleInfraMetrics(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const payload = JSON.parse(body);

      // Validate required fields
      if (!payload.host || payload.type !== 'infrastructure_metrics') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid payload: missing host or type' }));
        return;
      }

      const metrics: InfrastructureMetrics = {
        host: payload.host,
        timestamp: payload.timestamp || new Date().toISOString(),
        interval_seconds: payload.interval_seconds || 5,
        metrics: payload.metrics || {}
      };

      // Write to InfluxDB (also stores in fallback buffer)
      await this.influxService.writeMetrics(metrics);

      // Broadcast to WebSocket clients
      if (this.onInfraUpdate) {
        this.onInfraUpdate(metrics);
      }

      logger.debug(`Infrastructure metrics received from ${metrics.host}`);

      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        accepted: true,
        host: metrics.host,
        influxdb: this.influxService.isEnabled()
      }));
    } catch (error: any) {
      logger.error('Failed to process infrastructure metrics:', error.message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
    }
  }

  async handleGetInfra(res: http.ServerResponse, host?: string): Promise<void> {
    try {
      if (host) {
        const metrics = await this.influxService.queryMetrics({ host });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ host, metrics }));
      } else {
        const result = await this.influxService.getLatestMetrics();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      }
    } catch (error: any) {
      logger.error('Failed to get infra metrics:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  async handleGetInfraByTestRun(res: http.ServerResponse, startTime: string, endTime: string): Promise<void> {
    try {
      const start = new Date(startTime);
      const end = new Date(endTime);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid date format. Use ISO 8601.' }));
        return;
      }

      const metrics = await this.influxService.queryMetricsByTestRun('', start, end);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        infrastructure_metrics: metrics
      }));
    } catch (error: any) {
      logger.error('Failed to get infra by test run:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  async handleExportInfra(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    try {
      const format = (url.searchParams.get('format') || 'json') as 'json' | 'csv';
      const host = url.searchParams.get('host') || undefined;
      const startTime = url.searchParams.get('start') ? new Date(url.searchParams.get('start')!) : undefined;
      const endTime = url.searchParams.get('end') ? new Date(url.searchParams.get('end')!) : undefined;

      const data = await this.influxService.exportMetrics({ host, startTime, endTime }, format);

      const contentType = format === 'csv' ? 'text/csv' : 'application/json';
      const filename = `infra-metrics-${new Date().toISOString().slice(0, 10)}.${format}`;

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`
      });
      res.end(data);
    } catch (error: any) {
      logger.error('Failed to export infra metrics:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  async handleImportInfra(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    try {
      const format = (url.searchParams.get('format') || 'json') as 'json' | 'csv';
      const body = await this.readBody(req);

      const count = await this.influxService.importMetrics(body, format);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        imported: count,
        format,
        influxdb: this.influxService.isEnabled()
      }));
    } catch (error: any) {
      logger.error('Failed to import infra metrics:', error.message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  async handleGetInfraStatus(res: http.ServerResponse): Promise<void> {
    try {
      const hosts = await this.influxService.getHosts();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        influxdb_enabled: this.influxService.isEnabled(),
        hosts_count: hosts.length,
        hosts
      }));
    } catch (error: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * Get a snapshot of all current infrastructure metrics for saving with test results
   */
  getInfraSnapshot(): Record<string, InfrastructureMetrics[]> {
    return this.influxService.getSnapshot();
  }

  /**
   * Query infrastructure metrics for a specific test run time range
   */
  async getInfraForTestRun(startTime: Date, endTime: Date): Promise<Record<string, InfrastructureMetrics[]>> {
    return this.influxService.queryMetricsByTestRun('', startTime, endTime);
  }

  /**
   * Get list of test runs stored in InfluxDB
   */
  async handleGetTestRuns(res: http.ServerResponse): Promise<void> {
    try {
      if (!this.testMetricsWriter?.isEnabled()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ enabled: false, runs: [] }));
        return;
      }

      const runs = await this.testMetricsWriter.getTestRuns(100);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        enabled: true,
        runs
      }));
    } catch (error: any) {
      logger.error('Failed to get test runs:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * Query test results from InfluxDB for a specific test run
   */
  async handleGetTestMetrics(res: http.ServerResponse, url: URL): Promise<void> {
    try {
      if (!this.testMetricsWriter?.isEnabled()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ enabled: false, results: [], networkCalls: [] }));
        return;
      }

      const testId = url.searchParams.get('testId') || undefined;
      const testName = url.searchParams.get('testName') || undefined;
      const startTime = url.searchParams.get('start') ? new Date(url.searchParams.get('start')!) : undefined;
      const endTime = url.searchParams.get('end') ? new Date(url.searchParams.get('end')!) : undefined;
      const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined;

      const results = await this.testMetricsWriter.queryResults({
        testId,
        testName,
        startTime,
        endTime,
        limit
      });

      const networkCalls = await this.testMetricsWriter.queryNetworkCalls({
        testId,
        testName,
        startTime,
        endTime,
        limit
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        enabled: true,
        results,
        networkCalls
      }));
    } catch (error: any) {
      logger.error('Failed to get test metrics:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * Export test data from InfluxDB
   */
  async handleExportTestData(res: http.ServerResponse, url: URL): Promise<void> {
    try {
      if (!this.testMetricsWriter?.isEnabled()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'InfluxDB not enabled' }));
        return;
      }

      const testId = url.searchParams.get('testId');
      const format = (url.searchParams.get('format') || 'json') as 'json' | 'csv';

      if (!testId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'testId parameter required' }));
        return;
      }

      const data = await this.testMetricsWriter.exportTestData(testId, format);

      const contentType = format === 'csv' ? 'text/csv' : 'application/json';
      const filename = `test-data-${testId}.${format}`;

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`
      });
      res.end(data);
    } catch (error: any) {
      logger.error('Failed to export test data:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * Get InfluxDB status for test metrics
   */
  async handleGetTestMetricsStatus(res: http.ServerResponse): Promise<void> {
    const enabled = this.testMetricsWriter?.isEnabled() || false;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      influxdb_enabled: enabled,
      message: enabled ? 'Test metrics storage active' : 'Test metrics stored in files only'
    }));
  }

  private async readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }
}
