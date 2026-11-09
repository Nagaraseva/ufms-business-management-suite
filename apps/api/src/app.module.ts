import { Module, Global, OnModuleInit, Logger } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaService } from './database/prisma.service';
import { SessionGuard, PermissionsGuard } from './common/guards';
import { AllExceptionsFilter } from './common/errors';
import { CorrelationInterceptor, AuditInterceptor } from './common/interceptors';
import { AuthModule } from './auth/auth.module';
import { OrganisationController } from './organisation/organisation.controller';
import { UsersController } from './users/users.controller';
import { LeadsController } from './leads/leads.controller';
import { SurveysController } from './surveys/surveys.controller';
import { QuotationsController } from './quotations/quotations.controller';
import { TendersController } from './tenders/tenders.controller';
import { ClientsController } from './clients/clients.controller';
import { ContractsController } from './contracts/contracts.controller';
import { ClientCareController } from './client-care/client-care.controller';
import { EmployeesController } from './hr/employees.controller';
import { WorkforceController } from './hr/workforce.controller';
import { StatutoryController } from './hr/statutory.controller';
import { AttendanceController } from './hr/attendance.controller';
import { PayrollController } from './hr/payroll.controller';
import { FinanceController } from './finance/finance.controller';
import { AssetsController } from './assets/assets.controller';
import { MarketingController } from './marketing/marketing.controller';
import { ReportsController } from './reports/reports.controller';
import { AiController } from './ai/ai.controller';
import { CreativeController } from './creative/creative.controller';
import { QueueModule } from './queue/queue.module';
import { StorageModule } from './storage/storage.module';
import { PlatformController } from './platform/platform.controller';
import { BillingModule } from './billing/billing.module';
import { HealthController } from './health.controller';
import { assertCatalogueCoverage } from './permissions/catalogue';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
class CoreModule {}

@Module({
  imports: [
    CoreModule,
    AuthModule,
    QueueModule,
    StorageModule,
    BillingModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
  ],
  controllers: [
    HealthController,
    OrganisationController,
    UsersController,
    LeadsController,
    SurveysController,
    QuotationsController,
    TendersController,
    ClientsController,
    ContractsController,
    ClientCareController,
    EmployeesController,
    WorkforceController,
    StatutoryController,
    AttendanceController,
    PayrollController,
    FinanceController,
    AssetsController,
    MarketingController,
    ReportsController,
    AiController,
    CreativeController,
    PlatformController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: CorrelationInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements OnModuleInit {
  private readonly logger = new Logger('AppModule');

  constructor(private readonly reflector: Reflector) {}

  /**
   * Startup safety net: walk every registered route and confirm it declares a
   * permission (or is explicitly @Public). A route that forgets one can never
   * reach production, because PermissionsGuard also fails closed at runtime.
   */
  onModuleInit() {
    const controllers = [
      OrganisationController, UsersController, LeadsController,
      SurveysController, QuotationsController, TendersController,
      ClientsController, ContractsController, ClientCareController,
      EmployeesController, WorkforceController, StatutoryController,
      AttendanceController, PayrollController,
      FinanceController, AssetsController,
      MarketingController, ReportsController, AiController, CreativeController,
      PlatformController,
    ];
    const declared = new Set<string>();
    for (const c of controllers) {
      const proto = c.prototype;
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (key === 'constructor') continue;
        const meta = Reflect.getMetadata('required_permission', proto[key]) as string | string[] | undefined;
        const isPublic = Reflect.getMetadata('is_public', proto[key]);
        const isRoute = Reflect.getMetadata('path', proto[key]) !== undefined
          || Reflect.getMetadata('__route__', proto[key]) !== undefined;
        // A route may declare any-of several permissions; flatten before checking.
        if (meta) {
          for (const code of Array.isArray(meta) ? meta : [meta]) declared.add(code);
        }
        if (isRoute && !meta && !isPublic) {
          this.logger.warn(`Route ${c.name}.${key} declares no permission (guard will refuse it).`);
        }
      }
    }
    assertCatalogueCoverage([...declared]);
    this.logger.log(`Permission catalogue validated: ${declared.size} permission(s) in use.`);
  }
}
