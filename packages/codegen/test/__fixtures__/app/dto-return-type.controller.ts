import { Controller, Get } from '@nestjs/common';

class ArticleDto {
  slug: string;
  body: string;
}

@Controller('/api/articles')
export class DtoReturnTypeController {
  @Get()
  list(): Promise<ArticleDto[]> {
    return [] as any;
  }

  @Get('/single')
  single(): ArticleDto {
    return {} as any;
  }
}
