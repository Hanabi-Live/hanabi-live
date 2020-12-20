package httpmain

import (
	"github.com/gin-gonic/gin"
)

func (m *Manager) videos(c *gin.Context) {
	// Local variables
	w := c.Writer

	type videosData struct {
		Title  string
		Common *commonData
	}
	data := &videosData{
		Title:  "Videos",
		Common: m.getCommonData(),
	}
	m.serveTemplate(w, data, "informational", "videos")
}
