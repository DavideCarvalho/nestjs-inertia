import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { type CreatePostDto, type ListPostsQueryDto, PostResponseDto } from './dto/post.dto';

@Controller('/api/posts')
export class CrossFileController {
  @Get()
  @ApiResponse({ type: [PostResponseDto] })
  list(@Query() query: ListPostsQueryDto): Promise<PostResponseDto[]> {
    return [] as any;
  }

  @Post()
  @ApiResponse({ type: PostResponseDto })
  create(@Body() body: CreatePostDto): Promise<PostResponseDto> {
    return {} as any;
  }
}
