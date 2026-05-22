import { useEffect, useState } from 'react';
import defaultProfilePictureUrl from '../assets/profile.png';

export default function UserAvatar({
  name,
  imageUrl,
  alt,
  className = '',
  initialsClassName = '',
}: {
  name?: string | null;
  imageUrl?: string | null;
  alt?: string;
  className?: string;
  initialsClassName?: string;
}) {
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [imageUrl]);

  if (imageUrl && !hasImageError) {
    return (
      <img
        src={imageUrl}
        alt={alt || name || 'User avatar'}
        onError={() => setHasImageError(true)}
        className={`rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <img
      src={defaultProfilePictureUrl}
      alt={alt || name || 'Default profile picture'}
      className={`rounded-full object-cover ${className} ${initialsClassName}`}
      draggable={false}
    />
  );
}
