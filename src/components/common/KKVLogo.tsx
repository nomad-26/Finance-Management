import React from 'react';
import kkvLogoImg from '../../assets/kkv-logo.png';

interface KKVLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  style?: React.CSSProperties;
  showText?: boolean;
}

export const KKVLogo: React.FC<KKVLogoProps> = ({
  size = 'md',
  className = '',
  style = {},
  showText = false
}) => {
  let height = 40;
  if (typeof size === 'number') {
    height = size;
  } else {
    switch (size) {
      case 'sm':
        height = 28;
        break;
      case 'md':
        height = 40;
        break;
      case 'lg':
        height = 54;
        break;
      case 'xl':
        height = 72;
        break;
    }
  }

  return (
    <div
      className={`kkv-brand-logo-wrapper ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        ...style
      }}
    >
      <img
        src={kkvLogoImg}
        alt="KKV Gold Finance"
        style={{
          height: `${height}px`,
          width: 'auto',
          objectFit: 'contain',
          filter: 'drop-shadow(0px 2px 6px rgba(0,0,0,0.25))',
          flexShrink: 0
        }}
      />
      {showText && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              fontSize: `${Math.max(12, height * 0.32)}px`,
              fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '0.4px',
              lineHeight: 1.2
            }}
          >
            KKV GOLD FINANCE
          </span>
          <span
            style={{
              fontSize: `${Math.max(9, height * 0.22)}px`,
              fontWeight: 700,
              color: 'var(--color-gold)',
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
              marginTop: '1px'
            }}
          >
            MAIN BRANCH
          </span>
        </div>
      )}
    </div>
  );
};
