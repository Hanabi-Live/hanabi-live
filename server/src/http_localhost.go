// The server also listens on a separate port that only accepts connections from the local system;
// this allows administrative tasks to be performed without having to go through a browser

package main

import (
	"net/http"
	"os"
	"strconv"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/gin-gonic/gin"
)

func httpLocalhostInit() {
	// Read some configuration values from environment variables
	// (they were loaded from the ".env" file in "main.go")
	portString := os.Getenv("LOCALHOST_PORT")
	var port int
	if len(portString) == 0 {
		port = 8081
	} else {
		if v, err := strconv.Atoi(portString); err != nil {
			logger.Fatal("Failed to convert the \"LOCALHOST_PORT\" " +
				"environment variable to a number.")
			return
		} else {
			port = v
		}
	}

	// Create a new Gin HTTP router
	httpRouter := gin.Default() // Has the "Logger" and "Recovery" middleware attached

	// Path handlers
	httpRouter.POST("/ban", httpLocalhostUserAction)
	httpRouter.POST("/mute", httpLocalhostUserAction)
	httpRouter.POST("/sendError", httpLocalhostUserAction)
	httpRouter.POST("/sendWarning", httpLocalhostUserAction)
	httpRouter.POST("/sendWarningAll", httpLocalhostSendWarningAll)

	httpRouter.GET("/cancel", httpLocalhostCancel)
	httpRouter.GET("/clearEmptyTables", httpLocalhostClearEmptyTables)
	httpRouter.GET("/debugFunction", httpLocalhostDebugFunction)
	httpRouter.GET("/getLongTables", httpLocalhostGetLongTables)
	httpRouter.GET("/gracefulRestart", httpLocalhostGracefulRestart)
	httpRouter.GET("/maintenance", httpLocalhostMaintenance)
	httpRouter.GET("/memory", httpLocalhostMemory)
	httpRouter.GET("/print", httpLocalhostPrint)
	httpRouter.GET("/saveTables", httpLocalhostSaveTables)
	httpRouter.GET("/shutdown", httpLocalhostShutdown)
	httpRouter.GET("/terminate", httpLocalhostTerminate)
	httpRouter.GET("/timeLeft", httpLocalhostTimeLeft)
	httpRouter.GET("/uptime", httpLocalhostUptime)
	httpRouter.GET("/version", httpLocalhostVersion)
	httpRouter.GET("/unmaintenance", httpLocalhostUnmaintenance)

	// We need to create a new http.Server because the default one has no timeouts
	// https://blog.cloudflare.com/the-complete-guide-to-golang-net-http-timeouts/
	HTTPServerWithTimeout := &http.Server{ // nolint: exhaustivestruct
		Addr:         "127.0.0.1:" + strconv.Itoa(port), // Listen only on the localhost interface
		Handler:      httpRouter,
		ReadTimeout:  HTTPReadTimeout,
		WriteTimeout: HTTPWriteTimeout,
	}
	if err := HTTPServerWithTimeout.ListenAndServe(); err != nil {
		logger.Fatal("ListenAndServe failed (for localhost): " + err.Error())
		return
	}
	logger.Fatal("ListenAndServe ended prematurely (for localhost).")
}

func httpLocalhostUserAction(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Validate the username
	username := c.PostForm("username")
	if username == "" {
		http.Error(w, "Error: You must specify a username.", http.StatusBadRequest)
		return
	}

	// Check to see if this username exists in the database
	var userID int
	if exists, v, err := models.Users.Get(username); err != nil {
		logger.Error("Failed to get user \"" + username + "\": " + err.Error())
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else if !exists {
		c.String(http.StatusOK, "User \""+username+"\" does not exist in the database.\n")
		return
	} else {
		userID = v.ID
	}

	// Get the IP for this user
	var lastIP string
	if v, err := models.Users.GetLastIP(username); err != nil {
		logger.Error("Failed to get the last IP for \"" + username + "\": " + err.Error())
		return
	} else {
		lastIP = v
	}

	path := c.Request.URL.Path
	if path == "/ban" {
		httpLocalhostBan(c, username, lastIP, userID)
	} else if path == "/mute" {
		httpLocalhostMute(c, username, lastIP, userID)
	} else if path == "/sendWarning" {
		httpLocalhostSendWarning(c, userID)
	} else if path == "/sendError" {
		httpLocalhostSendError(c, userID)
	} else {
		http.Error(w, "Error: Invalid URL.", http.StatusNotFound)
	}
}

func logoutUser(userID int) {
	s, ok := sessions.Get(userID)

	if !ok {
		logger.Info("Attempted to manually log out user " + strconv.Itoa(userID) + ", " +
			"but they were not online.")
		return
	}

	if err := s.ms.Close(); err != nil {
		logger.Error("Failed to manually close the WebSocket session for user " +
			strconv.Itoa(userID) + ": " + err.Error())
	} else {
		logger.Info("Successfully terminated the WebSocket session for user " +
			strconv.Itoa(userID) + ".")
	}
}
