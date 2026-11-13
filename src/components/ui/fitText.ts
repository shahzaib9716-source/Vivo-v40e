/**
 * Rough text measuring for short labels (durations, percentages, single words).
 *
 * React Native can shrink text to fit with `adjustsFontSizeToFit`, but only on iOS and Android.
 * These helpers pick a size up front from the characters in the string, so the label also fits
 * on web and never has to wrap or truncate first. The widths are deliberately a little generous.
 */

const NARROW = "il.,:;'!|";
const SLIM = 'ftjr-·';
const WIDE = 'mwMW%';

/** Estimated width of `text` in ems, for a bold sans-serif face. */
export function estimateEm(text: string): number {
  let em = 0;
  for (const ch of text) {
    if (ch === ' ') em += 0.28;
    else if (NARROW.includes(ch)) em += 0.3;
    else if (SLIM.includes(ch)) em += 0.4;
    else if (WIDE.includes(ch)) em += 0.9;
    else if (ch >= 'A' && ch <= 'Z') em += 0.72;
    else em += 0.62;
  }
  return em;
}

/** The largest whole font size, from `min` up to `base`, at which `text` fits in `maxWidth`. */
export function fitFontSize(text: string, base: number, maxWidth: number, min = 9): number {
  const em = estimateEm(text);
  if (em === 0 || maxWidth <= 0) return Math.floor(base);
  return Math.max(min, Math.floor(Math.min(base, maxWidth / em)));
}
