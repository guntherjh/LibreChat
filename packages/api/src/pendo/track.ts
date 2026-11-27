import { logger, getTenantId } from '@librechat/data-schemas';
import type { Request, RequestHandler, Response } from 'express';
import { getSafeErrorMetadata } from '~/utils/errors';

/** Property values Pendo accepts; `undefined` entries are dropped before sending. */
export type PendoValue = string | number | boolean | null | undefined;
export type PendoProperties = Record<string, PendoValue>;

/** Anything that renders as an identifier, such as a string or a Mongo ObjectId. */
export type PendoId = string | { toString(): string };

/** The fields of a user record that name a Pendo visitor and account. */
export interface PendoUser {
  id?: PendoId | null;
  _id?: PendoId | null;
  tenantId?: PendoId | null;
  orgId?: PendoId | null;
}

export interface PendoEvent {
  /** Registered Pendo track type name; sent verbatim. */
  event: string;
  user?: PendoUser | null;
  /** Account fallback when the user record carries no tenant, such as the request's tenant. */
  tenantId?: string;
  properties?: PendoProperties;
}

export interface PendoRouteContext {
  req: Request;
  res: Response;
  /** The JSON object the handler answered with, or the last SSE `data` event it streamed. */
  body?: Record<string, unknown>;
}

/** How one route outcome maps to a track event. Every callback runs after a 2xx response. */
export interface PendoRouteEvent {
  /** Fires only when this returns true. Defaults to every 2xx response. */
  when?: (context: PendoRouteContext) => boolean;
  /** The visitor. Defaults to the authenticated `req.user`. */
  user?: (context: PendoRouteContext) => PendoUser | null | undefined;
  properties?: (context: PendoRouteContext) => PendoProperties;
  /** Names one business action so an idempotent replay in this process does not fire twice. */
  key?: (context: PendoRouteContext) => string | undefined;
  /** Reads the body from SSE `data` events, for handlers that may answer over a stream. */
  stream?: boolean;
}

export interface PendoConfig {
  /** Pendo data host, such as `data.pendo.io`. Tracking is off without a host and a key. */
  host?: string;
  /** Track Event integration key. A server-side credential: read it from the environment. */
  key?: string;
  /** Request timeout for one event. */
  timeoutMs?: number;
  fetch?: typeof fetch;
  /** Route event definitions, keyed by track type name. */
  routes?: Record<string, PendoRouteEvent>;
}

export interface PendoTracker {
  enabled: boolean;
  /** Sends one event in the background. Never throws and never delays the caller. */
  track: (event: PendoEvent) => void;
  /** Middleware that sends `event` once the route answers with a 2xx status. */
  route: (event: string, extra?: PendoProperties) => RequestHandler;
}

const SYSTEM = 'system';
const MAX_KEYS = 5000;
const MAX_STRING = 200;
const DEFAULT_TIMEOUT_MS = 5000;

export function isPendoRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && !Buffer.isBuffer(value)
  );
}

const SSE_DATA = /^event:data\n(?:id:[^\n]*\n)?data:([\s\S]*)\n\n$/;

/** Parses the payload of one SSE `data` event written as a string. */
function readSseData(chunk: unknown): Record<string, unknown> | undefined {
  if (typeof chunk !== 'string') {
    return undefined;
  }
  const match = SSE_DATA.exec(chunk);
  if (!match) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(match[1]);
    return isPendoRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function toId(value: PendoId | null | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  const id = typeof value === 'string' ? value : value.toString();
  return id.length > 0 ? id : undefined;
}

function cleanProperties(
  properties: PendoProperties = {},
): Record<string, string | number | boolean | null> {
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [name, value] of Object.entries(properties)) {
    if (value === undefined) {
      continue;
    }
    clean[name] = typeof value === 'string' ? value.slice(0, MAX_STRING) : value;
  }
  return clean;
}

function currentTenantId(): string | undefined {
  try {
    return getTenantId();
  } catch {
    return undefined;
  }
}

export function createPendoTracker(config: PendoConfig): PendoTracker {
  const host = config.host
    ?.trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  const key = config.key?.trim();
  const enabled = Boolean(host && key);
  const send = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const routes = config.routes ?? {};
  const seen = new Set<string>();

  /** Remembers a business action; false when it already fired in this process. */
  const remember = (id: string): boolean => {
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    if (seen.size > MAX_KEYS) {
      const oldest = seen.values().next().value;
      if (oldest !== undefined) {
        seen.delete(oldest);
      }
    }
    return true;
  };

  const deliver = async (event: PendoEvent): Promise<void> => {
    const user = event.user ?? undefined;
    const payload = {
      type: 'track',
      event: event.event,
      visitorId: toId(user?.id) ?? toId(user?._id) ?? SYSTEM,
      accountId: toId(user?.tenantId) ?? toId(user?.orgId) ?? event.tenantId ?? SYSTEM,
      timestamp: Date.now(),
      properties: cleanProperties(event.properties),
    };
    try {
      const response = await send(`https://${host}/data/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pendo-integration-key': key ?? '',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        logger.warn(
          `[Pendo] Track event "${event.event}" was rejected [status: ${response.status}]`,
        );
      }
    } catch (error) {
      logger.warn(`[Pendo] Track event "${event.event}" failed`, getSafeErrorMetadata(error));
    }
  };

  const track = (event: PendoEvent): void => {
    if (!enabled) {
      return;
    }
    void deliver(event);
  };

  const route = (event: string, extra?: PendoProperties): RequestHandler => {
    const definition = routes[event] ?? {};
    return (req, res, next) => {
      if (!enabled) {
        return next();
      }
      const tenantId = currentTenantId();
      let body: Record<string, unknown> | undefined;
      const json = res.json;
      res.json = function (this: Response, value?: unknown) {
        if (isPendoRecord(value)) {
          body = value;
        }
        return json.call(this, value);
      };
      const reply = res.send;
      res.send = function (this: Response, value?: unknown) {
        if (isPendoRecord(value)) {
          body = value;
        }
        return reply.call(this, value);
      };
      if (definition.stream) {
        const write = res.write;
        res.write = function (this: Response, ...args: Parameters<Response['write']>) {
          body = readSseData(args[0]) ?? body;
          return write.apply(this, args);
        } as Response['write'];
      }
      res.once('finish', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return;
        }
        try {
          const context: PendoRouteContext = { req, res, body };
          if (definition.when && !definition.when(context)) {
            return;
          }
          const id = definition.key?.(context);
          if (id != null && !remember(`${event}:${id}`)) {
            return;
          }
          track({
            event,
            user: definition.user ? definition.user(context) : req.user,
            tenantId,
            properties: { ...definition.properties?.(context), ...extra },
          });
        } catch (error) {
          logger.warn(
            `[Pendo] Track event "${event}" could not be built`,
            getSafeErrorMetadata(error),
          );
        }
      });
      next();
    };
  };

  return { enabled, track, route };
}
