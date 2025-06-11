import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsUppercase, Length } from 'class-validator';

export class CreateAccountDto {
  @ApiProperty({
    description:
      'The currency code for the new account (e.g., NGN_LEDGER, USD_LEDGER, POINTS_MAIN). Must be uppercase.',
    example: 'USD_LEDGER',
  })
  @IsString()
  @IsNotEmpty()
  @IsUppercase()
  @Length(3, 10)
  currency!: string;
}
