/**
 * SOI Voice — Pronunciation
 *
 * Fixes pronunciation for TTS. SOI is pronounced "Soi" (like "soy"),
 * not spelled out as "S O I."
 */

/**
 * Prepare text for spoken delivery.
 * Fixes acronyms, abbreviations, and operational terms.
 */
export function prepareForSpeech(text: string): string {
  return text
    // SOI → Soi (pronounced like "soy")
    .replace(/\bSOI\b/g, 'Soi')
    .replace(/\bS\.O\.I\.\b/g, 'Soi')
    .replace(/\bS\.O\.I\b/g, 'Soi')
    // Common operational abbreviations
    .replace(/\bkt\b/g, 'knots')
    .replace(/\best\.\s*/gi, 'estimated ')
    .replace(/\bm\b(?=\s|$|,|\.)/g, ' minutes')
    // Pressure notation
    .replace(/(\d+)\/100/g, '$1 out of 100')
    // Gate/zone names — ensure natural reading
    .replace(/52([A-I])/g, '52 $1')
    // Clean up multiple spaces
    .replace(/\s{2,}/g, ' ')
    .trim();
}
