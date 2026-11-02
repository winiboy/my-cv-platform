import { describe, expect, it } from 'vitest'
import { buildTranslationPrompt } from './prompts'

/**
 * The resume-section translation prompt (`POST /api/ai/translate`), pinned in
 * full. cover-letter-export-translate US-003 moved its language tables into
 * constants it shares with the cover-letter translation prompt; the text it
 * builds must not change. The expected value is the prompt built by
 * `src/lib/ai/prompts.ts` at commit 281088a, before that move.
 */

/** `buildTranslationPrompt` at 281088a, for the input below. */
const PROMPT_AT_281088A =
  "You are a professional translator specializing in resume and CV translations.\n\nTranslate the following resume summary to German.\n\n**RULES:**\n1. **Maintain Professional Tone:** Keep the same level of professionalism and formality\n2. **Preserve Meaning:** Do not add or remove information\n3. **Natural Flow:** The translation should read naturally in German, not like a word-for-word translation\n4. **Business Context:** Use appropriate business and professional terminology\n5. **Length:** Keep similar length to the original (±10%)\n6. **Format:** Return ONLY the translated text, no explanations or comments\n7. **CRITICAL - Preserve Structure:**\n   - Maintain ALL line breaks and paragraph structure EXACTLY as in the original\n   - Preserve bullet points (•, -, *) and their formatting\n   - Keep numbered lists intact (1., 2., 3., etc.)\n   - Maintain spacing and indentation\n   - If the original has multiple paragraphs, your translation MUST have the same number of paragraphs\n   - If the original has bullet points, your translation MUST have bullet points in the same positions\n\n**Target Language Context:**\nUse professional German business language. Maintain formal tone.\n\n**Example of Structure Preservation:**\nIf the original text is:\n\"Experienced developer with 5 years of experience.\n\nKey achievements:\n• Led a team of 5 developers\n• Increased performance by 40%\n• Delivered 10+ projects\"\n\nYour translation MUST maintain the exact same structure:\n\"[Translated first line]\n\n[Translated \"Key achievements:\"]\n• [Translated bullet 1]\n• [Translated bullet 2]\n• [Translated bullet 3]\"\n\n**Original Summary:**\n\"\"\"\nIngénieure logicielle, 8 ans.\n\nRéalisations :\n• Export PDF\n• Accessibilité\n\"\"\"\n\n**Instructions:**\nTranslate the above summary to German.\nReturn ONLY the translated text, nothing else.\nIMPORTANT: Preserve ALL formatting, line breaks, and bullet points exactly as shown in the original.\n\n**Translated Summary (German):**"

describe('buildTranslationPrompt', () => {
  it('builds exactly the prompt it built before the language tables were shared', () => {
    expect(
      buildTranslationPrompt({
        summary: 'Ingénieure logicielle, 8 ans.\n\nRéalisations :\n• Export PDF\n• Accessibilité',
        targetLanguage: 'de',
        sourceLanguage: 'fr',
      })
    ).toBe(PROMPT_AT_281088A)
  })
})
