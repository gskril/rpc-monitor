import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

const palette = [
  "#5eead4",
  "#7dd3fc",
  "#fbbf24",
  "#f87171",
  "#c084fc",
  "#a3e635",
  "#fb923c",
];

type RankedProvider = {
  provider: string;
  avgMs: number;
  successRate: number;
};

function BarLabel(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
  index?: number;
  rows: RankedProvider[];
}) {
  const { x = 0, y = 0, width = 0, height = 0, index = 0, rows } = props;
  const row = rows[index];
  if (!row) return null;

  const rateColor =
    row.successRate >= 99
      ? "var(--accent)"
      : row.successRate >= 90
        ? "var(--warning)"
        : "var(--danger)";

  return (
    <g>
      <text
        x={x + width + 6}
        y={y + height / 2}
        dominantBaseline="central"
        className="ranking-ms"
      >
        {row.avgMs} ms
      </text>
      <text
        x={x + width + 6}
        y={y + height / 2}
        dx="4.5em"
        dominantBaseline="central"
        className="ranking-rate"
        fill={rateColor}
      >
        {row.successRate.toFixed(1)}%
      </text>
    </g>
  );
}

export default function GlobalRanking(props: { rows: RankedProvider[] }) {
  if (!props.rows.length) return null;

  const maxMs = Math.max(...props.rows.map((r) => r.avgMs));

  return (
    <div className="ranking-chart">
      <ResponsiveContainer width="100%" height={props.rows.length * 36 + 8}>
        <BarChart
          data={props.rows}
          layout="vertical"
          margin={{ top: 0, right: 120, bottom: 0, left: 0 }}
          barCategoryGap={6}
        >
          <XAxis type="number" hide domain={[0, maxMs * 1.15]} />
          <YAxis
            type="category"
            dataKey="provider"
            width={80}
            axisLine={false}
            tickLine={false}
            tick={{
              fill: "#e8edf2",
              fontSize: 13,
              fontFamily: "'DM Sans', sans-serif",
            }}
          />
          <Bar
            dataKey="avgMs"
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
            label={<BarLabel rows={props.rows} />}
          >
            {props.rows.map((entry, index) => (
              <Cell
                key={entry.provider}
                fill={palette[index % palette.length] ?? "#5eead4"}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
