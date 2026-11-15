import type { TFunction } from 'i18next'
import type { FeatureOption } from '../api/features'

export function localizedFeature(feature: FeatureOption, t: TFunction): FeatureOption {
  return {
    ...feature,
    name: t(`feature.catalog.${feature.code}.name`, { defaultValue: feature.name }),
    description: t(`feature.catalog.${feature.code}.description`, { defaultValue: feature.description }),
  }
}
