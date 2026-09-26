use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Git(#[from] git2::Error),
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Other(String),
    #[error("没有打开任何仓库")]
    NoRepository,
    #[error("操作将产生冲突：{0}")]
    Conflict(String),
}

const HTTP_STATUS_MARKER: &str = "unexpected http status code: ";

impl AppError {
    pub fn other(message: impl Into<String>) -> Self {
        AppError::Other(message.into())
    }

    fn http_status(&self) -> Option<u16> {
        let AppError::Git(error) = self else {
            return None;
        };
        let rest = error
            .message()
            .split(HTTP_STATUS_MARKER)
            .nth(1)?
            .to_string();
        let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
        digits.parse().ok()
    }

    fn is_non_fast_forward(&self) -> bool {
        matches!(self, AppError::Git(error) if error.code() == git2::ErrorCode::NotFastForward)
    }

    fn message(&self) -> String {
        if self.is_non_fast_forward() {
            return "远端已有本分支没有的提交。请先用变基拉取将其取回；若你改写过已推送的提交（修订或变基），则改用强制推送。".to_string();
        }
        match self.http_status() {
            Some(401) => "HTTP 401——主机拒绝了凭据。 如果此远端使用 \
                          关联账户，其令牌可能已过期或被吊销—— \
                          请在“设置 → 身份验证”中重新连接。"
                .to_string(),
            Some(402) => "HTTP 402——主机拒绝写入，因为账户或工作区 \
                          超出套餐限制或存在计费问题。在 Bitbucket Cloud 上， \
                          超出用户上限的免费工作区会让所有私有仓库 \
                          变为只读；公共仓库仍可推送。"
                .to_string(),
            Some(403) => "HTTP 403——主机接受了你的身份但拒绝了该操作。 \
                          通常是令牌缺少写入权限范围，或账户没有 \
                          此仓库的写入权限。"
                .to_string(),
            _ => self.to_string(),
        }
    }

    fn code(&self) -> &'static str {
        if let Some(status) = self.http_status() {
            return match status {
                401 => "auth",
                402 => "plan_limit",
                403 => "forbidden",
                _ => "git",
            };
        }
        match self {
            AppError::Git(e) => match e.code() {
                git2::ErrorCode::Conflict => "conflict",
                git2::ErrorCode::Auth => "auth",
                git2::ErrorCode::NotFound => "not_found",
                git2::ErrorCode::Exists => "exists",
                git2::ErrorCode::NotFastForward => "non_fast_forward",
                git2::ErrorCode::Unmerged | git2::ErrorCode::MergeConflict => "conflict",
                _ => "git",
            },
            AppError::Io(e) => match e.kind() {
                std::io::ErrorKind::NotFound => "not_found",
                _ => "io",
            },
            AppError::Other(_) => "other",
            AppError::NoRepository => "no_repository",
            AppError::Conflict(_) => "conflict",
        }
    }
}

#[derive(Serialize)]
struct ErrorPayload<'a> {
    code: &'a str,
    message: String,
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        ErrorPayload {
            code: self.code(),
            message: self.message(),
        }
        .serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    fn git_error(message: &str) -> AppError {
        AppError::Git(git2::Error::from_str(message))
    }

    #[test]
    fn extracts_http_status_from_libgit2_message() {
        assert_eq!(
            git_error("unexpected http status code: 402").http_status(),
            Some(402)
        );
        assert_eq!(
            git_error("unexpected http status code: 403; class=Http (34)").http_status(),
            Some(403)
        );
    }

    #[test]
    fn non_fast_forward_pushes_get_a_next_step_instead_of_the_libgit2_text() {
        let error = AppError::Git(git2::Error::new(
            git2::ErrorCode::NotFastForward,
            git2::ErrorClass::Reference,
            "cannot push non-fastforwardable reference",
        ));
        assert_eq!(error.code(), "non_fast_forward");
        assert!(error.message().contains("变基拉取"));
        assert!(error.message().contains("强制推送"));
        assert!(!error.message().contains("non-fastforwardable"));
    }

    #[test]
    fn plain_git_errors_have_no_http_status() {
        assert_eq!(git_error("找不到引用").http_status(), None);
        assert_eq!(AppError::NoRepository.http_status(), None);
    }

    #[test]
    fn plan_limit_errors_are_explained() {
        let error = git_error("unexpected http status code: 402");
        assert_eq!(error.code(), "plan_limit");
        assert!(error.message().contains("套餐限制"));
        assert!(!error.message().contains("class=Http"));
    }

    #[test]
    fn unmapped_status_codes_keep_the_original_message() {
        let error = git_error("unexpected http status code: 500");
        assert_eq!(error.code(), "git");
        assert!(error.message().contains("500"));
    }

    #[test]
    fn missing_files_map_to_not_found_and_other_io_errors_stay_io() {
        let missing = AppError::Io(std::io::Error::new(std::io::ErrorKind::NotFound, "无文件"));
        assert_eq!(missing.code(), "not_found");
        let denied = AppError::Io(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "denied",
        ));
        assert_eq!(denied.code(), "io");
    }

    #[test]
    fn unauthorized_errors_hint_at_token_expiry() {
        let error = git_error("unexpected http status code: 401");
        assert_eq!(error.code(), "auth");
        assert!(error.message().contains("已过期"));
        assert!(error.message().contains("设置 → 身份验证"));
    }
}
