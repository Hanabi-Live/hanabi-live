package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strconv"
	"strings"
	"testing"
)

func TestLegacyRandomSourceData(t *testing.T) {
	source := filepath.Join(runtime.GOROOT(), "src", "math", "rand", "rng.go")
	files := token.NewFileSet()
	tree, err := parser.ParseFile(files, source, nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	var cooked []string
	ast.Inspect(tree, func(node ast.Node) bool {
		value, ok := node.(*ast.ValueSpec)
		if !ok || len(value.Names) != 1 || value.Names[0].Name != "rngCooked" {
			return true
		}
		literal, ok := value.Values[0].(*ast.CompositeLit)
		if !ok {
			t.Fatal("Go's legacy RNG data is no longer a numeric array")
		}
		for _, element := range literal.Elts {
			var text bytes.Buffer
			if err := format.Node(&text, files, element); err != nil {
				t.Fatal(err)
			}
			number, err := strconv.ParseInt(text.String(), 0, 64)
			if err != nil {
				t.Fatal(err)
			}
			cooked = append(cooked, strconv.FormatInt(number, 10))
		}
		return false
	})
	if len(cooked) != 607 {
		t.Fatalf("unexpected Go RNG state size: %d", len(cooked))
	}
	filename := filepath.Join("..", "..", "packages", "server", "src", "engine", "goRandom.json")
	checkRandomFixture(t, filename, cooked)
}

func checkRandomFixture[T any](t *testing.T, filename string, expected T) {
	t.Helper()
	if *updateCompatibility {
		encoded, err := json.MarshalIndent(expected, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.MkdirAll(filepath.Dir(filename), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filename, append(encoded, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	encoded, err := os.ReadFile(filename)
	if err != nil {
		t.Fatal(err)
	}
	var actual T
	if err := json.Unmarshal(encoded, &actual); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(actual, expected) {
		t.Fatalf("Go behavior differs from compatibility fixture %s", filename)
	}
}

func TestRandomProtocolCompatibility(t *testing.T) {
	type seedCase struct {
		Input string `json:"input"`
		Value string `json:"value"`
	}
	type bounded struct {
		Bound int64 `json:"bound"`
		Value int64 `json:"value"`
	}
	type streamCase struct {
		Seed   string    `json:"seed"`
		Int63  []string  `json:"int63"`
		Intn   []bounded `json:"intn"`
		Digest string    `json:"digest"`
	}
	result := struct {
		Seeds   []seedCase   `json:"seeds"`
		Streams []streamCase `json:"streams"`
	}{}
	for _, seed := range []string{
		"p2v0s1", "p2v0s4", "p4v0s1", "p6v0s1",
		"legacy-1-p2v0s1", "legacy-2-p2v0s1", "legacy-10-p2v0s1",
		"", strings.Repeat("x", 130), "unicode-\u4f60", "legacy-\u4f60-p2v0s1",
	} {
		result.Seeds = append(result.Seeds, seedCase{seed, strconv.FormatInt(seedToInt64(seed), 10)})
	}
	for _, seed := range []int64{0, 1, -1, math.MaxInt32, math.MaxInt64, math.MinInt64, seedToInt64("p2v0s1")} {
		entry := streamCase{Seed: strconv.FormatInt(seed, 10)}
		rng := rand.New(rand.NewSource(seed))
		for i := 0; i < 16; i++ {
			entry.Int63 = append(entry.Int63, strconv.FormatInt(rng.Int63(), 10))
		}
		rng = rand.New(rand.NewSource(seed))
		for _, n := range []int64{1, 2, 3, 7, 8, 31, 32, 63, 64, 101, 1073741825, 1073741825, math.MaxInt32, 2147483648, 4294967296, 9007199254740991} {
			var value int64
			if n <= math.MaxInt32 {
				value = int64(rng.Intn(int(n)))
			} else {
				value = rng.Int63n(n)
			}
			entry.Intn = append(entry.Intn, bounded{n, value})
		}
		rng = rand.New(rand.NewSource(seed))
		hash := sha256.New()
		var buffer [8]byte
		for i := 0; i < 4096; i++ {
			binary.LittleEndian.PutUint64(buffer[:], uint64(rng.Int63()))
			hash.Write(buffer[:])
		}
		entry.Digest = hex.EncodeToString(hash.Sum(nil))
		result.Streams = append(result.Streams, entry)
	}
	checkRandomFixture(t, filepath.Join("testdata", "random_protocol.json"), result)
}
