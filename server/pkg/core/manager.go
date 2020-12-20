package core

import (
	"os/exec"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/tevino/abool"
)

type Manager struct {
	gitCommitOnStart     string
	datetimeStarted      time.Time
	wordList             []string
	shuttingDown         *abool.AtomicBool
	datetimeShutdownInit time.Time
	maintenanceMode      *abool.AtomicBool

	logger *logger.Logger
}

func NewManager(logger *logger.Logger, dataPath string) *Manager {
	m := &Manager{
		gitCommitOnStart:     getGitCommit(logger),
		datetimeStarted:      time.Now(), // Record the time that the server started
		wordList:             make([]string, 0),
		shuttingDown:         abool.New(),
		datetimeShutdownInit: time.Time{},
		maintenanceMode:      abool.New(),

		logger: logger,
	}
	m.wordListInit(dataPath)

	m.logger.Infof("Current git commit: %v", m.gitCommitOnStart)

	return m
}

// getGitCommit gets the commit that corresponds with when the Golang code was compiled.
// This is useful to know what version of the server is running, since it is possible to update the
// client without restarting the server.
func getGitCommit(logger *logger.Logger) string {
	cmd := exec.Command("git", "rev-parse", "HEAD")
	stdout, err := cmd.Output()
	if err != nil {
		logger.Fatalf("Failed to perform a \"git rev-parse HEAD\": %v", err)
	}
	return strings.TrimSpace(string(stdout))
}
