# Changelog

All notable changes to this project will be documented in this file.

## [0.2.5] - 2024-11-08

### Added
- **Dual ID Format Support**: All MCP tools now accept **both ULID and legacy numeric ID formats** for maximum compatibility
  - Input validation (`ensureUlid()`) accepts both `^[0-9A-HJKMNP-TV-Z]{26}$` (ULID) and `^\d+$` (legacy numeric)
  - Tool schemas removed strict ULID-only pattern validation
  - All tool descriptions updated to clarify dual format support
- **Legacy ID Mapping System**: Automatic conversion of Todoist legacy numeric IDs to ULIDs in responses
  - Detects numeric IDs in API responses from accounts not yet migrated to ULIDs
  - Transparently maps legacy IDs to ULIDs using Todoist Sync API v9 `id_mappings` endpoint
  - Implements in-memory caching to minimize API overhead
  - Applies to tasks, projects, sections, and all related parent/child references
- New documentation: `doc/legacy-id-mapping.md` explaining the conversion system

### Changed
- **Input Validation**: `ensureUlid()` and `ensureNullableUlid()` now accept both ULID and numeric ID formats
- **Schema Updates**: `ulidSchema()` and `nullableUlidSchema()` no longer enforce strict ULID pattern, accept any string
- **Tool Descriptions**: All 11 tools updated to document dual ID format support
- `handleGetTasks`: Now calls `convertTaskIdsToUlids()` after fetching tasks
- `handleGetProjects`: Now calls `convertProjectIdsToUlids()` and `convertSectionIdsToUlids()` after fetching data
- All API responses now guaranteed to contain ULIDs regardless of input format or account migration status

### Technical Details
- Added `idMappingCache` Map to store legacy→ULID mappings
- Added `isLegacyNumericId()` helper to detect numeric IDs
- Added `mapLegacyIdsToUlids()` to fetch mappings from Sync API v9
- Added `convertTaskIdsToUlids()`, `convertProjectIdsToUlids()`, `convertSectionIdsToUlids()` for resource-specific conversion
- All mapping calls use parallel `Promise.all()` for optimal performance

### Why This Change?
Some Todoist accounts (especially those created before 2024) still receive numeric IDs from the REST API v2 instead of ULIDs. This server is designed to work exclusively with ULIDs for consistency, so we automatically convert legacy IDs to maintain a uniform interface.

Users with legacy accounts can request migration to native ULID support via Todoist support.

### Compatibility
- ✅ Works seamlessly with both legacy (numeric) and modern (ULID) Todoist accounts
- ✅ All existing tests pass
- ✅ No breaking changes to API contracts
- ✅ Graceful degradation if mapping service fails

---

## [0.2.4] - Previous

### Changed
- Complete refactor to ULID-only architecture
- Removed all legacy numeric ID coercion logic
- Updated all tool schemas to require ULID format (`^[0-9A-HJKMNP-TV-Z]{26}$`)
- Enhanced input validation with strict ULID checking

### Technical Details
- Introduced `ULID_PATTERN` and `ULID_REGEX` constants
- Added comprehensive `ensure*` validation functions
- Updated all tool handlers to validate ULIDs on input
- Updated documentation and tests to reflect ULID-only approach

