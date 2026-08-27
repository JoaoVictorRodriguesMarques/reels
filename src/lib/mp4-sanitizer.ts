/**
 * MP4 & Video Metadata Sanitizer & Unique Hash Generator
 * 
 * Performs binary sanitization on MP4/MOV containers:
 * 1. Scans and randomizes movie & track header timestamps (creation_time, modification_time).
 * 2. Neutralizes identification strings in user data / meta atoms.
 * 3. Appends a valid ISO 'free' padding box containing cryptographic entropy so that
 *    each generated copy of the video has a 100% unique cryptographic hash (SHA-256/MD5).
 */

const MP4_EPOCH_OFFSET_SECONDS = 2082844800; // Difference between 1904-01-01 and 1970-01-01

function getNowInMp4Seconds(): number {
  const unixSeconds = Math.floor(Date.now() / 1000);
  // Add a slight random jitter (-100 to +100 seconds) so timestamp isn't static
  const jitter = Math.floor(Math.random() * 200) - 100;
  return unixSeconds + MP4_EPOCH_OFFSET_SECONDS + jitter;
}

function readBoxType(view: DataView, offset: number): string {
  let str = "";
  for (let i = 0; i < 4; i++) {
    str += String.fromCharCode(view.getUint8(offset + 4 + i));
  }
  return str;
}

function sanitizeMoovSubBoxes(buffer: Uint8Array, start: number, end: number, mp4Timestamp: number) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let pos = start;

  while (pos + 8 <= end) {
    let boxSize = view.getUint32(pos);
    if (boxSize === 0) {
      boxSize = end - pos;
    } else if (boxSize === 1 && pos + 16 <= end) {
      // 64-bit large box
      boxSize = Number(view.getBigUint64(pos + 8));
    }

    if (boxSize < 8 || pos + boxSize > end) {
      break;
    }

    const type = readBoxType(view, pos);

    if (type === "mvhd") {
      // Movie Header Box
      const version = view.getUint8(pos + 8);
      if (version === 0 && pos + 20 <= end) {
        view.setUint32(pos + 12, mp4Timestamp); // creation_time
        view.setUint32(pos + 16, mp4Timestamp); // modification_time
      } else if (version === 1 && pos + 28 <= end) {
        view.setBigUint64(pos + 12, BigInt(mp4Timestamp));
        view.setBigUint64(pos + 20, BigInt(mp4Timestamp));
      }
    } else if (type === "trak") {
      // Track Box - recurse inside trak
      const headerSize = view.getUint32(pos) === 1 ? 16 : 8;
      sanitizeMoovSubBoxes(buffer, pos + headerSize, pos + boxSize, mp4Timestamp);
    } else if (type === "tkhd") {
      // Track Header Box
      const version = view.getUint8(pos + 8);
      if (version === 0 && pos + 20 <= end) {
        view.setUint32(pos + 12, mp4Timestamp);
        view.setUint32(pos + 16, mp4Timestamp);
      } else if (version === 1 && pos + 28 <= end) {
        view.setBigUint64(pos + 12, BigInt(mp4Timestamp));
        view.setBigUint64(pos + 20, BigInt(mp4Timestamp));
      }
    } else if (type === "udta" || type === "meta") {
      // Clean non-structural identifier strings (replace software/device tags with zeroes or spaces)
      const subStart = pos + 8;
      const subEnd = pos + boxSize;
      for (let i = subStart; i < subEnd - 4; i++) {
        // Zero out common encoder strings if found
        const tag = String.fromCharCode(buffer[i], buffer[i + 1], buffer[i + 2], buffer[i + 3]);
        if (tag === "\u00A9too" || tag === "\u00A9enc" || tag === "\u00A9xyz" || tag === "XMP_") {
          for (let j = i; j < Math.min(i + 32, subEnd); j++) {
            buffer[j] = 0;
          }
        }
      }
    }

    pos += boxSize;
  }
}

export async function sanitizeMp4Metadata(
  file: File,
  options?: { uniqueSeed?: string | number },
): Promise<File> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const originalBytes = new Uint8Array(arrayBuffer);
    const view = new DataView(originalBytes.buffer);
    const totalLength = originalBytes.byteLength;

    const mp4Timestamp = getNowInMp4Seconds();

    // 1. Iterate top-level ISO MP4 boxes
    let pos = 0;
    while (pos + 8 <= totalLength) {
      let boxSize = view.getUint32(pos);
      if (boxSize === 0) {
        boxSize = totalLength - pos;
      } else if (boxSize === 1 && pos + 16 <= totalLength) {
        boxSize = Number(view.getBigUint64(pos + 8));
      }

      if (boxSize < 8 || pos + boxSize > totalLength) {
        break;
      }

      const type = readBoxType(view, pos);

      if (type === "moov") {
        const headerSize = view.getUint32(pos) === 1 ? 16 : 8;
        sanitizeMoovSubBoxes(originalBytes, pos + headerSize, pos + boxSize, mp4Timestamp);
      }

      pos += boxSize;
    }

    // 2. Generate a unique valid 'free' padding box containing cryptographic entropy
    // This guarantees that the SHA-256 / MD5 hash of the file is 100% unique per post
    const entropyLength = 32;
    const freeBoxSize = 8 + entropyLength;
    const freeBox = new Uint8Array(freeBoxSize);
    const freeView = new DataView(freeBox.buffer);
    freeView.setUint32(0, freeBoxSize); // box size (big endian)
    freeBox[4] = 0x66; // 'f'
    freeBox[5] = 0x72; // 'r'
    freeBox[6] = 0x65; // 'e'
    freeBox[7] = 0x65; // 'e'

    // Fill with random bytes (or seed)
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const rand = new Uint8Array(entropyLength);
      crypto.getRandomValues(rand);
      freeBox.set(rand, 8);
    } else {
      for (let i = 8; i < freeBoxSize; i++) {
        freeBox[i] = Math.floor(Math.random() * 256);
      }
    }

    // 3. Combine sanitized MP4 bytes with the unique entropy box
    const outputBytes = new Uint8Array(totalLength + freeBoxSize);
    outputBytes.set(originalBytes, 0);
    outputBytes.set(freeBox, totalLength);

    // Return new File with clean metadata and unique binary fingerprint
    return new File([outputBytes], file.name, {
      type: file.type || "video/mp4",
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn("Failed to sanitize MP4 metadata, returning original file:", err);
    return file;
  }
}
