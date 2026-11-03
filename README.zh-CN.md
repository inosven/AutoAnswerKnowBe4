# KnowBe4 自动答题器

[English](README.md) | **中文**

用 Playwright 脚本自动翻页 KnowBe4 安全意识培训，再配合一个 [Claude Code](https://claude.com/claude-code) 会话回答测验题。

两边只通过 `quiz-data/` 里的文件通信。脚本本身不调用任何 AI API。

> **免责声明：** 这是一个关于浏览器自动化和"基于文件的 Agent 协作"的个人实验。合规培训的本意是让**你自己**掌握这些内容。使用前请确认所在公司的规定和 KnowBe4 的服务条款，使用后果自负。

---

## 工作原理

```
┌──────────────────────┐   quiz-request.json   ┌──────────────────────┐
│  Playwright 脚本     │ ────────────────────► │  Claude Code 会话    │
│  (npm start)         │                       │  (答题循环)          │
│  控制浏览器          │ ◄──────────────────── │  选出答案            │
└──────────────────────┘   quiz-answer.json    └──────────────────────┘
```

1. 脚本打开一个可见的 Chromium 窗口，进入 `training.knowbe4.com`。你登录，然后点某个课程的 **Start**。
2. 脚本找到 SCORM 培训窗口，然后循环：识别页面类型，执行对应操作，再识别下一页。
   - 内容页：展开各个区块，点 `>`。
   - 视频页：等视频放完，点 **Next**。
   - 测验页：提取题目和选项，写入 `quiz-data/quiz-request.json`，然后轮询 `quiz-data/quiz-answer.json`。
   - 未通过页：点 **Redo Quiz**。
3. Claude Code 里的答题循环等到请求文件出现，选出答案，写入答案文件。脚本读到后点选该项并提交。

答题循环的说明和文件格式见 [ANSWER_LOOP.md](ANSWER_LOOP.md)，最初的设计文档见 [HANDOFF.md](HANDOFF.md)。

## 环境要求

- **Node.js 18 或以上。** 版本太旧（比如 Node 8）会在 ts-node 里直接报 `SyntaxError: Unexpected token {`。
- Claude Code，在本项目目录下运行。
- 一个分配了培训课程的 KnowBe4 账号。

## 安装

```bash
npm install
npx playwright install chromium
```

## 使用

**终端 1：浏览器脚本**

```bash
npm start
```

登录，点课程的 **Start**，然后回到终端按回车。

**终端 2：Claude Code**

```
Read ANSWER_LOOP.md and start the answer loop.
```

脚本遇到需要你处理的情况时，会打印提示并等你按回车。比如碰到处理不了的页面、等答案超时，或者连续太多页识别不出来。

## 目录结构

```
src/
├── main.ts                    # 入口和主循环
├── config.ts                  # 超时设置、起始 URL
├── core/
│   ├── logger.ts              # 写 quiz-data/automation.log
│   ├── quiz-ipc.ts            # 请求/答案文件交换
│   └── types.ts               # 公共类型和 SiteAdapter 接口
└── sites/knowbe4/             # KnowBe4 专用的页面识别和操作
    ├── adapter.ts
    ├── detector.ts
    ├── navigator.ts
    ├── quiz-handler.ts
    └── video-handler.ts
quiz-data/                     # 运行时文件（已 gitignore）
```

要支持别的培训网站，在 `src/sites/` 下新建一个 adapter，然后在 `main.ts` 里注册。

## 局限性

以下问题都是实际使用中遇到过的。

**页面识别**
- **交互式情景页会被误判成测验。** 在带标签页或点击展开的情景页上，脚本可能把界面控件（音频开关、"static button"、标签页标题）当成选项。答题循环得自己发现这种情况、拒绝作答，然后由你手动完成这一页。
- **误判成"过渡页"后原地打转。** 识别器有时会一直把某页当成测验过渡页，可页面上并没有 **Next** 按钮。它会立刻重试、不做退避，日志能一下涨几千行（4 MB 以上），直到你手动翻过这一页。
- **展开/点击类互动页不会自动处理。** 脚本会响铃提示，然后等你操作。
- **选择器只针对测试过的课程调过。** 不同 KnowBe4 课程的 HTML 结构不一样，遇到新课程可能要改 `detector.ts` 和 `quiz-handler.ts`。

**题目提取**
- **情景描述经常丢失。** 有时抓到的"题目"只是课程标题，选项所指的那段故事没抓到，Claude 只能根据选项本身推断。
- **截图兜底只能发现明显的失败。** 只有题目太短或没有选项时才会截图。抓到的文本很长但内容不对，它发现不了。
- **`quizProgress` 不可靠。** 会出现 `135 / 13` 这样的值，不能当真。

**答题**
- **答案不保证正确。** 答题循环倾向于选最谨慎、最"按规矩"的那个选项。这在合规培训里通常是对的，但不总是。
- **不会从反馈中学习。** 反馈页会存到 `quiz-data/history/`，但不会回传给答题循环。答错了只能等课程让你重做测验时再改。
- **Claude Code 必须一直开着并保持响应。** 5 分钟内没收到答案，脚本就会停下来等你按回车。

**运行环境**
- 只在 Windows 上开发和测试过，Chromium 必须以有界面模式运行。登录（包括 SSO 和 MFA）一律手动。
- 一次只能处理一个培训窗口。
- 没有自动化测试。

## 隐私

`quiz-data/` 里有运行日志、截图、题目文本，以及带个人 SCORM ID 的培训 URL。这个目录已经在 `.gitignore` 里，不要把它提交上去。

## 许可证

MIT
