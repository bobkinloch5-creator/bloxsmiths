// Build a Roblox .rbxmx XML model from project files so users can drag-drop
// the export straight into Roblox Studio without the plugin.

type FileLike = {
  path: string;
  file_type: string; // Script | LocalScript | ModuleScript
  service_location: string; // ServerScriptService / StarterPlayer.StarterPlayerScripts / ...
  content: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const classFor = (ft: string) => {
  const f = (ft || "").toLowerCase();
  if (f === "localscript") return "LocalScript";
  if (f === "modulescript") return "ModuleScript";
  return "Script";
};

let refCounter = 0;
const nextRef = () => `RBX${(refCounter++).toString(16).padStart(8, "0")}`;

type Node = {
  name: string;
  klass: "Folder" | "Script" | "LocalScript" | "ModuleScript";
  source?: string;
  children: Map<string, Node>;
};

const mkFolder = (name: string): Node => ({ name, klass: "Folder", children: new Map() });

function insertFile(root: Node, segments: string[], klass: Node["klass"], source: string) {
  let node = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (!node.children.has(seg)) node.children.set(seg, mkFolder(seg));
    node = node.children.get(seg)!;
  }
  const leafName = segments[segments.length - 1] || "Script";
  node.children.set(leafName, { name: leafName, klass, children: new Map(), source });
}

function renderNode(n: Node): string {
  const ref = nextRef();
  const props: string[] = [`<string name="Name">${esc(n.name)}</string>`];
  if (n.klass !== "Folder") {
    props.push(`<ProtectedString name="Source"><![CDATA[${n.source ?? ""}]]></ProtectedString>`);
  }
  const childrenXml = Array.from(n.children.values()).map(renderNode).join("");
  return `<Item class="${n.klass}" referent="${ref}"><Properties>${props.join("")}</Properties>${childrenXml}</Item>`;
}

export function buildRbxmx(projectName: string, files: FileLike[]): string {
  refCounter = 0;
  const root = mkFolder(projectName || "BloxSmithProject");

  // Group by service. Each file's full Studio path = service + remainder.
  // path can be "ServerScriptService/Folder/Name" or "Folder/Name" with service in service_location.
  for (const f of files) {
    const rawPath = f.path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    const pathSegs = rawPath.split("/").filter(Boolean);
    const serviceSegs = (f.service_location || "ServerScriptService")
      .split(/[.\/]/)
      .filter(Boolean);

    // If the path already starts with the service, don't double it.
    const startsWithService =
      pathSegs[0] && serviceSegs[0] && pathSegs[0].toLowerCase() === serviceSegs[0].toLowerCase();
    const fullSegs = startsWithService ? pathSegs : [...serviceSegs, ...pathSegs];

    insertFile(root, fullSegs, classFor(f.file_type), f.content ?? "");
  }

  const body = Array.from(root.children.values()).map(renderNode).join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
<Item class="Folder" referent="${nextRef()}"><Properties><string name="Name">${esc(root.name)}</string></Properties>${body}</Item>
</roblox>`;
}

export function downloadRbxmx(projectName: string, files: FileLike[]) {
  const xml = buildRbxmx(projectName, files);
  const safe = (projectName || "BloxSmithProject").replace(/[^a-z0-9-_]+/gi, "_");
  const blob = new Blob([xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}.rbxmx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
