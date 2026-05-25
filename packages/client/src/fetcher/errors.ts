/* v8 ignore next -- class declaration is not a branch */
export class ApiHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
  ) {
    super(`HTTP ${status} ${statusText}`);
    this.name = 'ApiHttpError';
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isClient(): boolean {
    return this.status >= 400 && this.status < 500;
  }
  get isServer(): boolean {
    return this.status >= 500;
  }

  /**
   * Returns a JSON-serializable representation of the error.
   * The `body` field is **redacted by default** to prevent accidental logging of
   * sensitive response bodies (e.g. API error payloads that may contain PII).
   *
   * Pass `verbose = true` to include the full body in the output.
   *
   * @example
   * ```ts
   * // Safe: body is redacted
   * JSON.stringify(err);                  // { ..., body: '[redacted]' }
   *
   * // Verbose: includes full body (use only in trusted contexts)
   * JSON.stringify(err.toJSON(true));     // { ..., body: { message: '...' } }
   * ```
   */
  toJSON(verbose = false): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      statusText: this.statusText,
      body: verbose ? this.body : '[redacted — pass verbose=true to include]',
    };
  }

  static async fromResponse(res: Response): Promise<ApiHttpError> {
    const ct = res.headers.get('content-type') ?? '';
    const body = ct.includes('application/json')
      ? await res.json().catch(() => null)
      : await res.text().catch(() => '');
    return new ApiHttpError(res.status, res.statusText, body);
  }
}
