package core

import (
	"fmt"
	"os/exec"
	"path"
	"strings"

	"github.com/getsentry/sentry-go"
	"go.uber.org/zap"
)

func (m *Manager) executeScript(scriptName string) error {
	scriptPath := path.Join(m.projectPath, scriptName)
	cmd := exec.Command(scriptPath)
	cmd.Dir = m.projectPath
	outputBytes, err := cmd.CombinedOutput()
	output := strings.TrimSpace(string(outputBytes))

	// Make the script output appear as a different property in the JSON
	m.logger.Info(
		fmt.Sprintf("Script \"%v\" completed.", scriptName),
		zap.String("output", output),
	)

	// The "cmd.CombinedOutput()" function will throw an error if the return code is not equal to 0
	if err != nil {
		sentry.ConfigureScope(func(scope *sentry.Scope) {
			scope.SetTag("scriptOutput", output)
		})

		return fmt.Errorf("failed to execute \"%v\": %w", scriptPath, err)
	}

	return nil
}
