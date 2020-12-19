package main

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

const longTableLength = time.Minute * 150 // 2.5 hours

func httpLocalhostGetLongTables(c *gin.Context) {
	now := time.Now()
	tableList := tables.GetList(true)
	msg := "Long tables:\n"
	i := 0
	for _, t := range tableList {
		if now.Sub(t.DatetimeCreated) >= longTableLength {
			i++
			msg += strconv.Itoa(i) + ") "
			msg += "Table ID: " + strconv.FormatUint(t.ID, 10) + ", "
			msg += "Name: " + t.Name + "\n"
		}
	}

	c.String(http.StatusOK, msg)
}
