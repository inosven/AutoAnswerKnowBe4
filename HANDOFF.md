# KnowBe4 Training Auto-Completer - Handoff Document

## Overview

Build an automation tool for completing KnowBe4 security awareness training. The system has two parts:

1. **Playwright Script** - runs in a regular terminal, handles all browser automation
2. **Claude Code Answer Loop** - runs in Claude Code, watches for quiz questions, reads screenshots, writes answers

The two parts communicate through the filesystem (file-based IPC).

---

## Architecture

```
┌─────────────────────┐         ┌─────────────────────┐
│   Regular Terminal   │         │     Claude Code      │
│                      │         │                      │
│  Playwright Script   │  files  │   Answer Loop        │
│  (browser control)   │◄──────►│   (read quiz, write  │
│                      │         │    answers)          │
└─────────────────────┘         └─────────────────────┘
        │                                │
        ▼                                ▼
   Browser Window                 quiz-data/ folder
   (KnowBe4 training)            (screenshots, text,
                                   answer files)
```

### File-based IPC Protocol

All communication files go in a `quiz-data/` folder in the project root.

**When Playwright encounters a quiz:**
1. Writes `quiz-data/quiz-request.json` with the quiz info
2. If DOM text extraction fails, saves `quiz-data/quiz-screenshot.png`
3. Polls for `quiz-data/quiz-answer.json` every 2 seconds

**quiz-request.json format:**
```json
{
  "id": "q-1717000000000",
  "timestamp": "2026-03-23T10:00:00Z",
  "type": "single-choice | multi-choice | dropdown",
  "domText": {
    "question": "Which of the following is a way to prevent money laundering?",
    "options": [
      "Never do business with new customers.",
      "Conduct business only with customers involved in legitimate business activities...",
      "Money laundering is rare, so the need to be alert is very low.",
      "None of the above."
    ],
    "dropdowns": null
  },
  "hasScreenshot": false,
  "quizProgress": "1/5",
  "pageUrl": "https://training.knowbe4.com/modstore/scorm/..."
}
```

If DOM extraction fails (domText fields are empty/null), set `hasScreenshot: true` and save screenshot.

For dropdown type quizzes:
```json
{
  "domText": {
    "question": "Read the following scenario: ...",
    "options": null,
    "dropdowns": [
      {
        "label": "Can you provide documentation verifying your identity?",
        "options": ["Not effective", "Somewhat effective", "Very effective"]
      },
      {
        "label": "What else are you interested in purchasing?",
        "options": ["Not effective", "Somewhat effective", "Very effective"]
      }
    ]
  }
}
```

**quiz-answer.json format:**
```json
{
  "id": "q-1717000000000",
  "type": "single-choice",
  "selections": [1]
}
```
- For single-choice/multi-choice: `selections` is array of 0-based option indices
- For dropdown: `selections` is array of 0-based option indices for each dropdown in order

**After Playwright processes the answer:**
- Deletes both `quiz-request.json` and `quiz-answer.json`
- Moves screenshot to `quiz-data/history/` with timestamp for reference

---

## Tech Stack

- Node.js + TypeScript
- Playwright (chromium)
- No external API calls (Claude Code handles the AI part)

---

## Playwright Script Details

### Entry Point

`npm start` launches the script. It should:

1. Launch Chromium in headed mode (must be visible for SCORM content)
2. Navigate to `https://training.knowbe4.com/`
3. Print message: "Please login and click Start on a training module. Press Enter when ready."
4. Wait for Enter keypress
5. Detect the new SCORM window that opened
6. Begin the automation loop on that window

### Page Detection & Handling

The script runs a continuous loop, detecting what type of page it's on and acting accordingly. All training content is inside a SCORM window at URL pattern: `training.knowbe4.com/modstore/scorm/*`

**Page Type Detection Strategy:**

The training is rendered as a SCORM package. The content is likely inside the main page or an iframe. The script needs to check both.

Detection should be based on what elements are visible on the page:

| Page Type | Detection Signals | Action |
|-----------|------------------|--------|
| Trademark popup | Dialog/modal with "Close" button, text contains "trademarks" | Click "Close" button |
| Content/Article page | Large text content area, no quiz elements, `>` nav arrow visible | Try to expand all accordion/collapsible sections, then click `>` |
| Video page (playing) | `<video>` element present, or iframe with video | Wait for video to end |
| Video page (finished) | "Replay" and "Next" buttons visible | Click "Next" |
| Expandable interaction page | Multiple play buttons (▶) with items to click through | **PAUSE** - play a beep sound, print "Manual interaction needed. Press Enter when done.", wait for Enter |
| Quiz page (radio/checkbox) | Radio buttons or checkboxes with question text | Extract quiz data, write quiz-request.json, wait for answer |
| Quiz page (dropdown) | `<select>` elements with question text | Extract quiz data, write quiz-request.json, wait for answer |
| Quiz transition page | Nearly empty page with only "Next" button, progress indicator (e.g. "2/5") | Click "Next" |
| Feedback page | Text containing "feedback", "correct answer", green/red indicators | Extract feedback data, save to history, click `>` or "Next" |
| Quiz failure page | Text containing "Not quite" or "Redo Quiz" button | Click "Redo Quiz" |
| Quiz success/completion page | Text containing "Congratulations" or "completed" or a checkmark | Print success message, notify user |
| Unknown | None of the above | Wait 3 seconds, retry detection |

