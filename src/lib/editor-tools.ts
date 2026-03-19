import type { GjsEditor, GjsComponent, PendingClientTool } from "../types";

/** Strip the <generated_code> wrapper or ```generated_code fence the sub-agent emits */
function stripGeneratedWrapper(html: string): string {
  return html
    // XML tags
    .replace(/<generated_code>/g, "")
    .replace(/<\/generated_code>/g, "")
    .replace(/<generated_html>/g, "")
    .replace(/<\/generated_html>/g, "")
    // Markdown code fences (```generated_code, ```html, ``` etc.)
    .replace(/^```[\w-]*\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
}

/**
 * Apply a server tool result (HTML from sub-agent) to the GrapesJS editor.
 * Handles editComponentCode, addComponentCode, addPageCode, addProjectPageCode.
 */
export function applyToolResult(
  editor: GjsEditor,
  toolName: string,
  input: Record<string, unknown>,
  content: string,
) {
  const html = stripGeneratedWrapper(content);
  if (!html) return;

  const wrapper = editor.getWrapper();

  switch (toolName) {
    case "editComponentCode": {
      const cleanHtml = html
        .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "")
        .replace(/<meta[^>]*\/?>/gi, "")
        .trim();

      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = cleanHtml;
      const topLevelElements = Array.from(tempDiv.children);

      if (!wrapper || topLevelElements.length === 0) break;

      function findMatchingComponent(el: Element): GjsComponent | undefined {
        const elId = el.getAttribute("id");
        if (elId) {
          const byId = editor.Components?.getById(elId);
          if (byId) return byId;
          const found = wrapper.find(`#${elId}`);
          if (found.length > 0) return found[0];
        }

        const classes = Array.from(el.classList);
        if (classes.length > 0) {
          const tag = el.tagName.toLowerCase();
          for (const cls of classes) {
            const found = wrapper.find(`${tag}.${cls}`);
            if (found.length === 1) return found[0];
          }
          for (const cls of classes) {
            const found = wrapper.find(`.${cls}`);
            if (found.length === 1) return found[0];
          }
        }

        const tag = el.tagName.toLowerCase();
        for (const attr of Array.from(el.attributes)) {
          if (attr.name.startsWith("aria-") || attr.name.startsWith("data-")) {
            const selector = `${tag}[${attr.name}="${attr.value}"]`;
            const found = wrapper.find(selector);
            if (found.length === 1) return found[0];
          }
        }

        if (tag === "script" || tag === "style") {
          const attrKey = [
            tag,
            ...Array.from(el.attributes).map((a) => `${a.name}=${a.value}`),
          ].join("__");
          const found = wrapper.find(tag);
          for (const f of found) {
            const fEl = f.getEl();
            if (fEl) {
              const fKey = [
                fEl.tagName.toLowerCase(),
                ...Array.from(fEl.attributes).map((a) => `${a.name}=${a.value}`),
              ].join("__");
              if (fKey === attrKey) return f;
            }
          }
          if (found.length === 1) return found[0];
        }

        return undefined;
      }

      let matchedCount = 0;
      for (const el of topLevelElements) {
        const matched = findMatchingComponent(el);
        if (matched) {
          const isEmpty = el.children.length === 0 && !el.textContent?.trim();
          if (isEmpty) {
            matched.remove();
          } else {
            // Use parser to separate CSS from HTML when available
            const parser = editor.Parser;
            const cssComposer = editor.Css;

            if (parser?.parseHtml && cssComposer?.addCollection) {
              const parsed = parser.parseHtml(el.outerHTML, { returnArray: true });
              const parsedComp = parsed.html[0] as
                | { components?: unknown[]; attributes?: Record<string, string>; classes?: string[] }
                | undefined;
              if (parsedComp) {
                if (parsedComp.components) matched.components().reset(parsedComp.components);
                if (parsedComp.attributes) {
                  const attrs = { ...parsedComp.attributes };
                  if (parsedComp.classes) attrs.class = parsedComp.classes.join(" ");
                  matched.addAttributes(attrs);
                }
                if (parsed.css?.length) cssComposer.addCollection(parsed.css, { extend: true });
              } else {
                matched.replaceWith(el.outerHTML);
              }
            } else {
              matched.replaceWith(el.outerHTML);
            }
          }
          matchedCount++;
        } else if (!el.getAttribute("id")) {
          wrapper.components().add(el.outerHTML);
          matchedCount++;
        }
      }

      if (matchedCount === 0) {
        console.warn(
          "[grapevine] editComponentCode: could not match any elements. AI output had",
          topLevelElements.length,
          "element(s).",
        );
      }
      break;
    }
    case "addComponentCode": {
      const componentId = input.componentId as string;
      const position = (input.position as string) || "afterInside";
      const target =
        (componentId
          ? editor.Components?.getById(componentId) || wrapper.find(`#${componentId}`)[0]
          : null) || wrapper;

      const parent = target.parent();
      const idx = target.index();

      switch (position) {
        case "before":
          if (parent) {
            const added = parent.append(html, { at: idx });
            if (added[0]) setTimeout(() => editor.select(added[0], { scroll: true }), 50);
          } else {
            wrapper.components().add(html, { at: 0 });
          }
          break;
        case "beforeInside": {
          const added = target.append(html, { at: 0 });
          if (added[0]) setTimeout(() => editor.select(added[0], { scroll: true }), 50);
          break;
        }
        case "after":
          if (parent) {
            const added = parent.append(html, { at: (idx ?? 0) + 1 });
            if (added[0]) setTimeout(() => editor.select(added[0], { scroll: true }), 50);
          } else {
            wrapper.components().add(html);
          }
          break;
        case "afterInside":
        default: {
          const added = target.append(html);
          if (added[0]) setTimeout(() => editor.select(added[0], { scroll: true }), 50);
          break;
        }
      }
      break;
    }
    case "addPageCode": {
      const pageName = (input.name as string) || "New Page";
      if (editor.Pages?.add) {
        const page = editor.Pages.add({ name: pageName, component: html }, { select: true });
        page.getMainComponent().components(html);
      } else {
        editor.setComponents(html);
      }
      break;
    }
    case "addProjectPageCode": {
      const projectPageName = (input.name as string) || "New Page";
      editor.loadProjectData({ pages: [{ name: projectPageName, component: html }] });
      break;
    }
  }
}

