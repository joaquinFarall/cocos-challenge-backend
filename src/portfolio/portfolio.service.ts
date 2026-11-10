import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { toMoneyString } from '../domain/decimal';
import { buildPortfolio, computePositions } from '../domain/portfolio';
import { PortfolioResponseDto } from './dto/portfolio-response.dto';
import { PortfolioRepository } from './portfolio.repository';

@Injectable()
export class PortfolioService {
  constructor(private readonly repository: PortfolioRepository) {}

  async getPortfolio(userId: number): Promise<PortfolioResponseDto> {
    const user = await this.repository.findUser(userId);
    if (!user)
      throw new ApiException(404, 'USER_NOT_FOUND', `User ${userId} not found`);

    const orders = await this.repository.findRelevantOrders(userId);
    const positions = computePositions(orders);
    const quotes = await this.repository.findLatestQuotes(
      positions.map((p) => p.instrumentId),
    );
    const closes = new Map(
      [...quotes].map(([id, quote]) => [id, quote.close] as const),
    );
    const portfolio = buildPortfolio(orders, positions, closes);

    return {
      account_number: user.accountNumber,
      available: toMoneyString(portfolio.available),
      total_cash: toMoneyString(portfolio.totalCash),
      total_value: toMoneyString(portfolio.totalValue),
      assets: portfolio.positions
        .map((position) => {
          const quote = quotes.get(position.instrumentId)!;
          return {
            instrument_id: position.instrumentId,
            ticker: quote.ticker,
            name: quote.name,
            shares: position.shares,
            value: toMoneyString(position.value),
            yield: toMoneyString(position.yieldPct),
          };
        })
        .sort((a, b) => a.ticker.localeCompare(b.ticker)),
    };
  }
}
