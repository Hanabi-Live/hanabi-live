package sentry

import (
	"net/http"
	"os"
	"strings"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/getsentry/sentry-go"
)

var (
	// We don't want to use the default http.Client because it has no default timeout set
	httpClientWithTimeout = &http.Client{ // nolint: exhaustivestruct
		Timeout: constants.HTTPWriteTimeout,
	}
)

func Init(logger *logger.Logger, isDev bool, gitCommitOnStart string) bool {
	// We only want to report errors in production
	if isDev {
		return false
	}

	// Read some configuration values from environment variables
	// (they were loaded from the ".env" file in "main.go")
	sentryDSN := os.Getenv("SENTRY_DSN")
	if len(sentryDSN) == 0 {
		logger.Info("The \"sentryDSN\" environment variable is blank; aborting Sentry initialization.")
		return false
	}

	// Initialize Sentry
	if err := sentry.Init(sentry.ClientOptions{ // nolint: exhaustivestruct
		Dsn:          sentryDSN,
		IgnoreErrors: commonHTTPErrors,
		Release:      gitCommitOnStart,
		HTTPClient:   httpClientWithTimeout,
	}); err != nil {
		logger.Fatalf("Failed to initialize Sentry: %v", err)
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

// IsCommonHTTPError checks for some errors that are common and expected
// (e.g. the user presses the "Stop" button while the template is executing)
func IsCommonHTTPError(errorMsg string) bool {
	for _, commonHTTPError := range commonHTTPErrors {
		if strings.HasSuffix(errorMsg, commonHTTPError) {
			return true
		}
	}

	return false
}
