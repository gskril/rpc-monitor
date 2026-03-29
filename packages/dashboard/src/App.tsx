import {
  Suspense,
  lazy,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

import { fetchLatest, fetchTimeseries } from "./lib/api";
import type { LatestStat, TimeSeriesPoint } from "./types";

const OVERVIEW_WINDOW_HOURS = 1;
const AVAILABILITY_WINDOW_HOURS = 24;
const DEFAULT_TIMESERIES_HOURS = 6;

const absoluteDateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const compactTime = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const LatencyChart = lazy(() => import("./components/LatencyChart"));

type ChartDatum = {
  createdAt: string;
  failedProviders: string[];
  tickLabel: string;
} & Record<string, number | string | string[] | null>;

export default function App() {
  const [overviewRows, setOverviewRows] = useState<LatestStat[]>([]);
  const [availabilityRows, setAvailabilityRows] = useState<LatestStat[]>([]);
  const [timeseriesRows, setTimeseriesRows] = useState<TimeSeriesPoint[]>([]);
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [timeseriesHours, setTimeseriesHours] = useState(DEFAULT_TIMESERIES_HOURS);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [timeseriesLoading, setTimeseriesLoading] = useState(false);

  const deferredRegion = useDeferredValue(selectedRegion);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setOverviewLoading(true);
      setDashboardError(null);

      try {
        const [overview, availability] = await Promise.all([
          fetchLatest(OVERVIEW_WINDOW_HOURS),
          fetchLatest(AVAILABILITY_WINDOW_HOURS),
        ]);

        if (cancelled) {
          return;
        }

        setOverviewRows(overview.rows);
        setAvailabilityRows(availability.rows);

        if (overview.rows.length > 0) {
          const firstRow = overview.rows[0];

          if (!firstRow) {
            return;
          }

          startTransition(() => {
            setSelectedRegion((current) => current || firstRow.region);
            setSelectedProvider((current) => current || firstRow.provider);
          });
        }
      } catch (error) {
        if (!cancelled) {
          setDashboardError(formatError(error));
        }
      } finally {
        if (!cancelled) {
          setOverviewLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!deferredRegion) {
      return;
    }

    let cancelled = false;

    async function loadTimeseries() {
      setTimeseriesLoading(true);
      setDashboardError(null);

      try {
        const response = await fetchTimeseries({
          hours: timeseriesHours,
          region: deferredRegion,
        });

        if (!cancelled) {
          setTimeseriesRows(response.rows);
        }
      } catch (error) {
        if (!cancelled) {
          setDashboardError(formatError(error));
        }
      } finally {
        if (!cancelled) {
          setTimeseriesLoading(false);
        }
      }
    }

    void loadTimeseries();

    return () => {
      cancelled = true;
    };
  }, [deferredRegion, timeseriesHours]);

  const regions = useMemo(
    () => uniqueValues(overviewRows.map((row) => row.region)),
    [overviewRows],
  );

  const providers = useMemo(() => {
    const scoped = selectedRegion
      ? overviewRows.filter((row) => row.region === selectedRegion)
      : overviewRows;

    return uniqueValues(scoped.map((row) => row.provider));
  }, [overviewRows, selectedRegion]);

  useEffect(() => {
    if (!selectedRegion || providers.includes(selectedProvider)) {
      return;
    }

    startTransition(() => {
      setSelectedProvider(providers[0] ?? "");
    });
  }, [providers, selectedProvider, selectedRegion]);

  const selectedOverview = overviewRows.find(
    (row) => row.region === selectedRegion && row.provider === selectedProvider,
  );

  const chartProviders = useMemo(
    () => providers.filter((provider) => timeseriesRows.some((row) => row.provider === provider)),
    [providers, timeseriesRows],
  );

  const chartData = useMemo<ChartDatum[]>(() => {
    const points = new Map<string, ChartDatum>();

    for (const row of timeseriesRows) {
      const existing = points.get(row.createdAt);
      const point =
        existing ??
        {
          createdAt: row.createdAt,
          failedProviders: [],
          tickLabel: compactTime.format(new Date(row.createdAt)),
        };

      point[row.provider] = row.success ? row.responseMs : null;

      if (!row.success && !point.failedProviders.includes(row.provider)) {
        point.failedProviders = [...point.failedProviders, row.provider];
      }

      points.set(row.createdAt, point);
    }

    return Array.from(points.values()).sort(
      (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
    );
  }, [timeseriesRows]);

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">ENS Infrastructure Benchmarks</p>
          <h1>Resolution latency by RPC provider and Railway region</h1>
          <p className="hero-copy">
            Tracks real ENS `eth_call` performance for `vitalik.eth` and surfaces the
            latency and availability signals needed to choose the best backend path.
          </p>
        </div>
        <div className="hero-card">
          <Metric
            label="Tracked providers"
            value={String(uniqueValues(overviewRows.map((row) => row.provider)).length)}
          />
          <Metric
            label="Tracked regions"
            value={String(uniqueValues(overviewRows.map((row) => row.region)).length)}
          />
          <Metric
            label="Selected p95"
            value={selectedOverview?.p95Ms ? `${selectedOverview.p95Ms} ms` : "n/a"}
          />
        </div>
      </section>

      {dashboardError ? <p className="banner error">{dashboardError}</p> : null}
      {overviewLoading ? <p className="banner">Loading benchmark data...</p> : null}

      <section className="panel controls-panel">
        <div className="controls-header">
          <h2>Time series filters</h2>
          <p>Compare every provider in one Railway region and use the provider filter to highlight a line.</p>
        </div>
        <div className="controls-grid">
          <label>
            <span>Region</span>
            <select
              value={selectedRegion}
              onChange={(event) => {
                const nextRegion = event.target.value;
                startTransition(() => {
                  setSelectedRegion(nextRegion);
                });
              }}
            >
              {regions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Highlight provider</span>
            <select
              value={selectedProvider}
              onChange={(event) => {
                const nextProvider = event.target.value;
                startTransition(() => {
                  setSelectedProvider(nextProvider);
                });
              }}
            >
              {providers.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>History window</span>
            <select
              value={String(timeseriesHours)}
              onChange={(event) => {
                startTransition(() => {
                  setTimeseriesHours(Number(event.target.value));
                });
              }}
            >
              {[1, 3, 6, 12, 24, 72].map((hours) => (
                <option key={hours} value={hours}>
                  Last {hours}h
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel chart-panel">
        <div className="panel-header">
          <div>
            <h2>Latency over time</h2>
            <p>
              All providers in {selectedRegion || "a region"} over the last {timeseriesHours} hours
            </p>
          </div>
          <span className="status-chip">
            {timeseriesLoading
              ? "Refreshing…"
              : selectedProvider
                ? `Highlight: ${selectedProvider}`
                : "All providers"}
          </span>
        </div>

        <div className="chart-shell">
          <Suspense fallback={<p className="chart-loading">Loading chart...</p>}>
            <LatencyChart
              chartData={chartData}
              highlightedProvider={selectedProvider}
              providerKeys={chartProviders}
            />
          </Suspense>
        </div>
      </section>

      <section className="grid-two">
        <div className="panel table-panel">
          <div className="panel-header">
            <div>
              <h2>Latest latency snapshot</h2>
              <p>p50 and p95 for the last hour, grouped by region and provider.</p>
            </div>
            <span className="status-chip">1h window</span>
          </div>

          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Region</th>
                  <th>Provider</th>
                  <th>p50</th>
                  <th>p95</th>
                  <th>Success</th>
                  <th>Samples</th>
                </tr>
              </thead>
              <tbody>
                {overviewRows.map((row) => {
                  const selected =
                    row.region === selectedRegion && row.provider === selectedProvider;

                  return (
                    <tr
                      key={`${row.region}:${row.provider}`}
                      className={selected ? "selected-row" : undefined}
                    >
                      <td>{row.region}</td>
                      <td>{row.provider}</td>
                      <td>{row.p50Ms ? `${row.p50Ms} ms` : "n/a"}</td>
                      <td>{row.p95Ms ? `${row.p95Ms} ms` : "n/a"}</td>
                      <td>{row.successRate.toFixed(2)}%</td>
                      <td>{row.sampleCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel availability-panel">
          <div className="panel-header">
            <div>
              <h2>Availability by provider</h2>
              <p>Success rate for the last 24 hours.</p>
            </div>
            <span className="status-chip">24h window</span>
          </div>

          <div className="availability-grid">
            {availabilityRows.map((row) => (
              <article key={`${row.region}:${row.provider}`} className="availability-card">
                <div className="availability-topline">
                  <strong>{row.provider}</strong>
                  <span>{row.region}</span>
                </div>
                <p className="availability-rate">{row.successRate.toFixed(2)}%</p>
                <p className="availability-meta">
                  {row.successCount}/{row.sampleCount} successful calls
                </p>
                <p className="availability-meta">
                  Last sample {absoluteDateTime.format(new Date(row.latestAt))}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}
