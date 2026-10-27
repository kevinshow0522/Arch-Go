import { sqliteTable, text, integer, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";

// Published projections only. The project service remains the source of record.
export const publications = sqliteTable("publications", {
  sourceKey: text("source_key").notNull(),
  revision: integer("revision").notNull(),
  requestId: text("request_id").notNull(),
  sourceId: text("source_id").notNull(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  sourceVersion: integer("source_version").notNull(),
  sourceUpdatedAt: text("source_updated_at").notNull(),
  publishedAt: text("published_at").notNull(),
  contentHash: text("content_hash").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
}, table => [primaryKey({ columns: [table.sourceKey, table.revision] }), uniqueIndex("publication_request_id").on(table.requestId)]);

export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  sourceKey: text("source_key").notNull(),
  taskId: text("task_id"),
  resultRevision: integer("result_revision"),
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  byteLength: integer("byte_length").notNull(),
  sha256: text("sha256").notNull(),
  objectKey: text("object_key").notNull(),
  createdAt: text("created_at").notNull(),
});
