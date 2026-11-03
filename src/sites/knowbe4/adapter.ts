import { Page } from 'playwright';
import { SiteAdapter, PageType, QuizRequest, QuizAnswer } from '../../core/types';
import { detectKnowBe4PageType } from './detector';
import {
  handleKnowBe4TrademarkPopup,
  handleKnowBe4ContentPage,
  handleKnowBe4QuizTransition,
  handleKnowBe4ExpandableInteraction,
  handleKnowBe4FeedbackPage,
  handleKnowBe4QuizFailure,
} from './navigator';
import { handleKnowBe4VideoPlaying, handleKnowBe4VideoFinished } from './video-handler';
import { extractKnowBe4QuizData, applyKnowBe4QuizAnswer } from './quiz-handler';
import { saveFeedbackToHistory } from '../../core/quiz-ipc';
import { logInfo } from '../../core/logger';
import { resolveContentFrame } from './detector';

export const knowbe4Adapter: SiteAdapter = {
  name: 'KnowBe4',

  matchesUrl(url: string) {
    return url.includes('training.knowbe4.com');
  },

  async detectPageType(page: Page): Promise<PageType> {
    return detectKnowBe4PageType(page);
  },

  async handleTrademarkPopup(page: Page) {
    await handleKnowBe4TrademarkPopup(page);
  },

  async handleContentPage(page: Page) {
    await handleKnowBe4ContentPage(page);
  },

  async handleVideoFinished(page: Page) {
    await handleKnowBe4VideoFinished(page);
  },

  async handleExpandableInteraction(page: Page) {
    await handleKnowBe4ExpandableInteraction(page);
  },

  async extractQuizData(page: Page, page_type: PageType): Promise<QuizRequest> {
    return extractKnowBe4QuizData(page, page_type);
  },

  async applyQuizAnswer(page: Page, answer: QuizAnswer) {
    await applyKnowBe4QuizAnswer(page, answer);
  },

  async handleFeedbackPage(page: Page) {
    const content_frame = await resolveContentFrame(page);
    const body_text = await content_frame.locator('body').textContent() ?? '';
    await saveFeedbackToHistory({ timestamp: new Date().toISOString(), text: body_text.trim() });
    await handleKnowBe4FeedbackPage(page);
  },

  async handleQuizFailure(page: Page) {
    await handleKnowBe4QuizFailure(page);
  },

  async handleQuizTransition(page: Page) {
    await handleKnowBe4QuizTransition(page);
  },
};

export async function handleKnowBe4VideoWait(page: Page) {
  await handleKnowBe4VideoPlaying(page);
}

export async function logKnowBe4Success(page: Page) {
  const content_frame = await resolveContentFrame(page);
  const body_text = await content_frame.locator('body').textContent() ?? '';
  logInfo('SUCCESS', `Training complete! Page text: ${body_text.trim().substring(0, 200)}`);
  process.stdout.write('\nTraining completed successfully!\n');
}