### Content Page Handling

Some content pages have collapsible/accordion sections that must all be expanded before the `>` (next) button becomes active.

Strategy:
1. Look for elements that look like expandable headers (common patterns: elements with `+`, `▶`, or "click to expand" type attributes, accordion patterns)
2. Click each one and wait briefly
3. Check if the `>` navigation arrow is enabled/clickable
4. If not, wait and retry
5. If yes, click `>`

### Video Handling

Videos may appear in two ways:
- Embedded directly in a page section (part of accordion content)
- As a full page with video player

For full-page videos:
1. Wait for "Replay" and/or "Next" button to appear (this means video is done)
2. Click "Next"

The video player has a speed control (1x button). Optionally try to set it to 2x to speed things up.

After clicking "Next" on video, also check if page-level `>` arrow needs to be clicked.

### Quiz Handling

**Step 1: Detect quiz type**
- Has `<input type="radio">` -> single-choice
- Has `<input type="checkbox">` -> multi-choice
- Has `<select>` elements -> dropdown

**Step 2: Try DOM text extraction**

Try to extract question text and option text from the DOM.

Check if the content is inside an iframe first. SCORM packages often use iframes.

For radio/checkbox quizzes:
- Find the question text (usually in a heading, or a prominent text element)
- Find all option labels (associated with radio/checkbox inputs)
- Find progress indicator (e.g. "1/5")

For dropdown quizzes:
- Find the scenario/question text
- Find all `<select>` elements
- For each `<select>`, find its label text and all `<option>` values
- Ignore the placeholder option ("Select your response.")

**Step 3: Evaluate DOM extraction quality**

If the extracted question text is too short (< 10 characters) or options are empty, DOM extraction probably failed (content is rendered as image). In this case, take a screenshot.

**Step 4: Write quiz-request.json**

Write the quiz data to `quiz-data/quiz-request.json`. If DOM failed, also save screenshot to `quiz-data/quiz-screenshot.png`.

**Step 5: Poll for answer**

Check for `quiz-data/quiz-answer.json` every 2 seconds. Timeout after 5 minutes (configurable).

**Step 6: Apply answer**

Read the answer file. Based on quiz type:

For single-choice (radio):
- Click the radio button at the specified index

For multi-choice (checkbox):
- Click each checkbox at the specified indices

For dropdown:
- For each select element, choose the option at the specified index

**Step 7: Submit**

Click the "Submit" button. Wait for page transition.

**Step 8: Handle post-submit**

After submit, the page shows a transition page with just "Next" button. Click "Next" to proceed to the next question or to the results page.

**Step 9: Cleanup**

Delete `quiz-request.json` and `quiz-answer.json`. Move any screenshots to `quiz-data/history/`.

### Feedback/Results Handling

After all quiz questions are answered, a feedback or results page appears.

**For inline quiz feedback (during training):**
- May show correct/incorrect indicators
- Extract any feedback text and save to `quiz-data/history/feedback-{timestamp}.json`
- This is useful for learning correct answers if quiz needs to be retaken
- Click `>` to continue

**For final quiz results:**
- If passed: detect success indicators, print congratulations message
- If failed: detect "Redo Quiz" button or "Not quite" text
  - Save the feedback/score to `quiz-data/history/`
  - Automatically click "Redo Quiz"
  - Continue the quiz loop

### Navigation

The main navigation uses `<` and `>` arrow buttons at the bottom-left and bottom-right of the page. These are outside the main content area.

Important notes:
- The `>` button may be disabled until all required interactions on the page are complete (videos watched, sections expanded)
- After clicking `>`, wait for page content to change before continuing the detection loop
- Some pages don't have `>` arrows (like quiz pages, which use Submit instead)

### Error Recovery

- If a page takes too long to load (>30s), take a screenshot and log the issue
- If an element can't be found, wait and retry up to 3 times
- If the script gets stuck, it should print a message asking for manual intervention and wait for Enter
- Keep a log file at `quiz-data/automation.log`

---

## Claude Code Answer Loop

This is NOT part of the codebase. This is what Claude Code does at runtime.

When the user starts the answer loop in Claude Code, Claude Code should:

