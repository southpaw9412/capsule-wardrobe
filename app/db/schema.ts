import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
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
