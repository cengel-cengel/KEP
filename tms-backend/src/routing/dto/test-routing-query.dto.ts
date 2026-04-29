import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TestRoutingQueryDto {
  @IsString()
  @IsNotEmpty()
  zip!: string;

  @IsString()
  @IsNotEmpty()
  country!: string;

  @IsOptional()
  @IsIn(['INBOUND', 'OUTBOUND', 'BOTH'])
  direction?: 'INBOUND' | 'OUTBOUND' | 'BOTH';
}

