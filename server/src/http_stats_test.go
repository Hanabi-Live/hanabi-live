package main

import (
	"bytes"
	"html/template"
	"strings"
	"testing"
)

func TestStatsTemplateOnlyShowsGameCountsAndPlayTime(t *testing.T) {
	tmpl, err := template.ParseFiles("views/stats.tmpl", "views/logo.tmpl")
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := tmpl.ExecuteTemplate(&output, "content", &TemplateData{
		NumGamesTotal:      12,
		NumGamesNormal:     10,
		TimePlayed:         "3 hours",
		NumGamesSpeedrun:   4,
		TimePlayedSpeedrun: "5 minutes",
	}); err != nil {
		t.Fatal(err)
	}
	html := strings.Join(strings.Fields(output.String()), " ")
	for _, want := range []string{
		"Global Statistics",
		"Games played (in non-speedruns):",
		"12 (10 normally terminated)",
		"Time spent playing (in non-speedruns):",
		"3 hours",
		"Games played (in speedruns):",
		"> 4 </li>",
		"Time spent playing (in speedruns):",
		"5 minutes",
	} {
		if !strings.Contains(html, want) {
			t.Errorf("stats page is missing %q", want)
		}
	}
	if count := strings.Count(html, "<li>"); count != 4 {
		t.Errorf("got %d statistics, want 4", count)
	}
	for _, removed := range []string{"Number of variants", "max scores achieved", "Per-Variant", "<table", "pager", "tablesorter"} {
		if strings.Contains(html, removed) {
			t.Errorf("stats page still contains %q", removed)
		}
	}
}
