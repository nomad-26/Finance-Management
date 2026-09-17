import { StructuredAddress, LocationDetails } from '../types';

export const emptyStructuredAddress: StructuredAddress = {
  houseNumber: '',
  street: '',
  locality: '',
  city: '',
  district: '',
  state: '',
  country: 'India',
  pincode: ''
};

export const emptyLocationDetails: LocationDetails = {
  latitude: null,
  longitude: null,
  accuracy: null,
  capturedAt: null,
  googleMapsUrl: '',
  locationMethod: 'manual'
};

/**
 * Formats a StructuredAddress into a clean single line address string
 */
export function formatStructuredAddress(addr?: Partial<StructuredAddress> | null): string {
  if (!addr) return '';
  const parts: string[] = [];

  if (addr.houseNumber?.trim()) parts.push(addr.houseNumber.trim());
  if (addr.street?.trim()) parts.push(addr.street.trim());
  if (addr.locality?.trim()) parts.push(addr.locality.trim());
  if (addr.city?.trim()) parts.push(addr.city.trim());
  if (addr.district?.trim()) parts.push(addr.district.trim());
  if (addr.state?.trim()) parts.push(addr.state.trim());
  if (addr.country?.trim()) parts.push(addr.country.trim());

  let formatted = parts.join(', ');
  if (addr.pincode?.trim()) {
    formatted += formatted ? ` - ${addr.pincode.trim()}` : addr.pincode.trim();
  }

  return formatted;
}

/**
 * Helper to construct Google Maps link from lat/long if valid
 */
export function buildGoogleMapsUrl(lat: number | null | undefined, lng: number | null | undefined): string {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return '';
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/**
 * Extracts coordinates from Google Maps URL strings
 */
export function parseGoogleMapsCoordinates(url: string): { latitude: number; longitude: number } | null {
  if (!url || !url.trim()) return null;
  const str = url.trim();

  // Pattern 1: ?q=lat,lng or &q=lat,lng
  const qMatch = str.match(/[?&]q=(-?\d+\.\d+)[,%C]+(-?\d+\.\d+)/i);
  if (qMatch) {
    const lat = parseFloat(qMatch[1]);
    const lng = parseFloat(qMatch[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { latitude: lat, longitude: lng };
    }
  }

  // Pattern 2: /@lat,lng
  const atMatch = str.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/i);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { latitude: lat, longitude: lng };
    }
  }

  // Pattern 3: ll=lat,lng or destination=lat,lng
  const paramMatch = str.match(/[?&](?:ll|destination|center)=(-?\d+\.\d+)[,%C]+(-?\d+\.\d+)/i);
  if (paramMatch) {
    const lat = parseFloat(paramMatch[1]);
    const lng = parseFloat(paramMatch[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { latitude: lat, longitude: lng };
    }
  }

  return null;
}
