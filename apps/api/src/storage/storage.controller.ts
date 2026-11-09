import { Controller, Get, Post, Body, Param, Query, Res, ForbiddenException, NotFoundException, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';
import { StorageService } from './storage.service';
import { PrismaService } from '../database/prisma.service';

class RegisterDto {
  originalName!: string;
  mimeType?: string;
  sizeBytes!: number;
  checksum?: string;
  category?: string;
}

@ApiTags('Storage')
@Controller('api/v1/storage')
export class StorageController {
  constructor(private readonly storage: StorageService, private readonly prisma: PrismaService) {}

  @Get('describe')
  @ApiOperation({ summary: 'Storage provider description (no secrets)' })
  @RequirePermission(PERMISSIONS.ORG_READ)
  describe() { return this.storage.describe(); }

  @Post('uploads/register')
  @ApiOperation({ summary: 'Register an upload (validates size/type, reserves storageKey). No local-disk write (Rule 4).' })
  @RequirePermission(PERMISSIONS.ORG_READ)
  async register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDto) {
    const obj = await this.storage.registerUpload({ tenantId: user.tenantId, originalName: dto.originalName, mimeType: dto.mimeType, sizeBytes: dto.sizeBytes, checksum: dto.checksum, category: dto.category });
    const signedUrl = this.storage.signedUrl(obj.storageKey);
    return { ...obj, signedUrl, provider: this.storage.describe().provider, note: this.storage.describe().provider === 'console' ? 'console provider: metadata-only, no bytes stored. Configure STORAGE_PROVIDER=s3 to persist.' : undefined };
  }

  @Get('preview/:storageKey')
  @ApiOperation({ summary: 'Preview placeholder — verifies signed token; console provider returns metadata, not bytes' })
  async preview(@Param('storageKey') storageKey: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    const key = decodeURIComponent(storageKey);
    if (!this.storage.verifyPreviewToken(key, exp, sig)) throw new ForbiddenException('Invalid or expired preview token');
    // Never serve bytes from local filesystem. In console mode, return metadata.
    // Real S3 provider would redirect to presigned S3 URL.
    res.json({ storageKey: key, provider: this.storage.describe().provider, expiresAt: new Date(Number(exp) * 1000).toISOString(), note: 'Console provider: no bytes stored — this is the honest metadata-only response.' });
  }

  @Get('assets/:id/url')
  @ApiOperation({ summary: 'Mint a signed URL for a creative/employee asset by DB id (tenant-scoped)' })
  @RequirePermission(PERMISSIONS.ORG_READ)
  async assetUrl(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('expiresInSec') expiresInSec?: string) {
    // Try both tables; tenant scoping mandatory
    let key: string | null = null;
    const doc = await (this.prisma as any).employeeDocument?.findFirst?.({ where: { id, tenantId: user.tenantId } });
    if (doc?.storageKey) key = doc.storageKey;
    else {
      const asset = await (this.prisma as any).creativeAsset?.findFirst?.({ where: { id, tenantId: user.tenantId } });
      if (asset?.storageKey) key = asset.storageKey;
    }
    if (!key) throw new NotFoundException('Asset not found or has no storageKey');
    const url = this.storage.signedUrl(key, { expiresInSec: expiresInSec ? Number(expiresInSec) : 900 });
    return { url, storageKey: key, expiresInSec: Number(expiresInSec ?? 900) };
  }
}
