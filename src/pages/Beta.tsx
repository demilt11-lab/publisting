import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Disc3, ArrowRight, CheckCircle2, BarChart3, Search, Shield, Users } from "lucide-react";
import appPreview from "@/assets/app-preview.jpg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  role: z.string().min(1, "Please select a role"),
});

const ROLES = [
  { value: "sync_agent", label: "Sync Agent" },
  { value: "publisher", label: "Publisher" },
  { value: "label", label: "Label / A&R" },
  { value: "manager", label: "Manager" },
  { value: "other", label: "Other" },
];

const FEATURES = [
  {
    icon: Search,
    title: "Instant Credits Lookup",
    description: "Search any song and see every writer, producer, and artist — plus who's signed.",
  },
  {
    icon: BarChart3,
    title: "Signing Intelligence",
    description: "Instantly see which creators are unsigned and worth pursuing for publishing deals.",
  },
  {
    icon: Shield,
    title: "PRO & MLC Data",
    description: "Cross-reference ASCAP, BMI, SESAC, and MLC share data in one view.",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Share watchlists, track outreach status, and coordinate with your team.",
  },
];

const Beta = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = signupSchema.safeParse({ name, email, role });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("beta_signups")
        .insert({ name: result.data.name, email: result.data.email, role: result.data.role });

      if (error) {
        if (error.code === "23505") {
          toast({ title: "Already signed up", description: "This email is already on the waitlist!", variant: "destructive" });
        } else {
          throw error;
        }
      } else {
        setIsSuccess(true);
      }
    } catch {
      toast({ title: "Something went wrong", description: "Please try again later.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-primary/3 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Disc3 className="w-6 h-6 text-primary" />
          </div>
          <span className="font-display text-xl font-bold">PubCheck</span>
        </div>
        <span className="text-xs font-medium text-primary bg-primary/10 px-3 py-1.5 rounded-full tracking-wide uppercase">
          Beta
        </span>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="px-6 md:px-12 pt-12 md:pt-24 pb-16 md:pb-32 max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
            {/* Left — Copy */}
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight">
                  Know who controls
                  <br />
                  <span className="text-primary">every song.</span>
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground max-w-lg leading-relaxed">
                  The credits intelligence platform for A&R reps, publishers, and catalog managers. Find unsigned talent, track outreach, and sign smarter.
                </p>
              </div>

              {/* Social proof */}
              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="w-8 h-8 rounded-full bg-secondary border-2 border-background flex items-center justify-center text-xs font-medium text-secondary-foreground">
                        {String.fromCharCode(65 + i)}
                      </div>
                    ))}
                  </div>
                  <span>200+ on waitlist</span>
                </div>
              </div>
            </div>

            {/* Right — Form */}
            <div className="w-full max-w-md mx-auto md:mx-0 md:ml-auto">
              {isSuccess ? (
                <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-4 animate-fade-up">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8 text-primary" />
                  </div>
                  <h2 className="font-display text-2xl font-semibold">You're on the list!</h2>
                  <p className="text-muted-foreground">We'll reach out when your spot is ready. Keep an eye on your inbox.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-8 space-y-5">
                  <div className="space-y-1">
                    <h2 className="font-display text-xl font-semibold">Join the Beta</h2>
                    <p className="text-sm text-muted-foreground">Get early access before public launch.</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Input
                        placeholder="Your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={errors.name ? "border-destructive" : ""}
                      />
                      {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
                    </div>

                    <div>
                      <Input
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={errors.email ? "border-destructive" : ""}
                      />
                      {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
                    </div>

                    <div>
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className={`flex w-full h-10 rounded-md border bg-card px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors ${
                          !role ? "text-muted-foreground" : "text-foreground"
                        } ${errors.role ? "border-destructive" : "border-border"}`}
                      >
                        <option value="" disabled>Select your role</option>
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      {errors.role && <p className="text-xs text-destructive mt-1">{errors.role}</p>}
                    </div>
                  </div>

                  <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
                    {isSubmitting ? "Submitting..." : "Request Early Access"}
                    {!isSubmitting && <ArrowRight className="w-4 h-4" />}
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">No spam. We'll only email you about PubCheck.</p>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 md:px-12 py-16 md:py-24 border-t border-border/50">
          <div className="max-w-7xl mx-auto">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-12">
              Everything you need to <span className="text-primary">clear songs faster</span>
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="bg-card border border-border rounded-xl p-6 space-y-3 hover:border-primary/30 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <feature.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-display font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* App Preview */}
        <section className="px-6 md:px-12 py-16 md:py-24">
          <div className="max-w-5xl mx-auto">
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-2xl shadow-primary/5">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-secondary/30">
                <div className="w-3 h-3 rounded-full bg-destructive/60" />
                <div className="w-3 h-3 rounded-full bg-warning/60" />
                <div className="w-3 h-3 rounded-full bg-success/60" />
                <span className="text-xs text-muted-foreground ml-2">pubcheck.app</span>
              </div>
              <div className="aspect-video">
                <img src={appPreview} alt="PubCheck app showing song credits, signing status, and publishing splits" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 px-6 md:px-12 py-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Disc3 className="w-4 h-4 text-primary" />
            <span>PubCheck © {new Date().getFullYear()}</span>
          </div>
          <p>Publishing rights intelligence for music professionals.</p>
        </div>
      </footer>
    </div>
  );
};

export default Beta;
