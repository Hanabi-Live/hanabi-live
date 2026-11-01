package main

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/jackc/pgconn"
	"github.com/jackc/pgx/v4"
	"github.com/jackc/pgx/v4/pgxpool"
)

const defaultDatabaseTimeout = 30 * time.Second

type databaseSQL interface {
	Exec(context.Context, string, ...interface{}) (pgconn.CommandTag, error)
	Query(context.Context, string, ...interface{}) (pgx.Rows, error)
	QueryRow(context.Context, string, ...interface{}) pgx.Row
}

type databaseOperations struct {
	sql     databaseSQL
	timeout time.Duration
}

type database struct {
	*databaseOperations
	pool *pgxpool.Pool
}

type databaseTransaction struct {
	*databaseOperations
	tx pgx.Tx
}

func parseDatabaseTimeout(value string) (time.Duration, error) {
	if value == "" {
		return defaultDatabaseTimeout, nil
	}
	seconds, err := strconv.ParseInt(value, 10, 64)
	// PostgreSQL statement_timeout uses a signed 32-bit number of milliseconds.
	if err != nil || seconds < 1 || seconds > 2147483 {
		return 0, errors.New("DB_OPERATION_TIMEOUT_SECONDS must be an integer between 1 and 2147483")
	}
	return time.Duration(seconds) * time.Second, nil
}

func newDatabase(pool *pgxpool.Pool, timeout time.Duration) *database {
	return &database{
		databaseOperations: &databaseOperations{sql: pool, timeout: timeout},
		pool:               pool,
	}
}

func (d *database) Close() {
	d.pool.Close()
}

func (d *database) Stat() *pgxpool.Stat {
	return d.pool.Stat()
}

func (d *database) Begin(ctx context.Context) (*databaseTransaction, error) {
	ctx, cancel := context.WithTimeout(ctx, d.timeout)
	defer cancel()
	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	return &databaseTransaction{
		databaseOperations: &databaseOperations{sql: tx, timeout: d.timeout},
		tx:                 tx,
	}, nil
}

func (d *databaseOperations) Exec(ctx context.Context, query string, args ...interface{}) (pgconn.CommandTag, error) {
	ctx, cancel := context.WithTimeout(ctx, d.timeout)
	defer cancel()
	return d.sql.Exec(ctx, query, args...)
}

func (d *databaseOperations) Query(ctx context.Context, query string, args ...interface{}) (pgx.Rows, error) {
	ctx, cancel := context.WithTimeout(ctx, d.timeout)
	rows, err := d.sql.Query(ctx, query, args...)
	if err != nil {
		cancel()
		return nil, err
	}
	return &databaseRows{Rows: rows, ctx: ctx, cancel: cancel}, nil
}

func (d *databaseOperations) QueryRow(ctx context.Context, query string, args ...interface{}) pgx.Row {
	ctx, cancel := context.WithTimeout(ctx, d.timeout)
	return &databaseRow{Row: d.sql.QueryRow(ctx, query, args...), ctx: ctx, cancel: cancel}
}

func (t *databaseTransaction) Commit(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, t.timeout)
	defer cancel()
	return t.tx.Commit(ctx)
}

func (t *databaseTransaction) Rollback(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, t.timeout)
	defer cancel()
	return t.tx.Rollback(ctx)
}

type databaseRow struct {
	pgx.Row
	ctx    context.Context
	cancel context.CancelFunc
}

func (r *databaseRow) Scan(dest ...interface{}) error {
	defer r.cancel()
	err := r.Row.Scan(dest...)
	if contextErr := r.ctx.Err(); contextErr != nil {
		return contextErr
	}
	return err
}

// Keep the deadline alive while rows are consumed, not just until Query returns.
type databaseRows struct {
	pgx.Rows
	ctx    context.Context
	cancel context.CancelFunc
	err    error
}

func (r *databaseRows) Close() {
	r.cancel()
	r.Rows.Close()
}

func (r *databaseRows) Next() bool {
	if r.checkContext() != nil {
		return false
	}
	if r.Rows.Next() {
		return true
	}
	r.Close()
	return false
}

func (r *databaseRows) Scan(dest ...interface{}) error {
	if err := r.checkContext(); err != nil {
		return err
	}
	err := r.Rows.Scan(dest...)
	if err != nil {
		r.Close()
	}
	return err
}

func (r *databaseRows) Values() ([]interface{}, error) {
	if err := r.checkContext(); err != nil {
		return nil, err
	}
	values, err := r.Rows.Values()
	if err != nil {
		r.Close()
	}
	return values, err
}

func (r *databaseRows) Err() error {
	if r.err != nil {
		return r.err
	}
	return r.Rows.Err()
}

func (r *databaseRows) checkContext() error {
	if err := r.ctx.Err(); err != nil {
		r.err = err
		r.Close()
		return err
	}
	return nil
}
