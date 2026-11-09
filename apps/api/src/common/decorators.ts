import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';

export const PERMISSION_KEY = 'required_permission';
export const PUBLIC_KEY = 'is_public';
export const AUTH_ONLY_KEY = 'auth_only';

/**
 * Declare the permission(s) a route requires. Mandatory unless @Public() or
 * @Authenticated(). Passing an array means "any of these" is sufficient.
 */
export const RequirePermission = (code: string | string[]) => SetMetadata(PERMISSION_KEY, code);

/** Explicitly mark a route as unauthenticated (login, health, branding). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Signed-in-but-not-permission-gated. Only legitimate for endpoints that act
 * on the caller's own principal (profile, logout). Everything else must name
 * a permission — the guard still fails closed for anything that names neither.
 */
export const Authenticated = () => SetMetadata(AUTH_ONLY_KEY, true);

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  isPlatformAdmin: boolean;
}

/** Injects the authenticated principal resolved by SessionGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
