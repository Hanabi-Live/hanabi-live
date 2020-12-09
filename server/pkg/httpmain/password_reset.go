package httpmain

import (
	"net/http"

	"github.com/alexedwards/argon2id"
	"github.com/gin-gonic/gin"
)

func passwordReset(c *gin.Context) {
	w := c.Writer
	data := &TemplateData{ // nolint: exhaustivestruct
		Title: "Password Reset",
	}
	serveTemplate(w, data, "informational", "password-reset")
}

func passwordResetPost(c *gin.Context) {
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
		hLogger.Errorf(
			"Failed to create a hash from the submitted password (in the password reset form): %v",
			err,
		)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		hash = v
	}

	c.String(http.StatusOK, hash)
}
