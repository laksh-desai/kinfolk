/**
 * Google Places address autocomplete, loaded only at the point of use (SPEC §6.23) and only when
 * a key is configured. Without a key — the default — address entry is plain text and nothing
 * third-party is ever requested.
 */

export interface PlaceAddress {
  formatted: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface PlaceResult {
  formatted_address?: string;
  address_components?: AddressComponent[];
}

interface AutocompleteInstance {
  addListener: (event: 'place_changed', handler: () => void) => { remove: () => void };
  getPlace: () => PlaceResult;
}

interface PlacesNamespace {
  Autocomplete: new (input: HTMLInputElement, options: { fields: string[]; types: string[] }) => AutocompleteInstance;
}

interface GoogleGlobal {
  maps?: { places?: PlacesNamespace };
}

let loading: Promise<PlacesNamespace> | null = null;

export function placesKey(): string | null {
  const key = import.meta.env.VITE_GOOGLE_PLACES_KEY as string | undefined;
  return key && key.trim() ? key.trim() : null;
}

export function loadPlaces(key: string): Promise<PlacesNamespace> {
  loading ??= new Promise<PlacesNamespace>((resolve, reject) => {
    const callback = '__kinfolkPlacesReady';
    const scope = window as unknown as Record<string, unknown> & { google?: GoogleGlobal };
    scope[callback] = () => {
      const places = scope.google?.maps?.places;
      if (places) resolve(places);
      else reject(new Error('Address suggestions didn’t load.'));
    };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async&callback=${callback}`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error('Address suggestions aren’t available right now. Type the address instead.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function toPlaceAddress(place: PlaceResult): PlaceAddress {
  const parts = place.address_components ?? [];
  const find = (type: string, short = false) => {
    const part = parts.find((component) => component.types.includes(type));
    return part ? (short ? part.short_name : part.long_name) : '';
  };
  return {
    formatted: place.formatted_address ?? '',
    street: [find('street_number'), find('route')].filter(Boolean).join(' '),
    city: find('locality') || find('postal_town') || find('sublocality'),
    state: find('administrative_area_level_1', true),
    postalCode: find('postal_code'),
    country: find('country'),
  };
}

export type { AutocompleteInstance };
