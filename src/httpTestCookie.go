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
		// It would be more correct to send a "StatusUnauthorized" error code,
		// but we do not want to cause an error in the JavaScript console
		// https://httpstatuses.com/
		http.Error(
			w,
			http.StatusText(http.StatusNoContent),
			http.StatusNoContent, // 204
		)
		return
	}

	http.Error(w, http.StatusText(http.StatusOK), http.StatusOK)
}
