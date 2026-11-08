import { useEffect, useMemo, useRef, useState } from 'react';

export const CONTENT_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox';
export const MIN_FRAME_HEIGHT = 120;
export const MAX_FRAME_HEIGHT = 20000;

// Measures the content (not the iframe viewport, which scrollHeight would report for short pages).
const HEIGHT_SCRIPT = `<script>(function(){function s(){var d=document.documentElement,b=document.body,h=d.getBoundingClientRect().height;if(b){var r=b.getBoundingClientRect(),m=parseFloat(getComputedStyle(b).marginBottom)||0;h=Math.max(h,r.bottom+m+window.scrollY);for(var i=0;i<b.children.length;i++){var c=b.children[i].getBoundingClientRect();if(c.bottom+window.scrollY>h)h=c.bottom+window.scrollY;}}parent.postMessage({type:'ios-content-height',height:Math.ceil(h)},'*');}window.addEventListener('load',s);window.addEventListener('resize',s);if(window.ResizeObserver){var o=new ResizeObserver(s);o.observe(document.documentElement);if(document.body)o.observe(document.body);}s();})();</script>`;
const BASE_TAG = '<base target="_blank">';

/** Inject the base tag and height reporter into an HTML document string. */
export function buildSrcDoc(html: string): string {
  let out = html;
  if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, (m) => `${m}${BASE_TAG}`);
  else if (/<html[^>]*>/i.test(out)) out = out.replace(/<html[^>]*>/i, (m) => `${m}<head>${BASE_TAG}</head>`);
  else out = `<head>${BASE_TAG}</head>${out}`;
  const idx = out.search(/<\/body\s*>/i);
  return idx >= 0 ? out.slice(0, idx) + HEIGHT_SCRIPT + out.slice(idx) : out + HEIGHT_SCRIPT;
}

/** `fill`: the frame takes its container's height and scrolls inside (own sticky menus keep working). */
export function ContentFrame({ html, title, fill = false }: { html: string; title: string; fill?: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(400);
  const srcDoc = useMemo(() => buildSrcDoc(html), [html]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const frame = ref.current;
      if (!frame || e.source !== frame.contentWindow) return;
      const d = e.data as { type?: unknown; height?: unknown } | null;
      if (!d || d.type !== 'ios-content-height') return;
      const h = d.height;
      if (typeof h !== 'number' || !Number.isFinite(h)) return;
      setHeight(Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, Math.ceil(h))));
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <iframe
      ref={ref}
      className={fill ? 'content-frame fill' : 'content-frame'}
      title={title}
      sandbox={CONTENT_SANDBOX}
      srcDoc={srcDoc}
      style={fill ? undefined : { height }}
    />
  );
}
