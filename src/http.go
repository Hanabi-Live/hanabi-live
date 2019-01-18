package main

import (
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"text/template"

	gsessions "github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
)

type TemplateData struct {
	Title  string
	Header bool
}

const (
	sessionName = "hanabi.sid"
)

var (
	sessionStore gsessions.Store
)

func httpInit() {
	// Create a new Gin HTTP router
	gin.SetMode(gin.ReleaseMode) // Comment this out to debug HTTP stuff
	httpRouter := gin.New()
	httpRouter.Use(gin.Recovery())
	//httpRouter.Use(gin.Logger()) // Uncomment this out to enable HTTP request logging

	// Read some configuration values from environment variables
	// (they were loaded from the .env file in main.go)
	domain := os.Getenv("DOMAIN")
	if len(domain) == 0 {
		log.Info("The \"DOMAIN\" environment variable is blank; aborting HTTP initialization.")
		return
	}
	sessionSecret := os.Getenv("SESSION_SECRET")
	if len(sessionSecret) == 0 {
		log.Info("The \"SESSION_SECRET\" environment variable is blank; aborting HTTP initialization.")
		return
	}
	portString := os.Getenv("PORT")
	var port int
	if len(portString) == 0 {
		port = 80
	} else {
		if v, err := strconv.Atoi(portString); err != nil {
			log.Fatal("Failed to convert the \"PORT\" environment variable to a number.")
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

	// Create a session store
	sessionStore = cookie.NewStore([]byte(sessionSecret))
	options := gsessions.Options{
		Path:   "/",
		Domain: domain,
		MaxAge: 1, // in seconds
		// After getting a cookie via "/login", the client will immediately
		// establish a WebSocket connection via "/ws", so the cookie only needs
		// to exist for that time frame
		Secure: true,
		// Only send the cookie over HTTPS:
		// https://www.owasp.org/index.php/Testing_for_cookies_attributes_(OTG-SESS-002)
		HttpOnly: true,
		// Mitigate XSS attacks:
		// https://www.owasp.org/index.php/HttpOnly
	}
	if !useTLS {
		options.Secure = false
	}
	sessionStore.Options(options)
	httpRouter.Use(gsessions.Sessions(sessionName, sessionStore))

	// Path handlers (for the WebSocket server)
	httpRouter.POST("/login", httpLogin)
	httpRouter.GET("/ws", httpWS)

	// Path handlers (for the website)
	httpRouter.GET("/", httpMain)
	httpRouter.GET("/profile", httpProfile)
	httpRouter.GET("/profile/:player", httpProfile)
	httpRouter.GET("/missing-scores", httpMissingScores)
	httpRouter.GET("/missing-scores/:player", httpMissingScores)

	httpRouter.GET("/videos", httpVideos)
	httpRouter.GET("/flowcharts", httpFlowcharts)
	httpRouter.GET("/flowcharts/early5clue", httpEarly5Clue)
	httpRouter.GET("/dev", httpMainDev)
	httpRouter.Static("/public", path.Join(projectPath, "public"))

	if useTLS {
		// We want all HTTP requests to be redirected to HTTPS
		// (but make an exception for Let's Encrypt)
		// The Gin router is using the default serve mux, so we need to create a
		// new fresh one for the HTTP handler
		HTTPServeMux := http.NewServeMux()
		HTTPServeMux.Handle("/.well-known/acme-challenge/", http.FileServer(http.FileSystem(http.Dir("../letsencrypt"))))
		HTTPServeMux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			http.Redirect(w, req, "https://"+req.Host+req.URL.String(), http.StatusMovedPermanently)
		}))

		// ListenAndServe is blocking, so start listening on a new goroutine
		go func() {
			// Nothing before the colon implies 0.0.0.0
			if err := http.ListenAndServe(":80", HTTPServeMux); err != nil {
				log.Fatal("http.ListenAndServe failed to start on 80.")
			}
			log.Fatal("http.ListenAndServe ended for port 80.")
		}()
	}

	// Start listening and serving requests (which is blocking)
	log.Info("Listening on port " + strconv.Itoa(port) + ".")
	if useTLS {
		if err := http.ListenAndServeTLS(
			":"+strconv.Itoa(port), // Nothing before the colon implies 0.0.0.0
			tlsCertFile,
			tlsKeyFile,
			httpRouter,
		); err != nil {
			log.Fatal("http.ListenAndServeTLS failed:", err)
		}
		log.Fatal("http.ListenAndServeTLS ended prematurely.")
	} else {
		// Listen and serve (HTTP)
		if err := http.ListenAndServe(
			":"+strconv.Itoa(port), // Nothing before the colon implies 0.0.0.0
			httpRouter,
		); err != nil {
			log.Fatal("http.ListenAndServe failed:", err)
		}
		log.Fatal("http.ListenAndServe ended prematurely.")
	}
}

// httpServeTemplate combines a standard HTML header with the body for a specific page
// (we want the same HTML header for all pages)
func httpServeTemplate(w http.ResponseWriter, data interface{}, templateName ...string) {
	viewsPath := path.Join(projectPath, "src", "views")
	layoutPath := path.Join(viewsPath, "layout.tmpl")
	//turns the slice of file names into a slice of full paths
	for i := 0; i < len(templateName); i++ {
		templateName[i] = path.Join(viewsPath, templateName[i]+".tmpl")
	}

	// Ensure that the layout file exists
	if _, err := os.Stat(layoutPath); os.IsNotExist(err) {
		log.Error("The layout template does not exist.")
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
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

	//append the main layout to our list of playouts
	templateName = append(templateName, layoutPath)
	// Create the template
	tmpl, err := template.ParseFiles(templateName...)
	if err != nil {
		log.Error("Failed to create the template:", err.Error())
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}

	// Execute the template and send it to the user
	if err := tmpl.ExecuteTemplate(w, "layout", data); err != nil {
		if strings.HasSuffix(err.Error(), ": write: broken pipe") ||
			strings.HasSuffix(err.Error(), ": client disconnected") ||
			strings.HasSuffix(err.Error(), ": http2: stream closed") ||
			strings.HasSuffix(err.Error(), ": write: connection timed out") {

			// Some errors are common and expected
			// (e.g. the user presses the "Stop" button while the template is executing)
			log.Info("Ordinary error when executing the template: " + err.Error())
		} else {
			log.Error("Failed to execute the template: " + err.Error())
		}
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
	}
}
