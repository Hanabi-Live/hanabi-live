package main

import (
	"github.com/gin-gonic/gin"
)

func httpDev(c *gin.Context) {
	w := c.Writer
	data := TemplateData{
		Title: "Dev",
	}
	httpServeTemplate(w, data, "main")
}
