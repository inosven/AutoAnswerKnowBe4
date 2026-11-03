import * as fs from 'fs';
import * as path from 'path';
import { QuizRequest, QuizAnswer } from './types';
import { logInfo, logError } from './logger';

const quiz_data_dir = path.join(process.cwd(), 'quiz-data');
const request_file = path.join(quiz_data_dir, 'quiz-request.json');
const answer_file = path.join(quiz_data_dir, 'quiz-answer.json');
const screenshot_file = path.join(quiz_data_dir, 'quiz-screenshot.png');
const history_dir = path.join(quiz_data_dir, 'history');

export function writeQuizRequest(quiz_request: QuizRequest) {
  fs.writeFileSync(request_file, JSON.stringify(quiz_request, null, 2));
  logInfo('IPC', `Quiz request written: ${quiz_request.id} type=${quiz_request.type}`);
}

export async function pollForAnswer(timeout_ms: number, expected_id: string): Promise<QuizAnswer | null> {
  const start_time = Date.now();
  logInfo('IPC', `Polling for answer (timeout: ${timeout_ms / 1000}s) expected_id=${expected_id}`);

  while (Date.now() - start_time < timeout_ms) {
    if (fs.existsSync(answer_file)) {
      const raw_content = fs.readFileSync(answer_file, 'utf-8');
      const quiz_answer = JSON.parse(raw_content) as QuizAnswer;

      if (quiz_answer.id != expected_id) {
        logInfo('IPC', `Answer id mismatch (got=${quiz_answer.id} expected=${expected_id}) — deleting stale answer and waiting`);
        fs.unlinkSync(answer_file);
        await sleep(2000);
        continue;
      }

      logInfo('IPC', `Answer received: id=${quiz_answer.id} selections=[${quiz_answer.selections}]`);
      return quiz_answer;
    }
    await sleep(2000);
  }

  logError('IPC', 'Timed out waiting for answer');
  return null;
}

export function cleanupAfterQuiz(has_screenshot: boolean) {
  if (fs.existsSync(request_file)) {
    fs.unlinkSync(request_file);
  }
  if (fs.existsSync(answer_file)) {
    fs.unlinkSync(answer_file);
  }
  if (has_screenshot && fs.existsSync(screenshot_file)) {
    const timestamp = Date.now();
    const dest = path.join(history_dir, `screenshot-${timestamp}.png`);
    fs.mkdirSync(history_dir, { recursive: true });
    fs.renameSync(screenshot_file, dest);
    logInfo('IPC', `Screenshot archived to history: ${path.basename(dest)}`);
  }
  logInfo('IPC', 'Cleanup complete');
}

export function saveFeedbackToHistory(feedback_data: object) {
  fs.mkdirSync(history_dir, { recursive: true });
  const timestamp = Date.now();
  const dest = path.join(history_dir, `feedback-${timestamp}.json`);
  fs.writeFileSync(dest, JSON.stringify(feedback_data, null, 2));
  logInfo('IPC', `Feedback saved to history: ${path.basename(dest)}`);
}

export function getScreenshotPath() {
  return screenshot_file;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
