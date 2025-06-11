import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  UseGuards,
  ValidationPipe,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, AuthPayload } from '@app/auth';
import { CreateAccountDto } from '../dto/create-account.dto';
import { TransferDto } from '../dto/transfer.dto';
import { RevealMnemonicDto } from '../dto/reveal-mnemonic.dto';
import { SystemAddressParamDto } from '../dto/param.dto';
import { WalletService } from '../services/wallet.service';
import { LoggerService } from '@app/common';

@ApiTags('Wallet & Accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(WalletController.name);
  }

  @Get('/accounts')
  @ApiOperation({ summary: "Get all accounts within the user's wallet" })
  @ApiResponse({
    status: 200,
    description: 'A list of accounts owned by the user.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async listAccounts(@CurrentUser() user: AuthPayload) {
    this.logger.log(`Request to list accounts for user ${user.userId}`);
    return this.walletService.listAccountsForUser(user.userId);
  }

  @Post('/accounts')
  @ApiOperation({ summary: 'Create a new currency account within the wallet' })
  @ApiResponse({
    status: 201,
    description: 'The new account was created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data (e.g., invalid currency).',
  })
  @ApiResponse({
    status: 409,
    description: 'An account with this currency already exists.',
  })
  async createAccount(
    @CurrentUser() user: AuthPayload,
    @Body(new ValidationPipe()) createAccountDto: CreateAccountDto,
  ) {
    this.logger.log(
      `Request to create a new account for user ${user.userId} with currency ${createAccountDto.currency}`,
    );
    return this.walletService.createAccountInWallet(
      user.userId,
      createAccountDto.currency,
    );
  }

  @Get('/balance/:systemAddress')
  @ApiOperation({ summary: 'Get the balance of a specific account' })
  @ApiResponse({ status: 200, description: 'Balance details of the account.' })
  @ApiResponse({
    status: 403,
    description: 'Access to the account is forbidden.',
  })
  @ApiResponse({ status: 404, description: 'Account not found.' })
  async getBalance(
    @CurrentUser() user: AuthPayload,
    @Param(new ValidationPipe()) params: SystemAddressParamDto,
  ) {
    this.logger.log(
      `Request for balance of account ${params.systemAddress} by user ${user.userId}`,
    );
    return this.walletService.getAccountBalance(
      user.userId,
      params.systemAddress,
    );
  }

  @Post('/transfer')
  @ApiOperation({ summary: 'Submit a transfer of funds between two accounts' })
  @ApiResponse({
    status: 202,
    description: 'Transfer submitted successfully for processing.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid transfer details (e.g., insufficient funds, currency mismatch).',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not own the sender account.',
  })
  async submitTransfer(
    @CurrentUser() user: AuthPayload,
    @Body(new ValidationPipe()) transferDto: TransferDto,
  ) {
    this.logger.log(`Request to transfer funds by user ${user.userId}`);
    return this.walletService.submitTransfer(
      user.userId,
      transferDto.fromSystemAddress,
      transferDto.toSystemAddress,
      transferDto.amount,
      transferDto.currency,
      transferDto.description,
    );
  }

  @Post('/reveal-mnemonic')
  @ApiOperation({
    summary: 'Reveal the encrypted system mnemonic (highly sensitive)',
  })
  @ApiResponse({ status: 200, description: 'The decrypted system mnemonic.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden. Invalid password provided.',
  })
  async revealMnemonic(
    @CurrentUser() user: AuthPayload,
    @Body(new ValidationPipe()) revealMnemonicDto: RevealMnemonicDto,
  ) {
    this.logger.warn(
      `SENSITIVE ACTION: Request to reveal mnemonic for user ${user.userId}.`,
    );
    return this.walletService.getDecryptedSystemMnemonic(
      user.userId,
      revealMnemonicDto.currentPassword,
    );
  }
}
