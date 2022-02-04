package main

import (
	"fmt"
	"net/http"
	"runtime"

	"github.com/gin-gonic/gin"
)

func httpLocalhostMemory(c *gin.Context) {
	msg := getMemoryReport()
	c.String(http.StatusOK, msg)
}

func getMemoryReport() string {
	// Based on: https://golangcode.com/print-the-current-memory-usage/
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	msg := "\nMemory Report:"
	msg += fmt.Sprintf("\n  Alloc      = %v MiB", byteToMegaByte(memStats.Alloc))
	msg += fmt.Sprintf("\n  TotalAlloc = %v MiB", byteToMegaByte(memStats.TotalAlloc))
	msg += fmt.Sprintf("\n  Sys        = %v MiB", byteToMegaByte(memStats.TotalAlloc))
	msg += fmt.Sprintf("\n  NumGC      = %v\n", memStats.NumGC)

	return msg
}

func byteToMegaByte(b uint64) uint64 {
	return b / 1024 / 1024
}
