# KnowBe4 Auto-Completer

**English** | [中文](README.zh-CN.md)

A Playwright script that clicks through KnowBe4 security-awareness training modules, paired with a [Claude Code](https://claude.com/claude-code) session that answers the quiz questions.

The two halves communicate only through files in `quiz-data/`. The script never calls an AI API itself.

> **Disclaimer:** This is a personal experiment in browser automation and file-based agent coordination. Compliance training exists so that *you* learn the material. Check your organization's policy and the KnowBe4 terms of service before using it. You are responsible for how you use it.

---

## How it works

```
┌──────────────────────┐   quiz-request.json   ┌──────────────────────┐
│  Playwright script   │ ────────────────────► │  Claude Code session │
│  (npm start)         │                       │  (answer loop)       │
│  drives the browser  │ ◄──────────────────── │  picks the answer    │
└──────────────────────┘   quiz-answer.json    └──────────────────────┘
```

1. The script opens a visible Chromium window at `training.knowbe4.com`. You log in and click **Start** on a module.
2. It finds the SCORM training window, then loops: detect the page type, act on it, repeat.
   - Content pages: expand sections and click `>`.
   - Videos: wait for them to finish, then click **Next**.
   - Quiz pages: extract the question and options, write `quiz-data/quiz-request.json`, and poll for `quiz-data/quiz-answer.json`.
   - Failure pages: click **Redo Quiz**.
3. In Claude Code, the answer loop waits for a request, picks an answer, and writes the answer file. The script then clicks the choice and submits.

See [ANSWER_LOOP.md](ANSWER_LOOP.md) for the answer-loop instructions and file formats. See [HANDOFF.md](HANDOFF.md) for the original design document.

## Requirements

- **Node.js 18 or later.** Older versions such as Node 8 fail immediately with `SyntaxError: Unexpected token {` inside ts-node.
- Claude Code, running in this project folder.
- A KnowBe4 account with an assigned training.

## Setup

```bash
npm install
npx playwright install chromium
```

## Usage

**Terminal 1: the browser script**

```bash
npm start
```

Log in, click **Start** on a training module, then press Enter in the terminal.

**Terminal 2: Claude Code**

```
Read ANSWER_LOOP.md and start the answer loop.
```

The script prints a message and waits for Enter whenever it needs you: a page it can't handle, an answer that timed out, or too many unknown pages in a row.

## Project layout

```
src/
├── main.ts                    # Entry point and main loop
├── config.ts                  # Timeouts and start URL
├── core/
│   ├── logger.ts              # Writes quiz-data/automation.log
│   ├── quiz-ipc.ts            # Request/answer file exchange
│   └── types.ts               # Shared types and the SiteAdapter interface
└── sites/knowbe4/             # KnowBe4-specific detection and actions
    ├── adapter.ts
    ├── detector.ts
    ├── navigator.ts
    ├── quiz-handler.ts
    └── video-handler.ts
quiz-data/                     # Runtime files (gitignored)
```

To support another training site, add an adapter under `src/sites/` and register it in `main.ts`.

## Limitations

These all came up in real use.

**Page detection**
- **Interactive scenario pages are misread as quizzes.** On tabbed or click-to-reveal scenario pages, the script can grab UI controls (audio toggle, "static button", tab titles) as answer options. The answer loop has to spot this and refuse to answer, and you then finish the page by hand.
- **False "transition page" loops.** The detector sometimes keeps classifying a page as a quiz transition even though there's no **Next** button. It retries immediately with no back-off, so the log can grow by thousands of lines (4 MB+) until you advance the page by hand.
- **Expandable / click-through interactions are not automated.** The script beeps and waits for you.
- **Selectors are tuned to the modules tested.** KnowBe4 modules differ in their HTML. A new module may need selector changes in `detector.ts` and `quiz-handler.ts`.

**Quiz extraction**
- **The scenario text is often missing.** Sometimes the "question" captured is just the module title, and the story the options refer to is lost. Claude then has to guess from the options alone.
- **Screenshot fallback only catches obvious failures.** It triggers when the question text is very short or there are no options. Long but wrong extracted text gets through.
- **`quizProgress` is unreliable.** It produces values like `135 / 13` and shouldn't be trusted.

**Answering**
- **Answers are not guaranteed correct.** The answer loop leans toward the most cautious, "by-the-book" option. That usually matches compliance training, but not always.
- **No learning from feedback.** Feedback pages are saved to `quiz-data/history/` but not fed back into the answer loop. A wrong answer is only fixed when the module makes you redo the quiz.
- **Claude Code has to be running and attentive.** If no answer arrives within 5 minutes, the script stops and waits for Enter.

**Environment**
- Built and tested only on Windows, with Chromium in headed mode. Login (including SSO and MFA) is always manual.
- Only one training window at a time.
- No automated tests.

## Privacy

`quiz-data/` holds runtime logs, screenshots, question text, and training URLs that include per-user SCORM IDs. It is in `.gitignore`. Keep it out of commits.

## License

MIT
