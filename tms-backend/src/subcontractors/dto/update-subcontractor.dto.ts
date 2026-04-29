import { PartialType } from '@nestjs/swagger';
import { CreateSubcontractorDto } from './create-subcontractor.dto';

export class UpdateSubcontractorDto extends PartialType(
  CreateSubcontractorDto,
) {}
