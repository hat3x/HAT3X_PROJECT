# Task 2 Report: PDF Support in Image Upload

## Status
✓ DONE

## Changes Made

### 1. Modified `src/app/(dashboard)/expediente/actions.ts`

| Line | Change | Details |
|------|--------|---------|
| 54 | ALLOWED_IMAGE_MIME_TYPES | Added `"application/pdf"` to allowlist |
| 58 | MAX_IMAGE_BYTES | Changed from `15 * 1024 * 1024` to `25 * 1024 * 1024` (15 MiB → 25 MiB) |
| 293-302 | imageExtensionForMime switch | Added `case "application/pdf": return "pdf";` before closing brace |
| 331 | Error message (no file) | Changed from `"Selecciona un archivo de imagen."` to `"Selecciona un archivo."` |
| 338 | Error message (invalid format) | Changed from `"Formato de imagen no admitido. Usa: ..."` to `"Formato no admitido. Usa: ..."` |
| 342 | Error message (file too large) | Changed from `"La imagen supera el tamaño máximo de 15 MiB."` to `"El archivo supera el tamaño máximo de 25 MiB."` |

### 2. Test Coverage

**Existing test file**: `src/tests/unit/expediente-actions.test.ts`

**Added test case**:
- **PDF upload test** (new): Verifies that a PDF file with `type: "application/pdf"` (100 bytes, <25 MiB) is accepted, uploaded to Storage with `.pdf` extension, and row created in `patient_images`
- **Renamed & verified test**: `image/gif` rejection (MIME not in allowlist) remains functional

**Test results**: All 23 tests pass (including 2 new/updated cases)

### 3. TypeScript Verification

```
npx tsc --noEmit → ✓ 0 errors
```

Type safety confirmed. No breaking changes to public function signatures.

## Self-Review

✓ **Allowlist scope**: `"application/pdf"` added to `ALLOWED_IMAGE_MIME_TYPES` (line 54)  
✓ **Size limit**: Updated to 25 MiB across constant and error message (line 58, 342)  
✓ **File extension**: `imageExtensionForMime` handles PDF → `.pdf` extension (lines 296-297)  
✓ **Error messages**: Generalized from "imagen" to neutral language (lines 331, 338, 342)  
✓ **No side effects**: Upload signature unchanged; gate/insert/RLS untouched; only validation logic expanded  
✓ **Tests updated**: Comprehensive case added for PDF; rejection of non-allowed MIME verified  
✓ **Compilation**: tsc clean (0 errors)

## Concerns

None. All requirements met.

## Commit

**Ref**: `8728628` — `feat(imagenes): aceptar PDF en la subida (25 MiB)`

## Files Modified

- `src/app/(dashboard)/expediente/actions.ts` (6 edits)
- `src/tests/unit/expediente-actions.test.ts` (1 test case added, 1 test renamed)
