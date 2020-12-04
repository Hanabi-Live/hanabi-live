package main

import (
	"net/http"
	"os"
	"path"
	"strconv"

	"github.com/bradleyfalzon/ghinstallation"
	"github.com/google/go-github/github"
)

const (
	// If this is changed, the entry in the ".gitignore" file should also be changed
	gitHubPrivateKeyFilename = "GitHub_private_key.pem"

	githubRepositoryOwner = "Zamiell"
)

var (
	ghClient *github.Client
)

func githubInit() {
	// Read some configuration values from environment variables
	gitHubAppIDString := os.Getenv("GITHUB_APP_ID")
	if len(gitHubAppIDString) == 0 {
		logger.Info("The \"GITHUB_APP_ID\" environment variable is blank; " +
			"aborting GitHub initialization.")
		return
	}
	var gitHubAppID int64
	if v, err := strconv.ParseInt(gitHubAppIDString, 10, 64); err != nil {
		logger.Info("The  \"GITHUB_APP_ID\" environment variable of " +
			"\"" + gitHubAppIDString + "\" is not a number; aborting GitHub initialization.")
		return
	} else {
		gitHubAppID = v
	}
	gitHubInstallationIDString := os.Getenv("GITHUB_INSTALLATION_ID")
	if len(gitHubInstallationIDString) == 0 {
		logger.Info("The \"GITHUB_INSTALLATION_ID\" environment variable is blank; " +
			"aborting GitHub initialization.")
		return
	}
	var gitHubInstallationID int64
	if v, err := strconv.ParseInt(gitHubInstallationIDString, 10, 64); err != nil {
		logger.Info("The  \"GITHUB_INSTALLATION_ID\" environment variable of \"" +
			gitHubInstallationIDString + "\" is not a number; aborting GitHub initialization.")
		return
	} else {
		gitHubInstallationID = v
	}

	// Wrap the shared transport for use with our GitHub app
	// https://github.com/bradleyfalzon/ghinstallation
	// (see the ".env" file for instructions on getting these values)
	gitHubKeyPath := path.Join(projectPath, gitHubPrivateKeyFilename)
	var transport *ghinstallation.Transport
	if v, err := ghinstallation.NewKeyFromFile(
		http.DefaultTransport,
		gitHubAppID,
		gitHubInstallationID,
		gitHubKeyPath,
	); err != nil {
		logger.Info("Failed to read the private key from \""+gitHubKeyPath+"\":", err)
		logger.Info("Aborting GitHub initialization.")
		return
	} else {
		transport = v
	}

	// Initialize the GitHub API client
	// https://github.com/google/go-github
	ghClient = github.NewClient(&http.Client{ // nolint: exhaustivestruct
		Transport: transport,
	})
}
