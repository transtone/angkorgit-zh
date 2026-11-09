use git2::{build::CheckoutBuilder, BranchType, Repository, ResetType};

use crate::error::{AppError, AppResult};

use super::types::{BranchInfo, CommitInfo, OpOutcome, RebaseTodoEntry};

pub fn list(path: &str) -> AppResult<Vec<BranchInfo>> {
    let repo = super::repo::open(path)?;
    let mut result = Vec::new();
    for entry in repo.branches(None)? {
        let (branch, kind) = entry?;
        let name = match branch.name()? {
            Some(n) => n.to_string(),
            None => continue,
        };
        let is_remote = kind == BranchType::Remote;
        if is_remote && name.ends_with("/HEAD") {
            continue;
        }
        let target_oid = match branch.get().target() {
            Some(o) => o.to_string(),
            None => continue,
        };
        let (upstream, ahead, behind) = if is_remote {
            (None, 0, 0)
        } else {
            match branch.upstream() {
                Ok(up) => {
                    let up_name = up.name()?.map(String::from);
                    let (a, b) = match (branch.get().target(), up.get().target()) {
                        (Some(l), Some(u)) => repo.graph_ahead_behind(l, u).unwrap_or((0, 0)),
                        _ => (0, 0),
                    };
                    (up_name, a, b)
                }
                Err(_) => (None, 0, 0),
            }
        };
        result.push(BranchInfo {
            is_head: branch.is_head(),
            name,
            is_remote,
            upstream,
            ahead,
            behind,
            target_oid,
        });
    }
    result.sort_by(|a, b| (a.is_remote, &a.name).cmp(&(b.is_remote, &b.name)));
    Ok(result)
}

pub fn create(path: &str, name: &str, from_oid: Option<&str>, checkout: bool) -> AppResult<()> {
    let repo = super::repo::open(path)?;
    let commit = match from_oid {
        Some(oid) => repo.find_commit(git2::Oid::from_str(oid)?)?,
        None => repo
            .head()
            .map_err(|_| AppError::other("无法创建分支：仓库没有提交"))?
            .peel_to_commit()?,
    };
    repo.branch(name, &commit, false)?;
    if checkout {
        checkout_branch(path, name)?;
    }
    Ok(())
}

pub fn delete(path: &str, name: &str, remote: bool) -> AppResult<()> {
    let repo = super::repo::open(path)?;
    let kind = if remote {
        BranchType::Remote
    } else {
        BranchType::Local
    };
    let mut branch = repo.find_branch(name, kind)?;
    branch.delete()?;
    Ok(())
}

pub fn rename(path: &str, old_name: &str, new_name: &str) -> AppResult<()> {
    let repo = super::repo::open(path)?;
    let mut branch = repo.find_branch(old_name, BranchType::Local)?;
    branch.rename(new_name, false)?;
    Ok(())
}

pub fn checkout_branch(path: &str, name: &str) -> AppResult<()> {
    let repo = super::repo::open(path)?;

    if let Ok(remote_branch) = repo.find_branch(name, BranchType::Remote) {
        let local_name = local_name_of(name);
        let remote_commit = remote_branch.get().peel_to_commit()?;
        match repo.find_branch(local_name, BranchType::Local) {
            Err(_) => {
                let mut local = repo.branch(local_name, &remote_commit, false)?;
                local.set_upstream(Some(name))?;
            }
            Ok(mut local) => {
                if local.upstream().is_err() {
                    local.set_upstream(Some(name))?;
                }
                refuse_if_checked_out_elsewhere(&repo, local_name)?;
                let local_oid = local
                    .get()
                    .target()
                    .ok_or_else(|| AppError::other("分支没有目标"))?;
                if local_oid != remote_commit.id()
                    && repo.graph_descendant_of(remote_commit.id(), local_oid)?
                {
                    return fast_forward_and_checkout(&repo, local_name, &remote_commit);
                }
            }
        }
        refuse_if_checked_out_elsewhere(&repo, local_name)?;
        return do_checkout(&repo, &format!("refs/heads/{local_name}"));
    }

    refuse_if_checked_out_elsewhere(&repo, name)?;
    do_checkout(&repo, &format!("refs/heads/{name}"))
}

