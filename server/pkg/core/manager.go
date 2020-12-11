package core

import (
	"os/exec"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/logger"
)

type Manager struct {
	GitCommitOnStart string

	datetimeStarted time.Time
}

func NewManager(logger *logger.Logger) *Manager {
	m := &Manager{
		GitCommitOnStart: getGitCommitOnStart(logger),

		datetimeStarted: time.Now(), // Record the time that the server started
	}

	logger.Infof("Current git commit: %v", m.GitCommitOnStart)

	return m
}

// Get the commit that corresponds with when the Golang code was compiled.
// This is useful to know what version of the server is running,
// since it is possible to update the client without restarting the server.
func getGitCommitOnStart(logger *logger.Logger) string {
	cmd := exec.Command("git", "rev-parse", "HEAD")
	stdout, err := cmd.Output()
	if err != nil {
		logger.Fatalf("Failed to perform a \"git rev-parse HEAD\": %v", err)
	}
	return strings.TrimSpace(string(stdout))
}
