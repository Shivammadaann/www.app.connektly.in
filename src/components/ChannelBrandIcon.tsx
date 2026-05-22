import type { ImgHTMLAttributes } from 'react';
import instagramIconUrl from '../assets/Instagram.png';
import messengerIconUrl from '../assets/Messenger.svg';
import whatsAppIconUrl from '../assets/WhatsApp.svg';

export type ChannelBrand = 'whatsapp' | 'instagram' | 'messenger';

const CHANNEL_BRAND_ICON_URLS: Record<ChannelBrand, string> = {
  whatsapp: whatsAppIconUrl,
  instagram: instagramIconUrl,
  messenger: messengerIconUrl,
};

const CHANNEL_BRAND_ICON_LABELS: Record<ChannelBrand, string> = {
  whatsapp: 'WhatsApp Business',
  instagram: 'Instagram',
  messenger: 'Facebook Messenger',
};

export function getChannelBrandIconUrl(channel: ChannelBrand) {
  return CHANNEL_BRAND_ICON_URLS[channel];
}

export default function ChannelBrandIcon({
  channel,
  className = 'h-8 w-8',
  alt,
  ...props
}: {
  channel: ChannelBrand;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  return (
    <img
      src={CHANNEL_BRAND_ICON_URLS[channel]}
      alt={alt ?? CHANNEL_BRAND_ICON_LABELS[channel]}
      className={`object-contain ${className}`}
      draggable={false}
      {...props}
    />
  );
}
