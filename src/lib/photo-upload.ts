/**
 * Reading a CV photo the owner picked, shared by the two places that upload
 * one: the Editor's Contact-tab photo row and modern's in-preview upload zone.
 * Both then hand the data URL to the Editor's one upload handler, which stores
 * it under `resume_photo_${id}`.
 */

/** The largest photo file accepted, in bytes. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024

/**
 * Read `file` as a data URL and pass it to `onLoad`, or call `onTooLarge`
 * instead when the file is over `MAX_PHOTO_BYTES`.
 */
export function readPhotoFile(file: File, onLoad: (dataUrl: string) => void, onTooLarge: () => void): void {
  if (file.size > MAX_PHOTO_BYTES) {
    onTooLarge()
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') onLoad(reader.result)
  }
  reader.readAsDataURL(file)
}
