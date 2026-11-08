//! Strict query strings. Each endpoint lists the parameters it accepts, and a request that sends any
//! other parameter, or repeats one, is rejected instead of having the parameter ignored.

/// A query string's parameters, each accepted and named once.
#[derive(Debug, Default)]
pub struct Query(Vec<(String, String)>);

/// The largest form body, in bytes, that the account and localhost endpoints accept.
pub const MAX_FORM_BODY_BYTES: usize = 8 * 1024;

/// Longest parameter name that an error message repeats back.
const MAX_REPEATED_NAME: usize = 64;

impl Query {
    pub fn parse(raw: Option<&str>, accepted: &[&str]) -> Result<Self, String> {
        let mut parameters: Vec<(String, String)> = Vec::new();
        for (name, value) in url::form_urlencoded::parse(raw.unwrap_or_default().as_bytes()) {
            let shown: String = name.chars().take(MAX_REPEATED_NAME).collect();
            if !accepted.contains(&name.as_ref()) {
                return Err(if accepted.is_empty() {
                    format!("Unknown query parameter \"{shown}\": this URL takes no parameters.")
                } else {
                    format!(
                        "Unknown query parameter \"{shown}\". This URL takes: {}.",
                        accepted.join(", ")
                    )
                });
            }
            if parameters.iter().any(|(existing, _)| *existing == name) {
                return Err(format!(
                    "The query parameter \"{shown}\" appears more than once."
                ));
            }
            parameters.push((name.into_owned(), value.into_owned()));
        }
        Ok(Self(parameters))
    }

    pub fn get(&self, name: &str) -> Option<&str> {
        self.0
            .iter()
            .find(|(existing, _)| existing == name)
            .map(|(_, value)| value.as_str())
    }

    /// Whether a parameter that takes no value, such as `?dev`, is present.
    pub fn flag(&self, name: &str) -> Result<bool, String> {
        match self.get(name) {
            None => Ok(false),
            Some("") => Ok(true),
            Some(_) => Err(format!("The query parameter \"{name}\" takes no value.")),
        }
    }

    /// A parameter that must not be empty when it is present.
    pub fn nonempty(&self, name: &str) -> Result<Option<&str>, String> {
        match self.get(name) {
            Some("") => Err(format!("The query parameter \"{name}\" cannot be empty.")),
            value => Ok(value),
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = (&str, &str)> {
        self.0
            .iter()
            .map(|(name, value)| (name.as_str(), value.as_str()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_listed_parameters_are_accepted_once() {
        let query = Query::parse(Some("page=2&dev"), &["page", "dev"]).unwrap();
        assert_eq!(query.get("page"), Some("2"));
        assert_eq!(query.flag("dev"), Ok(true));
        assert_eq!(query.flag("other"), Ok(false));
        assert!(Query::parse(None, &[]).is_ok());
        assert!(Query::parse(Some(""), &[]).is_ok());
        assert!(
            Query::parse(Some("utm_source=x"), &["page"])
                .unwrap_err()
                .contains("This URL takes: page.")
        );
        assert!(
            Query::parse(Some("page=1"), &[])
                .unwrap_err()
                .contains("takes no parameters")
        );
        assert!(
            Query::parse(Some("page=1&page=2"), &["page"])
                .unwrap_err()
                .contains("more than once")
        );
        let query = Query::parse(Some("dev=1&page="), &["dev", "page"]).unwrap();
        assert!(query.flag("dev").is_err());
        assert!(query.nonempty("page").is_err());
    }
}
