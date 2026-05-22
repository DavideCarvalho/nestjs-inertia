import { Injectable } from '@nestjs/common';

@Injectable()
export class SsrLoaderService {
  async load(): Promise<null> {
    return null;
  }
}
