package main

import (
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestHTTPParseCommaSeparatedQuery(t *testing.T) {
	tests := []struct {
		name  string
		query string
		want  []string
	}{
		{name: "missing", query: "", want: []string{}},
		{name: "single", query: "?k=Alice", want: []string{"alice"}},
		{name: "multiple", query: "?k=Alice,Bob", want: []string{"alice", "bob"}},
		{name: "trims whitespace", query: "?k=Alice,%20Bob%20", want: []string{"alice", "bob"}},
		{name: "drops empty entries", query: "?k=,Alice,,%20,", want: []string{"alice"}},
		{name: "keeps inner spaces", query: "?k=Up%20or%20Down", want: []string{"up or down"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest("GET", "/"+tt.query, nil)
			if got := httpParseCommaSeparatedQuery(c, "k"); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestHTTPVariantNameMatchesAny(t *testing.T) {
	tests := []struct {
		name    string
		variant string
		terms   []string
		want    bool
	}{
		{name: "no terms", variant: "Rainbow (5 Suits)", terms: nil, want: false},
		{name: "substring", variant: "Rainbow (5 Suits)", terms: []string{"rainbow"}, want: true},
		{name: "case insensitive variant", variant: "Up or Down (5 Suits)", terms: []string{"up or down"}, want: true},
		{name: "second term matches", variant: "Duck (6 Suits)", terms: []string{"rainbow", "duck"}, want: true},
		{name: "no match", variant: "No Variant", terms: []string{"rainbow", "duck"}, want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := httpVariantNameMatchesAny(tt.variant, tt.terms); got != tt.want {
				t.Errorf("got %v, want %v", got, tt.want)
			}
		})
	}
}
