import * as process from 'process';

import { registerAs } from '@nestjs/config';

export interface IAppConfig {
  appName: string;
  apiPrefix: string;
  appPort: number;
}

export const appConfig = registerAs('app', (): IAppConfig => {
  const DEFAULT_PORT = 3333;

  const { APP_PORT, APP_PREFIX, APP_NAME, BM_ENV } = process.env;

  return {
    appName: APP_NAME || '',
    apiPrefix: APP_PREFIX || '',
    appPort: APP_PORT ? parseInt(APP_PORT, 10) : DEFAULT_PORT,
  };
});
