import type { LatestStatsResponse, TimeSeriesResponse } from "../types";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export async function fetchLatest(hours: number): Promise<LatestStatsResponse> {
  return request<LatestStatsResponse>(`/api/latest?hours=${hours}`);
}

export async function fetchTimeseries(params: {
  hours: number;
  provider?: string;
  region?: string;
}): Promise<TimeSeriesResponse> {
  const searchParams = new URLSearchParams({
    hours: String(params.hours),
  });

  if (params.provider) {
    searchParams.set("provider", params.provider);
  }

  if (params.region) {
    searchParams.set("region", params.region);
  }

  return request<TimeSeriesResponse>(`/api/timeseries?${searchParams.toString()}`);
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}
