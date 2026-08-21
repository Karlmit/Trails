package com.trails.app.di

import android.content.Context
import androidx.room.Room
import com.trails.app.data.AppDatabase
import com.trails.app.data.dao.AttachmentDao
import com.trails.app.data.dao.ChecklistDao
import com.trails.app.data.dao.ChecklistItemDao
import com.trails.app.data.dao.IdeaDao
import com.trails.app.data.dao.ImportantInfoDao
import com.trails.app.data.dao.PhotoDao
import com.trails.app.data.dao.SectionDao
import com.trails.app.data.dao.TimelineEntryDao
import com.trails.app.data.dao.TripDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideAppDatabase(@ApplicationContext context: Context): AppDatabase =
        Room.databaseBuilder(context, AppDatabase::class.java, "trails.db")
            .fallbackToDestructiveMigration(true)
            .build()

    @Provides
    fun provideTripDao(db: AppDatabase): TripDao = db.tripDao()

    @Provides
    fun provideSectionDao(db: AppDatabase): SectionDao = db.sectionDao()

    @Provides
    fun provideTimelineEntryDao(db: AppDatabase): TimelineEntryDao = db.timelineEntryDao()

    @Provides
    fun provideChecklistDao(db: AppDatabase): ChecklistDao = db.checklistDao()

    @Provides
    fun provideChecklistItemDao(db: AppDatabase): ChecklistItemDao = db.checklistItemDao()

    @Provides
    fun provideImportantInfoDao(db: AppDatabase): ImportantInfoDao = db.importantInfoDao()

    @Provides
    fun provideIdeaDao(db: AppDatabase): IdeaDao = db.ideaDao()

    @Provides
    fun provideAttachmentDao(db: AppDatabase): AttachmentDao = db.attachmentDao()

    @Provides
    fun providePhotoDao(db: AppDatabase): PhotoDao = db.photoDao()
}
