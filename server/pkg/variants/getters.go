package variants

import (
	"fmt"
)

func (m *Manager) GetVariant(variantName string) (*Variant, error) {
	variant, ok := m.variantsNameMap[variantName]
	if !ok {
		return nil, fmt.Errorf("\"%v\" is not a valid variant name", variantName)
	}

	return variant, nil
}

func (m *Manager) GetVariantByID(variantID int) (*Variant, error) {
	variant, ok := m.variantsIDMap[variantID]
	if !ok {
		return nil, fmt.Errorf("\"%v\" is not a valid variant ID", variantID)
	}

	return variant, nil
}

func (m *Manager) GetVariants() map[string]*Variant {
	return m.variantsNameMap
}

func (m *Manager) GetVariantNames() []string {
	return m.variantNames
}

func (m *Manager) GetNumVariants() int {
	return len(m.variantNames)
}

func (m *Manager) NoVariant() *Variant {
	return m.noVariant
}
