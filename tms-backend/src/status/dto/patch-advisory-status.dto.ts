import { IsIn, IsString } from 'class-validator';

export class PatchAdvisoryStatusDto {
  @IsString()
  @IsIn(['open', 'contacted', 'confirmed', 'failed'])
  status!: 'open' | 'contacted' | 'confirmed' | 'failed';
}
