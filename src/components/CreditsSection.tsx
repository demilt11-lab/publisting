import { CreditCard, CreditRole, PublishingStatus } from "./CreditCard";

export interface Credit {
  name: string;
  role: CreditRole;
  publishingStatus: PublishingStatus;
  publisher?: string;
  ipi?: string;
  pro?: string;
}

interface CreditsSectionProps {
  credits: Credit[];
}

export const CreditsSection = ({ credits }: CreditsSectionProps) => {
  const artists = credits.filter(c => c.role === "artist");
  const writers = credits.filter(c => c.role === "writer");
  const producers = credits.filter(c => c.role === "producer");

  const renderSection = (title: string, items: Credit[]) => {
    if (items.length === 0) return null;
    
    return (
      <div className="space-y-3">
        <h3 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
          {title}
          <span className="text-sm font-normal text-muted-foreground">({items.length})</span>
        </h3>
        <div className="space-y-2">
          {items.map((credit, index) => (
            <CreditCard key={`${credit.name}-${index}`} {...credit} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
      {renderSection("Artists", artists)}
      {renderSection("Songwriters", writers)}
      {renderSection("Producers", producers)}
    </div>
  );
};
