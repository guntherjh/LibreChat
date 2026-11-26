type PendoValue = string | number | boolean | string[];

type PendoRecord = { id: string } & Record<string, PendoValue | undefined>;

interface PendoIdentity {
  visitor: PendoRecord;
  account?: PendoRecord;
}

interface PendoTransform {
  attr: 'search' | 'hash' | 'pathname' | 'hostname' | 'href' | 'protocol';
  action: 'AllowOnlyKeys' | 'ExcludeKeys' | 'AddTo' | 'Replace' | 'Clear' | 'ForceSecure';
  data?: string | string[] | ((value: string, url: URL) => string | string[]);
}

/** The agent loaded by the install snippet in `index.html`. */
interface Pendo {
  initialize(options: PendoIdentity & { location?: { transforms: PendoTransform[] } }): void;
  identify(options: PendoIdentity): void;
  /** The install snippet does not stub this: it exists only once the agent script has loaded. */
  clearSession?: () => void;
}

// eslint-disable-next-line no-var
declare var pendo: Pendo | undefined;
