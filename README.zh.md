# Context Canary 🐤

**一只像素风金丝雀：Claude Code 忘记你的指令时它就会死掉，然后自动压缩上下文，再把它救活。**

[English](README.md) · [Español](README.es.md) · MIT · Claude Code mod · **已在 Claude Code 2.1.293 上测试**

<p align="center"><img src="media/demo.gif" alt="每条回复都以 🐤 开头时金丝雀活着；某条回复漏掉它，金丝雀死去，会话自动压缩，金丝雀复活" width="800"></p>

<p align="center"><a href="media/context-canary-demo.mp4">▶ 观看 21 秒带声音的演示</a></p>

```sh
claude plugin marketplace add Nachx639/context-canary
claude plugin install context-canary@context-canary
```

然后开一个新会话，执行 `/canary setup`。⭐ **如果它帮你救回过一次会话，点个 star 能让更多人发现它。**

## 为什么需要它

Claude Code 用久了，前面写进 `CLAUDE.md` 的约束有没有被忘掉，单看回复很难发现。
这就是“矿井里的金丝雀”：Context Canary 让一条指令变得可见。每条最终回复都必须以一个
标记开头（默认是 `🐤`）。只要回复带着它，输入框上方笼子里的小鸟就活着；一旦漏掉，
小鸟死去，会话会自动压缩并保留你的指令，然后小鸟复活。

漏掉标记是**报警信号**，不代表上下文一定丢失，也不能精确测量剩余上下文；压缩之后也不保证
下一条回复一定遵守规则。

## 检查点：抽查整个文件

金丝雀活着只能证明写着规则的那一行还在，不能证明 `CLAUDE.md` 的其余部分还在。把
`checkpoints` 设为 1–5 并执行 `/canary setup`：它会把规则放到文件末尾，并在文件约 25 %、
50 %、75 % 处的标题前放入校验词，例如 `> context-canary checkpoint 2/3: maple`。之后每条
回复都要以 `🐤 comet maple river` 这样的形式开头。规则本身从不列出这些词，所以只有当文件的
那些部分仍在上下文中时，回复才能带上它们。缺了哪个，金丝雀就会死，并告诉你是哪一部分：
*missing checkpoint 2 (before "Testing")*。`/canary remove` 会删除规则和所有检查点。

每次会话开始时，校验词都会从文件中重新读取，所以无论在哪个项目里，检查的都正是 Claude
收到的内容。

## 项目里的 CLAUDE.md

把 `target` 设为 `project`，`/canary setup` 就会把规则（和检查点）写进当前项目根目录的
`CLAUDE.md`，而不是 `~/.claude/CLAUDE.md`。两个文件里的检查点总是都会被检查；丢失的是
项目文件里的检查点时，提示里会注明。

## 死亡记录

`/canary log` 按时间倒序列出最近的死亡：什么时候、哪个项目、第几条回复、结果如何（压缩后
复活、手动复活、会话被锁定、仍然死亡）、缺了哪些检查点，以及那条回复的开头。最多保留 30 条，
跨会话保存在插件自己的存储里，方便你分辨偶尔的失误和某个项目反复丢指令的情况。

## 安装

```sh
claude plugin marketplace add Nachx639/context-canary
claude plugin install context-canary@context-canary
```

在新的交互式会话里执行 `/canary setup`。它会先展示要写入的规则，并在修改
`~/.claude/CLAUDE.md`（或 `target: project` 时项目的 `CLAUDE.md`）之前请求你确认。加载
插件本身不会修改任何文件。如果规则是在已有会话中添加的，请开一个新会话让 Claude Code 读取它。

## 配置

这些选项会出现在 Claude Code 的 `/config` 面板里。

| 选项 | 默认值 | 含义 |
| --- | --- | --- |
| `word` | `🐤` | 每条最终回复开头的标记，单行，最多 64 个字符。 |
| `autoCompact` | `true` | 死亡后自动压缩；`false` 只提醒。 |
| `cooldownMinutes` | `30` | 自动压缩成功后，若在这么多分钟内再次死亡，就锁定自动恢复。`0` 关闭这个窗口。 |
| `language` | `en` | 界面语言：`en` 或 `es`。 |
| `size` | `small` | 金丝雀大小：`tiny`、`small`、`normal` 或 `large`。 |
| `info` | `none` | 笼子旁边的文字：`none`（只有小鸟）、`status` 或 `details`。 |
| `checkpoints` | `0` | 1–5：在 `CLAUDE.md` 中分布校验词，抽查整个文件。 |
| `target` | `global` | `/canary setup` 和 `/canary remove` 修改的文件：`global` 或 `project`。 |

修改 `word` 后，请再次执行 `/canary setup` 更新规则。匹配时忽略大小写和重音，允许前面有
粗体、引号、标点和 emoji。

## 命令

| 命令 | 作用 |
| --- | --- |
| `/canary` | 显示之前的状态，然后复活并重置计数。 |
| `/canary status` | 只查看状态，不做修改。 |
| `/canary log` | 跨会话的最近死亡记录。 |
| `/canary revive` | 复活并重置计数，保留冷却时间和锁定。 |
| `/canary setup` | 确认后添加或更新受管理的规则。 |
| `/canary remove` | 确认后只删除受管理的规则块和检查点。 |

只检查交互式主会话的最终回复；子代理、被中断的回合、工具中间步骤和 `claude -p` 都不会触发。
没有声音，不发网络请求。完整说明见 [英文 README](README.md)。
