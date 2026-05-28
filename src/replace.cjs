const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "..", "plugin-src", "BloxSmith.server.lua");
let content = fs.readFileSync(filePath, "utf8");

const target = 'if path == "/api/studio/poll" or path == "/api/studio/result" then';
const replacement = 'if string.sub(path, 1, 12) == "/api/studio/" then';

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(filePath, content, "utf8");
  console.log("Successfully replaced postJSON condition!");
} else {
  console.error("Target string not found in file!");
}
