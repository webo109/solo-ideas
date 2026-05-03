import { marked } from 'https://esm.sh/marked@13.0.3';
import DOMPurify from 'https://esm.sh/dompurify@3.1.6';

marked.setOptions({
  gfm: true,
  breaks: true,
  smartypants: false,
});

export function renderMarkdown(text) {
  if (!text) return '';
  const html = marked.parse(String(text));
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'del', 'code', 'pre',
      'ul', 'ol', 'li', 'blockquote', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'a', 'span',
    ],
    ALLOWED_ATTR: ['href', 'title', 'class'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}
