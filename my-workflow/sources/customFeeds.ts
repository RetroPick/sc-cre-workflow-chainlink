import type { Runtime } from "@chainlink/cre-sdk";
import type { FeedConfig, FeedItem } from "../types/feed";
import { httpJsonRequest } from "../utils/http";
import { getValueByPath } from "../utils/jsonPath";

export function fetchCustomFeed(runtime: Runtime<unknown>, feed: FeedConfig): FeedItem[] {
  const category = feed.category || "custom";
  const resolveSeconds = feed.resolveSeconds ?? 24 * 60 * 60;

  if (feed.mock) {
    const value = feed.mockValue ?? "N/A";
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

  if (!feed.url) {
    throw new Error(`Custom feed ${feed.id} missing url`);
  }

  const response = httpJsonRequest(runtime, {
    url: feed.url,
    method: feed.method ?? "GET",
    headers: feed.headers,
    body: feed.body,
  });

  const json = JSON.parse(response.bodyText);
  const value = feed.valuePath ? getValueByPath(json, feed.valuePath) : json;
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

function renderTemplate(template: string | undefined, value: unknown): string {
  const safeTemplate = template || "Will the value be above {{value}}?";
  return safeTemplate.replace("{{value}}", String(value));
}

function nowPlus(seconds: number): number {
  return Math.floor(Date.now() / 1000) + seconds;
}
