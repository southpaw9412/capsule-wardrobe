import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
export const garments = sqliteTable(
  'garments',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull().default('Unsorted'),
    color: text('color').notNull().default('Unknown'),
    season: text('season').notNull().default('All seasons'),
    status: text('status').notNull().default('Available'),
    notes: text('notes').notNull().default(''),
    favorite: integer('favorite').notNull().default(0),
    imageKey: text('image_key').notNull(),
    mimeType: text('mime_type').notNull(),
    bytes: integer('bytes').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deleted: integer('deleted').notNull().default(0),
  },
  (table) => [
    index('idx_garments_owner_deleted_created').on(
      table.ownerId,
      table.deleted,
      table.createdAt,
    ),
  ],
);

export const outfits = sqliteTable(
  'outfits',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    notes: text('notes').notNull().default(''),
    season: text('season').notNull(),
    signature: text('signature').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_outfits_owner_created').on(t.ownerId, t.createdAt)],
);

export const outfitItems = sqliteTable(
  'outfit_items',
  {
    outfitId: text('outfit_id')
      .notNull()
      .references(() => outfits.id, { onDelete: 'cascade' }),
    // Retain the reference and caption after a garment is removed from the wardrobe.
    garmentId: text('garment_id').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    color: text('color').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [primaryKey({ columns: [t.outfitId, t.garmentId] })],
);

export const outfitWears = sqliteTable(
  'outfit_wears',
  {
    outfitId: text('outfit_id')
      .notNull()
      .references(() => outfits.id, { onDelete: 'cascade' }),
    wornOn: text('worn_on').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.outfitId, t.wornOn] })],
);
