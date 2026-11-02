package main

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestOutsidersCannotControlPregameTables(t *testing.T) {
	for _, name := range []string{"leader", "options"} {
		t.Run(name, func(t *testing.T) {
			table, ctx := newTimerTestTable(t)
			table.Running = false
			before, err := json.Marshal(table)
			if err != nil {
				t.Fatal(err)
			}
			outsider := NewFakeSession(999, "Outsider")
			if name == "leader" {
				commandTableSetLeader(ctx, outsider, &CommandData{
					TableID: table.ID, Name: table.Players[1].Name,
				})
			} else {
				options := *table.Options
				commandTableUpdate(ctx, outsider, &CommandData{
					TableID: table.ID, Name: "Other options", Options: &options, MaxPlayers: 5,
				})
			}
			after, err := json.Marshal(table)
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(before, after) {
				t.Fatal("an outsider changed table ownership, options, or chat")
			}
		})
	}
}
