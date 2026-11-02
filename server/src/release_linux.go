package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"golang.org/x/sys/unix"
)

var releaseLock *os.File
var releaseSignals = make(chan os.Signal, 1)

func initializeRelease() error {
	signal.Notify(releaseSignals, syscall.SIGTERM, syscall.SIGINT)
	lockPath := filepath.Join(projectPath, ".lifecycle.lock")
	const prefix = "--release-lock-fd="
	if len(os.Args) == 2 && strings.HasPrefix(os.Args[1], prefix) {
		fd, err := strconv.Atoi(strings.TrimPrefix(os.Args[1], prefix))
		if err != nil || fd < 3 {
			return fmt.Errorf("invalid inherited release lock")
		}
		releaseLock = os.NewFile(uintptr(fd), lockPath)
		held, err := releaseLock.Stat()
		expected, statErr := os.Stat(lockPath)
		if err != nil || statErr != nil || !os.SameFile(held, expected) {
			return fmt.Errorf("inherited release lock does not match runtime state")
		}
	} else {
		var err error
		releaseLock, err = os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0600)
		if err != nil {
			return err
		}
	}
	if err := unix.Flock(int(releaseLock.Fd()), unix.LOCK_EX|unix.LOCK_NB); err != nil {
		return fmt.Errorf("release is running or activation is in progress: %w", err)
	}
	// Installed releases must still be current after taking the shared lock. A process
	// that resolved "current" immediately before activation must not start stale code.
	if info, err := os.Lstat(lockPath); err == nil && info.Mode()&os.ModeSymlink != 0 {
		current, err := filepath.EvalSymlinks(filepath.Join(projectPath, "../..", "current"))
		if err != nil || current != projectPath {
			return fmt.Errorf("this installed release is not current")
		}
	}
	return verifyRelease(projectPath, buildRevision)
}

func listenForReleaseSignals() {
	go func() {
		for range releaseSignals {
			stopRelease(NewMiscContext("signal"))
		}
	}()
}

func stopRelease(ctx context.Context) {
	serverLifecycleMutex.Lock()
	defer serverLifecycleMutex.Unlock()
	waitForAllWebSocketCommandsToFinish()
	if !checkpointForLifecycle(ctx) {
		logger.Error("Shutdown checkpoint failed; server remains paused. Retry the signal after repairing the database.")
		return
	}
	exitRelease()
}

func exitRelease() {
	logger.Info("Release drained and checkpoints saved; exiting.")
	logger.Sync()
	os.Exit(0)
}

func restartRelease() error {
	if _, err := unix.FcntlInt(releaseLock.Fd(), unix.F_SETFD, 0); err != nil {
		return err
	}
	executable := filepath.Join(projectPath, "hanabi-live")
	return syscall.Exec(executable, []string{
		executable, "--release-lock-fd=" + strconv.Itoa(int(releaseLock.Fd())),
	}, os.Environ())
}
