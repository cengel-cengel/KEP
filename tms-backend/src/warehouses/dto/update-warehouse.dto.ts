/**
 * A-1.6: PartialType-Refactor (1:1-Felder zu CreateWarehouseDto).
 * Erbt @ApiProperty + Validatoren — incl. R3-B is_umschlag-Feld
 * (B-Kopplung: B fügte is_umschlag zu CreateWarehouseDto, hier
 * automatisch geerbt).
 */
import { PartialType } from '@nestjs/swagger';
import { CreateWarehouseDto } from './create-warehouse.dto';

export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto) {}
