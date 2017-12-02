package log

import (
	"errors"
	"fmt"
	"os"

	raven "github.com/getsentry/raven-go" // The Sentry client for Golang
	logging "github.com/op/go-logging"    // A logging library
)

var (
	log *logging.Logger
)

/*
	Initialization function
*/

func Init() {
	// We use a custom logger because we want to automatically report all
	// warnings and errors to Sentry
	log = logging.MustGetLogger("isaac")
	loggingBackend := logging.NewLogBackend(os.Stdout, "", 0)
	logFormat := logging.MustStringFormatter( // https://golang.org/pkg/time/#Time.Format
		// We no longer use the line number ("%{shortfile}") since the log struct extension breaks it
		`%{time:Mon Jan 2 15:04:05 MST 2006} - %{level:.4s} - %{message}`,
	)
	loggingBackendFormatted := logging.NewBackendFormatter(loggingBackend, logFormat)
	logging.SetBackend(loggingBackendFormatted)
}

/*
	Wrapper functions
*/

func Fatal(message string, err error) {
	raven.CaptureError(err, map[string]string{
		"message": message,
	})
	log.Fatal(message, err)
}

func Debug(args ...interface{}) {
	log.Debug(args...)
}

func Info(args ...interface{}) {
	log.Info(args...)
}

func Warning(args ...interface{}) {
	log.Warning(args...)
	err := errors.New(fmt.Sprint(args...))
	raven.CaptureError(err, nil)
}

func Error(args ...interface{}) {
	log.Error(args...)
	err := errors.New(fmt.Sprint(args...))
	raven.CaptureError(err, nil)
}
