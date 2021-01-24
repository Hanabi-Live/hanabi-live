package core

import (
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/tevino/abool"
)

type Manager struct {
	name string

	requests          chan *request
	requestsWaitGroup sync.WaitGroup
	requestFuncMap    map[requestType]func(interface{})
	requestsClosed    *abool.AtomicBool

	logger     *logger.Logger
	Dispatcher *dispatcher.Dispatcher

	isDev                bool
	projectPath          string
	gitCommitOnStart     string
	datetimeStarted      time.Time
	wordList             []string
	shuttingDown         *abool.AtomicBool
	datetimeShutdownInit time.Time
	maintenanceMode      *abool.AtomicBool
}

func NewManager(logger *logger.Logger, isDev bool, projectPath string, dataPath string) *Manager {
	m := &Manager{
		name: "core",

		requests:          make(chan *request),
		requestsWaitGroup: sync.WaitGroup{},
		requestFuncMap:    make(map[requestType]func(interface{})),
		requestsClosed:    abool.New(),

		logger:     logger,
		Dispatcher: nil, // This will be filled in after this object is instantiated

		isDev:                isDev,
		projectPath:          projectPath,
		gitCommitOnStart:     getGitCommit(logger),
		datetimeStarted:      time.Now(), // Record the time that the server started
		wordList:             make([]string, 0),
		shuttingDown:         abool.New(),
		datetimeShutdownInit: time.Time{},
		maintenanceMode:      abool.New(),
	}
	m.requestFuncMapInit()
	m.wordListInit(dataPath)
	go m.listenForRequests()

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
