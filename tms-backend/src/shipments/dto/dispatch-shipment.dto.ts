import { IsNumber, IsOptional, IsString } from 'class-validator';

export class DispatchShipmentDto {
  @IsOptional()
  @IsString()
  tourId?: string | null;

  @IsOptional()
  @IsNumber()
  tourPosition?: number | null;
}
