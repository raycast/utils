import { Icon, Image } from "@raycast/api";
import { URL } from "node:url";

/**
 * Icon showing the favicon of a website.
 *
 * A favicon (favorite icon) is a tiny icon included along with a website, which is displayed in places like the browser's address bar, page tabs, and bookmarks menu.
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
    /**
     * A {@link Image.Mask} to apply to the Favicon.
     */
    mask?: Image.Mask;
  },
): Image.ImageLike {
  try {
    // a func adding https:// to the URL
    // for cases where the URL is not a full URL
    // e.g. "raycast.com"
    const sanitize = (url: string) => {
      if (!url.startsWith("http")) {
        return `https://${url}`;
      }
      return url;
    };

    const urlObj = typeof url === "string" ? new URL(sanitize(url)) : url;
    const hostname = urlObj.hostname;

    const faviconProvider: "none" | "raycast" | "apple" | "google" | "duckDuckGo" | "duckduckgo" | "legacy" =
      (process.env.FAVICON_PROVIDER as any) ?? "raycast";

    switch (faviconProvider) {
      case "none":
        return {
          source: options?.fallback ?? Icon.Link,
          mask: options?.mask,
        };
      case "apple":
        // we can't support apple favicons as it's a native API
        return {
          source: options?.fallback ?? Icon.Link,
          mask: options?.mask,
        };
      case "duckduckgo":
      case "duckDuckGo":
        return {
          source: `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
          fallback: options?.fallback ?? Icon.Link,
          mask: options?.mask,
        };
      case "google":
        return {
          source: `https://www.google.com/s2/favicons?sz=${options?.size ?? 64}&domain=${hostname}`,
          fallback: options?.fallback ?? Icon.Link,
          mask: options?.mask,
        };
      case "legacy":
      case "raycast":
      default:
        return {
          source: `https://api.ray.so/favicon?url=${hostname}&size=${options?.size ?? 64}`,
          fallback: options?.fallback ?? Icon.Link,
          mask: options?.mask,
        };
    }
  } catch (e) {
    console.error(e);
    return Icon.Link;
  }
}
