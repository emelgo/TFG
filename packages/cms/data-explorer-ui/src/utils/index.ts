export { buildResourceUrl, toRecordEditHref } from './build-resource-url';
export {
  isEmptySearch,
  restoreFilterContext,
  saveFilterContext,
} from './filter-context';
export {
  CMS_HOME_PATH,
  DATA_EXPLORER_BASE_PATH,
  toResourceHref,
} from './paths';
export {
  DataExplorerSearchSchema,
  MAX_PAGE_SIZE,
  filterStateToSearch,
  getNextSort,
  searchToFilterState,
  toTableDataParams,
  type DataExplorerSearch,
} from './search-schema';
// Comprobación compartida con la API: ¿identifican unas columnas un único
// registro? (clave primaria o restricción `unique` completas).
export { conditionsIdentifyOneRecord } from '@pymekit/cms-data-explorer-core/utils';
export {
  resolveSingleKeyColumn,
  toTableKeysConfig,
  type TableKeysConfig,
} from './record-keys';
export {
  getCustomRecordLayout,
  getLayoutColumnFlexBasis,
  groupColumnsForDefaultLayout,
  hasRenderableFields,
} from './record-layout';
export {
  buildJunctionFilters,
  buildM2MTargetFilters,
  buildOneToManyFilters,
  getForeignKeyLink,
  getReadableTableKeys,
  getRecordDisplayName,
  getVisibleRelatedRelations,
  normalizeRecordId,
  toTableKey,
  type ForeignKeyRecord,
  type JunctionMetadataMap,
} from './record-relations';
export {
  RELATED_PAGES_PARAM,
  RecordSearchSchema,
  getRecordKeysFromSearch,
  getRelatedPage,
  parseRecordKeysSearch,
  withRelatedPage,
  type RecordKeysSearch,
  type RecordSearch,
} from './record-search';
export {
  fromDateTimeInputValue,
  isDateTimeInputValue,
  toDateTimeInputValue,
} from './datetime-input';
export {
  buildRecordPayload,
  createFieldSchema,
  createRecordFormSchema,
  getDirtyFields,
  getFieldKind,
  getFieldPlaceholder,
  getFormFields,
  getInitialFormValues,
  isFieldRequired,
  parseStaticDefault,
  stripTypeCast,
  toDatabaseValue,
  toFormValue,
  type FieldKind,
  type FormField,
  type FormFieldValue,
  type RecordFormMode,
  type RecordFormValues,
} from './record-form';
export {
  getPageSelectionState,
  getRecordKeyConditions,
  getSelectionId,
  isRecordSelected,
  setPageSelection,
  toRecordKeys,
  toggleRecordSelection,
  type PageSelectionState,
  type RecordKeyConditions,
  type RecordSelection,
  type SelectedRecord,
} from './record-selection';
export { getWriteErrorKey } from './write-errors';
