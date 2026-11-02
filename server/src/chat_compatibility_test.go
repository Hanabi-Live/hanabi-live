package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestChatProtocolCompatibility(t *testing.T) {
	type fixture struct {
		Name       string `json:"name"`
		Input      string `json:"input"`
		Normalized string `json:"normalized"`
		Valid      bool   `json:"valid"`
	}
	cases := []fixture{
		{Name: "plain", Input: "  hello  "},
		{Name: "ascii-byte-limit", Input: strings.Repeat("x", 301)},
		{Name: "emoji-byte-limit", Input: strings.Repeat("\U0001F600", 76)},
		{Name: "accent-byte-limit", Input: strings.Repeat("\u00e9", 151)},
		{Name: "partial-rune-boundary", Input: strings.Repeat("x", 299) + "\u00e9"},
		{Name: "control-and-space-removal", Input: " a\tb\nc\r\u00a0d\u2003e "},
		{Name: "blank", Input: "\u200b\t\n"},
		{Name: "three-marks", Input: "e\u0301\u0302\u0303"},
		{Name: "four-marks", Input: "e\u0301\u0302\u0303\u0304"},
		{Name: "nonspacing-selectors", Input: "a" + strings.Repeat("\ufe0f", 4)},
		{Name: "spacing-diacritics", Input: "a" + strings.Repeat("\u02c6", 4)},
		{Name: "html-remains-text", Input: "<b>&\"'"},
	}
	for i := range cases {
		cases[i].Normalized, cases[i].Valid = sanitizeChatInput(nil, cases[i].Input, false)
	}
	filename := filepath.Join("testdata", "chat_protocol.json")
	if *updateCompatibility {
		encoded, err := json.MarshalIndent(cases, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filename, append(encoded, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	encoded, err := os.ReadFile(filename)
	if err != nil {
		t.Fatal(err)
	}
	var expected []fixture
	if err := json.Unmarshal(encoded, &expected); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(cases, expected) {
		t.Fatal("Go chat behavior differs from its reviewed compatibility fixture")
	}
}
