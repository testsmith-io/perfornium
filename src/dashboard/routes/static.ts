import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../../utils/logger';

export class StaticRoutes {
  private templatesDir: string;

  constructor() {
    this.templatesDir = path.join(__dirname, '../templates');
  }

  async serve(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<void> {
    try {
      let filePath: string;
      let contentType: string;

      if (pathname === '/' || pathname === '/index.html') {
        filePath = path.join(this.templatesDir, 'index.html');
        contentType = 'text/html';
      } else if (pathname === '/styles.css') {
        filePath = path.join(this.templatesDir, 'styles.css');
        contentType = 'text/css';
      } else if (pathname.startsWith('/scripts/')) {
        filePath = path.join(this.templatesDir, pathname);
        contentType = 'application/javascript';
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (error) {
      logger.error(`Failed to serve static file ${pathname}:`, error);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  }
}
