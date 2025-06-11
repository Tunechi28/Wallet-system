import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsUUID, IsHexadecimal, Length, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SystemAddressParamDto {
  @ApiProperty({ description: 'The unique system address of an account.' })
  @IsString()
  @IsNotEmpty()
  systemAddress!: string;
}

export class BlockHeightParamDto {
    @ApiProperty({ description: 'The height of the block (must be a non-negative integer).'})
    @Type(() => Number)
    @IsInt()
    @Min(0)
    height!: number;
}

export class HashParamDto {
    @ApiProperty({ description: 'A 64-character hexadecimal hash (e.g., for a block or transaction).'})
    @IsString()
    @IsNotEmpty()
    @IsHexadecimal()
    @Length(64, 64)
    hash!: string;
}

export class TransactionParamDto {
    @ApiProperty({ description: 'Systemhash for the transaction'})
    @IsString()
    @IsNotEmpty()
    hash!: string;
}

export class UuidParamDto {
    @ApiProperty({ description: 'A standard UUID.'})
    @IsUUID()
    id!: string;
}
