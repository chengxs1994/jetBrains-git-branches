# JetBrains Git Branches

English | [简体中文](README.zh-CN.md)

JetBrains Git Branches is a VS Code extension for developers who miss the branch workflow from JetBrains IDEs such as IntelliJ IDEA, PhpStorm, and WebStorm.

It brings a familiar branch tree and common branch actions into the VS Code Source Control sidebar: browse local and remote branches as folders, fetch all remotes, checkout branches, create a branch from another branch, merge a selected branch into the current branch, and resolve conflicts with VS Code Merge Editor.

This extension is not a full Git client replacement. It focuses on the branch operations JetBrains users tend to use every day.

## Features

- JetBrains-style branch tree for local and remote branches.
- Multi-level branch folders split by `/`, for example `origin/feature/demo` becomes `origin > feature > demo`.
- Fetch all remotes with `git fetch --all`.
- Checkout local branches and remote tracking branches.
- Create a new branch from any selected branch.
- Merge a selected branch into the current branch.
- Back up untracked files before checkout when Git reports an overwrite risk.
- Open VS Code Merge Editor when merge conflicts are produced.

## Usage

1. Open a Git repository folder in VS Code.
2. Open the Source Control sidebar and find the `Git Branches` view.
3. Expand `本地分支` or `远程分支`.
4. Right-click a branch to use branch actions: `签出`, `从此新建分支...`, or `合并到当前分支`.
5. Click `提取所有远程` in the view title bar to fetch all remotes.

## JetBrains Workflow Mapping

| JetBrains action | VS Code plugin action |
| --- | --- |
| Fetch All Remotes | `提取所有远程` |
| Checkout | `签出` |
| New Branch from Selected | `从此新建分支...` |
| Merge selected branch into current | `合并到当前分支` |
| Visual conflict resolution | VS Code Merge Editor |

## Requirements

- VS Code 1.85.0 or later.
- Git must be installed and available on `PATH`.
- The current workspace should contain a Git repository.

## Packaging

Build a local VSIX package:

```bash
npx @vscode/vsce package --allow-missing-repository
```

Install the generated VSIX locally:

```bash
code --install-extension git-branches-viewer-0.0.1.vsix
```

## Publishing Notes

Before publishing to Visual Studio Marketplace:

- Replace `publisher` in `package.json` with your real Marketplace publisher ID.
- Add a real `repository` URL after the code is hosted on GitHub or another public Git service.
- Run `npx @vscode/vsce package` and verify the generated `.vsix`.

## License

MIT
