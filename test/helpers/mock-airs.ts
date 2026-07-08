/**
 * Spawns the standalone mock AIRS server (see mock-airs-server.mjs) in a
 * child process and waits for it to signal readiness. Content-based verdict:
 * scan bodies containing "BLOCK_ME" are blocked, everything else is allowed.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

export interface MockAirsServer {
  endpoint: string;
  stop: () => void;
}

export async function startMockAirsServer(): Promise<MockAirsServer> {
  const port = 40000 + Math.floor(Math.random() * 20000);
  const child: ChildProcess = spawn(
    "node",
    [join(import.meta.dirname, "mock-airs-server.mjs"), String(port)],
    { stdio: ["ignore", "pipe", "inherit"] },
  );

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("mock AIRS server did not start within 5s")),
      5000,
    );
    child.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("ready")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`mock AIRS server exited early (code ${code})`));
    });
  });

  return {
    endpoint: `http://127.0.0.1:${port}`,
    stop: () => child.kill(),
  };
}
