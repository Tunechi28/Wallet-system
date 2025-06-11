import { Controller, Logger, Inject } from '@nestjs/common';
import {
  Ctx,
  KafkaContext,
  MessagePattern,
  Payload,
} from '@nestjs/microservices';
import { EmailService } from '@app/common';

@Controller()
export class EmailNotificationController {
  private readonly logger = new Logger(EmailNotificationController.name);

  constructor(
    @Inject(EmailService) private readonly emailService: EmailService,
  ) {}

  @MessagePattern('email-notification')
  async handleEmailNotification(
    @Payload() message: any,
    @Ctx() context: KafkaContext,
  ) {
    try {
      this.logger.log(
        `Received message from topic: ${context.getTopic()} | Payload: ${JSON.stringify(message)}`,
      );

      const { to, subject, text, html } = message;

      if (!to || !subject || !text) {
        this.logger.error(`Invalid email message: ${JSON.stringify(message)}`);
        return;
      }

      const result = await this.emailService.sendEmail(to, subject, text, html);

      if (result.error) {
        this.logger.error(`Failed to send email: ${result.error}`);
      } else {
        this.logger.log(`Email sent successfully to ${to}`);
      }
    } catch (error) {
      this.logger.error(
        `Message failed to process in email-notification topic. Payload: ${JSON.stringify(message)}`,
      );
      this.logger.error(error?.message);
    }
  }
}
