const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,}$/;
const DRIVE_ID = /^[A-Za-z0-9_-]+$/;

export function parseArticleVideoUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;

  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let id = "";

  if (host === "youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] || "";
  } else if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
    else id = url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] || "";
  }

  if (YOUTUBE_ID.test(id)) {
    return {
      provider: "youtube",
      id,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      label: "YouTube"
    };
  }

  if (host === "drive.google.com") {
    id = url.pathname.match(/^\/file\/d\/([^/]+)/)?.[1]
      || url.searchParams.get("id")
      || "";
    if (DRIVE_ID.test(id)) {
      return {
        provider: "drive",
        id,
        embedUrl: `https://drive.google.com/file/d/${id}/preview`,
        label: "Google Drive"
      };
    }
  }

  return null;
}

export function safeArticleHtml(html, DOMPurify) {
  const container = document.createElement("div");
  container.innerHTML = String(html || "");

  container.querySelectorAll("iframe").forEach((iframe) => {
    const parsed = parseArticleVideoUrl(iframe.getAttribute("src") || "");
    if (!parsed) {
      iframe.closest(".article-video-embed")?.remove();
      iframe.remove();
      return;
    }
    iframe.setAttribute("src", parsed.embedUrl);
    iframe.setAttribute("title", iframe.getAttribute("title") || `Vídeo do ${parsed.label}`);
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
    iframe.setAttribute("allowfullscreen", "true");
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  });

  return DOMPurify.sanitize(container.innerHTML, {
    ADD_TAGS: ["iframe", "figure", "figcaption"],
    ADD_ATTR: [
      "allow",
      "allowfullscreen",
      "frameborder",
      "loading",
      "referrerpolicy",
      "data-provider",
      "data-video-id"
    ]
  });
}
