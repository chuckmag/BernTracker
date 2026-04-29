import sharp from 'sharp'

/**
 * Avatar pipeline: resize to a 512×512 cover, convert to WebP, strip EXIF.
 * Returns the WebP bytes ready for storage.
 *
 *  - 512×512 keeps avatars visually crisp at retina 256 display while keeping
 *    file size <50KB for typical inputs.
 *  - cover (centered) avoids letterboxing — most avatars are square anyway.
 *  - WebP at q=82 wins ~30% on size vs JPEG at equivalent perceptual quality.
 *  - Stripping metadata is a privacy default; it also shaves bytes.
 */
export async function processAvatarBuffer(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: 'truncated' })
    .rotate() // honor EXIF orientation before stripping it
    .resize({ width: 512, height: 512, fit: 'cover', position: 'centre' })
    .webp({ quality: 82, effort: 4 })
    .toBuffer()
}
