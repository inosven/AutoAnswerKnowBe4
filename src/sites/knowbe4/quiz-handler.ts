import { Page, Locator } from 'playwright';
import { PageType, QuizRequest, QuizAnswer } from '../../core/types';
import { logInfo, logError } from '../../core/logger';
import { resolveContentFrame } from './detector';
import { getScreenshotPath } from '../../core/quiz-ipc';

export async function extractKnowBe4QuizData(page: Page, page_type: PageType): Promise<QuizRequest> {
  const content_frame = await resolveContentFrame(page);
  const quiz_id = `q-${Date.now()}`;

  if (page_type == 'quiz-dropdown') {
    return await extractDropdownQuiz(page, content_frame, quiz_id);
  }

  return await extractChoiceQuiz(page, content_frame, quiz_id, page_type);
}

async function extractChoiceQuiz(page: Page, frame: Page, quiz_id: string, page_type: PageType): Promise<QuizRequest> {
  const quiz_type = page_type == 'quiz-radio' ? 'single-choice' : 'multi-choice';

  const modal = await findQuizModal(frame);
  const question_text = await extractQuestionText(modal ?? frame);
  const option_texts = await extractOptionTexts(modal ?? frame);
  const progress = await extractProgressFromModal(modal ?? frame);

  const dom_extraction_failed = (question_text == null || question_text.length < 10) || option_texts.length < 2;
  let has_screenshot = false;

  if (dom_extraction_failed) {
    logInfo('QUIZ', `DOM extraction insufficient (q="${question_text?.substring(0, 40)}" opts=${option_texts.length}) — taking screenshot`);
    await page.screenshot({ path: getScreenshotPath() });
    has_screenshot = true;
  }

  logInfo('QUIZ', `Extracted ${quiz_type} quiz: "${question_text?.substring(0, 60)}..." options=${option_texts.length}`);

  return {
    id: quiz_id,
    timestamp: new Date().toISOString(),
    type: quiz_type,
    domText: {
      question: question_text,
      options: option_texts.length > 0 ? option_texts : null,
      dropdowns: null,
    },
    hasScreenshot: has_screenshot,
    quizProgress: progress,
    pageUrl: page.url(),
  };
}

async function extractDropdownQuiz(page: Page, frame: Page, quiz_id: string): Promise<QuizRequest> {
  const modal = await findQuizModal(frame);
  const question_text = await extractQuestionText(modal ?? frame);
  const dropdown_data = await extractDropdownData(modal ?? frame);

  const dom_extraction_failed = (question_text == null || question_text.length < 10) || dropdown_data.length == 0;
  let has_screenshot = false;

  if (dom_extraction_failed) {
    logInfo('QUIZ', 'DOM extraction insufficient — taking screenshot');
    await page.screenshot({ path: getScreenshotPath() });
    has_screenshot = true;
  }

  logInfo('QUIZ', `Extracted dropdown quiz: "${question_text?.substring(0, 60)}..." dropdowns=${dropdown_data.length}`);

  return {
    id: quiz_id,
    timestamp: new Date().toISOString(),
    type: 'dropdown',
    domText: {
      question: question_text,
      options: null,
      dropdowns: dropdown_data.length > 0 ? dropdown_data : null,
    },
    hasScreenshot: has_screenshot,
    quizProgress: await extractProgressFromModal(modal ?? frame),
    pageUrl: page.url(),
  };
}

export async function applyKnowBe4QuizAnswer(page: Page, answer: QuizAnswer) {
  logInfo('QUIZ', `Applying answer: type=${answer.type} selections=[${answer.selections}]`);
  const content_frame = await resolveContentFrame(page);
  const modal = await findQuizModal(content_frame);
  const scope = modal ?? content_frame;

  if (answer.type == 'single-choice') {
    await applyRadioAnswer(scope, answer.selections[0]);
  } else if (answer.type == 'multi-choice') {
    await applyCheckboxAnswer(scope, answer.selections);
  } else if (answer.type == 'dropdown') {
    await applyDropdownAnswer(scope as Page, answer.selections);
  }

  await submitQuiz(scope, page);
}

