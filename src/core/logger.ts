import * as fs from 'fs';
import * as path from 'path';

const log_file_path = path.join(process.cwd(), 'quiz-data', 'automation.log');

function getTimestamp() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function logInfo(tag: string, message: string) {
  const line = `${getTimestamp()} [${tag}] ${message}\n`;
  process.stdout.write(line);
  fs.appendFileSync(log_file_path, line);
}

export function logError(tag: string, message: string) {
  const line = `${getTimestamp()} [${tag}] ERROR: ${message}\n`;
  process.stderr.write(line);
  fs.appendFileSync(log_file_path, line);
}

export function initLogger() {
  const dir = path.dirname(log_file_path);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  logInfo('STARTUP', 'Logger initialized');
}
