import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ContactResult {
  personName: string;
  contactType: 'email' | 'phone';
  value: string;
  contactFor: string; // e.g. "Artist", "Manager", "Label A&R", "Publisher"
  foundAt: string; // source where it was found
  confidence?: number;
}

/** Guess domain from company name */
function guessDomain(company: string): string | null {
  const known: Record<string, string> = {
    'sony music': 'sonymusic.com',
    'sony music publishing': 'sonymusicpub.com',
    'universal music': 'umusic.com',
    'universal music group': 'umusic.com',
    'universal music publishing': 'umusicpub.com',
    'warner music': 'warnermusic.com',
    'warner chappell': 'warnerchappell.com',
    'warner records': 'warnerrecords.com',
    'atlantic records': 'atlanticrecords.com',
    'republic records': 'republicrecords.com',
    'interscope': 'interscope.com',
    'def jam': 'defjam.com',
    'columbia records': 'columbiarecords.com',
    'rca records': 'rcarecords.com',
    'capitol records': 'capitolmusic.com',
    'island records': 'islandrecords.com',
    'epic records': 'epicrecords.com',
    'elektra': 'elektrarecords.com',
    'parlophone': 'parlophone.co.uk',
    'virgin music': 'virginmusic.com',
    'concord': 'concord.com',
    'bmg': 'bmg.com',
    'kobalt': 'kobaltmusic.com',
    'downtown music': 'downtownmusic.com',
    'pulse': 'pulse-music.com',
    'hipgnosis': 'hipgnosissongs.com',
    'primary wave': 'primarywave.com',
    'reservoir media': 'reservoir-media.com',
    'big machine': 'bigmachinelabelgroup.com',
    'empire': 'empi.re',
    '300 entertainment': '300ent.com',
    'quality control': 'qualitycontrolmusic.com',
    'top dawg': 'topdawgent.com',
    'ovo sound': 'ovosound.com',
    'good music': 'goodmusic.com',
    'pglang': 'pglang.com',
    '10k projects': '10kprojects.com',
    'alamo records': 'alamorecords.com',
    'loverenaissance': 'lfrlegion.com',
    'motown': 'motownrecords.com',
    'geffen': 'geffen.com',
  };

  const lower = company.toLowerCase().trim();
  for (const [key, domain] of Object.entries(known)) {
    if (lower.includes(key)) return domain;
  }

  // Generic domain guess
  const slug = lower
    .replace(/\b(music|records|recording|entertainment|group|publishing|pub)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
  if (slug.length >= 3) return `${slug}.com`;
  return null;
}

/** Use Hunter.io to find emails for a person at a company */
async function hunterLookup(
  firstName: string,
  lastName: string,
  domain: string,
  hunterKey: string
): Promise<{ email?: string; confidence?: number; position?: string }> {
  try {
    const url = new URL('https://api.hunter.io/v2/email-finder');
    url.searchParams.set('first_name', firstName);
    url.searchParams.set('last_name', lastName);
    url.searchParams.set('domain', domain);
    url.searchParams.set('api_key', hunterKey);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (data?.data?.email) {
      return {
        email: data.data.email,
        confidence: data.data.confidence,
        position: data.data.position,
      };
    }
  } catch (e) {
    console.error('Hunter lookup failed:', e);
  }
  return {};
}

/** Use Hunter.io domain search to find general company emails */
async function hunterDomainSearch(
  domain: string,
  hunterKey: string
): Promise<Array<{ email: string; firstName?: string; lastName?: string; position?: string; confidence?: number }>> {
  try {
    const url = new URL('https://api.hunter.io/v2/domain-search');
    url.searchParams.set('domain', domain);
    url.searchParams.set('api_key', hunterKey);
    url.searchParams.set('limit', '5');

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    return (data?.data?.emails || []).map((e: any) => ({
      email: e.value,
      firstName: e.first_name,
      lastName: e.last_name,
      position: e.position,
      confidence: e.confidence,
    }));
  } catch {
    return [];
  }
}

/** Use AI to search for publicly available contact info */
async function aiContactSearch(
  artistName: string,
  recordLabel: string | undefined,
  publishers: string[],
  management: string | undefined
): Promise<ContactResult[]> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return [];

  const entities = [artistName];
  if (management) entities.push(`${management} (manager of ${artistName})`);
  if (recordLabel) entities.push(`${recordLabel} (record label)`);
  publishers.forEach(p => entities.push(`${p} (publisher)`));

  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        temperature: 0.0,
        max_tokens: 3000,
        messages: [
          {
            role: 'system',
            content: `You are a music industry contact researcher. Find publicly available professional contact information (email addresses, phone numbers) for the given people and companies.

Return ONLY a JSON array of contact objects:
- personName: string (the person or company name)
- contactType: "email" or "phone"
- value: string (the email address or phone number)
- contactFor: string (role like "Artist", "Manager", "Label A&R", "Publisher", "Booking Agent", "PR/Publicity")
- foundAt: string (where this info is publicly available, e.g. "Artist website", "Instagram bio", "LinkedIn", "ASCAP registry", "BMI database", "Label website", "AllMusic")

CRITICAL RULES:
1. Only return contact info you are HIGHLY CONFIDENT is real and publicly available
2. Many artists have booking/management emails on their social media bios or websites — include these
3. Record labels and publishers have general contact emails on their websites — include these (e.g. info@label.com, sync@publisher.com)
4. PRO registries (ASCAP, BMI, SESAC) sometimes list publisher contact info
5. Do NOT fabricate email addresses or phone numbers
6. Do NOT guess email formats — only include verified public info
7. Return [] if no real contact info is known
8. Return ONLY valid JSON array`,
          },
          {
            role: 'user',
            content: `Find publicly available contact information (emails, phone numbers) for these music industry entities:\n${entities.join('\n')}\n\nReturn [] if you don't know any real contact info.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((c: any) => c.personName && c.value && c.contactType && c.contactFor && c.foundAt)
      .filter((c: any) => {
        if (c.contactType === 'email') {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.value);
        }
        if (c.contactType === 'phone') {
          return /[\d\-+() ]{7,}/.test(c.value);
        }
        return false;
      })
      .map((c: any) => ({
        personName: String(c.personName),
        contactType: c.contactType as 'email' | 'phone',
        value: String(c.value),
        contactFor: String(c.contactFor),
        foundAt: String(c.foundAt),
      }));
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { artistName, recordLabel, publishers, management } = await req.json();

    if (!artistName) {
      return new Response(JSON.stringify({ success: false, error: 'artistName is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Contact discovery for:', artistName, '| label:', recordLabel, '| publishers:', publishers);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Check cache
    const cacheKey = `contacts-v1::${artistName.toLowerCase().trim()}`;
    const { data: cached } = await supabase
      .from('hunter_email_cache')
      .select('data, expires_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (cached && new Date(cached.expires_at) > new Date()) {
      return new Response(JSON.stringify(cached.data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contacts: ContactResult[] = [];
    const hunterKey = Deno.env.get('HUNTER_API_KEY');
    const pubList: string[] = Array.isArray(publishers) ? publishers.slice(0, 3) : [];

    // Strategy 1: Hunter.io for label & publisher domains
    if (hunterKey) {
      const domains: Array<{ company: string; domain: string; contactFor: string }> = [];

      if (recordLabel) {
        const d = guessDomain(recordLabel);
        if (d) domains.push({ company: recordLabel, domain: d, contactFor: 'Label' });
      }
      for (const pub of pubList) {
        const d = guessDomain(pub);
        if (d) domains.push({ company: pub, domain: d, contactFor: 'Publisher' });
      }

      // Run domain searches in parallel
      const domainResults = await Promise.all(
        domains.map(async ({ company, domain, contactFor }) => {
          const emails = await hunterDomainSearch(domain, hunterKey);
          return emails.map(e => ({
            personName: [e.firstName, e.lastName].filter(Boolean).join(' ') || company,
            contactType: 'email' as const,
            value: e.email,
            contactFor: e.position || `${contactFor} Contact`,
            foundAt: `Hunter.io (${domain})`,
            confidence: e.confidence,
          }));
        })
      );

      domainResults.flat().forEach(c => contacts.push(c));
    }

    // Strategy 2: AI knowledge search for public contact info
    const aiContacts = await aiContactSearch(artistName, recordLabel, pubList, management);
    console.log('AI found', aiContacts.length, 'contacts');

    // Merge AI contacts (deduplicate by email value)
    const seenValues = new Set(contacts.map(c => c.value.toLowerCase()));
    for (const c of aiContacts) {
      if (!seenValues.has(c.value.toLowerCase())) {
        seenValues.add(c.value.toLowerCase());
        contacts.push(c);
      }
    }

    const responseData = {
      success: true,
      contacts,
      totalFound: contacts.length,
    };

    // Cache for 7 days
    try {
      await supabase.from('hunter_email_cache').upsert(
        {
          cache_key: cacheKey,
          data: responseData,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: 'cache_key' }
      );
    } catch (e) {
      console.error('Cache write failed:', e);
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Contact discovery error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Contact discovery failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
