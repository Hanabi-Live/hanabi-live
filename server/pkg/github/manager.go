package github

import (
	"net/http"
	"os"
	"path"
	"strconv"

	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/bradleyfalzon/ghinstallation"
	"github.com/google/go-github/github"
)

type Manager struct {
	ghClient    *github.Client
	logger      *logger.Logger
	projectPath string
	projectName string
}

const (
	// If the private key filename is changed,
	// then the entry in the ".gitignore" file should also be changed.
	privateKeyFilename = "GitHub_private_key.pem"
	repositoryOwner    = "Zamiell"
)

func NewManager(logger *logger.Logger, projectPath string, projectName string) *Manager {
	// Get environment variables
	envVars := getEnvVars(logger)
	if envVars == nil {
		return nil
	}

	// Wrap the shared transport for use with our GitHub app
	// https://github.com/bradleyfalzon/ghinstallation
	// (see the ".env" file for instructions on getting these values)
	gitHubKeyPath := path.Join(projectPath, privateKeyFilename)
	var transport *ghinstallation.Transport
	if v, err := ghinstallation.NewKeyFromFile(
		http.DefaultTransport,
		envVars.gitHubAppID,
		envVars.gitHubInstallationID,
		gitHubKeyPath,
	); err != nil {
		logger.Fatalf("Failed to read the GitHub private key from \"%v\": %v", gitHubKeyPath, err)
	} else {
		transport = v
	}

	// Initialize the GitHub API client
	// https://github.com/google/go-github
	ghClient := github.NewClient(&http.Client{ // nolint: exhaustivestruct
		Transport: transport,
	})

	return &Manager{
		ghClient:    ghClient,
		logger:      logger,
		projectPath: projectPath,
		projectName: projectName,
	}
}

type envVars struct {
	gitHubAppID          int64
	gitHubInstallationID int64
}

// getEnvVars reads some specific environment variables relating to using the GitHub API.
// (They were loaded from the ".env" file in "main.go".)
func getEnvVars(logger *logger.Logger) *envVars {
	gitHubAppIDString := os.Getenv("GITHUB_APP_ID")
	if len(gitHubAppIDString) == 0 {
		logger.Info("The \"GITHUB_APP_ID\" environment variable is blank; aborting GitHub initialization.")
		return nil
	}
	var gitHubAppID int64
	if v, err := strconv.ParseInt(gitHubAppIDString, 10, 64); err != nil {
		logger.Fatalf(
			"Failed to convert the \"GITHUB_APP_ID\" environment variable of \"%v\" to an integer: %v",
			gitHubAppIDString,
			err,
		)
	} else {
		gitHubAppID = v
	}

	gitHubInstallationIDString := os.Getenv("GITHUB_INSTALLATION_ID")
	if len(gitHubInstallationIDString) == 0 {
		logger.Info("The \"GITHUB_INSTALLATION_ID\" environment variable is blank; aborting GitHub initialization.")
		return nil
	}
	var gitHubInstallationID int64
	if v, err := strconv.ParseInt(gitHubInstallationIDString, 10, 64); err != nil {
		logger.Fatalf(
			"Failed to convert the \"GITHUB_INSTALLATION_ID\" environment variable of \"%v\" to an integer: %v",
			gitHubInstallationIDString,
			err,
		)
	} else {
		gitHubInstallationID = v
	}

	return &envVars{
		gitHubAppID:          gitHubAppID,
		gitHubInstallationID: gitHubInstallationID,
	}
}
