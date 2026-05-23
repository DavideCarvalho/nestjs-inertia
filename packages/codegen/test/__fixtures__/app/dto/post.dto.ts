export class PostResponseDto {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

export class CreatePostDto {
  title: string;
  content: string;
}

export class ListPostsQueryDto {
  page?: number;
  limit?: number;
}
