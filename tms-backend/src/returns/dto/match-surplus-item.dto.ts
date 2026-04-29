import { IsUUID } from 'class-validator';

export class MatchSurplusItemDto {
  @IsUUID()
  shipmentId!: string;
}

