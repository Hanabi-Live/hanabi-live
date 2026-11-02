//go:build !linux

package main

import "fmt"

func initializeRelease() error {
	return fmt.Errorf("native releases require Linux")
}

func listenForReleaseSignals() {
	panic("native releases require Linux")
}

func exitRelease() {
	panic("native releases require Linux")
}

func restartRelease() error {
	return fmt.Errorf("native releases require Linux")
}
