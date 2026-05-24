import type { PostResponseDto } from './post.dto';

export class CommentDto {
  id: string;
  text: string;
  post: PostResponseDto;
}

export class CreateCommentDto {
  text: string;
  postId: string;
}
