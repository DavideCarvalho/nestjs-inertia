import { Inertia } from '@dudousxd/nestjs-inertia';
import { Controller, Get } from '@nestjs/common';

@Controller('accounts')
export class AccountsController {
  @Get()
  @Inertia('AccountsIndex')
  index() {
    return {};
  }

  @Get(':id/edit')
  @Inertia('AccountsEdit')
  edit() {
    return {};
  }

  // Not a page — no @Inertia — must NOT show up in page-excludes.
  @Get(':id')
  show() {
    return {};
  }
}

@Controller('chat')
export class ChatController {
  @Get(':threadId')
  @Inertia('ChatThread')
  thread() {
    return {};
  }
}

// No @Controller prefix — page path should be just the method path.
@Controller()
export class RootController {
  @Get('dashboard')
  @Inertia('Dashboard')
  dashboard() {
    return {};
  }
}
