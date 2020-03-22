package main

import (
	"github.com/gin-gonic/gin"
)

func httpMain(c *gin.Context) {
	w := c.Writer
	data := TemplateData{
		Title:  "Main",
		Domain: domain,
	}
	httpServeTemplate(w, data, "main")
}

func httpDev(c *gin.Context) {
	w := c.Writer
	data := TemplateData{
		Title:  "Dev",
		Domain: domain,
	}
	httpServeTemplate(w, data, "main")
}
