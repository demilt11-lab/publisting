import { User, Pen, Disc3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type CreditRole = "artist" | "writer" | "producer";
export type PublishingStatus = "signed" | "unsigned" | "unknown";

interface CreditCardProps {
  name: string;
  role: CreditRole;
  publishingStatus: PublishingStatus;
  publisher?: string;
  ipi?: string;
  pro?: string;
}

const roleIcons = {
  artist: User,
  writer: Pen,
  producer: Disc3,
};

const roleLabels = {
  artist: "Artist",
  writer: "Writer",
  producer: "Producer",
};

const statusLabels: Record<PublishingStatus, string> = {
  signed: "Signed",
  unsigned: "Unsigned",
  unknown: "Unknown",
};

// PRO badge colors - distinct for major PROs
const proStyles: Record<string, string> = {
  ASCAP: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  BMI: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  SESAC: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  PRS: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  GEMA: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  SOCAN: "bg-red-500/20 text-red-400 border-red-500/30",
  APRA: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  JASRAC: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  IPRS: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  SAMRO: "bg-lime-500/20 text-lime-400 border-lime-500/30",
  SACEM: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  SIAE: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  KOMCA: "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30",
  SACM: "bg-sky-500/20 text-sky-400 border-sky-500/30",
};

const getProStyle = (pro: string): string => {
  return proStyles[pro.toUpperCase()] || "bg-muted text-muted-foreground border-border";
};

export const CreditCard = ({ name, role, publishingStatus, publisher, ipi, pro }: CreditCardProps) => {
  const Icon = roleIcons[role];

  return (
    <div className="glass glass-hover rounded-xl p-4 flex items-center gap-4 animate-fade-up">
      <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-foreground truncate">{name}</h3>
          <Badge variant="secondary" className="text-xs">
            {roleLabels[role]}
          </Badge>
          {pro && (
            <Badge 
              variant="outline" 
              className={`text-xs font-semibold ${getProStyle(pro)}`}
            >
              {pro}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
          {publisher && <span>{publisher}</span>}
          {ipi && <span className="font-mono">IPI: {ipi}</span>}
        </div>
      </div>
      
      <Badge variant={publishingStatus} className="flex-shrink-0">
        {statusLabels[publishingStatus]}
      </Badge>
    </div>
  );
};
