import { Bytes } from "ethers";
import {
  arrayify,
  BytesLike,
  hexlify,
  toUtf8Bytes,
  UnicodeNormalizationForm,
} from "ethers/lib/utils";

export function getPassword(password: Bytes | string): Uint8Array {
  if (typeof password === "string") {
    return toUtf8Bytes(password, UnicodeNormalizationForm.NFKC);
  }
  return arrayify(password);
}

// See: https://www.ietf.org/rfc/rfc4122.txt (Section 4.4)
export function uuidV4(randomBytes: BytesLike): string {
  const bytes = arrayify(randomBytes);

  // Section: 4.1.3:
  // - time_hi_and_version[12:16] = 0b0100
  // eslint-disable-next-line no-bitwise
  bytes[6] = (bytes[6] & 0x0f) | 0x40;

  // Section 4.4
  // - clock_seq_hi_and_reserved[6] = 0b0
  // - clock_seq_hi_and_reserved[7] = 0b1
  // eslint-disable-next-line no-bitwise
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const value = hexlify(bytes);

  return [
    value.substring(2, 10),
    value.substring(10, 14),
    value.substring(14, 18),
    value.substring(18, 22),
    value.substring(22, 34),
  ].join("-");
}

export function searchPath(object: any, path: string): string {
  let currentChild = object;

  const comps = path.toLowerCase().split("/");
  for (let i = 0; i < comps.length; i++) {
    // Search for a child object with a case-insensitive matching key
    let matchingChild = null;
    // eslint-disable-next-line no-restricted-syntax
    for (const key in currentChild) {
      if (key.toLowerCase() === comps[i]) {
        matchingChild = currentChild[key];
        break;
      }
    }

    // Didn't find one. :'(
    if (matchingChild === null) {
      return null;
    }

    // Now check this child...
    currentChild = matchingChild;
  }

  return currentChild;
}

export function looseArrayify(hexString: string): Uint8Array {
  if (typeof hexString === "string" && hexString.substring(0, 2) !== "0x") {
    // eslint-disable-next-line no-param-reassign
    hexString = `0x${hexString}`;
  }
  return arrayify(hexString);
}
