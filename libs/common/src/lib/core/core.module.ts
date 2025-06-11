import {
  Global,
  MiddlewareConsumer,
  Module,
  NestModule,
  Scope,
} from '@nestjs/common';
import { LoggerMiddleware } from './logger.middleware';

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class CoreModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
