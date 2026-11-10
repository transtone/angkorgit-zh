use angkorgit_lib::test_api::{
    ref_fingerprint, remote_delete_stale_ref, remote_ref_status, remote_stale_refs, tag_list,
    TagSyncStatus,
};
use git2::{Oid, Repository, Signature};
use std::path::PathBuf;

struct Fixture {
    dir: PathBuf,
    local: Repository,
    remote: Repository,
    oid: Oid,
}

impl Fixture {
    fn new() -> Self {
        let dir = std::env::temp_dir().join(format!(
            "angkorgit-stale-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let remote = Repository::init_bare(dir.join("remote.git")).unwrap();
        let local = Repository::init(dir.join("local")).unwrap();
        let tree_oid = remote.treebuilder(None).unwrap().write().unwrap();
        let tree = remote.find_tree(tree_oid).unwrap();
        let sig = Signature::now("Test", "test@example.com").unwrap();
        let oid = remote
            .commit(Some("refs/heads/main"), &sig, &sig, "initial", &tree, &[])
            .unwrap();
        drop(tree);
        remote.set_head("refs/heads/main").unwrap();
        local
            .remote("origin", remote.path().to_str().unwrap())
            .unwrap()
            .fetch(&[] as &[&str], None, None)
            .unwrap();
        for branch in ["gone", "other"] {
            local
                .reference(&format!("refs/remotes/origin/{branch}"), oid, true, "test")
                .unwrap();
        }
        local
            .reference_symbolic(
                "refs/remotes/origin/HEAD",
                "refs/remotes/origin/main",
                true,
                "test",
            )
            .unwrap();
        Self {
            dir,
            local,
            remote,
            oid,
        }
    }

    fn path(&self) -> &str {
        self.local.workdir().unwrap().to_str().unwrap()
    }

    fn delete(&self, name: &str) -> Result<String, String> {
        remote_delete_stale_ref(self.path(), name, &self.oid.to_string())
            .map(|outcome| outcome.status)
            .map_err(|error| error.to_string())
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

#[test]
fn stale_detection_is_read_only_and_ignores_symbolic_refs() {
    let f = Fixture::new();
    f.local
        .reference_symbolic(
            "refs/remotes/origin/alias",
            "refs/remotes/origin/gone",
            true,
            "test",
        )
        .unwrap();
    assert_eq!(
        remote_stale_refs(f.path(), "origin").unwrap(),
        ["refs/remotes/origin/gone", "refs/remotes/origin/other"]
    );
    assert!(f.local.find_reference("refs/remotes/origin/gone").is_ok());
    assert!(f.local.find_reference("FETCH_HEAD").is_ok());
    assert!(f.delete("refs/remotes/origin/alias").is_err());
    assert!(f.delete("refs/remotes/origin/HEAD").is_err());
}

#[test]
fn combined_status_compares_direct_tag_objects_and_leaves_local_state_untouched() {
    let f = Fixture::new();
    let sig = Signature::now("Test", "test@example.com").unwrap();
    for repo in [&f.local, &f.remote] {
        for name in ["same", "different", "annotated-different", "annotated-same"] {
            repo.reference(&format!("refs/tags/{name}"), f.oid, true, "test")
                .unwrap();
        }
        let target = repo.find_object(f.oid, None).unwrap();
        repo.tag("annotated-same", &target, &sig, "same annotation", true)
            .unwrap();
        repo.tag(
            "annotated-different",
            &target,
            &sig,
            if repo.is_bare() {
                "remote annotation"
            } else {
                "local annotation"
            },
            true,
        )
        .unwrap();
    }
    f.local
        .reference("refs/tags/local-only", f.oid, true, "test")
        .unwrap();
    f.remote
        .reference("refs/tags/remote-only", f.oid, true, "test")
        .unwrap();
    let different = f.remote.blob(b"different object").unwrap();
    f.remote
        .reference("refs/tags/different", different, true, "test")
        .unwrap();
    let local_annotated = f
        .local
        .find_reference("refs/tags/annotated-different")
        .unwrap();
    let remote_annotated = f
        .remote
        .find_reference("refs/tags/annotated-different")
        .unwrap();
    assert_ne!(local_annotated.target(), remote_annotated.target());
    assert_eq!(
        local_annotated.peel_to_commit().unwrap().id(),
        remote_annotated.peel_to_commit().unwrap().id()
    );

    // Include dirty worktree/index state: this query must never fetch or check out anything.
    std::fs::write(f.local.workdir().unwrap().join("dirty.txt"), "staged").unwrap();
    let mut index = f.local.index().unwrap();
    index.add_path(std::path::Path::new("dirty.txt")).unwrap();
    index.write().unwrap();
    std::fs::write(f.local.workdir().unwrap().join("dirty.txt"), "unstaged").unwrap();
    let fingerprint = ref_fingerprint(f.path()).unwrap();
    let index_before = std::fs::read(f.local.path().join("index")).unwrap();
    let fetch_head_before = std::fs::read(f.local.path().join("FETCH_HEAD")).unwrap();
    let config_before = std::fs::read(f.local.path().join("config")).unwrap();
    let status = remote_ref_status(f.path(), "origin").unwrap();
    assert_eq!(
        status.stale_refs,
        ["refs/remotes/origin/gone", "refs/remotes/origin/other"]
    );
    let tags: Vec<_> = status
        .tags
        .iter()
        .map(|tag| (tag.name.as_str(), tag.status))
        .collect();
    assert_eq!(
        tags,
        [
            ("annotated-different", TagSyncStatus::Different),
            ("annotated-same", TagSyncStatus::Synced),
            ("different", TagSyncStatus::Different),
            ("local-only", TagSyncStatus::LocalOnly),
            ("same", TagSyncStatus::Synced),
        ]
    );
    assert_eq!(
        serde_json::to_value(&status).unwrap(),
        serde_json::json!({
            "staleRefs": ["refs/remotes/origin/gone", "refs/remotes/origin/other"],
            "tags": [
                {"name": "annotated-different", "status": "different"},
                {"name": "annotated-same", "status": "synced"},
                {"name": "different", "status": "different"},
                {"name": "local-only", "status": "localOnly"},
                {"name": "same", "status": "synced"}
            ]
        })
    );
    assert_eq!(ref_fingerprint(f.path()).unwrap(), fingerprint);
    assert_eq!(
        std::fs::read(f.local.path().join("index")).unwrap(),
        index_before
    );
    assert_eq!(
        std::fs::read(f.local.path().join("FETCH_HEAD")).unwrap(),
        fetch_head_before
    );
    assert_eq!(
        std::fs::read(f.local.path().join("config")).unwrap(),
        config_before
    );
    assert_eq!(
        std::fs::read_to_string(f.local.workdir().unwrap().join("dirty.txt")).unwrap(),
        "unstaged"
    );
}

#[test]
fn tag_list_reports_direct_oid_when_annotation_changes_without_target_or_message_change() {
    let f = Fixture::new();
    let target = f.local.find_object(f.oid, None).unwrap();
    f.local
        .tag_lightweight("lightweight", &target, false)
        .unwrap();
    let first_signer = Signature::now("First", "first@example.com").unwrap();
    let second_signer = Signature::now("Second", "second@example.com").unwrap();
    let first_oid = f
        .local
        .tag("annotated", &target, &first_signer, "same message", false)
        .unwrap();
    let before = tag_list(f.path()).unwrap();
    let first = before.iter().find(|tag| tag.name == "annotated").unwrap();
    let lightweight = before.iter().find(|tag| tag.name == "lightweight").unwrap();
    assert_eq!(first.ref_oid, first_oid.to_string());
    assert_eq!(lightweight.ref_oid, f.oid.to_string());
    let second_oid = f
        .local
        .tag("annotated", &target, &second_signer, "same message", true)
        .unwrap();
    assert_ne!(first_oid, second_oid);
    let after = tag_list(f.path()).unwrap();
    let second = after.iter().find(|tag| tag.name == "annotated").unwrap();
    assert_eq!(second.target_oid, first.target_oid);
    assert_eq!(second.message, first.message);
    assert_eq!(second.ref_oid, second_oid.to_string());
    assert_ne!(second.ref_oid, first.ref_oid);
    assert_eq!(
        serde_json::to_value(second).unwrap()["refOid"],
        second_oid.to_string()
    );
}

#[test]
fn deletion_removes_only_selected_tracking_ref() {
    let f = Fixture::new();
    f.local
        .reference("refs/heads/gone", f.oid, true, "test")
        .unwrap();
    f.local
        .reference("refs/tags/keep", f.oid, true, "test")
        .unwrap();
    assert_eq!(f.delete("refs/remotes/origin/gone").unwrap(), "ok");
    assert!(f.local.find_reference("refs/remotes/origin/gone").is_err());
    for name in [
        "refs/heads/gone",
        "refs/tags/keep",
        "refs/remotes/origin/other",
        "refs/remotes/origin/main",
        "refs/remotes/origin/HEAD",
    ] {
        assert!(f.local.find_reference(name).is_ok(), "{name} must remain");
    }
    assert!(f.remote.find_reference("refs/heads/main").is_ok());
}

#[test]
fn network_failure_never_reports_or_deletes_stale_refs() {
    let f = Fixture::new();
    f.local
        .remote_set_url("origin", f.dir.join("missing.git").to_str().unwrap())
        .unwrap();
    assert!(remote_ref_status(f.path(), "origin").is_err());
    assert!(remote_stale_refs(f.path(), "origin").is_err());
    assert!(f.delete("refs/remotes/origin/gone").is_err());
    assert!(f.local.find_reference("refs/remotes/origin/gone").is_ok());
}

#[test]
fn restored_remote_is_skipped() {
    let f = Fixture::new();
    assert!(remote_stale_refs(f.path(), "origin")
        .unwrap()
        .contains(&"refs/remotes/origin/gone".to_owned()));
    f.remote
        .reference("refs/heads/gone", f.oid, true, "restored")
        .unwrap();
    assert_eq!(f.delete("refs/remotes/origin/gone").unwrap(), "skipped");
    assert!(f.local.find_reference("refs/remotes/origin/gone").is_ok());
}

#[test]
fn changed_oid_invalid_refs_and_locks_are_rejected() {
    let f = Fixture::new();
    let blob = f.local.blob(b"changed").unwrap();
    f.local
        .reference("refs/remotes/origin/gone", blob, true, "changed")
        .unwrap();
    assert!(f.delete("refs/remotes/origin/gone").is_err());
    assert_eq!(
        f.local.refname_to_id("refs/remotes/origin/gone").unwrap(),
        blob
    );
    for name in [
        "refs/heads/main",
        "refs/tags/test",
        "refs/remotes/../main",
        "origin/gone",
        "refs/remotes/unowned/gone",
    ] {
        assert!(f.delete(name).is_err(), "must reject {name}");
    }
    let mut tx = f.local.transaction().unwrap();
    tx.lock_ref("refs/remotes/origin/other").unwrap();
    assert!(f.delete("refs/remotes/origin/other").is_err());
    assert!(f.local.find_reference("refs/remotes/origin/other").is_ok());
}

#[test]
fn custom_and_excluded_fetch_mappings_are_respected() {
    let f = Fixture::new();
    let mut config = f.local.config().unwrap();
    config
        .set_str("remote.origin.fetch", "+refs/heads/*:refs/remotes/custom/*")
        .unwrap();
    config
        .set_multivar("remote.origin.fetch", "^$", "^refs/heads/excluded*")
        .unwrap();
    for branch in ["main", "gone", "excluded-one"] {
        f.local
            .reference(
                &format!("refs/remotes/custom/{branch}"),
                f.oid,
                true,
                "test",
            )
            .unwrap();
    }
    assert_eq!(
        remote_stale_refs(f.path(), "origin").unwrap(),
        ["refs/remotes/custom/gone"]
    );
    assert!(f.delete("refs/remotes/custom/excluded-one").is_err());
    assert_eq!(f.delete("refs/remotes/custom/gone").unwrap(), "ok");
    assert!(f.delete("refs/remotes/origin/gone").is_err());
}

#[test]
fn overlapping_sources_and_owners_are_conservative() {
    let f = Fixture::new();
    f.local
        .remote_add_fetch("origin", "+refs/heads/main:refs/remotes/origin/gone")
        .unwrap();
    assert!(!remote_stale_refs(f.path(), "origin")
        .unwrap()
        .contains(&"refs/remotes/origin/gone".to_owned()));
    assert_eq!(f.delete("refs/remotes/origin/gone").unwrap(), "skipped");
    f.local
        .remote("second", f.remote.path().to_str().unwrap())
        .unwrap();
    f.local
        .remote_add_fetch("second", "+refs/heads/*:refs/remotes/origin/*")
        .unwrap();
    assert!(f.delete("refs/remotes/origin/other").is_err());
}
