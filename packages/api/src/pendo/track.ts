import { logger, SYSTEM_TENANT_ID } from '@librechat/data-schemas';
import { createProxyAwareFetch } from '~/pulls/transport';
import { getSafeErrorMetadata } from '~/utils/errors';

const DEFAULT_DATA_HOST = 'data.pendo-security.pendo-dev.com';
const REQUEST_TIMEOUT_MS = 5000;
/** Pendo rejects a properties object over 512 bytes, so long strings are cut. */
const MAX_VALUE_LENGTH = 100;
/** Pendo's identifier for an event with no visitor or account. */
const SYSTEM_ID = 'system';

const send = createProxyAwareFetch();

export type PendoTrackValue = string | number | boolean | null | undefined;
export type PendoTrackProperties = Record<string, PendoTrackValue>;

export interface PendoTrackEvent {
  event: string;
  visitorId?: string | null;
  accountId?: string | null;
  properties?: PendoTrackProperties;
}

export interface PendoTrackConfig {
  url: string;
  secret: string;
}

/**
 * Server-side Track Events are on only when `PENDO_TRACK_EVENT_SECRET` is set. The secret is a
 * Pendo integration key, so it is read from the environment like every other credential.
 */
export function getPendoTrackConfig(env: NodeJS.ProcessEnv = process.env): PendoTrackConfig | null {
  const secret = env.PENDO_TRACK_EVENT_SECRET?.trim();
  if (!secret) {
    return null;
  }
  const host = env.PENDO_DATA_HOST?.trim() || DEFAULT_DATA_HOST;
  return { secret, url: `https://${host}/data/track` };
}

function normalizeId(value?: string | null): string {
  const id = value?.trim();
  return id && id !== SYSTEM_TENANT_ID ? id : SYSTEM_ID;
}

function cleanProperties(
  properties: PendoTrackProperties = {},
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value == null || value === '') {
      continue;
    }
    result[key] = typeof value === 'string' ? value.slice(0, MAX_VALUE_LENGTH) : value;
  }
  return result;
}

/**
 * Sends one Track Event to Pendo without blocking the caller. A failed or rejected send is logged
 * and never reaches the request that produced the event.
 */
export function trackPendoEvent({
  event,
  visitorId,
  accountId,
  properties,
}: PendoTrackEvent): void {
  const config = getPendoTrackConfig();
  if (!config) {
    return;
  }
  try {
    const body = JSON.stringify({
      type: 'track',
      event,
      visitorId: normalizeId(visitorId),
      accountId: normalizeId(accountId),
      timestamp: Date.now(),
      properties: cleanProperties(properties),
    });
    send(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pendo-integration-key': config.secret },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
      .then((res) => {
        if (!res.ok) {
          logger.warn(`[pendo] Track event "${event}" was rejected with status ${res.status}`);
        }
      })
      .catch((error: unknown) => {
        logger.warn(`[pendo] Track event "${event}" failed`, getSafeErrorMetadata(error));
      });
  } catch (error) {
    logger.warn(`[pendo] Track event "${event}" failed`, getSafeErrorMetadata(error));
  }
}
