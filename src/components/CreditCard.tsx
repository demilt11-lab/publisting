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

export const CreditCard = ({ name, role, publishingStatus, publisher, ipi }: CreditCardProps) => {
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
