package main

import (
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAPIEmptyFiltersDoNotProduceInvalidSQL(t *testing.T) {
	where, _, _, args := apiBuildSubquery(APIQueryVars{
		Size: 10, Order: APIColumnDescription{Column: "games.id", Value: "DESC"},
		Filters: []APIColumnDescription{
			{Column: "games.id", Value: ""},
			{Column: "score", Value: "25"},
			{Column: "num_players", Value: ""},
		},
	})
	if strings.TrimSpace(where) != "WHERE score = $1" || !reflect.DeepEqual(args, []interface{}{"25"}) {
		t.Fatalf("unexpected filtered query: %q, %v", where, args)
	}
}

func TestAPIUnknownVariantIDIsNotVariantZero(t *testing.T) {
	old := variantIDMap
	variantIDMap = map[int]string{0: DefaultVariantName}
	t.Cleanup(func() { variantIDMap = old })
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Params = gin.Params{{Key: "id", Value: "999999"}}
	if _, err := apiGetVariantIDFromParam(ctx); err == nil {
		t.Fatal("unknown variant ID was accepted as variant zero")
	}
	ctx.Params = gin.Params{{Key: "id", Value: "0"}}
	if id, err := apiGetVariantIDFromParam(ctx); err != nil || id != 0 {
		t.Fatalf("valid variant zero was rejected: %d, %v", id, err)
	}
}
