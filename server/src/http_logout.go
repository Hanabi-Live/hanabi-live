package main

import (
	"net"
	"net/http"

	"github.com/Zamiell/hanabi-live/logger"
	gsessions "github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

func httpLogout(c *gin.Context) {
	deleteCookie(c)

	// We need tell tell the browser to not cache the redirect
	// https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching
	// Otherwise, after the first logout, the redirect would be cached, and then on the second
	// logout and beyond, the browser would not actually send a GET request to "/logout"
	c.Writer.Header().Set("Cache-Control", "no-store")

	path := "/"
	if _, ok := c.Request.URL.Query()["dev"]; ok {
		path += "?dev"
	}
	c.Redirect(http.StatusMovedPermanently, path)
}

func deleteCookie(c *gin.Context) {
	// Local variables
	r := c.Request
	w := c.Writer

	// Parse the IP address
	var ip string
	if v, _, err := net.SplitHostPort(r.RemoteAddr); err != nil {
		logger.Error("Failed to parse the IP address from \"" + r.RemoteAddr + "\": " + err.Error())
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		ip = v
	}

	// Overwrite their session cookie, if any
	session := gsessions.Default(c)
	session.Clear()
	if err := session.Save(); err != nil {
		logger.Error("Failed to clear the cookie for IP \"" + ip + "\": " + err.Error())
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	}
}
