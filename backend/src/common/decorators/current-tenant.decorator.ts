import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export const CurrentTenant = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.tenantId;
});
