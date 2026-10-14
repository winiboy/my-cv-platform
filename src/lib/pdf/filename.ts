/**
 * The `Content-Disposition` header of a resume PDF download.
 *
 * The resume title is user-controlled, so it reaches the header only after two
 * transformations, and the header carries it twice:
 *
 *   - `filename="…"`, an ASCII-only fallback for agents that do not implement
 *     RFC 6266. Accents are stripped (`Zürich` → `Zurich`) rather than dropped,
 *     and anything still outside printable ASCII becomes `_`.
 *   - `filename*=UTF-8''…`, the title itself, RFC 5987-encoded. Every browser
 *     the application targets prefers this one.
 *
 * Both are built from the same cleaned name. Cleaning removes what is unsafe in
 * a header (control characters, so no CR/LF can split it) and what is unsafe
 * or meaningless in a file name on any platform the file may be saved on
 * (`\ / : * ? " < > |`). The double quote is in that set, which is what keeps
 * the quoted fallback well-formed: no quote or backslash can reach it.
 */

/** Used when a title has nothing left once cleaned. */
const FALLBACK_BASENAME = 'resume'

/**
 * Long enough for any real title, short enough that the encoded header stays
 * far below the limits proxies and agents put on a single header line (a
 * fully non-ASCII name triples to nine bytes per character once encoded).
 */
const MAX_BASENAME_LENGTH = 120

/** Reserved in file names on Windows, or a path separator somewhere. */
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]/g

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g

const COMBINING_MARKS = /[̀-ͯ]/g

/** Any character a quoted-string fallback must not carry. */
const NON_PRINTABLE_ASCII = /[^\x20-\x7e]/g

/**
 * The title as a file base name: unsafe characters replaced, whitespace
 * collapsed, Windows' trailing dots and spaces removed, length bounded.
 */
export function cleanPdfBasename(title: string | null | undefined): string {
  const cleaned = (title ?? '')
    .normalize('NFC')
    .replace(CONTROL_CHARS, ' ')
    .replace(UNSAFE_FILENAME_CHARS, '_')
    .replace(/\s+/g, ' ')
    .trim()

  // Bounded by code point, not UTF-16 unit, so a cut can never split a
  // surrogate pair into an unencodable lone half.
  const bounded = Array.from(cleaned).slice(0, MAX_BASENAME_LENGTH).join('')
  const trimmed = bounded.replace(/[\s.]+$/, '')
  return trimmed.length > 0 ? trimmed : FALLBACK_BASENAME
}

/** RFC 5987 `value-chars`: `encodeURIComponent` leaves four characters the grammar does not allow. */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function asciiFallback(basename: string): string {
  const ascii = basename
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(NON_PRINTABLE_ASCII, '_')
    .trim()
  return ascii.length > 0 ? ascii : FALLBACK_BASENAME
}

/**
 * `attachment; filename="<ascii>.pdf"; filename*=UTF-8''<encoded>.pdf`.
 *
 * An empty or entirely unusable title gives `resume.pdf` in both parameters.
 */
export function pdfContentDisposition(title: string | null | undefined): string {
  const basename = cleanPdfBasename(title)
  return (
    `attachment; filename="${asciiFallback(basename)}.pdf"; ` +
    `filename*=UTF-8''${encodeRfc5987(`${basename}.pdf`)}`
  )
}
