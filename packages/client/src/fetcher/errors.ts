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

  static async fromResponse(res: Response): Promise<ApiHttpError> {
    const ct = res.headers.get('content-type') ?? '';
    const body = ct.includes('application/json')
      ? await res.json().catch(() => null)
      : await res.text().catch(() => '');
    return new ApiHttpError(res.status, res.statusText, body);
  }
}
