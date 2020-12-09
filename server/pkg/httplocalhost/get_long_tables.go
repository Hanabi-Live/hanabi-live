package httplocalhost

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

const longTableLength = time.Minute * 150 // 2.5 hours

func getLongTables(c *gin.Context) {
	// TODO
	/*
		now := time.Now()
		tableList := tables.GetList(true)
		msg := "Long tables:\n"
		i := 0
		for _, t := range tableList {
			if now.Sub(t.DatetimeCreated) >= longTableLength {
				i++
				msg += fmt.Sprintf("%v) Table ID: %v, Name: %v\n", i, t.ID, t.Name)
			}
		}
	*/

	msg := ""
	c.String(http.StatusOK, msg)
}
