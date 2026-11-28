import { logger, getTenantId } from '@librechat/data-schemas';
import type { Request, Response } from 'express';

const DEFAULT_HOST = 'data.pendo-security.pendo-dev.com';
const TIMEOUT_MS = 5000;
const MAX_STRING_LENGTH = 100;

export type PendoValue = string | number | boolean;
export type PendoProperties = Record<string, PendoValue | null | undefined>;

/** A request user, a stored user document, or a principal: anything carrying an id. */
export interface PendoUser {
  id?: string;
  _id?: { toString(): string } | string;
  tenantId?: string | null;
  orgId?: string | null;
}

function identify(user?: PendoUser | null): { visitorId: string; accountId: string } {
  const visitorId = user?.id ?? user?._id?.toString();
  const accountId = user?.tenantId || user?.orgId || getTenantId();
  return { visitorId: visitorId || 'system', accountId: accountId || 'system' };
}

function clean(properties: PendoProperties): Record<string, PendoValue> {
  const result: Record<string, PendoValue> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value == null) {
      continue;
    }
    result[key] = typeof value === 'string' ? value.slice(0, MAX_STRING_LENGTH) : value;
  }
  return result;
}

/**
 * Sends a server-side Pendo Track Event without blocking or failing the caller.
 * A no-op unless `PENDO_TRACK_EVENT_SECRET` is set; `PENDO_DATA_HOST` overrides the data host.
 * The account falls back to the request's tenant, then to `system` in single-tenant deployments.
 */
export function trackPendoEvent(
  event: string,
  user?: PendoUser | null,
  properties: PendoProperties = {},
): void {
  const secret = process.env.PENDO_TRACK_EVENT_SECRET;
  if (!secret) {
    return;
  }
  try {
    const host = process.env.PENDO_DATA_HOST || DEFAULT_HOST;
    const body = JSON.stringify({
      type: 'track',
      event,
      ...identify(user),
      timestamp: Date.now(),
      properties: clean(properties),
    });
    fetch(`https://${host}/data/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pendo-integration-key': secret },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
      .then((res) => {
        if (!res.ok) {
          logger.warn(`[pendo] Track event "${event}" was rejected with status ${res.status}`);
        }
      })
      .catch((error: Error) => {
        logger.warn(`[pendo] Track event "${event}" could not be sent: ${error.name}`);
      });
  } catch (error) {
    logger.warn(`[pendo] Track event "${event}" could not be built`, error);
  }
}

/**
 * Route middleware for handlers that own their response: sends `event` once the response
 * finishes with a 2xx status, so a refused or failed request is never counted.
 */
export function trackPendoSuccess(event: string, describe?: (req: Request) => PendoProperties) {
  return (req: Request, res: Response, next: () => void): void => {
    res.once('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return;
      }
      try {
        trackPendoEvent(event, req.user as PendoUser | undefined, describe?.(req));
      } catch (error) {
        logger.warn(`[pendo] Track event "${event}" could not be described`, error);
      }
    });
    next();
  };
}
