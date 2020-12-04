package main

import (
	"errors"
	"log"

	sentry "github.com/getsentry/sentry-go"
	"go.uber.org/zap"
)

// We use a custom wrapper on top of the "uber-go/zap" logger because we want to automatically
// report all warnings and errors to Sentry
type Logger struct {
	logger *zap.Logger
}

// NewLogger creates a new wrapped logger
// The parent function must also run "defer logger.Sync()" so that logs are written before the
// program exits
func NewLogger() *Logger {
	// Prepare the configuration for the zap library
	// This config is based on the "zap.NewProductionConfig()" preset
	zapConfig := zap.Config{ // nolint: exhaustivestruct
		// Even in production, we want to print debug messages
		// (to help with troubleshooting in production)
		Level: zap.NewAtomicLevelAt(zap.DebugLevel),

		Development:      isDev,
		Encoding:         "json",
		EncoderConfig:    zap.NewProductionEncoderConfig(),
		OutputPaths:      []string{"stderr"},
		ErrorOutputPaths: []string{"stderr"},

		// We add some additional fields
		InitialFields: map[string]interface{}{"datetime": 5},
	}

	// This prevents the bug where all log messages will originate from "logger.go"
	otherOptions := zap.AddCallerSkip(1)

	var zapLogger *zap.Logger
	if v, err := zapConfig.Build(otherOptions); err != nil {
		log.Fatalf("Failed to initialize the zap logger: %v", err)
		return nil
	} else {
		zapLogger = v
	}

	// Old logger config for reference
	/*
		loggingBackend := logging.NewLogBackend(os.Stdout, "", 0)
		logFormat := logging.MustStringFormatter( // https://golang.org/pkg/time/#Time.Format
			`%{time:Mon Jan 02 15:04:05 MST 2006} - %{level:.4s} - %{shortfile} - %{message}`,
		)
		loggingBackendFormatted := logging.NewBackendFormatter(loggingBackend, logFormat)
	*/

	return &Logger{
		logger: zapLogger,
	}
}

func (l *Logger) Debug(msg string, fields ...zap.Field) {
	l.logger.Debug(msg, fields...)
}

func (l *Logger) Info(msg string, fields ...zap.Field) {
	l.logger.Info(msg, fields...)
}

// Warning levels and above are sent to Sentry
// Setting the scope is from:
// https://stackoverflow.com/questions/51752779/sentry-go-integration-how-to-specify-error-level

func (l *Logger) Warn(msg string, fields ...zap.Field) {
	if usingSentry {
		sentry.WithScope(func(scope *sentry.Scope) {
			scope.SetLevel(sentry.LevelWarning)
			sentry.CaptureException(errors.New(msg))
		})
	}

	l.logger.Warn(msg, fields...)
}

func (l *Logger) Error(msg string, fields ...zap.Field) {
	if usingSentry {
		sentry.WithScope(func(scope *sentry.Scope) {
			scope.SetLevel(sentry.LevelError)
			sentry.CaptureException(errors.New(msg))
		})
	}

	l.logger.Error(msg, fields...)
}

func (l *Logger) Fatal(msg string, fields ...zap.Field) {
	if usingSentry {
		sentry.WithScope(func(scope *sentry.Scope) {
			scope.SetLevel(sentry.LevelFatal)
			sentry.CaptureException(errors.New(msg))
		})
	}

	l.logger.Fatal(msg, fields...)
}

func (l *Logger) Sync() {
	if err := l.logger.Sync(); err != nil {
		l.Error("Failed to sync the logger: " + err.Error())
	}
}
