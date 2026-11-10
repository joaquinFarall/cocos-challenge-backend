import {
  BadRequestException,
  Controller,
  Get,
  Module,
  type INestApplication,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Writable } from 'node:stream';
import { Logger, LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { buildPinoHttpOptions } from '../../logging/logging.module';
import { LedgerInconsistencyError } from '../../domain/portfolio';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ApiException } from './api.exception';

@Controller()
class DummyController {
  @Get('domain')
  domain(): never {
    throw new ApiException(
      422,
      'NO_MARKET_DATA',
      'Instrument 3 has no market data',
    );
  }

  @Get('validation')
  validation(): never {
    throw new ApiException(400, 'BAD_REQUEST', 'Validation failed', [
      { field: 'price', message: 'price is required for LIMIT orders' },
    ]);
  }

  @Get('http')
  http(): never {
    throw new BadRequestException('bad id');
  }

  @Get('ledger')
  ledger(): never {
    throw new LedgerInconsistencyError('secret internal detail', {
      userId: 7,
      orderId: 11,
      instrumentId: 31,
    });
  }

  @Get('plain')
  plain(): never {
    throw new Error('db password is hunter2');
  }
}

describe('AllExceptionsFilter', () => {
  let app: INestApplication;
  let lines: Record<string, any>[];

  beforeEach(async () => {
    lines = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(JSON.parse(chunk.toString()));
        callback();
      },
    });
    const options = buildPinoHttpOptions({
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
    })!;

    @Module({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: Object.assign({}, options, { stream }) as never,
        }),
      ],
      controllers: [DummyController],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    })
    class TestModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
    lines.length = 0;
  });

  afterEach(() => app.close());

  it('uses the code of a domain error', async () => {
    const res = await request(app.getHttpServer()).get('/domain').expect(422);
    expect(res.body).toEqual({
      status_code: 422,
      error: 'NO_MARKET_DATA',
      message: 'Instrument 3 has no market data',
    });
    expect(lines.filter((l) => l.err)).toHaveLength(0);
  });

  it('includes details on validation errors', async () => {
    const res = await request(app.getHttpServer())
      .get('/validation')
      .expect(400);
    expect(res.body).toEqual({
      status_code: 400,
      error: 'BAD_REQUEST',
      message: 'Validation failed',
      details: [
        { field: 'price', message: 'price is required for LIMIT orders' },
      ],
    });
  });

  it('names a plain HttpException after its status', async () => {
    const res = await request(app.getHttpServer()).get('/http').expect(400);
    expect(res.body).toEqual({
      status_code: 400,
      error: 'BAD_REQUEST',
      message: 'bad id',
    });
  });

  it('answers unknown routes with the same shape', async () => {
    const res = await request(app.getHttpServer()).get('/nope').expect(404);
    expect(res.body).toMatchObject({ status_code: 404, error: 'NOT_FOUND' });
    expect(typeof res.body.message).toBe('string');
  });

  it('hides the message of an unexpected error and logs it once with context', async () => {
    const res = await request(app.getHttpServer())
      .get('/ledger')
      .set('X-Request-Id', 'req-9')
      .expect(500);
    expect(res.body).toEqual({
      status_code: 500,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    });
    const errors = lines.filter((l) => l.err);
    expect(errors).toHaveLength(1);
    expect(errors[0].err.context).toEqual({
      userId: 7,
      orderId: 11,
      instrumentId: 31,
    });
    expect(errors[0].reqId).toBe('req-9');
  });

  it('hides the message of a plain Error', async () => {
    const res = await request(app.getHttpServer()).get('/plain').expect(500);
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(lines.filter((l) => l.err)).toHaveLength(1);
  });
});
