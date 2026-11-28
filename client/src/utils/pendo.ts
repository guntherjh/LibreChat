import type * as t from 'librechat-data-provider';

/** Profile fields the user document carries beyond the shared `TUser` type. */
type Profile = t.TUser & {
  emailVerified?: boolean;
  termsAccepted?: boolean;
  termsAcceptedAt?: string;
  twoFactorEnrolledAt?: string;
};

/**
 * Credentials that auth pages read from their own query string, keyed by the page. `token` is
 * a generic name, so it is only dropped on the pages that carry one as a credential.
 */
const secrets: [RegExp, string[]][] = [
  [/\/login\/2fa\/?$/, ['tempToken']],
  [/\/(?:reset-password|verify)\/?$/, ['token']],
];

/** The channel link page receives its one-time ticket as the whole fragment. */
const ticketPage = /\/channels\/link\/?$/;

const pathOf = (url: URL | undefined): string => String(url?.pathname ?? '');

/**
 * Applied to every URL the agent records, never to the browser's own URL. A transform that
 * throws makes the agent record the untransformed URL, so these only read and never throw.
 */
const transforms: PendoTransform[] = [
  {
    attr: 'search',
    action: 'ExcludeKeys',
    data: (_search, url) => {
      const path = pathOf(url);
      const match = secrets.find(([page]) => page.test(path));
      return match ? match[1] : [];
    },
  },
  {
    attr: 'hash',
    action: 'Replace',
    data: (hash, url) => (ticketPage.test(pathOf(url)) ? '' : String(hash ?? '')),
  },
];

/** Boots the agent once per page with an anonymous visitor; sign-in identifies it later. */
export function initializePendo(): void {
  window.pendo?.initialize({ visitor: { id: '' }, location: { transforms } });
}

export function identifyPendo(user: Profile): void {
  window.pendo?.identify({
    visitor: {
      id: user.id,
      email: user.email,
      full_name: user.name,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
      provider: user.provider,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorEnrolledAt: user.twoFactorEnrolledAt,
      termsAccepted: user.termsAccepted,
      termsAcceptedAt: user.termsAcceptedAt,
      plugins: user.plugins,
      memories: user.personalization?.memories,
      statefulCodeEnvironment: user.personalization?.statefulCodeEnvironment,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    /** Single-tenant deployments have no tenant, so their visitors carry no account. */
    ...(user.tenantId ? { account: { id: user.tenantId, tenantId: user.tenantId } } : {}),
  });
}

/** Starts a fresh anonymous visitor so the next sign-in is not merged into this one. */
export function clearPendo(): void {
  window.pendo?.clearSession?.();
}
