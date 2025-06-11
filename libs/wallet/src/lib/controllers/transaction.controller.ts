import { Controller, Get, Param, UseGuards, ValidationPipe, NotFoundException, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

import { WalletService } from '../services/wallet.service';
import { LoggerService } from '@app/common';
import { CurrentUser, AuthPayload, JwtAuthGuard } from '@app/auth';
import { HashParamDto, SystemAddressParamDto, TransactionParamDto } from '../dto/param.dto';

@ApiTags('Ledger - Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionController {
  constructor(
    private readonly walletService: WalletService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(TransactionController.name);
  }

  @Get('/hash/:hash')
  @ApiOperation({ summary: 'Get a transaction by its unique system hash' })
  @ApiResponse({ status: 200, description: 'The transaction object.' })
  @ApiResponse({ status: 404, description: 'Transaction not found.' })
  @ApiResponse({ status: 403, description: 'Access to this transaction is forbidden.' })
  async getTransactionByHash(
    @CurrentUser() user: AuthPayload,
    @Param(new ValidationPipe()) params: TransactionParamDto,
  ) {
    this.logger.log(`Request for transaction with hash: ${params.hash} by user ${user.userId}`);
    const transaction = await this.walletService.getTransactionBySystemHash(user.userId, params.hash);
    if (!transaction) {
      throw new NotFoundException(`Transaction with hash ${params.hash} not found.`);
    }
    return transaction;
  }

  @Get('/account/:systemAddress')
  @ApiOperation({ summary: "Get transaction history for a user's specific account" })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number for pagination.' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items per page.' })
  @ApiResponse({ status: 200, description: 'A paginated list of transactions for the account.' })
  @ApiResponse({ status: 404, description: 'Account not found or access denied.' })
  async getTransactionsForAccount(
    @CurrentUser() user: AuthPayload,
    @Param(new ValidationPipe()) params: SystemAddressParamDto,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    this.logger.log(`Request for transactions for account ${params.systemAddress} by user ${user.userId}`);
    return this.walletService.listTransactionsForAccount(user.userId, params.systemAddress, +page, +limit);
  }
}
