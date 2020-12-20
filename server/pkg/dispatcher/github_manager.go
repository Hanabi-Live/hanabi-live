package dispatcher

import (
	"context"
)

type GitHubManager interface {
	NewIssue(ctx context.Context, title string, body string) error
}
