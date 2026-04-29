import { IsObject } from 'class-validator';

export class ShipmentsPageColumnWidthsDto {
  @IsObject()
  columnWidths!: Record<string, number>;
}

