/**
 * A-1.6: PartialType-Refactor (1:1-Felder zu CreateRoutingRuleDto).
 * Erbt @ApiProperty + Validatoren.
 */
import { PartialType } from '@nestjs/swagger';
import { CreateRoutingRuleDto } from './create-routing-rule.dto';

export class UpdateRoutingRuleDto extends PartialType(CreateRoutingRuleDto) {}
