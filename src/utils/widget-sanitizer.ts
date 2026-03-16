import DOMPurify from 'dompurify';

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'strong', 'em', 'b', 'i', 'br', 'hr', 'small',
    'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan',
  ],
  ALLOWED_ATTR: [
    'class', 'style', 'title', 'aria-label',
    'viewBox', 'fill', 'stroke', 'stroke-width',
    'd', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'points',
    'xmlns',
  ],
  FORBID_TAGS: ['button', 'input', 'form', 'select', 'textarea', 'script', 'iframe', 'object', 'embed'],
  FORCE_BODY: true,
};

const UNSAFE_STYLE_RE = /style\s*=\s*["'][^"']*(?:url\s*\(|expression\s*\(|javascript\s*:)[^"']*["']/gi;

export function sanitizeWidgetHtml(html: string): string {
  const purified = DOMPurify.sanitize(html, PURIFY_CONFIG) as unknown as string;
  return purified.replace(UNSAFE_STYLE_RE, '');
}
