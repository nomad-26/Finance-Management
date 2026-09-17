import { Request, Response } from 'express';

// Helper to extract coordinates from Google Maps URL strings
export function extractCoordinatesFromUrl(url: string): { latitude: number; longitude: number } | null {
  try {
    // Pattern 1: q=11.3412,77.7172 or q=11.3412%2C77.7172
    const qMatch = url.match(/[?&]q=(-?\d+\.\d+)[,%C]+(-?\d+\.\d+)/i);
    if (qMatch) {
      const lat = parseFloat(qMatch[1]);
      const lng = parseFloat(qMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { latitude: lat, longitude: lng };
      }
    }

    // Pattern 2: @11.3412,77.7172,17z
    const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/i);
    if (atMatch) {
      const lat = parseFloat(atMatch[1]);
      const lng = parseFloat(atMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { latitude: lat, longitude: lng };
      }
    }

    // Pattern 3: ll=11.3412,77.7172 or destination=11.3412,77.7172
    const paramMatch = url.match(/[?&](?:ll|destination|center)=(-?\d+\.\d+)[,%C]+(-?\d+\.\d+)/i);
    if (paramMatch) {
      const lat = parseFloat(paramMatch[1]);
      const lng = parseFloat(paramMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { latitude: lat, longitude: lng };
      }
    }

    // Pattern 4: /maps/place/...!3d11.3412!4d77.7172
    const placeMatch = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/i);
    if (placeMatch) {
      const lat = parseFloat(placeMatch[1]);
      const lng = parseFloat(placeMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { latitude: lat, longitude: lng };
      }
    }
  } catch (e) {
    console.error('[LocationController] Error parsing URL coordinates:', e);
  }

  return null;
}

export const resolveLocationLink = async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Google Maps URL is required'
      });
    }

    const trimmedUrl = url.trim();

    // Security domain check
    const allowedDomains = [
      'google.com',
      'www.google.com',
      'maps.google.com',
      'maps.app.goo.gl',
      'goo.gl'
    ];

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmedUrl);
    } catch {
      return res.status(400).json({
        success: false,
        message: 'Invalid URL format'
      });
    }

    const isAllowed = allowedDomains.some((domain) =>
      parsedUrl.hostname.toLowerCase() === domain || parsedUrl.hostname.toLowerCase().endsWith('.' + domain)
    );

    if (!isAllowed) {
      return res.status(400).json({
        success: false,
        message: 'Only official Google Maps links (google.com/maps, maps.app.goo.gl) are allowed'
      });
    }

    // Attempt direct extraction first
    let coords = extractCoordinatesFromUrl(trimmedUrl);
    let finalUrl = trimmedUrl;

    // If short link or coordinates not immediately in URL string, follow redirect safely
    if (!coords && (parsedUrl.hostname.includes('goo.gl') || parsedUrl.hostname.includes('maps.app'))) {
      try {
        const response = await fetch(trimmedUrl, {
          method: 'GET',
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        finalUrl = response.url;
        coords = extractCoordinatesFromUrl(finalUrl);
      } catch (err: any) {
        console.warn('[LocationController] Could not follow redirect for short URL:', err.message);
      }
    }

    if (!coords) {
      return res.status(422).json({
        success: false,
        message: 'Could not extract valid latitude and longitude coordinates from this Google Maps link.'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: null,
        source: 'google_maps_link',
        googleMapsUrl: `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`,
        capturedAt: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('[LocationController] resolveLocationLink error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to resolve location link',
      error: { message: err.message }
    });
  }
};
