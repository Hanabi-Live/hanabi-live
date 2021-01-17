package dispatcher

import (
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
)

type VariantsManager interface {
	GetVariant(variantName string) (*variants.Variant, error)
	GetVariantByID(variantID int) (*variants.Variant, error)
	GetVariants() map[string]*variants.Variant
	GetVariantNames() []string
	GetNumVariants() int
	NoVariant() *variants.Variant
}
