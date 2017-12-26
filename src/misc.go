package main

/*
	Miscellaneous subroutines
*/

func deleteFromSlice(a []string, i int) []string {
	return append(a[:i], a[i+1:]...)
}
