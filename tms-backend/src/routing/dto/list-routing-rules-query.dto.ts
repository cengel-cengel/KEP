import { IsOptional, IsString, IsIn } from 'class-validator';

export class ListRoutingRulesQueryDto {
  @IsOptional()
  @IsIn(['INBOUND', 'OUTBOUND', 'BOTH'])
  direction?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  type?: string; // delivery_type
}

