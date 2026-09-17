import React, { useState, useEffect } from 'react';
import { apiService } from '../../services/api';
import { User, FileText, AlertCircle } from 'lucide-react';

export interface AuthenticatedImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  fallbackType?: 'user' | 'document' | 'none';
  fallbackIconSize?: number;
  onClick?: () => void;
}

export const AuthenticatedImage: React.FC<AuthenticatedImageProps> = ({
  src,
  alt = 'Image',
  className,
  style,
  fallbackType = 'user',
  fallbackIconSize = 24,
  onClick
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    if (!src || typeof src !== 'string' || !src.trim()) {
      setBlobUrl(null);
      setHasError(false);
      setIsLoading(false);
      return;
    }

    // Direct data URI - use directly without network request
    if (src.startsWith('data:image/')) {
      setBlobUrl(src);
      setHasError(false);
      setIsLoading(false);
      return;
    }

    // Direct Google Drive external link that doesn't hit protected /api/files
    if (src.includes('drive.google.com') || src.includes('googleusercontent.com')) {
      setBlobUrl(src);
      setHasError(false);
      setIsLoading(false);
      return;
    }

    // Protected backend file route or file ID
    setIsLoading(true);
    setHasError(false);

    apiService
      .getFileBlob(src)
      .then((res) => {
        if (!active) {
          if (res.blobUrl && !res.blobUrl.startsWith('data:')) {
            URL.revokeObjectURL(res.blobUrl);
          }
          return;
        }

        if (res.success && res.blobUrl) {
          createdUrl = res.blobUrl;
          setBlobUrl(res.blobUrl);
          setHasError(false);
        } else {
          setHasError(true);
          setBlobUrl(null);
        }
      })
      .catch(() => {
        if (active) {
          setHasError(true);
          setBlobUrl(null);
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
      if (createdUrl && !createdUrl.startsWith('data:')) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [src]);

  if (isLoading) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(5, 150, 105, 0.05)',
          ...style
        }}
        onClick={onClick}
      >
        <div className="spinner-sm" style={{ width: `${fallbackIconSize}px`, height: `${fallbackIconSize}px` }} />
      </div>
    );
  }

  if (hasError || !blobUrl) {
    if (fallbackType === 'none') return null;

    return (
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(5, 150, 105, 0.1)',
          color: '#059669',
          ...style
        }}
        onClick={onClick}
      >
        {fallbackType === 'user' ? (
          <User size={fallbackIconSize} />
        ) : fallbackType === 'document' ? (
          <FileText size={fallbackIconSize} />
        ) : (
          <AlertCircle size={fallbackIconSize} />
        )}
      </div>
    );
  }

  return (
    <img
      src={blobUrl}
      alt={alt}
      className={className}
      style={{
        objectFit: 'cover',
        ...style
      }}
      onError={() => setHasError(true)}
      onClick={onClick}
    />
  );
};