fn refuse_if_checked_out_elsewhere(repo: &Repository, branch: &str) -> AppResult<()> {
    match super::worktree::checked_out_elsewhere(repo, branch) {
        Some(location) => Err(AppError::other(format!(
            "“{branch}”已在位于 {location} 的工作树中检出。请切换到该工作树继续操作，或在此检出其他分支。"
        ))),
        None => Ok(()),
    }
}

fn local_name_of(remote_branch: &str) -> &str {
    remote_branch
        .split_once('/')
        .map(|(_, rest)| rest)
        .unwrap_or(remote_branch)
}

pub fn resolve_branch_ref<'repo>(
    repo: &'repo Repository,
    name: &str,
) -> AppResult<git2::Reference<'repo>> {
    if let Ok(local) = repo.find_reference(&format!("refs/heads/{name}")) {
        return Ok(local);
    }
    if let Ok(remote) = repo.find_reference(&format!("refs/remotes/{name}")) {
        return Ok(remote);
    }
    Ok(repo.resolve_reference_from_short_name(name)?)
}

pub fn can_fast_forward(path: &str, target: &str, source: &str) -> AppResult<bool> {
    let repo = super::repo::open(path)?;
    let target_oid = resolve_branch_ref(&repo, target)?.peel_to_commit()?.id();
    let source_oid = resolve_branch_ref(&repo, source)?.peel_to_commit()?.id();
    let (target_unique, source_unique) = repo.graph_ahead_behind(target_oid, source_oid)?;
    Ok(target_unique == 0 && source_unique > 0)
}

fn fast_forward_and_checkout(
    repo: &Repository,
    local_name: &str,
    target: &git2::Commit,
) -> AppResult<()> {
    let refname = format!("refs/heads/{local_name}");
    let mut builder = CheckoutBuilder::new();
    builder.safe();
    repo.checkout_tree(target.as_object(), Some(&mut builder))?;
    repo.reference(
        &refname,
        target.id(),
        true,
        &format!("checkout: fast-forward {local_name} to its upstream"),
    )?;
    repo.set_head(&refname)?;
    Ok(())
}

fn do_checkout(repo: &Repository, refname: &str) -> AppResult<()> {
    let obj = repo.revparse_single(refname)?;
    let mut builder = CheckoutBuilder::new();
    builder.safe();
    repo.checkout_tree(&obj, Some(&mut builder))?;
    repo.set_head(refname)?;
    Ok(())
}

pub fn checkout_detached(path: &str, rev: &str) -> AppResult<()> {
    let repo = super::repo::open(path)?;
    let obj = repo.revparse_single(rev)?;
    let commit = obj.peel(git2::ObjectType::Commit)?;
    let mut builder = CheckoutBuilder::new();
    builder.safe();
    repo.checkout_tree(&commit, Some(&mut builder))?;
    repo.set_head_detached(commit.id())?;
    Ok(())
}

