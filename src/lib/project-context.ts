import type { GjsEditor, ProjectContext } from "../types";

/**
 * Build a ProjectContext from the live editor state.
 * This is sent to the server so the AI knows what's on the page.
 */
export function buildProjectContext(
  editor: GjsEditor,
  projectType: string,
): ProjectContext {
  /** Get page HTML with component IDs embedded so the AI can target elements. */
  function getPageHtmlWithIds(): string {
    const wrapper = editor.getWrapper();
    return wrapper.toHTML({
      asDocument: true,
      attributes: (comp, attrs) => {
        if (attrs) attrs.id = comp.getId();
        return attrs;
      },
    });
  }

  const css = editor.getCss() || "";
  const pageContent = `${css ? `<style>${css}</style>` : ""}${getPageHtmlWithIds()}`;

  const selectedPage = (() => {
    const page = editor.Pages?.getSelected?.();
    if (page) {
      return {
        id: page.getId(),
        name: page.getName() || "Page",
        content: pageContent,
      };
    }
    return { id: "default", name: "Page", content: pageContent };
  })();

  const selected = editor.getSelected();
  const selectedComponent = selected
    ? { id: selected.getId(), content: selected.toHTML() }
    : undefined;

  const selectedComponents = (
    editor.getSelectedAll ? editor.getSelectedAll() : [selected].filter(Boolean)
  )
    .filter(
      (c): c is NonNullable<typeof c> =>
        c !== null && typeof (c as { getId?: unknown }).getId === "function",
    )
    .map((c) => ({ id: c.getId(), content: c.toHTML() }));

  const availablePages = editor.Pages
    ? editor.Pages.getAll().map((p) => ({ id: p.getId(), name: p.getName() || "Page" }))
    : [];

  const globalStyles = editor.getCss() || "";

  const devices = editor.Devices
    ? editor.Devices.getAll().map((d) => d.toJSON())
    : editor.DeviceManager
      ? editor.DeviceManager.getDevices().map((d) => ({
          name: d.name,
          width: d.width,
          widthMedia: d.widthMedia,
        }))
      : [];

  const allPages = editor.Pages?.getAll() ?? [];
  const isNewProject =
    allPages.length > 1
      ? false
      : (editor.getWrapper()?.components?.()?.length ?? 0) === 0;

  const imageUrls = editor.AssetManager
    ? editor.AssetManager.getAll()
        .models.map((m) => m.get("src"))
        .filter(Boolean)
    : [];

  return {
    selectedPage,
    selectedComponent,
    selectedComponents,
    projectType,
    globalStyles,
    devices,
    availablePages,
    installedPlugins: [],
    isEmail: projectType === "email",
    isNewProject,
    imageUrls,
  };
}
