package httpmain

import (
	"github.com/gin-gonic/gin"
)

func (m *Manager) videos(c *gin.Context) {
	w := c.Writer
	data := &TemplateData{ // nolint: exhaustivestruct
		Title: "Videos",
	}
	m.serveTemplate(w, data, "informational", "videos")
}
