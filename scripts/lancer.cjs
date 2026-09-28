// Lance Orisflow depuis les sources (développement).
// VS Code définit ELECTRON_RUN_AS_NODE=1, ce qui empêche Electron d'ouvrir une fenêtre : on le retire ici.
const { spawn } = require("child_process");
const electron = require("electron");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

spawn(electron, ["."], { stdio: "inherit", env, cwd: require("path").join(__dirname, "..") }).on("exit", (code) =>
  process.exit(code ?? 0),
);
