import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { CommentDto, type CreateCommentDto } from './dto/comment.dto';

@Controller('/api/comments')
export class CrossFileNestedController {
  @Get()
  @ApiResponse({ type: [CommentDto] })
  list(): Promise<CommentDto[]> {
    return [] as any;
  }

  @Post()
  @ApiResponse({ type: CommentDto })
  create(@Body() body: CreateCommentDto): Promise<CommentDto> {
    return {} as any;
  }
}
