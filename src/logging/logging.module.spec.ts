import { Controller, Get, Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Writable } from 'node:stream';
import { Logger, LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { LedgerInconsistencyError } from '../domain/portfolio';
import { buildPinoHttpOptions, serializeRequest } from './logging.module';

@Controller()
class DummyController {
  @Get('ok')
  ok() {
    return { ok: true };
  }

  @Get('broken')
  broken(): never {
    throw new LedgerInconsistencyError('boom', {
      userId: 7,
      orderId: 11,
      instrumentId: 31,
    });
  }
}

describe('buildPinoHttpOptions', () => {
  const base = { NODE_ENV: 'production', LOG_LEVEL: 'info' };

  it('is silent in test, whatever LOG_LEVEL says', () => {
    expect(buildPinoHttpOptions({ ...base, NODE_ENV: 'test' })).toMatchObject({
      level: 'silent',
    });
  });

  it('uses pino-pretty only in development', () => {
    const dev = buildPinoHttpOptions({ ...base, NODE_ENV: 'development' });
    expect(dev).toMatchObject({ transport: { target: 'pino-pretty' } });
    expect(buildPinoHttpOptions(base)).toMatchObject({ transport: undefined });
  });

  it('serializes only id, method and path (no headers, query or body)', () => {
    const serialized = serializeRequest({
      id: 'r1',
      method: 'POST',
      url: '/users/1/orders?email=a@b.com',
      headers: { authorization: 'secret' },
      body: { email: 'a@b.com' },
    } as never);
    expect(serialized).toEqual({
      id: 'r1',
      method: 'POST',
      path: '/users/1/orders',
    });
  });
});

describe('request logging', () => {
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
    })
    class TestModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
    lines.length = 0; // drop Nest's boot logs
  });

  afterEach(() => app.close());

  it('echoes a valid X-Request-Id and logs one request line', async () => {
    const response = await request(app.getHttpServer())
      .get('/ok?email=a@b.com')
      .set('X-Request-Id', 'abc-123')
      .set('Authorization', 'Bearer secret');

    expect(response.headers['x-request-id']).toBe('abc-123');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 30,
      req: { id: 'abc-123', method: 'GET', path: '/ok' },
      res: { statusCode: 200 },
      msg: 'GET /ok 200',
    });
    expect(typeof lines[0].responseTime).toBe('number');
    expect(JSON.stringify(lines)).not.toMatch(/a@b\.com|secret/);
  });

  it('generates and returns an id when none is sent', async () => {
    const response = await request(app.getHttpServer()).get('/ok');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(lines[0].req.id).toBe(response.headers['x-request-id']);
  });

  it('logs unknown routes as warn with the 404 status', async () => {
    await request(app.getHttpServer()).get('/nope').expect(404);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 40, res: { statusCode: 404 } });
  });

  it('logs an unhandled error once, with context and request id', async () => {
    await request(app.getHttpServer())
      .get('/broken')
      .set('X-Request-Id', 'req-9')
      .expect(500);

    const errors = lines.filter((l) => l.err);
    expect(errors).toHaveLength(1);
    expect(errors[0].err.stack).toContain('LedgerInconsistencyError');
    expect(errors[0].err.context).toEqual({
      userId: 7,
      orderId: 11,
      instrumentId: 31,
    });
    expect(errors[0].reqId).toBe('req-9');
    const requestLine = lines.find((l) => l.msg === 'GET /broken 500');
    expect(requestLine).toMatchObject({
      level: 50,
      res: { statusCode: 500 },
    });
    expect(requestLine).not.toHaveProperty('err');
  });
});
