import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class AutoRouteShipmentDto {
  @ApiPropertyOptional({
    description: 'Force re-routing auch wenn bereits routing-rule zugewiesen',
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
