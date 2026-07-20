# Changelog

## 0.0.7

- Add branch search from the view title bar.
- Filter local and remote branches by full branch name while preserving folder grouping.
- Add a clear-search command and localized search labels/messages.
- Add a dedicated Current Branch group.
- Add Favorite Branches with a favorite/unfavorite context menu action.
- Add Recent Branches for recently checked out or created branches.
- Add Copy Branch Name to the branch context menu.
- Offer Stash and retry when checkout would overwrite tracked local changes.

## 0.0.5

- Fix Marketplace README rendering by packaging README, CHANGELOG, LICENSE, icon, and package manifest as explicit VSIX assets.

## 0.0.4

- Add runtime language switching for Simplified Chinese and English.
- Localize branch tree labels, context menus, notifications, and output messages.
- Read language settings from workspace folder, workspace, and user scopes to match VS Code/Cursor setting priority.
- Document language setting priority and workspace override troubleshooting for Cursor.

## 0.0.3

- Add branch deletion from the branch context menu.
- Support safe local branch deletion with `git branch -d`.
- Support remote branch deletion with `git push <remote> --delete <branch>`.
- Verify that a branch created from another branch really exists and is checked out.
- Warn before creating a branch when the target local branch name already exists.
- Create branches from remote branches without keeping the remote branch as upstream.
- Improve branch tree refresh reliability after Git operations, especially in Cursor.
- Verify and explicitly remove stale remote-tracking refs after deleting remote branches.
- Show whether a branch leaf is local or remote to avoid confusion when both branches share the same name.
- Remove a branch from the current tree immediately after the delete command succeeds.
- Revert TreeView disposal and keep the registered data provider stable after deletion.
- Log the active workspace path to help diagnose duplicate or stale extension installs.
- Move commands and the tree view to the `jetBrainsGitBranches.*` namespace to avoid collisions with old local-dev installs.
- Rename the contributed view to `JetBrains Git Branches` so it is distinguishable from old local-dev views.
- Add `jetBrainsGitBranches.language` for switching the extension between auto, Simplified Chinese, and English.

## 0.0.2

- Update extension icon.

## 0.0.1

- Initial release.
- Show local and remote Git branches in a multi-level tree.
- Fetch all remotes from the view title bar.
- Checkout local and remote branches.
- Create a new branch from a selected branch.
- Merge a selected branch into the current branch.
- Back up untracked files before checkout when Git reports an overwrite risk.
- Open VS Code Merge Editor when merge conflicts are produced.
