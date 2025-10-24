import { createServer } from 'node:http';
import { Router } from './router.js';

function parseQuery(search) {
  if (!search) return {};
  const query = new URLSearchParams(search);
  const result = {};
  query.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

async function readBody(req) {
  const method = req.method?.toUpperCase();
  if (!method || method === 'GET' || method === 'HEAD') {
    return undefined;
  }

  return await new Promise((resolve, reject) => {
    const decoder = new TextDecoder('utf-8');
    let raw = '';
    req.on('data', (chunk) => {
      raw += decoder.decode(chunk, { stream: true });
    });
    req.on('end', () => {
      raw += decoder.decode();
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function enhanceResponse(res) {
  let ended = false;
  const ensureHeaders = () => {
    if (!ended) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    }
  };

  const context = {
    status(code) {
      res.statusCode = code;
      return context;
    },
    json(data) {
      ensureHeaders();
      res.setHeader('Content-Type', 'application/json');
      ended = true;
      res.end(JSON.stringify(data));
    },
    send(data) {
      ensureHeaders();
      if (typeof data === 'object' && data !== null) {
        res.setHeader('Content-Type', 'application/json');
        ended = true;
        res.end(JSON.stringify(data));
        return;
      }
      ended = true;
      res.end(String(data ?? ''));
    },
    get finished() {
      return ended || res.writableEnded === true;
    },
  };

  return context;
}

export class App extends Router {
  constructor() {
    super();
    this.errorHandler = (error, _req, res) => {
      if (res.finished) return;
      const message = error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ error: message });
    };
  }

  setErrorHandler(handler) {
    this.errorHandler = handler;
  }

  listen(port, callback) {
    const server = createServer(async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
        res.end();
        return;
      }

      const url = req.url ?? '/';
      const [path, search] = url.split('?');
      const segments = path.split('/').filter(Boolean);
      let body;
      try {
        body = await readBody(req);
      } catch (error) {
        await Promise.resolve(
          this.errorHandler(
            error,
            {
              method: (req.method ?? 'GET').toUpperCase(),
              path,
              params: {},
              query: {},
              body: undefined,
              headers: req.headers,
            },
            enhanceResponse(res)
          )
        );
        return;
      }

      const request = {
        method: (req.method ?? 'GET').toUpperCase(),
        path,
        params: {},
        query: parseQuery(search),
        body,
        headers: req.headers,
      };
      const response = enhanceResponse(res);

      try {
        const handled = await this.handle(request, response, segments);
        if (!handled && !response.finished) {
          response.status(404).json({ error: 'Not found' });
        }
      } catch (error) {
        await Promise.resolve(this.errorHandler(error, request, response));
      }
    });

    return server.listen(port, callback);
  }
}

export function createApp() {
  return new App();
}
