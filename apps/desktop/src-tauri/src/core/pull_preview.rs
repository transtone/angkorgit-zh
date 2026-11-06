use std::collections::{BTreeSet, HashMap, HashSet};
use std::sync::{Mutex, OnceLock};

use git2::{BranchType, ErrorCode, Index, Oid, Repository, StatusOptions};

use crate::error::AppResult;

use super::types::PullPreview;

const CONFLICT_CACHE_LIMIT: usize = 64;

type ConflictKey = (String, Oid, Oid, bool);

fn conflict_cache() -> &'static Mutex<HashMap<ConflictKey, Vec<String>>> {
    static CACHE: OnceLock<Mutex<HashMap<ConflictKey, Vec<String>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn pull_preview(path: &str, remote_name: &str) -> AppResult<Option<PullPreview>> {
    let repo = super::repo::open(path)?;
    let Ok(head) = repo.head() else {
        return Ok(None);
    };
    if !head.is_branch() {
        return Ok(None);
    }
    let Some(branch_name) = head.shorthand().map(str::to_string) else {
        return Ok(None);
    };
    let branch = repo.find_branch(&branch_name, BranchType::Local)?;
    let Ok(source) = super::remote::pull_source(&repo, &branch, &branch_name, remote_name) else {
        return Ok(None);
    };
    let upstream = repo.find_branch(&source, BranchType::Remote)?;
    let (Some(local), Some(incoming)) = (branch.get().target(), upstream.get().target()) else {
        return Ok(None);
    };
    let (ahead, behind) = repo.graph_ahead_behind(local, incoming)?;
    let rebase = super::remote::pull_rebase_configured(&repo);
    let mut preview = PullPreview {
        source,
        ahead,
        behind,
        rebase,
        conflicts: Vec::new(),
        local_changes: Vec::new(),
    };
    if behind == 0 {
        return Ok(Some(preview));
    }
    let changed = incoming_paths(&repo, local, incoming)?;
    preview.local_changes = local_changes(&repo, &changed)?;
    if ahead > 0 {
        preview.conflicts = cached_conflicts(&repo, path, local, incoming, rebase)?;
    }
    Ok(Some(preview))
}

fn cached_conflicts(
    repo: &Repository,
    path: &str,
    local: Oid,
    incoming: Oid,
    rebase: bool,
) -> AppResult<Vec<String>> {
    let key = (path.to_string(), local, incoming, rebase);
    if let Some(hit) = conflict_cache().lock().unwrap().get(&key) {
        return Ok(hit.clone());
    }
    let found = if rebase {
        rebase_conflicts(repo, local, incoming)?
    } else {
        merge_conflicts(repo, local, incoming)?
    };
    let mut cache = conflict_cache().lock().unwrap();
    if cache.len() >= CONFLICT_CACHE_LIMIT {
        cache.clear();
    }
    cache.insert(key, found.clone());
    Ok(found)
}

fn merge_conflicts(repo: &Repository, local: Oid, incoming: Oid) -> AppResult<Vec<String>> {
    let ours = repo.find_commit(local)?;
    let theirs = repo.find_commit(incoming)?;
    let index = repo.merge_commits(&ours, &theirs, None)?;
    conflict_paths(&index)
}

fn rebase_conflicts(repo: &Repository, local: Oid, incoming: Oid) -> AppResult<Vec<String>> {
    let branch = repo.find_annotated_commit(local)?;
    let onto = repo.find_annotated_commit(incoming)?;
    let mut opts = git2::RebaseOptions::new();
    opts.inmemory(true);
    let mut rebase = repo.rebase(Some(&branch), Some(&onto), None, Some(&mut opts))?;
    let signature = match super::commit::default_signature(repo) {
        Ok(signature) => signature,
        Err(_) => git2::Signature::now("AngKorGit", "preview@angkorgit.app")?,
    };
    let mut found = Vec::new();
    loop {
        match rebase.next() {
            None => break,
            Some(Err(err)) => {
                let _ = rebase.abort();
                return Err(err.into());
            }
            Some(Ok(_)) => {}
        }
        let index = rebase.inmemory_index()?;
        if index.has_conflicts() {
            found = conflict_paths(&index)?;
            break;
        }
        match rebase.commit(None, &signature, None) {
            Ok(_) => {}
            Err(err) if err.code() == ErrorCode::Applied => {}
            Err(err) => {
                let _ = rebase.abort();
                return Err(err.into());
            }
        }
    }
    let _ = rebase.abort();
    Ok(found)
}

fn conflict_paths(index: &Index) -> AppResult<Vec<String>> {
    let mut paths = BTreeSet::new();
    for conflict in index.conflicts()? {
        let conflict = conflict?;
        if let Some(entry) = conflict.our.or(conflict.their).or(conflict.ancestor) {
            paths.insert(String::from_utf8_lossy(&entry.path).into_owned());
        }
    }
    Ok(paths.into_iter().collect())
}

fn incoming_paths(repo: &Repository, local: Oid, incoming: Oid) -> AppResult<HashSet<String>> {
    let base = repo.merge_base(local, incoming)?;
    let base_tree = repo.find_commit(base)?.tree()?;
    let incoming_tree = repo.find_commit(incoming)?.tree()?;
    let diff = repo.diff_tree_to_tree(Some(&base_tree), Some(&incoming_tree), None)?;
    let mut paths = HashSet::new();
    for delta in diff.deltas() {
        for file in [delta.old_file(), delta.new_file()] {
            if let Some(path) = file.path().and_then(|p| p.to_str()) {
                paths.insert(path.to_string());
            }
        }
    }
    Ok(paths)
}

fn local_changes(repo: &Repository, incoming: &HashSet<String>) -> AppResult<Vec<String>> {
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(false)
        .include_ignored(false);
    let statuses = repo.statuses(Some(&mut opts))?;
    let mut found = BTreeSet::new();
    for entry in statuses.iter() {
        let Some(path) = entry.path() else {
            continue;
        };
        if path.ends_with('/') {
            for hit in incoming.iter().filter(|p| p.starts_with(path)) {
                found.insert(hit.clone());
            }
        } else if incoming.contains(path) {
            found.insert(path.to_string());
        }
    }
    Ok(found.into_iter().collect())
}
