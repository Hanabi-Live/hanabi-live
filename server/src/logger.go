package main

import (
	"errors"
	"fmt"
	"log"

	sentry "github.com/getsentry/sentry-go"
	"go.uber.org/zap"
)

// We use a custom wrapper on top of the "uber-go/zap" logger because we want to automatically
// report all warnings and errors to Sentry
type Logger struct {
	Logger *zap.Logger
}

func NewLogger() *Logger {
	// Initialize logging using the "uber-go/zap" library
	var zapLogger *zap.Logger
	if v, err := zap.NewProduction(); err != nil {
		log.Fatalf("Failed to initialize the zap logger: %v", err)
		return nil
	} else {
		zapLogger = v
	}

	/*
		loggingBackend := logging.NewLogBackend(os.Stdout, "", 0)
		logFormat := logging.MustStringFormatter( // https://golang.org/pkg/time/#Time.Format
			`%{time:Mon Jan 02 15:04:05 MST 2006} - %{level:.4s} - %{shortfile} - %{message}`,
		)
		loggingBackendFormatted := logging.NewBackendFormatter(loggingBackend, logFormat)
	*/

	return &Logger{
		Logger: zapLogger,
	}
}

func (l *Logger) Debug(args ...interface{}) {
	l.Logger.Debug(args...)
}

// Setting the scope is from:
// https://stackoverflow.com/questions/51752779/sentry-go-integration-how-to-specify-error-level
func (l *Logger) Error(args ...interface{}) {
	if usingSentry {
		sentry.WithScope(func(scope *sentry.Scope) {
			scope.SetLevel(sentry.LevelError)
			sentry.CaptureException(errors.New(fmt.Sprint(args...)))
		})
	}

	l.Logger.Error(args...)
}

func (l *Logger) Fatal(args ...interface{}) {
	if usingSentry {
		sentry.WithScope(func(scope *sentry.Scope) {
			scope.SetLevel(sentry.LevelFatal)
			sentry.CaptureException(errors.New(fmt.Sprint(args...)))
		})
	}

	l.Logger.Fatal(args...)
}

func (l *Logger) Info(args ...interface{}) {
	l.Logger.Info(args...)
}

func (l *Logger) Warning(args ...interface{}) {
	if usingSentry {
		sentry.WithScope(func(scope *sentry.Scope) {
			scope.SetLevel(sentry.LevelWarning)
			sentry.CaptureException(errors.New(fmt.Sprint(args...)))
		})
	}

	l.Logger.Warning(args...)
}
