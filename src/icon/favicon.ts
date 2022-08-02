import { Icon, Image } from "@raycast/api";
import { URL } from "url";

export function getFavicon(url: string | URL, size = 64): Image.ImageLike {
  try {
    const urlObj = typeof url === "string" ? new URL(url) : url;
    const hostname = urlObj.hostname;
    return {
      source: `https://www.google.com/s2/favicons?sz=${size}&domain=${hostname}`,
      fallback: Icon.Link,
    };
  } catch (e) {
    console.error(e);
    return Icon.Link;
  }
}
