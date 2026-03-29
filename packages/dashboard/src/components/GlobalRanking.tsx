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

export default function GlobalRanking(props: { rows: RankedProvider[] }) {
  if (!props.rows.length) return null;

  const maxMs = Math.max(...props.rows.map((r) => r.avgMs));

  return (
    <div className="ranking-chart">
      <ResponsiveContainer width="100%" height={props.rows.length * 36 + 8}>
        <BarChart
          data={props.rows}
          layout="vertical"
          margin={{ top: 0, right: 64, bottom: 0, left: 0 }}
          barCategoryGap={6}
        >
          <XAxis type="number" hide domain={[0, maxMs * 1.15]} />
          <YAxis
            type="category"
            dataKey="provider"
            width={100}
            axisLine={false}
            tickLine={false}
            tick={{
              fill: "#e8edf2",
              fontSize: 13,
              fontFamily: "'DM Sans', sans-serif",
            }}
          />
          <Bar dataKey="avgMs" radius={[0, 4, 4, 0]} isAnimationActive={false}>
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

      {/* Overlay labels showing ms values */}
      <div className="ranking-labels" style={{ top: 4 }}>
        {props.rows.map((row) => (
          <div
            key={row.provider}
            className="ranking-label"
            style={{ height: 36 }}
          >
            <span className="ranking-ms">{row.avgMs} ms</span>
            <span
              className="ranking-rate"
              style={{
                color:
                  row.successRate >= 99
                    ? "var(--accent)"
                    : row.successRate >= 90
                      ? "var(--warning)"
                      : "var(--danger)",
              }}
            >
              {row.successRate.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
