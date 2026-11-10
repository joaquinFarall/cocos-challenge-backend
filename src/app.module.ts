import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { AppValidationPipe } from './common/validation/validation.pipe';
import { validateEnv } from './config/env.validation';
import { AssetsModule } from './assets/assets.module';
import { buildDataSourceOptions } from './database/data-source-options';
import { PendingMigrationsCheck } from './database/pending-migrations.check';
import { HealthModule } from './health/health.module';
import { LoggingModule } from './logging/logging.module';
import { OrdersModule } from './orders/orders.module';
import { PortfolioModule } from './portfolio/portfolio.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildDataSourceOptions(config.getOrThrow<string>('DATABASE_URL')),
    }),
    LoggingModule,
    HealthModule,
    PortfolioModule,
    OrdersModule,
    AssetsModule,
  ],
  providers: [
    PendingMigrationsCheck,
    { provide: APP_PIPE, useClass: AppValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
