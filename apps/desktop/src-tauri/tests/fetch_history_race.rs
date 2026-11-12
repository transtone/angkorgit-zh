use angkorgit_lib::test_api as core;
use git2::{Oid, Repository, Signature};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Barrier};

struct Fixture {
    dir: PathBuf,
    old: Oid,
    new: Oid,
}

impl Fixture {
    fn new() -> Self {
        let dir = std::env::temp_dir().join(format!(
            "angkorgit-fetch-history-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let remote = Repository::init_bare(dir.join("remote.git")).unwrap();
        let sig = Signature::now("Test", "test@example.com").unwrap();
        let tree_id = remote.treebuilder(None).unwrap().write().unwrap();
        let tree = remote.find_tree(tree_id).unwrap();
        let old = remote
            .commit(None, &sig, &sig, "chore(release): 0.27.0", &tree, &[])
            .unwrap();
        let parent = remote.find_commit(old).unwrap();
        let new = remote
            .commit(None, &sig, &sig, "Merge upstream/main", &tree, &[&parent])
            .unwrap();
        for (name, oid) in [
            ("refs/heads/main", old),
            ("refs/tags/v0.27.0", old),
            ("refs/tags/v0.27.1", new),
        ] {
            remote.reference(name, oid, true, "fixture").unwrap();
        }
        remote.set_head("refs/heads/main").unwrap();
        let local = Repository::init(dir.join("local")).unwrap();
        local
            .remote("upstream", remote.path().to_str().unwrap())
            .unwrap();
        let path = dir.join("local");
        core::fetch(path.to_str().unwrap(), "upstream", true, false).unwrap();
        local
            .reference("refs/heads/main", new, true, "fixture")
            .unwrap();
        local.set_head("refs/heads/main").unwrap();
        Self { dir, old, new }
    }

    fn run(&self, moving: bool) {
        let path = self.dir.join("local").to_str().unwrap().to_owned();
        let remote_path = self.dir.join("remote.git");
        let old = self.old.to_string();
        let new = self.new.to_string();
        let barrier = Arc::new(Barrier::new(5));
        let fetching = AtomicBool::new(false);
        let overlapping_reads = AtomicUsize::new(0);
        std::thread::scope(|scope| {
            let fetching = &fetching;
            let fetch_barrier = Arc::clone(&barrier);
            scope.spawn(move || {
                let remote = Repository::open_bare(remote_path).unwrap();
                fetch_barrier.wait();
                for i in 0..500 {
                    if moving {
                        let oid = if i % 2 == 0 { self.new } else { self.old };
                        remote
                            .reference("refs/heads/main", oid, true, "fixture move")
                            .unwrap();
                    }
                    fetching.store(true, Ordering::SeqCst);
                    core::fetch(&path, "upstream", true, false).unwrap();
                    fetching.store(false, Ordering::SeqCst);
                }
            });
            for reader in 0..4 {
                let barrier = Arc::clone(&barrier);
                let path = self.dir.join("local").to_str().unwrap().to_owned();
                let old = &old;
                let new = &new;
                let overlapping_reads = &overlapping_reads;
                scope.spawn(move || {
                    barrier.wait();
                    for iteration in 0..1500 {
                        let started_during_fetch = fetching.load(Ordering::SeqCst);
                        let page = core::history(
                            &path,
                            core::HistoryQuery {
                                skip: 0,
                                limit: 200,
                                search: None,
                                author: None,
                                branch: None,
                            },
                        )
                        .unwrap();
                        if started_during_fetch && fetching.load(Ordering::SeqCst) {
                            overlapping_reads.fetch_add(1, Ordering::SeqCst);
                        }
                        let mut refs = BTreeMap::new();
                        for commit in &page.commits {
                            for reference in &commit.refs {
                                assert!(
                                    refs.insert(reference.name.clone(), commit.oid.clone())
                                        .is_none(),
                                    "duplicate ref: reader {reader}, iteration {iteration}"
                                );
                            }
                        }
                        assert_eq!(
                            refs.get("refs/tags/v0.27.0"),
                            Some(old),
                            "reader {reader}, iteration {iteration}"
                        );
                        assert_eq!(
                            refs.get("refs/tags/v0.27.1"),
                            Some(new),
                            "reader {reader}, iteration {iteration}"
                        );
                        assert_eq!(
                            refs.get("refs/heads/main"),
                            Some(new),
                            "reader {reader}, iteration {iteration}"
                        );
                        let upstream = refs
                            .get("refs/remotes/upstream/main")
                            .expect("upstream must not disappear");
                        assert!(
                            upstream == old || (moving && upstream == new),
                            "unexpected upstream target"
                        );
                        assert_eq!(
                            refs.len(),
                            6,
                            "reader {reader}, iteration {iteration}: {refs:?}"
                        );
                    }
                });
            }
        });
        let overlaps = overlapping_reads.load(Ordering::SeqCst);
        assert!(overlaps > 0, "history reads must overlap fetch");
        println!("moving={moving}: 500 fetches, 6000 history reads, {overlaps} reads started and ended while fetching");
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

#[test]
fn conflicting_remote_tags_do_not_move_existing_local_tags() {
    let fixture = Fixture::new();
    let origin = git2::build::RepoBuilder::new()
        .bare(true)
        .clone(
            fixture.dir.join("remote.git").to_str().unwrap(),
            &fixture.dir.join("origin.git"),
        )
        .unwrap();
    origin
        .reference("refs/tags/v0.27.0", fixture.new, true, "fork tag")
        .unwrap();
    let local = Repository::open(fixture.dir.join("local")).unwrap();
    local
        .remote("origin", origin.path().to_str().unwrap())
        .unwrap();
    let path = fixture.dir.join("local").to_str().unwrap().to_owned();
    for remote in ["origin", "upstream", "origin", "upstream"] {
        core::fetch(&path, remote, true, false).unwrap();
        let page = core::history(
            &path,
            core::HistoryQuery {
                skip: 0,
                limit: 200,
                search: None,
                author: None,
                branch: None,
            },
        )
        .unwrap();
        let tag_commit = page
            .commits
            .iter()
            .find(|commit| {
                commit
                    .refs
                    .iter()
                    .any(|reference| reference.name == "refs/tags/v0.27.0")
            })
            .unwrap();
        assert_eq!(tag_commit.oid, fixture.old.to_string());
        for (source, expected) in [("origin", fixture.new), ("upstream", fixture.old)] {
            let decorated = page
                .commits
                .iter()
                .find(|commit| {
                    commit.refs.iter().any(|reference| {
                        reference.kind == "remoteTag"
                            && reference.shorthand == "v0.27.0"
                            && reference.remote.as_deref() == Some(source)
                    })
                })
                .unwrap();
            assert_eq!(
                decorated.oid,
                expected.to_string(),
                "{source} tag after fetching {remote}"
            );
        }
        let target = Repository::open(&path)
            .unwrap()
            .find_reference("refs/tags/v0.27.0")
            .unwrap()
            .target()
            .unwrap();
        println!("fetch {remote}: v0.27.0={target}");
        assert_eq!(
            target, fixture.old,
            "fetch {remote} must preserve the existing local tag"
        );
    }
}

#[test]
fn fetch_all_adds_tags_outside_branch_history_and_prunes_when_configured() {
    let fixture = Fixture::new();
    let remote = Repository::open_bare(fixture.dir.join("remote.git")).unwrap();
    let sig = Signature::now("Test", "test@example.com").unwrap();
    let tree_id = remote.treebuilder(None).unwrap().write().unwrap();
    let tree = remote.find_tree(tree_id).unwrap();
    let orphan = remote
        .commit(None, &sig, &sig, "tag-only history", &tree, &[])
        .unwrap();
    let object = remote.find_object(orphan, None).unwrap();
    remote
        .tag("orphan-annotated", &object, &sig, "release", false)
        .unwrap();
    remote
        .tag_lightweight("orphan-lightweight", &object, false)
        .unwrap();
    let local = Repository::open(fixture.dir.join("local")).unwrap();
    local
        .reference(
            "refs/remotes/upstream/deleted",
            fixture.old,
            true,
            "fixture",
        )
        .unwrap();
    local
        .config()
        .unwrap()
        .set_bool("remote.upstream.prune", true)
        .unwrap();
    let path = fixture.dir.join("local").to_str().unwrap().to_owned();
    core::fetch(&path, "upstream", true, false).unwrap();
    let local = Repository::open(&path).unwrap();
    let page = core::history(
        &path,
        core::HistoryQuery {
            skip: 0,
            limit: 200,
            search: None,
            author: None,
            branch: None,
        },
    )
    .unwrap();
    let orphan_commit = page
        .commits
        .iter()
        .find(|commit| commit.oid == orphan.to_string())
        .unwrap();
    assert!(orphan_commit.refs.iter().any(
        |reference| reference.kind == "remoteTag" && reference.shorthand == "orphan-annotated"
    ));
    for name in ["orphan-annotated", "orphan-lightweight"] {
        assert_eq!(
            local
                .find_reference(&format!("refs/tags/{name}"))
                .unwrap()
                .peel_to_commit()
                .unwrap()
                .id(),
            orphan
        );
    }
    for name in ["orphan-annotated", "orphan-lightweight"] {
        local
            .find_reference(&format!("refs/tags/{name}"))
            .unwrap()
            .delete()
            .unwrap();
    }
    let remote_only = core::history(
        &path,
        core::HistoryQuery {
            skip: 0,
            limit: 200,
            search: None,
            author: None,
            branch: None,
        },
    )
    .unwrap();
    assert!(remote_only
        .commits
        .iter()
        .any(|commit| commit.oid == orphan.to_string()
            && commit
                .refs
                .iter()
                .any(|reference| reference.kind == "remoteTag"
                    && reference.shorthand == "orphan-annotated")));
    assert!(core::history_position(&path, &orphan.to_string())
        .unwrap()
        .is_some());
    assert!(local
        .find_reference("refs/remotes/upstream/deleted")
        .is_err());
}

#[test]
fn remote_tag_deletion_is_pruned_without_branch_prune_and_preserves_local() {
    let fixture = Fixture::new();
    let path = fixture.dir.join("local").to_str().unwrap().to_owned();
    let remote = Repository::open_bare(fixture.dir.join("remote.git")).unwrap();
    let before = core::ref_fingerprint(&path).unwrap();
    remote
        .find_reference("refs/tags/v0.27.0")
        .unwrap()
        .delete()
        .unwrap();
    core::fetch(&path, "upstream", true, false).unwrap();
    let page = core::history(
        &path,
        core::HistoryQuery {
            skip: 0,
            limit: 200,
            search: None,
            author: None,
            branch: None,
        },
    )
    .unwrap();
    let refs: Vec<_> = page
        .commits
        .iter()
        .flat_map(|commit| &commit.refs)
        .collect();
    assert!(refs
        .iter()
        .any(|reference| reference.kind == "tag" && reference.shorthand == "v0.27.0"));
    assert!(!refs
        .iter()
        .any(|reference| reference.kind == "remoteTag" && reference.shorthand == "v0.27.0"));
    assert_ne!(before, core::ref_fingerprint(&path).unwrap());
}

#[test]
fn implicit_fetch_and_group_pull_ignore_overwriting_tag_option() {
    let fixture = Fixture::new();
    let path = fixture.dir.join("local").to_str().unwrap().to_owned();
    let remote = Repository::open_bare(fixture.dir.join("remote.git")).unwrap();
    remote
        .reference("refs/tags/v0.27.0", fixture.new, true, "move tag")
        .unwrap();
    let local = Repository::open(&path).unwrap();
    local
        .config()
        .unwrap()
        .set_str("remote.upstream.tagOpt", "--tags")
        .unwrap();
    local
        .find_branch("main", git2::BranchType::Local)
        .unwrap()
        .set_upstream(Some("upstream/main"))
        .unwrap();
    core::fetch(&path, "upstream", false, false).unwrap();
    assert_eq!(
        local.find_reference("refs/tags/v0.27.0").unwrap().target(),
        Some(fixture.old)
    );
    core::group_update(&path, true).unwrap();
    assert_eq!(
        local
            .find_reference("refs/angkorgit/remote-tags/757073747265616d/tags/v0.27.0")
            .unwrap()
            .target(),
        Some(fixture.new),
        "group pull must refresh isolated remote tags"
    );
    assert_eq!(
        local.find_reference("refs/tags/v0.27.0").unwrap().target(),
        Some(fixture.old)
    );
    core::group_update(&path, false).unwrap();
    assert_eq!(
        local.find_reference("refs/tags/v0.27.0").unwrap().target(),
        Some(fixture.old)
    );
    let page = core::history(
        &path,
        core::HistoryQuery {
            skip: 0,
            limit: 200,
            search: None,
            author: None,
            branch: None,
        },
    )
    .unwrap();
    assert!(page
        .commits
        .iter()
        .any(|commit| commit.oid == fixture.new.to_string()
            && commit.refs.iter().any(
                |reference| reference.kind == "remoteTag" && reference.shorthand == "v0.27.0"
            )));
}

#[test]
fn concurrent_remotes_keep_independent_tag_snapshots() {
    let fixture = Fixture::new();
    let origin = git2::build::RepoBuilder::new()
        .bare(true)
        .clone(
            fixture.dir.join("remote.git").to_str().unwrap(),
            &fixture.dir.join("origin.git"),
        )
        .unwrap();
    origin
        .reference("refs/tags/v0.27.0", fixture.new, true, "fork tag")
        .unwrap();
    origin
        .reference("refs/tags/origin-only", fixture.new, true, "fixture")
        .unwrap();
    let upstream = Repository::open_bare(fixture.dir.join("remote.git")).unwrap();
    upstream
        .reference("refs/tags/upstream-only", fixture.old, true, "fixture")
        .unwrap();
    let path = fixture.dir.join("local").to_str().unwrap().to_owned();
    let local = Repository::open(&path).unwrap();
    local
        .remote("origin", origin.path().to_str().unwrap())
        .unwrap();
    let barrier = Barrier::new(2);
    std::thread::scope(|scope| {
        for (remote, encoded, own, expected) in [
            ("origin", "6f726967696e", "origin-only", fixture.new),
            ("upstream", "757073747265616d", "upstream-only", fixture.old),
        ] {
            let path = &path;
            let barrier = &barrier;
            scope.spawn(move || {
                let repo = Repository::open(path).unwrap();
                barrier.wait();
                for _ in 0..50 {
                    core::fetch(path, remote, true, false).unwrap();
                    let prefix = format!("refs/angkorgit/remote-tags/{encoded}/tags/");
                    assert_eq!(
                        repo.find_reference(&format!("{prefix}v0.27.0"))
                            .unwrap()
                            .target(),
                        Some(expected)
                    );
                    assert_eq!(
                        repo.find_reference(&format!("{prefix}{own}"))
                            .unwrap()
                            .target(),
                        Some(expected)
                    );
                    let other = if remote == "origin" {
                        "upstream-only"
                    } else {
                        "origin-only"
                    };
                    assert!(repo.find_reference(&format!("{prefix}{other}")).is_err());
                }
            });
        }
    });
    assert_eq!(
        local.find_reference("refs/tags/v0.27.0").unwrap().target(),
        Some(fixture.old)
    );
}

#[test]
fn unchanged_fetch_does_not_change_history_refs() {
    Fixture::new().run(false);
}

#[test]
fn moving_fetch_keeps_historical_tags_on_their_commits() {
    Fixture::new().run(true);
}
