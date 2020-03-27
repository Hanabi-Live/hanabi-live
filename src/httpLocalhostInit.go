package main

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

const (
	localhostPort = 8081
)

func httpLocalhostInit() {
	// Create a new Gin HTTP router
	gin.SetMode(gin.ReleaseMode)
	httpRouter := gin.Default() // Has the "Logger" and "Recovery" middleware attached

	// Path handlers
	httpRouter.GET("/restart", func(c *gin.Context) {
		graceful(true)
	})
	httpRouter.GET("/shutdown", func(c *gin.Context) {
		graceful(false)
	})
	httpRouter.GET("/debug", func(c *gin.Context) {
		debug()
	})

	// Listen and serve (HTTP)
	if err := http.ListenAndServe(
		"127.0.0.1:"+strconv.Itoa(localhostPort),
		httpRouter,
	); err != nil {
		logger.Fatal("http.ListenAndServe failed:", err)
		return
	}
	logger.Fatal("http.ListenAndServe ended prematurely.")
}
