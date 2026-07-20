const vscode = require('vscode');
const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const outputChannel = vscode.window.createOutputChannel('Git Branches Viewer');
const CONFIG_SECTION = 'jetBrainsGitBranches';
const LANGUAGE_CONTEXT_KEY = 'jetBrainsGitBranches.language';
const SEARCH_ACTIVE_CONTEXT_KEY = 'jetBrainsGitBranches.searchActive';
const FAVORITE_BRANCHES_KEY = 'favoriteBranches';
const RECENT_BRANCHES_KEY = 'recentBranches';
const RECENT_BRANCH_LIMIT = 10;

function normalizeLanguage(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'en') {
    return 'en';
  }

  if (normalized === 'zh' || normalized === 'zh-cn' || normalized.startsWith('zh-')) {
    return 'zh';
  }

  return undefined;
}

function getConfiguredLanguage() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const inspected = config.inspect('language') || {};
  const candidates = [
    inspected.workspaceFolderValue,
    inspected.workspaceValue,
    inspected.globalValue,
    config.get('language', 'auto')
  ];

  for (const candidate of candidates) {
    const language = normalizeLanguage(candidate);
    if (language) {
      return language;
    }
  }

  return undefined;
}

function getLanguage() {
  return getConfiguredLanguage() || normalizeLanguage(vscode.env.language) || 'en';
}

function localize(zhText, enText) {
  return getLanguage() === 'en' ? enText : zhText;
}

function formatMessage(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}

function message(zhText, enText, values = {}) {
  return formatMessage(localize(zhText, enText), values);
}

function updateLanguageContext(provider) {
  const language = getLanguage();
  vscode.commands.executeCommand('setContext', LANGUAGE_CONTEXT_KEY, language);
  outputChannel.appendLine(`JetBrains Git Branches language: ${language}`);

  if (provider) {
    provider.refresh();
  }
}

class BranchItem extends vscode.TreeItem {
  constructor(label, collapsibleState, options = {}) {
    super(label, collapsibleState);
    this.groupType = options.groupType;
    this.pathSegments = options.pathSegments || [];
    this.branchName = options.branchName;
    this.branchType = options.branchType;
    this.isCurrent = Boolean(options.isCurrent);
    this.contextValue = options.contextValue;
    this.description = options.description;
    this.tooltip = options.tooltip || label;
    this.iconPath = options.iconPath;
    this.id = options.id;
  }
}

