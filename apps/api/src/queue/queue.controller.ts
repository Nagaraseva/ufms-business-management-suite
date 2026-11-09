import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';
import { QueueService } from './queue.service';

@ApiTags('Worker Queue')
@Controller('api/v1/queue')
export class QueueController {
  constructor(private readonly queue: QueueService) {}

  @Get('jobs')
  @ApiOperation({ summary: 'List pending/processing jobs for current tenant (or all, platform_admin)' })
  @RequirePermission(PERMISSIONS.AUDIT_READ)
  async list(@CurrentUser() user: AuthUser, @Query('all') all?: string) {
    const tenantId = user.isPlatformAdmin && all === 'true' ? undefined : user.tenantId;
    return this.queue.pending(tenantId).map(j => ({
      id: j.id, type: j.type, tenantId: j.tenantId, status: j.status,
      attempts: j.attempts, maxAttempts: j.maxAttempts, lastError: j.lastError,
      createdAt: j.createdAt, runAt: j.runAt,
    }));
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Job status (tenant-scoped unless platform_admin)' })
  @RequirePermission(PERMISSIONS.AUDIT_READ)
  async one(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const job = this.queue.status(id);
    if (!job) return { status: 'not_found' as const, id };
    if (!user.isPlatformAdmin && job.tenantId !== user.tenantId) return { status: 'not_found' as const, id };
    return { id: job.id, type: job.type, status: job.status, attempts: job.attempts, lastError: job.lastError };
  }
}
