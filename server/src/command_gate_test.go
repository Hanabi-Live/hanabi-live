package main

import (
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
)

func TestCommandGateDrainAndResume(t *testing.T) {
	gate := &commandGate{}
	entered := make(chan struct{}, 8)
	release := make(chan struct{})
	var active int32
	var workers sync.WaitGroup
	for i := 0; i < cap(entered); i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			if !gate.enter() {
				t.Error("initial command was rejected")
				entered <- struct{}{}
				return
			}
			atomic.AddInt32(&active, 1)
			entered <- struct{}{}
			<-release
			atomic.AddInt32(&active, -1)
			gate.leave()
		}()
	}
	for i := 0; i < cap(entered); i++ {
		<-entered
	}
	drained := make(chan struct{})
	go func() {
		gate.drain()
		if atomic.LoadInt32(&active) != 0 {
			t.Error("drain completed with commands still executing")
		}
		close(drained)
	}()
	close(release)
	<-drained
	workers.Wait()

	if gate.enter() {
		gate.leave()
		t.Fatal("a command was admitted after draining")
	}
	gate.resume()
	if !gate.enter() {
		t.Fatal("a command was rejected after resuming")
	}
	gate.leave()
}

func TestFailedRestartResumesCommands(t *testing.T) {
	oldTables, oldPath, oldProject, oldGate := tables, tablesPath, projectPath, incomingCommands
	t.Cleanup(func() {
		tables, tablesPath, projectPath, incomingCommands = oldTables, oldPath, oldProject, oldGate
	})
	projectPath = t.TempDir()
	for _, name := range []string{"packages/client/build_client.sh", "server/build_server.sh"} {
		filename := filepath.Join(projectPath, name)
		if err := os.MkdirAll(filepath.Dir(filename), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filename, []byte("#!/bin/sh\nexit 0\n"), 0700); err != nil {
			t.Fatal(err)
		}
	}
	tables = NewTables()
	table := snapshotTestTable()
	tables.Set(table.ID, table)
	tablesPath = filepath.Join(projectPath, "missing")
	incomingCommands = &commandGate{}

	gracefulRestart(NewMiscContext("test"))
	if !incomingCommands.enter() {
		t.Fatal("a failed snapshot left the server rejecting all commands")
	}
	incomingCommands.leave()
}