class BranchesProvider {
  constructor(context) {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.searchQuery = '';
    this.state = context.workspaceState;
    this.hiddenBranches = {
      local: new Set(),
      remote: new Set()
    };
  }

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element) {
    return element;
  }

  setSearchQuery(query) {
    this.searchQuery = query.trim();
    vscode.commands.executeCommand('setContext', SEARCH_ACTIVE_CONTEXT_KEY, Boolean(this.searchQuery));
    this.refresh();
  }

  clearSearchQuery() {
    this.setSearchQuery('');
  }

  getSearchQuery() {
    return this.searchQuery;
  }

  getFavoriteBranches() {
    return this.state.get(FAVORITE_BRANCHES_KEY, []);
  }

  getRecentBranches() {
    return this.state.get(RECENT_BRANCHES_KEY, []);
  }

  isFavoriteBranch(branchType, branchName) {
    return this.getFavoriteBranches().some((branch) => (
      branch.type === branchType && branch.name === branchName
    ));
  }

  async toggleFavoriteBranch(branchType, branchName) {
    const favorites = this.getFavoriteBranches();
    const favoriteIndex = favorites.findIndex((branch) => (
      branch.type === branchType && branch.name === branchName
    ));

    if (favoriteIndex >= 0) {
      const nextFavorites = favorites.filter((_, index) => index !== favoriteIndex);
      await this.state.update(FAVORITE_BRANCHES_KEY, nextFavorites);
      this.refresh();
      return false;
    }

    await this.state.update(FAVORITE_BRANCHES_KEY, [
      { type: branchType, name: branchName },
      ...favorites
    ]);
    this.refresh();
    return true;
  }

  async recordRecentBranch(branchType, branchName) {
    const recentBranches = this.getRecentBranches()
      .filter((branch) => !(branch.type === branchType && branch.name === branchName));

    await this.state.update(RECENT_BRANCHES_KEY, [
      { type: branchType, name: branchName },
      ...recentBranches
    ].slice(0, RECENT_BRANCH_LIMIT));
  }

  async getChildren(element) {
    if (!this.getWorkspacePath()) {
      return [
        new BranchItem(
          localize('请先打开一个 Git 仓库目录', 'Open a Git repository folder first'),
          vscode.TreeItemCollapsibleState.None,
          {
            tooltip: localize(
              '当前没有可用的工作区目录。',
              'No workspace folder is available.'
            )
          }
        )
      ];
    }

    if (!element) {
      const searchSuffix = this.searchQuery
        ? message('：{query}', ': {query}', { query: this.searchQuery })
        : '';

      return [
        new BranchItem(
          localize('当前分支', 'Current Branch'),
          vscode.TreeItemCollapsibleState.Expanded,
          {
            contextValue: 'branch-group',
            groupType: 'current',
            tooltip: localize('当前签出的本地分支', 'The currently checked out local branch'),
            iconPath: new vscode.ThemeIcon('target')
          }
        ),
        new BranchItem(
          localize('收藏分支', 'Favorite Branches'),
          vscode.TreeItemCollapsibleState.Expanded,
          {
            contextValue: 'branch-group',
            groupType: 'favorite',
            tooltip: localize('收藏的常用分支', 'Favorite branches'),
            iconPath: new vscode.ThemeIcon('star-full')
          }
        ),
        new BranchItem(
          localize('最近分支', 'Recent Branches'),
          vscode.TreeItemCollapsibleState.Expanded,
          {
            contextValue: 'branch-group',
            groupType: 'recent',
            tooltip: localize('最近签出或新建的分支', 'Recently checked out or created branches'),
            iconPath: new vscode.ThemeIcon('history')
          }
        ),
        new BranchItem(
          `${localize('本地分支', 'Local Branches')}${searchSuffix}`,
          this.searchQuery ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
          {
            contextValue: 'branch-group',
            groupType: 'local',
            tooltip: localize('当前仓库的本地分支', 'Local branches in the current repository')
          }
        ),
        new BranchItem(
          `${localize('远程分支', 'Remote Branches')}${searchSuffix}`,
          this.searchQuery ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
          {
            contextValue: 'branch-group',
            groupType: 'remote',
            tooltip: localize('当前仓库的远程分支', 'Remote branches in the current repository')
          }
        )
      ];
    }

    if (element.groupType === 'current') {
      const currentBranch = await this.getCurrentBranch();
      if (!currentBranch || !this.filterBranches([currentBranch], 'local').length) {
        const label = this.searchQuery
          ? localize('没有匹配分支', 'No matching branches')
          : localize('当前不在本地分支上', 'Not currently on a local branch');

        return [
          new BranchItem(label, vscode.TreeItemCollapsibleState.None, {
            tooltip: label
          })
        ];
      }

      return [this.createBranchItem(currentBranch, 'local', true, { showFullName: true })];
    }

    if (element.groupType === 'favorite') {
      return this.toStoredBranchItems(
        await this.filterExistingStoredBranches(this.getFavoriteBranches()),
        localize('暂无收藏分支', 'No favorite branches')
      );
    }

    if (element.groupType === 'recent') {
      return this.toStoredBranchItems(
        await this.filterExistingStoredBranches(this.getRecentBranches()),
        localize('暂无最近分支', 'No recent branches')
      );
    }

    if (element.groupType === 'local') {
      const currentBranch = await this.getCurrentBranch();
      const localBranches = await this.runGit([
        'for-each-ref',
        '--format=%(refname:short)',
        'refs/heads'
      ]);

      return this.toBranchTreeItems(
        this.filterBranches(localBranches, 'local'),
        currentBranch,
        'local',
        element.pathSegments
      );
    }

    if (element.groupType === 'remote') {
      const remoteBranches = await this.runGit([
        'for-each-ref',
        '--format=%(refname:short)',
        'refs/remotes'
      ]);

      return this.toBranchTreeItems(
        this.filterBranches(remoteBranches.filter((branch) => !branch.endsWith('/HEAD')), 'remote'),
        '',
        'remote',
        element.pathSegments
      );
    }

    return [];
  }

  filterBranches(branches, branchType) {
    const normalizedQuery = this.searchQuery.toLowerCase();

    return branches.filter((branch) => {
      if (this.hiddenBranches[branchType]?.has(branch)) {
        return false;
      }

      return !normalizedQuery || branch.toLowerCase().includes(normalizedQuery);
    });
  }

  async filterExistingStoredBranches(branches) {
    const localBranches = new Set(await this.runGit([
      'for-each-ref',
      '--format=%(refname:short)',
      'refs/heads'
    ], { suppressError: true, silent: true }));
    const remoteBranches = new Set((await this.runGit([
      'for-each-ref',
      '--format=%(refname:short)',
      'refs/remotes'
    ], { suppressError: true, silent: true })).filter((branch) => !branch.endsWith('/HEAD')));

    return branches.filter((branch) => (
      branch.type === 'local'
        ? localBranches.has(branch.name)
        : remoteBranches.has(branch.name)
    ));
  }

  toStoredBranchItems(branches, emptyLabel) {
    const filteredBranches = branches.filter((branch) => (
      this.filterBranches([branch.name], branch.type).length > 0
    ));

    if (!filteredBranches.length) {
      const label = this.searchQuery
        ? localize('没有匹配分支', 'No matching branches')
        : emptyLabel;

      return [
        new BranchItem(label, vscode.TreeItemCollapsibleState.None, {
          tooltip: label
        })
      ];
    }

    return filteredBranches.map((branch) => this.createBranchItem(
      branch.name,
      branch.type,
      false,
      { showFullName: true }
    ));
  }

  toBranchTreeItems(branches, currentBranch, branchType, pathSegments = []) {
    if (!branches.length) {
      const emptyLabel = this.searchQuery
        ? localize('没有匹配分支', 'No matching branches')
        : localize('暂无分支', 'No branches');
      const emptyTooltip = this.searchQuery
        ? message('没有匹配 “{query}” 的分支。', 'No branches match "{query}".', { query: this.searchQuery })
        : localize('没有查询到分支。', 'No branches were found.');

      return [
        new BranchItem(emptyLabel, vscode.TreeItemCollapsibleState.None, {
          tooltip: emptyTooltip
        })
      ];
    }

    const prefixLength = pathSegments.length;
    const folders = new Set();
    const leafBranches = [];

    for (const branch of branches) {
      const segments = branch.split('/').filter(Boolean);

      if (!this.startsWithSegments(segments, pathSegments)) {
        continue;
      }

      if (segments.length === prefixLength + 1) {
        leafBranches.push(branch);
      } else if (segments.length > prefixLength + 1) {
        folders.add(segments[prefixLength]);
      }
    }

    const folderItems = [...folders].sort().map((folder) => {
      const childSegments = [...pathSegments, folder];
      const fullPath = childSegments.join('/');

      return new BranchItem(folder, this.searchQuery ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed, {
        contextValue: 'branch-folder',
        groupType: branchType,
        pathSegments: childSegments,
        tooltip: fullPath,
        iconPath: new vscode.ThemeIcon('folder')
      });
    });

    const branchItems = leafBranches.sort().map((branch) => this.createBranchItem(
      branch,
      branchType,
      branch === currentBranch
    ));

    return [...folderItems, ...branchItems];
  }

  createBranchItem(branch, branchType, isCurrent = false, options = {}) {
    const segments = branch.split('/').filter(Boolean);
    const label = options.showFullName ? branch : (segments[segments.length - 1] || branch);
    const isFavorite = this.isFavoriteBranch(branchType, branch);

    return new BranchItem(label, vscode.TreeItemCollapsibleState.None, {
      branchName: branch,
      branchType,
      isCurrent,
      contextValue: isCurrent
        ? 'branch-item-current'
        : branchType === 'remote'
          ? 'branch-item-remote'
          : 'branch-item-local',
      description: [
        isCurrent ? localize('当前', 'current') : '',
        branchType === 'remote' ? localize('远程', 'remote') : localize('本地', 'local'),
        isFavorite ? localize('收藏', 'favorite') : ''
      ].filter(Boolean).join(' · '),
      tooltip: isCurrent
        ? message('{branch}（当前分支）', '{branch} (current branch)', { branch })
        : message(
          '{branch}（{type}）',
          '{branch} ({type})',
          {
            branch,
            type: branchType === 'remote'
              ? localize('远程分支', 'remote branch')
              : localize('本地分支', 'local branch')
          }
        ),
      iconPath: new vscode.ThemeIcon(isCurrent ? 'target' : (isFavorite ? 'star-full' : 'git-branch'))
    });
  }

  startsWithSegments(segments, prefixSegments) {
    return prefixSegments.every((segment, index) => segments[index] === segment);
  }

  hideBranch(branchType, branchName) {
    this.hiddenBranches[branchType]?.add(branchName);
  }

  async getCurrentBranch() {
    const output = await this.runGit(['branch', '--show-current']);
    return output[0] || '';
  }

  async hasLocalBranch(branchName) {
    try {
      await execFileAsync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], {
        cwd: this.getWorkspacePath()
      });
      return true;
    } catch {
      return false;
    }
  }

  async hasRemoteTrackingBranch(branchName) {
    try {
      await execFileAsync('git', ['show-ref', '--verify', '--quiet', `refs/remotes/${branchName}`], {
        cwd: this.getWorkspacePath()
      });
      return true;
    } catch {
      return false;
    }
  }

  async runGit(args, options = {}) {
    try {
      const { stdout, stderr } = await execFileAsync('git', args, {
        cwd: this.getWorkspacePath()
      });

      if (stderr && !options.silent) {
        outputChannel.appendLine(stderr.trim());
      }

      return stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    } catch (error) {
      const messageText = error.stderr || error.message || localize('Git 命令执行失败', 'Git command failed');
      outputChannel.appendLine(`git ${args.join(' ')}`);
      outputChannel.appendLine(String(messageText).trim());

      if (!options.suppressError) {
        vscode.window.showErrorMessage(`Git Branches Viewer: ${messageText}`);
      }

      return [];
    }
  }

  async executeGit(args) {
    outputChannel.appendLine(message('执行: git {args}', 'Run: git {args}', {
      args: args.join(' ')
    }));

    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd: this.getWorkspacePath()
    });

    if (stdout.trim()) {
      outputChannel.appendLine(stdout.trim());
    }

    if (stderr.trim()) {
      outputChannel.appendLine(stderr.trim());
    }

    return { stdout, stderr };
  }

  getWorkspacePath() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }
}

