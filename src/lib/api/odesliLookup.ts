import { supabase } from "@/integrations/supabase/client";

export interface StreamingLinks {
  pageUrl?: string;
  links: {
    spotify?: string;
    appleMusic?: string;
    youtube?: string;
    youtubeMusic?: string;
    tidal?: string;
    deezer?: string;
    amazonMusic?: string;
    soundcloud?: string;
    pandora?: string;
  };
}

export async function fetchStreamingLinks(
  url?: string,
  title?: string,
  artist?: string
): Promise<StreamingLinks> {
  try {
    const { data, error } = await supabase.functions.invoke('odesli-lookup', {
      body: { url, title, artist },
    });

    if (error) {
      console.error('Odesli lookup error:', error);
      return { links: {} };
    }

    return data as StreamingLinks;
  } catch (error) {
    console.error('Failed to fetch streaming links:', error);
    return { links: {} };
  }
}
