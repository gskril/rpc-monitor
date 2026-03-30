import {
  Bar,
  BarChart,
  Cell,
  type LabelProps,
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

function BarLabel(props: LabelProps & { rows: RankedProvider[] }) {
  const { x, y, width, height, index, rows } = props;
  if (
    x == null ||
    y == null ||
    width == null ||
    height == null ||
    index == null
  )
    return null;
  const row = rows[index as number];
  if (!row) return null;

  const rateColor =
    row.successRate >= 99
      ? "#5eead4"
      : row.successRate >= 90
        ? "#fbbf24"
        : "#f87171";

  return (
    <text
      x={(x as number) + (width as number) + 6}
      y={(y as number) + (height as number) / 2}
      dominantBaseline="central"
      fontFamily="'DM Mono Variable', monospace"
    >
      <tspan fill="#e8edf2" fontSize={13} fontWeight={500}>
        {row.avgMs} ms
      </tspan>
      <tspan fill={rateColor} fontSize={11} dx={8} className="medium-hide">
        {row.successRate.toFixed(1)}%
      </tspan>
    </text>
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
          margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
          barCategoryGap={6}
        >
          <XAxis type="number" hide domain={[0, maxMs * 1.15]} />
          <YAxis
            type="category"
            dataKey="provider"
            width={120}
            axisLine={false}
            tickLine={false}
            tick={{
              fill: "#e8edf2",
              fontSize: 13,
              fontFamily: "'DM Sans Variable', sans-serif",
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
