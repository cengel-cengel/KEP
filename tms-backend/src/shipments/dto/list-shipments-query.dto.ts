import { IsArray, IsDateString, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListShipmentsQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsArray()
  @IsString({ each: true })
  status?: string[];

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  tourId?: string;

  @IsOptional()
  @IsString()
  transportType?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  plz?: string;

  @IsOptional()
  @IsDateString()
  loadingDateFrom?: string;

  @IsOptional()
  @IsDateString()
  loadingDateTo?: string;
}
