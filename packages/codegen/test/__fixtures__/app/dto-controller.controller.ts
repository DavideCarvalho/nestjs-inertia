import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

class ListPostsQuery {
  page?: number;
}

class PostDto {
  id: string;
  title: string;
}

class CreatePostBody {
  title: string;
  content: string;
}

@Controller('/api/posts')
export class DtoController {
  @Get()
  @ApiResponse({ type: [PostDto] })
  list(@Query() query: ListPostsQuery): Promise<PostDto[]> {
    return [] as any;
  }

  @Post()
  @ApiResponse({ type: PostDto })
  create(@Body() body: CreatePostBody): Promise<PostDto> {
    return {} as any;
  }

  @Get(':id')
  @ApiResponse({ type: PostDto })
  show(@Param('id') id: string): Promise<PostDto> {
    return {} as any;
  }
}
