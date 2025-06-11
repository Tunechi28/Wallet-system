import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { generateSwaggerFile, IAppConfig } from '@app/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const { appPort, apiPrefix } = configService.get<IAppConfig>('app');
  app.setGlobalPrefix(apiPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  generateSwaggerFile(app);
  await app.listen(appPort);
  Logger.log(
    `🚀 Application is running on: http://localhost:${appPort}/${apiPrefix}`,
  );
}

bootstrap();
