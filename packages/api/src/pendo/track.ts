import axios from 'axios';
import { logger, getTenantId } from '@librechat/data-schemas';
import type { Request, RequestHandler, Response } from 'express';
import { getSafeErrorMetadata } from '~/utils/errors';
import { REFRESH_TOKEN_COOKIE } from '~/oauth/csrf';

const DEFAULT_DATA_HOST = 'data.pendo-security.pendo-dev.com';
const TIMEOUT_MS = 5000;
const SYSTEM_ID = 'system';

export type TrackValue = string | number | boolean | null | undefined;
export type TrackProperties = Record<string, TrackValue>;

/** The account an event is attributed to. Any authenticated `req.user` fits. */
export interface TrackUser {
  id?: string;
  _id?: { toString(): string } | string;
  tenantId?: string | null;
  role?: string;
}

/** Answers the properties for a successful response, or `null` when it should not count. */
export type TrackResolver = (req: Request, res: Response) => TrackProperties | null;

type TrackRequest = Request & { user?: TrackUser };

function readTenant(): string | undefined {
  try {
    return getTenantId();
  } catch {
    return undefined;
  }
}

function compact(properties: TrackProperties): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value != null) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Sends a Pendo Track Event without blocking the caller. Tracking stays off until
 * `PENDO_TRACK_EVENT_SECRET` is set, and a failed delivery is logged, never thrown.
 */
export function trackEvent(
  event: string,
  user: TrackUser | null | undefined,
  properties: TrackProperties = {},
  tenantId?: string,
): void {
  const key = process.env.PENDO_TRACK_EVENT_SECRET;
  if (!key) {
    return;
  }
  try {
    const host = process.env.PENDO_DATA_HOST || DEFAULT_DATA_HOST;
    const visitorId = user?.id ?? user?._id?.toString();
    const accountId = user?.tenantId || tenantId || readTenant();
    const body = {
      type: 'track',
      event,
      visitorId: visitorId || SYSTEM_ID,
      accountId: accountId || SYSTEM_ID,
      timestamp: Date.now(),
      properties: compact({ user_role: user?.role, ...properties }),
    };
    axios
      .post(`https://${host}/data/track`, body, {
        headers: { 'Content-Type': 'application/json', 'x-pendo-integration-key': key },
        timeout: TIMEOUT_MS,
      })
      .catch((error: unknown) => {
        logger.warn(`[pendo] Failed to send "${event}"`, getSafeErrorMetadata(error));
      });
  } catch (error) {
    logger.warn(`[pendo] Failed to send "${event}"`, getSafeErrorMetadata(error));
  }
}

/**
 * Route middleware that sends `event` once the response finishes with a 2xx status.
 * Place it before the handler that writes the response.
 */
export function trackOnSuccess(event: string, resolve?: TrackResolver): RequestHandler {
  return (req, res, next) => {
    const tenantId = readTenant();
    res.once('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return;
      }
      try {
        const properties = resolve ? resolve(req, res) : {};
        if (properties != null) {
          trackEvent(event, (req as TrackRequest).user, properties, tenantId);
        }
      } catch (error) {
        logger.warn(`[pendo] Failed to read "${event}"`, getSafeErrorMetadata(error));
      }
    });
    next();
  };
}

/** Whether this response set a new refresh token cookie, which only a minted session does. */
export function hasIssuedSession(res: Response): boolean {
  const header = res.getHeader('Set-Cookie');
  const cookies = Array.isArray(header) ? header : [header];
  const prefix = `${REFRESH_TOKEN_COOKIE}=`;
  return cookies.some(
    (cookie) =>
      typeof cookie === 'string' && cookie.startsWith(prefix) && !cookie.startsWith(`${prefix};`),
  );
}
