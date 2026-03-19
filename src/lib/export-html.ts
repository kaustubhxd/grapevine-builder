import type { GjsEditor } from "../types";

/**
 * Export the current editor content as a self-contained HTML file
 * that renders correctly when opened in any browser.
 */
export function exportHtml(editor: GjsEditor): {
  html: string;
  css: string;
  full: string;
} {
  const html = editor.getHtml();
  const css = editor.getCss() || "";

  const full = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exported Page</title>
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
