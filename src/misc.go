package main

import (
	"math/rand"
	"time"
)

/*
	Miscellaneous subroutines
*/

// From: http://golangcookbook.blogspot.com/2012/11/generate-random-number-in-given-range.html
func getRandom(min int, max int) int {
	rand.Seed(time.Now().UnixNano())
	max += 1
	return rand.Intn(max-min) + min
}

func stringInSlice(a string, slice []string) bool {
	for _, b := range slice {
		if b == a {
			return true
		}
	}
	return false
}

// From: https://stackoverflow.com/questions/39544571/golang-round-to-nearest-0-05/39544897#39544897
// Replace with standard library: https://github.com/golang/go/issues/20100
func Round(x, unit float64) float64 {
	return float64(int64(x/unit+0.5)) * unit
}
