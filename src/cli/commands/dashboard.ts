import { DashboardServer, setDashboard } from '../../dashboard';
import { logger } from '../../utils/logger';
import { exec } from 'child_process';
import * as path from 'path';

interface DashboardOptions {
  port: string;
  results: string;
  tests?: string;
  workers?: string;
  open?: boolean;
}

export async function dashboardCommand(options: DashboardOptions): Promise<void> {
  const port = parseInt(options.port, 10);
  const resultsDir = path.resolve(options.results);
  // Default testsDir to parent of results directory (common structure: project/results, project/tests)
  const testsDir = options.tests ? path.resolve(options.tests) : path.resolve(resultsDir, '..');
  const workersFile = options.workers ? path.resolve(options.workers) : undefined;

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                   Perfornium Dashboard                        ║
╠═══════════════════════════════════════════════════════════════╣
║  Results directory: ${resultsDir.padEnd(40)} ║
║  Tests directory:   ${testsDir.padEnd(40)} ║
${workersFile ? `║  Workers file:      ${workersFile.padEnd(40)} ║\n` : ''}║  Dashboard URL:     http://localhost:${port.toString().padEnd(26)} ║
╚═══════════════════════════════════════════════════════════════╝
`);

  const dashboard = new DashboardServer({
    port,
    resultsDir,
    testsDir,
    workersFile
  });

  // Store dashboard instance globally for test runner integration
  setDashboard(dashboard);

  await dashboard.start();

  // Open browser if not disabled
  if (options.open !== false) {
    const url = `http://localhost:${port}`;
    const platform = process.platform;

    let command: string;
    if (platform === 'darwin') {
      command = `open "${url}"`;
    } else if (platform === 'win32') {
      command = `start "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }

    exec(command, (error) => {
      if (error) {
        logger.debug('Could not open browser automatically:', error.message);
      }
    });
  }

  console.log('Press Ctrl+C to stop the dashboard\n');

  // Keep running until interrupted
  process.on('SIGINT', async () => {
    console.log('\nShutting down dashboard...');
    await dashboard.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await dashboard.stop();
    process.exit(0);
  });

  // Keep the process alive
  await new Promise(() => {});
}
