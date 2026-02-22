import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Credit } from "./CreditsSection";
import { PieChart as PieIcon } from "lucide-react";

interface PublishingSplitChartProps {
  credits: Credit[];
}

const COLORS = [
  "hsl(141, 73%, 42%)",
  "hsl(221, 83%, 53%)",
  "hsl(280, 67%, 52%)",
  "hsl(25, 95%, 53%)",
  "hsl(349, 89%, 53%)",
  "hsl(173, 80%, 40%)",
  "hsl(45, 93%, 47%)",
  "hsl(315, 70%, 50%)",
];

export const PublishingSplitChart = ({ credits }: PublishingSplitChartProps) => {
  const chartData = useMemo(() => {
    const pubMap = new Map<string, number>();
    let totalAssigned = 0;

    credits.forEach((c) => {
      if (c.publishingShare && c.publishingShare > 0) {
        const pub = c.publisher || "Unknown Publisher";
        pubMap.set(pub, (pubMap.get(pub) || 0) + c.publishingShare);
        totalAssigned += c.publishingShare;
      }
    });

    if (pubMap.size === 0) return [];

    const entries = Array.from(pubMap.entries())
      .map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }))
      .sort((a, b) => b.value - a.value);

    if (totalAssigned < 100) {
      entries.push({ name: "Unaccounted", value: Math.round((100 - totalAssigned) * 10) / 10 });
    }

    return entries;
  }, [credits]);

  if (chartData.length === 0) return null;

  return (
    <div className="glass rounded-xl p-4 animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <PieIcon className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Publishing Split</h3>
      </div>
      <div className="flex items-center gap-6 flex-wrap justify-center">
        <div className="h-[180px] w-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                strokeWidth={2}
                stroke="hsl(var(--background))"
                label={({ value }) => `${value}%`}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => `${value}%`}
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col gap-2">
          {chartData.map((entry, i) => (
            <div key={entry.name} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <div>
                <p className="text-sm font-medium text-foreground">{entry.name}</p>
                <p className="text-xs text-muted-foreground">{entry.value}%</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