pub fn fast_forward(path: &str, target: &str, source: &str) -> AppResult<OpOutcome> {
    let repo = super::repo::open(path)?;
    if target.starts_with("refs/") && !target.starts_with("refs/heads/") {
        return Err(AppError::other("目标必须是本地分支"));
    }
    let local_name = target.strip_prefix("refs/heads/").unwrap_or(target);
    let target_ref = repo
        .find_branch(local_name, BranchType::Local)?
        .into_reference();
    let refname = target_ref
        .name()
        .ok_or_else(|| AppError::other("目标分支名称无效"))?;
    let target_oid = target_ref
        .target()
        .ok_or_else(|| AppError::other("目标必须是本地直接分支"))?;
    let source_ref = if source.starts_with("refs/") {
        repo.find_reference(source)?
    } else {
        resolve_branch_ref(&repo, source)?
    };
    let source_ref = source_ref.resolve()?;
    if !source_ref
        .name()
        .is_some_and(|name| name.starts_with("refs/heads/") || name.starts_with("refs/remotes/"))
    {
        return Err(AppError::other("来源必须是本地或远端跟踪分支"));
    }
    let source_commit = source_ref.peel_to_commit()?;
    refuse_if_checked_out_elsewhere(&repo, local_name)?;
    if target_oid == source_commit.id() {
        return Ok(OpOutcome {
            status: "up_to_date".into(),
            message: format!("{target} 已与 {source} 保持最新"),
        });
    }
    if !repo.graph_descendant_of(source_commit.id(), target_oid)? {
        return Err(AppError::other(format!(
            "无法将 {target} 严格快进到 {source}：目标分支包含来源分支没有的提交"
        )));
    }
    if repo.head()?.name() == Some(refname) {
        let mut builder = CheckoutBuilder::new();
        builder.safe();
        repo.checkout_tree(source_commit.as_object(), Some(&mut builder))?;
    }
    // Refuse to overwrite a target moved by another process since the ancestor check.
    repo.reference_matching(
        refname,
        source_commit.id(),
        true,
        target_oid,
        &format!("fast-forward {target} to {source}"),
    )?;
    Ok(OpOutcome {
        status: "fast_forward".into(),
        message: format!("已将 {target} 快进到 {source}"),
    })
}

pub fn merge(path: &str, branch: &str, no_ff: bool) -> AppResult<OpOutcome> {
    let repo = super::repo::open(path)?;
    let reference = resolve_branch_ref(&repo, branch)?;
    let annotated = repo.reference_to_annotated_commit(&reference)?;
    let (analysis, _pref) = repo.merge_analysis(&[&annotated])?;

    if analysis.is_up_to_date() {
        return Ok(OpOutcome {
            status: "up_to_date".into(),
            message: format!("已与 {branch} 保持最新"),
        });
    }

    if analysis.is_fast_forward() && !no_ff {
        let target = annotated.id();
        let target_commit = repo.find_commit(target)?;
        let mut builder = CheckoutBuilder::new();
        builder.safe();
        repo.checkout_tree(target_commit.as_object(), Some(&mut builder))?;
        let mut head_ref = repo.head()?;
        head_ref.set_target(target, &format!("fast-forward merge {branch}"))?;
        return Ok(OpOutcome {
            status: "fast_forward".into(),
            message: format!("已快进到 {branch}"),
        });
    }

    let sig = super::commit::default_signature(&repo)?;
    repo.merge(&[&annotated], None, None)?;
    let index = repo.index()?;
    if index.has_conflicts() {
        return Ok(OpOutcome {
            status: "conflicts".into(),
            message: format!("合并 {branch} 存在待解决的冲突"),
        });
    }

    let mut index = repo.index()?;
    let tree = repo.find_tree(index.write_tree()?)?;
    let head_ref = repo.head()?;
    let into = head_ref.shorthand().unwrap_or("HEAD").to_string();
    let head_commit = head_ref.peel_to_commit()?;
    let their_commit = reference.peel_to_commit()?;
    super::sign::create_commit(
        &repo,
        Some("HEAD"),
        &sig,
        &sig,
        &format!("Merge branch '{branch}' into {into}"),
        &tree,
        &[&head_commit, &their_commit],
    )?;
    repo.cleanup_state()?;
    Ok(OpOutcome {
        status: "ok".into(),
        message: format!("已合并 {branch}"),
    })
}

pub fn abort_merge(path: &str) -> AppResult<()> {
    let repo = super::repo::open(path)?;
    let head = repo.head()?.peel(git2::ObjectType::Commit)?;
    repo.reset(&head, ResetType::Hard, None)?;
    repo.cleanup_state()?;
    Ok(())
}

