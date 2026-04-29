import { IsBoolean, IsOptional } from 'class-validator';

export class AutoRouteShipmentDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

