import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Credit } from "./CreditsSection";
import { PieChart as PieIcon, AlertTriangle } from "lucide-react";

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

const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, value }: any) => {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (value < 8) return null;

  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${value}%`}
    </text>
  );
};

export const PublishingSplitChart = ({ credits }: PublishingSplitChartProps) => {
  const hasRealShares = useMemo(() => credits.some(c => c.publishingShare && c.publishingShare > 0), [credits]);

  const chartData = useMemo(() => {
    let entries: { name: string; value: number }[] = [];

    if (hasRealShares) {
      const pubMap = new Map<string, number>();
      credits.forEach((c) => {
        if (c.publishingShare && c.publishingShare > 0) {
          const pub = c.publisher || "Unknown Publisher";
          pubMap.set(pub, (pubMap.get(pub) || 0) + c.publishingShare);
        }
      });
      if (pubMap.size === 0) return [];
      entries = Array.from(pubMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    } else {
      const pubMap = new Map<string, number>();
      let withoutPublisher = 0;
      const pubCredits = credits.filter(c => c.role === "writer" || c.role === "producer");
      if (pubCredits.length === 0) return [];

      pubCredits.forEach((c) => {
        if (c.publisher) {
          pubMap.set(c.publisher, (pubMap.get(c.publisher) || 0) + 1);
        } else {
          withoutPublisher++;
        }
      });

      if (pubMap.size === 0 && withoutPublisher === 0) return [];

      const total = pubCredits.length;
      entries = Array.from(pubMap.entries())
        .map(([name, count]) => ({ name, value: count / total * 100 }))
        .sort((a, b) => b.value - a.value);

      if (withoutPublisher > 0) {
        entries.push({ name: "No Publisher", value: (withoutPublisher / total) * 100 });
      }
    }

    // Normalize to 100%
    const totalRaw = entries.reduce((sum, e) => sum + e.value, 0);
    if (totalRaw > 0 && totalRaw !== 100) {
      entries = entries.map(e => ({
        name: e.name,
        value: Math.round((e.value / totalRaw) * 1000) / 10,
      }));
    } else {
      entries = entries.map(e => ({
        name: e.name,
        value: Math.round(e.value * 10) / 10,
      }));
    }

    const roundedSum = entries.reduce((s, e) => s + e.value, 0);
    if (entries.length > 0 && Math.abs(roundedSum - 100) > 0.01) {
      entries[0].value = Math.round((entries[0].value + (100 - roundedSum)) * 10) / 10;
    }

    return entries;
  }, [credits, hasRealShares]);

  const totalPublishers = useMemo(() => {
    return new Set(credits.filter(c => c.publisher).map(c => c.publisher)).size;
  }, [credits]);

  if (chartData.length === 0) return null;

  return (
    <div className="glass rounded-xl p-4 animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <PieIcon className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Publishing Split</h3>
        {totalPublishers > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">{totalPublishers} publisher{totalPublishers !== 1 ? "s" : ""}</span>
        )}
      </div>
      <div className="flex items-center gap-6 flex-wrap justify-center">
        <div className="h-[200px] w-[200px] relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                strokeWidth={2}
                stroke="hsl(var(--background))"
                label={renderCustomLabel}
                labelLine={false}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => `${value}%`}
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "hsl(var(--foreground))",
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
      {/* Disclaimer for estimated splits */}
      {!hasRealShares && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-300/90 leading-relaxed">
            Estimated equal split — actual ownership shares may differ. Verify via SongView, MLC, or ASCAP ACE.
          </p>
        </div>
      )}
    </div>
  );
};
