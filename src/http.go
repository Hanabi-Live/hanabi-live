package main

import (
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"text/template"
	"time"

	"github.com/didip/tollbooth"
	"github.com/didip/tollbooth_gin"
	sentrygin "github.com/getsentry/sentry-go/gin"
	gsessions "github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
)

type TemplateData struct {
	Title     string // Used to populate the <title> tag
	Domain    string // Used to validate that the user is going to the correct URL
	Version   int
	Compiling bool // True if we are currently recompiling the TypeScript client
	Dev       bool
	Name      string // Used for the profile
}

const (
	// The name supplied to the Gin session middleware can be any arbitrary string
	HTTPSessionName    = "hanabi.sid"
	HTTPSessionTimeout = 60 * 60 * 24 * 365 // 1 year in seconds
)

var (
	domain       string
	GATrackingID string
)

func httpInit() {
	// Read some configuration values from environment variables
	// (they were loaded from the ".env" file in "main.go")
	domain = os.Getenv("DOMAIN")
	if len(domain) == 0 {
		logger.Info("The \"DOMAIN\" environment variable is blank; aborting HTTP initialization.")
		return
	}
	sessionSecret := os.Getenv("SESSION_SECRET")
	if len(sessionSecret) == 0 {
		logger.Info("The \"SESSION_SECRET\" environment variable is blank; " +
			"aborting HTTP initialization.")
		return
	}
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
	GATrackingID = os.Getenv("GA_TRACKING_ID")

	// Create a new Gin HTTP router
	gin.SetMode(gin.ReleaseMode) // Comment this out to debug HTTP stuff
	httpRouter := gin.Default()  // Has the "Logger" and "Recovery" middleware attached

	// Attach rate-limiting middleware from Tollbooth
	// The limiter works per path request,
	// meaning that a user can only request one specific path every X seconds
	// Thus, this does not impact the ability of a user to download CSS and image files all at once
	limiter := tollbooth.NewLimiter(2, nil) // Limit each user to 2 requests per second
	limiter.SetMessage(http.StatusText(http.StatusTooManyRequests))
	limiterMiddleware := tollbooth_gin.LimitHandler(limiter)
	httpRouter.Use(limiterMiddleware)

	// Attach the Sentry middleware
	if usingSentry {
		httpRouter.Use(sentrygin.New(sentrygin.Options{}))
	}

	// Create a session store
	httpSessionStore := cookie.NewStore([]byte(sessionSecret))
	options := gsessions.Options{
		Path:   "/",
		Domain: domain,
		// After getting a cookie via "/login", the client will immediately
		// establish a WebSocket connection via "/ws", so the cookie only needs
		// to exist for that time frame
		MaxAge: HTTPSessionTimeout, // In seconds
		// Only send the cookie over HTTPS:
		// https://www.owasp.org/index.php/Testing_for_cookies_attributes_(OTG-SESS-002)
		Secure: true,
		// Mitigate XSS attacks:
		// https://www.owasp.org/index.php/HttpOnly
		HttpOnly: true,
		// Mitigate CSRF attacks:
		// https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#SameSite_cookies
		SameSite: http.SameSiteStrictMode,
	}
	if !useTLS {
		options.Secure = false
	}
	httpSessionStore.Options(options)

	// Attach the sessions middleware
	httpRouter.Use(gsessions.Sessions(HTTPSessionName, httpSessionStore))

	// Initialize Google Analytics
	if len(GATrackingID) > 0 {
		httpRouter.Use(httpGoogleAnalytics) // Attach the Google Analytics middleware
	}

	// Path handlers (for cookies and logging in)
	httpRouter.POST("/login", httpLogin)
	httpRouter.GET("/logout", httpLogout)
	httpRouter.GET("/test-cookie", httpTestCookie)
	httpRouter.GET("/ws", httpWS)

	// Path handlers (for the main website)
	httpRouter.GET("/", httpMain)
	httpRouter.GET("/replay", httpMain)
	httpRouter.GET("/replay/:gameID", httpMain)
	httpRouter.GET("/replay/:gameID/:turn", httpMain)
	httpRouter.GET("/shared-replay", httpMain)
	httpRouter.GET("/shared-replay/:gameID", httpMain)
	httpRouter.GET("/shared-replay/:gameID/:turn", httpMain)
	httpRouter.GET("/test", httpMain)
	httpRouter.GET("/test/:testNum", httpMain)

	// Path handlers (for development)
	// ("/dev" is the same as "/" but uses unbundled JavaScript/CSS)
	httpRouter.GET("/dev", httpMain)
	httpRouter.GET("/dev/replay", httpMain)
	httpRouter.GET("/dev/replay/:gameID", httpMain)
	httpRouter.GET("/dev/replay/:gameID/:turn", httpMain)
	httpRouter.GET("/dev/shared-replay", httpMain)
	httpRouter.GET("/dev/shared-replay/:gameID", httpMain)
	httpRouter.GET("/dev/shared-replay/:gameID/:turn", httpMain)
	httpRouter.GET("/dev/test", httpMain)
	httpRouter.GET("/dev/test/:testNum", httpMain)
	httpRouter.GET("/dev2", httpMain) // Used for testing the new Phaser client

	// Path handlers for other URLs
	httpRouter.GET("/scores", httpScores)
	httpRouter.GET("/scores/:player", httpScores)
	httpRouter.GET("/profile", httpScores) // "/profile" is an alias for "/scores"
	httpRouter.GET("/profile/:player", httpScores)
	httpRouter.GET("/history", httpHistory)
	httpRouter.GET("/history/:player", httpHistory)
	httpRouter.GET("/missing-scores", httpScores)
	httpRouter.GET("/missing-scores/:player", httpScores)
	httpRouter.GET("/stats", httpStats)
	httpRouter.GET("/variant/:id", httpVariant)
	httpRouter.GET("/videos", httpVideos)
	httpRouter.GET("/password-reset", httpPasswordReset)
	httpRouter.POST("/password-reset", httpPasswordResetPost)

	// Path handlers for bots, developers, researchers, etc.
	httpRouter.GET("/export", httpExport)
	httpRouter.GET("/export/:game", httpExport)
	httpRouter.GET("/deals", httpDeals)
	httpRouter.GET("/deals/:seed", httpDeals)

	// Other
	httpRouter.Static("/public", path.Join(projectPath, "public"))
	httpRouter.StaticFile("/favicon.ico", path.Join(projectPath, "public", "img", "favicon.png"))

	if useTLS {
		// We want all HTTP requests to be redirected to HTTPS
		// (but make an exception for Let's Encrypt)
		// The Gin router is using the default serve mux,
		// so we need to create a new fresh one for the HTTP handler
		HTTPServeMux := http.NewServeMux()
		letsEncryptPath := path.Join(projectPath, "letsencrypt")
		HTTPServeMux.Handle(
			"/.well-known/acme-challenge/",
			http.FileServer(http.FileSystem(http.Dir(letsEncryptPath))),
		)
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
				ReadTimeout:  5 * time.Second,
				WriteTimeout: 10 * time.Second,
			}
			if err := HTTPRedirectServerWithTimeout.ListenAndServe(); err != nil {
				logger.Fatal("ListenAndServe failed to start on port 80.")
				return
			}
			logger.Fatal("ListenAndServe ended for port 80.")
		}()
	}

	// Start listening and serving requests (which is blocking)
	// We need to create a new http.Server because the default one has no timeouts
	// https://blog.cloudflare.com/the-complete-guide-to-golang-net-http-timeouts/
	logger.Info("Listening on port " + strconv.Itoa(port) + ".")
	HTTPServerWithTimeout := &http.Server{
		Addr:         "0.0.0.0:" + strconv.Itoa(port), // Listen on all IP addresses
		Handler:      httpRouter,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
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

// httpServeTemplate combines a standard HTML header with the body for a specific page
// (we want the same HTML header for all pages)
func httpServeTemplate(w http.ResponseWriter, data interface{}, templateName ...string) {
	viewsPath := path.Join(projectPath, "src", "views")
	layoutPath := path.Join(viewsPath, "layout.tmpl")

	// Turn the slice of file names into a slice of full paths
	for i := 0; i < len(templateName); i++ {
		templateName[i] = path.Join(viewsPath, templateName[i]+".tmpl")
	}

	// Ensure that the layout file exists
	if _, err := os.Stat(layoutPath); os.IsNotExist(err) {
		logger.Error("The layout template does not exist.")
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	}

	// Return a 404 if the template doesn't exist or it is a directory
	if info, err := os.Stat(layoutPath); os.IsNotExist(err) {
		http.Error(w, http.StatusText(http.StatusNotFound), http.StatusNotFound)
		return
	} else if info.IsDir() {
		http.Error(w, http.StatusText(http.StatusNotFound), http.StatusNotFound)
		return
	}

	// Append the main layout to our list of layouts
	templateName = append(templateName, layoutPath)

	// Create the template
	var tmpl *template.Template
	if v, err := template.ParseFiles(templateName...); err != nil {
		logger.Error("Failed to create the template:", err.Error())
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		tmpl = v
	}

	// Execute the template and send it to the user
	if err := tmpl.ExecuteTemplate(w, "layout", data); err != nil {
		if strings.HasSuffix(err.Error(), "client disconnected") ||
			strings.HasSuffix(err.Error(), "http2: stream closed") ||
			strings.HasSuffix(err.Error(), "write: broken pipe") ||
			strings.HasSuffix(err.Error(), "write: connection reset by peer") ||
			strings.HasSuffix(err.Error(), "write: connection timed out") ||
			strings.HasSuffix(err.Error(), "i/o timeout") {

			// Some errors are common and expected
			// (e.g. the user presses the "Stop" button while the template is executing)
			logger.Info("Ordinary error when executing the template: " + err.Error())
		} else {
			logger.Error("Failed to execute the template: " + err.Error())
		}
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
	}
}
