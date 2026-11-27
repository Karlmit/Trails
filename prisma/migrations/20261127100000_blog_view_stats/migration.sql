CREATE TABLE "blog_view_counts" (
    "entry_id" UUID NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "blog_view_counts_pkey" PRIMARY KEY ("entry_id", "country_code"),
    CONSTRAINT "blog_view_counts_entry_id_fkey" FOREIGN KEY ("entry_id")
        REFERENCES "timeline_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
