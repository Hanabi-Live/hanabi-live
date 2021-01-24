package sentry

import (
	"net/http"
	"os"
	"strings"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/getsentry/sentry-go"
)

func getCommonHTTPErrors() []string {
	return []string{
		"client disconnected",
		"http2: stream closed",
		"write: broken pipe",
		"write: connection reset by peer",
		"write: connection timed out",
		"i/o timeout",
	}
}

func Init(logger *logger.Logger, gitCommitOnStart string) bool {
	// Read some configuration values from environment variables
	// (they were loaded from the ".env" file in "main.go")
	sentryDSN := os.Getenv("SENTRY_DSN")
	if len(sentryDSN) == 0 {
		logger.Info("The \"sentryDSN\" environment variable is blank; aborting Sentry initialization.")
		return false
	}

	// The default http.Client has no default timeout set
	httpClientWithTimeout := &http.Client{ // nolint: exhaustivestruct
		Timeout: constants.HTTPWriteTimeout,
	}

	// Initialize Sentry
	if err := sentry.Init(sentry.ClientOptions{ // nolint: exhaustivestruct
		Dsn:          sentryDSN,
		IgnoreErrors: getCommonHTTPErrors(),
		Release:      gitCommitOnStart,
		HTTPClient:   httpClientWithTimeout,
	}); err != nil {
		logger.Fatalf("Failed to initialize Sentry: %v", err)
	}

	return true
}

// IsCommonHTTPError checks for some errors that are common and expected.
// (For example, the end-user might press the "Stop" button in their browser while the template is
// executing.)
func IsCommonHTTPError(errorMsg string) bool {
	for _, commonHTTPError := range getCommonHTTPErrors() {
		if strings.HasSuffix(errorMsg, commonHTTPError) {
			return true
		}
	}

	return false
}
