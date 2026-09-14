import { useEffect, useRef, useState } from 'react';
import { TextField } from '../../../components/TextField';
import type { FieldProps } from '../../../lib/useForm';
import { loadPlaces, placesKey, toPlaceAddress, type PlaceAddress } from './placesLoader';

interface AddressFieldsProps {
  field: (name: string) => FieldProps;
  onPlace: (address: PlaceAddress) => void;
}

/**
 * Address entry. Free text is the default and always works; with a Places key configured, the
 * first line also offers suggestions once focused (the script loads then, not before).
 */
export function AddressFields({ field, onPlace }: AddressFieldsProps) {
  const key = placesKey();
  const formatted = field('addressFormatted');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<'off' | 'loading' | 'ready' | 'failed'>('off');
  const onPlaceRef = useRef(onPlace);
  onPlaceRef.current = onPlace;

  useEffect(() => {
    if (status !== 'loading' || !key || !inputRef.current) return;
    let listener: { remove: () => void } | null = null;
    let cancelled = false;
    loadPlaces(key)
      .then((places) => {
        if (cancelled || !inputRef.current) return;
        const autocomplete = new places.Autocomplete(inputRef.current, { fields: ['address_components', 'formatted_address'], types: ['address'] });
        listener = autocomplete.addListener('place_changed', () => onPlaceRef.current(toPlaceAddress(autocomplete.getPlace())));
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('failed'));
    return () => {
      cancelled = true;
      listener?.remove();
    };
  }, [status, key]);

  const hint =
    !key || status === 'failed'
      ? 'Type the full address as you’d write it on an envelope.'
      : status === 'ready'
        ? 'Start typing and choose a suggestion, or type the full address yourself.'
        : 'Suggestions appear as you type. You can also type the full address yourself.';

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <TextField
        field={{
          ...formatted,
          inputRef: (element) => {
            formatted.inputRef(element);
            inputRef.current = element as HTMLInputElement | null;
          },
        }}
        label="Address"
        optionalMark
        hint={hint}
        autoComplete="street-address"
        className="sm:col-span-2"
        onFocus={() => key && status === 'off' && setStatus('loading')}
      />
      <TextField field={field('addressStreet')} label="Street" optionalMark autoComplete="address-line1" className="sm:col-span-2" />
      <TextField field={field('addressCity')} label="City or town" optionalMark autoComplete="address-level2" />
      <TextField field={field('addressState')} label="State or region" optionalMark autoComplete="address-level1" />
      <TextField field={field('addressPostalCode')} label="Postal code" optionalMark autoComplete="postal-code" />
      <TextField field={field('addressCountry')} label="Country" optionalMark autoComplete="country-name" />
    </div>
  );
}
