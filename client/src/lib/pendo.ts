import type * as t from 'librechat-data-provider';

/** The user response also carries these (`PUBLIC_USER_RESPONSE_FIELDS`), but `TUser` omits them. */
type Profile = t.TUser & { emailVerified?: boolean; termsAccepted?: boolean };

/** Pages whose emailed links put a token, user ID, or email address in the query string. */
const credentialPage = /\/(?:verify|register|reset-password)\/?$/;

/**
 * Starts the agent once per page with an anonymous visitor; `identifyPendo` names the user later.
 * The transforms keep credentials out of every URL the agent records, without touching the
 * browser URL. The router uses paths, not the fragment, so clearing the fragment loses no page
 * identity and drops the channel link ticket. `tempToken` is unique to the two-factor step, while
 * the generic names are stripped only on the pages that receive them.
 */
export function initializePendo(): void {
  window.pendo?.initialize({
    visitor: { id: '' },
    location: {
      transforms: [
        { attr: 'hash', action: 'Clear' },
        {
          attr: 'search',
          action: 'ExcludeKeys',
          data: (_search, url) =>
            credentialPage.test(url?.pathname ?? '')
              ? ['tempToken', 'token', 'userId', 'email']
              : ['tempToken'],
        },
      ],
    },
  });
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
      termsAccepted: user.termsAccepted,
      memoriesEnabled: user.personalization?.memories,
      statefulCodeEnvironment: user.personalization?.statefulCodeEnvironment,
      plugins: user.plugins,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    /** Single-tenant deployments have no tenant, so they report no account. */
    ...(user.tenantId ? { account: { id: user.tenantId, tenantId: user.tenantId } } : {}),
  });
}

export function clearPendoSession(): void {
  window.pendo?.clearSession?.();
}
