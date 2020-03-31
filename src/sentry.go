package main

import (
	"os"

	"github.com/getsentry/sentry-go"
)

func sentryInit() bool {
	// We only want to report errors in production
	if os.Getenv("DOMAIN") == "localhost" || os.Getenv("DOMAIN") == "" {
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
		Dsn: sentryDSN,
	}); err != nil {
		logger.Fatal("Failed to initialize Sentry:", err)
		return false
	}

	return true
}
