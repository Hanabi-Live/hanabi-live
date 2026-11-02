package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func assertAccountPassword(t *testing.T, hash string, password string) {
	t.Helper()
	match, params, err := accountPasswordCheck(context.Background(), password, hash)
	if err != nil || !match || params == nil || *params != accountPasswordParams() {
		t.Fatalf("account hash did not match the password and policy: match=%v params=%+v err=%v", match, params, err)
	}
}

func accountPasswordTestDatabase(t *testing.T) {
	t.Helper()
	gamePersistenceDatabase(t)
	old := models
	models = &Models{}
	t.Cleanup(func() { models = old })
}

func accountPasswordTestUser(t *testing.T, name string) User {
	t.Helper()
	exists, user, err := models.Users.Get(name)
	if err != nil || !exists {
		t.Fatalf("missing fixture user: %v", err)
	}
	return user
}

func TestAccountPasswordRegistrationAndResetUseSharedPolicy(t *testing.T) {
	accountPasswordTestDatabase(t)
	data := &HTTPLoginData{Username: "Alice", NormalizedUsername: "alice", Password: "registration", IP: "127.0.0.1"}
	if _, ok := httpCreateNewUser(context.Background(), httptest.NewRecorder(), data); !ok {
		t.Fatal("registration failed")
	}
	assertAccountPassword(t, accountPasswordTestUser(t, "Alice").PasswordHash.String, data.Password)

	router := gin.New()
	router.POST("/password-reset", httpPasswordResetPost)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/password-reset",
		strings.NewReader(url.Values{"password": {"reset-password"}}.Encode()))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("reset hash endpoint returned %d", response.Code)
	}
	assertAccountPassword(t, response.Body.String(), "reset-password")
}

func TestAccountPasswordOldHashUpgradesOnlyAfterSuccessfulLogin(t *testing.T) {
	accountPasswordTestDatabase(t)
	if _, err := models.Users.Insert("Alice", "alice", compatibilityPasswordHash, "127.0.0.1"); err != nil {
		t.Fatal(err)
	}
	user := accountPasswordTestUser(t, "Alice")
	data := &HTTPLoginData{Username: "Alice", Password: "wrong-password"}
	response := httptest.NewRecorder()
	if httpCheckCredentials(context.Background(), response, user, data) || response.Code != http.StatusUnauthorized {
		t.Fatal("wrong password was accepted")
	}
	if accountPasswordTestUser(t, "Alice").PasswordHash.String != compatibilityPasswordHash {
		t.Fatal("failed login changed the stored hash")
	}
	data.Password = "compatibility-password"
	if !httpCheckCredentials(context.Background(), httptest.NewRecorder(), user, data) {
		t.Fatal("old password stopped working")
	}
	upgraded := accountPasswordTestUser(t, "Alice")
	assertAccountPassword(t, upgraded.PasswordHash.String, data.Password)
	if !httpCheckCredentials(context.Background(), httptest.NewRecorder(), upgraded, data) {
		t.Fatal("upgraded password stopped working")
	}
	if accountPasswordTestUser(t, "Alice").PasswordHash != upgraded.PasswordHash {
		t.Fatal("current-policy login unnecessarily rewrote the hash")
	}
}

func TestAccountPasswordUpgradeCannotOverwriteConcurrentPasswordChange(t *testing.T) {
	accountPasswordTestDatabase(t)
	if _, err := models.Users.Insert("Alice", "alice", compatibilityPasswordHash, "127.0.0.1"); err != nil {
		t.Fatal(err)
	}
	stale := accountPasswordTestUser(t, "Alice")
	change := &HTTPLoginData{Username: "Alice", NewPassword: "new-password"}
	if !httpCheckPasswordChange(context.Background(), httptest.NewRecorder(), stale, change) {
		t.Fatal("password change failed")
	}
	changed := accountPasswordTestUser(t, "Alice")
	assertAccountPassword(t, changed.PasswordHash.String, change.NewPassword)
	login := &HTTPLoginData{Username: "Alice", Password: "compatibility-password"}
	if !httpCheckCredentials(context.Background(), httptest.NewRecorder(), stale, login) {
		t.Fatal("login verified before the concurrent change did not finish")
	}
	if accountPasswordTestUser(t, "Alice").PasswordHash != changed.PasswordHash {
		t.Fatal("automatic rehash overwrote a newer password")
	}
	response := httptest.NewRecorder()
	if httpCheckPasswordChange(context.Background(), response, stale, change) || response.Code != http.StatusConflict {
		t.Fatal("stale explicit password change was not rejected")
	}
}

