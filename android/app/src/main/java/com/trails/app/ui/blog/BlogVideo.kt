package com.trails.app.ui.blog

import android.content.Context
import android.net.Uri
import android.view.LayoutInflater
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import com.trails.app.R
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.data.isUsablePhotoCache
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import java.io.File
import javax.inject.Inject

class BlogVideoPlayback @Inject constructor(
    private val retrofit: Retrofit,
    private val client: OkHttpClient,
) {
    @OptIn(UnstableApi::class)
    internal fun create(context: Context, photoId: String, cachedPhoto: PhotoEntity?, stagedFile: File?): ExoPlayer {
        val localFile = stagedFile ?: cachedPhoto?.takeIf(::isUsablePhotoCache)?.localPath?.let(::File)
        val uri = localFile?.let(Uri::fromFile) ?: Uri.parse(
            retrofit.baseUrl().newBuilder()
                .addPathSegments("api/v1/photos")
                .addPathSegment(photoId)
                .addPathSegment("file")
                .build().toString(),
        )
        val sources = DefaultDataSource.Factory(context, OkHttpDataSource.Factory(client))
        return ExoPlayer.Builder(context)
            .setMediaSourceFactory(DefaultMediaSourceFactory(sources))
            .build()
            .apply { setMediaItem(MediaItem.fromUri(uri)) }
    }
}

@Composable
internal fun BlogVideo(
    photoId: String,
    photo: PhotoEntity?,
    selected: Boolean,
    onPlay: () -> Unit,
    playback: BlogVideoPlayback,
    stagedFile: File? = null,
    filename: String? = photo?.originalFilename,
) {
    val playLabel = if (filename != null) stringResource(R.string.blog_play_video, filename)
    else stringResource(R.string.blog_play_video_generic)
    Box(
        Modifier.fillMaxWidth().padding(bottom = 12.dp).aspectRatio(16f / 9f)
            .clip(RoundedCornerShape(8.dp)).background(Color.Black),
        contentAlignment = Alignment.Center,
    ) {
        if (selected) {
            PlayingBlogVideo(photoId, photo?.takeIf { it.localPath != null }, playback, stagedFile)
        } else {
            Box(
                Modifier.fillMaxSize().clickable(role = Role.Button, onClick = onPlay),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.PlayCircle,
                    contentDescription = playLabel,
                    tint = Color.White,
                    modifier = Modifier.size(56.dp),
                )
            }
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun PlayingBlogVideo(photoId: String, cachedPhoto: PhotoEntity?, playback: BlogVideoPlayback, stagedFile: File?) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val player = remember(photoId, cachedPhoto?.localPath, cachedPhoto?.sizeBytes, playback, stagedFile) {
        playback.create(context, photoId, cachedPhoto, stagedFile)
    }
    var fullscreen by remember(photoId) { mutableStateOf(false) }
    var failed by remember(player) { mutableStateOf(false) }

    DisposableEffect(player, lifecycle) {
        val listener = object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                failed = true
            }
        }
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) player.pause()
        }
        player.addListener(listener)
        lifecycle.addObserver(observer)
        player.prepare()
        player.play()
        onDispose {
            lifecycle.removeObserver(observer)
            player.removeListener(listener)
            player.release()
        }
    }

    val render: @Composable () -> Unit = {
        if (failed) {
            Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(stringResource(R.string.blog_video_playback_error), color = Color.White, textAlign = TextAlign.Center)
                    TextButton(
                        onClick = {
                            failed = false
                            player.prepare()
                            player.play()
                        },
                    ) {
                        Text(stringResource(R.string.blog_video_retry), color = Color.White)
                    }
                }
            }
        } else {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { viewContext ->
                    LayoutInflater.from(viewContext).inflate(R.layout.blog_video_player, null) as PlayerView
                },
                update = { view ->
                    view.player = player
                    view.setFullscreenButtonClickListener { fullscreen = it }
                    view.setFullscreenButtonState(fullscreen)
                },
                onRelease = { it.player = null },
            )
        }
    }

    if (fullscreen) {
        Dialog(onDismissRequest = { fullscreen = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            render()
        }
    } else {
        render()
    }
}