pub fn rebase(path: &str, upstream: &str) -> AppResult<OpOutcome> {
    let repo = super::repo::open(path)?;
    let reference = resolve_branch_ref(&repo, upstream)?;
    let upstream_annotated = repo.reference_to_annotated_commit(&reference)?;
    let sig = repo.signature()?;

    let mut opts = git2::RebaseOptions::new();
    let mut rebase = repo.rebase(None, Some(&upstream_annotated), None, Some(&mut opts))?;

    while let Some(op) = rebase.next() {
        if let Err(error) = op {
            return Err(stopped_step(&repo, &mut rebase, error));
        }
        let index = repo.index()?;
        if index.has_conflicts() {
            return Ok(OpOutcome {
                status: "conflicts".into(),
                message: "变基因冲突暂停。请解决冲突后继续。".into(),
            });
        }
        match rebase.commit(None, &sig, None) {
            Ok(_) => {}
            Err(e) if e.code() == git2::ErrorCode::Applied => {}
            Err(e) => return Err(e.into()),
        }
    }
    rebase.finish(Some(&sig))?;
    Ok(OpOutcome {
        status: "ok".into(),
        message: format!("已变基到 {upstream}"),
    })
}

pub fn rebase_continue(path: &str) -> AppResult<OpOutcome> {
    let repo = super::repo::open(path)?;
    let sig = repo.signature()?;
    let mut rebase = repo.open_rebase(None)?;
    if reapply_stopped_step(&repo, &mut rebase)? {
        return Ok(OpOutcome {
            status: "conflicts".into(),
            message: "变基因冲突暂停。请解决冲突后继续。".into(),
        });
    }

    {
        let index = repo.index()?;
        if index.has_conflicts() {
            return Ok(OpOutcome {
                status: "conflicts".into(),
                message: "冲突仍未解决。".into(),
            });
        }
    }
    match rebase.commit(None, &sig, None) {
        Ok(_) => {}
        Err(e) if e.code() == git2::ErrorCode::Applied => {}
        Err(e) => return Err(e.into()),
    }

    while let Some(op) = rebase.next() {
        if let Err(error) = op {
            return Err(stopped_step(&repo, &mut rebase, error));
        }
        let index = repo.index()?;
        if index.has_conflicts() {
            return Ok(OpOutcome {
                status: "conflicts".into(),
                message: "变基因冲突暂停。请解决冲突后继续。".into(),
            });
        }
        match rebase.commit(None, &sig, None) {
            Ok(_) => {}
            Err(e) if e.code() == git2::ErrorCode::Applied => {}
            Err(e) => return Err(e.into()),
        }
    }
    rebase.finish(Some(&sig))?;
    Ok(OpOutcome {
        status: "ok".into(),
        message: "变基完成".into(),
    })
}

const STOPPED_STEP_MARK: &str = "angkorgit-stopped-step";

fn stopped_step_mark(repo: &Repository) -> std::path::PathBuf {
    repo.path().join("rebase-merge").join(STOPPED_STEP_MARK)
}

fn current_step_commit<'r>(
    repo: &'r Repository,
    rebase: &mut git2::Rebase<'_>,
) -> Option<git2::Commit<'r>> {
    let index = rebase.operation_current()?;
    let id = rebase.nth(index)?.id();
    repo.find_commit(id).ok()
}

fn paths_in_the_way(repo: &Repository, commit: &git2::Commit<'_>) -> Vec<String> {
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
    let Ok(tree) = commit.tree() else {
        return Vec::new();
    };
    let Ok(diff) = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None) else {
        return Vec::new();
    };
    let touched: std::collections::HashSet<std::path::PathBuf> = diff
        .deltas()
        .flat_map(|delta| [delta.old_file().path(), delta.new_file().path()])
        .flatten()
        .map(std::path::Path::to_path_buf)
        .collect();
    let mut options = git2::StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);
    let Ok(statuses) = repo.statuses(Some(&mut options)) else {
        return Vec::new();
    };
    let mut paths: Vec<String> = statuses
        .iter()
        .filter_map(|entry| entry.path().map(str::to_string))
        .filter(|path| touched.contains(std::path::Path::new(path)))
        .collect();
    paths.sort();
    paths
}

