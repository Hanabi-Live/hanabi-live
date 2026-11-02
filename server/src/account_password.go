package main

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/alexedwards/argon2id"
)

var (
	errAccountHashBusy = errors.New("password hashing capacity exhausted")
	accountHashGate    = newPasswordHashGate(4, 32, 10*time.Second)
)

func accountPasswordParams() argon2id.Params {
	return argon2id.Params{
		Memory: 64 * 1024, Iterations: 3, Parallelism: 4, SaltLength: 16, KeyLength: 32,
	}
}

type passwordHashGate struct {
	running  chan struct{}
	admitted chan struct{}
	wait     time.Duration
}

func newPasswordHashGate(workers int, waiting int, wait time.Duration) *passwordHashGate {
	return &passwordHashGate{
		running: make(chan struct{}, workers), admitted: make(chan struct{}, workers+waiting), wait: wait,
	}
}

func (g *passwordHashGate) acquire(ctx context.Context) (func(), error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	select {
	case g.admitted <- struct{}{}:
	default:
		return nil, errAccountHashBusy
	}
	waiting, cancel := context.WithTimeout(ctx, g.wait)
	defer cancel()
	select {
	case g.running <- struct{}{}:
		release := func() {
			<-g.running
			<-g.admitted
		}
		if err := waiting.Err(); err != nil {
			release()
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			return nil, errAccountHashBusy
		}
		return release, nil
	case <-waiting.Done():
		<-g.admitted
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, errAccountHashBusy
	}
}

func accountPasswordHash(ctx context.Context, password string) (string, error) {
	release, err := accountHashGate.acquire(ctx)
	if err != nil {
		return "", err
	}
	// Hash synchronously: cancellation must not free capacity while CPU work is still running.
	defer release()
	params := accountPasswordParams()
	hash, err := argon2id.CreateHash(password, &params)
	if err != nil {
		return "", err
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	return hash, nil
}

func accountPasswordCheck(ctx context.Context, password string, hash string) (bool, *argon2id.Params, error) {
	release, err := accountHashGate.acquire(ctx)
	if err != nil {
		return false, nil, err
	}
	defer release()
	match, params, err := argon2id.CheckHash(password, hash)
	if err != nil {
		return false, nil, err
	}
	if err := ctx.Err(); err != nil {
		return false, nil, err
	}
	return match, params, nil
}

func accountPasswordNeedsUpgrade(params *argon2id.Params) bool {
	target := accountPasswordParams()
	// Upgrade older pass counts without downgrading stronger stored parameters.
	return params.Iterations < target.Iterations &&
		params.Memory <= target.Memory && params.SaltLength <= target.SaltLength &&
		params.KeyLength <= target.KeyLength
}

func accountPasswordError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	if errors.Is(err, errAccountHashBusy) || errors.Is(err, context.Canceled) ||
		errors.Is(err, context.DeadlineExceeded) {
		status = http.StatusServiceUnavailable
		w.Header().Set("Retry-After", "1")
	}
	http.Error(w, http.StatusText(status), status)
}
