import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListShipmentsQueryDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Komma-separiert in Query, z.B. ?status=new,planned',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsArray()
  @IsString({ each: true })
  status?: string[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  tourId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transportType?: string;

  @ApiPropertyOptional({ description: 'Voll-Text (Nr / Kunde / Ref)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'PLZ-Filter (loading-side)' })
  @IsOptional()
  @IsString()
  plz?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  loadingDateFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  loadingDateTo?: string;
}
