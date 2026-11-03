import { Page } from 'playwright';
import { logInfo, logError } from '../../core/logger';
import { resolveContentFrame } from './detector';

const VIDEO_POLL_INTERVAL_MS = 3000;
const VIDEO_MAX_WAIT_MS = 30 * 60 * 1000;

export async function handleKnowBe4VideoPlaying(page: Page) {
  logInfo('VIDEO', 'Waiting for video to finish...');
  const content_frame = await resolveContentFrame(page);

  await trySetVideoSpeed(content_frame);

  const start_time = Date.now();
  while (Date.now() - start_time < VIDEO_MAX_WAIT_MS) {
    const replay_btn = await content_frame.locator('button:has-text("Replay"), [aria-label="Replay"]').count();
    const next_btn = await content_frame.locator('button:has-text("Next"), a:has-text("Next")').count();

    if (replay_btn > 0 || next_btn > 0) {
      logInfo('VIDEO', 'Video finished (Replay/Next button visible)');
      return;
    }

    const video_elements = content_frame.locator('video');
    const video_count = await video_elements.count();
    if (video_count > 0) {
      const video_ended = await video_elements.first().evaluate((el: HTMLVideoElement) => el.ended || el.paused);
      if (video_ended) {
        logInfo('VIDEO', 'Video element ended/paused');
        return;
      }
    }

    await page.waitForTimeout(VIDEO_POLL_INTERVAL_MS);
  }

  logError('VIDEO', 'Timed out waiting for video to finish');
}

export async function handleKnowBe4VideoFinished(page: Page) {
  logInfo('VIDEO', 'Video finished — clicking Next');
  const content_frame = await resolveContentFrame(page);

  const next_btn = content_frame.locator('button:has-text("Next"), a:has-text("Next")');
  const next_count = await next_btn.count();
  if (next_count > 0) {
    const is_enabled = await next_btn.first().isEnabled();
    const is_visible = await next_btn.first().isVisible();
    if (is_enabled && is_visible) {
      await next_btn.first().click();
      logInfo('VIDEO', 'Clicked Next after video');
      await page.waitForTimeout(2000);
      return;
    }
    logInfo('VIDEO', 'Next button found but disabled/hidden — waiting for it to become active');
    await next_btn.first().waitFor({ state: 'visible', timeout: 60000 });
    await next_btn.first().click();
    logInfo('VIDEO', 'Clicked Next after video (waited for enable)');
    await page.waitForTimeout(2000);
    return;
  }

  const next_arrow = content_frame.locator('button:has-text(">"), [aria-label="Next"], .nav-next');
  const arrow_count = await next_arrow.count();
  if (arrow_count > 0) {
    await next_arrow.first().click();
    logInfo('VIDEO', 'Clicked next arrow after video');
    await page.waitForTimeout(2000);
  }
}

async function trySetVideoSpeed(frame: Page) {
  try {
    const video_elements = frame.locator('video');
    const video_count = await video_elements.count();
    if (video_count == 0) return;

    await video_elements.first().evaluate((el: HTMLVideoElement) => {
      el.playbackRate = 2.0;
    });
    logInfo('VIDEO', 'Set video playback rate to 2x');
  } catch {
    logInfo('VIDEO', 'Could not set video speed (non-critical)');
  }
}
