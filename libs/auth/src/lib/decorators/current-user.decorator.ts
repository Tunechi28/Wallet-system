import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthPayload } from '../interfaces/auth-payload';

/**
 * Custom decorator to extract the user payload from the request object.
 * Assumes that the JwtAuthGuard has run and attached the user object.
 * @example
 * someControllerMethod(@CurrentUser() user: AuthPayload) { ... }
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthPayload;
  },
);
