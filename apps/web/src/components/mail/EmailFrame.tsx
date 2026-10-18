import { useEffect, useMemo, useRef, useState } from "react";

// HTML email, shown like a mail app does: inside a sandboxed frame that cannot run scripts, with forms,
// frames and inline event handlers removed, links opening in a new tab, and remote images (often trackers)
// blocked until the person asks for them.

const STRIP = "script, iframe, frame, frameset, object, embed, applet, form, input, button, select, textarea, link, meta, base";

export function sanitizeEmailHtml(html: string): { html: string; remoteImages: boolean } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll(STRIP).forEach((n) => n.remove());
  let remoteImages = false;
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on") || ((name === "href" || name === "src" || name === "action" || name === "xlink:href") && (value.startsWith("javascript:") || value.startsWith("vbscript:") || value.startsWith("data:text/html")))) el.removeAttribute(attr.name);
    }
    if (el.tagName === "IMG" && /^https?:/i.test(el.getAttribute("src") ?? "")) remoteImages = true;
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  });
  if (/url\(\s*['"]?https?:/i.test(doc.documentElement.innerHTML)) remoteImages = true;
  return { html: doc.body?.innerHTML ?? "", remoteImages };
}

export function EmailFrame({ html, title }: { html: string; title: string }) {
  const [images, setImages] = useState(false);
  const [height, setHeight] = useState(160);
  const ref = useRef<HTMLIFrameElement>(null);
  const clean = useMemo(() => sanitizeEmailHtml(html), [html]);
  const csp = `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data: cid:${images ? " https: http:" : ""};`;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>
    html,body{margin:0;padding:0;background:#fff;color:#1f2329;font:15px/1.6 -apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;word-wrap:break-word;overflow-wrap:anywhere}
    body{padding:4px 2px}img{max-width:100%;height:auto}table{max-width:100%!important}a{color:#0b57d0}
    blockquote{margin:0 0 0 .8ex;border-left:2px solid #d0d7de;padding-left:1ex;color:#5f6673}pre{white-space:pre-wrap}
  </style></head><body>${clean.html}</body></html>`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ro: ResizeObserver | null = null;
    const measure = () => {
      const d = el.contentDocument;
      if (d?.documentElement) setHeight(Math.min(Math.max(d.documentElement.scrollHeight, 60), 6000));
    };
    const onLoad = () => {
      measure();
      const body = el.contentDocument?.body;
      if (body && typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(measure);
        ro.observe(body);
      }
    };
    el.addEventListener("load", onLoad);
    return () => {
      el.removeEventListener("load", onLoad);
      ro?.disconnect();
    };
  }, [doc]);

  return (
    <div>
      {clean.remoteImages && !images && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-subtle px-3 py-1.5 text-xs text-muted">
          Images from the sender are hidden so they cannot track when you read this.
          <button onClick={() => setImages(true)} className="font-medium text-brand hover:underline">
            Show images
          </button>
        </div>
      )}
      <iframe
        ref={ref}
        title={title}
        srcDoc={doc}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="w-full rounded-lg border-0 bg-white"
        style={{ height }}
      />
    </div>
  );
}
