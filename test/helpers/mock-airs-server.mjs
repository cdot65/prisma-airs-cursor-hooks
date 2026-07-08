/**
 * Standalone mock Prisma AIRS server for hook integration tests.
 *
 * Runs as a separate process because tests drive hooks with execSync,
 * which blocks the vitest event loop — an in-process server would deadlock.
 *
 * Verdict is content-based: any scan request whose body contains the marker
 * "BLOCK_ME" gets action=block; everything else gets action=allow.
 *
 * Usage: node mock-airs-server.mjs <port>
 * Prints "ready" on stdout once listening.
 */
import { createServer } from "node:http";

const port = Number(process.argv[2]);

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const block = body.includes("BLOCK_ME");
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        action: block ? "block" : "allow",
        scan_id: "scan-mock-1",
        report_id: "rep-mock-1",
        category: block ? "malicious" : "benign",
        profile_name: "test-profile",
        prompt_detected: {},
        response_detected: {},
      }),
    );
  });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write("ready\n");
});
