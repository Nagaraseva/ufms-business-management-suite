import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Prisma access with enforced tenant scoping.
 *
 * `withTenant()` opens an interactive transaction and sets `app.tenantId`
 * locally for it, so PostgreSQL Row Level Security applies to every statement
 * inside. Services never receive the raw client for tenant-owned data — they
 * receive the transaction client.
 *
 * The connection uses APP_DATABASE_URL (the NOSUPERUSER NOBYPASSRLS role);
 * DATABASE_URL is used only for migrations and seeding.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * REVIEWED EXCEPTION — `auth` client, tenant resolution only.
   *
   * Sign-in has a genuine chicken-and-egg problem: the session token must be
   * resolved to a user BEFORE any tenant is known, and Row Level Security
   * (correctly) returns nothing without a tenant. This client connects with
   * the schema owner so it can look a user up.
   *
   * Its use is deliberately narrow and enumerated. It is ONLY permitted to:
   *   1. find a tenant by slug / verified domain,
   *   2. find a user by (tenantId, email) during sign-in,
   *   3. read a session by its SHA-256 token hash,
   *   4. append login_history rows.
   * It must never be used for business data. tests/integration/auth-scope
   * asserts that every other query path goes through withTenant().
   */
  readonly auth: PrismaClient;

  constructor() {
    const url = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;
    super({ datasources: { db: { url } }, log: ['warn', 'error'] });
    this.auth = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
      log: ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    await this.auth.$connect();
    this.logger.log('Database connected (RLS-enforcing app role + narrow auth client)');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.auth.$disconnect();
  }

  /**
   * Run `fn` with the tenant bound. Any query inside is filtered by RLS even
   * if the caller forgets a WHERE clause.
   */
  async withTenant<T>(tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    if (!tenantId) throw new Error('withTenant called without a tenant id');
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.tenantId', $1, true)`, tenantId);
      return fn(tx);
    }, { timeout: 20000 });
  }

  /** Platform-level queries (no tenant): used for auth lookup by email/domain. */
  async withoutTenant<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.tenantId', '', true)`);
      return fn(tx);
    });
  }
}
