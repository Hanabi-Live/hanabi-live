package main

import (
	"net/http"
	"strconv"
	"strings"

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
		c.String(http.StatusOK, "success\n")
	})
	httpRouter.GET("/shutdown", func(c *gin.Context) {
		graceful(false)
		c.String(http.StatusOK, "success\n")
	})
	httpRouter.GET("/ban/:username", httpUserAction)
	httpRouter.GET("/mute/:username", httpUserAction)
	httpRouter.GET("/uptime", httpUptime)
	httpRouter.GET("/debug", func(c *gin.Context) {
		debug()
		c.String(http.StatusOK, "success\n")
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

func httpUserAction(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Parse the username from the URL
	username := c.Param("username")
	if username == "" {
		http.Error(w, "Error: You must specify a username.", http.StatusNotFound)
		return
	}

	// Check to see if this username exists in the database
	var userID int
	if exists, v, err := models.Users.Get(username); err != nil {
		logger.Error("Failed to get user \""+username+"\":", err)
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
		logger.Error("Failed to get the last IP for \""+username+"\":", err)
		return
	} else {
		lastIP = v
	}

	path := c.FullPath()
	if strings.HasPrefix(path, "/ban/") {
		httpBan(c, username, lastIP, userID)
	} else if strings.HasPrefix(path, "/mute/") {
		httpMute(c, username, lastIP, userID)
	} else {
		http.Error(w, "Error: Invalid URL.", http.StatusNotFound)
	}
}

func httpBan(c *gin.Context, username string, ip string, userID int) {
	// Local variables
	w := c.Writer

	// Check to see if this IP is already banned
	if banned, err := models.BannedIPs.Check(ip); err != nil {
		logger.Error("Failed to check to see if the IP \""+ip+"\" is banned:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else if banned {
		c.String(http.StatusOK, "User \""+username+"\" has an IP of \""+ip+"\", "+
			"but it is already banned.\n")
		return
	}

	// Insert a new row in the database for this IP
	if err := models.BannedIPs.Insert(ip, userID); err != nil {
		logger.Error("Failed to insert the banned IP row:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	}

	logoutUser(username)

	c.String(http.StatusOK, "success\n")
}

func httpMute(c *gin.Context, username string, ip string, userID int) {
	// Local variables
	w := c.Writer

	// Check to see if this IP is already muted
	if muted, err := models.MutedIPs.Check(ip); err != nil {
		logger.Error("Failed to check to see if the IP \""+ip+"\" is muted:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else if muted {
		c.String(http.StatusOK, "User \""+username+"\" has an IP of \""+ip+"\", "+
			"but it is already muted.\n")
		return
	}

	// Insert a new row in the database for this IP
	if err := models.MutedIPs.Insert(ip, userID); err != nil {
		logger.Error("Failed to insert the muted IP row:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	}

	// They need to re-login for the mute to take effect,
	// so disconnect their existing connection, if any
	logoutUser(username)

	c.String(http.StatusOK, "success\n")
}

func logoutUser(username string) {
	for _, s := range sessions {
		if s.Username() != username {
			continue
		}

		if err := s.Close(); err != nil {
			logger.Info("Attempted to manually close a WebSocket connection, but it failed.")
		} else {
			logger.Info("Successfully terminated a WebSocket connection.")
		}
		return
	}
}

func httpUptime(c *gin.Context) {
	// Local variables
	w := c.Writer

	msg := getCameOnline() + "\n"
	var uptime string
	if v, err := getUptime(); err != nil {
		logger.Error("Failed to get the uptime:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		uptime = v
	}
	msg += uptime + "\n"

	c.String(http.StatusOK, msg)
}
