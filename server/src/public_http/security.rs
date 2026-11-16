//! The headers that tell browsers what the site's pages and files may do, so that injected markup
//! cannot run scripts, load content from other sites, or put the site in another site's frame.

use axum::http::{HeaderValue, header};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use sha2::{Digest, Sha256};
use std::sync::LazyLock;

/// The origin of the Vite server that "bun run dev" starts (see "packages/client/vite.config.ts").
/// The development templates load the client from it.
const VITE_DEV_ORIGIN: &str = "http://localhost:5173";
/// The origin that chat loads Discord emotes from (see "packages/client/src/chatText.ts").
const DISCORD_EMOJI_ORIGIN: &str = "https://cdn.discordapp.com";

/// The directives that development and production share. React and Konva set inline styles, so
/// styles may be inline. The style sheets and cursors use `data:` images.
const SHARED_DIRECTIVES: &str =
    "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

/// The content security policy of the production site. The pages have two inline scripts, which
/// are allowed by their hashes: the script that applies the cached theme, and the `onload` handler
/// that loads the main style sheet without blocking the first render.
static POLICY: LazyLock<HeaderValue> = LazyLock::new(|| {
    let theme_script = regex!(r#"(?s)<script type="text/javascript">(.*?)</script>"#)
        .captures(include_str!("../../templates/theme-init.html"))
        .expect("the theme script")[1]
        .to_owned();
    let style_handler = regex!(r#"(?s)\sonload="([^"]*)""#)
        .captures(include_str!("../../templates/layout.html"))
        .expect("the style sheet handler")[1]
        .to_owned();
    header_value(format!(
        "default-src 'self'; script-src 'self' '{}' 'unsafe-hashes' '{}'; \
         style-src 'self' 'unsafe-inline'; img-src 'self' data: {DISCORD_EMOJI_ORIGIN}; \
         {SHARED_DIRECTIVES}",
        hash(&theme_script),
        hash(&style_handler),
    ))
});

/// The content security policy of a development server. Vite injects inline scripts and connects
/// to its own server.
static DEV_POLICY: LazyLock<HeaderValue> = LazyLock::new(|| {
    let vite_socket = VITE_DEV_ORIGIN.replace("http:", "ws:");
    header_value(format!(
        "default-src 'self' {VITE_DEV_ORIGIN} {vite_socket}; \
         script-src 'self' 'unsafe-inline' {VITE_DEV_ORIGIN}; \
         style-src 'self' 'unsafe-inline' {VITE_DEV_ORIGIN}; \
         img-src 'self' data: {VITE_DEV_ORIGIN} {DISCORD_EMOJI_ORIGIN}; {SHARED_DIRECTIVES}"
    ))
});

fn header_value(policy: String) -> HeaderValue {
    HeaderValue::try_from(policy).expect("a valid header value")
}

/// The source expression that allows an inline script by its content.
pub(super) fn hash(script: &str) -> String {
    format!(
        "sha256-{}",
        STANDARD.encode(Sha256::digest(script.as_bytes()))
    )
}

/// Adds the security headers to a response.
pub(super) async fn headers(
    axum::extract::State(is_dev): axum::extract::State<bool>,
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        if is_dev { &*DEV_POLICY } else { &*POLICY }.clone(),
    );
    response
}
