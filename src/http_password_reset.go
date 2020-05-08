package main

import (
	"net/http"

	"github.com/alexedwards/argon2id"
	"github.com/gin-gonic/gin"
)

func httpPasswordReset(c *gin.Context) {
	w := c.Writer
	data := TemplateData{
		Title: "Password Reset",
		Dev:   false,
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
	if v, err := argon2id.CreateHash(password, argon2id.DefaultParams); err != nil {
		logger.Error("Failed to create a hash from the submitted password "+
			"(in the password reset form):", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		hash = v
	}

	c.JSON(http.StatusOK, gin.H{
		"hash": hash,
	})
}
