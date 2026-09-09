'use client';
/* Private images must bypass a shared image optimizer. Auth links require a full top-level navigation. */
/* oxlint-disable next/no-img-element, next/no-html-link-for-pages */
import { flushSync } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Plus,
  Search,
  LockKeyhole,
  Shirt,
  Camera,
  X,
  Heart,
  Check,
  LoaderCircle,
  RotateCcw,
  Trash2,
  SlidersHorizontal,
  ImageOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Empty } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  CATEGORIES,
  COLORS,
  SEASONS,
  STATUSES,
  MAX_IMAGE_BYTES,
  type Garment,
  type GarmentDetails,
} from '@/lib/wardrobe';

type Upload = {
  id: string;
  file: File;
  preview: string;
  state: 'queued' | 'uploading' | 'saved' | 'error';
  progress: number;
  error?: string;
};
const colors: Record<string, string> = {
  Black: '#222',
  White: '#fafafa',
  Gray: '#91949a',
  Blue: '#719ac8',
  Navy: '#27385a',
  Brown: '#87644d',
  Beige: '#d2bd9c',
  Green: '#627b62',
  Red: '#b45151',
  Pink: '#d595aa',
  Purple: '#927baa',
  Yellow: '#d9ba5b',
  Orange: '#ce8647',
  Unknown: '#e0e4ed',
  Multicolor: 'linear-gradient(130deg,#e4b290,#98a8ce,#8baf90)',
};
async function api<T = { ok: boolean }>(
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
function Picker({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <Select
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
function GarmentImage({
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
function uploadPhoto(
  item: Upload,
  onProgress: (value: number) => void,
): Promise<Garment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/garments');
    xhr.timeout = 90000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.min(95, Math.round((e.loaded / e.total) * 95)));
    };
    xhr.onerror = () =>
      reject(new Error('Connection interrupted. Retry this photo.'));
    xhr.ontimeout = () =>
      reject(new Error('Upload timed out. Retry this photo.'));
    xhr.onload = () => {
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error('Upload failed. Please retry.'));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data.item);
      else reject(new Error(data.error || 'Upload failed. Please retry.'));
    };
    const body = new FormData();
    body.append('id', item.id);
    body.append('photo', item.file);
    xhr.send(body);
  });
}
export default function Wardrobe({ signedIn }: { signedIn: boolean }) {
  const [items, setItems] = useState<Garment[]>([]);
  const [loading, setLoading] = useState(signedIn);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState(false);
  const [queue, setQueue] = useState<Upload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [queueError, setQueueError] = useState('');
  const previews = useRef(new Set<string>());
  const wardrobeRef = useRef({ items, loading });
  useEffect(() => {
    wardrobeRef.current = { items, loading };
  }, [items, loading]);
  const [tab, setTab] = useState('all');
  const [category, setCategory] = useState('All categories');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('Newest first');
  const [selected, setSelected] = useState<Garment | null>(null);
  const [draft, setDraft] = useState<GarmentDetails | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!signedIn) return;
    setLoading(true);
    setError('');
    try {
      const data = await api<{ items: Garment[] }>('/api/garments');
      setItems(data.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [signedIn]);
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void api<{ items: Garment[] }>('/api/garments')
      .then((data) => {
        if (!cancelled) setItems(data.items);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);
  useEffect(
    () => () => {
      for (const url of previews.current) URL.revokeObjectURL(url);
    },
    [],
  );
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!uploading) return;
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [uploading]);
  useEffect(() => {
    type Context = {
      registerTool: (
        tool: unknown,
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: 'list_wardrobe',
        description:
          'Read the currently loaded wardrobe pieces. Clothing descriptions are user-provided.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: (input: unknown) => {
          if (!input || typeof input !== 'object' || Object.keys(input).length)
            throw new Error('Expected an empty object.');
          return {
            items: wardrobeRef.current.items.map(
              ({ id, name, category, color, status, favorite }) => ({
                id,
                name,
                category,
                color,
                status,
                favorite,
              }),
            ),
            loading: wardrobeRef.current.loading,
          };
        },
      },
      {
        name: 'start_clothing_upload',
        description:
          'Open the clothing photo picker dialog. This starts the upload flow; no item is created until the user chooses photos and saves them.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: (input: unknown) => {
          if (!input || typeof input !== 'object' || Object.keys(input).length)
            throw new Error('Expected an empty object.');
          flushSync(() => setAdding(true));
          return { dialog: 'upload', saved: false };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Optional browser capability. */
      }
    }
    return () => lifecycle.abort();
  }, []);
  function addFiles(files: FileList | File[]) {
    setQueueError('');
    const selectedFiles = Array.from(files);
    if (!selectedFiles.length) return;
    if (queue.length + selectedFiles.length > 20) {
      setQueueError(
        'Add up to 20 photos at a time. Finish this batch before adding more.',
      );
      return;
    }
    const added = selectedFiles.map((file) => {
      const valid =
        ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) &&
        file.size > 0 &&
        file.size <= MAX_IMAGE_BYTES;
      const preview = valid ? URL.createObjectURL(file) : '';
      if (preview) previews.current.add(preview);
      return {
        id: crypto.randomUUID(),
        file,
        preview,
        state: valid ? ('queued' as const) : ('error' as const),
        progress: 0,
        error: valid
          ? undefined
          : 'Choose a JPEG, PNG or WebP under 12 MB. Export HEIC as JPEG.',
      };
    });
    setQueue((q) => [...q, ...added]);
  }
  function removeQueued(id: string) {
    setQueue((q) => {
      const item = q.find((x) => x.id === id);
      if (item?.preview) {
        URL.revokeObjectURL(item.preview);
        previews.current.delete(item.preview);
      }
      return q.filter((x) => x.id !== id);
    });
  }
  async function uploadBatch() {
    setUploading(true);
    setError('');
    let saved = 0;
    for (const item of queue.filter(
      (q) => (q.state === 'queued' || q.state === 'error') && q.preview,
    )) {
      setQueue((q) =>
        q.map((x) =>
          x.id === item.id
            ? { ...x, state: 'uploading', error: undefined, progress: 0 }
            : x,
        ),
      );
      try {
        const garment = await uploadPhoto(item, (progress) =>
          setQueue((q) =>
            q.map((x) => (x.id === item.id ? { ...x, progress } : x)),
          ),
        );
        setItems((old) => [garment, ...old.filter((x) => x.id !== garment.id)]);
        setQueue((q) =>
          q.map((x) =>
            x.id === item.id ? { ...x, state: 'saved', progress: 100 } : x,
          ),
        );
        saved++;
      } catch (e) {
        setQueue((q) =>
          q.map((x) =>
            x.id === item.id
              ? { ...x, state: 'error', error: (e as Error).message }
              : x,
          ),
        );
      }
    }
    setUploading(false);
    if (saved)
      setNotice(
        `${saved} ${saved === 1 ? 'piece' : 'pieces'} added to your wardrobe.`,
      );
  }
  function closeUpload() {
    if (uploading) return;
    setAdding(false);
    setQueue((q) => {
      const keep = q.filter((x) => x.state !== 'saved');
      for (const x of q.filter((x) => x.state === 'saved')) {
        URL.revokeObjectURL(x.preview);
        previews.current.delete(x.preview);
      }
      return keep;
    });
  }
  function edit(item: Garment) {
    setSelected(item);
    setDraft({ ...item });
    setEditError('');
  }
  async function save() {
    if (!selected || !draft) return;
    setSaving(true);
    setEditError('');
    try {
      await api(`/api/garments/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      setItems((old) =>
        old.map((x) => (x.id === selected.id ? { ...x, ...draft } : x)),
      );
      setSelected(null);
      setNotice('Piece updated.');
    } catch (e) {
      setEditError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function favorite(item: Garment) {
    if (busyId) return;
    setBusyId(item.id);
    try {
      const next = { ...item, favorite: item.favorite ? 0 : 1 };
      await api(`/api/garments/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      setItems((old) => old.map((x) => (x.id === item.id ? next : x)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }
  async function remove() {
    if (!selected) return;
    setSaving(true);
    setEditError('');
    try {
      await api(`/api/garments/${selected.id}`, { method: 'DELETE' });
      setItems((old) => old.filter((x) => x.id !== selected.id));
      setDeleting(false);
      setSelected(null);
      setNotice('Piece and photo deleted.');
    } catch (e) {
      setDeleting(false);
      setEditError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const active = items.filter((i) => i.status !== 'Archived');
  const visible = items
    .filter((i) => {
      if (
        tab === 'archived' ? i.status !== 'Archived' : i.status === 'Archived'
      )
        return false;
      if (tab === 'favorites' && !i.favorite) return false;
      if (tab === 'laundry' && i.status !== 'In laundry') return false;
      return (
        (category === 'All categories' || i.category === category) &&
        `${i.name} ${i.category} ${i.color} ${i.notes}`
          .toLowerCase()
          .includes(search.toLowerCase())
      );
    })
    .sort((a, b) =>
      sort === 'Name A–Z'
        ? a.name.localeCompare(b.name)
        : sort === 'Oldest first'
          ? a.created_at.localeCompare(b.created_at)
          : b.created_at.localeCompare(a.created_at),
    );
  const pending = queue.filter(
    (q) => (q.state === 'queued' || q.state === 'error') && q.preview,
  ).length;
  return (
    <div className="app-shell">
      <header className="masthead">
        <a className="wordmark" href="/">
          capsule
        </a>
        <span className="edition">YOUR EVERYDAY, RECONSIDERED</span>
        <span className="private-label">
          <LockKeyhole size={14} /> Private wardrobe
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
      <main className="workspace">
        <div className="title-row">
          <div>
            <p className="eyebrow">THE WARDROBE / 01</p>
            <h1>
              Good things.
              <br />
              <em>Already yours.</em>
            </h1>
          </div>
          <Button className="primary-button" onClick={() => setAdding(true)}>
            <Plus size={18} /> Add clothes
          </Button>
        </div>
        <div className="collection-bar">
          <h2>
            Your collection <span>{active.length}</span>
          </h2>
          <span className="muted">
            A little less searching. A little more wearing.
          </span>
        </div>
        {error && (
          <div className="message error" role="alert">
            <span>{error}</span>
            <Button variant="ghost" onClick={() => void refresh()}>
              <RotateCcw size={15} /> Retry
            </Button>
            <button aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        )}
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <div className="view-bar">
            <TabsList variant="line" className="collection-tabs">
              <TabsTrigger value="all">All pieces</TabsTrigger>
              <TabsTrigger value="favorites">
                <Heart size={15} /> Favorites
              </TabsTrigger>
              <TabsTrigger value="laundry">In laundry</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
            </TabsList>
            <div className="search">
              <Search size={17} />
              <input
                aria-label="Search wardrobe"
                placeholder="Find a piece…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button aria-label="Clear search" onClick={() => setSearch('')}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="filter-row">
            <div className="filter-group">
              <SlidersHorizontal size={16} />
              <Picker
                label="Category"
                value={category}
                values={['All categories', ...CATEGORIES]}
                onChange={setCategory}
              />
            </div>
            <span className="results-label">
              {visible.length} {visible.length === 1 ? 'piece' : 'pieces'}
            </span>
            <Picker
              label="Sort"
              value={sort}
              values={['Newest first', 'Oldest first', 'Name A–Z']}
              onChange={setSort}
            />
          </div>
          {['all', 'favorites', 'laundry', 'archived'].map((view) => (
            <TabsContent key={view} value={view}>
              {loading ? (
                <div className="garment-grid">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="garment-skeleton" />
                  ))}
                </div>
              ) : items.length === 0 && !error ? (
                <Empty className="empty-wardrobe">
                  <div className="empty-copy">
                    <p className="eyebrow">MAKE ROOM FOR WHAT YOU OWN</p>
                    <h2>Your wardrobe starts here.</h2>
                    <p>
                      Start with the pieces you reach for most.
                      <br />
                      One photo per piece. Add the rest as you go.
                    </p>
                    <Button
                      className="primary-button"
                      onClick={() => setAdding(true)}
                    >
                      Add your first pieces <ArrowUpRight size={18} />
                    </Button>
                    <span className="upload-note">
                      Your photos stay private. Your originals stay yours.
                    </span>
                  </div>
                  <div
                    className="sample-display"
                    aria-label="Example clothing photos"
                  >
                    <img src="/samples/shirt.png" alt="Example white shirt" />
                    <img src="/samples/jeans.png" alt="Example blue jeans" />
                    <img src="/samples/shoe.png" alt="Example yellow shoe" />
                    <span>EXAMPLE PIECES · YOURS WILL APPEAR HERE</span>
                  </div>
                </Empty>
              ) : visible.length === 0 ? (
                <Empty className="no-results">
                  <Shirt size={30} />
                  <h2>
                    {error
                      ? 'Your collection couldn’t load.'
                      : 'No pieces here yet.'}
                  </h2>
                  <p>
                    {error
                      ? 'Use Retry above to load your saved wardrobe.'
                      : 'Try another view or add a piece to your wardrobe.'}
                  </p>
                  {(search || category !== 'All categories') && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearch('');
                        setCategory('All categories');
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                </Empty>
              ) : (
                <div className="garment-grid">
                  {visible.map((item) => (
                    <article className="garment-card" key={item.id}>
                      <button
                        className="garment-open"
                        onClick={() => edit(item)}
                        aria-label={`Edit ${item.name}`}
                      >
                        <div className="garment-photo">
                          <GarmentImage src={item.image_url} alt={item.name} />
                          {item.category === 'Unsorted' && (
                            <span className="needs-details">Add details</span>
                          )}
                          {item.status !== 'Available' && (
                            <span className="item-status">{item.status}</span>
                          )}
                        </div>
                        <div className="garment-caption">
                          <h3>{item.name}</h3>
                          <span>
                            {item.category}
                            <i style={{ background: colors[item.color] }} />
                            {item.color}
                          </span>
                        </div>
                      </button>
                      <button
                        className={`favorite-button ${item.favorite ? 'is-favorite' : ''}`}
                        aria-label={`${item.favorite ? 'Unfavorite' : 'Favorite'} ${item.name}`}
                        aria-pressed={!!item.favorite}
                        disabled={busyId === item.id}
                        onClick={() => void favorite(item)}
                      >
                        {busyId === item.id ? (
                          <LoaderCircle size={18} className="spinning" />
                        ) : (
                          <Heart
                            size={18}
                            fill={item.favorite ? 'currentColor' : 'none'}
                          />
                        )}
                      </button>
                    </article>
                  ))}
                  <button className="add-card" onClick={() => setAdding(true)}>
                    <Plus size={26} strokeWidth={1} />
                    <span>
                      A new place for
                      <br />
                      an old favorite.
                    </span>
                    <strong>Add a piece</strong>
                  </button>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
        <footer className="workspace-footer">
          <span>Fewer forgotten favorites.</span>
          <span>CAPSULE / PRIVATE PREVIEW</span>
        </footer>
      </main>
      {notice && (
        <output className="notice">
          <Check size={17} />
          {notice}
        </output>
      )}
      <Dialog
        open={adding}
        onOpenChange={(open) => {
          if (open) setAdding(true);
          else closeUpload();
        }}
      >
        <DialogContent className="wardrobe-dialog" showCloseButton={!uploading}>
          <DialogHeader>
            <DialogTitle>Add to your wardrobe</DialogTitle>
            <DialogDescription>
              One photo per piece. Originals are saved as they are; add
              categories and colors after uploading.
            </DialogDescription>
          </DialogHeader>
          {!signedIn ? (
            <a
              className="sign-in"
              href="/signin-with-chatgpt?return_to=%2F"
              target="_top"
            >
              Sign in with ChatGPT <ArrowUpRight size={18} />
            </a>
          ) : (
            <>
              {/* The file input supplies the keyboard alternative to drag and drop. */}
              {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
              <label
                className={`dropzone ${uploading ? 'disabled' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!uploading) addFiles(e.dataTransfer.files);
                }}
              >
                <Camera size={30} strokeWidth={1.5} />
                <strong>Choose photos or drop them here</strong>
                <span>JPEG, PNG or WebP · Up to 12 MB each</span>
                <input
                  aria-label="Choose clothing photos"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  disabled={uploading}
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              {queueError && (
                <p className="error-text" role="alert">
                  {queueError}
                </p>
              )}
              {queue.length > 0 && (
                <div className="upload-queue">
                  {queue.map((item) => (
                    <div className="upload-item" key={item.id}>
                      {item.preview ? (
                        <img src={item.preview} alt={item.file.name} />
                      ) : (
                        <ImageOff size={28} />
                      )}
                      <div className="upload-description">
                        <strong>{item.file.name}</strong>
                        <span
                          className={item.state === 'error' ? 'error-text' : ''}
                        >
                          {item.state === 'saved'
                            ? 'Saved · ready for details'
                            : item.state === 'uploading'
                              ? item.progress >= 95
                                ? 'Saving your photo…'
                                : `Uploading ${item.progress}%`
                              : item.error || 'Ready to upload'}
                        </span>
                        {item.state === 'uploading' && (
                          <Progress
                            value={item.progress}
                            className="upload-progress"
                            aria-label={`Uploading ${item.file.name}`}
                          />
                        )}
                      </div>
                      {item.state === 'saved' ? (
                        <Check size={20} className="success-icon" />
                      ) : (
                        !uploading && (
                          <button
                            aria-label={`Remove ${item.file.name}`}
                            onClick={() => removeQueued(item.id)}
                          >
                            <X size={18} />
                          </button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="dialog-actions">
                <span className="muted">
                  {queue.filter((q) => q.state === 'saved').length} saved /{' '}
                  {queue.length} selected
                </span>
                {pending > 0 ? (
                  <Button
                    className="primary-button"
                    disabled={uploading}
                    onClick={() => void uploadBatch()}
                  >
                    {uploading ? (
                      <>
                        <LoaderCircle size={17} className="spinning" /> Saving…
                      </>
                    ) : (
                      <>
                        Save {pending} {pending === 1 ? 'piece' : 'pieces'}{' '}
                        <ArrowUpRight size={17} />
                      </>
                    )}
                  </Button>
                ) : (
                  <Button variant="outline" onClick={closeUpload}>
                    Done
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !saving) setSelected(null);
        }}
      >
        <DialogContent
          className="wardrobe-dialog detail-dialog"
          showCloseButton={!saving}
        >
          <DialogHeader>
            <DialogTitle>Your piece, your details.</DialogTitle>
            <DialogDescription>
              Keep it simple. You can always change these later.
            </DialogDescription>
          </DialogHeader>
          {selected && draft && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div className="detail-layout">
                <div className="detail-photo">
                  <GarmentImage src={selected.image_url} alt={selected.name} />
                </div>
                <div className="detail-fields">
                  <label className="field">
                    <span>Name</span>
                    <input
                      value={draft.name}
                      required
                      maxLength={100}
                      onChange={(e) =>
                        setDraft({ ...draft, name: e.target.value })
                      }
                    />
                  </label>
                  <Picker
                    label="Category"
                    value={draft.category}
                    values={CATEGORIES}
                    onChange={(category) => setDraft({ ...draft, category })}
                  />
                  <Picker
                    label="Color"
                    value={draft.color}
                    values={COLORS}
                    onChange={(color) => setDraft({ ...draft, color })}
                  />
                  <Picker
                    label="Season"
                    value={draft.season}
                    values={SEASONS}
                    onChange={(season) => setDraft({ ...draft, season })}
                  />
                  <Picker
                    label="Availability"
                    value={draft.status}
                    values={STATUSES}
                    onChange={(status) => setDraft({ ...draft, status })}
                  />
                </div>
              </div>
              <label className="field notes-field">
                <span>
                  Notes <small>Optional</small>
                </span>
                <textarea
                  maxLength={1000}
                  value={draft.notes}
                  placeholder="Fit, fabric, brand, or what you love about it…"
                  onChange={(e) =>
                    setDraft({ ...draft, notes: e.target.value })
                  }
                />
              </label>
              {editError && (
                <p role="alert" className="error-text">
                  {editError}
                </p>
              )}
              <div className="dialog-actions">
                <Button
                  type="button"
                  variant="ghost"
                  className="delete-button"
                  onClick={() => setDeleting(true)}
                  disabled={saving}
                >
                  <Trash2 size={16} /> Delete piece
                </Button>
                <Button
                  type="submit"
                  className="primary-button"
                  disabled={saving}
                >
                  {saving ? (
                    <LoaderCircle className="spinning" size={17} />
                  ) : (
                    <Check size={17} />
                  )}{' '}
                  Save changes
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={deleting}
        onOpenChange={(open) => {
          if (!saving) setDeleting(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this piece?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {selected?.name} and its photo from your
              wardrobe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={() => void remove()}
              className="confirm-delete"
            >
              {saving ? 'Deleting…' : 'Delete piece'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
