import { Injectable, Scope, ConsoleLogger, LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService extends ConsoleLogger {
  private readonly logLevels: LogLevel[];

  constructor(
    private readonly configService?: ConfigService,
    context?: string,
  ) {
    super(context as string);

    const configuredLogLevel =
      this.configService?.get<string>('LOG_LEVEL')?.toLowerCase() ||
      (this.configService?.get<string>('NODE_ENV') === 'production'
        ? 'log'
        : 'debug');

    const allLevels: LogLevel[] = ['log', 'error', 'warn', 'debug', 'verbose'];
    let activeLevels: LogLevel[] = [];

    switch (configuredLogLevel) {
      case 'verbose':
        activeLevels = ['log', 'error', 'warn', 'debug', 'verbose'];
        break;
      case 'debug':
        activeLevels = ['log', 'error', 'warn', 'debug'];
        break;
      case 'log':
        activeLevels = ['log', 'error', 'warn'];
        break;
      case 'warn':
        activeLevels = ['error', 'warn'];
        break;
      case 'error':
        activeLevels = ['error'];
        break;
      default:
        activeLevels = ['log', 'error', 'warn'];
    }
    this.logLevels = activeLevels;
    super.setLogLevels(this.logLevels);
    if (context) super.setContext(context);
  }

  override log(
    message: any,
    context?: string,
    ...optionalParams: [...any, string?]
  ) {
    if (!this.isLevelEnabled('log')) {
      return;
    }
    const logContext = context || this.context;
    super.log(message, logContext, ...optionalParams);
  }

  override error(
    message: any,
    trace?: string,
    context?: string,
    ...optionalParams: [...any, string?]
  ) {
    if (!this.isLevelEnabled('error')) {
      return;
    }
    const logContext = context || this.context;
    super.error(message, trace, logContext, ...optionalParams);
  }

  override warn(
    message: any,
    context?: string,
    ...optionalParams: [...any, string?]
  ) {
    if (!this.isLevelEnabled('warn')) {
      return;
    }
    const logContext = context || this.context;
    super.warn(message, logContext, ...optionalParams);
  }

  override debug(
    message: any,
    context?: string,
    ...optionalParams: [...any, string?]
  ) {
    if (!this.isLevelEnabled('debug')) {
      return;
    }
    const logContext = context || this.context;
    super.debug(message, logContext, ...optionalParams);
  }

  override verbose(
    message: any,
    context?: string,
    ...optionalParams: [...any, string?]
  ) {
    if (!this.isLevelEnabled('verbose')) {
      return;
    }
    const logContext = context || this.context;
    super.verbose(message, logContext, ...optionalParams);
  }

  customInfo(
    message: string,
    meta?: Record<string, any>,
    contextOverride?: string,
  ) {
    if (!this.isLevelEnabled('log')) return;
    const logContext = contextOverride || this.context;
    const timestamp = new Date().toISOString();
    process.stdout.write(
      `${timestamp} [INFO] [${logContext}] ${message}${meta ? ` - ${JSON.stringify(meta)}` : ''}\n`,
    );
  }

  customError(
    message: string,
    error?: Error,
    meta?: Record<string, any>,
    contextOverride?: string,
  ) {
    if (!this.isLevelEnabled('error')) return;
    const logContext = contextOverride || this.context;
    const timestamp = new Date().toISOString();
    let logEntry = `${timestamp} [ERROR] [${logContext}] ${message}`;
    if (error) {
      logEntry += ` | Error: ${error.message}${error.stack ? ` | Stack: ${error.stack}` : ''}`;
    }
    if (meta) {
      logEntry += ` | Meta: ${JSON.stringify(meta)}`;
    }
    process.stderr.write(`${logEntry}\n`);
  }
}
