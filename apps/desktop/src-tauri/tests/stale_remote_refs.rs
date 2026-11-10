use angkorgit_lib::test_api::{remote_delete_stale_ref, remote_stale_refs};
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
