package main

import (
	"os/exec"
	"path"
)

func restart(s *Session, d *CommandData) {
	// Validate that they are an administrator
	if !s.Admin() {
		return
	}

	cmd := exec.Command(path.Join(projectPath, "restart.sh"))
	if output, err := cmd.Output(); err != nil {
		log.Error("Failed to execute \"restart.sh\":", err)
	} else {
		log.Info("\"restart.sh\" completed:", string(output))
	}
}
