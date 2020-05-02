package main

import (
	"net/http"

	gsessions "github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

func httpTestCookie(c *gin.Context) {
	// Local variables
	w := c.Writer

	// If they have logged in, their cookie should have values that we set in httpLogin.go
	session := gsessions.Default(c)
	if v := session.Get("userID"); v == nil {
		http.Error(
			w,
			http.StatusText(http.StatusUnauthorized),
			http.StatusUnauthorized,
		)
		return
	}

	http.Error(w, http.StatusText(http.StatusOK), http.StatusOK)
}
