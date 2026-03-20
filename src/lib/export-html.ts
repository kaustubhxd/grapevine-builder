import type { GjsEditor, PageMetadata } from "../types";

function buildHeadTags(metadata: PageMetadata, pageTitle: string): string {
  const title = metadata.title ?? pageTitle;
  const lines: string[] = [`  <title>${title}</title>`];
  if (metadata.description)
    lines.push(`  <meta name="description" content="${metadata.description}">`);
  if (metadata.canonicalUrl)
    lines.push(`  <link rel="canonical" href="${metadata.canonicalUrl}">`);
  const ogTitle = metadata.ogTitle ?? title;
  lines.push(`  <meta property="og:title" content="${ogTitle}">`);
  if (metadata.ogDescription ?? metadata.description)
    lines.push(`  <meta property="og:description" content="${metadata.ogDescription ?? metadata.description}">`);
  if (metadata.ogImage)
    lines.push(`  <meta property="og:image" content="${metadata.ogImage}">`);
  return lines.join("\n");
}

/**
 * Export the current editor content as a self-contained HTML file
 * that renders correctly when opened in any browser.
 */
export function exportHtml(
  editor: GjsEditor,
  metadata: PageMetadata = {},
): {
  html: string;
  css: string;
  full: string;
} {
  const html = editor.getHtml();
  const css = editor.getCss() || "";
  const pageTitle = editor.Pages?.getSelected?.()?.getName?.() || "Page";
  const headTags = buildHeadTags(metadata, pageTitle);

  const full = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
${headTags}
  <style>
    /* Reset */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { min-height: 100vh; }
    img { max-width: 100%; height: auto; }
    ${css}
  </style>
</head>
<body>
  ${html}
</body>
</html>`;

  return { html, css, full };
}

/**
 * Export all pages as separate HTML documents.
 */
export function exportAllPages(
  editor: GjsEditor,
  metadata: PageMetadata = {},
): { pageName: string; html: string; css: string; full: string }[] {
  const pages = editor.Pages?.getAll() ?? [];
  if (pages.length === 0) return [exportHtml(editor, metadata)].map((e) => ({ pageName: "Page", ...e }));

  const css = editor.getCss() || "";

  return pages.map((page) => {
    const pageTitle = page.getName() || "Page";
    const main = page.getMainComponent();
    const html = main.toHTML();
    const headTags = buildHeadTags(metadata, pageTitle);

    const full = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
${headTags}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { min-height: 100vh; }
    img { max-width: 100%; height: auto; }
    ${css}
  </style>
</head>
<body>
  ${html}
</body>
</html>`;

    return { pageName: pageTitle, html, css, full };
  });
}
