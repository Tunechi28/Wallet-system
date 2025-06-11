import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  Matches,
  Length,
  IsUppercase,
} from 'class-validator';

export class TransferDto {
  @ApiProperty({
    description:
      'The system address of the account to send funds from (e.g., acc_...).',
    example: 'acc_1a2b3c4d5e6f7g8h9i0j',
  })
  @IsString()
  @IsNotEmpty()
  fromSystemAddress!: string;

  @ApiProperty({
    description:
      'The system address of the account to send funds to (e.g., acc_...).',
    example: 'acc_9z8y7x6w5v4u3t2s1r0q',
  })
  @IsString()
  @IsNotEmpty()
  toSystemAddress!: string;

  @ApiProperty({
    description: 'The amount to transfer, as a string to maintain precision.',
    example: '150.75',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]+(\.[0-9]{1,8})?$/, {
    message:
      'Amount must be a positive number string, with up to 8 decimal places.',
  })
  amount!: string;

  @ApiProperty({
    description:
      'The currency code for the transfer. Must match the currency of both accounts.',
    example: 'NGN',
  })
  @IsString()
  @IsNotEmpty()
  @IsUppercase()
  currency!: string;

  @ApiProperty({
    description:
      'An optional description or memo for the transaction (max 255 characters).',
    example: 'Payment for services rendered.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  description?: string;
}
