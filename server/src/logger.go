package main

import (
	"errors"
	"log"
	"time"

	sentry "github.com/getsentry/sentry-go"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
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
	// Prepare the encoder configuration for the zap library
	zapEncoderConfig := zap.NewProductionEncoderConfig() // Start with the preset production config
	zapEncoderConfig.EncodeTime = func(t time.Time, enc zapcore.PrimitiveArrayEncoder) {
		// By default, the "ts" field will be an epoch timestamp
		// Instead, use the typical format from syslog (since it is more human readable)
		// https://blog.sandipb.net/2018/05/03/using-zap-creating-custom-encoders/
		enc.AppendString(t.Format("Jan  2 15:04:05"))
	}

	// Prepare the configuration for the zap library
	zapConfig := zap.NewProductionConfig() // Start with the preset production config
	// Even in production, we want to print debug messages
	// (to help with troubleshooting in production)
	zapConfig.Level = zap.NewAtomicLevelAt(zap.DebugLevel)
	zapConfig.Development = isDev
	// Sampling caps the global CPU and I/O load that logging puts on the process
	// This can cause messages to not be processed by the logger
	// By default, sampling is enabled, so we disable it
	zapConfig.Sampling = nil
	zapConfig.EncoderConfig = zapEncoderConfig

	// This prevents the bug where all log messages will originate from "logger.go"
	otherOptions := zap.AddCallerSkip(1)

	var zapLogger *zap.Logger
	if v, err := zapConfig.Build(otherOptions); err != nil {
		log.Fatalf("Failed to initialize the zap logger: %v", err)
		return nil
	} else {
		zapLogger = v
	}

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

// The warn, error, and fatal levels are sent to Sentry
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
