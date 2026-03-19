/** Tool names that are resolved on the server via sub-agent code generation */
export const SERVER_TOOL_NAMES = new Set([
  "editComponentCode",
  "addComponentCode",
  "addPageCode",
  "addProjectPageCode",
]);

/** Tool names that are resolved on the client */
export const CLIENT_TOOL_NAMES = new Set([
  "getPageContent",
  "removeComponent",
  "moveComponent",
  "listPages",
  "runCommand",
]);

/** Map a tool name to the sub-agent prompt mode */
export function getToolMode(
  toolName: string,
): "edit" | "add" | "page" | "projectPage" | null {
  switch (toolName) {
    case "editComponentCode":
      return "edit";
    case "addComponentCode":
      return "add";
    case "addPageCode":
      return "page";
    case "addProjectPageCode":
      return "projectPage";
    default:
      return null;
  }
}
