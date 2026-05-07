# JetBrains Git Branches

English | [简体中文](README.zh-CN.md)

JetBrains Git Branches is a VS Code extension for developers who miss the branch workflow from JetBrains IDEs such as IntelliJ IDEA, PhpStorm, and PyCharm.

It brings a familiar branch tree and common branch actions into the VS Code Source Control sidebar: browse local and remote branches as folders, fetch all remotes, checkout branches, create a branch from another branch, merge a selected branch into the current branch, delete branches, and resolve conflicts with VS Code Merge Editor.

This extension is not a full Git client replacement. It focuses on the branch operations JetBrains users tend to use every day.

## Features

- JetBrains-style branch tree for local and remote branches.
- Multi-level branch folders split by `/`, for example `origin/feature/demo` becomes `origin > feature > demo`.
- Fetch all remotes with `git fetch --all`.
- Checkout local branches and remote tracking branches.
- Create a new branch from any selected branch. Remote branches are used only as the starting point and are not kept as upstream.
- Merge a selected branch into the current branch.
- Delete local branches and remote branches with confirmation.
- Back up untracked files before checkout when Git reports an overwrite risk.
- Open VS Code Merge Editor when merge conflicts are produced.
- Switch the extension UI between automatic, Simplified Chinese, and English.

## Usage

1. Open a Git repository folder in VS Code or Cursor.
2. Open the Source Control sidebar and find the `JetBrains Git Branches` view.
3. Expand `Local Branches` or `Remote Branches`.
4. Right-click a branch to use branch actions: `Checkout`, `Create Branch from Here...`, `Merge into Current Branch`, or `Delete Branch`.
5. Click `Fetch All Remotes` in the view title bar to fetch all remotes.

## Language Setting

Use the `JetBrains Git Branches: Language` setting to switch the extension UI:

- `auto`: follow the VS Code or Cursor display language.
- `zh-CN`: use Simplified Chinese.
- `en`: use English.

The setting updates the branch tree labels, context menus, notifications, and output messages.

Setting priority follows VS Code/Cursor rules:

```text
Workspace setting > User setting > Extension default
```

If the language does not change after you update the user setting, check whether the current repository has a workspace override in `.vscode/settings.json`, for example:

```json
{
  "jetBrainsGitBranches.language": "en"
}
```

Remove the workspace override to use the user setting globally, or change it to `zh-CN`/`en` for that workspace only. If the tree is still not refreshed, run `Developer: Reload Window`.

Note: the contributed view title `JetBrains Git Branches` is a static VS Code/Cursor contribution and cannot be switched dynamically by this setting.

## JetBrains Workflow Mapping

| JetBrains action | VS Code/Cursor extension action |
| --- | --- |
| Fetch All Remotes | `Fetch All Remotes` |
| Checkout | `Checkout` |
| New Branch from Selected | `Create Branch from Here...` |
| Merge selected branch into current | `Merge into Current Branch` |
| Delete Branch | `Delete Branch` |
| Visual conflict resolution | VS Code Merge Editor |

## Requirements

- VS Code 1.85.0 or later, or a compatible Cursor version.
- Git must be installed and available on `PATH`.
- The current workspace should contain a Git repository.

## Packaging

Build a local VSIX package:

```bash
npx @vscode/vsce package --allow-missing-repository
```

Install the generated VSIX locally:

```bash
code --install-extension git-branches-viewer-0.0.3.vsix
```

For Cursor:

```bash
cursor --install-extension git-branches-viewer-0.0.3.vsix --force
```

## Publishing Notes

Before publishing to Visual Studio Marketplace:

- Run `npx @vscode/vsce package` and verify the generated `.vsix`.
- Run `npx @vscode/vsce login chengxs1994`.
- Run `npx @vscode/vsce publish`.

## License

MIT
