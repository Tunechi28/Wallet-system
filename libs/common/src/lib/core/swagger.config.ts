import * as fs from 'fs';

import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { dump } from 'js-yaml';

export const generateSwaggerFile = (app: INestApplication): void => {
  const API_SPEC_PATH = '.openapi/specs.yml';

  const options = new DocumentBuilder()
    .setTitle('Wallet API')
    .setDescription('The Data Integrator API documentation')
    .setLicense('exodus', 'https://exodus.com/')
    .setContact('exodus', 'https://support.exodus.com/', 'exmaple@exmaple.com')
    .addServer('https://api.dev.exodus.com/api/wallet', 'DEV', {})
    .addServer('https://api.test.exodus.com/api/wallet', 'TEST', {})
    .addServer('https://api.exodus.com/api/wallet', 'PROD', {})
    .addServer('http://localhost:9230/api', 'localhost', {})
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, options, {
    ignoreGlobalPrefix: true,
  });

  SwaggerModule.setup('open-api-specs', app, document);

  const yamlDocument = dump(document, {
    indent: 2,
    lineWidth: 120,
    quotingType: '"',
  });
  fs.writeFileSync(API_SPEC_PATH, yamlDocument, {});
};
