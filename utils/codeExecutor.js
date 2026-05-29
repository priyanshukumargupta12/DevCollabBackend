const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");

/**
 * Code Executor Utility
 * Runs code securely using OS child processes with a hard timeout.
 * Supports JavaScript natively; Python if installed on the server.
 * Other languages return helpful setup instructions.
 *
 * Security measures:
 * - Code runs in a temp file, deleted after execution
 * - Stdout/stderr capped at 10KB
 * - Hard-kill after TIMEOUT_MS milliseconds
 * - No network access enforcement note for users
 */

const TIMEOUT_MS = 10000; // 10 seconds
const MAX_OUTPUT_BYTES = 10 * 1024; // 10KB

/**
 * Strip ANSI color/control codes from output strings.
 * @param {string} str
 * @returns {string}
 */
const stripAnsi = (str) => {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[mGKHFJ]/g, "");
};

/**
 * Truncate output to MAX_OUTPUT_BYTES if needed.
 * @param {string} output
 * @returns {string}
 */
const truncateOutput = (output) => {
  if (Buffer.byteLength(output, "utf8") > MAX_OUTPUT_BYTES) {
    return output.slice(0, MAX_OUTPUT_BYTES) + "\n\n[Output truncated — limit 10KB]";
  }
  return output;
};

/**
 * Write code to a temporary file and return its path.
 * @param {string} code
 * @param {string} extension
 * @returns {string} temp file path
 */
const writeTempFile = (code, extension) => {
  const tempDir = os.tmpdir();
  const filename = `collab_exec_${Date.now()}_${Math.random().toString(36).slice(2)}${extension}`;
  const filepath = path.join(tempDir, filename);
  fs.writeFileSync(filepath, code, "utf8");
  return filepath;
};

/**
 * Clean up temporary file safely.
 * @param {string} filepath
 */
const cleanupFile = (filepath) => {
  try {
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  } catch (_) {
    // Non-critical — ignore cleanup errors
  }
};

/**
 * Run a process with stdin/stdout capture and timeout.
 * @param {string} command - executable
 * @param {string[]} args - arguments
 * @param {string|null} tempFile - temp file path to cleanup after
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number, timedOut: boolean }>}
 */
const runProcess = (command, args, tempFile = null) => {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const proc = spawn(command, args, {
      timeout: TIMEOUT_MS,
      env: {
        ...process.env,
        // Restrict Python output buffering
        PYTHONUNBUFFERED: "1",
      },
    });

    // Kill after TIMEOUT_MS
    const killTimer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, TIMEOUT_MS);

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(killTimer);
      if (tempFile) cleanupFile(tempFile);
      resolve({
        stdout: truncateOutput(stripAnsi(stdout)),
        stderr: truncateOutput(stripAnsi(stderr)),
        exitCode: code ?? 1,
        timedOut,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(killTimer);
      if (tempFile) cleanupFile(tempFile);
      resolve({
        stdout: "",
        stderr: err.message,
        exitCode: 1,
        timedOut: false,
      });
    });
  });
};

/**
 * Main execution entry point.
 * @param {string} code - source code to run
 * @param {string} language - language identifier
 * @returns {Promise<{ output: string, error: string, exitCode: number, timedOut: boolean, language: string }>}
 */
