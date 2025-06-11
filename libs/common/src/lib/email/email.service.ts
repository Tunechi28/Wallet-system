import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import sgMail from '@sendgrid/mail';

import { EmailConfig } from './email.config';

@Injectable()
export class EmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);

  constructor(private emailConfig: EmailConfig) {
    sgMail.setApiKey(this.emailConfig.apiKey);
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('EmailService initialized');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('EmailService destroyed');
  }

  async sendEmail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<{ error?: string; message?: string }> {
    const msg = {
      to,
      from: this.emailConfig.fromEmail,
      subject,
      text,
      html,
      mailSettings: {
        sandboxMode: {
          enable: this.emailConfig.sandboxMode,
        },
      },
    };

    try {
      await sgMail.send(msg);
      this.logger.log(`Email sent successfully to ${to}`);
      return { message: 'Email sent successfully' };
    } catch (error) {
      this.logger.error(
        `Error sending email to ${to}: ${JSON.stringify(error)}`,
      );
      return { error: 'Failed to send email' };
    }
  }
}
