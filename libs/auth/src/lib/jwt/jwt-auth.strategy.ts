import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '@app/common';
import { AuthPayload } from '../interfaces/auth-payload';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET', 'defaultSecret'),
    });
    this.logger.setContext(JwtStrategy.name);

    if (!configService.get<string>('JWT_SECRET')) {
      this.logger.error(
        'FATAL ERROR: JWT_SECRET is not defined in configuration.',
      );
      throw new Error(
        'JWT_SECRET is not configured, authentication will fail.',
      );
    }
  }

  async validate(payload: any): Promise<AuthPayload> {
    this.logger.debug(
      `Validating JWT payload for user ID: ${payload.userId || payload.sub}`,
    );
    if (!payload || !payload.userId || !payload.email) {
      this.logger.warn('Invalid JWT payload structure received.', undefined, {
        payload,
      });
      throw new UnauthorizedException('Invalid token payload.');
    }
    return {
      userId: payload.userId,
      email: payload.email,
    };
  }
}
