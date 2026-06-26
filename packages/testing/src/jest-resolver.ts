/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
// Custom Jest resolver that forces `ws` to resolve to its CommonJS (Node)
// build. Originally a workaround for https://github.com/websockets/ws/pull/2118.
//
// The jsdom test environment resolves packages using the `browser` export
// condition, which would select ws's browser stub. Under Jest 30 the export
// conditions resolution otherwise selects ws's ESM build (`wrapper.mjs`), whose
// default export is the `WebSocket` class *without* the static `WebSocket.Server`
// used by the `@jupyterlab/services` test helpers. Resolving `ws` to its
// CommonJS entry point (`index.js`) exposes `WebSocket.Server`/`WebSocketServer`.

type IResolverOptions = {
  defaultResolver: (request: string, options: IResolverOptions) => string;
  [key: string]: unknown;
};

module.exports = (request: string, options: IResolverOptions): string => {
  if (request === 'ws') {
    return require.resolve('ws');
  }
  // Call the defaultResolver, so we leverage its cache, error handling, etc.
  return options.defaultResolver(request, options);
};
