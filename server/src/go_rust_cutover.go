package main

// TEMPORARY: remove this endpoint, startup marker check, and marker after the
// permanent Rust switch. Never remove a marker to resume Go after importing its games.
import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/gin-gonic/gin"
)

const goRustCutoverMarker = ".go-to-rust-cutover"

var (
	goRustCutoverCheckpoints = make(map[uint64]bool)
	goRustCutoverExit        = func() {
		logger.Sync()
		os.Exit(0)
	}
)

func checkGoRustCutover(directory string) error {
	_, err := os.Stat(filepath.Join(directory, goRustCutoverMarker))
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	return fmt.Errorf("Go-to-Rust cutover is prepared; refusing to restart Go. Do not remove %s after importing checkpoints", goRustCutoverMarker)
}

func httpLocalhostGoRustCutover(c *gin.Context) {
	serverLifecycleMutex.Lock()
	defer serverLifecycleMutex.Unlock()
	ctx := NewMiscContext("rustCutover")
	waitForAllWebSocketCommandsToFinish()
	if !checkpointTablesOnce(ctx, goRustCutoverCheckpoints) {
		logger.Error("Rust cutover checkpoint failed; Go remains paused. Repair storage and retry.")
		c.String(http.StatusServiceUnavailable, "Checkpoint failed. Go remains paused; repair storage and retry.\n")
		return
	}
	filename := filepath.Join(projectPath, goRustCutoverMarker)
	if info, err := os.Lstat(filename); err == nil && info.Mode()&os.ModeSymlink != 0 {
		target, err := os.Readlink(filename)
		if err != nil {
			c.String(http.StatusInternalServerError, "Cannot resolve cutover marker.\n")
			logger.Error("Cannot resolve Rust cutover marker: " + err.Error())
			return
		}
		if !filepath.IsAbs(target) {
			target = filepath.Join(filepath.Dir(filename), target)
		}
		filename = target
	} else if err != nil && !os.IsNotExist(err) {
		c.String(http.StatusInternalServerError, "Cannot inspect cutover marker.\n")
		logger.Error("Cannot inspect Rust cutover marker: " + err.Error())
		return
	}
	if err := writeTableSnapshot(filename, []byte("Prepared Go-to-Rust cutover at "+time.Now().UTC().Format(time.RFC3339)+"\n")); err != nil {
		logger.Error("Cannot persist Rust cutover marker; Go remains paused: " + err.Error())
		c.String(http.StatusInternalServerError, "Cannot persist cutover marker. Go remains paused.\n")
		return
	}
	logger.Info("Go checkpoints saved for Rust cutover; stopping without terminating games.")
	message := "Go checkpoints saved. Go startup is blocked until cutover is resolved.\n"
	c.Header("Content-Length", strconv.Itoa(len(message)))
	c.String(http.StatusOK, message)
	c.Writer.Flush()
	goRustCutoverExit()
}
