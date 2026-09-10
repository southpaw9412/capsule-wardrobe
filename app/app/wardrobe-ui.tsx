'use client';
/* oxlint-disable next/no-img-element, next/no-html-link-for-pages */
import { useState } from 'react';
import { ImageOff, LockKeyhole } from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

export function WardrobeHeader({
  signedIn,
  active,
}: {
  signedIn: boolean;
  active: 'wardrobe' | 'outfits';
}) {
  return (
    <header className="masthead">
      <a className="wordmark" href="/">
        capsule
      </a>
      <nav className="main-nav" aria-label="Main navigation">
        <a href="/" aria-current={active === 'wardrobe' ? 'page' : undefined}>
          Wardrobe
        </a>
        <a
          href="/outfits"
          aria-current={active === 'outfits' ? 'page' : undefined}
        >
          Outfits
        </a>
      </nav>
      <span className="private-label">
        <LockKeyhole size={14} />
        <span>Private wardrobe</span>
        {signedIn && (
          <a
            className="signout"
            href="/signout-with-chatgpt?return_to=%2F"
            target="_top"
          >
            Sign out
          </a>
        )}
      </span>
    </header>
  );
}
export async function api<T = { ok: boolean }>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(path, options);
  const data = (await response.json().catch(() => ({
    error: 'The server could not complete this request.',
  }))) as T & { error?: string };
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? 'Your session expired. Sign in again to continue.'
        : data.error || 'Please try again.',
    );
  return data;
}
export function Picker({
  label,
  value,
  values,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  values: readonly string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <Select
        disabled={disabled}
        value={value}
        onValueChange={(v) => {
          if (v) onChange(v);
        }}
      >
        <SelectTrigger aria-label={label} className="field-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
export function GarmentImage({
  src,
  alt,
  className = '',
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  return broken ? (
    <div className={`broken-image ${className}`}>
      <ImageOff size={24} />
      <span>Photo unavailable</span>
    </div>
  ) : (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}
