let _globalHeaders: (() => Record<string, string>) | null = null;

export function setGlobalHeaders(fn: () => Record<string, string>): void {
  _globalHeaders = fn;
}

export function getGlobalHeaders(): Record<string, string> {
  return _globalHeaders?.() ?? {};
}
