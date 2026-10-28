import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/**
 * Translate an array of strings to a target language via the `translate` Edge
 * Function. Returns the originals unchanged if translation isn't available.
 */
export async function translateTexts(target: string, texts: string[]): Promise<string[]> {
  if (!isSupabaseConfigured || !supabase) return texts;
  try {
    const { data, error } = await supabase.functions.invoke("translate", { body: { target, texts } });
    const out = (data as { texts?: string[] } | null)?.texts;
    if (error || !out || out.length !== texts.length) return texts;
    return out;
  } catch {
    return texts;
  }
}

export const isTranslationAvailable = () => isSupabaseConfigured;
