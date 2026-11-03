import { Page } from 'playwright';
import { PageType } from '../../core/types';
import { logInfo } from '../../core/logger';
import * as path from 'path';
import * as fs from 'fs';

export async function detectKnowBe4PageType(page: Page): Promise<PageType> {
  const body_text = await safeGetBodyText(page);
  const lower = body_text.toLowerCase();

  logInfo('DETECTOR', `Body text snippet: ${body_text.substring(0, 120).replace(/\n/g, ' ')}`);

  if (await isTrademarkPopupVisible(page)) {
    logInfo('DETECTOR', 'Page type: trademark-popup');
    return 'trademark-popup';
  }

  if (await isQuizFailurePage(page, lower)) {
    logInfo('DETECTOR', 'Page type: quiz-failure');
    return 'quiz-failure';
  }

  if (await isQuizSuccessPage(page, lower)) {
    logInfo('DETECTOR', 'Page type: quiz-success');
    return 'quiz-success';
  }

  const submit_btns = page.locator('button:has-text("Submit"), input[type="submit"]');
  const submit_btn_count = await submit_btns.count();
  let has_visible_submit = false;
  for (let i = 0; i < submit_btn_count; i++) {
    if (await submit_btns.nth(i).isVisible()) {
      has_visible_submit = true;
      break;
    }
  }
  if (has_visible_submit) {
    const quiz_type = await determineQuizInputType(page);
    logInfo('DETECTOR', `Page type: ${quiz_type} (visible Submit button found)`);
    return quiz_type;
  }

  if (await isFeedbackPage(page, lower)) {
    logInfo('DETECTOR', 'Page type: feedback');
    return 'feedback';
  }

  if (await isQuizTransitionPage(page, lower)) {
    logInfo('DETECTOR', 'Page type: quiz-transition');
    return 'quiz-transition';
  }

  if (await isVideoFinishedPage(page)) {
    logInfo('DETECTOR', 'Page type: video-finished');
    return 'video-finished';
  }

  if (await isVideoPlayingPage(page)) {
    logInfo('DETECTOR', 'Page type: video-playing');
    return 'video-playing';
  }

  if (await isExpandableInteractionPage(page)) {
    logInfo('DETECTOR', 'Page type: expandable-interaction');
    return 'expandable-interaction';
  }

  if (await isContentPage(page)) {
    logInfo('DETECTOR', 'Page type: content');
    return 'content';
  }

  await captureUnknownPageSnapshot(page);
  logInfo('DETECTOR', 'Page type: unknown');
  return 'unknown';
}

async function determineQuizInputType(page: Page): Promise<PageType> {
  const has_select = await page.locator('select').count() > 0;
  if (has_select) return 'quiz-dropdown';

  const has_checkbox = await page.locator('input[type="checkbox"], [role="checkbox"]').count() > 0;
  if (has_checkbox) return 'quiz-checkbox';

  return 'quiz-radio';
}

async function isTrademarkPopupVisible(page: Page) {
  const body_text = await safeGetBodyText(page);
  if (!body_text.toLowerCase().includes('trademark')) return false;
  const modal_count = await page.locator('dialog, [role="dialog"], .modal, [class*="modal"], [class*="popup"]').count();
  return modal_count > 0;
}

async function isQuizFailurePage(page: Page, lower: string) {
  if (lower.includes('not quite') || lower.includes('redo quiz')) return true;
  const redo_btn = await page.locator('button:has-text("Redo Quiz"), a:has-text("Redo Quiz")').count();
  return redo_btn > 0;
}

async function isQuizSuccessPage(page: Page, lower: string) {
  const has_success_text = lower.includes('congratulations') || lower.includes('you passed') || lower.includes('course complete');
  if (!has_success_text) return false;
  const has_submit = await page.locator('button:has-text("Submit")').count() > 0;
  const has_next = await page.locator('button:has-text("Next")').count() > 0;
  return !has_submit && !has_next;
}

async function isFeedbackPage(page: Page, lower: string) {
  if (!lower.includes('correct answer') && !lower.includes('feedback')) return false;
  const has_submit = await page.locator('button:has-text("Submit")').count() > 0;
  return !has_submit;
}

async function isQuizTransitionPage(page: Page, lower: string) {
  const has_progress = /\d+\s*\/\s*\d+/.test(lower);
  if (!has_progress) return false;
  const has_next = await page.locator('button:has-text("Next"), a:has-text("Next")').count() > 0;
  if (!has_next) return false;
  const submit_btns = page.locator('button:has-text("Submit")');
  const submit_count = await submit_btns.count();
  for (let i = 0; i < submit_count; i++) {
    const is_visible = await submit_btns.nth(i).isVisible();
    if (is_visible) return false;
  }
  return true;
}

async function isVideoFinishedPage(page: Page) {
  const replay_btn = await page.locator('button:has-text("Replay"), [aria-label="Replay"]').count();
  return replay_btn > 0;
}

async function isVideoPlayingPage(page: Page) {
  const video_count = await page.locator('video').count();
  return video_count > 0;
}

async function isExpandableInteractionPage(page: Page) {
  const play_btns = await page.locator('button[aria-label*="play" i], .play-button').count();
  return play_btns >= 2;
}

async function isContentPage(page: Page) {
  const nav_selectors = [
    'button[aria-label="Next"]',
    'button[aria-label="next"]',
    '[class*="nav-next"]',
    '[class*="next-btn"]',
    '[class*="nextButton"]',
    '[id*="nextButton"]',
    'button[id*="next"]',
  ];
  for (const sel of nav_selectors) {
    const count = await page.locator(sel).count();
    if (count > 0) return true;
  }
  return false;
}

async function captureUnknownPageSnapshot(page: Page) {
  const quiz_data_dir = path.join(process.cwd(), 'quiz-data');
  const screenshot_path = path.join(quiz_data_dir, 'debug-unknown.png');
  const text_path = path.join(quiz_data_dir, 'debug-unknown.txt');

  if (!fs.existsSync(quiz_data_dir)) fs.mkdirSync(quiz_data_dir, { recursive: true });

  await page.screenshot({ path: screenshot_path, fullPage: false });
  const body_text = await safeGetBodyText(page);
  fs.writeFileSync(text_path, body_text);
  logInfo('DETECTOR', `Unknown page snapshot saved to quiz-data/debug-unknown.png`);
}

async function safeGetBodyText(page: Page): Promise<string> {
  return await page.locator('body').textContent() ?? '';
}

export async function resolveContentFrame(page: Page): Promise<Page> {
  return page;
}
