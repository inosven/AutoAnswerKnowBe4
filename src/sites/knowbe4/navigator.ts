import { Page } from 'playwright';
import { logInfo, logError } from '../../core/logger';
import { resolveContentFrame } from './detector';

export async function handleKnowBe4TrademarkPopup(page: Page) {
  logInfo('NAVIGATOR', 'Closing trademark popup');
  const close_btn = page.locator('dialog button:has-text("Close"), [role="dialog"] button:has-text("Close"), .modal button:has-text("Close")');
  await close_btn.first().click();
  await page.waitForTimeout(1000);
}

export async function handleKnowBe4ContentPage(page: Page) {
  logInfo('NAVIGATOR', 'Handling content page');
  const content_frame = await resolveContentFrame(page);

  await expandAllAccordions(content_frame);

  const max_attempts = 5;
  for (let attempt = 0; attempt < max_attempts; attempt++) {
    const next_arrow = content_frame.locator('button:has-text(">"), [aria-label="Next"], .nav-next, .next-btn, button.next');
    const next_count = await next_arrow.count();

    if (next_count == 0) {
      logInfo('NAVIGATOR', `Next arrow not found, attempt ${attempt + 1}/${max_attempts}`);
      await page.waitForTimeout(2000);
      continue;
    }

    const is_disabled = await next_arrow.first().isDisabled();
    if (is_disabled) {
      logInfo('NAVIGATOR', `Next arrow disabled, attempt ${attempt + 1}/${max_attempts}`);
      await expandAllAccordions(content_frame);
      await page.waitForTimeout(2000);
      continue;
    }

    await next_arrow.first().click();
    logInfo('NAVIGATOR', 'Clicked next arrow on content page');
    await page.waitForTimeout(2000);
    return;
  }

  logError('NAVIGATOR', 'Could not click next arrow after all attempts');
}

export async function handleKnowBe4QuizTransition(page: Page) {
  logInfo('NAVIGATOR', 'Handling quiz transition page');

  const next_btns = page.locator('button:has-text("Next"), a:has-text("Next")');
  const next_count = await next_btns.count();
  if (next_count == 0) {
    logError('NAVIGATOR', 'No Next button found on transition page');
    return;
  }

  for (let i = 0; i < next_count; i++) {
    const btn = next_btns.nth(i);
    const is_visible = await btn.isVisible();
    const is_enabled = await btn.isEnabled();
    if (is_visible && is_enabled) {
      await btn.click();
      logInfo('NAVIGATOR', `Clicked Next on quiz transition page (index ${i})`);
      await page.waitForTimeout(2000);
      return;
    }
  }

  logError('NAVIGATOR', 'No visible/enabled Next button found on transition page');
}

export async function handleKnowBe4ExpandableInteraction(page: Page) {
  logInfo('NAVIGATOR', 'Expandable interaction page detected — manual intervention needed');
  process.stdout.write('\x07');
  process.stdout.write('Manual interaction needed. Press Enter when done.\n');
  await waitForEnter();
}

export async function handleKnowBe4FeedbackPage(page: Page) {
  logInfo('NAVIGATOR', 'Handling feedback page');
  const content_frame = await resolveContentFrame(page);

  const next_arrow = content_frame.locator('button:has-text(">"), [aria-label="Next"], .nav-next, .next-btn');
  const next_count = await next_arrow.count();
  if (next_count > 0) {
    await next_arrow.first().click();
    logInfo('NAVIGATOR', 'Clicked next arrow on feedback page');
    await page.waitForTimeout(2000);
    return;
  }

  const next_btn = content_frame.locator('button:has-text("Next"), a:has-text("Next")');
  const btn_count = await next_btn.count();
  if (btn_count > 0) {
    await next_btn.first().click();
    logInfo('NAVIGATOR', 'Clicked Next button on feedback page');
    await page.waitForTimeout(2000);
  }
}

export async function handleKnowBe4QuizFailure(page: Page) {
  logInfo('NAVIGATOR', 'Quiz failed — clicking Redo Quiz');
  const content_frame = await resolveContentFrame(page);

  const redo_btn = content_frame.locator('button:has-text("Redo Quiz"), a:has-text("Redo Quiz")');
  const redo_count = await redo_btn.count();
  if (redo_count == 0) {
    logError('NAVIGATOR', 'Redo Quiz button not found');
    return;
  }

  await redo_btn.first().click();
  logInfo('NAVIGATOR', 'Clicked Redo Quiz');
  await page.waitForTimeout(2000);
}

async function expandAllAccordions(frame: Page) {
  const accordion_selectors = [
    '[class*="accordion"]:not([aria-expanded="true"])',
    '[class*="collapsible"]:not(.expanded)',
    'button[aria-expanded="false"]',
    '[class*="expand"]:not(.expanded)',
    'summary',
  ];

  let expanded_count = 0;
  for (const selector of accordion_selectors) {
    const elements = frame.locator(selector);
    const count = await elements.count();
    for (let i = 0; i < count; i++) {
      const el = elements.nth(i);
      const is_visible = await el.isVisible();
      if (!is_visible) continue;
      await el.click();
      expanded_count++;
      await frame.waitForTimeout(500);
    }
  }

  if (expanded_count > 0) {
    logInfo('NAVIGATOR', `Expanded ${expanded_count} accordion sections`);
  }
}

function waitForEnter(): Promise<void> {
  return new Promise(resolve => {
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}
