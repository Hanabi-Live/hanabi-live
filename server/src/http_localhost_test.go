package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestLocalhostOperationsRejectBrowserRequests(t *testing.T) {
	router := gin.New()
	router.Use(rejectBrowserOperations)
	router.GET("/maintenance", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	for _, header := range []string{"Origin", "Sec-Fetch-Site", ""} {
		request := httptest.NewRequest(http.MethodGet, "/maintenance", nil)
		switch header {
		case "Origin":
			request.Header.Set(header, "https://example.test")
		case "Sec-Fetch-Site":
			request.Header.Set(header, "cross-site")
		}
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		expected := http.StatusForbidden
		if header == "" {
			expected = http.StatusNoContent
		}
		if response.Code != expected {
			t.Fatalf("header %q: status %d, want %d", header, response.Code, expected)
		}
	}
}

func TestLocalhostTerminateAcceptsQueryAndFormIdentifiers(t *testing.T) {
	old := tables
	tables = NewTables()
	t.Cleanup(func() { tables = old })
	router := gin.New()
	router.GET("/terminate", httpLocalhostTerminate)
	router.POST("/terminate", httpLocalhostTerminate)
	requests := []*http.Request{
		httptest.NewRequest(http.MethodGet, "/terminate?tableID=999", nil),
		httptest.NewRequest(http.MethodPost, "/terminate", strings.NewReader("tableID=999")),
	}
	requests[1].Header.Set("Content-Type", "application/x-www-form-urlencoded")
	for _, request := range requests {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `Table "999" does not exist`) {
			t.Fatalf("%s: status %d, body %s", request.Method, response.Code, response.Body.String())
		}
	}
}
