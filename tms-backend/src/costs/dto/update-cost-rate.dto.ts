/**
 * A-1.6: PartialType-Refactor (1:1-Felder zu CreateCostRateDto).
 * Erbt @ApiProperty + Validatoren — keine doppelte Annotation.
 */
import { PartialType } from '@nestjs/swagger';
import { CreateCostRateDto } from './create-cost-rate.dto';

export class UpdateCostRateDto extends PartialType(CreateCostRateDto) {}
