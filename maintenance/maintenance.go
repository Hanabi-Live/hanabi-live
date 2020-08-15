package main

import (
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/op/go-logging"
)

const (
	HTTPReadTimeout  = 5 * time.Second
	HTTPWriteTimeout = 10 * time.Second
)

func main() {
	// Initialize logging using the "go-logging" library
	// http://godoc.org/github.com/op/go-logging#Formatter
	logger := logging.MustGetLogger("hanabi-live")
	loggingBackend := logging.NewLogBackend(os.Stdout, "", 0)
	logFormat := logging.MustStringFormatter( // https://golang.org/pkg/time/#Time.Format
		`%{time:Mon Jan 02 15:04:05 MST 2006} - %{level:.4s} - %{shortfile} - %{message}`,
	)
	loggingBackendFormatted := logging.NewBackendFormatter(loggingBackend, logFormat)
	logging.SetBackend(loggingBackendFormatted)

	// Get the project path
	// (we do not use "os.Executable()" because that fails when doing "go run")
	var projectPath string
	if v, err := os.Getwd(); err != nil {
		log.Fatal("Failed to get the current working directory:", err)
	} else {
		projectPath = v
	}

	// Get the parent directory
	// https://stackoverflow.com/questions/48570228/get-the-parent-path
	projectPath = filepath.Dir(projectPath)

	// Check to see if the ".env" file exists
	envPath := path.Join(projectPath, ".env")
	if _, err := os.Stat(envPath); os.IsNotExist(err) {
		logger.Fatal("The \"" + envPath + "\" file does not exist. " +
			"Did you run the \"install_dependencies.sh\" script before running the server? " +
			"This file should automatically be created when running this script.")
		return
	}

	// Load the ".env" file which contains environment variables with secret values
	if err := godotenv.Load(envPath); err != nil {
		logger.Fatal("Failed to load the \".env\" file:", err)
		return
	}

	// Read some configuration values from environment variables
	portString := os.Getenv("PORT")
	var port int
	if len(portString) == 0 {
		port = 80
	} else {
		if v, err := strconv.Atoi(portString); err != nil {
			logger.Fatal("Failed to convert the \"PORT\" environment variable to a number.")
			return
		} else {
			port = v
		}
	}
	tlsCertFile := os.Getenv("TLS_CERT_FILE")
	tlsKeyFile := os.Getenv("TLS_KEY_FILE")
	useTLS := false
	if len(tlsCertFile) != 0 && len(tlsKeyFile) != 0 {
		useTLS = true
		if port == 80 {
			port = 443
		}
	}

	// Create a new Gin HTTP router
	gin.SetMode(gin.ReleaseMode)                       // Comment this out to debug HTTP stuff
	httpRouter := gin.Default()                        // Has the "Logger" and "Recovery" middleware attached
	httpRouter.Use(gzip.Gzip(gzip.DefaultCompression)) // Add GZip compression middleware
	httpRouter.StaticFile("/", path.Join(projectPath, "maintenance", "index.html"))
	httpRouter.Static("/public", path.Join(projectPath, "public"))
	httpRouter.StaticFile("/favicon.ico", path.Join(projectPath, "public", "img", "favicon.ico"))

	if useTLS {
		// We want all HTTP requests to be redirected to HTTPS
		// The Gin router is using the default serve mux,
		// so we need to create a new fresh one for the HTTP handler
		HTTPServeMux := http.NewServeMux()
		HTTPServeMux.Handle(
			"/",
			http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				http.Redirect(
					w,
					req,
					"https://"+req.Host+req.URL.String(),
					http.StatusMovedPermanently,
				)
			}),
		)

		// ListenAndServe is blocking, so we need to start listening in a new goroutine
		go func() {
			// We need to create a new http.Server because the default one has no timeouts
			// https://blog.cloudflare.com/the-complete-guide-to-golang-net-http-timeouts/
			HTTPRedirectServerWithTimeout := &http.Server{
				Addr:         "0.0.0.0:80", // Listen on all IP addresses
				Handler:      HTTPServeMux,
				ReadTimeout:  HTTPReadTimeout,
				WriteTimeout: HTTPWriteTimeout,
			}
			if err := HTTPRedirectServerWithTimeout.ListenAndServe(); err != nil {
				logger.Fatal("ListenAndServe failed to start on port 80.")
				return
			}
			logger.Fatal("ListenAndServe ended for port 80.")
		}()
	}

	// Redirect mostly everything to the main maintenance page, e.g. "/"
	httpRouter.Use(func(c *gin.Context) {
		path := c.Request.URL.Path // "c.FullPath()" does not work for some reason
		if path != "/" &&
			!strings.HasPrefix(path, "/public/") {

			c.Redirect(http.StatusFound, "/")
		}
	})

	// Start listening and serving requests (which is blocking)
	// We need to create a new http.Server because the default one has no timeouts
	// https://blog.cloudflare.com/the-complete-guide-to-golang-net-http-timeouts/
	logger.Info("Listening on port " + strconv.Itoa(port) + ".")
	HTTPServerWithTimeout := &http.Server{
		Addr:         "0.0.0.0:" + strconv.Itoa(port), // Listen on all IP addresses
		Handler:      httpRouter,
		ReadTimeout:  HTTPReadTimeout,
		WriteTimeout: HTTPWriteTimeout,
	}
	if useTLS {
		if err := HTTPServerWithTimeout.ListenAndServeTLS(tlsCertFile, tlsKeyFile); err != nil {
			logger.Fatal("ListenAndServeTLS failed:", err)
			return
		}
		logger.Fatal("ListenAndServeTLS ended prematurely.")
	} else {
		if err := HTTPServerWithTimeout.ListenAndServe(); err != nil {
			logger.Fatal("ListenAndServe failed:", err)
			return
		}
		logger.Fatal("ListenAndServe ended prematurely.")
	}
}
