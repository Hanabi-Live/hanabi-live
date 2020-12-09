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
	gitHubClient *github.Client
)

func githubInit() {
	// Read some configuration values from environment variables
	gitHubAppIDString := os.Getenv("GITHUB_APP_ID")
	if len(gitHubAppIDString) == 0 {
		hLog.Info("The \"GITHUB_APP_ID\" environment variable is blank; aborting GitHub initialization.")
		return
	}
	var gitHubAppID int64
	if v, err := strconv.ParseInt(gitHubAppIDString, 10, 64); err != nil {
		hLog.Fatalf(
			"Failed to convert the \"GITHUB_APP_ID\" environment variable of \"%v\" to an integer: %v",
			gitHubAppIDString,
			err,
		)
	} else {
		gitHubAppID = v
	}
	gitHubInstallationIDString := os.Getenv("GITHUB_INSTALLATION_ID")
	if len(gitHubInstallationIDString) == 0 {
		hLog.Info("The \"GITHUB_INSTALLATION_ID\" environment variable is blank; aborting GitHub initialization.")
		return
	}
	var gitHubInstallationID int64
	if v, err := strconv.ParseInt(gitHubInstallationIDString, 10, 64); err != nil {
		hLog.Fatalf(
			"Failed to convert the \"GITHUB_INSTALLATION_ID\" environment variable of \"%v\" to an integer: %v",
			gitHubInstallationIDString,
			err,
		)
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
		hLog.Fatalf("Failed to read the GitHub private key from \"%v\": %v", gitHubKeyPath, err)
	} else {
		transport = v
	}

	// Initialize the GitHub API client
	// https://github.com/google/go-github
	gitHubClient = github.NewClient(&http.Client{ // nolint: exhaustivestruct
		Transport: transport,
	})
}
