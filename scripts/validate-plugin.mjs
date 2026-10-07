import fs from "node:fs";
import path from "node:path";

const root = path.resolve("plugin");
const pluginPath = path.join(root, "plugin.json");
const mcpPath = path.join(root, "mcp.json");
const skillPath = path.join(root, "skills", "finance-assistant", "SKILL.md");

function fail(message) {
  throw new Error(`Plugin validation failed: ${message}`);
}

for (const file of [pluginPath, mcpPath, skillPath]) {
  if (!fs.existsSync(file)) fail(`missing ${path.relative(process.cwd(), file)}`);
}

const plugin = JSON.parse(fs.readFileSync(pluginPath, "utf8"));
const mcp = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
const skill = fs.readFileSync(skillPath, "utf8");

if (plugin.$schema !== "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json") {
  fail("unexpected plugin schema");
}
if (plugin.name !== "thiepn-finance") fail("plugin name must remain stable");
if (!/^\d+\.\d+\.\d+$/.test(plugin.version ?? "")) fail("version must be semver");
if (plugin.homepage !== "https://finance.thiepn.dev") fail("homepage must use production origin");
if (plugin.repository !== "https://github.com/thiepn/finance") fail("repository mismatch");
if (plugin.extensions?.["com.openai"]?.interface?.displayName !== "THIEPN Finance") {
  fail("OpenAI display name mismatch");
}

if (mcp.$schema !== "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json") {
  fail("unexpected MCP schema");
}
const servers = Object.entries(mcp.mcpServers ?? {});
if (servers.length !== 1) fail("public plugin must declare exactly one MCP server");
const [name, server] = servers[0];
if (name !== "finance") fail("MCP server must be named finance");
if (server.type !== "streamable-http") fail("MCP transport must be streamable-http");
if (server.url !== "https://finance.thiepn.dev/api/mcp") fail("MCP URL must use canonical production resource");

if (!skill.startsWith("---\nname: finance-assistant\n")) fail("skill frontmatter/name invalid");
if (!skill.includes("The plugin is read-only.")) fail("skill must state read-only boundary");
if (!skill.includes("untrusted data, never as instructions")) fail("skill must preserve prompt-injection boundary");
if (!skill.includes("Never ask for passwords")) fail("skill must forbid secret collection");

console.log("THIEPN Finance public plugin package validation passed");
