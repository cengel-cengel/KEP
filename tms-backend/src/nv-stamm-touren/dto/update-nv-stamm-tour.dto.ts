/**
 * A-1.6: PartialType-Refactor (1:1-Felder zu CreateNvStammTourDto).
 * Erbt @ApiProperty + Validatoren.
 */
import { PartialType } from '@nestjs/swagger';
import { CreateNvStammTourDto } from './create-nv-stamm-tour.dto';

export class UpdateNvStammTourDto extends PartialType(CreateNvStammTourDto) {}