fn stopped_step(repo: &Repository, rebase: &mut git2::Rebase<'_>, error: git2::Error) -> AppError {
    if repo.path().join("rebase-merge").is_dir() {
        let _ = std::fs::write(stopped_step_mark(repo), "");
    }
    let Some(commit) = current_step_commit(repo, rebase) else {
        return error.into();
    };
    let paths = paths_in_the_way(repo, &commit);
    if paths.is_empty() {
        return error.into();
    }
    let short = commit.id().to_string()[..7].to_string();
    let summary = commit.summary().unwrap_or_default().to_string();
    let named = match paths.len() {
        1 => paths[0].clone(),
        2 => format!("{} 和 {}", paths[0], paths[1]),
        n if n <= 3 => format!("{}、{} 和 {}", paths[0], paths[1], paths[2]),
        n => format!("{}、{} 及另外 {} 个文件", paths[0], paths[1], n - 2),
    };
    let it = if paths.len() == 1 {
        "该文件"
    } else {
        "这些文件"
    };
    AppError::other(format!(
        "变基在提交 {short} \"{summary}\" 处停止，因为 {named} 阻碍了操作。请移走或提交{it}，然后继续变基。"
    ))
}

fn reapply_stopped_step(repo: &Repository, rebase: &mut git2::Rebase<'_>) -> AppResult<bool> {
    let mark = stopped_step_mark(repo);
    if !mark.exists() {
        return Ok(false);
    }
    let Some(commit) = current_step_commit(repo, rebase) else {
        let _ = std::fs::remove_file(&mark);
        return Ok(false);
    };
    let head = repo.head()?.peel_to_commit()?;
    let mut merged = repo.cherrypick_commit(&commit, &head, 0, None)?;
    let conflicts = merged.has_conflicts();
    let mut checkout = CheckoutBuilder::new();
    checkout.safe();
    if conflicts {
        checkout.allow_conflicts(true).conflict_style_merge(true);
    }
    if let Err(error) = repo.checkout_index(Some(&mut merged), Some(&mut checkout)) {
        return Err(stopped_step(repo, rebase, error));
    }
    let mut index = repo.index()?;
    index.clear()?;
    for entry in merged.iter() {
        index.add(&entry)?;
    }
    index.write()?;
    let _ = std::fs::remove_file(&mark);
    Ok(conflicts)
}

pub fn rebase_abort(path: &str) -> AppResult<()> {
    let repo = super::repo::open(path)?;
    let mut rebase = repo.open_rebase(None)?;
    rebase.abort()?;
    Ok(())
}

const MAX_INTERACTIVE_COMMITS: usize = 500;

pub fn rebase_commits(path: &str, base: &str) -> AppResult<Vec<CommitInfo>> {
    let repo = super::repo::open(path)?;
    let base_oid = git2::Oid::from_str(base)?;
    let head = repo.head()?.peel_to_commit()?;
    if head.id() == base_oid {
        return Ok(Vec::new());
    }
    let decorations = std::collections::HashMap::new();
    let head_oid = Some(head.id());
    let mut commits = Vec::new();
    let mut current = head;
    loop {
        if current.parent_count() > 1 {
            return Err(AppError::other(format!(
                "“{}”是一个合并提交——不支持跨合并的交互式变基",
                current.summary().unwrap_or("")
            )));
        }
        commits.push(super::history::commit_info(
            &repo,
            &current,
            &decorations,
            head_oid,
        ));
        if commits.len() > MAX_INTERACTIVE_COMMITS {
            return Err(AppError::other("变基范围过大——请选择更近的基础提交"));
        }
        let parent = current
            .parent(0)
            .map_err(|_| AppError::other("所选基础提交不是 HEAD 的第一父级祖先"))?;
        if parent.id() == base_oid {
            break;
        }
        current = parent;
    }
    Ok(commits)
}

