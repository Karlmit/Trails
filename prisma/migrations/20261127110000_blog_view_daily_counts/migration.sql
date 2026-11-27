CREATE TABLE "blog_daily_view_counts" (
    "entry_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "blog_daily_view_counts_pkey" PRIMARY KEY ("entry_id", "day"),
    CONSTRAINT "blog_daily_view_counts_entry_id_fkey" FOREIGN KEY ("entry_id")
        REFERENCES "timeline_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
