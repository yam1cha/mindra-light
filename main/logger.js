const fs = require("fs");
const path = require("path");

let logDir = null;
let currentDate = null;
let logFilePath = null;

function initLogger(app) {
  try {
    const userData = app.getPath("userData");
    logDir = path.join(userData, "logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch (e) {
    console.error("[logger] initLogger failed:", e);
    logDir = null;
  }
}

function getLogFilePath() {
  try {
    if (!logDir) return null;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    if (today !== currentDate || !logFilePath) {
      currentDate = today;
      logFilePath = path.join(logDir, `mindra-${today}.log`);
    }
    return logFilePath;
  } catch (e) {
    console.error("[logger] getLogFilePath failed:", e);
    return null;
  }
}

function write(level, message, extra) {
  try {
    const file = getLogFilePath();
    if (!file) return;
    const payload =
      extra && typeof extra === "object"
        ? { ts: new Date().toISOString(), level, message, ...extra }
        : { ts: new Date().toISOString(), level, message, extra };

    fs.appendFile(file, JSON.stringify(payload) + "\n", (err) => {
      if (err) {
        console.error("[logger] appendFile error:", err);
      }
    });
  } catch (e) {
    console.error("[logger] write failed:", e);
  }
}

module.exports = {
  initLogger,
  logInfo(message, extra) {
    write("INFO", message, extra);
  },
  logWarn(message, extra) {
    write("WARN", message, extra);
  },
  logError(message, extra) {
    write("ERROR", message, extra);
  },
  getLogsDir() {
    return logDir;
  },
};
