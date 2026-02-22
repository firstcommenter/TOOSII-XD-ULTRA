import { spawn } from "child_process";
import path from "path";

const botDir = path.join(process.cwd(), "bot");
const botProcess = spawn("node", ["index.js"], {
  cwd: botDir,
  stdio: "inherit",
  env: { ...process.env, PORT: process.env.PORT || "5000" },
});

botProcess.on("error", (err) => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});

botProcess.on("exit", (code) => {
  console.log(`Bot process exited with code ${code}`);
  process.exit(code || 0);
});

process.on("SIGINT", () => {
  botProcess.kill("SIGINT");
});
process.on("SIGTERM", () => {
  botProcess.kill("SIGTERM");
});
