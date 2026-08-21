package com.trails.app

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.trails.app.auth.TokenStore
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.runBlocking
import javax.inject.Inject

@HiltAndroidApp
class TrailsApplication : Application(), Configuration.Provider {

    @Inject lateinit var workerFactory: HiltWorkerFactory
    @Inject lateinit var tokenStore: TokenStore

    override fun onCreate() {
        super.onCreate()
        // One bounded blocking read at process start so a background
        // WorkManager sync (which can run before any UI screen calls
        // TokenStore.currentToken()) always sees the persisted token, without
        // AuthInterceptor itself blocking on a DataStore read per request.
        runBlocking { tokenStore.currentToken() }
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().setWorkerFactory(workerFactory).build()
}
