# JetBrains Git Branches

[English](README.md) | 简体中文

JetBrains Git Branches 是一个面向 JetBrains 用户迁移到 VS Code/Cursor 的 Git 分支管理插件，适合习惯 IntelliJ IDEA、PhpStorm、PyCharm 分支操作方式的开发者。

它把 JetBrains IDE 中常用的 Git 分支树和分支右键操作带到 VS Code/Cursor 的“源代码管理”侧边栏：按目录浏览本地/远程分支、提取所有远程、签出分支、从分支新建分支、把目标分支合并到当前分支、删除分支，并在冲突时复用 VS Code Merge Editor。

这个插件不是完整 Git 客户端替代品，而是专注补齐 JetBrains 用户每天最常用的分支工作流。

## 功能

- JetBrains 风格的本地/远程分支树。
- 按 `/` 自动拆分多级目录，例如 `origin/feature/demo` 会显示为 `origin > feature > demo`。
- `提取所有远程`，等价于 `git fetch --all`。
- `签出`，支持本地分支和远程 tracking 分支。
- `从此新建分支...`，从选中分支创建新分支并切换过去；从远程分支新建时仅把远程分支作为起点，不保留 upstream 跟踪关系。
- `合并到当前分支`，把选中分支合并进当前分支。
- `删除分支`，确认后删除本地分支或远程分支。
- 签出/新建分支遇到未跟踪文件覆盖风险时，支持先备份冲突文件再重试。
- 合并产生冲突时，自动打开 VS Code Merge Editor 进行可视化处理。
- 支持在自动、简体中文、英文之间切换插件界面语言。

## 使用方式

1. 用 VS Code 或 Cursor 打开一个 Git 仓库目录。
2. 打开左侧“源代码管理”，找到 `JetBrains Git Branches` 视图。
3. 展开 `本地分支` 或 `远程分支`。
4. 右键分支执行常用操作：`签出`、`从此新建分支...`、`合并到当前分支`、`删除分支`。
5. 点击视图标题栏的 `提取所有远程` 按钮，执行 `git fetch --all`。

## 语言设置

可以通过 `JetBrains Git Branches: Language` 设置切换插件语言：

- `auto`：跟随 VS Code 或 Cursor 显示语言。
- `zh-CN`：使用简体中文。
- `en`：使用英文。

该设置会影响分支树标签、右键菜单、通知和输出面板文案。

设置优先级遵循 VS Code/Cursor 规则：

```text
工作区设置 > 用户设置 > 插件默认值
```

如果你在“用户”里设置了中文，但当前项目仍然显示英文，请检查当前仓库的 `.vscode/settings.json` 是否有工作区覆盖，例如：

```json
{
  "jetBrainsGitBranches.language": "en"
}
```

如果想全局跟随用户设置，删除这条工作区配置即可；如果只想当前项目生效，把它改成 `zh-CN` 或 `en`。修改后如果树没有立刻刷新，可以执行 `Developer: Reload Window`。

注意：`JetBrains Git Branches` 这个视图标题属于 VS Code/Cursor 静态扩展声明，不能通过运行时语言设置动态切换。

## JetBrains 工作流映射

| JetBrains 操作 | VS Code/Cursor 插件操作 |
| --- | --- |
| Fetch All Remotes | `提取所有远程` |
| Checkout | `签出` |
| 从选中分支新建分支 | `从此新建分支...` |
| 将选中分支合并到当前分支 | `合并到当前分支` |
| 删除分支 | `删除分支` |
| 可视化冲突处理 | VS Code Merge Editor |

## 环境要求

- VS Code 1.85.0 或更高版本，或兼容版本的 Cursor。
- 已安装 Git，并且 Git 可在 `PATH` 中访问。
- 当前工作区需要包含 Git 仓库。

## 本地打包

生成本地 VSIX 包：

```bash
npx @vscode/vsce package --allow-missing-repository
```

安装生成的 VSIX：

```bash
code --install-extension git-branches-viewer-0.0.3.vsix
```

Cursor 安装：

```bash
cursor --install-extension git-branches-viewer-0.0.3.vsix --force
```

## 发布说明

发布到 Visual Studio Marketplace 前：

- 执行 `npx @vscode/vsce package` 并验证生成的 `.vsix`。
- 执行 `npx @vscode/vsce login chengxs1994`。
- 执行 `npx @vscode/vsce publish`。

## 许可证

MIT
