export function isJSON(contentTypeHeader: string | null | undefined): boolean {
  if (contentTypeHeader) {
    const mediaType = parseContentType(contentTypeHeader);

    if (mediaType.subtype === "json") {
      return true;
    }

    if (mediaType.suffix === "json") {
      return true;
    }

    if (mediaType.suffix && /\bjson\b/i.test(mediaType.suffix)) {
      return true;
    }

    if (mediaType.subtype && /\bjson\b/i.test(mediaType.subtype)) {
      return true;
    }
  }
  return false;
}

/**
 * RegExp to match type in RFC 7231 sec 3.1.1.1
 *
 * media-type = type "/" subtype
 * type       = token
 * subtype    = token
 */
const CT_TYPE_REGEXP = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * RegExp to match type in RFC 6838
 *
 * type-name = restricted-name
 * subtype-name = restricted-name
 * restricted-name = restricted-name-first *126restricted-name-chars
 * restricted-name-first  = ALPHA / DIGIT
 * restricted-name-chars  = ALPHA / DIGIT / "!" / "#" /
 *                          "$" / "&" / "-" / "^" / "_"
 * restricted-name-chars =/ "." ; Characters before first dot always
 *                              ; specify a facet name
 * restricted-name-chars =/ "+" ; Characters after last plus always
 *                              ; specify a structured syntax suffix
 * ALPHA =  %x41-5A / %x61-7A   ; A-Z / a-z
 * DIGIT =  %x30-39             ; 0-9
 */
const MEDIA_TYPE_REGEXP = /^ *([A-Za-z0-9][A-Za-z0-9!#$&^_-]{0,126})\/([A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}) *$/;

function parseContentType(header: string) {
  const headerDelimitationindex = header.indexOf(";");
  const contentType = headerDelimitationindex !== -1 ? header.slice(0, headerDelimitationindex).trim() : header.trim();

  if (!CT_TYPE_REGEXP.test(contentType)) {
    throw new TypeError("invalid media type");
  }

  const match = MEDIA_TYPE_REGEXP.exec(contentType.toLowerCase().toLowerCase());

  if (!match) {
    throw new TypeError("invalid media type");
  }

  const type = match[1];
  let subtype = match[2];
  let suffix;

  // suffix after last +
  const index = subtype.lastIndexOf("+");
  if (index !== -1) {
    suffix = subtype.substring(index + 1);
    subtype = subtype.substring(0, index);
  }

  return { type, subtype, suffix };
}
