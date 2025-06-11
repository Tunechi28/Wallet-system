import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { getPayloadFromJwtToken, IJwtPayload } from '../helpers/jwt.helper';

export const PayloadFromJwt = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): IJwtPayload | null => {
    const request = ctx.switchToHttp().getRequest();
    const authorizationValue = request.get('authorization');
    return getPayloadFromJwtToken(authorizationValue);
  },
);
