package main

import (
	"github.com/gin-gonic/gin"
)

func httpVideos(c *gin.Context) {
	w := c.Writer
	data := TemplateData{
		Title: "Videos",
	}
	httpServeTemplate(w, data, "informational", "videos")
}
