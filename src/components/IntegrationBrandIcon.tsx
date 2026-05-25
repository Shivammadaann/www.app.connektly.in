import type { ImgHTMLAttributes } from 'react';
import adsIconUrl from '../assets/Ads.svg';
import leadCaptureIconUrl from '../assets/leadcapture.svg';
import mailIconUrl from '../assets/Mail.png';
import metaIconUrl from '../assets/Meta.svg';

export type IntegrationBrand = 'ads' | 'email' | 'lead-capture' | 'meta';

const INTEGRATION_BRAND_ICON_URLS: Record<IntegrationBrand, string> = {
  ads: adsIconUrl,
  email: mailIconUrl,
  'lead-capture': leadCaptureIconUrl,
  meta: metaIconUrl,
};

const INTEGRATION_BRAND_ICON_LABELS: Record<IntegrationBrand, string> = {
  ads: 'Meta Ads Manager',
  email: 'Email Marketing',
  'lead-capture': 'Meta Lead Capture',
  meta: 'Meta Lead Capture',
};

export default function IntegrationBrandIcon({
  brand,
  className = 'h-14 w-14',
  alt,
  ...props
}: {
  brand: IntegrationBrand;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  return (
    <img
      src={INTEGRATION_BRAND_ICON_URLS[brand]}
      alt={alt ?? INTEGRATION_BRAND_ICON_LABELS[brand]}
      className={`object-contain ${className}`}
      draggable={false}
      {...props}
    />
  );
}
