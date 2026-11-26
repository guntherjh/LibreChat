/**
 * Build entry shim for the `@librechat/api/pendo` subpath export.
 * Re-exports the Pendo barrel under a unique basename so the bundler emits
 * stable `dist/pendo.*` output (see tsdown.config.mjs for details).
 */
export * from './pendo/index';
