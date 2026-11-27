import type { TUser, TBalanceResponse, TUserTermsResponse } from 'librechat-data-provider';

type Value = string | number | boolean | null | undefined;

/** The URL the agent hands to a transform; only the parts read here are typed. */
interface Location {
  pathname?: string;
}

interface Transform {
  attr: 'search' | 'hash';
  action: 'ExcludeKeys' | 'Clear';
  data?: (value: string, url?: Location) => string[];
}

interface Options {
  visitor: Record<string, Value>;
  account?: Record<string, Value>;
  location?: { transforms: Transform[] };
}

/** The install snippet in `index.html` stubs `initialize` and `identify` until the agent loads;
 * `clearSession` only exists once the agent script has finished loading. */
interface Pendo {
  initialize: (options: Options) => void;
  identify: (options: Options) => void;
  clearSession?: () => void;
}

declare global {
  var pendo: Pendo | undefined;
}

/**
 * Query parameters that carry a credential, keyed by the page that receives them. Matched on the
 * end of the path so a deployment served under a base path is covered too, and gated per page so
 * an ordinary `token` parameter elsewhere in the app is still recorded.
 */
const credentials: [RegExp, string[]][] = [
  [/\/login\/2fa\/?$/, ['tempToken']],
  [/\/(?:verify|reset-password)\/?$/, ['token']],
];

/** Runs on every URL the agent records, so it must never throw: a failed transform makes the
 * agent fall back to the untransformed URL. */
const transforms: Transform[] = [
  {
    attr: 'search',
    action: 'ExcludeKeys',
    data: (_search, url) => {
      const path = typeof url?.pathname === 'string' ? url.pathname : '';
      return credentials.find(([route]) => route.test(path))?.[1] ?? [];
    },
  },
  /* The router is path-based, so a fragment never identifies a page. The channel link page
   * receives its one-time ticket there. */
  { attr: 'hash', action: 'Clear' },
];

/** Boots the agent once per page as an anonymous visitor; `identifyPendo` names the user later. */
export function initializePendo(): void {
  globalThis.pendo?.initialize({ visitor: { id: '' }, location: { transforms } });
}

/** ISO 8601, or nothing for an absent or unparsable date. */
function iso(value: Date | string | null | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Names the signed-in user. Balance and terms come from whatever the app has already fetched. */
export function identifyPendo(
  user: TUser,
  balance?: TBalanceResponse,
  terms?: TUserTermsResponse,
): void {
  globalThis.pendo?.identify({
    visitor: {
      id: user.id,
      email: user.email,
      full_name: user.name,
      username: user.username,
      role: user.role,
      provider: user.provider,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      termsAccepted: terms?.termsAccepted ?? user.termsAccepted,
      termsAcceptedAt: iso(terms?.termsAcceptedAt),
      memoriesEnabled: user.personalization?.memories,
      statefulCodeEnvironment: user.personalization?.statefulCodeEnvironment,
      tokenCredits: balance?.tokenCredits,
      autoRefillEnabled: balance?.autoRefillEnabled,
      tenantId: user.tenantId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    ...(user.tenantId ? { account: { id: user.tenantId } } : {}),
  });
}

/** Starts a fresh anonymous visitor so the next sign-in is not attributed to this user. */
export function clearPendoSession(): void {
  globalThis.pendo?.clearSession?.();
}
