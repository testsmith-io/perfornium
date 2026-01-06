import * as http from 'http';
import { logger } from '../../utils/logger';

interface MockOptions {
  port?: string;
  host?: string;
  delay?: string;
}

// Sample data for mock endpoints
const users = [
  { id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'admin' },
  { id: 2, name: 'Bob Smith', email: 'bob@example.com', role: 'user' },
  { id: 3, name: 'Charlie Brown', email: 'charlie@example.com', role: 'user' },
  { id: 4, name: 'Diana Prince', email: 'diana@example.com', role: 'moderator' },
  { id: 5, name: 'Eve Wilson', email: 'eve@example.com', role: 'user' },
];

const products = [
  { id: 'P001', name: 'Laptop', price: 999.99, category: 'Electronics', inStock: true },
  { id: 'P002', name: 'Smartphone', price: 599.99, category: 'Electronics', inStock: true },
  { id: 'P003', name: 'Headphones', price: 149.99, category: 'Electronics', inStock: false },
  { id: 'P004', name: 'Keyboard', price: 79.99, category: 'Accessories', inStock: true },
  { id: 'P005', name: 'Mouse', price: 39.99, category: 'Accessories', inStock: true },
];

let requestCount = 0;
const startTime = Date.now();

export async function mockCommand(options: MockOptions): Promise<void> {
  const port = parseInt(options.port || '3000');
  const host = options.host || 'localhost';
  const delay = parseInt(options.delay || '0');

  const server = http.createServer(async (req, res) => {
    requestCount++;
    const requestId = requestCount;

    // Add artificial delay if configured
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', 'application/json');

    // Handle OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${host}:${port}`);
    const path = url.pathname;

    logger.debug(`[${requestId}] ${req.method} ${path}`);

    try {
      // Route handling
      if (path === '/status' || path === '/health') {
        // Health check endpoint
        res.writeHead(200);
        res.end(JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString(),
          uptime: Math.floor((Date.now() - startTime) / 1000),
          requests: requestCount
        }));

      } else if (path === '/users' && req.method === 'GET') {
        // List users
        res.writeHead(200);
        res.end(JSON.stringify(users));

      } else if (path.match(/^\/users\/\d+$/) && req.method === 'GET') {
        // Get single user
        const id = parseInt(path.split('/')[2]);
        const user = users.find(u => u.id === id);
        if (user) {
          res.writeHead(200);
          res.end(JSON.stringify(user));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'User not found', id }));
        }

      } else if (path === '/users' && req.method === 'POST') {
        // Create user
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const newUser = {
              id: users.length + 1,
              name: data.name || 'New User',
              email: data.email || 'new@example.com',
              role: data.role || 'user'
            };
            users.push(newUser);
            res.writeHead(201);
            res.end(JSON.stringify(newUser));
          } catch {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
          }
        });
        return;

      } else if (path === '/products' && req.method === 'GET') {
        // List products with optional filtering
        const category = url.searchParams.get('category');
        const inStock = url.searchParams.get('inStock');

        let filtered = [...products];
        if (category) {
          filtered = filtered.filter(p => p.category.toLowerCase() === category.toLowerCase());
        }
        if (inStock !== null) {
          filtered = filtered.filter(p => p.inStock === (inStock === 'true'));
        }

        res.writeHead(200);
        res.end(JSON.stringify(filtered));

      } else if (path.match(/^\/products\/P\d+$/) && req.method === 'GET') {
        // Get single product
        const id = path.split('/')[2];
        const product = products.find(p => p.id === id);
        if (product) {
          res.writeHead(200);
          res.end(JSON.stringify(product));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Product not found', id }));
        }

      } else if (path === '/auth/login' && req.method === 'POST') {
        // Login endpoint
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.username && data.password) {
              res.writeHead(200);
              res.end(JSON.stringify({
                token: `mock-token-${Date.now()}`,
                user: { username: data.username, role: 'user' },
                expiresIn: 3600
              }));
            } else {
              res.writeHead(401);
              res.end(JSON.stringify({ error: 'Invalid credentials' }));
            }
          } catch {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
          }
        });
        return;

      } else if (path === '/echo' && req.method === 'POST') {
        // Echo back the request body
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          res.writeHead(200);
          res.end(JSON.stringify({
            method: req.method,
            path: path,
            headers: req.headers,
            body: body ? JSON.parse(body) : null,
            timestamp: new Date().toISOString()
          }));
        });
        return;

      } else if (path === '/delay' && req.method === 'GET') {
        // Configurable delay endpoint
        const ms = parseInt(url.searchParams.get('ms') || '1000');
        await new Promise(resolve => setTimeout(resolve, ms));
        res.writeHead(200);
        res.end(JSON.stringify({ delayed: ms, timestamp: new Date().toISOString() }));

      } else if (path === '/error' && req.method === 'GET') {
        // Simulate error responses
        const code = parseInt(url.searchParams.get('code') || '500');
        res.writeHead(code);
        res.end(JSON.stringify({ error: `Simulated ${code} error`, code }));

      } else if (path === '/random' && req.method === 'GET') {
        // Random data endpoint
        res.writeHead(200);
        res.end(JSON.stringify({
          id: Math.floor(Math.random() * 10000),
          uuid: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
          random: Math.random()
        }));

      } else {
        // 404 for unknown routes
        res.writeHead(404);
        res.end(JSON.stringify({
          error: 'Not found',
          path,
          availableEndpoints: [
            'GET  /status',
            'GET  /health',
            'GET  /users',
            'GET  /users/:id',
            'POST /users',
            'GET  /products',
            'GET  /products/:id',
            'POST /auth/login',
            'POST /echo',
            'GET  /delay?ms=1000',
            'GET  /error?code=500',
            'GET  /random'
          ]
        }));
      }
    } catch {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  server.listen(port, host, () => {
    logger.success(`\n🚀 Mock server running at http://${host}:${port}\n`);
    logger.info('Available endpoints:');
    logger.info('  GET  /status          - Health check');
    logger.info('  GET  /health          - Health check (alias)');
    logger.info('  GET  /users           - List all users');
    logger.info('  GET  /users/:id       - Get user by ID');
    logger.info('  POST /users           - Create user');
    logger.info('  GET  /products        - List products (?category=X&inStock=true)');
    logger.info('  GET  /products/:id    - Get product by ID');
    logger.info('  POST /auth/login      - Login (returns token)');
    logger.info('  POST /echo            - Echo request body');
    logger.info('  GET  /delay?ms=1000   - Delayed response');
    logger.info('  GET  /error?code=500  - Simulate error');
    logger.info('  GET  /random          - Random data');
    logger.info('\nPress Ctrl+C to stop\n');
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    logger.info('\nShutting down mock server...');
    server.close(() => {
      logger.success('Mock server stopped');
      process.exit(0);
    });
  });
}
