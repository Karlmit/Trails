package com.trails.app.data

import androidx.room.Database
import androidx.room.RoomDatabase
import com.trails.app.data.dao.SectionDao
import com.trails.app.data.dao.TimelineEntryDao
import com.trails.app.data.dao.TripDao
import com.trails.app.data.entity.SectionEntity
import com.trails.app.data.entity.TimelineEntryEntity
import com.trails.app.data.entity.TripEntity

@Database(
    entities = [TripEntity::class, SectionEntity::class, TimelineEntryEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun tripDao(): TripDao
    abstract fun sectionDao(): SectionDao
    abstract fun timelineEntryDao(): TimelineEntryDao
}
