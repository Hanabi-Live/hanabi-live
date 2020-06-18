package main

import (
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	uuid "github.com/satori/go.uuid"
)

var (
	// HTTPClientWithTimeout is used for sending web requests to external sites
	// (e.g. Google Analytics)
	// We don't want to use the default http.Client because it has no default timeout set
	HTTPClientWithTimeout = &http.Client{
		Timeout: 10 * time.Second,
	}
)

// Gin middleware for sending this page view to Google Analytics
// (we do this on the server because client-side blocking is common via uBlock Origin, Adblock Plus,
// etc.)
func httpGoogleAnalytics(c *gin.Context) {
	// Local variables
	w := c.Writer
	r := c.Request

	// We only want to track page views for "/", "/scores/Alice", etc.
	// (this goroutine will be entered for requests to "/public/css/main.min.css", for example)
	path := c.FullPath()
	if path != "/" &&
		!strings.HasPrefix(path, "/scores/") &&
		!strings.HasPrefix(path, "/profile/") &&
		!strings.HasPrefix(path, "/history/") &&
		!strings.HasPrefix(path, "/missing-scores/") &&
		!strings.HasPrefix(path, "/stats") &&
		!strings.HasPrefix(path, "/variant/") &&
		!strings.HasPrefix(path, "/videos") {

		return
	}

	// Get their Google Analytics cookie, if any
	// If they do not have one, set a new cookie
	var clientID string
	if cookie, err := r.Cookie("_ga"); err != nil {
		// They don't have a cookie set, so set a new one
		clientID = uuid.NewV4().String()
		http.SetCookie(w, &http.Cookie{
			// This is the standard cookie name used by the Google Analytics JavaScript library
			Name:  "_ga",
			Value: clientID,
			// The standard library does not have definitions for units of day
			// or larger to avoid confusion across daylight savings
			// We use 2 years because it is recommended by Google:
			// https://developers.google.com/analytics/devguides/collection/analyticsjs/cookie-usage
			Expires: time.Now().Add(2 * 365 * 24 * time.Hour), // 2 years
		})
	} else {
		clientID = cookie.Value
	}

	// Now we need to make a POST to google-analytics.com, but we need to do
	// that in a new goroutine to avoid locking up the server
	// According to the Gin documentation, we have to make a copy of the context
	// before using it inside of a goroutine
	contextCopy := c.Copy()
	go sendGoogleAnalytics(contextCopy, clientID)
	c.Next()
}

func sendGoogleAnalytics(c *gin.Context, clientID string) {
	// Local variables
	r := c.Request

	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	data := url.Values{
		"v":   {"1"},           // API version
		"tid": {GATrackingID},  // Tracking ID
		"cid": {clientID},      // Anonymous client ID
		"t":   {"pageview"},    // Hit type
		"dh":  {r.Host},        // Document hostname
		"dp":  {r.URL.Path},    // Document page/path
		"uip": {ip},            // IP address override
		"ua":  {r.UserAgent()}, // User agent override
	}
	resp, err := HTTPClientWithTimeout.PostForm(
		"https://www.google-analytics.com/collect",
		data,
	)
	if err != nil {
		// POSTs to Google Analytics will occasionally time out; if this occurs,
		// do not bother retrying, since losing a single page view is fairly meaningless
		logger.Info("Failed to send a page hit to Google Analytics:", err)
		return
	}
	defer resp.Body.Close()
}
