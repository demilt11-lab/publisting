---
name: Strict Title+Artist Matching for Genius/Deezer Credit Lookups
description: Genius and Deezer fallbacks in spotify-credits-lookup MUST use strict near-equal title matching and 4+ char artist matching to prevent wrong-song credit attribution for Indian/Punjabi/African/Latin catalogs.
type: feature
---
In `supabase/functions/spotify-credits-lookup/index.ts`, both `fetchCreditsViaGenius` and `fetchCreditsViaDeezer` use strict matching helpers (`titleMatchesStrict`, `artistMatchesStrict`) instead of bidirectional substring includes.

Why: Substring matching caused mis-attribution (e.g. "295" matching "295 Returns", "AP" matching "AP Dhillon Acoustic") and pulled credits from wrong songs in Indian/Punjabi catalog.

Rules:
- Title must equal exactly OR differ by ≤6 chars suffix (allows " - Remaster" type variants).
- Artist must equal exactly OR shorter side ≥4 chars and fully contained in longer.

Spotify scrape fallback also tries regional intl variants (intl-pt, intl-fr, intl-es, intl-hi, intl-pa) so African/Asian releases that only render full credits on locale-matched pages are covered.

AI fallback prompt is hardened: must return empty arrays when no Genius/Deezer hint context is present, and is extra-strict for non-Anglophone catalog (Indian, Naija, Amapiano, Afrobeats, Lusophone, Latin, Punjabi).
