function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function textFromElement(element) {
  return cleanText(element?.textContent || '');
}

function firstNonEmpty(values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return '';
}

function unique(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const value = cleanText(item);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function getMetaByNames(names) {
  for (const name of names) {
    const selectors = [
      `meta[name="${name}"]`,
      `meta[property="${name}"]`,
      `meta[itemprop="${name}"]`
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const value = cleanText(el?.getAttribute('content') || '');
      if (value) return value;
    }
  }
  return '';
}

function getMetaAllByNames(names) {
  const values = [];
  for (const name of names) {
    const selectors = [
      `meta[name="${name}"]`,
      `meta[property="${name}"]`,
      `meta[itemprop="${name}"]`
    ];
    for (const selector of selectors) {
      const els = document.querySelectorAll(selector);
      for (const el of els) {
        const value = cleanText(el.getAttribute('content') || '');
        if (value) values.push(value);
      }
    }
  }
  return unique(values);
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function flattenJsonLd(input) {
  const out = [];

  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object') return;

    if (Array.isArray(node['@graph'])) {
      node['@graph'].forEach(walk);
    }

    out.push(node);
  }

  walk(input);
  return out;
}

function getJsonLdNodes() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  const nodes = [];

  for (const script of scripts) {
    const parsed = parseJson(script.textContent || '');
    if (!parsed) continue;
    nodes.push(...flattenJsonLd(parsed));
  }

  return nodes;
}

function typeMatches(node, wantedTypes) {
  const rawType = node?.['@type'];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  return types.some(type => wantedTypes.includes(type));
}

function getBestJsonLdNode() {
  const nodes = getJsonLdNodes();

  const scholarly = nodes.find(node =>
    typeMatches(node, ['ScholarlyArticle', 'MedicalScholarlyArticle'])
  );
  if (scholarly) return scholarly;

  const article = nodes.find(node =>
    typeMatches(node, ['Article', 'NewsArticle', 'BlogPosting', 'WebPage'])
  );
  if (article) return article;

  return nodes[0] || null;
}

function normalizeDate(value) {
  const text = cleanText(value);
  if (!text) return '';

  const match = text.match(/^(\d{4})([-/])(\d{1,2})\2(\d{1,2})/);
  if (match) {
    const [, y, , m, d] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return text;
}

function stripTitleSuffix(title) {
  let text = cleanText(title);
  if (!text) return '';

  const separators = [' | ', ' - ', ' — ', ' · '];
  for (const sep of separators) {
    const parts = text.split(sep);
    if (parts.length >= 2) {
      const first = cleanText(parts[0]);
      if (first && first.length >= 20) {
        text = first;
        break;
      }
    }
  }

  return text;
}

function extractTitle() {
  const jsonLd = getBestJsonLdNode();

  return stripTitleSuffix(firstNonEmpty([
    getMetaByNames([
      'citation_title',
      'dc.title',
      'dcterms.title',
      'og:title',
      'twitter:title'
    ]),
    jsonLd?.headline,
    jsonLd?.name,
    document.querySelector('h1')?.textContent,
    document.title
  ]));
}

function jsonLdAuthorsArray(node) {
  const raw = node?.author;
  if (!raw) return [];

  const authors = Array.isArray(raw) ? raw : [raw];
  return unique(authors.map(author => {
    if (typeof author === 'string') return author;
    return author?.name || '';
  }));
}

function splitAuthorString(value) {
  const text = cleanText(value);
  if (!text) return [];

  return unique(
    text
      .split(/;|,\s(?=[A-Z][a-z])|\sand\s/i)
      .map(part => cleanText(part))
  );
}

function extractAuthors() {
  const jsonLd = getBestJsonLdNode();

  const citationAuthors = getMetaAllByNames([
    'citation_author',
    'dc.creator',
    'dcterms.creator'
  ]);
  if (citationAuthors.length) return citationAuthors;

  const metaAuthor = getMetaByNames([
    'author',
    'article:author',
    'parsely-author',
    'og:article:author'
  ]);
  if (metaAuthor) return splitAuthorString(metaAuthor);

  const jsonAuthors = jsonLdAuthorsArray(jsonLd);
  if (jsonAuthors.length) return jsonAuthors;

  const visible = firstNonEmpty([
    document.querySelector('[rel="author"]')?.textContent,
    document.querySelector('[itemprop="author"]')?.textContent,
    document.querySelector('[class*="author"]')?.textContent,
    document.querySelector('[class*="byline"]')?.textContent
  ]);

  return splitAuthorString(visible);
}

function extractPublicationDate() {
  const jsonLd = getBestJsonLdNode();

  return normalizeDate(firstNonEmpty([
    getMetaByNames([
      'citation_publication_date',
      'citation_online_date',
      'citation_date',
      'dc.date',
      'dcterms.date',
      'article:published_time',
      'pubdate',
      'publish-date',
      'date'
    ]),
    jsonLd?.datePublished,
    document.querySelector('time[datetime]')?.getAttribute('datetime'),
    document.querySelector('[itemprop="datePublished"]')?.textContent,
    document.querySelector('time')?.textContent
  ]));
}

function textBySelectors(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (!el) continue;

    const value =
      el.getAttribute?.('content') ||
      el.getAttribute?.('href') ||
      el.textContent ||
      '';

    const text = cleanText(value);
    if (text) return text;
  }
  return '';
}

