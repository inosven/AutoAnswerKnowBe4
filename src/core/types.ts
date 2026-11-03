import { Page, BrowserContext } from 'playwright';

export type PageType =
  | 'trademark-popup'
  | 'content'
  | 'video-playing'
  | 'video-finished'
  | 'expandable-interaction'
  | 'quiz-radio'
  | 'quiz-checkbox'
  | 'quiz-dropdown'
  | 'quiz-transition'
  | 'feedback'
  | 'quiz-failure'
  | 'quiz-success'
  | 'unknown';

export interface QuizOption {
  label: string;
  options: string[];
}

export interface QuizRequest {
  id: string;
  timestamp: string;
  type: 'single-choice' | 'multi-choice' | 'dropdown';
  domText: {
    question: string | null;
    options: string[] | null;
    dropdowns: QuizOption[] | null;
  };
  hasScreenshot: boolean;
  quizProgress: string | null;
  pageUrl: string;
}

export interface QuizAnswer {
  id: string;
  type: 'single-choice' | 'multi-choice' | 'dropdown';
  selections: number[];
}

export interface SiteAdapter {
  name: string;
  matchesUrl: (url: string) => boolean;
  detectPageType: (page: Page) => Promise<PageType>;
  handleTrademarkPopup: (page: Page) => Promise<void>;
  handleContentPage: (page: Page) => Promise<void>;
  handleVideoFinished: (page: Page) => Promise<void>;
  handleExpandableInteraction: (page: Page) => Promise<void>;
  extractQuizData: (page: Page, pageType: PageType) => Promise<QuizRequest>;
  applyQuizAnswer: (page: Page, answer: QuizAnswer) => Promise<void>;
  handleFeedbackPage: (page: Page) => Promise<void>;
  handleQuizFailure: (page: Page) => Promise<void>;
  handleQuizTransition: (page: Page) => Promise<void>;
}

export interface BrowserSession {
  context: BrowserContext;
  trainingPage: Page | null;
}
