---
'@dudousxd/nestjs-inertia': patch
---

Fix `suppressPostSendWrites` swallowing `res.end()` on streaming responses.

`end` was gated on `res.headersSent`, but streaming handlers (SSE, NDJSON,
file downloads) flush headers first, stream the body, and only then call
`end()` — which the wrapper silently dropped. The chunked terminator was
never written, so the connection hung until the client/proxy idle timeout
(behind an AWS ALB this surfaces in the browser as
`ERR_HTTP2_PROTOCOL_ERROR`). `end` is now gated on `res.writableEnded`
(the condition that actually means "already sent" for `end`), while
`status`/`json`/`send`/`header`/`setHeader` keep the `headersSent` guard.