function extractDoiFromString(value) {
  const text = cleanText(value);
  if (!text) return '';

  const match = text.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  return match ? match[0] : '';
}

function extractJournal() {
  const metaJournal = getMetaByNames([
    'citation_journal_title',
    'citation_journal_abbrev',
    'prism.publicationName',
    'dc.source',
    'dcterms.isPartOf'
  ]);
  if (metaJournal) {
    return cleanText(metaJournal);
  }

  // PMC citation block fallback
  const cit = document.querySelector('.cit');
  if (cit) {
    const text = cleanText(cit.textContent || '');
    const match = text.match(/^(.*?)(?:\.\s+)?\d{4}\s+[A-Za-z]{3}/);
    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  return '';
}

function extractDoi() {
  const metaDoi = getMetaByNames([
    'citation_doi',
    'prism.doi',
    'dc.identifier',
    'dcterms.identifier',
    'doi'
  ]);
  const metaMatch = extractDoiFromString(metaDoi);
  if (metaMatch) {
    return metaMatch;
  }

  const selectors = [
    'a[href*="doi.org/"]',
    'a[href*="dx.doi.org/"]',
    '.article-id',
    '.fm-citation',
    '.cit',
    '[class*="doi"]',
    '[id*="doi"]'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (!el) continue;

    const text = cleanText(
      el.getAttribute?.('href') ||
      el.textContent ||
      ''
    );

    const doi = extractDoiFromString(text);
    if (doi) return doi;
  }

  const bodyText = cleanText(document.body?.innerText || '');

  // existing broad DOI-pattern fallback
  const visiblePatternMatch = extractDoiFromString(bodyText);
  if (visiblePatternMatch) {
    return visiblePatternMatch;
  }

  // new fallback: search specifically around the word "DOI"
  const doiWordMatch = bodyText.match(
    /\bdoi\b[:\s]*?(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i
  );
  if (doiWordMatch?.[1]) {
    return doiWordMatch[1];
  }

  return '';
}

function extractAbstract() {
  const metaAbstract = getMetaByNames([
    'description',
    'dc.description',
    'dcterms.description',
    'citation_abstract_html_url'
  ]);

  const visibleAbstract = firstNonEmpty([
    document.querySelector('[id*="abstract"]')?.textContent,
    document.querySelector('[class*="abstract"]')?.textContent
  ]);

  return firstNonEmpty([visibleAbstract, metaAbstract]);
}

function isJunkHeading(text, title) {
  const lower = text.toLowerCase();
  const junk = [
    'permalink',
    'download pdf',
    'article navigation',
    'supplementary material',
    'supplementary materials',
    'metrics',
    'references',
    'footnotes'
  ];

  if (!text) return true;
  if (lower === cleanText(title).toLowerCase()) return true;
  if (junk.includes(lower)) return true;
  return false;
}

function getMainRoot() {
  return (
    document.querySelector('article') ||
    document.querySelector('main') ||
    document.querySelector('[role="main"]') ||
    document.body
  );
}

function extractHeadings(title) {
  const root = getMainRoot();
  const elements = root.querySelectorAll('h1, h2, h3');
  const headings = [];
  const seen = new Set();

  for (const el of elements) {
    const text = textFromElement(el);
    if (isJunkHeading(text, title)) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    headings.push(text);

    if (headings.length >= 12) break;
  }

  return headings;
}

function extractMetadata() {
  const title = extractTitle();
  const authors = extractAuthors();
  const doi = extractDoi();
  const journal = extractJournal();

  console.log('[DOI]', doi);
  console.log('[Journal]', journal);
  console.log('journal=', extractJournal(), 'doi=', extractDoi());

  return {
    url: window.location.href,
    title,
    author: authors.join('; '),
    authors,
    publicationDate: extractPublicationDate(),
    journal,
    doi
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_PAGE_METADATA') {
    const payload = extractMetadata();
    setTimeout(() => sendResponse({ ok: true, payload }), 0);
    return true; // keeps the channel open
  }
  return false;
});