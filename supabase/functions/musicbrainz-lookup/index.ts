// MusicBrainz lookup — resolves an ISRC (or recording MBID) to recording + work
// metadata, returning writer/composer/lyricist credits suitable for the
// canonical-credits normalizer.
//
// Body: { isrc?: string; recordingId?: string; workId?: string }
// Returns: { ok, recording?, works?, rawCredits?: Array<{name,role,source:'musicbrainz'}> }
//
// MusicBrainz requires a descriptive User-Agent. We additionally send the
// MetaBrainz Live Data Feed token via the standard `Authorization: Token <id>`
// header — accepted by ws/2 endpoints for higher rate limits.

import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MB_BASE = "https://musicbrainz.org/ws/2";
const UA = "Publisting/1.0 ( https://publisting.net )";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mbHeaders(): HeadersInit {
  const token = Deno.env.get("METABRAINZ_TOKEN");
  const h: Record<string, string> = { "User-Agent": UA, Accept: "application/json" };
  if (token) h["Authorization"] = `Token ${token}`;
  return h;
}

async function mbFetch(path: string): Promise<any> {
  const url = `${MB_BASE}${path}${path.includes("?") ? "&" : "?"}fmt=json`;
  const r = await fetch(url, { headers: mbHeaders(), signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`MusicBrainz ${r.status} ${path}`);
  return r.json();
}

type RawCredit = { name: string; role: string; source: "musicbrainz"; confidence?: number };

const ROLE_FROM_REL: Record<string, "writer" | "producer" | "performer"> = {
  composer: "writer",
  lyricist: "writer",
  writer: "writer",
  "writer (other)": "writer",
  arranger: "writer",
  producer: "producer",
  performer: "performer",
  vocal: "performer",
};

function extractWorkCredits(work: any): RawCredit[] {
  const out: RawCredit[] = [];
  for (const rel of work?.relations || []) {
    if (rel["target-type"] !== "artist" || !rel.artist?.name) continue;
    const role = ROLE_FROM_REL[(rel.type || "").toLowerCase()];
    if (!role) continue;
    out.push({ name: rel.artist.name, role, source: "musicbrainz", confidence: 0.75 });
  }
  return out;
}

function extractRecordingCredits(rec: any): RawCredit[] {
  const out: RawCredit[] = [];
  for (const rel of rec?.relations || []) {
    if (rel["target-type"] !== "artist" || !rel.artist?.name) continue;
    const t = (rel.type || "").toLowerCase();
    const role = ROLE_FROM_REL[t];
    if (role) out.push({ name: rel.artist.name, role, source: "musicbrainz", confidence: 0.7 });
  }
  return out;
}

async function lookupByIsrc(isrc: string) {
  const data = await mbFetch(`/isrc/${encodeURIComponent(isrc)}?inc=artist-credits+work-rels`);
  return (data?.recordings || [])[0] || null;
}

async function lookupRecording(id: string) {
  return mbFetch(`/recording/${encodeURIComponent(id)}?inc=artist-credits+work-rels+artist-rels`);
}

async function lookupWork(id: string) {
  return mbFetch(`/work/${encodeURIComponent(id)}?inc=artist-rels`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await supa.auth.getUser();
    if (userErr || !userRes?.user) return json({ ok: false, error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const isrc = (body?.isrc || "").trim().toUpperCase();
    const recordingId = (body?.recordingId || "").trim();
    const workId = (body?.workId || "").trim();

    if (!isrc && !recordingId && !workId) {
      return json({ ok: false, error: "isrc, recordingId, or workId required" }, 400);
    }

    let recordingShort: any = null;
    if (isrc) recordingShort = await lookupByIsrc(isrc);
    if (!recordingShort && recordingId) {
      const rec = await lookupRecording(recordingId);
      recordingShort = rec;
    }

    const credits: RawCredit[] = [];
    const works: any[] = [];

    if (recordingShort) {
      // Full recording fetch (with artist-rels) for producer/performer credits.
      const fullRec = recordingShort.relations
        ? recordingShort
        : await lookupRecording(recordingShort.id).catch(() => recordingShort);
      credits.push(...extractRecordingCredits(fullRec));

      const workRels = (fullRec?.relations || []).filter(
        (r: any) => r["target-type"] === "work" && r.work?.id,
      );
      // Fetch each linked work for writer credits (parallel, capped at 3 to be polite).
      const fetched = await Promise.all(
        workRels.slice(0, 3).map((r: any) => lookupWork(r.work.id).catch(() => null)),
      );
      for (const w of fetched) {
        if (!w) continue;
        works.push({ id: w.id, title: w.title, iswc: w.iswcs?.[0] });
        credits.push(...extractWorkCredits(w));
      }
    } else if (workId) {
      const w = await lookupWork(workId);
      works.push({ id: w.id, title: w.title, iswc: w.iswcs?.[0] });
      credits.push(...extractWorkCredits(w));
    }

    // Dedupe by (name, role)
    const seen = new Set<string>();
    const rawCredits = credits.filter((c) => {
      const k = `${c.name.toLowerCase()}|${c.role}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    return json({
      ok: true,
      recording: recordingShort
        ? { id: recordingShort.id, title: recordingShort.title, length: recordingShort.length }
        : null,
      works,
      rawCredits,
    });
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});