function getLocalNameFromRemote(remoteBranch) {
  return remoteBranch.replace(/^[^/]+\//, '');
}

function getRemoteBranchParts(remoteBranch) {
  const separatorIndex = remoteBranch.indexOf('/');

  if (separatorIndex < 1 || separatorIndex === remoteBranch.length - 1) {
    return undefined;
  }

  return {
    remote: remoteBranch.slice(0, separatorIndex),
    branch: remoteBranch.slice(separatorIndex + 1)
  };
}

function getGitErrorMessage(error, fallback) {
  const stdout = error.stdout ? String(error.stdout).trim() : '';
  const stderr = error.stderr ? String(error.stderr).trim() : '';
  return stderr || stdout || error.message || fallback;
}

function isUntrackedOverwriteError(error) {
  const message = getGitErrorMessage(error, '');
  return (
    message.includes('untracked working tree files would be overwritten') ||
    message.includes('未跟踪的文件将会因为检出操作而被覆盖')
  );
}

function isLocalChangesOverwriteError(error) {
  const message = getGitErrorMessage(error, '');
  return (
    message.includes('Your local changes to the following files would be overwritten') ||
    message.includes('您对下列文件的本地修改将被') ||
    message.includes('Please commit your changes or stash them before you merge') ||
    message.includes('请在合并前提交或储藏您的修改')
  );
}

function isMergeConflictError(error) {
  const message = getGitErrorMessage(error, '');
  return (
    message.includes('CONFLICT') ||
    message.includes('Automatic merge failed') ||
    message.includes('Merge conflict') ||
    message.includes('合并冲突') ||
    message.includes('自动合并失败') ||
    message.includes('解决冲突')
  );
}

async function openSourceControlView() {
  await vscode.commands.executeCommand('workbench.view.scm');
}

function refreshGitBranchesView(provider, reason = '') {
  if (reason) {
    outputChannel.appendLine(message('刷新分支列表: {reason}', 'Refresh branch list: {reason}', {
      reason
    }));
  }

  provider.refresh();

  vscode.commands.executeCommand('git.refresh').then(
    () => {},
    () => {}
  );

  for (const delay of [250, 1000]) {
    setTimeout(() => provider.refresh(), delay);
  }
}

function removeBranchFromCurrentTree(provider, branchType, branchName) {
  provider.hideBranch(branchType, branchName);
  outputChannel.appendLine(message(
    '已从当前分支列表移除: {type} {branch}',
    'Removed from the current branch list: {type} {branch}',
    {
      type: branchType === 'remote' ? localize('远程', 'remote') : localize('本地', 'local'),
      branch: branchName
    }
  ));
  refreshGitBranchesView(
    provider,
    localize('删除成功后立即移除列表项', 'remove item immediately after successful deletion')
  );
}

async function getUnmergedFiles(provider) {
  return provider.runGit(['diff', '--name-only', '--diff-filter=U'], {
    suppressError: true,
    silent: true
  });
}

async function openMergeEditorForConflicts(provider) {
  const files = await getUnmergedFiles(provider);

  if (!files.length) {
    await openSourceControlView();
    return;
  }

  const workspacePath = provider.getWorkspacePath();
  const firstConflictUri = vscode.Uri.file(path.join(workspacePath, files[0]));

  await openSourceControlView();

  try {
    await vscode.commands.executeCommand('git.openMergeEditor', firstConflictUri);
    outputChannel.appendLine(message('已打开 Merge Editor: {file}', 'Opened Merge Editor: {file}', {
      file: files[0]
    }));
  } catch (error) {
    outputChannel.appendLine(getGitErrorMessage(
      error,
      localize(
        '打开 Merge Editor 失败，已改为打开冲突文件。',
        'Failed to open Merge Editor. Opened the conflicted file instead.'
      )
    ));
    await vscode.window.showTextDocument(firstConflictUri, { preview: false });
  }
}

function parseUntrackedOverwriteFiles(error) {
  const message = getGitErrorMessage(error, '');
  const files = [];
  let collecting = false;

  for (const rawLine of message.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (
      line.includes('untracked working tree files would be overwritten') ||
      line.includes('未跟踪的文件将会因为检出操作而被覆盖')
    ) {
      collecting = true;
      continue;
    }

    if (!collecting || !line) {
      continue;
    }

    if (
      line.startsWith('Please ') ||
      line.startsWith('Aborting') ||
      line.startsWith('请') ||
      line.startsWith('正在终止')
    ) {
      break;
    }

    files.push(line.replace(/^"|"$/g, ''));
  }

  return files;
}

async function backupUntrackedOverwriteFiles(provider, files) {
  const workspacePath = provider.getWorkspacePath();
  const backupDir = path.join(
    workspacePath,
    '.git',
    'git-branches-viewer-backups',
    new Date().toISOString().replace(/[:.]/g, '-')
  );

  await fs.mkdir(backupDir, { recursive: true });

  for (const file of files) {
    const source = path.resolve(workspacePath, file);

    if (!source.startsWith(`${workspacePath}${path.sep}`)) {
      throw new Error(message(
        '拒绝备份仓库外路径：{file}',
        'Refused to back up a path outside the repository: {file}',
        { file }
      ));
    }

    const target = path.join(backupDir, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.rename(source, target);
    outputChannel.appendLine(message(
      '已备份未跟踪文件: {file} -> {target}',
      'Backed up untracked file: {file} -> {target}',
      {
        file,
        target: path.relative(workspacePath, target)
      }
    ));
  }

  return backupDir;
}

async function executeCheckoutWithSmartRetry(provider, checkoutArgs, retryLabel) {
  try {
    return await provider.executeGit(checkoutArgs);
  } catch (error) {
    const messageText = getGitErrorMessage(
      error,
      localize('git checkout 执行失败', 'git checkout failed')
    );
    outputChannel.appendLine(messageText);

    if (isUntrackedOverwriteError(error)) {
      const files = parseUntrackedOverwriteFiles(error);

      if (!files.length) {
        throw error;
      }

      const retryButton = localize('备份后重试', 'Back up and retry');
      const confirmation = await vscode.window.showWarningMessage(
        message(
          '{label} 时有 {count} 个未跟踪文件会被覆盖。是否先备份这些文件，再重试？',
          '{count} untracked file(s) would be overwritten while {label}. Back them up and retry?',
          {
            label: retryLabel,
            count: files.length
          }
        ),
        { modal: true },
        retryButton
      );

      if (confirmation !== retryButton) {
        throw error;
      }

      const backupDir = await backupUntrackedOverwriteFiles(provider, files);
      outputChannel.appendLine(message(
        '冲突文件已备份到: {backupDir}',
        'Conflicting files were backed up to: {backupDir}',
        { backupDir }
      ));

      return provider.executeGit(checkoutArgs);
    }

    if (!isLocalChangesOverwriteError(error)) {
      throw error;
    }

    const stashRetryButton = localize('stash 后重试', 'Stash and retry');
    const confirmation = await vscode.window.showWarningMessage(
      message(
        '{label} 会覆盖当前本地修改。是否先临时 stash 当前修改，再重试？',
        '{label} would overwrite local changes. Stash them and retry?',
        { label: retryLabel }
      ),
      { modal: true },
      stashRetryButton
    );

    if (confirmation !== stashRetryButton) {
      throw error;
    }

    const stashMessage = `Git Branches Viewer smart checkout ${new Date().toISOString()}`;
    await provider.executeGit(['stash', 'push', '-m', stashMessage]);

    try {
      const result = await provider.executeGit(checkoutArgs);

      try {
        await provider.executeGit(['stash', 'pop']);
      } catch (popError) {
        outputChannel.appendLine(getGitErrorMessage(
          popError,
          localize('git stash pop 执行失败', 'git stash pop failed')
        ));
        outputChannel.appendLine(localize(
          '本地修改恢复时发生冲突，已打开 Merge Editor。',
          'Conflicts occurred while restoring local changes. Merge Editor has been opened.'
        ));
        await openMergeEditorForConflicts(provider);
        throw popError;
      }

      return result;
    } catch (retryError) {
      outputChannel.appendLine(localize(
        'checkout 重试失败或恢复本地修改失败。之前 stash 的本地修改仍保留在 stash 中。',
        'Checkout retry failed or local changes could not be restored. The previous stash is still available.'
      ));
      throw retryError;
    }
  }
}

async function verifyCreatedAndCheckedOut(provider, branchName) {
  const branchExists = await provider.hasLocalBranch(branchName);
  const currentBranch = await provider.getCurrentBranch();

  if (!branchExists || currentBranch !== branchName) {
    throw new Error(message(
      '创建分支后校验失败：目标分支 {branch} {state}，当前分支是 {current}。',
      'Post-create validation failed: target branch {branch} {state}; current branch is {current}.',
      {
        branch: branchName,
        state: branchExists ? localize('已存在', 'exists') : localize('不存在', 'does not exist'),
        current: currentBranch || localize('未知', 'unknown')
      }
    ));
  }
}

async function getUpstreamBranch(provider, branchName) {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branchName}@{u}`],
      { cwd: provider.getWorkspacePath() }
    );

    return stdout.trim();
  } catch {
    return '';
  }
}

async function ensureNoUpstreamWhenCreatedFromRemote(provider, branchName, sourceBranchType) {
  if (sourceBranchType !== 'remote') {
    return;
  }

  const upstreamBranch = await getUpstreamBranch(provider, branchName);

  if (!upstreamBranch) {
    outputChannel.appendLine(message(
      '{branch} 未设置 upstream 跟踪关系。',
      '{branch} has no upstream tracking branch.',
      { branch: branchName }
    ));
    return;
  }

  outputChannel.appendLine(message(
    '{branch} 当前 upstream 是 {upstream}，正在取消跟踪关系。',
    '{branch} currently tracks {upstream}; unsetting upstream.',
    {
      branch: branchName,
      upstream: upstreamBranch
    }
  ));
  await provider.executeGit(['branch', '--unset-upstream', branchName]);

  const remainingUpstream = await getUpstreamBranch(provider, branchName);

  if (remainingUpstream) {
    throw new Error(message(
      '创建分支后仍跟踪 {upstream}，未能取消 upstream。',
      'Branch still tracks {upstream}; failed to unset upstream.',
      { upstream: remainingUpstream }
    ));
  }
}

async function pruneDeletedRemoteTrackingBranch(provider, remoteBranchName) {
  const remoteTrackingRef = `refs/remotes/${remoteBranchName}`;

  outputChannel.appendLine(message(
    '清理远程跟踪引用: {ref}',
    'Cleaning remote-tracking ref: {ref}',
    { ref: remoteTrackingRef }
  ));
  await provider.executeGit(['update-ref', '-d', remoteTrackingRef]);

  if (!(await provider.hasRemoteTrackingBranch(remoteBranchName))) {
    outputChannel.appendLine(message(
      '远程跟踪分支已移除: {branch}',
      'Remote-tracking branch removed: {branch}',
      { branch: remoteBranchName }
    ));
    return;
  }

  outputChannel.appendLine(message(
    '本地仍存在远程跟踪分支 {branch}，正在显式移除。',
    'Remote-tracking branch {branch} still exists locally; removing it explicitly.',
    { branch: remoteBranchName }
  ));
  await provider.executeGit(['branch', '-r', '-d', remoteBranchName]);

  if (await provider.hasRemoteTrackingBranch(remoteBranchName)) {
    throw new Error(message(
      '远程分支已删除，但本地远程跟踪引用仍存在：{branch}',
      'Remote branch was deleted, but the local remote-tracking ref still exists: {branch}',
      { branch: remoteBranchName }
    ));
  }
}

async function executeMergeWithSmartRetry(provider, branchName, currentBranch) {
  try {
    return await provider.executeGit(['merge', branchName]);
  } catch (error) {
    if (isMergeConflictError(error)) {
      await openMergeEditorForConflicts(provider);
      throw error;
    }

    if (!isLocalChangesOverwriteError(error)) {
      throw error;
    }

    const messageText = getGitErrorMessage(error, localize('git merge 执行失败', 'git merge failed'));
    outputChannel.appendLine(messageText);

    const stashRetryButton = localize('stash 后重试', 'Stash and retry');
    const confirmation = await vscode.window.showWarningMessage(
      message(
        '合并 {branch} 到 {current} 会覆盖当前本地修改。是否先临时 stash 当前修改，再重试合并？',
        'Merging {branch} into {current} would overwrite local changes. Stash them and retry?',
        {
          branch: branchName,
          current: currentBranch
        }
      ),
      { modal: true },
      stashRetryButton
    );

    if (confirmation !== stashRetryButton) {
      throw error;
    }

    const stashMessage = `Git Branches Viewer smart merge ${new Date().toISOString()}`;
    await provider.executeGit(['stash', 'push', '-m', stashMessage]);

    try {
      const result = await provider.executeGit(['merge', branchName]);

      try {
        await provider.executeGit(['stash', 'pop']);
      } catch (popError) {
        outputChannel.appendLine(getGitErrorMessage(
          popError,
          localize('git stash pop 执行失败', 'git stash pop failed')
        ));
        outputChannel.appendLine(localize(
          '本地修改恢复时发生冲突，已打开 Merge Editor。',
          'Conflicts occurred while restoring local changes. Merge Editor has been opened.'
        ));
        await openMergeEditorForConflicts(provider);
        throw popError;
      }

      return result;
    } catch (retryError) {
      if (isMergeConflictError(retryError)) {
        outputChannel.appendLine(localize(
          '合并产生冲突，已打开 Merge Editor。之前 stash 的本地修改仍保留在 stash 中。',
          'Merge conflicts occurred. Merge Editor has been opened. The previous stash is still available.'
        ));
        await openMergeEditorForConflicts(provider);
      }

      throw retryError;
    }
  }
}

function registerLanguageCommands(baseCommand, handler) {
  return [
    vscode.commands.registerCommand(baseCommand, handler),
    vscode.commands.registerCommand(`${baseCommand}.zh`, handler),
    vscode.commands.registerCommand(`${baseCommand}.en`, handler)
  ];
}

function activate(context) {
  const provider = new BranchesProvider(context);
  updateLanguageContext(provider);
  vscode.commands.executeCommand('setContext', SEARCH_ACTIVE_CONTEXT_KEY, false);
  outputChannel.appendLine(
    `Git Branches Viewer activated from ${context.extensionPath} (version ${context.extension.packageJSON.version})`
  );
  outputChannel.appendLine(message(
    '当前 Git Branches 工作区: {workspace}',
    'Current Git Branches workspace: {workspace}',
    { workspace: provider.getWorkspacePath() || localize('未知', 'unknown') }
  ));

  context.subscriptions.push(
    outputChannel,
    vscode.window.registerTreeDataProvider('jetBrainsGitBranches.branches', provider),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`${CONFIG_SECTION}.language`)) {
        updateLanguageContext(provider);
      }
    }),
    ...registerLanguageCommands('jetBrainsGitBranches.refresh', () => (
      refreshGitBranchesView(provider, localize('手动刷新', 'manual refresh'))
    )),
    ...registerLanguageCommands('jetBrainsGitBranches.searchBranches', async () => {
      const searchQuery = await vscode.window.showInputBox({
        title: localize('搜索分支', 'Search Branches'),
        prompt: localize(
          '输入分支名关键字，留空则清除搜索。',
          'Enter a branch name keyword. Leave empty to clear the search.'
        ),
        value: provider.getSearchQuery(),
        valueSelection: [0, provider.getSearchQuery().length],
        placeHolder: localize('例如：fix-0506、origin/master', 'For example: fix-0506, origin/master'),
        ignoreFocusOut: true
      });

      if (searchQuery === undefined) {
        return;
      }

      provider.setSearchQuery(searchQuery);

      if (provider.getSearchQuery()) {
        outputChannel.appendLine(message(
          '分支搜索关键字: {query}',
          'Branch search keyword: {query}',
          { query: provider.getSearchQuery() }
        ));
      } else {
        outputChannel.appendLine(localize('已清除分支搜索。', 'Branch search cleared.'));
      }
    }),
    ...registerLanguageCommands('jetBrainsGitBranches.clearSearch', () => {
      provider.clearSearchQuery();
      outputChannel.appendLine(localize('已清除分支搜索。', 'Branch search cleared.'));
    }),
    ...registerLanguageCommands('jetBrainsGitBranches.copyBranchName', async (item) => {
      if (!item?.branchName) {
        vscode.window.showWarningMessage(localize(
          '请选择一个可复制名称的分支。',
          'Select a branch to copy its name.'
        ));
        return;
      }

      await vscode.env.clipboard.writeText(item.branchName);
      vscode.window.showInformationMessage(message(
        '已复制分支名: {branch}',
        'Copied branch name: {branch}',
        { branch: item.branchName }
      ));
    }),
    ...registerLanguageCommands('jetBrainsGitBranches.toggleFavoriteBranch', async (item) => {
      if (!item?.branchName || !item?.branchType) {
        vscode.window.showWarningMessage(localize(
          '请选择一个可收藏的分支。',
          'Select a branch to favorite.'
        ));
        return;
      }

      const isFavorited = await provider.toggleFavoriteBranch(item.branchType, item.branchName);
      vscode.window.showInformationMessage(isFavorited
        ? message('已收藏分支 {branch}。', 'Favorited branch {branch}.', { branch: item.branchName })
        : message('已取消收藏分支 {branch}。', 'Removed branch {branch} from favorites.', { branch: item.branchName }));
    }),
    ...registerLanguageCommands('jetBrainsGitBranches.fetchAllRemotes', async () => {
      outputChannel.clear();
      outputChannel.appendLine(localize('准备执行: git fetch --all', 'Preparing to run: git fetch --all'));

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: localize('正在提取所有远程...', 'Fetching all remotes...'),
            cancellable: false
          },
          () => provider.executeGit(['fetch', '--all'])
        );

        outputChannel.show(true);
        refreshGitBranchesView(provider, localize('git 操作后', 'after Git operation'));
        vscode.window.showInformationMessage(localize('已提取所有远程。', 'Fetched all remotes.'));
      } catch (error) {
        const messageText = getGitErrorMessage(
          error,
          localize('git fetch --all 执行失败', 'git fetch --all failed')
        );
        outputChannel.appendLine(messageText);
        outputChannel.show(true);
        refreshGitBranchesView(provider, localize('git 操作后', 'after Git operation'));
        vscode.window.showErrorMessage(message(
          '提取所有远程失败：{message}',
          'Failed to fetch all remotes: {message}',
          { message: messageText }
        ));
      }
    }),
    ...registerLanguageCommands('jetBrainsGitBranches.checkoutBranch', async (item) => {
      if (!item?.branchName) {
        vscode.window.showWarningMessage(localize(
          '请选择一个可签出的分支。',
          'Select a branch to check out.'
        ));
        return;
      }

      const currentBranch = await provider.getCurrentBranch();

      if (item.branchName === currentBranch) {
        vscode.window.showInformationMessage(message(
          '{branch} 已经是当前分支。',
          '{branch} is already the current branch.',
          { branch: item.branchName }
        ));
        return;
      }

      outputChannel.clear();
      outputChannel.appendLine(message(
        '当前 Git Branches 工作区: {workspace}',
        'Current Git Branches workspace: {workspace}',
        { workspace: provider.getWorkspacePath() || localize('未知', 'unknown') }
      ));

      try {
        let checkoutTarget = item.branchName;

        if (item.branchType === 'remote') {
          const localBranchName = getLocalNameFromRemote(item.branchName);
          const localBranchExists = await provider.hasLocalBranch(localBranchName);

          if (localBranchExists) {
            checkoutTarget = localBranchName;
            outputChannel.appendLine(message(
              '远程分支 {remote} 已有同名本地分支，切换到 {local}。',
              'Remote branch {remote} already has a local branch with the same name. Checking out {local}.',
              {
                remote: item.branchName,
                local: localBranchName
              }
            ));
            await executeCheckoutWithSmartRetry(
              provider,
              ['checkout', localBranchName],
              message('签出 {branch}', 'checking out {branch}', { branch: localBranchName })
            );
          } else {
            checkoutTarget = localBranchName;
            outputChannel.appendLine(message(
              '远程分支 {remote} 暂无同名本地分支，创建 tracking 分支 {local}。',
              'Remote branch {remote} has no local branch with the same name. Creating tracking branch {local}.',
              {
                remote: item.branchName,
                local: localBranchName
              }
            ));
            await executeCheckoutWithSmartRetry(
              provider,
              ['checkout', '--track', item.branchName],
              message('签出 {branch}', 'checking out {branch}', { branch: item.branchName })
            );
          }
        } else {
          await executeCheckoutWithSmartRetry(
            provider,
            ['checkout', item.branchName],
            message('签出 {branch}', 'checking out {branch}', { branch: item.branchName })
          );
        }

        outputChannel.show(true);
        await provider.recordRecentBranch('local', checkoutTarget);
        refreshGitBranchesView(provider, localize('git 操作后', 'after Git operation'));
        vscode.window.showInformationMessage(message(
          '已签出 {branch}。',
          'Checked out {branch}.',
          { branch: checkoutTarget }
        ));
      } catch (error) {
        const messageText = getGitErrorMessage(error, localize('git checkout 执行失败', 'git checkout failed'));
        outputChannel.appendLine(messageText);
        outputChannel.show(true);
        refreshGitBranchesView(provider, localize('git 操作后', 'after Git operation'));
        vscode.window.showErrorMessage(message(
          '签出 {branch} 失败：{message}',
          'Failed to check out {branch}: {message}',
          {
            branch: item.branchName,
            message: messageText
          }
        ));
      }
    }),
    ...registerLanguageCommands('jetBrainsGitBranches.createBranchFrom', async (item) => {
      if (!item?.branchName) {
        vscode.window.showWarningMessage(localize(
          '请选择一个用于新建分支的来源分支。',
          'Select a source branch to create from.'
        ));
        return;
      }

      const suggestedName = item.branchType === 'remote'
        ? getLocalNameFromRemote(item.branchName)
        : item.branchName;
      const newBranchName = await vscode.window.showInputBox({
        title: message('从 {branch} 新建分支', 'Create Branch from {branch}', {
          branch: item.branchName
        }),
        prompt: localize(
          '输入新分支名称，创建后会自动切换过去。',
          'Enter a new branch name. It will be checked out after creation.'
        ),
        value: suggestedName,
        valueSelection: [0, suggestedName.length],
        ignoreFocusOut: true,
        validateInput(value) {
          if (!value.trim()) {
            return localize('分支名不能为空。', 'Branch name cannot be empty.');
          }

          if (value.trim() === item.branchName) {
            return localize(
              '新分支名不能和来源分支完全相同。',
              'New branch name cannot be exactly the same as the source branch.'
            );
          }

          return undefined;
        }
      });

      if (!newBranchName) {
        return;
      }

      const branchName = newBranchName.trim();

      outputChannel.clear();
      outputChannel.appendLine(message(
        '当前 Git Branches 工作区: {workspace}',
        'Current Git Branches workspace: {workspace}',
        { workspace: provider.getWorkspacePath() || localize('未知', 'unknown') }
      ));

      try {
        await provider.executeGit(['check-ref-format', '--branch', branchName]);

        if (await provider.hasLocalBranch(branchName)) {
          vscode.window.showWarningMessage(message(
            '本地分支 {branch} 已存在，请换一个新分支名。',
            'Local branch {branch} already exists. Choose a different branch name.',
            { branch: branchName }
          ));
          return;
        }

        const checkoutArgs = item.branchType === 'remote'
          ? ['checkout', '--no-track', '-b', branchName, item.branchName]
          : ['checkout', '-b', branchName, item.branchName];

        await executeCheckoutWithSmartRetry(
          provider,
          checkoutArgs,
          message(
            '从 {source} 新建分支 {target}',
            'creating branch {target} from {source}',
            {
              source: item.branchName,
              target: branchName
            }
          )
        );
        await verifyCreatedAndCheckedOut(provider, branchName);
        await ensureNoUpstreamWhenCreatedFromRemote(provider, branchName, item.branchType);

        outputChannel.show(true);
        await provider.recordRecentBranch('local', branchName);
        refreshGitBranchesView(provider, localize('git 操作后', 'after Git operation'));
        vscode.window.showInformationMessage(message(
          '已从 {source} 新建并签出 {target}。',
          'Created and checked out {target} from {source}.',
          {
            source: item.branchName,
            target: branchName
          }
        ));
      } catch (error) {
        const messageText = getGitErrorMessage(error, localize('git checkout -b 执行失败', 'git checkout -b failed'));
        outputChannel.appendLine(messageText);
        outputChannel.show(true);
        refreshGitBranchesView(provider, localize('git 操作后', 'after Git operation'));
        vscode.window.showErrorMessage(message(
          '从 {branch} 新建分支失败：{message}',
          'Failed to create a branch from {branch}: {message}',
          {
            branch: item.branchName,
            message: messageText
          }
        ));
      }
    }),
    ...registerLanguageCommands('jetBrainsGitBranches.deleteBranch', async (item) => {
      if (!item?.branchName) {
        vscode.window.showWarningMessage(localize(
          '请选择一个可删除的分支。',
          'Select a branch to delete.'
        ));
        return;
      }

      const currentBranch = await provider.getCurrentBranch();

      if (item.branchName === currentBranch) {
        vscode.window.showInformationMessage(localize(
          '不能删除当前分支，请先切换到其他分支。',
          'Cannot delete the current branch. Check out another branch first.'
        ));
        return;
      }

      const isRemoteBranch = item.branchType === 'remote';
      const confirmDeleteButton = localize('确认删除', 'Delete');
      const confirmation = await vscode.window.showWarningMessage(
        isRemoteBranch
          ? message(
            '确认删除远程分支 {branch} 吗？这会推送删除操作到远程仓库。',
            'Delete remote branch {branch}? This will push the deletion to the remote repository.',
            { branch: item.branchName }
          )
          : message(
            '确认删除本地分支 {branch} 吗？未合并分支会被 Git 拒绝删除。',
            'Delete local branch {branch}? Git will reject deletion if it is not merged.',
            { branch: item.branchName }
          ),
        { modal: true },
        confirmDeleteButton
      );

      if (confirmation !== confirmDeleteButton) {
        return;
      }

      outputChannel.clear();
      outputChannel.appendLine(message(
        '当前 Git Branches 工作区: {workspace}',
        'Current Git Branches workspace: {workspace}',
        { workspace: provider.getWorkspacePath() || localize('未知', 'unknown') }
      ));

      try {
        if (isRemoteBranch) {
          const remoteBranch = getRemoteBranchParts(item.branchName);

          if (!remoteBranch) {
            vscode.window.showErrorMessage(message(
              '无法解析远程分支名称：{branch}',
              'Unable to parse remote branch name: {branch}',
              { branch: item.branchName }
            ));
            return;
          }

          await provider.executeGit(['push', remoteBranch.remote, '--delete', remoteBranch.branch]);
          removeBranchFromCurrentTree(provider, 'remote', item.branchName);
          await provider.executeGit(['fetch', remoteBranch.remote, '--prune']);
          await pruneDeletedRemoteTrackingBranch(provider, item.branchName);

          const localBranchName = getLocalNameFromRemote(item.branchName);
          const localBranchExists = await provider.hasLocalBranch(localBranchName);

          if (localBranchExists) {
            outputChannel.appendLine(message(
              '同名本地分支仍保留: {branch}',
              'Local branch with the same name is still kept: {branch}',
              { branch: localBranchName }
            ));
            vscode.window.showInformationMessage(
              message(
                '已删除远程分支 {remote}。同名本地分支 {local} 仍保留，可在“本地分支”中单独删除。',
                'Deleted remote branch {remote}. Local branch {local} is still kept and can be deleted from Local Branches.',
                {
                  remote: item.branchName,
                  local: localBranchName
                }
              )
            );
          } else {
            vscode.window.showInformationMessage(message(
              '已删除远程分支 {branch}。',
              'Deleted remote branch {branch}.',
              { branch: item.branchName }
            ));
          }
        } else {
          await provider.executeGit(['branch', '-d', item.branchName]);
          removeBranchFromCurrentTree(provider, 'local', item.branchName);
          vscode.window.showInformationMessage(message(
            '已删除本地分支 {branch}。',
            'Deleted local branch {branch}.',
            { branch: item.branchName }
          ));
        }

        outputChannel.show(true);
        refreshGitBranchesView(provider, localize('git 操作后', 'after Git operation'), {
          branchName: item.branchName,
          branchType: item.branchType
        });
      } catch (error) {
        const messageText = getGitErrorMessage(error, localize('删除分支失败', 'Failed to delete branch'));
        outputChannel.appendLine(messageText);
        outputChannel.show(true);
        refreshGitBranchesView(provider, localize('git 操作后', 'after Git operation'), {
          branchName: item.branchName,
          branchType: item.branchType
        });
        vscode.window.showErrorMessage(message(
          '删除分支 {branch} 失败：{message}',
          'Failed to delete branch {branch}: {message}',
          {
            branch: item.branchName,
            message: messageText
          }
        ));
      }
    }),
    ...registerLanguageCommands('jetBrainsGitBranches.mergeIntoCurrent', async (item) => {
      if (!item?.branchName) {
        vscode.window.showWarningMessage(localize(
          '请选择一个可合并的分支。',
          'Select a branch to merge.'
        ));
        return;
      }

      const currentBranchList = await provider.runGit(['branch', '--show-current'], {
        suppressError: true
      });
      const currentBranch = currentBranchList[0];

      if (!currentBranch) {
        vscode.window.showWarningMessage(localize(
          '当前不在一个可识别的本地分支上，暂时无法执行合并。',
          'The current checkout is not a recognizable local branch, so merge is unavailable.'
        ));
        return;
      }

      if (item.branchName === currentBranch) {
        vscode.window.showInformationMessage(localize(
          '不能把当前分支合并到自己。',
          'Cannot merge the current branch into itself.'
        ));
        return;
      }

      const confirmMergeButton = localize('确认合并', 'Merge');
      const confirmation = await vscode.window.showWarningMessage(
        message(
          '确认将 {branch} 合并到当前分支 {current} 吗？',
          'Merge {branch} into the current branch {current}?',
          {
            branch: item.branchName,
            current: currentBranch
          }
        ),
        { modal: true },
        confirmMergeButton
      );

      if (confirmation !== confirmMergeButton) {
        return;
      }

      outputChannel.clear();
      outputChannel.appendLine(message(
        '准备执行: git merge {branch}',
        'Preparing to run: git merge {branch}',
        { branch: item.branchName }
      ));

      try {
        const { stdout, stderr } = await executeMergeWithSmartRetry(
          provider,
          item.branchName,
          currentBranch
        );

        outputChannel.show(true);
        refreshGitBranchesView(provider, localize('git 操作后', 'after Git operation'));

        const summary = stdout.trim() || stderr.trim() || localize('合并完成', 'Merge completed');
        vscode.window.showInformationMessage(message(
          '已将 {branch} 合并到 {current}。',
          'Merged {branch} into {current}.',
          {
            branch: item.branchName,
            current: currentBranch
          }
        ));
        outputChannel.appendLine(summary);
      } catch (error) {
        const messageText = getGitErrorMessage(error, localize('git merge 执行失败', 'git merge failed'));
        outputChannel.appendLine(messageText);
        outputChannel.show(true);
        refreshGitBranchesView(provider, localize('git 操作后', 'after Git operation'));

        if (isMergeConflictError(error)) {
          vscode.window.showWarningMessage(
            message(
              '合并 {branch} 到 {current} 产生冲突，已打开 Merge Editor。',
              'Merging {branch} into {current} produced conflicts. Merge Editor has been opened.',
              {
                branch: item.branchName,
                current: currentBranch
              }
            )
          );
        } else {
          vscode.window.showErrorMessage(
            message(
              '合并 {branch} 到 {current} 失败：{message}',
              'Failed to merge {branch} into {current}: {message}',
              {
                branch: item.branchName,
                current: currentBranch,
                message: messageText
              }
            )
          );
        }
      }
    })
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