fn ensure_tracked_clean(repo: &Repository) -> AppResult<()> {
    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(false).include_ignored(false);
    let statuses = repo.statuses(Some(&mut opts))?;
    if !statuses.is_empty() {
        return Err(AppError::other("工作区有未提交的更改——请先提交或暂存"));
    }
    Ok(())
}

pub fn rebase_interactive(path: &str, base: &str, todo: &[RebaseTodoEntry]) -> AppResult<String> {
    let repo = super::repo::open(path)?;
    let sig = super::commit::default_signature(&repo)?;
    ensure_tracked_clean(&repo)?;

    let range = rebase_commits(path, base)?;
    let allowed: std::collections::HashSet<&str> = range.iter().map(|c| c.oid.as_str()).collect();
    let mut seen = std::collections::HashSet::new();
    for entry in todo {
        if !allowed.contains(entry.oid.as_str()) {
            return Err(AppError::other("变基计划包含变基范围之外的提交"));
        }
        if !seen.insert(entry.oid.as_str()) {
            return Err(AppError::other("变基计划中某个提交出现了两次"));
        }
        if !matches!(
            entry.action.as_str(),
            "pick" | "reword" | "squash" | "fixup" | "drop"
        ) {
            return Err(AppError::other(format!("未知的变基操作：{}", entry.action)));
        }
    }

    let base_commit = repo.find_commit(git2::Oid::from_str(base)?)?;
    let mut parent = base_commit;
    let mut built_any = false;
    for entry in todo {
        if entry.action == "drop" {
            continue;
        }
        let commit = repo.find_commit(git2::Oid::from_str(&entry.oid)?)?;
        let mut index = repo.cherrypick_commit(&commit, &parent, 0, None)?;
        if index.has_conflicts() {
            return Err(AppError::Conflict(format!(
                "“{}”在此位置会产生冲突——请重新排序或丢弃它（未做任何更改）",
                commit.summary().unwrap_or("")
            )));
        }
        let tree = repo.find_tree(index.write_tree_to(&repo)?)?;
        let squashing = matches!(entry.action.as_str(), "squash" | "fixup");
        if squashing {
            if !built_any {
                return Err(AppError::other(
                    "无法压缩第一个提交——没有更早的提交可供合并",
                ));
            }
            let message = if entry.action == "fixup" {
                parent.message().unwrap_or("").to_string()
            } else {
                match entry.message.as_deref().map(str::trim) {
                    Some(m) if !m.is_empty() => m.to_string(),
                    _ => format!(
                        "{}\n\n{}",
                        parent.message().unwrap_or("").trim_end(),
                        commit.message().unwrap_or("")
                    ),
                }
            };
            let grandparents: Vec<git2::Commit> = parent.parents().collect();
            let parent_refs: Vec<&git2::Commit> = grandparents.iter().collect();
            let oid = repo.commit(None, &parent.author(), &sig, &message, &tree, &parent_refs)?;
            parent = repo.find_commit(oid)?;
        } else {
            let message = match entry.message.as_deref().map(str::trim) {
                Some(m) if entry.action == "reword" && !m.is_empty() => m.to_string(),
                _ => commit.message().unwrap_or("").to_string(),
            };
            let oid = repo.commit(None, &commit.author(), &sig, &message, &tree, &[&parent])?;
            parent = repo.find_commit(oid)?;
            built_any = true;
        }
    }

    repo.reset(parent.as_object(), ResetType::Hard, None)?;
    Ok(parent.id().to_string())
}

