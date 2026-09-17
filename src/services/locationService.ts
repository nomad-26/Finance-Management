import { CustomerLocationData } from '../types';
import { apiService } from './api';

export class LocationService {
  /**
   * Captures device GPS coordinates using browser Geolocation API
   */
  public async captureGpsLocation(): Promise<CustomerLocationData> {
    if (!navigator.geolocation) {
      throw new Error('Geolocation is not supported by your browser.');
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const accuracy = Math.round(position.coords.accuracy);

          resolve({
            latitude: Number(lat.toFixed(6)),
            longitude: Number(lng.toFixed(6)),
            accuracy,
            source: 'gps',
            googleMapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
            capturedAt: new Date().toISOString()
          });
        },
        (error) => {
          switch (error.code) {
            case error.PERMISSION_DENIED:
              reject(new Error('Location permission was denied. Please enable location access in your browser settings and try again.'));
              break;
            case error.POSITION_UNAVAILABLE:
              reject(new Error('Unable to detect your current location. Please check device location settings.'));
              break;
            case error.TIMEOUT:
              reject(new Error('Location request timed out. Please try again.'));
              break;
            default:
              reject(new Error('An unexpected error occurred while capturing your location.'));
              break;
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        }
      );
    });
  }

  /**
   * Client-side helper to extract coordinates from standard Google Maps URLs
   */
  public extractCoordinates(url: string): { latitude: number; longitude: number } | null {
    try {
      const qMatch = url.match(/[?&]q=(-?\d+\.\d+)[,%C]+(-?\d+\.\d+)/i);
      if (qMatch) {
        const lat = parseFloat(qMatch[1]);
        const lng = parseFloat(qMatch[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { latitude: lat, longitude: lng };
        }
      }

      const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/i);
      if (atMatch) {
        const lat = parseFloat(atMatch[1]);
        const lng = parseFloat(atMatch[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { latitude: lat, longitude: lng };
        }
      }

      const paramMatch = url.match(/[?&](?:ll|destination|center)=(-?\d+\.\d+)[,%C]+(-?\d+\.\d+)/i);
      if (paramMatch) {
        const lat = parseFloat(paramMatch[1]);
        const lng = parseFloat(paramMatch[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { latitude: lat, longitude: lng };
        }
      }
    } catch {
      // Ignore client parse errors
    }

    return null;
  }

  /**
   * Resolves Google Maps link (either locally or via backend resolution service)
   */
  public async resolveGoogleMapsUrl(urlStr: string): Promise<CustomerLocationData> {
    const trimmed = urlStr.trim();
    if (!trimmed) {
      throw new Error('Please enter a Google Maps link.');
    }

    // Try direct extraction first
    const directCoords = this.extractCoordinates(trimmed);
    if (directCoords) {
      return {
        latitude: Number(directCoords.latitude.toFixed(6)),
        longitude: Number(directCoords.longitude.toFixed(6)),
        accuracy: null,
        source: 'google_maps_link',
        googleMapsUrl: trimmed.startsWith('http') ? trimmed : `https://${trimmed}`,
        capturedAt: new Date().toISOString()
      };
    }

    // Call backend endpoint for short link expansion / resolution
    const res = await apiService.resolveLocationLink(trimmed);
    if (res && res.latitude !== undefined && res.longitude !== undefined) {
      return res;
    }

    throw new Error('Could not find coordinates in this Google Maps link. Please verify the URL and try again.');
  }
}

export const locationService = new LocationService();
