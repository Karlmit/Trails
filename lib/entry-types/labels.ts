// Entry Type/Entry Subtype value lists, kept separate from the
// *.schema.ts files' refine/error-message logic so a form component only
// needs "which values exist," not the validation shape itself. Display
// labels for these values live in messages/{sv,en}.json's `shared.entryType`/
// `shared.entrySubtype` namespaces (rendered via useTranslations('shared')/
// getTranslations('shared')), not here -- this file has no access to the
// current request's locale.

import { ACTIVITY_SUBTYPES } from './activity.schema';
import { STAY_SUBTYPES } from './stay.schema';
import { TRANSPORT_MODES } from './transport.schema';

export const SUBTYPES_BY_ENTRY_TYPE: Record<string, readonly string[]> = {
  STAY: STAY_SUBTYPES,
  TRANSPORT: TRANSPORT_MODES,
  ACTIVITY: ACTIVITY_SUBTYPES,
  NOTE: [],
  BLOG_POST: [],
};
