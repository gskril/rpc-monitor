import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartPoint = {
  createdAt: string;
  failedProviders: string[];
  tickLabel: string;
} & Record<string, number | string | string[] | null>;

type TooltipPayloadEntry = {
  color?: string;
  dataKey?: string | number;
  name?: string;
  payload?: ChartPoint;
  value?: number | string | null;
};

const absoluteDateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const palette = ["#4bd3a7", "#7cd0ff", "#ffb66d", "#ff7d66", "#bb86fc", "#f6d365", "#6ee7b7"];

export default function LatencyChart(props: {
  chartData: ChartPoint[];
  highlightedProvider: string;
  providerKeys: string[];
}) {
  const colors = new Map(
    props.providerKeys.map((provider, index) => [provider, palette[index % palette.length] ?? "#7cd0ff"]),
  );

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={props.chartData}>
        <CartesianGrid stroke="rgba(145, 163, 176, 0.16)" strokeDasharray="3 3" />
        <XAxis dataKey="tickLabel" minTickGap={24} stroke="#8ba1b4" />
        <YAxis stroke="#8ba1b4" width={52} />
        <Tooltip
          content={({ active, payload }) => (
            <ChartTooltip
              active={active}
              colors={colors}
              payload={payload as unknown as readonly TooltipPayloadEntry[] | undefined}
              providerKeys={props.providerKeys}
            />
          )}
        />
        <Legend />
        {props.providerKeys.map((provider) => {
          const highlighted = provider === props.highlightedProvider;

          return (
            <Line
              key={provider}
              type="monotone"
              dataKey={provider}
              name={provider}
              stroke={colors.get(provider) ?? "#7cd0ff"}
              strokeOpacity={highlighted || !props.highlightedProvider ? 1 : 0.35}
              strokeWidth={highlighted ? 3 : 2}
              dot={false}
              activeDot={{ r: highlighted ? 5 : 4 }}
              connectNulls
              isAnimationActive={false}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}

function ChartTooltip(props: {
  active: boolean | undefined;
  colors: Map<string, string>;
  payload: readonly TooltipPayloadEntry[] | undefined;
  providerKeys: string[];
}) {
  if (!props.active || !props.payload?.length) {
    return null;
  }

  const point = props.payload[0]?.payload;

  if (!point) {
    return null;
  }

  const values = props.providerKeys
    .map((provider) => {
      const value = point[provider];

      return typeof value === "number" ? { provider, value } : null;
    })
    .filter((entry): entry is { provider: string; value: number } => entry !== null)
    .sort((left, right) => left.value - right.value);

  return (
    <div
      style={{
        background: "#101b28",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "14px",
        padding: "12px 14px",
      }}
    >
      <p style={{ margin: "0 0 10px", color: "#edf4fb" }}>
        {absoluteDateTime.format(new Date(point.createdAt))}
      </p>
      {values.map(({ provider, value }) => (
        <p key={provider} style={{ margin: "4px 0", color: props.colors.get(provider) ?? "#edf4fb" }}>
          {provider}: {value} ms
        </p>
      ))}
      {point.failedProviders.length ? (
        <p style={{ margin: "8px 0 0", color: "#ffb66d" }}>
          Failed: {point.failedProviders.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
