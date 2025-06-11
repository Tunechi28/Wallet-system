import { Controller, Get, Param, UseGuards, ValidationPipe, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { BlockService, LoggerService } from '@app/common';
import { JwtAuthGuard } from '@app/auth';
import { BlockHeightParamDto, HashParamDto } from '../dto/param.dto';

@ApiTags('Ledger - Blocks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('blocks')
export class BlockController {
  constructor(
    private readonly blockService: BlockService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(BlockController.name);
  }

  @Get('/latest')
  @ApiOperation({ summary: 'Get the latest confirmed block' })
  @ApiResponse({ status: 200, description: 'The latest block object.' })
  @ApiResponse({ status: 404, description: 'No blocks found in the ledger.' })
  async getLatestBlock() {
    this.logger.log('Request received for the latest block.');
    const block = await this.blockService.getLatestBlock();
    if (!block) {
      throw new NotFoundException('No blocks found.');
    }
    return block;
  }

  @Get('/height/:height')
  @ApiOperation({ summary: 'Get a block by its height' })
  @ApiResponse({ status: 200, description: 'The block object with its transactions.' })
  @ApiResponse({ status: 404, description: 'Block with the specified height not found.' })
  async getBlockByHeight(@Param(new ValidationPipe()) params: BlockHeightParamDto) {
    this.logger.log(`Request received for block at height: ${params.height}`);
    const block = await this.blockService.getBlockByHeight(BigInt(params.height));
    if (!block) {
      throw new NotFoundException(`Block with height ${params.height} not found.`);
    }
    return block;
  }

  @Get('/hash/:hash')
  @ApiOperation({ summary: 'Get a block by its hash' })
  @ApiResponse({ status: 200, description: 'The block object with its transactions.' })
  @ApiResponse({ status: 404, description: 'Block with the specified hash not found.' })
  async getBlockByHash(@Param(new ValidationPipe()) params: HashParamDto) {
    this.logger.log(`Request received for block with hash: ${params.hash}`);
    const block = await this.blockService.getBlockByHash(params.hash);
    if (!block) {
      throw new NotFoundException(`Block with hash ${params.hash} not found.`);
    }
    return block;
  }
}
