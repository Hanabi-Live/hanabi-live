package github

import (
	"context"
	"fmt"

	"github.com/google/go-github/github"
)

// NewIssue opens a new issue on GitHub for this repository.
func (m *Manager) NewIssue(ctx context.Context, title string, body string) error {
	if _, _, err := m.ghClient.Issues.Create(
		ctx,
		repositoryOwner,
		m.projectName,
		&github.IssueRequest{ // nolint: exhaustivestruct
			Title: &title,
			Body:  &body,
		},
	); err != nil {
		return fmt.Errorf("failed to submit a GitHub issue: %w", err)
	}

	return nil
}
