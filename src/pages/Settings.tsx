import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminGate } from "@/components/admin/AdminGate";
import { DataQualityDashboard } from "@/components/quality/DataQualityDashboard";

const Settings = () => (
  <AdminGate>
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link to="/"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button></Link>
          <h1 className="text-xl font-semibold">Settings</h1>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-base">Data quality overview</CardTitle></CardHeader>
          <CardContent>
            <DataQualityDashboard variant="compact" showRevalidate={false} />
            <div className="mt-4">
              <Link to="/admin/data-quality">
                <Button size="sm" variant="outline">
                  Open full data quality controls <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-base">Other settings</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Link to="/settings/deal-scoring" className="block text-primary hover:underline">Deal scoring weights →</Link>
          </CardContent>
        </Card>
      </main>
    </div>
  </AdminGate>
);

export default Settings;