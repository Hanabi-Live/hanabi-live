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

	execute("pull.sh")
	execute("restart.sh")
}

func execute(script string) {
	cmd := exec.Command(path.Join(projectPath, script))
	if output, err := cmd.Output(); err != nil {
		log.Error("Failed to execute \""+script+"\":", err)
	} else {
		log.Info("\""+script+"\" completed:", string(output))
	}
}
