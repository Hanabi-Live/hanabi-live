package main

import (
	"net/http"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/gin-gonic/gin"
)

func httpPasswordReset(c *gin.Context) {
	w := c.Writer
	data := &TemplateData{ // nolint: exhaustivestruct
		Title: "Password Reset",
	}
	httpServeTemplate(w, data, "informational", "password-reset")
}

func httpPasswordResetPost(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Validate the password
	password := c.PostForm("password")
	if password == "" {
		http.Error(w, "Error: You must specify a username.", http.StatusBadRequest)
		return
	}

	// Hash it with Argon2id
	var hash string
	if v, err := accountPasswordHash(c.Request.Context(), password); err != nil {
		logger.Error("Failed to create a hash from the submitted password " +
			"(in the password reset form): " + err.Error())
		accountPasswordError(w, err)
		return
	} else {
		hash = v
	}

	c.String(http.StatusOK, hash)
}
