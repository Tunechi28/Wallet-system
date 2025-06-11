import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  constructor(private readonly appLogger: LoggerService) {
    this.appLogger.setContext(LoggerMiddleware.name);
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const { ip, method, originalUrl } = req;
    const userAgent = req.get('user-agent') || '';

    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length');
      this.appLogger.log(
        `HTTP Request: ${method} ${originalUrl} ${statusCode} ${contentLength || '-'} - ${userAgent} ${ip}`,
      );
    });
    next();
  }
}
