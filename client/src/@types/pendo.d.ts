/** The Novus by Pendo agent. The install snippet in `client/index.html` defines it before the app loads. */
type PendoValue = string | number | boolean | string[] | undefined;

interface PendoTransform {
  attr: 'search' | 'hash' | 'pathname' | 'hostname' | 'href' | 'protocol';
  action: string;
  data?: (value: string, url?: URL) => string | string[];
}

interface PendoOptions {
  visitor: Record<string, PendoValue>;
  account?: Record<string, PendoValue>;
  location?: { transforms: PendoTransform[] };
}

interface Pendo {
  initialize: (options: PendoOptions) => void;
  identify: (options: PendoOptions) => void;
  /** The snippet does not stub this one: it exists only once the agent script has loaded. */
  clearSession?: () => void;
}

// eslint-disable-next-line no-var
declare var pendo: Pendo | undefined;
