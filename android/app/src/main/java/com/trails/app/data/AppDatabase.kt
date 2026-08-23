package com.trails.app.data

import androidx.room.Database
import androidx.room.RoomDatabase
import com.trails.app.data.dao.AttachmentDao
import com.trails.app.data.dao.ChecklistDao
import com.trails.app.data.dao.ChecklistItemDao
import com.trails.app.data.dao.IdeaDao
import com.trails.app.data.dao.ImportantInfoDao
import com.trails.app.data.dao.PhotoDao
import com.trails.app.data.dao.SectionDao
import com.trails.app.data.dao.TimelineEntryDao
import com.trails.app.data.dao.TripDao
import com.trails.app.data.entity.AttachmentEntity
import com.trails.app.data.entity.ChecklistEntity
import com.trails.app.data.entity.ChecklistItemEntity
import com.trails.app.data.entity.IdeaEntity
import com.trails.app.data.entity.ImportantInfoEntity
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.data.entity.SectionEntity
import com.trails.app.data.entity.TimelineEntryEntity
import com.trails.app.data.entity.TripEntity

// Every row here is a read-only cache of server state (or, for
// ChecklistItem.checked, a value the server also authoritatively holds
// after an online-only toggle) -- nothing is ever solely owned by this
// database. That's why DatabaseModule wires this with
// fallbackToDestructiveMigration(): a schema bump just means "re-sync from
// the server," never data loss of anything not already recoverable.
@Database(
    entities = [
        TripEntity::class,
        SectionEntity::class,
        TimelineEntryEntity::class,
        ChecklistEntity::class,
        ChecklistItemEntity::class,
        ImportantInfoEntity::class,
        IdeaEntity::class,
        AttachmentEntity::class,
        PhotoEntity::class,
    ],
    version = 5,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun tripDao(): TripDao
    abstract fun sectionDao(): SectionDao
    abstract fun timelineEntryDao(): TimelineEntryDao
    abstract fun checklistDao(): ChecklistDao
    abstract fun checklistItemDao(): ChecklistItemDao
    abstract fun importantInfoDao(): ImportantInfoDao
    abstract fun ideaDao(): IdeaDao
    abstract fun attachmentDao(): AttachmentDao
    abstract fun photoDao(): PhotoDao
}
