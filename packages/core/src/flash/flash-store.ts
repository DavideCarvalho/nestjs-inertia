export type FlashErrors = Record<string, string | Record<string, string>>;

export interface FlashStore {
  read(req: unknown): FlashErrors | Promise<FlashErrors>;
  write?(req: unknown, errors: FlashErrors): void | Promise<void>;
}
