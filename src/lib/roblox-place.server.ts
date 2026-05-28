// Server-side builder: assembles a minimal .rbxlx PLACE XML from project files.
// Open Cloud Place Versions accepts rbxlx as the binary body for v1 places upload.

type FileLike = {
  path: string;
  file_type: string;
  service_location: string;
  content: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const classFor = (ft: string): "Script" | "LocalScript" | "ModuleScript" => {
  const f = (ft || "").toLowerCase();
  if (f === "localscript") return "LocalScript";
  if (f === "modulescript") return "ModuleScript";
  return "Script";
};

let refCounter = 0;
const nextRef = () => `RBX${(refCounter++).toString(16).padStart(8, "0")}`;

type Node = {
  name: string;
  klass: string;
  source?: string;
  children: Map<string, Node>;
  extraProps?: string;
};

const mk = (name: string, klass: string, extraProps?: string): Node => ({
  name,
  klass,
  children: new Map(),
  extraProps,
});

function insertFile(
  serviceNode: Node,
  segments: string[],
  klass: "Script" | "LocalScript" | "ModuleScript",
  source: string,
) {
  let node = serviceNode;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (!node.children.has(seg)) node.children.set(seg, mk(seg, "Folder"));
    node = node.children.get(seg)!;
  }
  const leaf = segments[segments.length - 1] || "Script";
  node.children.set(leaf, { name: leaf, klass, children: new Map(), source });
}

function renderNode(n: Node): string {
  const ref = nextRef();
  const props: string[] = [`<string name="Name">${esc(n.name)}</string>`];
  if (n.klass === "Script" || n.klass === "LocalScript" || n.klass === "ModuleScript") {
    props.push(
      `<ProtectedString name="Source"><![CDATA[${(n.source ?? "").replace(/]]>/g, "]]]]><![CDATA[>")}]]></ProtectedString>`,
    );
  }
  if (n.extraProps) props.push(n.extraProps);
  const kids = Array.from(n.children.values()).map(renderNode).join("");
  return `<Item class="${n.klass}" referent="${ref}"><Properties>${props.join("")}</Properties>${kids}</Item>`;
}

const SERVICE_ALIASES: Record<string, string> = {
  workspace: "Workspace",
  serverscriptservice: "ServerScriptService",
  serverstorage: "ServerStorage",
  replicatedstorage: "ReplicatedStorage",
  replicatedfirst: "ReplicatedFirst",
  starterplayer: "StarterPlayer",
  starterplayerscripts: "StarterPlayer",
  starterplayer_starterplayerscripts: "StarterPlayer",
  startercharacterscripts: "StarterPlayer",
  starterpack: "StarterPack",
  startergui: "StarterGui",
  lighting: "Lighting",
  soundservice: "SoundService",
  chat: "Chat",
  teams: "Teams",
};

function classifyService(raw: string): { service: string; sub?: string } {
  const cleaned = (raw || "ServerScriptService").replace(/\s+/g, "");
  const parts = cleaned.split(/[.\/]/).filter(Boolean);
  const first = parts[0]?.toLowerCase() ?? "serverscriptservice";
  const service = SERVICE_ALIASES[first] ?? "ServerScriptService";
  let sub: string | undefined;
  if (service === "StarterPlayer") {
    sub = parts[1] || "StarterPlayerScripts";
  }
  return { service, sub };
}

export function buildRbxlx(projectName: string, files: FileLike[]): string {
  refCounter = 0;
  const services = new Map<string, Node>();
  const getSvc = (name: string) => {
    if (!services.has(name)) services.set(name, mk(name, name));
    return services.get(name)!;
  };

  // Workspace with a default Baseplate so the place runs.
  const workspace = getSvc("Workspace");
  workspace.children.set("Baseplate", {
    name: "Baseplate",
    klass: "Part",
    children: new Map(),
    extraProps: [
      `<bool name="Anchored">true</bool>`,
      `<Vector3 name="size"><X>2048</X><Y>20</Y><Z>2048</Z></Vector3>`,
      `<CoordinateFrame name="CFrame"><X>0</X><Y>-10</Y><Z>0</Z><R00>1</R00><R01>0</R01><R02>0</R02><R10>0</R10><R11>1</R11><R12>0</R12><R20>0</R20><R21>0</R21><R22>1</R22></CoordinateFrame>`,
      `<token name="Material">816</token>`,
    ].join(""),
  });
  // Always include core services so scripts have somewhere to live.
  getSvc("ServerScriptService");
  getSvc("ServerStorage");
  getSvc("ReplicatedStorage");
  getSvc("Lighting");
  getSvc("StarterGui");
  getSvc("StarterPack");
  const starterPlayer = getSvc("StarterPlayer");
  if (!starterPlayer.children.has("StarterPlayerScripts")) {
    starterPlayer.children.set(
      "StarterPlayerScripts",
      mk("StarterPlayerScripts", "StarterPlayerScripts"),
    );
  }
  if (!starterPlayer.children.has("StarterCharacterScripts")) {
    starterPlayer.children.set(
      "StarterCharacterScripts",
      mk("StarterCharacterScripts", "StarterCharacterScripts"),
    );
  }

  for (const f of files) {
    const { service, sub } = classifyService(f.service_location);
    let target = getSvc(service);
    if (service === "StarterPlayer" && sub) {
      if (!target.children.has(sub)) {
        const subClass =
          sub === "StarterCharacterScripts" ? "StarterCharacterScripts" : "StarterPlayerScripts";
        target.children.set(sub, mk(sub, subClass));
      }
      target = target.children.get(sub)!;
    }

    const segs = f.path
      .replace(/\\/g, "/")
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean);
    // strip leading service name if present
    if (segs[0] && segs[0].toLowerCase() === service.toLowerCase()) segs.shift();
    if (segs.length === 0) segs.push((f.path.split("/").pop() || "Script").replace(/\.lua$/, ""));

    insertFile(target, segs, classFor(f.file_type), f.content ?? "");
  }

  const body = Array.from(services.values()).map(renderNode).join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">${body}<!-- ${esc(projectName)} -->
</roblox>`;
}
