import "npm:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface HunterRequest {
  firstName: string;
  lastName: string;
  domain?: string;
  company?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("HUNTER_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Hunter.io API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: HunterRequest = await req.json();
    const { firstName, lastName, domain, company } = body;

    if (!firstName || !lastName) {
      return new Response(
        JSON.stringify({ error: "firstName and lastName are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try email-finder if we have a domain
    if (domain) {
      const finderUrl = new URL("https://api.hunter.io/v2/email-finder");
      finderUrl.searchParams.set("first_name", firstName);
      finderUrl.searchParams.set("last_name", lastName);
      finderUrl.searchParams.set("domain", domain);
      finderUrl.searchParams.set("api_key", apiKey);

      const finderRes = await fetch(finderUrl.toString());
      const finderData = await finderRes.json();

      if (finderData?.data?.email) {
        return new Response(
          JSON.stringify({
            email: finderData.data.email,
            confidence: finderData.data.confidence,
            source: "hunter-finder",
            firstName: finderData.data.first_name,
            lastName: finderData.data.last_name,
            position: finderData.data.position,
            company: finderData.data.company,
            linkedin: finderData.data.linkedin_url || null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fallback: domain-search to find any emails at the company domain
    if (domain) {
      const searchUrl = new URL("https://api.hunter.io/v2/domain-search");
      searchUrl.searchParams.set("domain", domain);
      searchUrl.searchParams.set("api_key", apiKey);
      searchUrl.searchParams.set("limit", "5");

      const searchRes = await fetch(searchUrl.toString());
      const searchData = await searchRes.json();

      const emails = (searchData?.data?.emails || []).map((e: any) => ({
        email: e.value,
        confidence: e.confidence,
        firstName: e.first_name,
        lastName: e.last_name,
        position: e.position,
        department: e.department,
      }));

      if (emails.length > 0) {
        return new Response(
          JSON.stringify({ emails, source: "hunter-domain-search", domain }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Last fallback: email-verifier with a guessed pattern (first.last@domain)
    // If no domain, just return not found
    return new Response(
      JSON.stringify({
        email: null,
        source: "hunter",
        message: domain
          ? "No email found for this person at the given domain"
          : "A company domain is needed for email lookup",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Hunter lookup error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to lookup email" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
