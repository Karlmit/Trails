package com.trails.app.ui.blog

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.core.app.NotificationManagerCompat
import com.trails.app.MainActivity
import com.trails.app.R
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

internal data class BlogPublishKey(val tripId: String, val scope: String, val draftId: String)
internal data class BlogPublishTask(val key: BlogPublishKey, val state: MutableStateFlow<BlogEditState>)

@Singleton
class BlogPublishCoordinator @Inject constructor(@ApplicationContext private val context: Context) {
    // The editor and service access the active task on the main thread.
    private var task: BlogPublishTask? = null

    internal fun active(key: BlogPublishKey): BlogPublishTask? = task?.takeIf { it.key == key }
    internal fun current(): BlogPublishTask? = task

    internal fun start(newTask: BlogPublishTask): Boolean {
        if (task != null) return false
        task = newTask
        return try {
            ContextCompat.startForegroundService(context, Intent(context, BlogPublishService::class.java))
            true
        } catch (_: IllegalStateException) {
            task = null
            false
        } catch (_: SecurityException) {
            task = null
            false
        }
    }

    internal fun finish(completed: BlogPublishTask) {
        if (task === completed) task = null
    }
}

@AndroidEntryPoint
class BlogPublishService : Service() {
    @Inject lateinit var coordinator: BlogPublishCoordinator
    @Inject internal lateinit var publisher: BlogPublisher
    @Inject lateinit var draftStore: BlogDraftStore

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var job: Job? = null
    private var activeTask: BlogPublishTask? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (job?.isActive == true) return START_NOT_STICKY
        val task = coordinator.current()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.blog_publish_channel), NotificationManager.IMPORTANCE_LOW))
        startForeground(PROGRESS_ID, notification(task?.state?.value))
        if (task == null) {
            stopSelf(startId)
            return START_NOT_STICKY
        }
        activeTask = task
        manager.cancel(RESULT_ID)
        wakeLock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Trails:BlogPublish")
            .apply { acquire(MAX_WAKE_MILLIS) }
        job = serviceScope.launch {
            try {
                coroutineScope {
                    val progress = launch {
                        task.state.collect { state ->
                            if (state.publishing && NotificationManagerCompat.from(this@BlogPublishService).areNotificationsEnabled()) {
                                manager.notify(PROGRESS_ID, notification(state))
                            }
                        }
                    }
                    val session = launch {
                        draftStore.observeScope(task.key.tripId).collect { scope ->
                            if (scope != task.key.scope) {
                                this@coroutineScope.cancel()
                            }
                        }
                    }
                    try {
                        if (draftStore.scopeFor(task.key.tripId) == task.key.scope) publisher.run(task)
                        else markInterrupted()
                    } catch (failure: kotlinx.coroutines.CancellationException) {
                        throw failure
                    } catch (_: Exception) {
                        markInterrupted()
                    } finally {
                        session.cancel()
                        progress.cancel()
                    }
                }
            } finally {
                markInterrupted()
                releaseWakeLock()
                coordinator.finish(task)
                activeTask = null
                stopForeground(STOP_FOREGROUND_REMOVE)
                if ((task.state.value.saved || task.state.value.error != null) &&
                    NotificationManagerCompat.from(this@BlogPublishService).areNotificationsEnabled()
                ) {
                    manager.notify(RESULT_ID, notification(task.state.value))
                }
                stopSelf(startId)
            }
        }
        return START_NOT_STICKY
    }

    override fun onTimeout(startId: Int, fgsType: Int) {
        serviceScope.cancel()
        stopSelf(startId)
    }

    override fun onDestroy() {
        releaseWakeLock()
        serviceScope.cancel()
        super.onDestroy()
    }

    private fun releaseWakeLock() {
        wakeLock?.takeIf { it.isHeld }?.release()
        wakeLock = null
    }

    private fun markInterrupted() {
        val task = activeTask ?: return
        val current = task.state.value
        if (current.publishing) {
            task.state.value = current.copy(
                publishing = false, saving = false, uploadProgress = null,
                error = BlogEditError.Resource(R.string.blog_error_publish_retry),
            )
        }
    }

    private fun notification(state: BlogEditState?): Notification {
        val progress = state?.uploadProgress
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val builder = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentIntent(open)
            .setOnlyAlertOnce(true)
            .setContentTitle(getString(when {
                state?.saved == true -> R.string.blog_publish_notification_done
                state?.error != null -> R.string.blog_error_publish_retry
                else -> R.string.blog_publishing
            }))
        if (state?.saved == true || state?.error != null) return builder.setAutoCancel(true).build()
        return builder.setOngoing(true)
            .setProgress(100, ((progress?.fraction ?: 0f) * 100).toInt().coerceIn(0, 100), progress == null)
            .build()
    }

    private companion object {
        const val MAX_WAKE_MILLIS = 6L * 60 * 60 * 1000
        const val CHANNEL = "blog-publishing"
        const val PROGRESS_ID = 7201
        const val RESULT_ID = 7202
    }
}
