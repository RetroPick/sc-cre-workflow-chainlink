import type { Runtime } from "@chainlink/cre-sdk";
import type { FeedConfig, FeedItem } from "../types/feed";
import { httpJsonRequest } from "../utils/http";
import { getValueByPath } from "../utils/jsonPath";

export function fetchCoinGeckoFeed(runtime: Runtime<unknown>, feed: FeedConfig): FeedItem[] {
  const coinId = feed.coinId || "bitcoin";
  const vsCurrency = feed.vsCurrency || "usd";
  const multiplier = feed.multiplier ?? 1.05;
  const resolveSeconds = feed.resolveSeconds ?? 24 * 60 * 60;
  const category = feed.category || "crypto";
  const url =
    feed.url ||
    `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=${vsCurrency}`;

  if (feed.mock) {
    const mockValue = Number(feed.mockValue ?? 30000);
    const target = Math.round(mockValue * multiplier);
    return [
      {
        feedId: feed.id,
        question: `Will ${coinId} price be above ${target} ${vsCurrency} by ${formatResolveTime(
          resolveSeconds
        )}?`,
        category,
        resolveTime: nowPlus(resolveSeconds),
        sourceUrl: url,
        externalId: `${feed.id}:${coinId}:${target}`,
        metadata: feed.metadata,
      },
    ];
  }

  const response = httpJsonRequest(runtime, {
    url,
    method: feed.method ?? "GET",
    headers: feed.headers,
  });

  const json = JSON.parse(response.bodyText);
  const valuePath = feed.valuePath || `${coinId}.${vsCurrency}`;
  const price = Number(getValueByPath(json, valuePath));
  if (!Number.isFinite(price)) {
    throw new Error(`CoinGecko price missing for path ${valuePath}`);
  }

  const target = Math.round(price * multiplier);

  return [
    {
      feedId: feed.id,
      question: `Will ${coinId} price be above ${target} ${vsCurrency} by ${formatResolveTime(
        resolveSeconds
      )}?`,
      category,
      resolveTime: nowPlus(resolveSeconds),
      sourceUrl: url,
      externalId: `${feed.id}:${coinId}:${target}`,
      metadata: feed.metadata,
    },
  ];
}

function nowPlus(seconds: number): number {
  return Math.floor(Date.now() / 1000) + seconds;
}

function formatResolveTime(seconds: number): string {
  const hours = Math.round(seconds / 3600);
  return `${hours} hours`;
}
