import {
  Suspense,
  lazy,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { fetchLatest, fetchTimeseries } from "./lib/api";
import {
  buildAggregateProviderRow,
  buildChartData,
  buildRankedProviders,
  buildRegionLatencyRows,
  getRankingValue,
  type RankedProvider,
  type RankingMetric,
  type RegionLatencyRow,
  uniqueValues,
} from "./lib/dashboardMetrics";

const DEFAULT_TIMESERIES_HOURS = 6;
const ALL_REGIONS = "all";

const absoluteDateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const compactTime = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const LatencyChart = lazy(() => import("./components/LatencyChart"));
const GlobalRanking = lazy(() => import("./components/GlobalRanking"));

export default function App() {
  const [selectedRegion, setSelectedRegion] = useState(ALL_REGIONS);
  const [selectedRegionalProvider, setSelectedRegionalProvider] = useState("");
  const [hiddenChartProviders, setHiddenChartProviders] = useState<string[]>(
    [],
  );
  const [rankingMetric, setRankingMetric] = useState<RankingMetric>("avg");
  const [timeseriesHours, setTimeseriesHours] = useState(
    DEFAULT_TIMESERIES_HOURS,
  );

  const regionalStatsQuery = useQuery({
    queryKey: ["latest", timeseriesHours],
    queryFn: () => fetchLatest(timeseriesHours),
    placeholderData: keepPreviousData,
  });

  const regionalStats = regionalStatsQuery.data?.rows ?? [];
  const globalStats = regionalStatsQuery.data?.globalRows ?? [];

  // Seed the default provider selection once data arrives.
  useEffect(() => {
    if (regionalStats.length > 0 && !selectedRegionalProvider) {
      const firstRow = regionalStats[0];
      if (!firstRow) return;
      startTransition(() => {
        setSelectedRegionalProvider((current) => current || firstRow.provider);
      });
    }
  }, [regionalStats, selectedRegionalProvider]);

  const timeseriesQuery = useQuery({
    queryKey: ["timeseries", selectedRegion, timeseriesHours],
    queryFn: () => {
      const params =
        selectedRegion === ALL_REGIONS
          ? { hours: timeseriesHours }
          : { hours: timeseriesHours, region: selectedRegion };
      return fetchTimeseries(params);
    },
    placeholderData: keepPreviousData,
  });

  const timeseriesRows = timeseriesQuery.data?.rows ?? [];
  const dashboardError = timeseriesQuery.error ?? regionalStatsQuery.error;

  const regions = useMemo(
    () => uniqueValues(regionalStats.map((row) => row.region)),
    [regionalStats],
  );

  const providers = useMemo(
    () => uniqueValues(regionalStats.map((row) => row.provider)),
    [regionalStats],
  );

  const chartProviders = useMemo(
    () => uniqueValues(timeseriesRows.map((row) => row.provider)),
    [timeseriesRows],
  );
  const hiddenChartProviderSet = useMemo(
    () => new Set(hiddenChartProviders),
    [hiddenChartProviders],
  );
  const visibleChartProviders = useMemo(
    () =>
      chartProviders.filter(
        (provider) => !hiddenChartProviderSet.has(provider),
      ),
    [chartProviders, hiddenChartProviderSet],
  );

  useEffect(() => {
    setHiddenChartProviders((current) => {
      const next = current.filter((provider) =>
        chartProviders.includes(provider),
      );

      return next.length === current.length ? current : next;
    });
  }, [chartProviders]);

  const { chartData } = useMemo(
    () =>
      buildChartData({
        rows: timeseriesRows,
        selectedRegion,
        tickFormatter: compactTime,
      }),
    [selectedRegion, timeseriesRows],
  );

  const globalRanking = useMemo<RankedProvider[]>(() => {
    return buildRankedProviders({
      globalRows: globalStats,
      rows: timeseriesRows,
      selectedRegion,
    });
  }, [globalStats, selectedRegion, timeseriesRows]);

  const rankedProviders = useMemo(() => {
    return globalRanking
      .filter((row) => getRankingValue(row, rankingMetric) !== null)
      .sort((left, right) => {
        return (
          getRankingValue(left, rankingMetric)! -
          getRankingValue(right, rankingMetric)!
        );
      });
  }, [globalRanking, rankingMetric]);

  const aggregateProviderRow = useMemo<RegionLatencyRow | null>(() => {
    return buildAggregateProviderRow({
      globalRows: globalStats,
      selectedProvider: selectedRegionalProvider,
      selectedRegion,
    });
  }, [globalStats, selectedRegionalProvider, selectedRegion]);

  const regionLatencyRows = useMemo<RegionLatencyRow[]>(() => {
    return buildRegionLatencyRows({
      aggregateProviderRow,
      regionalStats,
      selectedProvider: selectedRegionalProvider,
    });
  }, [aggregateProviderRow, regionalStats, selectedRegionalProvider]);

  const toggleChartProvider = useCallback((provider: string) => {
    startTransition(() => {
      setHiddenChartProviders((current) =>
        current.includes(provider)
          ? current.filter((item) => item !== provider)
          : [...current, provider],
      );
    });
  }, []);

  return (
    <main className="page-shell">
      <header className="header">
        <div className="header-left">
          <span className="header-tag">RPC Monitor</span>
          <h1>Ethereum RPC Provider Benchmarks</h1>
          <p className="header-note">
            All providers are on the free or PAYG tier — no premium monthly
            plans. All checks use the same <code>eth_call</code> to the ENS
            Universal Resolver.
          </p>
        </div>
        <div className="header-metrics">
          <div className="header-metric">
            <span>Providers</span>
            <strong>{providers.length}</strong>
          </div>
          <div className="header-metric">
            <span>Regions</span>
            <strong>{regions.length}</strong>
          </div>
        </div>
      </header>

      {dashboardError ? (
        <p className="banner error">{dashboardError.message}</p>
      ) : null}
      <div className="card">
        <div className="toolbar">
          <div className="toolbar-group">
            <span className="toolbar-label">Region</span>
            <select
              value={selectedRegion}
              onChange={(event) => {
                startTransition(() => setSelectedRegion(event.target.value));
              }}
            >
              <option value={ALL_REGIONS}>All regions</option>
              {regions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </div>

          <div className="toolbar-sep" />

          <div className="toolbar-group">
            <span className="toolbar-label">Window</span>
            <select
              value={String(timeseriesHours)}
              onChange={(event) => {
                startTransition(() =>
                  setTimeseriesHours(Number(event.target.value)),
                );
              }}
            >
              {[1, 3, 6, 12, 24].map((hours) => (
                <option key={hours} value={hours}>
                  Last {hours}h
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="section-header">
          <div>
            <h2 className="section-title">Latency over time</h2>
            <p className="section-subtitle">
              All providers
              {selectedRegion === ALL_REGIONS
                ? " averaged across all regions"
                : ` in ${selectedRegion}`}{" "}
              &middot; {timeseriesHours}h window
            </p>
          </div>
          <div className="section-actions">
            <details className="provider-menu">
              <summary>
                Providers ({visibleChartProviders.length}/
                {chartProviders.length})
              </summary>
              <div className="provider-menu-list">
                {chartProviders.map((provider) => {
                  const checked = !hiddenChartProviderSet.has(provider);

                  return (
                    <label key={provider} className="provider-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleChartProvider(provider)}
                      />
                      <span>{provider}</span>
                    </label>
                  );
                })}
              </div>
            </details>
          </div>
        </div>

        <div className="chart-shell">
          <Suspense
            fallback={<p className="chart-loading">Loading chart...</p>}
          >
            <LatencyChart
              chartData={chartData}
              providerKeys={visibleChartProviders}
            />
          </Suspense>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <div>
            <h2 className="section-title">Regional averages</h2>
            <p className="section-subtitle">
              {selectedRegionalProvider || "..."} across all regions &middot;{" "}
              {timeseriesHours}h window
            </p>
          </div>
          <div className="section-actions">
            <div className="toolbar-group">
              <span className="toolbar-label">Provider</span>
              <select
                value={selectedRegionalProvider}
                onChange={(event) => {
                  startTransition(() =>
                    setSelectedRegionalProvider(event.target.value),
                  );
                }}
              >
                {providers.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </div>
            {regionalStatsQuery.isFetching && (
              <span className="chip">Refreshing...</span>
            )}
          </div>
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Region</th>
                <th>Avg latency</th>
                <th>p95</th>
                <th>Success rate</th>
                <th>Samples</th>
                <th>Failures</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {regionLatencyRows.map((row) => (
                <tr
                  key={row.region}
                  className={
                    row.isAggregate
                      ? selectedRegion === ALL_REGIONS
                        ? "selected-row"
                        : undefined
                      : row.region === selectedRegion
                        ? "selected-row"
                        : undefined
                  }
                >
                  <td>{row.region}</td>
                  <td>
                    {row.averageLatencyMs !== null
                      ? `${row.averageLatencyMs} ms`
                      : "--"}
                  </td>
                  <td>{row.p95Ms !== null ? `${row.p95Ms} ms` : "--"}</td>
                  <td>
                    {row.successRate !== null ? (
                      <span className={rateClass(row.successRate)}>
                        {row.successRate.toFixed(1)}%
                      </span>
                    ) : (
                      "--"
                    )}
                  </td>
                  <td>{row.sampleCount}</td>
                  <td>{row.failedCount || "--"}</td>
                  <td>
                    {row.latestAt
                      ? absoluteDateTime.format(new Date(row.latestAt))
                      : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {rankedProviders.length > 0 && (
        <div className="card">
          <div className="section-header">
            <div>
              <h2 className="section-title">Provider ranking</h2>
              <p className="section-subtitle">
                {rankingMetric === "avg" ? "Average latency" : "P95 latency"}
                {selectedRegion === ALL_REGIONS
                  ? " across all regions"
                  : ` in ${selectedRegion}`}{" "}
                &middot; {timeseriesHours}h window
              </p>
            </div>
            <div className="section-actions">
              <div className="metric-toggle" aria-label="Ranking metric">
                <button
                  type="button"
                  aria-pressed={rankingMetric === "avg"}
                  className={rankingMetric === "avg" ? "is-active" : undefined}
                  onClick={() => {
                    startTransition(() => setRankingMetric("avg"));
                  }}
                >
                  Avg
                </button>
                <button
                  type="button"
                  aria-pressed={rankingMetric === "p95"}
                  className={rankingMetric === "p95" ? "is-active" : undefined}
                  onClick={() => {
                    startTransition(() => setRankingMetric("p95"));
                  }}
                >
                  P95
                </button>
              </div>
              {timeseriesQuery.isFetching && (
                <span className="chip">Refreshing...</span>
              )}
            </div>
          </div>
          <Suspense fallback={null}>
            <GlobalRanking metric={rankingMetric} rows={rankedProviders} />
          </Suspense>
        </div>
      )}
    </main>
  );
}

function rateClass(rate: number): string {
  if (rate >= 99) return "rate-good";
  if (rate >= 90) return "rate-warn";
  return "rate-bad";
}
