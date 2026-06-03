type Anyfn = (...args: unknown[]) => unknown;

type Patchable = {
  headersSent: boolean;
  writableEnded?: boolean;
  status: Anyfn;
  json: Anyfn;
  send: Anyfn;
  header: Anyfn;
  setHeader: Anyfn;
  end: Anyfn;
};

/**
 * Methods that only make sense before the headers go out. Once
 * `headersSent` is true, calling any of these would throw
 * ERR_HTTP_HEADERS_SENT — suppressing them is safe and intended.
 */
const HEADER_DEPENDENT_KEYS = [
  'status',
  'json',
  'send',
  'header',
  'setHeader',
] as const;

export function suppressPostSendWrites(res: Patchable): void {
  for (const key of HEADER_DEPENDENT_KEYS) {
    const original = (res[key] as Anyfn).bind(res);
    (res as unknown as Record<string, Anyfn>)[key] = (...args: unknown[]) =>
      res.headersSent ? res : original(...args);
  }

  // `end` must NOT be gated on `headersSent`: streaming responses (SSE,
  // NDJSON, file downloads) flush headers first, stream the body, and only
  // then call `end()`. Gating on `headersSent` swallowed that final `end()`,
  // leaving chunked responses without their terminator — the connection then
  // hangs until the client/proxy idle timeout (behind an ALB this surfaces
  // in the browser as ERR_HTTP2_PROTOCOL_ERROR). The condition that actually
  // means "this response is already sent" for `end` is `writableEnded`.
  const originalEnd = (res.end as Anyfn).bind(res);
  (res as unknown as Record<string, Anyfn>).end = (...args: unknown[]) =>
    res.writableEnded ? res : originalEnd(...args);
}
