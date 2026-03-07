import type { Runtime } from "@chainlink/cre-sdk";
import type { FeedConfig, FeedItem } from "../types/feed";
import { httpJsonRequest } from "../utils/http";
import { getValueByPath } from "../utils/jsonPath";

export function fetchGithubTrends(runtime: Runtime<unknown>, feed: FeedConfig): FeedItem[] {
  const category = feed.category || "dev";
  const resolveSeconds = feed.resolveSeconds ?? 7 * 24 * 60 * 60;

  if (feed.mock) {
    const value = feed.mockValue ?? "repo-name";
    const question = renderTemplate(feed.questionTemplate, value);
    return [
      {
        feedId: feed.id,
        question,
        category,
        resolveTime: nowPlus(resolveSeconds),
        sourceUrl: feed.url,
        externalId: `${feed.id}:${String(value)}`,
        metadata: feed.metadata,
      },
    ];
  }

  const url =
    feed.url ||
    "https://api.github.com/search/repositories?q=stars:>50000&sort=stars&order=desc";

  const response = httpJsonRequest(runtime, {
    url,
    method: feed.method ?? "GET",
    headers: feed.headers,
  });

  const json = JSON.parse(response.bodyText);
  const value = feed.valuePath ? getValueByPath(json, feed.valuePath) : json?.items?.[0]?.full_name;
  const question = renderTemplate(feed.questionTemplate, value);

  return [
    {
      feedId: feed.id,
      question,
      category,
      resolveTime: nowPlus(resolveSeconds),
      sourceUrl: url,
      externalId: `${feed.id}:${String(value)}`,
      metadata: feed.metadata,
    },
  ];
}

function renderTemplate(template: string | undefined, value: unknown): string {
  const safeTemplate = template || "Will {{value}} gain 1000 stars in 7 days?";
  return safeTemplate.replace("{{value}}", String(value));
}

function nowPlus(seconds: number): number {
  return Math.floor(Date.now() / 1000) + seconds;
}
