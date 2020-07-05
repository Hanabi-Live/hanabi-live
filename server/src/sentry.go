package main

import (
	"os"
	"strings"

	"github.com/getsentry/sentry-go"
)

func sentryInit() bool {
	// We only want to report errors in production
	if isDev {
		return false
	}

	// Read some configuration values from environment variables
	// (they were loaded from the ".env" file in "main.go")
	sentryDSN := os.Getenv("SENTRY_DSN")
	if len(sentryDSN) == 0 {
		logger.Info("The \"sentryDSN\" environment variable is blank; " +
			"aborting Sentry initialization.")
		return false
	}

	// Initialize Sentry
	if err := sentry.Init(sentry.ClientOptions{
		Dsn:          sentryDSN,
		IgnoreErrors: commonHTTPErrors,
		Release:      gitCommitOnStart,
		HTTPClient:   HTTPClientWithTimeout,
	}); err != nil {
		logger.Fatal("Failed to initialize Sentry:", err)
		return false
	}

	return true
}

var commonHTTPErrors = []string{
	"client disconnected",
	"http2: stream closed",
	"write: broken pipe",
	"write: connection reset by peer",
	"write: connection timed out",
	"i/o timeout",
}

// isCommonHTTPError checks for some errors that are common and expected
// (e.g. the user presses the "Stop" button while the template is executing)
func isCommonHTTPError(errorMsg string) bool {
	for _, commonHTTPError := range commonHTTPErrors {
		if strings.HasSuffix(errorMsg, commonHTTPError) {
			return true
		}
	}

	return false
}