/**
 * Resolve a client-side tool call against the live editor.
 * Returns the result to send back to the AI for the next turn.
 */
export function resolveClientTool(
  editor: GjsEditor,
  call: PendingClientTool,
): string | Record<string, unknown> | null {
  switch (call.toolName) {
    case "getPageContent": {
      const pageId = call.input.pageId as string | undefined;
      const page = pageId ? editor.Pages?.get(pageId) : null;
      const comp = page ? page.getMainComponent() : editor.getWrapper();
      const html = comp.toHTML({
        asDocument: true,
        attributes: (c, attrs) => {
          if (attrs) attrs.id = c.getId();
          return attrs;
        },
      });
      const css = editor.getCss() || "";
      return { content: `${css ? `<style>${css}</style>` : ""}${html}` };
    }
    case "removeComponent": {
      const componentId = call.input.componentId as string;
      const comp = editor.Components?.getById(componentId);
      if (comp) {
        comp.remove();
        return { success: true };
      }
      return { success: false, error: `Component not found: ${componentId}` };
    }
    case "moveComponent": {
      const sourceId = call.input.sourceId as string;
      const targetId = call.input.targetId as string;
      const targetIndex = call.input.targetIndex as number;
      const source = editor.Components?.getById(sourceId);
      const target = editor.Components?.getById(targetId);
      if (!source) return { success: false, error: `Source not found: ${sourceId}` };
      if (!target) return { success: false, error: `Target not found: ${targetId}` };
      target.append(source, { at: targetIndex });
      editor.select(source, { scroll: true });
      return { success: true };
    }
    case "listPages": {
      const pages = editor.Pages
        ? editor.Pages.getAll().map((p) => ({ id: p.getId(), name: p.getName() }))
        : [];
      return { pages };
    }
    case "runCommand": {
      const commandId = call.input.commandId as string;
      if (!commandId) return { success: false, error: "No commandId provided" };
      const commandMap: Record<string, string> = {
        preview: "core:preview",
      };
      const actualCommand = commandMap[commandId] || commandId;
      try {
        editor.runCommand(actualCommand);
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Command failed" };
      }
    }
    default:
      return null;
  }
}
