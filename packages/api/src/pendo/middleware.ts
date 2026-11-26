import { getTenantId, logger } from '@librechat/data-schemas';
import type { Request, RequestHandler } from 'express';
import type { PendoTrackProperties } from './track';
import { getPendoTrackConfig, trackPendoEvent } from './track';
import { getSafeErrorMetadata } from '~/utils/errors';

type TrackedRequest = Request & {
  user?: { id?: string; _id?: { toString: () => string }; tenantId?: string };
};

export interface PendoTrackDetails {
  visitorId?: string;
  accountId?: string;
  properties?: PendoTrackProperties;
}

/**
 * Reads a successful response's request and JSON body. Returns the event's details, or `null`
 * when the response does not represent the tracked outcome.
 */
export type PendoTrackResolver = (req: Request, body: unknown) => PendoTrackDetails | null;

/**
 * Express middleware that sends a Track Event once the route answers with a 2xx status. The
 * visitor defaults to the authenticated user and the account to the user's tenant. When tracking
 * is not configured, the middleware passes the request through untouched.
 */
export function pendoTrack(event: string, resolve?: PendoTrackResolver): RequestHandler {
  return (req, res, next) => {
    if (!getPendoTrackConfig()) {
      next();
      return;
    }
    const tenantId = getTenantId();
    let body: unknown;
    const json = res.json;
    res.json = (payload?: unknown) => {
      body = payload;
      return json.call(res, payload);
    };
    res.once('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return;
      }
      try {
        const details = resolve ? resolve(req, body) : {};
        if (!details) {
          return;
        }
        const { user } = req as TrackedRequest;
        trackPendoEvent({
          event,
          visitorId: details.visitorId ?? user?.id ?? user?._id?.toString(),
          accountId: details.accountId ?? user?.tenantId ?? tenantId,
          properties: details.properties,
        });
      } catch (error) {
        logger.warn(
          `[pendo] Could not resolve track event "${event}"`,
          getSafeErrorMetadata(error),
        );
      }
    });
    next();
  };
}
