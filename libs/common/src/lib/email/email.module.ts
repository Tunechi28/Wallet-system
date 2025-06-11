import { DynamicModule, Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailConfig } from './email.config';

@Module({})
export class EmailModule {
  static register(emailConfig: EmailConfig): DynamicModule {
    return {
      global: true,
      module: EmailModule,
      providers: [
        {
          provide: EmailService,
          useValue: new EmailService(emailConfig),
        },
      ],
      exports: [EmailService],
    };
  }
}
