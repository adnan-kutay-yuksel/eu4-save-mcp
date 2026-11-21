import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  // stdout is the MCP channel; log to stderr only
  console.error("eu4-save-mcp running on stdio");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
