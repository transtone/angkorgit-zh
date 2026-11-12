use angkorgit_lib::test_api::{fetch, tag_delete_sources, tag_list};
use git2::{Oid, Repository, Signature};
use std::path::PathBuf;

struct Fixture {
    dir: PathBuf,
    local: Repository,
    remotes: Vec<Repository>,
    oid: Oid,
    other: Oid,
}

impl Fixture {
    fn new() -> Self {
        let dir = std::env::temp_dir().join(format!(
            "angkorgit-delete-tags-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let local = Repository::init(dir.join("local")).unwrap();
        let sig = Signature::now("Test", "test@example.com").unwrap();
        let tree = local
            .find_tree(local.treebuilder(None).unwrap().write().unwrap())
            .unwrap();
        let oid = local
            .commit(Some("HEAD"), &sig, &sig, "first", &tree, &[])
            .unwrap();
        let parent = local.find_commit(oid).unwrap();
        let other = local
            .commit(Some("HEAD"), &sig, &sig, "second", &tree, &[&parent])
            .unwrap();
        drop(parent);
        drop(tree);
        let mut remotes = Vec::new();
        for name in ["alpha", "beta"] {
            let remote = Repository::init_bare(dir.join(format!("{name}.git"))).unwrap();
            local
                .remote(name, remote.path().to_str().unwrap())
                .unwrap()
                .push(&["HEAD:refs/heads/main"], None)
                .unwrap();
            remote.set_head("refs/heads/main").unwrap();
            remotes.push(remote);
        }
        Self {
            dir,
            local,
            remotes,
            oid,
            other,
        }
    }

    fn path(&self) -> &str {
        self.local.workdir().unwrap().to_str().unwrap()
    }

    fn seed(&self, local: Oid, alpha: Oid, beta: Oid) {
        let sig = Signature::now("Test", "test@example.com").unwrap();
        for (repo, oid) in [
            (&self.local, local),
            (&self.remotes[0], alpha),
            (&self.remotes[1], beta),
        ] {
            repo.tag(
                "release/v1",
                &repo.find_object(oid, None).unwrap(),
                &sig,
                "annotated",
                true,
            )
            .unwrap();
        }
        for name in ["alpha", "beta"] {
            fetch(self.path(), name, true, false).unwrap();
        }
    }

    fn delete(&self) -> Result<String, String> {
        tag_delete_sources(self.path(), "release/v1", &self.oid.to_string())
            .map(|outcome| outcome.status)
            .map_err(|error| error.to_string())
    }

    fn tracking(&self, name: &str) -> String {
        let encoded: String = name.bytes().map(|byte| format!("{byte:02x}")).collect();
        format!("refs/angkorgit/remote-tags/{encoded}/tags/release/v1")
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

#[test]
fn deletes_local_and_two_annotated_remote_sources_without_refetch() {
    let f = Fixture::new();
    f.seed(f.oid, f.oid, f.oid);
    assert_eq!(f.delete().unwrap(), "ok");
    for repo in [&f.local, &f.remotes[0], &f.remotes[1]] {
        assert!(repo.find_reference("refs/tags/release/v1").is_err());
    }
    for name in ["alpha", "beta"] {
        assert!(f.local.find_reference(&f.tracking(name)).is_err());
    }
    assert!(tag_list(f.path()).unwrap().is_empty());
}

#[test]
fn preserves_same_name_sources_at_other_commit() {
    let f = Fixture::new();
    f.seed(f.other, f.oid, f.other);
    assert_eq!(f.delete().unwrap(), "ok");
    for repo in [&f.local, &f.remotes[1]] {
        assert_eq!(
            repo.find_reference("refs/tags/release/v1")
                .unwrap()
                .peel_to_commit()
                .unwrap()
                .id(),
            f.other
        );
    }
    assert!(f.remotes[0].find_reference("refs/tags/release/v1").is_err());
    assert!(f.local.find_reference(&f.tracking("alpha")).is_err());
    assert!(f.local.find_reference(&f.tracking("beta")).is_ok());
}

#[test]
fn network_failure_preserves_failed_tracking_and_attempts_other_sources() {
    let f = Fixture::new();
    f.seed(f.oid, f.oid, f.oid);
    f.local
        .remote_set_url("alpha", f.dir.join("missing.git").to_str().unwrap())
        .unwrap();
    let error = f.delete().unwrap_err();
    assert!(error.contains("alpha:"), "{error}");
    assert!(!error.contains("beta:"), "{error}");
    assert!(f.local.find_reference(&f.tracking("alpha")).is_ok());
    assert!(f.remotes[0].find_reference("refs/tags/release/v1").is_ok());
    assert!(f.local.find_reference(&f.tracking("beta")).is_err());
    assert!(f.remotes[1].find_reference("refs/tags/release/v1").is_err());
    assert!(f.local.find_reference("refs/tags/release/v1").is_err());
}

#[test]
fn stale_tracking_cannot_delete_moved_annotated_remote_tag() {
    let f = Fixture::new();
    f.seed(f.oid, f.oid, f.oid);
    let repo = &f.remotes[0];
    repo.tag(
        "release/v1",
        &repo.find_object(f.other, None).unwrap(),
        &Signature::now("Test", "test@example.com").unwrap(),
        "moved",
        true,
    )
    .unwrap();
    let error = f.delete().unwrap_err();
    assert!(error.contains("alpha:"), "{error}");
    assert_eq!(
        repo.find_reference("refs/tags/release/v1")
            .unwrap()
            .peel_to_commit()
            .unwrap()
            .id(),
        f.other
    );
    assert!(f.local.find_reference(&f.tracking("alpha")).is_ok());
    assert!(f.local.find_reference(&f.tracking("beta")).is_err());
}

#[test]
fn already_absent_remote_tag_cleans_stale_tracking() {
    let f = Fixture::new();
    f.seed(f.oid, f.oid, f.oid);
    f.remotes[0].tag_delete("release/v1").unwrap();
    assert_eq!(f.delete().unwrap(), "ok");
    assert!(f.local.find_reference(&f.tracking("alpha")).is_err());
    assert!(tag_list(f.path()).unwrap().is_empty());
}

#[test]
fn validates_push_endpoint_when_it_differs_from_fetch_endpoint() {
    let f = Fixture::new();
    f.seed(f.oid, f.oid, f.other);
    f.local
        .remote_set_pushurl("alpha", Some(f.remotes[1].path().to_str().unwrap()))
        .unwrap();
    let error = f.delete().unwrap_err();
    assert!(error.contains("alpha:"), "{error}");
    assert!(f.local.find_reference(&f.tracking("alpha")).is_ok());
    assert_eq!(
        f.remotes[1]
            .find_reference("refs/tags/release/v1")
            .unwrap()
            .peel_to_commit()
            .unwrap()
            .id(),
        f.other
    );
    assert!(f.remotes[0].find_reference("refs/tags/release/v1").is_ok());
}

#[test]
fn rejected_push_retains_tracking_and_reports_failure() {
    let f = Fixture::new();
    f.seed(f.oid, f.oid, f.oid);
    let lock = f.remotes[0].path().join("refs/tags/release/v1.lock");
    std::fs::write(&lock, "locked").unwrap();
    let error = f.delete().unwrap_err();
    assert!(error.contains("alpha:"), "{error}");
    assert!(f.remotes[0].find_reference("refs/tags/release/v1").is_ok());
    assert!(f.local.find_reference(&f.tracking("alpha")).is_ok());
    assert!(f.local.find_reference(&f.tracking("beta")).is_err());
    assert!(f.local.find_reference("refs/tags/release/v1").is_err());
    std::fs::remove_file(lock).unwrap();
}

#[test]
fn deletes_lightweight_sources_but_leaves_untracked_remote_tag() {
    let f = Fixture::new();
    for repo in [&f.local, &f.remotes[0], &f.remotes[1]] {
        repo.tag_lightweight("release/v1", &repo.find_object(f.oid, None).unwrap(), false)
            .unwrap();
    }
    fetch(f.path(), "alpha", true, false).unwrap();
    assert!(f.local.find_reference(&f.tracking("beta")).is_err());

    assert_eq!(f.delete().unwrap(), "ok");
    assert!(f.local.find_reference("refs/tags/release/v1").is_err());
    assert!(f.remotes[0].find_reference("refs/tags/release/v1").is_err());
    assert!(f.local.find_reference(&f.tracking("alpha")).is_err());
    assert_eq!(
        f.remotes[1]
            .find_reference("refs/tags/release/v1")
            .unwrap()
            .target(),
        Some(f.oid)
    );
    assert_eq!(f.delete().unwrap(), "skipped");
}

#[test]
fn local_only_tag_deletion_is_idempotent() {
    let f = Fixture::new();
    f.local
        .tag_lightweight(
            "release/v1",
            &f.local.find_object(f.oid, None).unwrap(),
            false,
        )
        .unwrap();

    assert_eq!(f.delete().unwrap(), "ok");
    assert!(f.local.find_reference("refs/tags/release/v1").is_err());
    assert_eq!(f.delete().unwrap(), "skipped");
}

#[test]
fn invalid_inputs_do_not_mutate_sources() {
    let f = Fixture::new();
    f.seed(f.oid, f.oid, f.oid);
    for name in ["", "../main", "v1:refs/heads/main", "v1^{}", "v1\n"] {
        assert!(
            tag_delete_sources(f.path(), name, &f.oid.to_string()).is_err(),
            "{name:?}"
        );
    }
    let tree = f.local.find_commit(f.oid).unwrap().tree_id().to_string();
    for oid in [
        "HEAD",
        "abc",
        "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
        "0000000000000000000000000000000000000000",
        tree.as_str(),
    ] {
        assert!(tag_delete_sources(f.path(), "release/v1", oid).is_err());
    }
    for repo in [&f.local, &f.remotes[0], &f.remotes[1]] {
        assert_eq!(
            repo.find_reference("refs/tags/release/v1")
                .unwrap()
                .peel_to_commit()
                .unwrap()
                .id(),
            f.oid
        );
    }
    for name in ["alpha", "beta"] {
        assert!(f.local.find_reference(&f.tracking(name)).is_ok());
    }
}
