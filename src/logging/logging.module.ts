import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule, type Params } from 'nestjs-pino';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';

type Request = IncomingMessage & { id?: unknown; originalUrl?: string };

export interface LoggingEnv {
  NODE_ENV: string;
  LOG_LEVEL: string;
}

export function serializeRequest(req: Request) {
  const url = req.originalUrl ?? req.url ?? '';
  return { id: req.id, method: req.method, path: url.split('?')[0] };
}

export function buildPinoHttpOptions(env: LoggingEnv): Params['pinoHttp'] {
  return {
    level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    transport:
      env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' },
          }
        : undefined,
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const id = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
      res.setHeader('X-Request-Id', id);
      return id;
    },
    serializers: {
      req: serializeRequest,
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    redact: ['req.headers', 'req.body'],
    quietReqLogger: true,
    customLogLevel: (_req, res, err) =>
      err || res.statusCode >= 500
        ? 'error'
        : res.statusCode >= 400
          ? 'warn'
          : 'info',
    customSuccessMessage: (req, res) =>
      `${req.method} ${serializeRequest(req).path} ${res.statusCode}`,
    customErrorObject: (_req, _res, _err, val: Record<string, unknown>) => ({
      res: val.res,
      responseTime: val.responseTime,
    }),
    customErrorMessage: (req, res) =>
      `${req.method} ${serializeRequest(req).path} ${res.statusCode}`,
    autoLogging: {
      ignore: (req) => req.method === 'GET' && req.url === '/health',
    },
  };
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: buildPinoHttpOptions({
          NODE_ENV: config.getOrThrow<string>('NODE_ENV'),
          LOG_LEVEL: config.getOrThrow<string>('LOG_LEVEL'),
        }),
      }),
    }),
  ],
})
export class LoggingModule {}
