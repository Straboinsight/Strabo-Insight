import type { Link, Parent, PhrasingContent, Root, Text } from 'mdast';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

export interface LegalDocument {
  effectiveDate: string | null;
  html: string;
}

function preserveLineBreaks() {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index: number | undefined, parent: Parent | undefined) => {
      if (!parent || index === undefined || !node.value.includes('\n')) return;
      const parts = node.value.split('\n');
      const next: PhrasingContent[] = [];
      parts.forEach((part, i) => {
        if (i > 0) next.push({ type: 'break' });
        if (part.length > 0) next.push({ type: 'text', value: part });
      });
      parent.children.splice(index, 1, ...next);
      return index + next.length;
    });
  };
}

function stripAutolinks() {
  return (tree: Root) => {
    visit(tree, 'link', (node: Link, index: number | undefined, parent: Parent | undefined) => {
      if (!parent || index === undefined) return;
      const text = node.children
        .filter((child): child is Text => child.type === 'text')
        .map((child) => child.value)
        .join('');
      const url = node.url;
      const automatic =
        url === text ||
        url === `mailto:${text}` ||
        url === `http://${text}` ||
        url === `https://${text}`;
      if (!automatic) return;
      parent.children.splice(index, 1, ...node.children);
      return index;
    });
  };
}

function sourceText(markdown: string): string {
  const withoutLinks = markdown.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const lines = withoutLinks.split(/\r?\n/).filter((line) => {
    const cells = line.trim();
    return !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(cells);
  });
  return lines
    .join('\n')
    .replace(/^\s*[-]\s+/gm, '')
    .replace(/^#+\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/-{3,}/g, ' ')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (entity, body: string) => {
    if (body === 'amp') return '&';
    if (body === 'lt') return '<';
    if (body === 'gt') return '>';
    if (body === 'quot') return '"';
    if (body === 'apos') return "'";
    if (body === 'nbsp') return ' ';
    if (body.startsWith('#x')) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return entity;
  });
}

function htmlText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<hr\s*\/?>/gi, ' ')
    .replace(/<\/(p|h1|h2|h3|li|tr|td|th|div|ul|ol|table)>/gi, ' ');
  return decodeEntities(withBreaks.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function prepare(source: string): { effectiveDate: string | null; body: string } {
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/);
  const kept: string[] = [];
  let effectiveDate: string | null = null;
  let skippedH1 = false;

  for (const line of lines) {
    if (!skippedH1 && line.startsWith('# ')) {
      skippedH1 = true;
      continue;
    }
    if (line.startsWith('Effective date:')) {
      effectiveDate = line.trim();
      continue;
    }
    if (line.startsWith('Last updated:')) continue;
    if (line.trim() === '**Strabo Insight**') continue;
    kept.push(line);
  }

  while (kept[0]?.trim() === '') kept.shift();
  while (kept.length > 0 && kept[kept.length - 1]?.trim() === '') kept.pop();

  return { effectiveDate, body: kept.join('\n') };
}

export async function renderLegalMarkdown(source: string): Promise<LegalDocument> {
  const { effectiveDate, body } = prepare(source);
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(stripAutolinks)
    .use(preserveLineBreaks)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(body);

  const html = String(file);
  const expected = sourceText(body);
  const actual = htmlText(html);
  if (expected !== actual) {
    throw new Error(`Legal copy changed during render.\nExpected: ${expected}\nActual: ${actual}`);
  }

  return { effectiveDate, html };
}
