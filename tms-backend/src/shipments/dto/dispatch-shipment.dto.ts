import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class DispatchShipmentDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Ziel-Tour-ID (null = unassign)' })
  @IsOptional()
  @IsString()
  tourId?: string | null;

  @ApiPropertyOptional({ minimum: 1, description: 'Stop-Position in Tour' })
  @IsOptional()
  @IsNumber()
  tourPosition?: number | null;
}