const executeCode = async (code, language) => {
  if (!code || !code.trim()) {
    return {
      output: "",
      error: "No code provided to execute.",
      exitCode: 1,
      timedOut: false,
      language,
    };
  }

  let result;

  switch (language) {
    // ── JavaScript ──────────────────────────────────────────────────────────
    case "javascript": {
      const tempFile = writeTempFile(code, ".js");
      result = await runProcess("node", [tempFile], tempFile);
      break;
    }

    // ── TypeScript (run as JS with node after stripping type annotations) ───
    case "typescript": {
      // Try running with ts-node if installed, otherwise fall back to note
      const tempFile = writeTempFile(code, ".ts");
      // Try ts-node first
      const tsResult = await runProcess("npx", ["--yes", "ts-node", "--transpile-only", tempFile], null);
      if (tsResult.exitCode !== 0 && tsResult.stderr.includes("not found")) {
        cleanupFile(tempFile);
        result = {
          output: "",
          stderr: "TypeScript execution requires ts-node. Install with: npm install -g ts-node typescript",
          exitCode: 1,
          timedOut: false,
        };
      } else {
        cleanupFile(tempFile);
        result = tsResult;
      }
      break;
    }

    // ── Python ──────────────────────────────────────────────────────────────
    case "python": {
      const tempFile = writeTempFile(code, ".py");
      // Try python3 first, then python
      let pyResult = await runProcess("python3", [tempFile], null);
      if (pyResult.exitCode !== 0 && (pyResult.stderr.includes("not found") || pyResult.stderr.includes("ENOENT") || pyResult.stderr.includes("not recognized"))) {
        cleanupFile(tempFile);
        const tempFile2 = writeTempFile(code, ".py");
        pyResult = await runProcess("python", [tempFile2], tempFile2);
      } else {
        cleanupFile(tempFile);
      }
      result = pyResult;
      break;
    }

    // ── Java ────────────────────────────────────────────────────────────────
    case "java": {
      result = {
        stdout: "",
        stderr:
          "☕ Java execution requires JDK installed on the server.\n" +
          "Install: https://adoptium.net/\n\n" +
          "To run locally:\n  javac YourFile.java\n  java YourClass",
        exitCode: 1,
        timedOut: false,
      };
      break;
    }

    // ── C++ ─────────────────────────────────────────────────────────────────
    case "cpp": {
      const tempSrcFile = writeTempFile(code, ".cpp");
      const isWindows = os.platform() === "win32";
      const binaryName = `collab_bin_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const tempBinPath = path.join(os.tmpdir(), isWindows ? `${binaryName}.exe` : binaryName);

      // Compile the code
      const compileResult = await runProcess("g++", ["-o", tempBinPath, tempSrcFile], null);
      cleanupFile(tempSrcFile);

      if (compileResult.exitCode !== 0) {
        // Compile failed
        result = {
          stdout: "",
          stderr: `Compilation Error:\n${compileResult.stderr || compileResult.stdout}`,
          exitCode: compileResult.exitCode,
          timedOut: false,
        };
      } else {
        // Run the compiled binary
        result = await runProcess(tempBinPath, [], tempBinPath);
      }
      break;
    }

    // ── C ───────────────────────────────────────────────────────────────────
    case "c": {
      const tempSrcFile = writeTempFile(code, ".c");
      const isWindows = os.platform() === "win32";
      const binaryName = `collab_bin_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const tempBinPath = path.join(os.tmpdir(), isWindows ? `${binaryName}.exe` : binaryName);

      // Compile the code
      const compileResult = await runProcess("gcc", ["-o", tempBinPath, tempSrcFile], null);
      cleanupFile(tempSrcFile);

      if (compileResult.exitCode !== 0) {
        // Compile failed
        result = {
          stdout: "",
          stderr: `Compilation Error:\n${compileResult.stderr || compileResult.stdout}`,
          exitCode: compileResult.exitCode,
          timedOut: false,
        };
      } else {
        // Run the compiled binary
        result = await runProcess(tempBinPath, [], tempBinPath);
      }
      break;
    }

    // ── Go ──────────────────────────────────────────────────────────────────
    case "go": {
      const tempFile = writeTempFile(code, ".go");
      result = await runProcess("go", ["run", tempFile], tempFile);
      break;
    }

    // ── Rust ────────────────────────────────────────────────────────────────
    case "rust": {
      result = {
        stdout: "",
        stderr:
          "🦀 Rust execution requires rustc installed on the server.\n" +
          "Install: https://rustup.rs/\n\n" +
          "To compile and run locally:\n  rustc main.rs\n  ./main",
        exitCode: 1,
        timedOut: false,
      };
      break;
    }

    // ── HTML / CSS / JSON — display-only languages ──────────────────────────
    case "html":
    case "css":
    case "json": {
      result = {
        stdout: `ℹ️ ${language.toUpperCase()} is a display/markup language and cannot be executed.\nOpen it in a browser or validate it with a linter.`,
        stderr: "",
        exitCode: 0,
        timedOut: false,
      };
      break;
    }

    // ── Default / Unknown ───────────────────────────────────────────────────
    default: {
      result = {
        stdout: "",
        stderr: `❓ Execution for language "${language}" is not supported yet.`,
        exitCode: 1,
        timedOut: false,
      };
    }
  }

  return {
    output: result.stdout || "",
    error: result.stderr || "",
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    language,
  };
};

module.exports = { executeCode };
