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
  failureMs: number | null;
  successMs: number | null;
  tickLabel: string;
};

const absoluteDateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function LatencyChart(props: { chartData: ChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={props.chartData}>
        <CartesianGrid stroke="rgba(145, 163, 176, 0.16)" strokeDasharray="3 3" />
        <XAxis dataKey="tickLabel" minTickGap={24} stroke="#8ba1b4" />
        <YAxis stroke="#8ba1b4" width={52} />
        <Tooltip
          contentStyle={{
            background: "#101b28",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "14px",
          }}
          formatter={formatTooltipValue}
          labelFormatter={(_, payload) => {
            const point = payload?.[0]?.payload as ChartPoint | undefined;
            return point ? absoluteDateTime.format(new Date(point.createdAt)) : "";
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="successMs"
          name="Successful calls"
          stroke="#4bd3a7"
          strokeWidth={2.5}
          dot={false}
          connectNulls={false}
        />
        <Line
          type="linear"
          dataKey="failureMs"
          name="Failed calls"
          stroke="#ff7d66"
          strokeWidth={2}
          dot={{ fill: "#ff7d66", r: 3 }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function formatTooltipValue(
  value: number | string | readonly (number | string)[] | undefined,
): string {
  return typeof value === "number" ? `${value} ms` : "n/a";
}