async function applyRadioAnswer(frame: Page | Locator, selection_index: number) {
  const radio_selectors = [
    'input[type="radio"]',
    '[role="radio"]',
    'label',
  ];

  for (const selector of radio_selectors) {
    const elements = frame.locator(selector);
    const count = await elements.count();
    if (count == 0) continue;
    if (selection_index >= count) {
      logError('QUIZ', `Radio index ${selection_index} out of range (${count} options with selector: ${selector})`);
      continue;
    }
    await elements.nth(selection_index).click();
    logInfo('QUIZ', `Selected radio option ${selection_index} using selector: ${selector}`);
    return;
  }

  logError('QUIZ', 'No clickable radio elements found');
}

async function applyCheckboxAnswer(frame: Page | Locator, selection_indices: number[]) {
  const checkbox_selectors = [
    'input[type="checkbox"]',
    '[role="checkbox"]',
    'label',
  ];

  for (const selector of checkbox_selectors) {
    const elements = frame.locator(selector);
    const count = await elements.count();
    if (count == 0) continue;
    for (const idx of selection_indices) {
      if (idx >= count) {
        logError('QUIZ', `Checkbox index ${idx} out of range (${count} options)`);
        continue;
      }
      await elements.nth(idx).click();
      logInfo('QUIZ', `Selected checkbox option ${idx} using selector: ${selector}`);
    }
    return;
  }

  logError('QUIZ', 'No clickable checkbox elements found');
}

async function applyDropdownAnswer(frame: Page, selection_indices: number[]) {
  const select_elements = frame.locator('select');
  const count = await select_elements.count();

  for (let i = 0; i < selection_indices.length; i++) {
    if (i >= count) {
      logError('QUIZ', `Dropdown index ${i} out of range (${count} dropdowns)`);
      continue;
    }

    const select_el = select_elements.nth(i);
    const options = select_el.locator('option');
    const option_count = await options.count();
    const target_idx = selection_indices[i];

    if (target_idx >= option_count) {
      logError('QUIZ', `Option index ${target_idx} out of range for dropdown ${i} (${option_count} options)`);
      continue;
    }

    const option_value = await options.nth(target_idx).getAttribute('value');
    if (option_value == null) continue;

    await select_el.selectOption({ value: option_value });
    logInfo('QUIZ', `Set dropdown ${i} to option index ${target_idx}`);
  }
}

async function submitQuiz(scope: Page | Locator, page: Page) {
  const all_submit = scope.locator('button:has-text("Submit"), input[type="submit"]');
  const submit_count = await all_submit.count();
  if (submit_count == 0) {
    logError('QUIZ', 'Submit button not found in scope');
    return;
  }

  for (let i = 0; i < submit_count; i++) {
    const btn = all_submit.nth(i);
    const is_visible = await btn.isVisible();
    const is_enabled = await btn.isEnabled();
    if (is_visible && is_enabled) {
      await btn.click();
      logInfo('QUIZ', `Clicked Submit button (index ${i})`);
      await page.waitForTimeout(2000);
      return;
    }
    logInfo('QUIZ', `Submit button ${i} skipped (visible=${is_visible} enabled=${is_enabled})`);
  }

  logError('QUIZ', 'No visible/enabled Submit button found in scope');
}

async function extractQuestionText(scope: Page | Locator): Promise<string | null> {
  const question_selectors = [
    '[class*="question"]',
    '[class*="Question"]',
    'h1', 'h2', 'h3',
    'p',
  ];

  for (const selector of question_selectors) {
    const elements = scope.locator(selector);
    const count = await elements.count();
    for (let i = 0; i < count; i++) {
      const text = (await elements.nth(i).textContent())?.trim() ?? '';
      if (text.length >= 15 && !text.includes('Search') && !text.includes('Contents')) return text;
    }
  }

  const all_text = await getScopeText(scope);
  if (all_text.length >= 15) return all_text.substring(0, 500);
  return null;
}

async function extractOptionTexts(scope: Page | Locator): Promise<string[]> {
  const option_texts: string[] = [];

  const selectors_to_try = [
    'label:has(input[type="radio"])',
    'label:has(input[type="checkbox"])',
    '[role="radio"]',
    '[role="checkbox"]',
    'label',
    '[class*="option"]',
    '[class*="answer"]',
    '[class*="choice"]',
  ];

  for (const selector of selectors_to_try) {
    const elements = scope.locator(selector);
    const count = await elements.count();
    if (count < 2) continue;

    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = (await elements.nth(i).textContent())?.trim() ?? '';
      if (text && text.length > 2 && !text.includes('Search') && !text.includes('Contents')) {
        texts.push(text);
      }
    }
    if (texts.length >= 2) {
      logInfo('QUIZ', `Options extracted using selector "${selector}": ${texts.length} options`);
      return texts;
    }
  }

  return option_texts;
}

