package main

import (
	"errors"
	"fmt"
	"os"

	sentry "github.com/getsentry/sentry-go"
	logging "github.com/op/go-logging"
)

// We use a custom wrapper on top of the "go-logging" logger because
// we want to automatically report all warnings and errors to Sentry
type Logger struct {
	Logger *logging.Logger
}

func NewLogger() *Logger {
	// Initialize logging using the "go-logging" library
	// http://godoc.org/github.com/op/go-logging#Formatter
	logger := logging.MustGetLogger("hanabi-live")
	loggingBackend := logging.NewLogBackend(os.Stdout, "", 0)
	logFormat := logging.MustStringFormatter( // https://golang.org/pkg/time/#Time.Format
		`%{time:Mon Jan 02 15:04:05 MST 2006} - %{level:.4s} - %{shortfile} - %{message}`,
		/*
			// We no longer use the line number ("%{shortfile}")
			since the log struct extension breaks it
			`%{time:Mon Jan 2 15:04:05 MST 2006} - %{level:.4s} - %{message}`,
		*/
	)
	loggingBackendFormatted := logging.NewBackendFormatter(loggingBackend, logFormat)
	logging.SetBackend(loggingBackendFormatted)

	return &Logger{
		Logger: logger,
	}
}

func (l *Logger) Debug(args ...interface{}) {
	l.Logger.Debug(args...)
}

// Setting the scope is from:
// https://stackoverflow.com/questions/51752779/sentry-go-integration-how-to-specify-error-level
func (l *Logger) Error(args ...interface{}) {
	sentry.WithScope(func(scope *sentry.Scope) {
		scope.SetLevel(sentry.LevelError)
		sentry.CaptureException(errors.New(fmt.Sprint(args...)))
	})

	l.Logger.Error(args...)
}

func (l *Logger) Fatal(args ...interface{}) {
	sentry.WithScope(func(scope *sentry.Scope) {
		scope.SetLevel(sentry.LevelFatal)
		sentry.CaptureException(errors.New(fmt.Sprint(args...)))
	})

	l.Logger.Fatal(args...)
}

func (l *Logger) Info(args ...interface{}) {
	l.Logger.Info(args...)
}

func (l *Logger) Warning(args ...interface{}) {
	sentry.WithScope(func(scope *sentry.Scope) {
		scope.SetLevel(sentry.LevelWarning)
		sentry.CaptureException(errors.New(fmt.Sprint(args...)))
	})

	l.Logger.Warning(args...)
}
