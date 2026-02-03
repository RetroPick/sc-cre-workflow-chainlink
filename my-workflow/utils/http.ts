import { cre, ok, consensusIdenticalAggregation, type Runtime, type HTTPSendRequester } from "@chainlink/cre-sdk";

type HttpResponse = {
  statusCode: number;
  bodyText: string;
};

type HttpRequestConfig = {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
};

function encodeJsonBodyBase64(payload: unknown): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, "utf8").toString("base64");
}

export function httpJsonRequest(runtime: Runtime<unknown>, request: HttpRequestConfig): HttpResponse {
  const httpClient = new cre.capabilities.HTTPClient();
  const aggregatedResponse = consensusIdenticalAggregation<HttpResponse>();

  const requestBuilder = (sendRequester: HTTPSendRequester): HttpResponse => {
    const response = sendRequester.sendRequest({
      url: request.url,
      method: request.method ?? "GET",
      body: request.body ? encodeJsonBodyBase64(request.body) : undefined,
      headers: request.headers ?? {},
    }).result();

    const bodyText = new TextDecoder().decode(response.body);

    if (!ok(response)) {
      throw new Error(`HTTP error ${response.statusCode}: ${bodyText}`);
    }

    return {
      statusCode: response.statusCode,
      bodyText,
    };
  };

  return httpClient
    .sendRequest(runtime, requestBuilder, aggregatedResponse)
    (runtime.config as any)
    .result();
}
