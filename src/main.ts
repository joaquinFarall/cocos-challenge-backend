import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Cocos Challenge API')
      .setDescription('Portfolio, assets and orders')
      .setVersion('0.0.1')
      .build(),
  );
  SwaggerModule.setup('docs', app, document);

  await app.listen(app.get(ConfigService).getOrThrow<number>('PORT'));
}
void bootstrap();
