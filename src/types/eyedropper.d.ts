/**
 * TypeScript declarations for the EyeDropper API.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/EyeDropper_API
 */

interface EyeDropperOpenResult {
  /** The selected color in sRGB hex format (e.g., "#ff0000") */
  sRGBHex: string
}

interface EyeDropper {
  /** Opens the eyedropper and returns the selected color */
  open(): Promise<EyeDropperOpenResult>
}

interface EyeDropperConstructor {
  new (): EyeDropper
}

interface Window {
  /** The EyeDropper API constructor (undefined if not supported) */
  EyeDropper?: EyeDropperConstructor
}
