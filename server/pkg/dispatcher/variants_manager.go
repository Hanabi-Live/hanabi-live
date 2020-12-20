package dispatcher

import (
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
)

type VariantsManager interface {
	VariantNames() []string
	NoVariant() *variants.Variant

	GetVariant(variantName string) (*variants.Variant, error)
	GetVariantByID(variantID int) (*variants.Variant, error)
	GetNumVariants() int
}
