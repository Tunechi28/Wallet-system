import { config } from 'dotenv';
import { get } from 'env-var';

import { EnvVar } from '../enums';

config();

export interface EmailConfig {
  apiKey: string;
  fromEmail: string;
  sandboxMode: boolean;
}

export function getEmailConfig(): EmailConfig {
  return {
    apiKey: get(EnvVar.SENDGRID_API_KEY).required().asString(),
    fromEmail: get(EnvVar.SENDGRID_FROM_EMAIL).required().asString(),
    sandboxMode: get(EnvVar.SENDGRID_SANDBOX_MODE).default('false').asBool(),
  };
}
