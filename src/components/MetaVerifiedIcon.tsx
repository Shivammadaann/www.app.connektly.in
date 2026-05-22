import type { ImgHTMLAttributes } from 'react';
import metaVerifiedIconUrl from '../assets/Metaverified.svg';

export default function MetaVerifiedIcon({
  className = 'h-5 w-5',
  alt = 'Meta verified',
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  return (
    <img
      src={metaVerifiedIconUrl}
      alt={alt}
      className={`object-contain ${className}`}
      draggable={false}
      {...props}
    />
  );
}
