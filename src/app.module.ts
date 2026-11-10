import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnv } from './config/env.validation';
import { buildDataSourceOptions } from './database/data-source-options';
import { PendingMigrationsCheck } from './database/pending-migrations.check';
import { HealthModule } from './health/health.module';
import { LoggingModule } from './logging/logging.module';
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
  ],
  providers: [PendingMigrationsCheck],
})
export class AppModule {}