func TestAccountPasswordLegacyMigrationAndPasswordChange(t *testing.T) {
	accountPasswordTestDatabase(t)
	for _, change := range []bool{false, true} {
		name := fmt.Sprintf("Legacy%v", change)
		if _, err := models.Users.Insert(name, normalizeString(name), compatibilityPasswordHash, "127.0.0.1"); err != nil {
			t.Fatal(err)
		}
		legacy := fmt.Sprintf("%x", sha256.Sum256([]byte("Hanabi password legacy-password")))
		if _, err := db.Exec(context.Background(),
			"UPDATE users SET password_hash='', old_password_hash=$1 WHERE username=$2", legacy, name); err != nil {
			t.Fatal(err)
		}
		user := accountPasswordTestUser(t, name)
		data := &HTTPLoginData{Username: name, Password: "legacy-password"}
		expected := data.Password
		if change {
			data.NewPassword, expected = "replacement", "replacement"
		}
		if !httpCheckAndChangeCredentials(context.Background(), httptest.NewRecorder(), user, data) ||
			!httpCheckPasswordChange(context.Background(), httptest.NewRecorder(), user, data) {
			t.Fatal("legacy account could not sign in/change password")
		}
		current := accountPasswordTestUser(t, name)
		if current.OldPasswordHash != (sql.NullString{}) {
			t.Fatal("legacy hash remained active")
		}
		assertAccountPassword(t, current.PasswordHash.String, expected)
		legacyLogin := *data
		legacyLogin.NewPassword = ""
		if !httpCheckAndChangeCredentials(context.Background(), httptest.NewRecorder(), user, &legacyLogin) {
			t.Fatal("verified legacy login did not finish")
		}
		if accountPasswordTestUser(t, name).PasswordHash != current.PasswordHash {
			t.Fatal("stale legacy upgrade overwrote current credentials")
		}
	}
}

func TestAccountPasswordUpgradePreservesStrongerParameters(t *testing.T) {
	params := accountPasswordParams()
	params.Iterations = 1
	if !accountPasswordNeedsUpgrade(&params) {
		t.Fatal("old pass count was not selected for upgrade")
	}
	params.Memory *= 2
	if accountPasswordNeedsUpgrade(&params) {
		t.Fatal("upgrade would reduce a stronger memory setting")
	}
	params = accountPasswordParams()
	params.Iterations++
	if accountPasswordNeedsUpgrade(&params) {
		t.Fatal("upgrade would reduce a stronger pass count")
	}
}

func TestAccountPasswordAdmissionBoundsCancellationAndTimeout(t *testing.T) {
	gate := newPasswordHashGate(1, 1, time.Hour)
	release, err := gate.acquire(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	waiter := make(chan error, 1)
	go func() {
		release, err := gate.acquire(ctx)
		if release != nil {
			release()
		}
		waiter <- err
	}()
	deadline := time.After(time.Second)
	for len(gate.admitted) != 2 {
		select {
		case <-deadline:
			cancel()
			release()
			t.Fatal("waiter did not enter bounded queue")
		default:
			runtime.Gosched()
		}
	}
	overflow, stop := context.WithTimeout(context.Background(), time.Second)
	defer stop()
	if _, err := gate.acquire(overflow); !errors.Is(err, errAccountHashBusy) {
		t.Fatalf("full queue was not rejected: %v", err)
	}
	cancel()
	if err := <-waiter; !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled waiter did not stop: %v", err)
	}
	if len(gate.admitted) != 1 || len(gate.running) != 1 {
		t.Fatal("cancellation leaked a waiter or released active work")
	}
	gate.wait = time.Millisecond
	if _, err := gate.acquire(context.Background()); !errors.Is(err, errAccountHashBusy) {
		t.Fatalf("queue wait did not expire: %v", err)
	}
	release()
	release, err = gate.acquire(context.Background())
	if err != nil {
		t.Fatal("capacity did not recover")
	}
	release()
	if _, err := gate.acquire(ctx); !errors.Is(err, context.Canceled) || len(gate.admitted) != 0 {
		t.Fatal("cancelled request consumed capacity")
	}
}

func TestAccountPasswordOverloadReturnsRetryableHTTPResponse(t *testing.T) {
	old := accountHashGate
	accountHashGate = newPasswordHashGate(1, 0, time.Second)
	t.Cleanup(func() { accountHashGate = old })
	release, err := accountHashGate.acquire(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	response := httptest.NewRecorder()
	if _, ok := httpPasswordHash(context.Background(), response, "unused", "Alice"); ok {
		t.Fatal("hashing bypassed admission")
	}
	if response.Code != http.StatusServiceUnavailable || response.Header().Get("Retry-After") != "1" {
		t.Fatal("overload did not return a retryable response")
	}
}
