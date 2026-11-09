import { Body, Controller, Get, HttpCode, Post, Req, Res, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser, Public, Authenticated, AuthUser } from '../common/decorators';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsOptional() @IsString() tenantSlug?: string;
}

@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in and receive a session token' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response, @Headers('host') host: string) {
    const result = await this.auth.login({
      email: dto.email,
      password: dto.password,
      tenantSlug: dto.tenantSlug,
      hostname: host?.split(':')[0],
      ip: req.ip,
      userAgent: req.headers['user-agent']?.slice(0, 300),
    });
    // HttpOnly cookie for browser clients + token in the body for API clients.
    res.cookie('ufms_session', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 12 * 60 * 60 * 1000,
      path: '/',
    });
    return result;
  }

  @Post('logout')
  @HttpCode(200)
  @Authenticated()
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(@CurrentUser() user: AuthUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout((req as any).sessionId, user.tenantId);
    res.clearCookie('ufms_session', { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @Authenticated()
  @ApiOperation({ summary: 'Current principal, permissions and tenant branding' })
  async me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id, user.tenantId);
  }
}
