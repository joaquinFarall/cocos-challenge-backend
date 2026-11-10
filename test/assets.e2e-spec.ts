import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup/app';

interface Asset {
  id: number;
  ticker: string;
  name: string;
  type: string;
  last_close: string | null;
  daily_return: string | null;
  price_date: string | null;
}

// The seed has 66 instruments: 65 ACCIONES plus ARS (MONEDA).
const TOTAL_ASSETS = 65;

describe('GET /assets', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (query = '') =>
    request(app.getHttpServer()).get(`/assets${query}`);
  const tickers = (body: { data: Asset[] }) => body.data.map((a) => a.ticker);

  describe('listing and pagination', () => {
    it('returns the first page sorted by ticker, without ARS', async () => {
      const { body } = await get().expect(200);
      expect(body).toMatchObject({ total: TOTAL_ASSETS, page: 1, limit: 20 });
      expect(body.data).toHaveLength(20);
      expect(body.data[0].ticker).toBe('AGRO');
      const list = tickers(body);
      expect(list).toEqual([...list].sort((a, b) => (a < b ? -1 : 1)));
      expect(list).not.toContain('ARS');
    });

    it('returns the documented shape', async () => {
      const { body } = await get('?ticker=PAMP').expect(200);
      expect(body.data).toEqual([
        {
          id: 47,
          ticker: 'PAMP',
          name: 'Pampa Holding S.A.',
          type: 'ACCIONES',
          last_close: '925.85',
          daily_return: '0.44',
          price_date: '2023-07-14',
        },
      ]);
    });

    it('returns every asset with limit=100', async () => {
      const { body } = await get('?limit=100').expect(200);
      expect(body.data).toHaveLength(TOTAL_ASSETS);
      expect(body.limit).toBe(100);
    });

    it('returns the remainder on the last page', async () => {
      const { body } = await get('?page=4').expect(200);
      expect(body.data).toHaveLength(TOTAL_ASSETS - 60);
      expect(body).toMatchObject({ total: TOTAL_ASSETS, page: 4 });
    });

    it('does not repeat items across pages', async () => {
      const first = (await get('?limit=30&page=1').expect(200)).body;
      const second = (await get('?limit=30&page=2').expect(200)).body;
      const all = [...tickers(first), ...tickers(second)];
      expect(new Set(all).size).toBe(all.length);
    });

    it('returns an empty page with the real total past the end', async () => {
      const { body } = await get('?page=100').expect(200);
      expect(body).toEqual({
        data: [],
        total: TOTAL_ASSETS,
        page: 100,
        limit: 20,
      });
    });
  });

  describe('search', () => {
    it('matches ticker case-insensitively and partially', async () => {
      const { body } = await get('?ticker=pam').expect(200);
      expect(tickers(body)).toEqual(['PAMP']);
    });

    it('matches name partially', async () => {
      const { body } = await get('?name=banco').expect(200);
      expect(tickers(body)).toEqual(['BBAR', 'BHIP', 'BMA', 'BPAT']);
      expect(body.total).toBe(4);
    });

    it('combines name and ticker with AND', async () => {
      const both = await get('?name=banco&ticker=ba').expect(200);
      expect(tickers(both.body)).toEqual(['BBAR']);
      const none = await get('?name=banco&ticker=pamp').expect(200);
      expect(none.body).toMatchObject({ data: [], total: 0 });
    });

    it('returns null last_close for an instrument without market data', async () => {
      const { body } = await get('?ticker=PGR').expect(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].last_close).toBeNull();
    });

    it('returns null daily_return and price_date without market data', async () => {
      for (const ticker of ['PGR', 'IRCP']) {
        const { body } = await get(`?ticker=${ticker}`).expect(200);
        expect(body.data[0]).toMatchObject({
          last_close: null,
          daily_return: null,
          price_date: null,
        });
      }
    });

    it('computes a negative daily return from the latest row', async () => {
      const { body } = await get('?ticker=BMA').expect(200);
      expect(body.data[0]).toMatchObject({
        last_close: '1502.80',
        daily_return: '-1.15',
        price_date: '2023-07-14',
      });
    });

    it('has daily_return and price_date for every asset with a price', async () => {
      const { body } = await get('?limit=100').expect(200);
      for (const asset of body.data as Asset[]) {
        const priced = asset.last_close !== null;
        expect(asset.daily_return !== null).toBe(priced);
        expect(asset.price_date !== null).toBe(priced);
        if (priced) {
          expect(asset.daily_return).toMatch(/^-?\d+\.\d{2}$/);
          expect(asset.price_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      }
    });

    it('treats % and _ literally', async () => {
      for (const q of ['name=%25', 'name=_', 'ticker=%25', 'ticker=_']) {
        const { body } = await get(`?${q}`).expect(200);
        expect(body).toMatchObject({ data: [], total: 0 });
      }
    });

    it('does not return ARS', async () => {
      for (const q of ['ticker=ARS', 'name=pesos']) {
        const { body } = await get(`?${q}`).expect(200);
        expect(body).toMatchObject({ data: [], total: 0 });
      }
    });

    it('does not handle accents', async () => {
      const accented = await get(`?name=${encodeURIComponent('Río')}`).expect(
        200,
      );
      expect(tickers(accented.body)).toContain('MOLI');
      const plain = await get('?name=Rio').expect(200);
      expect(tickers(plain.body)).not.toContain('MOLI');
    });

    it('ignores empty and blank filters', async () => {
      const all = (await get().expect(200)).body;
      for (const q of ['?name=', '?ticker=', '?name=%20%20&ticker=']) {
        expect((await get(q).expect(200)).body).toEqual(all);
      }
    });

    it('trims filters', async () => {
      const { body } = await get('?ticker=%20pamp%20').expect(200);
      expect(tickers(body)).toEqual(['PAMP']);
    });
  });

  describe('400', () => {
    it.each([
      ['an unknown param', '?foo=bar', 'foo'],
      ['page=0', '?page=0', 'page'],
      ['page=01', '?page=01', 'page'],
      ['page=1.5', '?page=1.5', 'page'],
      ['page=abc', '?page=abc', 'page'],
      ['an empty page', '?page=', 'page'],
      ['page over INT max', '?page=2147483648', 'page'],
      ['limit=0', '?limit=0', 'limit'],
      ['limit=101', '?limit=101', 'limit'],
      ['limit=1e1', '?limit=1e1', 'limit'],
      ['a repeated name', '?name=a&name=b', 'name'],
      ['a name over 255 chars', `?name=${'a'.repeat(256)}`, 'name'],
      ['a ticker over 255 chars', `?ticker=${'a'.repeat(256)}`, 'ticker'],
    ])('rejects %s', async (_label, query, field) => {
      const { body } = await get(query).expect(400);
      expect(body).toMatchObject({
        status_code: 400,
        error: 'BAD_REQUEST',
        message: 'Validation failed',
      });
      expect(
        (body.details as { field: string }[]).map((d) => d.field),
      ).toContain(field);
    });
  });
});
