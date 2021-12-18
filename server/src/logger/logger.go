package logger

// Logger implemented via asynchronous Singleton pattern
// From https://medium.com/golang-issue/how-singleton-pattern-works-with-golang-2fdd61cd5a7f

import (
	"errors"
	"log"
	"sync"
	"time"

	sentry "github.com/getsentry/sentry-go"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var once sync.Once
var instance *logger

var inDevelopment bool
var usingSentry bool

// We use a custom wrapper on top of the "uber-go/zap" logger because we want to automatically
// report all warnings and errors to Sentry
type logger struct {
	logger *zap.Logger
}

func getInstance() *logger {
	once.Do(func() {
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
		zapConfig.Development = inDevelopment
		// Sampling caps the global CPU and I/O load that logging puts on the process
		// This can cause messages to not be processed by the logger
		// By default, sampling is enabled, so we disable it
		zapConfig.Sampling = nil
		zapConfig.EncoderConfig = zapEncoderConfig

		// This prevents the bug where all log messages will originate from "logger.go"
		otherOptions := zap.AddCallerSkip(1)

		if v, err := zapConfig.Build(otherOptions); err != nil {
			log.Fatalf("Failed to initialize the zap logger: %v", err)
			instance = &logger{
				logger: nil,
			}
		} else {
			instance = &logger{
				logger: v,
			}

		}
	})

	return instance
}

func Init(dev bool, sentry bool) {
	inDevelopment = dev
	usingSentry = sentry
}

func Debug(message string, fields ...zap.Field) {
	getInstance().logger.Debug(message, fields...)
}

func Info(message string, fields ...zap.Field) {
	getInstance().logger.Info(message, fields...)
}

// The warn, error, and fatal levels are sent to Sentry
// Setting the scope is from:
// https://stackoverflow.com/questions/51752779/sentry-go-integration-how-to-specify-error-level
func Warn(message string, fields ...zap.Field) {
	if usingSentry {
		sentry.WithScope(func(scope *sentry.Scope) {
			scope.SetLevel(sentry.LevelWarning)
			sentry.CaptureException(errors.New(message))
		})
	}

	getInstance().logger.Warn(message, fields...)
}

func Error(message string, fields ...zap.Field) {
	if usingSentry {
		sentry.WithScope(func(scope *sentry.Scope) {
			scope.SetLevel(sentry.LevelError)
			sentry.CaptureException(errors.New(message))
		})
	}

	getInstance().logger.Error(message, fields...)
}

func Fatal(message string, fields ...zap.Field) {
	if usingSentry {
		sentry.WithScope(func(scope *sentry.Scope) {
			scope.SetLevel(sentry.LevelFatal)
			sentry.CaptureException(errors.New(message))
		})
	}

	getInstance().logger.Fatal(message, fields...)
}

func Sync() {
	if err := getInstance().logger.Sync(); err != nil {
		Error("Failed to sync the logger: " + err.Error())
	}
}
