import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { Building2 } from "lucide-react";
import { Credit } from "./CreditsSection";

interface PublisherMarketShareProps {
  credits: Credit[];
}

const MAJOR_PUBLISHERS = ["Universal", "Sony", "Warner", "Kobalt", "BMG"];
const COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(349, 89%, 53%)",
  "hsl(141, 73%, 42%)",
  "hsl(25, 95%, 53%)",
  "hsl(280, 67%, 52%)",
  "hsl(173, 80%, 40%)",
  "hsl(45, 93%, 47%)",
];

function classifyPublisher(pub: string): string {
  const lower = pub.toLowerCase();
  for (const major of MAJOR_PUBLISHERS) {
    if (lower.includes(major.toLowerCase())) return major;
  }
  return "Independent";
}

export const PublisherMarketShare = ({ credits }: PublisherMarketShareProps) => {
  const data = useMemo(() => {
    const pubCredits = credits.filter(c => c.publisher && (c.role === "writer" || c.role === "producer"));
    if (pubCredits.length === 0) return [];
    const map = new Map<string, number>();
    pubCredits.forEach(c => {
      const cat = classifyPublisher(c.publisher!);
      map.set(cat, (map.get(cat) || 0) + 1);
    });
    const total = pubCredits.length;
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, value: Math.round((count / total) * 100) }))
      .sort((a, b) => b.value - a.value);
  }, [credits]);

  if (data.length === 0) return null;

  return (
    <div className="glass rounded-xl p-4 animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <Building2 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Publisher Breakdown</h3>
      </div>
      <div className="flex items-center gap-4 flex-wrap justify-center">
        <div className="h-[120px] w-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={50} strokeWidth={2} stroke="hsl(var(--background))">
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <RechartsTooltip
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
        <div className="flex flex-col gap-1">
          {data.map((entry, i) => (
            <div key={entry.name} className="flex items-center gap-2 text-xs">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="text-foreground font-medium">{entry.name}</span>
              <span className="text-muted-foreground">{entry.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
