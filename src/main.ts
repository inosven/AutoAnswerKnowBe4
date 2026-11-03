import { chromium, BrowserContext, Page } from 'playwright';
import { initLogger, logInfo, logError } from './core/logger';
import { writeQuizRequest, pollForAnswer, cleanupAfterQuiz } from './core/quiz-ipc';
import { SiteAdapter } from './core/types';
import { knowbe4Adapter, handleKnowBe4VideoWait, logKnowBe4Success } from './sites/knowbe4/adapter';
import { config } from './config';
import * as readline from 'readline';

const site_adapters: SiteAdapter[] = [
  knowbe4Adapter,
];

async function main() {
  initLogger();
  logInfo('STARTUP', 'KnowBe4 Auto-Completer starting');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();

  const start_page = await context.newPage();
  await start_page.goto(config.knowbe4StartUrl);

  console.log('Please login and click Start on a training module. Press Enter when ready.');
  await waitForEnter();

  const training_page = await detectTrainingPage(context);
  if (!training_page) {
    logError('STARTUP', 'Could not find training window. Make sure you clicked Start on a module.');
    await browser.close();
    return;
  }

  logInfo('STARTUP', `Training page detected: ${training_page.url()}`);

  const adapter = resolveAdapter(training_page.url());
  if (!adapter) {
    logError('STARTUP', `No adapter found for URL: ${training_page.url()}`);
    await browser.close();
    return;
  }

  logInfo('STARTUP', `Using adapter: ${adapter.name}`);
  logInfo('STARTUP', 'Waiting for training page to fully load...');
  await training_page.waitForLoadState('domcontentloaded');
  await training_page.waitForTimeout(3000);
  await runAutomationLoop(training_page, adapter);

  logInfo('SHUTDOWN', 'Automation loop ended — closing browser');
  await browser.close();
}

async function runAutomationLoop(page: Page, adapter: SiteAdapter) {
  logInfo('LOOP', 'Starting automation loop');

  let consecutive_unknown = 0;
  const max_consecutive_unknown = 10;

  while (true) {
    const page_type = await adapter.detectPageType(page);

    if (page_type == 'quiz-success') {
      await logKnowBe4Success(page);
      break;
    }

    if (page_type == 'unknown') {
      consecutive_unknown++;
      logInfo('LOOP', `Unknown page (${consecutive_unknown}/${max_consecutive_unknown}) — waiting`);
      if (consecutive_unknown >= max_consecutive_unknown) {
        logError('LOOP', 'Too many unknown pages in a row — manual intervention needed');
        console.log('Automation stuck. Press Enter after resolving the issue.');
        await waitForEnter();
        consecutive_unknown = 0;
      }
      await page.waitForTimeout(config.loopIntervalMs);
      continue;
    }

    consecutive_unknown = 0;

    if (page_type == 'trademark-popup') {
      await adapter.handleTrademarkPopup(page);
      continue;
    }

    if (page_type == 'content') {
      await adapter.handleContentPage(page);
      continue;
    }

    if (page_type == 'video-playing') {
      await handleKnowBe4VideoWait(page);
      continue;
    }

    if (page_type == 'video-finished') {
      await adapter.handleVideoFinished(page);
      continue;
    }

    if (page_type == 'expandable-interaction') {
      await adapter.handleExpandableInteraction(page);
      continue;
    }

    if (page_type == 'quiz-transition') {
      await adapter.handleQuizTransition(page);
      continue;
    }

    if (page_type == 'feedback') {
      await adapter.handleFeedbackPage(page);
      continue;
    }

    if (page_type == 'quiz-failure') {
      await adapter.handleQuizFailure(page);
      continue;
    }

    if (page_type == 'quiz-radio' || page_type == 'quiz-checkbox' || page_type == 'quiz-dropdown') {
      await handleQuizFlow(page, adapter, page_type);
      continue;
    }

    await page.waitForTimeout(config.loopIntervalMs);
  }

  logInfo('LOOP', 'Automation loop finished');
}

async function handleQuizFlow(page: Page, adapter: SiteAdapter, page_type: 'quiz-radio' | 'quiz-checkbox' | 'quiz-dropdown') {
  logInfo('QUIZ-FLOW', `Starting quiz flow for page type: ${page_type}`);

  const quiz_request = await adapter.extractQuizData(page, page_type);
  writeQuizRequest(quiz_request);

  const quiz_answer = await pollForAnswer(config.answerTimeoutMs, quiz_request.id);

  if (!quiz_answer) {
    logError('QUIZ-FLOW', 'No answer received — waiting for manual intervention');
    console.log('Quiz timed out. Press Enter after manually answering.');
    await waitForEnter();
    cleanupAfterQuiz(quiz_request.hasScreenshot);
    return;
  }

  await adapter.applyQuizAnswer(page, quiz_answer);
  cleanupAfterQuiz(quiz_request.hasScreenshot);
}

async function detectTrainingPage(context: BrowserContext): Promise<Page | null> {
  await new Promise(resolve => setTimeout(resolve, 2000));

  const all_pages = context.pages();
  for (const p of all_pages) {
    if (p.url().includes('modstore/scorm')) {
      return p;
    }
  }

  return new Promise(resolve => {
    const timeout_handle = setTimeout(() => {
      context.off('page', handler);
      resolve(null);
    }, 30000);

    const handler = (new_page: Page) => {
      new_page.waitForLoadState('domcontentloaded').then(() => {
        if (new_page.url().includes('modstore/scorm') || new_page.url().includes('training.knowbe4.com')) {
          clearTimeout(timeout_handle);
          context.off('page', handler);
          resolve(new_page);
        }
      });
    };

    context.on('page', handler);
  });
}

function resolveAdapter(url: string): SiteAdapter | null {
  for (const adapter of site_adapters) {
    if (adapter.matchesUrl(url)) return adapter;
  }
  return null;
}

function waitForEnter(): Promise<void> {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('', () => {
      rl.close();
      resolve();
    });
  });
}

main().catch(err => {
  logError('FATAL', String(err));
  process.exit(1);
});
