import { Icon, Image } from "@raycast/api";
import { URL } from "url";

/**
 * Icon to represent the progress of _something_.
 *
 * @param url The URL of the website to represent.
 *
 * @returns an Image that can be used where Raycast expects them.
 *
 * @example
 * ```
 * <List.Item icon={getFavicon("https://raycast.com")} title="Raycast Website" />
 * ```
 */
export function getFavicon(
  url: string | URL,
  options?: {
    /**
     * Size of the Favicon
     * @default 64
     */
    size?: number;
    /**
     * Fallback icon in case the Favicon is not found.
     * @default Icon.Link
     */
    fallback?: Image.Fallback;
  }
): Image.ImageLike {
  try {
    const urlObj = typeof url === "string" ? new URL(url) : url;
    const hostname = urlObj.hostname;
    return {
      source: `https://www.google.com/s2/favicons?sz=${options?.size ?? 64}&domain=${hostname}`,
      fallback: options?.fallback ?? Icon.Link,
    };
  } catch (e) {
    console.error(e);
    return Icon.Link;
  }
}
