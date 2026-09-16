import { planCsvImport, CSV_FIELDS, CSV_FIELD_LABELS, type CsvField, type CsvMapping } from '@kinfolk/shared/import/csv';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { FormAlert } from '../../components/FormAlert';
import { inputClasses } from '../../components/fieldStyles';
import { Icon } from '../../components/Icon';
import { announce } from '../../lib/announcer';
import { describeError } from '../../lib/api';
import { cx } from '../../lib/cx';
import { commitWithUndo } from '../tree/editing/changeQueue';
import { PanelShell } from '../tree/people/PanelShell';
import { ReadOnlyPanel } from '../tree/people/ReadOnlyPanel';
import { useTreeOutlet } from '../tree/treeOutlet';
import { canEditTree, newId } from '../tree/treePermissions';
import { gedcomPreview, ImportFileError, readFileText, readImportFile, type ImportFile } from './readImportFile';

const OUTCOME_STYLE = { added: 'text-success', matched: 'text-ink-muted', skipped: 'text-warning' } as const;

/**
 * Import people from another tool (SPEC §5.3): GEDCOM or CSV, with column mapping and a preview
 * of exactly what will change. Nothing is written until it's confirmed, and the whole import
 * lands as one undoable change.
 */
export function Component() {
  const { view, tree } = useTreeOutlet();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<ImportFile | null>(null);
  const [mapping, setMapping] = useState<CsvMapping>({});
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);

  const preview = useMemo(() => {
    if (!file) return null;
    try {
      if (file.kind === 'gedcom') {
        const parsed = gedcomPreview(file, newId);
        return {
          kind: 'gedcom' as const,
          ops: [
            ...parsed.graph.people.map((person) => ({ op: 'person.create' as const, person })),
            ...parsed.graph.unions.map((union) => ({ op: 'union.create' as const, union })),
            ...parsed.graph.parentChildren.map((edge) => ({ op: 'parentChild.create' as const, edge })),
          ],
          counts: parsed.counts,
          problems: parsed.problems,
        };
      }
      const plan = planCsvImport({ rows: file.rows, mapping, graph: view.graph }, { newId });
      return { kind: 'csv' as const, ops: plan.ops, rows: plan.rows, counts: plan.counts, problems: [] };
    } catch (caught) {
      return { kind: 'error' as const, message: describeError(caught) };
    }
  }, [file, mapping, view.graph]);

  if (!canEditTree(tree)) return <ReadOnlyPanel tree={tree} />;

  const choose = async (chosen: File) => {
    setError(null);
    try {
      const text = await readFileText(chosen);
      const read = readImportFile(chosen.name, text, chosen.size);
      setFile(read);
      if (read.kind === 'csv') setMapping(read.mapping);
      announce(read.kind === 'gedcom' ? 'GEDCOM file read. Check the preview before importing.' : 'Spreadsheet read. Check the columns and the preview before importing.');
    } catch (caught) {
      setFile(null);
      setError(caught instanceof ImportFileError ? caught.message : describeError(caught));
      requestAnimationFrame(() => alertRef.current?.focus());
    }
  };

  const runImport = () => {
    if (!preview || preview.kind === 'error' || preview.ops.length === 0) return;
    setImporting(true);
    const added = preview.kind === 'csv' ? preview.counts.added : preview.counts.people;
    const label = `Imported ${added} ${added === 1 ? 'person' : 'people'} from ${file?.name ?? 'a file'}`;
    try {
      void commitWithUndo(tree.id, preview.ops, label, `${label}.`).catch(() => undefined);
      navigate(`/trees/${tree.id}`);
    } catch (caught) {
      setError(describeError(caught));
      requestAnimationFrame(() => alertRef.current?.focus());
    } finally {
      setImporting(false);
    }
  };

  const headers = file?.kind === 'csv' ? (file.rows[0] ?? []) : [];

  return (
    <PanelShell title="Import people" subtitle="From a GEDCOM file or a spreadsheet. You’ll see exactly what changes before anything is saved." closeTo={`/trees/${tree.id}`} closeLabel="Close import" wide>
      <div className="flex flex-col gap-5 px-5 py-4 text-base">
        <FormAlert message={error} alertRef={alertRef} />
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".ged,.csv,text/csv,text/plain"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              if (chosen) void choose(chosen);
              event.target.value = '';
            }}
          />
          <Button variant="primary" icon="import" onClick={() => inputRef.current?.click()}>
            {file ? 'Choose a different file' : 'Choose a file'}
          </Button>
          {file ? <span className="text-ink-muted">{file.name}</span> : <span className="text-ink-muted">GEDCOM (.ged) or CSV, up to 8 MB.</span>}
        </div>

        {file?.kind === 'csv' ? (
          <section aria-labelledby="mapping-heading" className="flex flex-col gap-2">
            <h3 id="mapping-heading" className="text-base font-semibold">
              Which column is which?
            </h3>
            <p className="text-sm text-ink-muted">We’ve guessed from the headings. Change anything that’s wrong; leave the rest as “Don’t import”.</p>
            <ul aria-label="Column mapping" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CSV_FIELDS.map((field: CsvField) => (
                <li key={field} className="flex flex-col">
                  <label htmlFor={`map-${field}`} className="mb-1 text-sm font-semibold text-ink-muted">
                    {CSV_FIELD_LABELS[field]}
                  </label>
                  <select
                    id={`map-${field}`}
                    value={mapping[field] ?? ''}
                    onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value === '' ? undefined : Number(event.target.value) }))}
                    className={inputClasses(false, 'pr-8')}
                  >
                    <option value="">Don’t import</option>
                    {headers.map((header, index) => (
                      <option key={`${header}-${index}`} value={index}>
                        {header || `Column ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {preview?.kind === 'error' ? <p className="rounded-control border border-danger/40 bg-danger-soft px-3 py-2">{preview.message}</p> : null}

        {preview && preview.kind !== 'error' ? (
          <section aria-labelledby="preview-heading" className="flex flex-col gap-2">
            <h3 id="preview-heading" className="text-base font-semibold">
              What this will change
            </h3>
            {preview.kind === 'csv' ? (
              <>
                <p role="status">
                  {preview.counts.added} to add · {preview.counts.matched} already here · {preview.counts.skipped} can’t be used · {preview.counts.relationships} relationships linked
                </p>
                <ul aria-label="Import preview" className="max-h-72 overflow-y-auto rounded-card border border-line">
                  {preview.rows.map((row) => (
                    <li key={row.line} className="flex flex-wrap items-baseline gap-x-2 border-b border-line px-3 py-2 last:border-b-0">
                      <span className="text-sm text-ink-muted">Row {row.line}</span>
                      <span className="font-semibold">{row.name}</span>
                      <span className={cx('text-sm font-semibold', OUTCOME_STYLE[row.outcome])}>
                        {row.outcome === 'added' ? 'Add' : row.outcome === 'matched' ? 'Already here' : 'Skip'}
                      </span>
                      <span className="basis-full text-sm text-ink-muted">{row.detail}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p role="status">
                {preview.counts.people} people, {preview.counts.families} families, and {preview.counts.parentChildren} parent links will be added to “{tree.name}”.
              </p>
            )}
            {preview.problems.length > 0 ? (
              <div className="rounded-control border border-warning/50 bg-warning-soft px-3 py-2">
                <p className="font-semibold">Some of the file couldn’t be used:</p>
                <ul className="list-disc pl-5">
                  {preview.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-sm text-ink-muted">
              <Icon name="info" className="mr-1 inline size-4" />
              Everything imported arrives as one change you can undo.
            </p>
            <Button
              variant="primary"
              icon="check"
              className="self-start"
              pending={importing}
              pendingLabel="Importing…"
              aria-disabled={preview.ops.length === 0 || undefined}
              onClick={() => (preview.ops.length === 0 ? undefined : runImport())}
            >
              {preview.ops.length === 0 ? 'Nothing to import' : `Import into ${tree.name}`}
            </Button>
          </section>
        ) : null}
      </div>
    </PanelShell>
  );
}
