'use client';
/* Private garment photos use the owner's authenticated image endpoint. */
/* oxlint-disable next/no-html-link-for-pages */
import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Bookmark,
  Check,
  CheckCheck,
  CalendarDays,
  ImageOff,
  LoaderCircle,
  LockKeyhole,
  LockKeyholeOpen,
  Plus,
  RotateCcw,
  Shuffle,
  Shirt,
  Trash2,
  X,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { CATEGORIES, SEASONS, type Garment } from '@/lib/wardrobe';
import {
  describeOutfit,
  matchesSeason,
  outfitKey,
  validateComposition,
  type OutfitIdea,
  type SavedOutfit,
  type SuggestionOptions,
} from '@/lib/outfits';
import { api, GarmentImage, Picker, WardrobeHeader } from '../wardrobe-ui';

type Suggestions = {
  ideas: OutfitIdea[];
  warnings: string[];
  eligibleCount: number;
};
type Draft = {
  id: string;
  name: string;
  notes: string;
  season: string;
  items: Garment[];
  kept: string[];
  seen: string[];
};
const initial = {
  season: 'All seasons',
  includeLayer: false,
  includeAccessory: false,
};
const send = (method: string, body: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const friendlyDate = (date: string) =>
  new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

function PiecePicker({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value?: string;
  choices: Garment[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <Select
        value={value || null}
        onValueChange={(v) => {
          if (v) onChange(v);
        }}
      >
        <SelectTrigger aria-label={label} className="field-select">
          <SelectValue placeholder="Choose a piece">
            {choices.find((i) => i.id === value)?.name || 'Choose a piece'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {choices.map((i) => (
            <SelectItem value={i.id} key={i.id}>
              {i.name} · {i.color}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function OutfitPhotos({
  items,
}: {
  items: { name: string; category: string; image_url: string | null }[];
}) {
  return (
    <div className={`outfit-photos pieces-${Math.min(items.length, 5)}`}>
      {items.map((i, n) => (
        <div className="outfit-photo" key={n}>
          {i.image_url ? (
            <GarmentImage src={i.image_url} alt={i.name} />
          ) : (
            <div className="removed-photo">
              <ImageOff size={24} />
              <span>Piece removed</span>
            </div>
          )}
          <span>{i.category}</span>
        </div>
      ))}
    </div>
  );
}

export default function OutfitStudio({ signedIn }: { signedIn: boolean }) {
  const [wardrobe, setWardrobe] = useState<Garment[]>([]);
  const [saved, setSaved] = useState<SavedOutfit[]>([]);
  const [ideas, setIdeas] = useState<OutfitIdea[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [options, setOptions] = useState(initial);
  const [seen, setSeen] = useState<string[]>([]);
  const [loading, setLoading] = useState(signedIn);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('ideas');
  const [editor, setEditor] = useState<Draft | null>(null);
  const [editError, setEditError] = useState('');
  const [busy, setBusy] = useState(false);
  const [remixing, setRemixing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavedOutfit | null>(null);
  const [wearId, setWearId] = useState<string | null>(null);
  const [wearDate, setWearDate] = useState('');
  const [wearError, setWearError] = useState('');
  const wearTarget = saved.find((o) => o.id === wearId);
  const available = wardrobe.filter(
    (i) => i.status === 'Available' && i.category !== 'Unsorted',
  );

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void Promise.all([
      api<{ items: Garment[] }>('/api/garments'),
      api<{ outfits: SavedOutfit[] }>('/api/outfits'),
      api<Suggestions>(
        '/api/outfits/suggest',
        send('POST', {
          ...initial,
          lockedIds: [],
          exclude: [],
          seed: crypto.randomUUID(),
        }),
      ),
    ])
      .then(([clothes, looks, suggestions]) => {
        if (cancelled) return;
        setWardrobe(clothes.items);
        setSaved(looks.outfits);
        setIdeas(suggestions.ideas);
        setWarnings(suggestions.warnings);
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
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function refreshSaved() {
    const data = await api<{ outfits: SavedOutfit[] }>('/api/outfits');
    setSaved(data.outfits);
  }
  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [clothes, looks] = await Promise.all([
        api<{ items: Garment[] }>('/api/garments'),
        api<{ outfits: SavedOutfit[] }>('/api/outfits'),
      ]);
      setWardrobe(clothes.items);
      setSaved(looks.outfits);
      setIdeas([]);
      setWarnings([]);
      setSeen([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function generate(restart = false) {
    setGenerating(true);
    setError('');
    const exclude = restart
      ? []
      : [...seen, ...ideas.map((i) => i.key)].slice(-24);
    try {
      const result = await api<Suggestions>(
        '/api/outfits/suggest',
        send('POST', {
          ...options,
          lockedIds: [],
          exclude,
          seed: crypto.randomUUID(),
        }),
      );
      setIdeas(result.ideas);
      setWarnings(result.warnings);
      setSeen(exclude);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }
  function changeOptions(next: typeof initial) {
    setOptions(next);
    setIdeas([]);
    setSeen([]);
    setWarnings([]);
  }
  function openEditor(
    items: Garment[],
    season: string,
    name = 'Everyday look',
  ) {
    setEditor({
      id: crypto.randomUUID(),
      items,
      season,
      name,
      notes: '',
      kept: [],
      seen: [],
    });
    setEditError('');
  }
  function updateDraft(update: Partial<Draft>) {
    setEditor((old) =>
      old ? { ...old, ...update, id: crypto.randomUUID() } : null,
    );
    setEditError('');
  }
  async function remix() {
    if (!editor) return;
    setRemixing(true);
    setEditError('');
    const exclude = [
      ...editor.seen,
      outfitKey(editor.items.map((i) => i.id)),
    ].slice(-24);
    const request: SuggestionOptions = {
      season: editor.season,
      includeLayer: editor.items.some((i) => i.category === 'Outerwear'),
      includeAccessory: editor.items.some((i) => i.category === 'Accessories'),
      lockedIds: editor.kept,
      exclude,
      seed: crypto.randomUUID(),
    };
    try {
      const result = await api<Suggestions>(
        '/api/outfits/suggest',
        send('POST', request),
      );
      if (!result.ideas.length)
        setEditError(
          'No new combination fits the kept pieces. Release a piece, swap one below, or add more clothes.',
        );
      else updateDraft({ items: result.ideas[0].items, seen: exclude });
    } catch (e) {
      setEditError((e as Error).message);
    } finally {
      setRemixing(false);
    }
  }
  async function saveLook() {
    if (!editor) return;
    setBusy(true);
    setEditError('');
    try {
      await api(
        '/api/outfits',
        send('POST', {
          id: editor.id,
          name: editor.name,
          notes: editor.notes,
          season: editor.season,
          itemIds: editor.items.map((i) => i.id),
        }),
      );
      setEditor(null);
      setNotice('Outfit saved. Find it in Saved looks.');
      setTab('saved');
      await refreshSaved().catch(() =>
        setError(
          'Your outfit was saved, but the list could not refresh. Use Refresh to load it.',
        ),
      );
    } catch (e) {
      setEditError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function removeLook() {
    if (!deleteTarget) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/outfits/${deleteTarget.id}`, { method: 'DELETE' });
      setSaved((old) => old.filter((o) => o.id !== deleteTarget.id));
      setDeleteTarget(null);
      setNotice(
        'Saved outfit removed. Your clothes are still in your wardrobe.',
      );
    } catch (e) {
      setError((e as Error).message);
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  }
  async function recordWear(date: string, remove = false) {
    if (!wearTarget) return;
    setBusy(true);
    setWearError('');
    try {
      await api(
        `/api/outfits/${wearTarget.id}/wears`,
        send(remove ? 'DELETE' : 'PUT', { date }),
      );
      setSaved((old) =>
        old.map((o) =>
          o.id === wearTarget.id
            ? {
                ...o,
                wear_dates: remove
                  ? o.wear_dates.filter((d) => d !== date)
                  : [...new Set([date, ...o.wear_dates])].sort().reverse(),
              }
            : o,
        ),
      );
      setNotice(remove ? 'Wear removed.' : 'Wear recorded.');
    } catch (e) {
      setWearError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  let compositionError = '';
  if (editor) {
    try {
      validateComposition(editor.items);
    } catch (e) {
      compositionError = (e as Error).message;
    }
  }
  const editorChoices = editor
    ? available.filter((i) => matchesSeason(i, editor.season))
    : [];
  const addCategories = editor
    ? CATEGORIES.filter(
        (category) =>
          category !== 'Unsorted' &&
          !editor.items.some((i) => i.category === category) &&
          editorChoices.some((i) => i.category === category) &&
          !(
            category === 'Dresses' &&
            editor.items.some((i) => ['Tops', 'Bottoms'].includes(i.category))
          ) &&
          !(
            ['Tops', 'Bottoms'].includes(category) &&
            editor.items.some((i) => i.category === 'Dresses')
          ),
      )
    : [];

  return (
    <div className="app-shell">
      <WardrobeHeader signedIn={signedIn} active="outfits" />
      <main className="workspace outfit-workspace">
        <div className="title-row">
          <div>
            <p className="eyebrow">THE OUTFITS / 02</p>
            <h1>
              More ways.
              <br />
              <em>Already in your wardrobe.</em>
            </h1>
          </div>
          {signedIn && (
            <Button
              variant="outline"
              className="studio-build"
              disabled={loading || (!!error && !wardrobe.length)}
              onClick={() => openEditor([], options.season)}
            >
              <Plus size={17} /> Build my own
            </Button>
          )}
        </div>
        {!signedIn ? (
          <Empty className="outfit-empty">
            <LockKeyhole size={28} />
            <h2>Your clothes. Your combinations.</h2>
            <p>Sign in to build outfits from your private wardrobe.</p>
            <a
              className="primary-button"
              href="/signin-with-chatgpt?return_to=%2Foutfits"
              target="_top"
            >
              Sign in with ChatGPT <ArrowUpRight size={18} />
            </a>
          </Empty>
        ) : (
          <>
            {error && (
              <div className="message error" role="alert">
                <span>{error}</span>
                <Button
                  variant="ghost"
                  disabled={loading}
                  onClick={() => void refresh()}
                >
                  <RotateCcw size={15} /> Refresh
                </Button>
              </div>
            )}
            <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
              <div className="outfits-tab-row">
                <TabsList variant="line" className="collection-tabs">
                  <TabsTrigger value="ideas">
                    <Shuffle size={16} /> Outfit ideas
                  </TabsTrigger>
                  <TabsTrigger value="saved">
                    <Bookmark size={16} /> Saved looks{' '}
                    <span className="count-badge">{saved.length}</span>
                  </TabsTrigger>
                </TabsList>
                <span className="muted">Made from what you own.</span>
              </div>
              <TabsContent value="ideas">
                <section
                  className="outfit-controls"
                  aria-label="Outfit preferences"
                >
                  <div className="control-copy">
                    <strong>What feels right today?</strong>
                    <p>
                      We match colors and seasons, with a little preference for
                      your favorites.
                    </p>
                  </div>
                  <Picker
                    label="Season"
                    disabled={generating || loading}
                    value={options.season}
                    values={SEASONS}
                    onChange={(season) => changeOptions({ ...options, season })}
                  />
                  <div className="outfit-checks">
                    <label>
                      <Checkbox
                        checked={options.includeLayer}
                        disabled={generating}
                        onCheckedChange={(v) =>
                          changeOptions({ ...options, includeLayer: !!v })
                        }
                      />{' '}
                      Add a layer
                    </label>
                    <label>
                      <Checkbox
                        checked={options.includeAccessory}
                        disabled={generating}
                        onCheckedChange={(v) =>
                          changeOptions({ ...options, includeAccessory: !!v })
                        }
                      />{' '}
                      Add an accessory
                    </label>
                  </div>
                  <Button
                    className="primary-button"
                    disabled={loading || generating}
                    onClick={() => void generate()}
                  >
                    {generating ? (
                      <LoaderCircle size={17} className="spinning" />
                    ) : (
                      <Shuffle size={17} />
                    )}
                    {generating
                      ? 'Finding looks…'
                      : ideas.length
                        ? 'More ideas'
                        : 'Find outfits'}
                  </Button>
                </section>
                <p className="suggestion-method">
                  Starting ideas based on your saved details. Photo analysis and
                  AI styling aren’t connected yet.
                </p>
                {warnings.length > 0 && (
                  <div className="outfit-guidance" aria-live="polite">
                    {warnings.map((w) => (
                      <p key={w}>{w}</p>
                    ))}
                    {wardrobe.some((i) => i.category === 'Unsorted') && (
                      <a href="/">
                        Add clothing details <ArrowUpRight size={14} />
                      </a>
                    )}
                  </div>
                )}
                {loading ? (
                  <div className="outfit-grid">
                    {[1, 2, 3].map((n) => (
                      <Skeleton key={n} className="outfit-skeleton" />
                    ))}
                  </div>
                ) : ideas.length ? (
                  <>
                    <div className="ideas-heading">
                      <h2>A few possibilities.</h2>
                      <span className="muted">
                        {ideas.length} {ideas.length === 1 ? 'look' : 'looks'} ·{' '}
                        {options.season}
                      </span>
                    </div>
                    <div className="outfit-grid" aria-busy={generating}>
                      {ideas.map((idea, index) => (
                        <article className="outfit-card" key={idea.key}>
                          <div className="outfit-card-heading">
                            <span>
                              LOOK {String(index + 1).padStart(2, '0')}
                            </span>
                            <span>{idea.items.length} pieces</span>
                          </div>
                          <OutfitPhotos items={idea.items} />
                          <div className="outfit-card-body">
                            <h3>
                              {idea.items.some((i) => i.category === 'Dresses')
                                ? 'The one-piece start'
                                : 'Better together'}
                            </h3>
                            <p className="piece-summary">
                              {idea.items.map((i) => i.name).join(' + ')}
                            </p>
                            <ul className="outfit-reasons">
                              {idea.reasons.map((r) => (
                                <li key={r}>{r}</li>
                              ))}
                            </ul>
                            <Button
                              variant="outline"
                              onClick={() =>
                                openEditor(idea.items, options.season)
                              }
                            >
                              <Shuffle size={16} /> Swap, keep & save{' '}
                              <ArrowUpRight size={16} />
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <Empty className="outfit-empty">
                    <Shirt size={32} />
                    <h2>
                      {seen.length
                        ? 'A fresh starting point?'
                        : 'Your next outfit starts here.'}
                    </h2>
                    <p>
                      {available.length
                        ? 'Choose your season and find a combination, or put together a look of your own.'
                        : 'Add categories to your pieces so we know what belongs together.'}
                    </p>
                    <div className="empty-actions">
                      {seen.length > 0 && (
                        <Button
                          variant="outline"
                          disabled={generating}
                          onClick={() => void generate(true)}
                        >
                          <RotateCcw size={16} /> Start again
                        </Button>
                      )}
                      <a className="text-link" href="/">
                        Go to wardrobe <ArrowUpRight size={16} />
                      </a>
                    </div>
                  </Empty>
                )}
              </TabsContent>
              <TabsContent value="saved">
                <div className="ideas-heading">
                  <div>
                    <h2>Ready to reach for.</h2>
                    <p className="muted">
                      Your saved combinations, and the days you wore them.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    disabled={loading}
                    onClick={() => void refresh()}
                    aria-label="Refresh wardrobe and saved outfits"
                  >
                    <RotateCcw size={16} /> Refresh
                  </Button>
                </div>
                {loading ? (
                  <div className="outfit-grid">
                    {[1, 2, 3].map((n) => (
                      <Skeleton key={n} className="outfit-skeleton" />
                    ))}
                  </div>
                ) : saved.length === 0 ? (
                  <Empty className="outfit-empty">
                    <Bookmark size={30} />
                    <h2>Keep a good combination.</h2>
                    <p>Save a look from Outfit ideas, or build one yourself.</p>
                    <Button variant="outline" onClick={() => setTab('ideas')}>
                      Explore outfit ideas <ArrowUpRight size={16} />
                    </Button>
                  </Empty>
                ) : (
                  <div className="outfit-grid">
                    {saved.map((look) => {
                      const missing = look.items.some(
                        (i) => i.status === 'Removed',
                      );
                      const unavailable = look.items.filter(
                        (i) => i.status !== 'Available',
                      );
                      return (
                        <article className="outfit-card" key={look.id}>
                          <div className="outfit-card-heading">
                            <span>{look.season}</span>
                            <button
                              className="icon-action"
                              aria-label={`Delete ${look.name}`}
                              onClick={() => setDeleteTarget(look)}
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                          <OutfitPhotos items={look.items} />
                          <div className="outfit-card-body">
                            <h3>{look.name}</h3>
                            <p className="piece-summary">
                              {look.items.map((i) => i.name).join(' + ')}
                            </p>
                            {look.notes && (
                              <p className="look-notes">{look.notes}</p>
                            )}
                            {unavailable.length > 0 ? (
                              <p className="availability-note">
                                {unavailable
                                  .map(
                                    (i) =>
                                      `${i.name}: ${i.status.toLowerCase()}`,
                                  )
                                  .join(' · ')}
                              </p>
                            ) : (
                              <p className="ready-note">
                                <CheckCheck size={16} /> All pieces available
                              </p>
                            )}
                            <p className="wear-count">
                              Worn {look.wear_dates.length}{' '}
                              {look.wear_dates.length === 1 ? 'time' : 'times'}
                              {look.wear_dates[0] && (
                                <span>
                                  {' '}
                                  · Last {friendlyDate(look.wear_dates[0])}
                                </span>
                              )}
                            </p>
                            <div className="saved-look-actions">
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setWearId(look.id);
                                  setWearDate(today());
                                  setWearError('');
                                }}
                              >
                                <CalendarDays size={16} />{' '}
                                {missing ? 'Wear history' : 'Log a wear'}
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() =>
                                  openEditor(
                                    look.items
                                      .map((i) =>
                                        wardrobe.find(
                                          (g) =>
                                            g.id === i.garment_id &&
                                            g.status === 'Available' &&
                                            g.category !== 'Unsorted' &&
                                            matchesSeason(g, look.season),
                                        ),
                                      )
                                      .filter((g): g is Garment => !!g),
                                    look.season,
                                    `${look.name} variation`.slice(0, 100),
                                  )
                                }
                              >
                                Make a variation
                              </Button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
        <footer className="workspace-footer">
          <span>Wear more of what you love.</span>
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
        open={!!editor}
        onOpenChange={(open) => {
          if (!open && !busy && !remixing) setEditor(null);
        }}
      >
        <DialogContent
          className="wardrobe-dialog outfit-editor"
          showCloseButton={!busy && !remixing}
        >
          <DialogHeader>
            <DialogTitle>Make it yours.</DialogTitle>
            <DialogDescription>
              Swap a piece, or keep your favorites in place and remix the rest.
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveLook();
              }}
            >
              <fieldset disabled={busy || remixing} className="editor-fieldset">
                <div className="editor-topline">
                  <span className="muted">
                    {editor.season} · {editor.items.length} pieces
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!editor.items.length}
                    onClick={() => void remix()}
                  >
                    {remixing ? (
                      <LoaderCircle size={16} className="spinning" />
                    ) : (
                      <Shuffle size={16} />
                    )}{' '}
                    Remix unkept pieces
                  </Button>
                </div>
                <div className="editor-pieces">
                  {editor.items.map((item) => (
                    <div className="editor-piece" key={item.id}>
                      <div className="editor-photo">
                        <GarmentImage src={item.image_url} alt={item.name} />
                      </div>
                      <PiecePicker
                        label={item.category}
                        value={item.id}
                        choices={editorChoices.filter(
                          (i) => i.category === item.category,
                        )}
                        onChange={(id) => {
                          const next = editorChoices.find((i) => i.id === id)!;
                          updateDraft({
                            items: editor.items.map((i) =>
                              i.id === item.id ? next : i,
                            ),
                            kept: editor.kept.filter((x) => x !== item.id),
                          });
                        }}
                      />
                      <div className="editor-piece-actions">
                        <Button
                          type="button"
                          variant="ghost"
                          aria-pressed={editor.kept.includes(item.id)}
                          onClick={() =>
                            updateDraft({
                              kept: editor.kept.includes(item.id)
                                ? editor.kept.filter((id) => id !== item.id)
                                : [...editor.kept, item.id],
                            })
                          }
                        >
                          {editor.kept.includes(item.id) ? (
                            <LockKeyhole size={16} />
                          ) : (
                            <LockKeyholeOpen size={16} />
                          )}
                          {editor.kept.includes(item.id) ? 'Kept' : 'Keep'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label={`Remove ${item.name} from outfit`}
                          onClick={() =>
                            updateDraft({
                              items: editor.items.filter(
                                (i) => i.id !== item.id,
                              ),
                              kept: editor.kept.filter((id) => id !== item.id),
                            })
                          }
                        >
                          <X size={16} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {addCategories.length > 0 && (
                  <div className="add-outfit-pieces">
                    <span className="muted">Add a piece</span>
                    <div>
                      {addCategories.map((category) => (
                        <PiecePicker
                          key={category + editor.items.length}
                          label={category}
                          choices={editorChoices.filter(
                            (i) => i.category === category,
                          )}
                          onChange={(id) =>
                            updateDraft({
                              items: [
                                ...editor.items,
                                editorChoices.find((i) => i.id === id)!,
                              ],
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
                {!editorChoices.length && (
                  <p className="outfit-guidance">
                    No available, categorized pieces match this season. Add
                    clothing details in your wardrobe first.
                  </p>
                )}
                {editor.items.length > 0 && (
                  <p className="editor-explanation">
                    {describeOutfit(editor.items).join(' ')}
                  </p>
                )}
                <div className="outfit-name-fields">
                  <label className="field">
                    <span>Outfit name</span>
                    <input
                      required
                      maxLength={100}
                      value={editor.name}
                      onChange={(e) => updateDraft({ name: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>
                      Notes <small>Optional</small>
                    </span>
                    <textarea
                      maxLength={1000}
                      placeholder="Where you’d wear it, or a styling detail…"
                      value={editor.notes}
                      onChange={(e) => updateDraft({ notes: e.target.value })}
                    />
                  </label>
                </div>
              </fieldset>
              {compositionError && <p className="muted">{compositionError}</p>}
              {editError && (
                <p className="error-text" role="alert">
                  {editError}
                </p>
              )}
              <div className="dialog-actions">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy || remixing}
                  onClick={() => setEditor(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="primary-button"
                  disabled={
                    busy ||
                    remixing ||
                    !!compositionError ||
                    !editor.name.trim()
                  }
                >
                  {busy ? (
                    <LoaderCircle size={17} className="spinning" />
                  ) : (
                    <Bookmark size={17} />
                  )}{' '}
                  {busy ? 'Saving…' : 'Save outfit'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!wearTarget}
        onOpenChange={(open) => {
          if (!open && !busy) setWearId(null);
        }}
      >
        <DialogContent
          className="wardrobe-dialog wear-dialog"
          showCloseButton={!busy}
        >
          <DialogHeader>
            <DialogTitle>A look worth repeating.</DialogTitle>
            <DialogDescription>
              {wearTarget?.name} · Record one wear per day. An accidental entry
              can be removed.
            </DialogDescription>
          </DialogHeader>
          {wearTarget && (
            <>
              {!wearTarget.items.some((i) => i.status === 'Removed') && (
                <form
                  className="wear-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void recordWear(wearDate);
                  }}
                >
                  <label className="field">
                    <span>Day worn</span>
                    <input
                      type="date"
                      min="1970-01-01"
                      max={today()}
                      required
                      value={wearDate}
                      disabled={busy}
                      onChange={(e) => setWearDate(e.target.value)}
                    />
                  </label>
                  <Button
                    type="submit"
                    className="primary-button"
                    disabled={
                      busy ||
                      !wearDate ||
                      wearTarget.wear_dates.includes(wearDate)
                    }
                  >
                    {busy ? (
                      <LoaderCircle size={16} className="spinning" />
                    ) : (
                      <Check size={16} />
                    )}
                    {wearTarget.wear_dates.includes(wearDate)
                      ? 'Already recorded'
                      : 'Record wear'}
                  </Button>
                </form>
              )}
              <p className="muted">
                Wear tracking keeps a history; it doesn’t change laundry status.
              </p>
              {wearError && (
                <p className="error-text" role="alert">
                  {wearError}
                </p>
              )}
              <div className="wear-history">
                {wearTarget.wear_dates.length ? (
                  wearTarget.wear_dates.map((date) => (
                    <div key={date}>
                      <span>
                        <CalendarDays size={16} />
                        {friendlyDate(date)}
                      </span>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void recordWear(date, true)}
                        aria-label={`Remove wear on ${friendlyDate(date)}`}
                      >
                        Remove
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="muted">No wears recorded yet.</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this saved look?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes “{deleteTarget?.name}” and its wear history. All of
              your clothing pieces stay in your wardrobe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="confirm-delete"
              onClick={(e) => {
                e.preventDefault();
                void removeLook();
              }}
            >
              {busy ? 'Removing…' : 'Remove outfit'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
