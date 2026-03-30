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
  epoch: number;
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

const compactTime = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const palette = [
  "#5eead4",
  "#7dd3fc",
  "#fbbf24",
  "#f87171",
  "#c084fc",
  "#a3e635",
  "#fb923c",
];

export default function LatencyChart(props: {
  chartData: ChartPoint[];
  highlightedProvider: string;
  providerKeys: string[];
}) {
  const colors = new Map(
    props.providerKeys.map((provider, index) => [
      provider,
      palette[index % palette.length] ?? "#7dd3fc",
    ]),
  );

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={props.chartData}
        margin={{ top: 8, right: 32, bottom: 12, left: 6 }}
      >
        <CartesianGrid
          stroke="rgba(255, 255, 255, 0.04)"
          strokeDasharray="none"
          vertical={false}
        />
        <XAxis
          dataKey="epoch"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          minTickGap={28}
          stroke="#4a5568"
          tick={{
            fill: "#6b7f94",
            fontSize: 12,
            fontFamily: "'IBM Plex Mono', monospace",
          }}
          tickLine={false}
          axisLine={{ stroke: "rgba(255, 255, 255, 0.06)" }}
          tickFormatter={(v: number) => compactTime.format(new Date(v))}
        />
        <YAxis
          stroke="#4a5568"
          width={52}
          tick={{
            fill: "#6b7f94",
            fontSize: 12,
            fontFamily: "'IBM Plex Mono', monospace",
          }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${v}ms`}
        />
        <Tooltip
          content={({ active, payload }) => (
            <ChartTooltip
              active={active}
              colors={colors}
              payload={
                payload as unknown as readonly TooltipPayloadEntry[] | undefined
              }
              providerKeys={props.providerKeys}
            />
          )}
        />
        <Legend
          iconType="plainline"
          wrapperStyle={{
            fontSize: "0.8rem",
            fontFamily: "'DM Sans Variable', sans-serif",
            paddingTop: 8,
          }}
        />
        {props.providerKeys.map((provider) => {
          const highlighted = provider === props.highlightedProvider;

          return (
            <Line
              key={provider}
              type="monotone"
              dataKey={provider}
              name={provider}
              stroke={colors.get(provider) ?? "#7dd3fc"}
              strokeOpacity={
                highlighted || !props.highlightedProvider ? 1 : 0.2
              }
              strokeWidth={highlighted ? 2.5 : 1.5}
              dot={false}
              activeDot={{ r: highlighted ? 4 : 3, strokeWidth: 0 }}
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
    .filter(
      (entry): entry is { provider: string; value: number } => entry !== null,
    )
    .sort((left, right) => left.value - right.value);

  return (
    <div
      style={{
        background: "rgba(8, 14, 23, 0.96)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "8px",
        padding: "10px 12px",
        fontSize: "0.82rem",
        lineHeight: 1.5,
      }}
    >
      <p
        style={{
          margin: "0 0 6px",
          color: "#8a9bb0",
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "0.75rem",
        }}
      >
        {absoluteDateTime.format(new Date(point.createdAt))}
      </p>
      {values.map(({ provider, value }) => (
        <p
          key={provider}
          style={{
            margin: "2px 0",
            color: props.colors.get(provider) ?? "#e8edf2",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 2,
              background: props.colors.get(provider),
              marginRight: 6,
            }}
          />
          {provider}:{" "}
          <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            {value}ms
          </span>
        </p>
      ))}
      {point.failedProviders.length ? (
        <p style={{ margin: "6px 0 0", color: "#fbbf24", fontSize: "0.78rem" }}>
          Failed: {point.failedProviders.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
