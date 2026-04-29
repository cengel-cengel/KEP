import { IsArray, IsString, ArrayMinSize } from 'class-validator';

export class ShipmentsPageVisibleColumnsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  columns!: string[];
}

