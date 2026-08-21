package com.trails.app.di

import android.content.Context
import androidx.room.Room
import com.trails.app.data.AppDatabase
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
        Room.databaseBuilder(context, AppDatabase::class.java, "trails.db").build()

    @Provides
    fun provideTripDao(db: AppDatabase): TripDao = db.tripDao()

    @Provides
    fun provideSectionDao(db: AppDatabase): SectionDao = db.sectionDao()

    @Provides
    fun provideTimelineEntryDao(db: AppDatabase): TimelineEntryDao = db.timelineEntryDao()
}
