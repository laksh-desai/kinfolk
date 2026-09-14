import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react';
import type { ZodTypeAny, z } from 'zod';
import { ApiError } from './api';
import { announce } from './announcer';

type FieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type Values = Record<string, unknown>;

export interface FieldProps {
  id: string;
  name: string;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
  onBlur: () => void;
  inputRef: (element: FieldElement | null) => void;
}

export interface UseFormOptions<S extends ZodTypeAny> {
  schema: S;
  initialValues: z.input<S>;
  /** Human labels, used to announce errors ("First name: Enter your first name."). */
  labels: Record<string, string>;
  onSubmit: (values: z.output<S>) => Promise<void> | void;
  idPrefix?: string;
}

function withFieldError(errors: Record<string, string>, name: string, message: string | undefined): Record<string, string> {
  const rest = Object.fromEntries(Object.entries(errors).filter(([key]) => key !== name));
  return message ? { ...rest, [name]: message } : rest;
}

function issuesByField(schema: ZodTypeAny, values: Values): Record<string, string> {
  const result = schema.safeParse(values);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_form';
    errors[key] ??= issue.message;
  }
  return errors;
}

/**
 * Form state with the same Zod schema the API validates with. Validates a field on blur and
 * everything on submit. A failed submit always does something visible: the first invalid
 * field is focused and scrolled to, its message is shown beside it, and a live region
 * announces the errors.
 */
export function useForm<S extends ZodTypeAny>(options: UseFormOptions<S>) {
  const { schema, labels, onSubmit } = options;
  const idPrefix = options.idPrefix ?? 'form';
  const [values, setValues] = useState<Values>(options.initialValues as Values);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const elements = useRef(new Map<string, FieldElement>());
  const formErrorRef = useRef<HTMLDivElement | null>(null);
  const touched = useRef(new Set<string>());
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const focusFirstInvalid = useCallback(
    (fieldErrors: Record<string, string>) => {
      const invalid = [...elements.current.entries()]
        .filter(([name]) => fieldErrors[name])
        .sort(([, a], [, b]) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      const first = invalid[0]?.[1];
      if (first) {
        first.focus();
        first.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      }
      // Announce in the order the fields appear on screen, not the order the schema found them.
      const onScreen = invalid.map(([name]) => name);
      const names = [...onScreen, ...Object.keys(fieldErrors).filter((name) => name !== '_form' && !onScreen.includes(name))];
      const summary = names.map((name) => `${labels[name] ?? name}: ${fieldErrors[name]}`).join(' ');
      const count = names.length;
      if (count > 0) {
        announce(`${count === 1 ? 'One field needs' : `${count} fields need`} attention. ${summary}`, 'assertive');
      }
    },
    [labels],
  );

  const setValue = useCallback(
    (name: string, value: unknown) => {
      setDirty(true);
      setValues((current) => {
        const next = { ...current, [name]: value };
        if (touched.current.has(name)) {
          const fieldErrors = issuesByField(schema, next);
          setErrors((existing) => {
            return withFieldError(existing, name, fieldErrors[name]);
          });
        }
        return next;
      });
    },
    [schema],
  );

  const validateField = useCallback(
    (name: string) => {
      touched.current.add(name);
      const fieldErrors = issuesByField(schema, valuesRef.current);
      setErrors((existing) => {
        return withFieldError(existing, name, fieldErrors[name]);
      });
    },
    [schema],
  );

  const field = useCallback(
    (name: string): FieldProps => {
      const raw = values[name];
      return {
        id: `${idPrefix}-${name}`,
        name,
        value: raw === undefined || raw === null ? '' : String(raw),
        error: errors[name],
        onChange: (value) => setValue(name, value),
        onBlur: () => {
          // Only validate on blur once the person has typed something or submitted, so tabbing
          // through an untouched form doesn't paint it red.
          if (dirty || touched.current.has(name)) validateField(name);
        },
        inputRef: (element) => {
          if (element) elements.current.set(name, element);
          else elements.current.delete(name);
        },
      };
    },
    [values, errors, idPrefix, setValue, validateField, dirty],
  );

  const applyServerError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
        const known = Object.fromEntries(Object.entries(error.fields).filter(([name]) => elements.current.has(name)));
        if (Object.keys(known).length > 0) {
          setErrors(known);
          for (const name of Object.keys(known)) touched.current.add(name);
          setFormError(null);
          focusFirstInvalid(known);
          return;
        }
      }
      const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      setFormError(message);
      // Focusing the alert reads it out; a live-region announcement as well would say it twice.
      requestAnimationFrame(() => formErrorRef.current?.focus());
    },
    [focusFirstInvalid],
  );

  const handleSubmit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      if (submitting) return;
      setFormError(null);
      const result = schema.safeParse(valuesRef.current);
      if (!result.success) {
        const fieldErrors = issuesByField(schema, valuesRef.current);
        for (const name of Object.keys(fieldErrors)) touched.current.add(name);
        setErrors(fieldErrors);
        focusFirstInvalid(fieldErrors);
        return;
      }
      setErrors({});
      setSubmitting(true);
      try {
        await onSubmit(result.data as z.output<S>);
        setDirty(false);
      } catch (error) {
        applyServerError(error);
      } finally {
        setSubmitting(false);
      }
    },
    [schema, onSubmit, submitting, focusFirstInvalid, applyServerError],
  );

  const reset = useCallback((next: z.input<S>) => {
    setValues(next as Values);
    setErrors({});
    setFormError(null);
    setDirty(false);
    touched.current.clear();
  }, []);

  return useMemo(
    () => ({
      values: values as z.input<S>,
      errors,
      formError,
      formErrorRef,
      submitting,
      dirty,
      field,
      setValue,
      handleSubmit,
      reset,
      applyServerError,
    }),
    [values, errors, formError, submitting, dirty, field, setValue, handleSubmit, reset, applyServerError],
  );
}