async function extractDropdownData(frame: Page | Locator) {
  const dropdown_data: { label: string; options: string[] }[] = [];
  const select_elements = frame.locator('select');
  const select_count = await select_elements.count();

  for (let i = 0; i < select_count; i++) {
    const select_el = select_elements.nth(i);
    const select_id = await select_el.getAttribute('id') ?? '';
    let label_text = '';

    if (select_id) {
      const label_el = frame.locator(`label[for="${select_id}"]`);
      const label_count = await label_el.count();
      if (label_count > 0) {
        label_text = (await label_el.first().textContent())?.trim() ?? '';
      }
    }

    if (!label_text) {
      const parent_label = select_el.locator('xpath=ancestor::label[1]');
      const parent_count = await parent_label.count();
      if (parent_count > 0) {
        label_text = (await parent_label.first().textContent())?.trim() ?? '';
      }
    }

    const options: string[] = [];
    const option_elements = select_el.locator('option');
    const option_count = await option_elements.count();
    for (let j = 0; j < option_count; j++) {
      const text = (await option_elements.nth(j).textContent())?.trim() ?? '';
      if (text && !text.toLowerCase().includes('select your response')) {
        options.push(text);
      }
    }

    dropdown_data.push({ label: label_text, options });
  }

  return dropdown_data;
}

async function findVisibleSubmitButton(frame: Page) {
  const all_submit = frame.locator('button:has-text("Submit"), input[type="submit"]');
  const count = await all_submit.count();
  for (let i = 0; i < count; i++) {
    const btn = all_submit.nth(i);
    const is_visible = await btn.isVisible();
    const is_enabled = await btn.isEnabled();
    if (is_visible && is_enabled) return btn;
  }
  return null;
}

async function findQuizModal(frame: Page) {
  const visible_submit = await findVisibleSubmitButton(frame);
  if (!visible_submit) return null;

  const modal_selectors = [
    'dialog',
    '[role="dialog"]',
    '[class*="modal"]',
    '[class*="quiz"]',
    '[class*="question"]',
    '[class*="overlay"]',
    '[class*="popup"]',
    '[class*="panel"]',
    '[class*="card"]',
  ];

  for (const sel of modal_selectors) {
    const candidates = frame.locator(sel);
    const count = await candidates.count();
    for (let i = 0; i < count; i++) {
      const el = candidates.nth(i);
      const inner_submit = el.locator('button:has-text("Submit"), input[type="submit"]');
      const inner_count = await inner_submit.count();
      for (let j = 0; j < inner_count; j++) {
        const btn = inner_submit.nth(j);
        const is_visible = await btn.isVisible();
        const is_enabled = await btn.isEnabled();
        if (is_visible && is_enabled) {
          logInfo('QUIZ', `Found quiz modal using selector: ${sel} (index ${i})`);
          return el;
        }
      }
    }
  }

  const submit_parent = visible_submit.locator('xpath=ancestor::*[self::div or self::section or self::article or self::form][1]');
  const parent_count = await submit_parent.count();
  if (parent_count > 0) {
    logInfo('QUIZ', 'Using visible Submit button parent as quiz scope');
    return submit_parent.first();
  }

  return null;
}

async function getScopeText(scope: Page | Locator): Promise<string> {
  if ('locator' in scope && 'goto' in scope) {
    return await (scope as Page).locator('body').textContent() ?? '';
  }
  return await (scope as Locator).textContent() ?? '';
}

async function extractProgressFromModal(scope: Page | Locator): Promise<string | null> {
  const text = await getScopeText(scope);
  const matches = [...text.matchAll(/(\d+)\s*\/\s*(\d+)/g)];
  if (matches.length == 0) return null;
  const filtered = matches.filter(m => parseInt(m[1]) <= 100 && parseInt(m[2]) <= 100);
  return filtered.length > 0 ? filtered[0][0] : matches[0][0];
}
