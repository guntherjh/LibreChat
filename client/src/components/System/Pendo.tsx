import { useEffect } from 'react';
import type { TUser } from 'librechat-data-provider';
import { useGetStartupConfig, useUserTermsQuery, useGetUserBalance } from '~/data-provider';

/** Fields `/api/user` sends that `TUser` does not declare. */
type Profile = TUser & { emailVerified?: boolean; termsAccepted?: boolean };

const toIso = (value?: Date | string | null): string | undefined =>
  value instanceof Date ? value.toISOString() : (value ?? undefined);

/**
 * Identifies the signed-in user to Pendo, which `main.jsx` initializes anonymously.
 * Balance and terms reuse the queries the app already runs, under the same conditions.
 */
export default function Pendo({
  user,
  isAuthenticated,
}: {
  user?: Profile;
  isAuthenticated: boolean;
}) {
  const { data: config } = useGetStartupConfig({ enabled: isAuthenticated });
  const { data: balance } = useGetUserBalance({
    enabled: isAuthenticated && config?.balance?.enabled === true,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const { data: terms } = useUserTermsQuery({
    enabled: isAuthenticated && config?.interface?.termsOfService?.modalAcceptance === true,
  });

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      return;
    }
    window.pendo?.identify({
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
        termsAcceptedAt: toIso(terms?.termsAcceptedAt),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        tenantId: user.tenantId,
        plugins: user.plugins,
        memoriesEnabled: user.personalization?.memories,
        statefulCodeEnvironment: user.personalization?.statefulCodeEnvironment,
        tokenCredits: balance?.tokenCredits,
        autoRefillEnabled: balance?.autoRefillEnabled,
      },
      /** Single-tenant deployments carry no tenant, so they report no account. */
      ...(user.tenantId ? { account: { id: user.tenantId } } : {}),
    });
  }, [isAuthenticated, user, balance, terms]);

  return null;
}
