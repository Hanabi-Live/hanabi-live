package httpmain

import (
	"github.com/gin-gonic/gin"
)

func videos(c *gin.Context) {
	w := c.Writer
	data := &TemplateData{ // nolint: exhaustivestruct
		Title: "Videos",
	}
	httpServeTemplate(w, data, "informational", "videos")
}
