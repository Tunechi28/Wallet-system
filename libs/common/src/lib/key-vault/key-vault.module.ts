import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KeyVaultService } from './key-vault.service';
import { LoggerModule } from '../logger';

@Global()
@Module({
  imports: [ConfigModule, LoggerModule],
  providers: [KeyVaultService],
  exports: [KeyVaultService],
})
export class KeyVaultModule {}
