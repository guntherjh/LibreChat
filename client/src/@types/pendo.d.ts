/** Novus by Pendo agent. The install snippet in `index.html` stubs it before the agent loads. */
interface PendoTransform {
  attr: 'search' | 'hash' | 'pathname' | 'hostname' | 'href' | 'protocol';
  action: 'AllowOnlyKeys' | 'ExcludeKeys' | 'AddTo' | 'Replace' | 'Clear' | 'ForceSecure';
  data?: (value: string, url: URL) => string | string[];
}

interface PendoIdentity {
  visitor: Record<string, unknown>;
  account?: Record<string, unknown>;
}

interface Pendo {
  initialize: (options: PendoIdentity & { location?: { transforms: PendoTransform[] } }) => void;
  identify: (identity: PendoIdentity) => void;
  /** Defined by the loaded agent only; the snippet stub does not provide it. */
  clearSession?: () => void;
}

interface Window {
  pendo?: Pendo;
}
