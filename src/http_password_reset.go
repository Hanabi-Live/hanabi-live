package main

import (
	"github.com/gin-gonic/gin"
)

func httpPasswordReset(c *gin.Context) {
	w := c.Writer
	data := TemplateData{
		Title: "Password Reset",
	}
	httpServeTemplate(w, data, "informational", "password-reset")
}
