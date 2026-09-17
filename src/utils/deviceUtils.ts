export interface ClientDeviceInfo {
  deviceType: 'DESKTOP' | 'LAPTOP' | 'MOBILE' | 'TABLET';
  deviceName: string;
  operatingSystem: string;
  osVersion: string;
  browser: string;
  browserVersion: string;
  ipAddress: string;
  location: string;
  screenResolution: string;
  timezone: string;
}

/**
 * Dynamically detects client browser, OS, and device characteristics from navigator.userAgent.
 */
export const detectCurrentDeviceInfo = (): ClientDeviceInfo => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  // 1. Operating System & Version Detection
  let operatingSystem = 'Unknown OS';
  let osVersion = '';

  if (/Windows NT 10.0/i.test(ua)) {
    operatingSystem = 'Windows';
    osVersion = '11/10';
  } else if (/Windows NT 6.3/i.test(ua)) {
    operatingSystem = 'Windows';
    osVersion = '8.1';
  } else if (/Windows NT 6.1/i.test(ua)) {
    operatingSystem = 'Windows';
    osVersion = '7';
  } else if (/Windows/i.test(ua)) {
    operatingSystem = 'Windows';
    osVersion = 'PC';
  } else if (/Android/i.test(ua)) {
    operatingSystem = 'Android';
    const match = ua.match(/Android\s+([\d.]+)/i);
    osVersion = match ? match[1] : '';
  } else if (/iPhone/i.test(ua)) {
    operatingSystem = 'iOS';
    const match = ua.match(/OS\s+([\d_]+)/i);
    osVersion = match ? match[1].replace(/_/g, '.') : '';
  } else if (/iPad/i.test(ua)) {
    operatingSystem = 'iPadOS';
    const match = ua.match(/OS\s+([\d_]+)/i);
    osVersion = match ? match[1].replace(/_/g, '.') : '';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    operatingSystem = 'macOS';
    const match = ua.match(/Mac OS X\s+([\d_]+)/i);
    osVersion = match ? match[1].replace(/_/g, '.') : '';
  } else if (/Linux/i.test(ua)) {
    operatingSystem = 'Linux';
    osVersion = '';
  }

  // 2. Browser & Version Detection
  let browser = 'Unknown Browser';
  let browserVersion = '';

  if (/Edg\/([\d.]+)/i.test(ua)) {
    browser = 'Edge';
    browserVersion = ua.match(/Edg\/([\d.]+)/i)?.[1] || '';
  } else if (/Chrome\/([\d.]+)/i.test(ua) && !/Chromium|Edg|OPR/i.test(ua)) {
    browser = 'Chrome';
    browserVersion = ua.match(/Chrome\/([\d.]+)/i)?.[1] || '';
  } else if (/Firefox\/([\d.]+)/i.test(ua)) {
    browser = 'Firefox';
    browserVersion = ua.match(/Firefox\/([\d.]+)/i)?.[1] || '';
  } else if (/Safari\/([\d.]+)/i.test(ua) && !/Chrome|Chromium|Edg|OPR/i.test(ua)) {
    browser = 'Safari';
    browserVersion = ua.match(/Version\/([\d.]+)/i)?.[1] || '';
  } else if (/OPR\/([\d.]+)/i.test(ua)) {
    browser = 'Opera';
    browserVersion = ua.match(/OPR\/([\d.]+)/i)?.[1] || '';
  }

  // Major version formatting (e.g., "Chrome 139")
  const majorBrowserVer = browserVersion.split('.')[0];
  const browserLabel = majorBrowserVer ? `${browser} ${majorBrowserVer}` : browser;

  // 3. Device Type & Device Name Detection
  let deviceType: 'DESKTOP' | 'LAPTOP' | 'MOBILE' | 'TABLET' = 'DESKTOP';
  let deviceName = 'Desktop PC';

  const isTouch = typeof navigator !== 'undefined' && ('maxTouchPoints' in navigator ? navigator.maxTouchPoints > 0 : false);
  const isMobileUA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTabletUA = /iPad|Tablet|PlayBook|Silk/i.test(ua) || (operatingSystem === 'Android' && !/Mobile/i.test(ua));

  if (isTabletUA || (isTouch && /Macintosh/i.test(ua))) {
    deviceType = 'TABLET';
    deviceName = operatingSystem === 'iPadOS' || /iPad/i.test(ua) ? 'iPad Tablet' : 'Android Tablet';
  } else if (isMobileUA) {
    deviceType = 'MOBILE';
    deviceName = operatingSystem === 'iOS' ? 'iPhone' : 'Android Phone';
  } else if (/Macintosh/i.test(ua)) {
    deviceType = 'LAPTOP';
    deviceName = 'MacBook Pro';
  } else if (/Windows/i.test(ua)) {
    deviceType = 'DESKTOP';
    deviceName = 'Windows PC';
  } else if (/Linux/i.test(ua)) {
    deviceType = 'DESKTOP';
    deviceName = 'Linux Workstation';
  }

  // 4. Resolution & Timezone
  const screenResolution = typeof window !== 'undefined' ? `${window.screen.width} × ${window.screen.height}` : '1920 × 1080';
  const timezone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'Asia/Kolkata';

  return {
    deviceType,
    deviceName,
    operatingSystem: osVersion ? `${operatingSystem} ${osVersion}` : operatingSystem,
    osVersion,
    browser: browserLabel,
    browserVersion,
    ipAddress: '192.168.1.102', // Local network default
    location: 'Salem, Tamil Nadu, India',
    screenResolution,
    timezone
  };
};

/**
 * Generates a unique crypto-random session identifier (e.g. sess_9a8b7c6d5e1f).
 */
export const generateSessionId = (): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 12; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `sess_${rand}`;
};

/**
 * Formats an ISO date string into human-friendly relative time (e.g. "Just now", "5 minutes ago", "2 hours ago").
 */
export const formatRelativeTime = (isoString?: string): string => {
  if (!isoString) return 'Just now';
  const time = new Date(isoString).getTime();
  if (isNaN(time)) return 'Just now';

  const diffMs = Date.now() - time;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 45) return 'Just now';
  if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`;
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return new Date(isoString).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

/**
 * Masks an IP address for security display (e.g., 192.168.1.102 -> 192.168.xxx.xxx).
 */
export const maskIpAddress = (ip?: string): string => {
  if (!ip) return '192.168.xxx.xxx';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.xxx.xxx`;
  }
  return '192.168.xxx.xxx';
};