1. Watch `quiz-data/quiz-request.json` for new quiz requests
2. When a request appears:
   a. Read `quiz-request.json`
   b. If `hasScreenshot` is true, view `quiz-data/quiz-screenshot.png`
   c. Determine the correct answer(s) based on the question and options
   d. Write `quiz-data/quiz-answer.json` with the answer
3. Repeat until user stops

The user will start this by telling Claude Code something like:
"Start the answer loop for KnowBe4 training. Watch the quiz-data folder and answer any quiz questions that appear."

Claude Code will then run a bash loop like:
```bash
while true; do
  if [ -f quiz-data/quiz-request.json ]; then
    cat quiz-data/quiz-request.json
    # Claude Code reads this, thinks, then writes the answer
    break
  fi
  sleep 2
done
```

Then Claude Code views the file, reasons about the answer, writes the answer file, and starts the loop again. Each iteration is a separate Claude Code action.

---

## Project Structure

```
knowbe4-auto/
├── package.json
├── tsconfig.json
├── .gitignore
├── README.md
├── quiz-data/              # IPC folder (gitignored)
│   ├── history/            # Past quiz screenshots and feedback
│   ├── quiz-request.json   # Current quiz question (written by script)
│   ├── quiz-screenshot.png # Screenshot if DOM fails (written by script)
│   └── quiz-answer.json    # Answer from Claude Code
└── src/
    ├── main.ts             # Entry point, orchestration loop
    ├── config.ts           # Configuration
    ├── browser.ts          # Playwright browser management
    ├── detector.ts         # Page type detection
    ├── navigator.ts        # Content page navigation (expand sections, click arrows)
    ├── video-handler.ts    # Video wait and skip logic
    ├── quiz-handler.ts     # Quiz detection, extraction, answer application
    ├── quiz-ipc.ts         # File-based IPC (write request, poll answer)
    └── logger.ts           # Logging utility
```

---

## Key Implementation Notes

1. **SCORM iframe**: KnowBe4 training content is loaded as a SCORM package. The actual content might be inside an iframe. The script should check for iframes and switch context if needed. Use `page.frameLocator()` or `page.frames()` to access iframe content.

2. **New window detection**: When user clicks "Start" on dashboard, a new window opens. Use `context.on('page')` to detect it, or `context.pages()` to find it. The training window URL contains `/modstore/scorm/`.

3. **Headed mode is required**: The SCORM content likely needs a visible browser window. Always launch with `headless: false`.

4. **No API key needed**: The script does NOT call any AI API. All AI reasoning happens in Claude Code's separate session.

5. **Sound notification**: When the script needs manual intervention (expandable interaction pages), play a system beep to alert the user. On Windows, use `\x07` character or `powershell -c "[console]::beep(1000,500)"` in a child process. Note: user cannot use PowerShell directly, so use the `\x07` terminal bell character instead.

6. **Quiz answer timeout**: If no answer appears within 5 minutes, log a warning and wait for manual intervention.

7. **Robust selectors**: KnowBe4 training modules vary in HTML structure. Use flexible selectors. Try multiple strategies for finding elements. Log what was found/not found for debugging.

8. **Page transition detection**: After clicking any button (Submit, Next, `>`), wait for the page content to actually change before continuing the loop. Use `page.waitForTimeout(1500)` as minimum, plus check for DOM changes.

9. **Screenshot for Claude Code**: When taking screenshots, capture the main content area, not the entire page with the blurred background. This gives Claude Code a cleaner image to analyze.

10. **Windows compatibility**: The user runs Windows. Use path separators that work on Windows. The `quiz-data/` paths should use forward slashes (Node.js handles this fine on Windows).

---

## Running the System

### Step 1: Install dependencies
```bash
cd knowbe4-auto
npm install
npx playwright install chromium
```

### Step 2: Start the Playwright script (in regular terminal)
```bash
npm start
```
- Browser opens, user logs into KnowBe4
- User clicks Start on a training module
- User presses Enter in terminal
- Script takes over

### Step 3: Start the answer loop (in Claude Code)
Tell Claude Code:
"Start watching the quiz-data folder in the knowbe4-auto project. When a quiz-request.json appears, read it (and the screenshot if present), determine the answer, and write quiz-answer.json. Keep looping until I tell you to stop."

---

## Quiz Answer Strategy for Claude Code

When Claude Code answers quiz questions, it should follow these principles:

- These are security awareness training questions
- The correct answer typically promotes safe, cautious, security-conscious behavior
- For phishing topics: report/delete suspicious emails, don't click links, verify through official channels
- For password topics: strong unique passwords, MFA, don't share credentials
- For social engineering: verify identity through official channels, don't give out information
- For data protection: encrypt sensitive data, follow company policy, report breaches
- For money laundering: know your customer, verify legitimate business, report suspicious activity
- For ethics/code of conduct: follow company policy, report violations, act with integrity
- When unsure, pick the most cautious/conservative option
