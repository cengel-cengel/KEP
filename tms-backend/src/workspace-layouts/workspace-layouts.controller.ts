import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateWorkspaceLayoutDto } from './dto/create-workspace-layout.dto';
import { ListWorkspaceLayoutsQuery } from './dto/list-workspace-layouts.query';
import { UpdateWorkspaceLayoutDto } from './dto/update-workspace-layout.dto';
import { WorkspaceLayoutsService } from './workspace-layouts.service';

/**
 * S-3b-1 Workspace-Layouts Controller.
 *
 * Alle Endpoints sind JWT-geschuetzt. Owner-ID kommt aus
 * req.user.userId (JwtStrategy.validate, s. auth/jwt.strategy.ts).
 * Wir reichen sie als erstes Argument an den Service weiter,
 * damit User-Scoping auf Query-Ebene zwingend ist.
 */
@ApiTags('workspace-layouts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspace-layouts')
export class WorkspaceLayoutsController {
  constructor(private readonly svc: WorkspaceLayoutsService) {}

  @Get()
  list(@Request() req: any, @Query() query: ListWorkspaceLayoutsQuery) {
    return this.svc.list(req.user.userId, query.workspace);
  }

  @Post()
  create(@Request() req: any, @Body() dto: CreateWorkspaceLayoutDto) {
    return this.svc.create(req.user.userId, dto);
  }

  @Patch(':id')
  update(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkspaceLayoutDto,
  ) {
    return this.svc.update(req.user.userId, id, dto);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.remove(req.user.userId, id);
  }
}
