package httpmain

import (
	"net"
	"net/http"

	"github.com/getsentry/sentry-go"
	"github.com/gin-gonic/gin"
)

func sentryMiddleware(c *gin.Context) {
	// Local variables
	r := c.Request
	w := c.Writer

	// Parse the IP address
	var ip string
	if v, _, err := net.SplitHostPort(r.RemoteAddr); err != nil {
		hLogger.Errorf("Failed to parse the IP address from \"%v\": %v", r.RemoteAddr, err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		ip = v
	}

	// If we encounter an error later on, we want metadata to be attached to the error message,
	// which can be helpful for debugging (since we can ask the user how they caused the error)
	sentry.ConfigureScope(func(scope *sentry.Scope) {
		scope.SetTag("userID", "n/a")
		scope.SetTag("username", "n/a")
		scope.SetTag("ip", ip)
		scope.SetTag("path", c.Request.URL.Path)
	})
}
