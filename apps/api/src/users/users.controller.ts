import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Patch, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';
import { AuthService } from '../auth/auth.service';

class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(2) @MaxLength(200) name: string;
  @IsString() @MinLength(10) @MaxLength(200) password: string;
  @IsOptional() @IsString() phone?: string;
  @IsArray() roles: string[];
}

class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsArray() roles?: string[];
}

/** Columns never returned by this API. */
const SAFE_USER_SELECT = {
  id: true, email: true, name: true, phone: true, active: true,
  lastLoginAt: true, createdAt: true, mustChangePassword: true,
  userRoles: { select: { role: { select: { code: true, name: true } } } },
};

@ApiTags('users')
@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission(PERMISSIONS.USER_READ)
  @ApiOperation({ summary: 'List users (never returns password hashes)' })
  async list(@CurrentUser() u: AuthUser, @Query('q') q?: string) {
    const users = await this.prisma.withTenant(u.tenantId, (tx) =>
      tx.user.findMany({
        where: {
          deletedAt: null,
          ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
        },
        select: SAFE_USER_SELECT,
        orderBy: { name: 'asc' },
        take: 500,
      }),
    );
    return users.map((x) => ({
      ...x,
      roles: x.userRoles.map((r) => r.role.code),
      roleNames: x.userRoles.map((r) => r.role.name),
      userRoles: undefined,
    }));
  }

  @Get('roles')
  @RequirePermission(PERMISSIONS.ROLE_READ)
  listRoles(@CurrentUser() u: AuthUser) {
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.role.findMany({
        where: { OR: [{ tenantId: u.tenantId }, { tenantId: null }] },
        include: { rolePermissions: { include: { permission: true } } },
        orderBy: { name: 'asc' },
      }),
    );
  }

  @Post()
  @RequirePermission(PERMISSIONS.USER_WRITE)
  async create(@CurrentUser() u: AuthUser, @Body() dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await AuthService.hashPassword(dto.password);

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const dupe = await tx.user.findFirst({ where: { email, deletedAt: null } });
      if (dupe) throw new BadRequestException({ code: 'DUPLICATE_EMAIL', message: 'That email already exists in this workspace.' });

      const roles = await tx.role.findMany({
        where: { code: { in: dto.roles }, OR: [{ tenantId: u.tenantId }, { tenantId: null }] },
      });
      if (roles.length !== dto.roles.length) {
        throw new BadRequestException({ code: 'UNKNOWN_ROLE', message: 'One or more roles do not exist.' });
      }

      const created = await tx.user.create({
        data: {
          tenantId: u.tenantId,
          email,
          name: dto.name.trim(),
          phone: dto.phone,
          passwordHash,
          mustChangePassword: true,
          userRoles: { create: roles.map((r) => ({ roleId: r.id })) },
        },
        select: SAFE_USER_SELECT,
      });
      return { ...created, roles: created.userRoles.map((r) => r.role.code), userRoles: undefined };
    });
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.USER_WRITE)
  async update(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string, @Body() dto: UpdateUserDto) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const data: any = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.phone !== undefined) data.phone = dto.phone;
      if (dto.active !== undefined) data.active = dto.active;

      if (dto.roles) {
        const roles = await tx.role.findMany({
          where: { code: { in: dto.roles }, OR: [{ tenantId: u.tenantId }, { tenantId: null }] },
        });
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id })) });
      }

      const updated = await tx.user.update({ where: { id }, data, select: SAFE_USER_SELECT });
      return { ...updated, roles: updated.userRoles.map((r) => r.role.code), userRoles: undefined };
    });
  }

  @Post(':id/reset-password')
  @RequirePermission(PERMISSIONS.USER_WRITE)
  async resetPassword(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string, @Body() body: { password: string }) {
    if (!body?.password || body.password.length < 10) {
      throw new BadRequestException({ code: 'WEAK_PASSWORD', message: 'Password must be at least 10 characters.' });
    }
    const passwordHash = await AuthService.hashPassword(body.password);
    await this.prisma.withTenant(u.tenantId, async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true, failedAttempts: 0, lockedUntil: null } });
      await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    return { ok: true };
  }
}
