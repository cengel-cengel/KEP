/**
 * A-1.6: PartialType-Refactor (1:1-Felder zu CreateRelationDto).
 * Trivial nullable-Konvention (transit_days) wird durch @IsOptional
 * von PartialType abgedeckt.
 */
import { PartialType } from '@nestjs/swagger';
import { CreateRelationDto } from './create-relation.dto';

export class UpdateRelationDto extends PartialType(CreateRelationDto) {}
