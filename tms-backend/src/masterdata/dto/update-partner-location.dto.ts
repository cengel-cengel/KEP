import { PartialType } from '@nestjs/mapped-types';
import { CreatePartnerLocationDto } from './create-partner-location.dto';

export class UpdatePartnerLocationDto extends PartialType(
  CreatePartnerLocationDto,
) {}
