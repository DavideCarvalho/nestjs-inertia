type Anyfn = (...args: unknown[]) => unknown;

type Patchable = {
  headersSent: boolean;
  status: Anyfn;
  json: Anyfn;
  send: Anyfn;
  header: Anyfn;
  setHeader: Anyfn;
  end: Anyfn;
};

const KEYS = ['status', 'json', 'send', 'header', 'setHeader', 'end'] as const;

export function suppressPostSendWrites(res: Patchable): void {
  for (const key of KEYS) {
    const original = (res[key] as Anyfn).bind(res);
    (res as unknown as Record<string, Anyfn>)[key] = (...args: unknown[]) =>
      res.headersSent ? res : original(...args);
  }
}
