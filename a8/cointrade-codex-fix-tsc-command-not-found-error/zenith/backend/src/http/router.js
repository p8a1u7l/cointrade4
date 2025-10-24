function normalizePath(path) {
  if (!path || path === '/') return [];
  return path.split('/').filter(Boolean);
}

function matchRoute(route, segments) {
  if (route.parts.length !== segments.length) {
    return null;
  }
  const params = {};
  for (let i = 0; i < route.parts.length; i += 1) {
    const part = route.parts[i];
    const segment = segments[i];
    if (part.startsWith(':')) {
      params[part.slice(1)] = decodeURIComponent(segment);
      continue;
    }
    if (part !== segment) {
      return null;
    }
  }
  return params;
}

export class Router {
  constructor() {
    this.routes = [];
    this.mounts = [];
  }

  addRoute(method, path, handler) {
    this.routes.push({ method, parts: normalizePath(path), handler });
  }

  get(path, handler) {
    this.addRoute('GET', path, handler);
  }

  post(path, handler) {
    this.addRoute('POST', path, handler);
  }

  put(path, handler) {
    this.addRoute('PUT', path, handler);
  }

  delete(path, handler) {
    this.addRoute('DELETE', path, handler);
  }

  use(pathOrRouter, maybeRouter) {
    if (typeof pathOrRouter === 'string') {
      if (!maybeRouter) {
        throw new Error('Router instance is required when mounting by path');
      }
      this.mounts.push({ parts: normalizePath(pathOrRouter), router: maybeRouter });
      return;
    }
    if (maybeRouter) {
      throw new Error('Cannot provide router argument when mounting without a path');
    }
    this.mounts.push({ parts: [], router: pathOrRouter });
  }

  async handle(req, res, segments) {
    for (const mount of this.mounts) {
      if (mount.parts.length === 0) {
        const handled = await mount.router.handle(req, res, segments);
        if (handled || res.finished) {
          return true;
        }
        continue;
      }
      if (mount.parts.length > segments.length) {
        continue;
      }
      let matches = true;
      for (let i = 0; i < mount.parts.length; i += 1) {
        if (mount.parts[i] !== segments[i]) {
          matches = false;
          break;
        }
      }
      if (!matches) {
        continue;
      }
      const childSegments = segments.slice(mount.parts.length);
      const handled = await mount.router.handle(req, res, childSegments);
      if (handled || res.finished) {
        return true;
      }
    }

    for (const route of this.routes) {
      if (route.method !== req.method) {
        continue;
      }
      const params = matchRoute(route, segments);
      if (!params) {
        continue;
      }
      req.params = params;
      await Promise.resolve(route.handler(req, res));
      return true;
    }

    return false;
  }
}
