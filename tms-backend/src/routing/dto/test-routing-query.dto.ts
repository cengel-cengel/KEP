import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const DIRECTIONS = ['INBOUND', 'OUTBOUND', 'BOTH'] as const;

export class TestRoutingQueryDto {
  @ApiProperty({ example: '20457' })
  @IsString()
  @IsNotEmpty()
  zip!: string;

  @ApiProperty({ example: 'DE', minLength: 2, maxLength: 2 })
  @IsString()
  @IsNotEmpty()
  country!: string;

  @ApiPropertyOptional({ enum: DIRECTIONS })
  @IsOptional()
  @IsIn(DIRECTIONS as readonly string[])
  direction?: 'INBOUND' | 'OUTBOUND' | 'BOTH';
}
