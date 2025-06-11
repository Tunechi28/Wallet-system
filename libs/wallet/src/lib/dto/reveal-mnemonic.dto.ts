import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class RevealMnemonicDto {
  @ApiProperty({
    description:
      "The user's current password is required to authorize this sensitive operation.",
    example: 'MySecurePassword123!',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  currentPassword!: string;
}
