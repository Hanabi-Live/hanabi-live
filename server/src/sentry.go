package main

import (
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/getsentry/sentry-go"
	"github.com/gin-gonic/gin"
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

func sentryHTTPAttachMetadata(c *gin.Context) {
	if !usingSentry {
		return
	}

	// Local variables
	r := c.Request
	w := c.Writer

	// Parse the IP address
	var ip string
	if v, _, err := net.SplitHostPort(r.RemoteAddr); err != nil {
		logger.Error("Failed to parse the IP address:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		ip = v
	}

	// If we encounter an error later on, we want metadata to be attached to the error message,
	// which can be helpful for debugging (since we can ask the user how they caused the error)
	sentry.ConfigureScope(func(scope *sentry.Scope) {
		scope.SetTag("userID", "n/a")
		scope.SetTag("username", "n/a")
		scope.SetTag("ip", ip)
		scope.SetTag("path", c.FullPath())
	})
}

func sentryWebsocketMessageAttachMetadata(s *Session) {
	if !usingSentry {
		return
	}

	// Parse the IP address
	var ip string
	if v, _, err := net.SplitHostPort(s.Session.Request.RemoteAddr); err != nil {
		logger.Error("Failed to parse the IP address:", err)
		return
	} else {
		ip = v
	}

	// If we encounter an error later on, we want metadata to be attached to the error message,
	// which can be helpful for debugging (since we can ask the user how they caused the error)
	// We use "SetTags()" instead of "SetUser()" since tags are more easy to see in the
	// Sentry GUI than users
	sentry.ConfigureScope(func(scope *sentry.Scope) {
		scope.SetTag("userID", strconv.Itoa(s.UserID()))
		scope.SetTag("username", s.Username())
		scope.SetTag("ip", ip)
		scope.SetTag("path", "n/a")
	})
}