fn is_trailer_line(line: &str) -> bool {
    if line.starts_with(' ') || line.starts_with('\t') {
        return true;
    }
    if line.starts_with("(cherry picked from commit ") && line.trim_end().ends_with(')') {
        return true;
    }
    match line.split_once(':') {
        Some((key, _)) => {
            !key.is_empty() && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        }
        None => false,
    }
}

fn ends_with_trailer_block(message: &str) -> bool {
    let trimmed = message.trim_end_matches('\n');
    let Some((_, footer)) = trimmed.rsplit_once("\n\n") else {
        return false;
    };
    let mut lines = footer.lines().filter(|line| !line.trim().is_empty());
    let Some(first) = lines.next() else {
        return false;
    };
    is_trailer_line(first) && lines.all(is_trailer_line)
}

fn append_pick_origin(message: &str, oid: git2::Oid) -> String {
    let mut result = message.to_string();
    if !result.is_empty() && !result.ends_with('\n') {
        result.push('\n');
    }
    if !ends_with_trailer_block(&result) {
        result.push('\n');
    }
    result.push_str(&format!("(cherry picked from commit {oid})\n"));
    result
}

pub fn cherry_pick(path: &str, oid: &str, record_origin: bool) -> AppResult<OpOutcome> {
    let repo = super::repo::open(path)?;
    let sig = super::commit::default_signature(&repo)?;
    let commit = repo.find_commit(git2::Oid::from_str(oid)?)?;
    repo.cherrypick(&commit, None)?;

    let index = repo.index()?;
    if index.has_conflicts() {
        return Ok(OpOutcome {
            status: "conflicts".into(),
            message: "拣选存在待解决的冲突".into(),
        });
    }

    let mut index = repo.index()?;
    let tree = repo.find_tree(index.write_tree()?)?;
    let head_commit = repo.head()?.peel_to_commit()?;
    let author = commit.author().to_owned();
    let base_message = commit.message().unwrap_or("cherry-pick");
    let message = if record_origin {
        append_pick_origin(base_message, commit.id())
    } else {
        base_message.to_string()
    };
    repo.commit(
        Some("HEAD"),
        &author,
        &sig,
        &message,
        &tree,
        &[&head_commit],
    )?;
    repo.cleanup_state()?;
    Ok(OpOutcome {
        status: "ok".into(),
        message: format!("已拣选 {}", &oid[..8.min(oid.len())]),
    })
}

pub fn cherry_pick_many(path: &str, oids: &[String], record_origin: bool) -> AppResult<OpOutcome> {
    if oids.is_empty() {
        return Err(AppError::other("没有可拣选的提交"));
    }
    if oids.len() == 1 {
        return cherry_pick(path, &oids[0], record_origin);
    }
    for (applied, oid) in oids.iter().enumerate() {
        let outcome = cherry_pick(path, oid, record_origin)?;
        if outcome.status == "conflicts" {
            let short = &oid[..8.min(oid.len())];
            let remaining = oids.len() - applied - 1;
            let rest = match remaining {
                0 => String::new(),
                1 => "；另有 1 个提交正在等待".into(),
                n => format!("；另有 {n} 个提交正在等待"),
            };
            return Ok(OpOutcome {
                status: "conflicts".into(),
                message: format!(
                    "已拣选 {applied}/{} 个提交。{short} 存在待解决的冲突{rest}",
                    oids.len()
                ),
            });
        }
    }
    Ok(OpOutcome {
        status: "ok".into(),
        message: format!("已拣选 {} 个提交", oids.len()),
    })
}

pub fn reset(path: &str, oid: &str, mode: &str) -> AppResult<()> {
    let repo = super::repo::open(path)?;
    let obj = repo.find_object(git2::Oid::from_str(oid)?, None)?;
    let kind = match mode {
        "soft" => ResetType::Soft,
        "mixed" => ResetType::Mixed,
        "hard" => ResetType::Hard,
        _ => return Err(AppError::other(format!("未知的重置模式：{mode}"))),
    };
    repo.reset(&obj, kind, None)?;
    Ok(())
}
